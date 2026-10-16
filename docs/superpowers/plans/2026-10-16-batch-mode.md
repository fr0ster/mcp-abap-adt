# Batch Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The model records single-request ADT tool calls into a batch, sends them in multipart envelopes at `BatchEnd` and reads each call's answer by number; the debugger gets the same for the operations at a stop; and every multi-request read sends its independent requests in envelopes inside its one call.

**Architecture:** A host-created owner per MCP instance (`InstanceBatch`, a `StatePart`) holds the open batch and the last answers. In batch mode the dispatch in `BaseMcpServer.runCall` hands an eligible handler a per-call recorder over adt-clients' `AdtBatchConnection`, which wraps a late-bound target pointing at the instance's connection in force; `BatchEnd` executes and each handler builds its own answer. The multi-request reads run in phases through a shared `runPhase` over the same adt-clients class.

**Tech Stack:** TypeScript, `@mcp-abap-adt/adt-clients` `AdtBatchConnection` + `exemptFromAcceptNegotiation`, MCP SDK 1.32, Jest (ts-jest), Biome.

**Spec:** `docs/superpowers/specs/2026-10-16-batch-mode-design.md` (answers `docs/superpowers/2026-10-16-batch-mode-goal.md`).

## Global Constraints

- `@mcp-abap-adt/adt-clients` `^34.1.0`, `@mcp-abap-adt/connection` `^18.0.0`, `@mcp-abap-adt/sap-rfc-lite` `^0.2.3`, `@mcp-abap-adt/interfaces-auth-sap` `^3.4.0` — bumped together, from the registry (Task 1 is the gate); registry-only dependencies, no `file:`/`link:`/workspace link outside this repo; after install the lockfile holds nothing not resolved from the registry.
- No retries in a batch: a part's `401`/`406`/`415` is that call's answer; nothing recorded is corrected or sent again (adt-clients 34; every recorder marked `exemptFromAcceptNegotiation`).
- One request per recorded call; numbers only for calls that put a request into an envelope, from 1, in the order made.
- Only LOCK and UNLOCK go stateful, as adt-clients sends them.
- No timeouts of the server's choosing; the state's existing idle bound is the only clock that touches batch state.
- A credential refusal ends the call and reaches the caller as it came (`readFailure` → `answerRead`).
- Failures in the C6 shape: the method's error as it is plus `step`.
- System type never guessed; batch availability learned only from the outer envelope response (`404`).
- No SAP system names or ids in code, tests, docs or commits; no secrets.
- `CHANGELOG.md`: only the 19.0.0 entry changes; no earlier entry is touched.
- Commits end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_013FwzVzuPQdYVh3bHZmipzj`.
- Gates on every task's final tree: `npm run build`, `npm run lint:check`, `npm run test:check`, `npm test`.

## Review Focus

1. Recorded calls of LOCK, a read, UNLOCK, a read interleaved: several envelopes in one `execute()`; every number must still map to its own call's answer → test in Task 6.
2. `BatchAnswers` with `0`, a negative, a non-integer, or duplicates: the first three refused before anything runs, duplicates answered once per occurrence in the order asked → test in Task 6.
3. `when` rules against argument spelling (`object_type: 'domain'` vs `'DOMAIN'`, `part` absent meaning `source`): eligibility must read arguments as the handler does → test in Task 4.
4. The idle bound ends held state while a batch is open: nothing sent, recorded handlers released, `BatchEnd` then `batch_mode_off`, `BatchAnswers` "no answer with that number" → test in Task 8.
5. Two HTTP requests carrying the same `x-mcp-state-handle` at once: the pool's lease serializes them, both are recorded, numbered in arrival order → test in Task 9.

---

### Task 1: Gate — adt-clients, connection and sap-rfc-lite from the registry

**Files:**
- Modify: `package.json`, `package-lock.json`; `src/__tests__/unit/rfcWireLogging.test.ts` only if the `RfcAddress` type requires it

**Interfaces:**
- Produces: `AdtBatchConnection`, `exemptFromAcceptNegotiation` importable from `@mcp-abap-adt/adt-clients`; `ISapConfig` with `mshost`, `msserv`, `sysid`, `group`, `saprouter` (interfaces-auth-sap 3.4.0, through connection 18).

- [ ] **Step 1:** Check each is on the registry: `npm view @mcp-abap-adt/adt-clients@34.1.0 version`, `npm view @mcp-abap-adt/connection@18.0.0 version`, `npm view @mcp-abap-adt/sap-rfc-lite@0.2.3 version`, `npm view @mcp-abap-adt/interfaces-auth-sap@3.4.0 version`. Any missing: stop.
- [ ] **Step 2:** Set together `"@mcp-abap-adt/adt-clients": "^34.1.0"`, `"@mcp-abap-adt/connection": "^18.0.0"`, `"@mcp-abap-adt/sap-rfc-lite": "^0.2.3"`, and `"@mcp-abap-adt/interfaces-auth-sap": "^3.4.0"` (connection 18 requires it); `npm install`.
- [ ] **Step 3:** Verify the one break of connection 18 does not reach the server: no code outside tests calls `rfcParamsFrom` or reads `.ashost` / `.sysnr` of its result (today only `rfcWireLogging.test.ts` builds an `{ ashost, sysnr }` literal; narrow it with `'ashost' in params` only if it no longer compiles).
- [ ] **Step 4:** Lockfile check: no `"link": true` but this repo's own workspace siblings; every third-party `resolved` under `https://registry.npmjs.org/`.
- [ ] **Step 5:** Run the gates; fix only what the bumps break (a credential refusal rethrown by adt-clients members — tests expect it as it came).
- [ ] **Step 6:** CHANGELOG 19.0.0 *Changed*: adt-clients `^34.1.0` (a credential refusal rethrown by every member; a batch corrects and resends nothing), connection `^18.0.0`, sap-rfc-lite `^0.2.3` (prebuilds for Linux glibc and win32-x64), interfaces-auth-sap `^3.4.0`.
- [ ] **Step 7:** Commit `chore: adt-clients 34.1, connection 18, sap-rfc-lite 0.2.3`.

### Task 2: RFC through a message server and a logon group

**Files:**
- Modify: the whole stdio chain — `server/src/launcher.ts` (its settings) → `server/src/auth/IAuthBrokerFactoryConfig.ts` (the fields on `IAuthBrokerFactoryConfig`) → `server/src/auth/brokerFactory.ts` (`readSettings`' `SapConfig` construction) — and `src/lib/config.ts` (`getConfig()`, the env → `SapConfig` read); `server/src/config/envFileContext.ts` (`ENV_FILE_CONTEXT_KEYS`, only if these are per-destination keys as `SAP_CLIENT` is), `server/src/config/coreParameters.ts` and `src/lib/config/authParameters.ts` (CLI / YAML forms, beside `--connection-type`), `server/src/launcher.ts` (help text), `tests/test-config.yaml.template`, the `.env` templates the docs show
- Test: `src/__tests__/unit/config/rfcMessageServer.test.ts`, `server/src/__tests__/rfcMessageServerParameters.test.ts`, `server/src/__tests__/rfcMessageServerChain.test.ts`

**Interfaces:**
- Consumes: `ISapConfig.mshost`, `.msserv`, `.sysid`, `.group`, `.saprouter` (Task 1).
- Produces: `SapConfig` carries `mshost`, `msserv`, `sysid`, `group`, `saprouter` exactly as configured. Environment names `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP`, `SAP_SAPROUTER` (owner-approved); CLI and YAML spellings follow the `connection-type` entry's form. The server adds no default (`group`'s `PUBLIC` is connection's) and decides nothing: a config with `mshost` and neither `msserv` nor `sysid` reaches connection, which refuses it naming both.

- [ ] **Step 1: Write the failing tests** — `rfcMessageServer.test.ts`: `each of SAP_MSHOST, SAP_MSSERV, SAP_SYSID, SAP_GROUP, SAP_SAPROUTER reaches the SapConfig handed to createConnection, as given (trimmed only as SAP_CLIENT is)`; `absent fields are absent, not defaulted (no group: PUBLIC from the server)`; `mshost without msserv and sysid: connection's refusal reaches the caller as it came, naming both`; `with mshost, SAP_SYSNR is not read by the server either`. `rfcMessageServerParameters.test.ts`: `the CLI and YAML forms reach the same fields`; `another binary's form of them stops the start as other foreign parameters do`. `rfcMessageServerChain.test.ts` (launcher → broker factory, `createConnection` captured): for each input — process env, destination `.env` file, CLI, YAML — `the settings handed to createConnection carry the five fields as given`; `an absent field stays absent (no key, not undefined-as-default)`.
- [ ] **Step 2:** Run `npm test -- src/__tests__/unit/config/rfcMessageServer.test.ts server/src/__tests__/rfcMessageServerParameters.test.ts` — FAIL.
- [ ] **Step 3:** Carry the five fields through every configuration path (process env, destination `.env`, YAML, CLI) into `SapConfig`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** drop `saprouter` from the carry; default `group` in the server — each red; revert.
- [ ] **Step 6:** Docs: README (RFC section), `docs/user-guide/CLI_OPTIONS.md`, `docs/user-guide/CLIENT_CONFIGURATION.md`, `docs/installation/**` where RFC is configured, the config templates; CHANGELOG 19.0.0 *Added*: RFC through a message server and a logon group.
- [ ] **Step 7:** Commit `feat: RFC through a message server and a logon group`.

### Task 3: The owner — `InstanceBatch`, its refusals, the `batch` option

**Files:**
- Create: `src/lib/batch/InstanceBatch.ts`, `src/lib/config/batchKeepRawParts.ts`
- Modify: `src/lib/auth/serverRefusal.ts`, `src/embeddable/BaseMcpServer.ts` (constructor options, field), `src/embeddable/EmbeddableMcpServer.ts`, `server/src/StdioServer.ts`, `server/src/launcher.ts`, `sse/src/SseServer.ts`, `sse/src/launcher.ts`, `http/src/StreamableHttpServer.ts` (`createPerRequestServer`), `src/lib/config/IServerConfig.ts`, `src/lib/config/authParameters.ts`, `src/lib/config/index.ts`
- Test: `src/__tests__/unit/batch/instanceBatch.test.ts`, `src/__tests__/unit/config/batchKeepRawParts.test.ts`

**Interfaces:**
- Produces:
  - `class InstanceBatch implements StatePart` with `constructor(options: { keepRawParts: boolean })`; `mode(): 'off' | 'communication' | 'debugger'`; `begin(kind: 'communication' | 'debugger', open: OpenBatch): void`; `nextNumber(): number`; `signal(): AbortSignal`; `end(answers: ReadonlyMap<number, BatchAnswer>): void` (mode off, answers replaced); `drop(): void` (mode off, nothing sent, signal aborted, answers gone); `answer(n: number): BatchAnswer | undefined`; `keepRawParts: boolean`.
  - `interface OpenBatch { connection: AdtBatchConnection; recorded: RecordedCall[] }`; `interface RecordedCall { number: number; answer: Promise<BatchAnswer>; raw?: RawPart }`; `type BatchAnswer = { number: number; content: CallToolResult['content']; isError?: true; raw?: RawPart }` (MCP SDK type); `type RawPart = { status: number; status_text: string; headers: Record<string, string>; body: string }`.
  - `ServerRefusalCode` adds `batch_mode_unavailable`, `batch_mode_on`, `batch_mode_other`, `batch_mode_off`, `batch_not_recordable`, `batch_no_timeout`, `debug_batch_amdp_unmeasured`, with words from spec §8 and §4.4 (exact copy).
  - `BaseMcpServer` option `batch?: InstanceBatch`; attached to `this.state` at construction.
  - `readBatchKeepRawParts(config): boolean` (default `false`), YAML `batch.keepRawParts`, in the form of the `stateIdleMinutes` entry.

- [ ] **Step 1: Write the failing tests** — `instanceBatch.test.ts`: `numbers start at 1 and follow nextNumber calls`; `holdsState is true while open or while answers are kept, false after drop`; `begin while a batch is open throws batch_mode_on / batch_mode_other by kind`; `end replaces the answers; answers stay readable until the next end`; `dispose drops an open batch and the answers, sends nothing`; `signal aborts on drop and dispose, not on end`. `batchKeepRawParts.test.ts`: `absent → false`; `true from YAML batch.keepRawParts`; `a non-boolean is refused at start`.
- [ ] **Step 2:** Run `npm test -- src/__tests__/unit/batch/instanceBatch.test.ts src/__tests__/unit/config/batchKeepRawParts.test.ts` — FAIL (module not found).
- [ ] **Step 3:** Implement `InstanceBatch` (no module state), the refusal codes and words, the config reader, the constructor option; each launcher creates `new InstanceBatch({ keepRawParts })` per instance it builds (stdio its one, HTTP one per `createPerRequestServer`, SSE one per connection); `EmbeddableMcpServer` passes its embedder's.
- [ ] **Step 4:** Run the tests — PASS.
- [ ] **Step 5: Break it:** start the counter at 0; make `holdsState()` ignore kept answers — each red; revert.
- [ ] **Step 6:** Docs: `src/embeddable/docs/ARCHITECTURE.md` (the owner, the option), `docs/MIGRATION-19.0.md` (embedders: `batch` option, absent → `batch_mode_unavailable`), `docs/user-guide/CLI_OPTIONS.md` and the config template (`batch.keepRawParts`).
- [ ] **Step 7:** Commit `feat: instance batch owner`.

### Task 4: Eligibility — `tools/batch-handlers.json` and its proof

**Files:**
- Create: `tools/batch-handlers.json`, `src/lib/batch/eligibility.ts`
- Test: `src/__tests__/unit/batch/eligibility.test.ts`, `src/__tests__/unit/sources/batchHandlers.test.ts`, `src/__tests__/unit/batch/oneRequestPerEntry.test.ts`

**Interfaces:**
- Produces: `eligible(tool: string, args: unknown, connection: 'http' | 'rfc'): Eligibility` with `type Eligibility = { ok: true } | { ok: false; reason: 'not-listed' | 'arguments' | 'connection' }`; entry shape `{ tool, set: 'full' | 'compact', handler: string, sends: string, when?: WhenRule, connection?: 'http' }`, `WhenRule = { argument: string; equals?: string[]; notEquals?: string[]; present?: boolean }[]` (all must hold; string compare upper-cased as `isLongRead` does; an absent `part` reads as `source`).

- [ ] **Step 1: Write the failing tests** — `eligibility.test.ts`: `a listed tool with no when is eligible`; `HandlerUpdate needs lock_handle; DOMAIN/DATA_ELEMENT/PACKAGE need document`; `HandlerCreate needs create_only true`; `HandlerGet part contents and UNIT_TEST/CDS_UNIT_TEST are not eligible; absent part reads as source`; `HandlerLock PACKAGE over rfc is not eligible`; `object_type 'domain' and 'DOMAIN' read the same` (Review Focus 3); `an unlisted tool is not eligible`. `batchHandlers.test.ts` (source test): every entry names a tool its set serves and a handler that exists; every entry's `sends` names one request; no entry's tool is one whose `tools/long-handlers.json` `sends` names more than one request; every entry has a case in `oneRequestPerEntry.test.ts`. `oneRequestPerEntry.test.ts`: for each entry, its handler with the entry's sample arguments against a counting fake connection issues exactly one `makeAdtRequest`.
- [ ] **Step 2:** Run them — FAIL.
- [ ] **Step 3:** Write the table per spec §4.2/§4.4 (eligible: `HandlerLock`, `HandlerUnlock`, `HandlerUpdate` source types with `lock_handle`, single-GET reads of full and compact, `SearchObject`, `GetSqlQuery`, `GetTableContents`, `GetATCFindings`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`, `HandlerSearch`, `HandlerGetData`, `HandlerProfileView`, `HandlerGet` per part; `HandlerCreate`/`create_only` and `HandlerUpdate`/`document` entries are added in Tasks 10 and 11); implement `eligible` reading the file once.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** add a second request to one listed handler (one-request test red); list `SearchSource` (source test red); revert.
- [ ] **Step 6:** Commit `feat: batch eligibility table`.

### Task 5: Recording — recorder, late-bound target, dispatch

**Files:**
- Create: `src/lib/batch/lateBound.ts`, `src/lib/batch/recorder.ts`
- Modify: `src/embeddable/BaseMcpServer.ts` (`runCall`: the batch branch after `systemBeforeTool`; registration sentence hook only in Task 7)
- Test: `src/__tests__/unit/batch/recording.test.ts`

**Interfaces:**
- Consumes: `InstanceBatch` (Task 3), `eligible` (Task 4).
- Produces: `class LateBoundConnection implements IAbapConnection` with `point(connection: IAbapConnection | undefined): void` (forwards `makeAdtRequest`, `connect`, `getBaseUrl`, `getSessionId`, `setSessionType`, `getSessionType`, `getSessionMode`); `createRecorder(batch: AdtBatchConnection, owner: InstanceBatch, onRecorded: (n: number) => void): Recorder` where `Recorder extends IAbapConnection` is marked with `exemptFromAcceptNegotiation(recorder)` at creation, takes `owner.nextNumber()` at its first `makeAdtRequest`, and keeps the raw part when `owner.keepRawParts`.

- [ ] **Step 1: Write the failing tests** — `recording.test.ts`: `an eligible call in batch mode answers { content: [] } before execute runs`; `the instance's connection receives no makeAdtRequest while recording`; `a handler with a pre-record delay: the envelope holds calls in call order`; `an ineligible call is refused batch_not_recordable, its handler not called, no number taken`; `a handler that refuses its arguments before sending answers at once and takes no number`; `while a batch is open a debugger tool, a leftover-session tool and a registry's own tool are refused "<tool> is not served while a batch is open"`; `a single-request long read is recorded: runLongCall and openFreshConnection not called`; `timeout given in batch mode is refused batch_no_timeout before recording`; `the recorded handler's request signal is the batch's: not aborted when the call ends`; `a recorded handler is not in inFlight: idle() resolves while it waits`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: the batch branch in `runCall` (refusals, recorder in `{ ...context, connection: recorder }`, the handler under `runWithRequestSignal(owner.signal(), …)`, the call awaiting "recorded or settled", a rejection handler on the handler's promise); the target pointed at the call's connection for its turn.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** await the part in the dispatch; return before the record; number at call entry; default eligibility to true; keep the long-read branch first — each red; revert.
- [ ] **Step 6:** Commit `feat: record single-request calls in batch mode`.

### Task 6: Execution and answers — `BatchEnd`, `BatchAnswers`

**Files:**
- Create: `src/lib/batch/execute.ts`, `src/lib/batch/answers.ts`
- Test: `src/__tests__/unit/batch/batchEnd.test.ts`, `src/__tests__/unit/batch/batchAnswers.test.ts`, `src/__tests__/unit/batch/noRetry.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: `executeBatch(owner: InstanceBatch, target: LateBoundConnection, connection: IAbapConnection): Promise<BatchSummary>` with `type BatchSummary = { recorded: number; failed: number[]; came?: unknown }`; `endBeforeExecute(owner: InstanceBatch, failure: McpResult): void` (every recorded call's answer is that failure, mode off); `readAnswers(owner: InstanceBatch, ask: { number?: number; numbers?: number[] }): BatchAnswer[]` with the "no answer with that number" entry `{ number, error: 'no_answer', message: 'no answer with that number' }`.

- [ ] **Step 1: Write the failing tests** — `batchEnd.test.ts`: `envelopes go on the connection BatchEnd took; none on the retired one; the retired one is not logged off under BatchEnd`; `execute rejecting: mode off, a second BatchEnd refused batch_mode_off, each envelope seen once`; `a lock part answers the tool's lock answer with its lock handle; a read part its projection; a 404 part the C6 failure`; `an envelope answered 500: every part's answer and BatchEnd's carry it as it came`; `not-sent parts answer the not-sent error`; `summary { recorded, failed }`; `empty batch answers { recorded: 0, failed: [] } and replaces the answers with none`; `credential refusal (own refusal.kind, refusal.reason, at; no response): BatchEnd answers it as answerRead does, every number answers it, mode off`; `answered refusal (cause.response.status === 401)`; `a resolve failing at BatchEnd: the call answers it, mode off, every recorded call's answer is it, nothing sent`; `keepRawParts off: no raw; on: raw { status, status_text, headers, body: "" for a bodyless 200 }`; `LOCK, read, UNLOCK, read interleaved: several envelopes, each number its own call's answer` (Review Focus 1). `batchAnswers.test.ts`: `number and numbers, in the order asked`; `both or neither refused`; `0, -1, 1.5 refused before anything runs; duplicates answered per occurrence` (Review Focus 2); `before any batch and an unknown number: no answer with that number`; `served while a batch is open`. `noRetry.test.ts` (real `AdtBatchConnection` 34.1.0): `406 (supported Accept named) and 415 parts are the calls' answers; each request sent once; no follow-up envelope`; `an envelope answered 406 is not sent again`; `the instance's plain connection still corrects outside the batch`; `a recorder created without exemptFromAcceptNegotiation is negotiated: its 406 part is corrected and a follow-up envelope sent`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `executeBatch` per spec §5.2 (try/finally: mode off whatever fails; await every recorded handler's answer; build summary; `owner.end`), `endBeforeExecute` wired in the dispatch's catch for `BatchEnd`, `readAnswers`.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** reset the mode only on success; answer the raw part instead of the handler's answer; wrap the recording call's connection; end batch mode only around `execute()`; drop `exemptFromAcceptNegotiation(recorder)` — each red; revert.
- [ ] **Step 6:** Commit `feat: BatchEnd executes, answers by number`.

### Task 7: Tool surface — groups, sets, descriptions

**Files:**
- Create: `src/lib/handlers/groups/BatchHandlersGroup.ts`, `src/lib/compact/batch/group.ts`, `src/lib/compact/batch/handleHandlerBatch.ts`
- Modify: `src/lib/toolSet.ts`, `src/embeddable/BaseMcpServer.ts` (registration sentence; `HandlerBatch` connectionless for `begin`/`answers`), `compact/tests/fixtures/surface.json`
- Test: `src/__tests__/unit/batch/surface.test.ts`

**Interfaces:**
- Consumes: Tasks 3–6.
- Produces: tools `BatchBegin` (answers `{ batch: 'on', state_handle }`), `BatchEnd`, `BatchAnswers` (`number` | `numbers`); compact `HandlerBatch` (`action: 'begin' | 'end' | 'answers'`, `number`/`numbers` only with `answers`); `batchSentence(tool: string, set: ToolSetKind): string` from spec §3 (exact copy).

- [ ] **Step 1: Write the failing test** — `surface.test.ts`: `full and read-only sets serve BatchBegin, BatchEnd, BatchAnswers; the compact sets HandlerBatch alone`; `no batch tool has a state_handle property`; `every tool's description ends with its sentence (eligible, eligible-by-arguments, ineligible; compact names HandlerBatch)`; `HandlerBatch begin/answers build no connection; number with another action refused`; `BatchBegin's and BatchEnd's descriptions are the spec's words`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the groups, the sets' wiring, the sentence at registration (handler groups and the `trackingRegistrations` proxy).
- [ ] **Step 4:** Run, and the compact surface test — PASS.
- [ ] **Step 5: Break it:** drop the sentence for one set — red; revert.
- [ ] **Step 6:** Docs: README "Batch mode" section; `docs/user-guide/BATCH_MODE.md` (new; the eligibility list rendered from `tools/batch-handlers.json`); `AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`, `AVAILABLE_TOOLS_HIGH.md`, `HANDLERS_MANAGEMENT.md`; `docs/architecture/STATEFUL_SESSION_GUIDE.md`, `docs/architecture/ARCHITECTURE.md`; `compact/README.md`, `compact/docs/AVAILABLE_TOOLS.md` (`HandlerBatch`); CHANGELOG 19.0.0 *Added*: batch mode.
- [ ] **Step 7:** Commit `feat: batch tools in every set`.

### Task 8: Close and dispose

**Files:**
- Modify: `src/lib/instanceClose.ts` (`ClosableInstance.dropBatch?(): void`, called beside `cutBackgroundRuns`), `src/embeddable/BaseMcpServer.ts`
- Test: `src/__tests__/unit/batch/closeWithBatch.test.ts`

**Interfaces:**
- Consumes: `InstanceBatch.drop` (Task 3).

- [ ] **Step 1: Write the failing tests** — `closeInstance with a batch open: zero envelopes, recorded handlers released, no unhandled rejection (plain-node recorder)`; `the idle bound fires with a batch open: nothing sent; BatchEnd then batch_mode_off; BatchAnswers no answer with that number` (Review Focus 4); `an SSE close drops the connection's batch with nothing sent` (in `sse/src/__tests__/batchClose.test.ts`); `stdio: the batch is the one instance's`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement `dropBatch` and its call.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** omit `dropBatch` — red; revert.
- [ ] **Step 6:** Commit `feat: an instance's close drops its batch`.

### Task 9: HTTP — `x-mcp-state-handle`

**Files:**
- Modify: `http/src/StreamableHttpServer.ts` (handle read), `http/src/InstancePool.ts` (`handleOf` unchanged; header first)
- Test: `http/src/__tests__/batchHeader.test.ts`

**Interfaces:**
- Produces: `handleFrom(headers: IncomingHttpHeaders, body: unknown): string | undefined` — `x-mcp-state-handle` first, else `handleOf(body)`.

- [ ] **Step 1: Write the failing tests** — `the header routes to the pooled instance, ahead of the tools/call argument`; `a debugger tool's argument still routes`; `BatchBegin holds state and answers the handle; a later call with the header is recorded there`; `no header → a fresh instance: BatchAnswers no answer with that number`; `a dropped BatchEnd request keeps its answers`; `two requests with the same header at once: both recorded, numbered in arrival order` (Review Focus 5).
- [ ] **Step 2:** Run `npm test -- http/src/__tests__/batchHeader.test.ts` — FAIL.
- [ ] **Step 3:** Implement `handleFrom` and use it in the request handler.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** read only the argument; `holdsState()` false while open — each red; revert.
- [ ] **Step 6:** Docs: `http/README.md`, `docs/user-guide/CLIENT_CONFIGURATION.md` (the header on every call of a batch).
- [ ] **Step 7:** Commit `feat(http): x-mcp-state-handle routes a batch`.

### Task 10: Compact `HandlerCreate` `create_only`

**Files:**
- Modify: `src/lib/compact/compactSchemas.ts` (`compactCreateSchema.create_only`), `compact-modify/src/handlers/handleHandlerCreate.ts`, `compact-modify/src/handlers/compactWriteRoutes.ts` (create-only routes), `tools/batch-handlers.json`
- Test: `compact-modify/src/__tests__/createOnly.test.ts`

**Interfaces:**
- Produces: `routeCompactCreateOnly(context: HandlerContext, args: HandlerCreateArgs): Promise<unknown>`; schema `create_only: { type: 'boolean', default: false, description: <spec §4.6 words> }`; refusal "create_only is not available for <type>: its create sends more than one request".

- [ ] **Step 1: Write the failing tests** — per type in the create route: `create_only sends exactly one POST, the create's, nothing else`; `a type whose create() sends more refuses create_only before sending`; `without create_only the high create runs unchanged`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement; add the `HandlerCreate` entry (`when: create_only true`) to `tools/batch-handlers.json` with its one-request case.
- [ ] **Step 4:** Run, with Task 4's tests — PASS.
- [ ] **Step 5: Break it:** route `create_only` to the high create — red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/tests/fixtures/surface.json`, CHANGELOG 19.0.0 *Added*.
- [ ] **Step 7:** Commit `feat(compact): HandlerCreate create_only`.

### Task 11: Compact `HandlerUpdate` `document` under a lock

**Files:**
- Modify: `src/lib/compact/compactSchemas.ts` (`compactUpdateSchema.document`), `src/handlers/common/low/handleUpdateUnderLock.ts`, `tools/batch-handlers.json`
- Test: `src/__tests__/unit/compact/documentUnderLock.test.ts`

**Interfaces:**
- Produces: schema `document: { type: 'string', description: <spec §4.6 words> }`; for DOMAIN, DATA_ELEMENT, PACKAGE with `lock_handle` + `document`: `get<Type>().updateMetadata({ name, transportRequest }, { source: document, lockHandle, analyse })`.

- [ ] **Step 1: Write the failing tests** — `one PUT, body the given document byte for byte, the given lock handle, no read`; `document without lock_handle refused before sending`; `document beside properties refused before any request`; parameterised over every flat metadata field `propertiesOf()` reads (`FLAT_PROPERTIES` of `handleUpdateUnderLock.ts`: `description`, `datatype`, `length`, `decimals`, `conversion_exit`, `lowercase`, `sign_exists`, `value_table`, `fixed_values`) × the values `false`, `0`, `''`: `document beside <field> = <value> refused before any request` (presence, not truthiness); `transport_request beside document is accepted` (it is the write's transport, not metadata); `properties alone keeps the read-patch-write`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: the refusal of `document` beside `properties` or any of those fields (`!== undefined`), before any request; the `document` write; add the three `HandlerUpdate`/`document` entries.
- [ ] **Step 4:** Run, with Task 4's tests — PASS.
- [ ] **Step 5: Break it:** read before writing; test the fields by truthiness — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, surface fixture, CHANGELOG 19.0.0 *Added*.
- [ ] **Step 7:** Commit `feat(compact): HandlerUpdate document under a lock`.

### Task 12: The debugger batch

**Files:**
- Create: `src/lib/handlers/groups/DebugBatchHandlersGroup.ts`, `src/lib/compact/debug/handleHandlerDebugBatch.ts`
- Modify: `src/lib/debugger/DebugSession.ts` (batch path: `recordStep`, `recordStepToLine`, `recordStack`, `recordVariables`, `recordChildVariables`, `recordStackPosition`, `recordSetVariable` — outside `mutate`), `src/lib/debugger/ownConnectionTools.ts` (the three tools), the debugger tool handlers of spec §7's table, `src/lib/toolSet.ts`
- Test: `src/__tests__/unit/debugger/debugBatch.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6.
- Produces: `DebugBatchBegin` / `DebugBatchEnd` (full), `HandlerDebugBatch` (`action: 'begin' | 'end' | 'answers'`, compact); `DebugSession.openBatch(): AdtBatchConnection` over `Stop.connection` with `endpoint: 'debugger'`.

- [ ] **Step 1: Write the failing tests** — `begin needs an ABAP stop`; `step + stack + variables recorded into one debugger envelope on the stop's connection`; `the second recorded call is recorded while the first waits` (no deadlock); `DebugBatchEnd keeps answers by number, mode off, leaves the stop as it was (no releaseStop, no view change), also when a step's answer says the program ended`; `step to line without object_type/object_name refused`; `AMDP stop refused debug_batch_amdp_unmeasured`; `begin of either batch refused while the other is open`; `breakpoint and listener tools refused while open`; `DebugBatch* only in full, HandlerDebugBatch only in compact`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** record inside `mutate` — red; revert.
- [ ] **Step 6:** Docs: `docs/user-guide/DEBUGGER.md` (the debugger batch, AMDP not offered yet), CHANGELOG 19.0.0 *Added*.
- [ ] **Step 7:** Commit `feat: debugger batch`.

### Task 13: Internal batches — `runPhase` and batch availability

**Files:**
- Create: `src/lib/batch/phases.ts`, `src/lib/batch/availability.ts`
- Modify: `src/embeddable/BaseMcpServer.ts` (the destination record owns the availability port; `HandlerContext` gets it), `src/handlers/interfaces.ts` (`HandlerContext.batchAvailability?`), `src/lib/longCall.ts` (the port carried into the fresh long-call context `runLongCall` builds from `openFreshConnection`)
- Test: `src/__tests__/unit/batch/phases.test.ts`, `src/__tests__/unit/batch/availability.test.ts`, `src/__tests__/unit/batch/availabilityAcrossFreshConnections.test.ts`

**Interfaces:**
- Produces:
  - `interface BatchAvailability { available(): boolean; noteOuterStatus(status: number): void }` — **destination-scoped**: one per destination record of the instance (the record `destinationSystems` keeps today, found by the resolved credential and target), never keyed by a connection object; `HandlerContext.batchAvailability?: BatchAvailability`, set by the dispatch from the call's destination and kept in every context derived from it (`{ ...context, connection: own }` in `runLongCall`, inner handlers' contexts).
  - `runPhase<I, R>(context: HandlerContext, items: readonly I[], read: (item: I, batch: IAbapConnection) => Promise<R>): Promise<PhaseResult<R>[]>` with `type PhaseResult<R> = { ok: true; value: R } | { ok: false; error: unknown }` (a credential refusal rethrown, never a result); it batches over `context.connection` and reports the outer status to `context.batchAvailability`.
  - `withSequentialFallback<R>(context: HandlerContext, batched: () => Promise<R>, sequential: () => Promise<R>): Promise<R>` — `sequential` when `context.batchAvailability?.available() === false`, or when the first envelope of `batched` meets the outer `404`.

- [ ] **Step 1: Write the failing tests** (real `AdtBatchConnection` 34.1.0) — `phases.test.ts`: `all items in one envelope; results in item order`; `a part's 404 is that item's failure, the rest answer`; `an envelope failure is every item's, as it came`; `a credential refusal rethrows`. `availability.test.ts`: `an outer 404 the transport rejects (with response) marks the destination; that call and later ones run sequentially`; `an outer 404 a connection resolves without a multipart body marks it (via the forwarding connection under the batch)`; `an inner part's 404 leaves batching on`; `any other envelope failure is not a verdict`. `availabilityAcrossFreshConnections.test.ts` (a served long-read tool, two calls of one destination, each on its own fresh connection from `openFreshConnection`): `after the first call's outer 404 the second call sends no envelope and runs sequentially`; `a call of another destination still sends its envelope`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** treat every envelope failure as "no batch"; read the parser's error instead of the outer status; key the availability by connection object (the second fresh connection then sends an envelope) — each red; revert.
- [ ] **Step 6:** Commit `feat: internal batch phases and availability`.

### Task 14: Package walks on batches

**Files:**
- Modify: `src/lib/strategies/packageWalk.ts` (`walkPackage` by levels), `src/handlers/package/readonly/handleGetPackageContents.ts`, `src/handlers/system/high/handleGetPackageTree.ts`, `src/handlers/search/readonly/handleGetObjectsList.ts`, `src/handlers/system/readonly/handleGetObjectInfo.ts`, `compact-readonly-entries/src/handlers/handleHandlerGet.ts` (part `contents`), `tools/long-handlers.json` (`sends`)
- Test: `src/__tests__/unit/batch/packageWalks.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)`, `HandlerContext.batchAvailability` (Task 13).
- Produces: schemas — `GetPackageContents.package_names: string[]`, `GetPackageTree.package_names: string[]`, `GetObjectsList.objects: [{ parent_type, parent_name }]` (names checked against the tool's current arguments), `GetObjectInfo.objects: [{ object_type, object_name }]`, `HandlerGet` part `contents` `package_names`; exactly one of single/list.

- [ ] **Step 1: Write the failing tests** — per tool on fixtures: `same answer as the sequential version`; `envelopes per spec §11's row (per level: roots, then type nodes)`; `no envelope holds a request needing another of its parts`; `several roots: the envelope count does not grow with their number`; `a part failure is that item's`; `credential refusal ends the call as it came`; `no communication batch → the sequential path`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** send a level's requests one by one — red; revert.
- [ ] **Step 6:** Docs: `AVAILABLE_TOOLS*.md` (the list arguments; reads in envelopes), compact docs, CHANGELOG 19.0.0 *Changed*.
- [ ] **Step 7:** Commit `feat: package walks read in envelopes`.

### Task 15: `SearchSource` on batches

**Files:**
- Modify: `src/handlers/system/readonly/handleSearchSource.ts` (schema: `concurrency` removed), `src/lib/search-source/orchestrator.ts`, `src/lib/search-source/packageResolver.ts`, `src/lib/search-source/sourceReader.ts`
- Test: `src/__tests__/unit/batch/searchSource.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)` (Task 13); `walkPackage` by levels (Task 14).

- [ ] **Step 1: Write the failing tests** — `same hits as the sequential version`; `phases: masks, walk levels, sources up to max_objects`; `time_budget_ms checked between phases, truncated.by_timeout as today`; `no concurrency in the schema`; part failure; credential refusal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** check the budget only at the end — red; revert.
- [ ] **Step 6:** Docs and CHANGELOG 19.0.0 *Changed* (`concurrency` removed). Commit `feat: SearchSource reads in envelopes`.

### Task 16: Include, structure and enhancement trees on batches

**Files:**
- Modify: `src/handlers/include/readonly/handleGetIncludesList.ts`, `src/handlers/structure/readonly/handleGetStructuresList.ts`, `src/handlers/enhancement/readonly/handleGetEnhancements.ts`, `tools/long-handlers.json`
- Test: `src/__tests__/unit/batch/includeTrees.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)`, `HandlerContext.batchAvailability` (Task 13).
- Produces: `GetIncludesList.objects`, `GetStructuresList.structure_names`, `GetEnhancements.objects` (exactly one of single/list).

- [ ] **Step 1: Write the failing tests** — per tool: same answer; phases per spec §11 (includes per depth up to 20; structure-then-table; where-used pairs; candidates; enhancement probes one per phase, then enhancements + root, includes node, nested up to `max_includes`); several objects; part failure; credential refusal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** join the table read into the structure phase — red; revert.
- [ ] **Step 6:** Docs, CHANGELOG. Commit `feat: include and structure trees read in envelopes`.

### Task 17: Lists of objects on batches — `ListTransports`, `DescribeByList`, `GetAbapSystemSymbols`

**Files:**
- Modify: `src/handlers/transport/readonly/handleListTransports.ts`, `src/handlers/system/readonly/handleDescribeByList.ts`, `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts`
- Test: `src/__tests__/unit/batch/objectLists.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)`, `HandlerContext.batchAvailability` (Task 13).

- [ ] **Step 1: Write the failing tests** — `ListTransports: configurations, then every configuration's GET in one envelope`; `DescribeByList: all quickSearches, then the typeless ones for the empty answers`; `GetAbapSystemSymbols: each phase only independent requests; a failed call answers the error, nothing retried`; same answers; part failure; credential refusal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** put a dependent request in the first envelope — red; revert.
- [ ] **Step 6:** Docs, CHANGELOG. Commit `feat: object lists read in envelopes`.

### Task 18: Where-used and feeds on batches, several objects per call

**Files:**
- Modify: `src/handlers/system/readonly/handleGetWhereUsed.ts`, `compact-readonly-entries/src/handlers/handleHandlerWhereUsed.ts`, `src/handlers/system/readonly/handleRuntimeListFeeds.ts`, `compact-readonly-entries/src/handlers/handleHandlerDumpList.ts`
- Test: `src/__tests__/unit/batch/whereUsedAndFeeds.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)`, `HandlerContext.batchAvailability` (Task 13).
- Produces: `GetWhereUsed.objects: [{ object_type, object_name }]` (and `HandlerWhereUsed`), `RuntimeListFeeds.feed_types: string[]` (and `HandlerDumpList`).

- [ ] **Step 1: Write the failing tests** — `where-used: one envelope of every object's scope, one of every scoped request — two for any number`; `feeds: every feed's first GET in one envelope, then per round the next page of every feed still paging`; single argument keeps today's answer shape; list answers one entry per object in order; part failure; credential refusal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** read each object's chain on its own — the envelope count grows, red; revert.
- [ ] **Step 6:** Docs, CHANGELOG. Commit `feat: where-used and feeds read several objects in envelopes`.

### Task 19 (live, needs the owner's VPN/tunnel, run only on his word): communication batch

**Files:**
- Create: `src/__tests__/integration/batch/communicationBatch.test.ts`; `tests/test-config.yaml.template` (`batch.test_cases.communication`, disabled)

- [ ] **Step 1:** Write the test: hard mode through the served tools; N reads; then compact `HandlerCreate` `create_only` × N, `HandlerLock` × N, `HandlerUpdate` (`document` for DOMAIN, sources) × N, `HandlerUnlock` × N, each phase a batch; answers per number; cleanup. States where it runs (on-premise HTTP, on-premise RFC, ABAP Cloud), skips elsewhere with the reason.
- [ ] **Step 2:** On the owner's word, run on each; record the results with the date in `docs/user-guide/BATCH_MODE.md`. Commit.

### Task 20 (live, owner's VPN/tunnel, on his word): debugger batch and AMDP

- [ ] **Step 1:** `src/__tests__/integration/batch/debuggerBatch.test.ts`: at a live stop, step + stack + variables in one `DebugBatchEnd` (on-premise, ABAP Cloud); and the AMDP gate (on-premise on HANA). States where it runs.
- [ ] **Step 2:** On the owner's word, run; record in `DEBUGGER.md`. The AMDP refusal stays until the AMDP case passes; lifting it is its own commit then. Commit.

### Task 21 (live, owner's VPN/tunnel, on his word): a system without the communication batch

- [ ] **Step 1:** `src/__tests__/integration/batch/noCommunicationBatch.test.ts`: the first envelope's outer status; the destination marked; reads run sequentially. States where it runs.
- [ ] **Step 2:** On the owner's word, run; record the measured answer in `BATCH_MODE.md`. Commit.

### Task 22 (live, owner's VPN/tunnel, on his word): before/after timing of the internally batched reads

- [ ] **Step 1:** `src/__tests__/integration/batch/batchedReadsTiming.test.ts`: every tool of Tasks 14–18, sequential (the fallback path) and batched: answers equal, time measured; on-premise HTTP, on-premise RFC, ABAP Cloud. States where it runs.
- [ ] **Step 2:** On the owner's word, run; record with the date in `BATCH_MODE.md`. Commit.

### Task 23 (live, owner's VPN/tunnel, on his word): the two earlier checks

- [ ] **Step 1:** `src/__tests__/integration/batch/refusalFollowUps.test.ts`: the logoff after a credential refusal asks no provider; the debugger stop's second `stopListener` after a refusal. States where each runs.
- [ ] **Step 2:** On the owner's word, run; record. Commit.

### Task 24 (live, owner's VPN/tunnel, on his word): RFC through a message server

- [ ] **Step 1:** `src/__tests__/integration/rfc/messageServer.test.ts`: a logon through `mshost` + `sysid` (and `mshost` + `msserv`), `group`, and with `saprouter` where the system needs one; one read through the server. States where it runs (a system with a message server), skips elsewhere with the reason.
- [ ] **Step 2:** On the owner's word, run; record the result with the date in the RFC docs (whether `mshost` + `msserv` without `sysid` is accepted). Commit.

### Task 25: Final consistency

- [ ] **Step 1:** Re-read README, `docs/**`, compact docs and the CHANGELOG 19.0.0 entry against the code; fix what drifted. Nothing under `docs/superpowers/` is deleted here (that happens before the release, as a later step).
- [ ] **Step 2:** All gates on the final tree. Commit `docs: batch mode docs consistent`.
