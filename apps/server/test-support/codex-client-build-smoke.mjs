// Real installed Codex CLI, isolated home/data, scripted local Responses endpoint.
// This tests client transport/lifecycle, not live-model quality or Desktop trust UI.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { startCodexMemoryOsServer } from "../dist/runtime.js";

const directory = await mkdtemp(join(tmpdir(), "memory-codex-client-"));
const codexHome = join(directory, "codex");
const repository = join(directory, "repository");
const databasePath = join(directory, "runtime.sqlite");
const workspaces = join(directory, "workspaces.json");
const logPath = join(directory, "hook.log");
const hookModule = new URL("../dist/hook/user-prompt-submit.js", import.meta.url).href;
let runtime; let db; let current; let responseId = 0;
const model = createServer(async (request, response) => {
  if (request.url !== "/v1/responses") { response.writeHead(404); response.end(); return; }
  try {
    let body = ""; for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    current.requests.push(payload);
    const taskId = JSON.stringify(payload.input).match(/taskId: (tsk[0-9]+)/)?.[1];
    const tool = current.tools.shift();
    const item = tool === undefined
      ? { id: `msg_${++responseId}`, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: "ISOLATED_CLIENT_COMPLETE", annotations: [] }] }
      : { id: `fc_${++responseId}`, type: "function_call", call_id: `call_${responseId}`, namespace: "mcp__memory", name: tool, arguments: JSON.stringify({ ...(tool === "task_loadout_list" ? {} : { taskId }), ...(tool === "asset_search" ? { query: "clienttoken" } : tool === "asset_read" || tool === "asset_mark_used" ? { assetId: "ast301" } : {}) }), status: "completed" };
    const result = { id: `resp_${responseId}`, object: "response", created_at: 1900000000, status: "completed", model: "fixture", output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } };
    response.writeHead(200, { "content-type": "text/event-stream" });
    for (const event of [
      { type: "response.created", response: { ...result, status: "in_progress", output: [] } },
      { type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress" } },
      { type: "response.output_item.done", output_index: 0, item },
      { type: "response.completed", response: result },
    ]) response.write(`data: ${JSON.stringify(event)}\n\n`);
    response.end();
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});

try {
  await mkdir(codexHome);
  await mkdir(join(repository, "assets/global/memories"), { recursive: true });
  await writeFile(workspaces, JSON.stringify({ schemaVersion: 1, workspaces: [] }));
  await writeFile(join(repository, "assets/global/memories/client.md"), "---\nid: ast301\ntype: MEMORY\nscope: GLOBAL\ntitle: clienttoken\nsummary: clienttoken CURRENT_CLIENT_SUMMARY\n---\nCLIENT_BODY_MARKER\n");
  const portProbe = createServer();
  await new Promise(resolve => portProbe.listen(0, "127.0.0.1", resolve));
  const servicePort = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  runtime = await startCodexMemoryOsServer({ assetRepositoryPath: repository, databasePath, workspaceConfigPath: workspaces, logPath, port: servicePort });
  db = new Database(databasePath);
  await new Promise(resolve => model.listen(0, "127.0.0.1", resolve));
  await writeFile(join(codexHome, "config.toml"), `model = "fixture"\nmodel_provider = "fixture"\ncli_auth_credentials_store = "file"\n[model_providers.fixture]\nname = "Isolated protocol fixture"\nbase_url = "http://127.0.0.1:${model.address().port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\n[mcp_servers.memory]\nurl = ${JSON.stringify(`http://127.0.0.1:${runtime.server.address().port}/mcp`)}\nrequired = false\n`);
  const wrapper = join(directory, "hook.mjs");
  const environment = { CODEX_MEMORY_OS_DATABASE_PATH: databasePath, CODEX_MEMORY_OS_WORKSPACES_PATH: workspaces, CODEX_MEMORY_OS_ASSET_REPOSITORY_PATH: repository, CODEX_MEMORY_OS_LOG_PATH: logPath };
  await writeFile(wrapper, `import { runHookCli } from ${JSON.stringify(hookModule)}; process.exitCode = await runHookCli(process.stdin, process.stdout, process.stderr, ${JSON.stringify(environment)});`);
  const hooks = { hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: `${JSON.stringify(process.execPath)} ${JSON.stringify(wrapper)}`, timeout: 5, additionalContextLimit: 3000 }] }] } };
  await writeFile(join(codexHome, "hooks.json"), JSON.stringify(hooks));

  const untrusted = await run("untrusted", false);
  assert.equal(db.prepare("SELECT * FROM task_loadout").all().length, 0, "Untrusted Hook must not run");
  assert.doesNotMatch(JSON.stringify(untrusted.requests), /CodexMemoryOS Task Context/);

  const first = await run("clienttoken", true, ["task_loadout_resolve", "asset_search", "asset_read", "asset_mark_used", "task_loadout_get", "task_loadout_list"]);
  const task = db.prepare("SELECT * FROM task_loadout").get();
  assert.ok(task);
  assert.match(JSON.stringify(first.requests), /CodexMemoryOS Task Context/);
  assert.ok(JSON.stringify(first.requests).includes("CLIENT_BODY_MARKER"), "Actual client MCP Read must return fixture body");
  assert.doesNotMatch(first.stdout, /tool execution failed|unknown tool|error calling tool/i);
  const calls = first.stdout.trim().split("\n").map(line => JSON.parse(line)).filter(event => event.type === "item.completed" && event.item?.type === "mcp_tool_call");
  assert.equal(calls.length, 6);
  assert.ok(calls.every(event => event.item.status === "completed" && event.item.result?.structured_content?.ok === true));
  const rows = () => db.prepare("SELECT * FROM task_asset_usage ORDER BY usage_id").all();
  const before = rows();
  assert.equal(before.length, 1); assert.equal(before[0].read_count, 1); assert.equal(before[0].used_flag, 1);
  const threadId = JSON.parse(first.stdout.split("\n").find(line => line.includes('"thread.started"'))).thread_id;
  const resumed = await run("same Session new Turn", true, [], threadId);
  assert.match(JSON.stringify(resumed.requests), /CURRENT_CLIENT_SUMMARY/);
  assert.deepEqual(rows(), before);
  const attached = await run(`attach taskId: ${task.task_id}`);
  assert.match(JSON.stringify(attached.requests), /CURRENT_CLIENT_SUMMARY/);
  assert.deepEqual(rows(), before);
  assert.equal(db.prepare("SELECT * FROM task_loadout").get().loadout_json, task.loadout_json);
  assert.equal(db.prepare("SELECT * FROM task_turn_binding").all().length, 3);

  await runtime.close(); runtime = undefined;
  await run(`MCP offline, taskId: ${task.task_id}`);
  assert.deepEqual(rows(), before);
  runtime = await startCodexMemoryOsServer({ assetRepositoryPath: repository, databasePath, workspaceConfigPath: workspaces, logPath, port: servicePort });
  const restarted = await run("same Session after service restart", true, ["task_loadout_get"], threadId);
  assert.match(restarted.stdout, /"type":"mcp_tool_call"/);
  assert.doesNotMatch(restarted.stdout, /"status":"failed"/);
  assert.deepEqual(rows(), before);
  assert.equal(db.prepare("SELECT * FROM task_loadout").get().loadout_json, task.loadout_json);

  await writeFile(workspaces, "invalid JSON");
  const unavailable = await run("optional knowledge unavailable");
  assert.doesNotMatch(JSON.stringify(unavailable.requests), /CURRENT_CLIENT_SUMMARY|CodexMemoryOS Task Context/);
  assert.deepEqual(rows(), before);
  // Exercise an unexpected fault at the production CLI boundary, not a fake exit.
  await writeFile(wrapper, `import { Readable } from 'node:stream'; import { runHookCli } from ${JSON.stringify(hookModule)}; process.exitCode = await runHookCli(new Readable({read(){this.destroy(new Error('isolated unexpected fault'));}}),process.stdout,process.stderr,${JSON.stringify(environment)});`);
  const unexpected = await run("unexpected Hook fault");
  assert.doesNotMatch(JSON.stringify(unexpected.requests), /CURRENT_CLIENT_SUMMARY|CodexMemoryOS Task Context/);
  assert.match(await readFile(logPath, "utf8"), /HOOK_INTERNAL_ERROR/);
  assert.deepEqual(rows(), before);
  console.log(JSON.stringify({ event: "REAL_CODEX_CLI_ISOLATED_PROTOCOL", status: "ok", cases: 8, mcpTools: 6, model: "scripted loopback Responses fixture; no live model", desktopTrust: "not tested", taskId: task.task_id, usage: before }));
} finally {
  db?.close(); await runtime?.close(); await new Promise(resolve => model.close(resolve));
  await rm(directory, { recursive: true, force: true });
}

async function run(prompt, trust = true, tools = [], resume) {
  current = { requests: [], tools: [...tools] };
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.env.CODEX_MEMORY_OS_TEST_CODEX ?? "/opt/homebrew/bin/codex", ["exec", "--sandbox", "read-only", "-C", directory, ...(resume ? ["resume"] : []), "--skip-git-repo-check", "--json", ...(trust ? ["--dangerously-bypass-hook-trust"] : []), ...(resume ? [resume] : []), prompt], {
      env: { PATH: process.env.PATH, HOME: directory, CODEX_HOME: codexHome, TMPDIR: tmpdir() }, stdio: ["ignore", "pipe", "pipe"], timeout: 30000,
    });
    let stdout = ""; let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk); child.stderr.on("data", chunk => stderr += chunk);
    child.on("error", reject); child.on("close", code => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 0, `${result.stderr}\n${result.stdout}`);
  assert.match(result.stdout, /turn.completed/);
  assert.ok(current.requests.length > 0, "Prompt must reach the model transport");
  console.log(JSON.stringify({ case: prompt, code: result.code, requests: current.requests.length, events: result.stdout }));
  return { ...result, requests: current.requests };
}
