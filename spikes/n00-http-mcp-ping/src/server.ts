import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 47_831;
const SERVICE_NAME = 'codex-memory-os-n00';
const SERVICE_VERSION = '0.0.0';
let activePingCalls = 0;
let pingSequence = 0;

function parsePort(rawPort: string | undefined): number {
  if (rawPort === undefined) {
    return DEFAULT_PORT;
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid N00_MCP_PORT: ${rawPort}`);
  }

  return port;
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: SERVICE_NAME,
    version: SERVICE_VERSION,
  });

  server.registerTool(
    'ping',
    {
      title: 'Ping',
      description: 'Return pong to verify the N00 Streamable HTTP MCP transport.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const invocation = ++pingSequence;
      const delayMs = Number(process.env.N00_PING_DELAY_MS ?? '0');
      if (!Number.isInteger(delayMs) || delayMs < 0 || delayMs > 30_000) {
        throw new Error(`Invalid N00_PING_DELAY_MS: ${String(process.env.N00_PING_DELAY_MS)}`);
      }

      activePingCalls += 1;
      process.stdout.write(
        `${JSON.stringify({ event: 'ping_start', invocation, activePingCalls, delayMs })}\n`,
      );

      try {
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }

        return {
          content: [{ type: 'text' as const, text: 'pong' }],
          structuredContent: {
            status: 'ok',
            message: 'pong',
            service: SERVICE_NAME,
            version: SERVICE_VERSION,
          },
        };
      } finally {
        activePingCalls -= 1;
        process.stdout.write(
          `${JSON.stringify({ event: 'ping_end', invocation, activePingCalls })}\n`,
        );
      }
    },
  );

  return server;
}

function respondJson(response: ServerResponse, statusCode: number, body: object): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function requestAuthority(request: IncomingMessage): string | undefined {
  const authority = request.headers[':authority'];
  return typeof authority === 'string' ? authority : request.headers.host;
}

function requestIsAllowed(request: IncomingMessage, port: number): boolean {
  const allowedAuthority = `${HOST}:${port}`;
  if (requestAuthority(request) !== allowedAuthority) {
    return false;
  }

  const origin = request.headers.origin;
  return origin === undefined || origin === `http://${allowedAuthority}`;
}

const port = parsePort(process.env.N00_MCP_PORT);
const httpServer = createServer(async (request, response) => {
  if (request.url !== '/mcp') {
    respondJson(response, 404, { error: 'not_found' });
    return;
  }

  if (!requestIsAllowed(request, port)) {
    respondJson(response, 403, { error: 'forbidden_host_or_origin' });
    return;
  }

  const mcpServer = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  response.on('close', () => {
    void transport.close();
    void mcpServer.close();
  });

  try {
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!response.headersSent) {
      respondJson(response, 500, { error: 'mcp_request_failed' });
    } else if (!response.writableEnded) {
      response.end();
    }
    process.stderr.write(`${JSON.stringify({ event: 'request_error', message })}\n`);
  }
});

httpServer.on('error', (error: NodeJS.ErrnoException) => {
  process.stderr.write(
    `${JSON.stringify({ event: 'server_error', code: error.code, message: error.message })}\n`,
  );
  process.exitCode = 1;
});

httpServer.listen(port, HOST, () => {
  process.stdout.write(
    `${JSON.stringify({ event: 'listening', host: HOST, port, endpoint: `http://${HOST}:${port}/mcp` })}\n`,
  );
});

function shutdown(signal: string): void {
  httpServer.close((error) => {
    if (error !== undefined) {
      process.stderr.write(
        `${JSON.stringify({ event: 'shutdown_error', signal, message: error.message })}\n`,
      );
      process.exitCode = 1;
    }
  });
  httpServer.closeAllConnections();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
