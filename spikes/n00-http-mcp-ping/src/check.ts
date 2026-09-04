import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.env.N00_MCP_URL ?? 'http://127.0.0.1:47831/mcp';
const client = new Client({ name: 'n00-protocol-check', version: '0.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(endpoint));

try {
  await client.connect(transport);
  const tools = await client.listTools();
  const result = await client.callTool({ name: 'ping', arguments: {} });

  process.stdout.write(
    `${JSON.stringify(
      {
        endpoint,
        initialize: 'ok',
        tools: tools.tools.map((tool) => tool.name),
        ping: result,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await client.close();
}
