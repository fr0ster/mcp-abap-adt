# Table technical settings and text elements as tools — design

## Intent

Expose two ADT sub-resources the server cannot reach today, in one change:

- a table's **technical settings** (`TABL/DTT`, `/sap/bc/adt/ddic/db/settings/{name}`) — read, and
  write non-default values (the owner reports Eclipse refusing to activate a table without them —
  not reproduced by S6; V1);
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
- **Function groups' text elements are served on onprem and on cloud** (T10).
- **Compact:** `TABLE_SETTINGS`, `PROGRAM_TEXT_ELEMENTS`, `FUNCTION_GROUP_TEXT_ELEMENTS`,
  `CLASS_TEXT_ELEMENTS`.
- `TABL/DTT` stays out of where-used until it is measured.
- The unused `adt-clients-legacy` dependency is dropped: the server imports nothing from it.
- `activate` on the new update tools is a **required** boolean: the existing update tools have no
  single convention (some default to `true`, some to `false`, some have none), so no implicit
  default.

## Facts the design rests on

Every statement about SAP behaviour carries its ground: **Code** (handler class, method, quoted
line), **Measured** (system, request, status), or **unverified** — and every unverified one is in
"To verify in SAP handlers". Sources are the research notes of 2026-11-19 (`sap-handler/` in the
session scratchpad: `table-settings.md` (TS), `texts-translation.md` (TT), their raw answers) and
the recorded discovery of adt-clients' corpus (`corpus/adt/discovery/`). Handler code was read on
premise only; on the cloud the ground is a measurement or nothing.

### Table settings

- **S1 Own resource, v2 only.** Measured onprem: `GET /sap/bc/adt/ddic/db/settings/sflight` with the
  v2 Accept → 200, a v1 Accept → 406 SADT_RESOURCE 037 (TS §3, `raw/onprem-get-sflight-v2.txt`,
  `-v1.txt`). Measured cloud: discovery lists the collection accepting v2 and text/html only; an
  existing table's GET → 200 with an ETag (TS §8 "Cloud reads", `raw/cloud-read2.txt`).
- **S2 Own lock, `TABT`.** Code onprem: `CL_TABT_WB_PERSIST->if_wb_object_persist~lock`,
  `CALL FUNCTION 'ENQUEUE_ESDICT' … objtype = cl_tabt_object_data=>co_sub_transport_type`
  (`co_sub_transport_type = 'TABT'`, `CL_TABT_OBJECT_DATA`; `raw/cls-persist.abap:135-138`). Measured
  both: `POST …/settings/{t}?_action=LOCK&accessMode=MODIFY` → 200 with a handle; UNLOCK → 200
  (TS §8 step 3, `raw/onprem-trial2.txt` §3a/3c, `raw/cloud-trial2.txt` §3a/3c). That the table's
  own lock does not cover the settings: Code onprem only (another `objtype`); unverified on cloud
  and never measured (V3).
- **S3 The PUT writes the settings row from the document, a field left out reset.** Code onprem:
  `CL_TABT_WB_PERSIST->move_adt_to_ddv` sets `tabart`, `tabkat`, `bufallow` (blank → `'N'`),
  `pufferung`, `schfeldanz` (only `IF e_dd09l_wa-pufferung = 'G'`), `roworcolst`, `sharingtype`,
  `load_unit`, `uebersetz`, `protokoll` from the document, then `save` calls `DDIF_TABT_PUT`
  (`raw/cls-persist.abap:175-177, 214-237`). Measured both: active `storageType` `C` → PUT of a
  document without `storageType` → 200 → the inactive read answers `storageType` empty
  (`raw/onprem-trial2.txt` lines 29 → 52, `raw/cloud-trial2.txt` lines 47 → 70).
- **S4 `adtcore:description` required.** Measured onprem: PUT without it → 400
  `ExceptionInvalidData` SWB_TOOL 019 "The description is missing" (TS §8 step 3, run 1,
  `raw/onprem-trial.txt`). Cloud: unverified (every cloud PUT carried it; V4).
- **S5 `ts:translation`.** Measured both: the minimal PUT without `ts:translation` → 200 (TS §8
  "Minimal document", `raw/onprem-trial2.txt` §3b, `raw/cloud-trial2.txt` §3b). adt-clients 46.0.0's
  README says SAP refuses a write without it (`400 00/001`): **contradicted** by this measurement;
  what that refusal was is V5. `uebersetz` is written from it (S3), so leaving it out resets it.
- **S6 Defaults with the table; activation of the table activates them.** Measured both:
  `CreateTable` → settings GET → 200 `version="new"`, APPL0 / 0 / N; activating the table alone
  (`POST /sap/bc/adt/activation?method=activate`, one `TABL/DT` reference) → 200
  `activationExecuted="true"`, settings then `active`; after a settings PUT the same table-only
  activation → settings `active` with the written values (TS §8 steps 1, 2, 4, 5). An activation of
  `TABL/DTT` alone was never sent.
- **S7 Cloud reads `isWritableByAMDP`.** Measured cloud: the element is in every cloud read
  (`raw/cloud-trial2.txt`), absent on premise; Code onprem: not in `SDDIC_ADT_TTAB` (TS §2, §8).
  Whether the cloud PUT accepts or refuses it: unverified; the design never writes it.
- **S8 Value-help data classes.** Measured onprem: `…/settings/dataClass/values` → 200 APPL0, APPL1,
  APPL2, DDIM, DFACT, … (TS §3, `raw/onprem-dataclass-values.txt`). Cloud values and whether a system
  may define its own data classes: unverified (V6).
- **S9 Not on 7.40.** Measured (recorded discovery): `system-description-basis-740--03-discovery`
  has no `/sap/bc/adt/ddic/db/settings` (0 occurrences; checked 2026-11-19).

### Text elements

- **T1 Parts per kind.** Code onprem: `CL_SEDX_ADT_RES_TEXTELEMENT->get_properties`,
  `case global_type-objtype_tr. when 'CLAS'. append … co_source-symbols … when 'PROG'. … symbols …
  selections … headings. when 'FUGR' or 'FUGS' or 'FUGX'. … symbols … selections … headings.`
  (`cls-sedx-res-textelement.abap:251-262`). Measured cloud: a function group's properties list the
  three parts (TT §13.2).
- **T2 Own lock, `TEXT`.** Code onprem: `lcl_access_permission->modify`,
  `cl_adt_lock_handle=>get_instance( 'TEXT' )` and `RS_ACCESS_PERMISSION … object_class = 'TEXT'`
  (`sedx-locals.abap:330-345`). Measured both: `POST /textelements/{kind}/{n}?_action=LOCK&accessMode=MODIFY`
  → 200 `IS_LOCAL=X`; UNLOCK → 200 (TT §8, §10 step 08, §13.3). Cloud's lock answers
  `MODIFICATION_SUPPORT=NoModification` and the PUT still saves (Measured cloud, TT §8, §13.3).
- **T3 A write replaces the whole part.** Measured onprem: PUT symbols with only 001 → 200, 002 gone
  (TT §8); headings: an empty or left-out key is deleted, Code onprem `lcl_textpool->save`
  `if sy-subrc = 0 and i_tpool-&1 is initial. delete tpool index sy-tabix.` (TT §12.3). Cloud:
  unverified (V7).
- **T4 Original language only.** Code onprem: `lcl_textpool->read` reads `masterlang` from TADIR and
  calls `RS_TEXTPOOL_READ … language = master_language`; `save` calls
  `RPY_TEXTELEMENTS_INSERT_AIE … language = tadir-masterlang` (`sedx-locals.abap:30-50, 174-200`).
  Measured: PUT under `sap-language: RU` (onprem) / `DE` (cloud) → written to the original pool
  (TT §8).
- **T5 The save is inactive and puts the object in the working area.** Measured onprem: after a
  selections PUT the inactive list holds `PROG/P` and `PROG/PX` (TT §10, step 26); after a function
  group's PUT `FUGR/F` and `PROG/PX` `SAPL{GROUP}` (TT §12.1). Measured cloud: the same pair for a
  function group (TT §13.4).
- **T6 Activation names the pair.** Measured: onprem program — program URI + text-elements URI →
  `activationExecuted="true"`, inactive list empty (TT §8, §10 steps 38-39); onprem, after a later
  change, the text-elements URI alone (TT §10 steps 51-52); onprem function group — `{FUGR/F}` +
  `{PROG/PX, /textelements/functiongroups/{g}}`, and `{PROG/PX, te-uri}` alone, either name (TT §12.1);
  cloud function group — the pair (TT §13.4); cloud class — class URI + text-elements URI (TT §8).
  `ActivateObjects [{PROG/P}]` alone after a text write → "no activation ran; still inactive PROG/P
  and PROG/PX" (Measured onprem, TT §8). Onprem class (`CLAS/OCX`) write and activation: unverified
  (the onprem trials used a program; V8).
- **T7 Refusals on the write.** Measured onprem, each with its Code line (TT §10, §12.2): selection
  name over 8 → 406 `SEDX_ADT/102` (`if strlen( key ) > 8. message e102(sedx_adt) with key 8`);
  selection text over 30 → 406 `SEDX_ADT/110`, nothing saved; a symbol line without `=` in its first
  four characters (key `0001`) → 406 `SEDX_ADT/106`; a headings key outside the five → 406
  `SEDX_ADT/101`. An unknown selection name → 200, stored. A symbol text longer than its
  `maxLength`, and every refusal on cloud: unverified (V9).
- **T8 Selection text with `@DDICReference`.** Measured onprem: the text written is replaced by the
  dictionary label (TT §10).
- **T9 Versions.** Measured onprem: no parameter = `workingArea` = `inactive`; `active` = the last
  activated (TT §10 table, §12.4; case-insensitive, unknown values read the working area). Measured
  cloud: `?version=active` after activation returns the new symbol (TT §13.5).
- **T10 Function groups on cloud.** Measured cloud (TT §13, `raw-te/cloud-fugr/`): create in a local
  package with no transport → success; properties → 200 `adtcore:type="FUGR/PX"`; symbols, selections
  → 200; headings → 200 with five empty keys; LOCK, PUT symbols, UNLOCK → 200; the pair activation →
  `activationExecuted="true"`; where-used → 200 `globalType="PROG/PX"`.
- **T11 Programs on cloud.** Measured cloud: delivered programs' text elements read → 200 (TT §12.5,
  §12.6). That cloud has no program of its own to write: the server's documented gating (CLAUDE.md,
  "Cloud vs On-Prem"), not measured here (V10).
- **T12 Not on 7.40.** Measured (recorded discovery): `system-description-basis-740--03-discovery`
  has no `/textelements` (TT §9; 0 occurrences, checked 2026-11-19).

### Where-used

- **W1 Served by registration, not by type.** Code onprem: `CL_RIS_ADT_RES_REFERENCES->post`,
  `IF i_referenced_object-referencing_object_types IS INITIAL. … build_not_supported( … ) ELSE. …
  get_results( … )` — an unsupported type is 200 with "not supported" and 0 results (TT §11).
- **W2 `PROG/PX`.** Measured: onprem `/textelements/programs/{p}` and `/textelements/functiongroups/{g}`
  → 200 `globalType="PROG/PX"`, scope offered (TT §11); cloud programs (TT §12.6) and function groups
  (TT §13.6) → 200 `globalType="PROG/PX"`.
- **W3 `CLAS/OCX`.** Measured both: 200, "Where-Used List is not supported for Text Element: Class.",
  0 results (TT §11).
- **W4 `TABL/DTT`.** Unverified on both (V2).

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
  answers it (cloud, S7).
- **Served:** `ReadOnlyHandlersGroup` (every full binary, `-ro` included); `available_in:
  ['onprem', 'cloud']` (S1; 7.40 S9).

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
  enum (S8; whether a system may define its own is V6).
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
  `readMetadata(version: 'inactive')` — the working area, with its ETag (S1); overlay `changes` on the
  typed settings read (a field given replaces, a field not given keeps the value read; `buffering`
  and `translation` per field; every field is written back because a left-out one is reset, S3);
  `description` written back as read (S4); `isWritableByAMDP` never written (S7); then
  `updateMetadata` of the whole document with `ifMatch` = the read's ETag (the If-Match form is V11).
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
  (Parts T1, language T4, dictionary text T8, versions T9.)
- **Parameters:** `object_kind: 'program' | 'function_group' | 'class'` (required); `object_name:
  string` (required); `parts?: ('symbols' | 'selections' | 'headings')[]` (default: every part the
  kind has; `selections` and `headings` refused for `class` by the schema); `version?` as above.
- **Returns:** `{ object_kind, object_name, version, symbols?: [{ key, text, max_length }],
  selections?: [{ name, text, ddic_reference }], headings?: { list_header, column_header_1 …
  column_header_4 } }` — one request per part asked.
- **Served:** `ReadOnlyHandlersGroup`; `available_in: ['onprem', 'cloud']`; every kind on both
  (onprem T1–T6; cloud: class T6, function group T10, program read T11; 7.40 T12).

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
  (required); `...DETAIL_SHAPE`. The limits are stated in the descriptions and left to SAP's own
  refusal (406 `SEDX_ADT/101`, `/102`, `/106`, `/110`, T7), which reaches the model as it is.
- **Returns:** per part written, the list SAP saved (its answer echoes it); the activation's
  messages when activated; on a failed part, the parts written before it (saved inactive) and the
  failure.
- **Served:** `HighLevelHandlersGroup`; `available_in: ['onprem', 'cloud']`. On cloud the schema
  takes `object_kind: 'class' | 'function_group'` (`byVariant`; T6, T10); `program` is left out on
  cloud on the server's gating, not a measurement (T11, V10).

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
`PROGRAM_TEXT_ELEMENTS` only (T11, V10). The read-only compact binaries get the
HandlerGet members only.

## Parameters per system kind

| | onprem | cloud | legacy (7.40) |
|---|---|---|---|
| GetTableSettings / UpdateTableSettings | all fields (S1–S6) | all fields; `is_writable_by_amdp` read only (S1–S7; S4 V4) | not served (S9) |
| GetTextElements | program, function group, class (T1–T9) | program (T11), function group (T10), class (T6) | not served (T12) |
| UpdateTextElements | program, function group (T5, T6); class (V8) | function group (T10), class (T6) | not served (T12) |
| ActivateObjects `PROG/PX` | program, function group via `parentName` (T6) | function group via `parentName` (T10) | not served (T12) |
| ActivateObjects `CLAS/OCX` | V8 | yes (T6) | not served (T12) |
| GetWhereUsed `PROG/PX` + `container` | program, function group (W2) | program, function group (W2) | not served (T12) |

**Legacy.** The full tools are filtered by `available_in` (legacy is its own kind there). The compact
projections read legacy as onprem (`statedSystemKind`), so the four new compact types are refused
by the handler before any request on a stated `legacy` system, in fixed words naming the system
kind — the answer adt-clients-legacy gives (`AdtClientLegacy` refuses both factories). The server
builds no `AdtClientLegacy` today, so the dependency is dropped.

## ActivateObjects and the text elements

| option | what it does | for | against |
|---|---|---|---|
| **A. Automatic pairing** | every `PROG/P`, `FUGR/F`, `CLAS/OC` in the request also sends its text elements' reference | the model names only the object; matches "activate together" literally | changes the wire of every program, function group and class activation (single activation becomes a group one); a reference to text elements with nothing inactive is unmeasured; on cloud every class activation grows |
| **B. Explicit codes** (decided) | `objects[].type` takes `PROG/PX` and `CLAS/OCX` (the library lists them as activation codes, and the server's projection must list them anyway); `PROG/PX` with `parentName` is a function group's text elements (address `/textelements/functiongroups/{parentName}`; T6, T10); `still_inactive` names them, so the next call names both; the update tools' `activate: true` pairs them themselves (`textElementsActivationReferences`) | explicit, measured (the pair, and the text elements alone, both activated: T6), no change to any existing activation | the model names two objects after a text write by `ActivateObjects` |
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
`Exclude<AdtWhereUsedCode, 'PROG/PX'>` (W2). `CLAS/OCX` is not a where-used code (W3; the library
excludes it). The `object_type` description lists `PROG/PX` with "a program's or a function group's text
elements; container says which".

## Locking

Every update tool is one atomic call: lock → write → unlock, through `withLock`, then an optional
activation after the unlock (`carryCleanup`). A refused release is reported as `left_locked`, as
today. Only LOCK and UNLOCK go stateful (the library's lock registry); the read under the lock and
the PUT are stateless.

- **UpdateTableSettings** locks the settings (`getTableSettings().lock`, ESDICT `TABT`, S2), never the
  table: inside, `patchMetadata` (adt-clients 46.1.0: its read, overlay and guarded PUT) → unlock →
  `getTable().activate` when `activate` is true.
- **UpdateTextElements** locks the text elements at the object's address (`getTextElements().lock`,
  `TEXT`, T2): inside, one `update` per part given → unlock → `utils.activateObjects(
  textElementsActivationReferences(object))` when `activate` is true (T6). The cloud lock's
  `NoModification` is not a refusal (T2).
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
- UpdateTextElements: one lock, one PUT per part, one unlock; the cloud schema takes `class` and
  `function_group`;
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
  `active`, whole-list replace deletes a left-out entry; cloud — a class and a function group
  (symbols) write/read/activate, and the read of a delivered program named by the test config (never
  a literal in the file). The suites also measure V3, V4, V7, V8, V9 where they can. Compact text-element types the same.
- `coverage/activateObjectsRefusal.live.test.ts` and `coverage/activatePerType.live.test.ts`: after a
  text write, `[PROG/P]` alone names `PROG/PX` in `still_inactive`; the pair activates; a function
  group's `PROG/PX` + `parentName` activates.
- `readOnly/system/WhereUsedHandlers.test.ts`: `PROG/PX` with each container, on both (W2).
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

adt-clients 46.1.0 also corrects its test skip for function groups on cloud: it assumed cloud
creates no function group, which was unverified and is contradicted by T10.

## To verify in SAP handlers

Each item has neither Code nor a measurement behind it; what must be read or measured:

- **V1** The owner's failing activation: the table's DDL and SAP's activation answer, measured,
  against S6 (default settings activated on both).
- **V2** Where-used of `TABL/DTT` (`/ddic/db/settings/{t}`) on both: measure; until then no
  where-used code.
- **V3** Cloud lock objects: read `CL_TABT_WB_PERSIST->lock` and the text-elements lock on cloud, or
  measure: a table held by its own lock, then a settings LOCK on it (and the reverse).
- **V4** Cloud PUT of the settings without `adtcore:description`: measure the status.
- **V5** The `400 00/001` adt-clients attributes to a missing `ts:translation`: reproduce (an element
  with missing attributes?) on both, against S5.
- **V6** Cloud `dataClass/values`, and whether a customer data class is accepted by the PUT.
- **V7** Cloud whole-part replace (an entry left out deleted), and the headings rule on cloud.
- **V8** Onprem class text symbols: LOCK, PUT, read, and the `CLAS/OC` + `CLAS/OCX` activation.
- **V9** A symbol text longer than its `maxLength` (both), and the T7 refusals on cloud.
- **V10** Cloud text write to a delivered program (a lock on it): measure the refusal, or read the
  cloud handler's check.
- **V11** The settings PUT with `If-Match` with and without `; charset=utf-8` (adt-clients says 412
  with it): measure on both before `patchMetadata` relies on it.
