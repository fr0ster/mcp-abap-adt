# @mcp-abap-adt/compact-sse-ro

The read-only compact MCP server for SAP ABAP ADT over **HTTP+SSE**:
the `mcp-abap-adt-compact-sse-ro` command. **The binary fixes the tool set** (19.0.0): there is no `--exposition`;
installing this package is how you choose the tools that change nothing.

It is [`@mcp-abap-adt/sse`](https://www.npmjs.com/package/@mcp-abap-adt/sse)'s launcher — the one in [`@mcp-abap-adt/server-runtime`](https://www.npmjs.com/package/@mcp-abap-adt/server-runtime) — with the read-only compact tool set (`compactReadOnlyToolSetOf` of `@mcp-abap-adt/lib/tool-set` over the half that changes nothing) and nothing else: the same options, credentials, failures and shutdown as `mcp-abap-adt-compact-sse`; only the tools differ. It depends on no other server package (not on `@mcp-abap-adt/sse`, not on `@mcp-abap-adt/core`).

## The tools

- the **17 compact tools that change nothing**, one per operation with the object in
  `object_type`: `HandlerGet`, `HandlerSearch`, `HandlerWhereUsed`, `HandlerGetData`,
  `HandlerValidate`, `HandlerCheckRun`, `HandlerDeletionCheck`, the unit-test and CDS unit-test status and result, the
  profiler list and view, the dump list and view, the service-binding type list and validation
  (from [`@mcp-abap-adt/compact-readonly-entries`](https://www.npmjs.com/package/@mcp-abap-adt/compact-readonly-entries));
- **`HandlerBatch`** (`action: 'begin' | 'end' | 'answers'`): batch mode.

18 tools in all (listed against an on-premise system). No create, update, delete, activate, lock, unlock, unit-test run or profiler run
is in the tool list at all, so a client cannot call one; nor the four debugger tools or the
background-run tools — those are `mcp-abap-adt-compact-sse`'s ([`@mcp-abap-adt/compact-sse`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse)).

**No leftover-session tools, no session files (19.0.0).** One server holds the sessions of many
users, so it writes no runtime session file and serves no leftover-session tool; those are the
stdio binaries' (they list, the full ones log off too, and a stdio process takes up its destination's one leftover session at its start). Resuming a SAP session here is yours to do if you hold what it takes;
otherwise SAP ends it on its own timeout, which releases its locks: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#stdio-leftover-sap-sessions-of-a-killed-process).

## Running it

```bash
npm install -g @mcp-abap-adt/compact-sse-ro
mcp-abap-adt-compact-sse-ro --sse-host=127.0.0.1 --sse-port=3001 --system-type=onprem
mcp-abap-adt-compact-sse-ro --help        # every option, from this binary's table
mcp-abap-adt-compact-sse-ro --version
```

There is no `--transport` (a binary is its transport) and no `--exposition`: passing it, or a
config file's `exposition`, stops the start with a sentence naming the binary that serves what you
asked for — for example `--exposition=rw` names `mcp-abap-adt-compact-sse` (`@mcp-abap-adt/compact-sse`).

**Credentials** come only from the `x-sap-*` headers of the `GET` that opens each SSE connection — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or `x-sap-login` with `x-sap-password`; that connection's `POST`s are served with them. No auth broker, no stores: `@mcp-abap-adt/auth-broker` and `auth-stores` are installed with `server-runtime` and never loaded.

Every binary and its tools:
[Handler sets](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/HANDLERS_MANAGEMENT.md);
from 18.x: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#every-binary---exposition-is-gone--the-binary-fixes-its-tool-set).

## Licence

AGPL-3.0-only. See LICENSE.
