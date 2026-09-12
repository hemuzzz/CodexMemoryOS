import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { packageApp } from '../dist/package-app.js';
import { prepareFixture } from '../dist/verify-service.js';
import { readyResponse } from '../dist/backend.js';
import { BUNDLE_ID, executeFile, readConfiguration } from '../dist/config.js';
import { backendProcesses, requestNormalQuit, runningApplications } from '../dist/macos.js';
import { updateApp } from '../dist/update-app.js';

const template = resolve(process.argv[2]);
const root = await mkdtemp(join(tmpdir(), 'codex-online-macos-test-'));
const id = randomUUID();
const identity = { name: `CodexMemoryOS-Test-update-${id}`, bundleId: `${BUNDLE_ID}.test.${id}` };
let installed;
async function waitUntil(check, message) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) { if (await check()) return; await delay(150); }
  throw new Error(message);
}
try {
  const { config, assetId } = await prepareFixture(join(template, 'Contents/Resources'), join(root, 'fixture'));
  const settings = join(root, 'settings.json');
  await writeFile(settings, JSON.stringify(config));
  installed = await packageApp(config, join(root, 'installed'), identity);
  const before = await readConfiguration(join(installed, 'Contents/Resources'));
  const origin = `http://127.0.0.1:${config.port}`;
  await executeFile('/usr/bin/open', [installed]);
  await waitUntil(() => readyResponse(origin, before.build.buildId).catch(() => false), '测试 A 未启动');
  const old = (await runningApplications()).find(item => item.bundleId === identity.bundleId);
  assert.ok(old);
  const source = await packageApp(config, join(root, 'downloaded'), identity);
  const next = await readConfiguration(join(source, 'Contents/Resources'));
  await rm(join(source, 'Contents/Resources/local-runtime.json'));
  await updateApp(settings, { ...identity, path: installed }, { path: source, version: next.build.version, buildId: next.build.buildId });
  const after = await readConfiguration(join(installed, 'Contents/Resources'));
  assert.deepEqual(after.config, config);
  assert.equal(after.build.buildId, next.build.buildId);
  assert.notEqual(after.build.buildId, before.build.buildId);
  assert.equal((await fetch(`${origin}/api/assets/${assetId}`)).status, 200);
  assert.ok(!(await runningApplications()).some(item => item.pid === old.pid));
  process.stdout.write(JSON.stringify({ isolatedMacUpdate: 'PASS', oldBuild: before.build.buildId,
    newBuild: after.build.buildId, configPreserved: true, assetPreserved: true }) + '\n');
} finally {
  if ((await runningApplications()).some(item => item.bundleId === identity.bundleId)) await requestNormalQuit(identity.bundleId);
  await waitUntil(async () => !(await runningApplications()).some(item => item.bundleId === identity.bundleId), '测试 App 未退出，保留临时目录');
  if (installed) {
    const entry = join(installed, 'Contents/Resources/runtime/apps/server/dist/main.js');
    await waitUntil(async () => !(await backendProcesses(entry)).length, '测试后端未退出，保留临时目录');
  }
  await rm(root, { recursive: true, force: true });
}
