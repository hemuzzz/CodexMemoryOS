import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import Database from "better-sqlite3";

const dist = process.env.CODEX_MEMORY_OS_TEST_DIST === "1";
const moduleRoot = new URL(dist ? "../dist/" : "../src/", import.meta.url);
console.log(`F03_PRODUCTION_MODULE_ROOT ${moduleRoot.href}`);
const assets: typeof import("../src/asset/index.js") = await import(new URL("asset/index.js", moduleRoot).href);
const tasks: typeof import("../src/task/index.js") = await import(new URL("task/index.js", moduleRoot).href);
const usages: typeof import("../src/usage/index.js") = await import(new URL("usage/index.js", moduleRoot).href);
const loadouts: typeof import("../src/loadout/index.js") = await import(new URL("loadout/index.js", moduleRoot).href);
const hooks: typeof import("../src/hook/user-prompt-submit.js") = await import(new URL("hook/user-prompt-submit.js", moduleRoot).href);
const mcp: typeof import("../src/mcp/index.js") = await import(new URL("mcp/index.js", moduleRoot).href);
const ids = new SnowflakeIdGenerator();
const scenarios = ["alpha-beta", "global-beta-alpha", "global-beta-null", "document", "skill", "deleted", "invalid", "symlink", "updated", "global", "terminal"] as const;
type Scenario = typeof scenarios[number];

for (const scenario of scenarios) {
  test(`F03 ${scenario}: current Hook content is qualified, stored JSON and Usage remain unchanged`, async (t) => {
    const fixture = await createFixture(scenario);
    try {
      await fixture.change();
      if (scenario !== "invalid" && scenario !== "symlink" && scenario !== "deleted") {
        const scan = await assets.scanAssetRepository(fixture);
        assert.equal(scan.isComplete, true);
        assert.deepEqual(scan.diagnostics, []);
        await fixture.index.synchronize();
        assert.equal(fixture.index.status().indexState, "READY");
      }
      const inaccessible = ["alpha-beta", "global-beta-alpha", "global-beta-null", "deleted", "invalid", "symlink", "terminal"].includes(scenario);
      if (inaccessible) {
        await assert.rejects(fixture.search.read({ assetId: fixture.assetId, context: { workspace: fixture.workspace } }),
          (error: unknown) => error instanceof assets.AssetNotAccessibleError || error instanceof assets.AssetNotFoundError);
      }
      fixture.assertFrozen();
      const rendered = await loadouts.renderStoredTaskLoadout(fixture.storedTask(), fixture.search);
      checkOutput(JSON.stringify({ hookSpecificOutput: { additionalContext: rendered } }), fixture, scenario, t);
      if (scenario === "terminal") {
        // Existing-binding retries are allowed by the Task contract, unlike a new attach.
        const output = await hooks.handleCodexHook(fixture.input("initial", "turn-1"), fixture, fixture.logger);
        checkOutput(output, fixture, scenario, t);
        const terminal = await fixture.client.callTool({ name: "task_loadout_get", arguments: { taskId: fixture.taskId } });
        assert.notEqual(terminal.isError, true);
        assert.doesNotMatch(JSON.stringify(terminal), /BETA_PRIVATE_MARKER/u);
        fixture.assertFrozen();
        return;
      }
      const output = await hooks.handleCodexHook(fixture.input("initial", "turn-2"), fixture, fixture.logger);
      checkOutput(output, fixture, scenario, t);
      const attached = await hooks.handleCodexHook(fixture.input("attach", "turn-1"), fixture, fixture.logger);
      checkOutput(attached, fixture, scenario, t);
      for (const [name, arguments_] of [
        ["task_loadout_get", { taskId: fixture.taskId }],
        ["task_loadout_list", { workspace: fixture.workspace }],
      ] as const) {
        const result = await fixture.client.callTool({ name, arguments: arguments_ });
        assert.notEqual(result.isError, true);
        assert.doesNotMatch(JSON.stringify(result), /BETA_PRIVATE_MARKER|FORBIDDEN_SUMMARY|OLD_PRIVATE_SUMMARY/u);
        fixture.assertFrozen();
      }
      if (dist) {
        for (const input of [fixture.input("initial", "turn-3"), fixture.input("child-attach", "turn-1")]) {
          const result = await runHookChild(input, fixture);
          assert.equal(result.code, 0, result.stderr);
          assert.equal(result.stderr, "");
          checkOutput(result.stdout, fixture, scenario, t);
        }
      }
    } finally {
      await fixture.close();
    }
  });
}

test("F03 projection renders the qualified Read result even when Catalog metadata subsequently changes", async () => {
  const fixture = await createFixture("updated");
  const database = new Database(fixture.databasePath);
  try {
    await fixture.change();
    const rendered = await loadouts.renderStoredTaskLoadout(fixture.storedTask(), {
      read: async (input) => {
        assert.equal(input.context.workspace, "alpha");
        const current = await fixture.search.read(input);
        database.prepare("UPDATE asset_catalog SET title = ?, summary = ? WHERE asset_id = ?")
          .run("FORBIDDEN_CATALOG_TITLE", "FORBIDDEN_CATALOG_SUMMARY", input.assetId);
        return current;
      },
    });
    assert.match(rendered, /CURRENT_ALLOWED_SUMMARY/u);
    assert.match(rendered, /LEGAL_SIBLING_SUMMARY/u);
    assert.doesNotMatch(rendered, /FORBIDDEN_CATALOG/u);
    fixture.assertFrozen();
  } finally { database.close(); await fixture.close(); }
});

test("F03 projection propagates unavailable configuration and database faults", async () => {
  const fixture = await createFixture("updated");
  try {
    await writeFile(fixture.workspaceConfigPath, "invalid configuration");
    await assert.rejects(loadouts.renderStoredTaskLoadout(fixture.storedTask(), fixture.search), assets.AssetSearchUnavailableError);
    fixture.assertFrozen();
    const database = new Database(fixture.databasePath);
    try { database.exec("DROP TABLE asset_catalog"); } finally { database.close(); }
    await assert.rejects(loadouts.renderStoredTaskLoadout(fixture.storedTask(), fixture.search), /no such table: asset_catalog/u);
    fixture.assertFrozen();
  } finally { await fixture.close(); }
});

test("F03 non-empty Hook requires a repository path; no fallback to stored metadata", async () => {
  const fixture = await createFixture("updated");
  try {
    await assert.rejects(hooks.handleCodexHook(fixture.input("initial", "turn-2"), {
      databasePath: fixture.databasePath, workspaceConfigPath: fixture.workspaceConfigPath,
    }, fixture.logger), /CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH is required/u);
    fixture.assertFrozen();
  } finally { await fixture.close(); }
});

test("F03/U04 eligible summary growth downgrades only this qualified projection", async () => {
  const fixture = await createFixture("updated");
  try {
    await writeFile(join(fixture.repositoryPath, "assets/workspaces/alpha/memories/one.md"),
      source(fixture.assetId, "alpha", "MEMORY", "Current allowed title", "合格摘要".repeat(1000)));
    const rendered = await loadouts.renderStoredTaskLoadout(fixture.storedTask(), fixture.search);
    assert.ok(loadouts.unicodeCharacterCount(rendered) <= 3000);
    assert.doesNotMatch(rendered, /合格摘要/u);
    assert.match(rendered, new RegExp(`ON_DEMAND ${fixture.assetId}`));
    assert.match(rendered, /LEGAL_SIBLING_SUMMARY/u);
    fixture.assertFrozen();
  } finally { await fixture.close(); }
});

test("U04 an oversized qualified title omits that item and preserves a valid sibling and all stored rows", async () => {
  const fixture = await createFixture("updated");
  try {
    await writeFile(join(fixture.repositoryPath, "assets/workspaces/alpha/memories/one.md"),
      source(fixture.assetId, "alpha", "MEMORY", "过长标题".repeat(1000), "QUALIFIED_BUT_OVERSIZED"));
    const rendered = await loadouts.renderStoredTaskLoadout(fixture.storedTask(), fixture.search);
    assert.ok(loadouts.unicodeCharacterCount(rendered) <= 3000);
    assert.doesNotMatch(rendered, /过长标题|QUALIFIED_BUT_OVERSIZED/u);
    assert.match(rendered, /LEGAL_SIBLING_SUMMARY/u);
    fixture.assertFrozen();
  } finally { await fixture.close(); }
});

function checkOutput(output: string | null, fixture: Awaited<ReturnType<typeof createFixture>>, scenario: Scenario, t: { diagnostic: (value: string) => void }) {
  assert.notEqual(output, null);
  const text = (JSON.parse(output!) as { hookSpecificOutput: { additionalContext: string } }).hookSpecificOutput.additionalContext;
  t.diagnostic(`F03_EVIDENCE ${JSON.stringify({ scenario, leaked: /BETA_PRIVATE_MARKER|FORBIDDEN_SUMMARY/.test(text), siblingPresent: text.includes("LEGAL_SIBLING_SUMMARY") })}`);
  assert.match(text, /LEGAL_SIBLING_SUMMARY/u, "Valid sibling must still be injected");
  assert.doesNotMatch(text, /BETA_PRIVATE_MARKER|FORBIDDEN_SUMMARY/u);
  if (["deleted", "invalid", "symlink"].includes(scenario)) assert.doesNotMatch(text, /OLD_PRIVATE_SUMMARY|OLD_PRIVATE_TITLE/u);
  if (scenario === "document" || scenario === "skill") {
    assert.match(text, new RegExp(`ON_DEMAND ${fixture.assetId}`));
    assert.doesNotMatch(text, new RegExp(`DIRECT ${fixture.assetId}`));
  }
  if (scenario === "updated" || scenario === "global") assert.match(text, /CURRENT_ALLOWED_SUMMARY/u);
  fixture.assertFrozen();
}

async function createFixture(scenario: Scenario) {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-f03-"));
  const repositoryPath = join(rootPath, "repository");
  const databasePath = join(rootPath, "memory.sqlite");
  const workspaceConfigPath = join(rootPath, "workspaces.json");
  const workspace = scenario === "global-beta-null" ? null : "alpha";
  const initialWorkspace = scenario.startsWith("global") ? null : "alpha";
  const assetId = ids.next("ast");
  const siblingId = ids.next("ast");
  const relativePath = initialWorkspace === null ? "assets/global/memories/one.md" : "assets/workspaces/alpha/memories/one.md";
  const path = join(repositoryPath, relativePath);
  await write(workspaceConfigPath, JSON.stringify({ schemaVersion: 1, workspaces: [
    { name: "alpha", paths: [join(rootPath, "alpha")] }, { name: "beta", paths: [join(rootPath, "beta")] },
  ] }));
  await write(path, source(assetId, initialWorkspace, "MEMORY", "OLD_PRIVATE_TITLE", "OLD_PRIVATE_SUMMARY"));
  const siblingPath = workspace === null ? "assets/global/memories/sibling.md" : "assets/workspaces/alpha/memories/sibling.md";
  await write(join(repositoryPath, siblingPath), source(siblingId, workspace, "MEMORY", "Legal sibling", "LEGAL_SIBLING_SUMMARY"));
  const options = { repositoryPath, databasePath, workspaceConfigPath };
  const index = await assets.AssetIndexManager.create(options);
  await index.synchronize();
  const taskRepository = new tasks.TaskRepository(databasePath);
  const taskService = new tasks.TaskApplicationService(taskRepository);
  const task = taskService.resolveTask({ sourceSessionId: "initial", sourceTurnId: "turn-1", workspace, request: "f03match" }).task;
  const search = new assets.AssetSearchService({ ...options, refreshIndex: async () => undefined });
  const usageRepository = new usages.UsageRepository(databasePath);
  const usageService = new usages.UsageApplicationService(usageRepository);
  const projection = new loadouts.LoadoutAssetProjectionRepository(databasePath);
  const loadoutService = new loadouts.TaskLoadoutApplicationService({ assetProjection: projection, assetSearchService: search, taskRepository, taskService, usageService });
  const resolved = await loadoutService.resolve(task.taskId);
  assert.equal(resolved.task.loadout.assets.length, 2);
  assert.equal(resolved.task.loadout.assets.every((asset) => asset.mode === "DIRECT"), true);
  usageService.recordRead(task.taskId, assetId);
  usageService.markUsed(task.taskId, siblingId);
  if (scenario === "terminal") taskService.updateStatus(task.taskId, "COMPLETED");
  const database = new Database(databasePath, { readonly: true });
  const taskBefore = database.prepare("SELECT * FROM task_loadout WHERE task_id = ?").get(task.taskId);
  const usageBefore = database.prepare("SELECT * FROM task_asset_usage ORDER BY usage_id").all();
  const logger = { error: () => undefined };
  const handler = mcp.createMcpHttpRequestHandler({ assetSearchService: search, taskService, usageService, loadoutService, indexStatus: () => index.status(), logger });
  const server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = new Client({ name: "f03-qualification", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)) as unknown as Transport);
  return {
    ...options, rootPath, workspace, assetId, taskId: task.taskId, index, search, logger, client,
    storedTask: () => taskService.getTask(task.taskId),
    input: (session: string, turn: string) => ({ hook_event_name: "UserPromptSubmit", cwd: join(rootPath, workspace ?? "outside"),
      session_id: session, turn_id: turn, prompt: session === "initial" ? "continue" : `continue taskId: ${task.taskId}` }),
    assertFrozen: () => {
      assert.deepEqual(database.prepare("SELECT * FROM task_loadout WHERE task_id = ?").get(task.taskId), taskBefore);
      assert.deepEqual(database.prepare("SELECT * FROM task_asset_usage ORDER BY usage_id").all(), usageBefore);
    },
    change: async () => {
      if (scenario === "deleted") { await unlink(path); return; }
      if (scenario === "invalid") { await write(path, "---javascript\ninvalid test data\n---\n"); return; }
      if (scenario === "symlink") {
        // Move only the target's parent; keep the sibling at another legal directory.
        const siblingNew = join(repositoryPath, "assets/global/memories/sibling.md");
        await write(siblingNew, source(siblingId, null, "MEMORY", "Legal sibling", "LEGAL_SIBLING_SUMMARY"));
        await unlink(join(repositoryPath, siblingPath));
        await index.synchronize();
        const outside = join(rootPath, "outside-parent");
        await rename(dirname(path), outside);
        await symlink(outside, dirname(path));
        return;
      }
      if (scenario === "updated" || scenario === "global") {
        await write(path, source(assetId, initialWorkspace, "MEMORY", "Current allowed title", "CURRENT_ALLOWED_SUMMARY"));
        return;
      }
      await unlink(path);
      const type = scenario === "document" ? "DOCUMENT" : scenario === "skill" ? "SKILL" : "MEMORY";
      const targetWorkspace = type === "MEMORY" ? "beta" : "alpha";
      const directory = type === "DOCUMENT" ? "documents" : type === "SKILL" ? "skills" : "memories";
      await write(join(repositoryPath, `assets/workspaces/${targetWorkspace}/${directory}/one.md`),
        source(assetId, targetWorkspace, type, type === "MEMORY" ? "BETA_PRIVATE_MARKER title" : "Allowed reference title", type === "MEMORY" ? "BETA_PRIVATE_MARKER" : "FORBIDDEN_SUMMARY"));
    },
    close: async () => {
      await client.close();
      await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); });
      database.close(); projection.close(); search.close(); usageRepository.close(); taskRepository.close(); await index.close();
      await rm(rootPath, { recursive: true, force: true });
    },
  };
}

function source(id: string, workspace: string | null, type: string, title: string, summary: string) {
  return `---\nid: ${id}\ntype: ${type}\nscope: ${workspace === null ? "GLOBAL" : "WORKSPACE"}\n${workspace === null ? "" : `workspace: ${workspace}\n`}title: f03match ${title}\nsummary: ${summary}\n---\n正文\n`;
}
async function write(path: string, value: string) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, value); }
async function runHookChild(input: unknown, fixture: { repositoryPath: string; databasePath: string; workspaceConfigPath: string; rootPath: string }) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL("hook/user-prompt-submit.js", moduleRoot))], {
      env: { ...process.env, CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH: fixture.repositoryPath,
        CODEX_MEMORY_OS_DATABASE_PATH: fixture.databasePath, CODEX_MEMORY_OS_WORKSPACES_PATH: fixture.workspaceConfigPath,
        CODEX_MEMORY_OS_LOG_PATH: join(fixture.rootPath, "hook.log") }, stdio: ["pipe", "pipe", "pipe"], timeout: 10_000,
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(input));
  });
}
