import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { AssetCatalog, scanAssetRepository } from "./asset/index.js";
import { TaskApplicationService, TaskError, TaskRepository } from "./task/index.js";

export async function runMaintenanceCli(
  args: readonly string[] = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
  stdout: NodeJS.WritableStream = process.stdout,
  stderr: NodeJS.WritableStream = process.stderr,
): Promise<number> {
  try {
    const command = args[0];
    const databasePath = absoluteEnvironment(environment, "CODEX_MEMORY_OS_DATABASE_PATH");
    if (command === "rebuild-index") {
      if (args.length !== 2 || args[1] !== "--offline") throw new Error("Use rebuild-index --offline only after stopping the service and all same-database Hooks/writers");
      const repositoryPath = absoluteEnvironment(environment, "CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH");
      const workspaceConfigPath = absoluteEnvironment(environment, "CODEX_MEMORY_OS_WORKSPACES_PATH");
      // No Catalog construction or schema writes before the complete Snapshot gate.
      const snapshot = await scanAssetRepository({ repositoryPath, workspaceConfigPath });
      if (!snapshot.isComplete) throw new Error("Complete Asset Snapshot unavailable; database was not changed");
      const catalog = new AssetCatalog(databasePath, { maintenance: true });
      try {
        const result = catalog.rebuild(snapshot.assets, new Date().toISOString());
        stdout.write(`${JSON.stringify({ ok: true, result, diagnostics: snapshot.diagnostics })}\n`);
      } finally { catalog.close(); }
    } else if (command === "complete" || command === "cancel") {
      if (args.length !== 3 || args[1] !== "--task-id" || !args[2]) throw new Error("Use complete|cancel --task-id <existing task ID>");
      // Terminal operations must never initialize a missing runtime database.
      const existing = new Database(databasePath, { readonly: true, fileMustExist: true });
      try { existing.prepare("SELECT task_id FROM task_loadout LIMIT 1").get(); } finally { existing.close(); }
      const repository = new TaskRepository(databasePath);
      try {
        const task = new TaskApplicationService(repository).updateStatus(args[2], command === "complete" ? "COMPLETED" : "CANCELLED");
        stdout.write(`${JSON.stringify({ ok: true, task })}\n`);
      } finally { repository.close(); }
    } else { throw new Error("Expected rebuild-index, complete, or cancel"); }
    return 0;
  } catch (error) {
    stderr.write(`${JSON.stringify({ ok: false, error: { code: error instanceof TaskError ? error.code : "MAINTENANCE_FAILED", message: error instanceof Error ? error.message : String(error) } })}\n`);
    return 1;
  }
}

function absoluteEnvironment(environment: NodeJS.ProcessEnv, key: string): string {
  const value = environment[key];
  if (value === undefined || !isAbsolute(value)) throw new Error(`${key} must be an absolute path`);
  return value;
}
const entry = process.argv[1];
if (entry !== undefined && pathToFileURL(entry).href === import.meta.url) process.exitCode = await runMaintenanceCli();
