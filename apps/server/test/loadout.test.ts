import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { AssetSearchItem } from "../src/asset/index.js";
import {
  DEFAULT_LOADOUT_POLICY,
  LOADOUT_REASON_VALUES,
  LoadoutAssetProjectionRepository,
  LoadoutNotMutableError,
  TaskLoadoutApplicationService,
  buildTaskLoadout,
  parseTaskLoadout,
  renderLoadoutAssetForHook,
  renderLoadoutForHook,
  taskLoadoutSchema,
  unicodeCharacterCount,
} from "../src/loadout/index.js";
import { TaskApplicationService, TaskRepository, type TaskRecord } from "../src/task/index.js";

test("N08 freezes 199/200/299/300 score boundaries, modes, reason codes, and stable order", () => {
  const task = taskRecord("stable query", "alpha");
  const items = [
    searchItem("ast199", "MEMORY", 199),
    searchItem("ast200", "MEMORY", 200),
    searchItem("ast299", "MEMORY", 299),
    searchItem("ast300", "MEMORY", 300),
    searchItem("ast301", "DOCUMENT", 300),
    searchItem("ast302", "SKILL", 300),
  ];
  const loadout = buildTaskLoadout(task, items);

  assert.deepEqual(loadout.assets.map(({ assetId, mode, reason }) => ({ assetId, mode, reason })), [
    { assetId: "ast200", mode: "ON_DEMAND", reason: "MEMORY_MATCH" },
    { assetId: "ast299", mode: "ON_DEMAND", reason: "MEMORY_MATCH" },
    { assetId: "ast300", mode: "DIRECT", reason: "MEMORY_STRONG_MATCH" },
    { assetId: "ast301", mode: "ON_DEMAND", reason: "DOCUMENT_ON_DEMAND" },
    { assetId: "ast302", mode: "ON_DEMAND", reason: "SKILL_ON_DEMAND" },
  ]);
  assert.equal(loadout.assets.every(({ reason }) => LOADOUT_REASON_VALUES.includes(reason)), true);
  assert.equal(taskLoadoutSchema.safeParse(loadout).success, true);
  assert.equal(loadout.limits.maxAssets, 8);
  assert.equal(loadout.limits.maxInjectedCharacters, 3000);
  const serialized = JSON.stringify(loadout);
  for (const forbidden of ["title", "summary", "markdown", "usageId", "recallCount", "readCount", "usedFlag"]) {
    assert.equal(serialized.includes(forbidden), false);
  }
  const moreThanEight = buildTaskLoadout(
    task,
    Array.from({ length: 12 }, (_, index) => searchItem(`ast7${index}`, "DOCUMENT", 300)),
  );
  assert.equal(moreThanEight.assets.length, 8);
});

test("N08 Renderer counts complete Unicode text, downgrades oversized DIRECT, and excludes oversized ON_DEMAND", () => {
  const task = taskRecord("budget query", "alpha");
  const directFits = searchItem("ast400", "MEMORY", 300, "知".repeat(2500), "完整标题");
  const directTooLarge = searchItem("ast401", "MEMORY", 300, "忆".repeat(2900), "降级标题");
  const onDemandTooLarge = searchItem("ast402", "DOCUMENT", 300, "ignored", "文".repeat(3000));
  const loadout = buildTaskLoadout(task, [directFits, directTooLarge, onDemandTooLarge]);

  assert.deepEqual(loadout.assets.map(({ assetId, mode, reason }) => ({ assetId, mode, reason })), [
    { assetId: "ast400", mode: "DIRECT", reason: "MEMORY_STRONG_MATCH" },
    { assetId: "ast401", mode: "ON_DEMAND", reason: "DIRECT_BUDGET_DOWNGRADED" },
  ]);
  const metadata = new Map([
    [directFits.assetId, { assetId: directFits.assetId, title: directFits.title, summary: directFits.summary }],
    [directTooLarge.assetId, { assetId: directTooLarge.assetId, title: directTooLarge.title, summary: directTooLarge.summary }],
  ]);
  const rendered = renderLoadoutForHook({
    assetMetadata: metadata,
    loadout,
    status: task.status,
    taskId: task.taskId,
    workspace: task.workspace,
  });
  assert.equal(unicodeCharacterCount(rendered) <= DEFAULT_LOADOUT_POLICY.maxInjectedCharacters, true);
  assert.equal(rendered.includes("知".repeat(2500)), true);
  assert.equal(rendered.includes("忆".repeat(2900)), false);
  for (const asset of loadout.assets) {
    assert.equal(
      asset.estimatedCharacters,
      unicodeCharacterCount(renderLoadoutAssetForHook(task.taskId, asset, metadata.get(asset.assetId))),
    );
  }
});

test("N08 resolve is explicit, trusts Task request/workspace, avoids Recall, and skips identical updates", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-n08-loadout-"));
  const databasePath = join(rootPath, "codex-memory.sqlite");
  const taskRepository = new TaskRepository(databasePath);
  const taskService = new TaskApplicationService(taskRepository, {
    now: () => "2026-09-04T12:00:00.000Z",
  });
  const task = taskService.resolveTask({
    sourceSessionId: "loadout-session",
    sourceTurnId: "loadout-turn",
    request: "stable initial request",
    workspace: "alpha",
  }).task;
  const assetProjection = new LoadoutAssetProjectionRepository(databasePath);
  const searches: unknown[] = [];
  let timestamp = 0;
  const loadoutService = new TaskLoadoutApplicationService({
    assetProjection,
    assetSearchService: {
      search: async (query) => {
        searches.push(query);
        return [searchItem("ast500", "MEMORY", 300)];
      },
    },
    taskRepository,
    taskService,
    usageService: { listByTask: () => [] },
  }, {
    now: () => `2026-09-04T12:00:0${timestamp++}.000Z`,
  });

  try {
    assert.deepEqual(parseTaskLoadout(task.loadoutJson).assets, []);
    const first = await loadoutService.resolve(task.taskId);
    assert.equal(first.changed, true);
    assert.equal(first.task.updatedAt, "2026-09-04T12:00:00.000Z");
    const second = await loadoutService.resolve(task.taskId);
    assert.equal(second.changed, false);
    assert.equal(second.task.updatedAt, first.task.updatedAt);
    assert.deepEqual(searches, [
      { context: { workspace: "alpha" }, query: "stable initial request", limit: 8 },
      { context: { workspace: "alpha" }, query: "stable initial request", limit: 8 },
    ]);

    taskService.updateStatus(task.taskId, "COMPLETED");
    await assert.rejects(() => loadoutService.resolve(task.taskId), LoadoutNotMutableError);
  } finally {
    assetProjection.close();
    taskRepository.close();
    await rm(rootPath, { force: true, recursive: true });
  }
});

test("N08 Task list distinguishes omitted/string/null Workspace, filters status, limits 1-100, and sorts stably", async () => {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-n08-list-"));
  const databasePath = join(rootPath, "codex-memory.sqlite");
  const taskRepository = new TaskRepository(databasePath);
  const timestamps = [
    "2026-09-04T12:00:00.000Z",
    "2026-09-04T12:00:01.000Z",
    "2026-09-04T12:00:02.000Z",
  ];
  const taskService = new TaskApplicationService(taskRepository, {
    now: () => timestamps.shift() ?? "2026-09-04T12:00:03.000Z",
  });
  const globalTask = taskService.resolveTask({
    sourceSessionId: "global",
    sourceTurnId: "turn",
    request: "global",
    workspace: null,
  }).task;
  const alphaTask = taskService.resolveTask({
    sourceSessionId: "alpha",
    sourceTurnId: "turn",
    request: "alpha",
    workspace: "alpha",
  }).task;
  const completedTask = taskService.resolveTask({
    sourceSessionId: "completed",
    sourceTurnId: "turn",
    request: "completed",
    workspace: "alpha",
  }).task;
  taskService.updateStatus(completedTask.taskId, "COMPLETED");
  const assetProjection = new LoadoutAssetProjectionRepository(databasePath);
  const service = new TaskLoadoutApplicationService({
    assetProjection,
    assetSearchService: { search: async () => [] },
    taskRepository,
    taskService,
    usageService: { listByTask: () => [] },
  });
  try {
    assert.deepEqual(service.list({}).map(({ taskId }) => taskId), [completedTask.taskId, alphaTask.taskId, globalTask.taskId]);
    for (let index = 0; index < 18; index += 1) {
      taskService.resolveTask({
        sourceSessionId: `extra-${index}`,
        sourceTurnId: "turn",
        request: `extra-${index}`,
        workspace: "extra",
      });
    }
    assert.equal(service.list({}).length, 20);
    assert.deepEqual(service.list({ workspace: "alpha" }).map(({ taskId }) => taskId), [completedTask.taskId, alphaTask.taskId]);
    assert.deepEqual(service.list({ workspace: null }).map(({ taskId }) => taskId), [globalTask.taskId]);
    assert.deepEqual(service.list({ status: "COMPLETED" }).map(({ taskId }) => taskId), [completedTask.taskId]);
    assert.equal(service.list({ limit: 1 }).length, 1);
    for (const limit of [0, -1, 1.5, 101, Number.MAX_SAFE_INTEGER + 1]) {
      assert.throws(() => service.list({ limit }));
    }
  } finally {
    assetProjection.close();
    taskRepository.close();
    await rm(rootPath, { force: true, recursive: true });
  }
});

test("N08 rejects unknown or forbidden Loadout JSON fields", () => {
  const invalid = {
    schemaVersion: 1,
    limits: { maxInjectedCharacters: 3000, maxAssets: 8 },
    assets: [{
      assetId: "ast600",
      mode: "DIRECT",
      reason: "MEMORY_STRONG_MATCH",
      estimatedCharacters: 10,
      usageId: "usg1",
    }],
  };
  assert.equal(taskLoadoutSchema.safeParse(invalid).success, false);
  assert.throws(() => parseTaskLoadout(JSON.stringify(invalid)));
});

function taskRecord(request: string, workspace: string | null): TaskRecord {
  return {
    taskId: "tsk100",
    workspace,
    request,
    status: "RUNNING",
    loadoutJson: "",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

function searchItem(
  assetId: string,
  type: "DOCUMENT" | "MEMORY" | "SKILL",
  score: number,
  summary = `${type} summary`,
  title = `${type} title`,
): AssetSearchItem {
  return {
    assetId,
    contentHash: "a".repeat(64),
    matchedSnippet: summary,
    scope: "GLOBAL",
    score,
    searchStrategy: "FTS",
    summary,
    title,
    type,
  };
}
