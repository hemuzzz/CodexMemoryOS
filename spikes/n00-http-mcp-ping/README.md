# N00 HTTP MCP Ping Spike

实验结果见 [N00 HTTP MCP 连通性验证](../../项目文档/验证记录/01-N00-HTTP-MCP连通性验证.md)。

This isolated Spike verifies only the Streamable HTTP MCP transport selected by CodexMemoryOS Revision 2.1. It deliberately contains no Asset, SQLite, Task, Loadout, Usage, Hook, REST, Vue, or STDIO Adapter implementation.

## Runtime

- Required Node.js: `22.16.0`
- Fixed endpoint: `http://127.0.0.1:47831/mcp`
- Tool: `ping` → `pong`
- Transport: stateless Streamable HTTP
- Network boundary: bind only to `127.0.0.1`; require exact local Host; allow no Origin or the exact local Origin

`N00_PING_DELAY_MS` optionally delays a ping by at most 30 seconds and emits the current in-flight count. It defaults to `0` and exists only to prove overlapping Desktop calls during the two-window test.

The host currently has another Node version as its default. Run the Spike with the exact baseline without changing the host installation:

```bash
npx -y node@22.16.0 node_modules/tsx/dist/cli.mjs src/server.ts
```

## Install and verify

Run from this directory:

```bash
npm install
npx -y node@22.16.0 node_modules/typescript/bin/tsc --noEmit
npx -y node@22.16.0 node_modules/tsx/dist/cli.mjs --test test/http-mcp.test.ts
```

For a manual protocol check, start the server and run:

```bash
npx -y node@22.16.0 node_modules/tsx/dist/cli.mjs src/server.ts
N00_MCP_URL=http://127.0.0.1:47831/mcp npx -y node@22.16.0 node_modules/tsx/dist/cli.mjs src/check.ts
```

The Codex CLI check uses command-line configuration overrides so it does not modify `~/.codex/config.toml`:

```bash
codex exec --ignore-user-config --ephemeral --sandbox read-only \
  -c 'mcp_servers.codex_memory_os_n00.url="http://127.0.0.1:47831/mcp"' \
  -c 'mcp_servers.codex_memory_os_n00.required=true' \
  'Call the codex_memory_os_n00 ping MCP tool exactly once, then report its result.'
```

Desktop connection and same-conversation recovery require loading the MCP configuration in an actual Desktop task. They cannot be proven by the standalone SDK checks alone and must be recorded separately in the N00 result.

Official Codex MCP reference: <https://learn.chatgpt.com/docs/extend/mcp?surface=cli>
