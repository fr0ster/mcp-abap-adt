# Batch Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The model records ADT tool calls whose requests do not depend on each other's answers into a batch, sends them in multipart envelopes at `BatchEnd` and reads each call's answer by number; the debugger gets the same for the operations at a stop; and every multi-request read sends its independent requests in envelopes inside its one call.

**Architecture:** A host-created owner per MCP instance (`InstanceBatch`, a `StatePart`) holds the open batch and the last answers. In batch mode the dispatch in `BaseMcpServer.runCall` hands an eligible handler a per-call recorder over adt-clients' `AdtBatchConnection`, which wraps a late-bound target pointing at the instance's connection in force; `BatchEnd` executes and each handler builds its own answer. The multi-request reads run in phases through a shared `runPhase` over the same adt-clients class.

**Tech Stack:** TypeScript, `@mcp-abap-adt/adt-clients` `AdtBatchConnection` + `exemptFromAcceptNegotiation`, MCP SDK 1.32, Jest (ts-jest), Biome.

**Spec:** `docs/superpowers/specs/2026-10-16-batch-mode-design.md` (answers `docs/superpowers/2026-10-16-batch-mode-goal.md`).

## Global Constraints

- `@mcp-abap-adt/adt-clients` `^34.1.0`, `@mcp-abap-adt/connection` `^18.0.0`, `@mcp-abap-adt/sap-rfc-lite` `^0.2.3`, `@mcp-abap-adt/interfaces-auth-sap` `^3.4.0` — bumped together, from the registry (Task 1 is the gate); registry-only dependencies, no `file:`/`link:`/workspace link outside this repo; after install the lockfile holds nothing not resolved from the registry.
- No retries in a batch: a part's `401`/`406`/`415` is that call's answer; nothing recorded is corrected or sent again (adt-clients 34; every recorder marked `exemptFromAcceptNegotiation`).
- The batch criterion: no request of a recorded call depends on another's answer (one request, or several independent ones); chains, `404` fallbacks and polling are refused, and so is a tool that sends no request. One number per call, covering all its parts; numbers only for calls that put a request into an envelope, from 1, in the order made.
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

1. A call of a kind the batch does not hold (a read after a LOCK) arriving between eligible calls: refused with `batch_other_kind`, and the batch's numbers stay consecutive → test in Task 10.
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
  - `interface OpenBatch { connection: AdtBatchConnection; recorded: RecordedCall[] }`; `interface RecordedCall { number: number; answer: Promise<BatchAnswer>; raw: RawPart[] }`; `type BatchAnswer = { number: number; content: CallToolResult['content']; isError?: true; raw?: RawPart[] }` (MCP SDK type); `type RawPart = { status: number; status_text: string; headers: Record<string, string>; body: string }`.
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
- Test: `src/__tests__/unit/batch/eligibility.test.ts`, `src/__tests__/unit/sources/batchHandlers.test.ts`, the per-entry proof test (implemented in `9a9213a4`)

**Interfaces:**
- Produces: `eligible(tool: string, args: unknown, connection: 'http' | 'rfc'): Eligibility` with `type Eligibility = { ok: true } | { ok: false; reason: 'not-listed' | 'arguments' | 'connection' }`; entry shape `{ tool, set: 'full' | 'compact', handler: string, sends: string /* may name several independent requests */, when?: WhenRule, connection?: 'http' }`, `WhenRule = { argument: string; equals?: string[]; notEquals?: string[]; present?: boolean }[]` (all must hold; string compare upper-cased as `isLongRead` does; an absent `part` reads as `source`).

- [ ] **Step 1: Write the failing tests** — `eligibility.test.ts`: `a listed tool with no when is eligible`; `HandlerGet part contents and UNIT_TEST/CDS_UNIT_TEST are not eligible; absent part reads as source`; `HandlerLock PACKAGE over rfc is not eligible`; `object_type 'domain' and 'DOMAIN' read the same` (Review Focus 3); `an unlisted tool is not eligible`. `batchHandlers.test.ts` (source test): every entry names a tool its set serves and a handler that exists; every entry has a proof case. The per-entry proof: for each entry, its handler with the entry's sample arguments sends the same requests while they are held **pending** as when they are **answered** (an answer document, and a `404`), and at least one; a tool that sends none is not listed.
- [ ] **Step 2:** Run them — FAIL.
- [ ] **Step 3:** Write the table per spec §4.2/§4.4 (eligible: every tool none of whose requests depends on another's answer — `HandlerLock`, `HandlerUnlock`, `HandlerUpdate` source types with `lock_handle`, the reads of full and compact, the twelve `Read<Type>` tools and `GetObjectVersionDiff` sending source and metadata together via `both()`, `SearchObject`, `GetSqlQuery`, `GetTableContents`, `GetATCFindings`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace`, `HandlerSearch`, `HandlerGetData`, `HandlerProfileView`, `HandlerGet` per part; the compact entries are settled in Tasks 10–20); implement `eligible` reading the file once.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** make a listed handler send a request built from the first's answer (pending ≠ answered, red); list a tool that sends none (red); list `SearchSource` (red); revert.
- [ ] **Step 6:** Commit `feat: batch eligibility table`.

### Task 5: Recording — recorder, late-bound target, dispatch

**Files:**
- Create: `src/lib/batch/lateBound.ts`, `src/lib/batch/recorder.ts`
- Modify: `src/embeddable/BaseMcpServer.ts` (`runCall`: the batch branch after `systemBeforeTool`; registration sentence hook only in Task 7)
- Test: `src/__tests__/unit/batch/recording.test.ts`

**Interfaces:**
- Consumes: `InstanceBatch` (Task 3), `eligible` (Task 4).
- Produces: `class LateBoundConnection implements IAbapConnection` with `point(connection: IAbapConnection | undefined): void` (forwards `makeAdtRequest`, `connect`, `getBaseUrl`, `getSessionId`, `setSessionType`, `getSessionType`, `getSessionMode`); `createRecorder(batch: AdtBatchConnection, owner: InstanceBatch, onRecorded: (n: number) => void): Recorder` where `Recorder extends IAbapConnection` is marked with `exemptFromAcceptNegotiation(recorder)` at creation, takes `owner.nextNumber()` at its first `makeAdtRequest` and keeps that number for every further request of the call, and keeps each part's raw answer when `owner.keepRawParts`; `untilSent(handler: Promise<unknown>, recorder: Recorder): Promise<'recorded' | 'settled'>` — resolves once the handler has recorded everything it sends before an answer (a full event-loop turn, `setImmediate`, passes with no new request recorded, the same turn adt-clients' `execute()` yields for follow-ups — no timer) or has settled. `eligible()` is called on the arguments as the SDK parsed them, the object the handler receives.

- [ ] **Step 1: Write the failing tests** — `recording.test.ts`: `an eligible call in batch mode answers { content: [] } before execute runs`; `the instance's connection receives no makeAdtRequest while recording`; `a handler with a pre-record delay: the envelope holds calls in call order`; `a call sending two independent parts (a Read<Type>) takes one number for both`; `the call returns only after its second part is recorded: the next call's parts follow both, never between them`; `eligible() receives the SDK-parsed arguments (a schema default applied, an unknown key stripped)`; `an ineligible call is refused batch_not_recordable, its handler not called, no number taken`; `a handler that refuses its arguments before sending answers at once and takes no number`; `while a batch is open a debugger tool, a leftover-session tool and a registry's own tool are refused "<tool> is not served while a batch is open"`; `a long read with independent requests is recorded: runLongCall and openFreshConnection not called`; `timeout given in batch mode is refused batch_no_timeout before recording`; `the recorded handler's request signal is the batch's: not aborted when the call ends`; `a recorded handler is not in inFlight: idle() resolves while it waits`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: the batch branch in `runCall` (refusals, recorder in `{ ...context, connection: recorder }`, the handler under `runWithRequestSignal(owner.signal(), …)`, the call awaiting "recorded or settled", a rejection handler on the handler's promise); the target pointed at the call's connection for its turn.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** await the part in the dispatch; return before the record; return after the first request (the next call's part interleaves); number per request; number at call entry; call `eligible()` on the raw request arguments; default eligibility to true; keep the long-read branch first — each red; revert.
- [ ] **Step 6:** Commit `feat: record independent calls in batch mode`.

### Task 6: Execution and answers — `BatchEnd`, `BatchAnswers`

**Files:**
- Create: `src/lib/batch/execute.ts`, `src/lib/batch/answers.ts`
- Test: `src/__tests__/unit/batch/batchEnd.test.ts`, `src/__tests__/unit/batch/batchAnswers.test.ts`, `src/__tests__/unit/batch/noRetry.test.ts`

**Interfaces:**
- Consumes: Tasks 3–5.
- Produces: `executeBatch(owner: InstanceBatch, target: LateBoundConnection, connection: IAbapConnection): Promise<BatchSummary>` with `type BatchSummary = { recorded: number; failed: number[]; came?: unknown }`; `endBeforeExecute(owner: InstanceBatch, failure: McpResult): void` (every recorded call's answer is that failure, mode off); `readAnswers(owner: InstanceBatch, ask: { number?: number; numbers?: number[] }): BatchAnswer[]` with the "no answer with that number" entry `{ number, error: 'no_answer', message: 'no answer with that number' }`.

- [ ] **Step 1: Write the failing tests** — `batchEnd.test.ts`: `envelopes go on the connection BatchEnd took; none on the retired one; the retired one is not logged off under BatchEnd`; `execute rejecting: mode off, a second BatchEnd refused batch_mode_off, each envelope seen once`; `a lock part answers the tool's lock answer with its lock handle; a read part its projection; a 404 part the C6 failure`; `a call with two independent parts answers the handler's one answer built from both, under its one number`; `an envelope answered 500: every part's answer and BatchEnd's carry it as it came`; `not-sent parts answer the not-sent error`; `summary { recorded, failed }`; `empty batch answers { recorded: 0, failed: [] } and replaces the answers with none`; `credential refusal (own refusal.kind, refusal.reason, at; no response): BatchEnd answers it as answerRead does, every number answers it, mode off`; `answered refusal (cause.response.status === 401)`; `a resolve failing at BatchEnd: the call answers it, mode off, every recorded call's answer is it, nothing sent`; `keepRawParts off: no raw; on: raw is one entry per part, in the order sent, each { status, status_text, headers, body: "" for a bodyless 200 }`; `batchAnswers.test.ts`: `number and numbers, in the order asked`; `both or neither refused`; `0, -1, 1.5 refused before anything runs; duplicates answered per occurrence` (Review Focus 2); `before any batch and an unknown number: no answer with that number`; `served while a batch is open`. `noRetry.test.ts` (real `AdtBatchConnection` 34.1.0): `406 (supported Accept named) and 415 parts are the calls' answers; each request sent once; no follow-up envelope`; `an envelope answered 406 is not sent again`; `the instance's plain connection still corrects outside the batch`; `a recorder created without exemptFromAcceptNegotiation is negotiated: its 406 part is corrected and a follow-up envelope sent`.
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

## Compact: one ADT request per tool call (spec §4.6)

The owner's survey of every compact tool (`.superpowers/sdd/2026-10-16-batch-mode/progress.md`, from "Survey of 32 compact tools", with its MEASURED lines) and what chains today:


- `HandlerCreate` → the full creates (`compact-modify/src/handlers/compactWriteRoutes.ts`): BEHAVIOR_DEFINITION create → lock → check → unlock → read → activate (`src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts:135-177`); CDS_UNIT_TEST checkCdsTestDoubles → create (`src/handlers/unit_test/high/handleCreateCdsUnitTest.ts:95-104`); DATA_ELEMENT validate → create → lock → readMetadata → updateMetadata → unlock → readMetadata → check → activate (`src/handlers/data_element/high/handleCreateDataElement.ts:213-311`); DOMAIN the same (`src/handlers/domain/high/handleCreateDomain.ts:197-290`); FUNCTION_GROUP create → readMetadata → activate (`src/handlers/function/high/handleCreateFunctionGroup.ts:118-154`); METADATA_EXTENSION create → lock → check → unlock → read → activate (`src/handlers/ddlx/high/handleCreateMetadataExtension.ts:114-158`); SERVICE_BINDING create → activate (`src/handlers/service_binding/high/handleCreateServiceBinding.ts:184-205`); SERVICE_DEFINITION create → lock → update → unlock → activate (`src/handlers/service_definition/high/handleCreateServiceDefinition.ts:129-179`); STRUCTURE validate → create → check → activate (`src/handlers/structure/high/handleCreateStructure.ts:230-264`); UNIT_TEST lock → update → unlock → activate (`writeClassTests`, `src/handlers/unit_test/shared/writeTests.ts:76-97`). One `create()` each (to be proven per type): BEHAVIOR_IMPLEMENTATION, CLASS, DDL, FUNCTION_MODULE, INTERFACE, PACKAGE, PROGRAM, TABLE, TRANSPORT. `create_only` (`src/handlers/common/low/handleCreateOnly.ts`, Task 10 as first implemented) already sends the one `POST` per type.
- `HandlerUpdate` without `lock_handle` → the full updates, each `withLock` lock → write → (check) → unlock → activate: BEHAVIOR_DEFINITION `:116`, BEHAVIOR_IMPLEMENTATION `:139`, CLASS `:107`, DATA_ELEMENT `:222`, DDL `:96`, DOMAIN `:185`, FUNCTION_GROUP `:97`, FUNCTION_MODULE `:124`, INTERFACE `:102`, LOCAL_DEFINITIONS / LOCAL_MACROS / LOCAL_TYPES `:100`, LOCAL_TEST_CLASS `:116`, METADATA_EXTENSION `:118`, PACKAGE `:94`, PROGRAM `:108`, SERVICE_BINDING `:267`, SERVICE_DEFINITION `:100`, STRUCTURE `:102`, TABLE `:103` (each `src/handlers/<type>/high/handleUpdate<Type>.ts`), UNIT_TEST / CDS_UNIT_TEST (`writeTests.ts:76-97`). With `lock_handle`: DOMAIN, DATA_ELEMENT, PACKAGE readMetadata → updateMetadata (`src/handlers/domain/low/handleUpdateDomain.ts:110-117`, `src/handlers/data_element/low/handleUpdateDataElement.ts:151-158`, `src/handlers/package/low/handleUpdatePackage.ts:130-137`); the source types one `PUT`.
- `HandlerDelete` → checkDeletion → delete for 19 types (`deleteIfDeletable`, `src/lib/strategies/checkedDeletion.ts:50-64`); LOCAL_TEST_CLASS / LOCAL_TYPES / LOCAL_DEFINITIONS / LOCAL_MACROS lock → update → unlock → activate (`src/handlers/class/high/handleDeleteLocal*.ts:86-121`); UNIT_TEST, CDS_UNIT_TEST (`writeTests.ts:76-97`; `handleDeleteCdsUnitTest.ts:85`).
- `HandlerGet`: part `metadata` sends source and metadata via `both()` for the source types (`src/handlers/<type>/readonly/handleRead<Type>.ts`), part `source` answers the metadata for DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, PACKAGE; FUNCTION_MODULE readMetadata → read with the group it names (`src/handlers/function_module/high/handleGetFunctionModule.ts:81-93`, `src/handlers/function_module/readonly/handleReadFunctionModule.ts:83-95`); `UNIT_TEST` / `CDS_UNIT_TEST` polling (`src/handlers/unit_test/high/handleGetUnitTest.ts:57-64`, `handleGetCdsUnitTest.ts:59-63`); part `urls` three reads in sequence (`src/handlers/system/readonly/handleGetServiceBindingPreviewUrl.ts:195-236`); part `contents` the package walk; `node_structure` of a `DEVC/K` parent reads the package first (`src/handlers/system/low/handleGetNodeStructure.ts:22-27`).


- `HandlerCreate` SERVICE_BINDING also reads the service group (`src/handlers/service_binding/high/handleCreateServiceBinding.ts:5-16`); FUNCTION_GROUP reads itself back after a `400` (`src/handlers/function/high/handleCreateFunctionGroup.ts:135`).
- The full updates read the object again after the unlock with long polling (e.g. `src/handlers/domain/high/handleUpdateDomain.ts:238`, `src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts:11`).
- `HandlerActivate` group/run path polls the run (`compact-modify/src/handlers/handleHandlerActivate.ts`); `HandlerUnitTestResult`, `HandlerCdsUnitTestResult` poll the status before the result (`compact-readonly-entries/src/handlers/handleHandlerUnitTestResult.ts`, `handleHandlerCdsUnitTestResult.ts`); `HandlerProfileRun` chains schedule → run (CLASS: list → schedule → run → poll the trace list) (`compact-modify/src/handlers/handleHandlerProfileRun.ts`); `HandlerDumpList` walks pages for a large `top` (`compact-readonly-entries/src/handlers/handleHandlerDumpList.ts:42`); `HandlerDebugStart` / `HandlerDebugStep` / stop chain requests and run a background listen loop (`src/lib/compact/debug/*.ts`, `src/lib/debugger/DebugSession.ts`).
- Owner's explicit exception: `HandlerGet` part `urls` stays as it is.

### Task 10: Every batch end: one envelope, homogeneous by session kind

**Files:**
- Modify: `src/lib/batch/InstanceBatch.ts` (the batch's kind), `src/lib/batch/execute.ts` (`BatchEnd` and `HandlerBatch` `end`), `src/embeddable/BaseMcpServer.ts` (the refusal); the debugger batch end follows in Task 21
- Test: `src/__tests__/unit/batch/oneEnvelope.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6 (`InstanceBatch`, the recorder, `executeBatch`).
- Produces: `InstanceBatch.kind(): 'lock' | 'unlock' | 'stateless' | undefined` set by the first recorded call of every batch; refusal `batch_other_kind` (spec §4.1 words; the code name a controller decision pending the owner's review at the finish).

- [ ] **Step 1: Write the failing tests** — `BatchEnd and HandlerBatch end each send exactly one envelope`; `the first call decides the kind (LOCK / UNLOCK / stateless)`; `a call of another kind is refused batch_other_kind, nothing recorded, no number` — in the full and the compact sets.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the kind and the refusal for every batch.
- [ ] **Step 4:** Run, with Task 4's proof (held / document / `404`, exactly one request) — PASS.
- [ ] **Step 5: Break it:** let a second kind in — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/README.md`, `compact/tests/fixtures/surface.json`, `docs/user-guide/BATCH_MODE.md` (the phases), README where it describes compact, `docs/MIGRATION-19.0.md` (what a consumer of the old behaviour now calls, in order) (each phase its own batch); CHANGELOG 19.0.0 (*Changed*, breaking for compact, unless noted).
- [ ] **Step 7:** Commit `feat: every batch end is one envelope`.

### Task 11: Compact one call: `HandlerCreate`

**Files:**
- Modify: `compact-modify/src/handlers/handleHandlerCreate.ts`, `compact-modify/src/handlers/compactWriteRoutes.ts` (the create column → `handleCreateOnly`), `src/handlers/common/low/handleCreateOnly.ts`, `src/lib/compact/compactSchemas.ts` (`create_only` removed; per type only what its create sends), `tools/batch-handlers.json`
- Test: `compact-modify/src/__tests__/createSingleCall.test.ts`

**Interfaces:**
- Produces: `HandlerCreate` = one `POST` per type; an argument of the schema that the type's create does not send is refused by presence, naming it (undeclared names are stripped by the MCP SDK for every tool — no refusal is promised for them).

- [ ] **Step 1: Write the failing tests** — per type: `exactly one request, the create's POST`; `an argument its create does not send is refused before any request, naming it, for false / 0 / ''`; `SERVICE_BINDING sends no service-group read`; `FUNCTION_GROUP sends no read-back after a 400 — the 400 is the answer`; `create_only is not in the schema`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement: remove `create_only` and the routing to the full creates.
- [ ] **Step 4:** Run, with Task 4's proof (held / document / `404`, exactly one request) — PASS.
- [ ] **Step 5: Break it:** route one type to its full create; read the service group — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/README.md`, `compact/tests/fixtures/surface.json`, `docs/user-guide/BATCH_MODE.md` (the phases), README where it describes compact, `docs/MIGRATION-19.0.md` (what a consumer of the old behaviour now calls, in order); CHANGELOG 19.0.0 (*Changed*, breaking for compact, unless noted).
- [ ] **Step 7:** Commit `feat(compact)!: HandlerCreate is one POST`.

### Task 12: Full-set reads: one `Get<Type>` per type, `part`, one request

**Files:**
- Modify: every `src/handlers/<type>/high/handleGet<Type>.ts` of the types with source (`part: 'source' | 'metadata'`, default `source`), the FUNCTION_MODULE get (group as an argument, no metadata read first), `src/handlers/function_include/readonly/handleGetFunctionInclude.ts` (from `handleReadFunctionInclude.ts`), `src/lib/handlers/groups/ReadOnlyHandlersGroup.ts` (serves `Get<Type>`), `src/lib/toolSet.ts` (`ReadVsGetDedupStrategy` gone), `src/lib/handlers/read.ts`, `tools/batch-handlers.json`
- Delete: every `src/handlers/<type>/readonly/handleRead<Type>.ts`, `src/lib/handlers/groups/strategies/ReadVsGetDedupStrategy.ts`
- Test: `src/__tests__/unit/readTools/getPart.test.ts`

**Interfaces:**
- Produces: `Get<Type>` with `part: 'source' | 'metadata'` (default `source`) for CLASS, INTERFACE, PROGRAM, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING (`response_format` kept), BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, FUNCTION_MODULE (group argument), FUNCTION_INCLUDE (`GetFunctionInclude`); `Get<Type>` without `part` for DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, PACKAGE, MESSAGE_CLASS, MESSAGE_CLASS message; the same tools in the full set and `-ro`; no `Read<Type>`.

- [ ] **Step 1: Write the failing tests** — per type: `part source: exactly one request, the source only (held / document / 404)`; `part metadata: exactly one request, the metadata only`; `no part reads source`; `metadata-only types: one request, no part in the schema`; `FUNCTION_MODULE source: one request with the given group, no metadata read`; `the -ro set serves Get<Type>, the same tool as the full set`; `no Read<Type> tool is served in any set`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof (the `Get<Type>` entries replace the `Read<Type>` ones) — PASS.
- [ ] **Step 5: Break it:** answer `part: metadata` with the `both()` read; read FUNCTION_MODULE's metadata first; keep `ReadClass` served — each red; revert.
- [ ] **Step 6:** Docs: `docs/user-guide/AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`, `AVAILABLE_TOOLS_HIGH.md`, README, `core-ro` / `http-ro` / `sse-ro` READMEs, `MIGRATION-19.0.md` (one row per removed `Read<Type>`: `ReadClass` → `GetClass` `part: metadata` and `part: source`, …; `ReadFunctionInclude` → `GetFunctionInclude`); CHANGELOG 19.0.0 (*Changed*, breaking).
- [ ] **Step 7:** Commit `feat!: one Get<Type> per type with part; Read<Type> folded in`.

### Task 13: Compact one call: `HandlerUpdate`

**Files:**
- Modify: `compact-modify/src/handlers/handleHandlerUpdate.ts` (`lock_handle` required; always `handleUpdateUnderLock`), `src/handlers/common/low/handleUpdateUnderLock.ts` (DOMAIN, DATA_ELEMENT, PACKAGE: `source_code` as the whole document; `properties` and `FLAT_PROPERTIES` leave the schema), `src/lib/compact/compactSchemas.ts`, `tools/batch-handlers.json`
- Test: `compact-modify/src/__tests__/updateSingleCall.test.ts`

**Interfaces:**
- Produces: `HandlerUpdate` = one `PUT` under `lock_handle`; DOMAIN / DATA_ELEMENT / PACKAGE `get<Type>().updateMetadata({ name, transportRequest }, { source: source_code, lockHandle, analyse })`.

- [ ] **Step 1: Write the failing tests** — per type: `exactly one PUT under the given lock_handle`; `no lock_handle refused before any request`; `DOMAIN/DATA_ELEMENT/PACKAGE: body = source_code byte for byte, no read`; `properties and the FLAT_PROPERTIES fields are not in HandlerUpdate's schema`; `transport_request accepted`; `no read after the write`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof (held / document / `404`, exactly one request) — PASS.
- [ ] **Step 5: Break it:** read before writing; keep `properties` in the schema; read after the write — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/README.md`, `compact/tests/fixtures/surface.json`, `docs/user-guide/BATCH_MODE.md` (the phases), README where it describes compact, `docs/MIGRATION-19.0.md` (what a consumer of the old behaviour now calls, in order); CHANGELOG 19.0.0 (*Changed*, breaking for compact, unless noted).
- [ ] **Step 7:** Commit `feat(compact)!: HandlerUpdate is one PUT under lock_handle`.

### Task 14: Compact one call: `HandlerDelete`, local includes, new `HandlerDeletionCheck`

**Files:**
- Modify: `compact-modify/src/handlers/handleHandlerDelete.ts`, `compact-modify/src/handlers/compactWriteRoutes.ts` (the delete column → the deletion request alone; LOCAL_* / UNIT_TEST / CDS_UNIT_TEST → one empty `PUT` under `lock_handle`), `src/lib/compact/compactSchemas.ts` (`activate_on_delete` removed; `lock_handle` for the include types), `tools/batch-handlers.json`
- Create: `compact-readonly-entries/src/handlers/handleHandlerDeletionCheck.ts`, its registration in `compact-readonly-entries/src/group.ts`
- Test: `compact-modify/src/__tests__/deleteSingleCall.test.ts`, `compact-readonly-entries/src/__tests__/deletionCheck.test.ts`

**Interfaces:**
- Produces: `HandlerDelete` = one deletion request, no lock, no check; LOCAL_TEST_CLASS / LOCAL_TYPES / LOCAL_DEFINITIONS / LOCAL_MACROS / UNIT_TEST / CDS_UNIT_TEST = one `PUT` of empty content under the caller's `lock_handle`; tool `HandlerDeletionCheck` (`object_type`*, `object_name`*) = one `checkDeletion` request (`src/lib/strategies/checkedDeletion.ts:50-51`) read by `analyseDeletion`.

- [ ] **Step 1: Write the failing tests** — per type: `exactly one request, the deletion — no lock, no check`; per include type: `exactly one PUT, empty body, the given lock_handle, no activation`; `include delete without lock_handle refused before any request`; `activate_on_delete is not in the schema`; `HandlerDeletionCheck exactly one request; answers deletable / refused with SAP's words`; `served by compact and compact-ro`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof (held / document / `404`, exactly one request) — PASS.
- [ ] **Step 5: Break it:** keep the check inside `HandlerDelete`; lock before the delete; activate after the include write — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/README.md`, `compact/tests/fixtures/surface.json`, `docs/user-guide/BATCH_MODE.md` (the phases), README where it describes compact, `docs/MIGRATION-19.0.md` (what a consumer of the old behaviour now calls, in order) (`HandlerDeletionCheck` under *Added*); CHANGELOG 19.0.0 (*Changed*, breaking for compact, unless noted).
- [ ] **Step 7:** Commit `feat(compact)!: HandlerDelete is the deletion alone; HandlerDeletionCheck`.

### Task 15: `HandlerGet`: one part, one request

**Files:**
- Modify: `compact-readonly-entries/src/handlers/handleHandlerGet.ts`, `compactPartRoutes.ts`, `compactReadRoutes.ts`, the FUNCTION_MODULE reads, `src/handlers/system/low/handleGetNodeStructure.ts` (compact path: no package read), `src/lib/compact/compactSchemas.ts` (`part`; FUNCTION_MODULE `GROUP|MODULE`), `tools/batch-handlers.json`
- Test: `compact-readonly-entries/src/__tests__/onePartOneRequest.test.ts`

**Interfaces:**
- Consumes: the `Get<Type>` part handlers (Task 12): compact `part: 'source'` and `part: 'metadata'` route to `Get<Type>` with that part.
- Produces: per type `part: 'metadata'` = the metadata read alone, `part: 'source'` = the source read alone (source-less types refuse `source`, naming their parts); FUNCTION_MODULE by `GROUP|MODULE`; `node_structure` of `DEVC/K` one call, a blank body answering an empty listing stated as ambiguous; `urls` unchanged (exception); `contents` → Task 23.

- [ ] **Step 1: Write the failing tests** — per type and part: `exactly one request`; `metadata answers metadata only; source answers source only`; `DOMAIN/DATA_ELEMENT/FUNCTION_GROUP/PACKAGE refuse source naming their parts`; `FUNCTION_MODULE source: one request with the group from GROUP|MODULE, no metadata read`; `node_structure DEVC/K: one request; a blank body answers an empty listing with the ambiguity stated`; `urls answers as before`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof (held / document / `404`, exactly one request) — PASS.
- [ ] **Step 5: Break it:** route `metadata` to the `both()` read; read the package before `node_structure`; read FUNCTION_MODULE's metadata first — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/README.md`, `compact/tests/fixtures/surface.json`, `docs/user-guide/BATCH_MODE.md` (the phases), README where it describes compact, `docs/MIGRATION-19.0.md` (what a consumer of the old behaviour now calls, in order); CHANGELOG 19.0.0 (*Changed*, breaking for compact, unless noted).
- [ ] **Step 7:** Commit `feat(compact)!: HandlerGet one part, one request`.

### Task 16: `HandlerGet` run-state parts and `HandlerActivate`'s run path

**Files:**
- Modify: `compact-modify/src/handlers/handleHandlerActivate.ts` (group/run path: `POST /activation/runs` only), `compact-readonly-entries/src/handlers/compactPartRoutes.ts` (parts `activation_status`, `activation_results`), `src/lib/compact/compactSchemas.ts` (`run_id`), `tools/batch-handlers.json`
- Test: `compact-modify/src/__tests__/activationRun.test.ts`

**Interfaces:**
- Produces: `HandlerActivate` (group/run) = one request answering `{ run_id }` ("accepted, no verdict yet"); `HandlerGet` `part: 'activation_status' | 'activation_results'` with `run_id`, one request each.

- [ ] **Step 1: Write the failing tests** — `HandlerActivate run path issues exactly one request and answers the run_id`; `the single-object path is unchanged (one request)`; `activation_status and activation_results: one request each, SAP's answer as it came`; `no poll, no timer`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof (held / document / `404`, exactly one request) — PASS.
- [ ] **Step 5: Break it:** poll the run inside `HandlerActivate` — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/README.md`, `compact/tests/fixtures/surface.json`, `docs/user-guide/BATCH_MODE.md` (the phases), README where it describes compact, `docs/MIGRATION-19.0.md` (what a consumer of the old behaviour now calls, in order); CHANGELOG 19.0.0 (*Changed*, breaking for compact, unless noted).
- [ ] **Step 7:** Commit `feat(compact)!: HandlerActivate starts a run; its state is read by HandlerGet`.

### Task 17: Unit-test results read once

**Files:**
- Modify: `compact-readonly-entries/src/handlers/handleHandlerUnitTestResult.ts`, `handleHandlerCdsUnitTestResult.ts`, `HandlerGet` `UNIT_TEST` / `CDS_UNIT_TEST` (`src/handlers/unit_test/high/handleGetUnitTest.ts`, `handleGetCdsUnitTest.ts`, compact path), their descriptions
- Test: `compact-readonly-entries/src/__tests__/unitTestResultOnce.test.ts`

**Interfaces:**
- Produces: each = one `getResult`, SAP's answer as it came; description: "valid only after the status is FINISHED: an unfinished run answers a result without executionTime".

- [ ] **Step 1: Write the failing tests** — `exactly one request, getResult — no status poll`; `an unfinished run's result is answered as it came`; `the description carries the FINISHED sentence`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof (held / document / `404`, exactly one request) — PASS.
- [ ] **Step 5: Break it:** poll the status first — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/README.md`, `compact/tests/fixtures/surface.json`, `docs/user-guide/BATCH_MODE.md` (the phases), README where it describes compact, `docs/MIGRATION-19.0.md` (what a consumer of the old behaviour now calls, in order); CHANGELOG 19.0.0 (*Changed*, breaking for compact, unless noted).
- [ ] **Step 7:** Commit `feat(compact)!: unit-test results are read once`.

### Task 18: The profiler: `HandlerProfileSchedule` and `HandlerProfileRun`

**Files:**
- Create: `compact-modify/src/handlers/handleHandlerProfileSchedule.ts`; its registration in `compact-modify/src/group.ts`
- Modify: `compact-modify/src/handlers/handleHandlerProfileRun.ts` (`profilerId` required), `src/lib/compact/compactSchemas.ts`, `tools/batch-handlers.json`
- Test: `compact-modify/src/__tests__/profileTools.test.ts`

**Interfaces:**
- Produces: `HandlerProfileSchedule` = one request answering the `profilerId`; `HandlerProfileRun` = one request with `profilerId` (required); no `step` argument (two tools: a controller decision pending the owner's review at the finish). The trace is found with `HandlerProfileList`.

- [ ] **Step 1: Write the failing tests** — `HandlerProfileSchedule: exactly one request, answers profilerId`; `HandlerProfileRun with profilerId: exactly one request`; `HandlerProfileRun without profilerId refused before any request`; `no trace-list poll`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof — PASS.
- [ ] **Step 5: Break it:** chain the schedule into the run — red; revert.
- [ ] **Step 6:** Docs: compact docs, surface fixture, `MIGRATION-19.0.md` (schedule, then run, then find the trace with `HandlerProfileList`); CHANGELOG 19.0.0 (*Added* `HandlerProfileSchedule`; *Changed* `HandlerProfileRun`, breaking for compact).
- [ ] **Step 7:** Commit `feat(compact)!: the profiler schedules and runs in two tools`.

### Task 19: `HandlerDumpList`: one page per call

**Files:**
- Modify: `compact-readonly-entries/src/handlers/handleHandlerDumpList.ts`, `src/lib/compact/compactSchemas.ts` (`top` ≤ 100, `to`)
- Test: `compact-readonly-entries/src/__tests__/dumpListOnePage.test.ts`

**Interfaces:**
- Produces: one page per call: entries and SAP's next link as it came; `top` > 100 refused naming the cap (MEASURED cap 100).

- [ ] **Step 1: Write the failing tests** — `exactly one request for any top ≤ 100`; `top 101 refused before any request`; `the next link answered as SAP sent it (to=<timestamp>)`; `the description says the next page starts at the boundary second, inclusive — dedup by dump_id`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof (held / document / `404`, exactly one request) — PASS.
- [ ] **Step 5: Break it:** walk a second page — each red; revert.
- [ ] **Step 6:** Docs: `compact/docs/AVAILABLE_TOOLS.md`, `compact/README.md`, `compact/tests/fixtures/surface.json`, `docs/user-guide/BATCH_MODE.md` (the phases), README where it describes compact, `docs/MIGRATION-19.0.md` (what a consumer of the old behaviour now calls, in order); CHANGELOG 19.0.0 (*Changed*, breaking for compact, unless noted).
- [ ] **Step 7:** Commit `feat(compact)!: HandlerDumpList reads one page`.

### Task 20: Compact debugger: four tools, one request per call

**Files:**
- Create: `src/lib/compact/debug/handleHandlerDebugBreakpoints.ts`, `handleHandlerDebugSession.ts`, `handleHandlerDebugMaintain.ts`
- Modify: `src/lib/compact/debug/handleHandlerDebugStep.ts`, `group.ts`, `shared.ts`, `src/lib/debugger/DebugSession.ts` and `src/lib/debugger/AmdpSession.ts` (a one-request path, no background listen loop), `src/lib/debugger/ownConnectionTools.ts`, `tools/batch-handlers.json`
- Delete: `src/lib/compact/debug/handleHandlerDebugStart.ts`, `handleHandlerDebugView.ts`, `handleHandlerDebugWait.ts`
- Test: `src/__tests__/unit/debugger/compactFiveTools.test.ts`

**Interfaces:**
- Produces (spec §4.6; each call one `AbapDebugger` / `AmdpDebugger` method, chosen by the tool's operation argument; the three new names are proposals): `HandlerDebugBreakpoints` (ABAP setBreakpoints, syncBreakpoints, deleteBreakpoint, createWatchpoint, listWatchpoints, deleteWatchpoint; AMDP syncBreakpoints); `HandlerDebugSession` (ABAP checkListener, listen with the caller's `hold_seconds`, stopListener, attach, detachDebugger without an id on the attaching session, terminateDebuggee, terminateDebugger, setDebuggerSettings; AMDP start, getEvents, stop, deleteDebuggee); `HandlerDebugStep` (ABAP step into/over/return/continue, stepToLine with an address, setStackPosition; AMDP step); `HandlerDebugMaintain` — maintain variables (ABAP getStack, getVariables, getChildVariables, getMemorySizes, createMemorySnapshot, setVariableValue; AMDP getDataPreview).

- [ ] **Step 1: Write the failing tests** — per tool and operation, ABAP and AMDP: `exactly one request, the named method (held / document / 404)`; `no background listen loop: nothing is sent between calls`; `listen holds exactly the caller's hold_seconds`; `stepToLine without an address refused before any request`; `detach sends detachDebugger without an id on the attaching session`; `descriptions, positive: a step answers SAP's step result and the stopped position is read from the stack; terminate answers 500 when it succeeds; detach releases the debuggee on the attaching session`; `HandlerDebugStart, HandlerDebugView and HandlerDebugWait are not served`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run, with Task 4's proof — PASS.
- [ ] **Step 5: Break it:** send detach with the id; keep the listen loop; read the stack inside stepToLine — each red; revert.
- [ ] **Step 6:** Docs: compact docs, `docs/user-guide/DEBUGGER.md` (the chain), surface fixture, `MIGRATION-19.0.md` (the old `HandlerDebugStart` / `Step` / `View` / `Wait` → the four, one row each); CHANGELOG 19.0.0 (*Changed*, breaking for compact).
- [ ] **Step 7:** Commit `feat(compact)!: the compact debugger is four one-request tools`.

### Task 21: The debugger batch

**Files:**
- Create: `src/lib/handlers/groups/DebugBatchHandlersGroup.ts`, `src/lib/compact/debug/handleHandlerDebugBatch.ts`
- Modify: `src/lib/debugger/DebugSession.ts` (batch path: `recordStep`, `recordStepToLine`, `recordStack`, `recordVariables`, `recordChildVariables`, `recordStackPosition`, `recordSetVariable` — outside `mutate`), `src/lib/debugger/ownConnectionTools.ts` (the three tools), the debugger tool handlers of spec §7's table, `src/lib/toolSet.ts`
- Test: `src/__tests__/unit/debugger/debugBatch.test.ts`

**Interfaces:**
- Consumes: Tasks 3, 5, 6; the compact debugger's four tools (Task 20).
- Produces: `DebugBatchBegin` / `DebugBatchEnd` (full), `HandlerDebugBatch` (`action: 'begin' | 'end' | 'answers'`, compact); `DebugSession.openBatch(): AdtBatchConnection` over `Stop.connection` with `endpoint: 'debugger'`.

- [ ] **Step 1: Write the failing tests** — `DebugBatchEnd and HandlerDebugBatch end send exactly one envelope`; `begin needs an ABAP stop`; `step + stack + variables recorded into one debugger envelope on the stop's connection`; `the second recorded call is recorded while the first waits` (no deadlock); `DebugBatchEnd keeps answers by number, mode off, leaves the stop as it was (no releaseStop, no view change), also when a step's answer says the program ended`; `step to line without object_type/object_name refused`; `AMDP stop refused debug_batch_amdp_unmeasured`; `begin of either batch refused while the other is open`; `breakpoint and listener tools refused while open`; `DebugBatch* only in full, HandlerDebugBatch only in compact`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** record inside `mutate` — red; revert.
- [ ] **Step 6:** Docs: `docs/user-guide/DEBUGGER.md` (the debugger batch, AMDP not offered yet), CHANGELOG 19.0.0 *Added*.
- [ ] **Step 7:** Commit `feat: debugger batch`.

### Task 22: Internal batches — `runPhase` and batch availability

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

### Task 23: Package walks on batches

**Files:**
- Modify: `src/lib/strategies/packageWalk.ts` (`walkPackage` by levels), `src/handlers/package/readonly/handleGetPackageContents.ts`, `src/handlers/system/high/handleGetPackageTree.ts`, `src/handlers/search/readonly/handleGetObjectsList.ts`, `src/handlers/system/readonly/handleGetObjectInfo.ts`, `compact-readonly-entries/src/handlers/handleHandlerGet.ts` (part `contents`), `tools/long-handlers.json` (`sends`)
- Test: `src/__tests__/unit/batch/packageWalks.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)`, `HandlerContext.batchAvailability` (Task 22).
- Produces: schemas — `GetPackageContents.package_names: string[]`, `GetPackageTree.package_names: string[]`, `GetObjectsList.objects: [{ parent_type, parent_name }]` (names checked against the tool's current arguments), `GetObjectInfo.objects: [{ object_type, object_name }]`, `HandlerGet` part `contents` `package_names`; exactly one of single/list.

- [ ] **Step 1: Write the failing tests** — per tool on fixtures: `same answer as the sequential version`; `envelopes per spec §11's row (per level: roots, then type nodes)`; `no envelope holds a request needing another of its parts`; `several roots: the envelope count does not grow with their number`; `a part failure is that item's`; `credential refusal ends the call as it came`; `no communication batch → the sequential path`.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** send a level's requests one by one — red; revert.
- [ ] **Step 6:** Docs: `AVAILABLE_TOOLS*.md` (the list arguments; reads in envelopes), compact docs, CHANGELOG 19.0.0 *Changed*.
- [ ] **Step 7:** Commit `feat: package walks read in envelopes`.

### Task 24: `SearchSource` on batches

**Files:**
- Modify: `src/handlers/system/readonly/handleSearchSource.ts` (schema: `concurrency` removed), `src/lib/search-source/orchestrator.ts`, `src/lib/search-source/packageResolver.ts`, `src/lib/search-source/sourceReader.ts`
- Test: `src/__tests__/unit/batch/searchSource.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)` (Task 22); `walkPackage` by levels (Task 23).

- [ ] **Step 1: Write the failing tests** — `same hits as the sequential version`; `phases: masks, walk levels, sources up to max_objects`; `time_budget_ms checked between phases, truncated.by_timeout as today`; `no concurrency in the schema`; part failure; credential refusal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** check the budget only at the end — red; revert.
- [ ] **Step 6:** Docs and CHANGELOG 19.0.0 *Changed* (`concurrency` removed). Commit `feat: SearchSource reads in envelopes`.

### Task 25: Include, structure and enhancement trees on batches

**Files:**
- Modify: `src/handlers/include/readonly/handleGetIncludesList.ts`, `src/handlers/structure/readonly/handleGetStructuresList.ts`, `src/handlers/enhancement/readonly/handleGetEnhancements.ts`, `tools/long-handlers.json`
- Test: `src/__tests__/unit/batch/includeTrees.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)`, `HandlerContext.batchAvailability` (Task 22).
- Produces: `GetIncludesList.objects`, `GetStructuresList.structure_names`, `GetEnhancements.objects` (exactly one of single/list).

- [ ] **Step 1: Write the failing tests** — per tool: same answer; phases per spec §11 (includes per depth up to 20; structure-then-table; where-used pairs; candidates; enhancement probes one per phase, then enhancements + root, includes node, nested up to `max_includes`); several objects; part failure; credential refusal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** join the table read into the structure phase — red; revert.
- [ ] **Step 6:** Docs, CHANGELOG. Commit `feat: include and structure trees read in envelopes`.

### Task 26: Lists of objects on batches — `ListTransports`, `DescribeByList`, `GetAbapSystemSymbols`

**Files:**
- Modify: `src/handlers/transport/readonly/handleListTransports.ts`, `src/handlers/system/readonly/handleDescribeByList.ts`, `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts`
- Test: `src/__tests__/unit/batch/objectLists.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)`, `HandlerContext.batchAvailability` (Task 22).

- [ ] **Step 1: Write the failing tests** — `ListTransports: configurations, then every configuration's GET in one envelope`; `DescribeByList: all quickSearches, then the typeless ones for the empty answers`; `GetAbapSystemSymbols: each phase only independent requests; a failed call answers the error, nothing retried`; same answers; part failure; credential refusal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** put a dependent request in the first envelope — red; revert.
- [ ] **Step 6:** Docs, CHANGELOG. Commit `feat: object lists read in envelopes`.

### Task 27: Where-used and feeds on batches, several objects per call

**Files:**
- Modify: `src/handlers/system/readonly/handleGetWhereUsed.ts` (full set only; compact's `HandlerWhereUsed` stays one object, one request), `src/handlers/system/readonly/handleRuntimeListFeeds.ts` (compact's `HandlerDumpList` is one page per call, Task 19)
- Test: `src/__tests__/unit/batch/whereUsedAndFeeds.test.ts`

**Interfaces:**
- Consumes: `runPhase(context, …)`, `withSequentialFallback(context, …)`, `HandlerContext.batchAvailability` (Task 22).
- Produces: `GetWhereUsed.objects: [{ object_type, object_name }]`, `RuntimeListFeeds.feed_types: string[]`.

- [ ] **Step 1: Write the failing tests** — `where-used: one envelope of every object's scope, one of every scoped request — two for any number`; `feeds: every feed's first GET in one envelope, then per round the next page of every feed still paging`; single argument keeps today's answer shape; list answers one entry per object in order; part failure; credential refusal.
- [ ] **Step 2:** Run — FAIL. **Step 3:** Implement. **Step 4:** Run — PASS.
- [ ] **Step 5: Break it:** read each object's chain on its own — the envelope count grows, red; revert.
- [ ] **Step 6:** Docs, CHANGELOG. Commit `feat: where-used and feeds read several objects in envelopes`.

### Task 28 (live, needs the owner's VPN/tunnel, run only on his word): communication batch

**Files:**
- Create: `src/__tests__/integration/batch/communicationBatch.test.ts`; `tests/test-config.yaml.template` (`batch.test_cases.communication`, disabled)

- [ ] **Step 1:** Write the test: hard mode through the served tools; N reads; then compact `HandlerCreate` × N, `HandlerLock` × N, `HandlerUpdate` (sources; the whole document in `source_code` for DOMAIN) × N, `HandlerUnlock` × N, `HandlerActivate`, each phase a batch; answers per number; cleanup through `HandlerDeletionCheck` and `HandlerDelete`. States where it runs (on-premise HTTP, on-premise RFC, ABAP Cloud), skips elsewhere with the reason.
- [ ] **Step 2:** On the owner's word, run on each; record the results with the date in `docs/user-guide/BATCH_MODE.md`. Commit.

### Task 29 (live, owner's VPN/tunnel, on his word): debugger batch and AMDP

- [ ] **Step 1:** `src/__tests__/integration/batch/debuggerBatch.test.ts`: at a live stop, step + stack + variables in one `DebugBatchEnd` (on-premise, ABAP Cloud); and the AMDP gate (on-premise on HANA). States where it runs.
- [ ] **Step 2:** On the owner's word, run; record in `DEBUGGER.md`. The AMDP refusal stays until the AMDP case passes; lifting it is its own commit then. Commit.

### Task 29a: The AMDP debugger batch (spec §7, offered now that the §9.3 gate passed)

Task 29 measured the gate on premise over HTTP and RFC (`debuggerBatch.test.ts`, AMDP case): a debugger
batch envelope on an AMDP session's command connection is accepted, and the step in it moves the
debuggee. The owner decided it ships in 19.0.0.

**Files:**
- Modify: `src/lib/debugger/AmdpSession.ts` (or where `AmdpSession` lives), the begin path in `src/lib/batch/tools.ts`, the AMDP tools (`AmdpDebugStep`, `AmdpDebugGetTable`, …) and the compact `HandlerDebugStep` / `HandlerDebugMaintain` AMDP operations, `serverRefusal.ts` / `failures.ts` (drop `debug_batch_amdp_unmeasured`), the batch tool descriptions, `docs/user-guide/DEBUGGER.md`, `docs/user-guide/BATCH_MODE.md`, CHANGELOG 19.0.0
- Test: the unit tests of the ABAP debugger batch, mirrored for AMDP; `debuggerBatch.test.ts` (the AMDP case through the served tools)

**Interfaces:**
- Produces: `DebugBatchBegin` opens a debugger batch on an ABAP stop or an AMDP break — chosen by the
  kind of stop held; the AMDP session gets the batch paths ABAP has (§7: a recorded operation does not
  enter the serial, it records on the batch debugger over the command connection); `DebugBatchEnd`
  executes on the connection that holds the session.

- [ ] **Step 1:** Write the failing unit tests: begin on an AMDP break opens the batch; step over /
  continue / data preview record (one number each, `{ content: [] }`), through the AMDP tools and the
  compact operations; end executes one envelope on the AMDP command connection, answers by number;
  begin with no stop is refused as today; the `debug_batch_amdp_unmeasured` refusal is gone.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Implement the AMDP batch paths, mirroring the ABAP ones; begin picks ABAP or AMDP by
  the stop held; remove the refusal code from the closed list and its words.
- [ ] **Step 4:** Run the unit tests — PASS. Break-it: re-insert the refusal — red; record an AMDP step
  outside the batch path — red; revert.
- [ ] **Step 5:** Change `debuggerBatch.test.ts`'s AMDP case to go through the served tools
  (`DebugBatchBegin` at the AMDP break, the recorded AMDP calls, `DebugBatchEnd`, `BatchAnswers`), on
  the shared AMDP fixture. On the owner's word, run on premise HTTP and RFC; record with the date in
  `DEBUGGER.md`.
- [ ] **Step 6:** Descriptions (functional, spec §3 sentences), `DEBUGGER.md`, `BATCH_MODE.md`,
  CHANGELOG 19.0.0. Commit.

### Task 30 (live, owner's VPN/tunnel, on his word): a system without the communication batch

- [ ] **Step 1:** `src/__tests__/integration/batch/noCommunicationBatch.test.ts`: the first envelope's outer status; the destination marked; reads run sequentially. States where it runs.
- [ ] **Step 2:** On the owner's word, run; record the measured answer in `BATCH_MODE.md`. Commit.

### Task 31 (live, owner's VPN/tunnel, on his word): before/after timing of the internally batched reads

- [ ] **Step 1:** `src/__tests__/integration/batch/batchedReadsTiming.test.ts`: every tool of Tasks 23–27, sequential (the fallback path) and batched: answers equal, time measured; on-premise HTTP, on-premise RFC, ABAP Cloud. States where it runs.
- [ ] **Step 2:** On the owner's word, run; record with the date in `BATCH_MODE.md`. Commit.

### Task 32 (live, owner's VPN/tunnel, on his word): the two earlier checks

- [ ] **Step 1:** `src/__tests__/integration/batch/refusalFollowUps.test.ts`: the logoff after a credential refusal asks no provider; the debugger stop's second `stopListener` after a refusal. States where each runs.
- [ ] **Step 2:** On the owner's word, run; record. Commit.

### Task 33 (live, owner's VPN/tunnel, on his word): RFC through a message server

- [ ] **Step 1:** `src/__tests__/integration/rfc/messageServer.test.ts`: a logon through `mshost` + `sysid` (and `mshost` + `msserv`), `group`, and with `saprouter` where the system needs one; one read through the server. States where it runs (a system with a message server), skips elsewhere with the reason.
- [ ] **Step 2:** On the owner's word, run; record the result with the date in the RFC docs (whether `mshost` + `msserv` without `sysid` is accepted). Commit.

### Task 34: Tool descriptions: purely functional

**Files:**
- Modify: the `TOOL_DEFINITION.description` of every tool in every set (`src/handlers/**`, `compact-modify/src/handlers/**`, `compact-readonly-entries/src/handlers/**`, `src/lib/compact/**`, the batch and debugger groups), `src/embeddable/BaseMcpServer.ts` (the appended batch sentences, spec §3), the regenerated tool docs (`docs/user-guide/AVAILABLE_TOOLS*.md`, `compact/docs/AVAILABLE_TOOLS.md`, `compact/tests/fixtures/surface.json`)
- Create: `src/__tests__/unit/sources/descriptionsFunctional.test.ts`

**Interfaces:**
- Produces: every description states what the tool does, its parameters and its result; the appended sentences are spec §3's ("Recordable: …", "When …, recordable: …", "Runs outside batch mode.").

- [ ] **Step 1: Write the failing test** — `descriptionsFunctional.test.ts`: for every served tool in every set (taken from the registered tool lists, the appended sentence included), split the description into word tokens with plain code (letters and apostrophes kept, everything else a separator — no regular expression) and assert none of the tokens, lower-cased, is in the list `not`, `no`, `never`, `nothing`, `none`, `neither`, `nor`, `without`, `cannot`, `can't`, `doesn't`, `don't`, `isn't`, `won't`, `instead`, `formerly`, `deprecated`, `removed`, `replaces`, `migrate`; the failure names the tool and the token.
- [ ] **Step 2:** Run — FAIL (listing today's offenders).
- [ ] **Step 3:** Rewrite each offending description to the rule (what it does, its parameters, its result) and the appended sentences to spec §3's words; regenerate the tool docs.
- [ ] **Step 4:** Run, and the surface tests — PASS.
- [ ] **Step 5: Break it:** put "does not lock" back into one description — red; revert.
- [ ] **Step 6:** CHANGELOG 19.0.0 *Changed*: tool descriptions state only what each tool does, its parameters and its result.
- [ ] **Step 7:** Commit `docs: tool descriptions purely functional`.

### Task 36: Lazy answers — `BatchEnd` splits, the read answers (spec §4.3, §5.2–5.4, §6, §7)

**Files:** `src/lib/batch/execute.ts`, `src/lib/batch/` (owner, recorder, answers), the `BatchAnswers` / `HandlerBatch answers` / `DebugBatchEnd` handlers, the spec's §9.1 tests in `src/__tests__/unit/batch/`, `docs/user-guide/BATCH_MODE.md`, `docs/user-guide/DEBUGGER.md`, `docs/MIGRATION-19.0.md`, CHANGELOG 19.0.0 (date = the day of the change).

- [ ] **Step 1:** Write the failing tests of spec §9.1 "`BatchEnd` splits, the read answers" and "`BatchEnd`'s error, no map", and update "Credential refusal" and "`BatchEnd` failing before `execute()`" to "no map, every number read answers the error".
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** `BatchEnd` / `DebugBatchEnd`: `execute()`, split the settled parts by number into the map, check recorded / sent / received, answer `{ recorded, sent, received }`, or the error (`execute()`'s as it came, `batch_parts_mismatch`, `batch_unsplit`) with no map. No handler is resumed.
- [ ] **Step 4:** `BatchAnswers`: resume each asked number's handler with its parts (in parallel), keep the answer, run a handler once; a resumed handler's further request is refused `batch_ended`; a failed batch's numbers answer its error. A never-read handler leaves nothing pending when its map is replaced, the batch dropped or the instance closed.
- [ ] **Step 5:** Run, and every batch / debugger-batch / compact test — PASS. Break-its of §9.1 red, reverted.
- [ ] **Step 6:** Docs and CHANGELOG 19.0.0 (*Changed*: `BatchEnd` answers `{ recorded, sent, received }` or its error; a number's answer is built when it is read).
- [ ] **Step 7:** All gates (CI's step list). Commit `feat(batch): BatchEnd splits the envelope; a number's answer is built when read`.
- [ ] **Step 8 (live, on the owner's word):** the communication-batch and debugger-batch live tests (HTTP and RFC) rerun green; SM04/SM05 checked minutes later.

### Task 37: A leftover-session file goes only once the logoff completed

**Files:** `src/lib/leftoverSessions/LeftoverSessions.ts`, `src/lib/ownedConnections.ts` (if the hook lives there), their unit tests, `docs/` where leftover sessions and the forced close are described, CHANGELOG 19.0.0 (date = the day of the change).

- [ ] **Step 1:** Failing tests: a tracked connection's file stays after its logoff is written and is removed only once its `flushGoodbye()` settled; a process that exits without that flush (the forced close, a crash) leaves the file, so `ListLeftoverSessions` lists the session.
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Remove the file on the flush's completion, never on the write alone.
- [ ] **Step 4:** Run — PASS; break-it (remove on the write again) red, reverted.
- [ ] **Step 5:** Docs: the forced close's sessions are visible as files and through `ListLeftoverSessions` / `LogoffLeftoverSession`; CHANGELOG.
- [ ] **Step 6:** All gates (CI's step list). Commit `fix(leftover): a session file goes only once its logoff completed`.

### Task 38 (live, on the owner's word): DebugStop with a failed listener stop

**Files:** `src/__tests__/integration/debugger/DebuggerHandlers.test.ts`, a fault-injection seam test-only.

- [ ] **Step 1:** The case starts with a sweeping DebugStop (whatever an earlier killed run left: listener, breakpoints, a held debuggee).
- [ ] **Step 2:** The run is caught at the probe's breakpoint in a loop; a DebugStop whose `stopListener` and one by-id delete are refused through the seam answers the failure and releases no debuggee (the run is still held).
- [ ] **Step 3:** A clean DebugStop: breakpoints gone, debuggee released, the run ends; `caseSession.cleanup` in `finally`; harness logoff awaited.
- [ ] **Step 4:** Twice in a row on HTTP and RFC — green both times (idempotent); SM04/SM05 checked minutes later.
- [ ] **Step 5:** Commit `test(debugger): live DebugStop with a failed listener stop`.

### Task 39: Tool retrieval gate and the descriptions it finds (issues #270, #271)

**Files:** a labelled query set under `src/__tests__/unit/descriptions/` (from cloud-llm-hub's `tools/tool-rag-queries.json`, plus the #270 and #271 cases), the retrieval test beside it, the handler descriptions it fails on, regenerated tool docs, CHANGELOG 19.0.0 (date = the day of the change).

**Three texts per tool (owner, 2026-10-20).** Search methods differ and do not share a text, so each tool carries three, and the consumer takes the one its search uses:
- `description` — what `tools/list` serves for the model's choice: purely functional (below);
- `keywords` — for lexical search (BM25): the terms, synonyms and object kinds users ask with (an array of strings);
- `semantic` — for vector search: one or two natural sentences of what a user wants when this tool is the answer.

`keywords` and `semantic` live in one table, `tools/tool-search.json` (tool name → `{ keywords, semantic }`), shipped in the package like `tools/batch-handlers.json` and bundled (`require`). Every tool of every set has an entry (a source test). lib exports them (`@mcp-abap-adt/lib/tool-search`: `toolSearchText(name)` and the whole map), and `tools/list` carries them on each tool as `_meta["mcp-abap-adt/search"] = { keywords, semantic }`. A consumer that knows none of it reads `description` as today.

The gate: BM25 over name + parameter names + `keywords`; vectors over `semantic`; `description` checked functional and first-sentence unique.

Rule (owner): a description is purely functional and names the function on what the parameters name ("Finds where the object named by object_name and object_type is used …", "Reads the CDS view named by ddl_name …"), never a vague "an ABAP object" subject.

- [ ] **Step 1:** The query set: each query with its `required` groups (interchangeable tools per step), per role (reader: read-only tools; developer: all), over the full set's catalog (name + description + parameter names, as `tools/list` serves them).
- [ ] **Step 2:** The retrieval test, offline: BM25 over that corpus; every required group within top-K per role (K as the consumer's production cap); and the first sentence of every description unique within each set. Run — FAIL on today's offenders (#270 GetDdl, #271 cases), listed by query.
- [ ] **Step 2a:** The same queries by vectors, through the local Ollama (`http://127.0.0.1:11434`, its embedding models, e.g. `nomic-embed-text`, `bge-m3`, `mxbai-embed-large`): cosine alone and hybrid (0.7 cosine + 0.3 BM25), every required group within top-K per role and model. A live test that states where it runs: it runs when the Ollama answers with the model, and skips elsewhere (CI) with that reason. No SAP AI Core, no other remote service. Run — the failures listed by query and model.
- [ ] **Step 2b:** `descriptionsFunctional.test.ts` also refuses a description naming another tool of its set, and a read tool (one that changes nothing) without its `[read-only]` marker. Run — FAIL on today's offenders (the triage counted 61 and 27).
- [ ] **Step 3:** Rewrite the failing descriptions, and every description built around a vague subject (the triage counted 22), naming another tool, or missing `[read-only]`, to the rule; `descriptionsFunctional.test.ts` stays green; regenerate the tool docs.
- [ ] **Step 4:** Run — PASS. Break-it: put GetDdl's old description back — red; revert.
- [ ] **Step 5:** All gates (CI's step list). Commit `docs: tool descriptions found by what users ask (#270, #271)`.

### Task 40 (after publish): retrieval findings from the consumer

The consumer (cloud-llm-hub) measures retrieval in its own repository and hands over its findings, as #271 did; this repository runs nothing of the consumer's and the consumer changes nothing here.

- [ ] **Step 1:** Each finding the consumer reports for 19.0.0 becomes a query in the Task 39 set and a description fix, in 19.0.x.

### Task 41: stdio recovers after a lost session (#295)

**Files:** `server/src/__tests__/` (a StdioServer case), `src/__tests__/helpers/adtStandIn.ts` (an answer with a new session cookie), CHANGELOG 19.0.0 (date = the day of the change).

- [ ] **Step 1:** The test: a stdio server started (`connectAtStart`), the stand-in answers a request with another session's cookie → that call answers SESSION_REPLACED (no retry); the next call logs on again and succeeds; the replaced connection is logged off.
- [ ] **Step 2:** Run against the branch — PASS (the fix is `b8c3b3ab`); break-it: reuse the held connection when spent — red; revert.
- [ ] **Step 3:** CHANGELOG 19.0.0 *Fixed*: stdio logs on again after SAP ended its session (#295).
- [ ] **Step 4 (live, on the owner's word):** a stdio server against the test system; the owner deletes its session in SM05; the next tool call answers on a new session; SM05 checked minutes later.
- [ ] **Step 5:** All gates (CI's step list). Commit `test(stdio): a lost session is replaced at the next call (#295)`.

### Task 35: Final consistency

- [ ] **Step 1:** Re-read README, `docs/**`, compact docs and the CHANGELOG 19.0.0 entry against the code; fix what drifted. Nothing under `docs/superpowers/` is deleted here (that happens before the release, as a later step).
- [ ] **Step 2:** All gates on the final tree. Commit `docs: batch mode docs consistent`.
