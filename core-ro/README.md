# @mcp-abap-adt/core-ro

The read-only MCP server for SAP ABAP ADT over **stdio**:
the `mcp-abap-adt-ro` command. **The binary fixes the tool set** (19.0.0): there is no `--exposition`;
installing this package is how you choose the tools that change nothing.

It is [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core)'s launcher with the read-only tool set (`fullReadOnlyToolSet` of `@mcp-abap-adt/lib/tool-set`) and nothing else: the same options, credentials, failures and shutdown as `mcp-abap-adt`; only the tools differ.

## The tools

- the **readonly** tools — `Get*`, `List*`, `ReadTransport*`: the read operations of every object type, one `Get<Type>` per type (`part: source | metadata` where the type has a source), the same tools as `mcp-abap-adt`;
- the **system** tools — where-used, type and object information, the ABAP AST and semantic
  analysis, SQL queries, dumps, profiler traces, and the class and program runs
  (`RuntimeRunClass`, `RuntimeRunProgram`);
- **search** (`SearchObject`);
- the **leftover-session list and logoff** (`ListLeftoverSessions`, `LogoffLeftoverSession`): the
  SAP sessions a killed server process left open, only the caller's own;
- the **batch tools** (`BatchBegin`, `BatchEnd`, `BatchAnswers`): batch mode, the reads none of whose requests depends on another's answer recorded and sent together.

71 tools in all (listed against an on-premise system; `--system-type` leaves out what a system does not offer). **Not here:** the high tools (create, update, delete, activate), the debugger
and background runs — those are
`mcp-abap-adt`'s ([`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core)).

**Running code is reading here.** `RuntimeRunClass` and `RuntimeRunProgram` are system tools and
are served here: "read-only" means the user cannot change code, and running it is allowed, as in
SAP. What that code does is the code's. They are served **without `background`**: this binary
keeps no background run, so the parameter is not in their schema and is not read — a call runs
and waits for its answer.

## Running it

```bash
npm install -g @mcp-abap-adt/core-ro
mcp-abap-adt-ro --env-path=./mcp.env --system-type=<onprem|cloud> # a .env written by mcp-auth (or --mcp=<destination>)
mcp-abap-adt-ro --help        # every option, from this binary's table
mcp-abap-adt-ro --version
```

There is no `--transport` (a binary is its transport) and no `--exposition`: passing it, or a
config file's `exposition`, stops the start with a sentence naming the binary that serves what you
asked for — for example `--exposition=high` names `mcp-abap-adt` (`@mcp-abap-adt/core`).

**One destination per process** through the auth broker, exactly as `mcp-abap-adt`: a service key, a session, an `--env` file, the browser login. It connects to the ABAP system over HTTP (basic or JWT), RFC (basic) or SNC (passwordless, over RFC); **RFC and SNC need the SAP NW RFC SDK, a C++ toolchain and `SAPNWRFC_HOME` set before `npm install`** (see [RFC Setup](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/RFC_SETUP.md)).

Every binary and its tools:
[Handler sets](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/HANDLERS_MANAGEMENT.md);
from 18.x: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#every-binary---exposition-is-gone--the-binary-fixes-its-tool-set).

## Licence

AGPL-3.0-only. See LICENSE.
