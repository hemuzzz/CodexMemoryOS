import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import Database from "better-sqlite3";

const moduleRoot = new URL(process.env.CODEX_MEMORY_OS_TEST_DIST === "1" ? "../dist/" : "../src/", import.meta.url);
console.log(`F04_PRODUCTION_MODULE_ROOT ${moduleRoot.href}`);
const assets: typeof import("../src/asset/index.js") = await import(new URL("asset/index.js", moduleRoot).href);
const tasks: typeof import("../src/task/index.js") = await import(new URL("task/index.js", moduleRoot).href);
const usages: typeof import("../src/usage/index.js") = await import(new URL("usage/index.js", moduleRoot).href);
const loadouts: typeof import("../src/loadout/index.js") = await import(new URL("loadout/index.js", moduleRoot).href);
const mcp: typeof import("../src/mcp/index.js") = await import(new URL("mcp/index.js", moduleRoot).href);
type Snapshot = import("../src/asset/index.js").AssetScanResult;
const ids = new SnowflakeIdGenerator();
const cases = ["combined-move", "swap", "rotate", "replace-id", "move-id", "move-edit"] as const;

for (const scenario of cases) {
  test(`F04 ${scenario}: one normal synchronization applies the unique final Snapshot`, async (t) => {
    const f = await createFixture(scenario === "rotate");
    try {
      const previous = await f.scan();
      const oldIndex = f.indexRows();
      const bytesB = await readFile(f.path("b"));
      if (scenario === "combined-move") {
        await unlink(f.path("a"));
        await rename(f.path("b"), f.path("a"));
        assert.deepEqual(await readFile(f.path("a")), bytesB);
      } else if (scenario === "swap" || scenario === "rotate") {
        const temporary = join(f.rootPath, "moving.md");
        await rename(f.path("a"), temporary);
        await rename(f.path("b"), f.path("a"));
        if (scenario === "rotate") {
          await rename(f.path("d"), f.path("b"));
          await rename(temporary, f.path("d"));
        } else {
          await rename(temporary, f.path("b"));
        }
      } else if (scenario === "replace-id") {
        await f.write("a", ids.next("ast"), "replacement");
      } else {
        await rename(f.path("b"), f.path("moved"));
        if (scenario === "move-edit") await f.write("moved", f.assetIds.b, "current");
      }
      const final = await f.scan();
      assert.equal(final.isComplete, true);
      assert.deepEqual(final.diagnostics, []);
      const result = await f.index.synchronize();
      if (result === null) {
        // Capture the real failure and repeated rollback before the success assertion.
        const first = f.index.status();
        assert.deepEqual(f.indexRows(), oldIndex);
        f.assertFts(previous);
        f.assertRuntime();
        const retry = await f.index.synchronize();
        assert.equal(retry, null);
        assert.deepEqual(f.indexRows(), oldIndex);
        f.assertFts(previous);
        f.assertRuntime();
        t.diagnostic(`F04_BEFORE ${JSON.stringify({ scenario, first, retry: f.index.status(), catalogAndFtsRolledBack: true, runtimeUnchanged: true })}`);
      }
      assert.notEqual(result, null, "A complete valid final Snapshot must synchronize without rebuild");
      const expected = scenario === "combined-move" ? { added: 0, changed: 1, removed: 1, unchanged: 1 }
        : scenario === "replace-id" ? { added: 1, changed: 0, removed: 1, unchanged: 2 }
        : { added: 0, changed: scenario === "rotate" ? 3 : scenario === "swap" ? 2 : 1, removed: 0,
          unchanged: scenario === "swap" || scenario === "rotate" ? 1 : 2 };
      assert.deepEqual(result, { ...expected, invalidated: 0 });
      await f.assertCurrent(final);
      await f.assertRepeat(final);
      if (scenario === "combined-move" || scenario === "replace-id") {
        assert.equal(f.usageService.list({ assetId: f.assetIds.a })[0]?.assetMissing, true);
        assert.equal(f.usageService.listByTask(f.taskId).find(({ assetId }) => assetId === f.assetIds.a)?.readCount, 1);
        f.assertRuntime();
      }
      if (scenario === "combined-move") await f.assertMcp(f.assetIds.b, "f04betabody");
    } finally { await f.close(); }
  });
}

test("F04 duplicate IDs are all invalidated and repaired identities return without transferring history", async () => {
  const f = await createFixture();
  try {
    await f.write("duplicate", f.assetIds.a, "duplicate");
    const conflicted = await f.scan();
    assert.equal(conflicted.isComplete, true);
    assert.deepEqual(conflicted.diagnostics.map(({ code }) => code), ["DUPLICATE_ASSET_ID", "DUPLICATE_ASSET_ID"]);
    assert.equal(conflicted.assets.some(({ frontmatter }) => frontmatter.id === f.assetIds.a), false);
    assert.deepEqual(await f.index.synchronize(), { added: 0, changed: 0, removed: 0, invalidated: 1, unchanged: 2 });
    await f.assertCurrent(conflicted);
    assert.equal(f.usageService.list({ assetId: f.assetIds.a })[0]?.assetMissing, true);
    await f.assertRepeat(conflicted);
    await unlink(f.path("duplicate"));
    const repaired = await f.scan();
    assert.deepEqual(repaired.diagnostics, []);
    assert.deepEqual(await f.index.synchronize(), { added: 1, changed: 0, removed: 0, invalidated: 0, unchanged: 2 });
    await f.assertCurrent(repaired);
    assert.equal(f.usageService.list({ assetId: f.assetIds.a })[0]?.assetMissing, false);
    await f.assertRepeat(repaired);
  } finally { await f.close(); }
});

test("F04 incomplete Repository/configuration scans preserve the index; a valid empty Snapshot removes only projections", async () => {
  const f = await createFixture();
  try {
    const previous = await f.scan();
    const oldIndex = f.indexRows();
    for (const missing of [f.repositoryPath, f.workspaceConfigPath]) {
      const successfulAt = f.index.status().lastSuccessfulScanAt;
      const hidden = `${missing}-temporarily-hidden`;
      await rename(missing, hidden);
      assert.equal((await f.scan()).isComplete, false);
      assert.equal(await f.index.synchronize(), null);
      assert.equal(f.index.status().indexState, "DEGRADED");
      assert.equal(f.index.status().lastSuccessfulScanAt, successfulAt);
      assert.ok(f.index.status().diagnostics.some(({ code }) => code === "INCOMPLETE_SCAN_SNAPSHOT"));
      assert.deepEqual(f.indexRows(), oldIndex);
      f.assertFts(previous);
      f.assertRuntime();
      await rename(hidden, missing);
      await f.assertRepeat(previous);
    }
    for (const file of ["a", "b", "c"]) await unlink(f.path(file));
    const empty = await f.scan();
    assert.deepEqual(empty, { assets: [], diagnostics: [], isComplete: true });
    assert.deepEqual(await f.index.synchronize(), { added: 0, changed: 0, removed: 3, invalidated: 0, unchanged: 0 });
    await f.assertCurrent(empty, false);
    await f.assertRepeat(empty, false);
  } finally { await f.close(); }
});

test("F04 mid-transaction SQL failure rolls back all deletions and partial inserts; normal retry recovers READY", async (t) => {
  const f = await createFixture();
  try {
    const previous = await f.scan();
    const oldIndex = f.indexRows();
    const successfulAt = f.index.status().lastSuccessfulScanAt;
    const hashes = previous.assets.filter(({ frontmatter }) => frontmatter.id !== f.assetIds.c).map(({ contentHash }) => `'${contentHash}'`).join(",");
    // Test-only trigger: both affected old rows must be gone, and the first new
    // Catalog/FTS pair must be present before the second insertion is aborted.
    f.database.exec(`CREATE TRIGGER reject_f04_second_insert BEFORE INSERT ON asset_catalog
      WHEN (SELECT count(*) FROM asset_catalog) = 2
        AND NOT EXISTS (SELECT 1 FROM asset_catalog WHERE content_hash IN (${hashes}))
      BEGIN
        SELECT CASE WHEN (SELECT count(*) FROM asset_fts) = 2
          THEN RAISE(ABORT, 'F04_AFTER_DELETE_AND_FIRST_FTS_INSERT')
          ELSE RAISE(ABORT, 'F04_WRONG_FAILURE_PHASE') END;
      END`);
    await f.write("a", f.assetIds.a, "changedalpha");
    await f.write("b", f.assetIds.b, "changedbeta");
    const final = await f.scan();
    assert.equal(final.isComplete, true);
    assert.deepEqual(final.diagnostics, []);
    assert.equal(await f.index.synchronize(), null);
    assert.equal(f.index.status().indexState, "DEGRADED");
    assert.equal(f.index.status().lastSuccessfulScanAt, successfulAt);
    assert.ok(f.index.status().diagnostics.some(({ message }) => message.includes("F04_AFTER_DELETE_AND_FIRST_FTS_INSERT")));
    assert.deepEqual(f.indexRows(), oldIndex);
    f.assertFts(previous);
    f.assertRuntime();
    t.diagnostic(`F04_ROLLBACK ${JSON.stringify(f.index.status())}`);
    const gated = await f.client.callTool({ name: "asset_read", arguments: { taskId: f.taskId, assetId: f.assetIds.b } });
    assert.equal(gated.isError, true);
    assert.match(JSON.stringify(gated), /ASSET_INDEX_UNAVAILABLE/u);
    f.assertRuntime();
    f.database.exec("DROP TRIGGER reject_f04_second_insert");
    assert.deepEqual(await f.index.synchronize(), { added: 0, changed: 2, removed: 0, invalidated: 0, unchanged: 1 });
    await f.assertCurrent(final);
    await f.assertRepeat(final);
    await f.assertMcp(f.assetIds.b, "f04changedbetabody");
  } finally { await f.close(); }
});

async function createFixture(withFourth = false) {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-f04-"));
  const repositoryPath = join(rootPath, "repository");
  const workspaceConfigPath = join(rootPath, "workspaces.json");
  const databasePath = join(rootPath, "memory.sqlite");
  const options = { repositoryPath, workspaceConfigPath, databasePath };
  const assetIds = { a: ids.next("ast"), b: ids.next("ast"), c: ids.next("ast"), d: ids.next("ast") };
  const tokens = new Set<string>();
  const path = (name: string) => join(repositoryPath, `assets/global/memories/${name}.md`);
  const write = async (name: string, id: string, key: string) => {
    for (const field of ["title", "summary", "body"]) tokens.add(`f04${key}${field}`);
    await mkdir(dirname(path(name)), { recursive: true });
    await writeFile(path(name), `---\nid: ${id}\ntype: MEMORY\nscope: GLOBAL\ntitle: f04${key}title\nsummary: f04${key}summary\n---\nf04${key}body 中文正文\n`);
  };
  await writeFile(workspaceConfigPath, JSON.stringify({ schemaVersion: 1, workspaces: [] }));
  await write("a", assetIds.a, "alpha");
  await write("b", assetIds.b, "beta");
  await write("c", assetIds.c, "control");
  if (withFourth) await write("d", assetIds.d, "delta");
  // No watcher: both file operations finish before a normal complete scan/apply.
  let tick = 0;
  const index = await assets.AssetIndexManager.create({ ...options, now: () => new Date(Date.UTC(2026, 8, 6, 0, 0, tick++)) });
  assert.notEqual(await index.synchronize(), null);
  const taskRepository = new tasks.TaskRepository(databasePath);
  const taskService = new tasks.TaskApplicationService(taskRepository);
  const taskId = taskService.resolveTask({ sourceSessionId: "f04-session", sourceTurnId: "first", request: "f04", workspace: null }).task.taskId;
  const search = new assets.AssetSearchService({ ...options, refreshIndex: async () => undefined });
  const usageRepository = new usages.UsageRepository(databasePath);
  const usageService = new usages.UsageApplicationService(usageRepository);
  const projection = new loadouts.LoadoutAssetProjectionRepository(databasePath);
  const loadoutService = new loadouts.TaskLoadoutApplicationService({ assetProjection: projection, assetSearchService: search, taskRepository, taskService, usageService });
  const resolved = await loadoutService.resolve(taskId);
  assert.deepEqual(new Set(resolved.task.loadout.assets.map(({ assetId }) => assetId)), new Set(withFourth ? Object.values(assetIds) : [assetIds.a, assetIds.b, assetIds.c]));
  usageService.recordRecalls(taskId, [assetIds.a, assetIds.b]);
  usageService.recordRead(taskId, assetIds.a);
  usageService.markUsed(taskId, assetIds.a);
  usageService.recordRead(taskId, assetIds.b);
  const database = new Database(databasePath);
  const runtimeRows = () => ({
    tasks: database.prepare("SELECT * FROM task_loadout ORDER BY task_id").all(),
    bindings: database.prepare("SELECT * FROM task_turn_binding ORDER BY source_session_id, source_turn_id").all(),
    usages: database.prepare("SELECT * FROM task_asset_usage ORDER BY usage_id").all(),
  });
  const baseline = runtimeRows();
  const assertRuntime = () => assert.deepEqual(runtimeRows(), baseline, "Synchronization and pure queries must preserve complete runtime rows");
  const indexRows = () => ({ catalog: database.prepare("SELECT rowid, * FROM asset_catalog ORDER BY asset_id").all(),
    fts: database.prepare("SELECT rowid, * FROM asset_fts ORDER BY rowid").all() });
  const controlBefore = database.prepare("SELECT rowid, * FROM asset_catalog WHERE asset_id = ?").get(assetIds.c);
  const matchIds = (expression: string) => database.prepare<[string], { assetId: string }>(
    "SELECT c.asset_id AS assetId FROM asset_fts JOIN asset_catalog c ON c.rowid = asset_fts.rowid WHERE asset_fts MATCH ? ORDER BY c.asset_id",
  ).all(expression).map(({ assetId }) => assetId);
  const assertFts = (snapshot: Snapshot) => {
    const catalogIds = database.prepare("SELECT rowid FROM asset_catalog ORDER BY rowid").all();
    const ftsIds = database.prepare("SELECT rowid FROM asset_fts ORDER BY rowid").all();
    assert.deepEqual(ftsIds, catalogIds, "Catalog and FTS must have exactly the same rowid set");
    for (const token of tokens) {
      const expected = snapshot.assets.filter((asset) => `${asset.frontmatter.title}\n${asset.frontmatter.summary}\n${asset.content}`.includes(token)).map(({ frontmatter }) => frontmatter.id).sort();
      assert.deepEqual(matchIds(`"${token}"`), expected, `FTS MATCH ${token}`);
      for (const field of ["title", "summary", "body"] as const) {
        const expectedColumn = snapshot.assets.filter((asset) => (field === "body" ? asset.content : asset.frontmatter[field]).includes(token)).map(({ frontmatter }) => frontmatter.id).sort();
        assert.deepEqual(matchIds(`${field} : "${token}"`), expectedColumn, `FTS ${field} MATCH ${token}`);
      }
    }
  };
  const assertCurrent = async (snapshot: Snapshot, controlPresent = true) => {
    assert.equal(index.status().indexState, "READY");
    assert.equal(index.status().rebuildRequired, false);
    assert.equal(index.status().watcherState, "NOT_STARTED");
    const actual = database.prepare(`SELECT asset_id, asset_type, asset_scope, workspace, title, summary,
      file_path, content_hash, file_size, modified_at FROM asset_catalog ORDER BY asset_id`).all();
    assert.deepEqual(actual, snapshot.assets.map((asset) => ({ asset_id: asset.frontmatter.id, asset_type: asset.frontmatter.type,
      asset_scope: asset.frontmatter.scope, workspace: asset.frontmatter.scope === "WORKSPACE" ? asset.frontmatter.workspace : null,
      title: asset.frontmatter.title, summary: asset.frontmatter.summary, file_path: asset.relativePath,
      content_hash: asset.contentHash, file_size: asset.fileSize, modified_at: asset.modifiedAt,
    })).sort((a, b) => a.asset_id.localeCompare(b.asset_id)));
    assert.equal(new Set(snapshot.assets.map(({ relativePath }) => relativePath)).size, actual.length);
    assert.equal(new Set(snapshot.assets.map(({ frontmatter }) => frontmatter.id)).size, actual.length);
    assertFts(snapshot);
    if (controlPresent) assert.deepEqual(database.prepare("SELECT rowid, * FROM asset_catalog WHERE asset_id = ?").get(assetIds.c), controlBefore);
    for (const asset of snapshot.assets) {
      const current = await search.read({ assetId: asset.frontmatter.id, context: { workspace: null } });
      assert.equal(current.markdown, asset.markdown);
      assert.equal(current.contentHash, asset.contentHash);
      assert.deepEqual(current.frontmatter, asset.frontmatter);
      const found = await search.search({ context: { workspace: null }, query: asset.frontmatter.summary });
      assert.deepEqual(found.map(({ assetId }) => assetId), [asset.frontmatter.id]);
      assert.equal(found[0]?.searchStrategy, "FTS");
      assert.equal(found[0]?.contentHash, asset.contentHash);
      assertRuntime();
    }
    assertRuntime();
  };
  const assertRepeat = async (snapshot: Snapshot, controlPresent = true) => {
    const before = indexRows();
    assert.deepEqual(await index.synchronize(), { added: 0, changed: 0, removed: 0, invalidated: 0, unchanged: snapshot.assets.length });
    assert.deepEqual(indexRows(), before, "Identical Snapshot must not rewrite rowid or indexed_at");
    await assertCurrent(snapshot, controlPresent);
  };
  const handler = mcp.createMcpHttpRequestHandler({ assetSearchService: search, taskService, usageService, loadoutService,
    indexStatus: () => index.status(), logger: { error: () => undefined } });
  const server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const client = new Client({ name: "f04-snapshot", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)) as unknown as Transport);
  const assertMcp = async (assetId: string, query: string) => {
    assertRuntime(); // MCP counting is deliberately outside the pure-query baseline.
    const before = usageService.listByTask(taskId);
    const searchResult = toolData(await client.callTool({ name: "asset_search", arguments: { taskId, query } }) as CallToolResult);
    assert.equal(searchResult.ok, true);
    assert.deepEqual((searchResult.items as { assetId: string }[]).map((item) => item.assetId), [assetId]);
    const readResult = toolData(await client.callTool({ name: "asset_read", arguments: { taskId, assetId } }) as CallToolResult);
    assert.equal(readResult.ok, true);
    assert.equal((readResult.asset as { frontmatter: { id: string } }).frontmatter.id, assetId);
    assert.match((readResult.asset as { markdown: string }).markdown, new RegExp(query));
    const after = usageService.listByTask(taskId);
    assert.equal(after.length, before.length);
    for (const old of before) {
      const current = after.find((row) => row.assetId === old.assetId)!;
      if (old.assetId === assetId) {
        assert.deepEqual({ ...current, updatedAt: old.updatedAt }, { ...old, recallCount: old.recallCount + 1, readCount: old.readCount + 1 });
      } else { assert.deepEqual(current, old); }
    }
    assert.deepEqual(runtimeRows().tasks, baseline.tasks);
    assert.deepEqual(runtimeRows().bindings, baseline.bindings);
  };
  return { ...options, rootPath, assetIds, taskId, path, write, index, database, indexRows, search, client, usageService,
    scan: () => assets.scanAssetRepository(options), assertCurrent, assertFts, assertRepeat, assertRuntime, assertMcp,
    close: async () => {
      await client.close();
      await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); });
      database.close(); projection.close(); usageRepository.close(); taskRepository.close(); search.close(); await index.close();
      await rm(rootPath, { recursive: true, force: true });
    },
  };
}

function toolData(result: CallToolResult): Record<string, unknown> {
  assert.notEqual(result.isError, true, JSON.stringify(result));
  assert.ok(result.structuredContent);
  return result.structuredContent;
}
