import Database from "better-sqlite3";

import { UsageSchemaError, UsageWriteError } from "./errors.js";
import type {
  AssetUsageSummary,
  UsageListInput,
  UsageListItem,
  UsageRecord,
} from "./model.js";

const CREATE_TASK_ASSET_USAGE_SQL = `
  CREATE TABLE task_asset_usage (
    usage_id      TEXT PRIMARY KEY,
    task_id       TEXT NOT NULL,
    asset_id      TEXT NOT NULL,

    recall_count  INTEGER NOT NULL DEFAULT 0,
    read_count    INTEGER NOT NULL DEFAULT 0,
    used_flag     INTEGER NOT NULL DEFAULT 0,

    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,

    UNIQUE(task_id, asset_id),

    FOREIGN KEY (task_id)
      REFERENCES task_loadout(task_id)
      ON DELETE CASCADE
  )
`;

interface TableInfoRow {
  dflt_value: string | null;
  name: string;
  notnull: number;
  pk: number;
  type: string;
}

interface ForeignKeyRow {
  from: string;
  on_delete: string;
  table: string;
  to: string;
}

interface IndexListRow {
  name: string;
  origin: string;
  unique: number;
}

interface IndexInfoRow {
  name: string;
  seqno: number;
}

interface UsageRow {
  assetId: string;
  createdAt: string;
  readCount: number;
  recallCount: number;
  taskId: string;
  updatedAt: string;
  usageId: string;
  usedFlag: number;
}

interface UsageListRow extends UsageRow {
  assetMissing: number;
  workspace: string | null;
}

export interface UsageUpsertInput {
  assetId: string;
  createdAt: string;
  taskId: string;
  updatedAt: string;
  usageId: string;
}

export class UsageRepository {
  readonly #database: Database.Database;

  constructor(databasePath: string) {
    this.#database = new Database(databasePath);
    try {
      this.#database.pragma("busy_timeout = 5000");
      this.#database.pragma("foreign_keys = ON");
      if (!this.foreignKeysEnabled()) {
        throw new UsageSchemaError("SQLite foreign_keys could not be enabled for the Usage connection");
      }
      this.#initializeSchema();
    } catch (error) {
      this.close();
      throw error;
    }
  }

  foreignKeysEnabled(): boolean {
    return Number(this.#database.pragma("foreign_keys", { simple: true })) === 1;
  }

  recordRecalls(inputs: readonly UsageUpsertInput[]): UsageRecord[] {
    if (inputs.length === 0) {
      return [];
    }
    try {
      const record = this.#database.transaction(() => inputs.map((input) => this.#incrementRecall(input)));
      return record.immediate();
    } catch (error) {
      throw new UsageWriteError("RECALL", { cause: error });
    }
  }

  recordRead(input: UsageUpsertInput): UsageRecord {
    try {
      const record = this.#database.transaction(() => this.#incrementRead(input));
      return record.immediate();
    } catch (error) {
      throw new UsageWriteError("READ", { cause: error });
    }
  }

  markUsed(input: UsageUpsertInput): UsageRecord {
    try {
      const mark = this.#database.transaction(() => {
        const updated = this.#database
          .prepare<UsageUpsertParameters, UsageRow>(`
            INSERT INTO task_asset_usage (
              usage_id, task_id, asset_id, recall_count, read_count, used_flag, created_at, updated_at
            ) VALUES (@usageId, @taskId, @assetId, 0, 0, 1, @createdAt, @updatedAt)
            ON CONFLICT(task_id, asset_id) DO UPDATE SET
              used_flag = 1,
              updated_at = excluded.updated_at
            WHERE task_asset_usage.used_flag = 0
            RETURNING
              usage_id AS usageId,
              task_id AS taskId,
              asset_id AS assetId,
              recall_count AS recallCount,
              read_count AS readCount,
              used_flag AS usedFlag,
              created_at AS createdAt,
              updated_at AS updatedAt
          `)
          .get(input);
        if (updated !== undefined) {
          return toUsageRecord(updated);
        }
        const existing = this.#find(input.taskId, input.assetId);
        if (existing === undefined) {
          throw new Error("Usage mark-used upsert did not return or retain a row");
        }
        return toUsageRecord(existing);
      });
      return mark.immediate();
    } catch (error) {
      throw new UsageWriteError("USED", { cause: error });
    }
  }

  listByTask(taskId: string): UsageRecord[] {
    const rows = this.#database
      .prepare<[string], UsageRow>(`
        SELECT
          usage_id AS usageId,
          task_id AS taskId,
          asset_id AS assetId,
          recall_count AS recallCount,
          read_count AS readCount,
          used_flag AS usedFlag,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM task_asset_usage
        WHERE task_id = ?
        ORDER BY asset_id ASC
      `)
      .all(taskId);
    return rows.map(toUsageRecord);
  }

  list(input: Required<Pick<UsageListInput, "limit">> & Omit<UsageListInput, "limit">): UsageListItem[] {
    const conditions: string[] = [];
    const parameters: Array<number | string | null> = [];
    if (input.taskId !== undefined) {
      conditions.push("usage.task_id = ?");
      parameters.push(input.taskId);
    }
    if (input.assetId !== undefined) {
      conditions.push("usage.asset_id = ?");
      parameters.push(input.assetId);
    }
    if (Object.prototype.hasOwnProperty.call(input, "workspace")) {
      conditions.push("task.workspace IS ?");
      parameters.push(input.workspace ?? null);
    }
    parameters.push(input.limit);
    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    const rows = this.#database
      .prepare<Array<number | string | null>, UsageListRow>(`
        SELECT
          usage.usage_id AS usageId,
          usage.task_id AS taskId,
          usage.asset_id AS assetId,
          task.workspace,
          usage.recall_count AS recallCount,
          usage.read_count AS readCount,
          usage.used_flag AS usedFlag,
          CASE WHEN catalog.asset_id IS NULL THEN 1 ELSE 0 END AS assetMissing,
          usage.created_at AS createdAt,
          usage.updated_at AS updatedAt
        FROM task_asset_usage AS usage
        JOIN task_loadout AS task ON task.task_id = usage.task_id
        LEFT JOIN asset_catalog AS catalog ON catalog.asset_id = usage.asset_id
        ${where}
        ORDER BY usage.updated_at DESC, usage.usage_id DESC
        LIMIT ?
      `)
      .all(...parameters);
    return rows.map(toUsageListItem);
  }

  summarizeByAsset(assetId: string): AssetUsageSummary {
    const row = this.#database
      .prepare<[string], AssetUsageSummary>(`
        SELECT
          count(DISTINCT task_id) AS taskCount,
          coalesce(sum(recall_count), 0) AS recallCount,
          coalesce(sum(read_count), 0) AS readCount,
          coalesce(sum(CASE WHEN used_flag = 1 THEN 1 ELSE 0 END), 0) AS usedTaskCount
        FROM task_asset_usage
        WHERE asset_id = ?
      `)
      .get(assetId);
    if (row === undefined) {
      throw new UsageSchemaError("Asset Usage summary query returned no row");
    }
    return row;
  }

  close(): void {
    if (this.#database.open) {
      this.#database.close();
    }
  }

  #initializeSchema(): void {
    const initialize = this.#database.transaction(() => {
      const table = this.#database
        .prepare<[], { name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'task_asset_usage'",
        )
        .get();
      if (table === undefined) {
        this.#database.exec(`${CREATE_TASK_ASSET_USAGE_SQL};`);
      }
      this.#assertTableDefinition();
      this.#assertUniqueConstraint();
      this.#assertForeignKey();
      const violations = this.#database.pragma("foreign_key_check(task_asset_usage)") as unknown[];
      if (violations.length !== 0) {
        throw new UsageSchemaError("task_asset_usage contains foreign-key violations");
      }
    });

    try {
      initialize.immediate();
    } catch (error) {
      if (error instanceof UsageSchemaError) {
        throw error;
      }
      throw new UsageSchemaError("task_asset_usage could not be initialized", { cause: error });
    }
  }

  #assertTableDefinition(): void {
    const actual = this.#database.pragma("table_info(task_asset_usage)") as TableInfoRow[];
    const expected: TableInfoRow[] = [
      { name: "usage_id", notnull: 0, pk: 1, type: "TEXT", dflt_value: null },
      { name: "task_id", notnull: 1, pk: 0, type: "TEXT", dflt_value: null },
      { name: "asset_id", notnull: 1, pk: 0, type: "TEXT", dflt_value: null },
      { name: "recall_count", notnull: 1, pk: 0, type: "INTEGER", dflt_value: "0" },
      { name: "read_count", notnull: 1, pk: 0, type: "INTEGER", dflt_value: "0" },
      { name: "used_flag", notnull: 1, pk: 0, type: "INTEGER", dflt_value: "0" },
      { name: "created_at", notnull: 1, pk: 0, type: "TEXT", dflt_value: null },
      { name: "updated_at", notnull: 1, pk: 0, type: "TEXT", dflt_value: null },
    ];
    if (!sameTableDefinition(actual, expected)) {
      throw new UsageSchemaError("task_asset_usage does not match the fixed N08 schema");
    }
  }

  #assertUniqueConstraint(): void {
    const indexes = this.#database.pragma("index_list(task_asset_usage)") as IndexListRow[];
    const hasTaskAssetUnique = indexes.some((index) => {
      if (index.unique !== 1 || index.origin !== "u") {
        return false;
      }
      const columns = this.#database.pragma(`index_info(${quotePragmaName(index.name)})`) as IndexInfoRow[];
      return columns.length === 2 && columns[0]?.name === "task_id" && columns[1]?.name === "asset_id";
    });
    if (!hasTaskAssetUnique) {
      throw new UsageSchemaError("task_asset_usage must have UNIQUE(task_id, asset_id)");
    }
  }

  #assertForeignKey(): void {
    const foreignKeys = this.#database.pragma("foreign_key_list(task_asset_usage)") as ForeignKeyRow[];
    if (
      foreignKeys.length !== 1 ||
      foreignKeys[0]?.table !== "task_loadout" ||
      foreignKeys[0]?.from !== "task_id" ||
      foreignKeys[0]?.to !== "task_id" ||
      foreignKeys[0]?.on_delete.toUpperCase() !== "CASCADE"
    ) {
      throw new UsageSchemaError("task_asset_usage must reference task_loadout(task_id) ON DELETE CASCADE");
    }
  }

  #incrementRecall(input: UsageUpsertInput): UsageRecord {
    return toUsageRecord(this.#increment("recall_count", input));
  }

  #incrementRead(input: UsageUpsertInput): UsageRecord {
    return toUsageRecord(this.#increment("read_count", input));
  }

  #increment(column: "recall_count" | "read_count", input: UsageUpsertInput): UsageRow {
    const row = this.#database
      .prepare<UsageUpsertParameters, UsageRow>(`
        INSERT INTO task_asset_usage (
          usage_id, task_id, asset_id, recall_count, read_count, used_flag, created_at, updated_at
        ) VALUES (
          @usageId,
          @taskId,
          @assetId,
          ${column === "recall_count" ? 1 : 0},
          ${column === "read_count" ? 1 : 0},
          0,
          @createdAt,
          @updatedAt
        )
        ON CONFLICT(task_id, asset_id) DO UPDATE SET
          ${column} = task_asset_usage.${column} + 1,
          updated_at = excluded.updated_at
        RETURNING
          usage_id AS usageId,
          task_id AS taskId,
          asset_id AS assetId,
          recall_count AS recallCount,
          read_count AS readCount,
          used_flag AS usedFlag,
          created_at AS createdAt,
          updated_at AS updatedAt
      `)
      .get(input);
    if (row === undefined) {
      throw new Error(`Usage ${column} upsert returned no row`);
    }
    return row;
  }

  #find(taskId: string, assetId: string): UsageRow | undefined {
    return this.#database
      .prepare<[string, string], UsageRow>(`
        SELECT
          usage_id AS usageId,
          task_id AS taskId,
          asset_id AS assetId,
          recall_count AS recallCount,
          read_count AS readCount,
          used_flag AS usedFlag,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM task_asset_usage
        WHERE task_id = ? AND asset_id = ?
      `)
      .get(taskId, assetId);
  }
}

type UsageUpsertParameters = {
  assetId: string;
  createdAt: string;
  taskId: string;
  updatedAt: string;
  usageId: string;
};

function toUsageRecord(row: UsageRow): UsageRecord {
  if (row.usedFlag !== 0 && row.usedFlag !== 1) {
    throw new UsageSchemaError(`Usage ${row.usageId} has invalid used_flag`);
  }
  if (row.recallCount < 0 || row.readCount < 0) {
    throw new UsageSchemaError(`Usage ${row.usageId} has negative counters`);
  }
  return { ...row, usedFlag: row.usedFlag === 1 };
}

function toUsageListItem(row: UsageListRow): UsageListItem {
  if (row.assetMissing !== 0 && row.assetMissing !== 1) {
    throw new UsageSchemaError(`Usage ${row.usageId} has invalid Asset state`);
  }
  return {
    ...toUsageRecord(row),
    assetMissing: row.assetMissing === 1,
    workspace: row.workspace,
  };
}

function sameTableDefinition(actual: readonly TableInfoRow[], expected: readonly TableInfoRow[]): boolean {
  return actual.length === expected.length && actual.every((column, index) => {
    const wanted = expected[index];
    return wanted !== undefined &&
      column.name === wanted.name &&
      column.type.toUpperCase() === wanted.type &&
      column.dflt_value === wanted.dflt_value &&
      column.notnull === wanted.notnull &&
      column.pk === wanted.pk;
  });
}

function quotePragmaName(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}
