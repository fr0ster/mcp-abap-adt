# Migrating to 14.0.0

One change, in two places: **the compact facade left `@mcp-abap-adt/lib` for three
packages of its own**, and **`mcp-abap-adt` no longer serves
`--exposition=compact`**.

**If you use the object-oriented tools — read, create, update, activate and the
rest — nothing changed.** No tool name, no parameter, no answer shape. `npm i
@mcp-abap-adt/core@14` and carry on.

## Who compact is for

A host that cannot build a retrieval pipeline of its own — a small context, no
tool-RAG, no way to select tools per request — and must still drive ABAP through
MCP. It needs a tool list short by construction: 22 tools, one per OPERATION, with
the object in `object_type`. A consumer that selects per request has no use for it.

That is why the facade is a command of its own rather than a flag: a flag can be
forgotten or mistyped, a command whose default IS the compact list cannot be.

## If you ran `mcp-abap-adt --exposition=compact`

Install the command instead:

```bash
npm install -g @mcp-abap-adt/compact
mcp-abap-adt-compact          # stdio, the 22 compact tools and nothing else
```

Configuration is unchanged — connection, authentication, transports, the YAML file
and every flag work exactly as before, because it is the same launcher. What changed
is the tool list and the entry point's name.

**`--exposition` still exists on the compact command, with its own two values:**

| | tools |
|---|---|
| `--exposition=rw` (default) | all 22 |
| `--exposition=ro` | the 13 that change nothing |

`ro` is not a filter over the same list: the write tools are not in it at all, so a
client cannot call one. `readonly`, `high` and `low` are sets of the object-oriented
surface and are refused here by name, pointing at `mcp-abap-adt`.

`mcp-abap-adt` now REFUSES the value at startup rather than ignoring it:

```
Invalid exposition: 'compact' is served by @mcp-abap-adt/compact, which is its own
command with the compact tool list as its default. Install it and run
`mcp-abap-adt-compact`, or drop `compact` from this exposition.
```

A configuration that asks for a tool list it will not get should fail, not start
with tools missing.

## If you imported the compact tools from `@mcp-abap-adt/lib`

These are gone from `lib`'s public surface:

| was | is |
|---|---|
| `CompactHandlersGroup` from `@mcp-abap-adt/lib/handlers` | `@mcp-abap-adt/compact` |
| `CompactReadOnlyHandlersGroup` | `@mcp-abap-adt/compact-readonly` |
| `CompactModifyHandlersGroup` | `@mcp-abap-adt/compact-modify` |
| `new HandlerExporter({ includeCompact: true })` | drop the option; the exporter serves `lib`'s 348 tools |

Each half also exports an entry BUILDER — `compactReadOnlyEntries(getContext)` and
`compactModifyEntries(getContext)` — which is what to use when assembling a tool
list yourself. It takes a function returning the current `HandlerContext`, because
the context is per request: capturing one makes every later call run against a
stale connection.

```ts
// before
import { CompactHandlersGroup } from '@mcp-abap-adt/lib/handlers';
const group = new CompactHandlersGroup(context);

// after — the whole facade
import { CompactHandlersGroup } from '@mcp-abap-adt/compact';
const group = new CompactHandlersGroup(context);

// after — only the tools that cannot change the system
import { CompactReadOnlyHandlersGroup } from '@mcp-abap-adt/compact-readonly';
const readOnly = new CompactReadOnlyHandlersGroup(context);
```

## Why two library packages instead of one

**Capability is decided by what you import.** A tool list assembled from
`@mcp-abap-adt/compact-readonly` has no route to a write handler in its module
graph — and that is asserted against the graph, not against a list of names: the
package never names `@mcp-abap-adt/lib/handlers/write`, never names the modifying
package, and its manifest declares `@mcp-abap-adt/lib` as its only dependency.

Two things it is NOT, stated plainly because the distinction matters:

- **not a smaller install** — both halves depend on `lib`, so all of `lib` is on
  disk either way; what the read-only half avoids is LINKING the write handlers;
- **not a sandbox** — code that deliberately reaches into `lib` can still call
  anything. The promise is that the facade offers no way to write, not that writing
  is impossible.

## New in `lib`, if you assemble your own surface

- `@mcp-abap-adt/lib/handlers/read` — the 35 handler functions the read-only facade
  routes to.
- `@mcp-abap-adt/lib/handlers/write` — the 69 that write, lock or activate, plus
  `TYPE_TO_FAMILY`.
- `@mcp-abap-adt/lib/compact-shared` — the facade's kernel: object types, the CRUD
  matrix, the input schemas, the lifecycle helpers and `dispatchCompact`. Data and
  types, no handler, which is why both halves may share it.

## Versions

All five packages move together: `lib`, `compact-readonly`, `compact-modify`,
`core`, `compact` are 14.0.0. They are one decomposition of the same library, and
independent numbers would create combinations nobody has run.
