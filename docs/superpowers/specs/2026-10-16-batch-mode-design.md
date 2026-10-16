# Batch mode — design

Implements `docs/superpowers/2026-10-16-batch-mode-goal.md` (the goal). The goal is binding; this
document says how, against the code as it is on `feat/auth-chain-6`, with the owner's answers to the
questions an earlier draft raised folded in. Where something is still open, it is listed at the end
with a recommendation and is **not** decided here; the design marks each such place
"(open question N)".

Sources read: `src/embeddable/BaseMcpServer.ts`, `src/handlers/interfaces.ts`, `src/lib/clients.ts`,
`src/lib/longCall.ts`, `src/lib/longTools.ts`, `tools/long-handlers.json`,
`src/lib/packageSessions.ts`, `src/lib/toolSet.ts`, `src/lib/compact/**`, `compact-modify/src/**`,
`compact-readonly-entries/src/**`, `src/handlers/common/low/**`, `src/lib/debugger/**`,
`src/lib/state/InstanceState.ts`, `src/lib/instanceClose.ts`, `src/lib/answer.ts`,
`src/lib/auth/serverRefusal.ts`, `http/src/InstancePool.ts`, `http/src/StreamableHttpServer.ts`, and
adt-clients 33.0.0 (`src/batch/AdtBatchConnection.ts`, `src/batch/wire.ts`,
`src/utils/adtResponse.ts`, `src/core/domain/AdtDomain.ts`, `docs/usage/BATCH.md`, `CHANGELOG.md`)
in its `credential-refusals` worktree. Claims about adt-clients are tagged **[code]** (read in its
source), **[doc]** (stated in its BATCH.md or CHANGELOG, not traced in code) or **[unverified]**.

## 1. What adt-clients gives, and what it does not

- `new AdtBatchConnection(connection, { endpoint: 'communication' | 'debugger', logger? })`
  implements `IAbapConnection` **[code]**. `makeAdtRequest` records the request into a queue and
  returns a promise that settles only in `execute()`; it never calls the wrapped connection's
  `makeAdtRequest` while recording **[code]**. `connect()`, `getBaseUrl()`, `getSessionId()`
  delegate to the wrapped connection at once **[code]** — so a member that calls them while
  recording reaches the wrapped connection then.
- `execute()` sends the queue as consecutive envelopes — runs of LOCK, UNLOCK, other stateful,
  stateless — in order, without reordering **[code]**; sets the wrapped connection's session type
  per envelope and restores it in `finally` **[code]**; resolves a part's promise with its inner
  response for 2xx, rejects with an `Error` carrying `response` otherwise **[code]**; after each
  envelope yields one turn and sends what members recorded meanwhile as follow-up envelopes,
  up to 100 **[code]** — among them the members' `406`/`415` corrected retry **[doc]**; an empty
  queue answers a synthetic `204` without sending **[code]**; concurrent `execute()` is refused
  **[code]**.
- On an envelope failure: parts of that envelope reject with the error, every later part (and
  anything recorded while settling) rejects with "ADT batch request not sent because an earlier
  batch envelope failed" carrying the cause; `execute()` rejects with the error **[code]**. When the
  error is a credential refusal SAP never answered (`isUnansweredCredentialRefusal`: own data
  `refusal.kind`/`refusal.reason`/`at`, no own `response`, and no `cause.response.status === 401`),
  **every** part rejects with that same object instead of the "not sent" wrapper **[code]**. A
  refusal SAP answered (`401` under `cause.response`) rejects the active envelope's parts with it
  and the rest with the "not sent" wrapper **[code]**.
- Members' `answering` rethrows an unanswered credential refusal as the same object (33.0.0)
  **[doc]** — CHANGELOG 33.0.0; `adtResponse.ts:267` shows the rethrow **[code]**.
- LOCK and UNLOCK are recorded stateful by the members, everything else stateless; communication
  is stateless by default, debugger stateful **[code]** for the batch side, **[doc]** for "members
  record LOCK/UNLOCK stateful".
- `AdtDomain.create()` sends one request (`createDomain`) **[code]**; whether every other type's
  `create()` does is **[unverified]** — proven per type by §4.6's tests.
- Measured by adt-clients (2026-10-15/16): mixed GET/POST on `communication/batch` on-premise and
  ABAP Cloud; 100 domains created/locked/written/unlocked; debugger step + stack + variables at a
  live stop, several steps in one envelope **[doc]**. RFC, payload limits and per-part
  authorization are unmeasured **[doc]**.
- **Not given:** no way to discard a recorded queue without sending (no `clear`/`dispose`)
  **[code]**; no raw text of a part — only `{ status, statusText, headers (names lower-cased),
  data }` **[code]**.

The server depends on `@mcp-abap-adt/adt-clients ^33.0.0`. It is unpublished today (the registry
has up to 32.2.0): the bump lands only after 33.0.0 is on the registry (owner's rule: no local
link). `adt-strategies ^0.12.0` stays; its compatibility with 33.0.0 is checked by the build at the
bump **[unverified]**.

## 2. Where batch state lives

### The owner: `InstanceBatch`

One object per MCP server instance, `InstanceBatch` (`src/lib/batch/InstanceBatch.ts`), holding:

- `mode`: `off`, `communication` or `debugger` — one batch at a time;
- the open batch: its `AdtBatchConnection`, its counter (next number, from 1), the record of each
  number (§4), its `AbortController` (the batch's signal, §4.3);
- `answers`: the answers of the last executed batch, by number, kept until the next `BatchEnd`
  executes and replaces them, or the instance ends.

It is created **by the host** and handed to the instance, like `backgroundRuns` and
`leftoverSessions` today: a new `BaseMcpServer` constructor option `batch?: InstanceBatch`. The
launchers create one per instance they build — core (stdio, its one instance), the HTTP pool's
`create()` (one per pooled instance), SSE (one per connection's instance), and
`EmbeddableMcpServer` takes it from its embedder. Absent, the batch tools answer the server's
refusal `batch_mode_unavailable` ("batch mode is not available here: the host gave this server
none"). No module global holds batch state; nothing in `src/lib/batch` is a singleton.

`InstanceBatch` implements `StatePart` and is attached to `InstanceState` at construction:
`holdsState()` is true while a batch is open or answers are kept. This is what keeps an HTTP
instance in the pool between requests (`InstancePool.settle` keeps an instance only while
`holdsState()`). It puts batch state under the state's idle bound (`stateIdleMinutes`, default 30)
on every transport — the owner's existing exception to "no timeouts" applies to it as to any held
state; nothing of the batch's own runs on a clock. `dispose()` drops an open batch (nothing sent)
and the answers.

### How each transport reaches it

- **stdio** — one instance for the process; batch mode is that instance's.
- **SSE** — one instance per SSE connection; batch mode is that connection's.
- **Streamable HTTP** — every request is an MCP session of its own, served by an instance from the
  pool. **No tool takes a `state_handle` parameter for batch mode.** The handle travels as an
  optional request **header** (name: open question 1):
  - **Where it is read.** `StreamableHttpServer`'s request handler, where it reads the request's
    other headers (`headerContext(req.headers)`, beside today's `handleOf(req.body)`), reads the
    header and gives its value to `pool.serve({ handle }, …)` — the pool routes it exactly as it
    routes a handle today (`byHandle`: the instance whose `stateHandle` is that value, else a new
    instance).
  - **How it reaches the instance.** The value is the instance's attribute for the request: passed
    to the constructor when the pool creates the instance for this request
    (`createPerRequestServer(stateHandle)` → `BaseMcpServer` option `requestStateHandle`), and set
    on a kept instance for each request it serves (as the request's connection context is today,
    `useConnectionContext`).
  - **How the call uses it.** A call takes the handle from that attribute, never from its
    arguments: the batch tools act on this instance's batch only when the attribute equals the
    instance's own handle (`state.handle`); otherwise the request reached an instance that is not
    the one the handle named (unknown or ended), batch mode is off there — `BatchEnd` is refused
    `batch_mode_off`, `BatchAnswers` answers "no answer with that number", an eligible tool runs
    as an ordinary call.
  - `BatchBegin` answers the instance's handle, which the client sends in the header on every call
    of the batch. It is the instance's handle (`InstanceState`), not a batch handle: batch mode
    introduces no handle of its own, and the pool's routing is unchanged.

  The debugger tools' existing `state_handle` argument and the pool's reading of it from the body
  (`handleOf`) are not changed by this design (open question 2).

## 3. Tool surface

### Tools

| Tool | Arguments | Answers |
|---|---|---|
| `BatchBegin` | none | `{ batch: 'on', state_handle }` |
| `BatchEnd` | none | the summary and what came (§5.3) |
| `BatchAnswers` | exactly one of `number` (integer ≥ 1) or `numbers` (array of integers ≥ 1, at least one) | one entry per number asked, in the order asked (§6) |
| `DebugBatchBegin` | none | `{ debug_batch: 'on', state_handle }` |
| `DebugBatchEnd` | none | the summary and what came (§5.3) |

"One number or a list" is two properties because the schema converter
(`src/lib/handlers/utils/schemaUtils.ts`) has no `oneOf`/union support; giving both or neither is
refused before anything runs.

`BatchAnswers` serves the answers of either kind of batch — the instance keeps one set, of its last
executed batch, communication or debugger.

### Which sets serve them

- `BatchBegin`, `BatchEnd`, `BatchAnswers`: a new group `BatchHandlersGroup`
  (`src/lib/handlers/groups/BatchHandlersGroup.ts`) in all four sets — `fullToolSet`,
  `fullReadOnlyToolSet`, `compactToolSetOf`, `compactReadOnlyToolSetOf` — on every transport, under
  these names.
- `DebugBatchBegin`, `DebugBatchEnd`: a group `DebugBatchHandlersGroup` in `fullToolSet` and
  `compactToolSetOf` only — the sets that serve the debugger. No `-ro` set serves them.
- `BatchBegin` and `BatchAnswers` are `connectionless`; `BatchEnd` takes the instance's connection
  (§5.1). `DebugBatchBegin` / `DebugBatchEnd` work on the debugger's connection and are listed in
  `DEBUGGER_OWN_CONNECTION_TOOLS`.

### Wording

- `BatchBegin`: "Switches this server into batch mode: from now on each call of a tool that sends
  one request is recorded instead of sent, and returns nothing. Every request recorded is numbered,
  in the order made, from 1. A tool that sends more than one request is refused in batch mode; use
  the single-request tools (compact: HandlerCreate with create_only, HandlerLock, HandlerUpdate with
  lock_handle, HandlerUnlock, HandlerGet) and run each phase as its own batch. BatchEnd sends the
  recorded calls; read their answers by number with BatchAnswers. Over HTTP, send the state_handle
  this answers in the request header on every call of the batch."
- `BatchEnd`: "Sends every call recorded since BatchBegin, in parallel envelopes, with the
  credentials in force now, and leaves batch mode whatever happens; nothing is sent twice. Answers
  how many requests were recorded and which numbers failed; read each answer with BatchAnswers."
- `BatchAnswers`: "The answers of the last batch, by number: each is SAP's answer to that request as
  it came — status, headers and body — or why it was not sent. A number the last batch does not have
  answers: no answer with that number."
- `DebugBatchBegin` / `DebugBatchEnd`: the same sentences, scoped to "the stopped debuggee: step,
  step to line, stack, variables, child variables, stack position, setting a variable".
- **Every other tool** gets one sentence appended at registration (`BaseMcpServer.registerHandlers`,
  one place, so no handler file changes): an eligible tool — "In batch mode (BatchBegin) a call is
  recorded and returns nothing; requests are numbered in the order made, and their answers are read
  by number with BatchAnswers once BatchEnd has run."; a tool eligible only for some arguments adds
  which (from its eligibility entry, §4.2); an ineligible tool — "In batch mode (BatchBegin) this
  tool is refused: it sends more than one request." Tools of a registry that registers its own
  (`trackingRegistrations`) get the ineligible sentence through the proxy's `registerTool`.

## 4. Recording

### 4.1 Dispatch in batch mode

In `BaseMcpServer.registerHandlers`' `runCall`, after the call entered the main flow and after
`systemBeforeTool` (both unchanged, so a recorded call is admitted, ordered and given its system
context exactly as any call), and before the handler is chosen:

1. If no batch is open: nothing changes.
2. **While a batch is open, only the batch tools and the open batch's eligible tools are served;
   every other tool is refused** — the debugger tools during a communication batch, every tool but
   §7's during a debugger batch, the leftover-session and background-run tools, a registry's own
   tools. For a communication batch the call is looked up in the eligibility table (§4.2) by tool
   name, arguments and connection. Not eligible → answered at once with the server's refusal
   `batch_not_recordable` (§8); the handler never runs; nothing goes into an envelope, so the call
   has **no number**. The background-run branch, the long-read branch (`runLongCall`) and the
   `timeout` handling are not taken in batch mode (§4.4).
3. Eligible → recorded (below).

Recording an eligible call:

- The handler gets `{ ...context, connection: recorder }` — a **per-call recorder**, an
  `IAbapConnection` over the open `AdtBatchConnection` that forwards every call and, for each
  `makeAdtRequest`, takes the batch's next number at that moment and captures that request's
  settlement (its part, or its rejection) under the number. Nothing else of the context changes.
- The handler is started inside the same scopes as today (`inHeldFlow`, `withDestinationSystemContext`,
  `withKnownSystemContext`), but its request-signal scope is the **batch's** signal, not the call's
  (§4.3).
- The call **waits until its handler has recorded its request or settled**, whichever is first —
  no SAP answer is awaited, because none exists before `BatchEnd`. Waiting for the record keeps the
  queue in call order (so phases stay in one run and envelopes do not alternate).
- **Recorded** → the call returns `{ content: [] }` — "returns nothing" on the MCP wire:
  `CallToolResult.content` may be empty (SDK 1.32 `CallToolResultSchema`: "it may be empty"), no
  `isError`, no text, no number. The handler's promise gets a rejection handler at once, so it never
  rejects unhandled. The handler continues; when `execute()` settles its part its continuation
  runs, and its result is not used for any answer — the answer is SAP's part as it came (§5.3).
- **Settled without recording** (the handler refused its arguments before sending) → nothing went
  into an envelope: the call has **no number**, and it answers the handler's own answer at once, as
  outside batch mode.

**Numbering.** Every request that goes into an envelope has its own number, from 1, in the order
the requests were recorded — and only those: a refused call, or a handler that refused before
sending, takes none. With the main flow sequential and each eligible call recording one request, the
numbers follow the calls made. A request a member records **while settling** — the `406`/`415`
corrected retry **[doc]** — also goes into an envelope (a follow-up one, inside the same
`execute()`), so it gets its own number too: the next free one, after every number taken while
recording (see "Contradictions" at the end).

### 4.2 Eligibility: declared, reviewed, proven

A file `tools/batch-handlers.json`, in the style of `tools/long-handlers.json`, lists every tool that
may be recorded, with:

- `tool`, `set` (`full` | `compact`; a `-ro` set serves an entry when its set's read half does),
  `handler` (path#function), `sends` (the one request, in words);
- `when` (optional): the arguments under which the call sends one request — an equality, a
  membership or a presence on named arguments (as `longTools.ts`' `NOT_A_READ` reads
  `object_type`), e.g. `HandlerUpdate` only with `lock_handle`, and for DOMAIN, DATA_ELEMENT and
  PACKAGE only with `document` (§4.6); `HandlerCreate` only with `create_only: true`; `HandlerGet`
  only for the parts that send one GET (not `contents`, not `UNIT_TEST`/`CDS_UNIT_TEST`);
- `connection` (optional): `http` when the one request holds only over HTTP — `HandlerLock` /
  `HandlerUnlock` of `PACKAGE`: over RFC the package lock opens an ABAP session of its own
  (`connectionForPackageLock`), outside the batch, so over RFC that entry is not eligible.

`src/lib/batch/eligibility.ts` reads the file once and answers `eligible(tool, args, connection)`.
Nothing outside the file decides eligibility; a tool not listed is refused.

What the code settles about the first entries (each still proven by its test):

- **Eligible:** `HandlerCreate` with `create_only` (§4.6). `HandlerLock` and `HandlerUnlock` (all
  types; `PACKAGE` over HTTP only) — one `lock()`/`unlock()` each (`handleLockObject` /
  `handleUnlockObject`). `HandlerUpdate` with `lock_handle` for the source-written types (CLASS,
  PROGRAM, INTERFACE, DDL, TABLE, STRUCTURE, FUNCTION_MODULE, BEHAVIOR_DEFINITION,
  METADATA_EXTENSION — each proven), and for DOMAIN, DATA_ELEMENT, PACKAGE with `document`
  (§4.6). Single-GET reads of the full and compact sets, `HandlerGet` per part.
- **Not eligible:** `HandlerUpdate` with `lock_handle` and `properties` for DOMAIN, DATA_ELEMENT,
  PACKAGE — it reads the metadata, then writes it patched (`handleUpdateDomain`'s `sequence(read,
  update)`): two requests, the second needing the first's answer. `HandlerCreate` without
  `create_only` and every high tool (validate → create → lock → write → unlock → check → activate,
  `handleCreateDomain`). Multi-request long reads (`GetWhereUsed` with a filter, `SearchSource`,
  `GetPackageContents`, `GetObjectsList`, …, per `tools/long-handlers.json`' `sends`). Debugger
  tools, background runs, the leftover-session tools.

### 4.3 The recorded handler's signal and lifetime

`trackCall` aborts a call's signal when the call settles; a recorded handler outlives its call, so
it runs under the batch's own `AbortController` instead — aborted only when the batch is dropped
(instance close, `dispose()`), never at `BatchEnd`. Recorded handlers are not tracked in the
instance's `inFlight` (the HTTP pool awaits `idle()` before returning an instance; a recorded
handler waits for `BatchEnd`, so counting it would hold every request open) and are not active
tools (`registerActiveTool`): the shutdown's `logOffAtOnce` interrupts `BatchEnd`, which is.

### 4.4 Long reads

A listed long read (`isLongTool && isLongRead`) is one call. In batch mode it is not given a
connection of its own: `runLongCall` / `openFreshConnection` are not called, and the call is
recorded on the batch connection like any eligible call — when its entry is in
`tools/batch-handlers.json` (single-request long reads: `SearchObject`, `GetSqlQuery`,
`GetTableContents`, `GetATCFindings`, `HandlerSearch`, `HandlerGetData`, the profiler trace views,
`HandlerGet` per part).

**In batch mode there is no timeout**: a long read in batch mode takes none. A call that gives
`timeout` in batch mode is **refused before anything is recorded** (`batch_no_timeout`: "in batch
mode a read takes no timeout: the batch is sent at BatchEnd, with no deadline"), and takes no number
— *this design's recommendation, marked as such:* refusing rather than ignoring, because a parameter
silently dropped hides the caller's mistake.

### 4.5 What a recorded call touches outside the batch

Recording runs inside the call's normal turn, so before the handler starts `systemBeforeTool` may
ask the system information on the instance's connection (a real request, as for any call — it is
not the tool's, and it has no number). While recording, `connect()` / `getBaseUrl()` /
`getSessionId()` of the batch connection reach the wrapped connection at once (§1); the wrapped
connection is a late-bound target (§5.1) pointing, during a recording call's turn, at the connection
that call holds.

### 4.6 The two new single-request modes in compact

Both live in the compact modify half (`compact-modify`), are served by `compact` (not `compact-ro`),
and are eligible in batch mode. They work outside batch mode too, as one request each.

- **`HandlerCreate` with `create_only: true`** — sends only the create `POST` of the type's
  adt-clients `create()` (no validate, lock, write, unlock, check or activate): a new route in
  `compactWriteRoutes` beside the high create, calling `createAdtClient(connection).get<Type>().create(
  config, { analyse })` with the arguments the high create already maps for its own create step.
  Schema (`compactCreateSchema`): `create_only: boolean`, default `false`, "send the create request
  alone: no validation, lock, write, check or activation; the object is created inactive with what
  the create carries". Offered for the types whose `create()` sends one request — proven per type
  (§9.1); a type whose `create()` sends more is refused with `create_only` ("create_only is not
  available for <type>: its create sends more than one request"). DOMAIN sends one **[code]**.
- **`HandlerUpdate` with `lock_handle` and `document`** for DOMAIN, DATA_ELEMENT and PACKAGE — the
  caller gives the whole metadata document, and only the `PUT` is sent:
  `get<Type>().updateMetadata({ name, transportRequest }, { source: document, lockHandle, analyse })`
  — nothing read, nothing patched. Schema (`compactUpdateSchema`): `document: string`, "DOMAIN,
  DATA_ELEMENT, PACKAGE under lock_handle: the whole metadata document to write, sent as given —
  nothing is read or kept; anything left out is gone". `document` without `lock_handle`, or
  `document` beside `properties` or the flat fields `properties` covers, is refused before anything
  is sent. With `properties` (no `document`) the existing read-patch-write stays, and stays
  ineligible. The source-written types already send one `PUT` under a lock and take no `document`.

Names (`create_only`, `document`) are proposals under the owner's decision to add both modes (open
question 3).

## 5. Execution at `BatchEnd`

### 5.1 The credentials in force at execution

The `AdtBatchConnection` does not wrap the instance's connection object directly — that object may
be replaced (`getConnection` retires it on a new credential object — HTTP: every request; SSE: per
connection — or on a lost session) and the retired one ends with its logoff. It wraps a
**late-bound target** (`src/lib/batch/lateBound.ts`), an `IAbapConnection` whose every member
forwards to `current`, set by the owner:

- in a recording call's turn: the connection that call took (`getConnection`), cleared when the call
  returns;
- in `BatchEnd`: the connection `BatchEnd` takes with `getConnection(signal)` inside its main-flow
  turn (after `isStaleBuilt` replacement, as every call does) — the instance's current connection,
  with the credential the source answers now. `BatchEnd` holds that use (`connectionReleased` in its
  `finally`) for the whole `execute()`, so a replacement cannot log it off under the envelopes.

`setSessionType` / `getSessionType` / `getSessionMode` forward too, so the stateful LOCK/UNLOCK
envelopes run on, and are restored on, the connection in force. The late-bound target never sends
outside `execute()`'s `makeAdtRequest` and the three delegated members.

The connection may be HTTP or RFC: **batch mode is offered over RFC**, as over HTTP; a live test
measures it (§9.3), and a problem found there may be the RFC transport's, not the batch's.

A `401` on an envelope is the connection's: it asks its credential to renew and retries that one
request once (connection 17, `AbstractAbapConnection` `readyWireUpfront`/request retry, read in
`node_modules`) — SAP refused the envelope before running it, so this is not a re-send of executed
work. A refusal after that reaches `execute()` as the connection's `AuthRefusedError` (§5.4).

### 5.2 The sequence

`BatchEnd` (a tool on the instance's connection, in the main flow):

1. A communication batch must be open, else `batch_mode_off` (or, while the debugger batch is
   open, `batch_mode_other`).
2. Take the connection (§5.1), point the target at it.
3. `execute()` — awaited to its end; no timeout. Every part settles inside it, follow-up envelopes
   included (§1).
4. In `finally`, whatever `execute()` did: mode → `off`, the queue and recorder dropped (nothing can
   be sent again — the `AdtBatchConnection` instance is discarded), the target cleared, the use
   released. **`BatchEnd` always ends batch mode**; there is no retry and no repeat.
5. Build each number's answer (§5.3), replace the kept answers, answer.

### 5.3 What came: the answers and `BatchEnd`'s answer

**Whatever SAP returned is what is returned.** Each number's answer is built from what its recorder
captured, never from the handler's result and never through a reading, a strategy or `analyse`:

- **SAP answered its part** (resolved 2xx, or rejected with `response`): `{ number, status,
  status_text, headers, body }` — SAP's part as it came: the inner status, its text, the inner
  headers as adt-clients parsed them (names lower-cased **[code]**), the body as text, `""` when
  the part had none (goal: "an empty line when there is none").
- **Its envelope failed** (rejected with the envelope's error): what came for the envelope — SAP's
  outer response as it came (`status`, `status_text`, `headers`, `body`) when SAP answered it, else
  the error as it came (its message, and the step `batch envelope`, as the server's C6 shape renders
  a method's error).
- **Not sent** (rejected with adt-clients' "not sent" wrapper): `{ number, not_sent: true, message }`
  with the wrapper's message — the goal's "a call whose part was never sent … gets that as its
  answer".
- **A credential refusal**: as it came (§5.4).

`BatchEnd` answers what came for the batch: `{ recorded: <count>, failed: [<numbers>] }` — a number
fails when its part is not 2xx, it was not sent, or its envelope failed — and, when `execute()`
rejected, beside it what came for that failure (SAP's outer response as it came, or the error as it
came; a credential refusal per §5.4). An empty batch answers `{ recorded: 0, failed: [] }`
(adt-clients sends nothing **[code]**) and replaces the kept answers with none.

### 5.4 A credential refusal

A credential refusal reaches the caller **as it came**: the connection's refusal, answered as the
server answers it for any call (`readFailure` → `answerRead`: the chain's own payload and words, no
secret, never rebuilt from a message).

- **Unanswered** (the provider refused before SAP was asked): every part rejects with the same
  refusal object **[code]**, `execute()` rejects with it. `BatchEnd` ends batch mode (§5.2.4); its
  call answers that refusal (the owner's rule "a credential refusal ends the call"), and every
  number's answer is the same refusal, as it came.
- **Answered** (SAP's `401` the provider could not renew): the active envelope's parts carry the
  refusal, later ones "not sent" **[code]**; `BatchEnd` answers the refusal as it came; the numbers'
  answers are the refusal or "not sent" per §5.3.

## 6. Answers by number

`BatchAnswers` reads `batch.answers`: for each number asked, in the order asked, its entry, or
`{ number, error: 'no_answer', message: 'no answer with that number' }` when the last executed batch
has no such number or no batch has run on this instance. Nothing is sent. The answers live until the
next `BatchEnd` executes and replaces them — so the previous phase's answers (the lock handles a
write needs) stay readable while the next phase is recorded — or the instance ends (stdio: the
process; SSE: the connection; HTTP: the pooled instance leaving the pool). Nothing of the batch's own
runs on a clock; the state's idle bound applies (§2). `BatchAnswers` is served while a batch is open.

## 7. The debugger batch

### Scope

`DebugBatchBegin` opens a batch with `endpoint: 'debugger'` on **the attached debuggee's
connection** — `DebugSession`'s current `Stop.connection`, the stateful connection the attach ran on
(`openStateful`) — through a batch `AbapDebugger` built by the session's port
(`ports.abapDebugger(batchConnection, mode)`). Recorded operations at a stop, and the tools that
reach them:

| Operation | Full set | Compact |
|---|---|---|
| step (into, over, return, continue) | `DebugStep` | `HandlerDebugStep` `action` ∈ into/over/return/continue |
| step to line | `DebugStepToLine` | `HandlerDebugStep` `run_to_line`/`jump_to_line` **with** `object_type` and `object_name` (without them it reads the stack first: two requests) |
| stack | `DebugGetStack` | `HandlerDebugView` `what: 'stack'` |
| variables | `DebugGetVariables` with names | `HandlerDebugView` `what: 'variables'` with names |
| child variables | `DebugGetVariables` with parents | `HandlerDebugView` `what: 'variables'` without names (`@ROOT`) |
| stack position | `DebugSetStackPosition` | — |
| set a variable | `DebugSetVariable` | — |

Every other tool is refused while the debugger batch is open (§4.1): breakpoints, watchpoints, the
listener, start / wait / take-over / stop, attach, detach, `release_debugger`, terminate, memory
sizes and snapshots, settings, and every non-debugger tool.

**Each operation is one request in batch mode.** Today `step` / `stepToLine` follow the move with a
stack read (`afterMove`), and `setStackPosition` with one too: in batch mode the operation records
its own request only; the stack is in the batch when the model recorded `stack`.

### Mechanics

- **Preconditions** of `DebugBatchBegin`: the instance's debugger holds a session with an ABAP stop
  (`requireStop`) — the instance is the one the call reached (on HTTP, by the header, §2); the
  communication batch off (else `batch_mode_other`); no debugger batch already open. The tool takes
  no `state_handle` argument (open question 2).
- **The session's serial.** Every session change runs through `DebugSession.mutate` → `Serial`. A
  recorded operation must not await its answer inside the serial — the second recorded call would
  wait behind the first, which waits for `DebugBatchEnd`: a deadlock. So `DebugBatchBegin` takes the
  serial once and holds it until the batch ends; recorded operations go through a batch path of the
  session (`recordStep`, `recordStack`, …) that checks the stop and records on the batch debugger
  without entering the serial. Nothing else changes the session while the batch is open.
- **Recording** is as §4.1: a per-call recorder (a fresh `AbapDebugger` over a per-call recorder of
  the batch connection, so each request takes its number), `{ content: [] }` once recorded.
  Debugger tools take no turn in the main flow today (`worksOnOwnConnection`); numbers follow the
  record order.
- **`DebugBatchEnd`**: `execute()` on the debuggee connection (the debugger batch goes with that
  connection's credential; the attached session lives there and cannot be swapped). In `finally`:
  mode `off`, the serial released. Then the session applies, in number order and with the readers
  it uses today (`readDebuggeeEnd`, `readAttach`, `readStack`), what the answers say about the stop
  — a move answering the debuggee's end releases the stop (`releaseStop`) **after** `execute()`
  settled, never under its envelopes; the last move's attach and the last stack read update the
  view. No request is sent for this. Answers and `DebugBatchEnd`'s answer as §5.3–5.4.
- **AMDP**: `AmdpSession` is not offered in the debugger batch until a test against a system
  confirms it (§9.3). Until then `DebugBatchBegin` on an AMDP stop is refused
  `debug_batch_amdp_unmeasured` ("AMDP debugging is not offered in a debugger batch: not yet
  confirmed against a system").

## 8. The main flow, refusals, close and disconnect

- **Sequential calls.** Recording calls and `BatchEnd` take their turn in the main flow like any call
  on the instance's connection; `BatchBegin` and `BatchAnswers` touch no connection and take none
  (`connectionless`). A recorded call leaves the flow as soon as its request is recorded. Only LOCK
  and UNLOCK go stateful, in their own envelopes, as adt-clients sends them.
- **One batch at a time.** `BatchBegin` while either batch is open, and `DebugBatchBegin` while
  either is open, are refused `batch_mode_on` / `batch_mode_other`.
- **Refusals** are the server's own (`ServerRefusal`, answered `{ error: <code>, message }` like the
  existing ones, no `kind`, nothing read from a server): `batch_mode_unavailable`, `batch_mode_on`,
  `batch_mode_other`, `batch_mode_off`, `batch_not_recordable` ("<tool> sends more than one request
  and cannot be recorded in batch mode; record its steps with the single-request tools —
  compact: HandlerCreate with create_only, HandlerLock, HandlerUpdate with lock_handle,
  HandlerUnlock, HandlerGet — each phase its own batch"; for a tool refused only because a batch is
  open: "<tool> is not served while a batch is open"), `batch_no_timeout`,
  `debug_batch_amdp_unmeasured`. SAP's answers and errors reach the model as they came: a part is
  SAP's part, an envelope's failure what came for it, a method's error the C6 shape (the method's
  error as it is plus `step`), a credential refusal the chain's answer.
- **Instance close with a batch open** (stdio's client close, an SSE close, the pool's eviction,
  process shutdown): nothing recorded is sent. `closeInstance` gets a `dropBatch?()` step beside
  `cutBackgroundRuns` (the close lets go of state without `dispose()`), which aborts the batch's
  signal and discards the `AdtBatchConnection` and the answers. Recorded part promises never settle
  (adt-clients has no discard **[code]**); they and their handlers are released with the object.
  A debugger batch's hold on the serial is released first, so the debugger's own cleanup
  (`DebuggerInstance.stop()` through `mutate`) is not blocked. A `BatchEnd` running at the close is
  interrupted like any running tool (`logOffAtOnce`): the logoff goes out under its envelopes.
- **HTTP disconnect.** HTTP instances are built with `transportCloseEndsSession: false`: a dropped
  request ends no call. A dropped recording call has already recorded or still records; a dropped
  `BatchEnd` runs to its end, and its answers are kept — the model reads them later with
  `BatchAnswers` and the same handle in the header.
- **`dispose()`** (the pool's undo, the idle bound): drops an open batch (nothing sent) and the
  answers; the part then holds nothing.

## 9. Testing

Every rule below gets a test, and each test is proved load-bearing: break the rule in the code,
watch the test go red, revert (the *Break* line).

### 9.1 Unit (no SAP; fake connections and the ADT stand-in used by `lowToCompact.test.ts`)

- **Owner lifecycle** — begin/end, numbers from 1 in record order, one batch at a time across kinds,
  answers replaced at the next `BatchEnd` (still readable while the next batch records), `no answer
  with that number` for an unknown number and before any batch, `number` vs `numbers`.
  *Break:* start the counter at 0; replace the answers at `BatchBegin`.
- **Recording returns nothing without awaiting** — an eligible tool in batch mode answers
  `{ content: [] }` while the fake's `execute` has not run; the instance's real connection receives
  no `makeAdtRequest` during recording. *Break:* await the part in the dispatch.
- **Queue order is call order** — two handlers with an artificial pre-record delay; the envelope
  holds them in call order. *Break:* return before the record.
- **Numbers only for what went into an envelope** — a refused call and a handler that refuses its
  arguments before sending take no number and answer at once; the next recorded request takes the
  next number. A follow-up request recorded while settling (a fake member's corrected retry) takes
  its own number after the last recorded one. *Break:* number at call entry.
- **Only batch tools and eligible tools while a batch is open** — a high tool, `HandlerUpdate`
  DOMAIN with `properties`, a debugger tool during a communication batch, a leftover-session tool:
  refused, handler not called, nothing recorded or sent. *Break:* default eligibility to true.
- **Eligibility proof per entry** — for every entry of `tools/batch-handlers.json`, the handler runs
  with the entry's arguments against a counting connection and issues exactly one
  `makeAdtRequest`; a source test fails when an entry has no case, names a tool its set does not
  serve, or a served tool has an entry with no test. *Break:* add a second request to one listed
  handler.
- **`create_only`** — per type in the create route: exactly one `POST`, the create's own, nothing
  else (no validate, lock, write, check, activate); a type whose `create()` sends more refuses
  `create_only` before sending; without `create_only` the high create runs unchanged. *Break:*
  route `create_only` to the high create.
- **`document` under a lock** — DOMAIN, DATA_ELEMENT, PACKAGE: exactly one `PUT`, its body the given
  document byte for byte, its lock handle the given one, no read; `document` without `lock_handle`,
  or beside `properties`, refused before sending; `properties` keeps the read-patch-write. *Break:*
  read before writing.
- **Credentials at execution** — a source whose credential object changes between recording and
  `BatchEnd`: the envelopes go on the connection `BatchEnd` took, none on the retired one, and the
  retired one is not logged off under `BatchEnd`. *Break:* wrap the recording call's connection.
- **`BatchEnd` always ends, nothing re-sent** — `execute` rejecting: mode off, a second `BatchEnd`
  refused `batch_mode_off`, the fake saw each envelope once. *Break:* reset the mode only on success.
- **What came** — 2xx with body, bodyless `200` (`body: ""`), a `404` part beside 2xx parts, an
  envelope SAP answered `500` (the outer response as it came, in the parts' answers and in
  `BatchEnd`'s), an envelope with no answer, the not-sent ones; the summary's `failed`.
  *Break:* run the member's strategy over the part.
- **Credential refusal** — a refusal-shaped object (own `refusal.kind`, `refusal.reason`, `at`,
  no `response`) thrown by the target: `BatchEnd` answers it as `answerRead` does, every number's
  answer is it, mode off; the answered variant (`cause.response.status === 401`). *Break:* wrap
  the refusal in a "not sent" or summary-only answer.
- **Long read recorded, no timeout** — a listed single-request long read in batch mode:
  `openFreshConnection` and `runLongCall` not called, the read is in the envelope; with `timeout`
  it is refused `batch_no_timeout`, nothing recorded. *Break:* keep the long-read branch first.
- **Surface** — every set serves the three batch tools, `DebugBatch*` only in full and compact, no
  batch tool has a `state_handle` property, every tool's description carries its sentence;
  `compact/tests/fixtures/surface.json` updated (the new `create_only` and `document`).
- **Close / dispose** — `closeInstance` with a batch open: zero envelopes, no unhandled rejection
  (plain-node recorder), the debugger's stop not blocked by a held serial. *Break:* omit `dropBatch`.
- **Debugger batch** — begin needs a stop; the serial is held (a breakpoint change waits); step +
  stack + variables recorded into one debugger envelope on the stop's connection; a step answering
  the debuggee's end releases the stop only after `execute`; AMDP refused; begin of either batch
  refused while the other is open; breakpoint/listener tools refused. *Break:* record inside `mutate` — the
  second call is then never recorded, and the test asserts both records once the second call returned.

### 9.2 Integration (no SAP)

- **HTTP pool** (`http/src/__tests__`): the header is read and routes the request; `BatchBegin`
  answers the handle; the instance is kept; a later call with the handle in the header is recorded
  on that instance, and a kept instance gets each request's header value; a call without it (or
  with an unknown one) lands on a fresh instance where `BatchAnswers` answers "no answer with that
  number"; a dropped `BatchEnd` request keeps its answers. *Break:* `holdsState()` false while a
  batch is open; read the handle from the arguments.
- **stdio / SSE**: the batch is the instance's; an SSE close drops it with nothing sent.

### 9.3 Live (each test states where it runs and skips elsewhere with the reason)

Gated by `tests/test-config.yaml`, as the existing integration suites, with a test case per check
(disabled by default):

- **Communication batch, on-premise over HTTP**, **on-premise over RFC** and **ABAP Cloud** — through
  the served tools (hard mode): N reads; then compact `HandlerCreate` `create_only` × N,
  `HandlerLock` × N, `HandlerUpdate` with `lock_handle` (sources; `document` for DOMAIN) × N,
  `HandlerUnlock` × N, each phase its own batch; answers per number; cleanup deletes the objects. The
  RFC case measures the batch over RFC; a failure there is reported with what came, since it may be
  the RFC transport's rather than the batch's.
- **Debugger batch, on-premise** and **ABAP Cloud** — at a live stop: step + stack + variables in one
  `DebugBatchEnd`; the session's view matches.
- **AMDP debugger batch** — on a system that runs AMDP debugging (on-premise on HANA); the gate for
  offering it: until it has passed there, §7's AMDP refusal stays. Its result goes to the docs with
  the date.

No unit test talks to SAP; no live test runs in CI.

## 10. Docs, changelog, dependency

- **Dependency:** `@mcp-abap-adt/adt-clients` `^32.0.0` → `^33.0.0`, after 33.0.0 is on the registry;
  the lockfile checked for anything not from the registry.
- **README.md** — a "Batch mode" section: what it is for, the phases (create / lock / write / unlock,
  each a batch), the tools, the handle header over HTTP.
- **docs/user-guide/** — `AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`,
  `AVAILABLE_TOOLS_HIGH.md` (the batch tools, the per-tool sentence), `HANDLERS_MANAGEMENT.md`
  (which sets serve them), `DEBUGGER.md` (the debugger batch, what it covers, AMDP not offered yet),
  `CLIENT_CONFIGURATION.md` (HTTP: the handle header on every call of a batch), a new
  `BATCH_MODE.md` (the full behaviour, the eligibility list rendered from
  `tools/batch-handlers.json`).
- **docs/architecture/** — `STATEFUL_SESSION_GUIDE.md` (LOCK/UNLOCK stateful envelopes on the
  instance's connection), `ARCHITECTURE.md`.
- **src/embeddable/docs/ARCHITECTURE.md** — the `batch` and `requestStateHandle` options, the owner,
  the pool keeping a batch-holding instance, the close.
- **http/README.md** (the header), **compact/README.md**, **compact/docs/AVAILABLE_TOOLS.md**
  (`create_only`, `document`).
- **docs/MIGRATION-19.0.md** — embedders: the new `batch` constructor option (absent → batch tools
  answer `batch_mode_unavailable`); the new tools in every set; the compact create and write modes.
- **CHANGELOG.md** — the 19.0.0 entry (this PR's release) gains under *Added* the batch mode, the
  debugger batch and the two compact modes, and under *Changed* adt-clients `^33.0.0` with what it
  changes for the server (a credential refusal rethrown by every member). No earlier version's
  entry is touched.
- Tool descriptions: §3.

## Contradictions with the owner's answers

- **A retry's own number vs "numbered in the order the calls were made".** A `406`/`415` corrected
  retry is recorded while `execute()` settles, after every call of the batch, so its number comes
  after the last call's: the numbers no longer map one to one onto the calls, and the model cannot
  tell from the number alone which call the retry belongs to. The numbers taken while recording
  still follow the calls. Nothing in the answers links a retry to its call (open question 4).
- **"No `state_handle` parameter on tools" vs the debugger tools.** Every debugger "use" tool takes
  `state_handle` today, and the pool reads it from the body; this design leaves them as they are and
  gives the batch tools none (open question 2).

## Open questions for the owner

1. **The header's name.** *Recommendation:* `x-mcp-state-handle` (the other headers this server
   reads are `x-sap-*`, which name SAP credentials and system facts; the handle is the MCP
   instance's).
2. **The debugger tools' `state_handle` argument and the pool's reading of it from the body** —
   keep, or move them to the header as well. *Recommendation:* keep them in this PR (not batch
   mode's), and have the pool read the header first, the body's argument second.
3. **Names of the compact modes**: `create_only: boolean` on `HandlerCreate`, `document: string` on
   `HandlerUpdate`. *Recommendation:* as proposed.
4. **Linking a retry's number to its call.** *Recommendation:* `BatchEnd`'s summary lists each
   settlement number with the number it followed (`follow_ups: { <retry>: <original> }`), stating
   what adt-clients sent without reading it.
