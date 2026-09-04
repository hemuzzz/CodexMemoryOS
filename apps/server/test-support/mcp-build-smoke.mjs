import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { TaskApplicationService, TaskRepository } from "../dist/task/index.js";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureRoot = await mkdtemp(join(tmpdir(), "codex-memory-os-n08-build-"));
const repositoryPath = join(fixtureRoot, "asset-repository");
const workspaceConfigPath = join(fixtureRoot, "config", "workspaces.json");
const databasePath = join(fixtureRoot, "data", "codex-memory.sqlite");
const workspacePath = join(fixtureRoot, "workspace-alpha");
const assetId = "ast2034512345678901248";
const taskId = "tsk2034512345678901249";
const port = await allocatePort();
let child;
let client;

try {
  await writeFixture(
    workspaceConfigPath,
    JSON.stringify({
      schemaVersion: 1,
      workspaces: [{ name: "alpha", paths: [workspacePath] }],
    }),
  );
  await writeFixture(
    join(repositoryPath, "assets/workspaces/alpha/documents/smoke.md"),
    [
      "---",
      `id: ${assetId}`,
      "type: DOCUMENT",
      "scope: WORKSPACE",
      "workspace: alpha",
      "title: Build smoke Asset",
      "summary: verifies compiled HTTP MCP",
      "---",
      "compiled-main-search-token current-markdown-token",
      "",
    ].join("\n"),
  );
  await mkdir(dirname(databasePath), { recursive: true });
  const repository = new TaskRepository(databasePath);
  try {
    const service = new TaskApplicationService(repository, {
      idGenerator: {
        next: () => taskId,
        validate: (id, prefix) => /^(ast|tsk|usg)[0-9]+$/.test(id) && (prefix === undefined || id.startsWith(prefix)),
      },
      now: () => "2026-09-04T00:00:00.000Z",
    });
    assert.equal(service.resolveTask({
      sourceSessionId: "build-smoke-session",
      sourceTurnId: "build-smoke-turn",
      request: "compiled MCP smoke",
      workspace: "alpha",
    }).task.taskId, taskId);
  } finally {
    repository.close();
  }

  child = spawn(process.execPath, [join(serverRoot, "dist", "main.js")], {
    cwd: serverRoot,
    env: {
      ...process.env,
      CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH: repositoryPath,
      CODEX_MEMORY_OS_DATABASE_PATH: databasePath,
      CODEX_MEMORY_OS_LOG_PATH: join(fixtureRoot, "logs", "codex-memory-os.log"),
      CODEX_MEMORY_OS_WORKSPACES_PATH: workspaceConfigPath,
      PORT: String(port),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  await waitForListening(child);

  const endpoint = `http://127.0.0.1:${port}/mcp`;
  client = new Client({ name: "n08-build-smoke", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  const tools = await client.listTools();
  const toolNames = [
    "asset_search",
    "asset_read",
    "asset_mark_used",
    "task_loadout_resolve",
    "task_loadout_get",
    "task_loadout_list",
  ];
  assert.deepEqual(tools.tools.map(({ name }) => name), toolNames);

  const search = await client.callTool({
    name: "asset_search",
    arguments: { taskId, query: "compiled-main-search-token" },
  });
  assert.equal(search.isError, undefined);
  assert.equal(search.structuredContent?.ok, true);
  assert.equal(search.structuredContent?.items?.[0]?.assetId, assetId);

  const read = await client.callTool({
    name: "asset_read",
    arguments: { taskId, assetId },
  });
  assert.equal(read.isError, undefined);
  assert.equal(read.structuredContent?.ok, true);
  assert.match(read.structuredContent?.asset?.markdown ?? "", /current-markdown-token/);

  const used = await client.callTool({
    name: "asset_mark_used",
    arguments: { taskId, assetId },
  });
  assert.equal(used.isError, undefined);
  assert.equal(used.structuredContent?.usage?.usedFlag, true);

  const resolved = await client.callTool({
    name: "task_loadout_resolve",
    arguments: { taskId },
  });
  assert.equal(resolved.isError, undefined);
  assert.equal(resolved.structuredContent?.changed, true);
  assert.equal(resolved.structuredContent?.task?.loadout?.assets?.[0]?.assetId, assetId);

  const get = await client.callTool({
    name: "task_loadout_get",
    arguments: { taskId },
  });
  assert.equal(get.isError, undefined);
  assert.equal(get.structuredContent?.task?.usages?.[0]?.usageId.startsWith("usg"), true);
  assert.equal(get.structuredContent?.task?.usages?.[0]?.recallCount, 1);
  assert.equal(get.structuredContent?.task?.usages?.[0]?.readCount, 1);
  assert.equal(get.structuredContent?.task?.usages?.[0]?.usedFlag, true);

  const list = await client.callTool({ name: "task_loadout_list", arguments: { workspace: "alpha" } });
  assert.equal(list.isError, undefined);
  assert.equal(list.structuredContent?.items?.[0]?.taskId, taskId);

  const health = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok" });
  process.stdout.write(`${JSON.stringify({ event: "N08_BUILD_SMOKE", status: "ok", tools: toolNames })}\n`);
} finally {
  await client?.close();
  await stopChild(child);
  await rm(fixtureRoot, { force: true, recursive: true });
}

async function writeFixture(path, content) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
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
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
  return port;
}

async function waitForListening(process) {
  await new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => reject(new Error(`Server start timeout: ${stderr}`)), 10_000);
    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");
    process.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.includes('"event":"listening"')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    process.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
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
