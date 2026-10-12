# @mcp-abap-adt/compact

The compact MCP server over **stdio** — the command that serves all 25, and the four debugger verbs on
request. Streamable HTTP is [`@mcp-abap-adt/compact-http`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http)
(`mcp-abap-adt-compact-http`), SSE [`@mcp-abap-adt/compact-sse`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse)
(`mcp-abap-adt-compact-sse`): the same tools, a package per transport.

## What compact is

A different decomposition of the same ABAP ADT surface: the **operation** is the
tool and the object moves into the arguments. Where the object-oriented surface has
`CreateClass`, `CreateDomain`, `CreateDdl` and so on, compact has one
`HandlerCreate` with `object_type`. Twenty-five tool schemas instead of hundreds.

It exists for a host that **cannot build a retrieval pipeline of its own** — a small
context, no tool-RAG, no way to select tools per request — and must still drive ABAP
through MCP reliably. A consumer that does select per request (cloud-llm-hub, for
one) has no use for it and should take `@mcp-abap-adt/lib` instead.

## Why two library packages

Capability is decided by what you import, not by a flag a caller can pass. A tool
list assembled from `@mcp-abap-adt/compact-readonly` has **no route to a write
handler in its module graph** — asserted against the graph, not against a list of
names, in `compact/src/__tests__/compactCapabilitySplit.test.ts`. The read-only
half depends on `@mcp-abap-adt/lib/handlers/read`; the modifying half on
`@mcp-abap-adt/lib/handlers/write`.

Note what this is not: both halves depend on `@mcp-abap-adt/lib`, so this is not a
smaller install, and it is not a sandbox — code that deliberately reaches into
`lib` can still call anything. It is a facade that offers no way to write.

## Running it

```bash
npm install -g @mcp-abap-adt/compact
mcp-abap-adt-compact                    # stdio, all 25 compact tools (no --transport: a binary is its transport)
mcp-abap-adt-compact --exposition=ro    # the 16 that change nothing
mcp-abap-adt-compact --exposition=rw,debug   # all 25 and the four debugger verbs
mcp-abap-adt-compact --version
```

`--exposition` takes **`rw`** (the default — all 25 tools, every access, which is
what a local server gives) or **`ro`** (the 16 tools that change nothing: no create,
update, delete, activate, lock, unlock, unit-test run or profiler run is in the tool
list at all, so a client cannot call one). The object-oriented sets
`readonly`/`high`/`low` belong to `mcp-abap-adt` and are refused here by name. A config file's
`exposition` (`--conf`) is read the same way, the flag winning; the template writes `exposition: rw`.

**The debugger is opt-in.** `debug` beside `ro` or `rw` (`--exposition=ro,debug`)
adds four verbs: `HandlerDebugStart` (`kind: abap|amdp`, the breakpoints, `take_over`,
an optional background `run`, and for `abap` `request_user`, `debugging_mode` and
`settings`; answers a `state_handle`), `HandlerDebugWait`, `HandlerDebugView` (stack,
variables, memory, an AMDP table) and `HandlerDebugStep` (the steps, `detach` and
`release_debugger`, `terminate`, and `stop`, which ends the session). `debug` alone is
refused: it names no half of the facade, and taking `rw` for it would open the write
tools unasked. In user mode a breakpoint catches every request of the request
user (the connected SAP user unless another is named), which is why the verbs are never
served by default. What a debug session is, what keeps it
alive on each transport and what ends it: [Debugger](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/DEBUGGER.md).

Configuration — the destination, authentication, the login — is the same as
`mcp-abap-adt`'s, because the launcher is the same one: this command passes the
compact tool set (`compactToolSetOf` of `@mcp-abap-adt/lib/tool-set`, with the two
halves' entry builders) to `@mcp-abap-adt/core`'s `main`, and nothing else. The
object-oriented command no longer accepts `--exposition=compact`; it refuses the
value and names this package.

**RFC and SNC** work here exactly as in the full server, and need the same preparation **before** `npm install -g @mcp-abap-adt/compact`: the SAP NW RFC SDK, a C++ toolchain and `SAPNWRFC_HOME` set in the shell — the RFC module is compiled during the install and silently left out when it cannot be. Check with `npm ls -g @mcp-abap-adt/sap-rfc-lite`. Steps: [RFC Setup](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/RFC_SETUP.md); every variant: [Installation variants](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/INSTALLATION.md#installation-variants).

The tool page is generated from the built packages: `docs/AVAILABLE_TOOLS.md`
(`npm run docs:tools`).

## Licence

AGPL-3.0-only. See LICENSE.
