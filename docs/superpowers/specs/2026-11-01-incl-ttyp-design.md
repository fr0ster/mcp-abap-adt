# Spec: the server writes program includes and table types (#336)

Bound by `docs/superpowers/2026-11-01-incl-ttyp-goal.md`. Every fact carries its ground:
**Measured** (a run, with its date), **Code** (`file:line`, in this worktree or in
`node_modules`), **Inference** (reasoned, to be measured live before it is relied on).
Nothing here was measured for this spec: no SAP contact was made.

Abbreviations: *full set* = the core binaries' tools (`mcp-abap-adt`, `-http`, `-sse`);
*core-ro* = `mcp-abap-adt-ro`, `-http-ro`, `-sse-ro`; *compact* / *compact-ro* = the compact
binaries; `TT` = the table type, `INC` = the program include. `onprem` / `cloud` are the
declared system types; `legacy` is parked (goal, "Outside this goal").

---

## 1. What the type tables list

Code: `node_modules/@mcp-abap-adt/interfaces-adt/dist/adt/AdtTypeTables.d.ts` (interfaces-adt
24.0.1, adt-clients 39.0.0).

| Code | onprem (`ADT_TYPES_ONPREM`) | cloud (`ADT_TYPES_CLOUD`) |
|---|---|---|
| `PROG/I` (api `include`, kind `include`) — `:69-79`, `:526-536` | create, read, source, readMetadata, update, updateMetadata, lock, unlock, activate, validate, deletionCheck, delete, readEnhancementElements, readEnhancementOptions | read, source, readMetadata, deletionCheck, readEnhancementElements, readEnhancementOptions |
| `TTYP/DA` (api `tableType`, kind `table_type`) — `:186-196`, `:643-653` | create, readMetadata, updateMetadata, lock, unlock, activate, check, validate, versions, deletionCheck, delete, transport | the same twelve |

Consequences the spec follows (goal invariant "the type table decides"):

- `PROG/I` lists **no `check`, no `versions`, no `transport`** on either variant: no include
  check, version or transport-read tool is offered. ATC (`RunATC` `program_include`) stays the
  include's check, as today.
- `PROG/I` on cloud lists **`deletionCheck`** beside the reads. The goal says "on cloud the
  include stays read-only"; a deletion check changes nothing, so it is offered on cloud, as the
  program's is (`COMPACT_DELETION_CHECK` keeps `PROGRAM` on cloud, Code
  `src/lib/adtProjections.ts:1440-1443`).
- `TTYP/DA` lists **no `read` / `source`**: it is read and written through its metadata
  document only.
- `ADT_TYPES_BASIS_740` lists the include's lifecycle and has no `tableType` (Code
  `AdtTypeTables.d.ts:971-981`, and no `tableType` key in that table): recorded as debt (§10).

## 2. What is served today, tool by tool

| Tool / list | `PROG/I` | `TTYP/DA` | Ground |
|---|---|---|---|
| `GetInclude` (core, core-ro) | source served, onprem + cloud; metadata **to add** | — | Code `src/handlers/include/readonly/handleGetInclude.ts:10-37` (reads `getUtils().getInclude`, source only) |
| `GetIncludesList` | served (parent `PROG/I`) | — | Code `src/lib/adtProjections.ts:899-913` |
| `GetTypeInfo` | — | metadata read and **parsed** (row type, key), not the document | Code `src/handlers/system/readonly/handleGetTypeInfo.ts:274-286`, `:164` |
| `ActivateObjects` (group activation) | served onprem; cloud not in table | served onprem + cloud | Code `src/lib/adtProjections.ts:514-576` (`ACTIVATION_CODES`) |
| Single-object activation (`SINGLE_ACTIVATION`) | not routed — goes to group activation | not routed — goes to group activation | Code `:593-605`, `:632-670`; CHANGELOG 22.0.0 Fixed: "A table type (`TTYP/DA`, or `TTYP`) goes to group activation" |
| `HandlerActivate` `object_adt_type` | served onprem (code form) | served (code form) | Code `compact-modify/src/handlers/handleHandlerActivate.ts:99-111` |
| `HandlerActivate` `object_type` member | **to add** `INCLUDE` (onprem) | **to add** `TABLE_TYPE` | Code `src/lib/adtProjections.ts:714-783` |
| `GetWhereUsed` | served (`PROG/I`, name `include`, search name `INCL`) | served (`TTYP/DA`, main type `TTYP`) | Code `:316-381` |
| `HandlerWhereUsed` | served (`INCLUDE`) | not a member — open question Q6 | Code `:449-503` |
| `SearchObject` / `HandlerSearch` | served (`INCL`) | served (`TTYP`) | Code `node_modules/@mcp-abap-adt/interfaces-adt/dist/adt/AdtSearchTypes.js:247,450,719,929` |
| `GetObjectVersions` / `…Source` / `…Diff` | not in table | **to add** kind `table_type` | Code `src/lib/adtProjections.ts:930-973` |
| `Get<X>Versions` per-type tools | not in table | **to add** `GetTableTypeVersions`, `GetTableTypeVersionSource`, `GetTableTypeVersionDiff` | Code `src/handlers/common/high/objectVersionTools.ts:71` |
| `GetEnhancements` | served (include host) | not in table | Code `src/handlers/enhancement/readonly/handleGetEnhancements.ts:380,1005` |
| `RunATC` | served onprem (`program_include`) | not an ATC type | Code `src/lib/adtProjections.ts:829-890` |
| `AddTransportObject` / `RemoveTransportObject` | served (`object_type` is the TADIR type, `PROG`) | served (`TTYP`) | Code `src/handlers/transport/high/handleAddTransportObject.ts:46-108` |
| Per-object transport read (`readTransport`) | not in table | no tool serves it for any type — open question Q4 | Code: no `readTransport` call in `src/` (grep) |
| Compact Create/Get/Update/Delete/Lock/Unlock/Validate/CheckRun/DeletionCheck | **to add** `INCLUDE` | **to add** `TABLE_TYPE` | Code `src/lib/adtProjections.ts:983-1443` |
| `CreateProgram` `program_type: 'include'` | offered, and adt-clients throws before any request | — | Code `src/handlers/program/high/handleCreateProgram.ts:53-66`; `node_modules/@mcp-abap-adt/adt-clients/dist/core/program/create.js:14-23` — open question Q1 |

## 3. Per object and system type: operation → tools

`*` new. Compact column: handler `member`. "ro" columns: whether the read-only sets serve it.

### 3.1 Program include `PROG/I`

| Operation | onprem full set | cloud full set | compact | core-ro | compact-ro |
|---|---|---|---|---|---|
| create | `CreateInclude`* | — | `HandlerCreate INCLUDE`* (onprem) | — | — |
| read source | `GetInclude` (source, unchanged) | `GetInclude` | `HandlerGet INCLUDE` part `source`* | yes | yes |
| readMetadata | `GetInclude` part `metadata`* | same | `HandlerGet INCLUDE` part `metadata`* | yes | yes |
| update (source) | `UpdateInclude`* (lock → write → unlock → activate if asked) | — | `HandlerUpdate INCLUDE`* (onprem) | — | — |
| updateMetadata | `UpdateIncludeMetadata`* (lock → write → unlock) | — | `HandlerUpdate INCLUDE` with `part: 'metadata'`* (onprem) — Q3 | — | — |
| lock / unlock | inside `UpdateInclude` / `UpdateIncludeMetadata` (as `UpdateProgram`) | — | `HandlerLock` / `HandlerUnlock INCLUDE`* (onprem) | — | — |
| activate | `ActivateInclude`*; `ActivateObjects` `PROG/I` (served) | — | `HandlerActivate INCLUDE`* (onprem) | — | — |
| validate | — (the program's full set has no validate tool either) | — | `HandlerValidate INCLUDE`* (onprem) | — | yes (onprem; HandlerValidate is a compact-ro tool, Code `compact-readonly-entries/src/group.ts:134`) |
| deletionCheck | inside `DeleteInclude` (`deleteIfDeletable`) | — | `HandlerDeletionCheck INCLUDE`* (onprem **and cloud**) | — | yes |
| delete | `DeleteInclude`* | — | `HandlerDelete INCLUDE`* (onprem) | — | — |
| enhancement reads | `GetEnhancements` (served) | served | — | yes | — |

### 3.2 Table type `TTYP/DA` (onprem and cloud alike)

| Operation | full set | compact | core-ro | compact-ro |
|---|---|---|---|---|
| create | `CreateTableType`* | `HandlerCreate TABLE_TYPE`* | — | — |
| readMetadata | `GetTableType`* | `HandlerGet TABLE_TYPE`* (part `metadata`; `source` refused naming the parts) | yes | yes |
| updateMetadata | `UpdateTableType`* (lock → write → unlock → activate if asked) | `HandlerUpdate TABLE_TYPE`* (`source_code` is the document) | — | — |
| lock / unlock | inside `UpdateTableType` | `HandlerLock` / `HandlerUnlock TABLE_TYPE`* | — | — |
| activate | `ActivateTableType`*; `ActivateObjects` `TTYP/DA` (served) | `HandlerActivate TABLE_TYPE`* | — | — |
| check | `CheckTableType`* | `HandlerCheckRun TABLE_TYPE`* | — | yes |
| validate | — | `HandlerValidate TABLE_TYPE`* | — | yes |
| versions | `GetTableTypeVersions`*, `GetTableTypeVersionSource`*, `GetTableTypeVersionDiff`*; `GetObjectVersions` / `…Source` / `…Diff` kind `table_type`* | — (no compact version tool exists for any type) | generic ones: yes | — |
| deletionCheck | inside `DeleteTableType` | `HandlerDeletionCheck TABLE_TYPE`* | — | yes |
| delete | `DeleteTableType`* | `HandlerDelete TABLE_TYPE`* | — | — |
| transport | `AddTransportObject` / `RemoveTransportObject` `TTYP` (served); the per-object read: Q4 | — | — | — |
| where-used, search | served (§2) | `HandlerWhereUsed`: Q6 | yes | yes |

Why the full set has no `Lock*`, `Validate*` or `CheckDeletion*` tool of either object: the low
set was removed in 19.0.0 and the program, domain and data element serve these operations in
the full set only inside their chains (Code `tools/low-to-compact.json` header; no such tool in
`docs/user-guide/AVAILABLE_TOOLS.md:154-306`). The compact members serve each one as its own
call. That is the example copied whole; Q2 asks the owner to confirm it.

## 4. New full-set tools

Layout copies the program's file for file: `src/handlers/include/high/handle{Create,Update,UpdateMetadata,Delete}Include.ts`,
`src/handlers/include/low/handleActivateInclude.ts`; `src/handlers/table_type/high/handle{Get,Create,Update,Delete,Check}TableType.ts`,
`src/handlers/table_type/low/handle{Activate,Check}TableType.ts` (the high `Check` delegates to
the low one through `normalizeCheckResponse`, as `CheckDomain` does, Code
`src/handlers/domain/high/handleCheckDomain.ts:20-53`). Registered in `HighLevelHandlersGroup`
(Activate* renamed at registration as `ActivateProgram` is, Code
`src/lib/handlers/groups/HighLevelHandlersGroup.ts:660-667`); `GetTableType` also in
`ReadOnlyHandlersGroup`, as `GetDomain` is (Code `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts:293`).

Common to every new tool:

- **Availability**: `available_in` `['onprem']` for the include writes, `['onprem', 'cloud']`
  for every table-type tool; each tool also gets its need in `TOOL_NEEDS_BY_NAME`
  (`src/lib/variantToolSet.ts:64`), so the table removes it where it is not served:
  `CreateInclude` include/create, `UpdateInclude` include/update, `UpdateIncludeMetadata`
  include/updateMetadata, `DeleteInclude` include/delete, `ActivateInclude` include/activate;
  `GetTableType` tableType/readMetadata, `CreateTableType` tableType/create, `UpdateTableType`
  tableType/updateMetadata, `DeleteTableType` tableType/delete, `ActivateTableType`
  tableType/activate, `CheckTableType` tableType/check, the three version tools
  tableType/versions.
- **No hand-written variant guard.** The program tools' `isCloudConnection()` checks (Code
  `handleCreateProgram.ts:104-110`) are not copied: an include write takes
  `createOnPremAdtClient`, which refuses a connection declared otherwise `variant_not_served`
  before anything is sent (CHANGELOG 22.0.0), and the contract (§6) makes the call not compile on
  cloud. Static types first.
- **Refusals before any request**: a required argument missing or empty is refused
  `<name> is required` (the program tools' words); nothing else is checked by hand — SAP's
  answer to a bad name, package or document reaches the model as SAP sent it.
- **Requests**: every LOCK and UNLOCK is stateful for its own request (adt-clients'
  `inStatefulSession`, Code `node_modules/@mcp-abap-adt/adt-clients/dist/core/include/AdtInclude.js:210-232`
  and `tabletype/AdtDdicTableType.js:173-183`); every other request goes stateless. Each step
  carries its `analyse` (`analyseLock`, `analyseException`, `analyseActivation`,
  `analyseDeletion`) and its header pair from `DEFAULT_ADT_HEADERS` through `withAdtHeaders`.
- **Result**: the program tools' projections — `project(detail, terseWrite)` for create and
  updates, `terseDeletion` for delete, `terseActivation` for activate, the `normalizeCheckResponse`
  shape for check — with `detail` (`DETAIL_PROPERTY`) where the program tool has it.
- **Descriptions** follow the repo's functional style and name nothing concrete
  (`toolDescriptionsCarryNoLiterals.test.ts`); the texts below are the spec's proposal.

### 4.1 Include tools (onprem)

**`GetInclude`** (changed, core + core-ro, onprem + cloud). Adds `part` (`READ_PART_PROPERTY`)
and `version` (`active` | `inactive`, default `active`), as `GetProgram` (Code
`src/handlers/program/high/handleGetProgram.ts:16-41`). Reads through `getInclude(resultsFor(includeDocuments))`
— `read(config, version)` for `source`, `readMetadata` for `metadata` — one request either way.
`part` absent or `source`: the answer stays the source text it is today (no change for a
current caller, Q5). `part: 'metadata'`: `{ success, include_name, part: 'metadata', metadata }`,
the document as SAP sent it. Its input schema moves from zod to the JSON schema the other `Get*`
tools use, `include_name` required. Description: "[read-only] Reads the ABAP include named by
include_name in one request: its source code (part "source", the default; active or inactive
version) or its ADT metadata document (part "metadata": package, responsible, description).
Returns the part read." Requests: `GET /sap/bc/adt/programs/includes/{name}/source/main[?version=…]`
or `GET /sap/bc/adt/programs/includes/{name}` (Code `adt-clients/dist/core/include/read.js:15-30`).

**`CreateInclude`**. Parameters: `include_name` (string, required, "Include name."),
`package_name` (string, required, "Package name."), `description` (string, "Include
description. If not provided, include_name is used."), `transport_request` (string, "Transport
request number, not a task. Required for transportable packages."), `master_language` (string,
the program's text), `detail`. One request: the create alone, as `CreateProgram` (Code
`handleCreateProgram.ts:1-13`): `POST /sap/bc/adt/programs/includes[?corrNr=…]` with an
`include:abapInclude` document (Code `adt-clients/dist/core/include/create.js:24-48`), header
pair `include.create`. `validateTransportRequest(package_name, transport_request)` before it, as
the program does. Description: "Creates the ABAP include named by include_name in the package
named by package_name. The include is created inactive and empty; its source is written by
UpdateInclude." Result: `terseWrite` (the created document under `full` / `raw`).

**`UpdateInclude`**. Parameters: `include_name` (required, "Include name. The include must
already exist."), `source_code` (string, required, "Complete ABAP source of the include."),
`transport_request`, `activate` (boolean, "Activate the include after the write. Default:
false."), `detail`. Requests, as `UpdateProgram` without its check (`PROG/I` lists no check):
LOCK (stateful) → `PUT …/includes/{name}/source/main?lockHandle=…[&corrNr=…]` with the source
as text (`include.update`, Code `adt-clients/dist/core/include/update.js:9-18`) → UNLOCK
(stateful), on every path out (`withLock`) → when `activate`, `POST /sap/bc/adt/activation`
(`include.activate`, `analyseActivation`, `carryCleanup`). Description: "Writes source_code as
the whole source of the ABAP include named by include_name: locks it, writes, unlocks, and
activates when activate is true. Returns SAP's answer to the write (and to the activation)."

**`UpdateIncludeMetadata`** (Q3). Parameters: `include_name` (required), `metadata` (string,
required, "The whole ADT metadata document of the include, as GetInclude part "metadata"
returns it, with the changes made; it is sent as given and replaces the stored one."),
`transport_request`, `detail`. Requests: LOCK → `PUT /sap/bc/adt/programs/includes/{name}?lockHandle=…[&corrNr=…]`
with the document (`updateMetadata`, Code `adt-clients/dist/core/include/AdtInclude.js:168-172`)
→ UNLOCK, on every path out. No activation step: the type table lists no metadata activation
distinct from `activate`, and `ActivateInclude` is its own call. Header pair: **new**
`include.updateMetadata` — Inference: `application/vnd.sap.adt.programs.includes.v2+xml` for
both, the create's pair (Code `src/lib/adtHeaders/defaultPairs.ts:379-382`); measured live
before it is relied on (§8.2).

**`DeleteInclude`**. Parameters: `include_name` (required), `transport_request` ("Required for
transportable objects. Optional for local objects."), `detail`. Requests: `deleteIfDeletable`
(Code `src/lib/strategies/checkedDeletion.ts:1-25`): `POST /sap/bc/adt/deletion/check`
(`include.checkDeletion`), and only if it permits, `POST /sap/bc/adt/deletion/delete`
(`include.delete`); no lock (a held lock is what makes ADT refuse). Result: `terseDeletion`.
adt-clients records that a successful include DELETE leaves the name's editing registration
and the next create of that name is answered `403` (Code
`adt-clients/dist/core/include/types.d.ts`, `IncludeDeletionResult`); the live run measures it
on the stateless path the server uses (§8.2).

**`ActivateInclude`**. Parameters: `include_name` (required), `detail`. One request:
`POST /sap/bc/adt/activation?method=activate&preauditRequested=true` (`include.activate`,
`analyseActivation`). Description: "Activates the ABAP include named by include_name, so its
inactive version is in force."

### 4.2 Table-type tools (onprem and cloud)

**`GetTableType`** (core + core-ro). Parameters: `table_type_name` (required, "Table type
name."). One request: `GET /sap/bc/adt/ddic/tabletypes/{name}` (`readMetadata`, Code
`adt-clients/dist/core/tabletype/read.js:14-24`), through a new `readTableTypeMetadata` in
`src/lib/strategies/metadataReads.ts` (shared with `GetTypeInfo`'s read so the two cannot
drift). Result: `{ success, table_type_name, part: 'metadata', metadata }`, the document as SAP
sent it. **No `version` parameter**: `GetDomain` takes one and echoes it unread (Code
`src/handlers/domain/high/handleGetDomain.ts:42-58`), which is not copied. Description:
"[read-only] Reads the ABAP table type named by table_type_name in one request: its ADT metadata
document (row type, access, key, package, description). Returns it under `metadata`, with
`part: "metadata"`."

**`CreateTableType`** (owner, Q7: like `CreateDomain`). Parameters, as `CreateDomain` takes the
domain's definition (Code `src/handlers/domain/high/handleCreateDomain.ts:55-130`):
`table_type_name` (required), `package_name` (required), `description`, `transport_request`,
the row type — `row_type_kind` (`ttyp:rowType/ttyp:typeKind`), `row_type_name`
(`ttyp:typeName`, a dictionary type), or `data_type`, `length`, `decimals`
(`ttyp:builtInType`) —, `access_type` (`ttyp:accessType`), `key_definition` and `key_kind`
(`ttyp:primaryKey/ttyp:definition`, `/ttyp:kind`), `activate` (boolean, default `true`, as
`CreateDomain`), `detail`. The element names are those of the document `GetTypeInfo` reads
(Code `src/handlers/system/readonly/handleGetTypeInfo.ts:164-185`, fixture
`src/__tests__/unit/getTypeInfo.test.ts:84-100`); which values SAP takes for `row_type_kind`,
`access_type`, `key_definition` and `key_kind`, and which combinations it refuses, is measured
live before the schema names them (until then each is a string passed as given; Inference).
Chain, as `CreateDomain`'s: create (`POST /sap/bc/adt/ddic/tabletypes[?corrNr=…]`, the empty
document) → LOCK (stateful) → read the document SAP created → patch the given properties into it
(a `patchTableTypeXml` beside `domainPatch`, plain code over the parsed document, no regex) →
`PUT …?lockHandle=…` (`updateMetadata` with the lock handle: one request) → UNLOCK (stateful, on
every path out) → check → activate when `activate`. A property not given leaves SAP's value.

**`UpdateTableType`** (like `UpdateDomain`, Code `src/handlers/domain/high/handleUpdateDomain.ts:60-130`).
Parameters: `table_type_name` (required, "The table type must already exist."), the same
definition properties as `CreateTableType`, `transport_request`, `activate` (as
`UpdateDomain`), `detail`. Chain: LOCK → read → patch the given properties → PUT under the lock →
UNLOCK on every path → check → activate when asked. The whole metadata document, sent as given,
is written through compact `HandlerUpdate TABLE_TYPE` (`source_code`, as for `DOMAIN`), so what
`GetTableType` reads can be written back whole.

**`DeleteTableType`**. As `DeleteInclude`: `deleteIfDeletable` with `tableType.checkDeletion`
and `tableType.delete` (Code `adt-clients/dist/core/tabletype/delete.js`).

**`ActivateTableType`**. One activation request (`tableType.activate`).

**`CheckTableType`** (high) / its low sibling. Parameters: `table_type_name` (required),
`version` (`active` | `inactive`, the domain's text). One request: `POST /sap/bc/adt/checkruns?reporters=abapCheckRun`
(`check(config, version)`, Code `adt-clients/dist/core/tabletype/AdtDdicTableType.js:161-167`,
`tableType.check`). Description: "[read-only] Runs a check on the ABAP table type named by
table_type_name. Returns errors, warnings, and messages."

**`GetTableTypeVersions`, `GetTableTypeVersionSource`, `GetTableTypeVersionDiff`**: one row in
`VERSIONED_TYPES` (`object_type: 'table_type'`, `display: 'TableType'`, `nameParam:
'table_type_name'`, `label: 'ABAP table type'`, `available_in: ['onprem', 'cloud']`), and
`table_type` in `VERSIONED_ROUTES` / `VERSIONED_KINDS` (both variants) and in
`resolveVersionedObject` (`getTableType().getVersions` / `getVersionSource`, Code
`AdtDdicTableType.js:197-203`). What a table type's version "source" is (the document of that
version, or nothing) is Inference: measured live (§8.2).

## 5. Compact members

New `CompactObjectType` members `INCLUDE` and `TABLE_TYPE` (`src/lib/compact/compactObjectTypes.ts`,
`COMPACT_OBJECT_TYPES`, `COMPACT_CRUD_MATRIX` `['create','get','update','delete']` each). Each
projection lists them exactly where the table serves them; the cloud lists filter `INCLUDE` out
beside `PROGRAM` where cloud does not serve the operation, and `projected<>` holds every list to
its projection (Code `src/lib/adtProjections.ts:132-162`).

| Projection (routes) | `INCLUDE` need | onprem | cloud | `TABLE_TYPE` need |
|---|---|---|---|---|
| `COMPACT_CREATE_ROUTES` | include/create | yes | — | tableType/create (both) |
| `COMPACT_READ_ROUTES` | include/read | yes | yes | tableType/readMetadata (both) |
| `COMPACT_UPDATE_ROUTES` | include/update | yes | — | tableType/updateMetadata (both) |
| `COMPACT_DELETE_ROUTES` | include/delete | yes | — | tableType/delete (both) |
| `COMPACT_LOCK_ROUTES` / `UNLOCK` | include/lock, unlock | yes | — | tableType/lock, unlock (both) |
| `COMPACT_VALIDATE_ROUTES` | include/validate | yes | — | tableType/validate (both) |
| `COMPACT_CHECK_ROUTES` | — (no check) | — | — | tableType/check (both) |
| `COMPACT_DELETION_CHECK_ROUTES` | include/deletionCheck | yes | **yes** | tableType/deletionCheck (both) |
| `COMPACT_ACTIVATE_ROUTES` | `'PROG/I'` | yes | — | `'TTYP/DA'` (both) |

Kind routes behind the lifecycle members: `include` and `table_type` in `LOCK_KIND_ROUTES`,
`UNLOCK_KIND_ROUTES`, `VALIDATE_KIND_ROUTES` (+ the `*_KIND_LIST`s, cloud filters dropping
`include`), `table_type` in `CHECK_KIND_ROUTES`; `COMPACT_LOCK_KINDS`, `COMPACT_VALIDATE_KINDS`,
`COMPACT_CHECK_KINDS` map the members (their `satisfies KindsOf<…>` checks it). The dispatchers
gain one case each: `lockObject` / `unlockObject` (`createOnPremAdtClient` for `include`, as for
`program`, Code `src/handlers/common/low/handleLockObject.ts:204-208`), `validateObject`,
`checkObject`, `DELETION_TARGETS` (Code `src/handlers/common/low/deletionTargets.ts:99`; the
include's `deleted` on the on-premise client, its `checked` on the variant's).

Single-call (owner's rule, Code `handleCreateOnly.ts:1-36`, `handleUpdateUnderLock.ts:1-17`):

- **`HandlerCreate`** `INCLUDE(include_name*, package_name*)`, `TABLE_TYPE(table_type_name*,
  package_name*)`: `CREATE_CARRIES` `INCLUDE: ['include_name','master_language']`,
  `TABLE_TYPE: ['table_type_name','master_language']`; each case calls the create alone
  (`createAlone`, `atStep('create')`), one POST. Schema: `include_name`, `table_type_name`
  properties (each "Include name." / "Table type name.").
- **`HandlerGet`** `INCLUDE(include_name*)` parts `source`, `metadata` (routes to `GetInclude`);
  `TABLE_TYPE(table_type_name*)` part `metadata` only — `TABLE_TYPE` joins the metadata-only list
  of `compactPartRoutes.ts:178-186`, so `part: 'source'` is refused naming its parts. One request.
- **`HandlerUpdate`** under the caller's `lock_handle` (`lockHeldHere`): `INCLUDE(include_name*,
  source_code*, transport_request)` one source PUT; `TABLE_TYPE(table_type_name*, source_code*,
  transport_request)` one PUT of the whole document as given (the `DOMAIN` case's shape, Code
  `handleUpdateUnderLock.ts:221-242`). The include's metadata write: a new `part` property on
  `HandlerUpdate` (`'source'` default, `'metadata'`), accepted with `'metadata'` for `INCLUDE`
  only — any other type with `part: 'metadata'` is refused before anything is sent naming the
  types that take it (Q3). `UNDER_LOCK_TYPES` gains both members. The description sentence
  "For PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP, source_code is the whole metadata
  document" gains `TABLE_TYPE` and `INCLUDE with part metadata`.
- **`HandlerDelete`** `INCLUDE(include_name*, transport_request)`, `TABLE_TYPE(table_type_name*,
  transport_request)`: the deletion request alone, as for every type (`handleDeleteOnly`).
- **`HandlerLock` / `HandlerUnlock` / `HandlerValidate` / `HandlerCheckRun` /
  `HandlerDeletionCheck` / `HandlerActivate`**: `object_name*` like every member. Validate's
  include request needs `package_name` (adt-clients upper-cases `config.packageName`, Code
  `AdtInclude.js:67-84`): `HandlerValidate INCLUDE(object_name*, package_name*)`, refused
  `… requires package_name; missing: package_name` before anything is sent, in the 22.0.0 words
  (CHANGELOG 22.0.0 Changed). `TABLE_TYPE(object_name*, description)`.
- Descriptions: each `*_TOKENS` record in `compactDescriptions.ts` gains its tokens; they are
  typed by the projections, so a missing token does not compile.
- `tools/batch-handlers.json`: each new member listed in the `when … equals` of its entry
  (one request each), so the batch sentence names it.

## 6. Contract changes (`src/lib/adtClientContract.ts`)

Static types, no casts; every member gated by `PerformedOn` per table, as `ProgramApi` is (Code
`:192-258`).

- **`IncludeApi`** (`:266-307`) gains, each gated: `IAdtMetadataUpdatable<Partial<IIncludeConfig>,
  ReturnType<R['metadataUpdated']>>` on `updateMetadata`; `Pick<IAdtDeletable<…>, 'checkDeletion'>`
  on `deletionCheck` (today `checkDeletion` is omitted entirely); `IAdtValidatable<IIncludeConfig,
  ReturnType<R['validation']>>` on `validate`. `read` / `readMetadata` stay ungated (listed on
  both). The library declares all three on `AdtInclude` (Code
  `adt-clients/dist/core/include/AdtInclude.d.ts:12`), with `this`-gates on `updateMetadata` and
  `checkDeletion` (`AdtPerformedBy`) the server's gate matches.
- **`DdicTableTypeApi`** (`:434-438`, today `IAdtMetadataReadable` only) becomes, gated per table
  (every member listed on both variants, so each gate is open on `onprem` and `cloud` and closed
  on `basis740`): `IAdtCreatable`, `IAdtMetadataReadable`, `IAdtMetadataUpdatable`,
  `IAdtDeletable` (with `checkDeletion` on `deletionCheck`), `IAdtValidatable`, `IAdtCheckable`,
  `IAdtActivatable`, `IAdtLockable`, `IAdtVersionable` on `versions`, and `IAdtTransportAware`
  on `transport` only if Q4 adds a transport read. Every type comes from interfaces-adt
  (`ITableTypeConfig`, `ITableTypeResults`), as the class `AdtDdicTableType` implements them
  (Code `adt-clients/dist/core/tabletype/AdtDdicTableType.d.ts:16`).
- `CheckedDeletableType` and the header-key types (`AdtObjectWith<…>`) gain `include` /
  `tableType` operations through `DEFAULT_ADT_HEADERS` (new key `include.updateMetadata`; the
  `tableType.*` keys exist, Code `src/lib/adtHeaders/defaultPairs.ts:700-723`).
- `src/__tests__/typecheck/adtClientContract.typecheck.ts` asserts each new member compiles on
  `onprem`, and that `getInclude().create` / `update` / `updateMetadata` / `lock` / `activate` /
  `validate` / `delete` do not compile on `cloud` while `checkDeletion`, `read`, `readMetadata`
  do (`@ts-expect-error`).

## 7. Docs, CHANGELOG and version

- **Generated**: `npm run docs:tools` regenerates `docs/user-guide/AVAILABLE_TOOLS.md`,
  `AVAILABLE_TOOLS_HIGH.md`, `AVAILABLE_TOOLS_READONLY.md` (`toolDocsGenerator.test.ts` holds them
  to the code).
- **By hand**: `README.md` — the include line (`:279`, "Include Management") and the DDIC list
  name the new tools; `docs/user-guide/HANDLERS_MANAGEMENT.md:31` tool counts; `compact/README.md`
  and `compact/docs/AVAILABLE_TOOLS.md` — the members `INCLUDE`, `TABLE_TYPE` per handler and
  `HandlerUpdate`'s `part`; `docs/user-guide/BATCH_MODE.md` if it lists members; tool-search
  entries in `tools/tool-search.json` for every new tool (keywords + semantic; held by
  `toolSearchEntry.test.ts`), and a check that existing queries ("change a report's include",
  "create a table type") rank the new tools (`toolRetrieval.test.ts`).
- **Counts** (Inference, from the tools added): full set +14 on premise (5 include + 9 table
  type), +9 on cloud; core-ro +1 (`GetTableType`) on both; compact and compact-ro unchanged
  (members only). The parity test's counts (Code `src/__tests__/parity/toolSetParity.test.ts:892`)
  and the surface fixtures (`tests/fixtures/tools/surface.json`, `variant-surface.json`,
  `http-surface.json`, `stdio-sse-surface.json`, `compact/tests/fixtures/surface.json`) are
  regenerated and their diff reviewed: additions only.
- **`CLAUDE.md`** "Cloud vs On-Prem" (programs only) would gain a line on includes and table
  types; it is the owner's file — the text is proposed in the PR description, not edited.
- **Version kind: major (23.0.0)** (owner, Q1): `'include'` leaves `CreateProgram`'s
  `program_type`, a stricter parameter. `docs/MIGRATION-23.0.md` and a **Migrating:** note for
  each breaking item.
- **CHANGELOG** `[23.0.0] - <release day>`: `### Changed — breaking for a caller of
  CreateProgram`: `program_type` no longer offers `include` (it never created one: adt-clients
  refused it before any request); **Migrating:** create an include with `CreateInclude`.
  `### Added` — the tools of §4, the compact members of §5 with `HandlerUpdate` `part`,
  `GetInclude` `part`/`version`, the version kinds.

## 8. Tests

### 8.1 Unit (no SAP)

- **Wire shape per tool** (fake connection, the request each sends, in order): every new
  full-set tool — method, URL, query (`lockHandle`, `corrNr`, `version`), body (the source text;
  the document byte for byte as given), headers (the pair), stateful only on LOCK/UNLOCK; the
  chains unlock on every path out (`highTierLocking.test.ts`, `highTierDeletes.test.ts`
  patterns); `UpdateTableType` sends exactly LOCK, PUT, UNLOCK (no GET).
- **Compact single-call**: `createSingleCall`, `updateSingleCall`, `deleteSingleCall`,
  `compactActivateTypes`, `deletionCheck`, `onePartOneRequest`, `compactReadPart` extended with
  both members: one request per call; `HandlerUpdate` `part: 'metadata'` on `INCLUDE` sends the
  metadata PUT, on any other type is refused with nothing sent; `HandlerGet TABLE_TYPE part
  source` refused naming `metadata`.
- **Refusals before any request**: each required argument missing; `HandlerValidate INCLUDE`
  without `package_name`; an include write on a cloud-declared connection `variant_not_served`.
- **Per-variant availability**: `variantNeeds.test.ts` / `variantSurface.test.ts` — every
  include write absent on cloud, `GetInclude` present on both, every table-type tool present on
  both; compact enums per variant (`compactSurface.test.ts`, extending
  `compact/src/__tests__/compactProgramIsOnprem.test.ts` to `INCLUDE`), with `INCLUDE` in
  `HandlerGet` and `HandlerDeletionCheck` on cloud only.
- **Projections**: `adtProjections.typecheck.ts` fails when a list misses or adds a member.
- **Descriptions**: `toolDescriptionsCarryNoLiterals`, the `[read-only]` marker only on
  `GetInclude`, `GetTableType`, `CheckTableType` and the version reads; batch sentence entries
  (`sources/batchHandlers.test.ts`); tool-search entries.
- **Load-bearing**: each new refusal and each `PerformedOn` gate is proven by breaking it and
  watching its test go red.

### 8.2 Live

Each run's log is saved whole (`npm run test:integration 2>&1 | tee …`); every object the run
makes is deleted in its `afterAll`, and the run's last step reads that nothing it made remains
(`SearchObject` by its names answers no hit).

- **S/4HANA on premise (E19)**, new config cases `create_include`, `create_table_type` in
  `tests/test-config.yaml.template` (`available_in: ["onprem"]` / `["onprem","cloud"]`). The run
  creates a fresh local package (`$` + a run-unique suffix, `CreatePackage`, no transport),
  works inside it, and deletes it last. It must show, per tool and per compact member:
  - include: create → `GetInclude` both parts (empty source; the document) → `UpdateInclude` with
    `activate: true` → source reads back equal, `GetInactiveObjects` lists nothing for it →
    `UpdateIncludeMetadata` with the read document's description changed → the metadata reads
    back changed (this measures the `include.updateMetadata` header pair) → `ActivateInclude` →
    `ActivateObjects` `PROG/I` → compact: `HandlerLock`, `HandlerUpdate` (source and `part:
    metadata`), `HandlerUnlock`, `HandlerValidate` (a free name: SAP's verdict as sent),
    `HandlerDeletionCheck`, `HandlerActivate INCLUDE` → `DeleteInclude` → a create of the same
    name right after (measures adt-clients' `403` note); a second include through
    `HandlerCreate` / `HandlerDelete`.
  - table type: create → `GetTableType` → `UpdateTableType` with a row type and `activate:
    true` → `CheckTableType` (active, inactive) → versions (`GetTableTypeVersions`, one
    version's source — records what it answers) → `GetTypeInfo` shows the row type → every
    compact member → `ActivateObjects` `TTYP/DA` → `DeleteTableType`.
- **ABAP cloud (BTP)**: the table type, every operation as above, in the shared package
  (`shared_dependencies.package`, which records no changes and needs no transport — CHANGELOG
  22.0.0 Repository; `$TMP` is refused there), deleted after; the include's reads only:
  `GetInclude` both parts and `HandlerGet INCLUDE`, `HandlerDeletionCheck INCLUDE`, on a
  delivered include named in the config (`include_cloud_read.include_name`, empty in the template:
  the case skips with that reason). Also shows each include write tool absent from `tools/list`
  and `HandlerCreate`'s enum without `INCLUDE`.
- A failure is reported with SAP's answer as sent; nothing is retried.

## 9. Open questions for the owner

**Q1 — `CreateProgram`'s `program_type: 'include'`.** Facts: the enum offers it (Code
`handleCreateProgram.ts:53-66`); adt-clients 39 throws on it before any request, pointing to
`getInclude()` (Code `adt-clients/dist/core/program/create.js:14-23`); with `CreateInclude` the
include has its own tool. **Decided (owner): a major — `'include'` leaves the enum now** (the
schema refuses it before anything is sent); the release is 23.0.0.

**Q2 — Lock, unlock, validate and deletion check in the full set.** Facts: since 19.0.0 no
object has full-set `Lock*` / `Validate*` / deletion-check tools; they are chain steps there and
compact members as calls (§3). Recommendation: copy that — the full set gets no such tools; the
compact members serve each operation alone.

**Decided (owner):** the full set gets no Lock, Unlock, Validate or deletion-check tool for either object — those are steps of its Create, Update and Delete chains, as for every object since 19.0.0; the compact set serves each as its own call (`HandlerLock`, `HandlerUnlock`, `HandlerValidate`, the deletion check).

**Q3 — How the include's metadata is written.** Facts: no tool writes a metadata document as
given in the full set today (domain and data element patch properties); compact writes one
through `source_code` for metadata-only types; the include has both a source and a metadata
document, so one `source_code` cannot say which. Recommendation: full set `UpdateIncludeMetadata`
(own parameter `metadata`); compact `HandlerUpdate` `part: 'metadata'`, the `HandlerGet`
vocabulary, accepted for `INCLUDE` only.

**Decided (owner):** as recommended — `UpdateIncludeMetadata` in the full set; compact `HandlerUpdate` `part: 'metadata'`, for `INCLUDE` only.

**Q4 — The table type's `transport` operation.** Facts: the table lists `transport` (the read of
the request the object is in, `readTransport`); no tool serves that read for any type (no call
in `src/`); adding an object to or removing it from a request is served by
`AddTransportObject` / `RemoveTransportObject` with `TTYP`, and the writes take
`transport_request`. Recommendation: count the transport as served by those; a per-object
transport read is a tool every type would need, its own task.

**Decided (owner):** as recommended — served by `AddTransportObject` / `RemoveTransportObject`; a per-object transport read is its own task.

**Q5 — `GetInclude`'s source answer.** Facts: today it answers the source text alone (Code
`handleGetInclude.ts:28-36`); `GetProgram` answers `{ success, program_name, version, part,
source }`. Aligning is a changed answer → major. Recommendation: keep the source answer as it is,
add `part` / `version`; `part: 'metadata'` answers the `GetProgram` shape.

**Decided (owner):** as recommended — `GetInclude`'s source answer stays the source text; `part` and `version` are added, `part: 'metadata'` answers the `GetProgram` shape.

**Q6 — `HandlerWhereUsed` and `TABLE_TYPE`.** Facts: `GetWhereUsed` takes `TTYP/DA` on both
variants; `HandlerWhereUsed` routes members by friendly name (`COMPACT_WHERE_USED_ROUTES`, Code
`:449-462`) and `TYPE_NAMES` has none for `TTYP/DA`. Recommendation: add `TABLE_TYPE` to
`HandlerWhereUsed`, routed by the code `TTYP/DA` (no new friendly name).

**Decided (owner):** as recommended — `TABLE_TYPE` in `HandlerWhereUsed`, routed by `TTYP/DA`, no new friendly name.

**Q7 — `CreateTableType` with its definition.** Facts: the create carries no row type (Code
`tabletype/create.js:15-38`); an empty table type cannot be activated (Inference); `CreateDomain`
chains create → lock → write → unlock → check → activate. Recommendation: create alone, as
`CreateProgram` / `CreateInclude`; the definition comes with `UpdateTableType(activate: true)`.

**Decided (owner): like the domain.** `CreateTableType` takes the definition as typed properties and runs `CreateDomain`'s chain; `UpdateTableType` follows `UpdateDomain`, which offers no whole-document write (Code `handleUpdateDomain.ts:60-130`) — the whole document goes through compact `HandlerUpdate TABLE_TYPE`. §4.2 states both.

**Q8 — Single-object activation of `PROG/I` / `TTYP/DA` in `ActivateObjects`.** Facts: one such
object goes to group activation today and answers the group's shape (CHANGELOG 22.0.0 Fixed);
routing it through `ActivateInclude` / `ActivateTableType` changes that answer. Recommendation:
leave `ActivateObjects` as it is; the new `Activate*` tools are the single-object path.

**Decided (owner):** as recommended — `ActivateObjects` unchanged; the new `Activate*` tools are the single-object path.

## 10. Outside this spec / debts

- An include's main programs: no adt-clients endpoint (goal).
- SAP 7.40: `ADT_TYPES_BASIS_740` lists the include's create … delete (no deletion check) and no
  table type; serving it returns with the legacy binaries.
- The program's own `updateMetadata` (listed for `PROG/P` on premise) and the domain's echoed
  `version` are not served/fixed here; noted for a task of their own.
