# Access Restrictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An administrator restricts what the model can do through this server by start-time configuration (denied actions, allowed packages, allowed requests, denied or allowed tables), and every binary gains a read tool that tells whose unactivated draft an object holds.

**Architecture:** Denied actions are applied once, at registration: `withoutDenied` wraps the handler groups so a denied tool is absent and a denied compact value or ADT code is absent from the listed zod schema, which the SDK and `HandlerEntry.call` both parse. Package, request and table lists are a strategy (`IAccessChecks`) called once per call by each registration wrapper, before the call's connection is taken; a tree strategy reads the package tree through a lazy `IPackageReader`. The draft tool reads three versions of an object and compares their ETags.

**Tech Stack:** TypeScript (strict, the static-types scan: no assertion but `as const`, no `any`, no `!`), zod `inputSchema`, `@modelcontextprotocol/sdk`, adt-clients 42.1.0 (`wireItself` from `@mcp-abap-adt/adt-clients/readings`), Jest through npm scripts, Biome.

**Spec:** `docs/superpowers/2026-11-04-access-restrictions-spec.md` (approved). Goal: `docs/superpowers/2026-11-04-access-restrictions-goal.md`.

## Global Constraints

- Base: the code after PR #346 (`refactor/static-types`, HEAD `77ada8e0`, 24.0.0) merges; every path below is named against it.
- Release **24.1.0**, a minor of the eighteen packages, versioned together; no migration note.
- Nothing configured, nothing changes: every fixture byte-identical except the two reviewed additions (`GetObjectDraft`; `HandlerGet` `part: 'draft'`), and no wrapper calls a strategy.
- Rows: CLI `--deny-actions` / `--allowed-packages` / `--allowed-requests` / `--denied-tables` / `--allowed-tables`; env `MCP_DENY_ACTIONS` / `MCP_ALLOWED_PACKAGES` / `MCP_ALLOWED_REQUESTS` / `MCP_DENIED_TABLES` / `MCP_ALLOWED_TABLES`; YAML `restrictions.deny-actions` / `restrictions.allowed-packages` / `restrictions.allowed-requests` / `restrictions.denied-tables` / `restrictions.allowed-tables`. No defaults. `custom` rows.
- Refusal codes and words, verbatim: `package_not_allowed` "<argument> names a package outside the allowed packages: <value>"; `package_tree_unreadable` "the package tree above <value> could not be read, so <argument> is not checked against the allowed packages"; `request_not_allowed` "<argument> names a request outside the allowed requests: <value>"; `table_not_allowed` "the data of <value> is not readable through this server".
- Start line, verbatim forms: `[MCP] Access restrictions: none`; `[MCP] Access restrictions: deny-actions 4 (matching nothing here: DebugStep), allowed-packages 3 (package tree read), allowed-requests 2`.
- Tests: Jest through npm scripts only (`npm test -- <path>`, `npm run test:integration -- <path>`); never `npx`, `npm exec`, `node_modules/.bin` or `ts-node`. No regex in tests or in input-facing code. No timeouts or retries of the package's choosing. No casts.
- Tool descriptions say what the tool does, its parameters and its answer; nothing else.
- Live runs: a realm check without logon before each run (the on-premise system's expected `401` realm; the trial's `401` and the session JWT's `exp`, read locally and never printed); any credential refusal stops every run. Two-user measurements: the writing user and the reading user, each through its own connection. Temporary objects in `$TMP` on premise and in the cloud probe package on the trial, deleted after; never SM12, never release a transport, never delete an object this work did not create. Probes log off at their end, also on failure.
- The legacy variant is not changed: `GetObjectDraft` is registered but not listed there.
- System ids, user names and transport numbers appear in no committed file; the controller supplies them at run time.

## Review Focus

1. A YAML list with a non-string item (`- 42`, a mapping) for any row: refused at start with the row's name, never coerced. Test in Task 3.
2. A `Tool.value` entry whose tool exists but whose value exists only on the other variant (`HandlerCreate.PROGRAM` on a cloud start): ignored on that variant and named in the start line only when it matches on neither variant. Test in Task 4.
3. A checked argument given as a non-string (a number in `package_name` through an embedder's raw `getHandlerEntries()` call): not checked, the call runs as today. Test in Task 7.
4. A tree walk where SAP answers a package whose super package is itself, or a chain longer than any real tree: refused `package_tree_unreadable` (met twice), never a hang. Test in Task 9.
5. The draft tool called on an object that exists only inactive (created, never activated): the active read fails, so the answer is that read's failure as the tool's reads answer today, not `undetermined`. Test in Task 11.

---

## File Structure

- `src/lib/access/deniedActions.ts` — the deny grammar: `DeniedEntry`, `parseDeniedEntry`, matching.
- `src/lib/access/accessLists.ts` — package / request / table grammars and `AccessLists`.
- `src/lib/access/withoutDenied.ts` — group wrapper, narrowing, unmatched entries.
- `src/lib/access/narrowing.ts` — per compact tool: its values, its codes, its definition for a member set.
- `src/lib/access/accessChecks.ts` — `IAccessChecks`, `AccessCall`, `AccessVerdict`, `IPackageReader`.
- `src/lib/access/checkedArguments.ts` — the argument tables, `checkedArgumentsOf`, `accessCallOf`, `PACKAGE_CREATE`.
- `src/lib/access/listedAccessChecks.ts`, `src/lib/access/packageTreeAccessChecks.ts` — the two shipped strategies.
- `src/lib/access/packageReader.ts` — `lazyPackageReader`.
- `src/lib/access/startLine.ts` — the start line.
- `src/lib/access/index.ts` — exports, `accessChecksFor`.
- `src/lib/config/accessRestrictions.ts` — the five rows, `readAccessRestrictions`.
- `src/lib/draft/draftOf.ts` — the pure verdict; `src/lib/draft/readDraftEtags.ts` — the three reads.
- `src/handlers/common/readonly/handleGetObjectDraft.ts` — `GetObjectDraft`.
- Modified: `src/lib/compact/compactDescriptions.ts`, `src/lib/compact/compactSchemas.ts`, the eight fixed-enum tool modules, `src/lib/toolSet.ts`, `src/lib/auth/serverRefusal.ts`, `src/embeddable/BaseMcpServer.ts`, `src/lib/handlers/base/BaseHandlerGroup.ts`, `src/lib/handlers/HandlerExporter.ts`, the three parameter tables and launchers, `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts`, `compact-readonly-entries/src/handlers/handleHandlerGet.ts` and its part routes, `tools/batch-handlers.json` (per Task 2), fixtures.

---

### Task 0: Base on the merged static-types change

**Files:** none changed by hand except the merge.

- [ ] **Step 1:** Wait until PR #346 is merged into `main` (the owner merges). Do not start Task 3 before.
- [ ] **Step 2:** `git fetch origin && git merge origin/main` on `feat/access-restrictions` (no rebase of pushed commits, no force push). Resolve nothing in `docs/superpowers/` but this plan and the spec.
- [ ] **Step 3:** Confirm each name this plan uses still exists, and fix this plan's references in the same commit if one moved: `ParameterTable`, `Parameter`, `ParameterRefusal`, `readParameters` (`src/lib/config/authParameters.ts`); `BATCH_KEEP_RAW_PARTS_ROW` in the three tables (`server-runtime/src/stdio/config/coreParameters.ts`, `server-runtime/src/http/config/httpParameters.ts`, `server-runtime/src/sse/config/sseParameters.ts`); `registryOf` (`src/lib/toolSet.ts:126`); `ToolDefinition`, `VariantToolDefinition`, `HandlerEntry`, `defineTool`, `IHandlerGroup` (`src/lib/handlers/interfaces.ts`); `listedTool` (`src/lib/listedTool.ts`); `servedDefinition` (`src/lib/variantToolSet.ts:425`); `byVariant` (`src/lib/variantDefinition.ts`); the twelve builders (`src/lib/compact/compactDescriptions.ts`) and the twelve `compact*SchemaFor` (`src/lib/compact/compactSchemas.ts`); `runCall` (`src/embeddable/BaseMcpServer.ts:1399`); `registerToolOnServer` (`src/lib/handlers/base/BaseHandlerGroup.ts:121`); `CompositeHandlersRegistry.registerTool(server, entry)` (`:138`); `HandlerExporter` constructor (`:154`) and `wrapEntry` (`:247`); `ServerRefusalCode`, `ServerRefusal` (`src/lib/auth/serverRefusal.ts`); `readPackageMetadata` (`src/lib/strategies/metadataReads.ts:213`); `GetObjectVersions` (`src/handlers/common/readonly/handleGetObjectVersions.ts`, registered in `ReadOnlyHandlersGroup.ts:222`).
- [ ] **Step 4:** Run `npm run build && npm run test:check && npm test`. Expected: green, as `main`.
- [ ] **Step 5:** Commit the merge; `git push` (plain).

### Task 1: Measure the draft versions (live, before Task 11)

**Files:**
- Create (temporary, deleted in Step 7): `src/__tests__/live/measure/draftVersions.test.ts`
- Modify: this plan's "Measurement record" (end of file)

The probe is a Jest file that runs only where `MCP_MEASURE_ONPREM_WRITER_ENV`, `MCP_MEASURE_ONPREM_READER_ENV` and (for the trial) `MCP_MEASURE_TRIAL_ENV` name session `.env` files; elsewhere it skips with that reason in its test name. Each user's connection is built from its own session file as `connectionAs` does in `src/__tests__/integration/debugger/DebuggerHandlers.test.ts`; every connection logs off in `afterAll`, also after a failure. ETags are read through an adt-clients client built with the `wireItself` reading.

- [ ] **Step 1:** Realm checks without logon (on premise: the expected `401` realm; trial: `401` and the session JWT's `exp` in the future). Any other answer: stop.
- [ ] **Step 2:** Write the probe. For each type of spec §5.1 (program, class, interface, include, function module, CDS view, behavior definition, behavior implementation, metadata extension, service definition, table, structure; domain, data element, function group, package, table type, message class, service binding): the writer creates a temporary object in `$TMP`, activates it, then the probe records the ETag of `active`, `inactive`, `workingArea` and `workspace` for: (a) both users after activation; (b) both users after the writer's unactivated write; (c) both users after the writer activates again. For a class: also a write of each include (local types, local definitions, test classes, macros) alone, recording the main source's three ETags; for a function group: a write of a function group include alone, likewise. Every object is deleted in `afterAll`.
- [ ] **Step 3:** Run it: `MCP_MEASURE_ONPREM_WRITER_ENV=… MCP_MEASURE_ONPREM_READER_ENV=… npm test -- src/__tests__/live/measure/draftVersions.test.ts`. Expected: it prints one table per type; no credential refusal.
- [ ] **Step 4:** Trial: the same for one user in the cloud probe package (`none` and `own` only), types served on cloud.
- [ ] **Step 5:** Record in the Measurement record: per type, whether the three ETags tell `none`, `own` and `other` apart (the type is offered only if so); whether `workingArea` answers as `workspace` for the reader (equal ETags in (b)); whether an include write moves the main source's `inactive` ETag; the ETag shape per type.
- [ ] **Step 6:** Decide by the spec's fallbacks, recorded beside the results:
  - `workingArea` ≠ `workspace` for the reader → Task 1a runs before Task 11.
  - An include write moves the main ETag → the draft tool reads the main source only; it does not → **stop**: the finding goes to the owner, and Task 11 does not start until the owner has decided the per-part answer's shape (no shape is decided in this plan).
  - The offered type list = the types whose ETags told the three states apart; the others go to the docs' "not offered" list.
- [ ] **Step 7:** Delete the probe file; commit the record: `docs(plan): draft version measurements`.

### Task 1a (conditional): `workspace` version in interfaces-adt and adt-clients

Runs only if Task 1 found `workingArea` ≠ `workspace`. Other repositories, each its own task and PR by their rules: `interfaces-adt` adds `'workspace'` to `AdtReadVersion` (minor); `adt-clients` sends it verbatim (minor), each published first. This repository then raises its ranges to the published versions; the lockfile is regenerated by npm (`npm install --package-lock-only --ignore-scripts`) and checked for `"link": true` and anything not resolved from the registry. No link to a sibling repository at any point.

### Task 2: Measure batch ETags and the package reader (live, before Tasks 9 and 11)

**Files:**
- Create (temporary, deleted in Step 5): `src/__tests__/live/measure/batchAndPackage.test.ts`
- Modify: the Measurement record

Same guards, connections, logoff and realm checks as Task 1.

- [ ] **Step 1:** Write the probe: (a) the three version reads of one class sent in one ADT `$batch` through adt-clients' `AdtBatchConnection`, each answer part's headers recorded after `parseBatchResponse`; (b) `readPackageMetadata` of a package with a super package and of one at the top, recording the document element that names the super package and its value; (c) with a server batch open (`InstanceBatch`), one `readPackageMetadata` sent on the instance's real connection inside a call's turn, recording that it was sent and answered and that no batch number was taken.
- [ ] **Step 2:** Run it on premise and on the trial (`npm test -- src/__tests__/live/measure/batchAndPackage.test.ts` with the env names set).
- [ ] **Step 3:** Record: whether each `$batch` part keeps `ETag`; the super-package element's path; whether (c) was sent.
- [ ] **Step 4:** Decide by the spec's fallbacks: ETag kept → `GetObjectDraft` and `HandlerGet` `part: 'draft'` get a `tools/batch-handlers.json` entry (Task 11); lost → no entry, refused `batch_not_recordable` in batch mode. (c) not sent → `lazyPackageReader` rejects while a batch is open (Task 9).
- [ ] **Step 5:** Delete the probe; commit the record.

### Task 3: The five rows and their readers

**Files:**
- Create: `src/lib/access/deniedActions.ts`, `src/lib/access/accessLists.ts`, `src/lib/config/accessRestrictions.ts`
- Modify: `server-runtime/src/stdio/config/coreParameters.ts`, `server-runtime/src/http/config/httpParameters.ts`, `server-runtime/src/sse/config/sseParameters.ts` (add `...ACCESS_RESTRICTION_ROWS` beside `BATCH_KEEP_RAW_PARTS_ROW`), `src/lib/config/index.ts` (exports)
- Test: `src/__tests__/unit/access/deniedActions.test.ts`, `src/__tests__/unit/access/accessLists.test.ts`, `src/__tests__/unit/config/accessRestrictions.test.ts`

**Interfaces:**
- Produces:
  - `interface DeniedEntry { readonly text: string; readonly tool: string; readonly toolIsPrefix: boolean; readonly value: string | undefined; readonly valueIsPrefix: boolean }`; `type DeniedActions = readonly DeniedEntry[]`
  - `parseDeniedEntry(text: string, name: string): DeniedEntry` (throws `ParameterRefusal`)
  - `type PackageEntry = { readonly kind: 'exact' | 'prefix' | 'subtree'; readonly name: string }`; `type NameEntry = { readonly kind: 'exact' | 'prefix'; readonly name: string }`
  - `parsePackageEntry(text, name): PackageEntry`, `parseRequestEntry(text, name): NameEntry`, `parseTableEntry(text, name): NameEntry`
  - `interface AccessLists { readonly allowedPackages?: readonly PackageEntry[]; readonly allowedRequests?: readonly NameEntry[]; readonly deniedTables?: readonly NameEntry[]; readonly allowedTables?: readonly NameEntry[] }`
  - `interface AccessRestrictions { readonly deniedActions: DeniedActions; readonly lists: AccessLists }`
  - `ACCESS_RESTRICTION_ROWS: readonly Parameter[]` (keys `denyActions`, `allowedPackages`, `allowedRequests`, `deniedTables`, `allowedTables`; section `ACCESS RESTRICTIONS`; each `parse` returns the trimmed entries as `readonly string[]`, each entry checked by its `parse…Entry`)
  - `readAccessRestrictions(argv: readonly string[], env: NodeJS.ProcessEnv, yaml?: Record<string, unknown> | null): AccessRestrictions` (absent rows → `deniedActions: []`, list absent)

- [ ] **Step 1: Write the failing tests.**
  - `deniedActions.test.ts`: `parseDeniedEntry('DeleteClass')` → `{ tool: 'DeleteClass', toolIsPrefix: false, value: undefined }`; `'HandlerDelete.CLASS'` → value `CLASS`; `'HandlerActivate.CLAS/OC'` → value `CLAS/OC`; `'HandlerDebugSession.get*'` → value `get`, `valueIsPrefix: true`; `'Delete*'` → tool `Delete`, `toolIsPrefix: true`; refused, each with `ParameterRefusal` naming the row: `''`, `'.CLASS'`, `'Handler-Get'`, `'HandlerGet.CL ASS'`, `'Del*ete'`, `'*'`, `'*.CLASS'`, `'A.B.C'`, `'HandlerGet.'`.
  - `accessLists.test.ts`: packages `ZFOO` exact, `$TMP` exact, `Z*` prefix, `ZFOO/**` subtree name `ZFOO`, `/ABC/ZFOO/**` subtree name `/ABC/ZFOO`, `zfoo` → name `ZFOO`; refused `Z*O`, `ZFOO**`, `Z*/**`, `/**`, `ZF OO`; requests `A4HK900123` exact, `A4HK*` prefix, refused `A4HK/1`, `A*K`; tables `MARA` exact, `ZT*` prefix, refused `ZT/**`.
  - `accessRestrictions.test.ts`, for each row in each of CLI (`--deny-actions=a,b`), env and YAML (a sequence and one string): entries trimmed; `a,,b` and `a,` refused naming the form; `MCP_DENY_ACTIONS=` and `restrictions: { deny-actions: [] }` absent (`deniedActions: []`); a YAML item `42` or a mapping refused naming the row; `--denied-tables=X --allowed-tables=Y` refused (the words name both rows); CLI beats env beats YAML.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access src/__tests__/unit/config/accessRestrictions.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Implement the parsers in plain code (character checks, no regex); the rows; the tables list `ACCESS_RESTRICTION_ROWS` after `BATCH_KEEP_RAW_PARTS_ROW`. The both-table-lists refusal is raised by `readAccessRestrictions`.
- [ ] **Step 4:** Run the tests again, then `npm test -- src/__tests__/unit/config`. Expected: PASS; the parameter-table help/template tests updated only by the new rows' lines (review the diff).
- [ ] **Step 5:** Commit `feat(access): the five restriction rows and their grammars`.

### Task 4: Description and schema builders take member sets

**Files:**
- Modify: `src/lib/compact/compactDescriptions.ts` (twelve builders), `src/lib/compact/compactSchemas.ts` (`compactActivateSchemaFor`, `compactGetSchemaFor`, `compactGetDataSchema` → `compactGetDataSchemaFor`), `src/lib/compact/batch/handleHandlerBatch.ts`, `src/lib/compact/debug/handleHandlerDebugBatch.ts`, `src/lib/compact/longSession/handleHandlerSession.ts`, `src/lib/compact/debug/handleHandlerDebugSession.ts`, `handleHandlerDebugStep.ts`, `handleHandlerDebugBreakpoints.ts`, `handleHandlerDebugMaintain.ts`, `compact-readonly-entries/src/handlers/handleHandlerGetData.ts`
- Create: `src/lib/access/narrowing.ts`
- Test: `src/__tests__/unit/access/builders.test.ts`

**Interfaces:**
- Produces:
  - each of the twelve builders gains a trailing `members` parameter defaulting to today's (`compactCreateDescription(variant, members = COMPACT_CREATE[variant])`, likewise for the other eleven);
  - `compactActivateSchemaFor(members, variant, codes?: readonly string[])` and `compactGetSchemaFor(members, mainPrograms, codes?: readonly string[])`: with `codes` given, `objects[].type` / `object_adt_type` are `z.enum(codes)`; without, free strings as today;
  - eight builders: `handlerBatchDefinition(actions)`, `handlerDebugBatchDefinition(actions)`, `handlerSessionDefinition(actions)`, `handlerDebugSessionDefinition(operations)`, `handlerDebugStepDefinition(operations)`, `handlerDebugBreakpointsDefinition(operations)`, `handlerDebugMaintainDefinition(operations)`, `handlerGetDataDefinition(sql: boolean)`, each `→ { description: string; inputSchema: z.ZodObject }`; each module's `TOOL_DEFINITION` is built from it with every value;
  - `interface Narrowing { readonly tool: string; values(variant: ProjectionVariant): readonly string[]; codes?(variant: ProjectionVariant): readonly string[]; definition(variant: ProjectionVariant, values: readonly string[], codes: readonly string[] | undefined): VariantToolDefinition }`; `NARROWINGS: ReadonlyMap<string, Narrowing>` covering the twelve `object_type` / `target_type` tools, the seven `action` / `operation` tools and `HandlerGetData` (values `['sql']`); codes for `HandlerActivate` (`ACTIVATION_CODES[variant]`) and `HandlerGet` (`TABLE_CODES[variant]`).

- [ ] **Step 1: Write the failing test** `builders.test.ts`:
  - for every entry of `NARROWINGS` and both variants: `definition(variant, values(variant), undefined)` equals the tool's registered variant definition — description string equal, `z.toJSONSchema` of the schema equal (the byte-identity of §7);
  - `HandlerDelete` with `CLASS` removed: `CLASS` absent from the enum, from the description, and from `members`;
  - `HandlerBatch` with `end` removed: enum `['begin', 'answers']`, the description and the `action` property's description name no `'end'`;
  - `HandlerActivate` codes without `CLAS/OC`: `objects[].type` and `object_adt_type` enums lack `CLAS/OC`; `object_type` still lists `CLASS` and `BEHAVIOR_IMPLEMENTATION`; parsing `{ object_adt_type: 'clas/oc', object_name: 'Z' }` fails while any code is narrowed;
  - `HandlerGet` codes without `CLAS/OC`: `object_adt_type` enum lacks it; `part` keeps every value;
  - `handlerGetDataDefinition(false)`: no `sql_query` property, no `sql_query` in any description; `true` equals today's.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/builders.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement; the descriptions are assembled from per-value sentences so a removed value leaves no trace; today's text is the output for all values (the byte-identity test guards it).
- [ ] **Step 4:** Run the test, then `npm test -- src/__tests__/unit/toolSet`. Expected: PASS, every fixture unchanged.
- [ ] **Step 5:** Commit `refactor(compact): definitions built from a member set`.

### Task 5: `withoutDenied` at registration

**Files:**
- Create: `src/lib/access/withoutDenied.ts`
- Modify: `src/lib/toolSet.ts` (`registryOf`)
- Test: `src/__tests__/unit/access/withoutDenied.test.ts`

**Interfaces:**
- Consumes: `DeniedActions` (Task 3), `NARROWINGS` (Task 4).
- Produces:
  - `withoutDenied(groups: readonly IHandlerGroup[], denied: DeniedActions): IHandlerGroup[]` — each group's `getHandlers()` leaves out a denied tool and returns, for a narrowed tool, an entry whose `toolDefinition` (own and `variants`) is the narrowed one and whose `call` first `safeParse`s the arguments with the narrowed schema of the definition's own (on-premise) statement — refusing with `invalidArgumentsWords` — then calls the original `call` with the original arguments; `denied = []` returns the groups unchanged (same objects);
  - `unmatchedEntries(groups: readonly IHandlerGroup[], denied: DeniedActions): readonly string[]` — the `text` of each entry matching no tool, value or code on either variant;
  - `registryOf(toolSet: ToolSet, transport: ServedTransport, denied: DeniedActions = []): CompositeHandlersRegistry`.
- Matching: `Tool` / `Prefix*` against tool names; `Tool.value` / `Tool.prefix*` against `values(variant)` and, on HandlerActivate and HandlerGet, `codes(variant)`; exact, case included. A compact tool is left out only when every value of every form is denied (spec §3.1): HandlerActivate needs all names and all codes; HandlerGet and HandlerGetData only by a `Tool` entry.

- [ ] **Step 1: Write the failing tests** (`withoutDenied.test.ts`, on the compact and full sets' groups built as `registryOf` builds them):
  - `DeleteClass` denied: absent from `getHandlers()`; `Delete*`: every `Delete…` tool absent, `DeletionCheck…` none of the full set's absent unless it starts with `Delete`;
  - `HandlerActivate.CLASS`: `CLASS` gone from `object_type`; `BEHAVIOR_IMPLEMENTATION` listed; `objects[].type` and `object_adt_type` still free strings;
  - `HandlerActivate.CLAS/OC`: `CLAS/OC` refused by `entry.call` in `objects[].type` and `object_adt_type` (as `CLAS/OC`, `clas/oc` and `class`); `CLASS` and `BEHAVIOR_IMPLEMENTATION` still in `object_type`; the same for `HandlerGet.CLAS/OC` and `object_adt_type`;
  - `HandlerActivate.CLAS*` removes `CLASS` and `CLAS/OC`;
  - HandlerActivate with every name denied: listed, a code callable; every code denied: listed, a name callable; both: absent;
  - `HandlerProfileRun` with every value denied: absent;
  - `HandlerGetData.sql`: `sql_query` absent and refused by `entry.call`; `{ object_name: 'MARA' }` accepted;
  - `HandlerCreate.PROGRAM`: not in `unmatchedEntries` (matches on premise); `HandlerCreate.NOPE`, `DebugStepX`, `GetPackage.CLASS`: in `unmatchedEntries`;
  - `denied = []`: `withoutDenied(groups, [])` returns the same group objects.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/withoutDenied.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; then `npm test -- src/__tests__/unit/toolSet`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): denied actions removed at registration`.

### Task 6: `HandlerExporter` takes the denied actions

**Files:**
- Modify: `src/lib/handlers/HandlerExporter.ts` (`HandlerExporterOptions`, constructor)
- Test: `src/__tests__/unit/access/exporterDenied.test.ts`

**Interfaces:**
- Consumes: `withoutDenied`, `DeniedActions`.
- Produces: `HandlerExporterOptions.deniedActions?: DeniedActions | undefined`; the constructor applies `withoutDenied` once to its groups.

- [ ] **Step 1: Write the failing test:** an exporter with `deniedActions: [parseDeniedEntry('GetPackage', 'test'), parseDeniedEntry('GetClass.CLASS', 'test')]`: `GetPackage` absent from `getHandlerEntries()`, from `getToolNames()` and from an `McpServer` it `registerOnServer`s on (the SDK's `tools/list`); every other exported definition deep-equal to one from an exporter without `deniedActions`.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/exporterDenied.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): HandlerExporter takes deniedActions`.

### Task 7: The strategy interface, the checked arguments and the simple strategy

**Files:**
- Create: `src/lib/access/accessChecks.ts`, `src/lib/access/checkedArguments.ts`, `src/lib/access/listedAccessChecks.ts`
- Modify: `src/lib/auth/serverRefusal.ts` (four codes and their words), `src/lib/toolSet.ts` (`readOnlyToolNames`)
- Test: `src/__tests__/unit/access/checkedArguments.test.ts`, `src/__tests__/unit/access/listedAccessChecks.test.ts`

**Interfaces:**
- Consumes: `AccessLists`, `PackageEntry`, `NameEntry` (Task 3).
- Produces:
  - `interface IAccessChecks { check(call: AccessCall, sap: IPackageReader): Promise<AccessVerdict> }`
  - `interface IPackageReader { superPackageOf(packageName: string): Promise<string | undefined> }`
  - `interface NamedValue { readonly argument: string; readonly value: string }`
  - `interface AccessCall { readonly tool: string; readonly dispatch: string | undefined; readonly packages: readonly NamedValue[]; readonly requests: readonly NamedValue[]; readonly tables: readonly NamedValue[]; readonly packageCreate: boolean }`
  - `type AccessRefusalCode = 'package_not_allowed' | 'package_tree_unreadable' | 'request_not_allowed' | 'table_not_allowed'`; `type AccessVerdict = { readonly allowed: true } | { readonly allowed: false; readonly code: AccessRefusalCode; readonly argument: string; readonly value: string }`
  - `PACKAGE_ARGUMENTS = ['package_name', 'super_package']`, `REQUEST_ARGUMENTS = ['transport_request', 'transport_number', 'target_number']`, `TABLE_ARGUMENTS: ReadonlyMap<string, string>` (`GetTableContents` → `table_name`, `HandlerGetData` → `object_name`)
  - `interface CheckedArguments { readonly packages: readonly string[]; readonly requests: readonly string[]; readonly table: string | undefined; readonly dispatch: string | undefined }`
  - `checkedArgumentsOf(definition: ToolDefinition, readOnly: ReadonlySet<string>): CheckedArguments | undefined` — from the zod shape's keys; packages and requests only when `readOnly` lacks the tool; `undefined` when nothing is checked
  - `accessCallOf(tool: string, checked: CheckedArguments, args: ToolArgs): AccessCall | undefined` — string values only, trimmed and upper-cased; empty or blank not included; `undefined` when nothing is named; `packageCreate` per `isPackageCreate`
  - `isPackageCreate(tool: string, args: ToolArgs): boolean` — `CreatePackage`, or `HandlerCreate` with `object_type` `'PACKAGE'`
  - `readOnlyToolNames(): ReadonlySet<string>` — the tool names of the core-ro and compact-ro sets
  - `refusalOf(verdict: AccessVerdict & { allowed: false }): ServerRefusal` with the Global Constraints' words
  - `listedAccessChecks(lists: AccessLists): IAccessChecks` — throws `ParameterRefusal` "allowed-packages: a subtree entry needs the package tree strategy: <entry>" when given a subtree entry

- [ ] **Step 1: Write the failing tests.**
  - `checkedArguments.test.ts`: over the full and compact sets as registered, the tools with package or request arguments equal spec Appendix B exactly (88 full: 25 package, 86 request; compact 6: `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerLock`, `HandlerTransportMoveObjects`, `HandlerTransportSortAndCompress`); `GetPackage`, `GetTransport`, `HandlerGet`, `HandlerValidate` not checked; `package_type`, `transport_layer`, `transport_type`, `task_type`, `include_subpackages`, `include_tasks`, `packages`, `package_names` never checked; `isPackageCreate` true for exactly `CreatePackage` and `HandlerCreate`+`PACKAGE` (false for `CheckPackage`, `HandlerValidate`+`PACKAGE`, `HandlerCreate`+`CLASS`); `accessCallOf` with `package_name: 42` (Review Focus 3) and with `'  '` names nothing.
  - `listedAccessChecks.test.ts`: allowed packages `ZFOO`, `Z*`: `ZFOO` and `ZBAR` allowed, `YFOO` → `{ allowed: false, code: 'package_not_allowed', argument: 'package_name', value: 'YFOO' }`; requests `A4HK*`: `A4HK900123` allowed, `B4HK1` refused `request_not_allowed`; tables denied `MARA`: `MARA` refused `table_not_allowed`, `MARC` allowed; allowed `ZT*`: `MARA` refused; both package and request lists: each name against its own; the reader is never called (a reader that throws); a subtree entry throws at construction; `refusalOf` words exactly as Global Constraints.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/checkedArguments.test.ts src/__tests__/unit/access/listedAccessChecks.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): the access-check strategy and the simple strategy`.

### Task 8: The calls are checked on every registered path

**Files:**
- Modify: `src/embeddable/BaseMcpServer.ts` (options `accessChecks?: IAccessChecks | undefined`; `runCall`), `src/lib/handlers/base/BaseHandlerGroup.ts` (`registerToolOnServer`, and the options path it takes the strategy from), `src/lib/handlers/HandlerExporter.ts` (`accessChecks?`, `wrapEntry`), `server-runtime/src/stdio/StdioServer.ts`, `server-runtime/src/http/StreamableHttpServer.ts`, `server-runtime/src/sse/SseServer.ts` (pass `accessChecks` through)
- Create: `src/lib/access/packageReader.ts`
- Test: `src/__tests__/unit/access/accessWrappers.test.ts`

**Interfaces:**
- Consumes: Task 7's types; `checkedArgumentsOf` computed once per entry at registration with `readOnlyToolNames()`.
- Produces: `lazyPackageReader(take: () => Promise<AbapConnection>, signal: AbortSignal, batchOpen: () => boolean): IPackageReader` — `take` is memoized by the wrapper and is the same acquisition the wrapper uses after an allowed verdict; each `superPackageOf` is one `readPackageMetadata` on that connection, the super package read from the element Task 2 recorded; rejects while `batchOpen()` only if Task 2 (c) found the read could not be sent.
- Placement (spec §3.2): path 1 in `runCall` after the SDK's parse and before `getConnection`, the connection-and-turn steps (`getConnection`, `enterMainFlow`, the stale-connection refresh) moved into the memoized `take`; paths 2 and 3 in `registerToolOnServer` beside the argument refusals before `callContext()`, `take` asking `callContext()` once; path 5 in `wrapEntry` before the original handler, `take` answering the connection the embedder gave; path 4 not called.

- [ ] **Step 1: Write the failing tests** (`accessWrappers.test.ts`, a recording connection and a counting connection source):
  - path 1, simple strategy, refused `CreateClass` with `package_name: 'YFOO'`: the answer `isError` with `error: 'package_not_allowed'` and the words; no request recorded; the connection source never asked;
  - path 1, allowed: the handler's requests recorded as without a strategy;
  - path 1, a strategy reading through the reader: the reader's read and the handler's requests on the same connection object; the connection source asked once;
  - path 1, no strategy: the strategy spy never called and `checkedArgumentsOf` results unused (no `AccessCall` built: a spy on `accessCallOf`);
  - batch mode open, refused call: no batch number taken (the next recorded call takes number 1);
  - path 2 (`registerAllTools` on an `McpServer`) and path 3 (`registerTool(server, entry)`): the same refused case answers the same refusal and `callContext` is never asked;
  - path 3 with a group wrapped by `withoutDenied` denying `DeleteClass`: `registerTool(server, deleteClassEntry)` throws `REGISTER_TOOL_UNHELD_WORDS('DeleteClass')`;
  - path 5 (`getHandlerEntries()` with `accessChecks`): the refused call never reaches the original handler.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/accessWrappers.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; then `npm test` (full unit suite). Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): every registered path checks the call before its connection`.

### Task 9: The package-tree strategy

**Files:**
- Create: `src/lib/access/packageTreeAccessChecks.ts`, `src/lib/access/index.ts`
- Test: `src/__tests__/unit/access/packageTreeAccessChecks.test.ts`

**Interfaces:**
- Consumes: Task 7's types, `IPackageReader`.
- Produces: `packageTreeAccessChecks(lists: AccessLists): IAccessChecks`; `accessChecksFor(lists: AccessLists): IAccessChecks | undefined` — `undefined` when no call-time list is given; `packageTreeAccessChecks` when an allowed-packages entry is a subtree; else `listedAccessChecks`.

- [ ] **Step 1: Write the failing tests** (a recording reader answering from a map):
  - exact `ZBAR` and prefix `Z*` matched with no read (reader calls `0`);
  - `ZFOO/**`, package `ZFOO`: allowed, no read; `ZCHILD` (parent `ZFOO`): allowed, one read; `ZGRAND` (→ `ZCHILD` → `ZFOO`): allowed, two reads; `YTOP` (parent `undefined`): `package_not_allowed`;
  - a package create (`isPackageCreate`) `package_name: 'ZNEW'`, `super_package: 'ZFOO'`: allowed, `ZNEW` never read;
  - `CheckPackage` `package_name: 'ZOUTSIDE'` (parent `YROOT`), `super_package: 'ZFOO'`: `package_not_allowed` for `package_name`; `ZOUTSIDE` read;
  - reader rejects: `package_tree_unreadable`, `argument`, `value`; a cycle (`ZA` → `ZB` → `ZA`) and a self-parent (`ZA` → `ZA`, Review Focus 4): `package_tree_unreadable`;
  - `accessChecksFor`: `{}` → `undefined`; `{ allowedPackages: [Z*] }` → the simple one (a subtree entry absent); with `ZFOO/**` → the tree one; `{ deniedTables: [...] }` → a strategy.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/packageTreeAccessChecks.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement: exact and prefix entries first; then, for each subtree entry, walk with a seen-set.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): the package-tree strategy`.

### Task 10: Launchers: rows to strategy, denied actions and the start line

**Files:**
- Create: `src/lib/access/startLine.ts`
- Modify: `server-runtime/src/stdio/launcher.ts`, `server-runtime/src/http/launcher.ts`, `server-runtime/src/sse/launcher.ts`
- Test: `src/__tests__/unit/access/startLine.test.ts`; the launchers' existing unit tests (`server-runtime/src/__tests__/`)

**Interfaces:**
- Consumes: `readAccessRestrictions`, `registryOf(…, denied)`, `unmatchedEntries`, `accessChecksFor`.
- Produces: `accessStartLine(restrictions: AccessRestrictions, unmatched: readonly string[], tree: boolean): string`.

- [ ] **Step 1: Write the failing tests:** `accessStartLine` with nothing → `[MCP] Access restrictions: none`; with four deny entries of which `DebugStep` unmatched, three packages with a subtree, two requests → `[MCP] Access restrictions: deny-actions 4 (matching nothing here: DebugStep), allowed-packages 3 (package tree read), allowed-requests 2`; denied tables → clause `denied-tables N`; allowed tables → `allowed-tables N`; under the simple strategy the packages clause carries no strategy words (`allowed-packages 2`); `(package tree read)` appears only for the tree strategy. Launcher tests (stdio, http, sse): the line written once through `deps.stderr`; an http pool's second instance writes none; `--deny-actions=DeleteClass` leaves `DeleteClass` out of `tools/list`; `--allowed-packages=Z*` gives every instance the same strategy object; a malformed entry ends the start `1` with `[MCP] <words>`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement; read the rows with the table, pass `denied` to `registryOf` and the strategy through the server options.
- [ ] **Step 4:** `npm test -- src/__tests__/unit/access server-runtime/src/__tests__`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): the launchers apply the restrictions and name them at start`.

### Task 11: The draft tool

**Files:**
- Create: `src/lib/draft/draftOf.ts`, `src/lib/draft/readDraftEtags.ts`, `src/handlers/common/readonly/handleGetObjectDraft.ts`
- Modify: `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts` (beside `GetObjectVersions`), `src/lib/compact/compactSchemas.ts` (`READ_PARTS` gains `'draft'`, offered for the types Task 1 admitted), `compact-readonly-entries/src/handlers/handleHandlerGet.ts` and `compactPartRoutes.ts` (the `draft` route), `src/lib/compact/compactDescriptions.ts` (`compactGetDescription` names the part), `tools/batch-handlers.json` (per Task 2), `src/lib/variantToolSet.ts` (`TOOL_NEEDS` for `GetObjectDraft` as `GetObjectVersions`, so legacy does not list it)
- Test: `src/__tests__/unit/draft/draftOf.test.ts`, `src/__tests__/unit/draft/getObjectDraft.test.ts`

**Interfaces:**
- Produces:
  - `type DraftState = 'none' | 'own' | 'other' | 'undetermined'`
  - `interface DraftEtags { readonly active: string | null; readonly inactive: string | null; readonly workspace: string | null }`
  - `interface DraftAnswer { readonly draft: DraftState; readonly changed_at: string | null; readonly age_seconds: number | null; readonly etags: DraftEtags }`
  - `draftOf(etags: DraftEtags, now: Date): DraftAnswer` — `undetermined` when any ETag is `null` or not led by 14 ASCII digits; `none` when `active` = `inactive`; `own` when `inactive` ≠ `active` and `workspace` = `inactive`; `other` when `workspace` = `active` ≠ `inactive`; else `undetermined`; `changed_at` = the `inactive` ETag's 14 digits as `YYYY-MM-DDTHH:MM:SSZ`, `age_seconds` = floor((`now` − `changed_at`) in seconds), whole seconds; both `null` for `none` and `undetermined`
  - `readDraftEtags(connection: AbapConnection, object: DraftObject, signal: AbortSignal): Promise<DraftEtags>` — three reads (`active`, `inactive`, the working version Task 1 settled), each through a client built with `wireItself`; a failed read rejects with that read's failure as the tool's reads report it
  - `GetObjectDraft` arguments: `object_type` (`z.enum` of the types Task 1 admitted, per variant via `byVariant`), `object_name`, `function_group_name` optional; no `detail`
- Description (functional): reads the active, inactive and working versions of the named object and answers whether it has an unactivated change and whose (none, the caller's, another user's), with that change's time and age by the server's clock and the three ETags; another user's lock is not visible to it.

- [ ] **Step 1: Write the failing tests.**
  - `draftOf.test.ts` (ETag shape from the spec, `20261104101500` + `0011` / `0001`): `active = inactive = workspace = '202611041015000011'` → `none`, `changed_at: null`, `age_seconds: null`; `active '…0011'`, `inactive = workspace = '202611041030000001'` → `own`, `changed_at: '2026-11-04T10:30:00Z'`, `age_seconds` against a fixed `now` of `2026-11-04T10:31:00Z` → `60`; `workspace = active ≠ inactive` → `other`, same time fields; three distinct → `undetermined`, both `null`; `inactive: null` → `undetermined`, `etags.inactive: null`; an ETag `'W/"abc"'` → `undetermined`.
  - `getObjectDraft.test.ts` (recording connection answering three reads with ETag headers): the three requests carry `version=active`, `version=inactive` and the settled working version; the answer of `GetObjectDraft` and of `HandlerGet` `{ part: 'draft' }` for the same object deep-equal; a `404` on the active read answers as `GetClass` answers a `404` (Review Focus 5); in batch mode: recorded in one batch with three parts (ETag kept) or refused `batch_not_recordable` (lost), per Task 2; `listedTool` of `GetObjectDraft` on `legacy`: `listed: false`; a fixed `now` of `2026-11-04T10:31:00.900Z` gives `age_seconds: 60` (floor).
- [ ] **Step 2:** `npm test -- src/__tests__/unit/draft`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(draft): GetObjectDraft and HandlerGet part 'draft'`.

### Task 12: Nothing configured changes nothing

**Files:**
- Modify: `tests/fixtures/tools/surface.json`, `variant-surface.json`, `listed-schemas.json` (the two reviewed additions only), `http-surface.json` / `stdio-sse-surface.json` if they list tool names
- Test: `src/__tests__/unit/access/nothingConfigured.test.ts`

- [ ] **Step 1:** Run `npm test -- src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolSet`. Expected: FAIL only on the additions.
- [ ] **Step 2:** Write the additions: `WRITE_LISTED_SCHEMAS=1 npm test -- src/__tests__/unit/toolSet/listedSchemas.test.ts`, `WRITE_VARIANT_SURFACE=1 …variantSurface.test.ts`, `WRITE_TRANSPORT_SURFACE=1 …transportSurface.test.ts`; `surface.json` gets the `GetObjectDraft` row as `scripts/list-tools.ts` prints it. `git diff tests/fixtures` shows only `GetObjectDraft` and `HandlerGet`'s `draft` (enum value and description mention).
- [ ] **Step 3: Write the test** `nothingConfigured.test.ts`: `readAccessRestrictions([], {}, null)` → `{ deniedActions: [], lists: {} }`; `accessChecksFor({})` → `undefined`; `registryOf(set, transport)` and `registryOf(set, transport, [])` list deep-equal definitions for every set; a server started from the stdio launcher's path with no rows never builds an `AccessCall` (a spy on `accessCallOf`) across one call of each tool in `src/__tests__/helpers/batchEntryCases.ts`. Today's requests stay pinned by the existing request suites, which must pass unchanged: `src/__tests__/unit/lowToCompact.test.ts` and the batch entry tests.
- [ ] **Step 4:** Run the tool-surface tests, this test, and `npm test -- src/__tests__/unit/lowToCompact.test.ts`. Expected: PASS with no change to their expectations.
- [ ] **Step 5:** Commit `test(access): nothing configured changes nothing`.

### Task 13: Live runs

**Files:**
- Create: `src/__tests__/integration/high/draft/GetObjectDraft.test.ts`, `src/__tests__/integration/high/access/AccessRestrictions.test.ts`
- Modify: `tests/test-config.yaml.template` (`draft.second_user_env`, as the debugger's `second_user_env`)

- [ ] **Step 1:** Realm checks (Global Constraints).
- [ ] **Step 2: Write the tests.** Draft, on premise: for every offered type, `none` after activation, `own` for the writer and `other` for the reader after the writer's unactivated write, each user through its own connection; skipped with the reason where `draft.second_user_env` is empty. Trial: `none` and `own`. Access, on premise: an allowed create in `$TMP` (`allowed-packages $TMP`) runs; a create in another package is refused `package_not_allowed` with no request recorded; the tree strategy with `<parent>/**` allows a package below it and refuses one outside. Objects deleted after; nothing else touched.
- [ ] **Step 3:** `npm run test:integration -- src/__tests__/integration/high/draft src/__tests__/integration/high/access` on premise and on the trial. Expected: PASS.
- [ ] **Step 4:** Commit `test(integration): the draft tool and the access checks live`.

### Task 14: Docs

**Files:**
- Create: `docs/user-guide/ACCESS_RESTRICTIONS.md`
- Modify: `docs/user-guide/CLI_OPTIONS.md`, `docs/configuration/YAML_CONFIG.md`, `src/lib/config/README.md`, `docs/user-guide/BATCH_MODE.md`, `docs/user-guide/HANDLERS_MANAGEMENT.md`, `src/embeddable/docs/ARCHITECTURE.md`, `README.md`, `SECURITY.md`, `docs/user-guide/AVAILABLE_TOOLS*.md` (`npm run docs:tools`)

- [ ] **Step 1:** Write `ACCESS_RESTRICTIONS.md` with spec §8's content: every setting in its three forms; the grammars; the start line; reads are not checked; a task is matched as given (one line); denying `Activate*` closes only the activation tools, not a write's `activate`; each entry denies exactly what it names, and an administrator who wants a whole object kind out denies every value that names it; an ADT code is a value of its own (`HandlerActivate.CLAS/OC`) and, while one is denied, the code arguments take codes as written in upper case only; the paths an embedder takes into its own hands are its own; `GetObjectDraft` (its answer, the types offered and not offered from Task 1, the server clock, first writer wins).
- [ ] **Step 2:** The other docs as listed; `HANDLERS_MANAGEMENT.md` and `ARCHITECTURE.md`: `accessChecks`, the two strategies, `IPackageReader`, `withoutDenied`, `HandlerExporter`'s `deniedActions`, paths 3 to 5; `SECURITY.md`: the checks are formal, SAP's authorization remains the boundary; `BATCH_MODE.md`: a refused call takes no number, the draft tool recordable or not.
- [ ] **Step 3:** `npm run docs:tools`; `git diff docs/user-guide/AVAILABLE_TOOLS*.md` shows only `GetObjectDraft` and the `draft` part.
- [ ] **Step 4:** Commit `docs: access restrictions and the draft tool`.

### Task 15: Release 24.1.0

**Files:** every `package.json` of the eighteen packages, the `server*.json` manifests, `docker/Dockerfile.inspect.*` `CORE_VERSION`, `package-lock.json`, `CHANGELOG.md`

- [ ] **Step 1:** Every version to `24.1.0` and every sibling range to `^24.1.0`, as release `77ada8e0` did for 24.0.0; lockfile by `npm install --package-lock-only --ignore-scripts`; check it for `"link": true` beyond workspace siblings and for anything not resolved from the registry.
- [ ] **Step 2:** `CHANGELOG.md` `[24.1.0]` with today's date: the five rows, the two strategies, `HandlerExporter.deniedActions`, `accessChecks`, the four refusal codes, `GetObjectDraft` and `HandlerGet` `part: 'draft'`, the start line; no migration.
- [ ] **Step 3:** Commit `release: the eighteen packages at 24.1.0`.

### Task 16: Close

- [ ] **Step 1:** CI's full step list locally (`.github/workflows/ci.yml`): `npm ci --ignore-scripts`, every package's `lint:check` and `test:check`, `npm run build`, `npm test`. Expected: green.
- [ ] **Step 2:** The full integration suite on premise and on the trial (`npm run test:integration`, after the realm checks). Every failure fixed before going on.
- [ ] **Step 3:** Push; Codex review of the PR; fix findings; CI green.
- [ ] **Step 4:** Owner review.
- [ ] **Step 5:** Delete `docs/superpowers/2026-11-04-access-restrictions-goal.md`, `-spec.md` and `-plan.md`; what they owe (the legacy measurement task, any measurement record worth keeping, Task 1a if it ran) goes into the PR description first. Commit, push. Merge, tag and publish are the owner's.

---

## Decisions on the spec's silences (the owner's rulings)

1. The start line's packages clause names the strategy only for the tree strategy, `(package tree read)`; under the simple strategy it carries no strategy words.
2. `age_seconds` is whole seconds: the floor of (now − `changed_at`); the ETag timestamp has second precision.
3. The per-part answer's shape is a gate, not a decision: if Task 1 finds an include change does not move the main source's ETag, the work stops and the finding goes to the owner before Task 11.

## Measurement record

(Filled by Tasks 1 and 2.)
