# @mcp-abap-adt/compact-sse-ro

The read-only compact MCP server for SAP ABAP ADT over **HTTP+SSE**:
the `mcp-abap-adt-compact-sse-ro` command. **The binary fixes the tool set** (19.0.0): there is no `--exposition`;
installing this package is how you choose the tools that change nothing.

It is [`@mcp-abap-adt/sse`](https://www.npmjs.com/package/@mcp-abap-adt/sse)'s launcher with the read-only compact tool set (`compactReadOnlyToolSetOf` of `@mcp-abap-adt/lib/tool-set` over the half that changes nothing) and nothing else: the same options, credentials, failures and shutdown as `mcp-abap-adt-compact-sse`; only the tools differ. It does not depend on `@mcp-abap-adt/core`.

## The tools

- the **16 compact tools that change nothing**, one per operation with the object in
  `object_type`: `HandlerGet`, `HandlerSearch`, `HandlerWhereUsed`, `HandlerGetData`,
  `HandlerValidate`, `HandlerCheckRun`, the unit-test and CDS unit-test status and result, the
  profiler list and view, the dump list and view, the service-binding type list and validation
  (from [`@mcp-abap-adt/compact-readonly-entries`](https://www.npmjs.com/package/@mcp-abap-adt/compact-readonly-entries));
- the **leftover-session list and logoff** (`HandlerLeftoverSessionList`,
  `HandlerLeftoverSessionLogoff`): the SAP sessions a killed server process left open, only the
  caller's own.

18 tools in all (listed against an on-premise system). No create, update, delete, activate, lock, unlock, unit-test run or profiler run
is in the tool list at all, so a client cannot call one; nor the four debugger verbs, the
background-run tools or the resume of a leftover session — those are `mcp-abap-adt-compact-sse`'s ([`@mcp-abap-adt/compact-sse`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse)).

## Running it

```bash
npm install -g @mcp-abap-adt/compact-sse-ro
mcp-abap-adt-compact-sse-ro --sse-host=127.0.0.1 --sse-port=3001
mcp-abap-adt-compact-sse-ro --help        # every option, from this binary's table
mcp-abap-adt-compact-sse-ro --version
```

There is no `--transport` (a binary is its transport) and no `--exposition`: passing it, or a
config file's `exposition`, stops the start with a sentence naming the binary that serves what you
asked for — for example `--exposition=high` names `mcp-abap-adt-compact-sse` (`@mcp-abap-adt/compact-sse`).

**Credentials** come only from the `x-sap-*` headers of the `GET` that opens each SSE connection — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or `x-sap-login` with `x-sap-password`; that connection's `POST`s are served with them. No auth broker, no stores.

Every binary and its tools:
[Handler sets](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/HANDLERS_MANAGEMENT.md);
from 18.x: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#every-binary---exposition-is-gone--the-binary-fixes-its-tool-set).

## Licence

AGPL-3.0-only. See LICENSE.
