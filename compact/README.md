# @mcp-abap-adt/compact

The compact MCP server over **stdio** — the command that serves all 27, the four debugger verbs, the
leftover sessions and background runs. The 16 that change nothing alone are
[`@mcp-abap-adt/compact-ro`](https://www.npmjs.com/package/@mcp-abap-adt/compact-ro)
(`mcp-abap-adt-compact-ro`): the binary fixes the tool set (19.0.0), there is no `--exposition`.
Streamable HTTP is [`@mcp-abap-adt/compact-http`](https://www.npmjs.com/package/@mcp-abap-adt/compact-http)
(`mcp-abap-adt-compact-http`), SSE [`@mcp-abap-adt/compact-sse`](https://www.npmjs.com/package/@mcp-abap-adt/compact-sse)
(`mcp-abap-adt-compact-sse`): the same tools, a package per transport.

## What compact is

A different decomposition of the same ABAP ADT surface: the **operation** is the
tool and the object moves into the arguments. Where the object-oriented surface has
`CreateClass`, `CreateDomain`, `CreateDdl` and so on, compact has one
`HandlerCreate` with `object_type`. Twenty-seven tool schemas instead of hundreds.

It exists for a host that **cannot build a retrieval pipeline of its own** — a small
context, no tool-RAG, no way to select tools per request — and must still drive ABAP
through MCP reliably. A consumer that does select per request (cloud-llm-hub, for
one) has no use for it and should take `@mcp-abap-adt/lib` instead.

**The low set's analogue.** The low set left the full binaries in 19.0.0; its single-step operations are compact's: `HandlerLock`, `HandlerUpdate` with the `lock_handle` it answered (the write alone, under your lock), `HandlerUnlock`, `HandlerCheckRun`, `HandlerValidate`, `HandlerActivate`, and `HandlerGet` `part` `object_structure` / `node_structure` / `virtual_folders`. **Keeping a lock from `HandlerLock` short is your job:** the server releases nothing on its own clock — unlock as soon as the write is done. The tool-by-tool table: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries).

## Why two library packages

Capability is decided by what you import, not by a flag a caller can pass. A tool
list assembled from `@mcp-abap-adt/compact-readonly-entries` has **no route to a write
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
mcp-abap-adt-compact                    # stdio: all 27, the debugger verbs, leftover sessions, background runs
mcp-abap-adt-compact --version

npm install -g @mcp-abap-adt/compact-ro
mcp-abap-adt-compact-ro                 # the 16 that change nothing, the leftover-session list and logoff
```

**The binary fixes the tool set.** `mcp-abap-adt-compact` serves all 27 tools (every access, which
is what a local server gives), the four debugger verbs, the leftover-session tools and the
background-run tools — 37. `mcp-abap-adt-compact-ro` serves the 16 tools that change nothing (no
create, update, delete, activate, lock, unlock, unit-test run or profiler run is in the tool list at
all, so a client cannot call one) and the leftover-session list and logoff — 18. `--exposition`
(`ro`, `rw`, `debug`, any word) and a config file's `exposition` stop the start with a sentence
naming the binary to install instead, e.g. *--exposition is gone (19.0.0): the binary fixes its tool
set, so remove it; the compact tools that change nothing are served by `mcp-abap-adt-compact-ro`
(`@mcp-abap-adt/compact-ro`)*.

**Leftover sessions, in both.** `HandlerLeftoverSessionList` and
`HandlerLeftoverSessionLogoff` are served by `mcp-abap-adt-compact` and `mcp-abap-adt-compact-ro`
alike (a logoff is a system action, not a data change), `HandlerLeftoverSessionResume` by
`mcp-abap-adt-compact` only — the SAP sessions a killed
server process left open (and the locks in them), listed, resumed or logged off by the user, only
the caller's own:
[Leftover SAP sessions](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/README.md#leftover-sap-sessions-of-a-killed-process).

**Background runs, in `mcp-abap-adt-compact`.** `HandlerProfileRun` takes `background: true` (no default):
the call answers at once with a `run_handle`, and the run goes on in an ABAP session of its own
until SAP answers — it cannot be cut. `HandlerBackgroundRunGet`, `HandlerBackgroundRunList` and
`HandlerBackgroundRunDiscard` read, list and remove the caller's own runs (16 at most, kept in the
server's memory until discarded or the process ends):
[Background runs](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/README.md#background-runs-of-a-class-or-a-program).

**The debugger, always in `mcp-abap-adt-compact`, never in `-ro`.** Four verbs: `HandlerDebugStart` (`kind: abap|amdp`, the breakpoints, `take_over`,
an optional background `run`, and for `abap` `request_user`, `debugging_mode` and
`settings`; answers a `state_handle`), `HandlerDebugWait`, `HandlerDebugView` (stack,
variables, memory, an AMDP table) and `HandlerDebugStep` (the steps, `detach` and
`release_debugger`, `terminate`, and `stop`, which ends the session). In user mode a
breakpoint catches every request of the request user (the connected SAP user unless another
is named): where that must not be possible, install `mcp-abap-adt-compact-ro`. What a debug session is, what keeps it
alive on each transport and what ends it: [Debugger](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/DEBUGGER.md).

Configuration — the destination, authentication, the login — is the same as
`mcp-abap-adt`'s, because the launcher is the same one: this command passes the
compact tool set (`compactToolSetOf` of `@mcp-abap-adt/lib/tool-set`, with the two
halves' entry builders) to `@mcp-abap-adt/core`'s `main`, and nothing else.

**RFC and SNC** work here exactly as in the full server, and need the same preparation **before** `npm install -g @mcp-abap-adt/compact`: the SAP NW RFC SDK, a C++ toolchain and `SAPNWRFC_HOME` set in the shell — the RFC module is compiled during the install and silently left out when it cannot be. Check with `npm ls -g @mcp-abap-adt/sap-rfc-lite`. Steps: [RFC Setup](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/RFC_SETUP.md); every variant: [Installation variants](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/INSTALLATION.md#installation-variants).

The tool page is generated from the built packages: `docs/AVAILABLE_TOOLS.md`
(`npm run docs:tools`).

## Licence

AGPL-3.0-only. See LICENSE.
