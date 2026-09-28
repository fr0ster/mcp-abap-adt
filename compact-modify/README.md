# @mcp-abap-adt/compact-modify

Compact modifying tools — 9 tools that write, lock, activate or execute.

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

## Licence

Apache-2.0. See LICENSE.
