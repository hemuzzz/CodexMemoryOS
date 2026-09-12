import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { Backend } from "../src/backend.js";
import { localConfigSchema, type BuildInfo } from "../src/config.js";
import { navigationTarget } from "../src/navigation.js";
import { assertClosedDependencies } from "../src/package-app.js";
import { replaceApp, updateApp } from "../src/update-app.js";
import { allocatePort } from "../src/verify-service.js";

test("navigation only admits the Hub page, separates local references and blocks executable schemes", () => {
  const origin = "http://127.0.0.1:18888";
  assert.equal(navigationTarget(origin + "/#/library", origin).kind, "internal");
  for (const url of ["javascript:alert(1)", "https://user:secret@example.com", "data:text/html,x", "not a url",
    origin + "/api/system/status", origin + "/assets/app.js", origin + "/missing", origin + "/?unknown=1",
    "file://remote-host/share/file.md", origin + "/Users/a/%00bad.md", origin + "/Users/a/file.java:0",
    origin + "/Users/a/file.md?query=1", origin + "/Users/a/%E0%A4%A", origin + "/Users/%2F..%2Fetc/passwd"]) {
    assert.equal(navigationTarget(url, origin).kind, "blocked", url);
  }
  for (const url of ["https://example.com", "http://127.0.0.1:18889", "http://127.0.0.1.example.com:18888"]) {
    assert.equal(navigationTarget(url, origin).kind, "external");
  }
  assert.deepEqual(navigationTarget(origin + "/Users/hemu/project/Service.java:89", origin),
    { kind: "local", path: "/Users/hemu/project/Service.java", line: 89 });
  assert.deepEqual(navigationTarget(origin + "/Users/hemu/My%20Project/%E8%AE%BE%E8%AE%A1.md:12:3", origin),
    { kind: "local", path: "/Users/hemu/My Project/设计.md", line: 12, column: 3 });
  assert.deepEqual(navigationTarget("file:///tmp/source.java#L15", origin),
    { kind: "local", path: "/tmp/source.java", line: 15 });
  assert.deepEqual(navigationTarget(origin + "/Users/hemu/project/README.md", origin),
    { kind: "local", path: "/Users/hemu/project/README.md" });
});

test("dependency closure allows internal symlinks, rejects external ones", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-links-"));
  try {
    await mkdir(join(root, "pkg"));
    await symlink("pkg", join(root, "internal"));
    await assertClosedDependencies(root);
    await symlink(tmpdir(), join(root, "external"));
    await assert.rejects(assertClosedDependencies(root), /越出/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("test installation cannot target Applications or reuse an active update lock", async () => {
  await assert.rejects(updateApp('/unused.json', { name: 'CodexMemoryOS-Test-lock',
    bundleId: 'local.codexmemoryos.desktop.test.lock', path: '/Applications/CodexMemoryOS-Test-lock.app' }), /测试安装/);
  const { root, backend } = await fixture('');
  try {
    const name='CodexMemoryOS-Test-lock';
    const config=join(root,'config.json'); await writeFile(config,JSON.stringify(backend.config));
    await mkdir(join(root,`.${name}.update.lock`));
    await assert.rejects(updateApp(config,{name,bundleId:'local.codexmemoryos.desktop.test.lock',path:join(root,`${name}.app`)}), {code:'EEXIST'});
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("replacement failure restores old program, successful replacement preserves backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-replace-"));
  try {
    const target = join(root, "App"), backup = join(root, "backup"), staged = join(root, "stage");
    await mkdir(target); await writeFile(join(target, "version"), "A");
    await assert.rejects(replaceApp(staged, target, backup));
    assert.equal(await readFile(join(target, "version"), "utf8"), "A");
    await mkdir(staged); await writeFile(join(staged, "version"), "B");
    await replaceApp(staged, target, backup);
    assert.equal(await readFile(join(target, "version"), "utf8"), "B");
    assert.equal(await readFile(join(backup, "version"), "utf8"), "A");
  } finally { await rm(root, { recursive: true, force: true }); }
});

async function fixture(source: string): Promise<{ root: string; backend: Backend }> {
  const root = await mkdtemp(join(tmpdir(), "desktop-process-"));
  await mkdir(join(root, "apps/server/dist"), { recursive: true });
  await writeFile(join(root, "apps/server/package.json"), '{"type":"module"}');
  await writeFile(join(root, "apps/server/dist/main.js"), source);
  const build: BuildInfo = { buildId: randomUUID(), nodeVersion: "v22.16.0", arch: process.arch as "arm64" | "x64", modules: process.versions.modules };
  await writeFile(join(root, "build-info.json"), JSON.stringify(build));
  const config = localConfigSchema.parse({ nodePath: process.execPath, assetRepositoryPath: root,
    databasePath: join(root, "test.sqlite"), workspaceConfigPath: join(root, "workspaces.json"),
    logPath: join(root, "server.log"), desktopLogPath: join(root, "desktop.log"), port: await allocatePort(),
    startupTimeoutMs: 500, shutdownTimeoutMs: 1000 });
  return { root, backend: new Backend(root, config, build) };
}

test("a READY old HTTP server cannot mask a failed new child", async () => {
  const { root, backend } = await fixture("process.exitCode=1;");
  const old = createServer((_req, res) => res.end(JSON.stringify({ ok: true, data: { buildId: backend.build.buildId,
    service: { readiness: "READY" }, mcpEndpoint: { ready: true } } })));
  try {
    await new Promise<void>(resolve => old.listen(backend.config.port, "127.0.0.1", resolve));
    await assert.rejects(backend.start());
  } finally {
    await backend.stop().catch(() => {});
    await new Promise<void>(resolve => old.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test("startup cancellation waits for early signal handler and repeated exit shares cleanup", async () => {
  const { root, backend } = await fixture(`
    process.on('SIGTERM',()=>{process.disconnect();});
    process.send({type:'booted'});
    process.on('message',()=>{});
  `);
  try {
    const startup = backend.start();
    const rejected = assert.rejects(startup);
    while (!backend.child) await delay(5);
    const first = backend.stop();
    assert.equal(backend.stop(), first);
    await first;
    await rejected;
    assert.equal(backend.child.exitCode, 0);
  } finally { await backend.stop(); await rm(root, { recursive: true, force: true }); }
});

test("startup timeout retains child for normal cleanup", async () => {
  const { root, backend } = await fixture(`
    process.on('SIGTERM',()=>process.disconnect()); process.send({type:'booted'}); process.on('message',()=>{});
  `);
  try {
    await assert.rejects(backend.start(), /超时/);
    assert.equal(backend.child?.exitCode, null);
    await backend.stop();
    assert.equal(backend.child?.exitCode, 0);
  } finally { await backend.stop(); await rm(root, { recursive: true, force: true }); }
});

test("shutdown timeout never kills or abandons the still-owned child", async () => {
  const { root, backend } = await fixture(`
    process.on('SIGTERM',()=>{}); process.send({type:'booted'});
    process.on('message',message=>{if(message==='release')process.disconnect();});
  `);
  try {
    await assert.rejects(backend.start(), /超时/);
    await assert.rejects(backend.stop(), /不会自动强杀/);
    assert.equal(backend.child?.exitCode, null);
    const closed = new Promise<void>(resolve => backend.child!.once('close',()=>resolve()));
    backend.child!.send('release');
    await closed;
    assert.equal(backend.child?.exitCode, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});
