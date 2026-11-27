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

Each invariant is observable and proved by a test. An item marked **open** depends on a question
below. The spec settles it once the owner has answered.

### The envelope and its handle

1. **An explicit handle names the envelope.** Creating an envelope sends nothing and answers its
   handle: opaque and cryptographically random, at least 128 bits. Every tool that works on the
   envelope takes the handle as an argument. The contract is the same on every transport, stdio
   included.
2. **An owner in the process holds the envelope, not a module global.** The host creates the
   owner and hands it to the server instance, as it does the compact batch's owner. **Open (Q3):**
   how a later call reaches that owner over Streamable HTTP, where every request is an MCP session
   of its own. Also open: whether the envelope handle is distinct from `state_handle`.
3. **Possession of a handle is not authorization.** Every call naming a handle checks the pair
   (handle, caller). An unknown handle and another caller's handle get the same answer: not
   available. **Open (Q2):** who the caller is.
4. **No timeouts.** Nothing ends an envelope on the server's clock, directly or through the
   host's expiry of held state. An envelope ends by an explicit tool, the host, the backend, or
   the process's shutdown. **Open (Q4):** whether an open envelope sits under the held state's
   idle bound (`stateIdleMinutes` over Streamable HTTP and SSE), which is a TTL. Compact
   `HandlerBatch` keeps its idle-bound behaviour either way.
5. **The lifecycle is explicit.** The MCP rules want three things:
   - a way to end an envelope without executing it;
   - a list tool, so that the model can find its open envelopes again;
   - a limit per owner, so that forgotten envelopes do not pile up. Reaching the limit refuses
     the new envelope and evicts nothing.

   The owner's design names two tools and no server limits. **Open (Q1):** the tools beyond
   create and execute, and whether a per-owner limit applies, where it comes from, and its value.
6. **Execution is claimed once, atomically.**
   - Once an execution has claimed an envelope, nothing more is recorded into it.
   - Executing again, or two executions at once, never sends a recorded request a second time.
   - An end without execution that overlaps an execution has one outcome, stated in the spec.

   **Open (Q8):** whether a claimed envelope's handle stays valid afterwards to read its answers.
7. **Several envelopes are independent.** Each has its own record and its own numbering.
   **Open (Q9):** whether several may be open in one instance at once, and beside a compact or
   debugger batch.

### Recording

8. **Only a read called with a handle is recorded.**
   - A read called without a handle behaves exactly as it does today.
   - Creating an envelope switches nothing into recording mode, unlike compact batch mode.
   - A call with a handle that is not available is refused. It never falls back to sending now.
9. **Recording sends nothing of the read itself.** Access restrictions are enforced when the call
   is recorded, before it takes a number, and a handle never bypasses them. A package-tree read
   that the access check makes goes out at once on the instance's connection, as it does in
   compact batch mode. It is not recorded.
10. **Only an admitted read is recorded.** Admission is set-aware. The core reads get entries of
    their own in `tools/batch-handlers.json`, under their own tool names and argument
    combinations. The compact entries stay as they are.
    - Each admitted core read is proved eligible by its own case in `oneRequestPerEntry.test.ts`,
      not inferred from its compact equivalent. That test proves today that an entry's requests
      need no answer of another's, all of one session kind.
    - Any other tool, or a read whose arguments no core entry admits, is refused. It sends nothing
      and takes no number.
    - **Open (Q6):** which core reads get entries.
    - **Open (Q5):** whether a read that sends several independent requests under one number (as
      the draft read does in compact) is admitted, or only one request per call.
11. **The model forms the batch.** No list schema covers every read. A read tool keeps its own
    arguments and description; the handle is the only addition to it. **Open (Q10):** the
    parameter's name, and whether the description says anything about it.
12. **A read given `background: true` is refused** when it is recorded, as in compact batch mode.

### Execution and answers

13. **The reads go stateless,** as in compact batch mode, with the credentials in force at
    execution. Nothing is sent twice and nothing is retried. No `406`/`415` correction is resent,
    as `HandlerBatch` `end` resends none.
14. **A number's answer is its handler's projection of the SAP answer its requests got,** with no
    further request: the answer the tool gives outside an envelope for that same SAP answer.
    Answers are compact JSON, by number, in recording order, and each number has its own success
    or error. **Open (Q7):** what a recorded call answers, the execute answer's shape, what an
    empty envelope's execution answers, and whether `batch.keepRawParts` applies.
15. **Failures stay where they happened.**
    - One part's failure (a `404`, say) answers that number only.
    - An ADT envelope's failure answers every number it carried with what came back, as it came.
      That covers SAP's refusal of the envelope, a transport error, a credential refusal, a part
      count that does not match, and an answer that cannot be split.
    - **Open (Q11):** what happens with several ADT envelopes when one fails. Are the earlier
      envelopes' answers kept? Is a later envelope still sent? What does each number left unsent
      answer? The compact phases end the phase and answer the unsent reads with that same failure
      (`phases.ts`).
16. **Bounds come only from the consumer or from SAP.** The server sets no bound of its own on
    the size of an envelope. The consumer's parts bound (`--batch-parts-per-envelope`,
    `MCP_BATCH_PARTS_PER_ENVELOPE`, YAML `batch.partsPerEnvelope`, an embedder's
    `partsPerEnvelope`) applies as it does to every phase. It packs consecutive ADT envelopes of
    at most that many parts (`packByParts`, `checkedEnvelopes`), in recording order, and keeps
    each call's parts together.

### What stays as it is

17. **Reuse, not a second implementation.** Recording, sending and splitting reuse the compact
    batch's recorder, eligibility and envelope planning.
18. **Nothing else changes.** Ordinary core reads, compact `HandlerBatch` and the debugger batch
    keep their contracts, and regression tests prove it.

## Out of scope

- **Transport reads.** They are recorded only after a live measurement shows how they behave in
  an ADT envelope, which is unmeasured today. **Open (Q12):** whether this task measures them.
- **Node structures.** No call whose requests include `POST /sap/bc/adt/repository/nodestructure`
  is admitted, whichever tool sends it: several node structures in one ADT envelope cross-talk, as
  measured. **Open (Q13):** whether that one request is refused even when it is the only one.
- **Anything but reads.** Create, lock, write, unlock, delete, activate, check and run calls are
  not recorded into an envelope. Compact batch mode stays their route.
- **A bound of the server's own** on parts or reads per envelope.
- **Retries** of a part or of an ADT envelope.
- **Changes to compact `HandlerBatch`** and to the debugger batch.

## Open questions for the owner

1. **Lifecycle tools and limit.** Which tools come beyond create and execute: an end without
   execution, a list? Does a per-owner limit on open envelopes apply? If so, does it come from
   the consumer or is it fixed, and what is its value?
2. **The caller.** Who is the caller in the (handle, caller) check: destination plus SAP user,
   or the host's principal? CLAUDE.md says `state_handle` has no owner. Does that exception cover
   envelope handles too?
3. **Streamable HTTP routing.** Does the envelope handle route a call to its instance, or does
   the model also send `state_handle`? Is the envelope handle distinct from `state_handle`?
4. **The idle bound.** Does an open envelope sit under the held state's idle bound, or is it
   exempt from it?
5. **Several requests under one number.** The issue says one request per entry. The table admits
   the draft read, which sends several independent requests. Which applies here?
6. **Which core reads get entries.** The issue's measured gains are for reads that send many
   requests inside one call: `GetObjectsList`, `GetPackageContents`, `GetObjectInfo` and
   `SearchSource`. Are those in scope, and how?
7. **The answer shapes.** What does a recorded call answer: its number? Does execute answer every
   number at once, or by number afterwards? What does an empty envelope's execution answer? Does
   `batch.keepRawParts` apply?
8. **After execution.** Does an executed envelope's handle stay valid, to read its answers, or
   does execution end it?
9. **Concurrency.** Can several envelopes be open in one instance at once? Can one be open beside
   a compact batch or a debugger batch?
10. **The parameter.** What is the handle parameter called? The full set's descriptions carry no
    batch sentence today. Does an admitted read's description mention the handle?
11. **Several ADT envelopes.** When one of several ADT envelopes fails, do the compact phases'
    rules apply (end the phase, the unsent reads answering that failure)? Are the earlier answers
    kept?
12. **Transport reads.** Are they measured live in this task, or left out? Compact `HandlerGet`
    already admits `object_type: TRANSPORT` with `part: source`.
13. **A single node structure.** Is a node-structure read refused even when it is the only one in
    the envelope? Compact admits `HandlerGet` `part: node_structure` today.
