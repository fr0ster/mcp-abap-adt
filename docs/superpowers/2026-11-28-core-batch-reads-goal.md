# Goal: batch reads by envelope handle in the core and -ro binaries (#392)

## Goal

In the core binaries (`mcp-abap-adt`, `-http`, `-sse`) and their `-ro` binaries, the model can
gather independent reads into one batch, so that many reads cost one round trip instead of one
each. The model forms the batch itself, with the read tools it already knows, their own arguments
and descriptions. It creates an envelope and calls read tools with that envelope's handle. Each
call is recorded, not sent. Then it executes the envelope, which sends every recorded read and
answers each one by its number, in recording order.

Two words are kept apart:

- the **envelope** is the model's collection, created by a tool and named by its handle;
- an **ADT envelope** is one `multipart/mixed` request sent to SAP.

Executing an envelope sends one ADT envelope. With the consumer's parts bound it sends several,
one after another.

## Invariants

Each invariant is observable and proved by a test.

### The envelope and its handle

1. **Four tools.** The tools create an envelope, execute it, discard it, and list the open
   envelopes. Creating sends nothing and answers the envelope's handle. Discarding sends nothing.
2. **An explicit handle names the envelope.** The handle is opaque and cryptographically random,
   at least 128 bits. It is separate from `state_handle`. Every tool that works on the envelope
   takes the handle as an argument. The contract is the same on every transport, stdio included.
3. **An owner in the process holds the envelope, not a module global.** The host creates the
   owner and hands it to the server instance, as it does the compact batch's owner. The envelope
   lives in the instance's long session. Over Streamable HTTP the model also sends `state_handle`,
   which routes the call to that instance.
4. **Possession of a handle is not authorization.** Every call naming a handle checks the pair
   (handle, caller). An envelope handle is valid only in the long session where it was created.
   That means the same instance, destination and connection, and over Streamable HTTP the same
   `state_handle`. The caller is that session with its SAP credentials. The SAP username is never
   resolved, and creating an envelope sends nothing. An unknown handle and another session's
   handle get the same answer: not available. The `state_handle` no-owner exception does not
   cover envelope handles.
5. **No clock of its own.** An envelope has no TTL. It ends by execution, a discard, the host,
   the backend, or the process's shutdown. It also ends with the instance that holds it:
   - over Streamable HTTP, with the long session;
   - over SSE, with the connection;
   - on both, under the held state's idle bound.

   stdio has no idle bound.
6. **The limit per owner comes from the consumer.** The consumer's configuration may bound how
   many envelopes an owner holds open. The server sets no value of its own. Reaching the bound
   refuses the new envelope and evicts nothing.
7. **Execution is claimed once, atomically.** Execution ends the envelope: from the claim on, its
   handle is not available. Nothing more is recorded into it, a second execution or a discard
   gets "not available", and no recorded request is ever sent twice.
8. **Several envelopes are independent.** Several may be open at once, each under its own handle,
   with its own record and its own numbering. An envelope may be open beside a compact batch or a
   debugger batch.

### Recording

9. **Only a read called with a handle is recorded.**
   - A read called without a handle behaves exactly as it does today.
   - Creating an envelope switches nothing into recording mode, unlike compact batch mode.
   - A call with a handle that is not available is refused. It never falls back to sending now.
10. **Recording sends nothing of the read itself.** Access restrictions are enforced when the call
    is recorded, before it takes a number, and a handle never bypasses them. A package-tree read
    that the access check makes goes out at once on the instance's connection, as it does in
    compact batch mode. It is not recorded.
11. **Only an admitted read is recorded.**
    - Admission is set-aware. The core reads get entries of their own in
      `tools/batch-handlers.json`, under their own tool names and argument combinations. The
      compact entries stay as they are.
    - Each admitted core read is proved eligible by its own case in `oneRequestPerEntry.test.ts`,
      not inferred from its compact equivalent.
    - A read may put several requests under its one number when none needs another's answer, as
      compact allows.
    - Any other tool, or a read whose arguments no core entry admits, is refused. It sends nothing
      and takes no number.
12. **The model forms the batch.** No list schema covers every read. A read tool keeps its own
    arguments and description. The only addition is the `envelope_handle` argument and one
    sentence about it in the description.
13. **A read given `background: true` is refused** when it is recorded, as in compact batch mode.
14. **One node structure per envelope.** A second request to the node structure in the same
    envelope is refused before it is recorded, whichever tool sends it. Several node structures in
    one ADT envelope cross-talk, as measured.

### Execution and answers

15. **The reads go stateless,** as in compact batch mode, with the credentials in force at
    execution. Nothing is sent twice and nothing is retried. No `406`/`415` correction is resent,
    as `HandlerBatch` `end` resends none.
16. **A number's answer is its handler's projection of the SAP answer its requests got,** with no
    further request: the answer the tool gives outside an envelope for that same SAP answer.
17. **The answers come back together.**
    - A recorded call answers its number.
    - Execute answers every number at once, in recording order, each under its number and as
      compact JSON. Each number has its own success or error.
    - An empty envelope's execution answers an empty list.
    - `batch.keepRawParts` applies as in compact.
18. **Failures stay where they happened.**
    - One part's failure (a `404`, say) answers that number only.
    - An ADT envelope's failure answers every number it carried with what came back, as it came.
      That covers SAP's refusal of the envelope, a transport error, a credential refusal, a part
      count that does not match, and an answer that cannot be split.
    - With several ADT envelopes the compact phases' rules apply. A failed one ends the run, so no
      later one is sent. The earlier envelopes' answers are kept, and each read not sent answers
      that failure.
19. **Bounds come only from the consumer or from SAP.** The server sets no bound of its own on
    the size of an envelope. The consumer's parts bound (`--batch-parts-per-envelope`,
    `MCP_BATCH_PARTS_PER_ENVELOPE`, YAML `batch.partsPerEnvelope`, an embedder's
    `partsPerEnvelope`) applies as it does to every phase. It packs consecutive ADT envelopes of
    at most that many parts, in recording order, and keeps each call's parts together.

### What stays as it is

20. **Reuse, not a second implementation.** Recording, sending and splitting reuse the compact
    batch's recorder, its eligibility code and the phases' envelope planning.
21. **Nothing else changes.** Ordinary core reads, compact `HandlerBatch` and the debugger batch
    keep their contracts, and regression tests prove it.

## Out of scope

- **Transport reads.**
- **Reads that send many requests inside one call** (`GetObjectsList`, `GetPackageContents`,
  `GetObjectInfo`, `SearchSource`). They batch their own requests.
- **Anything but reads.** Create, lock, write, unlock, delete, activate, check and run calls are
  not recorded into an envelope. Compact batch mode stays their route.
- **A bound of the server's own** on parts, reads or open envelopes.
- **Retries** of a part or of an ADT envelope.
- **The compact sets.** Compact `HandlerBatch` and the debugger batch keep their contracts.
