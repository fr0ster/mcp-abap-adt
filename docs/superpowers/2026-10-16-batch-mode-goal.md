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
- **A tool that sends one request can be called in batch mode.** It records
  that request and returns nothing; its answer exists only after `BatchEnd`.
- **A tool whose handler calls several endpoints is refused in batch mode**
  (create → lock → write → unlock, validate → create → check, a read that
  follows one answer with another request): its later requests need the earlier
  answers, which do not exist until the batch runs. The refusal says so and
  points to the single-request (low-level) tools of the compact set, through
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
- **A long read is one call**, and in batch mode it is recorded like any other
  single-request tool instead of running on a connection of its own.
- **Every package has batch mode.** The full, read-only and compact sets all
  serve `BatchBegin`, `BatchEnd` and the answer tool; what a set can do in batch
  mode is whatever of its tools send one request — reads everywhere, and in
  compact the low-level create, lock, update and unlock as well. LOCK and UNLOCK
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
