# Batch mode — design

Implements `docs/superpowers/2026-10-16-batch-mode-goal.md` (the goal). The goal is binding; this
document says how, against the code as it is on `feat/auth-chain-6`, with the owner's answers to the
questions earlier drafts raised folded in.

Sources read: `src/embeddable/BaseMcpServer.ts`, `src/handlers/interfaces.ts`, `src/lib/clients.ts`,
`src/lib/longCall.ts`, `src/lib/longTools.ts`, `tools/long-handlers.json`,
`src/lib/packageSessions.ts`, `src/lib/toolSet.ts`, `src/lib/compact/**`, `compact-modify/src/**`,
`compact-readonly-entries/src/**`, `src/handlers/common/low/**`, `src/lib/debugger/**`,
`src/lib/state/InstanceState.ts`, `src/lib/instanceClose.ts`, `src/lib/answer.ts`,
`src/lib/auth/serverRefusal.ts`, `http/src/InstancePool.ts`, `http/src/StreamableHttpServer.ts`, and
adt-clients 33.0.0 and 34.0.0 (`src/batch/AdtBatchConnection.ts`, `src/batch/wire.ts`,
`src/utils/adtResponse.ts`, `src/core/domain/AdtDomain.ts`, `docs/usage/BATCH.md`, `CHANGELOG.md`)
(33.0.0 in its `credential-refusals` worktree; 34.0.0 at tag `v34.0.0`, with
`docs/usage/MIGRATION-34.md`; 34.1.0 at tag `v34.1.0`). Claims about adt-clients are tagged **[code]** (read in its
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
  up to 100 **[code]** — in 34.0.0 accept negotiation records none (§4.7); an empty
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

The server depends on `@mcp-abap-adt/adt-clients ^34.1.0` (34.0.0 keeps 33.0.0's credential
refusals and exempts a batch from accept negotiation; 34.1.0 exports `exemptFromAcceptNegotiation`,
§4.7). The bump lands only after 34.1.0 is on the registry (owner's rule: no local
link). `adt-strategies ^0.12.0` stays; its compatibility with 34.1.0 is checked by the build at the
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
  pool. On HTTP the call reaches the pooled instance by `state_handle`, and the batch is that
  instance's; the instance has one destination, so there is no other case. No batch tool takes a
  `state_handle` parameter.
  - **The header.** The handle travels as the optional request header `x-mcp-state-handle`.
    `StreamableHttpServer`'s request
    handler, where it reads the request's other headers (`headerContext(req.headers)`), reads
    `x-mcp-state-handle` first, then — when the header is absent — the `tools/call` argument as
    today (`handleOf(req.body)`; the debugger tools keep their `state_handle` argument in this PR),
    and gives the value to `pool.serve({ handle }, …)`, which routes it exactly as it routes a
    handle today (`byHandle`: the instance whose `stateHandle` is that value, else a new instance).
  - **`BatchBegin` holds state** and answers the instance's `state_handle`, as a debugger start does,
    so the client's later calls of the batch, carrying it in the header, reach the same pooled
    instance. It is the instance's handle (`InstanceState`), not a batch handle: batch mode
    introduces no handle of its own.
  - A call without the handle (or with one the pool does not know) reaches a new instance, where no
    batch is open — as for any held state today.
  - On stdio and SSE nothing changes: the header is not read there.

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

**In the compact sets batch mode is one tool, not three** (owner's decision): `HandlerBatch`, whose
`action` (`'begin' | 'end' | 'answers'`, required) begins, ends or answers, with `number` / `numbers`
for `answers` (refused with another action); and, in `compact` (the compact set that serves the
debugger), `HandlerDebugBatch` with the same three actions for the debugger batch. *The exact names
(`HandlerBatch`, `HandlerDebugBatch`, `action`) are this design's proposal.* Each action behaves as
the full set's tool of the same meaning (`begin` = `BatchBegin` / `DebugBatchBegin`, `end` =
`BatchEnd` / `DebugBatchEnd`, `answers` = `BatchAnswers`); both `answers` actions read the same kept
answers. Below, "the batch tools" means these in the compact sets.

`BatchAnswers` serves the answers of either kind of batch — the instance keeps one set, of its last
executed batch, communication or debugger.

### Which sets serve them

- `BatchBegin`, `BatchEnd`, `BatchAnswers`: a new group `BatchHandlersGroup`
  (`src/lib/handlers/groups/BatchHandlersGroup.ts`) in `fullToolSet` and `fullReadOnlyToolSet`, on
  every transport.
- `DebugBatchBegin`, `DebugBatchEnd`: a group `DebugBatchHandlersGroup` in `fullToolSet` only — the
  full set that serves the debugger. No `-ro` set serves them.
- `HandlerBatch`: a compact group (`src/lib/compact/batch/group.ts`, a real `BaseHandlerGroup` as the
  other compact groups) in `compactToolSetOf` and `compactReadOnlyToolSetOf`.
- `HandlerDebugBatch`: in `compactToolSetOf` only, beside `CompactDebugHandlersGroup`.
- `BatchBegin` and `BatchAnswers` are `connectionless`; `BatchEnd` takes the instance's connection
  (§5.1). `HandlerBatch` is connectionless for `begin` and `answers` and takes the instance's
  connection for `end`: the dispatch reads its `action` before taking a connection, as it reads a
  long tool's arguments today (`isLongRead`), so `begin` and `answers` never build or connect one.
  `DebugBatchBegin`, `DebugBatchEnd` and `HandlerDebugBatch` work on the debugger's connection and
  are listed in `DEBUGGER_OWN_CONNECTION_TOOLS`.

### Wording

- `BatchBegin`: "Switches this server into batch mode: from now on each call of a tool none of whose
  requests depends on another's answer is recorded instead of sent, and returns nothing. Every
  recorded call is numbered, in the order made, from 1. A tool that builds a request from an
  earlier answer is refused in batch mode; use the low-level tools (compact: HandlerCreate with create_only, HandlerLock, HandlerUpdate with
  lock_handle, HandlerUnlock, HandlerGet) and run each phase as its own batch. BatchEnd sends the
  recorded calls; read their answers by number with BatchAnswers. Over HTTP, send the state_handle
  this answers in the request header on every call of the batch."
- `BatchEnd`: "Sends every call recorded since BatchBegin, in parallel envelopes, with the
  credentials in force now, and leaves batch mode whatever happens; nothing is sent twice. Answers
  how many calls were recorded and which numbers failed; read each answer with BatchAnswers."
- `BatchAnswers`: "The answers of the last batch, by number: each is the answer the tool gives for
  that call, built when BatchEnd sent it — SAP's answer or why it was not sent. A number the last
  batch does not have answers: no answer with that number."
- `HandlerBatch` / `HandlerDebugBatch`: the same sentences, one per action, naming the actions
  (`action: 'begin'` … `'end'` … `'answers'`) where the full set names a tool.
- `DebugBatchBegin` / `DebugBatchEnd`: the same sentences, scoped to "the stopped debuggee: step,
  step to line, stack, variables, child variables, stack position, setting a variable".
- **Every other tool** gets one sentence appended at registration (`BaseMcpServer.registerHandlers`,
  one place, so no handler file changes): an eligible tool — "In batch mode (BatchBegin) a call is
  recorded and returns nothing; calls are numbered in the order made, and their answers are read
  by number with BatchAnswers once BatchEnd has run."; in the compact sets the sentence names
  `HandlerBatch` instead of BatchBegin / BatchAnswers; a tool eligible only for some arguments adds
  which (from its eligibility entry, §4.2); an ineligible tool — "In batch mode (BatchBegin) this
  tool is refused: a request of it depends on another's answer." Tools of a registry that registers its own
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
   has **no number**. A long read is judged as every tool: by whether any of its requests depends on another's answer
   (§4.4). A tool that sends no request is refused.
3. Eligible → recorded (below).

Recording an eligible call:

- The handler gets `{ ...context, connection: recorder }` — a **per-call recorder**, an
  `IAbapConnection` over the open `AdtBatchConnection` that forwards every call; at the call's
  first `makeAdtRequest` it takes the batch's next number for the call and **keeps that number for
  every further request of the call** — a call may put several independent parts into the envelope
  (a source and its metadata, `both()` in `src/lib/strategies/sequence.ts`), all under its one
  number; it keeps each part's raw answer when `batch.keepRawParts` is on (§5.3). Nothing else of
  the context changes. `eligible()` is called on the arguments as the SDK parsed them, the same
  object the handler receives.
- The handler is started inside the same scopes as today (`inHeldFlow`, `withDestinationSystemContext`,
  `withKnownSystemContext`), but its request-signal scope is the **batch's** signal, not the call's
  (§4.3).
- The call **waits until its handler has sent everything it sends before an answer** — every
  request it records before awaiting an answer — **or settled**, whichever is first; no SAP answer
  is awaited, because none exists before `BatchEnd`. Waiting for all of them, not only the first,
  keeps the queue in call order: the next call's parts cannot interleave with this one's (so phases
  stay in one run and envelopes do not alternate).
- **Recorded** → the call returns `{ content: [] }` — "returns nothing" on the MCP wire:
  `CallToolResult.content` may be empty (SDK 1.32 `CallToolResultSchema`: "it may be empty"), no
  `isError`, no text, no number. The handler's promise gets a rejection handler at once, so it never
  rejects unhandled. The handler continues; when `execute()` settles its parts, its continuation
  runs its own result and error strategies on them — then, at `BatchEnd`, since before it there is
  nothing to run them on — and the one tool answer it builds from all its parts is that number's
  answer (§5.3).
- **Settled without recording** (the handler refused its arguments before sending) → nothing went
  into an envelope: the call has **no number**, and it answers the handler's own answer at once, as
  outside batch mode.

**Numbering.** Every call that put a request into an envelope has its own number, from 1, in the
order made — one number per call, covering all its parts — and only those: a refused call, or a handler that refused before sending, takes none.
In batch mode there are no retries (§4.7): a part answered `406` or `415` is that call's answer,
as any other failure, and the model reads it and decides.

### 4.2 Eligibility: declared, reviewed, proven

A file `tools/batch-handlers.json`, in the style of `tools/long-handlers.json`, lists every tool that
may be recorded, with:

- `tool`, `set` (`full` | `compact`; a `-ro` set serves an entry when its set's read half does),
  `handler` (path#function), `sends` (the request or the independent requests it sends, in words —
  the same field as `tools/long-handlers.json`' `sends`; it may name several);
- `when` (optional): the arguments under which no request of the call depends on another's
  answer — an equality, a
  membership or a presence on named arguments (as `longTools.ts`' `NOT_A_READ` reads
  `object_type`), e.g. `HandlerUpdate` only with `lock_handle`, and for DOMAIN, DATA_ELEMENT and
  PACKAGE only with `document` (§4.6); `HandlerCreate` only with `create_only: true`; `HandlerGet`
  only for the parts whose reads are independent (not `contents`, not `UNIT_TEST`/`CDS_UNIT_TEST`);
- `connection` (optional): `http` when the entry holds only over HTTP — `HandlerLock` /
  `HandlerUnlock` of `PACKAGE`: over RFC the package lock opens an ABAP session of its own
  (`connectionForPackageLock`), outside the batch, so over RFC that entry is not eligible.

`src/lib/batch/eligibility.ts` reads the file once and answers `eligible(tool, args, connection)`.
Nothing outside the file decides eligibility; a tool not listed is refused. The proof of an entry:
run with its arguments, the requests the handler holds **pending** (before any answer) and the
requests it sends when **answered** (an answer document, and a `404`) are identical and at least
one — nothing it sends depends on an answer. A tool that sends no request is not listed. The table
holds 170 entries (single-request write tools, such as `HandlerLock`, included).

What the code settles about the first entries (each still proven by its test):

- **Eligible:** `HandlerCreate` with `create_only` (§4.6). `HandlerLock` and `HandlerUnlock` (all
  types; `PACKAGE` over HTTP only) — one `lock()`/`unlock()` each (`handleLockObject` /
  `handleUnlockObject`). `HandlerUpdate` with `lock_handle` for the source-written types (CLASS,
  PROGRAM, INTERFACE, DDL, TABLE, STRUCTURE, FUNCTION_MODULE, BEHAVIOR_DEFINITION,
  METADATA_EXTENSION — each proven), and for DOMAIN, DATA_ELEMENT, PACKAGE with `document`
  (§4.6). The reads of the full and compact sets whose requests are independent — one GET, or a
  source and its metadata together (the twelve `Read<Type>` tools and `GetObjectVersionDiff`, via
  `both()`) — long reads included (§4.4), and `HandlerGet` per part.
- **Not eligible:** `HandlerUpdate` with `lock_handle` and `properties` for DOMAIN, DATA_ELEMENT,
  PACKAGE — it reads the metadata, then writes it patched (`handleUpdateDomain`'s `sequence(read,
  update)`): two requests, the second needing the first's answer. `HandlerCreate` without
  `create_only` and every high tool (validate → create → lock → write → unlock → check → activate,
  `handleCreateDomain`), `404` fallbacks, polling. The long reads with a chain (§4.4, §11). Debugger tools, background runs, the leftover-session
  tools.

### 4.3 The recorded handler's signal and lifetime

`trackCall` aborts a call's signal when the call settles; a recorded handler outlives its call, so
it runs under the batch's own `AbortController` instead — aborted only when the batch is dropped
(instance close, `dispose()`), never at `BatchEnd`. Recorded handlers are not tracked in the
instance's `inFlight` (the HTTP pool awaits `idle()` before returning an instance; a recorded
handler waits for `BatchEnd`, so counting it would hold every request open) and are not active
tools (`registerActiveTool`): the shutdown's `logOffAtOnce` interrupts `BatchEnd`, which is.

### 4.4 Long reads

A long read is judged as every tool: **no request depends on another's answer**. A listed long read
(`isLongTool(tool) && isLongRead(tool, args)`) whose requests are independent — `SearchObject`, `GetSqlQuery`, `GetTableContents`,
`GetATCFindings`, `RuntimeGetProfilerTraceData`, `RuntimeAnalyzeProfilerTrace` (one GET, then a
local summary), `HandlerSearch`, `HandlerGetData`, `HandlerProfileView`, `HandlerGet` per part
(its independent-read modes, by arguments) — is in `tools/batch-handlers.json` and is recorded
like any eligible tool: in batch mode it is not given a connection of its own (`runLongCall` /
`openFreshConnection` are not called) and its requests go on the batch connection. A long read with a
chain is refused in batch mode (`batch_not_recordable`); those tools run on internal batches of
their own outside batch mode (§11).

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

Compact is its own library with its own
servers: both are added in the compact library — its modify half (`compact-modify`) — as parameters
of its existing `HandlerCreate` and `HandlerUpdate`, `create_only: boolean` and `document: string`.
They are served by the `compact` binaries (not `compact-ro`) and are eligible in batch mode. They work outside batch mode too, as one request each.

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

### 4.7 No retries in batch mode

The batch is the model's: nothing recorded is corrected and sent again, and a part answered `401`,
`406` or `415` is that call's answer, as any other failure — the model reads it and decides.

**adt-clients 34.0.0 guarantees it** (`docs/usage/MIGRATION-34.md`, `BATCH.md` at `v34.0.0`
**[doc]**; `AdtBatchConnection.ts` and `acceptNegotiation.ts` at `v34.0.0` **[code]**): an
`AdtBatchConnection` marks itself exempt from accept negotiation at construction; an `AdtClient`
built over it never wraps it, whatever `enableAcceptCorrection` it is given; a member that
negotiates by itself sends through it once; and the envelope goes out through the wrapped
connection's base request, so a `406`/`415` answered to the envelope reaches `execute()` and its
parts as it came and is not sent again. The connection's own handling of the envelope request —
credential renewal, CSRF recovery, session — stays as it is (§5.1). The server adds no switch of its
own; outside a batch, accept negotiation works as before.

The exemption belongs to the connection object a member is handed. The per-call recorder (§4.1) is
an object of its own, so the server marks it with adt-clients' exported
`exemptFromAcceptNegotiation(recorder)` (package index, `src/index.ts:30` at `v34.1.0` **[code]**)
when it creates it — a stated contract of adt-clients, nothing read through. The tests of §9.1 ("No
retry in batch mode") prove it, the mark's absence included.

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

   **`BatchEnd` ends batch mode whatever fails, before `execute()` included.** When its call fails
   before `execute()` — taking the connection, or the system lookup the dispatch runs before the
   tool (`systemBeforeTool`) — as it would fail for any call, the dispatch ends batch mode (step 4)
   and every recorded call's answer is that failure, as it came (as the call itself answers it).
   Nothing is sent. No other mechanism is added for this.
3. `execute()` — awaited to its end; no timeout. Every part settles inside it, follow-up envelopes
   included (§1). Then every recorded handler is awaited until it has built its answer (no timeout;
   a handler only reads its settled part then).
4. In `finally`, whatever `execute()` did: mode → `off`, the queue and recorder dropped (nothing can
   be sent again — the `AdtBatchConnection` instance is discarded), the target cleared, the use
   released. **`BatchEnd` always ends batch mode**; there is no retry and no repeat.
5. Build each number's answer (§5.3), replace the kept answers, answer.

### 5.3 What came: the answers and `BatchEnd`'s answer

**A number's answer is the tool's answer, as its handler builds it** with its own result and error
strategies from all its parts when they settle at `BatchEnd` — the same answer the tool gives outside batch mode
for the same SAP answer: its projection of a success, the C6 shape of a failure (the method's error
as it is plus `step`), the chain's answer for a credential refusal. Whatever SAP returned is what the
strategies read; nothing else is put in its place. By how the part settled:

- **SAP answered the part** (2xx, or another status carrying `response`): the handler's answer for
  that response, as for a direct request with the same answer.
- **Its envelope failed** (the envelope's error): the handler's answer for that error — SAP's outer
  response, when SAP answered the envelope, reaches the strategies as the response.
- **Not sent** (adt-clients' "not sent" wrapper): the handler's answer for that error, its message
  saying the request was not sent because an earlier envelope failed — the goal's "a call whose part
  was never sent … gets that as its answer".
- **A credential refusal**: §5.4.

**Raw parts, by configuration.** With `batch.keepRawParts` on (default **off**) — a server
configuration value the launcher reads and hands to each `InstanceBatch` it creates — each answer
also carries, beside the tool's answer, SAP's raw parts of the call's requests as they came — one
per part, in the order sent, all under the call's number: each `{ status, status_text, headers,
body }` — the inner status, its text, the inner headers as
adt-clients parsed them (names lower-cased **[code]**), the body as text, `""` when the part had
none (goal: "an empty line when there is none"); a request not sent has none. Off, no raw part is
kept.

`BatchEnd` answers `{ recorded: <count>, failed: [<numbers>] }` — a number fails when its tool answer
is an error — and, when `execute()` rejected, beside it what came for that failure (SAP's outer
response or the error, as it came; a credential refusal per §5.4). An empty batch answers
`{ recorded: 0, failed: [] }` (adt-clients sends nothing **[code]**) and replaces the kept answers
with none.

### 5.4 A credential refusal

A credential refusal reaches the caller **as it came**: the connection's refusal, answered as the
server answers it for any call (`readFailure` → `answerRead`: the chain's own payload and words, no
secret, never rebuilt from a message).

- **Unanswered** (the provider refused before SAP was asked): every part rejects with the same
  refusal object **[code]**, `execute()` rejects with it. `BatchEnd` ends batch mode (§5.2.4); its
  call answers that refusal (the owner's rule "a credential refusal ends the call"), and every
  handler, meeting the same refusal (adt-clients 33 and later rethrow it as the same object), answers it as
  it came under its number.
- **Answered** (SAP's `401` the provider could not renew): the active envelope's parts carry the
  refusal, later ones "not sent" **[code]**; `BatchEnd` answers the refusal as it came; each number's answer
  is its handler's answer for what it met, per §5.3.

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
  (`requireStop`) — the instance is the one the call reached (on HTTP, by `state_handle`, §2); the
  communication batch off (else `batch_mode_other`); no debugger batch already open. The tool takes
  no `state_handle` argument.
- **The session's serial.** Every session change runs through `DebugSession.mutate` → `Serial`. A
  recorded operation must not await its answer inside the serial — the second recorded call would
  wait behind the first, which waits for `DebugBatchEnd`: a deadlock. So a recorded operation does
  not enter the serial: it goes through a batch path of the session (`recordStep`, `recordStack`, …)
  that checks there is a stop and records on the batch debugger. Nothing more is done with the
  serial; while the batch is open no other tool is served (§4.1).
- **Recording** is as §4.1: a per-call recorder (a fresh `AbapDebugger` over a per-call recorder of
  the batch connection, so each request takes its number), `{ content: [] }` once recorded.
  Debugger tools take no turn in the main flow today (`worksOnOwnConnection`); numbers follow the
  record order.
- **`DebugBatchEnd`** executes the envelope on the debuggee connection (it goes with that
  connection's credential; the attached session lives there), keeps the answers by number and
  switches the mode off — whatever fails. It does **not** reconcile the debug session's state from
  the answers and calls no `releaseStop`: the debugger batch is several debugger commands in one
  envelope without the overhead (step, then check the variables). If a step ended the program, its
  answer shows it, and the next ordinary debugger call learns it from SAP as today. Answers and
  `DebugBatchEnd`'s answer as §5.3–5.4.
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
  `batch_mode_other`, `batch_mode_off`, `batch_not_recordable` ("<tool> builds a request from another's
  answer and cannot be recorded in batch mode; record its steps with the low-level tools —
  compact: HandlerCreate with create_only, HandlerLock, HandlerUpdate with lock_handle,
  HandlerUnlock, HandlerGet — each phase its own batch"), `batch_no_timeout`; for a tool refused only
  because a batch is open: "<tool> is not served while a batch is open"),
  `debug_batch_amdp_unmeasured`. SAP's answers and errors reach the model as they came: a number's
  answer is the tool's answer built from what came (§5.3), a method's error the C6 shape (the
  method's error as it is plus `step`), a credential refusal the chain's answer.
- **Instance close with a batch open** (stdio's client close, an SSE close, the pool's eviction,
  process shutdown): nothing recorded is sent. `closeInstance` gets a `dropBatch?()` step beside
  `cutBackgroundRuns` (the close lets go of state without `dispose()`), which aborts the batch's
  signal and discards the `AdtBatchConnection` and the answers. adt-clients' part promises never
  settle (it has no discard **[code]**), but the recorder races every part it hands a handler against
  the batch's signal, so each waiting handler settles with `RequestAbortedError` at the drop and
  leaves no unhandled rejection; a `BatchEnd` already executing re-installs no answers after it.
  A `BatchEnd` running at the close is
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
  arguments before sending take no number and answer at once; the next recorded call takes the
  next number. *Break:* number at call entry.
- **No retry in batch mode** — a recorded read and a recorded write whose parts answer `406` (with a
  supported `Accept` in the answer) and `415`: each is that call's answer, built by its handler as
  any failure; the fake saw each request once and no follow-up envelope; the instance's plain
  connection still corrects outside the batch; also an envelope answered `406` is not sent again.
  The mark is load-bearing: the same recorder created **without** `exemptFromAcceptNegotiation` is
  negotiated — its `406` part is corrected and recorded again, a follow-up envelope is sent — and
  the test asserts that too. *Break:* drop the `exemptFromAcceptNegotiation(recorder)` call.
- **Only batch tools and eligible tools while a batch is open** — a high tool, `HandlerUpdate`
  DOMAIN with `properties`, a debugger tool during a communication batch, a leftover-session tool:
  refused, handler not called, nothing recorded or sent. *Break:* default eligibility to true.
- **Eligibility proof per entry** — for every entry of `tools/batch-handlers.json`, the handler runs
  with the entry's arguments: the requests held pending and the requests sent when answered (a
  document, a `404`) are identical and at least one; a source test fails when an entry has no case,
  names a tool its set does not serve, or a served tool has an entry with no test. *Break:* make a
  listed handler send a second request built from the first's answer; list a tool that sends none.
- **One number per call** — a call sending two independent parts (a `Read<Type>`) takes one number;
  both parts are in the envelope; its answer is the handler's one answer built from both; the next
  call takes the next number; the next call's parts follow both of this call's. *Break:* number per
  request; return after the first request.
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
- **Answers built at `BatchEnd`** — a lock part answers the tool's lock answer (its lock handle,
  through `analyseLock`); a read's part its projection; a `404` part beside 2xx parts the tool's
  failure in the C6 shape; an envelope SAP answered `500` (the parts' answers and `BatchEnd`'s); an
  envelope with no answer; the not-sent ones; the summary's `failed`; the strategies are not run
  before `execute()`. *Break:* answer the raw part instead of the handler's answer.
- **`batch.keepRawParts`** — off (default): no raw part in any answer; on: each answer carries its
  call's raw parts as they came, one per part, in the order sent (status, text, headers, body, `""`
  for a bodyless `200`).
  *Break:* default it on.
- **Credential refusal** — a refusal-shaped object (own `refusal.kind`, `refusal.reason`, `at`,
  no `response`) thrown by the target: `BatchEnd` answers it as `answerRead` does, every number's
  answer is it, mode off; the answered variant (`cause.response.status === 401`). *Break:* wrap
  the refusal in a "not sent" or summary-only answer.
- **Long reads by independence** — a long read with independent requests in batch mode
  (`SearchObject`, `HandlerGet` part `source`) is recorded: `openFreshConnection` and `runLongCall`
  not called, its requests in the envelope; one with a chain (`SearchSource`, `HandlerGet` part
  `contents`) is refused, nothing recorded; with `timeout` an eligible one is refused
  `batch_no_timeout`. The source test of `tools/batch-handlers.json` checks each entry by its proof,
  not by long-list membership. *Break:* keep the long-read branch first.
- **`BatchEnd` failing before `execute()`** — a source whose `resolve` fails at `BatchEnd`: the call
  answers that failure, batch mode is off, every recorded call's answer is that failure as it came,
  nothing is sent. *Break:* end batch mode only around `execute()`.
- **Surface** — the full and read-only sets serve the three batch tools and the compact sets
  `HandlerBatch` alone; `DebugBatch*` only in full, `HandlerDebugBatch` only in `compact`; each
  `HandlerBatch` action behaves as its full-set tool, `begin`/`answers` build no connection, `number`
  with another action refused; no
  batch tool has a `state_handle` property, every tool's description carries its sentence;
  `compact/tests/fixtures/surface.json` updated (the new `create_only` and `document`).
- **Close / dispose** — `closeInstance` with a batch open: zero envelopes, no unhandled rejection
  (plain-node recorder). *Break:* omit `dropBatch`.
- **Debugger batch** — begin needs a stop; step + stack + variables recorded into one debugger
  envelope on the stop's connection; `DebugBatchEnd` keeps the answers by number, switches the mode
  off and leaves the session's stop as it was (no `releaseStop`, no view change), also when a step's
  answer says the program ended; AMDP refused; begin of either batch
  refused while the other is open; breakpoint/listener tools refused. *Break:* record inside `mutate` — the
  second call is then never recorded, and the test asserts both records once the second call returned.

### 9.2 Integration (no SAP)

- **HTTP pool** (`http/src/__tests__`): `x-mcp-state-handle` is read and routes the request, ahead
  of the `tools/call` argument; a debugger tool's argument still routes; `BatchBegin` holds state and
  answers the handle; the instance is kept; a later call with the handle in the header is recorded
  on that instance; a call without it lands on a fresh instance where `BatchAnswers` answers "no
  answer with that number"; a dropped `BatchEnd` request keeps its answers. *Break:* `holdsState()`
  false while a batch is open; read only the argument.
- **stdio / SSE**: the batch is the instance's; an SSE close drops it with nothing sent.

### 9.3 Live (each test states where it runs and skips elsewhere with the reason)

Gated by `tests/test-config.yaml`, as the existing integration suites, with a test case per check
(disabled by default):

- Over the compact binaries the same checks run through `HandlerBatch` / `HandlerDebugBatch`.
- **Communication batch, on-premise over HTTP**, **on-premise over RFC** and **ABAP Cloud** — through
  the served tools (hard mode): N reads; then compact `HandlerCreate` `create_only` × N,
  `HandlerLock` × N, `HandlerUpdate` with `lock_handle` (sources; `document` for DOMAIN) × N,
  `HandlerUnlock` × N, each phase its own batch; answers per number; cleanup deletes the objects. The
  RFC case measures the batch over RFC; a failure there is reported with what came, since it may be
  the RFC transport's rather than the batch's.
- **Debugger batch, on-premise** and **ABAP Cloud** — at a live stop: step + stack + variables in one
  `DebugBatchEnd`; the answers by number.
- **AMDP debugger batch** — on a system that runs AMDP debugging (on-premise on HANA); the gate for
  offering it: until it has passed there, §7's AMDP refusal stays. Its result goes to the docs with
  the date.

No unit test talks to SAP; no live test runs in CI.

## 10. Docs, changelog, dependency

- **Dependency:** `@mcp-abap-adt/adt-clients` `^32.0.0` → `^34.1.0`, after 34.1.0 is on the registry;
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
- **docs/user-guide/CLI_OPTIONS.md** and the configuration template — `batch.keepRawParts`.
- **src/embeddable/docs/ARCHITECTURE.md** — the `batch` option, the owner,
  the pool keeping a batch-holding instance, the close.
- **http/README.md** (the header), **compact/README.md**, **compact/docs/AVAILABLE_TOOLS.md** (`HandlerBatch`,
  `HandlerDebugBatch`, `create_only`, `document`).
- **docs/MIGRATION-19.0.md** — embedders: the new `batch` constructor option (absent → batch tools
  answer `batch_mode_unavailable`); the new tools in every set; the compact create and write modes.
- **CHANGELOG.md** — the 19.0.0 entry (this PR's release) gains under *Added* the batch mode, the
  debugger batch and the two compact modes, and under *Changed* adt-clients `^34.1.0` with what it
  changes for the server (a credential refusal rethrown by every member; a batch corrects and
  resends nothing). No earlier version's
  entry is touched.
- Tool descriptions: §3. The long reads of §11 keep their descriptions; `docs/user-guide/` notes they
  read in envelopes.
- **CHANGELOG** also names §11 under *Changed* (the multi-request long reads send their independent
  requests in envelopes).

## 11. Multi-request long reads on internal batches

Every read that sends more than one request — the multi-request long reads of
`tools/long-handlers.json`, and `GetEnhancements`' include traversal — is reimplemented on batches,
**wherever batching is possible**: its handler runs its own work through an `AdtBatchConnection`
(`endpoint: 'communication'`) **in phases**. One tool call for the model, as today; its answer is the
same as the sequential version's.

**The rule for every phase: all requests in one envelope are independent of each other.** A request
that needs another's answer goes in a later phase. Each level is read once, in one envelope, and
then the answers are assembled. A sequence of envelopes lets one call get the information for
**several** objects at once (§11's schema changes).

**Only the batched version stays.** The sequential version remains only for systems where the
communication batch does not exist (below); there it is the same code path the handler has today.
Parallelism knobs the batched version makes meaningless are removed: `SearchSource`'s `concurrency`
(the only such parameter in the handlers today).

### Whether the system has the communication batch

The server learns it from the system, never from the system type, the release or the connection
kind:

- **Discovery does not settle it.** The server reads no ADT discovery today (only a `discovery`
  result strategy exists, `src/lib/strategies/resultSets.ts:140`). The discovery documents in the
  repository list `/sap/bc/adt/debugger/batch` (`docs/adt-discovery.xml:5865`,
  `docs/discovery.json:31174`) but not `/sap/bc/adt/communication/batch`, although adt-clients
  measured the communication batch working on-premise and on ABAP Cloud **[doc]** — so its absence
  from discovery means nothing.
- **RFC offers nothing else to read**: an ADT request over RFC is the same request; the same rule
  applies.
- **The system's own answer to the batch endpoint** (owner-approved). Only the **outer** envelope
  response decides: a `404` to the envelope request of the first internal batch on a destination
  means the endpoint is not served, and the destination is remembered as having no communication
  batch — kept with the destination's known parameters, as `systeminformation`'s answer is
  (`destinationSystems`, once per destination) — and that call and later ones run sequentially. How
  the server sees that outer status, given adt-clients v34.1.0's `execute()` awaits the wrapped
  connection's base request before it calls `parseBatchResponse` **[code]**:
  - **Ordinary transports (HTTP, RFC)** reject an outer `404` with `response` attached, so the
    parser never runs: the server reads the rejected error's `response.status` of the envelope
    request (`execute()` rejects with that error **[code]**).
  - **A connection that resolves a `404`** (an injected connection, say) makes `parseBatchResponse`
    throw a plain "missing multipart boundary" `Error` with no status **[code]**: the server reads
    the status from a forwarding connection placed under the `AdtBatchConnection`, which sees the
    outer response before it is parsed and keeps its status.
  - **An inner part's `404`** (an object not found) is that item's answer and never disables
    batching; neither does any other envelope failure, which is that phase's failure (§11, Failures).

  What a system without the endpoint answers is **[unverified]**; a live test on such a system
  confirms it before the rule is relied on.

### The shared mechanism

- `src/lib/batch/phases.ts`: `runPhase(connection, items, read)` — records `read(item, batch)` for
  every item on one `AdtBatchConnection` over the call's connection, `execute()`s it once, and answers
  each item's settlement in item order. Clients and inner handlers of a phase are built over the
  batch connection (`createAdtClient(batch)`; an inner handler gets `{ ...context, connection: batch
  }`); the batch connection is exempt from accept negotiation by adt-clients 34 (§4.7), so nothing
  is corrected or resent — **no retries**.
- **Where it runs.** On the long call's own connection, as today (`runLongCall`: a fresh stateless
  connection); its `timeout` cuts the read by logging that connection off, under an envelope in
  flight if one is. Reads are stateless, so a phase is one envelope.
- **The 100-envelope bound.** Each phase is its own `execute()`, and a read phase sends one envelope
  with no follow-ups (negotiation records none in 34 **[doc]**), so adt-clients' bound of 100
  envelopes per `execute()` **[code]** is never reached. **No cap of ours on parts per envelope**
  (owner's decision): each level is read once, in one envelope; payload limits are unmeasured
  **[doc]**, and the live test measures the largest phases.
- **Failures.** A part's non-2xx is that item's failure, read by the item's own strategies, as the
  per-item failure today (`FailedObject`, the C6 entry with its `step`). An envelope that fails
  (no parts) is every item of that phase's failure, the envelope's error as it came, with its step.
  A credential refusal ends the call: `execute()` rejects with the refusal **[code]**, the handler
  rethrows it, and the call answers it as it came.
- **Existing limits.** Each tool's limits bound what is put in a phase and how many phases run:
  `max_objects` caps the units before their phase is recorded; `max_depth` / `maxDepth` and the
  include depth (20) are the number of level phases; `time_budget_ms` (the caller's own deadline in
  `SearchSource`) is checked between phases — an envelope in flight is never cut by it — and a
  passed deadline answers what was gathered with `truncated.by_timeout`, as today.
- **Over RFC** the internal batch runs as over HTTP; the live test measures it, and a failure there
  may be the RFC transport's.
- **Never in LLM batch mode.** These tools chain their phases (a later phase is built from an
  earlier one's answers), so they are refused while the instance is in batch mode (§4.1): an
  internal batch never runs inside the model's batch.

### Per tool

| Tool (and its compact twin) | Phases — what goes in one envelope |
|---|---|
| `GetPackageContents`, `HandlerGet` part `contents` (`walkPackage`) | per level up to `max_depth`: (a) the root `nodestructure` of every package of the level; (b) every type-node `nodestructure` of those packages; the next level is the subpackages found |
| `GetPackageTree` | (1) the package metadata GET and the root `nodestructure`; then the `walkPackage` levels as above |
| `GetObjectsList` | per level: the `nodestructure` of every node of the level (recursing into every child node) |
| `GetObjectInfo` | per tier up to `maxDepth`: the `nodestructure` of every node of the tier; with `enrich`, a last phase: one quickSearch per node |
| `SearchSource` | (1) the quickSearch per package mask; (2) the package walk's levels (as `walkPackage`); (3) the source GETs of the units, up to `max_objects`; `time_budget_ms` checked between phases |
| `GetStructuresList` | per level of the include tree: (a) the source GET of every node as a structure; (b) as a table, for the nodes the first did not find; with `include_extensions`, (c) the where-used pair (structure, table) of every node, (d) the source GET of every candidate |
| `GetIncludesList` | function group: (1) the `nodestructure`; then per depth (up to 20): the source GET of every include of the level; class: its one metadata GET (no batch) |
| `ListTransports` | (1) the search configurations GET; (2) the transport-request GET of every saved configuration (up to 5) |
| `DescribeByList` | (1) the quickSearch of every object; (2) again without its type, for the objects whose first answer was empty |
| `GetAbapSystemSymbols` | the reads of every symbol found, through the inner handlers (`handleGetClass`, `handleGetFunctionModule`, `handleGetInterface`, generic): each phase holds every symbol's request of that step that is independent of the others, by the rule; a request needing an earlier answer goes in the next phase. If the call fails, the consumer gets the error and remakes the call — nothing is retried |
| `GetWhereUsed` (with a type filter), `HandlerWhereUsed` | (1) the where-used scope of **every** object asked; (2) every scoped where-used request — two envelopes for any number of objects |
| `RuntimeListFeeds`, `HandlerDumpList` | (1) the feed (or variants) GET of every feed asked; then per round, the next page of every feed still paging, in one envelope (a page needs its own feed's previous next link) |
| `GetEnhancements` | (1) the type probes of the object (class → program → include, each only when the earlier answered none — dependent, one per phase); (2) the object's enhancements and its root `nodestructure`; (3) the includes `nodestructure`; (4) with `include_nested`, the enhancements of every include, up to `max_includes`, in one envelope |

Each row is to be confirmed against its handler when it is reimplemented; a dependency the table
does not show splits a phase, never joins two.

### Schema changes: several objects per call

(Owner-approved.) By the owner's principle, a tool that today takes one root
object takes several, so one call reads them all in the same envelopes: an optional list beside the
existing single argument (exactly one of them given; the single one keeps today's answer shape, the
list answers one entry per object, in the order asked):

- `GetWhereUsed`: `objects: [{ object_type, object_name }]` beside `object_type` / `object_name`;
  `HandlerWhereUsed` the same.
- `RuntimeListFeeds`: `feed_types: string[]` beside `feed_type`; `HandlerDumpList` the same.
- `GetPackageContents`: `package_names: string[]`; `HandlerGet` part `contents` the same.
- `GetPackageTree`: `package_names: string[]`.
- `GetObjectsList`: `objects: [{ parent_type, parent_name }]`.
- `GetObjectInfo`: `objects: [{ object_type, object_name }]`.
- `GetIncludesList`: `objects: [{ object_type, object_name }]`.
- `GetStructuresList`: `structure_names: string[]`.
- `GetEnhancements`: `objects: [{ object_type, object_name }]`.
- `SearchSource`, `DescribeByList`, `GetAbapSystemSymbols`, `ListTransports` already take several
  (packages, a list, the code, the configurations) and change only by losing `concurrency`
  (`SearchSource`).

### Tests

Per tool, against the ADT stand-in's fixtures: the batched handler gives the same answer as the
sequential version; no envelope holds a request that needs another of its parts' answers; with
several objects asked, the envelope count does not grow with their number; the request count and the envelope count are as the table says; a part's
failure is that item's failure and the rest answer; an envelope failure; a credential refusal ends
the call as it came; on the real adt-clients v34.1.0 `AdtBatchConnection`: an outer `404` the
transport rejects (with `response`) and an outer `404` a connection resolves without a multipart
body each mark the destination and run sequentially; an inner part's `404` leaves batching on; any
other envelope failure is not a verdict; no
`concurrency` in `SearchSource`'s schema. *Break:* send a phase's requests one by one (the envelope
count goes red); treat every envelope failure as "no batch".

Live (gated by `tests/test-config.yaml`, each test stating where it runs): every tool before and
after, on-premise (HTTP and RFC) and ABAP Cloud — answers equal, time measured, results to the docs
with the date.

## Open questions for the owner

None.
