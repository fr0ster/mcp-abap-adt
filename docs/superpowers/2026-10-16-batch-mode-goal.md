# Batch mode — goal

## What it is for

An LLM working through mcp-abap-adt often needs many independent ADT requests:
reading a list of objects, or creating, locking, writing and unlocking many of
them. Each request is a round trip. ADT accepts many requests in one multipart
envelope (`/sap/bc/adt/communication/batch`, `/sap/bc/adt/debugger/batch`), and
`@mcp-abap-adt/adt-clients` records and sends them (`AdtBatchConnection`).
Batch mode lets the LLM use that through the tools it already has.

## The behaviour

- **`BatchBegin`** switches the MCP instance into batch mode: from then on the
  instance's handlers work on a batch connection (`AdtBatchConnection`, endpoint
  `communication`) wrapping the instance's own connection, instead of the
  connection itself.
- **Every tool can be called in batch mode.** A tool called in batch mode
  records its requests and returns nothing. Its answer exists only after
  `BatchEnd`.
- **`BatchEnd`** executes the recorded batch, returns the answers of every tool
  called since `BatchBegin`, and switches the instance back to its plain
  connection.
- **The instance is the scope.** On stdio and SSE the MCP session has one
  instance, and batch mode is that instance's. On HTTP the instance is the one
  taken from the pool by `state_handle`, exactly as for any other call;
  `state_handle` exists for that reuse and has nothing to do with batching.
  Batch mode introduces no handle of its own.
- **The tool descriptions say it.** `BatchBegin`, `BatchEnd` and every tool's
  description tell the LLM that in batch mode a call returns nothing and all
  answers come from `BatchEnd`.
- **The debugger has its own batch mode**, on its own stateful connection and
  `/sap/bc/adt/debugger/batch`, separate from the communication batch.

## What stays true

- One MCP session, one connector, one main flow; tool calls on it are
  sequential. Only LOCK and UNLOCK go stateful.
- The batch gives no transaction: what succeeded stays, and `BatchEnd`'s answers
  say per call what happened.
- SAP's answers reach the LLM as they came; a credential refusal stops the
  batch and reaches the LLM as it came (adt-clients 33).
- No timeout of the server's choosing.

## Depends on

- `@mcp-abap-adt/adt-clients` 33.0.0 (credential refusals pass through the
  batch and every internal catch); `AdtBatchConnection` from 32.1.0.
