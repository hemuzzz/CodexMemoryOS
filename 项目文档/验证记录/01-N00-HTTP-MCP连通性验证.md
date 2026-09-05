# N00 HTTP MCP Ping Spike Results

> Date: 2026-09-04 (Asia/Shanghai)
> Status: DONE
> Decision: Streamable HTTP MCP is GO for the current Codex CLI and Desktop; the STDIO Adapter is not required.

## Scope

The Spike implements only a stateless Streamable HTTP `/mcp` endpoint and one read-only, idempotent `ping` Tool. It contains no Asset, SQLite, Task, Loadout, Usage, Hook, REST, Vue, or STDIO Adapter implementation.

## Environment

- macOS: 26.6.2 (25G83)
- Node.js used for build and tests: 22.16.0
- npm: 11.12.1
- MCP TypeScript SDK: 1.30.0
- Codex CLI observed at final verification: 0.153.2
- Codex Desktop bundle: 26.825.51511 (build 7377, `com.openai.codex`)
- Endpoint: `http://127.0.0.1:47831/mcp`

The host default Node.js was 25.9.0, so every build/runtime verification explicitly used `npx -y node@22.16.0`.

## Verification matrix

| Case | Result | Evidence |
|---|---|---|
| Node 22.16.0 typecheck | PASS | `tsc --noEmit` exited 0 |
| Production dependency audit | PASS | Official npm registry reported 0 vulnerabilities |
| MCP initialize | PASS | SDK client connected and initialized |
| `tools/list` | PASS | Exactly one Tool: `ping` |
| `tools/call` | PASS | Text `pong` plus structured status |
| Service starts before Codex CLI | PASS | Real Codex MCP Tool Call returned `N00_CLI_PING_OK pong` |
| Codex CLI starts before service, service becomes ready within retry window | PASS | With about 400ms delayed service startup, real Codex returned `N00_CODEX_FIRST_SERVICE_LATE_OK pong` |
| Codex CLI starts before service, service starts after the retry window | EXPECTED FAIL for `required=true` | With about 2.5s delay, current CLI exhausted three connection-refused attempts before the service became ready |
| Service stops and restarts, same SDK client transport | PASS | Call failed while offline and the same client called ping after restart |
| Service stops and restarts, same persisted Codex CLI session | PASS | Session `01a06af9-e4d8-7622-8682-82589ecfa320` completed online ping, continued while offline with `required=false`, then completed a second online ping after restart |
| Four simultaneous SDK clients | PASS | All clients initialized, listed and called independently |
| Two simultaneous real Codex CLI clients | PASS | Both MCP Tool Calls returned pong |
| `required=false` while service is offline | PASS | Codex turn completed normally; initialization warnings remained visible |
| Fixed local bind | PASS | Server listened only on `127.0.0.1:47831` |
| Host / Origin | PASS | Exact local Host and absent/exact local Origin accepted; foreign Host or Origin returned 403 |
| Port occupied | PASS | Second server exited non-zero with `EADDRINUSE` |
| Current Codex Desktop task hot-add after MCP Restart | FAIL / unsupported in observed build | With the MCP config enabled and `127.0.0.1:47831` actively listening, repeated MCP Restart did not add `codex_memory_os_n00.ping` to the existing task's Tool catalog |
| Fresh Codex Desktop task initialize/list/call | PASS | A fresh Desktop task discovered `codex_memory_os_n00.ping` and returned text `pong` plus the expected structured content |
| Same Desktop task after Node service stop/restart | PASS | After an actual process stop and restart on the same port, the same Desktop task called `ping` again successfully |
| Independent Codex task concurrency | PASS with user-approved substitution | A Luna subagent and a separate SDK MCP client both returned `pong`; server evidence recorded overlapping calls with `activePingCalls=2`. This replaced, but is not mislabeled as, two visible UI windows. |

## Automated tests

```text
1. initialize, tools/list and tools/call ping succeed
2. four concurrent clients do not share state
3. the same client transport recovers after the service restarts
4. a client created before the service can connect after startup
5. local Host/Origin is accepted while invalid Host and external Origin are rejected
6. a second server fails clearly when the fixed port is occupied
```

Final result: 6 passed, 0 failed.

## Observed Codex CLI behavior

For an immediately refused connection, current Codex CLI logged three initialization attempts with retry delays of 250ms and 1000ms. In the observed run, setting `startup_timeout_sec=10` did not extend that connection-refused retry sequence. Therefore:

- normal usage should start the local service before Codex;
- `required=false` preserves ordinary Codex availability while the service is absent;
- service startup during the short retry window can recover automatically;
- service startup after that window requires a later turn/session resume or client restart.

This is an observed compatibility boundary, not a reason to implement the STDIO Adapter.

## Desktop gate conclusion

The current Desktop build did not hot-add the newly enabled MCP server to an already-running task, even after MCP Restart while the service was online. A fresh Desktop task loaded the Tool and passed the first `ping` plus a second `ping` after an actual Node service stop/restart. For the final concurrency item, the user explicitly selected a Luna subagent as the second independent Codex task client; a separate SDK client was started inside the same five-second delay window, and server logs proved overlap with `activePingCalls=2`. No visible two-window UI claim is made.

The temporary global MCP registration and test service are removed/stopped after closure. N01 can start from the recorded N00 result without carrying the Spike registration into normal Codex startup.
