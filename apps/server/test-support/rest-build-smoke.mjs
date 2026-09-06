import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TaskApplicationService, TaskRepository } from "../dist/task/index.js";

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const fixtureRoot = await mkdtemp(join(tmpdir(), "codex-memory-os-n09-rest-build-"));
const repositoryPath = join(fixtureRoot, "asset-repository");
const workspaceConfigPath = join(fixtureRoot, "config", "workspaces.json");
const databasePath = join(fixtureRoot, "data", "codex-memory.sqlite");
const workspacePath = join(fixtureRoot, "workspace-alpha");
const assetId = "ast2034512345678901248";
const taskId = "tsk2034512345678901249";
const port = await allocatePort();
let child;

try {
  await writeFixture(workspaceConfigPath, JSON.stringify({
    schemaVersion: 1,
    workspaces: [{ name: "alpha", paths: [workspacePath] }],
  }));
  await writeFixture(
    join(repositoryPath, "assets/workspaces/alpha/documents/smoke.md"),
    [
      "---",
      `id: ${assetId}`,
      "type: DOCUMENT",
      "scope: WORKSPACE",
      "workspace: alpha",
      "title: REST build smoke Asset",
      "summary: verifies compiled read-only REST",
      "---",
      "compiled-rest-token",
      "",
    ].join("\n"),
  );
  await mkdir(dirname(databasePath), { recursive: true });
  const repository = new TaskRepository(databasePath);
  try {
    const service = new TaskApplicationService(repository, {
      idGenerator: {
        next: () => taskId,
        validate: (id, prefix) => /^(ast|tsk|usg)[0-9]+$/.test(id) &&
          (prefix === undefined || id.startsWith(prefix)),
      },
      now: () => "2026-09-04T00:00:00.000Z",
    });
    service.resolveTask({
      sourceSessionId: "rest-build-smoke-session",
      sourceTurnId: "rest-build-smoke-turn",
      request: "compiled REST smoke",
      workspace: "alpha",
    });
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

  const paths = [
    "/api/assets",
    `/api/assets/${assetId}`,
    "/api/inbox",
    "/api/task-loadouts",
    `/api/task-loadouts/${taskId}`,
    "/api/usages",
    "/api/system/status",
  ];
  for (const path of paths) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(response.status, 200, path);
    const body = await response.json();
    assert.equal(body.ok, true, path);
    assert.equal(Object.hasOwn(body, "data"), true, path);
  }
  const detail = await fetch(`http://127.0.0.1:${port}/api/assets/${assetId}`).then((response) => response.json());
  assert.match(detail.data.asset.rawMarkdown, /compiled-rest-token/);
  assert.match(detail.data.asset.renderedMarkdown, /<p>compiled-rest-token<\/p>/);

  const diff = await fetch(`http://127.0.0.1:${port}/api/assets/${assetId}/diff`).then(response => response.json());
  assert.deepEqual(diff, { ok: true, data: { diff: { assetId, status: "UNTRACKED" } } });

  const rejectedWrite = await fetch(`http://127.0.0.1:${port}/api/assets`, { method: "POST" });
  assert.equal(rejectedWrite.status, 405);
  assert.equal((await rejectedWrite.json()).error.code, "METHOD_NOT_ALLOWED");
  process.stdout.write(`${JSON.stringify({ event: "N09_REST_BUILD_SMOKE", routes: paths, status: "ok" })}\n`);
} finally {
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
