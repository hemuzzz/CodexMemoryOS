import Database from "better-sqlite3";

import {
  AmbiguousRunningTaskError,
  InvalidTaskTransitionError,
  TaskNotFoundError,
  TaskNotRunningError,
  TaskSchemaError,
  TaskWorkspaceMismatchError,
} from "./errors.js";
import type { TaskRecord, TaskResolution, TaskStatus, TerminalTaskStatus } from "./model.js";

const CREATE_TASK_LOADOUT_SQL = `
  CREATE TABLE task_loadout (
    task_id       TEXT PRIMARY KEY,
    workspace     TEXT,
    request       TEXT NOT NULL,
    status        TEXT NOT NULL,
    loadout_json  TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
  )
`;

const CREATE_TASK_TURN_BINDING_SQL = `
  CREATE TABLE task_turn_binding (
    task_id           TEXT NOT NULL,
    source_session_id TEXT NOT NULL,
    source_turn_id    TEXT NOT NULL,
    bound_at           TEXT NOT NULL,

    PRIMARY KEY (source_session_id, source_turn_id),

    FOREIGN KEY (task_id)
      REFERENCES task_loadout(task_id)
      ON DELETE CASCADE
  )
`;

const CREATE_TASK_BINDING_INDEX_SQL = `
  CREATE INDEX idx_task_turn_binding_task_id
    ON task_turn_binding(task_id)
`;

interface SchemaObjectRow {
  name: string;
  type: string;
}

interface TableInfoRow {
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

interface IndexInfoRow {
  name: string;
  seqno: number;
}

interface TaskRow {
  createdAt: string;
  loadoutJson: string;
  request: string;
  status: string;
  taskId: string;
  updatedAt: string;
  workspace: string | null;
}

interface NewTaskRecord {
  createdAt: string;
  loadoutJson: string;
  request: string;
  status: "RUNNING";
  taskId: string;
  updatedAt: string;
  workspace: string | null;
}

export interface ResolveAndBindInput {
  boundAt: string;
  createTask: () => NewTaskRecord;
  explicitTaskId?: string;
  sourceSessionId: string;
  sourceTurnId: string;
  workspace: string | null;
}

export interface TaskListInput {
  limit: number;
  status?: TaskStatus;
  workspace?: string | null;
}

export interface TaskLoadoutUpdate {
  changed: boolean;
  task: TaskRecord;
}

export class TaskRepository {
  readonly #database: Database.Database;

  constructor(databasePath: string, options: { busyTimeoutMs?: number } = {}) {
    const busyTimeoutMs = options.busyTimeoutMs ?? 5000;
    if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 0) throw new TaskSchemaError("Invalid SQLite busy timeout");
    this.#database = new Database(databasePath, { timeout: busyTimeoutMs });

    try {
      this.#database.pragma(`busy_timeout = ${busyTimeoutMs}`);
      this.#database.pragma("foreign_keys = ON");
      if (!this.foreignKeysEnabled()) {
        throw new TaskSchemaError("SQLite foreign_keys could not be enabled for the Task connection");
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

  getTask(taskId: string): TaskRecord | null {
    const row = this.#findTask(taskId);
    return row === undefined ? null : toTaskRecord(row);
  }

  summarizeByWorkspace(): Array<{ workspace: string | null; status: TaskStatus; count: number }> {
    return this.#database.prepare<[], { workspace: string | null; status: TaskStatus; count: number }>(`
      SELECT workspace, status, count(*) AS count
      FROM task_loadout GROUP BY workspace, status
    `).all();
  }

  listTasks(input: TaskListInput): TaskRecord[] {
    const conditions: string[] = [];
    const parameters: Array<number | string | null> = [];
    if (Object.prototype.hasOwnProperty.call(input, "workspace")) {
      conditions.push("workspace IS ?");
      parameters.push(input.workspace ?? null);
    }
    if (input.status !== undefined) {
      conditions.push("status = ?");
      parameters.push(input.status);
    }
    parameters.push(input.limit);
    const where = conditions.length === 0 ? "" : `WHERE ${conditions.join(" AND ")}`;
    return this.#database
      .prepare<Array<number | string | null>, TaskRow>(`
        SELECT
          task_id AS taskId,
          workspace,
          request,
          status,
          loadout_json AS loadoutJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM task_loadout
        ${where}
        ORDER BY updated_at DESC, task_id DESC
        LIMIT ?
      `)
      .all(...parameters)
      .map(toTaskRecord);
  }

  listTasksReferencingAsset(assetId: string): TaskRecord[] {
    return this.#database
      .prepare<[string], TaskRow>(`
        SELECT
          task_id AS taskId,
          workspace,
          request,
          status,
          loadout_json AS loadoutJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM task_loadout
        WHERE instr(loadout_json, ?) > 0
        ORDER BY updated_at DESC, task_id DESC
      `)
      .all(assetId)
      .map(toTaskRecord);
  }

  replaceLoadout(taskId: string, loadoutJson: string, updatedAt: string): TaskLoadoutUpdate {
    const replace = this.#database.transaction((): TaskLoadoutUpdate => {
      const task = this.#findTask(taskId);
      if (task === undefined) {
        throw new TaskNotFoundError(taskId);
      }
      assertRunning(task);
      if (task.loadoutJson === loadoutJson) {
        return { changed: false, task: toTaskRecord(task) };
      }

      const result = this.#database
        .prepare<[string, string, string]>(`
          UPDATE task_loadout
          SET loadout_json = ?, updated_at = ?
          WHERE task_id = ? AND status = 'RUNNING'
        `)
        .run(loadoutJson, updatedAt, taskId);
      if (result.changes !== 1) {
        throw new TaskNotRunningError(taskId, task.status);
      }
      const updated = this.#findTask(taskId);
      if (updated === undefined) {
        throw new TaskNotFoundError(taskId);
      }
      return { changed: true, task: toTaskRecord(updated) };
    });
    return replace.immediate();
  }

  resolveAndBind(input: ResolveAndBindInput): TaskResolution {
    const resolveAndBind = this.#database.transaction((): TaskResolution => {
      const existingBinding = this.#findBoundTask(input.sourceSessionId, input.sourceTurnId);
      if (existingBinding !== undefined) {
        return { kind: "EXISTING_BINDING", task: toTaskRecord(existingBinding) };
      }

      if (input.explicitTaskId !== undefined) {
        const explicitTask = this.#findTask(input.explicitTaskId);
        if (explicitTask === undefined) {
          throw new TaskNotFoundError(input.explicitTaskId);
        }
        assertRunning(explicitTask);
        if (explicitTask.workspace !== input.workspace) {
          throw new TaskWorkspaceMismatchError(
            explicitTask.taskId,
            explicitTask.workspace,
            input.workspace,
          );
        }

        this.#insertBinding(explicitTask.taskId, input.sourceSessionId, input.sourceTurnId, input.boundAt);
        return { kind: "EXPLICIT_ATTACH", task: toTaskRecord(explicitTask) };
      }

      const sessionTasks = this.#findRunningSessionTasks(input.sourceSessionId, input.workspace);
      if (sessionTasks.length > 1) {
        throw new AmbiguousRunningTaskError(
          input.sourceSessionId,
          input.workspace,
          sessionTasks.map(({ taskId }) => taskId),
        );
      }
      const sessionTask = sessionTasks[0];
      if (sessionTask !== undefined) {
        this.#insertBinding(sessionTask.taskId, input.sourceSessionId, input.sourceTurnId, input.boundAt);
        return { kind: "SESSION_REUSE", task: toTaskRecord(sessionTask) };
      }

      const task = input.createTask();
      this.#insertTask(task);
      this.#insertBinding(task.taskId, input.sourceSessionId, input.sourceTurnId, input.boundAt);
      return { kind: "CREATED", task };
    });

    return resolveAndBind.immediate();
  }

  updateStatus(taskId: string, status: TerminalTaskStatus, updatedAt: string): TaskRecord {
    const updateStatus = this.#database.transaction(() => {
      const task = this.#findTask(taskId);
      if (task === undefined) {
        throw new TaskNotFoundError(taskId);
      }
      if (task.status !== "RUNNING") {
        throw new InvalidTaskTransitionError(taskId, task.status, status);
      }

      const result = this.#database
        .prepare<[TerminalTaskStatus, string, string]>(
          "UPDATE task_loadout SET status = ?, updated_at = ? WHERE task_id = ? AND status = 'RUNNING'",
        )
        .run(status, updatedAt, taskId);
      if (result.changes !== 1) {
        throw new InvalidTaskTransitionError(taskId, task.status, status);
      }

      const updated = this.#findTask(taskId);
      if (updated === undefined) {
        throw new TaskNotFoundError(taskId);
      }
      return toTaskRecord(updated);
    });

    return updateStatus.immediate();
  }

  close(): void {
    if (this.#database.open) {
      this.#database.close();
    }
  }

  #initializeSchema(): void {
    const initialize = this.#database.transaction(() => {
      const taskTables = this.#database
        .prepare<[], SchemaObjectRow>(
          "SELECT type, name FROM sqlite_master WHERE type = 'table' AND name IN ('task_loadout', 'task_turn_binding') ORDER BY name",
        )
        .all();

      if (taskTables.length === 0) {
        this.#database.exec(`${CREATE_TASK_LOADOUT_SQL};${CREATE_TASK_TURN_BINDING_SQL};`);
      } else if (taskTables.length !== 2) {
        throw new TaskSchemaError("task_loadout and task_turn_binding must either both exist or both be absent");
      }

      this.#assertTableDefinitions();

      const index = this.#database
        .prepare<[], SchemaObjectRow>(
          "SELECT type, name FROM sqlite_master WHERE name = 'idx_task_turn_binding_task_id'",
        )
        .get();
      if (index === undefined) {
        this.#database.exec(`${CREATE_TASK_BINDING_INDEX_SQL};`);
      } else if (index.type !== "index") {
        throw new TaskSchemaError("idx_task_turn_binding_task_id exists but is not an index");
      }

      this.#assertBindingIndex();

      const foreignKeyViolations = this.#database.pragma("foreign_key_check") as unknown[];
      if (foreignKeyViolations.length !== 0) {
        throw new TaskSchemaError("task_loadout contains foreign-key violations");
      }
    });

    initialize.immediate();
  }

  #assertTableDefinitions(): void {
    const taskColumns = this.#database.pragma("table_info(task_loadout)") as TableInfoRow[];
    const expectedTaskColumns: TableInfoRow[] = [
      { name: "task_id", notnull: 0, pk: 1, type: "TEXT" },
      { name: "workspace", notnull: 0, pk: 0, type: "TEXT" },
      { name: "request", notnull: 1, pk: 0, type: "TEXT" },
      { name: "status", notnull: 1, pk: 0, type: "TEXT" },
      { name: "loadout_json", notnull: 1, pk: 0, type: "TEXT" },
      { name: "created_at", notnull: 1, pk: 0, type: "TEXT" },
      { name: "updated_at", notnull: 1, pk: 0, type: "TEXT" },
    ];
    if (!sameTableDefinition(taskColumns, expectedTaskColumns)) {
      throw new TaskSchemaError("task_loadout does not match the fixed N06 schema");
    }

    const bindingColumns = this.#database.pragma("table_info(task_turn_binding)") as TableInfoRow[];
    const expectedBindingColumns: TableInfoRow[] = [
      { name: "task_id", notnull: 1, pk: 0, type: "TEXT" },
      { name: "source_session_id", notnull: 1, pk: 1, type: "TEXT" },
      { name: "source_turn_id", notnull: 1, pk: 2, type: "TEXT" },
      { name: "bound_at", notnull: 1, pk: 0, type: "TEXT" },
    ];
    if (!sameTableDefinition(bindingColumns, expectedBindingColumns)) {
      throw new TaskSchemaError("task_turn_binding does not match the fixed N06 schema");
    }

    const foreignKeys = this.#database.pragma("foreign_key_list(task_turn_binding)") as ForeignKeyRow[];
    if (
      foreignKeys.length !== 1 ||
      foreignKeys[0]?.table !== "task_loadout" ||
      foreignKeys[0]?.from !== "task_id" ||
      foreignKeys[0]?.to !== "task_id" ||
      foreignKeys[0]?.on_delete.toUpperCase() !== "CASCADE"
    ) {
      throw new TaskSchemaError("task_turn_binding does not have the fixed task_id ON DELETE CASCADE foreign key");
    }
  }

  #assertBindingIndex(): void {
    const columns = this.#database.pragma("index_info(idx_task_turn_binding_task_id)") as IndexInfoRow[];
    if (columns.length !== 1 || columns[0]?.seqno !== 0 || columns[0]?.name !== "task_id") {
      throw new TaskSchemaError("idx_task_turn_binding_task_id must index only task_id");
    }
  }

  #findBoundTask(sourceSessionId: string, sourceTurnId: string): TaskRow | undefined {
    return this.#database
      .prepare<[string, string], TaskRow>(`
        SELECT
          task.task_id AS taskId,
          task.workspace,
          task.request,
          task.status,
          task.loadout_json AS loadoutJson,
          task.created_at AS createdAt,
          task.updated_at AS updatedAt
        FROM task_turn_binding AS binding
        JOIN task_loadout AS task ON task.task_id = binding.task_id
        WHERE binding.source_session_id = ? AND binding.source_turn_id = ?
      `)
      .get(sourceSessionId, sourceTurnId);
  }

  #findTask(taskId: string): TaskRow | undefined {
    return this.#database
      .prepare<[string], TaskRow>(`
        SELECT
          task_id AS taskId,
          workspace,
          request,
          status,
          loadout_json AS loadoutJson,
          created_at AS createdAt,
          updated_at AS updatedAt
        FROM task_loadout
        WHERE task_id = ?
      `)
      .get(taskId);
  }

  #findRunningSessionTasks(sourceSessionId: string, workspace: string | null): TaskRow[] {
    return this.#database
      .prepare<[string, string | null], TaskRow>(`
        SELECT DISTINCT
          task.task_id AS taskId,
          task.workspace,
          task.request,
          task.status,
          task.loadout_json AS loadoutJson,
          task.created_at AS createdAt,
          task.updated_at AS updatedAt
        FROM task_turn_binding AS binding
        JOIN task_loadout AS task ON task.task_id = binding.task_id
        WHERE binding.source_session_id = ?
          AND task.status = 'RUNNING'
          AND task.workspace IS ?
        ORDER BY task.task_id
      `)
      .all(sourceSessionId, workspace);
  }

  #insertTask(task: NewTaskRecord): void {
    this.#database
      .prepare<[string, string | null, string, TaskStatus, string, string, string]>(`
        INSERT INTO task_loadout (
          task_id,
          workspace,
          request,
          status,
          loadout_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        task.taskId,
        task.workspace,
        task.request,
        task.status,
        task.loadoutJson,
        task.createdAt,
        task.updatedAt,
      );
  }

  #insertBinding(taskId: string, sourceSessionId: string, sourceTurnId: string, boundAt: string): void {
    this.#database
      .prepare<[string, string, string, string]>(`
        INSERT INTO task_turn_binding (task_id, source_session_id, source_turn_id, bound_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(taskId, sourceSessionId, sourceTurnId, boundAt);
  }
}

function assertRunning(task: TaskRow): void {
  if (task.status !== "RUNNING") {
    throw new TaskNotRunningError(task.taskId, task.status);
  }
}

function toTaskRecord(row: TaskRow): TaskRecord {
  if (row.status !== "RUNNING" && row.status !== "COMPLETED" && row.status !== "CANCELLED") {
    throw new TaskSchemaError(`Task ${row.taskId} has unsupported status ${JSON.stringify(row.status)}`);
  }

  return {
    taskId: row.taskId,
    workspace: row.workspace,
    request: row.request,
    status: row.status,
    loadoutJson: row.loadoutJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sameTableDefinition(actual: readonly TableInfoRow[], expected: readonly TableInfoRow[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((column, index) => {
      const expectedColumn = expected[index];
      return (
        expectedColumn !== undefined &&
        column.name === expectedColumn.name &&
        column.type.toUpperCase() === expectedColumn.type &&
        column.notnull === expectedColumn.notnull &&
        column.pk === expectedColumn.pk
      );
    })
  );
}
