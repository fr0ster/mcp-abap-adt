# Migrating to 23.0.0

23.0.0 writes program includes (on premise) and table types (on premise and on ABAP cloud)
([#336](https://github.com/fr0ster/mcp-abap-adt/pull/336)), and with it `CreateProgram` stops
offering `include`. An embedder that registers the `./handlers` groups on an `McpServer` of its own
now gets the system type its groups state, for the listing and for every call, and every read the
server sends states which version it reads. Go through the
section that fits how you use the server; the [CHANGELOG](../CHANGELOG.md) has every item.

The packages are the eighteen of 22.0.x, all at **23.0.0**, every sibling range at `^23.0.0`. The
ADT dependencies move to `@mcp-abap-adt/interfaces-adt` `^25.0.0`, `@mcp-abap-adt/adt-clients`
`^40.0.0` and `@mcp-abap-adt/adt-strategies` `^0.18.0`.

## Readers of a document or source: every read states its version

ADT answers a read that names no version from the working area — the inactive version where one
exists (measured on premise, 2026-11-01) — and adt-clients 40 sends exactly the version it is given.
The server now names one on every read:

- A `Get<Type>` with `version` reads both parts at it, `active` by default as its schema declares.
  For a class, interface, program, include, table, structure, CDS view, behavior implementation,
  function module, metadata extension, domain, data element and function group the metadata part
  went out without a version in 22.0.x, so an object with an inactive version answered its inactive
  document (a service definition, behavior definition, function group include and package send
  what they sent). A metadata extension's source, and an include's source read without `version`,
  change the same way. **What you do:** pass `version: 'workingArea'` (or `'inactive'`) for the
  document being edited. `version` takes `workingArea` beside `active` and `inactive` everywhere it
  is offered (compact `HandlerGet` and `SearchSource` too); `GetTableType` takes it now.
- A read tool without `version` reads the active version. It changes for `GetMessageClass`,
  `GetMessageClassMessage`, `GetServiceBinding`, `GetServiceBindingPreviewUrl` (the binding),
  `GetEnhancementSpot`, `GetEnhancements` (its probes), `GetIncludesList`, `ListFunctionModules`,
  `ListFunctionGroupIncludes`, `GetObjectNodeFromCache` and `SearchSource`'s function group
  includes and modules, which read the working area in 22.0.x.
- `GetTypeInfo` and the descriptions the walks read (`GetObjectInfo`) keep 22.0.x's request, now
  stated: the working area (`active` for a service definition, behavior definition, function
  group include, package and access control).
- `CreateTableType` / `UpdateTableType` name the version of the definition they answer
  (`stored_version`, below).

## Callers of `CreateProgram`: an include is created by `CreateInclude`

`CreateProgram`'s `program_type` no longer offers `include`; the schema refuses it before the
handler runs. It never created an include — adt-clients refused it before any request
(`programType 'include' is not a program`) — so nothing that worked stops working. Compact
`HandlerCreate` `PROGRAM` takes `program_type` as a free string (no enum): `include` reaches
adt-clients, whose guard refuses it before any request, and the call answers that refusal, nothing
sent.

What you do now (on premise; ABAP cloud holds no program include of yours):

| You sent | 23.0 |
|---|---|
| `CreateProgram` `{ program_name, program_type: 'include', package_name }` | `CreateInclude` `{ include_name, package_name }` — the include created inactive, holding the comment header SAP writes into a new include — then `UpdateInclude` `{ include_name, source_code, activate: true }` |
| compact `HandlerCreate` `{ object_type: 'PROGRAM', program_type: 'include', … }` | `HandlerCreate` `{ object_type: 'INCLUDE', include_name, package_name }`, then `HandlerLock`, `HandlerUpdate` `INCLUDE` with the `lock_handle`, `HandlerUnlock`, `HandlerActivate` |

## The new tools

Program includes, on premise (the full binaries):

- `CreateInclude` — the create alone, in `package_name`; the include is created inactive, holding
  the comment header SAP writes into a new include (measured on premise).
- `UpdateInclude` — `source_code` as the whole source: lock, write, unlock, and the activation
  when `activate` is true.
- `UpdateIncludeMetadata` — a metadata document as the include's whole stored metadata, under the
  lock (read it with `GetInclude` `part: 'metadata'`, change it, pass all of it back).
- `DeleteInclude` — the deletion check, then the deletion.
- `ActivateInclude`.
- `GetInclude` (on cloud too) takes `part` (`source`, the default, or `metadata`) and `version`
  (`active`, the default, `inactive` or `workingArea`).

Table types, on premise and on ABAP cloud:

- `GetTableType` — the metadata document, at `version` (`active`, the default, `inactive` or
  `workingArea`; core-ro serves it too).
- `CreateTableType` — creates, writes the definition you give, checks, and activates when
  `activate` is true (the default).
- `UpdateTableType` — writes the properties you give into the stored document, checks, and
  activates (default true).
- `DeleteTableType`, `CheckTableType` (`version: 'inactive'` for the unsaved version),
  `ActivateTableType`.
- `GetTableTypeVersions`, and `GetObjectVersions` takes `object_type` `table_type`: a table
  type's version list. No version source or diff is offered for a table type: SAP answers its
  version source `403` "Request version for TTYP is not supported" (measured on premise and on
  ABAP cloud).

The definition properties of `CreateTableType` / `UpdateTableType` are `row_type_kind`,
`row_type_name`, `data_type`, `length`, `decimals`, `access_type`, `key_definition` and
`key_kind`; each closed one takes only the values SAP takes (its enum). A property left out keeps
SAP's value. Both answer the definition SAP stored and the version it was read at:
`stored_definition` and `stored_version` (the terse answer is
`{ result, stored_definition, stored_version }`), or `stored_definition_not_read` with SAP's
answer when that read failed. After a successful activation the definition is read once more, at
`active`; otherwise it is the `inactive` version read after the write — `CreateTableType` with
`activate: false`, a refused check or a refused activation, `UpdateTableType` with `activate:
false` or a refused activation (it checks under the lock, before that read: a refused check is
answered without a stored definition).

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
  exporter's stated `systemType`, none stated refused `system_type_required`. A connection you
  hold (built by `createConnection` from `@mcp-abap-adt/connection`) keeps the kind it was built for.
- **Your groups state different system types** (or some one and some none): the registration is
  refused before anything is registered, naming each group and what it states. State the same
  `systemType` in every group of one registration, or none in any.
- **You call `registry.registerTool(server, name, definition, handler)`:** it registers a tool of
  one of the registry's groups, through that group's path as `registerAllTools` does — `handler`
  called in its form (an args-only one reading the group's context), on the stated system type.
  A name no group of the registry holds is refused (`registerTool registers a tool of one of the
  registry's handler groups: …`): add the tool to a group of the registry.

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
there since 22.x: `HandlerCreate` `program_name`, `program_type`, `application`; `HandlerUpdate`,
`HandlerDelete` and `HandlerProfileRun` `program_name`. None of them was taken on cloud, where the
members that read them are not served; leave them out. The include's new properties
(`include_name`, `HandlerUpdate`'s `part`) are offered on premise only. On premise nothing else
changed.

## Callers of `@mcp-abap-adt/lib/compact-shared`

The twelve compact schema builders — `compactCreateSchemaFor`, `compactGetSchemaFor`,
`compactUpdateSchemaFor`, `compactDeleteSchemaFor`, `compactProfileRunSchemaFor`,
`compactValidateSchemaFor`, `compactDeletionCheckSchemaFor`, `compactLockSchemaFor`,
`compactUnlockSchemaFor`, `compactCheckRunSchemaFor`, `compactActivateSchemaFor`,
`compactWhereUsedSchemaFor` — take `M` as a readonly array of that tool's members, where 22.0.x
took `readonly string[]`. A plain string array, or a name the tool does not offer, no longer
compiles. **What you do:** pass the projection itself (`compactCreateSchemaFor(COMPACT_CREATE.cloud)`)
or an `as const` array of its members.

The projection tables gain the include and the table type: `INCLUDE` and `TABLE_TYPE` in the
compact member tables, `table_type` in `VERSIONED_KINDS` and `VERSIONED_ROUTES` (the version list);
the version source and diff take the new `VERSION_SOURCE_KINDS` (`VERSION_SOURCE_ROUTES`,
`VersionSourceKind`), which has no `table_type`. `COMPACT_WHERE_USED_ROUTES` maps `TABLE_TYPE` to
the where-used code `TTYP/DA`, not a name of `TYPE_NAMES`. **What you do:** a `switch` or a
`Record` exhaustive over one of these tables handles the new members; a reader of
`COMPACT_WHERE_USED_ROUTES` takes a value as a name of `TYPE_NAMES` or a where-used code. The
type `ReadVersion` (`active`, `inactive`, `workingArea`) is exported beside them.

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
