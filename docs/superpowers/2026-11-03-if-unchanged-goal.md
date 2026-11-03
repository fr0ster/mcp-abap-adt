# Goal: write only if the object is unchanged

## Goal

A model that read an object can write it back only if nobody changed it since that read. Today
a write replaces whatever the system holds. The lock prevents two writes at once, but not a
write over a change made between the model's read and its lock: by a person in ADT, another
session, or a background job. Then the model's write silently discards that change.

Two parts:

- **The read states the object's version.** A read of a source answers the ETag SAP gave with
  it.
- **The write may require it.** A write given that ETag sends it as `If-Match`. SAP then refuses
  the write when the object changed, and the refusal reaches the model as SAP gave it. A write
  without it behaves as today.

## What SAP answers (Measured, 2026-11-03, on premise and cloud)

- A source read (`GET …/source/main`) answers an `ETag` header, and so does a source write
  (`PUT …/source/main`). The ETag is a timestamp and a counter, for example
  `202611030852340001`. The inactive and the active version have their own.
- A `PUT` with a stale or arbitrary `If-Match` answers `412` `ExceptionPreconditionFailed`,
  "Client ETag … does not match the object ETag … in the server". Nothing is written.
- A `PUT` with the current ETag, or without `If-Match`, answers `200`.
- These were measured for a program on premise and a class on the cloud, and for the source
  only.
- **The limit.** The ETag has a resolution of one second. Two writes within one second gave the
  same ETag, though the text differed. A change made in the same second as the model's read is
  not detected.

## Invariants

- **Opt-in, explicit.** The model passes the ETag it read. Nothing is compared by default, and
  the server keeps no ETag between calls (no state behind a session).
- **SAP decides.** The server compares no text and no timestamp. It sends `If-Match` and passes
  on SAP's answer.
- **Nothing the system cannot serve is offered.** The guard is offered for a write kind only
  where `If-Match` was measured to act. A metadata or DDIC write gets it only after its own
  measurement.
- **Contract first, from the registry.** The ETag of a read and the `If-Match` of a write are
  declared in `@mcp-abap-adt/interfaces-adt`, implemented in adt-clients and used by
  mcp-abap-adt. Each package is published before its consumer depends on it.
- **The limit is stated.** The tool descriptions and the docs say that a change within the same
  second as the read is not detected.
- **Tools are explainable.** Each changed tool's description says what the parameter does, in
  functional words only.

## Open for the spec

- Which reads answer the ETag and which writes take it: source reads and source writes of every
  type, and whether metadata and DDIC writes act on `If-Match` (measure first).
- The parameter's name and where the ETag appears in a read's answer, in the high, low and
  compact tools.
- How the ETag travels in the contract: a field of the read's result, an option of the write,
  or both. The semver of each package follows from that.
- Which version the ETag belongs to (inactive or active), when a read states its version.
