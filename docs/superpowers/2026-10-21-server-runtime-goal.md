# Goal: one `@mcp-abap-adt/lib` per server process, whatever the install

## Problem

A package with a binary depends on another package with a binary: `compact`, `compact-ro`
and `core-ro` on `@mcp-abap-adt/core`; `compact-http`, `compact-http-ro` and `http-ro` on
`@mcp-abap-adt/http`; `compact-sse`, `compact-sse-ro` and `sse-ro` on `@mcp-abap-adt/sse`.
Each takes the server's launch code from it (`<base>/launcher`).

When a user installs a wrapper and its base in one command (`npm install -g
@mcp-abap-adt/core @mcp-abap-adt/compact`), npm installs them as two global siblings and
does not nest the base inside the wrapper. The wrapper then resolves the base from the
sibling tree, and the base loads its own copy of `@mcp-abap-adt/lib`, while the wrapper's
handlers load the wrapper's copy. Two `lib` instances run in one process. Everything
`lib` keeps at module level splits between them: the request context
(`AsyncLocalStorage`), the system-context cache, the connection registry, batch
availability. The server enters a request in one copy and the handlers read the other,
so a compact create is refused with `system_context_missing` (#303). Which copy a
module gets depends only on how the user installed, and the symptom appears far from
the cause.

## Goal

Every server process loads exactly one `@mcp-abap-adt/lib`, for any way the packages
are installed: globally one at a time or together, locally, nested or hoisted.

## Invariants

1. **No package with a binary depends on another package with a binary.** The twelve
   binary packages depend only on packages without a binary.
2. **The server's launch code lives in one package without a binary,
   `@mcp-abap-adt/server-runtime`**: stdio, Streamable HTTP and SSE, each under its own
   import path. Users do not install it themselves; each binary package depends on it.
3. **`@mcp-abap-adt/lib` stays the library of MCP handlers and their state.** Process
   launch, transports, CLI and configuration reading are server functionality and do not
   move into `lib`.
4. **A second copy is a launch error.** If a second, different `@mcp-abap-adt/lib`
   instance loads into a process anyway, the process stops at start with one sentence
   naming the cause and the remedy, before any tool call.
5. **What a user runs does not change**: the twelve binaries, their names, options,
   tool sets and behaviour are as in 19.x; an embedder importing `lib` sees no change.
6. **Registry-only dependencies, same release order**: every range resolves on the
   registry, packages of the release are published in dependency order
   (`scripts/publish-all.sh`), and a clean global install of a wrapper together with its
   former base, from the registry, loads one `lib` (proved after publishing).

## Out of scope

- Sharing `lib` state between copies (`globalThis` registries).
- Dropping HTTP or SSE.
- Changing any tool.
