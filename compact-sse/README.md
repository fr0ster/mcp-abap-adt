# @mcp-abap-adt/compact-sse

The compact MCP server for SAP ABAP ADT over **HTTP+SSE**: one tool per operation, the object in
`object_type` — 27 tools instead of hundreds, for a host that cannot build a retrieval pipeline
of its own.

It is [`@mcp-abap-adt/sse`](https://www.npmjs.com/package/@mcp-abap-adt/sse)'s launcher with the
compact tool set and nothing else: the same options, the same credentials, the same failures and
shutdown as `mcp-abap-adt-sse`; only the tools differ. The 16 that change nothing alone are
[`@mcp-abap-adt/compact-sse-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse-ro)
(`mcp-abap-adt-compact-sse-ro`): the binary fixes the tool set (19.0.0). stdio is
[`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact), the other HTTP
transport `@mcp-abap-adt/compact-http`. It does not depend on
`@mcp-abap-adt/core`: no auth broker, no stores, no destination, no login.

## Running it

```bash
npm install -g @mcp-abap-adt/compact-sse
mcp-abap-adt-compact-sse --sse-host=127.0.0.1 --sse-port=3001    # all 27, the debugger verbs, background runs
mcp-abap-adt-compact-sse --help                     # every option, from this binary's table
```

There is no `--transport`: a binary is its transport.

**The low set's analogue.** The low set left the full binaries in 19.0.0; its single-step operations are compact's: `HandlerLock`, `HandlerUpdate` with the `lock_handle` it answered (the write alone, under your lock), `HandlerUnlock`, `HandlerCheckRun`, `HandlerValidate`, `HandlerActivate`, and `HandlerGet` `part` `object_structure` / `node_structure` / `virtual_folders`. **Keeping a lock from `HandlerLock` short is your job:** the server releases nothing on its own clock — unlock as soon as the write is done. The tool-by-tool table: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries).

**Credentials** come only from the `x-sap-*` headers of the `GET` that opens each SSE connection — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or `x-sap-login` with `x-sap-password`; a `POST` is routed by its `sessionId` alone. Nothing is shared with another connection, and nothing outlives it. A request without them is answered `400`; so is one
carrying `x-mcp-destination` (destinations are served only by `mcp-abap-adt`, stdio).

**The tools are fixed by the binary**: all 27, the four debugger verbs (`HandlerDebugStart`,
`HandlerDebugWait`, `HandlerDebugView`, `HandlerDebugStep`) and the background-run tools — 34. `--exposition` (`ro`, `rw`, `debug`, any word) and a config file's
`exposition` stop the start, naming the binary to install instead
(`mcp-abap-adt-compact-sse-ro` for `ro`). No leftover-session tool and no runtime session file: one server holds the sessions of many
users, so those are the stdio binaries' (`mcp-abap-adt-compact`, `mcp-abap-adt-compact-ro`); resuming
a SAP session here is yours to do if you hold what it takes, otherwise SAP ends it on its own
timeout: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#stdio-leftover-sap-sessions-of-a-killed-process). `HandlerProfileRun` takes `background: true`: the call answers at once with a `run_handle` and
the run goes on in an ABAP session of its own; `HandlerBackgroundRunGet`,
`HandlerBackgroundRunList` and `HandlerBackgroundRunDiscard` read, list and remove the caller's
own runs: [Background runs](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/README.md#background-runs-of-a-class-or-a-program). A breakpoint catches every request of the connected SAP user; where that must not be
possible, install `mcp-abap-adt-compact-sse-ro`: [Debugger](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/DEBUGGER.md).

## Licence

AGPL-3.0-only. See LICENSE.
