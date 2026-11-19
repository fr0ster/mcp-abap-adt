# Table technical settings and text elements as tools — plan

Design: [`../specs/2026-11-19-table-settings-text-elements-design.md`](../specs/2026-11-19-table-settings-text-elements-design.md)
(approved). The plan breaks it into steps and records the decisions. It holds no code. References like
S3, T6 and W4 point at the design's labelled facts.

## Changes since approval (2026-11-20, for the owner's approval)

These follow the design's "Changes since approval" (items 1–11), read from the published
interfaces-adt 30.1.0, adt-clients 46.1.0 and adt-strategies 0.26.0.

1. **(a) is met.** The libraries are on the registry. (b) installs `adt-strategies ^0.26.0` by name.
   The install was re-run, and `test:check` shows the same 13 breaks.
2. **c1 and c2 build the client per variant.** They take `adtClientOf(connection)` and narrow on
   `variant`. Cloud reads use `cloudTableSettings`, on-premise reads `tableSettings`. New unit
   assertion: on cloud the handler's client is the server's cloud client. Mutation: build it with
   the variant-generic `createAdtClient`.
3. **c2 gains `translation: string`** (the value only), and the zod schema mirrors
   `ITableBufferingChange` (`area_key_fields` beside `type: 'G'` or with no type). New assertions:
   - `area_key_fields` with `type: 'P'` is refused at the schema. Mutation: drop the rule.
   - `translation` reaches the patch as `{ value }`. Mutation: send the four attributes.
4. **c2 sends `headers: { accept: TABLE_SETTINGS_MEDIA_TYPE }` only.** New assertion: the patch's
   headers carry no `contentType`. Mutation: pass the `withAdtHeaders` pair.
5. **c2 passes `patchMetadata`'s pre-PUT failures through.** New assertion: a stand-in read without
   an ETag gives the library's failure, no PUT recorded, and an UNLOCK still sent. Mutation: retry
   the read.
6. **c2 surfaces DT 771 (cloud).** The cloud `is_writable_by_amdp` description states the rule
   (design item 8, for approval). New assertions:
   - unit: a recorded activation answer with `activationExecuted="true"` and the DT 771 `E` message
     is an error carrying SAP's message. Mutation: judge by `activationExecuted`.
   - live, cloud: setting the flag with logging on answers the activation's `E` message; setting
     it with buffering `N` and logging off activates.
7. **(e) drops the class-pool special case.** `still_inactive` already carries `uri`/`parent_uri`
   and is matched by uri. New assertion: a recorded inactive list holding `PROG/PX {CLASS}====CP`
   with its `/textelements/classes/{c}` uri is matched to the `CLAS/OCX` reference. Mutation: match
   by name.
8. **c3, c4 and (d):** function groups are served on cloud. No skip of their own.

## Global constraints

Copied from the design, from CLAUDE.md and from the owner's rules. They bind every task.

- **Every SAP claim cites its ground** (owner rule): every statement about SAP/ADT behaviour that
  shapes a type, a tool, a refusal, a test skip or a doc line cites **Code** (handler class, method,
  quoted lines) or **Measured** (system, request, status), or is marked **unverified**. A new claim
  found during implementation goes into the design's facts first, with its ground, and only then
  into code.
- **TDD.** Each step writes its failing test first, then the code that makes it pass.
- **Small focused commits.** One commit per logical change, by path, with the session trailer.
- **node:test only.** Every new test file is node:test and is listed in `tools/node-test-files.json`.
  No new Jest file is added. An existing Jest test that enumerates tools or codes is updated in place.
- **Every handler gets unit tests and live integration tests**, onprem and cloud. Live suites are
  `liveSuite` with `liveCall`, own objects created and deleted by the suite, and every lock released
  by its own handle. "A live suite states where it runs" by system kind, in code; the test config
  gives data only.
- **npm scripts only.** No npx, no `node_modules/.bin`, no `node -e`, no ts-node.
- **Dependencies come from the registry only**: no `file:` or `link:`. After every install, the
  lockfile has no `"link": true` and every entry resolves from `registry.npmjs.org`. "A consumer
  waits until the dependency is published; it never builds against the unpublished one."
- **Tool descriptions are functional only**: the operation, then the parameters and the answer.
  They use no negations and name nothing concrete: "a description … names nothing concrete"
  (CLAUDE.md, "What we write names nothing concrete"). No object, package, transport or system id
  appears in a description, a parameter description, a comment, test data or a fixture.
- **Atomic tools.** Each update tool does lock → write → unlock in one call. Only LOCK and UNLOCK go
  stateful. "The backend's own answer reaches the model as it is": SAP's refusals (an enqueue
  clash, 406 `SEDX_ADT/…`, 400 `SWB_TOOL/019`) pass through unchanged, with no handling of their
  own.
- **Static types first.** What the compiler can prove is not checked at runtime. A runtime check
  stays only at the boundary, for the model's arguments (zod). `ITableSettingsChanges` "at least
  one setting" is the library's type, and no runtime check stands in for it.
- **`available_in`** restricts a tool "only when a tool genuinely doesn't work on some platform". The
  new full tools are `['onprem', 'cloud']`, and legacy is not served (S9, T12).
- **No implicit defaults.** `activate` is a required boolean on both update tools, because the
  existing update tools have no single convention.
- **No retries, no timeouts** of the server's own.
- **CRUD lives in adt-clients**, read-patch-write included. The server never merges a settings
  document; it calls `patchMetadata`.
- **The SAP errata** (`node_modules/@mcp-abap-adt/adt-clients/docs/usage/ERRATA.md`) is read before
  a new call. An activation is judged by its messages (`analyseActivation`), not by
  `activationExecuted` alone (S8).

## Order and tasks

### (a) Wait for the libraries

- **Gate (met 2026-11-20):** `@mcp-abap-adt/interfaces-adt` 30.1.0, `@mcp-abap-adt/adt-clients`
  46.1.0 (`patchMetadata`) and `@mcp-abap-adt/adt-strategies` 0.26.0 are on the registry.
- **Decision:** nothing in (b)–(h) starts before the gate. "Not visible yet" is a wait, not a
  failure.

### (b) The 46.x install and the breaks

- **Files:** `package.json`, `package-lock.json`, `compact-modify/package.json`,
  `server-runtime/package.json`, `src/lib/adtProjections.ts`, `src/lib/strategies/whereUsedList.ts`,
  `src/handlers/system/readonly/handleGetWhereUsed.ts`, `src/lib/adtTypeCode.ts` (main-type
  resolution), `src/__tests__/typecheck/adtBoundary.typecheck.ts`.
- **Steps:**
  1. Install from the registry: `adt-clients ^46.1.0`, `adt-strategies ^0.26.0`,
     `interfaces-adt ^30.1.0` in the root and both sub-packages. Leave out `adt-clients-legacy`.
     Check the lockfile. Commit the install alone.
  2. `ACTIVATION_CODES` and `TABLE_CODES` list `PROG/PX`, `CLAS/OCX` and `TABL/DTT`.
     `WHERE_USED_CODES` lists `PROG/PX`. `TABL/DTT` is excluded by type, because it is not served
     (W4).
  3. Main-type resolution skips the sub-resource codes (`PROG/PX`, `CLAS/OCX`, `TABL/DTT`), so
     `CLAS` stays one code and cloud's `PROG` stays absent from activation.
  4. Where-used call sites split `PROG/PX` (with its container) from the rest
     (`Exclude<…, 'PROG/PX'>`). Its argument comes in (f). Until then `PROG/PX` is refused at the
     schema as no where-used code.
- **Tests:**
  - `test:check` and `build` are green. `adtBoundary.typecheck.ts` keeps its
    `@ts-expect-error` for `PROG` on cloud and gains one for `CLAS` staying unambiguous. Mutation:
    let a sub-resource code count for its main type, and both expectations break.
  - `src/__tests__/unit/mainTypeSubResources.test.ts` (new, node:test). `acceptedCodeOf('CLAS', …)`
    is `CLAS/OC` in activation and the table codes, and `'PROG'` on cloud activation is
    `undefined`. Mutation: remove the skip, and the test fails.

### (c) The full tools, one by one

Each tool gets its handler file, its `TOOL_DEFINITION`, its registration and its tests, in this
order. Registration for each tool:

- the group: `ReadOnlyHandlersGroup` for a Get, `HighLevelHandlersGroup` for an Update;
- the exports: `src/lib/handlers/read.ts` / `readDefinitions.ts` / `write.ts`;
- the gating table `src/lib/variantToolSet.ts`;
- `tools/tool-search.json`, `tools/batch-handlers.json` (where the tool is batchable), and the
  coverage ledger.

Shared unit-test pattern: `recordingConnection` / `adtStandIn` as `draft/getObjectDraft.test.ts`
uses them, with answers from adt-clients' recorded corpus where one exists.

#### c1. GetTableSettings

- **Files:** `src/handlers/table/readonly/handleGetTableSettings.ts`.
- **Interface:** `table_name: string`, `version?: 'active' | 'inactive' | 'workingArea'`
  (`READ_VERSION_FIELD`). It answers the design's `GetTableSettings` shape, with
  `is_writable_by_amdp` on cloud (S7). It goes through `adtClientOf(connection)`, narrowed on
  `variant`, then `getTableSettings({ ...tableSettingsDocuments, metadata })`, where `metadata` is
  `cloudTableSettings` on cloud and `tableSettings` on premise, then `.readMetadata`.
- **Unit test** `src/__tests__/unit/tableSettings/getTableSettings.test.ts`:
  - one GET to `/sap/bc/adt/ddic/db/settings/{name}`, with the v2 Accept (S1) and the version
    asked. Mutation: send v1, and the assertion on the Accept fails.
  - the projection maps every setting, the description and `is_writable_by_amdp` when present.
    Mutation: drop a field from the projection.
  - a 404 is passed through as SAP's answer. Mutation: map the 404 to success.
  - the tool is in the read-only build's list. Mutation: register it in the high group only.
  - on cloud the read uses the cloud client and `cloudTableSettings`. Mutation: read through the
    generic client.
- **Live** `src/__tests__/integration/readOnly/table/TableSettingsRead.test.ts`,
  `liveSuite(['onprem','cloud'])`: on the suite's own table, the read after create answers
  `version` `new`/`inactive` with the defaults (S6).

#### c2. UpdateTableSettings

- **Files:** `src/handlers/table/high/handleUpdateTableSettings.ts`.
- **Interface:**
  - `table_name`;
  - any of `data_class`, `size_category`, `buffering{allowed?,type?,area_key_fields?}`,
    `storage_type`, `sharing_type`, `load_unit`, `logging_enabled`, `translation` (the value), and
    on cloud `is_writable_by_amdp` (`byVariant`; S7; its description states DT 771);
  - `area_key_fields` beside `type: 'G'` or with no `type` (`ITableBufferingChange`);
  - `transport_request?`, `activate: boolean` (required), `...DETAIL_SHAPE`.
  - The zod refinement requires at least one setting at the boundary. The value then goes to
    `patchMetadata` typed as `ITableSettingsChangesOf<V>` for the narrowed variant.
- **Flow:** `adtClientOf(connection)` narrowed on `variant`, then
  `withLock(getTableSettings().lock, patchMetadata({ accept: TABLE_SETTINGS_MEDIA_TYPE }), unlock)`,
  then
  `getTable().activate` with `analyseActivation` (`carryCleanup`) when `activate` is true.
- **Unit test** `src/__tests__/unit/tableSettings/updateTableSettings.test.ts`:
  - order: LOCK (stateful) → the patch's read and PUT (stateless) → UNLOCK. Mutation: unlock
    before the PUT.
  - the patch receives exactly the fields given, and nothing else. Mutation: add a default field.
  - a refused PUT still unlocks, and its refusal is the answer as SAP gave it. Mutation: skip the
    unlock on failure.
  - activation is sent only when `activate` is true and the unlock was clean. Mutation: activate
    after a refused unlock.
  - an activation with an error message is an error even when `activationExecuted="true"` (S8).
    Mutation: judge by `activationExecuted` only.
  - `left_locked` appears on a refused release. Mutation: drop the cleanup carrier.
  - the cloud schema takes `is_writable_by_amdp` and the onprem schema refuses it. Mutation: put
    the field in both schemas.
  - the schema refuses a call with no setting. Mutation: drop the refinement.
  - `area_key_fields` beside a non-`G` type is refused at the schema. Mutation: drop the rule.
  - `translation` reaches the patch as `{ value }`. Mutation: send the four attributes.
  - the patch's headers are `{ accept: TABLE_SETTINGS_MEDIA_TYPE }`, with no content type.
    Mutation: pass the `withAdtHeaders` pair.
  - a read without an ETag ends in the library's failure: no PUT is recorded and the UNLOCK is
    still sent. Mutation: skip the unlock.
  - on cloud the handler's client is the server's cloud client. Mutation: use the generic
    `createAdtClient`.
  - a recorded activation with DT 771's `E` message is an error carrying SAP's message.
    Mutation: judge by `activationExecuted`.
- **Live** `src/__tests__/integration/high/table/TableSettingsHandlers.test.ts`,
  `liveSuite(['onprem','cloud'])`:
  - create a table, write non-default `data_class` and `size_category` with `activate: true`, and
    read `active`: the values are written and the other fields kept (S3);
  - on cloud, `is_writable_by_amdp` is kept as read; set with buffering `N` and logging off, it
    activates; set with logging on, the activation answers SAP's DT 771 `E` message;
  - a non-standard data class is stored, and its activation is answered as an error (S8);
  - delete the table.

#### c3. GetTextElements

- **Files:** `src/handlers/text_elements/readonly/handleGetTextElements.ts`.
- **Interface:** `object_kind: 'program'|'function_group'|'class'`, `object_name`,
  `parts?` (default: every part of the kind, T1; `class` takes `symbols` only), `version?`. One read
  per part, with `textSymbols` / `selectionTexts` / `textHeadings`.
- **Unit test** `src/__tests__/unit/textElements/getTextElements.test.ts`:
  - each part is one GET at `/textelements/{programs|functiongroups|classes}/{name}/source/{part}`,
    with its media type as Accept. Mutation: swap the collection of `function_group`.
  - the default parts per kind are three, three and one. Mutation: give the class three.
  - `class` with `selections` is refused by the schema. Mutation: drop the per-kind rule.
  - the projection carries `ddic_reference` and all five heading keys (T8). Mutation: drop one.
- **Live** `src/__tests__/integration/readOnly/textElements/TextElementsRead.test.ts`,
  `liveSuite(['onprem','cloud'])`: read the suite's own objects; on cloud, also a delivered program
  whose name comes from the test config (T11).

#### c4. UpdateTextElements

- **Files:** `src/handlers/text_elements/high/handleUpdateTextElements.ts`.
- **Interface:**
  - `object_kind` (cloud: `class | function_group`, `byVariant`; T6, T10, T11), `object_name`;
  - at least one of `symbols[]`, `selections[]`, `headings{}`;
  - `transport_request?`, `activate: boolean` (required), `...DETAIL_SHAPE`.
- **Flow:** one lock (`TEXT`, T2), then one `update` per part given, then unlock, then
  `activateObjects(textElementsActivationReferences(object))` when `activate` is true.
- **Unit test** `src/__tests__/unit/textElements/updateTextElements.test.ts`:
  - one LOCK, one PUT per part in a fixed order, one UNLOCK. Mutation: lock per part.
  - each part is written whole: the body is the list given (T3). Mutation: merge with a read.
  - a failed second part answers with the first part written and the failure, and still unlocks.
    Mutation: stop before the unlock.
  - the activation sends the pair. For a function group the text-elements reference is
    `/textelements/functiongroups/{g}` (T6). Mutation: build it under `programs`.
  - a cloud lock answering `NoModification` goes on to the PUT (T2). Mutation: refuse on it.
  - SAP's 406 `SEDX_ADT/…` and `DS/512` reach the answer unchanged (T7). Mutation: rewrite the
    message.
  - the cloud schema refuses `program`. Mutation: let it through.
- **Live** `src/__tests__/integration/high/textElements/TextElementsHandlers.test.ts`:
  - onprem: a program (all three parts), a function group and a class (symbols);
  - cloud: a function group and a class;
  - each object: write → read `inactive` → `activate: true` → read `active`;
  - a whole-part replace deletes a left-out entry;
  - after activation, the inactive list holds neither entry, including the class's `PROG/PX …CP`
    (T6).

### (d) Compact

- **Files:**
  - `src/lib/compact/compactObjectTypes.ts`, `src/lib/adtProjections.ts` (`COMPACT_READ_ROUTES`,
    `COMPACT_UPDATE_ROUTES`, `COMPACT_ACTIVATE_ROUTES`, the cloud filters);
  - `src/lib/compact/compactSchemas.ts`, `compactDescriptions.ts`, `compactMatrix.ts`;
  - `compact-readonly-entries/src/handlers/compactReadRoutes.ts`, `compactGetRefusals.ts`;
  - `compact-modify/src/handlers/compactWriteRoutes.ts`, `handleHandlerActivate.ts`.
- **Decisions:**
  - the types are `TABLE_SETTINGS`, `PROGRAM_TEXT_ELEMENTS`, `FUNCTION_GROUP_TEXT_ELEMENTS` and
    `CLASS_TEXT_ELEMENTS`;
  - HandlerGet's `part` takes `symbols|selections|headings` for the text types;
  - `COMPACT_UPDATE.cloud` leaves out `PROGRAM_TEXT_ELEMENTS`;
  - HandlerActivate maps the text types to `PROG/PX` (a function group's with its parent) and
    `CLAS/OCX`;
  - a stated `legacy` system refuses the four types before any request.
- **Unit test** `src/__tests__/unit/compact/textElementsAndSettings.test.ts`:
  - each type routes to its full handler with the arguments mapped. Mutation: route
    `CLASS_TEXT_ELEMENTS` to the program kind.
  - a stated `legacy` system is refused, with no request recorded. Mutation: drop the refusal.
  - the read-only compact build has the four types in HandlerGet and none in HandlerUpdate.
    Mutation: add one to the read-only update list.
  - HandlerActivate sends the function group's text elements at `functiongroups`. Mutation: leave
    out the parent.
- **Existing tests updated in place:** compact completeness, `compactCoversLow`, the detail surface
  and the checked arguments.
- **Live:** the c2 and c4 suites run each step through compact too, under their own case names.

### (e) ActivateObjects

- **Files:** `src/handlers/common/low/handleActivateObject.ts`, `src/lib/adtTypeCode.ts`
  (`activationParentDescription`).
- **Decisions:**
  - `PROG/PX` and `CLAS/OCX` are ordinary references. `PROG/PX` with `parentName` is the function
    group's text elements, at `/textelements/functiongroups/{parentName}`, through the reference's
    `uri`.
  - Nothing is added to other activations.
  - The class-pool entry `PROG/PX {CLASS}====CP` carries `uri`/`parent_uri` and is matched by uri,
    like every other entry. It gets no special case and no description line (T6).
- **Unit test** `src/__tests__/unit/activation/textElementReferences.test.ts`:
  - `PROG/PX` alone is sent at `/textelements/programs/{n}`; with `parentName` at
    `functiongroups/{parentName}`. Mutation: ignore `parentName`.
  - `CLAS/OCX` is sent at `/textelements/classes/{n}`. Mutation: send its class URI.
  - an activation of `CLAS/OC` alone sends one reference. Mutation: pair automatically.
  - a recorded inactive list with `PROG/PX {CLASS}====CP` at `/textelements/classes/{c}` is
    matched to the `CLAS/OCX` reference. Mutation: match by name.
- **Live:**
  - `src/__tests__/integration/coverage/activateObjectsRefusal.live.test.ts` (existing, node:test):
    after a text write, `[PROG/P]` alone names `PROG/PX` in `still_inactive`;
  - `activatePerType.live.test.ts`: the pair activates on onprem (program, function group, class)
    and on cloud (function group, class).

### (f) GetWhereUsed container

- **Files:** `src/handlers/system/readonly/handleGetWhereUsed.ts`,
  `src/lib/strategies/whereUsedList.ts`, HandlerSystem's `where_used` schema.
- **Decisions:**
  - `container?: 'program' | 'function_group'` is required with `PROG/PX` and refused otherwise,
    in each `objects[]` entry too.
  - It is sent as the library's `container: 'program' | 'functionGroup'`.
  - `CLAS/OCX` and `TABL/DTT` are no where-used codes (W3, W4).
- **Unit test** `src/__tests__/unit/whereUsed/textElementsContainer.test.ts`:
  - `PROG/PX` without `container` is refused at the schema, with nothing sent. Mutation: make it
    optional.
  - `container` with another type is refused. Mutation: accept it.
  - `function_group` reaches the URI `/textelements/functiongroups/{n}`. Mutation: map it to
    `program`.
- **Live** `src/__tests__/integration/readOnly/system/WhereUsedHandlers.test.ts` (existing):
  `PROG/PX` with each container answers `globalType="PROG/PX"` on both systems (W2).

### (g) Docs and CHANGELOG

- Regenerate `docs/user-guide/AVAILABLE_TOOLS*.md` with `npm run docs:tools`.
- Update `README.md` tool counts and lists, `docs/user-guide/BATCH_MODE.md` where it lists types,
  and the CLAUDE.md "Cloud vs On-Prem" lines (each text with the owner's approval of it).
- Write the CHANGELOG entry, dated on every edit. It names the new tools, the compact types, the
  ActivateObjects codes and the where-used `container`, with a migration note for consumers on the
  where-used parameters.
- Add the test-config template sections that the new suites read (`testConfigSections.test.ts`).
- Delete the design and this plan before the release (the plans/specs rule).

### (h) Live runs (coordinator)

Run onprem and cloud, one file at a time with the full log saved:

- the c1–c4 suites;
- the compact cases;
- the activation and where-used files.

A failure leaves its SAP text in the log and is fixed before the tag.

## Review Focus

- Every SAP statement in code comments, descriptions and tests cites a design fact (S/T/W). There
  are no new unlabelled claims.
- `UpdateTableSettings` holds no merge of its own and calls `patchMetadata` under the `TABT` lock,
  through the cloud client on cloud. `is_writable_by_amdp` is cloud-only and kept as read. DT 771
  is SAP's answer, passed through.
- `activate` is required on both update tools, and nothing activates implicitly.
- The cloud schemas: UpdateTextElements has no `program`; function groups are served (T10).
- Main-type resolution: `CLAS` and cloud `PROG` keep their meaning.
- SAP's refusals pass through unchanged, with no handling of lock clashes.
- Every new test is node:test and is listed. Each one is proven by its mutation, watched red and
  reverted.
- The lockfile is registry-only, and `adt-clients-legacy` is absent.
- Descriptions are functional, with no negations and no concrete names.
