import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { Backend } from "./backend.js";
import { cleanEnvironment, executeFile, readConfiguration, type LocalConfig } from "./config.js";

export async function allocatePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("临时端口不可用");
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

export async function prepareFixture(resources: string, directory: string): Promise<{ config: LocalConfig; capability: string; assetId: string }> {
  const { config: original } = await readConfiguration(resources);
  const repository = join(directory, "repository");
  const config: LocalConfig = { ...original,
    assetRepositoryPath: repository, databasePath: join(directory, "test.sqlite"),
    workspaceConfigPath: join(directory, "workspaces.json"), logPath: join(directory, "server.log"),
    desktopLogPath: join(directory, "desktop.log"), port: await allocatePort(),
  };
  const assetId = "ast2034512345678901248";
  await mkdir(join(repository, "assets/workspaces/alpha/memories"), { recursive: true });
  await writeFile(config.workspaceConfigPath, JSON.stringify({ schemaVersion: 1,
    workspaces: [{ name: "alpha", paths: [directory] }] }));
  await writeFile(join(repository, `assets/workspaces/alpha/memories/${assetId}.md`),
    `---\nid: ${assetId}\ntype: MEMORY\nscope: WORKSPACE\nworkspace: alpha\ntitle: 桌面验收\nsummary: 桌面验收唯一词\n---\n\n# 桌面验收\n\n桌面验收唯一词。\n`);
  // Execute the packaged ordinary-Node code only against this newly-created fixture.
  const { stdout } = await executeFile(config.nodePath, ["--input-type=module", "-e", `
    import {pathToFileURL} from 'node:url'; import {join} from 'node:path';
    const [dist,db,config,cwd]=process.argv.slice(1);
    const {migrateKnowledge}=await import(pathToFileURL(join(dist,'knowledge/repository.js')));
    const {handleCodexHook}=await import(pathToFileURL(join(dist,'hook/user-prompt-submit.js')));
    migrateKnowledge(db,false,true);
    const output=JSON.parse(await handleCodexHook({hook_event_name:'UserPromptSubmit',cwd},{databasePath:db,workspaceConfigPath:config}));
    console.log(JSON.stringify(JSON.parse(output.hookSpecificOutput.additionalContext.split('\\n')[1])[0].capabilityId));
  `, join(resources, "runtime/apps/server/dist"), config.databasePath, config.workspaceConfigPath, directory], {
    cwd: directory, env: cleanEnvironment(), timeout: 15000,
  });
  return { config, capability: z.string().parse(JSON.parse(stdout)), assetId };
}

async function callTool(origin: string, name: string, args: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${origin}/mcp`, { method: "POST", signal: AbortSignal.timeout(10000),
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  assert.equal(response.status, 200);
  const body = await response.text();
  const json: unknown = response.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(body.split("\n").find(line => line.startsWith("data: "))?.slice(6) ?? "null") : JSON.parse(body);
  const result = z.object({ result: z.object({ isError: z.literal(false).optional(),
    content: z.array(z.object({ type: z.literal("text"), text: z.string() })).min(1) }) }).parse(json);
  return JSON.parse(result.result.content[0]!.text) as unknown;
}

export async function verifyPackagedService(resources: string): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "codex-desktop-service-"));
  let backend: Backend | undefined;
  try {
    const { config, capability, assetId } = await prepareFixture(resources, directory);
    const { build } = await readConfiguration(resources);
    backend = new Backend(join(resources, "runtime"), config, build);
    await backend.start();
    assert.equal((await fetch(backend.origin)).status, 200);
    const recalled = z.object({ items: z.array(z.object({ assetId: z.string(), recallItemId: z.string() })).min(1) }).parse(
      await callTool(backend.origin, "knowledge_recall", { capabilityIds: [capability], queries: ["桌面验收唯一词"] }));
    assert.equal(recalled.items[0]!.assetId, assetId);
    const read = z.object({ readRef: z.string(), markdown: z.string() }).parse(await callTool(backend.origin, "asset_read", {
      capabilityIds: [capability], recallItemId: recalled.items[0]!.recallItemId,
    }));
    assert.match(read.markdown, /桌面验收唯一词/);
    const used = z.object({ created: z.boolean() }).parse(await callTool(backend.origin, "asset_mark_used", {
      capabilityIds: [capability], readRef: read.readRef,
    }));
    assert.equal(used.created, true);
    assert.equal((await fetch(`${backend.origin}/api/assets`, { headers: { origin: "https://invalid.example" } })).status, 403);
    // Keep an actual /mcp HTTP request body open while stopping the packaged runtime.
    const active = request(`${backend.origin}/mcp`, { method: "POST", headers: {
      "content-type": "application/json", accept: "application/json, text/event-stream",
    } });
    active.on("error", () => { /* Closing an active request is an expected shutdown result. */ });
    const closed = new Promise<void>(resolve => active.once("close", resolve));
    active.write('{"jsonrpc":"2.0",');
    active.flushHeaders();
    await new Promise<void>(resolve => active.once("socket", socket => {
      if (socket.connecting) socket.once("connect", resolve); else resolve();
    }));
    await backend.stop();
    await closed;
    process.stdout.write(JSON.stringify({ isolatedService: "PASS", buildId: build.buildId, checks: ["IPC", "readiness", "Hub", "Recall/Read/Used", "Origin", "shutdown"] }) + "\n");
  } finally {
    await backend?.stop();
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appPath = process.argv[2];
  if (!appPath || !isAbsolute(appPath) || !appPath.endsWith(".app")) {
    throw new Error("请提供待验收 .app 的绝对路径");
  }
  await verifyPackagedService(join(appPath, "Contents/Resources"));
}
