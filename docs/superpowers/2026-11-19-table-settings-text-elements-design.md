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
  after a text write answers "still inactive PROG/P and PROG/PX").

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
  `activate?: boolean` (default `false`); `...DETAIL_SHAPE`. At least one setting is required
  (schema refinement). The value help's data classes and size categories
  (`TABLE_DATA_CLASSES`, `TABLE_SIZE_CATEGORIES`) are listed in the descriptions, not enforced as an
  enum: a system may define its own data classes.
- **Returns:** the settings as written (the PUT's answer, `terseWrite` by default), plus the
  activation's messages when activated.
- **Served:** `HighLevelHandlersGroup`; `available_in: ['onprem', 'cloud']`.
- **How it writes the whole document:** under the lock it reads `version: 'inactive'` (the working
  area, with its ETag), overlays the given fields on the typed settings, keeps `description` and
  `translation` as read, drops `isWritableByAMDP`, and calls `updateMetadata` with `ifMatch`. The
  merge is on typed values; the library builds the XML (see Open question "Where the merge lives").

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
- **Served:** `ReadOnlyHandlersGroup`; `available_in: ['onprem', 'cloud']`. On cloud every kind is
  read (see Open question "Function groups on cloud").

### UpdateTextElements (full)

- **Description:** "Writes the text elements of the existing program, function group or class named
  by object_name, in its original language. Each part given replaces that part's whole list:
  entries left out of it are deleted. Locks the text elements, writes each part given, unlocks, and
  activates the object together with its text elements when activate is true."
- **Parameters:** `object_kind` and `object_name` as above; at least one of
  `symbols: [{ key: string (up to 3 characters), text: string, max_length: number }]`,
  `selections: [{ name: string (up to 8 characters), text: string (up to 30 characters),
  ddic_reference?: boolean }]`, `headings: { list_header?, column_header_1? … column_header_4? }`
  (strings; an empty or missing heading is deleted); `transport_request?`; `activate?: boolean`
  (default `false`); `...DETAIL_SHAPE`. The length limits are stated in the descriptions and left
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

The compact names are the recommendation of Open question "Compact text-element types". Wiring:
`CompactObjectType` gains the members; `COMPACT_READ_ROUTES` / `COMPACT_UPDATE_ROUTES` route them
(`{ api: 'tableSettings', operation: 'readMetadata' | 'updateMetadata' }`, `{ api: 'textElements',
operation: 'read' | 'update' }`); `compactReadRouterMap` (`compact-readonly-entries`) and
`compactWriteRoutes` (`compact-modify`) map them to the full handlers through `defineTool`, as
`LOCAL_TYPES` does. HandlerGet's `part` takes `symbols | selections | headings` for the text-element
types; `version` is HandlerGet's. On cloud, `COMPACT_UPDATE.cloud` filters out
`PROGRAM_TEXT_ELEMENTS` and `FUNCTION_GROUP_TEXT_ELEMENTS`. The read-only compact binaries get the
HandlerGet members only.

## Parameters per system kind

| | onprem | cloud | legacy (7.40) |
|---|---|---|---|
| GetTableSettings / UpdateTableSettings | all fields | all fields; `is_writable_by_amdp` read only | not served |
| GetTextElements | program, function group, class | program, function group, class | not served |
| UpdateTextElements | program, function group, class | class | not served |
| ActivateObjects `PROG/PX` | program, function group (`parentName`) | accepted (the library lists it) | not served |
| ActivateObjects `CLAS/OCX` | yes | yes | not served |
| GetWhereUsed `PROG/PX` + `container` | program, function group | program | not served |

**Legacy.** The full tools are filtered by `available_in` (legacy is its own kind there). The compact
projections read legacy as onprem (`statedSystemKind`), so the four new compact types are refused
by the handler before any request on a stated `legacy` system, in fixed words naming the system
kind — the answer adt-clients-legacy gives (`AdtClientLegacy` refuses both factories). The server
builds no `AdtClientLegacy` today, so the dependency is not needed (Open question
"adt-clients-legacy").

## ActivateObjects and the text elements

| option | what it does | for | against |
|---|---|---|---|
| **A. Automatic pairing** | every `PROG/P`, `FUGR/F`, `CLAS/OC` in the request also sends its text elements' reference | the model names only the object; matches "activate together" literally | changes the wire of every program, function group and class activation (single activation becomes a group one); a reference to text elements with nothing inactive is unmeasured; on cloud every class activation grows |
| **B. Explicit codes** (recommended) | `objects[].type` takes `PROG/PX` and `CLAS/OCX` (the library lists them as activation codes, and the server's projection must list them anyway); `PROG/PX` with `parentName` is a function group's text elements (address `/textelements/functiongroups/{parentName}`); `still_inactive` names them, so the next call names both; the update tools' `activate: true` pairs them themselves (`textElementsActivationReferences`) | explicit, measured (the pair, and the text elements alone, both activated), no change to any existing activation | the model names two objects after a text write by `ActivateObjects` |
| **C. Pair from the inactive list** | before activating, read the inactive objects and add the text elements of the objects named | automatic only where needed | one extra request per activation; a second read deciding what is sent |

Recommendation: **B**. HandlerActivate gets the same through the three text-element compact types.
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
  table: inside, read inactive with the ETag → `updateMetadata` with `ifMatch` → unlock →
  `getTable().activate` when asked.
- **UpdateTextElements** locks the text elements at the object's address (`getTextElements().lock`,
  `TEXT`): inside, one `update` per part given → unlock → `utils.activateObjects(
  textElementsActivationReferences(object))` when asked. The cloud lock's `NoModification` is not a
  refusal.
- `tools/stateful-sites.json` is unchanged: no new `setSessionType` site in the server.

## Tests

New tests are node:test only, each listed in `tools/node-test-files.json` (the build and the runner
read only that list); no Jest file is added. Existing Jest tests that enumerate tools or codes
(descriptions, compact completeness, projections) are updated where they are.

**Unit** (`src/__tests__/unit/…`, an ADT stand-in as `draft/getObjectDraft.test.ts` does, answers
from adt-clients' recorded corpus `*settings*` / `*text-*` where they exist):

- GetTableSettings: request and projection; 404 passed through.
- UpdateTableSettings: lock → read inactive → PUT with `ifMatch` → unlock, in order; given fields
  overlay the read, `description` and `translation` kept, `isWritableByAMDP` never sent; unlock
  after a refused PUT; activation only after a clean unlock; `left_locked` on a refused release.
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
   `TABL/DTT` per Open question "Where-used of the settings".
2. `ACTIVATION_CODES` (onprem, cloud): missing `PROG/PX`, `CLAS/OCX`. Fix: add them (option B).
3. `TABLE_CODES`: missing `TABL/DTT`, `PROG/PX`, `CLAS/OCX`. Fix: add them.
4. `whereUsedList.ts:228,245`, `handleGetWhereUsed.ts:555,564,598,600`: a variable of the whole
   where-used union no longer compiles (`PROG/PX` needs `container`). Fix: the `PROG/PX` branch with
   its container, the rest typed `Exclude<…, 'PROG/PX'>` (Where-used above).
5. `adtBoundary.typecheck.ts:188`: unused `@ts-expect-error` — with `PROG/PX` in cloud activation,
   `PROG` became one code there. Fix: the sub-resource codes stay out of main-type resolution, so
   the expectation holds again (and `CLAS` stays unambiguous).

`compact-modify/package.json` and `server-runtime/package.json` move `interfaces-adt` to `^30.0.0`
with the root. The install is not committed yet.

## Open questions for the owner

1. **ActivateObjects.** A, B or C above. *Recommend B.*
2. **Where the merge lives.** UpdateTableSettings takes the fields to change and overlays them on
   the read in the server (typed values, the library builds the XML) — or the tool takes every
   setting (the model reads first and sends all), or adt-clients first gains a patch member.
   *Recommend the typed overlay in the handler:* no XML in the server, one call for the model; the
   rule "read-patch-write in adt-clients" is about XML patchers, and this is none — your call.
3. **Compact text-element types.** Three types (`PROGRAM_TEXT_ELEMENTS`,
   `FUNCTION_GROUP_TEXT_ELEMENTS`, `CLASS_TEXT_ELEMENTS`) or one `TEXT_ELEMENTS` with a new
   `object_kind` argument. *Recommend three:* no new HandlerGet/HandlerUpdate argument, each type's
   parts and activation code fixed by its name.
4. **Function groups on cloud.** The facts say cloud creates no function groups, but the server
   serves `HandlerCreate FUNCTION_GROUP` and its activation on cloud today, and cloud discovery
   lists `/textelements/functiongroups`. Options: cloud writes `class` only (as above); or also
   `function_group`, after a live cloud write measures it. *Recommend class only now,* and a
   measurement of a cloud function group's text write before widening.
5. **Where-used of the settings (`TABL/DTT`).** The library admits it; nothing measured. Options:
   list it, or exclude it by type until a live where-used run shows it served. *Recommend exclude
   until measured* (one where-used call in the settings suite decides).
6. **adt-clients-legacy.** The server imports nothing from it (legacy runs on the on-premise client,
   filtered by `available_in`). Options: leave it out of `package.json` in this PR, or add it now for
   a later legacy client. *Recommend leaving it out* until the legacy-client task.
7. **`activate` default.** `UpdateTable` defaults to activating; the new update tools default to
   `false` (settings are usually written between a DDL save and one activation; text writes beside
   a source change). *Recommend `false`* for both new tools.
