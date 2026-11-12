# Access Restrictions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An administrator restricts what the model can do through this server by start-time configuration (denied actions, allowed packages, allowed requests, denied or allowed tables), and every binary gains a read tool that tells whose unactivated draft an object holds.

**Architecture:** Denied actions are applied once, at registration: `withoutDenied` wraps the handler groups so a denied tool is absent and a denied compact value or ADT code is absent from the listed zod schema, which the SDK and `HandlerEntry.call` both parse. Package, request and table lists are a strategy (`IAccessChecks`) called once per call by each registration wrapper, before the call's connection is taken; a tree strategy reads the package tree through a lazy `IPackageReader`. The draft tool reads three versions of an object and compares their ETags.

**Tech Stack:** TypeScript (strict, the static-types scan: no assertion but `as const`, no `any`, no `!`), zod `inputSchema`, `@modelcontextprotocol/sdk`, connection 22.0.1 (`^22.0.1`, the bump #346 makes; this branch takes it by merging `origin/refactor/static-types`, never bumps it itself), adt-clients 45.3, interfaces-adt 27.2 (the base's ranges; `wireItself` and `AdtBatchConnection` imported from the package root `@mcp-abap-adt/adt-clients`, as the base does — Code: `src/handlers/common/low/handleActivateObject.ts`, `src/lib/batch/tools.ts`; adt-clients' exports and interfaces-adt's `AdtReadVersion` re-read in `node_modules` at Task 0), every new test file on node:test, unit and live, through the npm scripts (the base runs Jest and node:test side by side: `tools/npm-test.mjs`, `tools/node-test-files.json`; the existing Jest suites this plan names stay where they are), Biome.

**Spec:** `docs/superpowers/2026-11-04-access-restrictions-spec.md` (approved). Goal: `docs/superpowers/2026-11-04-access-restrictions-goal.md`.

## Global Constraints

- Base: `refactor/static-types` (PR #346) at `fd4a1882`, merged into `feat/access-restrictions` (merge `fb56568d`); this PR targets that branch and lands in #346. Every path below is named against that base; a later merge of the base re-checks them (Task 0).
- Release: part of **24.0.0** (#346), not a release of its own. The version, the publish order and the registry install are #346's release steps. This PR adds its lines to the unreleased `CHANGELOG.md` `[24.0.0]` entry (dated 2026-11-12) and describes the new optional configuration in `docs/MIGRATION-24.0.md` where it fits (Task 13).
- Nothing configured, nothing changes: every fixture byte-identical except the two reviewed additions (`GetObjectDraft`; `HandlerGet` `part: 'draft'`), and no wrapper calls a strategy.
- Rows: CLI `--deny-actions` / `--allowed-packages` / `--allowed-requests` / `--denied-tables` / `--allowed-tables`; env `MCP_DENY_ACTIONS` / `MCP_ALLOWED_PACKAGES` / `MCP_ALLOWED_REQUESTS` / `MCP_DENIED_TABLES` / `MCP_ALLOWED_TABLES`; YAML `restrictions.deny-actions` / `restrictions.allowed-packages` / `restrictions.allowed-requests` / `restrictions.denied-tables` / `restrictions.allowed-tables`. No defaults. `custom` rows.
- Refusal codes and words, verbatim: `package_not_allowed` "<argument> names a package outside the allowed packages: <value>"; `package_tree_unreadable` "the package tree above <value> could not be read, so <argument> is not checked against the allowed packages"; `request_not_allowed` "<argument> names a request outside the allowed requests: <value>"; `table_not_allowed` "the data of <value> is not readable through this server".
- Start line, verbatim forms: `[MCP] Access restrictions: none`; `[MCP] Access restrictions: deny-actions 4 (matching nothing here: DebugStep), allowed-packages 3 (package tree read), allowed-requests 2`.
- Tests: through npm scripts only; never `npx`, `npm exec`, `node --test`, `node_modules/.bin` or `ts-node`. **Every test file this plan creates is a node:test file** (the owner's decision), written as the base's node:test files are (pattern: `src/__tests__/unit/toolSet/dataTools.test.ts`, `src/__tests__/unit/launchers/dataToolsAtStart.test.ts`, `src/__tests__/unit/atc/atcPoll.test.ts`):
  - `import assert from 'node:assert/strict'` and `import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test'`; assertions `assert.equal`, `assert.deepEqual`, `assert.ok`, `assert.throws` / `assert.rejects` (the rejection expectation made before its trigger), no regex in an assertion; no Jest API (`jest.*`, `expect`, `toEqual`, `describe.each` / `it.each`, `beforeAll` / `afterAll`, `jest.setTimeout`): a parameterized case is a loop that creates `describe` / `it`.
  - Mocks: `mock.fn()` for a function handed in (a strategy's `check`, a reader, a handler, a connection source), its calls read from `fn.mock.calls` / `fn.mock.callCount()`; `mock.method(object, name, impl?)` on an object the code reads at the call (`process.stderr`, a prototype, a module's exports object); `mock.timers` for a clock; `mock.restoreAll()` in `afterEach`. No `mock.module` (the base runs none and passes no module-mocks flag).
  - Each new file is added to `tools/node-test-files.json` in the commit that creates it (a file is on the list or found by Jest, never both: `src/__tests__/unit/runner/partition.test.ts`).
  - The node:test build (`npm run test:build`, `tsconfig.node-test.json`, `types: ["node"]`) compiles each listed file with what it imports, so a helper it imports must reach no Jest global; `src/__tests__/helpers/batchEnvelope.ts`, `batchStand.ts`, `nameTable.ts` and `pinCases.ts` name Jest and are checked before use; package names resolve through `tsconfig.paths.json`.
  - A unit file runs by name: `npm test -- <file>.test.ts …` (`tools/npm-test.mjs` sends a listed `….test.ts` to the runner, every other path, a directory included, to Jest); variables as a shell prefix (`NAME=VALUE npm test -- …`): `tools/npm-test.mjs` has no `--env` and hands unknown options to Jest's parser, where `--env` is Jest's test environment; `--env NAME=VALUE` belongs to the scripts that call `tools/run-tests.mjs` directly (`test:integration`, `run-tests.mjs:107`). An existing Jest suite named beside it runs on Jest in the same command.
  - Live files: `liveSuite` / `liveCall` / `skipRunningTest` from `src/__tests__/integration/helpers/`, run one file at a time by `npm run test:integration -- <file>` (the configuration by `MCP_TEST_CONFIG`).
  - Adding files to the list obliges the concurrency measurement of `docs/development/tests/TESTING_GUIDE.md` ("The node:test run's concurrency": "when files are added to it, measure again and update the setting"), done in Task 15. No regex in tests or in input-facing code. No timeouts or retries of the package's choosing. No casts.
- Tool descriptions say what the tool does, its parameters and its answer; nothing else.
- Live runs: a realm check without logon before each run (the on-premise system's expected `401` realm; the trial's `401` and the session JWT's `exp`, read locally and never printed) — under the live scripts `src/__tests__/integration/globalSetup.ts` runs it (`helpers/realmCheck.ts`) for the configured system, and a probe runs `realmCheck` itself for each session it opens; any credential refusal stops every run. Two-user measurements: the writing user and the reading user, each through its own connection. Temporary objects in `$TMP` on premise and in the cloud probe package on the trial, deleted after; never SM12, never release a transport, never delete an object this work did not create. Probes log off at their end, also on failure.
- The legacy variant is not changed: `GetObjectDraft` is registered but not listed there.
- System ids, user names and transport numbers appear in no committed file; the controller supplies them at run time.

## Review Focus

1. A YAML list with a non-string item (`- 42`, a mapping) for any row: refused at start with the row's name, never coerced. Test in Task 3.
2. A `Tool.value` entry whose tool exists but whose value exists only on the other variant (`HandlerCreate.PROGRAM` on a cloud start): ignored on that variant and named in the start line only when it matches on neither variant. Test in Task 4.
3. A checked argument given as a non-string (a number in `package_name` through an embedder's raw `getHandlerEntries()` call): the strategy does not check it (`accessCallOf` names nothing), and the entry's own schema refuses it as today (`defineTool`'s `safeParse`, `src/lib/handlers/interfaces.ts:100`), the handler not run. Tests in Task 7 (`accessCallOf`) and Task 8 (path 5: the schema's refusal, the handler not called).
4. A tree walk where SAP answers a package whose super package is itself, or a cycle (`ZA` → `ZB` → `ZA`): refused `package_tree_unreadable` (a package met twice), never a hang. Test in Task 9.
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

### Task 0: Base on the static-types branch

**Files:** none changed by hand except a merge.

The base is merged: `origin/refactor/static-types` at `fd4a1882` into `feat/access-restrictions` (merge `fb56568d`), and the PR targets `refactor/static-types`. Its names below were re-read on that base (Code).

- [ ] **Step 1:** Before Task 3, and again whenever `refactor/static-types` moves: `git fetch origin && git merge origin/refactor/static-types` on `feat/access-restrictions` (a merge commit; no rebase of pushed commits, no force push). Resolve nothing in `docs/superpowers/` but this plan and the spec.
- [ ] **Step 2:** `npm ci --ignore-scripts` (the worktree has no `node_modules`); check `package-lock.json` for `"link": true` beyond the workspace siblings and for anything not resolved from the registry. Read in `node_modules`: adt-clients' `package.json` `exports` (the root exports `wireItself` and `AdtBatchConnection`) and interfaces-adt's `AdtReadVersion` (`active | inactive | workingArea` at 25.1.0; whether 27.2 changed it). A difference goes into this plan before Task 1.
- [ ] **Step 3:** Confirm each name this plan uses still exists, and fix this plan's references in the same commit if one moved (line numbers as of `fd4a1882`): `ParameterTable`, `Parameter` (`:62`), `ParameterRefusal` (`:32`), `readParameters` (`:385`) (`src/lib/config/authParameters.ts`); `BATCH_KEEP_RAW_PARTS_ROW` (`authParameters.ts:701`) in the three tables (`server-runtime/src/stdio/config/coreParameters.ts:358`, `server-runtime/src/http/config/httpParameters.ts:129`, `server-runtime/src/sse/config/sseParameters.ts:126`); `registryOf(toolSet, transport, served: ServedTools)` (`src/lib/toolSet.ts:153`); `ToolDefinition`, `VariantToolDefinition`, `HandlerEntry`, `defineTool`, `IHandlerGroup` (`src/lib/handlers/interfaces.ts`); `listedTool` (`src/lib/listedTool.ts:75`); `servedDefinition` (`src/lib/variantToolSet.ts:423`); `byVariant` (`src/lib/variantDefinition.ts`); the twelve builders (`src/lib/compact/compactDescriptions.ts`) and the `compact*SchemaFor` (`src/lib/compact/compactSchemas.ts`); `runCall` (`src/embeddable/BaseMcpServer.ts:1597`); `registerToolOnServer` (`src/lib/handlers/base/BaseHandlerGroup.ts:125`); `CompositeHandlersRegistry.registerTool(server, entry)` (`src/lib/handlers/registry/CompositeHandlersRegistry.ts:142`); `HandlerExporter` constructor (`:194`) and `wrapEntry` (`:304`); `ServerRefusalCode`, `ServerRefusal` (`src/lib/auth/serverRefusal.ts`, a class); `readPackageMetadata` (`src/lib/strategies/metadataReads.ts:213`); `GetObjectVersions` (`src/handlers/common/readonly/handleGetObjectVersions.ts`, registered in `ReadOnlyHandlersGroup.ts:218`); `BACKGROUND_NOT_FOR_RUN_WORDS`, `NOT_A_READ`, `isLongRead` (`src/lib/longTools.ts`); `parityConnection` (`src/__tests__/helpers/lowToCompact.ts:61`).
- [ ] **Step 4:** Run `npm run build && npm run test:check && npm test`. Expected: green, as the base.
- [ ] **Step 5:** Commit any merge; `git push` (plain).

### Task 1: Measure the draft versions (live, before Task 11)

**Files:**
- Create (temporary, deleted in Step 7): `src/__tests__/integration/measure/draftVersions.test.ts`, listed in `tools/node-test-files.json` while it exists
- Modify: this plan's "Measurement record" (end of file)

The probe is a node:test live file (a `liveSuite`) that runs only where `MCP_MEASURE_ONPREM_WRITER_ENV`, `MCP_MEASURE_ONPREM_READER_ENV` and (for the trial) `MCP_MEASURE_TRIAL_ENV` name session `.env` files; elsewhere it skips with that reason in its test name. Each user's connection is built from its own session file as `connectionAs` does in `src/__tests__/integration/debugger/DebuggerHandlers.test.ts` (line 621), after `realmCheck` for that session; every connection logs off in `after`, also after a failure. Every version read is a raw wire request, `connection.makeAdtRequest({ method: 'GET', url: '<object URI><source path>?version=<name>', headers: { Accept: '<the type\'s read Accept>' } })`, its `ETag` taken from the answer's headers: the installed `AdtReadVersion` is `active | inactive | workingArea` only, so `workspace` is sent as text in the URL, with no cast. Task 1a stays the production gate for `workspace`.

- [ ] **Step 1:** Realm checks without logon (on premise: the expected `401` realm; trial: `401` and the session JWT's `exp` in the future). Any other answer: stop.
- [ ] **Step 2:** Write the probe. For each type of spec §5.1 (program, class, interface, include, function module, CDS view, behavior definition, behavior implementation, metadata extension, service definition, table, structure; domain, data element, function group, package, table type, message class, service binding): the writer creates a temporary object in `$TMP`, activates it, then the probe records the ETag of `active`, `inactive`, `workingArea` and `workspace` for: (a) both users after activation; (b) both users after the writer's unactivated write; (c) both users after the writer activates again. For a class: also a write of each include (local types, local definitions, test classes, macros) alone, recording the main source's three ETags; for a function group: a write of a function group include alone, likewise. Every object is deleted in `after`.
- [ ] **Step 2b:** Beside the raw reads, the same three versions read through the production route — an adt-clients client built with the `wireItself` reading from the package root, `version` `active`, `inactive`, `workingArea` — for the writer and the reader at each of (a)–(c); the probe records whether each `ETag` equals the raw read's (spec §9 step 1, "the ETag through `wireItself`").
- [ ] **Step 3:** Run it: `npm run test:integration -- --env MCP_MEASURE_ONPREM_WRITER_ENV=… --env MCP_MEASURE_ONPREM_READER_ENV=… src/__tests__/integration/measure/draftVersions.test.ts 2>&1 | tee <log>`. Expected: it prints one table per type; no credential refusal.
- [ ] **Step 4:** Trial: the same for one user in the cloud probe package (`none` and `own` only), types served on cloud.
- [ ] **Step 5:** Record in the Measurement record: per type, whether the three ETags tell `none`, `own` and `other` apart (the type is offered only if so); whether `workingArea` answers as `workspace` for the reader (equal ETags in (b)); whether an include write moves the main source's `inactive` ETag; the ETag shape per type; whether the `wireItself` route's ETags equal the raw reads' (if not: stop, the finding goes to the owner before Task 11).
- [ ] **Step 6:** Decide by the spec's fallbacks, recorded beside the results:
  - `workingArea` ≠ `workspace` for the reader → Task 1a runs before Task 11.
  - An include write moves the main ETag → the draft tool reads the main source only; it does not → **stop**: the finding goes to the owner, and Task 11 does not start until the owner has decided the per-part answer's shape (no shape is decided in this plan).
  - The offered type list = the types whose ETags told the three states apart; the others go to the docs' "not offered" list.
- [ ] **Step 7:** Delete the probe file and its `tools/node-test-files.json` line; commit the record: `docs(plan): draft version measurements`.

### Task 1a (conditional): `workspace` version in interfaces-adt and adt-clients

Runs only if Task 1 found `workingArea` ≠ `workspace`. Other repositories, each its own task and PR by their rules: `interfaces-adt` adds `'workspace'` to `AdtReadVersion` (minor, on 27.x); `adt-clients` sends it verbatim (minor, on 45.x), each published before 24.0.0 is tagged — a dependency of 24.0.0. This PR then raises the ranges to the published versions (so they reach #346 with it); the lockfile is regenerated by npm (`npm install --package-lock-only --ignore-scripts`) and checked for `"link": true` and anything not resolved from the registry. No link to a sibling repository at any point.

### Task 2: Measure batch ETags and the package reader (live, before Tasks 8, 9 and 11)

**Files:**
- Create (temporary, deleted in Step 5): `src/__tests__/integration/measure/batchAndPackage.test.ts`, listed in `tools/node-test-files.json` while it exists
- Modify: the Measurement record

Same guards, connections, logoff and realm checks as Task 1.

- [ ] **Step 1:** Write the probe: (a) the three version reads of one class queued on adt-clients' public `AdtBatchConnection` (`new AdtBatchConnection(connection, { endpoint: 'communication' })`, three `makeAdtRequest` calls, then `execute()`), each queued call's resolved `IAdtWireResponse` headers recorded (no `parseBatchResponse`: it is not public); (b) `readPackageMetadata` of a package with a super package and of one at the top, recording the document element that names the super package and its value; (c) with a server batch open (`InstanceBatch`), one `readPackageMetadata` sent on the instance's real connection inside a call's turn, recording that it was sent and answered and that no batch number was taken.
- [ ] **Step 2:** Run it on premise and on the trial (`npm run test:integration -- --env …=… src/__tests__/integration/measure/batchAndPackage.test.ts`, the env names given with `--env`).
- [ ] **Step 3:** Record: whether each `$batch` part keeps `ETag`; the super-package element's path; whether (c) was sent.
- [ ] **Step 4:** Decide by the spec's fallbacks: ETag kept → `GetObjectDraft` and `HandlerGet` `part: 'draft'` get a `tools/batch-handlers.json` entry (Task 11); lost → no entry, refused `batch_not_recordable` in batch mode. (c) not sent → `lazyPackageReader` rejects while a batch is open (Task 9).
- [ ] **Step 5:** Delete the probe and its `tools/node-test-files.json` line; commit the record.

### Task 3: The five rows and their readers

**Files:**
- Create: `src/lib/access/deniedActions.ts`, `src/lib/access/accessLists.ts`, `src/lib/config/accessRestrictions.ts`
- Modify: `server-runtime/src/stdio/config/coreParameters.ts`, `server-runtime/src/http/config/httpParameters.ts`, `server-runtime/src/sse/config/sseParameters.ts` (add `...ACCESS_RESTRICTION_ROWS` beside `BATCH_KEEP_RAW_PARTS_ROW`), `src/lib/config/index.ts` (exports)
- Test (node:test, each added to `tools/node-test-files.json`): `src/__tests__/unit/access/deniedActions.test.ts`, `src/__tests__/unit/access/accessLists.test.ts`, `src/__tests__/unit/config/accessRestrictions.test.ts`

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
  - `deniedActions.test.ts`, every case as `parseDeniedEntry(<text>, 'deny-actions')`: `'DeleteClass'` → `{ tool: 'DeleteClass', toolIsPrefix: false, value: undefined }`; `'HandlerDelete.CLASS'` → value `CLASS`; `'HandlerActivate.CLAS/OC'` → value `CLAS/OC`; `'HandlerDebugSession.get*'` → value `get`, `valueIsPrefix: true`; `'Delete*'` → tool `Delete`, `toolIsPrefix: true`; refused, each with `ParameterRefusal` naming the row: `''`, `'.CLASS'`, `'Handler-Get'`, `'HandlerGet.CL ASS'`, `'Del*ete'`, `'*'`, `'*.CLASS'`, `'A.B.C'`, `'HandlerGet.'`.
  - `accessLists.test.ts`: packages `ZFOO` exact, `$TMP` exact, `Z*` prefix, `ZFOO/**` subtree name `ZFOO`, `/ABC/ZFOO/**` subtree name `/ABC/ZFOO`, `zfoo` → name `ZFOO`; refused `Z*O`, `ZFOO**`, `Z*/**`, `/**`, `ZF OO`; requests `A4HK900123` exact, `A4HK*` prefix, refused `A4HK/1`, `A*K`; tables `MARA` exact, `ZT*` prefix, refused `ZT/**`.
  - `accessRestrictions.test.ts`, for each row in each of CLI (`--deny-actions=a,b`), env and YAML (a sequence and one string): entries trimmed; `a,,b` and `a,` refused naming the form; `MCP_DENY_ACTIONS=` and `restrictions: { deny-actions: [] }` absent (`deniedActions: []`); a YAML item `42` or a mapping refused naming the row; `--denied-tables=X --allowed-tables=Y` refused (the words name both rows); CLI beats env beats YAML.
  - Matrices, in `accessRestrictions.test.ts`, each case through each of the three readers (CLI `--x=…`, env, YAML) and for each of the five rows: every malformed form of that row's grammar (above) stops with `ParameterRefusal` naming the form; the absent forms (no form at all; env `''`; YAML key absent; YAML `[]`) give the row absent; for denied actions, the code entries `HandlerActivate.CLAS/OC`, `HandlerGet.DDLS/DF` and `HandlerActivate.ENHO/XHH` read as one entry each in all three forms (YAML as the plain scalar `- HandlerActivate.CLAS/OC`).
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/deniedActions.test.ts src/__tests__/unit/access/accessLists.test.ts src/__tests__/unit/config/accessRestrictions.test.ts`. Expected: FAIL (the node:test build cannot resolve the missing modules).
- [ ] **Step 3:** Implement the parsers in plain code (character checks, no regex); the rows; the tables list `ACCESS_RESTRICTION_ROWS` after `BATCH_KEEP_RAW_PARTS_ROW`. The both-table-lists refusal is raised by `readAccessRestrictions`.
- [ ] **Step 4:** Run the three files again, then the parameter-table tests: `npm test -- src/__tests__/unit/config server-runtime/src/stdio/__tests__/config/coreParameters.test.ts server-runtime/src/http/__tests__/config/httpParameters.test.ts server-runtime/src/sse/__tests__/config/sseParameters.test.ts src/__tests__/unit/config/enableDataTools.test.ts server-runtime/src/stdio/__tests__/config/deferredLogonParameters.test.ts` (the Jest suites and the named node:test ones). Expected: PASS; the parameter-table help/template tests updated only by the new rows' lines (review the diff).
- [ ] **Step 5:** Commit `feat(access): the five restriction rows and their grammars`.

### Task 4: Description and schema builders take member sets

**Files:**
- Modify: `src/lib/compact/compactDescriptions.ts` (twelve builders), `src/lib/compact/compactSchemas.ts` (`compactActivateSchemaFor`, `compactGetSchemaFor`, `compactGetDataSchema` → `compactGetDataSchemaFor`), `src/lib/compact/batch/handleHandlerBatch.ts`, `src/lib/compact/debug/handleHandlerDebugBatch.ts`, `src/lib/compact/longSession/handleHandlerSession.ts`, `src/lib/compact/debug/handleHandlerDebugSession.ts`, `handleHandlerDebugStep.ts`, `handleHandlerDebugBreakpoints.ts`, `handleHandlerDebugMaintain.ts`, `compact-readonly-entries/src/handlers/handleHandlerGetData.ts`
- Create: `src/lib/access/narrowing.ts`
- Test (node:test, listed): `src/__tests__/unit/access/builders.test.ts`, `src/__tests__/unit/access/rebuiltDescriptions.test.ts`, `src/__tests__/unit/toolSet/fixtureBytes.test.ts`

**Interfaces:**
- Produces:
  - each of the twelve builders gains a trailing `members` parameter defaulting to today's (`compactCreateDescription(variant, members = COMPACT_CREATE[variant])`, likewise for the other eleven);
  - the code-naming texts take the remaining codes explicitly: `compactActivateDescription(variant, members = COMPACT_ACTIVATE[variant], codes = ACTIVATION_CODES[variant])` and `activationParentDescription(variant, codes = ACTIVATION_CODES[variant])` (`src/lib/adtTypeCode.ts`) list parented codes from `codes`; the `e.g.` examples (`"CLAS/OC"` in the description, `CLAS/OC, PROG/P` in `object_adt_type`'s) keep only the examples still in `codes`, and when none is left name the first two of `codes` in table order; `NARROWINGS` passes the remaining codes to both;
  - `compactActivateSchemaFor(members, variant, codes?: readonly string[])` and `compactGetSchemaFor(members, mainPrograms, codes?: readonly string[])`: with `codes` given, `objects[].type` / `object_adt_type` are `z.enum(codes)`; without, free strings as today;
  - eight builders, all in lib: `handlerBatchDefinition(actions)`, `handlerDebugBatchDefinition(actions)`, `handlerSessionDefinition(actions)`, `handlerDebugSessionDefinition(operations)`, `handlerDebugStepDefinition(operations)`, `handlerDebugBreakpointsDefinition(operations)`, `handlerDebugMaintainDefinition(operations)` in their modules under `src/lib/compact/`, and `handlerGetDataDefinition(sql: boolean)` in `src/lib/compact/compactSchemas.ts` beside today's `compactGetDataSchema` (its description moved there from `compact-readonly-entries/src/handlers/handleHandlerGetData.ts`), exported through `src/lib/compact/index.ts` (`@mcp-abap-adt/lib/compact-shared`) and imported by the compact package; each `→ { description: string; inputSchema: z.ZodObject }`; each `TOOL_DEFINITION` is built from it with every value;
  - `interface Narrowing { readonly tool: string; values(variant: ProjectionVariant): readonly string[]; codes?(variant: ProjectionVariant): readonly string[]; definition(variant: ProjectionVariant, values: readonly string[], codes: readonly string[] | undefined): VariantToolDefinition }`; `NARROWINGS: ReadonlyMap<string, Narrowing>` in `src/lib/access/narrowing.ts` (lib imports no compact package) covering the twelve `object_type` / `target_type` tools, the seven `action` / `operation` tools and `HandlerGetData` (values `['sql']`); codes for `HandlerActivate` (`ACTIVATION_CODES[variant]`) and `HandlerGet` (`TABLE_CODES[variant]`).
- Also: `src/__tests__/helpers/fixtureRenderings.ts` — the rendering each fixture's `WRITE_*` mode writes (`listed-schemas.json`, `variant-surface.json`, the transport surfaces), moved out of those tests (Jest suites, otherwise unchanged) so they and the node:test byte test share it; it reaches no Jest global, since the node:test build compiles it.

- [ ] **Step 0 (on the base, before any change of this task):** write `src/__tests__/unit/access/rebuiltDescriptions.test.ts`: for each of the eight tools whose definitions Task 4 rebuilds (`HandlerBatch`, `HandlerDebugBatch`, `HandlerSession`, `HandlerDebugSession`, `HandlerDebugStep`, `HandlerDebugBreakpoints`, `HandlerDebugMaintain`, `HandlerGetData`), the tool's description and every property's description with all values present, as exact string literals copied from the base code (no fixture stores them: `variant-surface.json` holds descriptions only for the twelve projected tools). Run it: PASS on the base. Commit `test(compact): the eight fixed-enum descriptions pinned`. After the refactor it must pass unchanged (Step 4).
- [ ] **Step 1: Write the failing tests.**
  - `fixtureBytes.test.ts` (`src/__tests__/unit/toolSet/`): for each fixture, `readFileSync(file, 'utf8')` equals the rendering of the current registry byte for byte (the committed files are the pre-change baseline; Tasks 4–10 must leave them equal; Task 12 commits the only two additions).
  - `builders.test.ts`, parameterized over every entry of `NARROWINGS` × both variants × each single value removed: the value absent from the enum; absent from the description and from every property description of the definition; absent from `members` where the tool has search members; every other value still present.
  - `HandlerBatch` with `end` removed: enum `['begin', 'answers']`.
  - `HandlerActivate` codes without `CLAS/OC`: `objects[].type` and `object_adt_type` enums lack `CLAS/OC`, no description names it, the examples name codes still in the enum; `object_type` still lists `CLASS` and `BEHAVIOR_IMPLEMENTATION`; parsing `{ object_adt_type: 'clas/oc', object_name: 'Z' }` fails while any code is narrowed.
  - `HandlerGet` codes without `CLAS/OC`: `object_adt_type` enum lacks it; `part` keeps every value.
  - `handlerGetDataDefinition(false)`: no `sql_query` property, no `sql_query` in any description.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/builders.test.ts src/__tests__/unit/toolSet/fixtureBytes.test.ts`. Expected: `builders` FAIL; `fixtureBytes` PASS (it guards the refactor). The node:test build compiles every listed file at once, so while `builders.test.ts` cannot compile, run `fixtureBytes.test.ts` before adding `builders.test.ts` to the list, and record its PASS.
- [ ] **Step 3:** Implement; the descriptions are assembled from per-value sentences so a removed value leaves no trace; today's text is the output for all values (the byte-identity test guards it). **Every text (the owner's decision):** each compact property description that names a member (51 of the 241 `.describe()` texts in `src/lib/compact/compactSchemas.ts`, e.g. `class_name`'s "(CLASS, BEHAVIOR_IMPLEMENTATION)", `GET_BACKGROUND`'s list of read types) and each fixed sentence of the description builders that names one (HandlerGet's parts per type, its TRANSPORT and UNIT_TEST / CDS_UNIT_TEST sentences and the `urls (SERVICE_BINDING)` / `contents (PACKAGE)` mentions; Update's and Delete's local-include and lock-handle sentences; the SERVICE_BINDING sentences of Lock, Unlock, Validate and Update; CheckRun's `source_code` sentence; Activate's FUNCTION_MODULE sentence) is rendered from the members left after the deny list. A member is left out of a text only when the deny list removed it: the removed set is the variant's full set minus the members given, so with nothing denied every text is today's, byte for byte, on each variant (`fixtureBytes.test.ts`, `rebuiltDescriptions.test.ts`).
- [ ] **Step 4:** Run both tests and `rebuiltDescriptions.test.ts`, then `npm test -- src/__tests__/unit/toolSet src/__tests__/unit/toolSet/dataTools.test.ts` (the directory's Jest suites and its node:test file). Expected: PASS, every fixture byte-identical, the eight descriptions equal to their base literals.
- [ ] **Step 5:** Commit `refactor(compact): definitions built from a member set`.

### Task 5: `withoutDenied` at registration

**Files:**
- Create: `src/lib/access/withoutDenied.ts`
- Modify: `src/lib/toolSet.ts` (`registryOf`)
- Test (node:test, listed): `src/__tests__/unit/access/withoutDenied.test.ts`

**Interfaces:**
- Consumes: `DeniedActions` (Task 3), `NARROWINGS` (Task 4).
- Produces:
  - `withoutDenied` keeps each group's class identity, with two overloads: `withoutDenied(groups: readonly BaseHandlerGroup[], denied: DeniedActions): BaseHandlerGroup[]` and `withoutDenied(groups: readonly IHandlerGroup[], denied: DeniedActions): IHandlerGroup[]`. A `BaseHandlerGroup` becomes a `NarrowedHandlerGroup` (`src/lib/access/NarrowedHandlerGroup.ts`) `extends BaseHandlerGroup`: constructed with the inner group's context through a new public `BaseHandlerGroup.groupContext(): HandlerContext`, `groupName` = the inner's `getName()`, `getHandlers()` = the inner's, narrowed; everything else (`statedSystemType`, `registerHandlers`, `registerHandlersOnCall`, `registerOneTool`, `registerToolOnServer`) inherited unchanged, so `instanceof BaseHandlerGroup` in `CompositeHandlersRegistry` (`registerTool`, `statedBy`), the exporter's `BaseHandlerGroup[]` and `registerAllToolsOnCall` behave as before. A group that is not a `BaseHandlerGroup` (an embedder's own) is returned as it is: its tools are its own. `denied = []` returns the groups unchanged (same objects);
  - a narrowed entry: `toolDefinition` (own and `variants`) the narrowed one; `call(context, args)` `safeParse`s `args` with the narrowed schema of the definition's own (on-premise) statement — refusing with `invalidArgumentsWords` — and calls the original `call` with the **parsed** output, so a property the narrowed schema dropped (`sql_query`) never reaches the original schema;
  - `unmatchedEntries(groups: readonly IHandlerGroup[], denied: DeniedActions): readonly string[]` — the `text` of each entry matching no tool, value or code on either variant;
  - `registryOf(toolSet: ToolSet, transport: ServedTransport, served: ServedTools, denied: DeniedActions = []): CompositeHandlersRegistry` (the base's three parameters, `denied` added last).
- Matching: `Tool` / `Prefix*` against tool names; `Tool.value` / `Tool.prefix*` against `values(variant)` and, on HandlerActivate and HandlerGet, `codes(variant)`; exact, case included. A compact tool is left out only when every value of every form is denied (spec §3.1): HandlerActivate needs all names and all codes; HandlerGet and HandlerGetData only by a `Tool` entry.

- [ ] **Step 1: Write the failing tests** (`withoutDenied.test.ts`, on the compact and full sets' groups built as `registryOf` builds them):
  - `DeleteClass` denied: absent from `getHandlers()`; `Delete*`: every `Delete…` tool absent, `DeletionCheck…` none of the full set's absent unless it starts with `Delete`;
  - `HandlerActivate.CLASS`: `CLASS` gone from `object_type`; `BEHAVIOR_IMPLEMENTATION` listed; `objects[].type` and `object_adt_type` still free strings;
  - `HandlerActivate.CLAS/OC`: `CLAS/OC` refused by `entry.call` in `objects[].type` and `object_adt_type` (as `CLAS/OC`, `clas/oc` and `class`); `CLASS` and `BEHAVIOR_IMPLEMENTATION` still in `object_type`; the same for `HandlerGet.CLAS/OC` and `object_adt_type`;
  - `HandlerActivate.CLAS*` removes `CLASS` and `CLAS/OC`;
  - HandlerActivate with every name denied: listed, a code callable; every code denied: listed, a name callable; both: absent;
  - `HandlerProfileRun` with every value denied: absent;
  - `HandlerGetData.sql`: `sql_query` absent from the listed schema; `entry.call(ctx, { sql_query: 'SELECT carrid FROM scarr' })` sends no request (recording connection: zero requests, the call refused for a missing table); `entry.call(ctx, { object_name: 'MARA', sql_query: 'SELECT carrid FROM scarr' })` sends exactly the table read's request (body `SELECT * FROM MARA`), never the given SQL;
  - no stated variant: `listedTool(narrowedDefinition, undefined)` emits `_meta` search text from the narrowed definition's own members — `listedTool` (`src/lib/listedTool.ts`) passes `definition.members` (a new optional `members` on `ToolDefinition`, set by `byVariant` to the on-premise statement's members and by the narrowing to the remaining ones) to `searchMeta`; with `HandlerDelete.CLASS` denied the emitted keywords and semantic text name no `CLASS`; with nothing denied the emitted `_meta` and every fixture byte equal today's;
  - identity: every group `withoutDenied` returns from `BaseHandlerGroup`s is `instanceof BaseHandlerGroup`, `getName()` and `statedSystemType()` equal the inner's;
  - `HandlerCreate.PROGRAM`: not in `unmatchedEntries` (matches on premise); `HandlerCreate.NOPE`, `DebugStepX`, `GetPackage.CLASS`: in `unmatchedEntries`;
  - `denied = []`: `withoutDenied(groups, [])` returns the same group objects.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/withoutDenied.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; then `npm test -- src/__tests__/unit/toolSet src/__tests__/unit/toolSet/dataTools.test.ts src/__tests__/unit/toolSet/fixtureBytes.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): denied actions removed at registration`.

### Task 6: `HandlerExporter` takes the denied actions

**Files:**
- Modify: `src/lib/handlers/HandlerExporter.ts` (`HandlerExporterOptions`, constructor)
- Test (node:test, listed): `src/__tests__/unit/access/exporterDenied.test.ts`

**Interfaces:**
- Consumes: `withoutDenied`, `DeniedActions`.
- Produces: `HandlerExporterOptions.deniedActions?: DeniedActions | undefined`; the constructor applies `withoutDenied` (the `BaseHandlerGroup[]` overload) once, so `handlerGroups` stays `BaseHandlerGroup[]` and `getHandlerEntries()`, `registerOnServer()` (`registerAllToolsOnCall`) and `createRegistry()` all start from the narrowed groups.

- [ ] **Step 1: Write the failing test:** an exporter with `deniedActions: [parseDeniedEntry('GetPackage', 'test'), parseDeniedEntry('GetClass.CLASS', 'test')]`: `GetPackage` absent from `getHandlerEntries()`, from `getToolNames()` and from an `McpServer` it `registerOnServer`s on (the SDK's `tools/list`); every other exported definition deep-equal to one from an exporter without `deniedActions`.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/exporterDenied.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): HandlerExporter takes deniedActions`.

### Task 7: The strategy interface, the checked arguments and the simple strategy

**Files:**
- Create: `src/lib/access/accessChecks.ts`, `src/lib/access/checkedArguments.ts`, `src/lib/access/listedAccessChecks.ts`
- Modify: `src/lib/auth/serverRefusal.ts` (four codes and their words), `src/lib/toolSet.ts` (`readOnlyToolNames`)
- Test (node:test, listed): `src/__tests__/unit/access/checkedArguments.test.ts`, `src/__tests__/unit/access/listedAccessChecks.test.ts`

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
  - `readOnlyToolNames(): ReadonlySet<string>` — the tool names of the core-ro and compact-ro sets, with the data tools served (`{ dataTools: true }`). **The owner's decision:** lib cannot build the compact read-only half (`compactReadOnlyToolSetOf(half)` takes it from `@mcp-abap-adt/compact-readonly-entries`, which lib does not import), so `src/lib/access/compactReadOnlyTools.ts` holds the constant list of the compact read-only tool names (the half's and the data tool's, and the compact-ro set's own groups), pinned by a test against `compactReadOnlyEntries()` + `compactDataEntries()` and the compact-ro set's groups: a new read tool fails the test until it is listed. The core-ro names come from `fullReadOnlyToolSet`, which lib holds.
  - `refusalOf(verdict: AccessVerdict & { allowed: false }): ServerRefusal` with the Global Constraints' words
  - `listedAccessChecks(lists: AccessLists): IAccessChecks` — throws `ParameterRefusal` "allowed-packages: a subtree entry needs the package tree strategy: <entry>" when given a subtree entry

- [ ] **Step 1: Write the failing tests.**
  - `checkedArguments.test.ts`: over the full and compact sets as registered (data tools served), the tools with package or request arguments equal spec Appendix B exactly (Appendix B was listed at 23.1.0: before writing the expectation, list the base's sets and bring any difference to the owner; the test pins the base's list) (88 full: 25 package, 86 request; compact 6: `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerLock`, `HandlerTransportMoveObjects`, `HandlerTransportSortAndCompress`); `GetPackage`, `GetTransport`, `HandlerGet`, `HandlerValidate` not checked; `package_type`, `transport_layer`, `transport_type`, `task_type`, `include_subpackages`, `include_tasks`, `packages`, `package_names` never checked; `isPackageCreate` true for exactly `CreatePackage` and `HandlerCreate`+`PACKAGE` (false for `CheckPackage`, `HandlerValidate`+`PACKAGE`, `HandlerCreate`+`CLASS`); `accessCallOf` with `package_name: 42` (Review Focus 3) and with `'  '` names nothing.
  - `listedAccessChecks.test.ts`: allowed packages `ZFOO`, `Z*`: `ZFOO` and `ZBAR` allowed, `YFOO` → `{ allowed: false, code: 'package_not_allowed', argument: 'package_name', value: 'YFOO' }`; requests `A4HK*`: `A4HK900123` allowed, `B4HK1` refused `request_not_allowed`; tables denied `MARA`: `MARA` refused `table_not_allowed`, `MARC` allowed; allowed `ZT*`: `MARA` refused; both package and request lists: each name against its own; the reader is never called (a reader whose `superPackageOf` is a `mock.fn()` that throws, `callCount()` 0); a subtree entry throws at construction; `refusalOf` words exactly as Global Constraints.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/checkedArguments.test.ts src/__tests__/unit/access/listedAccessChecks.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): the access-check strategy and the simple strategy`.

### Task 8: The calls are checked on every registered path

**Files:**
- Modify: `src/embeddable/BaseMcpServer.ts` (options `accessChecks?: IAccessChecks | undefined`; `runCall`, line 1597), `src/lib/handlers/base/BaseHandlerGroup.ts` (`registerToolOnServer`, and the options path it takes the strategy from), `src/lib/handlers/HandlerExporter.ts` (`accessChecks?`, `wrapEntry`), `server-runtime/src/stdio/StdioServer.ts`, `server-runtime/src/http/StreamableHttpServer.ts`, `server-runtime/src/sse/SseServer.ts` (pass `accessChecks` through)
- Create: `src/lib/access/packageReader.ts`
- Test (node:test, listed): `src/__tests__/unit/access/accessWrappers.test.ts`

**Interfaces:**
- Consumes: Task 7's types; `checkedArgumentsOf` computed once per entry at registration with `readOnlyToolNames()`.
- Produces (`IAbapConnection` from `@mcp-abap-adt/interfaces-adt-connection`, as `src/lib/batch/tools.ts:22` imports it): `lazyPackageReader(take: () => Promise<IAbapConnection>, signal: AbortSignal, batchOpen: () => boolean): IPackageReader` — `take` is memoized by the wrapper and is the same acquisition the wrapper uses after an allowed verdict, including the scope a call's first send needs: on path 1 `systemBeforeTool` and `declareSystemKind(connection, this.systemType)` run inside `take`; on paths 2/3 the read runs inside the `inStatedScope` the call gets; on path 5 inside the exporter's `inStatedScope`; each `superPackageOf` is one `readPackageMetadata` on that connection, the super package read from the element Task 2 recorded; rejects while `batchOpen()` only if Task 2 (c) found the read could not be sent.
- Placement (spec §3.2): path 1 in `runCall` after the SDK's parse and before `getConnection` — before the background decision too, so a refused long read (`GetTableContents`, `HandlerGetData`) starts no background run — the connection-and-turn steps (`getConnection`, `enterMainFlow`, the stale-connection refresh) moved into the memoized `take`; paths 2 and 3 in `registerToolOnServer` beside the argument refusals before `callContext()`, `take` asking `callContext()` once; path 5 in `wrapEntry` before the original handler, `take` answering the connection the embedder gave; path 4 not called.

- [ ] **Step 1: Write the failing tests** (`accessWrappers.test.ts`, a recording connection (`src/__tests__/helpers/recordingConnection.ts`) and a connection source that is a `mock.fn()`, counted by `callCount()`):
  - path 1, simple strategy, refused `CreateClass` with `package_name: 'YFOO'`: the answer `isError` with `error: 'package_not_allowed'` and the words; no request recorded; the connection source never asked;
  - path 1, allowed: the handler's requests recorded as without a strategy;
  - path 1, a strategy reading through the reader: the reader's read and the handler's requests on the same connection object; the connection source asked once;
  - path 1, no strategy: no `AccessCall` built — `mock.method` on the exports object of `src/lib/access/checkedArguments.ts` (`import * as checked from …`), `accessCallOf`'s `callCount()` 0. Inference: the compiled CommonJS callers read the export at each call, so the replacement is seen; prove it load-bearing by building one `AccessCall` deliberately and watching the case fail;
  - batch mode open, refused call: no batch number taken (the next recorded call takes number 1);
  - path 2 (`registerAllTools` on an `McpServer`) and path 3 (`registerTool(server, entry)`): the same refused case answers the same refusal and `callContext` is never asked;
  - path 3 with a group wrapped by `withoutDenied` denying `DeleteClass`: `registerTool(server, deleteClassEntry)` throws `REGISTER_TOOL_UNHELD_WORDS('DeleteClass')`;
  - path 5 (`getHandlerEntries()` with `accessChecks`): the refused call never reaches the original handler; `CreateClass` with `package_name: 42` is refused by the entry's own schema, as without a strategy, and the handler is not called;
  - background: a long read refused (`GetTableContents` with denied tables `MARA`, `background` absent and `true`) answers the refusal, starts no run and lists none;
  - scope: an `EmbeddableMcpServer` given a plain injected connection and `systemType: 'cloud'` only, the tree strategy reading `ZCHILD`: at the reader's first request `variantOf(connection)` is `'cloud'` and the request is the cloud client's;
  - refusal matrix, each through path 1 with a recording connection and a handler that is a `mock.fn()` — `CreateClass` `{ class_name: 'ZC', package_name: 'YFOO', transport_request: 'A4HK900123' }` with allowed packages `Z*` → `package_not_allowed`; the same with allowed requests `B4HK*` and `package_name: 'ZFOO'` → `request_not_allowed`; `GetTableContents` `{ table_name: 'MARA' }` with denied tables `MARA` → `table_not_allowed`; `CreatePackage` `{ package_name: 'ZNEW', super_package: 'YROOT' }` with `ZFOO/**` and a reader that rejects → `package_tree_unreadable`; for each: the words exactly as Global Constraints, the handler's `callCount()` 0, zero requests but the tree reader's own.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/accessWrappers.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run; then `npm test` (full unit suite). Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): every registered path checks the call before its connection`.

### Task 9: The package-tree strategy

**Files:**
- Create: `src/lib/access/packageTreeAccessChecks.ts`, `src/lib/access/index.ts`
- Modify: `src/index.ts`, `src/lib/config/index.ts` (the exports below)
- Test (node:test, listed): `src/__tests__/unit/access/packageTreeAccessChecks.test.ts`, `src/__tests__/unit/access/publicExports.test.ts` (each name imported from `@mcp-abap-adt/lib`, `@mcp-abap-adt/lib/config`, `@mcp-abap-adt/lib/tool-set` as `tsconfig.paths.json` resolves them for the node:test build, `unmatchedEntries` included — the server-runtime launchers import them from `@mcp-abap-adt/lib` only; `accessStartLine` is added to this test in Task 10, which creates it, since the node:test build compiles every listed file together and an import of a symbol not yet written fails the whole run)

**Interfaces:**
- Consumes: Task 7's types, `IPackageReader`.
- Produces: the public access API through the published entry points — `src/lib/access/index.ts` re-exported from `src/index.ts` (`@mcp-abap-adt/lib`): `IAccessChecks`, `IPackageReader`, `AccessCall`, `AccessVerdict`, `AccessRefusalCode`, `listedAccessChecks`, `packageTreeAccessChecks`, `accessChecksFor`, `withoutDenied`, `unmatchedEntries`, `accessStartLine` (Task 10 adds it to this index and to `publicExports.test.ts`), `parseDeniedEntry`, `DeniedActions`, `AccessLists`, `AccessRestrictions`; `ACCESS_RESTRICTION_ROWS` and `readAccessRestrictions` from `src/lib/config/index.ts` (`@mcp-abap-adt/lib/config`); `registryOf` with `denied` from `@mcp-abap-adt/lib/tool-set` — checked by `publicExports.test.ts`, importing each name from its entry point (`tools/check-exports.js` only prints `@mcp-abap-adt/connection`'s keys and checks nothing here); `packageTreeAccessChecks(lists: AccessLists): IAccessChecks`; `accessChecksFor(lists: AccessLists): IAccessChecks | undefined` — `undefined` when no call-time list is given; `packageTreeAccessChecks` when an allowed-packages entry is a subtree; else `listedAccessChecks`.

- [ ] **Step 1: Write the failing tests** (a reader whose `superPackageOf` is a `mock.fn()` answering from a map, its reads counted by `callCount()`):
  - exact `ZBAR` and prefix `Z*` matched with no read (reader calls `0`);
  - `ZFOO/**`, package `ZFOO`: allowed, no read; `ZCHILD` (parent `ZFOO`): allowed, one read; `ZGRAND` (→ `ZCHILD` → `ZFOO`): allowed, two reads; `YTOP` (parent `undefined`): `package_not_allowed`;
  - a package create (`isPackageCreate`) `package_name: 'ZNEW'`, `super_package: 'ZFOO'`: allowed, `ZNEW` never read;
  - `CheckPackage` `package_name: 'ZOUTSIDE'` (parent `YROOT`), `super_package: 'ZFOO'`: `package_not_allowed` for `package_name`; `ZOUTSIDE` read;
  - reader rejects: `package_tree_unreadable`, `argument`, `value`; a cycle (`ZA` → `ZB` → `ZA`) and a self-parent (`ZA` → `ZA`, Review Focus 4): `package_tree_unreadable`;
  - `accessChecksFor`: `{}` → `undefined`; `{ allowedPackages: [Z*] }` → the simple one (a subtree entry absent); with `ZFOO/**` → the tree one; `{ deniedTables: [...] }` → a strategy.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/packageTreeAccessChecks.test.ts src/__tests__/unit/access/publicExports.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement: exact and prefix entries first; then, for each subtree entry, walk with a seen-set.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): the package-tree strategy`.

### Task 10: Launchers: rows to strategy, denied actions and the start line

**Files:**
- Create: `src/lib/access/startLine.ts`
- Modify: `server-runtime/src/stdio/launcher.ts`, `server-runtime/src/http/launcher.ts`, `server-runtime/src/sse/launcher.ts`
- Test (node:test, listed): `src/__tests__/unit/access/startLine.test.ts`; `server-runtime/src/stdio/__tests__/accessRestrictions.test.ts`, `server-runtime/src/http/__tests__/accessRestrictions.test.ts`, `server-runtime/src/sse/__tests__/accessRestrictions.test.ts` (each launcher started in-process as `src/__tests__/unit/launchers/dataToolsAtStart.test.ts` does, `deps.stderr` a `mock.fn()`); and the existing (Jest) the parameter-table tests `server-runtime/src/stdio/__tests__/config/coreParameters.test.ts`, `server-runtime/src/http/__tests__/config/httpParameters.test.ts`, `server-runtime/src/sse/__tests__/config/sseParameters.test.ts` (the new rows in help and template)

**Interfaces:**
- Consumes: `readAccessRestrictions`, `registryOf(toolSet, transport, served, denied)`, `unmatchedEntries`, `accessChecksFor`.
- Produces: `accessStartLine(restrictions: AccessRestrictions, unmatched: readonly string[], tree: boolean): string`, exported from `src/lib/access/index.ts` (`@mcp-abap-adt/lib`); `publicExports.test.ts` (Task 9) gains its import from `@mcp-abap-adt/lib` in this task.

- [ ] **Step 1: Write the failing tests:** `accessStartLine` with nothing → `[MCP] Access restrictions: none`; with four deny entries of which `DebugStep` unmatched, three packages with a subtree, two requests → `[MCP] Access restrictions: deny-actions 4 (matching nothing here: DebugStep), allowed-packages 3 (package tree read), allowed-requests 2`; denied tables → clause `denied-tables N`; allowed tables → `allowed-tables N`; under the simple strategy the packages clause carries no strategy words (`allowed-packages 2`); `(package tree read)` appears only for the tree strategy. Launcher tests (stdio, http, sse): the line written once through `deps.stderr` (its `mock.calls`); an http pool's second instance writes none; `--deny-actions=DeleteClass` leaves `DeleteClass` out of `tools/list`; `--allowed-packages=Z*` gives every instance the same strategy object; a malformed entry ends the start `1` with `[MCP] <words>`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement; read the rows with the table, pass `denied` to `registryOf` and the strategy through the server options.
- [ ] **Step 4:** `npm test -- src/__tests__/unit/access/startLine.test.ts server-runtime/src/stdio/__tests__/accessRestrictions.test.ts server-runtime/src/http/__tests__/accessRestrictions.test.ts server-runtime/src/sse/__tests__/accessRestrictions.test.ts server-runtime/src/stdio/__tests__ server-runtime/src/http/__tests__ server-runtime/src/sse/__tests__` (the named node:test files and the three directories' Jest suites, the parameter-table ones among them), then every file of `src/__tests__/unit/access/` by name. Expected: PASS.
- [ ] **Step 5:** Commit `feat(access): the launchers apply the restrictions and name them at start`.

### Task 11: The draft tool

**Files:**
- Create: `src/lib/draft/draftOf.ts`, `src/lib/draft/readDraftEtags.ts`, `src/handlers/common/readonly/handleGetObjectDraft.ts`
- Modify: `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts` (beside `GetObjectVersions`, line 218), `src/lib/compact/compactSchemas.ts` (`READ_PARTS` gains `'draft'`, offered for `HANDLER_GET_DRAFT_TYPES[variant]` only; `HandlerGet`'s `object_type` enum is not widened), `compact-readonly-entries/src/handlers/handleHandlerGet.ts` and `compactPartRoutes.ts` (the `draft` route), `src/lib/compact/compactDescriptions.ts` (`compactGetDescription` names the part), `tools/batch-handlers.json` (per Task 2), `src/lib/variantToolSet.ts` (`GetObjectDraft` added to `TOOLS_WITHOUT_NEED`, where `GetObjectVersions` is; its definition states `available_in: ['onprem', 'cloud']`, which keeps it unlisted on legacy, as `GetObjectVersions` — Measured in the static-types worktree), `src/lib/longTools.ts` (`NOT_A_READ.HandlerGet` gains `{ argument: 'part', equals: ['DRAFT'] }`: the draft part is an ordinary call on the instance's connection), `src/lib/handlers/read.ts` (exports `handleGetObjectDraft`) and `src/lib/handlers/readDefinitions.ts` (`GetObjectDraft`'s definition, for the compact route), `tools/tool-search.json` (`GetObjectDraft`'s search texts), `src/__tests__/helpers/batchEntryCases.ts` (the draft cases, only if Task 2 found the ETag kept)
- Test (node:test, listed): `src/__tests__/unit/draft/draftOf.test.ts`, `src/__tests__/unit/draft/getObjectDraft.test.ts`

**Interfaces:**
- Produces:
  - `type DraftState = 'none' | 'own' | 'other' | 'undetermined'`
  - `interface DraftEtags { readonly active: string | null; readonly inactive: string | null; readonly workspace: string | null }`
  - `interface DraftAnswer { readonly draft: DraftState; readonly changed_at: string | null; readonly age_seconds: number | null; readonly etags: DraftEtags }`
  - `draftOf(etags: DraftEtags, now: Date): DraftAnswer` — `undetermined` when any ETag is `null` or not led by 14 ASCII digits; `none` when `active` = `inactive`; `own` when `inactive` ≠ `active` and `workspace` = `inactive`; `other` when `workspace` = `active` ≠ `inactive`; else `undetermined`; `changed_at` = the `inactive` ETag's 14 digits as `YYYY-MM-DDTHH:MM:SSZ`, `age_seconds` = floor((`now` − `changed_at`) in seconds), whole seconds; both `null` for `none` and `undetermined`
  - `DRAFT_TYPES: { readonly [V in ProjectionVariant]: readonly DraftObjectType[] }` in `src/lib/draft/draftTypes.ts` — the types Task 1 admitted, per variant, in the draft tool's own domain: `type DraftObjectType` is a string-literal union of those type names, independent of `CompactObjectType` (a measured type such as `MESSAGE_CLASS` that `CompactObjectType` lacks belongs here)
  - `HANDLER_GET_DRAFT_TYPES: { readonly [V in ProjectionVariant]: readonly (DraftObjectType & ReadMember)[] }` in the same module — the members of `DRAFT_TYPES[variant]` that are also in `COMPACT_READ[variant]` (`HandlerGet`'s `object_type` enum), computed by a typed filter, no cast; `HandlerGet` `part: 'draft'` is offered for these only; a draft type outside them is served by `GetObjectDraft` alone
  - `interface DraftObject { readonly type: DraftObjectType; readonly name: string; readonly functionGroup: string | undefined }` in `src/lib/draft/readDraftEtags.ts` (`name` upper-cased; `functionGroup` only for a function module)
  - `readDraftEtags(connection: IAbapConnection, object: DraftObject, signal: AbortSignal): Promise<DraftEtags>` — three reads (`active`, `inactive`, the working version Task 1 settled), each through a client built with `wireItself` from the root `@mcp-abap-adt/adt-clients`; a failed read rejects with that read's failure as the tool's reads report it
  - `GetObjectDraft` arguments: `object_type` (`z.enum(DRAFT_TYPES[variant])`, per variant via `byVariant`), `object_name`, `function_group_name` optional; no `detail`
- Description (functional): reads the active, inactive and working versions of the named object and answers whether it has an unactivated change and whose (none, the caller's, another user's), with that change's time and age by the server's clock and the three ETags; another user's lock is not visible to it.

- [ ] **Step 1: Write the failing tests.**
  - `draftOf.test.ts` (ETag shape from the spec, `20261104101500` + `0011` / `0001`): `active = inactive = workspace = '202611041015000011'` → `none`, `changed_at: null`, `age_seconds: null`; `active '…0011'`, `inactive = workspace = '202611041030000001'` → `own`, `changed_at: '2026-11-04T10:30:00Z'`, `age_seconds` against a fixed `now` of `2026-11-04T10:31:00Z` → `60`; `workspace = active ≠ inactive` → `other`, same time fields; three distinct → `undetermined`, both `null`; `inactive: null` → `undetermined`, `etags.inactive: null`; an ETag `'W/"abc"'` → `undetermined`.
  - `getObjectDraft.test.ts` (recording connection answering three reads with ETag headers): the three requests carry `version=active`, `version=inactive` and the settled working version; for each member of `HANDLER_GET_DRAFT_TYPES[variant]` (both variants), the answer of `GetObjectDraft` and of `HandlerGet` `{ part: 'draft' }` for the same object deep-equal; `HANDLER_GET_DRAFT_TYPES[variant]` is exactly `DRAFT_TYPES[variant]` ∩ `COMPACT_READ[variant]`, and `HandlerGet`'s `object_type` enum equals the base's (byte test, Task 4); a `404` on the active read answers as `GetClass` answers a `404` (Review Focus 5); in batch mode: recorded in one batch with three parts (ETag kept) or refused `batch_not_recordable` (lost), per Task 2; `listedTool` of `GetObjectDraft` on `legacy`: `listed: false`; `isLongRead('HandlerGet', { object_type: 'CLASS', object_name: 'ZC', part: 'draft' })` is `false`, a `background` with it is refused `BACKGROUND_NOT_FOR_RUN_WORDS` before anything is sent, and the call runs on the instance's connection (the connection source asked for no connection of its own); `handlerBarrels.test.ts` passes with `handleGetObjectDraft` in the read barrel; `tools/tool-search.json` has `GetObjectDraft` (the listed-schemas test reads it); a fixed `now` of `2026-11-04T10:31:00.900Z` gives `age_seconds: 60` (floor).
- [ ] **Step 2:** `npm test -- src/__tests__/unit/draft/draftOf.test.ts src/__tests__/unit/draft/getObjectDraft.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(draft): GetObjectDraft and HandlerGet part 'draft'`.

### Task 12: Nothing configured changes nothing

**Files:**
- Modify: `tests/fixtures/tools/surface.json`, `variant-surface.json`, `listed-schemas.json` (the two reviewed additions only), `http-surface.json` / `stdio-sse-surface.json` if they list tool names
- Test (node:test, listed): `src/__tests__/unit/access/nothingConfigured.test.ts`

- [ ] **Step 1:** Run `npm test -- src/__tests__/unit/toolSurface.test.ts src/__tests__/unit/toolSet src/__tests__/unit/toolSet/fixtureBytes.test.ts src/__tests__/unit/toolSet/dataTools.test.ts`. Expected: FAIL only on the additions, `fixtureBytes.test.ts` included.
- [ ] **Step 2:** Write the additions (the only fixture change of the whole PR): `WRITE_LISTED_SCHEMAS=1 npm test -- src/__tests__/unit/toolSet/listedSchemas.test.ts`, `WRITE_VARIANT_SURFACE=1 …variantSurface.test.ts`, `WRITE_TRANSPORT_SURFACE=1 …transportSurface.test.ts`; `surface.json` gets the `GetObjectDraft` row as `scripts/list-tools.ts` prints it. `git diff tests/fixtures tools/tool-search.json` shows only `GetObjectDraft` and `HandlerGet`'s `draft` (enum value and description mention); `fixtureBytes.test.ts` passes against the new committed bytes.
- [ ] **Step 3: Write the test** `nothingConfigured.test.ts`: `readAccessRestrictions([], {}, null)` → `{ deniedActions: [], lists: {} }`; `accessChecksFor({})` → `undefined`; `registryOf(set, transport, served)` and `registryOf(set, transport, served, [])` list deep-equal definitions for every set, with the data tools served and not; a server started from the stdio launcher's path with no rows never builds an `AccessCall` (`mock.method` on `accessCallOf`'s exports object, as Task 8; `callCount()` 0) across one call of each tool in `src/__tests__/helpers/batchEntryCases.ts`. Today's requests stay pinned by the existing request suites, which must pass with no change to their expectations: `src/__tests__/unit/lowToCompact.test.ts` (the low set's compact calls), `src/__tests__/unit/sources/batchHandlers.test.ts` and `src/__tests__/unit/batch/oneRequestPerEntry.test.ts` (every `tools/batch-handlers.json` entry's `sends`), and the handler unit tests on recording connections. No new request harness is built. The PR description lists the tools those suites do not pin **among the tools this PR does not change**; every tool this PR adds or changes is pinned by Task 12a.
- [ ] **Step 4:** Run the tool-surface tests, this test, and `npm test -- src/__tests__/unit/access/nothingConfigured.test.ts src/__tests__/unit/lowToCompact.test.ts`. Expected: PASS with no change to their expectations.
- [ ] **Step 5:** Commit `test(access): nothing configured changes nothing`.

### Task 12a: The requests of every added or changed handler are pinned

The handlers this PR adds or changes (a definition rebuilt or narrowable): `GetObjectDraft`; the twelve `object_type` / `target_type` tools (`HandlerActivate`, `HandlerCheckRun`, `HandlerCreate`, `HandlerDelete`, `HandlerDeletionCheck`, `HandlerGet`, `HandlerLock`, `HandlerUnlock`, `HandlerUpdate`, `HandlerValidate`, `HandlerWhereUsed`, `HandlerProfileRun`); the seven `action` / `operation` tools (`HandlerBatch`, `HandlerDebugBatch`, `HandlerSession`, `HandlerDebugSession`, `HandlerDebugStep`, `HandlerDebugBreakpoints`, `HandlerDebugMaintain`); `HandlerGetData`. Each has exact request assertions — method, URL with its query, `Accept` and `Content-Type`, and the body where it names the object — in an existing suite that already asserts them, else in `src/__tests__/unit/access/changedHandlerRequests.test.ts` on a recording connection. Expected values are literals in the test, taken from a run of the base code on the parity stand-in (`parityConnection`, `src/__tests__/helpers/lowToCompact.ts`) and reviewed in the diff; `{name}` stands for the case's object name. The table below summarizes those requests, with every per-value exception the base run showed (Measured: each value run on the stand-in on the static-types base); **where the table and the reviewed base-run literals differ, the literals are authoritative**.

**Files:**
- Modify (first, on the base): `src/__tests__/helpers/pinCases.ts` — its `PinnedRequest` type (line 88) moves to a new Jest-free `src/__tests__/helpers/pinnedRequest.ts`, re-exported from `pinCases.ts`; `src/__tests__/helpers/functionModuleMetadata.ts` imports it from there. Reason: `lowToCompact.ts` imports `functionModuleMetadata.ts`, which type-imports `pinCases.ts`, and `pinCases.ts` uses `jest` and `expect` (lines 300, 646); the node:test build (`types: ["node"]`) then cannot compile any file reaching `parityConnection`, and it compiles every listed file in one program (`tools/build-node-tests.mjs:91`). No Jest suite changes behaviour.
- Test (node:test, listed): `src/__tests__/unit/access/changedHandlerRequests.test.ts` (the parity stand-in from `src/__tests__/helpers/lowToCompact.ts`, Jest-free after the move above)

| Handler | Where pinned | What is asserted (per value of its dispatching argument) |
|---|---|---|
| `GetObjectDraft`, `HandlerGet` `part: 'draft'` | `src/__tests__/unit/draft/getObjectDraft.test.ts` (Task 11) | three `GET <object source URI>?version=active` / `inactive` / the settled working version, `Accept` the type's read type, no body |
| `HandlerGet` (`source`, `metadata`, the address parts) | `changedHandlerRequests.test.ts` | `GET <object URI>/source/main?version=active` with `Accept: text/plain`; `GET <object URI>?version=active` with the type's metadata `Accept`. Exceptions: `LOCAL_TEST_CLASS` / `LOCAL_TYPES` / `LOCAL_DEFINITIONS` / `LOCAL_MACROS`: `GET <class URI>/includes/testclasses` / `implementations` / `definitions` / `macros` `?version=active`; `BEHAVIOR_IMPLEMENTATION`: the class's main source and metadata; `SERVICE_BINDING` (source and metadata alike): `GET /sap/bc/adt/businessservices/bindings/{name}` with no `version`; `TRANSPORT`: `GET /sap/bc/adt/cts/transportrequests/{request}`; `UNIT_TEST`, `CDS_UNIT_TEST`: `GET /sap/bc/adt/abapunit/results/{run}`; `object_structure` / `node_structure` with a code: their one request as recorded |
| `HandlerCreate` | `lowToCompact.test.ts` for its rows; the rest in `changedHandlerRequests.test.ts` | every type through `compactWriteRoutes.ts` `create` → `handleCreateOnly` (`PACKAGE` delegated to `handleCreatePackage`): `POST <collection URI>?corrNr={request}`, the type's `Content-Type`, the body's `adtcore:name` and package reference. Exceptions, no `corrNr`: `TRANSPORT` `POST /sap/bc/adt/cts/transportrequests`, `SERVICE_BINDING` `POST /sap/bc/adt/businessservices/bindings`, `METADATA_EXTENSION` `POST /sap/bc/adt/ddic/ddlx/sources`; `FUNCTION_MODULE` `POST /sap/bc/adt/functions/groups/{group}/fmodules?corrNr={request}`; `BEHAVIOR_IMPLEMENTATION` the class create `POST /sap/bc/adt/oo/classes?corrNr={request}` |
| `HandlerUpdate` | as `HandlerCreate` | source types: `PUT <object URI>/source/main?lockHandle={lock}&corrNr={request}`, `Content-Type: text/plain`. Exceptions: `PACKAGE`, `DOMAIN`, `DATA_ELEMENT`, `TABLE_TYPE`, `FUNCTION_GROUP`: `PUT <object URI>?lockHandle={lock}&corrNr={request}` with the type's metadata `Content-Type`; `LOCAL_TEST_CLASS`, `UNIT_TEST`, `CDS_UNIT_TEST`: `PUT <class URI>/includes/testclasses?…`; `LOCAL_TYPES` and `BEHAVIOR_IMPLEMENTATION`: `PUT <class URI>/includes/implementations?…`; `LOCAL_DEFINITIONS` / `LOCAL_MACROS`: `…/includes/definitions` / `…/includes/macros`; `SERVICE_BINDING`: no `PUT` — the publication request, `POST /sap/bc/adt/businessservices/odatav2/publishjobs` or `…/odatav4/publishjobs` by `binding_variant` (`src/handlers/common/low/handleUpdateUnderLock.ts:491`), both variants pinned (`src/__tests__/unit/serviceBindingPublicationQuery.test.ts` where it asserts them) |
| `HandlerDelete` | as `HandlerCreate` | `POST /sap/bc/adt/deletion/delete`, `Content-Type: application/vnd.sap.adt.deletion.request.v1+xml`, body naming `<object URI>` (`CDS_UNIT_TEST` and `BEHAVIOR_IMPLEMENTATION`: the class's). Exceptions: `METADATA_EXTENSION`: `DELETE /sap/bc/adt/ddic/ddlx/sources/{name}?corrNr={request}`; `LOCAL_TEST_CLASS`, `UNIT_TEST`, `LOCAL_TYPES`, `LOCAL_DEFINITIONS`, `LOCAL_MACROS`: `PUT <class URI>/includes/<include>?lockHandle={lock}&corrNr={request}`, empty body |
| `HandlerDeletionCheck` | `changedHandlerRequests.test.ts` | `POST /sap/bc/adt/deletion/check`, `Content-Type: application/vnd.sap.adt.deletion.check.request.v1+xml`, body naming `<object URI>` |
| `HandlerActivate` (by name and by code) | as `HandlerCreate` | the selection is `activationPlan` (`src/handlers/common/low/handleActivateObject.ts:277`): exactly one object — by `object_type`, by `object_adt_type`, or a one-entry `objects[]` — whose code (read by `acceptedCodeOf`) is in `SINGLE_ACTIVATION[variant]` (`src/lib/adtProjections.ts`; on premise `CLAS/OC`, `PROG/P`, `INTF/OI`, `FUGR/F`, `TABL/DT`, `TABL/DS`, `DDLS/DF`, `DOMA/DD`, `DTEL/DE`, `BDEF/BDO`, `DDLX/EX`; cloud the same without `PROG/P`) is activated through its API: `POST /sap/bc/adt/activation?method=activate&preauditRequested=true`, body naming `<object URI>` — so `CLASS`, `BEHAVIOR_IMPLEMENTATION` and `object_adt_type: 'CLAS/OC'` alike; every other call (more than one object, or one object of another code: `INCLUDE`, `TABLE_TYPE`, `PACKAGE`, `SERVICE_DEFINITION`, `SERVICE_BINDING`, `FUNCTION_MODULE`, any other code) starts a run: `POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=true`, body naming every object. Cases: each name; `object_adt_type: 'CLAS/OC'` (single); `objects: [{ name: '{name}', type: 'CLAS/OC' }]` (single); two objects (run); `object_adt_type: 'PROG/I'` (run). `Content-Type` per the base-run literals (`application/vnd.sap.adt.activation+xml` for most single activations, `application/xml` for `FUNCTION_GROUP`, `DATA_ELEMENT` and the runs) |
| `HandlerLock` / `HandlerUnlock` | as `HandlerCreate` | `POST <object URI>?_action=LOCK&accessMode=MODIFY` / `POST <object URI>?_action=UNLOCK&lockHandle={lock}` |
| `HandlerCheckRun` | `changedHandlerRequests.test.ts` | `POST /sap/bc/adt/checkruns?reporters=abapCheckRun`, `Content-Type: application/vnd.sap.adt.checkobjects+xml`, body naming `<object URI>`. Exception: `PACKAGE`: `POST /sap/bc/adt/checkruns` with no query |
| `HandlerValidate` | `changedHandlerRequests.test.ts` | `POST` to the type's validation endpoint with its query, as recorded per value (e.g. `CLASS`: `/sap/bc/adt/oo/validation/objectname?objname={name}&objtype=CLAS%2FOC&packagename=…&description=…`; `PACKAGE`: `/sap/bc/adt/packages/validation?…&packagetype=development&checkmode=basic`). Exception: `SERVICE_BINDING`: `POST /sap/bc/adt/cts/transportchecks` |
| `HandlerWhereUsed` | `changedHandlerRequests.test.ts` | `POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=<object URI, percent-encoded>` per value, as recorded |
| `HandlerProfileRun` | `changedHandlerRequests.test.ts` | `CLASS`: `POST /sap/bc/adt/oo/classrun/{name}?profilerId={profiler}`; `PROGRAM`: `POST /sap/bc/adt/programs/programrun/{name}?profilerId={profiler}`; `Accept: text/plain` |
| `HandlerGetData` | `changedHandlerRequests.test.ts`, its group (`CompactDataHandlersGroup`) served | `POST /sap/bc/adt/datapreview/freestyle?rowNumber=100`, `Content-Type: text/plain`; body `SELECT * FROM {name}` for `object_name`, the given query for `sql_query` |
| `HandlerBatch`, `HandlerDebugBatch` | `src/__tests__/unit/batch/` suites where they assert the envelope; else `changedHandlerRequests.test.ts` | `begin` and `answers` send nothing; `end` sends one `POST` to the batch endpoint (`communication` / `debugger`) carrying the recorded requests |
| `HandlerSession` | `src/__tests__/unit/state/longSession.test.ts` and `server-runtime/src/http/__tests__/longSessionOpen.test.ts` / `longSessionClose.test.ts` where they assert the requests; else `changedHandlerRequests.test.ts` | `open` and `close`: each its own requests as recorded |
| `HandlerDebugSession`, `HandlerDebugStep`, `HandlerDebugBreakpoints`, `HandlerDebugMaintain` | `src/__tests__/unit/debugger/` suites where they assert each operation's request; else `changedHandlerRequests.test.ts` | each operation's one request, as recorded |

- **Accepted deviations (the owner):** the expected requests are a committed JSON fixture written on the base with a WRITE mode (`tests/fixtures/tools/changed-handler-requests.json`, `WRITE_CHANGED_HANDLER_REQUESTS=1`; a batch's random boundary and the `_` clock parameter as placeholders), as the repository's other surface fixtures are, not literals in the test file; Task 4 Step 0's descriptions likewise (`tests/fixtures/tools/rebuilt-descriptions.json`, `WRITE_REBUILT_DESCRIPTIONS=1`). The seven action / operation tools (`HandlerBatch`, `HandlerDebugBatch`, `HandlerSession`, the four debugger tools) are pinned by their existing unit suites (batchEnd, oneEnvelope, debugBatch, compactFourTools, longSession), not re-pinned here.
- [ ] **Step 1:** On the base commit (before Task 4), run each handler's values on the parity stand-in and write the recorded requests as literals into `changedHandlerRequests.test.ts`, for the rows the named existing suites do not already assert. The first row (`GetObjectDraft`, `HandlerGet` `part: 'draft'`) is not on the base: Task 11 adds it and `getObjectDraft.test.ts` pins its requests. Review the literals in the diff.
- [ ] **Step 2:** `npm test -- src/__tests__/unit/access/changedHandlerRequests.test.ts`. Expected: PASS on the base, and still PASS after every later task.
- [ ] **Step 3:** Commit `test(access): the changed handlers' requests pinned`. (This task's test is written right after Task 0, before Task 4, so the literals are the base's; it is numbered here to sit beside Task 12.)

### Task 13: Docs (before the live runs, spec §9)

**Files:**
- Create: `docs/user-guide/ACCESS_RESTRICTIONS.md`
- Modify: `docs/user-guide/CLI_OPTIONS.md`, `docs/configuration/YAML_CONFIG.md`, `src/lib/config/README.md`, `docs/user-guide/BATCH_MODE.md`, `docs/user-guide/HANDLERS_MANAGEMENT.md`, `src/embeddable/docs/ARCHITECTURE.md`, `README.md`, `SECURITY.md`, `docs/user-guide/AVAILABLE_TOOLS*.md` (`npm run docs:tools`), `docs/MIGRATION-24.0.md`, `CHANGELOG.md` (the unreleased `[24.0.0]` entry)

- [ ] **Step 1:** Write `ACCESS_RESTRICTIONS.md` with spec §8's content: every setting in its three forms; the grammars; the start line; reads are not checked; a task is matched as given (one line); denying `Activate*` closes only the activation tools, not a write's `activate`; each entry denies exactly what it names, and an administrator who wants a whole object kind out denies every value that names it; an ADT code is a value of its own (`HandlerActivate.CLAS/OC`) and, while one is denied, the code arguments take codes as written in upper case only; the paths an embedder takes into its own hands are its own; `GetObjectDraft` (its answer, the types offered and not offered from Task 1, the types `GetObjectDraft` serves that `HandlerGet` `part: 'draft'` does not because they are outside `HandlerGet`'s `object_type`, the server clock, first writer wins).
- [ ] **Step 2:** The other docs as listed; `HANDLERS_MANAGEMENT.md` and `ARCHITECTURE.md`: `accessChecks`, the two strategies, `IPackageReader`, `withoutDenied`, `HandlerExporter`'s `deniedActions`, paths 3 to 5; `SECURITY.md`: the checks are formal, SAP's authorization remains the boundary; `BATCH_MODE.md`: a refused call takes no number, the draft tool recordable or not.
- [ ] **Step 3:** `npm run docs:tools`; `git diff docs/user-guide/AVAILABLE_TOOLS*.md` shows only `GetObjectDraft` and the `draft` part.
- [ ] **Step 4:** Repository-wide audit: every doc and usage example that names a changed surface — `registryOf`, `HandlerExporter` options, `BaseMcpServer` / `EmbeddableMcpServer` options, `HandlerGet`'s parts, the CLI and YAML option lists and the generated `--conf` template, the tool counts — found by searching `README.md`, `docs/`, `src/**/docs/`, every package's `README.md` and `src/lib/handlers/examples/`; each updated or confirmed current, the list of files checked in the commit message.
- [ ] **Step 5:** `CHANGELOG.md`: lines in the unreleased `[24.0.0]` entry (dated 2026-11-12; a later edit sets the release day, #346's step), in its existing sections: the five rows, the two strategies, `HandlerExporter.deniedActions`, `accessChecks`, the four refusal codes, `GetObjectDraft` and `HandlerGet` `part: 'draft'`, the start line; additive, so no "Migrating" line. `docs/MIGRATION-24.0.md`: a short section naming the new optional configuration (the five rows, `accessChecks`, `deniedActions`) and that nothing configured changes nothing, so no step is required of a consumer of 23.x; placed where the guide lists what is new. The table rows' text says they act on the data tools only when `--enable-data-tools` serves them.
- [ ] **Step 6:** Commit `docs: access restrictions and the draft tool`.

### Task 14: Permanent live integration tests

The owner's rule: every handler this PR adds or changes is pinned by unit tests on its requests (Task 12a) **and** by permanent node:test live tests under `src/__tests__/integration/` (each a `liveSuite`, its calls through `liveCall`, a case that cannot run here skipped with `skipRunningTest(reason)`, and each file added to `tools/node-test-files.json`), run on premise and on the cloud trial wherever the variant offers the handler. The Task 1 and 2 probes are temporary and are not these tests. The second user is used only where the behaviour depends on another user: the draft's `other` state. Debugger cases follow `src/__tests__/integration/debugger/DebuggerHandlers.test.ts`'s own guards and cleanup (the listener and the debug state stopped in `after`, `helpers/debuggerCleanup.ts`).

**Files:**
- Create: `src/__tests__/integration/high/draft/GetObjectDraft.test.ts`, `src/__tests__/integration/high/draft/HandlerGetDraft.test.ts`, `src/__tests__/integration/high/access/AccessRestrictions.test.ts`, `src/__tests__/integration/compact/NarrowedCompactTools.test.ts`, `src/__tests__/integration/compact/HandlerProfileRun.test.ts`, `src/__tests__/integration/compact/HandlerGetData.test.ts`, `src/__tests__/integration/compact/HandlerSession.test.ts`, `src/__tests__/integration/compact/HandlerDebug.test.ts`
- Modify: `tests/test-config.yaml.template`:
  - `draft:` — `second_user_env` (on premise: a session `.env` name of the reading user; empty skips only the `other` cases with that reason; on the trial: empty);
  - `access:` — `transport_request` (on premise: required, nonempty, for the allowed-request case; on the trial: empty, the case skips with "the probe package takes no request"), `package_parent` (both: a package the tree case puts a child under), `package` (on premise `$TMP`; on the trial the cloud probe package).

| Handler | Suite | Cases | Systems |
|---|---|---|---|
| `GetObjectDraft` | `high/draft/GetObjectDraft.test.ts` | for each member of `DRAFT_TYPES[variant]` (one `describe` per member, built by a loop): `none after activation`, `own after an unactivated write`, `other for another user` | on premise: every on-premise member, `none` and `own`, and `other` when `draft.second_user_env` is set (else skipped with that reason); trial: every cloud member, `none` and `own` |
| `HandlerGet` `part: 'draft'` | `high/draft/HandlerGetDraft.test.ts` | for each member of `HANDLER_GET_DRAFT_TYPES[variant]` (one `describe` per member, built by a loop): the same three; `answers as GetObjectDraft does` | as above |
| `HandlerGet` (codes narrowed) | `compact/NarrowedCompactTools.test.ts` | `object_structure of an interface with CLAS/OC denied`, `CLAS/OC refused at the parse` | both |
| `HandlerActivate` | `compact/NarrowedCompactTools.test.ts`; existing `high/include/IncludeHighHandlers.test.ts`, `high/table_type/TableTypeHighHandlers.test.ts` | `activates a class by CLAS/OC with CLASS denied`, `object_type CLASS refused at the parse` | both |
| `HandlerCreate`, `HandlerUpdate`, `HandlerDelete`, `HandlerDeletionCheck`, `HandlerLock`, `HandlerUnlock`, `HandlerValidate`, `HandlerCheckRun`, `HandlerWhereUsed` | existing `high/table_type/TableTypeHighHandlers.test.ts`, `high/include/IncludeHighHandlers.test.ts` (unchanged), plus `compact/NarrowedCompactTools.test.ts` | `<tool> with one value denied: the denied value refused at the parse, another value runs` | both (include cases on premise only, as today) |
| `HandlerProfileRun` | `compact/HandlerProfileRun.test.ts` | `CLASS profiles a class run`; `PROGRAM profiles a program run`; `PROGRAM denied: refused at the parse, CLASS runs` | on premise (both values); trial (`CLASS`) |
| `HandlerGetData` | `compact/HandlerGetData.test.ts` | `reads a table by object_name`, `reads by sql_query`, `sql denied: sql_query refused, object_name reads` (the live run serves the data tools: hard mode starts every binary with `--enable-data-tools`) | both |
| `HandlerBatch` | existing `batch/communicationBatch.test.ts` (unchanged) plus `compact/NarrowedCompactTools.test.ts` | `end denied: begin and answers listed, end refused at the parse` | both |
| `HandlerSession` | `compact/HandlerSession.test.ts` | `open then close`; `close denied: refused at the parse` | both |
| `HandlerDebugBatch`, `HandlerDebugSession`, `HandlerDebugStep`, `HandlerDebugBreakpoints`, `HandlerDebugMaintain` | `compact/HandlerDebug.test.ts` | per tool: one operation run end to end on the debugger probe the existing suite uses (`checkListener`, `listen`/`attach`/`stepOver`, `setBreakpoints`/`deleteBreakpoint`, `getStack`/`getVariables`, `begin`/`end`); per tool: one operation denied, refused at the parse | on premise; trial where the debugger suite runs today |
| access checks | `high/access/AccessRestrictions.test.ts` | `allowed package create runs`; `create in another package refused, nothing sent`; `allowed request write runs` (on premise; trial skips: "the probe package takes no request"); `write naming another request refused, nothing sent` (both: refused before sending); `tree: child of package_parent allowed, outside refused` | both, as stated |

- [ ] **Step 1:** Realm checks (Global Constraints): `globalSetup` runs them; the draft suites' second-user connection runs `realmCheck` for its own session.
- [ ] **Step 1b: A configured live runner.** The base's live runner cannot carry a restriction: soft mode calls the served entries directly (`src/__tests__/integration/helpers/live.ts:232`), server-dispatched calls go through `inProcessServer(variant, source, setup?)` (`src/__tests__/helpers/pinServer.ts:232`), which takes no restriction, and hard mode keeps one client per tool set (`live.ts:274`). Add an optional restriction to the in-process server (`inProcessServer`'s options: the denied actions given to `registryOf` and the `accessChecks` given to the server, both absent by default, so every existing caller is unchanged) and a live runner built on it, installed per suite with `useLiveRunner` (`live.ts:181`) and closed in that suite's `after`, one server per restriction scenario. The suites of the table whose cases name a denied action or a list run through it; the draft suites need none. A unit test (node:test, listed) shows a runner with nothing configured lists the same tools as today's.
- [ ] **Step 2: Write the suites** as the table names them. The draft suites iterate `DRAFT_TYPES[variant]` (GetObjectDraft) and `HANDLER_GET_DRAFT_TYPES[variant]` (HandlerGet) themselves (Task 11), so a type admitted later is tested without editing the suites. For the draft suites: `draft`, `etags` and `changed_at` compared exactly between the two tools and against the expected state; each `age_seconds` checked against its own call's clock bounds, `floor(before − changed_at) ≤ age_seconds ≤ floor(after − changed_at)`, `before` and `after` taken around that call; full deep equality only in the unit tests with a fixed clock (Task 11). Temporary objects deleted after; nothing else touched.
- [ ] **Step 3:** `npm run test:integration -- <file>…` with every file of the table (the new ones and `batch/communicationBatch.test.ts`, `debugger/DebuggerHandlers.test.ts`, `high/include/IncludeHighHandlers.test.ts`, `high/table_type/TableTypeHighHandlers.test.ts`), the full log kept (`2>&1 | tee <log>`), once with the on-premise test configuration and once with the trial's (`MCP_TEST_CONFIG`). Expected: PASS; skips only with their stated reasons.
- [ ] **Step 4:** Commit `test(integration): every added or changed handler live`.

### Task 15: Close

- [ ] **Step 1:** CI's step list locally, as `.github/workflows/ci.yml` names it: `npm ci --ignore-scripts`; the root `lint:check` and each package's `lint:check` it lists; `npm run build`; the root `test:check`; `npm test -- --concurrency 2`; `npm run test:install`; the `test:check` of the six packages it lists (`server-runtime`, `server`, `http`, `sse`, `background-runs-memory`, `responsible-rules`); `npm audit --audit-level=moderate`; and its remaining jobs (packaging and install verification, images) as the workflow runs them, or left to CI with that said. Expected: green.
- [ ] **Step 1a:** The node:test list grew: measure the run's concurrency again as `docs/development/tests/TESTING_GUIDE.md` ("The node:test run's concurrency") does, and update its figures and the setting if they move.
- [ ] **Step 2:** The full integration suite on premise and on the trial (`npm run test:integration`, after the realm checks). Every failure fixed before going on.
- [ ] **Step 3:** Push; Codex review of the PR; fix findings; CI green.
- [ ] **Step 4:** Owner review.
- [ ] **Step 5:** Delete `docs/superpowers/2026-11-04-access-restrictions-goal.md`, `-spec.md` and `-plan.md`; what they owe (the legacy measurement task, any measurement record worth keeping, Task 1a if it ran) goes into the PR description first. Commit, push. The PR merges into `refactor/static-types`; the version, the publish order, the tag, the publish and the clean registry install are #346's 24.0.0 release steps, with Task 1a's versions (if it ran) among the dependencies that must resolve on the registry first.

---

## Decisions on the spec's silences (the owner's rulings)

1. The start line's packages clause names the strategy only for the tree strategy, `(package tree read)`; under the simple strategy it carries no strategy words.
2. `age_seconds` is whole seconds: the floor of (now − `changed_at`); the ETag timestamp has second precision.
3. The per-part answer's shape is a gate, not a decision: if Task 1 finds an include change does not move the main source's ETag, the work stops and the finding goes to the owner before Task 11.

## Owner decisions since the plan

Accepted deviations, as implemented:

1. The launcher tests are one file, `src/__tests__/unit/launchers/accessRestrictionsAtStart.test.ts`, instead of the three `server-runtime/src/{stdio,http,sse}/__tests__/accessRestrictions.test.ts` of Task 10.
2. Paths 2 and 3 (Task 8) take the strategy from `HandlerContext.accessChecks`, not from an options path of `BaseHandlerGroup`: it avoids a load-order cycle.
3. When every name of a tool is denied but codes are left (`HandlerActivate`, `HandlerGet`'s address parts), `object_type` leaves the schema and its description clauses go.
4. A variant with nothing left drops out of the tool's `available_in`.
5. The debug texts read "The handle of this server's debug state; every operation takes it." and "the id of the debuggee attached".

After the Task 1 and Task 2 measurements (the owner):

6. **Per part.** The draft tool answers one entry per part (the main source or metadata, and each include) with its own state; `has_draft` when any part has one (spec §5, §5.1). `CLASS` and `BEHAVIOR_IMPLEMENTATION` are offered on premise through their include parts.
7. **CDS view.** Offered with the 14-digit timestamps compared instead of the whole ETags: a failing-first unit test of the rule, then a live proof on both systems (no draft → `none`, a write → `own`, on premise another user's write → `other`) before it ships.
8. **Metadata extension, service definition.** Offered with the state; `changed_at` and `age_seconds` `null`, documented as not known for these types.
9. **Batch.** No refusal while a batch is open: `lazyPackageReader` as implemented (pinned by `accessWrappers.test.ts`).
10. **Not offered**, documented why: package and message class (the ETag does not follow the version), service binding (not measurable).

Consequences for Task 11: `DraftAnswer` becomes `{ has_draft: boolean; parts: readonly DraftPartAnswer[] }`, a `DraftPartAnswer` being `{ part, draft, changed_at, age_seconds, etags }`; `draftOf` takes the part's comparison (`etag` | `timestamp`) and whether its time is known; `readDraftEtags` reads each part of `DRAFT_PARTS[variant][type]`, an include whose three reads all answer `404` having no entry. `GetObjectDraft` and `HandlerGet` `part: 'draft'` get `tools/batch-handlers.json` entries (Task 2).

### Deviations while implementing Tasks 11–14 (for the owner's review)

11. **Descriptions name no `none`.** The repository's guard (`descriptionsFunctional.test.ts`) refuses the words `none`, `not`, `neither`, `instead` in a tool description, so `GetObjectDraft`'s and `HandlerGet`'s draft texts say the equal-versions state as "the active state when its versions are equal" and leave out "another user's lock is not visible" (it stays in the docs). The answer's value is still `none`.
12. **The draft live cases are written out per type**, not built by a loop: the coverage ledger (`ledgerScan.ts`) reads only awaited `liveCall`s with literal tools and arguments directly in an `it`. Both tools are covered by one live file, `src/__tests__/integration/high/draft/ObjectDraft.test.ts`, in place of `GetObjectDraft.test.ts` and `HandlerGetDraft.test.ts`.
13. **The compact suites of Task 14** are two files: `compact/NarrowedCompactTools.test.ts` and `compact/CompactRestrictedTools.test.ts` (HandlerProfileRun, HandlerGetData, HandlerSession and the debugger tools), in place of five. Their calls go through `livePrepare`: a `liveCall` of a key without a ledger row is an orphan for the ledger guard, and these keys are in `coverage-debt.json`.
14. **The draft unit pins** (`src/__tests__/unit/pins/draft.pins.test.ts`, Jest, as every pin file) take their literals from the base run's `changed-handler-requests.json`.

### Held for the owner (Codex review, round 2)

15. **An include with one or two of its three reads answering `404`.** As built, that version's ETag is `null` and the part answers `undetermined` (spec §5: "An ETag missing … answers `undetermined`, that version's ETag `null`"); only an include whose three reads all answer `404` has no entry, and an object none of whose parts answers is the read's `404`. Codex reads §5's "a read that fails answers as the tool's reads answer today" as requiring the failure there. An include that exists only inactive (a test-class include written and never activated) is a draft that a failure answer would hide. Not measured live. The owner decides.

## Measurement record

### Task 1: draft versions (Measured 2026-11-12)

On premise: two users (the writing user, the reading user), each through its own connection, objects in `$TMP`. Trial: one user, objects in the cloud probe package, no request. Per type: (a) after activation, (b) after the writer's unactivated write, (c) after the writer activates again; each version read raw (`connection.makeAdtRequest` with the route's own URL and headers, `version` replaced) and through the production route (an adt-clients client with `wireItself` for the part read). Probe deleted after its run.

- **The `wireItself` route's ETag equals the raw read's** for every type, version, user and point, on both systems.
- **`workingArea` is the caller's working version.** Where `version=workspace` was accepted (program, include, interface, class main source, function group metadata, function group include, a behavior implementation's main source), `workingArea` answered the same ETag as `workspace`, for both users. Every other part answers `version=workspace` with `400`. Task 1a does not run.
- **An include write does not move the main source's ETag.** A class's local types, local definitions, test classes and macros, each written alone (unactivated), left the class main source's three ETags unchanged (both systems); each include's own three ETags moved and told the states apart. A function group include written alone left the function module's ETags unchanged; the function group's metadata was already inactive after the include's creation and kept that ETag across the include's write (on premise and trial). A behavior implementation's write (its implementations include) left the class main source unchanged. **Plan Task 1 Step 6: the gate holds — Task 11 waits for the owner's decision on the per-part answer's shape.**

Per type, whether the spec's rule (`none` when `active` = `inactive`; `own` when `workspace` = `inactive` ≠ `active`; `other` when `workspace` = `active` ≠ `inactive`; an ETag led by 14 digits) tells the three states apart:

| Type (part read) | ETag shape | On premise | Trial |
|---|---|---|---|
| program (main source) | 14 digits + `0011` active / `0001` inactive draft | yes | not served |
| include (source) | as program | yes | not served |
| interface (main source) | as program | yes | yes |
| class (main source) | on premise 23 digits, one ETag for every version (a write moves all three alike); trial as program | **no**: after an unactivated write all three are equal, read `none` | yes |
| class include (implementations, definitions, test classes, macros) | as program | yes, each part | yes (macros: not allowed in ABAP Cloud) |
| function module (source) | as program | yes | yes |
| function group (metadata) | 14 digits + `0018` / `0008` (trial: + `89205`) | yes | yes |
| function group include (source) | as program | yes | yes |
| CDS view (DDL source) | 14 digits + `0011` active, `0001` inactive — **with no draft too** (same timestamp) | **no**: after activation `active` ≠ `inactive` and the working version = `active`, read `other` | no (same) |
| behavior definition (source) | 14 digits + `001`/`000` + `text/plain_` + a hash | yes | yes |
| behavior implementation (main source; implementations include) | main source as the class's; implementations include as program | main: **no**; implementations: yes | main: no (a write of the implementations does not move it); implementations: yes |
| metadata extension (source) | `19710401000000` + `001`/`000` + `text/plain_` + a hash | states told apart; **the timestamp is a constant `1971-04-01 00:00:00`**, so `changed_at` / `age_seconds` would be wrong | same |
| service definition (source) | as metadata extension | states told apart; timestamp constant | same |
| table (source) | 14 digits + `001`/`000` + `text/plain2` | yes | yes |
| structure (source) | as table | yes | yes |
| domain, data element, table type (metadata) | 14 digits + `001` (`I` while an inactive version exists) / `000A` + the content type + a hash | yes | yes |
| package (metadata) | `active` 14 digits + `001`, `inactive` + `000`, the same timestamp with no draft; a description change moves neither | **no** | not measured (the probe creates no package there) |
| message class (metadata) | 40 hex digits, one ETag for every version | **no** | no |
| service binding | not measured: its change is a publication, not an unactivated write the tools make | not offered | not offered |

Questions for the owner before Task 11 (the plan decides none of them): the per-part answer's shape (the gate); whether a type whose rule fails on one part (class and behavior implementation on premise: the main source) is offered by its include parts; the CDS view's rule (its ETags tell the states apart by the 14-digit timestamp, not by the whole ETag); and whether metadata extension and service definition are offered with `changed_at` / `age_seconds` `null` (their timestamp is a constant).

### Task 2: batch ETags and the package reader (Measured 2026-11-12, on premise and trial)

- **(a) A `$batch` response part keeps its `ETag`.** Three version reads of one class's main source queued on `AdtBatchConnection` (`communication`) and executed: the envelope answered `202`; each part answered `200` with the headers `last-modified`, `etag`, `content-type`, its `ETag` equal to the same read sent alone. Decision (Step 4): `GetObjectDraft` and `HandlerGet` `part: 'draft'` get a `tools/batch-handlers.json` entry (Task 11).
- **(b) The super package** is the `pak:superPackage` element of the package's metadata, its `adtcore:name` (with `adtcore:uri` and `adtcore:type` `DEVC/K`); at the top of the tree the element is empty (`<pak:superPackage/>`). `packageSummary`'s `super_package` reads exactly that.
- **(c) A package read while a batch is open is sent.** An in-process server with the tree strategy and a batch open (`BatchBegin`): a `CreateClass` naming a package below the allowed subtree sent one `GET /sap/bc/adt/packages/<name>` on the instance's real connection during the call, answered `200`, and the call was recorded (an empty answer, as every recorded call); on premise a `CreateClass` naming the top package sent its read (`200`) and was refused `package_not_allowed`; closing the server dropped the batch and sent nothing. A recorded call's number is not visible before the batch ends; that a refused call takes none is pinned by `accessWrappers.test.ts`. Decision (Step 4): (c) was sent, so `lazyPackageReader` does not refuse while a batch is open — the owner's open question, recommended answer: no refusal (the code as it is).

### Tasks 14 and 15: the live runs (Measured 2026-11-12)

- `high/draft/ObjectDraft.test.ts`: on premise 32 of 32 cases passed (none, own, and other through the second user's own connection, for every type, GetObjectDraft and HandlerGet part draft alike; the CDS view's timestamp rule among them); on the trial 14 passed, the 14 other cases skipped (one user).
- `high/access/AccessRestrictions.test.ts`: on premise 5 of 5; on the trial 4, the allowed-request case skipped (the probe package takes no request).
- `compact/NarrowedCompactTools.test.ts`: 7 of 7 on both. `compact/CompactRestrictedTools.test.ts`: 8 of 8 on premise; 7 on the trial, the program run skipped.
- The full integration run (`npm run test:integration`): on premise 343 passed, 17 skipped with their reasons, none failed; on the trial 279 passed, 69 skipped with their reasons, none failed.

