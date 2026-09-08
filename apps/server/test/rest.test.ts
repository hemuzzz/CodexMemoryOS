import assert from "node:assert/strict";
import { mkdir, mkdtemp, rename, rm, symlink, unlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";

import { createApp } from "../src/app.js";
import {
  AssetIndexManager,
  AssetSearchService,
  InboxApplicationService,
  type AssetIndexStatus,
  type AssetType,
} from "../src/asset/index.js";
import {
  OverviewApplicationService,
  HubAssetApplicationService,
  SystemStatusApplicationService,
} from "../src/http/index.js";
import {
  LoadoutAssetProjectionRepository,
  TaskLoadoutApplicationService,
  type TaskLoadout,
} from "../src/loadout/index.js";
import { TaskApplicationService, TaskRepository, type TaskStatus } from "../src/task/index.js";
import { UsageApplicationService, UsageRepository } from "../src/usage/index.js";

const AUTHORITY = "127.0.0.1:3210";

interface RestFixture {
  alphaAssetId: string;
  alphaAssetPath: string;
  app: ReturnType<typeof createApp>;
  betaAssetId: string;
  betaAssetPath: string;
  close: () => Promise<void>;
  createTask: (workspace: string | null, request: string, assetId?: string, status?: TaskStatus) => string;
  databasePath: string;
  globalAssetId: string;
  globalAssetPath: string;
  idGenerator: SnowflakeIdGenerator;
  indexManager: AssetIndexManager;
  repositoryPath: string;
  setIndexStatus: (status: AssetIndexStatus | null) => void;
  taskRepository: TaskRepository;
  usageService: UsageApplicationService;
  workspaceConfigPath: string;
}

test("N09 Asset Library enforces full-library Workspace filters, strict parameters, and stable sorting", async () => {
  const fixture = await createFixture();
  try {
    const all = await getJson(fixture, "/api/assets");
    assert.equal(all.status, 200);
    assert.equal(all.body.ok, true);
    assert.deepEqual(
      dataItems(all.body).map((item) => item.assetId),
      [fixture.globalAssetId, fixture.betaAssetId, fixture.alphaAssetId],
    );

    assert.deepEqual(
      dataItems((await getJson(fixture, "/api/assets?workspace=null")).body).map((item) => item.assetId),
      [fixture.globalAssetId],
    );
    assert.deepEqual(
      dataItems((await getJson(fixture, "/api/assets?workspace=alpha")).body).map((item) => item.assetId),
      [fixture.globalAssetId, fixture.alphaAssetId],
    );
    assert.deepEqual(
      dataItems((await getJson(fixture, "/api/assets?workspace=alpha&scope=WORKSPACE")).body).map((item) => item.assetId),
      [fixture.alphaAssetId],
    );
    assert.deepEqual(
      new Set(dataItems((await getJson(fixture, "/api/assets?scope=WORKSPACE")).body).map((item) => item.assetId)),
      new Set([fixture.alphaAssetId, fixture.betaAssetId]),
    );

    const specificSearch = dataItems(
      (await getJson(fixture, "/api/assets?query=shared%20knowledge&workspace=alpha")).body,
    );
    assert.equal(specificSearch[0]?.assetId, fixture.alphaAssetId);
    assert.equal(specificSearch[0]?.searchStrategy, "FTS");
    assert.equal(typeof specificSearch[0]?.score, "number");

    const fullSearch = dataItems((await getJson(fixture, "/api/assets?query=shared%20knowledge")).body);
    assert.equal(fullSearch[0]?.assetId, fixture.globalAssetId);

    for (const path of [
      "/api/assets?workspace=null&scope=WORKSPACE",
      "/api/assets?workspace=alpha&scope=GLOBAL",
    ]) {
      const response = await getJson(fixture, path);
      assert.equal(response.status, 400);
      assert.equal(errorCode(response.body), "INVALID_FILTER_COMBINATION");
    }
    for (const path of [
      "/api/assets?unknown=x",
      "/api/assets?limit=1&limit=2",
      "/api/assets?query=",
      "/api/assets?limit=0",
      "/api/assets?limit=101",
      "/api/assets?type=memory",
    ]) {
      assert.equal((await getJson(fixture, path)).status, 400, path);
    }
    assert.equal(dataItems((await getJson(fixture, "/api/assets?limit=1")).body).length, 1);

    const bulkPath = join(fixture.repositoryPath, "assets/global/documents");
    await mkdir(bulkPath, { recursive: true });
    for (let index = 0; index < 101; index += 1) {
      await writeAsset(join(bulkPath, `bulk-${index}.md`), {
        id: fixture.idGenerator.next("ast"),
        type: "DOCUMENT",
        scope: "GLOBAL",
        title: `Bulk ${index}`,
        summary: "default and maximum limit",
        body: "bulk",
      });
    }
    await fixture.indexManager.synchronize();
    assert.equal(dataItems((await getJson(fixture, "/api/assets")).body).length, 20);
    assert.equal(dataItems((await getJson(fixture, "/api/assets?limit=100")).body).length, 100);
  } finally {
    await fixture.close();
  }
});

test("N09 Asset Detail returns current Markdown, aggregates Usage, limits recent Loadouts, and fails stale closed", async () => {
  const fixture = await createFixture();
  try {
    for (let index = 0; index < 12; index += 1) {
      const taskId = fixture.createTask("alpha", `Request ${index}\nwith details`, fixture.alphaAssetId);
      fixture.usageService.recordRecalls(taskId, [fixture.alphaAssetId]);
      if (index % 2 === 0) {
        fixture.usageService.recordRead(taskId, fixture.alphaAssetId);
      }
      if (index % 3 === 0) {
        fixture.usageService.markUsed(taskId, fixture.alphaAssetId);
      }
    }

    const response = await getJson(fixture, `/api/assets/${fixture.alphaAssetId}`);
    assert.equal(response.status, 200);
    const asset = dataObject(response.body).asset as Record<string, unknown>;
    assert.equal(asset.assetId, fixture.alphaAssetId);
    assert.equal(Object.hasOwn(asset, "currentEligibility"), false);
    assert.match(String(asset.rawMarkdown), /shared knowledge/u);
    assert.match(String(asset.renderedMarkdown), /<p>/u);
    assert.equal(String(asset.relativePath).startsWith("assets/"), true);
    assert.deepEqual(asset.usageSummary, {
      taskCount: 12,
      recallCount: 12,
      readCount: 6,
      usedTaskCount: 4,
    });
    const recent = asset.recentLoadouts as Array<Record<string, unknown>>;
    assert.equal(recent.length, 10);
    assert.deepEqual(
      recent.map(({ updatedAt }) => updatedAt),
      [...recent.map(({ updatedAt }) => String(updatedAt))].sort().reverse(),
    );
    assert.equal(Object.hasOwn(recent[0] ?? {}, "loadout"), false);

    assert.equal((await getJson(fixture, "/api/assets/not-an-id")).status, 400);
    assert.equal((await getJson(fixture, `/api/assets/${fixture.idGenerator.next("ast")}`)).status, 404);

    await writeAsset(fixture.alphaAssetPath, {
      id: fixture.alphaAssetId,
      type: "MEMORY",
      scope: "WORKSPACE",
      workspace: "alpha",
      title: "Alpha changed",
      summary: "Changed projection",
      body: "changed body",
    });
    const stale = await getJson(fixture, `/api/assets/${fixture.alphaAssetId}`);
    assert.equal(stale.status, 409);
    assert.equal(errorCode(stale.body), "ASSET_STALE");
    assert.equal((await getJson(fixture, `/api/assets/${fixture.alphaAssetId}`)).status, 200);

    const movedPath = join(fixture.repositoryPath, "assets/workspaces/alpha/memories/moved.md");
    await rename(fixture.alphaAssetPath, movedPath);
    assert.equal((await getJson(fixture, `/api/assets/${fixture.alphaAssetId}`)).status, 409);
    assert.equal((await getJson(fixture, `/api/assets/${fixture.alphaAssetId}`)).status, 200);

    await writeFile(movedPath, "---\nid: invalid\n---\ninvalid", "utf8");
    assert.equal((await getJson(fixture, `/api/assets/${fixture.alphaAssetId}`)).status, 409);
    assert.equal((await getJson(fixture, `/api/assets/${fixture.alphaAssetId}`)).status, 404);

    await unlink(fixture.betaAssetPath);
    assert.equal((await getJson(fixture, `/api/assets/${fixture.betaAssetId}`)).status, 409);
    assert.equal((await getJson(fixture, `/api/assets/${fixture.betaAssetId}`)).status, 404);
  } finally {
    await fixture.close();
  }
});

test("N09 Inbox scans live candidates, treats a missing directory as empty, and isolates ID conflicts", async () => {
  const fixture = await createFixture();
  try {
    const empty = await getJson(fixture, "/api/inbox");
    assert.equal(empty.status, 200);
    assert.deepEqual(dataObject(empty.body), { items: [], diagnostics: [] });

    const inboxPath = join(fixture.repositoryPath, "inbox/global/memories");
    await mkdir(inboxPath, { recursive: true });
    const validId = fixture.idGenerator.next("ast");
    const duplicateId = fixture.idGenerator.next("ast");
    await writeAsset(join(inboxPath, "valid.md"), {
      id: validId,
      type: "MEMORY",
      scope: "GLOBAL",
      title: "Inbox valid",
      summary: "Valid candidate",
      body: "candidate",
    });
    await writeAsset(join(inboxPath, "formal-conflict.md"), {
      id: fixture.globalAssetId,
      type: "MEMORY",
      scope: "GLOBAL",
      title: "Conflict",
      summary: "Conflicts with formal",
      body: "conflict",
    });
    for (const name of ["duplicate-a.md", "duplicate-b.md"]) {
      await writeAsset(join(inboxPath, name), {
        id: duplicateId,
        type: "MEMORY",
        scope: "GLOBAL",
        title: name,
        summary: "duplicate",
        body: "duplicate",
      });
    }
    await writeFile(join(inboxPath, "invalid.md"), "---\ntype: MEMORY\n---\ninvalid", "utf8");
    await writeFile(join(inboxPath, "note.txt"), "not markdown", "utf8");
    await mkdir(join(inboxPath, "directory-asset"));
    await symlink(fixture.globalAssetPath, join(inboxPath, "linked.md"));
    const unknownWorkspacePath = join(fixture.repositoryPath, "inbox/workspaces/unknown/memories");
    await mkdir(unknownWorkspacePath, { recursive: true });
    await writeAsset(join(unknownWorkspacePath, "unknown.md"), {
      id: fixture.idGenerator.next("ast"),
      type: "MEMORY",
      scope: "WORKSPACE",
      workspace: "unknown",
      title: "Unknown workspace",
      summary: "unknown",
      body: "unknown",
    });
    await writeAsset(join(inboxPath, "type-conflict.md"), {
      id: fixture.idGenerator.next("ast"),
      type: "DOCUMENT",
      scope: "GLOBAL",
      title: "Type conflict",
      summary: "type conflict",
      body: "conflict",
    });

    const response = await getJson(fixture, "/api/inbox");
    assert.equal(response.status, 200);
    const data = dataObject(response.body);
    const items = data.items as Array<Record<string, unknown>>;
    const diagnostics = data.diagnostics as Array<Record<string, unknown>>;
    assert.deepEqual(items.map(({ assetId }) => assetId), [validId]);
    assert.equal(diagnostics.some(({ code }) => code === "ID_CONFLICT"), true);
    assert.equal(diagnostics.some(({ code }) => code === "DUPLICATE_ASSET_ID"), true);
    assert.equal(diagnostics.some(({ code }) => code === "INVALID_FRONTMATTER"), true);
    assert.equal(diagnostics.some(({ code }) => code === "NON_MARKDOWN_FILE"), true);
    assert.equal(diagnostics.some(({ code }) => code === "DIRECTORY_ASSET"), true);
    assert.equal(diagnostics.some(({ code }) => code === "SYMLINK"), true);
    assert.equal(diagnostics.some(({ code }) => code === "UNKNOWN_WORKSPACE"), true);
    assert.equal(diagnostics.some(({ code }) => code === "PATH_TYPE_MISMATCH"), true);
    assert.equal((await getJson(fixture, `/api/assets/${fixture.globalAssetId}`)).status, 200);

    const unavailableRepositoryPath = `${fixture.repositoryPath}-unavailable`;
    await rename(fixture.repositoryPath, unavailableRepositoryPath);
    assert.equal((await getJson(fixture, "/api/inbox")).status, 503);
    await rename(unavailableRepositoryPath, fixture.repositoryPath);

    await unlink(fixture.workspaceConfigPath);
    const unavailable = await getJson(fixture, "/api/inbox");
    assert.equal(unavailable.status, 503);
    assert.equal(errorCode(unavailable.body), "WORKSPACE_CONFIG_UNAVAILABLE");
  } finally {
    await fixture.close();
  }
});

test("N09 Usage filters with AND using Task.workspace and preserves missing Assets", async () => {
  const fixture = await createFixture();
  try {
    const alphaTask = fixture.createTask("alpha", "alpha usage");
    const nullTask = fixture.createTask(null, "null usage");
    const missingAssetId = fixture.idGenerator.next("ast");
    fixture.usageService.recordRecalls(alphaTask, [fixture.alphaAssetId, missingAssetId]);
    fixture.usageService.recordRead(alphaTask, fixture.alphaAssetId);
    fixture.usageService.markUsed(alphaTask, fixture.alphaAssetId);
    fixture.usageService.recordRecalls(nullTask, [fixture.globalAssetId]);

    const all = dataItems((await getJson(fixture, "/api/usages")).body);
    assert.equal(all.length, 3);
    const missing = all.find(({ assetId }) => assetId === missingAssetId);
    assert.equal(missing?.assetMissing, true);
    assert.equal(missing?.workspace, "alpha");

    assert.deepEqual(
      dataItems((await getJson(fixture, "/api/usages?workspace=null")).body).map(({ taskId }) => taskId),
      [nullTask],
    );
    assert.equal(dataItems((await getJson(fixture, "/api/usages?workspace=alpha")).body).length, 2);
    assert.equal(
      dataItems((await getJson(
        fixture,
        `/api/usages?taskId=${alphaTask}&assetId=${fixture.alphaAssetId}&workspace=alpha`,
      )).body).length,
      1,
    );
    assert.equal(
      dataItems((await getJson(
        fixture,
        `/api/usages?taskId=${alphaTask}&assetId=${fixture.globalAssetId}&workspace=alpha`,
      )).body).length,
      0,
    );
    assert.equal((await getJson(fixture, "/api/usages?taskId=bad")).status, 400);
    assert.equal((await getJson(fixture, "/api/usages?limit=101")).status, 400);

    fixture.usageService.recordRecalls(
      alphaTask,
      Array.from({ length: 101 }, () => fixture.idGenerator.next("ast")),
    );
    assert.equal(dataItems((await getJson(fixture, "/api/usages")).body).length, 20);
    assert.equal(dataItems((await getJson(fixture, "/api/usages?limit=100")).body).length, 100);
  } finally {
    await fixture.close();
  }
});

test("N09 Task Loadout REST reuses N08 list/get DTO, filters, ordering, and strict JSON", async () => {
  const fixture = await createFixture();
  try {
    const alphaTask = fixture.createTask("alpha", "alpha task", fixture.alphaAssetId);
    const nullTask = fixture.createTask(null, "null task", fixture.globalAssetId, "COMPLETED");

    const all = dataItems((await getJson(fixture, "/api/task-loadouts")).body);
    assert.deepEqual(all.map(({ taskId }) => taskId), [nullTask, alphaTask]);
    assert.deepEqual(
      dataItems((await getJson(fixture, "/api/task-loadouts?workspace=null")).body).map(({ taskId }) => taskId),
      [nullTask],
    );
    assert.deepEqual(
      dataItems((await getJson(fixture, "/api/task-loadouts?workspace=alpha&status=RUNNING")).body).map(({ taskId }) => taskId),
      [alphaTask],
    );
    const detail = await getJson(fixture, `/api/task-loadouts/${alphaTask}`);
    assert.equal(detail.status, 200);
    const dto = dataObject(detail.body).taskLoadout as Record<string, unknown>;
    assert.equal(dto.taskId, alphaTask);
    assert.equal(Array.isArray(dto.usages), true);
    assert.equal(Object.hasOwn(dto, "loadout"), true);

    assert.equal((await getJson(fixture, "/api/task-loadouts/bad")).status, 400);
    assert.equal((await getJson(fixture, `/api/task-loadouts/${fixture.idGenerator.next("tsk")}`)).status, 404);
  } finally {
    await fixture.close();
  }
});

test("N09 System Status remains HTTP 200 for READY, DEGRADED, and REBUILD_REQUIRED without leaking paths", async () => {
  const fixture = await createFixture();
  try {
    const ready = await getJson(fixture, "/api/system/status");
    assert.equal(ready.status, 200);
    assert.equal((dataObject(ready.body).service as Record<string, unknown>).readiness, "READY");
    assert.deepEqual(dataObject(ready.body).mcpEndpoint, { path: "/mcp", ready: true });
    assert.equal(
      (dataObject(ready.body).repository as Record<string, unknown>).assetRepositoryPath,
      fixture.repositoryPath,
    );

    const base = fixture.indexManager.status();
    fixture.setIndexStatus({
      ...base,
      indexState: "DEGRADED",
      watcherState: "DEGRADED",
      diagnostics: [{
        code: "WATCHER_ERROR",
        message: `failed near ${fixture.databasePath}`,
        occurredAt: new Date().toISOString(),
        path: fixture.databasePath,
        source: "WATCHER",
      }],
    });
    const degraded = await getJson(fixture, "/api/system/status");
    assert.equal(degraded.status, 200);
    assert.equal((dataObject(degraded.body).service as Record<string, unknown>).readiness, "DEGRADED");
    assert.equal(JSON.stringify(degraded.body).includes(fixture.databasePath), false);
    assert.equal(JSON.stringify(degraded.body).includes(fixture.workspaceConfigPath), false);

    fixture.setIndexStatus({
      ...base,
      indexState: "REBUILD_REQUIRED",
      rebuildRequired: true,
    });
    const rebuild = await getJson(fixture, "/api/system/status");
    assert.equal(rebuild.status, 200);
    assert.equal((dataObject(rebuild.body).service as Record<string, unknown>).readiness, "REBUILD_REQUIRED");
    assert.equal((dataObject(rebuild.body).index as Record<string, unknown>).rebuildRequired, true);
  } finally {
    await fixture.close();
  }
});

test("N09 exposes read-only GET APIs with uniform envelopes and local Host/Origin protection", async () => {
  const fixture = await createFixture();
  try {
    const taskId = fixture.createTask("alpha", "side effect check", fixture.alphaAssetId);
    fixture.usageService.recordRecalls(taskId, [fixture.alphaAssetId]);
    const beforeUsage = fixture.usageService.list({});
    const beforeTask = fixture.taskRepository.getTask(taskId);

    for (const path of [
      "/api/assets",
      `/api/assets/${fixture.alphaAssetId}`,
      "/api/inbox",
      "/api/task-loadouts",
      `/api/task-loadouts/${taskId}`,
      "/api/usages",
      "/api/system/status",
      "/api/overview",
    ]) {
      const response = await getJson(fixture, path);
      assert.equal(response.status, 200, path);
      assert.equal(response.body.ok, true, path);
      assert.equal(Object.hasOwn(response.body, "data"), true, path);
    }

    const post = await requestJson(fixture, "/api/assets", { method: "POST" });
    assert.equal(post.status, 405);
    assert.equal(post.response.headers.get("allow"), "GET");
    assert.equal(errorCode(post.body), "METHOD_NOT_ALLOWED");
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      assert.equal((await requestJson(fixture, "/api/usages", { method })).status, 405);
    }
    assert.equal((await requestJson(fixture, "/api/not-found", { method: "POST" })).status, 404);
    assert.equal((await getJson(fixture, "/api/not-found")).status, 404);

    const foreignHost = await requestJson(fixture, "/api/assets", {
      headers: { host: "localhost:3210" },
    });
    assert.equal(foreignHost.status, 403);
    const foreignOrigin = await requestJson(fixture, "/api/assets", {
      headers: { origin: "http://evil.example", host: AUTHORITY },
    });
    assert.equal(foreignOrigin.status, 403);
    assert.equal(foreignOrigin.response.headers.has("access-control-allow-origin"), false);

    assert.deepEqual(fixture.usageService.list({}), beforeUsage);
    assert.deepEqual(fixture.taskRepository.getTask(taskId), beforeTask);
  } finally {
    await fixture.close();
  }
});

async function createFixture(): Promise<RestFixture> {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-n09-rest-"));
  const repositoryPath = join(rootPath, "repository");
  const databasePath = join(rootPath, "data", "memory.sqlite");
  const workspaceConfigPath = join(rootPath, "config", "workspaces.json");
  const alphaWorkspacePath = join(rootPath, "workspaces", "alpha");
  const betaWorkspacePath = join(rootPath, "workspaces", "beta");
  await mkdir(join(repositoryPath, "assets/global/memories"), { recursive: true });
  await mkdir(join(repositoryPath, "assets/workspaces/alpha/memories"), { recursive: true });
  await mkdir(join(repositoryPath, "assets/workspaces/beta/documents"), { recursive: true });
  await mkdir(join(rootPath, "config"), { recursive: true });
  await mkdir(alphaWorkspacePath, { recursive: true });
  await mkdir(betaWorkspacePath, { recursive: true });
  await writeFile(workspaceConfigPath, JSON.stringify({
    schemaVersion: 1,
    workspaces: [
      { name: "alpha", paths: [alphaWorkspacePath] },
      { name: "beta", paths: [betaWorkspacePath] },
    ],
  }), "utf8");

  const idGenerator = new SnowflakeIdGenerator();
  const globalAssetId = idGenerator.next("ast");
  const alphaAssetId = idGenerator.next("ast");
  const betaAssetId = idGenerator.next("ast");
  const globalAssetPath = join(repositoryPath, "assets/global/memories/global.md");
  const alphaAssetPath = join(repositoryPath, "assets/workspaces/alpha/memories/alpha.md");
  const betaAssetPath = join(repositoryPath, "assets/workspaces/beta/documents/beta.md");
  await writeAsset(alphaAssetPath, {
    id: alphaAssetId,
    type: "MEMORY",
    scope: "WORKSPACE",
    workspace: "alpha",
    title: "Shared knowledge",
    summary: "shared knowledge alpha",
    body: "shared knowledge body",
  });
  await writeAsset(betaAssetPath, {
    id: betaAssetId,
    type: "DOCUMENT",
    scope: "WORKSPACE",
    workspace: "beta",
    title: "Shared knowledge",
    summary: "shared knowledge beta",
    body: "shared knowledge body",
  });
  await writeAsset(globalAssetPath, {
    id: globalAssetId,
    type: "MEMORY",
    scope: "GLOBAL",
    title: "Shared knowledge",
    summary: "shared knowledge global",
    body: "shared knowledge body",
  });
  await utimes(alphaAssetPath, new Date("2026-01-01T00:00:00.000Z"), new Date("2026-01-01T00:00:00.000Z"));
  await utimes(betaAssetPath, new Date("2026-01-02T00:00:00.000Z"), new Date("2026-01-02T00:00:00.000Z"));
  await utimes(globalAssetPath, new Date("2026-01-03T00:00:00.000Z"), new Date("2026-01-03T00:00:00.000Z"));

  const indexManager = await AssetIndexManager.create({
    databasePath,
    repositoryPath,
    workspaceConfigPath,
    debounceMs: 60_000,
  });
  await indexManager.start();
  const taskRepository = new TaskRepository(databasePath);
  let clock = Date.parse("2026-02-01T00:00:00.000Z");
  const now = (): string => new Date(clock += 1_000).toISOString();
  const taskService = new TaskApplicationService(taskRepository, { idGenerator, now });
  const usageRepository = new UsageRepository(databasePath);
  const usageService = new UsageApplicationService(usageRepository, { idGenerator, now });
  const assetProjection = new LoadoutAssetProjectionRepository(databasePath);
  const assetSearchService = new AssetSearchService({
    databasePath,
    repositoryPath,
    workspaceConfigPath,
    refreshIndex: async () => await indexManager.synchronize(),
  });
  const loadoutService = new TaskLoadoutApplicationService({
    assetProjection,
    assetSearchService,
    taskRepository,
    taskService,
    usageService,
  }, { now });
  const inboxService = new InboxApplicationService({ repositoryPath, workspaceConfigPath }, assetSearchService);
  const assetService = new HubAssetApplicationService(assetSearchService, loadoutService, usageService);
  let indexStatusOverride: AssetIndexStatus | null = null;
  const statusProvider = (): AssetIndexStatus => indexStatusOverride ?? indexManager.status();
  const systemStatusService = new SystemStatusApplicationService({
    repositoryPath,
    workspaceConfigPath,
    indexStatus: statusProvider,
    inboxService,
    mcpEndpointReady: () => true,
    uptimeSeconds: () => 12.5,
  });
  const app = createApp({
    allowedAuthority: AUTHORITY,
    assetService,
    inboxService,
    indexStatus: statusProvider,
    loadoutService,
    systemStatusService,
    overviewService: new OverviewApplicationService({ repositoryPath, workspaceConfigPath, inboxService, taskRepository, usageRepository }),
    usageService,
  });

  const createTask = (
    workspace: string | null,
    request: string,
    assetId?: string,
    status: TaskStatus = "RUNNING",
  ): string => {
    const source = idGenerator.next("usg");
    const task = taskService.resolveTask({
      request,
      sourceSessionId: `session-${source}`,
      sourceTurnId: `turn-${source}`,
      workspace,
    }).task;
    if (assetId !== undefined) {
      const loadout: TaskLoadout = {
        schemaVersion: 1,
        limits: { maxAssets: 8, maxInjectedCharacters: 3000 },
        assets: [{
          assetId,
          estimatedCharacters: 10,
          mode: "ON_DEMAND",
          reason: "MEMORY_MATCH",
        }],
      };
      taskRepository.replaceLoadout(task.taskId, JSON.stringify(loadout), now());
    }
    if (status !== "RUNNING") {
      taskService.updateStatus(task.taskId, status);
    }
    return task.taskId;
  };

  return {
    alphaAssetId,
    alphaAssetPath,
    app,
    betaAssetId,
    betaAssetPath,
    databasePath,
    globalAssetId,
    globalAssetPath,
    idGenerator,
    indexManager,
    repositoryPath,
    taskRepository,
    usageService,
    workspaceConfigPath,
    createTask,
    setIndexStatus: (status) => {
      indexStatusOverride = status;
    },
    close: async () => {
      assetSearchService.close();
      assetProjection.close();
      usageRepository.close();
      taskRepository.close();
      await indexManager.close();
      await rm(rootPath, { recursive: true, force: true });
    },
  };
}

async function writeAsset(
  path: string,
  asset: {
    body: string;
    id: string;
    scope: "GLOBAL" | "WORKSPACE";
    summary: string;
    title: string;
    type: AssetType;
    workspace?: string;
  },
): Promise<void> {
  const workspace = asset.workspace === undefined ? "" : `workspace: ${asset.workspace}\n`;
  await writeFile(
    path,
    `---\nid: ${asset.id}\ntype: ${asset.type}\nscope: ${asset.scope}\n${workspace}title: ${asset.title}\nsummary: ${asset.summary}\n---\n${asset.body}\n`,
    "utf8",
  );
}

async function getJson(fixture: RestFixture, path: string): Promise<JsonResponse> {
  return requestJson(fixture, path);
}

interface JsonResponse {
  body: Record<string, unknown>;
  response: Response;
  status: number;
}

async function requestJson(
  fixture: RestFixture,
  path: string,
  init: RequestInit = {},
): Promise<JsonResponse> {
  const headers = new Headers(init.headers);
  if (!headers.has("host")) {
    headers.set("host", AUTHORITY);
  }
  const response = await fixture.app.request(`http://${AUTHORITY}${path}`, { ...init, headers });
  return {
    body: await response.json() as Record<string, unknown>,
    response,
    status: response.status,
  };
}

function dataObject(body: Record<string, unknown>): Record<string, unknown> {
  assert.equal(body.ok, true);
  assert.equal(typeof body.data, "object");
  assert.notEqual(body.data, null);
  return body.data as Record<string, unknown>;
}

function dataItems(body: Record<string, unknown>): Array<Record<string, unknown>> {
  const items = dataObject(body).items;
  assert.equal(Array.isArray(items), true);
  return items as Array<Record<string, unknown>>;
}

function errorCode(body: Record<string, unknown>): unknown {
  assert.equal(body.ok, false);
  return (body.error as Record<string, unknown>).code;
}


test("Overview aggregates beyond list limits, counts Used tasks distinctly and scans current files without Usage writes", async () => {
  const fixture = await createFixture();
  try {
    for (let i = 0; i < 105; i++) fixture.createTask("alpha", `overview ${i}`);
    const used = fixture.createTask("beta", "used");
    fixture.usageService.recordRecalls(used, [fixture.betaAssetId, fixture.globalAssetId]);
    fixture.usageService.recordRead(used, fixture.betaAssetId);
    fixture.usageService.markUsed(used, fixture.betaAssetId);
    fixture.usageService.markUsed(used, fixture.globalAssetId);
    fixture.usageService.markUsed(used, fixture.globalAssetId);
    const before = fixture.usageService.list({});
    const response = await getJson(fixture, "/api/overview");
    assert.equal(response.status, 200);
    const result = response.body.data as import("../src/http/overview.js").OverviewDto;
    assert.equal(result.scopes.find(s => s.workspace === "alpha")?.tasks.RUNNING, 105);
    assert.deepEqual(result.scopes.find(s => s.workspace === "beta")?.usage,
      { recallCount: 2, readCount: 1, usedPairCount: 2, usedTaskCount: 1 });
    assert.equal(result.scopes.reduce((sum, s) => sum + Object.values(s.assets).reduce((a, b) => a + b, 0), 0), 3);
    await unlink(fixture.alphaAssetPath);
    const fresh = (await getJson(fixture, "/api/overview")).body.data as import("../src/http/overview.js").OverviewDto;
    assert.deepEqual(fresh.scopes.find(s => s.workspace === "alpha")?.assets, { MEMORY: 0, DOCUMENT: 0, SKILL: 0 });
    assert.deepEqual(fixture.usageService.list({}), before);
    assert.equal((await getJson(fixture, "/api/overview?limit=20")).status, 400);
    assert.equal((await requestJson(fixture, "/api/overview", { method: "POST" })).status, 405);
    assert.equal((await requestJson(fixture, "/api/overview", { headers: { origin: "https://example.com" } })).status, 403);
    await writeFile(fixture.workspaceConfigPath, "invalid JSON");
    assert.equal((await getJson(fixture, "/api/overview")).status, 503);
  } finally { await fixture.close(); }
});
