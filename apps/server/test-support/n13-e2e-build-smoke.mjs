import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureRoot = await mkdtemp(join(tmpdir(), "codex-memory-os-n13-e2e-"));
const repositoryPath = join(fixtureRoot, "asset-repository");
const workspaceConfigPath = join(fixtureRoot, "config", "workspaces.json");
const databasePath = join(fixtureRoot, "data", "codex-memory.sqlite");
const logPath = join(fixtureRoot, "logs", "codex-memory-os.log");
const workspaceRoot = join(fixtureRoot, "workspaces");
const alphaWorkspacePath = join(workspaceRoot, "alpha-project");
const betaWorkspacePath = join(workspaceRoot, "beta-project");
const outsideWorkspacePath = join(fixtureRoot, "outside-workspace");
const port = await allocatePort();
const origin = `http://127.0.0.1:${port}`;
const idGenerator = new SnowflakeIdGenerator();
const ids = {
  alphaDocument: idGenerator.next("ast"),
  alphaMemory: idGenerator.next("ast"),
  alphaSkill: idGenerator.next("ast"),
  betaMemory: idGenerator.next("ast"),
  globalDocument: idGenerator.next("ast"),
  globalMemory: idGenerator.next("ast"),
  globalSkill: idGenerator.next("ast"),
  lifecycle: idGenerator.next("ast"),
  migrationBridge: idGenerator.next("ast"),
  rejectedCandidate: idGenerator.next("ast"),
  unrelatedInbox: idGenerator.next("ast"),
};
const alphaMemoryRelativePath = "assets/workspaces/alpha/memories/ablation.md";
const lifecycleRelativePath = "assets/global/memories/lifecycle.md";
const migrationSourceRelativePath = "inbox/workspaces/alpha/memories/migration-bridge.md";
const migrationTargetRelativePath = "assets/workspaces/alpha/memories/migration-bridge.md";
const rejectedSourceRelativePath = "inbox/workspaces/alpha/documents/rejected.md";
const rejectedTargetRelativePath = "assets/workspaces/alpha/documents/rejected.md";
const decisionToken = "N13BUILDDIRECTTOKEN";
const documentBodyToken = "N13BUILDDOCUMENTBODY";
const skillBodyToken = "N13BUILDSKILLBODY";
const alphaMemorySource = assetSource({
  body: "sharedsearch alphaonly current alpha memory body",
  id: ids.alphaMemory,
  scope: "WORKSPACE",
  summary: `n13ablation ${decisionToken} strong decision`,
  title: "n13ablation sharedsearch alpha memory",
  type: "MEMORY",
  workspace: "alpha",
});
const lifecycleSource = assetSource({
  body: "lifecycleoriginal current body",
  id: ids.lifecycle,
  scope: "GLOBAL",
  summary: "lifecycleoriginal watcher fixture",
  title: "Lifecycle watcher Asset",
  type: "MEMORY",
});
const migrationSource = assetSource({
  body: "migrationbridge current Markdown body",
  id: ids.migrationBridge,
  scope: "WORKSPACE",
  summary: "synthetic M03 M04 integration bridge",
  title: "Migration bridge candidate",
  type: "MEMORY",
  workspace: "alpha",
});
const rejectedSource = assetSource({
  body: "rejectedhash body",
  id: ids.rejectedCandidate,
  scope: "WORKSPACE",
  summary: "hash rejection candidate",
  title: "Rejected candidate",
  type: "DOCUMENT",
  workspace: "alpha",
});

let child;
let client;
let taskId;
try {
  await Promise.all([
    mkdir(alphaWorkspacePath, { recursive: true }),
    mkdir(betaWorkspacePath, { recursive: true }),
    mkdir(outsideWorkspacePath, { recursive: true }),
    mkdir(join(repositoryPath, "assets"), { recursive: true }),
  ]);
  await writeWorkspaceConfig();
  await Promise.all([
    writeAsset(alphaMemoryRelativePath, alphaMemorySource),
    writeAsset("assets/workspaces/alpha/documents/ablation.md", assetSource({
      body: `${documentBodyToken} requires explicit asset_read`,
      id: ids.alphaDocument,
      scope: "WORKSPACE",
      summary: "n13ablation document read entry",
      title: "n13ablation alpha document",
      type: "DOCUMENT",
      workspace: "alpha",
    })),
    writeAsset("assets/workspaces/alpha/skills/ablation.md", assetSource({
      body: `${skillBodyToken} is not automatically executed`,
      id: ids.alphaSkill,
      scope: "WORKSPACE",
      summary: "n13ablation skill read entry",
      title: "n13ablation alpha skill",
      type: "SKILL",
      workspace: "alpha",
    })),
    writeAsset("assets/workspaces/beta/memories/blocked.md", assetSource({
      body: "n13ablation sharedsearch alphaonly stronger stronger stronger",
      id: ids.betaMemory,
      scope: "WORKSPACE",
      summary: "n13ablation sharedsearch forbidden beta result",
      title: "n13ablation sharedsearch beta strongest",
      type: "MEMORY",
      workspace: "beta",
    })),
    writeAsset("assets/global/memories/shared.md", assetSource({
      body: "sharedsearch globalonly global memory body",
      id: ids.globalMemory,
      scope: "GLOBAL",
      summary: "sharedsearch global memory",
      title: "Shared global memory",
      type: "MEMORY",
    })),
    writeAsset("assets/global/documents/reference.md", assetSource({
      body: "global document body",
      id: ids.globalDocument,
      scope: "GLOBAL",
      summary: "global document reference",
      title: "Global document",
      type: "DOCUMENT",
    })),
    writeAsset("assets/global/skills/reference.md", assetSource({
      body: "global skill body",
      id: ids.globalSkill,
      scope: "GLOBAL",
      summary: "global skill reference",
      title: "Global skill",
      type: "SKILL",
    })),
    writeAsset(lifecycleRelativePath, lifecycleSource),
    writeAsset(migrationSourceRelativePath, migrationSource),
    writeAsset("inbox/workspaces/unknown/memories/unrelated.md", assetSource({
      body: "unrelated Inbox diagnostic",
      id: ids.unrelatedInbox,
      scope: "WORKSPACE",
      summary: "must not block selected candidate confirmation",
      title: "Unknown Workspace Inbox candidate",
      type: "MEMORY",
      workspace: "unknown",
    })),
  ]);

  child = spawnServer();
  const firstListening = await waitForListening(child);
  assert.match(firstListening, new RegExp(`"endpoint":"${origin.replaceAll("/", "\\/")}\/mcp"`));
  assert.equal(child.spawnargs.includes("0.0.0.0"), false);

  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  const hub = await fetch(origin);
  assert.equal(hub.status, 200);
  const hubHtml = await hub.text();
  assert.match(hubHtml, /CodexMemoryOS · Asset Desk/u);
  const builtAssetPath = hubHtml.match(/<script[^>]+src="([^"]+)"/u)?.[1];
  assert.notEqual(builtAssetPath, undefined);
  assert.equal((await fetch(`${origin}${builtAssetPath}`)).status, 200);
  for (const path of ["/api/not-found", "/assets/missing.js", "/client-route"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(await response.text(), /CodexMemoryOS · Asset Desk/u, path);
  }

  const initialInbox = await getRest("/api/inbox");
  assert.equal(initialInbox.items.some(({ assetId }) => assetId === ids.migrationBridge), true);
  assert.equal(initialInbox.diagnostics.some(({ code }) => code === "UNKNOWN_WORKSPACE"), true);

  const firstHookInput = hookInput("build-session", "turn-1", alphaWorkspacePath, "n13ablation");
  const firstHook = await runHook(firstHookInput);
  assert.equal(firstHook.code, 0);
  assert.equal(firstHook.stderr, "");
  const firstContext = parseHookContext(firstHook.stdout);
  taskId = firstContext.taskId;
  assert.equal(firstContext.workspace, "alpha");
  assert.match(firstContext.text, /loadoutAssets:\n- none/u);
  assert.equal(firstContext.text.includes(decisionToken), false);

  const retriedHook = parseHookContext((await runHook(firstHookInput)).stdout);
  assert.equal(retriedHook.taskId, taskId);
  const reusedHook = parseHookContext((await runHook(
    hookInput("build-session", "turn-2", join(alphaWorkspacePath, "nested"), "later request"),
  )).stdout);
  assert.equal(reusedHook.taskId, taskId);
  const implicitOtherSession = parseHookContext((await runHook(
    hookInput("other-session", "turn-1", alphaWorkspacePath, "no explicit task id"),
  )).stdout);
  assert.notEqual(implicitOtherSession.taskId, taskId);
  const betaContext = parseHookContext((await runHook(
    hookInput("beta-session", "turn-1", join(betaWorkspacePath, "nested"), "n13ablation"),
  )).stdout);
  assert.equal(betaContext.workspace, "beta");
  const nullContext = parseHookContext((await runHook(
    hookInput("null-session", "turn-1", outsideWorkspacePath, "sharedsearch"),
  )).stdout);
  assert.equal(nullContext.workspace, "null");
  for (const eventName of ["Stop", "Interrupt", "SessionEnd"]) {
    const noOp = await runHook({ hook_event_name: eventName, session_id: "build-session" });
    assert.equal(noOp.code, 0);
    assert.equal(noOp.stdout, "");
  }
  const mismatch = await runHook(
    hookInput("mismatch-session", "turn-1", betaWorkspacePath, `taskId: ${taskId}`),
  );
  assert.equal(mismatch.code, 0);
  assert.match(mismatch.stderr, /^\[TASK_WORKSPACE_MISMATCH\]/u);

  client = await connectClient();
  const toolNames = [
    "asset_search",
    "asset_read",
    "asset_mark_used",
    "task_loadout_resolve",
    "task_loadout_get",
    "task_loadout_list",
  ];
  assert.deepEqual((await client.listTools()).tools.map(({ name }) => name), toolNames);
  assert.deepEqual(success(await callTool("task_loadout_get", { taskId })).task.loadout.assets, []);

  const alphaShared = success(await callTool("asset_search", { taskId, query: "sharedsearch" })).items;
  assert.deepEqual(alphaShared.map(({ assetId }) => assetId), [ids.alphaMemory, ids.globalMemory]);
  assert.equal(alphaShared.some(({ assetId }) => assetId === ids.betaMemory), false);
  const nullShared = success(await callTool("asset_search", {
    taskId: nullContext.taskId,
    query: "sharedsearch",
  })).items;
  assert.deepEqual(nullShared.map(({ assetId }) => assetId), [ids.globalMemory]);
  const betaSearch = success(await callTool("asset_search", {
    taskId: betaContext.taskId,
    query: "n13ablation",
  })).items;
  assert.deepEqual(betaSearch.map(({ assetId }) => assetId), [ids.betaMemory]);
  assert.deepEqual(success(await callTool("asset_search", { taskId, query: "noresulttoken" })).items, []);
  const forbiddenRead = await callTool("asset_read", { taskId, assetId: ids.betaMemory });
  assert.equal(forbiddenRead.isError, true);
  assert.equal(forbiddenRead.structuredContent?.error?.code, "ASSET_NOT_ACCESSIBLE");

  const alphaRead = success(await callTool("asset_read", { taskId, assetId: ids.alphaMemory })).asset;
  assert.match(alphaRead.markdown, /current alpha memory body/u);
  const usedFirst = success(await callTool("asset_mark_used", { taskId, assetId: ids.alphaMemory })).usage;
  const usedSecond = success(await callTool("asset_mark_used", { taskId, assetId: ids.alphaMemory })).usage;
  assert.equal(usedFirst.usedFlag, true);
  assert.equal(usedSecond.usedFlag, true);
  assert.equal(usedFirst.usageId, usedSecond.usageId);

  const resolved = success(await callTool("task_loadout_resolve", { taskId }));
  assert.equal(resolved.changed, true);
  const resolvedAssets = resolved.task.loadout.assets;
  assert.deepEqual(new Set(resolvedAssets.map(({ assetId }) => assetId)), new Set([
    ids.alphaMemory,
    ids.alphaDocument,
    ids.alphaSkill,
  ]));
  assert.equal(resolvedAssets.find(({ assetId }) => assetId === ids.alphaMemory)?.mode, "DIRECT");
  assert.equal(resolvedAssets.find(({ assetId }) => assetId === ids.alphaDocument)?.mode, "ON_DEMAND");
  assert.equal(resolvedAssets.find(({ assetId }) => assetId === ids.alphaSkill)?.mode, "ON_DEMAND");
  const loaded = success(await callTool("task_loadout_get", { taskId })).task;
  const alphaUsage = loaded.usages.find(({ assetId }) => assetId === ids.alphaMemory);
  assert.equal(alphaUsage.recallCount, 1);
  assert.equal(alphaUsage.readCount, 1);
  assert.equal(alphaUsage.usedFlag, true);
  assert.equal(alphaUsage.assetMissing, false);
  assert.equal(success(await callTool("task_loadout_list", { workspace: "alpha" })).items.some(
    ({ taskId: listedTaskId }) => listedTaskId === taskId,
  ), true);

  const injectedHook = parseHookContext((await runHook(
    hookInput("build-session", "turn-3", alphaWorkspacePath, "read stored Loadout"),
  )).stdout);
  assert.equal(injectedHook.taskId, taskId);
  assert.equal(injectedHook.text.includes(decisionToken), true);
  assert.equal(injectedHook.text.includes(documentBodyToken), false);
  assert.equal(injectedHook.text.includes(skillBodyToken), false);
  assert.equal(Array.from(injectedHook.text).length <= 3000, true);
  const explicitAttach = parseHookContext((await runHook(
    hookInput("explicit-session", "turn-1", alphaWorkspacePath, `continue taskId: ${taskId}`),
  )).stdout);
  assert.equal(explicitAttach.taskId, taskId);
  assert.equal(explicitAttach.text.includes(decisionToken), true);

  const restPaths = [
    "/api/assets",
    `/api/assets/${ids.alphaMemory}`,
    "/api/inbox",
    "/api/task-loadouts",
    `/api/task-loadouts/${taskId}`,
    "/api/usages",
    "/api/system/status",
  ];
  for (const path of restPaths) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, path);
    assert.equal((await response.json()).ok, true, path);
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    for (const path of restPaths) {
      const response = await fetch(`${origin}${path}`, { method });
      assert.equal(response.status, 405, `${method} ${path}`);
      assert.equal((await response.json()).error.code, "METHOD_NOT_ALLOWED");
    }
  }
  const foreignOrigin = await fetch(`${origin}/api/assets`, {
    headers: { origin: "http://example.invalid" },
  });
  assert.equal(foreignOrigin.status, 403);
  const status = await getRest("/api/system/status");
  assert.equal(status.index.indexState, "READY");
  assert.equal(status.index.watcherState, "RUNNING");
  assert.equal(status.mcpEndpoint.ready, true);

  assert.deepEqual(success(await callTool("asset_search", { taskId, query: "migrationbridge" })).items, []);
  const migrationHash = createHash("sha256").update(Buffer.from(migrationSource, "utf8")).digest("hex");
  const confirmation = await runConfirmation(migrationSourceRelativePath, migrationHash);
  assert.equal(confirmation.code, 0);
  assert.equal(confirmation.stderr, "");
  const confirmationBody = JSON.parse(confirmation.stdout);
  assert.equal(confirmationBody.assetId, ids.migrationBridge);
  assert.equal(confirmationBody.sourceRelativePath, migrationSourceRelativePath);
  assert.equal(confirmationBody.targetRelativePath, migrationTargetRelativePath);
  await assert.rejects(access(join(repositoryPath, migrationSourceRelativePath)));
  assert.equal(await readFile(join(repositoryPath, migrationTargetRelativePath), "utf8"), migrationSource);
  await waitFor(async () =>
    success(await callTool("asset_search", { taskId, query: "migrationbridge" })).items[0]?.assetId === ids.migrationBridge
  );
  assert.match(
    success(await callTool("asset_read", { taskId, assetId: ids.migrationBridge })).asset.markdown,
    /migrationbridge current Markdown body/u,
  );
  assert.equal((await getRest("/api/inbox")).items.some(({ assetId }) => assetId === ids.migrationBridge), false);
  assert.equal((await getRest("/api/assets")).items.some(({ assetId }) => assetId === ids.migrationBridge), true);
  const repeatedConfirmation = await runConfirmation(migrationSourceRelativePath, migrationHash);
  assert.equal(repeatedConfirmation.code, 2);
  assert.equal(JSON.parse(repeatedConfirmation.stderr).error.code, "INBOX_ASSET_NOT_FOUND");
  assert.equal(await readFile(join(repositoryPath, migrationTargetRelativePath), "utf8"), migrationSource);

  await writeAsset(rejectedSourceRelativePath, rejectedSource);
  const rejected = await runConfirmation(rejectedSourceRelativePath, "0".repeat(64));
  assert.equal(rejected.code, 2);
  assert.equal(JSON.parse(rejected.stderr).error.code, "CONTENT_HASH_MISMATCH");
  assert.equal(await readFile(join(repositoryPath, rejectedSourceRelativePath), "utf8"), rejectedSource);
  await assert.rejects(access(join(repositoryPath, rejectedTargetRelativePath)));

  const lifecycleModified = lifecycleSource.replaceAll("lifecycleoriginal", "lifecyclemodified");
  await writeAsset(lifecycleRelativePath, lifecycleModified);
  await waitFor(async () =>
    success(await callTool("asset_search", { taskId, query: "lifecyclemodified" })).items[0]?.assetId === ids.lifecycle
  );
  await writeAsset(lifecycleRelativePath, "# invalid without Frontmatter\n");
  await waitFor(async () =>
    success(await callTool("asset_search", { taskId, query: "lifecyclemodified" })).items.length === 0
  );
  const lifecycleRepaired = lifecycleSource.replaceAll("lifecycleoriginal", "lifecyclerepaired");
  await writeAsset(lifecycleRelativePath, lifecycleRepaired);
  await waitFor(async () =>
    success(await callTool("asset_search", { taskId, query: "lifecyclerepaired" })).items[0]?.assetId === ids.lifecycle
  );

  const catalogCountBeforeInvalidConfig = (await getRest("/api/system/status")).index.catalogCount;
  await writeFixture(workspaceConfigPath, "{invalid");
  await waitFor(async () => (await getRest("/api/system/status")).service.readiness === "DEGRADED");
  assert.equal((await getRest("/api/system/status")).index.catalogCount, catalogCountBeforeInvalidConfig);
  assert.equal((await fetch(`${origin}/api/assets`)).status, 503);
  await writeWorkspaceConfig();
  await waitFor(async () => (await getRest("/api/system/status")).service.readiness === "READY");

  await rm(join(repositoryPath, lifecycleRelativePath));
  await waitFor(async () =>
    success(await callTool("asset_search", { taskId, query: "lifecyclerepaired" })).items.length === 0
  );
  await writeAsset(lifecycleRelativePath, lifecycleRepaired);
  await waitFor(async () =>
    success(await callTool("asset_search", { taskId, query: "lifecyclerepaired" })).items[0]?.assetId === ids.lifecycle
  );

  await rm(join(repositoryPath, alphaMemoryRelativePath));
  await waitFor(async () =>
    success(await callTool("asset_search", { taskId, query: "sharedsearch" })).items.every(
      ({ assetId }) => assetId !== ids.alphaMemory,
    )
  );
  const missingUsage = (await getRest(`/api/usages?taskId=${taskId}`)).items.find(
    ({ assetId }) => assetId === ids.alphaMemory,
  );
  assert.equal(missingUsage.assetMissing, true);
  await writeAsset(alphaMemoryRelativePath, alphaMemorySource);
  await waitFor(async () =>
    success(await callTool("asset_search", { taskId, query: "sharedsearch" })).items[0]?.assetId === ids.alphaMemory
  );

  await client.close();
  client = undefined;
  await stopChild(child);
  child = undefined;
  await assertServerOffline();

  child = spawnServer();
  await waitForListening(child);
  client = await connectClient();
  assert.equal(
    success(await callTool("asset_search", { taskId, query: "sharedsearch" })).items[0]?.assetId,
    ids.alphaMemory,
  );
  assert.equal(success(await callTool("task_loadout_get", { taskId })).task.usages.length > 0, true);
  await client.close();
  client = undefined;
  await stopChild(child);
  child = undefined;
  await assertServerOffline();

  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    await rm(path, { force: true });
  }
  child = spawnServer();
  await waitForListening(child);
  client = await connectClient();
  const lostTask = await callTool("asset_search", { taskId, query: "sharedsearch" });
  assert.equal(lostTask.isError, true);
  assert.equal(lostTask.structuredContent?.error?.code, "TASK_NOT_FOUND");
  const rebuiltHook = parseHookContext((await runHook(
    hookInput("rebuilt-session", "turn-1", alphaWorkspacePath, "sharedsearch"),
  )).stdout);
  assert.deepEqual((await getRest("/api/usages")).items, []);
  assert.equal(
    success(await callTool("asset_search", { taskId: rebuiltHook.taskId, query: "sharedsearch" })).items[0]?.assetId,
    ids.alphaMemory,
  );
  const rebuiltStatus = await getRest("/api/system/status");
  assert.equal(rebuiltStatus.index.indexState, "READY");
  assert.equal(rebuiltStatus.index.catalogCount >= 8, true);

  process.stdout.write(`${JSON.stringify({
    event: "N13_E2E_BUILD_SMOKE",
    status: "ok",
    bindHost: "127.0.0.1",
    tools: toolNames,
    restRoutes: restPaths,
    hookTaskId: taskId,
    confirmedAssetId: ids.migrationBridge,
    restart: "preserved-runtime-data",
    sqliteRebuild: "catalog-restored-runtime-data-cleared",
  })}\n`);
} finally {
  await client?.close().catch(() => undefined);
  await stopChild(child).catch(() => undefined);
  await rm(fixtureRoot, { force: true, recursive: true });
}

function spawnServer() {
  return spawn(process.execPath, [join(serverRoot, "dist", "main.js")], {
    cwd: serverRoot,
    env: runtimeEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function connectClient() {
  const connected = new Client({ name: "n13-e2e-build-smoke", version: "0.0.0" });
  await connected.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)));
  return connected;
}

async function callTool(name, args) {
  assert.notEqual(client, undefined);
  return await client.callTool({ name, arguments: args });
}

function success(result) {
  assert.notEqual(result.isError, true, JSON.stringify(result.structuredContent));
  assert.equal(result.structuredContent?.ok, true);
  return result.structuredContent;
}

async function getRest(path) {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.status, 200, path);
  const body = await response.json();
  assert.equal(body.ok, true, path);
  return body.data;
}

async function runHook(input) {
  return await runNode(join(serverRoot, "dist", "hook", "user-prompt-submit.js"), [], JSON.stringify(input));
}

async function runConfirmation(relativePath, expectedContentHash) {
  return await runNode(join(serverRoot, "dist", "asset", "confirm-cli.js"), [
    "--relative-path",
    relativePath,
    "--expected-content-hash",
    expectedContentHash,
  ]);
}

async function runNode(script, args, stdin = "") {
  const spawned = spawn(process.execPath, [script, ...args], {
    cwd: serverRoot,
    env: runtimeEnvironment(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  spawned.stdout.setEncoding("utf8");
  spawned.stderr.setEncoding("utf8");
  spawned.stdout.on("data", (chunk) => { stdout += chunk; });
  spawned.stderr.on("data", (chunk) => { stderr += chunk; });
  spawned.stdin.end(stdin);
  const code = await new Promise((resolve, reject) => {
    spawned.once("error", reject);
    spawned.once("exit", (exitCode) => resolve(exitCode ?? 1));
  });
  return { code, stderr, stdout };
}

function parseHookContext(stdout) {
  const body = JSON.parse(stdout);
  const text = body.hookSpecificOutput.additionalContext;
  const taskId = text.match(/^taskId: (tsk[0-9]+)$/mu)?.[1];
  const workspace = text.match(/^workspace: (.+)$/mu)?.[1]?.replaceAll('"', "");
  assert.notEqual(taskId, undefined);
  assert.notEqual(workspace, undefined);
  return { taskId, workspace, text };
}

function hookInput(sessionId, turnId, cwd, prompt) {
  return {
    cwd,
    hook_event_name: "UserPromptSubmit",
    prompt,
    session_id: sessionId,
    turn_id: turnId,
  };
}

function runtimeEnvironment() {
  return {
    ...process.env,
    CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH: repositoryPath,
    CODEX_MEMORY_OS_DATABASE_PATH: databasePath,
    CODEX_MEMORY_OS_LOG_PATH: logPath,
    CODEX_MEMORY_OS_WORKSPACES_PATH: workspaceConfigPath,
    PORT: String(port),
  };
}

async function writeWorkspaceConfig() {
  await writeFixture(workspaceConfigPath, JSON.stringify({
    schemaVersion: 1,
    workspaces: [
      { name: "alpha", paths: [workspaceRoot] },
      { name: "beta", paths: [betaWorkspacePath] },
    ],
  }));
}

function assetSource({ body, id, scope, summary, title, type, workspace }) {
  const fields = [`id: ${id}`, `type: ${type}`, `scope: ${scope}`];
  if (workspace !== undefined) {
    fields.push(`workspace: ${workspace}`);
  }
  fields.push(`title: ${title}`, `summary: ${summary}`);
  return ["---", ...fields, "---", body, ""].join("\n");
}

async function writeAsset(relativePath, source) {
  await writeFixture(join(repositoryPath, relativePath), source);
}

async function writeFixture(path, source) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source, "utf8");
}

async function allocatePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const selectedPort = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => error === undefined ? resolve() : reject(error)),
  );
  return selectedPort;
}

async function waitForListening(process) {
  return await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Server start timeout: ${stderr}`)), 10_000);
    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");
    process.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes('"event":"listening"')) {
        clearTimeout(timeout);
        resolve(stdout);
      }
    });
    process.stderr.on("data", (chunk) => { stderr += chunk; });
    process.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    process.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before listening: code=${String(code)} stderr=${stderr}`));
    });
  });
}

async function stopChild(process) {
  if (process === undefined || process.exitCode !== null) {
    return;
  }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Server stop timeout")), 10_000);
    process.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    process.kill("SIGTERM");
  });
}

async function assertServerOffline() {
  await waitFor(async () => {
    try {
      await fetch(`${origin}/health`);
      return false;
    } catch {
      return true;
    }
  });
}

async function waitFor(check, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (await check()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for N13 condition${lastError instanceof Error ? `: ${lastError.message}` : ""}`);
}
