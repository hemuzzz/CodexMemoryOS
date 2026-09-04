import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import type { IdGenerator, IdPrefix } from "@codex-memory-os/id-generator";
import Database from "better-sqlite3";

import { TaskApplicationService, TaskRepository } from "../src/task/index.js";
import {
  UsageApplicationService,
  UsageRepository,
  UsageSchemaError,
  UsageWriteError,
} from "../src/usage/index.js";

test("N08 creates the fixed Usage schema, foreign key, unique key, and JSON-safe usg identity", async () => {
  const fixture = await createFixture();
  try {
    const usageRepository = new UsageRepository(fixture.databasePath);
    const idGenerator = new SequenceIdGenerator();
    const usageService = new UsageApplicationService(usageRepository, {
      idGenerator,
      now: () => "2026-09-04T10:00:00.000Z",
    });
    try {
      assert.equal(usageRepository.foreignKeysEnabled(), true);
      const usage = usageService.recordRecalls(fixture.taskId, ["ast100"])[0];
      assert.notEqual(usage, undefined);
      assert.match(usage!.usageId, /^usg[0-9]+$/u);
      assert.doesNotThrow(() => JSON.stringify(usage));
      assert.deepEqual(usage, {
        usageId: "usg1",
        taskId: fixture.taskId,
        assetId: "ast100",
        recallCount: 1,
        readCount: 0,
        usedFlag: false,
        createdAt: "2026-09-04T10:00:00.000Z",
        updatedAt: "2026-09-04T10:00:00.000Z",
      });

      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        const columns = database.pragma("table_info(task_asset_usage)") as Array<{ name: string }>;
        assert.deepEqual(columns.map(({ name }) => name), [
          "usage_id",
          "task_id",
          "asset_id",
          "recall_count",
          "read_count",
          "used_flag",
          "created_at",
          "updated_at",
        ]);
        const foreignKeys = database.pragma("foreign_key_list(task_asset_usage)") as Array<{
          from: string;
          on_delete: string;
          table: string;
          to: string;
        }>;
        assert.equal(foreignKeys.length, 1);
        assert.deepEqual(
          foreignKeys.map(({ table, from, to, on_delete }) => ({ table, from, to, on_delete })),
          [{ table: "task_loadout", from: "task_id", to: "task_id", on_delete: "CASCADE" }],
        );
        assert.equal(foreignKeys.some(({ table }) => table === "asset_catalog"), false);
        const uniqueIndexes = database.pragma("index_list(task_asset_usage)") as Array<{
          name: string;
          origin: string;
          unique: number;
        }>;
        const unique = uniqueIndexes.find(({ origin, unique: isUnique }) => origin === "u" && isUnique === 1);
        assert.notEqual(unique, undefined);
        const uniqueColumns = database.pragma(`index_info('${unique!.name}')`) as Array<{ name: string }>;
        assert.deepEqual(uniqueColumns.map(({ name }) => name), ["task_id", "asset_id"]);
      } finally {
        database.close();
      }
    } finally {
      usageRepository.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("N08 Recall and Read count atomically while Used is idempotent and preserves timestamps", async () => {
  const fixture = await createFixture();
  try {
    const usageRepository = new UsageRepository(fixture.databasePath);
    const timestamps = [
      "2026-09-04T10:00:00.000Z",
      "2026-09-04T10:00:01.000Z",
      "2026-09-04T10:00:02.000Z",
      "2026-09-04T10:00:03.000Z",
      "2026-09-04T10:00:04.000Z",
    ];
    const usageService = new UsageApplicationService(usageRepository, {
      idGenerator: new SequenceIdGenerator(),
      now: () => timestamps.shift() ?? "2026-09-04T10:00:09.000Z",
    });
    try {
      usageService.recordRecalls(fixture.taskId, ["ast200"]);
      const recalled = usageService.recordRecalls(fixture.taskId, ["ast200"])[0]!;
      assert.equal(recalled.recallCount, 2);
      assert.equal(recalled.usedFlag, false);

      const read = usageService.recordRead(fixture.taskId, "ast200");
      assert.equal(read.readCount, 1);
      assert.equal(read.usedFlag, false);
      const firstUsed = usageService.markUsed(fixture.taskId, "ast200");
      assert.equal(firstUsed.usedFlag, true);
      const repeatedUsed = usageService.markUsed(fixture.taskId, "ast200");
      assert.equal(repeatedUsed.usedFlag, true);
      assert.equal(repeatedUsed.usageId, "usg1");
      assert.equal(repeatedUsed.createdAt, "2026-09-04T10:00:00.000Z");
      assert.equal(repeatedUsed.updatedAt, "2026-09-04T10:00:03.000Z");

      assert.throws(() => usageRepository.recordRecalls([
        {
          usageId: "usg900",
          taskId: fixture.taskId,
          assetId: "ast400",
          createdAt: "2026-09-04T10:00:05.000Z",
          updatedAt: "2026-09-04T10:00:05.000Z",
        },
        {
          usageId: "usg901",
          taskId: "tsk999999999",
          assetId: "ast401",
          createdAt: "2026-09-04T10:00:05.000Z",
          updatedAt: "2026-09-04T10:00:05.000Z",
        },
      ]), UsageWriteError);
      assert.equal(usageRepository.listByTask(fixture.taskId).some(({ assetId }) => assetId === "ast400"), false);
    } finally {
      usageRepository.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("N08 concurrent first Recall keeps one Usage row and loses no increments", async () => {
  const fixture = await createFixture();
  try {
    const initializer = new UsageRepository(fixture.databasePath);
    initializer.close();
    const moduleUrl = new URL("../src/usage/index.ts", import.meta.url).href;
    const writers = Array.from({ length: 8 }, (_, index) => runWriter(`
      import { UsageRepository } from ${JSON.stringify(moduleUrl)};
      const repository = new UsageRepository(${JSON.stringify(fixture.databasePath)});
      try {
        repository.recordRecalls([{
          usageId: ${JSON.stringify(`usg${1000 + index}`)},
          taskId: ${JSON.stringify(fixture.taskId)},
          assetId: "ast300",
          createdAt: "2026-09-04T11:00:00.000Z",
          updatedAt: "2026-09-04T11:00:00.000Z"
        }]);
      } finally {
        repository.close();
      }
    `));
    await Promise.all(writers);

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      const rows = database.prepare(`
        SELECT usage_id AS usageId, recall_count AS recallCount
        FROM task_asset_usage
        WHERE task_id = ? AND asset_id = 'ast300'
      `).all(fixture.taskId) as Array<{ recallCount: number; usageId: string }>;
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.recallCount, 8);
      assert.match(rows[0]?.usageId ?? "", /^usg100[0-7]$/u);
    } finally {
      database.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("N08 rejects an incompatible pre-existing Usage schema", async () => {
  const fixture = await createFixture();
  try {
    const database = new Database(fixture.databasePath);
    database.exec("CREATE TABLE task_asset_usage (usage_id TEXT PRIMARY KEY)");
    database.close();
    assert.throws(() => new UsageRepository(fixture.databasePath), UsageSchemaError);
  } finally {
    await fixture.cleanup();
  }
});

class SequenceIdGenerator implements IdGenerator {
  #next = 1;

  next(prefix: IdPrefix): string {
    return `${prefix}${this.#next++}`;
  }

  validate(id: string, expectedPrefix?: IdPrefix): boolean {
    return /^(ast|tsk|usg)[0-9]+$/u.test(id) && (expectedPrefix === undefined || id.startsWith(expectedPrefix));
  }
}

async function createFixture(): Promise<{
  cleanup: () => Promise<void>;
  databasePath: string;
  taskId: string;
}> {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-n08-usage-"));
  const databasePath = join(rootPath, "codex-memory.sqlite");
  const taskRepository = new TaskRepository(databasePath);
  const taskId = new TaskApplicationService(taskRepository).resolveTask({
    sourceSessionId: "usage-session",
    sourceTurnId: "usage-turn",
    request: "usage task",
    workspace: "alpha",
  }).task.taskId;
  taskRepository.close();
  return {
    databasePath,
    taskId,
    cleanup: async () => await rm(rootPath, { force: true, recursive: true }),
  };
}

async function runWriter(source: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", source], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Usage writer exited ${String(code)}: ${stderr}`));
      }
    });
  });
}
