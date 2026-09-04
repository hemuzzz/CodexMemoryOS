import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import Database from "better-sqlite3";

import {
  AssetIndexManager,
  AssetSearchService,
  type AssetIndexStatus,
  type AssetScope,
  type AssetType,
} from "../src/asset/index.js";
import {
  LoadoutAssetProjectionRepository,
  TaskLoadoutApplicationService,
} from "../src/loadout/index.js";
import type { StructuredErrorLogInput, StructuredLogger } from "../src/logging.js";
import { createMcpHttpRequestHandler } from "../src/mcp/index.js";
import {
  SERVER_ASSET_REPOSITORY_PATH_ENV,
  ServerConfigurationError,
  serverConfigurationFromEnvironment,
} from "../src/runtime.js";
import { TaskApplicationService, TaskRepository } from "../src/task/index.js";
import { UsageApplicationService, UsageRepository } from "../src/usage/index.js";

const idGenerator = new SnowflakeIdGenerator();

test("N08 registers Search, Read, Used, Resolve, Get, and List with strict schemas", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n07-schema");
  try {
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(({ name }) => name), [
      "asset_search",
      "asset_read",
      "asset_mark_used",
      "task_loadout_resolve",
      "task_loadout_get",
      "task_loadout_list",
    ]);

    const search = tools.tools[0];
    const read = tools.tools[1];
    assert.deepEqual(Object.keys(search?.inputSchema.properties ?? {}).sort(), ["limit", "query", "taskId"]);
    assert.deepEqual(search?.inputSchema.required, ["taskId", "query"]);
    assert.equal(search?.inputSchema.additionalProperties, false);
    assert.deepEqual(Object.keys(read?.inputSchema.properties ?? {}).sort(), ["assetId", "taskId"]);
    assert.deepEqual(read?.inputSchema.required, ["taskId", "assetId"]);
    assert.equal(read?.inputSchema.additionalProperties, false);

    const markUsed = tools.tools[2];
    const resolve = tools.tools[3];
    const get = tools.tools[4];
    const list = tools.tools[5];
    assert.deepEqual(Object.keys(markUsed?.inputSchema.properties ?? {}).sort(), ["assetId", "taskId"]);
    assert.deepEqual(Object.keys(resolve?.inputSchema.properties ?? {}), ["taskId"]);
    assert.deepEqual(Object.keys(get?.inputSchema.properties ?? {}), ["taskId"]);
    assert.deepEqual(Object.keys(list?.inputSchema.properties ?? {}).sort(), ["limit", "status", "workspace"]);
    assert.equal(markUsed?.inputSchema.additionalProperties, false);
    assert.equal(resolve?.inputSchema.additionalProperties, false);
    assert.equal(get?.inputSchema.additionalProperties, false);
    assert.equal(list?.inputSchema.additionalProperties, false);

    for (const argumentsWithForbiddenField of [
      { taskId: fixture.tasks.alpha, query: "shared", workspace: "beta" },
      { taskId: fixture.tasks.alpha, query: "shared", path: "/tmp/private.md" },
      { taskId: fixture.tasks.alpha, assetId: fixture.assets.alpha, filePath: "/tmp/private.md" },
    ]) {
      const name = "assetId" in argumentsWithForbiddenField ? "asset_read" : "asset_search";
      const result = await client.callTool({ name, arguments: argumentsWithForbiddenField }) as CallToolResult;
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent, undefined);
      assert.match(textContent(result), /Input validation error/);
    }
    for (const [name, argumentsWithForbiddenField] of [
      ["asset_mark_used", { taskId: fixture.tasks.alpha, assetId: fixture.assets.alpha, path: "/tmp/private.md" }],
      ["task_loadout_resolve", { taskId: fixture.tasks.alpha, workspace: "beta" }],
      ["task_loadout_get", { taskId: fixture.tasks.alpha, assetId: fixture.assets.alpha }],
      ["task_loadout_list", { limit: 1, cursor: "forbidden" }],
    ] as const) {
      const result = await callTool(client, name, argumentsWithForbiddenField);
      assert.equal(result.isError, true);
      assert.equal(result.structuredContent, undefined);
      assert.match(textContent(result), /Input validation error/);
    }
  } finally {
    await client.close();
    await fixture.cleanup();
  }
});

test("N07 resolves Task.workspace and preserves N05 search/read semantics", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n07-search-read");
  try {
    const alphaResult = await callSearch(client, fixture.tasks.alpha, "shared");
    const alpha = success(alphaResult);
    assert.deepEqual(JSON.parse(textContent(alphaResult)), alphaResult.structuredContent);
    assert.deepEqual(alpha.items.map(assetIdOf), [fixture.assets.alpha, fixture.assets.global]);
    assert.equal(alpha.items.every(({ searchStrategy }) => searchStrategy === "FTS"), true);

    const literal = success(await callSearch(client, fixture.tasks.alpha, "中"));
    assert.deepEqual(literal.items.map(assetIdOf), [fixture.assets.alpha]);
    assert.equal(literal.items[0]?.searchStrategy, "LITERAL");

    const hybrid = success(await callSearch(client, fixture.tasks.alpha, "shared 中"));
    assert.deepEqual(hybrid.items.map(assetIdOf), [fixture.assets.alpha]);
    assert.equal(hybrid.items[0]?.searchStrategy, "HYBRID");

    const andResult = success(await callSearch(client, fixture.tasks.alpha, "alpha-only global-only"));
    assert.deepEqual(andResult.items, []);
    const limited = success(await callSearch(client, fixture.tasks.alpha, "shared", 1));
    assert.deepEqual(limited.items.map(assetIdOf), [fixture.assets.alpha]);

    const globalOnly = success(await callSearch(client, fixture.tasks.global, "shared"));
    assert.deepEqual(globalOnly.items.map(assetIdOf), [fixture.assets.global]);
    assert.deepEqual(success(await callSearch(client, fixture.tasks.alpha, "beta-only")).items, []);

    const globalReadResult = await callRead(client, fixture.tasks.alpha, fixture.assets.global);
    const globalRead = success(globalReadResult);
    assert.deepEqual(JSON.parse(textContent(globalReadResult)), globalReadResult.structuredContent);
    assert.equal(globalRead.asset.frontmatter.id, fixture.assets.global);
    const alphaRead = success(
      await callRead(client, fixture.tasks.alpha, fixture.assets.alpha),
    );
    assert.match(alphaRead.asset.markdown, /alpha-only/);

    const updatedMarkdown = assetSource({
      body: "shared alpha-only 中 current Markdown replacement",
      id: fixture.assets.alpha,
      scope: "WORKSPACE",
      type: "DOCUMENT",
      workspace: "alpha",
    });
    await writeFile(fixture.paths.alphaAsset, updatedMarkdown, "utf8");
    const currentRead = success(
      await callRead(client, fixture.tasks.alpha, fixture.assets.alpha),
    );
    assert.match(currentRead.asset.markdown, /current Markdown replacement/);
    assert.equal(currentRead.asset.contentHash, sha256(updatedMarkdown));

    const terminalRead = success(
      await callRead(client, fixture.tasks.completed, fixture.assets.alpha),
    );
    assert.equal(terminalRead.asset.frontmatter.id, fixture.assets.alpha);
  } finally {
    await client.close();
    await fixture.cleanup();
  }
});

test("N07 returns stable structured business errors without sensitive paths or stacks", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n07-errors");
  try {
    assertBusinessError(await callSearch(client, "tsk-invalid", "shared"), "TASK_ID_INVALID", false);
    assertBusinessError(
      await callSearch(client, idGenerator.next("tsk"), "shared"),
      "TASK_NOT_FOUND",
      false,
    );
    assertBusinessError(await callSearch(client, fixture.tasks.alpha, "  \n "), "SEARCH_INPUT_INVALID", false);
    assertBusinessError(
      await callRead(client, fixture.tasks.alpha, "ast-invalid"),
      "ASSET_ID_INVALID",
      false,
    );
    assertBusinessError(
      await callRead(client, fixture.tasks.alpha, idGenerator.next("ast")),
      "ASSET_NOT_FOUND",
      false,
    );
    assertBusinessError(
      await callRead(client, fixture.tasks.alpha, fixture.assets.beta),
      "ASSET_NOT_ACCESSIBLE",
      false,
    );

    await unlink(fixture.paths.alphaAsset);
    const stale = await callRead(client, fixture.tasks.alpha, fixture.assets.alpha);
    assertBusinessError(stale, "ASSET_NOT_ACCESSIBLE", false);
    assert.equal(JSON.stringify(stale).includes(fixture.rootPath), false);
    assert.equal(JSON.stringify(stale).includes("stack"), false);

    fixture.taskRepository.close();
    const internal = await callSearch(client, fixture.tasks.alpha, "shared");
    assertBusinessError(internal, "INTERNAL_ERROR", true);
    assert.equal(JSON.stringify(internal).includes(fixture.databasePath), false);
    assert.equal(fixture.internalErrors.length, 1);
  } finally {
    await client.close();
    await fixture.cleanup();
  }
});

test("N07 distinguishes Workspace configuration and Catalog readiness failures", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n07-index-errors");
  try {
    fixture.indexStatusOverride = unavailableIndexStatus();
    assertBusinessError(
      await callSearch(client, fixture.tasks.alpha, "shared"),
      "ASSET_INDEX_UNAVAILABLE",
      true,
    );

    fixture.indexStatusOverride = undefined;
    await writeFile(
      fixture.workspaceConfigPath,
      JSON.stringify({ schemaVersion: 2, workspaces: [] }),
      "utf8",
    );
    await fixture.manager.synchronize();
    assert.equal(fixture.manager.status().indexState, "DEGRADED");
    assertBusinessError(
      await callSearch(client, fixture.tasks.alpha, "shared"),
      "WORKSPACE_CONFIG_UNAVAILABLE",
      true,
    );
  } finally {
    await client.close();
    await fixture.cleanup();
  }
});

test("N07 HTTP initialize/call reconnects after restart and diagnoses offline service", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n07-restart");
  try {
    assert.equal(success(await callSearch(client, fixture.tasks.alpha, "shared")).items.length, 2);
    await fixture.stopHttp();
    await assert.rejects(async () => await callSearch(client, fixture.tasks.alpha, "shared"));

    await fixture.startHttp(fixture.port);
    assert.equal(success(await callSearch(client, fixture.tasks.alpha, "shared")).items.length, 2);
  } finally {
    await client.close();
    await fixture.cleanup();
  }

  const late = await createFixture();
  await late.stopHttp();
  const lateClient = new Client({ name: "n07-late", version: "0.0.0" });
  try {
    await assert.rejects(
      async () => await lateClient.connect(clientTransport(late.endpoint)),
    );
    await late.startHttp(late.port);
    await lateClient.connect(clientTransport(late.endpoint));
    assert.equal(success(await callSearch(lateClient, late.tasks.global, "shared")).items.length, 1);
  } finally {
    await lateClient.close();
    await late.cleanup();
  }
});

test("N07 concurrent requests never share Task or Workspace context", async () => {
  const fixture = await createFixture();
  const clients = await Promise.all(
    Array.from({ length: 8 }, async (_, index) => await fixture.connect(`n07-concurrent-${index}`)),
  );
  try {
    const results = await Promise.all(
      clients.map(async (client, index) => {
        const taskId = index % 3 === 0
          ? fixture.tasks.alpha
          : index % 3 === 1
            ? fixture.tasks.beta
            : fixture.tasks.global;
        return success(await callSearch(client, taskId, "shared")).items.map(assetIdOf);
      }),
    );
    for (const [index, assetIds] of results.entries()) {
      const expected = index % 3 === 0
        ? [fixture.assets.alpha, fixture.assets.global]
        : index % 3 === 1
          ? [fixture.assets.beta, fixture.assets.global]
          : [fixture.assets.global];
      assert.deepEqual(assetIds, expected);
    }
  } finally {
    await Promise.all(clients.map(async (client) => await client.close()));
    await fixture.cleanup();
  }
});

test("N08 Search/Read record only returned Usage, preserve Loadout, and survive Catalog rebuild", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n07-no-side-effects");
  try {
    const before = taskRows(fixture.databasePath);
    await callSearch(client, fixture.tasks.alpha, "shared");
    await callRead(client, fixture.tasks.alpha, fixture.assets.alpha);
    assert.deepEqual(taskRows(fixture.databasePath), before);
    assert.equal(databaseObjects(fixture.databasePath).includes("task_asset_usage"), true);
    assert.deepEqual(
      usageRows(fixture.databasePath, fixture.tasks.alpha).map(({ assetId, recallCount, readCount }) => ({
        assetId,
        recallCount,
        readCount,
      })),
      [
        { assetId: fixture.assets.alpha, recallCount: 1, readCount: 1 },
        { assetId: fixture.assets.global, recallCount: 1, readCount: 0 },
      ].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    );

    await fixture.manager.rebuild();
    assert.deepEqual(taskRows(fixture.databasePath), before);
    assert.equal(usageRows(fixture.databasePath, fixture.tasks.alpha).length, 2);
    assert.equal(success(await callSearch(client, fixture.tasks.alpha, "shared")).items.length, 2);
  } finally {
    await client.close();
    await fixture.cleanup();
  }
});

test("N08 records only returned Recall, successful Read, and eligible idempotent Used across Task statuses", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n08-usage-semantics");
  try {
    assert.deepEqual(success(await callSearch(client, fixture.tasks.alpha, "not-present")).items, []);
    assert.equal(usageRows(fixture.databasePath, fixture.tasks.alpha).length, 0);

    assert.equal(success(await callSearch(client, fixture.tasks.alpha, "shared", 1)).items.length, 1);
    assert.deepEqual(usageRows(fixture.databasePath, fixture.tasks.alpha), [
      { assetId: fixture.assets.alpha, recallCount: 1, readCount: 0 },
    ]);
    await callSearch(client, fixture.tasks.alpha, "shared");
    assert.deepEqual(usageRows(fixture.databasePath, fixture.tasks.alpha), [
      { assetId: fixture.assets.alpha, recallCount: 2, readCount: 0 },
      { assetId: fixture.assets.global, recallCount: 1, readCount: 0 },
    ].sort((left, right) => left.assetId.localeCompare(right.assetId)));

    assertBusinessError(
      await callRead(client, fixture.tasks.alpha, fixture.assets.beta),
      "ASSET_NOT_ACCESSIBLE",
      false,
    );
    assert.equal(usageRows(fixture.databasePath, fixture.tasks.alpha).some(({ assetId }) => assetId === fixture.assets.beta), false);

    const usedResult = await callTool(client, "asset_mark_used", {
      taskId: fixture.tasks.alpha,
      assetId: fixture.assets.global,
    });
    const used = usedResult.structuredContent as { ok: true; usage: { usageId: string; usedFlag: boolean; updatedAt: string } };
    assert.equal(used.ok, true);
    assert.equal(used.usage.usedFlag, true);
    const repeated = (await callTool(client, "asset_mark_used", {
      taskId: fixture.tasks.alpha,
      assetId: fixture.assets.global,
    })).structuredContent as typeof used;
    assert.equal(repeated.usage.usageId, used.usage.usageId);
    assert.equal(repeated.usage.updatedAt, used.usage.updatedAt);

    assertBusinessError(
      await callTool(client, "asset_mark_used", { taskId: fixture.tasks.alpha, assetId: fixture.assets.beta }),
      "ASSET_NOT_ACCESSIBLE",
      false,
    );
    assert.equal(usageRows(fixture.databasePath, fixture.tasks.alpha).some(({ assetId }) => assetId === fixture.assets.beta), false);
    assert.deepEqual(success(await callSearch(client, fixture.tasks.global, "shared")).items.map(assetIdOf), [fixture.assets.global]);
    assert.deepEqual(usageRows(fixture.databasePath, fixture.tasks.global), [
      { assetId: fixture.assets.global, recallCount: 1, readCount: 0 },
    ]);
    assertBusinessError(
      await callRead(client, fixture.tasks.global, fixture.assets.alpha),
      "ASSET_NOT_ACCESSIBLE",
      false,
    );
    const terminalUsed = (await callTool(client, "asset_mark_used", {
      taskId: fixture.tasks.completed,
      assetId: fixture.assets.alpha,
    })).structuredContent as { ok: true; usage: { usedFlag: boolean } };
    assert.equal(terminalUsed.usage.usedFlag, true);
    await callSearch(client, fixture.tasks.completed, "shared", 1);
    await callRead(client, fixture.tasks.completed, fixture.assets.alpha);
    assert.deepEqual(usageRows(fixture.databasePath, fixture.tasks.completed), [
      { assetId: fixture.assets.alpha, recallCount: 1, readCount: 1 },
    ]);
  } finally {
    await client.close();
    await fixture.cleanup();
  }
});

test("N08 explicitly resolves Loadout, rejects terminal updates, gets missing Usage, and lists stable summaries", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n08-loadout-tools");
  try {
    const before = taskRows(fixture.databasePath).find((row) => (row as { task_id: string }).task_id === fixture.tasks.alpha) as {
      loadout_json: string;
      updated_at: string;
    };
    assert.deepEqual(JSON.parse(before.loadout_json).assets, []);

    const first = (await callTool(client, "task_loadout_resolve", { taskId: fixture.tasks.alpha })).structuredContent as {
      changed: boolean;
      ok: true;
      task: { loadout: { assets: Array<{ assetId: string; mode: string; reason: string }> }; updatedAt: string; workspace: string };
    };
    assert.equal(first.ok, true);
    assert.equal(first.changed, true);
    assert.equal(first.task.workspace, "alpha");
    assert.deepEqual(first.task.loadout.assets.map(({ assetId, mode, reason }) => ({ assetId, mode, reason })), [
      { assetId: fixture.assets.alpha, mode: "ON_DEMAND", reason: "DOCUMENT_ON_DEMAND" },
      { assetId: fixture.assets.global, mode: "DIRECT", reason: "MEMORY_STRONG_MATCH" },
    ]);
    assert.equal(usageRows(fixture.databasePath, fixture.tasks.alpha).length, 0);

    const second = (await callTool(client, "task_loadout_resolve", { taskId: fixture.tasks.alpha })).structuredContent as typeof first;
    assert.equal(second.changed, false);
    assert.equal(second.task.updatedAt, first.task.updatedAt);
    assertBusinessError(
      await callTool(client, "task_loadout_resolve", { taskId: fixture.tasks.completed }),
      "TASK_STATUS_NOT_ALLOWED",
      false,
    );

    await callSearch(client, fixture.tasks.alpha, "shared", 1);
    await unlink(fixture.paths.alphaAsset);
    await fixture.manager.synchronize();
    const get = (await callTool(client, "task_loadout_get", { taskId: fixture.tasks.alpha })).structuredContent as {
      ok: true;
      task: { status: string; usages: Array<{ assetId: string; assetMissing: boolean; usageId: string }> };
    };
    assert.equal(get.ok, true);
    assert.equal(get.task.status, "RUNNING");
    assert.deepEqual(get.task.usages.map(({ assetId, assetMissing }) => ({ assetId, assetMissing })), [
      { assetId: fixture.assets.alpha, assetMissing: true },
    ]);

    const all = (await callTool(client, "task_loadout_list", {})).structuredContent as {
      ok: true;
      items: Array<{ taskId: string; assetCount: number; estimatedCharacters: number }>;
    };
    assert.equal(all.items.length, 4);
    assert.equal(all.items.find(({ taskId }) => taskId === fixture.tasks.alpha)?.assetCount, 2);
    assert.equal((all.items.find(({ taskId }) => taskId === fixture.tasks.alpha)?.estimatedCharacters ?? 0) > 0, true);
    const alpha = (await callTool(client, "task_loadout_list", { workspace: "alpha" })).structuredContent as typeof all;
    assert.deepEqual(new Set(alpha.items.map(({ taskId }) => taskId)), new Set([fixture.tasks.alpha, fixture.tasks.completed]));
    const global = (await callTool(client, "task_loadout_list", { workspace: null })).structuredContent as typeof all;
    assert.deepEqual(global.items.map(({ taskId }) => taskId), [fixture.tasks.global]);
    const completed = (await callTool(client, "task_loadout_list", { status: "COMPLETED", limit: 1 })).structuredContent as typeof all;
    assert.deepEqual(completed.items.map(({ taskId }) => taskId), [fixture.tasks.completed]);
    for (const invalidLimit of [0, -1, 1.5, 101]) {
      const invalid = await callTool(client, "task_loadout_list", { limit: invalidLimit });
      assert.equal(invalid.isError, true);
      assert.equal(invalid.structuredContent, undefined);
    }
  } finally {
    await client.close();
    await fixture.cleanup();
  }
});

test("N08 Search/Read fail open on Usage failure while Mark Used fails and all failures are logged", async () => {
  const fixture = await createFixture();
  const client = await fixture.connect("n08-usage-fail-open");
  try {
    fixture.usageRepository.close();
    assert.equal(success(await callSearch(client, fixture.tasks.alpha, "shared")).items.length, 2);
    assert.equal(success(await callRead(client, fixture.tasks.alpha, fixture.assets.alpha)).asset.frontmatter.id, fixture.assets.alpha);
    assertBusinessError(
      await callTool(client, "asset_mark_used", { taskId: fixture.tasks.alpha, assetId: fixture.assets.alpha }),
      "USAGE_WRITE_FAILED",
      true,
    );
    assert.deepEqual(fixture.logEntries.map(({ event }) => event), [
      "USAGE_RECALL_WRITE_FAILED",
      "USAGE_READ_WRITE_FAILED",
      "USAGE_USED_WRITE_FAILED",
    ]);
  } finally {
    await client.close();
    await fixture.cleanup();
  }
});

test("N07 HTTP rejects foreign Host/Origin and keeps protocol failures distinct", async () => {
  const fixture = await createFixture();
  try {
    const badHost = await rawRequest(fixture.port, "{", { host: "example.com" });
    assert.equal(badHost.statusCode, 403);
    assert.match(badHost.body, /forbidden_host_or_origin/);

    const badOrigin = await rawRequest(fixture.port, "{", {
      host: `127.0.0.1:${fixture.port}`,
      origin: "https://example.com",
    });
    assert.equal(badOrigin.statusCode, 403);

    const malformed = await rawRequest(fixture.port, "{", {
      accept: "application/json, text/event-stream",
      host: `127.0.0.1:${fixture.port}`,
    });
    assert.equal(malformed.statusCode, 400);
    assert.match(malformed.body, /-32700|Parse error/i);
    assert.equal(malformed.body.includes(fixture.rootPath), false);
  } finally {
    await fixture.cleanup();
  }
});

test("N07 server configuration requires explicit absolute local data paths", () => {
  assert.throws(() => serverConfigurationFromEnvironment({}), ServerConfigurationError);
  assert.throws(
    () => serverConfigurationFromEnvironment({
      [SERVER_ASSET_REPOSITORY_PATH_ENV]: "relative-assets",
      CODEX_MEMORY_OS_DATABASE_PATH: "/tmp/catalog.sqlite",
      CODEX_MEMORY_OS_WORKSPACES_PATH: "/tmp/workspaces.json",
    }),
    ServerConfigurationError,
  );
  assert.throws(
    () => serverConfigurationFromEnvironment({
      [SERVER_ASSET_REPOSITORY_PATH_ENV]: "/tmp/assets",
      CODEX_MEMORY_OS_DATABASE_PATH: "/tmp/catalog.sqlite",
      CODEX_MEMORY_OS_LOG_PATH: "/tmp/codex-memory-os.log",
      CODEX_MEMORY_OS_WORKSPACES_PATH: "/tmp/workspaces.json",
      PORT: "70000",
    }),
    ServerConfigurationError,
  );
  assert.deepEqual(
    serverConfigurationFromEnvironment({
      [SERVER_ASSET_REPOSITORY_PATH_ENV]: "/tmp/assets",
      CODEX_MEMORY_OS_DATABASE_PATH: "/tmp/catalog.sqlite",
      CODEX_MEMORY_OS_LOG_PATH: "/tmp/codex-memory-os.log",
      CODEX_MEMORY_OS_WORKSPACES_PATH: "/tmp/workspaces.json",
      PORT: "43100",
    }),
    {
      assetRepositoryPath: "/tmp/assets",
      databasePath: "/tmp/catalog.sqlite",
      workspaceConfigPath: "/tmp/workspaces.json",
      logPath: "/tmp/codex-memory-os.log",
      port: 43100,
    },
  );
});

interface Fixture {
  assets: { alpha: string; beta: string; global: string };
  cleanup: () => Promise<void>;
  connect: (name: string) => Promise<Client>;
  databasePath: string;
  endpoint: string;
  indexStatusOverride: AssetIndexStatus | undefined;
  internalErrors: unknown[];
  logEntries: StructuredErrorLogInput[];
  manager: AssetIndexManager;
  paths: { alphaAsset: string };
  port: number;
  rootPath: string;
  startHttp: (port: number) => Promise<void>;
  stopHttp: () => Promise<void>;
  taskRepository: TaskRepository;
  tasks: { alpha: string; beta: string; completed: string; global: string };
  usageRepository: UsageRepository;
  workspaceConfigPath: string;
}

async function createFixture(): Promise<Fixture> {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-n07-"));
  const repositoryPath = join(rootPath, "asset-repository");
  const workspaceConfigPath = join(rootPath, "config", "workspaces.json");
  const databasePath = join(rootPath, "data", "codex-memory.sqlite");
  const alphaAsset = join(repositoryPath, "assets/workspaces/alpha/documents/alpha.md");
  const betaAsset = join(repositoryPath, "assets/workspaces/beta/memories/beta.md");
  const globalAsset = join(repositoryPath, "assets/global/memories/global.md");
  const assets = {
    alpha: idGenerator.next("ast"),
    beta: idGenerator.next("ast"),
    global: idGenerator.next("ast"),
  };
  await writeFixtureFile(
    workspaceConfigPath,
    JSON.stringify({
      schemaVersion: 1,
      workspaces: [
        { name: "alpha", paths: [join(rootPath, "alpha-workspace")] },
        { name: "beta", paths: [join(rootPath, "beta-workspace")] },
      ],
    }),
  );
  await writeFixtureFile(
    globalAsset,
    assetSource({ body: "shared global-only common guidance", id: assets.global, scope: "GLOBAL", type: "MEMORY" }),
  );
  await writeFixtureFile(
    alphaAsset,
    assetSource({
      body: "shared alpha-only 中 workspace guidance",
      id: assets.alpha,
      scope: "WORKSPACE",
      type: "DOCUMENT",
      workspace: "alpha",
    }),
  );
  await writeFixtureFile(
    betaAsset,
    assetSource({
      body: "shared beta-only workspace guidance",
      id: assets.beta,
      scope: "WORKSPACE",
      type: "MEMORY",
      workspace: "beta",
    }),
  );

  const manager = await AssetIndexManager.create({ databasePath, repositoryPath, workspaceConfigPath });
  await manager.synchronize();
  const taskRepository = new TaskRepository(databasePath);
  const taskService = new TaskApplicationService(taskRepository);
  const usageRepository = new UsageRepository(databasePath);
  const usageService = new UsageApplicationService(usageRepository);
  const tasks = {
    alpha: createTask(taskService, "alpha", "alpha-session", "shared"),
    beta: createTask(taskService, "beta", "beta-session", "shared"),
    global: createTask(taskService, null, "global-session", "shared"),
    completed: createTask(taskService, "alpha", "completed-session", "shared"),
  };
  taskService.updateStatus(tasks.completed, "COMPLETED");
  const searchService = new AssetSearchService({
    databasePath,
    repositoryPath,
    workspaceConfigPath,
    refreshIndex: async () => await manager.synchronize(),
  });
  const assetProjection = new LoadoutAssetProjectionRepository(databasePath);
  const loadoutService = new TaskLoadoutApplicationService({
    assetProjection,
    assetSearchService: searchService,
    taskRepository,
    taskService,
    usageService,
  });
  const internalErrors: unknown[] = [];
  const logEntries: StructuredErrorLogInput[] = [];
  const logger: StructuredLogger = { error: (entry) => { logEntries.push(entry); } };
  let httpServer: Server | undefined;
  let port = await allocatePort();
  let endpoint = `http://127.0.0.1:${port}/mcp`;
  let indexStatusOverride: AssetIndexStatus | undefined;

  const fixture: Fixture = {
    assets,
    databasePath,
    endpoint,
    indexStatusOverride,
    internalErrors,
    logEntries,
    manager,
    paths: { alphaAsset },
    port,
    rootPath,
    taskRepository,
    tasks,
    usageRepository,
    workspaceConfigPath,
    connect: async (name) => {
      const client = new Client({ name, version: "0.0.0" });
      await client.connect(clientTransport(fixture.endpoint));
      return client;
    },
    startHttp: async (requestedPort) => {
      assert.equal(httpServer, undefined);
      const handler = createMcpHttpRequestHandler({
        assetSearchService: searchService,
        indexStatus: () => fixture.indexStatusOverride ?? manager.status(),
        loadoutService,
        logger,
        onInternalError: (error) => internalErrors.push(error),
        taskService,
        usageService,
      });
      httpServer = createServer((incoming, outgoing) => void handler(incoming, outgoing));
      await listen(httpServer, requestedPort);
      port = requestedPort;
      endpoint = `http://127.0.0.1:${port}/mcp`;
      fixture.port = port;
      fixture.endpoint = endpoint;
    },
    stopHttp: async () => {
      if (httpServer === undefined) {
        return;
      }
      const current = httpServer;
      httpServer = undefined;
      await closeServer(current);
    },
    cleanup: async () => {
      await fixture.stopHttp();
      searchService.close();
      assetProjection.close();
      usageRepository.close();
      taskRepository.close();
      await manager.close();
      await rm(rootPath, { force: true, recursive: true });
    },
  };
  await fixture.startHttp(port);
  return fixture;
}

function createTask(
  service: TaskApplicationService,
  workspace: string | null,
  session: string,
  request = `${session} request`,
): string {
  return service.resolveTask({
    sourceSessionId: session,
    sourceTurnId: "turn-1",
    request,
    workspace,
  }).task.taskId;
}

async function callSearch(client: Client, taskId: string, query: string, limit?: number): Promise<CallToolResult> {
  return await client.callTool({
    name: "asset_search",
    arguments: { taskId, query, ...(limit === undefined ? {} : { limit }) },
  }) as CallToolResult;
}

async function callRead(client: Client, taskId: string, assetId: string): Promise<CallToolResult> {
  return await client.callTool({ name: "asset_read", arguments: { taskId, assetId } }) as CallToolResult;
}

async function callTool(client: Client, name: string, arguments_: Record<string, unknown>): Promise<CallToolResult> {
  return await client.callTool({ name, arguments: arguments_ }) as CallToolResult;
}

interface SuccessOutput {
  asset: {
    contentHash: string;
    frontmatter: { id: string };
    markdown: string;
  };
  items: Array<{ assetId: string; searchStrategy: string }>;
  ok: true;
}

function success(result: CallToolResult): SuccessOutput {
  assert.notEqual(result.isError, true, textContent(result));
  const output = result.structuredContent as unknown as SuccessOutput;
  assert.equal(output.ok, true);
  return output;
}

function assertBusinessError(
  result: CallToolResult,
  code: string,
  retryable: boolean,
): void {
  assert.equal(result.isError, true);
  const output = result.structuredContent as {
    error: { code: string; message: string; retryable: boolean };
    ok: false;
  };
  assert.equal(output.ok, false);
  assert.equal(output.error.code, code);
  assert.equal(output.error.retryable, retryable);
  assert.equal(textContent(result), `[${code}] ${output.error.message}`);
}

function textContent(result: CallToolResult): string {
  const first = result.content[0];
  return first !== undefined && first.type === "text" ? first.text : "";
}

function assetIdOf(item: { assetId: string }): string {
  return item.assetId;
}

function taskRows(databasePath: string): unknown[] {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.prepare("SELECT * FROM task_loadout ORDER BY task_id").all();
  } finally {
    database.close();
  }
}

function databaseObjects(databasePath: string): string[] {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database
      .prepare("SELECT name FROM sqlite_master ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);
  } finally {
    database.close();
  }
}

function usageRows(databasePath: string, taskId: string): Array<{
  assetId: string;
  readCount: number;
  recallCount: number;
}> {
  const database = new Database(databasePath, { readonly: true });
  try {
    return database.prepare(`
      SELECT asset_id AS assetId, recall_count AS recallCount, read_count AS readCount
      FROM task_asset_usage
      WHERE task_id = ?
      ORDER BY asset_id
    `).all(taskId) as Array<{ assetId: string; readCount: number; recallCount: number }>;
  } finally {
    database.close();
  }
}

function unavailableIndexStatus(): AssetIndexStatus {
  return {
    catalogCount: null,
    diagnostics: [],
    ftsCount: null,
    indexState: "REBUILD_REQUIRED",
    lastSuccessfulScanAt: null,
    rebuildRequired: true,
    watcherState: "NOT_STARTED",
  };
}

function assetSource(input: {
  body: string;
  id: string;
  scope: AssetScope;
  type: AssetType;
  workspace?: string;
}): string {
  return [
    "---",
    `id: ${input.id}`,
    `type: ${input.type}`,
    `scope: ${input.scope}`,
    ...(input.workspace === undefined ? [] : [`workspace: ${input.workspace}`]),
    "title: Shared Asset",
    "summary: shared searchable summary",
    "---",
    input.body,
    "",
  ].join("\n");
}

async function writeFixtureFile(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

function sha256(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

async function allocatePort(): Promise<number> {
  const server = createServer();
  await listen(server, 0);
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const port = typeof address === "object" && address !== null ? address.port : 0;
  await closeServer(server);
  return port;
}

async function listen(server: Server, port: number): Promise<void> {
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveListen);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error === undefined ? resolveClose() : reject(error)));
    server.closeAllConnections();
  });
}

async function rawRequest(
  port: number,
  body: string,
  headers: Record<string, string>,
): Promise<{ body: string; statusCode: number }> {
  return await new Promise((resolve, reject) => {
    const outgoing = request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": String(Buffer.byteLength(body)),
          ...headers,
        },
      },
      (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk: string) => {
          responseBody += chunk;
        });
        response.on("end", () => resolve({ body: responseBody, statusCode: response.statusCode ?? 0 }));
      },
    );
    outgoing.once("error", reject);
    outgoing.end(body);
  });
}

function clientTransport(endpoint: string): Transport {
  return new StreamableHTTPClientTransport(new URL(endpoint)) as unknown as Transport;
}
