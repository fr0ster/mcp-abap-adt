# @mcp-abap-adt/http-ro

The read-only MCP server for SAP ABAP ADT over **Streamable HTTP**:
the `mcp-abap-adt-http-ro` command. **The binary fixes the tool set** (19.0.0): there is no `--exposition`;
installing this package is how you choose the tools that change nothing.

It is [`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http)'s launcher with the read-only tool set (`fullReadOnlyToolSet` of `@mcp-abap-adt/lib/tool-set`) and nothing else: the same options, credentials, failures and shutdown as `mcp-abap-adt-http`; only the tools differ. It does not depend on `@mcp-abap-adt/core`.

## The tools

- the **readonly** tools — `Get*`, `Read*`, `List*`: the read operations of every object type;
- the **system** tools — where-used, type and object information, the ABAP AST and semantic
  analysis, SQL queries, dumps, profiler traces, and the class and program runs
  (`RuntimeRunClass`, `RuntimeRunProgram`);
- **search** (`SearchObject`);
- the **leftover-session list and logoff** (`ListLeftoverSessions`, `LogoffLeftoverSession`): the
  SAP sessions a killed server process left open, only the caller's own.

68 tools in all (listed against an on-premise system; `--system-type` leaves out what a system does not offer). **Not here:** the high tools (create, update, delete, activate), the debugger,
background runs and the resume of a leftover session — those are
`mcp-abap-adt-http`'s ([`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http)).

**Running code is reading here.** `RuntimeRunClass` and `RuntimeRunProgram` are system tools and
are served here: "read-only" means the user cannot change code, and running it is allowed, as in
SAP. What that code does is the code's. They are served **without `background`**: this binary
keeps no background run, so the parameter is not in their schema and is not read — a call runs
and waits for its answer.

## Running it

```bash
npm install -g @mcp-abap-adt/http-ro
mcp-abap-adt-http-ro --host=127.0.0.1 --port=3000
mcp-abap-adt-http-ro --help        # every option, from this binary's table
mcp-abap-adt-http-ro --version
```

There is no `--transport` (a binary is its transport) and no `--exposition`: passing it, or a
config file's `exposition`, stops the start with a sentence naming the binary that serves what you
asked for — for example `--exposition=high` names `mcp-abap-adt-http` (`@mcp-abap-adt/http`).

**Credentials** come only from each request's `x-sap-*` headers — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or `x-sap-login` with `x-sap-password`; nothing is stored, shared or cached across requests. A request without them is answered `400`; so is one carrying `x-mcp-destination` (destinations are served only over stdio). No auth broker, no stores.

Every binary and its tools:
[Handler sets](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/HANDLERS_MANAGEMENT.md);
from 18.x: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#every-binary---exposition-is-gone--the-binary-fixes-its-tool-set).

## Licence

AGPL-3.0-only. See LICENSE.
