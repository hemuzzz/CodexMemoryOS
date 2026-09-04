import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, request } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

const spikeRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = path.join(spikeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const serverEntry = path.join(spikeRoot, 'src', 'server.ts');
const runningProcesses = new Set<ChildProcess>();

interface StartedServer {
  child: ChildProcess;
  endpoint: string;
  port: number;
}

async function allocatePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Unable to allocate test port'));
        return;
      }
      server.close((error) => (error === undefined ? resolve(address.port) : reject(error)));
    });
  });
}

async function startServer(requestedPort?: number): Promise<StartedServer> {
  const port = requestedPort ?? (await allocatePort());
  const child = spawn(process.execPath, [tsxCli, serverEntry], {
    cwd: spikeRoot,
    env: { ...process.env, N00_MCP_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runningProcesses.add(child);

  const endpoint = await new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error(`Server start timeout: ${stderr}`)), 10_000);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      for (const line of stdout.split('\n')) {
        if (line.includes('"event":"listening"')) {
          clearTimeout(timeout);
          resolve(`http://127.0.0.1:${port}/mcp`);
          return;
        }
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited before listening: code=${String(code)} stderr=${stderr}`));
    });
  });

  return { child, endpoint, port };
}

async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) {
    runningProcesses.delete(child);
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server stop timeout')), 10_000);
    child.once('exit', () => {
      clearTimeout(timeout);
      runningProcesses.delete(child);
      resolve();
    });
    child.kill('SIGTERM');
  });
}

async function connectClient(endpoint: string, name: string): Promise<Client> {
  const client = new Client({ name, version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
  return client;
}

async function assertPing(client: Client): Promise<void> {
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map((tool) => tool.name), ['ping']);

  const result = await client.callTool({ name: 'ping', arguments: {} });
  assert.ok(Array.isArray(result.content));
  const firstContent = result.content[0] as { type?: unknown; text?: unknown } | undefined;
  assert.equal(firstContent?.type, 'text');
  assert.equal(firstContent?.text, 'pong');
}

async function rawPost(
  port: number,
  headers: Record<string, string>,
): Promise<{ statusCode: number; body: string }> {
  return await new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} });
    const outgoing = request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/mcp',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
          ...headers,
        },
      },
      (response) => {
        let responseBody = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          resolve({ statusCode: response.statusCode ?? 0, body: responseBody });
        });
      },
    );
    outgoing.once('error', reject);
    outgoing.end(body);
  });
}

afterEach(async () => {
  await Promise.all([...runningProcesses].map(async (child) => await stopServer(child)));
});

test('initialize, tools/list and tools/call ping succeed', async () => {
  const server = await startServer();
  const client = await connectClient(server.endpoint, 'n00-basic');
  try {
    await assertPing(client);
  } finally {
    await client.close();
    await stopServer(server.child);
  }
});

test('four concurrent clients do not share state', async () => {
  const server = await startServer();
  const clients = await Promise.all(
    Array.from({ length: 4 }, async (_, index) =>
      await connectClient(server.endpoint, `n00-concurrent-${index}`),
    ),
  );
  try {
    await Promise.all(clients.map(assertPing));
  } finally {
    await Promise.all(clients.map(async (client) => await client.close()));
    await stopServer(server.child);
  }
});

test('the same client transport recovers after the service restarts', async () => {
  const port = await allocatePort();
  const firstServer = await startServer(port);
  const client = await connectClient(firstServer.endpoint, 'n00-restart');
  try {
    await assertPing(client);
    await stopServer(firstServer.child);
    await assert.rejects(async () => await client.callTool({ name: 'ping', arguments: {} }));

    const restartedServer = await startServer(port);
    try {
      await assertPing(client);
    } finally {
      await stopServer(restartedServer.child);
    }
  } finally {
    await client.close();
  }
});

test('a client created before the service can connect after startup', async () => {
  const port = await allocatePort();
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  const client = new Client({ name: 'n00-late-service', version: '0.0.0' });

  await assert.rejects(
    async () => await client.connect(new StreamableHTTPClientTransport(new URL(endpoint))),
  );

  const server = await startServer(port);
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
    await assertPing(client);
  } finally {
    await client.close();
    await stopServer(server.child);
  }
});

test('local Host/Origin is accepted while invalid Host and external Origin are rejected', async () => {
  const server = await startServer();
  try {
    const localOrigin = await rawPost(server.port, {
      host: `127.0.0.1:${server.port}`,
      origin: `http://127.0.0.1:${server.port}`,
    });
    assert.notEqual(localOrigin.statusCode, 403);

    const badHost = await rawPost(server.port, { host: 'example.com' });
    assert.equal(badHost.statusCode, 403);
    assert.match(badHost.body, /forbidden_host_or_origin/);

    const badOrigin = await rawPost(server.port, {
      host: `127.0.0.1:${server.port}`,
      origin: 'https://example.com',
    });
    assert.equal(badOrigin.statusCode, 403);
    assert.match(badOrigin.body, /forbidden_host_or_origin/);
  } finally {
    await stopServer(server.child);
  }
});

test('a second server fails clearly when the fixed port is occupied', async () => {
  const firstServer = await startServer();
  const second = spawn(process.execPath, [tsxCli, serverEntry], {
    cwd: spikeRoot,
    env: { ...process.env, N00_MCP_PORT: String(firstServer.port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runningProcesses.add(second);
  let stderr = '';
  second.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exitCode = await new Promise<number | null>((resolve) => second.once('exit', resolve));
  runningProcesses.delete(second);
  assert.notEqual(exitCode, 0);
  assert.match(stderr, /EADDRINUSE/);
  await stopServer(firstServer.child);
});
