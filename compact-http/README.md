# @mcp-abap-adt/compact-http

The compact MCP server for SAP ABAP ADT over **Streamable HTTP**: one tool per operation, the object in
`object_type` — 29 tools instead of hundreds, for a host that cannot build a retrieval pipeline
of its own.

It is [`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http)'s launcher with the
compact tool set and nothing else: the same options, the same credentials, the same failures and
shutdown as `mcp-abap-adt-http`; only the tools differ. The 17 that change nothing alone are
[`@mcp-abap-adt/compact-http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http-ro)
(`mcp-abap-adt-compact-http-ro`): the binary fixes the tool set (19.0.0). stdio is
[`@mcp-abap-adt/compact`](https://www.npmjs.com/package/@mcp-abap-adt/compact), the other HTTP
transport `@mcp-abap-adt/compact-sse`. It does not depend on
`@mcp-abap-adt/core`: no auth broker, no stores, no destination, no login.

## Running it

```bash
npm install -g @mcp-abap-adt/compact-http
mcp-abap-adt-compact-http --host=127.0.0.1 --port=3000 --system-type=onprem # all 29, the debugger tools, background runs
mcp-abap-adt-compact-http --help                     # every option, from this binary's table
```

There is no `--transport`: a binary is its transport.

**The low set's analogue.** The low set left the full binaries in 19.0.0; its single-step operations are compact's: `HandlerLock`, `HandlerUpdate` with the `lock_handle` it answered (one request: the write alone, under your lock; `lock_handle` is required; for PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP `source_code` is the whole metadata document, sent as given), `HandlerUnlock`, `HandlerDeletionCheck` (the one deletion check, SAP's verdict as it came), `HandlerDelete` (one request: the deletion request alone, with no lock held on the object; a class include and `UNIT_TEST` are written empty by one `PUT` under your class lock's `lock_handle`), `HandlerCheckRun`, `HandlerValidate`, `HandlerActivate` (one request: one object of a type the per-object activation maps answers its verdict; every other call starts an activation run and answers `{ run_id }`), and `HandlerGet` — one request per part: `source` the source alone, `metadata` the metadata document alone (PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP have only `metadata`; a function module is named `GROUP|MODULE` or with `function_group_name`), and `object_structure` / `node_structure` / `virtual_folders` (a package's blank node structure is the empty listing with `blank`: an empty package, or no package of that name), and `activation_status` / `activation_results` (an activation run by its `run_id`: its status, then its messages — asking again until the status settles is yours), and `object_type` `UNIT_TEST` / `CDS_UNIT_TEST` (a unit-test run's result by its `run_id`, one request, as `HandlerUnitTestResult` / `HandlerCdsUnitTestResult` read it; the status is `HandlerUnitTestStatus` / `HandlerCdsUnitTestStatus`, asked until it says `FINISHED`). **Keeping a lock from `HandlerLock` short is your job:** the server releases nothing on its own clock — unlock as soon as the write is done. The tool-by-tool table: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries).

**Credentials** come only from each request's `x-sap-*` headers — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or `x-sap-login` with `x-sap-password`; nothing is stored, shared or cached across requests. Held state (a debug session, a lock taken with `HandlerLock`) is reached again with its `state_handle` on the pooled instance that holds it: `HandlerLock` answers it, and `HandlerUpdate`, `HandlerDelete` of a class include and `HandlerUnlock` under that lock send it in the `x-mcp-state-handle` header — without it they are refused, sending nothing. A request with the same credential headers works on the instance's held SAP session; another credential retires it. A request without them is answered `400`; so is one
carrying `x-mcp-destination` (destinations are served only by `mcp-abap-adt`, stdio).

**The tools are fixed by the binary**: all 29, the four debugger tools (`HandlerDebugBreakpoints`,
`HandlerDebugSession`, `HandlerDebugStep`, `HandlerDebugMaintain`), the debugger batch (`HandlerDebugBatch`), the background-run tools and `HandlerBatch` — 38. `--exposition` (`ro`, `rw`, `debug`, any word) and a config file's
`exposition` stop the start, naming the binary to install instead
(`mcp-abap-adt-compact-http-ro` for `ro`). No leftover-session tool and no runtime session file: one server holds the sessions of many
users, so those are the stdio binaries' (`mcp-abap-adt-compact`, `mcp-abap-adt-compact-ro`); resuming
a SAP session here is yours to do if you hold what it takes, otherwise SAP ends it on its own
timeout: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#stdio-leftover-sap-sessions-of-a-killed-process). `HandlerProfileRun` takes `background: true`: the call answers at once with a `run_handle` and
the run goes on in an ABAP session of its own; `HandlerBackgroundRunGet`,
`HandlerBackgroundRunList` and `HandlerBackgroundRunDiscard` read, list and remove the caller's
own runs: [Background runs](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/README.md#background-runs-of-a-class-or-a-program). A breakpoint catches every request of the connected SAP user; where that must not be
possible, install `mcp-abap-adt-compact-http-ro`: [Debugger](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/DEBUGGER.md).

## Licence

AGPL-3.0-only. See LICENSE.
