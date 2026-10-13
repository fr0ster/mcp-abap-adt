# @mcp-abap-adt/compact-http

The compact MCP server for SAP ABAP ADT over **Streamable HTTP**: one tool per operation, the object in
`object_type` — 27 tools instead of hundreds, for a host that cannot build a retrieval pipeline
of its own.

It is [`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http)'s launcher with the
compact tool set and nothing else: the same options, the same credentials, the same failures and
shutdown as `mcp-abap-adt-http`; only the tools differ. The 16 that change nothing alone are
[`@mcp-abap-adt/compact-http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http-ro)
(`mcp-abap-adt-compact-http-ro`): the binary fixes the tool set (19.0.0). stdio is
[`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact), the other HTTP
transport `@mcp-abap-adt/compact-sse`. It does not depend on
`@mcp-abap-adt/core`: no auth broker, no stores, no destination, no login.

## Running it

```bash
npm install -g @mcp-abap-adt/compact-http
mcp-abap-adt-compact-http --host=127.0.0.1 --port=3000         # all 27, the debugger verbs, leftover sessions, background runs
mcp-abap-adt-compact-http --help                     # every option, from this binary's table
```

There is no `--transport`: a binary is its transport.

**The low set's analogue.** The low set left the full binaries in 19.0.0; its single-step operations are compact's: `HandlerLock`, `HandlerUpdate` with the `lock_handle` it answered (the write alone, under your lock), `HandlerUnlock`, `HandlerCheckRun`, `HandlerValidate`, `HandlerActivate`, and `HandlerGet` `part` `object_structure` / `node_structure` / `virtual_folders`. **Keeping a lock from `HandlerLock` short is your job:** the server releases nothing on its own clock — unlock as soon as the write is done. The tool-by-tool table: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries).

**Credentials** come only from each request's `x-sap-*` headers — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or `x-sap-login` with `x-sap-password`; nothing is stored, shared or cached across requests. Held state (a debug session) is reached again with its `state_handle` on the pooled instance that holds it. A request without them is answered `400`; so is one
carrying `x-mcp-destination` (destinations are served only by `mcp-abap-adt`, stdio).

**The tools are fixed by the binary**: all 27, the four debugger verbs (`HandlerDebugStart`,
`HandlerDebugWait`, `HandlerDebugView`, `HandlerDebugStep`), the background-run tools and the
leftover-session tools — 37. `--exposition` (`ro`, `rw`, `debug`, any word) and a config file's
`exposition` stop the start, naming the binary to install instead
(`mcp-abap-adt-compact-http-ro` for `ro`). The leftover-session tools (the SAP sessions a killed
server process left open, only the caller's own): `HandlerLeftoverSessionList`,
`HandlerLeftoverSessionLogoff` and `HandlerLeftoverSessionResume`; the `-ro` binary serves the
first two. Over Streamable HTTP
a resumed session lives for its one request:
[Leftover SAP sessions](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/README.md#leftover-sap-sessions-of-a-killed-process). `HandlerProfileRun` takes `background: true`: the call answers at once with a `run_handle` and
the run goes on in an ABAP session of its own; `HandlerBackgroundRunGet`,
`HandlerBackgroundRunList` and `HandlerBackgroundRunDiscard` read, list and remove the caller's
own runs: [Background runs](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/README.md#background-runs-of-a-class-or-a-program). A breakpoint catches every request of the connected SAP user; where that must not be
possible, install `mcp-abap-adt-compact-http-ro`: [Debugger](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/DEBUGGER.md).

## Licence

AGPL-3.0-only. See LICENSE.
