import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { getRequestListener } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SnowflakeIdGenerator } from "@codex-memory-os/id-generator";
import Database from "better-sqlite3";

// The same filesystem/HTTP assertions also exercise compiled production modules.
const moduleRoot = new URL(process.env.CODEX_MEMORY_OS_TEST_DIST === "1" ? "../dist/" : "../src/", import.meta.url);
console.log(`F02_PRODUCTION_MODULE_ROOT ${moduleRoot.href}`);
const assets: typeof import("../src/asset/index.js") = await import(new URL("asset/index.js", moduleRoot).href);
const tasks: typeof import("../src/task/index.js") = await import(new URL("task/index.js", moduleRoot).href);
const usages: typeof import("../src/usage/index.js") = await import(new URL("usage/index.js", moduleRoot).href);
const loadouts: typeof import("../src/loadout/index.js") = await import(new URL("loadout/index.js", moduleRoot).href);
const http: typeof import("../src/http/index.js") = await import(new URL("http/index.js", moduleRoot).href);
const mcp: typeof import("../src/mcp/index.js") = await import(new URL("mcp/index.js", moduleRoot).href);
const { createApp }: typeof import("../src/app.js") = await import(new URL("app.js", moduleRoot).href);
const ids = new SnowflakeIdGenerator();
const pathCases = ["root", "assets-parent", "global-parent", "parent-outside", "parent-inside", "file", "prefix-sibling", "parent-missing", "root-missing"] as const;
type PathCase = typeof pathCases[number];

for (const pathCase of pathCases) {
  for (const existingUsage of [false, true]) {
    test(`F02 ${pathCase}, existing Usage=${existingUsage}: all current readers reject a stale Catalog path`, async (t) => {
      const fixture = await createFixture();
      try {
        if (existingUsage) fixture.usageService.recordRead(fixture.taskId, fixture.assetId);
        const usageBefore = fixture.usageRows();
        const catalogBefore = fixture.catalogRows();
        await replacePath(fixture, pathCase);
        const full = await assets.scanAssetRepository(fixture);
        const targeted = await assets.scanAssetFiles({ ...fixture, relativePaths: [fixture.assetPath] });
        let readReturned = false;
        try {
          const read = await fixture.search.read({ assetId: fixture.assetId, context: { workspace: null } });
          readReturned = read.markdown.includes("F02_PRIVATE_BODY");
        } catch (error) {
          assert.ok(error instanceof assets.AssetNotAccessibleError || error instanceof assets.AssetSearchUnavailableError);
        }
        const results: Record<string, CallToolResult> = {};
        const usageAfterCalls: Record<string, unknown> = {};
        for (const name of ["asset_read", "asset_mark_used", "asset_search"]) {
          results[name] = await fixture.client.callTool({ name, arguments: name === "asset_search"
            ? { taskId: fixture.taskId, query: "F02_PRIVATE_BODY" }
            : { taskId: fixture.taskId, assetId: fixture.assetId } }) as CallToolResult;
          usageAfterCalls[name] = fixture.usageRows();
        }
        const hub = await fetch(`${fixture.origin}/api/assets/${fixture.assetId}`);
        const hubBody = await hub.text();
        const evidence = {
          pathCase, existingUsage,
          fullAccepted: full.assets.some((asset) => asset.frontmatter.id === fixture.assetId),
          fullDiagnostics: full.diagnostics.map((item) => item.code),
          targetedAccepted: targeted.assets.some((asset) => asset.frontmatter.id === fixture.assetId),
          targetedDiagnostics: targeted.diagnostics.map((item) => item.code),
          applicationReadReturned: readReturned,
          mcpReadRejected: results.asset_read?.isError === true,
          mcpUsedRejected: results.asset_mark_used?.isError === true,
          searchReturnedPrivate: JSON.stringify(results.asset_search).includes("F02_PRIVATE_BODY"),
          searchReturnedAsset: JSON.stringify(results.asset_search).includes(fixture.assetId),
          hubStatus: hub.status,
          usageUnchanged: JSON.stringify(fixture.usageRows()) === JSON.stringify(usageBefore),
        };
        t.diagnostic(`F02_EVIDENCE ${JSON.stringify(evidence)}`);
        assert.equal(evidence.fullAccepted, false);
        assert.equal(evidence.applicationReadReturned, false, "Current Application Read must reject a path rejected by the full Scanner");
        assert.equal(evidence.targetedAccepted, false);
        assert.ok(targeted.diagnostics.some((item) => ["SYMLINK", "REPOSITORY_UNAVAILABLE", "FILE_READ_ERROR"].includes(item.code)));
        assert.equal(evidence.mcpReadRejected, true);
        assert.equal(evidence.mcpUsedRejected, true);
        assert.equal(evidence.searchReturnedPrivate, false);
        assert.equal(evidence.searchReturnedAsset, false);
        assert.doesNotMatch(hubBody, /F02_PRIVATE_BODY/u);
        assert.ok([404, 409, 503].includes(hub.status));
        assert.deepEqual(fixture.usageRows(), usageBefore, "Failed Read/Used and excluded Search must preserve every Usage field");
        for (const [name, rows] of Object.entries(usageAfterCalls)) {
          assert.deepEqual(rows, usageBefore, `${name} must preserve every Usage field immediately after the call`);
        }
        assert.deepEqual(fixture.catalogRows(), catalogBefore, "No watcher or refresh may erase the stale Catalog test window");
        if (pathCase !== "root" && pathCase !== "root-missing" && pathCase !== "assets-parent") {
          const valid = await fixture.search.read({ assetId: fixture.validId, context: { workspace: "alpha" } });
          assert.match(valid.markdown, /VALID_SIBLING/u);
        }
      } finally {
        await fixture.close();
      }
    });
  }
}

test("F02 preserves edits, deletion, legal moves, raw hashes and configured roots beneath system path aliases", async () => {
  const fixture = await createFixture();
  try {
    const changed = `${fixture.source}\n正常修改 café e\u0301\r\n`;
    await writeFile(join(fixture.repositoryPath, fixture.assetPath), changed);
    const read = await fixture.search.read({ assetId: fixture.assetId, context: { workspace: null } });
    assert.equal(read.markdown, changed);
    assert.equal(read.contentHash, hash(changed));
    await fixture.index.synchronize();
    const moved = "assets/global/memories/moved.md";
    await rename(join(fixture.repositoryPath, fixture.assetPath), join(fixture.repositoryPath, moved));
    await assert.rejects(fixture.search.read({ assetId: fixture.assetId, context: { workspace: null } }));
    await fixture.index.synchronize();
    assert.equal((await fixture.search.read({ assetId: fixture.assetId, context: { workspace: null } })).markdown, changed);
    await unlink(join(fixture.repositoryPath, moved));
    const deleted = await assets.scanAssetFiles({ ...fixture, relativePaths: [moved] });
    assert.equal(deleted.assets.length, 0);
    await assert.rejects(fixture.search.read({ assetId: fixture.assetId, context: { workspace: null } }));

    // The configured Repository root is regular; a symlink ABOVE it is allowed.
    const parentAlias = join(fixture.rootPath, "parent-alias");
    await symlink(fixture.rootPath, parentAlias);
    const aliased = { ...fixture, repositoryPath: join(parentAlias, "repository") };
    const full = await assets.scanAssetRepository(aliased);
    const targeted = await assets.scanAssetFiles({ ...aliased, relativePaths: [fixture.validPath] });
    assert.deepEqual(full.assets.map((asset) => asset.frontmatter.id), [fixture.validId]);
    assert.deepEqual(targeted.assets.map((asset) => asset.frontmatter.id), [fixture.validId]);
  } finally {
    await fixture.close();
  }
});

test("F02 rejects lexical sibling-prefix and absolute paths without widening the Repository", async () => {
  const fixture = await createFixture();
  try {
    const sibling = `${fixture.repositoryPath}-outside`;
    await mkdir(sibling);
    await writeFile(join(sibling, "one.md"), fixture.source);
    for (const path of ["../repository-outside/one.md", "assets/../../repository-outside/one.md", join(sibling, "one.md")]) {
      const scan = await assets.scanAssetFiles({ ...fixture, relativePaths: [path] });
      assert.equal(scan.assets.length, 0);
      assert.deepEqual(scan.diagnostics.map((item) => item.code), ["INVALID_ASSET_PATH"]);
    }
  } finally {
    await fixture.close();
  }
});

async function replacePath(fixture: Awaited<ReturnType<typeof createFixture>>, pathCase: PathCase) {
  const original = join(fixture.repositoryPath, fixture.assetPath);
  let sourcePath = dirname(original);
  let destination = join(fixture.rootPath, "outside-parent");
  if (pathCase === "root" || pathCase === "root-missing") sourcePath = fixture.repositoryPath;
  if (pathCase === "assets-parent") sourcePath = join(fixture.repositoryPath, "assets");
  if (pathCase === "global-parent") sourcePath = join(fixture.repositoryPath, "assets/global");
  if (pathCase === "parent-inside") destination = join(fixture.repositoryPath, "held-parent");
  if (pathCase === "prefix-sibling") destination = `${fixture.repositoryPath}-outside`;
  if (pathCase === "file") {
    sourcePath = original;
    destination = join(fixture.rootPath, "outside-file.md");
  }
  await rename(sourcePath, destination);
  if (pathCase === "root-missing" || pathCase === "parent-missing") return;
  await symlink(destination, sourcePath);
  // The audit counterexample changes only location: exact bytes, ID and hash survive.
  assert.equal(await readFile(original, "utf8"), fixture.source);
  assert.equal(hash(await readFile(original, "utf8")), hash(fixture.source));
  assert.notEqual(await realpath(original), original);
}

function hash(source: string) { return createHash("sha256").update(Buffer.from(source)).digest("hex"); }

async function createFixture() {
  const rootPath = await mkdtemp(join(tmpdir(), "codex-memory-os-f02-"));
  const repositoryPath = join(rootPath, "repository");
  const workspaceConfigPath = join(rootPath, "workspaces.json");
  const databasePath = join(rootPath, "memory.sqlite");
  const assetId = ids.next("ast");
  const validId = ids.next("ast");
  const assetPath = "assets/global/memories/one.md";
  const validPath = "assets/workspaces/alpha/documents/valid.md";
  const source = `---\nid: ${assetId}\ntype: MEMORY\nscope: GLOBAL\ntitle: private\nsummary: private summary\n---\nF02_PRIVATE_BODY 中文正文\n`;
  // A sibling in another Workspace survives intermediate directory replacements.
  const validAssetPath = validPath;
  await mkdir(dirname(join(repositoryPath, assetPath)), { recursive: true });
  await mkdir(dirname(join(repositoryPath, validAssetPath)), { recursive: true });
  await writeFile(join(repositoryPath, assetPath), source);
  await writeFile(join(repositoryPath, validAssetPath), `---\nid: ${validId}\ntype: DOCUMENT\nscope: WORKSPACE\nworkspace: alpha\ntitle: valid\nsummary: valid\n---\nVALID_SIBLING\n`);
  await writeFile(workspaceConfigPath, JSON.stringify({ schemaVersion: 1, workspaces: [{ name: "alpha", paths: [join(rootPath, "workspace-alpha")] }] }));
  const options = { repositoryPath, workspaceConfigPath, databasePath };
  const index = await assets.AssetIndexManager.create(options);
  await index.synchronize();
  const taskRepository = new tasks.TaskRepository(databasePath);
  const taskService = new tasks.TaskApplicationService(taskRepository);
  const taskId = taskService.resolveTask({ request: "F02", sourceSessionId: "f02-session", sourceTurnId: "f02-turn", workspace: null }).task.taskId;
  const usageRepository = new usages.UsageRepository(databasePath);
  const usageService = new usages.UsageApplicationService(usageRepository);
  // Deliberately hold the old Catalog: only explicit test calls synchronize it.
  const search = new assets.AssetSearchService({ ...options, refreshIndex: async () => undefined });
  const projection = new loadouts.LoadoutAssetProjectionRepository(databasePath);
  const loadoutService = new loadouts.TaskLoadoutApplicationService({ assetProjection: projection, assetSearchService: search, taskRepository, taskService, usageService });
  const inboxService = new assets.InboxApplicationService(options, search);
  const indexStatus = () => index.status();
  const handler = mcp.createMcpHttpRequestHandler({ assetSearchService: search, taskService, usageService, loadoutService, indexStatus, logger: { error: () => undefined } });
  const server = createServer();
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const app = createApp({
    allowedAuthority: `127.0.0.1:${address.port}`, inboxService, loadoutService, usageService, indexStatus,
    assetService: new http.HubAssetApplicationService(search, loadoutService, usageService),
    overviewService: new http.OverviewApplicationService({ ...options, inboxService, taskRepository, usageRepository }),
    systemStatusService: new http.SystemStatusApplicationService({ ...options, inboxService, indexStatus, mcpEndpointReady: () => true }),
  });
  const rest = getRequestListener(app.fetch);
  server.on("request", (request, response) => void (request.url === "/mcp" ? handler(request, response) : rest(request, response)));
  const client = new Client({ name: "f02-path-security", version: "0.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${origin}/mcp`)) as unknown as Transport);
  const database = new Database(databasePath, { readonly: true });
  return {
    ...options, rootPath, assetId, validId, assetPath, validPath: validAssetPath, source, search, index, taskId, usageService, client, origin,
    usageRows: () => database.prepare("SELECT * FROM task_asset_usage ORDER BY usage_id").all(),
    catalogRows: () => database.prepare("SELECT * FROM asset_catalog ORDER BY asset_id").all(),
    close: async () => {
      await client.close();
      await new Promise<void>((resolve, reject) => { server.close((error) => error ? reject(error) : resolve()); server.closeAllConnections(); });
      database.close(); search.close(); projection.close(); usageRepository.close(); taskRepository.close();
      await index.close();
      await rm(rootPath, { recursive: true, force: true });
    },
  };
}
