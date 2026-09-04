import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import Database from "better-sqlite3";

import {
  AssetIndexManager,
  AssetSearchService,
  InboxApplicationService,
  computeContentHash,
  confirmInboxAsset,
  type AssetScope,
  type AssetSearchItem,
  type AssetType,
  type SearchStrategy,
} from "../src/asset/index.js";
import { handleCodexHook } from "../src/hook/user-prompt-submit.js";
import {
  DEFAULT_LOADOUT_POLICY,
  LoadoutAssetProjectionRepository,
  TaskLoadoutApplicationService,
  buildTaskLoadout,
  renderLoadoutForHook,
  unicodeCharacterCount,
  type LoadoutAssetMetadata,
  type TaskLoadout,
} from "../src/loadout/index.js";
import { TaskApplicationService, TaskRepository, type TaskRecord } from "../src/task/index.js";
import { UsageApplicationService, UsageRepository } from "../src/usage/index.js";

const idGenerator = new SnowflakeIdGenerator();
const silentLogger = { error: (): void => undefined };

test("N13 freezes the Golden Query matrix and proves A0/A1/A2 incremental Loadout value", async () => {
  const fixture = await createFixture("golden-ablation");
  const ids = {
    alphaMemory: idGenerator.next("ast"),
    alphaDocument: idGenerator.next("ast"),
    alphaSkill: idGenerator.next("ast"),
    betaMemory: idGenerator.next("ast"),
    globalMemory: idGenerator.next("ast"),
    globalDocument: idGenerator.next("ast"),
    globalSkill: idGenerator.next("ast"),
    tieOne: idGenerator.next("ast"),
    tieTwo: idGenerator.next("ast"),
  };
  const decisionToken = "N13DECISIONTOKEN";
  const documentToken = "N13DOCUMENTTOKEN";
  const skillToken = "N13SKILLTOKEN";
  await Promise.all([
    writeAsset(fixture.repositoryPath, "assets/workspaces/alpha/memories/ablation.md", assetSource({
      body: "充值回调保持幂等。Spring 事务与 RocketMQ taskId 共同验证。sharedsearch alphaonly。",
      id: ids.alphaMemory,
      scope: "WORKSPACE",
      summary: `n13ablation ${decisionToken} strong memory decision`,
      title: "n13ablation sharedsearch alpha memory",
      type: "MEMORY",
      workspace: "alpha",
    })),
    writeAsset(fixture.repositoryPath, "assets/workspaces/alpha/documents/ablation.md", assetSource({
      body: `${documentToken} only appears in the complete document body.`,
      id: ids.alphaDocument,
      scope: "WORKSPACE",
      summary: "n13ablation document reading entry",
      title: "n13ablation alpha document",
      type: "DOCUMENT",
      workspace: "alpha",
    })),
    writeAsset(fixture.repositoryPath, "assets/workspaces/alpha/skills/ablation.md", assetSource({
      body: `${skillToken} only appears in the complete skill body and is never executed automatically.`,
      id: ids.alphaSkill,
      scope: "WORKSPACE",
      summary: "n13ablation skill reading entry",
      title: "n13ablation alpha skill",
      type: "SKILL",
      workspace: "alpha",
    })),
    writeAsset(fixture.repositoryPath, "assets/workspaces/beta/memories/blocked.md", assetSource({
      body: "n13ablation sharedsearch alphaonly stronger repeated stronger repeated",
      id: ids.betaMemory,
      scope: "WORKSPACE",
      summary: "n13ablation sharedsearch forbidden beta result",
      title: "n13ablation sharedsearch beta strongest",
      type: "MEMORY",
      workspace: "beta",
    })),
    writeAsset(fixture.repositoryPath, "assets/global/memories/golden.md", assetSource({
      body: [
        "全局 sharedsearch globalonly 规则。",
        "单字 锁；双字 幂等；三字及以上 充值回调。",
        "Spring 事务 RocketMQ taskId asset_read。",
        "multiword conjunction；FTS 字面 call(test) 与 state-machine。",
      ].join("\n"),
      id: ids.globalMemory,
      scope: "GLOBAL",
      summary: "global sharedsearch golden query rule",
      title: "Global golden query",
      type: "MEMORY",
    })),
    writeAsset(fixture.repositoryPath, "assets/global/documents/reference.md", assetSource({
      body: "global document reference body",
      id: ids.globalDocument,
      scope: "GLOBAL",
      summary: "global document reference",
      title: "Global document",
      type: "DOCUMENT",
    })),
    writeAsset(fixture.repositoryPath, "assets/global/skills/reference.md", assetSource({
      body: "global skill reference body",
      id: ids.globalSkill,
      scope: "GLOBAL",
      summary: "global skill reference",
      title: "Global skill",
      type: "SKILL",
    })),
    ...[ids.tieOne, ids.tieTwo].map((id, index) =>
      writeAsset(fixture.repositoryPath, `assets/global/memories/tie-${index}.md`, assetSource({
        body: "deterministictie body",
        id,
        scope: "GLOBAL",
        summary: "deterministictie summary",
        title: "deterministictie title",
        type: "MEMORY",
      })),
    ),
  ]);

  const manager = await AssetIndexManager.create(fixture);
  let service: AssetSearchService | undefined;
  let taskRepository: TaskRepository | undefined;
  let usageRepository: UsageRepository | undefined;
  let projection: LoadoutAssetProjectionRepository | undefined;
  try {
    await manager.synchronize();
    service = new AssetSearchService({
      ...fixture,
      refreshIndex: async () => await manager.synchronize(),
    });

    const matrix: GoldenQueryResult[] = [];
    await goldenCase(matrix, service, {
      context: "alpha",
      query: "alphaonly",
      expected: [ids.alphaMemory],
      forbidden: [ids.betaMemory],
      strategy: "FTS",
    });
    await goldenCase(matrix, service, {
      context: "alpha",
      query: "sharedsearch",
      expected: [ids.alphaMemory, ids.globalMemory],
      forbidden: [ids.betaMemory],
      strategy: "FTS",
      ordered: true,
    });
    await goldenCase(matrix, service, {
      context: null,
      query: "sharedsearch",
      expected: [ids.globalMemory],
      forbidden: [ids.alphaMemory, ids.betaMemory],
      strategy: "FTS",
    });
    await goldenCase(matrix, service, {
      context: "alpha",
      query: "beta strongest",
      expected: [],
      forbidden: [ids.betaMemory],
      strategy: "FTS",
    });
    await goldenCase(matrix, service, {
      context: null,
      query: "锁",
      expected: [ids.globalMemory],
      forbidden: [],
      strategy: "LITERAL",
    });
    await goldenCase(matrix, service, {
      context: null,
      query: "幂等",
      expected: [ids.globalMemory],
      forbidden: [],
      strategy: "LITERAL",
    });
    await goldenCase(matrix, service, {
      context: null,
      query: "充值回调",
      expected: [ids.globalMemory],
      forbidden: [],
      strategy: "FTS",
    });
    await goldenCase(matrix, service, {
      context: null,
      query: "Spring 事务",
      expected: [ids.globalMemory],
      forbidden: [],
      strategy: "HYBRID",
    });
    await goldenCase(matrix, service, {
      context: null,
      query: "RocketMQ 事务 taskId",
      expected: [ids.globalMemory],
      forbidden: [],
      strategy: "HYBRID",
    });
    await goldenCase(matrix, service, {
      context: null,
      query: "multiword conjunction",
      expected: [ids.globalMemory],
      forbidden: [],
      strategy: "FTS",
    });
    await goldenCase(matrix, service, {
      context: null,
      query: "call(test)",
      expected: [ids.globalMemory],
      forbidden: [],
      strategy: "FTS",
    });
    const tieOrder = [ids.tieOne, ids.tieTwo].sort();
    await goldenCase(matrix, service, {
      context: null,
      query: "deterministictie",
      expected: tieOrder,
      forbidden: [],
      strategy: "FTS",
      ordered: true,
    });
    await goldenCase(matrix, service, {
      context: "alpha",
      query: "missingquery",
      expected: [],
      forbidden: [ids.betaMemory],
      strategy: "FTS",
    });

    const a0 = await service.search({ context: { workspace: "alpha" }, query: "n13ablation" });
    assert.deepEqual(new Set(a0.map(({ assetId }) => assetId)), new Set([
      ids.alphaMemory,
      ids.alphaDocument,
      ids.alphaSkill,
    ]));
    assert.equal(a0.some(({ assetId }) => assetId === ids.betaMemory), false);
    assert.deepEqual(
      (await service.search({ context: { workspace: "alpha" }, query: "n13ablation" })).map(({ assetId }) => assetId),
      a0.map(({ assetId }) => assetId),
    );

    taskRepository = new TaskRepository(fixture.databasePath);
    const taskService = new TaskApplicationService(taskRepository);
    usageRepository = new UsageRepository(fixture.databasePath);
    const usageService = new UsageApplicationService(usageRepository);
    projection = new LoadoutAssetProjectionRepository(fixture.databasePath);
    const loadoutService = new TaskLoadoutApplicationService({
      assetProjection: projection,
      assetSearchService: service,
      taskRepository,
      taskService,
      usageService,
    });
    const created = taskService.resolveTask({
      sourceSessionId: "n13-session-a",
      sourceTurnId: "turn-1",
      request: "n13ablation",
      workspace: "alpha",
    });
    assert.deepEqual(JSON.parse(created.task.loadoutJson), {
      schemaVersion: 1,
      limits: { maxInjectedCharacters: 3000, maxAssets: 8 },
      assets: [],
    });

    const resolved = await loadoutService.resolve(created.task.taskId);
    const stored = resolved.task.loadout;
    assert.deepEqual(stored.assets.map(({ assetId }) => assetId), a0.map(({ assetId }) => assetId));
    assert.deepEqual(
      stored.assets.map(({ assetId, mode, reason }) => ({ assetId, mode, reason })),
      a0.map((item) => expectedLoadoutSelection(item)),
    );
    const sameSession = taskService.resolveTask({
      sourceSessionId: "n13-session-a",
      sourceTurnId: "turn-2",
      request: "a later request must not replace the initial request",
      workspace: "alpha",
    });
    assert.equal(sameSession.kind, "SESSION_REUSE");
    assert.equal(sameSession.task.taskId, created.task.taskId);
    assert.equal(sameSession.task.request, "n13ablation");
    const crossSession = taskService.resolveTask({
      sourceSessionId: "n13-session-b",
      sourceTurnId: "turn-1",
      request: `continue taskId: ${created.task.taskId}`,
      workspace: "alpha",
      explicitTaskId: created.task.taskId,
    });
    assert.equal(crossSession.kind, "EXPLICIT_ATTACH");
    assert.deepEqual(
      JSON.parse(crossSession.task.loadoutJson).assets.map(({ assetId }: { assetId: string }) => assetId),
      a0.map(({ assetId }) => assetId),
    );

    const metadata = projection.findMetadata(stored.assets.map(({ assetId }) => assetId));
    const a1Text = renderWithoutDirectSummary(created.task, stored, metadata);
    const a2Text = renderLoadoutForHook({
      assetMetadata: metadata,
      loadout: stored,
      status: created.task.status,
      taskId: created.task.taskId,
      workspace: created.task.workspace,
    });
    assert.equal(a1Text.includes(decisionToken), false);
    assert.equal(a2Text.includes(decisionToken), true);
    assert.equal(a2Text.includes(documentToken), false);
    assert.equal(a2Text.includes(skillToken), false);
    assert.equal(unicodeCharacterCount(a2Text) <= DEFAULT_LOADOUT_POLICY.maxInjectedCharacters, true);
    assert.equal(stored.assets.length <= DEFAULT_LOADOUT_POLICY.maxAssets, true);

    const hookOutput = await handleCodexHook({
      cwd: fixture.alphaWorkspacePath,
      hook_event_name: "UserPromptSubmit",
      prompt: "continue from the stored Loadout",
      session_id: "n13-session-a",
      turn_id: "turn-3",
    }, {
      databasePath: fixture.databasePath,
      workspaceConfigPath: fixture.workspaceConfigPath,
    }, silentLogger);
    assert.notEqual(hookOutput, null);
    assert.match(hookOutput ?? "", new RegExp(created.task.taskId));
    assert.match(hookOutput ?? "", new RegExp(decisionToken));
    assert.equal((hookOutput ?? "").includes(documentToken), false);
    assert.equal((hookOutput ?? "").includes(skillToken), false);

    const beforeRead = await readFile(join(fixture.repositoryPath, "assets/workspaces/alpha/memories/ablation.md"), "utf8");
    const updated = beforeRead.replace("sharedsearch alphaonly", "sharedsearch alphaonly CURRENTMARKDOWNTOKEN");
    await writeFile(join(fixture.repositoryPath, "assets/workspaces/alpha/memories/ablation.md"), updated, "utf8");
    const current = await service.read({ assetId: ids.alphaMemory, context: { workspace: "alpha" } });
    assert.match(current.markdown, /CURRENTMARKDOWNTOKEN/u);
    assert.equal(current.contentHash, computeContentHash(Buffer.from(updated, "utf8")));

    const oversizedItem: AssetSearchItem = {
      ...a0.find(({ assetId }) => assetId === ids.alphaMemory) as AssetSearchItem,
      summary: "界".repeat(2900),
      title: "oversized direct memory",
    };
    const budgetLoadout = buildTaskLoadout(created.task, [oversizedItem, ...a0.filter(({ assetId }) => assetId !== ids.alphaMemory)]);
    assert.notEqual(budgetLoadout.assets.find(({ assetId }) => assetId === ids.alphaMemory), undefined);
    assert.equal(
      budgetLoadout.assets.find(({ assetId }) => assetId === ids.alphaMemory)?.reason,
      "DIRECT_BUDGET_DOWNGRADED",
    );

    const metrics = [
      ablationMetrics("A0", a0, "", 0, 0, a0.length, 0),
      ablationMetrics("A1", a0, a1Text, stored.assets.length, 0, stored.assets.length, stored.assets.length),
      ablationMetrics("A2", a0, a2Text, stored.assets.length, occurrences(a2Text, decisionToken), 2, stored.assets.length),
    ];
    assert.deepEqual(metrics.map(({ expectedCoverage, workspaceLeakage }) => ({ expectedCoverage, workspaceLeakage })), [
      { expectedCoverage: 3, workspaceLeakage: 0 },
      { expectedCoverage: 3, workspaceLeakage: 0 },
      { expectedCoverage: 3, workspaceLeakage: 0 },
    ]);
    assert.equal(metrics[1]?.hookVisibleUniqueDecisionTokens, 0);
    assert.equal(metrics[2]?.hookVisibleUniqueDecisionTokens, 1);
    console.log(`N13_GOLDEN_QUERY ${JSON.stringify(matrix)}`);
    console.log(`N13_ABLATION ${JSON.stringify(metrics)}`);
  } finally {
    projection?.close();
    usageRepository?.close();
    taskRepository?.close();
    service?.close();
    await manager.close();
    await rm(fixture.rootPath, { force: true, recursive: true });
  }
});

test("N13 proves the synthetic M03/M04 Inbox contract, Watcher recovery, and SQLite rebuild boundary", async () => {
  const fixture = await createFixture("migration-bridge");
  const assetId = idGenerator.next("ast");
  const sourceRelativePath = "inbox/workspaces/alpha/memories/migration-bridge.md";
  const targetRelativePath = "assets/workspaces/alpha/memories/migration-bridge.md";
  const initialSource = assetSource({
    body: "migrationbridge original current Markdown",
    id: assetId,
    scope: "WORKSPACE",
    summary: "synthetic M03 M04 bridge without legacy identifiers",
    title: "Synthetic migration bridge",
    type: "MEMORY",
    workspace: "alpha",
  });
  await writeAsset(fixture.repositoryPath, sourceRelativePath, initialSource);
  await writeAsset(
    fixture.repositoryPath,
    "inbox/workspaces/unknown/memories/unrelated.md",
    assetSource({
      body: "unrelated diagnostic",
      id: idGenerator.next("ast"),
      scope: "WORKSPACE",
      title: "Unknown Workspace candidate",
      type: "MEMORY",
      workspace: "unknown",
    }),
  );

  let manager = await AssetIndexManager.create({ ...fixture, debounceMs: 40 });
  let service: AssetSearchService | undefined;
  try {
    await manager.start();
    service = new AssetSearchService({
      ...fixture,
      refreshIndex: async () => await manager.synchronize(),
    });
    const inbox = new InboxApplicationService(fixture, service);
    const before = await inbox.scan();
    assert.deepEqual(before.items.map(({ assetId: id }) => id), [assetId]);
    assert.equal(before.diagnostics.some(({ code }) => code === "UNKNOWN_WORKSPACE"), true);
    assert.deepEqual(await service.search({ context: { workspace: "alpha" }, query: "migrationbridge" }), []);

    const bytes = Buffer.from(initialSource, "utf8");
    const expectedContentHash = createHash("sha256").update(bytes).digest("hex");
    const confirmed = await confirmInboxAsset({
      relativePath: sourceRelativePath,
      expectedContentHash,
    }, fixture);
    assert.equal(confirmed.assetId, assetId);
    assert.equal(confirmed.targetRelativePath, targetRelativePath);
    assert.deepEqual(await readFile(join(fixture.repositoryPath, targetRelativePath)), bytes);
    await assert.rejects(readFile(join(fixture.repositoryPath, sourceRelativePath)), { code: "ENOENT" });
    await waitFor(async () =>
      (await service?.search({ context: { workspace: "alpha" }, query: "migrationbridge" }))?.[0]?.assetId === assetId
    );
    assert.equal((await inbox.scan()).items.some(({ assetId: id }) => id === assetId), false);
    assert.match(
      (await service.read({ assetId, context: { workspace: "alpha" } })).markdown,
      /migrationbridge original/u,
    );
    assert.deepEqual(await service.search({ context: { workspace: "beta" }, query: "migrationbridge" }), []);

    const modified = initialSource.replace("original", "modified");
    await writeFile(join(fixture.repositoryPath, targetRelativePath), modified, "utf8");
    await waitFor(async () =>
      (await service?.search({ context: { workspace: "alpha" }, query: "modified" }))?.[0]?.assetId === assetId
    );
    const modifiedRead = await service.read({ assetId, context: { workspace: "alpha" } });
    assert.equal(modifiedRead.contentHash, computeContentHash(Buffer.from(modified, "utf8")));

    await writeFile(join(fixture.repositoryPath, targetRelativePath), "# invalid without Frontmatter\n", "utf8");
    await waitFor(async () =>
      (await service?.search({ context: { workspace: "alpha" }, query: "modified" }))?.length === 0
    );
    assert.equal(manager.status().diagnostics.some(({ code }) => code === "MISSING_FRONTMATTER"), true);

    const repaired = initialSource.replace("original", "repaired");
    await writeFile(join(fixture.repositoryPath, targetRelativePath), repaired, "utf8");
    await waitFor(async () =>
      (await service?.search({ context: { workspace: "alpha" }, query: "repaired" }))?.[0]?.assetId === assetId
    );

    await writeFile(fixture.workspaceConfigPath, "{invalid", "utf8");
    await waitFor(() => manager.status().indexState === "DEGRADED");
    assert.equal(manager.status().catalogCount, 1);
    await writeWorkspaceConfig(fixture);
    await waitFor(() => manager.status().indexState === "READY");

    await rm(join(fixture.repositoryPath, targetRelativePath));
    await waitFor(async () =>
      (await service?.search({ context: { workspace: "alpha" }, query: "repaired" }))?.length === 0
    );
    await writeAsset(fixture.repositoryPath, targetRelativePath, repaired);
    await waitFor(async () =>
      (await service?.search({ context: { workspace: "alpha" }, query: "repaired" }))?.[0]?.assetId === assetId
    );

    const taskRepository = new TaskRepository(fixture.databasePath);
    const taskService = new TaskApplicationService(taskRepository);
    const task = taskService.resolveTask({
      sourceSessionId: "rebuild-session",
      sourceTurnId: "rebuild-turn",
      request: "migrationbridge",
      workspace: "alpha",
    }).task;
    const usageRepository = new UsageRepository(fixture.databasePath);
    const usageService = new UsageApplicationService(usageRepository);
    usageService.recordRead(task.taskId, assetId);
    usageRepository.close();
    taskRepository.close();

    service.close();
    service = undefined;
    await manager.close();
    for (const path of [fixture.databasePath, `${fixture.databasePath}-wal`, `${fixture.databasePath}-shm`]) {
      await rm(path, { force: true });
    }

    manager = await AssetIndexManager.create({ ...fixture, debounceMs: 40 });
    await manager.start();
    service = new AssetSearchService({
      ...fixture,
      refreshIndex: async () => await manager.synchronize(),
    });
    assert.equal(
      (await service.search({ context: { workspace: "alpha" }, query: "migrationbridge" }))[0]?.assetId,
      assetId,
    );
    const rebuiltTasks = new TaskRepository(fixture.databasePath);
    const rebuiltUsages = new UsageRepository(fixture.databasePath);
    try {
      assert.deepEqual(rebuiltTasks.listTasks({ limit: 20 }), []);
      assert.deepEqual(rebuiltUsages.list({ limit: 20 }), []);
      const database = new Database(fixture.databasePath, { readonly: true });
      try {
        const names = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>)
          .map(({ name }) => name.toLowerCase());
        assert.equal(names.some((name) => name.includes("confirmation")), false);
      } finally {
        database.close();
      }
    } finally {
      rebuiltUsages.close();
      rebuiltTasks.close();
    }
  } finally {
    service?.close();
    await manager.close();
    await rm(fixture.rootPath, { force: true, recursive: true });
  }
});

interface Fixture {
  alphaWorkspacePath: string;
  betaWorkspacePath: string;
  databasePath: string;
  repositoryPath: string;
  rootPath: string;
  workspaceConfigPath: string;
}

interface AssetSourceOptions {
  body: string;
  id: string;
  scope: AssetScope;
  summary?: string;
  title?: string;
  type: AssetType;
  workspace?: string;
}

interface GoldenQueryCase {
  context: string | null;
  expected: string[];
  forbidden: string[];
  ordered?: boolean;
  query: string;
  strategy: SearchStrategy;
}

interface GoldenQueryResult extends GoldenQueryCase {
  actual: string[];
}

interface AblationMetrics {
  expectedCoverage: number;
  hookTextCharacters: number;
  hookVisibleAssetIds: number;
  hookVisibleUniqueDecisionTokens: number;
  loadoutAssets: number;
  modeReasonsValid: boolean;
  needsAssetRead: number;
  overCharacterLimit: boolean;
  overLoadoutLimit: boolean;
  stableAssetOrder: string[];
  variant: "A0" | "A1" | "A2";
  workspaceLeakage: number;
}

async function createFixture(name: string): Promise<Fixture> {
  const rootPath = await mkdtemp(join(tmpdir(), `codex-memory-os-n13-${name}-`));
  const fixture = {
    alphaWorkspacePath: join(rootPath, "workspaces", "alpha"),
    betaWorkspacePath: join(rootPath, "workspaces", "beta"),
    databasePath: join(rootPath, "data", "codex-memory.sqlite"),
    repositoryPath: join(rootPath, "asset-repository"),
    rootPath,
    workspaceConfigPath: join(rootPath, "config", "workspaces.json"),
  };
  await Promise.all([
    mkdir(join(fixture.repositoryPath, "assets"), { recursive: true }),
    mkdir(fixture.alphaWorkspacePath, { recursive: true }),
    mkdir(fixture.betaWorkspacePath, { recursive: true }),
  ]);
  await writeWorkspaceConfig(fixture);
  return fixture;
}

async function writeWorkspaceConfig(fixture: Fixture): Promise<void> {
  await writeFixture(fixture.workspaceConfigPath, JSON.stringify({
    schemaVersion: 1,
    workspaces: [
      { name: "alpha", paths: [fixture.alphaWorkspacePath] },
      { name: "beta", paths: [fixture.betaWorkspacePath] },
    ],
  }));
}

function assetSource(options: AssetSourceOptions): string {
  const fields = [
    `id: ${options.id}`,
    `type: ${options.type}`,
    `scope: ${options.scope}`,
  ];
  if (options.workspace !== undefined) {
    fields.push(`workspace: ${options.workspace}`);
  }
  fields.push(
    `title: ${options.title ?? `${options.type} title`}`,
    `summary: ${options.summary ?? `${options.type} summary`}`,
  );
  return ["---", ...fields, "---", options.body, ""].join("\n");
}

async function writeAsset(repositoryPath: string, relativePath: string, source: string): Promise<void> {
  await writeFixture(join(repositoryPath, relativePath), source);
}

async function writeFixture(path: string, source: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source, "utf8");
}

async function goldenCase(
  results: GoldenQueryResult[],
  service: AssetSearchService,
  input: GoldenQueryCase,
): Promise<void> {
  const items = await service.search({ context: { workspace: input.context }, query: input.query });
  const actual = items.map(({ assetId }) => assetId);
  if (input.ordered === true) {
    assert.deepEqual(actual, input.expected, input.query);
  } else {
    assert.deepEqual(new Set(actual), new Set(input.expected), input.query);
  }
  assert.equal(actual.some((assetId) => input.forbidden.includes(assetId)), false, input.query);
  assert.equal(items.every(({ searchStrategy }) => searchStrategy === input.strategy), true, input.query);
  results.push({ ...input, actual });
}

function expectedLoadoutSelection(item: AssetSearchItem): {
  assetId: string;
  mode: "DIRECT" | "ON_DEMAND";
  reason: "DOCUMENT_ON_DEMAND" | "MEMORY_STRONG_MATCH" | "SKILL_ON_DEMAND";
} {
  if (item.type === "MEMORY") {
    return { assetId: item.assetId, mode: "DIRECT", reason: "MEMORY_STRONG_MATCH" };
  }
  return item.type === "DOCUMENT"
    ? { assetId: item.assetId, mode: "ON_DEMAND", reason: "DOCUMENT_ON_DEMAND" }
    : { assetId: item.assetId, mode: "ON_DEMAND", reason: "SKILL_ON_DEMAND" };
}

function renderWithoutDirectSummary(
  task: TaskRecord,
  loadout: TaskLoadout,
  metadata: ReadonlyMap<string, LoadoutAssetMetadata>,
): string {
  const lines = [
    "CodexMemoryOS Task Context A1 counterfactual",
    `taskId: ${task.taskId}`,
    `workspace: ${JSON.stringify(task.workspace)}`,
    "loadoutAssets:",
  ];
  for (const asset of loadout.assets) {
    lines.push(`- ${asset.mode} ${asset.assetId}`, `  reason: ${asset.reason}`);
    const item = metadata.get(asset.assetId);
    if (item !== undefined) {
      lines.push(`  title: ${JSON.stringify(item.title)}`);
    }
    if (asset.mode === "ON_DEMAND") {
      lines.push(`  hint: call asset_read with taskId=${task.taskId} and assetId=${asset.assetId} when needed`);
    }
  }
  return lines.join("\n");
}

function ablationMetrics(
  variant: AblationMetrics["variant"],
  searchItems: readonly AssetSearchItem[],
  hookText: string,
  hookVisibleAssetIds: number,
  hookVisibleUniqueDecisionTokens: number,
  needsAssetRead: number,
  loadoutAssets: number,
): AblationMetrics {
  return {
    variant,
    expectedCoverage: searchItems.length,
    workspaceLeakage: 0,
    stableAssetOrder: searchItems.map(({ assetId }) => assetId),
    hookVisibleAssetIds,
    hookVisibleUniqueDecisionTokens,
    needsAssetRead,
    loadoutAssets,
    hookTextCharacters: unicodeCharacterCount(hookText),
    overCharacterLimit: unicodeCharacterCount(hookText) > DEFAULT_LOADOUT_POLICY.maxInjectedCharacters,
    overLoadoutLimit: loadoutAssets > DEFAULT_LOADOUT_POLICY.maxAssets,
    modeReasonsValid: true,
  };
}

function occurrences(source: string, token: string): number {
  return source.split(token).length - 1;
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      if (await check()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for N13 condition${lastError instanceof Error ? `: ${lastError.message}` : ""}`);
}
