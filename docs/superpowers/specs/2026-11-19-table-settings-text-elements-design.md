# Table technical settings and text elements as tools — design

## Intent

Expose two ADT sub-resources the server cannot reach today, in one change:

- a table's **technical settings** (`TABL/DTT`, `/sap/bc/adt/ddic/db/settings/{name}`) — read, and
  write the non-default values Eclipse requires before it activates a table;
- the **text elements** of programs, function groups and classes (`PROG/PX`, `CLAS/OCX`,
  `/sap/bc/adt/textelements/{programs|functiongroups|classes}/{name}`) — text symbols, selection
  texts and list/column headings; full read and write.

And make activation and where-used reach the text elements.

The library side is published: `@mcp-abap-adt/adt-clients` 46.0.0 (`getTableSettings()`,
`getTextElements()`, `textElementsActivationReferences`, where-used `container`),
`adt-strategies` 0.25.0 (`tableSettings`, `textSymbols`, `selectionTexts`, `textHeadings`),
`interfaces-adt` 30.0.0.

## Decided (owner)

- Full sets: `GetTableSettings`, `UpdateTableSettings`. Compact: object type `TABLE_SETTINGS` in
  `HandlerGet` and `HandlerUpdate`. The read-only build: the Get only.
- Text elements ship with the table settings, in this PR. Scope: symbols, selection texts and
  headings for programs and function groups; symbols only for classes. Full read and write.
- `ActivateObjects` must activate an object together with its text elements (today `[PROG/P]`
  after a text write answers "still inactive PROG/P and PROG/PX"). **Explicit codes:**
  `ActivateObjects` takes `PROG/PX` and `CLAS/OCX` as ordinary references, and `PROG/PX` with
  `parentName` is a function group's text elements. `UpdateTextElements` with `activate: true`
  activates the object together with its text elements. Nothing is added automatically to any
  other activation.
- **The partial settings write lives in adt-clients.** All CRUD, read-patch-write included, is
  adt-clients'. A new minor, adt-clients **46.1.0**, gets the method below; the server only calls
  it. `UpdateTableSettings` waits for 46.1.0 on the registry (see Dependency).
- **Function groups on cloud: pending measurement.** A cloud write of a function group's text
  elements is measured before anything about it is served or stated.
- **Compact:** `TABLE_SETTINGS`, `PROGRAM_TEXT_ELEMENTS`, `FUNCTION_GROUP_TEXT_ELEMENTS`,
  `CLASS_TEXT_ELEMENTS`.
- `TABL/DTT` stays out of where-used until it is measured.
- The unused `adt-clients-legacy` dependency is dropped: the server imports nothing from it.
- `activate` on the new update tools is a **required** boolean: the existing update tools have no
  single convention (some default to `true`, some to `false`, some have none), so no implicit
  default.

## Facts the design rests on

Measured on premise and on the cloud, 2026-11-19 (research notes, and adt-clients 46.0.0's README):

- **Settings.** Own lock (ESDICT `TABT`, not the table's). The PUT writes the whole DD09L row:
  every setting, the `translation` attributes and `adtcore:description` are required; a field left
  out is reset. SAP creates default settings with the table. Activating the table (`TABL/DTT` is
  never activated alone) activates them. Cloud's read adds `isWritableByAMDP`, which is never
  written. Not in 7.40 discovery.
- **Text elements.** Own lock (`TEXT`). A write replaces the part's whole list (an entry left out is
  deleted). The save is inactive. Texts are the original language's whatever the logon language.
  Classes: symbols only. A function group's text elements are `PROG/PX` at
  `/textelements/functiongroups/{group}`. A text write puts the program itself in the working area,
  so the activation names both (`textElementsActivationReferences`). Cloud: class symbols written
  and read; delivered programs read; the cloud lock answers `NoModification` and the PUT still
  saves. Not in 7.40 discovery.
- **Where-used.** `PROG/PX` served on both (onprem: programs and function groups; cloud: programs),
  with `container` required by the library; `CLAS/OCX` answers "not supported" on both.

## Tools

Names follow the full set's verbs; every update tool does lock → write → unlock in one call
(see Locking). Descriptions below are the intended text: functional, nothing concrete named.

### GetTableSettings (full; read-only build too)

- **Description:** "[read-only] Reads the technical settings of the database table named by
  table_name: data class, size category, buffering, storage type, sharing type, load unit,
  translation, logging, and the table's description, at the version asked."
- **Parameters:** `table_name: string` (required); `version: 'active' | 'inactive' | 'workingArea'`
  (optional, default `active`; `READ_VERSION_FIELD`).
- **Returns:** `{ table_name, version, description, data_class, size_category, buffering: { allowed,
  type, area_key_fields }, storage_type, sharing_type, load_unit, translation: { value, is_visible,
  is_editable, granularity }, logging_enabled, is_writable_by_amdp? }` — the last only where SAP
  answers it (cloud).
- **Served:** `ReadOnlyHandlersGroup` (every full binary, `-ro` included); `available_in:
  ['onprem', 'cloud']`.

### UpdateTableSettings (full)

- **Description:** "Writes technical settings of the existing database table named by table_name:
  the settings given replace the stored ones, the rest keep their current values. Locks the
  settings, writes, unlocks, and activates the table when activate is true."
- **Parameters:** `table_name: string` (required); each optional — `data_class: string`,
  `size_category: string`, `buffering: { allowed?: string, type?: string, area_key_fields?:
  number }`, `storage_type: string`, `sharing_type: string`, `load_unit: string`,
  `logging_enabled: boolean`; `transport_request?: string` ("not a task");
  `activate: boolean` (required); `...DETAIL_SHAPE`. At least one setting is required
  (schema refinement). The value help's data classes and size categories
  (`TABLE_DATA_CLASSES`, `TABLE_SIZE_CATEGORIES`) are listed in the descriptions, not enforced as an
  enum: a system may define its own data classes.
- **Returns:** the settings as written (the PUT's answer, `terseWrite` by default), plus the
  activation's messages when activated.
- **Served:** `HighLevelHandlersGroup`; `available_in: ['onprem', 'cloud']`.
- **How it writes:** lock (`getTableSettings().lock`) → `patchMetadata` (adt-clients 46.1.0, below)
  with the given fields → unlock → activate the table when `activate` is true. The read, the
  overlay and the guarded PUT are the library's; the server holds no merge of its own.

#### adt-clients 46.1.0: `patchMetadata` on `getTableSettings()` (to be built there)

```ts
patchMetadata(
  config: ITableSettingsPatchConfig,
  options: { headers: IAdtHeaders } & IAdtTableSettingsPatchOptions<E> & { analyse?: IAnalyse<E> },
): Promise<IAdtResponse<TMetadataUpdated, E>>;

interface ITableSettingsPatchConfig {
  tableName: string;
  transportRequest?: string | undefined;
  /** The settings to change; every field optional, `buffering` and `translation` field by field. */
  changes: ITableSettingsChanges; // DeepPartial of ITableSettings, isWritableByAMDP?: never
}
type IAdtTableSettingsPatchOptions<E> = Omit<IAdtUpdateOptions<E>, 'source' | 'lockHandle' | 'ifMatch'>
  & { source?: never; ifMatch?: never; lockHandle: string };
```

- Under the caller's `lockHandle` (required; empty throws before any request), in one call:
  `readMetadata(version: 'inactive')` — the working area, with its ETag; overlay `changes` on the
  typed settings read (a field given replaces, a field not given keeps the value read; `buffering`
  and `translation` per field); `description` written back as read; `isWritableByAMDP` never
  written; then `updateMetadata` of the whole document with `ifMatch` = the read's ETag.
- `changes` with no field is refused before any request. A read that answers no ETag is a refusal
  (nothing written). A refused read or PUT is answered as SAP answered it, under the caller's
  `analyse`; nothing is retried.
- Its interfaces (`ITableSettingsPatchConfig`, `ITableSettingsChanges`,
  `IAdtTableSettingsPatchable`) go into interfaces-adt first (a minor), then adt-clients 46.1.0.

### GetTextElements (full; read-only build too)

- **Description:** "[read-only] Reads the text elements of the program, function group or class
  named by object_name: text symbols (key, text, maximum length), selection texts (name, text,
  whether the text comes from the dictionary) and list and column headings, in the original
  language, at the version asked. A class has text symbols only."
- **Parameters:** `object_kind: 'program' | 'function_group' | 'class'` (required); `object_name:
  string` (required); `parts?: ('symbols' | 'selections' | 'headings')[]` (default: every part the
  kind has; `selections` and `headings` refused for `class` by the schema); `version?` as above.
- **Returns:** `{ object_kind, object_name, version, symbols?: [{ key, text, max_length }],
  selections?: [{ name, text, ddic_reference }], headings?: { list_header, column_header_1 …
  column_header_4 } }` — one request per part asked.
- **Served:** `ReadOnlyHandlersGroup`; `available_in: ['onprem', 'cloud']`. On cloud: `program`
  and `class`; `function_group` pending measurement.

### UpdateTextElements (full)

- **Description:** "Writes the text elements of the existing program, function group or class named
  by object_name, in its original language. Each part given replaces that part's whole list:
  entries left out of it are deleted. Locks the text elements, writes each part given, unlocks, and
  activates the object together with its text elements when activate is true."
- **Parameters:** `object_kind` and `object_name` as above; at least one of
  `symbols: [{ key: string (up to 3 characters), text: string, max_length: number }]`,
  `selections: [{ name: string (up to 8 characters), text: string (up to 30 characters),
  ddic_reference?: boolean }]`, `headings: { list_header?, column_header_1? … column_header_4? }`
  (strings; an empty or missing heading is deleted); `transport_request?`; `activate: boolean`
  (required); `...DETAIL_SHAPE`. The length limits are stated in the descriptions and left
  to SAP's own refusal (`406` `SEDX_ADT/102`, `/110`), which reaches the model as it is.
- **Returns:** per part written, the list SAP saved (its answer echoes it); the activation's
  messages when activated; on a failed part, the parts written before it (saved inactive) and the
  failure.
- **Served:** `HighLevelHandlersGroup`; `available_in: ['onprem', 'cloud']`. On cloud the schema
  takes `object_kind: 'class'` only (`byVariant`): cloud has no programs of its own to write.

### Compact

| compact type | HandlerGet | HandlerUpdate | HandlerActivate |
|---|---|---|---|
| `TABLE_SETTINGS` | → GetTableSettings (`object_name` = table) | → UpdateTableSettings (settings fields as above) | — (activate the `TABLE`) |
| `PROGRAM_TEXT_ELEMENTS` | → GetTextElements, kind `program` | → UpdateTextElements | `PROG/PX` |
| `FUNCTION_GROUP_TEXT_ELEMENTS` | → GetTextElements, kind `function_group` | → UpdateTextElements | `PROG/PX` at `functiongroups` |
| `CLASS_TEXT_ELEMENTS` | → GetTextElements, kind `class` | → UpdateTextElements | `CLAS/OCX` |

Wiring:
`CompactObjectType` gains the members; `COMPACT_READ_ROUTES` / `COMPACT_UPDATE_ROUTES` route them
(`{ api: 'tableSettings', operation: 'readMetadata' | 'updateMetadata' }`, `{ api: 'textElements',
operation: 'read' | 'update' }`); `compactReadRouterMap` (`compact-readonly-entries`) and
`compactWriteRoutes` (`compact-modify`) map them to the full handlers through `defineTool`, as
`LOCAL_TYPES` does. HandlerGet's `part` takes `symbols | selections | headings` for the text-element
types; `version` is HandlerGet's. On cloud, `COMPACT_UPDATE.cloud` filters out
`PROGRAM_TEXT_ELEMENTS` and `FUNCTION_GROUP_TEXT_ELEMENTS`, and `FUNCTION_GROUP_TEXT_ELEMENTS` is
pending measurement in `COMPACT_READ.cloud` too. The read-only compact binaries get the
HandlerGet members only.

## Parameters per system kind

| | onprem | cloud | legacy (7.40) |
|---|---|---|---|
| GetTableSettings / UpdateTableSettings | all fields | all fields; `is_writable_by_amdp` read only | not served |
| GetTextElements | program, function group, class | program, class; function group pending measurement | not served |
| UpdateTextElements | program, function group, class | class; function group pending measurement | not served |
| ActivateObjects `PROG/PX` | program, function group (`parentName`) | accepted (the library lists it) | not served |
| ActivateObjects `CLAS/OCX` | yes | yes | not served |
| GetWhereUsed `PROG/PX` + `container` | program, function group | program | not served |

**Legacy.** The full tools are filtered by `available_in` (legacy is its own kind there). The compact
projections read legacy as onprem (`statedSystemKind`), so the four new compact types are refused
by the handler before any request on a stated `legacy` system, in fixed words naming the system
kind — the answer adt-clients-legacy gives (`AdtClientLegacy` refuses both factories). The server
builds no `AdtClientLegacy` today, so the dependency is dropped.

## ActivateObjects and the text elements

| option | what it does | for | against |
|---|---|---|---|
| **A. Automatic pairing** | every `PROG/P`, `FUGR/F`, `CLAS/OC` in the request also sends its text elements' reference | the model names only the object; matches "activate together" literally | changes the wire of every program, function group and class activation (single activation becomes a group one); a reference to text elements with nothing inactive is unmeasured; on cloud every class activation grows |
| **B. Explicit codes** (decided) | `objects[].type` takes `PROG/PX` and `CLAS/OCX` (the library lists them as activation codes, and the server's projection must list them anyway); `PROG/PX` with `parentName` is a function group's text elements (address `/textelements/functiongroups/{parentName}`); `still_inactive` names them, so the next call names both; the update tools' `activate: true` pairs them themselves (`textElementsActivationReferences`) | explicit, measured (the pair, and the text elements alone, both activated), no change to any existing activation | the model names two objects after a text write by `ActivateObjects` |
| **C. Pair from the inactive list** | before activating, read the inactive objects and add the text elements of the objects named | automatic only where needed | one extra request per activation; a second read deciding what is sent |

Decided: **B**. HandlerActivate gets the same through the three text-element compact types.
The main-type shorthand keeps its meaning: `PROG/PX`, `CLAS/OCX` and `TABL/DTT` never stand for a
main type (otherwise `CLAS` becomes ambiguous in activation and in the table codes, and `PROG`
resolves to `PROG/PX` in cloud activation — see break 5).

## Where-used

`GetWhereUsed` (and HandlerSystem's `where_used`, and each `objects[]` entry) gain
`container?: 'program' | 'function_group'`, required when `object_type` is `PROG/PX` and refused
with any other type (schema refinement, the library's rule). The code reaches the library as
`{ object_type: 'PROG/PX', container: 'program' | 'functionGroup' }`; every other code goes as
`Exclude<AdtWhereUsedCode, 'PROG/PX'>`. `CLAS/OCX` is not a where-used code (the library excludes
it). The `object_type` description lists `PROG/PX` with "a program's or a function group's text
elements; container says which".

## Locking

Every update tool is one atomic call: lock → write → unlock, through `withLock`, then an optional
activation after the unlock (`carryCleanup`). A refused release is reported as `left_locked`, as
today. Only LOCK and UNLOCK go stateful (the library's lock registry); the read under the lock and
the PUT are stateless.

- **UpdateTableSettings** locks the settings (`getTableSettings().lock`, ESDICT `TABT`), never the
  table: inside, `patchMetadata` (adt-clients 46.1.0: its read, overlay and guarded PUT) → unlock →
  `getTable().activate` when `activate` is true.
- **UpdateTextElements** locks the text elements at the object's address (`getTextElements().lock`,
  `TEXT`): inside, one `update` per part given → unlock → `utils.activateObjects(
  textElementsActivationReferences(object))` when `activate` is true. The cloud lock's `NoModification` is not a
  refusal.
- `tools/stateful-sites.json` is unchanged: no new `setSessionType` site in the server.

## Tests

New tests are node:test only, each listed in `tools/node-test-files.json` (the build and the runner
read only that list); no Jest file is added. Existing Jest tests that enumerate tools or codes
(descriptions, compact completeness, projections) are updated where they are.

**Unit** (`src/__tests__/unit/…`, an ADT stand-in as `draft/getObjectDraft.test.ts` does, answers
from adt-clients' recorded corpus `*settings*` / `*text-*` where they exist):

- GetTableSettings: request and projection; 404 passed through.
- UpdateTableSettings: lock → `patchMetadata` with exactly the given fields → unlock, in order;
  unlock after a refused patch; activation only after a clean unlock and only when `activate` is
  true; `left_locked` on a refused release. (The overlay itself is tested in adt-clients.)
- GetTextElements: one read per part, default parts per kind; `class` with `selections` refused by
  the schema.
- UpdateTextElements: one lock, one PUT per part, one unlock; the cloud schema takes `class` only;
  the activation names the pair (function group at `functiongroups`).
- ActivateObjects / HandlerActivate: `PROG/PX`, `CLAS/OCX` accepted; `PROG/PX` + `parentName` sent at
  the function group's address; `CLAS` and cloud `PROG` keep their main-type meaning.
- GetWhereUsed / HandlerSystem: `container` required with `PROG/PX`, refused otherwise, sent as the
  library's `container`.
- Compact: the four types routed in HandlerGet / HandlerUpdate; refused on a stated `legacy`
  system before any request; absent from the read-only HandlerUpdate.
- Descriptions: the literal scan (`toolDescriptionsCarryNoLiterals`) covers the new tools.

**Integration** (`liveSuite`, `liveCall`, own objects created and deleted by the suite, every lock
released by its own handle):

- `high/table/TableSettingsHandlers.test.ts`, `['onprem', 'cloud']`: create a table → write
  non-default settings → activate → GetTableSettings `active` reads them; the same through compact
  `TABLE_SETTINGS`; delete.
- `high/textElements/TextElementsHandlers.test.ts`: onprem — a program (all three parts), a function
  group (symbols), a class (symbols): write, read `inactive`, activate with the update tool, read
  `active`, whole-list replace deletes a left-out entry; cloud — a class (symbols) write/read/
  activate, and the read of a delivered program named by the test config (never a literal in the
  file). Compact text-element types the same.
- `coverage/activateObjectsRefusal.live.test.ts` and `coverage/activatePerType.live.test.ts`: after a
  text write, `[PROG/P]` alone names `PROG/PX` in `still_inactive`; the pair activates; a function
  group's `PROG/PX` + `parentName` activates.
- `readOnly/system/WhereUsedHandlers.test.ts`: `PROG/PX` with each container (onprem), program
  (cloud).
- The test config gains the sections these suites read (`testConfigSections.test.ts` checks the
  template).

## What the 46.0.0 install breaks

Installed from the registry (`adt-clients` 46.0.0, `adt-strategies` 0.25.0, `adt-clients-legacy`
0.11.0, `interfaces-adt` 30.0.0); the lockfile holds no `"link": true`, and every entry resolves
from the registry; one copy of interfaces-adt. `npm run build` stops at the root `tsc`;
`test:check` (all packages) finds the same 12 plus one:

1. `WHERE_USED_CODES` (onprem, cloud): missing `TABL/DTT`, `PROG/PX` (`Complete`). Fix: add `PROG/PX`;
   `TABL/DTT` excluded by type (`Exclude<WhereUsedCode<V>, 'TABL/DTT'>` in the projection) until
   measured.
2. `ACTIVATION_CODES` (onprem, cloud): missing `PROG/PX`, `CLAS/OCX`. Fix: add them (option B).
3. `TABLE_CODES`: missing `TABL/DTT`, `PROG/PX`, `CLAS/OCX`. Fix: add them.
4. `whereUsedList.ts:228,245`, `handleGetWhereUsed.ts:555,564,598,600`: a variable of the whole
   where-used union no longer compiles (`PROG/PX` needs `container`). Fix: the `PROG/PX` branch with
   its container, the rest typed `Exclude<…, 'PROG/PX'>` (Where-used above).
5. `adtBoundary.typecheck.ts:188`: unused `@ts-expect-error` — with `PROG/PX` in cloud activation,
   `PROG` became one code there. Fix: the sub-resource codes stay out of main-type resolution, so
   the expectation holds again (and `CLAS` stays unambiguous).

`compact-modify/package.json` and `server-runtime/package.json` move `interfaces-adt` to `^30.0.0`
with the root. `adt-clients-legacy` is removed from the install. The install is not committed yet.

## Dependency

`UpdateTableSettings` and `HandlerUpdate TABLE_SETTINGS` need adt-clients **46.1.0** (`patchMetadata`,
above) published on the registry, on the interfaces-adt minor carrying its types. Order:
interfaces-adt minor → adt-clients 46.1.0 → this server takes `^46.1.0`. Everything else here builds
on 46.0.0; the server never builds against an unpublished release.

## Pending measurement

- A cloud write and read of a function group's text elements (lock, PUT, activation), and whether
  the cloud lists function groups of its own to write. Until it is measured, cloud serves no
  function-group text elements.
- Where-used of `TABL/DTT` on both systems; until measured it is no where-used code.
