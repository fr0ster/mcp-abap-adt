# @mcp-abap-adt/compact-sse

The compact MCP server for SAP ABAP ADT over **HTTP+SSE**: one tool per operation, the object in
`object_type` — 25 tools instead of hundreds, for a host that cannot build a retrieval pipeline
of its own.

It is [`@mcp-abap-adt/sse`](https://www.npmjs.com/package/@mcp-abap-adt/sse)'s launcher with the
compact tool set and nothing else: the same options, the same credentials, the same failures and
shutdown as `mcp-abap-adt-sse`; only the tools and `--exposition` differ. stdio is
[`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact), the other HTTP
transport `@mcp-abap-adt/compact-http`. It does not depend on
`@mcp-abap-adt/core`: no auth broker, no stores, no destination, no login.

## Running it

```bash
npm install -g @mcp-abap-adt/compact-sse
mcp-abap-adt-compact-sse --sse-host=127.0.0.1 --sse-port=3001    # all 25 compact tools
mcp-abap-adt-compact-sse --exposition=ro            # the 16 that change nothing
mcp-abap-adt-compact-sse --exposition=rw,debug      # all 25 and the four debugger verbs
mcp-abap-adt-compact-sse --help                     # every option, from this binary's table
```

There is no `--transport`: a binary is its transport.

**Credentials** come only from the `x-sap-*` headers of the `GET` that opens each SSE connection — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or `x-sap-login` with `x-sap-password`; a `POST` is routed by its `sessionId` alone. Nothing is shared with another connection, and nothing outlives it. A request without them is answered `400`; so is one
carrying `x-mcp-destination` (destinations are served only by `mcp-abap-adt`, stdio).

**`--exposition`** takes `rw` (the default — all 25 tools) or `ro` (the 16 that change
nothing: no create, update, delete, activate, lock, unlock, unit-test run or profiler run is in the
tool list at all), and `debug` beside either for the four debugger verbs (`HandlerDebugStart`,
`HandlerDebugWait`, `HandlerDebugView`, `HandlerDebugStep`). `debug` alone, an empty value
and the full binaries' sets (`readonly`, `high`, `low`) are refused at start. A config file's
`exposition` (`--conf`) is read the same way, the flag winning; the template writes
`exposition: rw`. A breakpoint catches every request of the connected SAP user, which is why the
debugger verbs are never served by default: [Debugger](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/DEBUGGER.md).

## Licence

AGPL-3.0-only. See LICENSE.
