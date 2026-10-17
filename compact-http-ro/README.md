# @mcp-abap-adt/compact-http-ro

The read-only compact MCP server for SAP ABAP ADT over **Streamable HTTP**:
the `mcp-abap-adt-compact-http-ro` command. **The binary fixes the tool set** (19.0.0): there is no `--exposition`;
installing this package is how you choose the tools that change nothing.

It is [`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http)'s launcher with the read-only compact tool set (`compactReadOnlyToolSetOf` of `@mcp-abap-adt/lib/tool-set` over the half that changes nothing) and nothing else: the same options, credentials, failures and shutdown as `mcp-abap-adt-compact-http`; only the tools differ. It does not depend on `@mcp-abap-adt/core`.

## The tools

- the **17 compact tools that change nothing**, one per operation with the object in
  `object_type`: `HandlerGet`, `HandlerSearch`, `HandlerWhereUsed`, `HandlerGetData`,
  `HandlerValidate`, `HandlerCheckRun`, `HandlerDeletionCheck`, the unit-test and CDS unit-test status and result, the
  profiler list and view, the dump list and view, the service-binding type list and validation
  (from [`@mcp-abap-adt/compact-readonly-entries`](https://www.npmjs.com/package/@mcp-abap-adt/compact-readonly-entries)).

17 tools in all (listed against an on-premise system). No create, update, delete, activate, lock, unlock, unit-test run or profiler run
is in the tool list at all, so a client cannot call one; nor the four debugger verbs or the
background-run tools — those are `mcp-abap-adt-compact-http`'s ([`@mcp-abap-adt/compact-http`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http)).

**No leftover-session tools, no session files (19.0.0).** One server holds the sessions of many
users, so it writes no runtime session file and serves no leftover-session tool; those are the
stdio binaries' (they list and log off, and a stdio process takes up its destination's one leftover session at its start). Resuming a SAP session here is yours to do if you hold what it takes;
otherwise SAP ends it on its own timeout, which releases its locks: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#stdio-leftover-sap-sessions-of-a-killed-process).

## Running it

```bash
npm install -g @mcp-abap-adt/compact-http-ro
mcp-abap-adt-compact-http-ro --host=127.0.0.1 --port=3000 --system-type=onprem
mcp-abap-adt-compact-http-ro --help        # every option, from this binary's table
mcp-abap-adt-compact-http-ro --version
```

There is no `--transport` (a binary is its transport) and no `--exposition`: passing it, or a
config file's `exposition`, stops the start with a sentence naming the binary that serves what you
asked for — for example `--exposition=rw` names `mcp-abap-adt-compact-http` (`@mcp-abap-adt/compact-http`).

**Credentials** come only from each request's `x-sap-*` headers — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or `x-sap-login` with `x-sap-password`; nothing is stored, shared or cached across requests. A request without them is answered `400`; so is one carrying `x-mcp-destination` (destinations are served only over stdio). No auth broker, no stores.

Every binary and its tools:
[Handler sets](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/HANDLERS_MANAGEMENT.md);
from 18.x: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#every-binary---exposition-is-gone--the-binary-fixes-its-tool-set).

## Licence

AGPL-3.0-only. See LICENSE.
