# @mcp-abap-adt/compact

The compact MCP server — the command that serves all 22.

## What compact is

A different decomposition of the same ABAP ADT surface: the **operation** is the
tool and the object moves into the arguments. Where the object-oriented surface has
`CreateClass`, `CreateDomain`, `CreateDdl` and so on, compact has one
`HandlerCreate` with `object_type`. Twenty-two tool schemas instead of hundreds.

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
mcp-abap-adt-compact                    # stdio, all 25 compact tools
mcp-abap-adt-compact --exposition=ro    # the 16 that change nothing
mcp-abap-adt-compact --version
```

`--exposition` takes **`rw`** (the default — all 25 tools, every access, which is
what a local server gives) or **`ro`** (the 16 tools that change nothing: no create,
update, delete, activate, lock, unlock, unit-test run or profiler run is in the tool
list at all, so a client cannot call one). The object-oriented sets
`readonly`/`high`/`low` belong to `mcp-abap-adt` and are refused here by name.

Configuration — connection, authentication, transports — is the same as
`mcp-abap-adt`'s, because the launcher is the same one: this command passes its own
tool list to `@mcp-abap-adt/core`'s launcher rather than reimplementing it. The
object-oriented command no longer accepts `--exposition=compact`; it refuses the
value and names this package.

**RFC and SNC** work here exactly as in the full server, and need the same preparation **before** `npm install -g @mcp-abap-adt/compact`: the SAP NW RFC SDK, a C++ toolchain and `SAPNWRFC_HOME` set in the shell — the RFC module is compiled during the install and silently left out when it cannot be. Check with `npm ls -g @mcp-abap-adt/sap-rfc-lite`. Steps: [RFC Setup](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/RFC_SETUP.md); every variant: [Installation variants](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/installation/INSTALLATION.md#installation-variants).

The tool page is generated from the built packages: `docs/AVAILABLE_TOOLS.md`
(`npm run docs:tools`).

## Licence

AGPL-3.0-only. See LICENSE.
