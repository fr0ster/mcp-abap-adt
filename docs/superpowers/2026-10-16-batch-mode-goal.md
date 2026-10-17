# Batch mode — goal

## What it is for

An LLM working through mcp-abap-adt often needs many independent ADT requests of
one kind: reading a list of objects, or creating, locking, writing and
unlocking many of them. Each request is a round trip. ADT accepts many requests in one multipart
envelope (`/sap/bc/adt/communication/batch`, `/sap/bc/adt/debugger/batch`), and
`@mcp-abap-adt/adt-clients` records and sends them (`AdtBatchConnection`).
Batch mode lets the LLM run such requests in parallel through the tools it
already has. The LLM drives the phases: to create 100 domains it records 100
creates and executes them, then 100 locks (a stateful envelope), then 100
updates under those locks, then 100 unlocks, each phase its own batch, and
activates the group afterwards.

## The behaviour

- **`BatchBegin`** switches the MCP instance into batch mode: from then on the
  instance's handlers work on a batch connection (`AdtBatchConnection`, endpoint
  `communication`) wrapping the instance's own connection, instead of the
  connection itself.
- **A tool none of whose requests depends on another's answer can be called
  in batch mode** — one request, or several independent ones (a source and its
  metadata together). It records its requests, all under the call's one
  number, and returns nothing; its answer exists only after `BatchEnd`. A tool
  that sends no request is refused.
- **A tool whose handler chains its requests is refused in batch mode**
  (create → lock → write → unlock, validate → create → check, a read that
  follows one answer with another request): its later requests need the earlier
  answers, which do not exist until the batch runs. The refusal says so and
  points to the low-level tools of the compact set, through
  which the LLM drives each phase as its own batch.
- **`BatchEnd`** executes the recorded batch, switches the instance back to its
  plain connection, and answers a short summary: how many calls were recorded
  and which numbers failed. It ends batch mode whatever happened, and nothing
  recorded is ever sent again: a batch cannot be repeated.
- **Every recorded call gets its answer**, in every package. SAP answers every
  part of an envelope — a status and headers, a body when there is one (an
  empty line when there is none) — and that is the call's answer, as it came.
  A call whose part was never sent, because an earlier envelope of the same
  batch failed, gets that as its answer.
- **The credentials are the ones at execution.** The whole batch goes with the
  credentials in force when `BatchEnd` executes it, not those of the calls that
  recorded it.
- **Answers by number.** The calls made in batch mode are numbered in the order
  they were made, from 1. The instance keeps the answers of its last executed
  batch, and a tool returns the answers of the numbers asked for: one number or a
  list of them, as the caller chooses. A number exists until
  the next batch replaces the answers, or the instance ends; no timeout. A
  number the last batch does not have, or no batch yet, is one answer: no
  answer with that number.
- **The instance is the scope.** On stdio and SSE the MCP session has one
  instance, and batch mode is that instance's. On HTTP the instance is the one
  taken from the pool by `state_handle`, exactly as for any other call;
  `state_handle` exists for that reuse and has nothing to do with batching.
  Batch mode introduces no handle of its own.
- **The tool descriptions say it.** `BatchBegin`, `BatchEnd` and every tool's
  description tell the LLM that in batch mode a call returns nothing, that calls
  are numbered in the order made, and that the answers are read by number once
  `BatchEnd` has run.
- **Independence is the criterion, for long reads too.** A long read none of
  whose requests depends on another's answer is recorded like any other tool;
  one with a chain (a request built from an earlier answer, a fallback after a
  `404`, polling) is refused in batch mode, and the consumer runs it as a
  normal call.
- **The multi-request reads run on batches inside themselves.** A read tool
  whose handler sends several independent requests sends them in phases, each
  phase's independent requests in one envelope (a package tree level by level,
  then the objects' reads), and still answers in one call. Nothing in such an
  internal batch is corrected or sent again; a part's failure is that item's,
  and a credential refusal ends the call as it came. Where the batch works,
  only the batched version is kept; the sequential one runs only on a system
  without the communication batch. A dependent chain is a sequence of
  envelopes, so one call can serve several objects.
- **Compact: one ADT request per tool call.** This is compact's general
  principle; the consumer chains the calls and repeats them; the server does
  no polling, no internal retry and keeps no timer. An exception exists only
  by the owner's explicit word (today: `HandlerGet` part `urls`). Each compact
  tool does its one operation, with no mode parameter: `HandlerCreate` one
  `POST` (an argument of its schema that the type's create does not send is
  refused, by presence, naming it; a name no schema declares is stripped by
  the MCP SDK before any tool sees it, for every tool); `HandlerUpdate` only the `PUT` under `lock_handle` (for a domain, a data
  element or a package the caller passes the whole document in `source_code`);
  `HandlerDelete` only the deletion request (no lock, no check) — a class's
  local include, which ADT cannot delete, is removed by one `PUT` of empty
  content under the caller's `lock_handle`; `HandlerDeletionCheck` is the
  check. `HandlerGet` returns only what each `part` asks, one request per
  part; run states (activation run status and results, unit test results)
  are `HandlerGet` parts read once — the consumer polls. `HandlerActivate`
  starts an activation run and answers its id. The profiler's schedule and
  run are separate tools. `HandlerDumpList` reads one page and answers SAP's
  next link. Compact keeps its tools few and each easy to explain (what it
  does, its parameters, its results); "one tool per action" uses a coarse
  action — a batch operation is one action, getting information is one
  action. The debugger is four tools (breakpoints, session, step,
  maintain variables), each covering ABAP and AMDP, each call one request,
  chained by the consumer; no background listener.
  `HandlerWhereUsed` reads one object; several are the consumer's, through
  batch mode. The full chains stay in the full sets.
  This changes compact's behaviour for its consumers.
- **Full-set reads: one tool per type, one request per call.** `Get<Type>`
  takes `part: source | metadata` (default `source`) and returns only what
  was asked; the same tool in the full set and in `-ro`. The `Read<Type>`
  tools fold into `Get<Type>` and go. Metadata-only types keep `Get<Type>`
  without `part`; a function module takes its group as an argument so its
  source is one request.
- **Every package has batch mode.** The full, read-only and compact sets all
  serve `BatchBegin`, `BatchEnd` and the answer tool; what a set can do in batch
  mode is whatever of its tools send no request depending on another's answer
  — reads everywhere, and in
  compact the create, lock, update, unlock and delete as well. Every batch
  end sends one envelope: a batch is homogeneous by session kind — the first
  recorded call decides it (LOCK, UNLOCK or stateless) — and a call of
  another kind is refused; the next phase is its own batch. LOCK and UNLOCK
  go in stateful envelopes, everything else stateless, as adt-clients' batch
  connection sends them (measured there).
- **The debugger has its own batch mode**, through its own pair of tools,
  `DebugBatchBegin` and `DebugBatchEnd`, on `/sap/bc/adt/debugger/batch`. It
  covers the session attached to the debuggee — the operations at a stop:
  step, step to line, stack, variables, child variables, stack position,
  setting a variable — and its answers are read by number as the communication
  batch's are. Breakpoints, the listener and attaching run on other connections
  and are not part of it. AMDP debugging is meant to be covered the same way,
  and is confirmed by a test against a system before it is offered.
- **One batch at a time.** The communication batch is for running requests in
  parallel; debugging is exclusive. While either batch mode is on, beginning
  the other is refused.

## What stays true

- One MCP session, one connector, one main flow; tool calls on it are
  sequential. Only LOCK and UNLOCK go stateful.
- The batch gives no transaction: what succeeded stays, and each numbered answer
  says what happened to that call.
- SAP's answers reach the LLM as they came; a credential refusal stops the
  batch and reaches the LLM as it came (adt-clients 33).
- No timeout of the server's choosing.

## Depends on

- `@mcp-abap-adt/adt-clients` 33.0.0 (credential refusals pass through the
  batch and every internal catch); `AdtBatchConnection` from 32.1.0.
