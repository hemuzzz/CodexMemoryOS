import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";

const root = new URL(process.env.CODEX_MEMORY_OS_TEST_DIST === "1" ? "../dist/" : "../src/", import.meta.url);
const tasks: typeof import("../src/task/index.js") = await import(new URL("task/index.js", root).href);
const usage: typeof import("../src/usage/index.js") = await import(new URL("usage/index.js", root).href);

test("U03 actual independent Task/Usage writers sharing SQLite and a frozen millisecond keep distinct identities", async () => {
  const directory = await mkdtemp(join(tmpdir(), "memory-identity-"));
  const databasePath = join(directory, "runtime.sqlite");
  try {
    new tasks.TaskRepository(databasePath).close();
    new usage.UsageRepository(databasePath).close();
    const outputs = await Promise.all(Array.from({ length: 8 }, (_, index) => new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
        Date.now = () => 1900000000000;
        const { TaskRepository, TaskApplicationService } = await import(${JSON.stringify(new URL("task/index.js", root).href)});
        const { UsageRepository, UsageApplicationService } = await import(${JSON.stringify(new URL("usage/index.js", root).href)});
        const tasks = new TaskRepository(${JSON.stringify(databasePath)});
        const task = new TaskApplicationService(tasks).resolveTask({ sourceSessionId: 'process-${index}', sourceTurnId: 'turn', request: 'isolated', workspace: null }).task;
        const usages = new UsageRepository(${JSON.stringify(databasePath)});
        new UsageApplicationService(usages).recordRead(task.taskId, 'ast301');
        console.log(task.taskId);
        usages.close(); tasks.close();
      `], { stdio: ["ignore", "pipe", "pipe"], timeout: 15000 });
      let stdout = ""; let stderr = "";
      child.stdout.on("data", chunk => stdout += chunk); child.stderr.on("data", chunk => stderr += chunk);
      child.on("error", reject); child.on("close", code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)));
    })));
    assert.equal(new Set(outputs).size, 8);
    const db = new Database(databasePath);
    try {
      const taskRows = db.prepare("SELECT * FROM task_loadout").all();
      const usageRows = db.prepare<[], { usage_id: string; read_count: number }>("SELECT * FROM task_asset_usage").all();
      assert.equal(taskRows.length, 8); assert.equal(usageRows.length, 8);
      assert.equal(new Set(usageRows.map(row => row.usage_id)).size, 8);
      assert.ok(usageRows.every(row => row.read_count === 1));
      assert.equal(db.prepare("SELECT * FROM task_turn_binding").all().length, 8);
      console.log(`U03_REAL_WRITERS ${JSON.stringify({ moduleRoot: root.href, tasks: taskRows.length, usages: usageRows.length })}`);
    } finally { db.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
