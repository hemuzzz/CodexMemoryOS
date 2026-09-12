import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkForUpdate, downloadUpdate, isNewerVersion, releaseAssetUrl, requestRelease, type UpdateManifest } from "../src/updates.js";
import { stageDownloadedApp } from "../src/update-app.js";
import { APP_NAME, BUNDLE_ID, localConfigSchema } from "../src/config.js";

test("stable versions compare numerically and never downgrade or reinstall equal versions", () => {
  assert.equal(isNewerVersion("0.10.0", "0.2.0"), true);
  assert.equal(isNewerVersion("0.2.0", "0.10.0"), false);
  assert.equal(isNewerVersion("0.2.0", "0.2.0"), false);
  assert.throws(() => isNewerVersion("0.2.1-beta", "0.2.0"));
});

test("unpublished releases and malformed asset origins do not become installable updates", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 404 }));
  assert.deepEqual(await checkForUpdate("0.2.0", "arm64"), { kind: "unpublished" });
  mock.mock.mockImplementation(async () => Response.json({ draft: false, prerelease: false, tag_name: "v0.2.1",
    assets: [{ name: "CodexMemoryOS-0.2.1-arm64.json", browser_download_url: "https://example.com/update.json" }] }));
  await assert.rejects(checkForUpdate("0.2.0", "arm64"), /更新信息/);
});

test("HTTPS redirects cannot downgrade transport or leave GitHub hosts", async t => {
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; return new Response(null, {
    status: 302, headers: { location: "http://github.com/untrusted" },
  }); });
  await assert.rejects(requestRelease("https://github.com/start", AbortSignal.timeout(1000)), /HTTPS/);
  assert.equal(requests, 1);
  await assert.rejects(requestRelease("https://github.com.evil.example/file", AbortSignal.timeout(1000)), /HTTPS/);
  assert.equal(requests, 1);
});

test("available releases bind the manifest and image to the same version and architecture", async t => {
  const version = "0.2.1", arch = "arm64";
  const names = [`CodexMemoryOS-${version}-${arch}.json`, `CodexMemoryOS-${version}-${arch}-update.dmg`];
  const manifest: UpdateManifest = { updateProtocol: 1, version, arch, buildId: randomUUID(), filename: names[1]!,
    sha256: "a".repeat(64), size: 42, requiresManualUpgrade: true };
  t.mock.method(globalThis, "fetch", async (url: URL) => url.hostname === "api.github.com"
    ? Response.json({ draft: false, prerelease: false, tag_name: `v${version}`,
      assets: names.map(name => ({ name, browser_download_url: releaseAssetUrl(version, name) })) })
    : Response.json(manifest));
  assert.deepEqual(await checkForUpdate("0.2.0", arch), { kind: "available", manifest, url: releaseAssetUrl(version, manifest.filename) });
  manifest.arch = "x64";
  await assert.rejects(checkForUpdate("0.2.0", arch), /发布版本不符/);
});

test("download validates size and hash, removes bad partial files, and refuses overwrites", async t => {
  const root = await mkdtemp(join(tmpdir(), "desktop-download-test-"));
  const payload = Buffer.from("verified update bytes");
  const manifest: UpdateManifest = { updateProtocol: 1, version: "0.2.1", arch: "arm64", buildId: randomUUID(),
    filename: "CodexMemoryOS-0.2.1-arm64-update.dmg", size: payload.length,
    sha256: createHash("sha256").update(payload).digest("hex"), requiresManualUpgrade: false };
  const mock = t.mock.method(globalThis, "fetch", async () => new Response(payload));
  const destination = join(root, "update.dmg");
  try {
    await downloadUpdate(releaseAssetUrl(manifest.version, manifest.filename), manifest, destination, () => {});
    assert.deepEqual(await readFile(destination), payload);
    await assert.rejects(downloadUpdate(releaseAssetUrl(manifest.version, manifest.filename), manifest, destination, () => {}), { code: "EEXIST" });
    await rm(destination);
    mock.mock.mockImplementation(async () => new Response(Buffer.alloc(payload.length, 0)));
    await assert.rejects(downloadUpdate(releaseAssetUrl(manifest.version, manifest.filename), manifest, destination, () => {}), /校验失败/);
    await assert.rejects(readFile(destination), { code: "ENOENT" });
    mock.mock.mockImplementation(async () => new Response(Buffer.alloc(payload.length + 1, 0)));
    await assert.rejects(downloadUpdate(releaseAssetUrl(manifest.version, manifest.filename), manifest, destination, () => {}), /大小/);
    await assert.rejects(readFile(destination), { code: "ENOENT" });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("downloaded App staging preserves local configuration and rejects mismatched identity", async () => {
  const root = await mkdtemp(join(tmpdir(), "desktop-stage-test-"));
  const source = join(root, "source.app");
  const buildId = randomUUID();
  const config = localConfigSchema.parse({ nodePath: process.execPath, assetRepositoryPath: join(root, "real-repository"),
    databasePath: join(root, "real.sqlite"), workspaceConfigPath: join(root, "workspaces.json"),
    logPath: join(root, "server.log"), desktopLogPath: join(root, "desktop.log"), port: 18888 });
  try {
    await mkdir(join(source, "Contents/Resources/runtime"), { recursive: true });
    await writeFile(join(source, "Contents/Resources/runtime/build-info.json"), JSON.stringify({ buildId, version: "0.2.1",
      nodeVersion: "v22.16.0", arch: process.arch, modules: process.versions.modules }));
    await writeFile(join(source, "Contents/Info.plist"), `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${BUNDLE_ID}</string><key>CFBundleShortVersionString</key><string>0.2.1</string></dict></plist>`);
    const downloaded = { path: source, version: "0.2.1", buildId };
    const identity = { name: APP_NAME, bundleId: BUNDLE_ID };
    await assert.rejects(stageDownloadedApp({ ...downloaded, buildId: randomUUID() }, join(root, "bad.app"), config, identity), /构建标识/);
    const staged = join(root, "staged.app");
    await stageDownloadedApp(downloaded, staged, config, identity);
    assert.deepEqual(JSON.parse(await readFile(join(staged, "Contents/Resources/local-runtime.json"), "utf8")), config);
    await assert.rejects(readFile(config.databasePath), { code: "ENOENT" });
    await writeFile(join(source, "Contents/Resources/local-runtime.json"), "{}");
    await assert.rejects(stageDownloadedApp(downloaded, join(root, "bundled-config.app"), config, identity), /本机配置/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
