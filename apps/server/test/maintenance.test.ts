import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, unlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
const dist = process.env.CODEX_MEMORY_OS_TEST_DIST === "1";
const root = new URL(dist ? "../dist/" : "../src/", import.meta.url);
const assets: typeof import("../src/asset/index.js") = await import(new URL("asset/index.js", root).href);
const tasks: typeof import("../src/task/index.js") = await import(new URL("task/index.js", root).href);
const usages: typeof import("../src/usage/index.js") = await import(new URL("usage/index.js", root).href);
const loadouts: typeof import("../src/loadout/index.js") = await import(new URL("loadout/index.js", root).href);
console.log(`F07_U02_MODULE_ROOT ${root.href}`);
for (const damage of ["missing-fts", "wrong-fts", "wrong-catalog"] as const) {
  test(`F07 actual CLI repairs ${damage}, preserves all runtime rows and current Search/Read`, async () => {
    const f = await fixture();
    try {
      if (damage === "wrong-catalog") f.db.exec("DROP TABLE asset_catalog; CREATE TABLE asset_catalog(broken TEXT)");
      else { f.db.exec("DROP TABLE asset_fts"); if (damage === "wrong-fts") f.db.exec("CREATE TABLE asset_fts(broken TEXT)"); }
      const result = await f.cli(["rebuild-index", "--offline"]);
      assert.equal(result.code, 0, result.stderr);
      f.assertRuntime();
      assert.equal(f.db.prepare("SELECT c.asset_id FROM asset_fts JOIN asset_catalog c ON c.rowid=asset_fts.rowid WHERE asset_fts MATCH 'maintenancetoken'").all().length, 1);
      const search = new assets.AssetSearchService({ ...f.options, refreshIndex: async () => undefined });
      try {
        assert.equal((await search.search({ query: "maintenancetoken", context: { workspace: null } })).length, 1);
        assert.match((await search.read({ assetId: "ast301", context: { workspace: null } })).markdown, /maintenancetoken/);
      } finally { search.close(); }
      f.assertRuntime();
    } finally { await f.close(); }
  });
}
test("F07 missing offline acknowledgement, incomplete scan, missing/corrupt DB and busy lock fail without reset", async () => {
  const f = await fixture();
  try {
    const before = f.indexRows();
    assert.equal((await f.cli(["rebuild-index"])).code, 1);
    await unlink(f.options.workspaceConfigPath);
    assert.equal((await f.cli(["rebuild-index", "--offline"])).code, 1);
    assert.deepEqual(f.indexRows(), before); f.assertRuntime();
    await writeFile(f.options.workspaceConfigPath, JSON.stringify({ schemaVersion: 1, workspaces: [] }));
    const missing = join(f.directory, "missing.sqlite");
    assert.equal((await f.cli(["rebuild-index", "--offline"], missing)).code, 1);
    await assert.rejects(readFile(missing), { code: "ENOENT" });
    const corrupt = join(f.directory, "corrupt.sqlite");
    await writeFile(corrupt, "not a sqlite database");
    assert.equal((await f.cli(["rebuild-index", "--offline"], corrupt)).code, 1);
    assert.equal(await readFile(corrupt, "utf8"), "not a sqlite database");
    f.db.exec("BEGIN EXCLUSIVE");
    assert.equal((await f.cli(["rebuild-index", "--offline"])).code, 1);
    f.db.exec("ROLLBACK");
    assert.deepEqual(f.indexRows(), before); f.assertRuntime();
  } finally { await f.close(); }
});
test("F07 real CLI rolls back its first DDL deletion if the subsequent Catalog deletion fails", async () => {
  const f = await fixture();
  try {
    f.db.exec("DROP TABLE asset_catalog; CREATE VIEW asset_catalog AS SELECT 'broken' AS asset_id");
    const schema = f.db.prepare("SELECT * FROM sqlite_master ORDER BY name").all();
    const rows = f.db.prepare("SELECT rowid FROM asset_fts WHERE asset_fts MATCH 'maintenancetoken'").all();
    const result = await f.cli(["rebuild-index", "--offline"]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /DROP VIEW/u);
    assert.deepEqual(f.db.prepare("SELECT * FROM sqlite_master ORDER BY name").all(), schema);
    assert.deepEqual(f.db.prepare("SELECT rowid FROM asset_fts WHERE asset_fts MATCH 'maintenancetoken'").all(), rows);
    f.assertRuntime();
  } finally { await f.close(); }
});
for (const command of ["complete", "cancel"] as const) {
  test(`U02 ${command} uses existing terminal rules and rejects terminal retries without changing Loadout/Usage/Binding`, async () => {
    const f = await fixture();
    try {
      const before = f.runtime();
      assert.equal((await f.cli([command, "--task-id", f.taskId])).code, 0);
      const after = f.runtime();
      assert.deepEqual(after.bindings, before.bindings); assert.deepEqual(after.usages, before.usages); assert.deepEqual(after.extra, before.extra);
      assert.deepEqual(after.tasks.map((row) => ({ ...row, status: "RUNNING", updated_at: before.tasks[0]?.updated_at })), before.tasks);
      assert.equal(after.tasks[0]?.status, command === "complete" ? "COMPLETED" : "CANCELLED");
      const repeated = await f.cli([command, "--task-id", f.taskId]);
      assert.equal(repeated.code, 1);
      assert.match(repeated.stderr, /INVALID_TASK_TRANSITION/);
      assert.deepEqual(f.runtime(), after);
      assert.equal((await f.cli([command === "complete" ? "cancel" : "complete", "--task-id", f.taskId])).code, 1);
      assert.equal((await f.cli([command, "--task-id", "tsk-invalid"])).code, 1);
      assert.deepEqual(f.runtime(), after);
    } finally { await f.close(); }
  });
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "memory-maintenance-"));
  const options = { repositoryPath: join(directory, "repo"), workspaceConfigPath: join(directory, "workspaces.json"), databasePath: join(directory, "db.sqlite") };
  await mkdir(join(options.repositoryPath, "assets/global/memories"), { recursive: true });
  await writeFile(options.workspaceConfigPath, JSON.stringify({ schemaVersion: 1, workspaces: [] }));
  await writeFile(join(options.repositoryPath, "assets/global/memories/a.md"), "---\nid: ast301\ntype: MEMORY\nscope: GLOBAL\ntitle: maintenancetoken\nsummary: maintenancetoken\n---\nmaintenancetoken\n");
  const index = await assets.AssetIndexManager.create(options); await index.synchronize(); await index.close();
  const repository = new tasks.TaskRepository(options.databasePath);
  const service = new tasks.TaskApplicationService(repository);
  const taskId = service.resolveTask({ sourceSessionId: "maintenance", sourceTurnId: "one", request: "maintenancetoken", workspace: null }).task.taskId;
  const usageRepository = new usages.UsageRepository(options.databasePath);
  const usage = new usages.UsageApplicationService(usageRepository);
  const projection = new loadouts.LoadoutAssetProjectionRepository(options.databasePath);
  const search = new assets.AssetSearchService({ ...options, refreshIndex: async () => undefined });
  await new loadouts.TaskLoadoutApplicationService({ assetProjection: projection, assetSearchService: search, taskRepository: repository, taskService: service, usageService: usage }).resolve(taskId);
  usage.recordRead(taskId, "ast301"); usage.markUsed(taskId, "ast301");
  repository.close(); usageRepository.close(); projection.close(); search.close();
  const db = new Database(options.databasePath);
  db.exec("CREATE TABLE other_runtime(id TEXT PRIMARY KEY, value TEXT); INSERT INTO other_runtime VALUES ('preserve', 'all data')");
  const runtime = () => ({ tasks: db.prepare<[], Record<string, unknown>>("SELECT * FROM task_loadout ORDER BY task_id").all(),
    bindings: db.prepare("SELECT * FROM task_turn_binding ORDER BY source_session_id,source_turn_id").all(),
    usages: db.prepare("SELECT * FROM task_asset_usage ORDER BY usage_id").all(), extra: db.prepare("SELECT * FROM other_runtime").all() });
  const baseline = runtime();
  const cli = (args: string[], databasePath = options.databasePath) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [...(dist ? [] : ["--import", "tsx"]), fileURLToPath(new URL(`maintenance-cli.${dist ? "js" : "ts"}`, root)), ...args], {
      env: { ...process.env, CODEX_MEMORY_OS_DATABASE_PATH: databasePath, CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH: options.repositoryPath, CODEX_MEMORY_OS_WORKSPACES_PATH: options.workspaceConfigPath }, stdio: ["ignore", "pipe", "pipe"], timeout: 10000,
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", (s) => stdout += s); child.stderr.on("data", (s) => stderr += s);
    child.on("error", reject); child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  return { directory, options, db, taskId, runtime, cli, assertRuntime: () => assert.deepEqual(runtime(), baseline),
    indexRows: () => ({ catalog: db.prepare("SELECT rowid,* FROM asset_catalog").all(), fts: db.prepare("SELECT rowid,* FROM asset_fts").all() }),
    close: async () => { if (db.inTransaction) db.exec("ROLLBACK"); db.close(); await rm(directory, { recursive: true, force: true }); } };
}
