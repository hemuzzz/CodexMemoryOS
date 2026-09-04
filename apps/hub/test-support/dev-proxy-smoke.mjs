import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const hubRoot = fileURLToPath(new URL("..", import.meta.url));
const backendPort = await allocatePort();
const vitePort = await allocatePort();
const backendAuthority = `127.0.0.1:${backendPort}`;
const backendOrigin = `http://${backendAuthority}`;
let observedHeaders;

const backend = createServer((request, response) => {
  observedHeaders = request.headers;
  if (request.url !== "/api/assets") {
    response.writeHead(404).end();
    return;
  }
  if (request.headers.host !== backendAuthority || request.headers.origin !== backendOrigin) {
    response.writeHead(403, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ ok: true, data: { items: [] } }));
});
await listen(backend, backendPort);

const vite = spawn(process.execPath, [
  join(hubRoot, "node_modules", "vite", "bin", "vite.js"),
  "--host",
  "127.0.0.1",
  "--port",
  String(vitePort),
  "--strictPort",
], {
  cwd: hubRoot,
  env: { ...process.env, CODEX_MEMORY_OS_SERVER_PORT: String(backendPort) },
  stdio: ["ignore", "pipe", "pipe"],
});

try {
  const hubOrigin = `http://127.0.0.1:${vitePort}`;
  await waitForUrl(hubOrigin, vite);
  const index = await fetch(hubOrigin);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /CodexMemoryOS · Asset Desk/u);

  const apiResponse = await fetch(`${hubOrigin}/api/assets`, {
    headers: { origin: hubOrigin },
  });
  assert.equal(apiResponse.status, 200);
  assert.deepEqual(await apiResponse.json(), { ok: true, data: { items: [] } });
  assert.equal(observedHeaders?.host, backendAuthority);
  assert.equal(observedHeaders?.origin, backendOrigin);
  process.stdout.write(`${JSON.stringify({ event: "N10_VITE_PROXY_SMOKE", status: "ok" })}\n`);
} finally {
  await stopChild(vite);
  await closeServer(backend);
}

async function allocatePort() {
  const server = createServer();
  await listen(server, 0);
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const port = address.port;
  await closeServer(server);
  return port;
}

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
}

async function closeServer(server) {
  if (!server.listening) {
    return;
  }
  await new Promise((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
}

async function waitForUrl(url, child) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Vite exited before listening: ${String(child.exitCode)}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Vite dev proxy smoke timed out");
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Vite stop timed out")), 10_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
