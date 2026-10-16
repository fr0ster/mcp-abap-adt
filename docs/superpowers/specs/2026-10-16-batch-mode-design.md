# Batch mode — design

Implements `docs/superpowers/2026-10-16-batch-mode-goal.md` (the goal). The goal is binding; this
document says how, against the code as it is on `feat/auth-chain-6`. Where the goal is silent and the
code does not settle a question, the question is listed at the end with a recommendation and is
**not** decided here; the design marks each such place "(open question N)".

Sources read: `src/embeddable/BaseMcpServer.ts`, `src/handlers/interfaces.ts`, `src/lib/clients.ts`,
`src/lib/longCall.ts`, `src/lib/longTools.ts`, `tools/long-handlers.json`,
`src/lib/packageSessions.ts`, `src/lib/toolSet.ts`, `src/lib/compact/**`, `compact-modify/src/**`,
`compact-readonly-entries/src/**`, `src/handlers/common/low/**`, `src/lib/debugger/**`,
`src/lib/state/InstanceState.ts`, `src/lib/instanceClose.ts`, `src/lib/answer.ts`,
`src/lib/auth/serverRefusal.ts`, `http/src/InstancePool.ts`, and adt-clients 33.0.0
(`src/batch/AdtBatchConnection.ts`, `src/batch/wire.ts`, `src/utils/adtResponse.ts`,
`docs/usage/BATCH.md`, `CHANGELOG.md`) in its `credential-refusals` worktree. Claims about
adt-clients are tagged **[code]** (read in its source), **[doc]** (stated in its BATCH.md or
CHANGELOG, not traced in code) or **[unverified]**.

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
  up to 100 **[code]**; an empty queue answers a synthetic `204` without sending **[code]**;
  concurrent `execute()` is refused **[code]**.
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
  number (see §4), its `AbortController` (the batch's signal, §4.3);
- `answers`: the answers of the last executed batch, by number, kept until replaced or the instance
  ends (open question 6 on *when* a new batch replaces them).

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
`holdsState()`); it also puts batch state under the state's idle bound — see open question 2.
`dispose()` drops an open batch (nothing sent) and the answers.

### How each transport reaches it

- **stdio** — one instance for the process; batch mode is that instance's.
- **SSE** — one instance per SSE connection; batch mode is that connection's.
- **Streamable HTTP** — every request is an MCP session of its own, and the pool routes a
  `tools/call` to the instance whose `stateHandle` equals `params.arguments.state_handle`
  (`handleOf`), else to a new instance. Batch mode uses exactly that: `BatchBegin` answers the
  instance's `state_handle` (as a debugger start does), and every later call meant for the batch
  carries it. `state_handle` is the instance's handle — no batch handle exists, and the instance
  does not check it for batch tools (the pool's routing is the only use). A call without it lands
  on a fresh instance, where batch mode is off: an eligible tool runs normally, `BatchEnd` is
  refused `batch_mode_off`, `BatchAnswers` answers "no answer with that number". How the model
  learns to pass `state_handle` to ordinary tools: open question 3.

## 3. Tool surface

### Tools

| Tool | Arguments | Answers |
|---|---|---|
| `BatchBegin` | `state_handle?` (routing only) | `{ batch: 'on', state_handle }` |
| `BatchEnd` | `state_handle?` | the summary (§5.3) |
| `BatchAnswers` (name: open question 1) | `state_handle?`; exactly one of `number` (integer ≥ 1) or `numbers` (array of integers ≥ 1, at least one) | one entry per number asked, in the order asked (§6) |
| `DebugBatchBegin` | `state_handle` (required, the debugger's `use` check) | `{ debug_batch: 'on', state_handle }` |
| `DebugBatchEnd` | `state_handle` | the summary (§5.3) |

"One number or a list" is two properties because the schema converter
(`src/lib/handlers/utils/schemaUtils.ts`) has no `oneOf`/union support; giving both or neither is
refused before anything runs.

`BatchAnswers` serves the answers of either kind of batch — the instance keeps one set, of its last
executed batch, communication or debugger.

### Which sets serve them

- `BatchBegin`, `BatchEnd`, `BatchAnswers`: a new group `BatchHandlersGroup`
  (`src/lib/handlers/groups/BatchHandlersGroup.ts`) in all four sets — `fullToolSet`,
  `fullReadOnlyToolSet`, `compactToolSetOf`, `compactReadOnlyToolSetOf` — on every transport.
- `DebugBatchBegin`, `DebugBatchEnd`: a group `DebugBatchHandlersGroup` in `fullToolSet` and
  `compactToolSetOf` only — the sets that serve the debugger. No `-ro` set serves them (no `-ro` set
  serves the debugger).
- The batch tools are connectionless in the sense of `entry.connectionless` **except `BatchEnd`**,
  which takes the instance's connection (§5.1). `DebugBatchBegin` / `DebugBatchEnd` work on the
  debugger's connection and are listed in `DEBUGGER_OWN_CONNECTION_TOOLS`.

### Wording

Proposed descriptions (owner approves the words — open question 9):

- `BatchBegin`: "Switches this server into batch mode: from now on each call of a tool that sends
  one request is recorded instead of sent, and returns nothing. Calls are numbered in the order
  made, from 1. A tool that sends more than one request is refused in batch mode; use the
  single-request tools (compact: HandlerLock, HandlerUpdate with lock_handle, HandlerUnlock,
  HandlerGet) and run each phase as its own batch. BatchEnd sends the recorded calls; read their
  answers by number with BatchAnswers. Over HTTP, pass the state_handle this answers with every
  call of the batch."
- `BatchEnd`: "Sends every call recorded since BatchBegin, in parallel envelopes, with the
  credentials in force now, and leaves batch mode whatever happens; nothing is sent twice. Answers
  how many calls were recorded and which numbers failed; read each answer with BatchAnswers."
- `BatchAnswers`: "The answers of the last batch, by number: each is SAP's answer to that call as it
  came — status, headers and body — or why it was not sent. A number the last batch does not have
  answers: no answer with that number."
- `DebugBatchBegin` / `DebugBatchEnd`: the same sentences, scoped to "the stopped debuggee: step,
  step to line, stack, variables, child variables, stack position, setting a variable".
- **Every other tool** gets one sentence appended at registration (`BaseMcpServer.registerHandlers`,
  one place, so no handler file changes): an eligible tool — "In batch mode (BatchBegin) a call is
  recorded and returns nothing; calls are numbered in the order made, and their answers are read by
  number with BatchAnswers once BatchEnd has run."; a tool eligible only for some arguments adds
  which (from its eligibility entry, §4.2); an ineligible tool — "In batch mode (BatchBegin) this tool
  is refused: it sends more than one request." Whether ineligible tools get the goal's sentence
  verbatim instead: open question 9. Tools of a registry that registers its own
  (`trackingRegistrations`) get the ineligible sentence through the proxy's `registerTool`.

## 4. Recording

### 4.1 Dispatch in batch mode

In `BaseMcpServer.registerHandlers`' `runCall`, after the call entered the main flow and after
`systemBeforeTool` (both unchanged, so a recorded call is admitted, ordered and given its system
context exactly as any call), and before the handler is chosen:

1. If `batch.mode` is `off`: nothing changes.
2. If `batch.mode` is `communication`: the call is looked up in the eligibility table (§4.2) by tool
   name and arguments. Not eligible → answered at once with the server's refusal
   `batch_not_recordable` (§8), the handler never runs, nothing is recorded, no number is taken
   (open question 5). Eligible → recorded (below). The background-run branch, the long-read branch
   (`runLongCall`) and the `timeout` handling are not taken in batch mode: a long read is one call
   on the batch connection (§4.4).
3. If `batch.mode` is `debugger`: only the tools of §7's list are recorded; the rest are refused
   (open question 4 on tools that never touch the debuggee).

Recording an eligible call:

- `batch.record()` takes the next number and builds a **per-call recorder**: an `IAbapConnection`
  over the open `AdtBatchConnection` that forwards every call and, for `makeAdtRequest`, tags the
  returned promise with the call's number and captures its settlement (the part, or the rejection).
  The handler gets `{ ...context, connection: recorder }`; nothing else of the context changes.
- The handler is started inside the same scopes as today (`inHeldFlow`, `withDestinationSystemContext`,
  `withKnownSystemContext`), but its request-signal scope is the **batch's** signal, not the call's
  (§4.3).
- The call **waits until its handler has recorded its request or settled**, whichever is first —
  no SAP answer is awaited, because none exists before `BatchEnd`. Waiting for the record keeps the
  queue in call order (so phases stay in one run and envelopes do not alternate) and lets a handler
  that refuses its arguments before sending be seen (open question 5).
- The call then returns `{ content: [] }` — "returns nothing" on the MCP wire: `CallToolResult.content`
  may be empty (SDK 1.32 `CallToolResultSchema`: "it may be empty"), no `isError`, no text, no
  number. The handler's promise gets a rejection handler at once, so it never rejects unhandled.
- The handler continues; when `execute()` settles its part, its own continuation runs and its result
  is **not** used for the answer — the answer is the part as SAP sent it (open question 7).

Numbering is from 1 in the order calls are recorded; with the main flow sequential (one call at a
time on the instance's connection) that is the order the calls were made.

### 4.2 Eligibility: declared, reviewed, proven

A file `tools/batch-handlers.json`, in the style of `tools/long-handlers.json`, lists every tool that
may be recorded, with:

- `tool`, `set` (`full` | `compact`; a `-ro` set serves an entry when its set's read half does),
  `handler` (path#function), `sends` (the one request, in words);
- `when` (optional): the arguments under which the call sends one request — an equality or
  membership on named arguments (as `longTools.ts`' `NOT_A_READ` reads `object_type`), e.g.
  `HandlerUpdate` only with `lock_handle` present and `object_type` in the source-written types;
  `HandlerGet` only for `part` ∈ {`source`, `metadata`, …} and not `contents`, not
  `UNIT_TEST`/`CDS_UNIT_TEST`;
- `connection` (optional): `http` when the one request holds only over HTTP — `HandlerLock` /
  `HandlerUnlock` of `PACKAGE`: over RFC the package lock opens a session of its own
  (`connectionForPackageLock`), so over RFC it is not eligible.

`src/lib/batch/eligibility.ts` reads the file once and answers `eligible(tool, args, connection)`.
Nothing outside the file decides eligibility; a tool not listed is refused.

What the code settles about the first entries (each still proven by its test):

- **Eligible:** `HandlerLock` and `HandlerUnlock` (all types; `PACKAGE` over HTTP only) — one
  `lock()`/`unlock()` each (`handleLockObject` / `handleUnlockObject`). `HandlerUpdate` with
  `lock_handle` for the types whose write under lock is one request (CLASS, PROGRAM, INTERFACE, DDL,
  TABLE, STRUCTURE, FUNCTION_MODULE, BEHAVIOR_DEFINITION, METADATA_EXTENSION — each to be proven).
  Single-GET reads of the full and compact sets, `HandlerGet` per part.
- **Not eligible:** `HandlerUpdate` with `lock_handle` for DOMAIN, DATA_ELEMENT and PACKAGE — the
  low update reads the metadata, then writes it patched (`handleUpdateDomain`'s `sequence(read,
  update)`): two requests, the second needing the first's answer. Every high tool (create, update
  without a handle, delete, activate: validate → create → lock → write → unlock → check → activate,
  `handleCreateDomain`). `HandlerCreate` — it routes to the high create (`compactWriteRoutes`);
  **no tool in any set sends a create alone** (open question 8). Multi-request long reads
  (`GetWhereUsed` with a filter, `SearchSource`, `GetPackageContents`, `GetObjectsList`, …, per
  `tools/long-handlers.json`' `sends`). Debugger tools, background runs (`background: true`), the
  leftover-session tools (open question 4).

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
`HandlerGet` per part). Its `timeout` argument has nothing to cut in batch mode: open question 10.

### 4.5 What a recorded call touches outside the batch

Recording runs inside the call's normal turn, so before the handler starts `systemBeforeTool` may
ask the system information on the instance's connection (a real request, as for any call — it is
not the tool's). While recording, `connect()` / `getBaseUrl()` / `getSessionId()` of the batch
connection reach the wrapped connection at once (§1); the wrapped connection is a late-bound target
(§5.1) pointing, during a recording call's turn, at the connection that call holds.

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

A `401` on an envelope is the connection's: it asks its credential to renew and retries that one
request once (connection 17, `AbstractAbapConnection` `readyWireUpfront`/request retry, read in
`node_modules`) — SAP refused the envelope before running it, so this is not a re-send of executed
work. A refusal after that reaches `execute()` as the connection's `AuthRefusedError` (§5.4).

### 5.2 The sequence

`BatchEnd` (a tool on the instance's connection, in the main flow):

1. `batch.mode` must be `communication`, else `batch_mode_off` (or, while the debugger batch is
   open, `batch_mode_other`).
2. Take the connection (§5.1), point the target at it.
3. `execute()` — awaited to its end; no timeout. Every part settles inside it, follow-up envelopes
   included (§1).
4. In `finally`, whatever `execute()` did: mode → `off`, the queue and recorder dropped (nothing can
   be sent again — the `AdtBatchConnection` instance is discarded), the target cleared, the use
   released. **`BatchEnd` always ends batch mode**; there is no retry and no repeat.
5. Build each number's answer (§5.3), replace the kept answers, answer the summary.

### 5.3 Answers and the summary

Each number's answer is built from what its recorder captured, never from the handler's result:

- **SAP answered its part** (resolved 2xx, or rejected with `response`): `{ number, status,
  status_text, headers, body }` — SAP's part as it came: the inner status, its text, the inner
  headers as adt-clients parsed them (names lower-cased **[code]**), the body as text, `""` when
  the part had none (goal: "an empty line when there is none"). No reading, no strategy, no
  `analyse`.
- **Not sent** (rejected with adt-clients' "not sent" wrapper): `{ number, not_sent: true,
  message, step: 'batch' }` with the wrapper's message — the goal's "a call whose part was never
  sent … gets that as its answer".
- **Its envelope failed** (rejected with the envelope's error, no part): the error rendered as the
  server renders a thrown error today (`thrownEntry(error, 'batch envelope')` — the method's error
  as it is plus `step`, the C6 shape; a chain failure as the chain made it).
- **A credential refusal**: §5.4.
- **More than one request recorded by one call** (a follow-up recorded while settling, e.g. a
  `406`/`415` corrected retry **[doc]**): the parts in order, as a list under `parts` (open question 7).

The summary `BatchEnd` answers: `{ recorded: <count>, failed: [<numbers>] }` — a number fails when
any of its parts is not 2xx, or it was not sent, or its envelope failed. An empty batch answers
`{ recorded: 0, failed: [] }` (adt-clients sends nothing **[code]**) and replaces the kept answers
with none.

### 5.4 A credential refusal

- **Unanswered** (the provider refused before SAP was asked): every part rejects with the same
  refusal object **[code]**, `execute()` rejects with it. `BatchEnd` ends batch mode (§5.2.4) and
  its call answers the refusal **as any call that meets it does** — through `readFailure` /
  `answerRead` (the chain's payload, its words, no secret) — the owner's rule "a credential refusal
  ends the call". Every number's answer is that same refusal, rendered the same way.
- **Answered** (SAP's `401` the provider could not renew): the active envelope's parts carry the
  refusal, later ones "not sent" **[code]**; `BatchEnd` answers the refusal as above; the numbers'
  answers are the refusal or "not sent" per §5.3.
- Whether `BatchEnd`'s refusal answer also carries the summary: open question 11.

## 6. Answers by number

`BatchAnswers` reads `batch.answers`: for each number asked, in the order asked, its entry, or
`{ number, error: 'no_answer', message: 'no answer with that number' }` when the last executed batch
has no such number or no batch has run on this instance. Nothing is sent. The answers live until the
next batch replaces them (open question 6) or the instance ends (stdio: the process; SSE: the
connection; HTTP: the pooled instance leaving the pool) — no clock of the batch's own (open
question 2 for the state's idle bound). `BatchAnswers` is served while batch mode is on.

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

Not part of it (refused in debugger batch mode): breakpoints, watchpoints, the listener, start /
wait / take-over / stop, attach, detach, `release_debugger`, terminate, memory sizes and snapshots,
settings — they run on other connections or change the session itself (goal: "Breakpoints, the
listener and attaching run on other connections and are not part of it").

**Each operation is one request in batch mode.** Today `step` / `stepToLine` follow the move with a
stack read (`afterMove`), and `setStackPosition` with one too: in batch mode the operation records
its own request only; the stack is in the batch when the model recorded `stack`. (This follows from
the goal listing the operations and the single-request rule; open question 12 confirms it.)

### Mechanics

- **Preconditions** of `DebugBatchBegin`: the debugger's `use` check (`requireDebugger(..., 'use')`,
  `state_handle`), an ABAP stop (`requireStop`), the communication batch off (else
  `batch_mode_other`), no debugger batch already open.
- **The session's serial.** Every session change runs through `DebugSession.mutate` → `Serial`. A
  recorded operation must not await its answer inside the serial — the second recorded call would
  wait behind the first, which waits for `DebugBatchEnd`: a deadlock. So `DebugBatchBegin` takes the
  serial once and holds it until the batch ends; recorded operations go through a batch path of the
  session (`recordStep`, `recordStack`, …) that checks the stop and records on the batch debugger
  without entering the serial. Nothing else changes the session while the batch is open.
- **Recording** is as §4.1: a per-call recorder (a fresh `AbapDebugger` over a per-call recorder of
  the batch connection, so each request carries its number), `{ content: [] }` once recorded.
  Debugger tools take no turn in the main flow today (`worksOnOwnConnection`); numbering is in
  record order.
- **`DebugBatchEnd`**: `execute()` on the debuggee connection (the debugger's credentials are those
  of the debuggee's connection; it cannot be swapped — the attached session lives there). In
  `finally`: mode `off`, the serial released. Then the session applies, in number order and with
  the readers it uses today (`readDebuggeeEnd`, `readAttach`, `readStack`), what the answers say
  about the stop — a move answering the debuggee's end releases the stop (`releaseStop`) **after**
  `execute()` settled, never under its envelopes; the last move's attach and the last stack read
  update the view. No request is sent for this. Answers, summary and refusals as §5.3–5.4.
- **AMDP**: `AmdpSession` is not offered in the debugger batch until a test against a system
  confirms it (§9.3). Until then `DebugBatchBegin` on an AMDP stop and the AMDP tools in debugger
  batch mode are refused with `debug_batch_amdp_unmeasured` ("AMDP debugging is not offered in a
  debugger batch: not yet confirmed against a system").

## 8. The main flow, refusals, close and disconnect

- **Sequential calls.** Recording calls and `BatchEnd` take their turn in the main flow like any call
  on the instance's connection; `BatchBegin` and `BatchAnswers` touch no connection and take none
  (`connectionless`). A recorded call leaves the flow as soon as its request is recorded. Only LOCK
  and UNLOCK go stateful, in their own envelopes, as adt-clients sends them.
- **One batch at a time.** `BatchBegin` while either batch is open, and `DebugBatchBegin` while
  either is open, are refused `batch_mode_other` / `batch_mode_on`.
- **Refusals** are the server's own (`ServerRefusal`, answered `{ error: <code>, message }` like the
  existing ones, no `kind`, nothing read from a server): `batch_mode_unavailable`, `batch_mode_on`,
  `batch_mode_other`, `batch_mode_off`, `batch_not_recordable` ("<tool> sends more than one request
  and cannot be recorded in batch mode; record its steps with the single-request tools —
  compact: HandlerLock, HandlerUpdate with lock_handle, HandlerUnlock, HandlerGet — each phase its
  own batch"), `debug_batch_amdp_unmeasured`. Words are proposals (open question 9). SAP's answers
  and errors reach the model as they came: a failed part is SAP's part; a method's error elsewhere
  is the C6 shape (the method's error as it is plus `step`); a credential refusal is the chain's
  answer.
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
  `BatchAnswers` and the same `state_handle`.
- **`dispose()`** (the pool's undo, the idle bound): drops an open batch (nothing sent) and the
  answers; the part then holds nothing.

## 9. Testing

Every rule below gets a test, and each test is proved load-bearing: break the rule in the code,
watch the test go red, revert (the *Break* line).

### 9.1 Unit (no SAP; fake connections and the ADT stand-in used by `lowToCompact.test.ts`)

- **Owner lifecycle** — begin/end, numbers from 1 in record order, one batch at a time across kinds,
  replace on the next batch, `no answer with that number` for an unknown number and before any
  batch, `number` vs `numbers`. *Break:* start the counter at 0; allow a second begin.
- **Recording returns nothing without awaiting** — an eligible tool in batch mode answers
  `{ content: [] }` while the fake's `execute` has not run; the instance's real connection receives
  no `makeAdtRequest` during recording. *Break:* await the part in the dispatch.
- **Queue order is call order** — two handlers with an artificial pre-record delay; the envelope
  holds them in call order. *Break:* return before the record.
- **Ineligible refused** — a high tool and `HandlerUpdate` DOMAIN with `lock_handle` are refused
  `batch_not_recordable`, the handler is not called, nothing is recorded or sent.
  *Break:* default eligibility to true.
- **Eligibility proof per entry** — for every entry of `tools/batch-handlers.json`, the handler runs
  with the entry's arguments against a counting connection and issues exactly one
  `makeAdtRequest`; a source test fails when an entry has no case, names a tool its set does not
  serve, or a served tool has an entry with no test. *Break:* add a second request to one listed
  handler.
- **Credentials at execution** — a source whose credential object changes between recording and
  `BatchEnd`: the envelopes go on the connection `BatchEnd` took, none on the retired one, and the
  retired one is not logged off under `BatchEnd`. *Break:* wrap the recording call's connection.
- **`BatchEnd` always ends, nothing re-sent** — `execute` rejecting: mode off, a second `BatchEnd`
  refused `batch_mode_off`, the fake saw each envelope once. *Break:* reset the mode only on success.
- **Answers as they came** — 2xx with body, bodyless `200` (`body: ""`), a `404` part beside 2xx
  parts, an envelope failure (its parts and the not-sent ones), a negotiation follow-up (two parts
  under one number); the summary's `failed`. *Break:* run the member's strategy over the part.
- **Credential refusal** — a refusal-shaped object (own `refusal.kind`, `refusal.reason`, `at`,
  no `response`) thrown by the target: `BatchEnd` answers it as `answerRead` does, every number's
  answer is it, mode off; the answered variant (`cause.response.status === 401`). *Break:* wrap
  the refusal in the summary path.
- **Long read recorded** — a listed single-request long read in batch mode: `openFreshConnection`
  and `runLongCall` not called, the read is in the envelope. *Break:* keep the long-read branch first.
- **Surface** — every set serves the three batch tools, `DebugBatch*` only in full and compact, every
  tool's description carries its sentence; `compact/tests/fixtures/surface.json` updated.
- **Close / dispose** — `closeInstance` with a batch open: zero envelopes, no unhandled rejection
  (plain-node recorder), the debugger's stop not blocked by a held serial. *Break:* omit `dropBatch`.
- **Debugger batch** — begin needs a stop; the serial is held (a breakpoint change waits); step +
  stack + variables recorded into one debugger envelope on the stop's connection; a step answering
  the debuggee's end releases the stop only after `execute`; AMDP refused; begin of either batch
  refused while the other is open; breakpoint/listener tools refused. *Break:* record inside `mutate` — the
  second call is then never recorded, and the test asserts both records once the second call returned.

### 9.2 Integration (no SAP)

- **HTTP pool** (`http/src/__tests__`): `BatchBegin` answers the `state_handle`; the instance is kept;
  a later call with it is recorded on that instance; a call without it lands on a fresh instance
  where `BatchAnswers` answers "no answer with that number"; a dropped `BatchEnd` request keeps its
  answers. *Break:* `holdsState()` false while a batch is open.
- **stdio / SSE**: the batch is the instance's; an SSE close drops it with nothing sent.

### 9.3 Live (each test states where it runs and skips elsewhere with the reason)

Gated by `tests/test-config.yaml`, as the existing integration suites, with a test case per check
(disabled by default):

- **Communication batch, on-premise** and **ABAP Cloud** — through the served tools (hard mode):
  N reads; then compact `HandlerLock` × N, `HandlerUpdate` with `lock_handle` × N, `HandlerUnlock` × N,
  each phase its own batch; answers per number; cleanup deletes the objects.
- **Debugger batch, on-premise** and **ABAP Cloud** — at a live stop: step + stack + variables in one
  `DebugBatchEnd`; the session's view matches.
- **AMDP debugger batch** — on a system that runs AMDP debugging (on-premise on HANA); the gate for
  offering it: until it has passed there, §7's AMDP refusal stays. Its result goes to the docs with
  the date.

No unit test talks to SAP; no live test runs in CI.

## 10. Docs, changelog, dependency

- **Dependency:** `@mcp-abap-adt/adt-clients` `^32.0.0` → `^33.0.0`, after 33.0.0 is on the registry;
  the lockfile checked for anything not from the registry.
- **README.md** — a "Batch mode" section: what it is for, the phases (lock / write / unlock, each a
  batch), the tools, `state_handle` over HTTP.
- **docs/user-guide/** — `AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md`,
  `AVAILABLE_TOOLS_HIGH.md` (the batch tools, the per-tool sentence), `HANDLERS_MANAGEMENT.md`
  (which sets serve them), `DEBUGGER.md` (the debugger batch, what it covers, AMDP not offered yet),
  `CLIENT_CONFIGURATION.md` (HTTP: `state_handle` on every call of a batch), a new `BATCH_MODE.md`
  (the full behaviour, the eligibility list rendered from `tools/batch-handlers.json`).
- **docs/architecture/** — `STATEFUL_SESSION_GUIDE.md` (LOCK/UNLOCK stateful envelopes on the
  instance's connection), `ARCHITECTURE.md`.
- **src/embeddable/docs/ARCHITECTURE.md** — the `batch` option, the owner, the pool keeping a
  batch-holding instance, the close.
- **http/README.md**, **compact/README.md**, **compact/docs/AVAILABLE_TOOLS.md**.
- **docs/MIGRATION-19.0.md** — embedders: the new `batch` constructor option (absent → batch tools
  answer `batch_mode_unavailable`); the new tools in every set.
- **CHANGELOG.md** — the 19.0.0 entry (this PR's release) gains under *Added* the batch mode and the
  debugger batch, and under *Changed* adt-clients `^33.0.0` with what it changes for the server
  (a credential refusal rethrown by every member). No earlier version's entry is touched.
- Tool descriptions: §3.

## Open questions for the owner

1. **The answers tool's name.** The goal does not name it. *Recommendation:* `BatchAnswers`, served
   under that name in all four sets.
2. **The idle bound and batch state.** Batch state must hold instance state so the HTTP pool keeps
   the instance; held state ends after `stateIdleMinutes` (default 30) without a call — on stdio too,
   where it would drop kept answers or an open batch on a clock, against the goal's "no timeout".
   *Recommendation:* hold state while a batch is open or answers are kept and let the existing idle
   bound (your one exception) apply, the same on every transport; the alternative is to hold state
   only on HTTP.
3. **`state_handle` on ordinary tools over HTTP.** The pool routes by `arguments.state_handle`, but no
   ordinary tool's schema has it, so the model may not send it, and the batch call lands on a fresh
   instance. *Recommendation:* add the optional `state_handle` property to every tool's schema on the
   HTTP binaries and say it in `BatchBegin`'s answer and description; the instance still checks
   nothing.
4. **Tools that never touch the batch's connection, while a batch is open** — debugger tools during a
   communication batch, ordinary tools during a debugger batch, the leftover-session and
   background-run tools. *Recommendation:* refuse every tool but the batch tools and the open batch's
   eligible ones ("debugging is exclusive"; one simple rule).
5. **Numbers for calls that record nothing.** A call refused `batch_not_recordable`, and an eligible
   call whose handler refuses its arguments before sending. *Recommendation:* the refused call takes
   no number and answers its refusal at once; the handler's own pre-send refusal takes its number,
   returns nothing like every recorded call, and its answer is that refusal.
6. **When a new batch replaces the answers** — at `BatchBegin`, or when its `BatchEnd` executes.
   *Recommendation:* at the next `BatchEnd`, so the previous phase's answers (the lock handles a
   write needs) stay readable while the next phase is recorded.
7. **A number's answer: SAP's part, not the handler's result.** The goal says the answer is SAP's
   part as it came; the task text says the handler's result is captured. *Recommendation:* SAP's
   part(s), as in §5.3; the handler runs to its end and its result is not kept; a call with a
   follow-up part (a `406`/`415` retry) answers all its parts in order.
8. **No single-request create exists.** The goal's example records 100 creates and says compact's
   low-level create is batchable; every create in every set is the high workflow
   (`HandlerCreate` → `handleCreate*`: validate, create, lock, write, unlock, check, activate), and
   DOMAIN/DATA_ELEMENT/PACKAGE writes under a lock read before they write. *Recommendation:* decide
   whether to add a create-only mode (and a whole-document write under lock for those three types) in
   this PR; until decided, batch mode covers reads, lock, unlock and the source writes under lock.
9. **Words.** The descriptions (§3), the per-tool sentence (the goal's three facts on every tool vs a
   "refused" sentence on ineligible tools), and the refusal codes and words (§8). *Recommendation:*
   as proposed here.
10. **`timeout` of a long read in batch mode** — there is no connection of its own to cut.
    *Recommendation:* refuse a `timeout` in batch mode before anything is recorded, in fixed words.
11. **`BatchEnd` on a credential refusal** — the refusal alone, or the refusal and the summary.
    *Recommendation:* the refusal alone, as any call answers it; every number's answer says what
    happened to it.
12. **Debugger moves without their stack read.** In batch mode `step`, `step to line` and
    `stack position` send their own request only; the stack comes only if recorded. *Recommendation:*
    confirm (it follows from the operation list and one request per call).
13. **RFC connections.** `communication/batch` over RFC is unmeasured in adt-clients.
    *Recommendation:* refuse `BatchBegin` on an RFC connection until a live test measures it, as AMDP.
