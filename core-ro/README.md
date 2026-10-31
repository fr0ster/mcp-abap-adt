# @mcp-abap-adt/core-ro

The read-only MCP server for SAP ABAP ADT over **stdio**:
the `mcp-abap-adt-ro` command. **The binary fixes the tool set** (19.0.0): there is no `--exposition`;
installing this package is how you choose the tools that change nothing.

It is [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core)'s launcher — the one in [`@mcp-abap-adt/server-runtime`](https://www.npmjs.com/package/@mcp-abap-adt/server-runtime) — with the read-only tool set (`fullReadOnlyToolSet` of `@mcp-abap-adt/lib/tool-set`) and nothing else: the same options, credentials, failures and shutdown as `mcp-abap-adt`; only the tools differ. It depends on no other server package (not on `@mcp-abap-adt/core`).

## The tools

- the **readonly** tools — `Get*`, `List*`, `ReadTransport*`: the read operations of every object type, one `Get<Type>` per type (`part: source | metadata` where the type has a source), the same tools as `mcp-abap-adt`;
- the **system** tools — where-used, type and object information, the ABAP AST and semantic
  analysis, SQL queries, dumps, profiler traces and their analysis, and the ABAP Test Cockpit
  (`RunATC`, `GetATCRunStatus`, `GetATCFindings`);
- **search** (`SearchObject`);
- the **leftover-session list** (`ListLeftoverSessions`): the SAP sessions a killed server
  process left open, only the caller's own. Their logoff (`LogoffLeftoverSession`) releases every
  lock a session holds, so it is `mcp-abap-adt`'s;
- the **batch tools** (`BatchBegin`, `BatchEnd`, `BatchAnswers`): batch mode, the reads none of whose requests depends on another's answer recorded and sent together.

70 tools in all on premise, 69 on cloud: the tools, their enums and the object types each argument accepts are those of `--system-type`'s ADT type table ([MIGRATION-22.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-22.0.md)). **Not here:** the high tools (create, update, delete, activate), the class and program runs, the trace schedule, the debugger, the leftover-session logoff
and background runs — those are
`mcp-abap-adt`'s ([`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core)).

**Nothing here changes the system.** No tool of this binary runs code or changes data: the class
and program runs (`RuntimeRunClass`, `RuntimeRunProgram`) and the profiler trace parameters they run
under (`RuntimeCreateProfilerTraceParameters`) are `mcp-abap-adt`'s, since the code a run executes can
change data. The ATC run stays: a check run changes nothing.

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

**One destination per process** through the auth broker, exactly as `mcp-abap-adt`: a service key, a session, an `--env` file, the browser login. It connects to the ABAP system over HTTP (basic or JWT), RFC (basic) or SNC (passwordless, over RFC); **RFC and SNC need the SAP NW RFC library when the server runs** — SAP GUI's 64-bit `sapnwrfc.dll` on Windows, else the SAP NW RFC SDK; the RFC module comes prebuilt for Linux x64 (glibc), Windows x64 and macOS ARM64 (see [RFC Setup](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/RFC_SETUP.md)).

Every binary and its tools:
[Handler sets](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/HANDLERS_MANAGEMENT.md);
from 18.x: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#every-binary---exposition-is-gone--the-binary-fixes-its-tool-set).

## Licence

AGPL-3.0-only. See LICENSE.
