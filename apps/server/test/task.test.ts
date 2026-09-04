import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import Database from "better-sqlite3";

import { AssetCatalog } from "../src/asset/index.js";
import {
  EMPTY_TASK_LOADOUT_JSON,
  TaskApplicationService,
  TaskRepository,
  resolveTrustedWorkspace,
} from "../src/task/index.js";

const idGenerator = new SnowflakeIdGenerator();

test("N06 creates the fixed Task/Binding schema, enables foreign keys, and uses tsk IDs with the empty Loadout", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    assert.equal(repository.foreignKeysEnabled(), true);
    const service = new TaskApplicationService(repository);
    const resolution = service.resolveTask({
      sourceSessionId: "session-schema",
      sourceTurnId: "turn-schema",
      request: "initial request",
      workspace: "alpha",
    });

    assert.equal(resolution.kind, "CREATED");
    assert.match(resolution.task.taskId, /^tsk[0-9]+$/);
    assert.equal(idGenerator.validate(resolution.task.taskId, "tsk"), true);
    assert.equal(resolution.task.loadoutJson, EMPTY_TASK_LOADOUT_JSON);
    assert.deepEqual(JSON.parse(resolution.task.loadoutJson), {
      schemaVersion: 1,
      limits: { maxInjectedCharacters: 3000, maxAssets: 8 },
      assets: [],
    });

    const database = new Database(fixture.databasePath);
    try {
      assert.deepEqual(columnNames(database, "task_loadout"), [
        "task_id",
        "workspace",
        "request",
        "status",
        "loadout_json",
        "created_at",
        "updated_at",
      ]);
      assert.deepEqual(columnNames(database, "task_turn_binding"), [
        "task_id",
        "source_session_id",
        "source_turn_id",
        "bound_at",
      ]);
      assert.deepEqual(
        (database.pragma("index_info(idx_task_turn_binding_task_id)") as Array<{ name: string }>).map(
          ({ name }) => name,
        ),
        ["task_id"],
      );
      const foreignKeys = database.pragma("foreign_key_list(task_turn_binding)") as Array<{
        from: string;
        on_delete: string;
        table: string;
        to: string;
      }>;
      assert.deepEqual(
        foreignKeys.map(({ table, from, to, on_delete }) => ({ table, from, to, on_delete })),
        [{ table: "task_loadout", from: "task_id", to: "task_id", on_delete: "CASCADE" }],
      );

      database.pragma("foreign_keys = ON");
      database.prepare("DELETE FROM task_loadout WHERE task_id = ?").run(resolution.task.taskId);
      assert.equal(count(database, "task_turn_binding"), 0);
    } finally {
      database.close();
    }
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test("N06 resolves a new Task, makes the same Turn idempotent, reuses the Session Task, and isolates Workspace", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    const service = new TaskApplicationService(repository);
    const first = service.resolveTask({
      sourceSessionId: "session-a",
      sourceTurnId: "turn-1",
      request: "first request",
      workspace: "alpha",
    });
    const retry = service.resolveTask({
      sourceSessionId: "session-a",
      sourceTurnId: "turn-1",
      request: "retry text must not replace the initial request",
      workspace: "alpha",
    });
    const nextTurn = service.resolveTask({
      sourceSessionId: "session-a",
      sourceTurnId: "turn-2",
      request: "next turn",
      workspace: "alpha",
    });
    const otherWorkspace = service.resolveTask({
      sourceSessionId: "session-a",
      sourceTurnId: "turn-3",
      request: "other workspace",
      workspace: "beta",
    });

    assert.equal(first.kind, "CREATED");
    assert.equal(retry.kind, "EXISTING_BINDING");
    assert.equal(retry.task.taskId, first.task.taskId);
    assert.equal(retry.task.request, "first request");
    assert.equal(nextTurn.kind, "SESSION_REUSE");
    assert.equal(nextTurn.task.taskId, first.task.taskId);
    assert.equal(otherWorkspace.kind, "CREATED");
    assert.notEqual(otherWorkspace.task.taskId, first.task.taskId);

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      assert.equal(count(database, "task_loadout"), 2);
      assert.equal(count(database, "task_turn_binding"), 3);
    } finally {
      database.close();
    }
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test("N06 treats NULL Workspace as an exact reusable boundary", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    const service = new TaskApplicationService(repository);
    const first = service.resolveTask({
      sourceSessionId: "session-null",
      sourceTurnId: "turn-1",
      request: "global only",
      workspace: null,
    });
    const next = service.resolveTask({
      sourceSessionId: "session-null",
      sourceTurnId: "turn-2",
      request: "still global only",
      workspace: null,
    });
    const named = service.resolveTask({
      sourceSessionId: "session-null",
      sourceTurnId: "turn-3",
      request: "named workspace",
      workspace: "alpha",
    });

    assert.equal(next.task.taskId, first.task.taskId);
    assert.equal(next.task.workspace, null);
    assert.notEqual(named.task.taskId, first.task.taskId);
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test("N06 explicitly attaches a RUNNING Task across Sessions and rejects invalid attach targets", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    const service = new TaskApplicationService(repository);
    const running = service.resolveTask({
      sourceSessionId: "source-session",
      sourceTurnId: "source-turn",
      request: "create running",
      workspace: "alpha",
    }).task;
    const attached = service.resolveTask({
      sourceSessionId: "new-session",
      sourceTurnId: "new-turn",
      request: `continue taskId: ${running.taskId}`,
      workspace: "alpha",
      explicitTaskId: running.taskId,
    });
    assert.equal(attached.kind, "EXPLICIT_ATTACH");
    assert.equal(attached.task.taskId, running.taskId);

    assertTaskError(
      () =>
        service.resolveTask({
          sourceSessionId: "missing-session",
          sourceTurnId: "missing-turn",
          request: "missing",
          workspace: "alpha",
          explicitTaskId: idGenerator.next("tsk"),
        }),
      "TASK_NOT_FOUND",
    );
    assertTaskError(
      () =>
        service.resolveTask({
          sourceSessionId: "mismatch-session",
          sourceTurnId: "mismatch-turn",
          request: "mismatch",
          workspace: "beta",
          explicitTaskId: running.taskId,
        }),
      "TASK_WORKSPACE_MISMATCH",
    );
    assertTaskError(
      () =>
        service.resolveTask({
          sourceSessionId: "null-mismatch-session",
          sourceTurnId: "null-mismatch-turn",
          request: "null mismatch",
          workspace: null,
          explicitTaskId: running.taskId,
        }),
      "TASK_WORKSPACE_MISMATCH",
    );

    const completed = service.resolveTask({
      sourceSessionId: "completed-source",
      sourceTurnId: "completed-source-turn",
      request: "complete me",
      workspace: "alpha",
    }).task;
    service.updateStatus(completed.taskId, "COMPLETED");
    assertTaskError(
      () =>
        service.resolveTask({
          sourceSessionId: "completed-target",
          sourceTurnId: "completed-target-turn",
          request: "cannot attach completed",
          workspace: "alpha",
          explicitTaskId: completed.taskId,
        }),
      "TASK_NOT_RUNNING",
    );

    const cancelled = service.resolveTask({
      sourceSessionId: "cancelled-source",
      sourceTurnId: "cancelled-source-turn",
      request: "cancel me",
      workspace: "alpha",
    }).task;
    service.updateStatus(cancelled.taskId, "CANCELLED");
    assertTaskError(
      () =>
        service.resolveTask({
          sourceSessionId: "cancelled-target",
          sourceTurnId: "cancelled-target-turn",
          request: "cannot attach cancelled",
          workspace: "alpha",
          explicitTaskId: cancelled.taskId,
        }),
      "TASK_NOT_RUNNING",
    );
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test("N06 never rebinds one Session/Turn to a second Task", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    const service = new TaskApplicationService(repository);
    const firstTask = service.resolveTask({
      sourceSessionId: "source-a",
      sourceTurnId: "turn-a",
      request: "first",
      workspace: "alpha",
    }).task;
    const secondTask = service.resolveTask({
      sourceSessionId: "source-b",
      sourceTurnId: "turn-b",
      request: "second",
      workspace: "alpha",
    }).task;
    const firstBinding = service.resolveTask({
      sourceSessionId: "shared-session",
      sourceTurnId: "shared-turn",
      request: "attach first",
      workspace: "alpha",
      explicitTaskId: firstTask.taskId,
    });
    const conflictingRetry = service.resolveTask({
      sourceSessionId: "shared-session",
      sourceTurnId: "shared-turn",
      request: "attempt second",
      workspace: "alpha",
      explicitTaskId: secondTask.taskId,
    });

    assert.equal(firstBinding.task.taskId, firstTask.taskId);
    assert.equal(conflictingRetry.kind, "EXISTING_BINDING");
    assert.equal(conflictingRetry.task.taskId, firstTask.taskId);

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      assert.equal(
        Number(
          (
            database
              .prepare(
                "SELECT count(*) AS count FROM task_turn_binding WHERE source_session_id = ? AND source_turn_id = ?",
              )
              .get("shared-session", "shared-turn") as { count: number }
          ).count,
        ),
        1,
      );
    } finally {
      database.close();
    }
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test("N06 rolls back Task creation when binding fails", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    const database = new Database(fixture.databasePath);
    try {
      database.exec(`
        CREATE TRIGGER reject_task_binding
        BEFORE INSERT ON task_turn_binding
        BEGIN
          SELECT RAISE(ABORT, 'injected binding failure');
        END;
      `);
    } finally {
      database.close();
    }

    const service = new TaskApplicationService(repository);
    assert.throws(
      () =>
        service.resolveTask({
          sourceSessionId: "rollback-session",
          sourceTurnId: "rollback-turn",
          request: "must roll back",
          workspace: "alpha",
        }),
      /injected binding failure/,
    );

    const check = new Database(fixture.databasePath, { readonly: true });
    try {
      assert.equal(count(check, "task_loadout"), 0);
      assert.equal(count(check, "task_turn_binding"), 0);
    } finally {
      check.close();
    }
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test("N06 supports only explicit RUNNING to COMPLETED/CANCELLED transitions", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    const service = new TaskApplicationService(repository);
    const completedTask = service.resolveTask({
      sourceSessionId: "status-session-a",
      sourceTurnId: "status-turn-a",
      request: "complete",
      workspace: "alpha",
    }).task;
    const cancelledTask = service.resolveTask({
      sourceSessionId: "status-session-b",
      sourceTurnId: "status-turn-b",
      request: "cancel",
      workspace: "alpha",
    }).task;

    assert.equal(service.updateStatus(completedTask.taskId, "COMPLETED").status, "COMPLETED");
    assert.equal(service.updateStatus(cancelledTask.taskId, "CANCELLED").status, "CANCELLED");
    assertTaskError(() => service.updateStatus(completedTask.taskId, "CANCELLED"), "INVALID_TASK_TRANSITION");
    assertTaskError(() => service.updateStatus(cancelledTask.taskId, "COMPLETED"), "INVALID_TASK_TRANSITION");
    assertTaskError(
      () => service.updateStatus(idGenerator.next("tsk"), "COMPLETED"),
      "TASK_NOT_FOUND",
    );
    assertTaskError(
      () => service.updateStatus(completedTask.taskId, "RUNNING" as never),
      "TASK_INPUT_INVALID",
    );
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test("N06 fails closed instead of guessing when a Session has multiple same-Workspace RUNNING Tasks", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    const service = new TaskApplicationService(repository);
    const first = service.resolveTask({
      sourceSessionId: "owner-a",
      sourceTurnId: "owner-a-turn",
      request: "first candidate",
      workspace: "alpha",
    }).task;
    const second = service.resolveTask({
      sourceSessionId: "owner-b",
      sourceTurnId: "owner-b-turn",
      request: "second candidate",
      workspace: "alpha",
    }).task;
    service.resolveTask({
      sourceSessionId: "ambiguous-session",
      sourceTurnId: "turn-1",
      request: "attach first",
      workspace: "alpha",
      explicitTaskId: first.taskId,
    });
    service.resolveTask({
      sourceSessionId: "ambiguous-session",
      sourceTurnId: "turn-2",
      request: "attach second",
      workspace: "alpha",
      explicitTaskId: second.taskId,
    });

    assertTaskError(
      () =>
        service.resolveTask({
          sourceSessionId: "ambiguous-session",
          sourceTurnId: "turn-3",
          request: "do not guess",
          workspace: "alpha",
        }),
      "AMBIGUOUS_RUNNING_TASK",
    );
    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      assert.equal(
        Number(
          (
            database
              .prepare("SELECT count(*) AS count FROM task_turn_binding WHERE source_session_id = ?")
              .get("ambiguous-session") as { count: number }
          ).count,
        ),
        2,
      );
    } finally {
      database.close();
    }
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

test("N06 resolves Workspace by the longest path with segment boundaries and NULL fallback", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(
      fixture.workspaceConfigPath,
      JSON.stringify({
        schemaVersion: 1,
        workspaces: [
          { name: "parent", paths: ["/foo/bar"] },
          { name: "nested", paths: ["/foo/bar/project"] },
        ],
      }),
      "utf8",
    );

    assert.equal(await resolveTrustedWorkspace("/foo/bar/project/src", fixture.workspaceConfigPath), "nested");
    assert.equal(await resolveTrustedWorkspace("/foo/bar/other", fixture.workspaceConfigPath), "parent");
    assert.equal(await resolveTrustedWorkspace("/foo/barista", fixture.workspaceConfigPath), null);
    assert.equal(await resolveTrustedWorkspace("/unmatched", fixture.workspaceConfigPath), null);

    await writeFile(fixture.workspaceConfigPath, "{not-json", "utf8");
    await assert.rejects(
      () => resolveTrustedWorkspace("/foo/bar", fixture.workspaceConfigPath),
      (error: unknown) => errorCode(error) === "WORKSPACE_CONFIG_INVALID",
    );
    await assert.rejects(
      () => resolveTrustedWorkspace("relative/path", fixture.workspaceConfigPath),
      (error: unknown) => errorCode(error) === "WORKSPACE_CWD_INVALID",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("N06 fails closed on equally specific Workspace matches", async () => {
  const fixture = await createFixture();
  try {
    await writeFile(
      fixture.workspaceConfigPath,
      JSON.stringify({
        schemaVersion: 1,
        workspaces: [
          { name: "alpha", paths: ["/same/root"] },
          { name: "beta", paths: ["/same/root"] },
        ],
      }),
      "utf8",
    );
    await assert.rejects(
      () => resolveTrustedWorkspace("/same/root/src", fixture.workspaceConfigPath),
      (error: unknown) => errorCode(error) === "WORKSPACE_MATCH_AMBIGUOUS",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("N04 Catalog/FTS rebuild preserves N06 Task tables", async () => {
  const fixture = await createFixture();
  const repository = new TaskRepository(fixture.databasePath);
  try {
    const service = new TaskApplicationService(repository);
    const task = service.resolveTask({
      sourceSessionId: "rebuild-session",
      sourceTurnId: "rebuild-turn",
      request: "survive rebuild",
      workspace: "alpha",
    }).task;

    const catalog = new AssetCatalog(fixture.databasePath);
    try {
      catalog.rebuild([], "2026-09-04T00:00:00.000Z");
    } finally {
      catalog.close();
    }

    assert.equal(repository.getTask(task.taskId)?.request, "survive rebuild");
    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      assert.equal(count(database, "task_loadout"), 1);
      assert.equal(count(database, "task_turn_binding"), 1);
      assert.equal(count(database, "asset_catalog"), 0);
      assert.equal(count(database, "asset_fts"), 0);
    } finally {
      database.close();
    }
  } finally {
    repository.close();
    await fixture.cleanup();
  }
});

interface Fixture {
  cleanup: () => Promise<void>;
  databasePath: string;
  rootPath: string;
  workspaceConfigPath: string;
}

async function createFixture(): Promise<Fixture> {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-n06-task-"));
  const workspaceConfigPath = join(rootPath, "workspaces.json");
  await writeFile(
    workspaceConfigPath,
    JSON.stringify({
      schemaVersion: 1,
      workspaces: [
        { name: "alpha", paths: [join(rootPath, "alpha")] },
        { name: "beta", paths: [join(rootPath, "beta")] },
      ],
    }),
    "utf8",
  );
  return {
    rootPath,
    workspaceConfigPath,
    databasePath: join(rootPath, "codex-memory.sqlite"),
    cleanup: () => rm(rootPath, { force: true, recursive: true }),
  };
}

function columnNames(database: Database.Database, table: string): string[] {
  return (database.pragma(`table_info(${table})`) as Array<{ name: string }>).map(({ name }) => name);
}

function count(database: Database.Database, table: string): number {
  return Number((database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
}

function assertTaskError(operation: () => unknown, expectedCode: string): void {
  assert.throws(operation, (error: unknown) => errorCode(error) === expectedCode);
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error ? String(error.code) : undefined;
}
