# Migrating to 23.0.0

23.0.0 writes program includes (on premise) and table types (on premise and on ABAP cloud)
([#336](https://github.com/fr0ster/mcp-abap-adt/pull/336)), and with it `CreateProgram` stops
offering `include`. An embedder that registers the `./handlers` groups on an `McpServer` of its own
now gets the system type its groups state, for the listing and for every call. Go through the
section that fits how you use the server; the [CHANGELOG](../CHANGELOG.md) has every item.

The packages are the eighteen of 22.0.x, all at **23.0.0**, every sibling range at `^23.0.0`. The
ADT dependencies are unchanged (`@mcp-abap-adt/interfaces-adt` `^24.0.1`,
`@mcp-abap-adt/adt-clients` `^39.0.0`).

## Callers of `CreateProgram`: an include is created by `CreateInclude`

`CreateProgram`'s `program_type` no longer offers `include`; the schema refuses it before the
handler runs. It never created an include — adt-clients refused it before any request
(`programType 'include' is not a program`) — so nothing that worked stops working. Compact
`HandlerCreate` `PROGRAM` with `program_type: 'include'` is refused the same way.

What you do now (on premise; ABAP cloud holds no program include of yours):

| You sent | 23.0 |
|---|---|
| `CreateProgram` `{ program_name, program_type: 'include', package_name }` | `CreateInclude` `{ include_name, package_name }` — the include created inactive and empty — then `UpdateInclude` `{ include_name, source_code, activate: true }` |
| compact `HandlerCreate` `{ object_type: 'PROGRAM', program_type: 'include', … }` | `HandlerCreate` `{ object_type: 'INCLUDE', include_name, package_name }`, then `HandlerLock`, `HandlerUpdate` `INCLUDE` with the `lock_handle`, `HandlerUnlock`, `HandlerActivate` |

## The new tools

Program includes, on premise (the full binaries):

- `CreateInclude` — the create alone, in `package_name`; the include is created inactive and empty.
- `UpdateInclude` — `source_code` as the whole source: lock, write, unlock, and the activation
  when `activate` is true.
- `UpdateIncludeMetadata` — a metadata document as the include's whole stored metadata, under the
  lock (read it with `GetInclude` `part: 'metadata'`, change it, pass all of it back).
- `DeleteInclude` — the deletion check, then the deletion.
- `ActivateInclude`.
- `GetInclude` (on cloud too) takes `part` (`source`, the default, or `metadata`) and `version`
  (`active`, the default, or `inactive`).

Table types, on premise and on ABAP cloud:

- `GetTableType` — the metadata document (core-ro serves it too).
- `CreateTableType` — creates, writes the definition you give, checks, and activates when
  `activate` is true (the default).
- `UpdateTableType` — writes the properties you give into the stored document, checks, and
  activates (default true).
- `DeleteTableType`, `CheckTableType` (`version: 'inactive'` for the unsaved version),
  `ActivateTableType`.
- `GetTableTypeVersions`, `GetTableTypeVersionSource`, `GetTableTypeVersionDiff`; and
  `GetObjectVersions`, `GetObjectVersionSource`, `GetObjectVersionDiff` take `object_type`
  `table_type`.

The definition properties of `CreateTableType` / `UpdateTableType` are `row_type_kind`,
`row_type_name`, `data_type`, `length`, `decimals`, `access_type`, `key_definition` and
`key_kind`; each closed one takes only the values SAP takes (its enum). A property left out keeps
SAP's value. Both answer the definition SAP stored: `stored_definition` (the terse answer is
`{ result, stored_definition }`), or `stored_definition_not_read` with SAP's answer when that read
failed.

The compact tools take `INCLUDE` and `TABLE_TYPE` as members — on cloud `INCLUDE` only in
`HandlerGet`, `HandlerDeletionCheck` and `HandlerWhereUsed`. `HandlerUpdate` takes `part`
(`source` when absent, `metadata`), for `INCLUDE` alone: with `metadata`, `source_code` is the
include's whole metadata document. A table type's `HandlerUpdate` `source_code` is its whole
metadata document, as a domain's is.

## Embedders: a plain `./handlers` registration states its system type

A registry registered on a plain SDK `McpServer` (`registry.registerAllTools(mcpServer)`,
`registry.registerTool(…)`, `HandlerExporter.registerOnServer`) lists the system type its groups
state — the `systemType` of their `HandlerContext`, `HandlerExporter`'s `systemType` option — and
every call runs on it. **`SAP_SYSTEM_TYPE` is not read on this path**, for the listing or for a
call. With none stated, every definition is listed as it is, and every call that would reach a
system is refused `system_type_required` before anything is sent, whatever `SAP_SYSTEM_TYPE` says.
`EmbeddableMcpServer` and the binaries still read `SAP_SYSTEM_TYPE` when no `systemType` option
is given.

```ts
import { HandlerExporter } from '@mcp-abap-adt/lib/handlers';

const exporter = new HandlerExporter({ systemType: 'onprem' }); // or 'cloud', 'legacy'
exporter.registerOnServer(mcpServer, () => connection);
```

- **You relied on `SAP_SYSTEM_TYPE` with a plain registration** (`registerAllTools` /
  `registerTool`): state it — `new HandlerExporter({ systemType })`, or `systemType` in your own
  groups' `HandlerContext`.
- **You call the handlers `getHandlerEntries()` hands out:** the same — each runs on the
  exporter's stated `systemType`, none stated refused `system_type_required`. A connection built
  by `createAbapConnection` keeps the kind it was built for.
- **Your groups state different system types** (or some one and some none): the registration is
  refused before anything is registered, naming each group and what it states. State the same
  `systemType` in every group of one registration, or none in any.

## Embedders: `ToolHandler` is either call form

`ToolHandler` (`HandlerEntry.handler`) is the union of `(context, args) => Promise<any>`
(`ContextHandler`) and `(args) => Promise<any>` (`ArgsOnlyHandler`). Code that holds a handler as
two-parameter, or calls it `handler(context, args)`, no longer compiles. Narrow it with
`isArgsOnly(handler)`, or call it through `callInItsForm(handler, context, args, inGroupContext)`,
both from `@mcp-abap-adt/lib/handlers` — the one rule every registration path follows.

## Embedders: `HandlerExporter` serves no background run and no debugger

`HandlerExporter` no longer hands out the background-run tools (`GetBackgroundRun`,
`ListBackgroundRuns`, `DiscardBackgroundRun`), the `background` parameter of `RuntimeRunClass` /
`RuntimeRunProgram`, or the debugger tools — on `getHandlerEntries()`, `getToolNames()`,
`createRegistry()` and `registerOnServer`. `HandlerExporterOptions` has no `includeDebug`: drop it.
A background run and a debug session keep state between calls, which a server instance holds:
serve them with `EmbeddableMcpServer` (its `backgroundRuns` option for the store), adding
`BackgroundRunHandlersGroup` and `DebugHandlersGroup` (and `RuntimeRunHandlersGroup` for the run
tools with `background`) from `@mcp-abap-adt/lib/handlers` to its registry.

`HandlerExporter.registerOnServer(mcpServer, connectionProvider)` is new: it registers the
exporter's tools on your `McpServer`, each call on the connection your provider returns (an
already-connected connection you hold). See [Handler Exporter](architecture/HANDLER_EXPORTER.md).

## Compact callers on ABAP cloud

A compact write handler's schema lists on cloud only the properties its cloud members take. Gone
there: `HandlerCreate` `program_name`, `program_type`, `application`, `include_name`;
`HandlerUpdate` `program_name`, `part`, `include_name`; `HandlerDelete` `program_name`,
`include_name`; `HandlerProfileRun` `program_name`. None of them was taken on cloud, where the
members that read them are not served; leave them out. On premise nothing changed.

## Readers of `tools/tool-search.json`

The search table shipped in the package changed shape for the compact tools: an entry whose
`object_type` (or `target_type`) picks the object carries `members` (per member, the keywords that
name it), and `semantic` may be an object, `{ before, items: [{ member, text }], join, after }`,
in place of a string. Read the texts through `toolSearchText(name, offered?)` /
`toolSearchTexts()` (`@mcp-abap-adt/lib/tool-search`), which build the sentence; a reader of the
file itself reads `semantic` as a string or that object. Six words that named nothing the tool
handles are gone: `transport` from `HandlerActivate`, `HandlerDelete` and `HandlerUpdate`, and
`transport`, `service definition` and `service binding` from `HandlerCheckRun`. See
[Tool search](user-guide/TOOL_SEARCH.md#texts-per-system-type).
