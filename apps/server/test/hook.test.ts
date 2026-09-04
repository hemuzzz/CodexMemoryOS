import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

import Database from "better-sqlite3";

import {
  HOOK_DATABASE_PATH_ENV,
  HOOK_WORKSPACE_CONFIG_PATH_ENV,
  createUserPromptSubmitHookConfiguration,
} from "../src/hook/user-prompt-submit.js";
import { LOG_PATH_ENV } from "../src/logging.js";

const hookSourcePath = fileURLToPath(new URL("../src/hook/user-prompt-submit.ts", import.meta.url));

test("N06 Hook configuration targets only UserPromptSubmit and matches the current command-hook shape", async () => {
  const fixture = await createFixture();
  try {
    const configuration = createUserPromptSubmitHookConfiguration(
      "node /opt/codex-memory-os/apps/server/dist/hook/user-prompt-submit.js",
    );
    const configurationPath = join(fixture.rootPath, "hooks.json");
    await writeFile(configurationPath, JSON.stringify(configuration), "utf8");
    const parsed = JSON.parse(await readText(configurationPath)) as typeof configuration;

    assert.deepEqual(Object.keys(parsed.hooks), ["UserPromptSubmit"]);
    assert.deepEqual(parsed.hooks.UserPromptSubmit[0]?.hooks[0], {
      type: "command",
      command: "node /opt/codex-memory-os/apps/server/dist/hook/user-prompt-submit.js",
      timeout: 10,
      additionalContextLimit: 3000,
    });
  } finally {
    await fixture.cleanup();
  }
});

test("N06 UserPromptSubmit Hook emits only trusted Task context and persists no conversation history", async () => {
  const fixture = await createFixture();
  try {
    const prompt = "implement the taskId: string field and N06 hook";
    const result = await runHook(
      {
        session_id: "hook-session",
        turn_id: "hook-turn",
        cwd: fixture.workspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt,
        transcript_path: "/tmp/private-transcript.jsonl",
        messages: [{ role: "user", content: "must-not-persist" }],
        conversation_history: "must-not-persist",
      },
      fixture,
    );

    assert.equal(result.code, 0);
    assert.equal(result.stderr, "");
    const context = parseHookContext(result.stdout);
    assert.match(context.taskId, /^tsk[0-9]+$/);
    assert.equal(context.workspace, "alpha");
    assert.equal(context.status, "RUNNING");
    assert.match(context.text, /loadoutLimits: maxInjectedCharacters=3000, maxAssets=8/);
    assert.match(context.text, /loadoutAssets:\n- none/);
    assert.equal(result.stdout.includes(prompt), false);
    assert.equal(result.stdout.includes("must-not-persist"), false);
    assert.equal(result.stdout.includes("private-transcript"), false);

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      const task = database
        .prepare("SELECT request, loadout_json AS loadoutJson FROM task_loadout")
        .get() as { loadoutJson: string; request: string };
      assert.equal(task.request, prompt);
      assert.deepEqual(JSON.parse(task.loadoutJson), {
        schemaVersion: 1,
        limits: { maxInjectedCharacters: 3000, maxAssets: 8 },
        assets: [],
      });
      const serializedRows = JSON.stringify({
        tasks: database.prepare("SELECT * FROM task_loadout").all(),
        bindings: database.prepare("SELECT * FROM task_turn_binding").all(),
      });
      assert.equal(serializedRows.includes("must-not-persist"), false);
      assert.equal(serializedRows.includes("private-transcript"), false);
    } finally {
      database.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("N08 Hook reads an existing Loadout without automatically resolving or refreshing it", async () => {
  const fixture = await createFixture();
  try {
    const created = await runHook(
      {
        session_id: "loadout-session",
        turn_id: "turn-1",
        cwd: fixture.workspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt: "historical knowledge task",
      },
      fixture,
    );
    const taskId = parseHookContext(created.stdout).taskId;
    const assetId = "ast123456789";
    const loadout = {
      schemaVersion: 1,
      limits: { maxInjectedCharacters: 3000, maxAssets: 8 },
      assets: [{
        assetId,
        mode: "DIRECT",
        reason: "MEMORY_STRONG_MATCH",
        estimatedCharacters: 100,
      }],
    };
    const database = new Database(fixture.databasePath);
    try {
      database.exec("CREATE TABLE asset_catalog (asset_id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL)");
      database.prepare("INSERT INTO asset_catalog (asset_id, title, summary) VALUES (?, ?, ?)")
        .run(assetId, "Historical rule", "Reuse the confirmed historical boundary");
      database.prepare("UPDATE task_loadout SET loadout_json = ?, updated_at = ? WHERE task_id = ?")
        .run(JSON.stringify(loadout), "2026-09-04T10:00:00.000Z", taskId);
    } finally {
      database.close();
    }

    const reused = await runHook(
      {
        session_id: "loadout-session",
        turn_id: "turn-2",
        cwd: fixture.workspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt: "continue without resolving",
      },
      fixture,
    );
    const context = parseHookContext(reused.stdout);
    assert.match(context.text, new RegExp(`DIRECT ${assetId}`));
    assert.match(context.text, /summary: "Reuse the confirmed historical boundary"/);

    const verify = new Database(fixture.databasePath, { readonly: true });
    try {
      const row = verify.prepare("SELECT loadout_json AS loadoutJson, updated_at AS updatedAt FROM task_loadout WHERE task_id = ?")
        .get(taskId) as { loadoutJson: string; updatedAt: string };
      assert.deepEqual(JSON.parse(row.loadoutJson), loadout);
      assert.equal(row.updatedAt, "2026-09-04T10:00:00.000Z");
      assert.equal(verify.prepare("SELECT 1 FROM sqlite_master WHERE name = 'task_asset_usage'").get(), undefined);
    } finally {
      verify.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("N06 Hook retry is idempotent end to end, including concurrent command processes", async () => {
  const fixture = await createFixture();
  try {
    const input = {
      session_id: "retry-session",
      turn_id: "retry-turn",
      cwd: fixture.workspacePath,
      hook_event_name: "UserPromptSubmit",
      prompt: "same Hook event",
    };
    const results = await Promise.all(Array.from({ length: 6 }, () => runHook(input, fixture)));
    assert.deepEqual(results.map(({ code }) => code), [0, 0, 0, 0, 0, 0]);
    assert.deepEqual(new Set(results.map(({ stdout }) => parseHookContext(stdout).taskId)).size, 1);

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      assert.equal(count(database, "task_loadout"), 1);
      assert.equal(count(database, "task_turn_binding"), 1);
    } finally {
      database.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("N06 Hook supports explicit cross-Session taskId attach and exact Workspace checks", async () => {
  const fixture = await createFixture();
  try {
    const created = await runHook(
      {
        session_id: "original-session",
        turn_id: "original-turn",
        cwd: fixture.workspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt: "create the logical task",
      },
      fixture,
    );
    const taskId = parseHookContext(created.stdout).taskId;
    const attached = await runHook(
      {
        session_id: "continued-session",
        turn_id: "continued-turn",
        cwd: fixture.workspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt: `Continue the work [taskId: ${taskId}]`,
      },
      fixture,
    );
    assert.equal(attached.code, 0);
    assert.equal(parseHookContext(attached.stdout).taskId, taskId);

    const mismatched = await runHook(
      {
        session_id: "wrong-workspace-session",
        turn_id: "wrong-workspace-turn",
        cwd: fixture.otherWorkspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt: `taskId=${taskId}`,
      },
      fixture,
    );
    assert.equal(mismatched.code, 2);
    assert.match(mismatched.stderr, /^\[TASK_WORKSPACE_MISMATCH\]/);
    assert.equal(mismatched.stdout, "");

    const invalid = await runHook(
      {
        session_id: "invalid-task-session",
        turn_id: "invalid-task-turn",
        cwd: fixture.workspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt: "taskId: tsk-invalid",
      },
      fixture,
    );
    assert.equal(invalid.code, 2);
    assert.match(invalid.stderr, /^\[HOOK_TASK_ID_INVALID\]/);

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      assert.equal(count(database, "task_loadout"), 1);
      assert.equal(count(database, "task_turn_binding"), 2);
    } finally {
      database.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

test("N06 Hook returns exit 2 with clear diagnostics for malformed input and invalid Workspace config", async () => {
  const fixture = await createFixture();
  try {
    const malformed = await runHookSource("{not-json", fixture);
    assert.equal(malformed.code, 2);
    assert.match(malformed.stderr, /^\[HOOK_INPUT_INVALID\]/);
    assert.equal(malformed.stdout, "");

    await writeFile(fixture.workspaceConfigPath, JSON.stringify({ schemaVersion: 2, workspaces: [] }), "utf8");
    const invalidConfig = await runHook(
      {
        session_id: "invalid-config-session",
        turn_id: "invalid-config-turn",
        cwd: fixture.workspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt: "must fail closed",
      },
      fixture,
    );
    assert.equal(invalidConfig.code, 2);
    assert.match(invalidConfig.stderr, /^\[WORKSPACE_CONFIG_INVALID\]/);
    assert.equal(invalidConfig.stdout, "");
    await assert.rejects(() => readText(fixture.databasePath));
  } finally {
    await fixture.cleanup();
  }
});

test("N06 Hook maps unmatched cwd to workspace NULL", async () => {
  const fixture = await createFixture();
  try {
    const result = await runHook(
      {
        session_id: "global-session",
        turn_id: "global-turn",
        cwd: fixture.unmatchedPath,
        hook_event_name: "UserPromptSubmit",
        prompt: "global-only task",
      },
      fixture,
    );
    assert.equal(result.code, 0);
    assert.equal(parseHookContext(result.stdout).workspace, null);
  } finally {
    await fixture.cleanup();
  }
});

test("N06 Stop, Interrupt, and SessionEnd inputs neither emit context nor mutate Task status", async () => {
  const fixture = await createFixture();
  try {
    const created = await runHook(
      {
        session_id: "lifecycle-session",
        turn_id: "lifecycle-turn",
        cwd: fixture.workspacePath,
        hook_event_name: "UserPromptSubmit",
        prompt: "keep running",
      },
      fixture,
    );
    const taskId = parseHookContext(created.stdout).taskId;

    for (const hookEventName of ["Stop", "Interrupt", "SessionEnd"]) {
      const result = await runHook(
        {
          session_id: "lifecycle-session",
          turn_id: "lifecycle-turn",
          cwd: fixture.workspacePath,
          hook_event_name: hookEventName,
        },
        fixture,
      );
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, "");
    }

    const database = new Database(fixture.databasePath, { readonly: true });
    try {
      const task = database.prepare("SELECT status FROM task_loadout WHERE task_id = ?").get(taskId) as {
        status: string;
      };
      assert.equal(task.status, "RUNNING");
      assert.equal(count(database, "task_turn_binding"), 1);
    } finally {
      database.close();
    }
  } finally {
    await fixture.cleanup();
  }
});

interface Fixture {
  cleanup: () => Promise<void>;
  databasePath: string;
  otherWorkspacePath: string;
  rootPath: string;
  unmatchedPath: string;
  workspaceConfigPath: string;
  workspacePath: string;
}

interface HookProcessResult {
  code: number | null;
  stderr: string;
  stdout: string;
}

interface HookContext {
  status: string;
  taskId: string;
  text: string;
  workspace: string | null;
}

async function createFixture(): Promise<Fixture> {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-n06-hook-"));
  const workspacePath = join(rootPath, "alpha");
  const otherWorkspacePath = join(rootPath, "beta");
  const unmatchedPath = join(rootPath, "outside");
  const workspaceConfigPath = join(rootPath, "workspaces.json");
  await writeFile(
    workspaceConfigPath,
    JSON.stringify({
      schemaVersion: 1,
      workspaces: [
        { name: "alpha", paths: [workspacePath] },
        { name: "beta", paths: [otherWorkspacePath] },
      ],
    }),
    "utf8",
  );
  return {
    rootPath,
    workspacePath,
    otherWorkspacePath,
    unmatchedPath,
    workspaceConfigPath,
    databasePath: join(rootPath, "data", "codex-memory.sqlite"),
    cleanup: () => rm(rootPath, { force: true, recursive: true }),
  };
}

async function runHook(input: unknown, fixture: Fixture): Promise<HookProcessResult> {
  return runHookSource(JSON.stringify(input), fixture);
}

async function runHookSource(source: string, fixture: Fixture): Promise<HookProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", hookSourcePath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        [HOOK_DATABASE_PATH_ENV]: fixture.databasePath,
        [HOOK_WORKSPACE_CONFIG_PATH_ENV]: fixture.workspaceConfigPath,
        [LOG_PATH_ENV]: join(fixture.rootPath, "logs", "codex-memory-os.log"),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(source);
  });
}

function parseHookContext(stdout: string): HookContext {
  const output = JSON.parse(stdout) as {
    hookSpecificOutput: { additionalContext: string; hookEventName: string };
  };
  assert.equal(output.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  const text = output.hookSpecificOutput.additionalContext;
  const taskId = /^taskId: (.+)$/mu.exec(text)?.[1];
  const workspaceText = /^workspace: (.+)$/mu.exec(text)?.[1];
  const status = /^status: (.+)$/mu.exec(text)?.[1];
  assert.notEqual(taskId, undefined);
  assert.notEqual(workspaceText, undefined);
  assert.notEqual(status, undefined);
  return {
    taskId: taskId as string,
    workspace: JSON.parse(workspaceText as string) as string | null,
    status: status as string,
    text,
  };
}

function count(database: Database.Database, table: string): number {
  return Number((database.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: number }).count);
}

async function readText(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}
