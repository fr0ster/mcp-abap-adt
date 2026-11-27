# Goal: batch reads by envelope handle in the core and -ro binaries (#392)

## Goal

In the core binaries (`mcp-abap-adt`, `-http`, `-sse`) and their `-ro` binaries, the model can
gather independent reads into one ADT batch envelope, so that many reads cost one round trip
instead of one each. The model forms the envelope itself, with the read tools it already knows,
their own arguments and descriptions: it creates an envelope, calls read tools with that
envelope's handle — each call recorded, not sent — and executes the envelope, which sends every
recorded read and answers each one, by its number, in recording order.

## Invariants

1. **Two tools.** One creates an envelope; one executes it. Creating sends nothing and answers
   the envelope's handle.
2. **The envelope is named by an explicit handle.** The handle is opaque and cryptographically
   random, at least 128 bits. Every tool that works on the envelope takes the handle as an
   argument. The contract is the same on every transport, stdio included.
3. **The envelope is held by an owner in the process, not by a module global.** The host creates
   the owner and hands it to the server instance, as it does the compact batch's owner
   (`InstanceBatch`). The envelope lives only in that instance; nothing of it is written to disk
   or shared with another instance.
4. **Possession of a handle is not authorization.** Every call naming a handle checks the pair
   (handle, caller). An unknown handle and another caller's handle get the same answer: not
   available.
5. **No timeouts.** Nothing ends an envelope on the server's clock. It ends by an explicit tool,
   the host, the backend, or the process's shutdown.
6. **A read called with a handle is recorded, not sent.** It is numbered in recording order from
   1. Only a call that an entry of `tools/batch-handlers.json` admits is recorded — one request
   per entry, as `oneRequestPerEntry.test.ts` proves. Any other tool, or a read whose arguments no
   entry admits, is refused: it sends nothing and takes no number.
7. **The model forms the batch.** There is no list schema covering every read. A read tool keeps
   its own arguments and description; the handle is the only addition to it.
8. **Execute sends the envelope once.** The reads go stateless, as in compact batch mode, with
   the credentials in force at execution. Nothing is sent twice and nothing is retried.
9. **Every answer comes back as compact JSON, by number.** A number's answer is the answer its
   tool gives outside an envelope for the same SAP answer.
10. **Failures stay where they happened.** One part's failure (a `404`, say) answers that number
    only. An envelope's failure answers every number it carried with what came back, as it came.
11. **Bounds come only from the consumer or from SAP.** The server sets no bound of its own on
    the size of an envelope. The consumer's parts bound (`--batch-parts-per-envelope`,
    `MCP_BATCH_PARTS_PER_ENVELOPE`, YAML `batch.partsPerEnvelope`, an embedder's
    `partsPerEnvelope`) applies as it applies to every phase: consecutive envelopes of at most that
    many parts.
12. **Reuse, not a second implementation.** Recording, eligibility, sending and splitting use the
    compact batch's recorder, `eligibility.ts`, `tools/batch-handlers.json` and the envelope
    planning (`packByParts`, `checkedEnvelopes`). Compact `HandlerBatch` keeps its contract.

## Out of scope

- **Transport reads.** They are recorded only after a live measurement shows how they behave in
  an envelope, which is unmeasured today.
- **Metadata read through the node structure.** Several node structures in one envelope
  cross-talk, as measured.
- **Anything but reads.** Create, lock, write, unlock, delete, activate, check and run calls are
  not recorded into an envelope; compact batch mode stays their route.
- **A bound of the server's own** on parts or reads per envelope.
- **Retries** of a part or of an envelope.
- **Changes to compact `HandlerBatch`** and to the debugger batch.
