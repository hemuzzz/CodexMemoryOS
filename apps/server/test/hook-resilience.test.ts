import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
const root = new URL(process.env.CODEX_MEMORY_OS_TEST_DIST === "1" ? "../dist/" : "../src/", import.meta.url);
const { runHookCli }: typeof import("../src/hook/user-prompt-submit.js") = await import(new URL("hook/user-prompt-submit.js", root).href);
const { TaskRepository }: typeof import("../src/task/index.js") = await import(new URL("task/index.js", root).href);
const { AssetSearchService }: typeof import("../src/asset/index.js") = await import(new URL("asset/index.js", root).href);
console.log(`F05_MODULE_ROOT ${root.href}`);
function sink(capture: (text: string) => void) { return new Writable({ write(chunk, _encoding, done) { capture(chunk.toString()); done(); } }); }
test("F05 expected knowledge/configuration failure is nonblocking and contains no fabricated Task", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "memory-f05-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let stdout = ""; let stderr = "";
  const code = await runHookCli(Readable.from([JSON.stringify({ hook_event_name: "UserPromptSubmit" })]), sink((s) => stdout += s), sink((s) => stderr += s), { CODEX_MEMORY_OS_LOG_PATH: join(directory, "hook.log") });
  assert.equal(code, 0);
  assert.equal(stdout, "");
  assert.match(stderr, /HOOK_CONFIGURATION_INVALID/u);
});
test("F05 unexpected boundary faults remain observable and use nonblocking failure exit", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "memory-f05-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  let stderr = "";
  const input = new Readable({ read() { this.destroy(new Error("unexpected internal failure")); } });
  const code = await runHookCli(input, sink(() => assert.fail("No context on failure")), sink((s) => stderr += s), { CODEX_MEMORY_OS_LOG_PATH: join(directory, "hook.log") });
  assert.equal(code, 1);
  assert.match(stderr, /HOOK_INTERNAL_ERROR/u);
  assert.doesNotMatch(stderr, /unexpected internal failure/u);
});
test("F05 a real SQLite exclusive lock cannot stall the optional Hook for five seconds", async () => {
  const directory = await mkdtemp(join(tmpdir(), "memory-f05-"));
  const dbPath = join(directory, "db.sqlite");
  const config = join(directory, "workspaces.json");
  await writeFile(config, JSON.stringify({ schemaVersion: 1, workspaces: [] }));
  const repository = new TaskRepository(dbPath); repository.close();
  const db = new Database(dbPath);
  try {
    db.exec("BEGIN EXCLUSIVE");
    const started = performance.now();
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const dist = process.env.CODEX_MEMORY_OS_TEST_DIST === "1";
      const child = spawn(process.execPath, [...(dist ? [] : ["--import", "tsx"]), fileURLToPath(new URL(`hook/user-prompt-submit.${dist ? "js" : "ts"}`, root))], {
        env: { ...process.env, CODEX_MEMORY_OS_DATABASE_PATH: dbPath, CODEX_MEMORY_OS_WORKSPACES_PATH: config, CODEX_MEMORY_OS_LOG_PATH: join(directory, "hook.log") },
        stdio: ["pipe", "pipe", "pipe"], timeout: 8000,
      });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", (s) => stdout += s); child.stderr.on("data", (s) => stderr += s);
      child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(JSON.stringify({ hook_event_name: "UserPromptSubmit", cwd: directory, session_id: "s", turn_id: "t", prompt: "continue" }));
    });
    assert.ok(performance.now() - started < 1500, `Hook lock wait took ${performance.now() - started}ms`);
    assert.equal(result.code, 0);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /HOOK_DEPENDENCY_UNAVAILABLE/u);
    db.exec("ROLLBACK");
    assert.equal((db.prepare("SELECT count(*) AS n FROM task_loadout").get() as { n: number }).n, 0);
  } finally { if (db.inTransaction) db.exec("ROLLBACK"); db.close(); await rm(directory, { recursive: true, force: true }); }
});

test("F05 the Hook's separate pure Asset reader also uses a short real SQLite lock wait", async () => {
  const directory = await mkdtemp(join(tmpdir(), "memory-f05-reader-"));
  const databasePath = join(directory, "db.sqlite");
  const workspaceConfigPath = join(directory, "workspaces.json");
  await writeFile(workspaceConfigPath, JSON.stringify({ schemaVersion: 1, workspaces: [] }));
  new TaskRepository(databasePath).close();
  const db = new Database(databasePath);
  const reader = new AssetSearchService({ databasePath, workspaceConfigPath, repositoryPath: directory, busyTimeoutMs: 100, refreshIndex: async () => undefined });
  try {
    db.exec("BEGIN EXCLUSIVE");
    const started = performance.now();
    await assert.rejects(reader.read({ assetId: "ast301", context: { workspace: null } }), { code: "SQLITE_BUSY" });
    assert.ok(performance.now() - started < 1500);
  } finally { reader.close(); db.exec("ROLLBACK"); db.close(); await rm(directory, { recursive: true, force: true }); }
});
