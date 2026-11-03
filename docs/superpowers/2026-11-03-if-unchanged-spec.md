# Spec: write only if the object is unchanged

Goal: `2026-11-03-if-unchanged-goal.md`. This spec decides what the goal left open.

## 1. What SAP answers (Measured, 2026-11-03)

Measured on premise (S/4HANA, a program and a domain in `$TMP`) and on the cloud (BTP ABAP
trial, a class and a domain in the trial's test package without a transport). Every probe
object was deleted afterwards.

**Source** (`…/source/main`):
- The ETag is a timestamp and a counter, e.g. `202611030912440001`. A read and a write both
  answer one.
- **SAP compares `If-Match` with the newest version**: the inactive one when it exists, else
  the active one.
  - On premise, after activation, the active ETag (`…0011`) was accepted for a write while no
    inactive version existed.
  - Once a write made an inactive version, a write with the active ETag answered `412`. A write
    with the inactive ETag answered `200`.
  - On the cloud, after activation, the active and the inactive read answered the same ETag,
    and a write with it answered `200`.
- A stale ETag, or an arbitrary one, answers `412`, `ExceptionPreconditionFailed`: "Client
  ETag … does not match the object ETag … in the server". Nothing is written.
- **The limit.** On premise, two writes within one second answered the same ETag, though the
  text differed.

**XML metadata** (a domain, `…/ddic/domains/{name}`):
- The ETag is a timestamp, the media type and a 28-character value, e.g.
  `20261103091315000application/vnd.sap.adt.domains.v2+xml7EPl06…=`.
- A stale ETag and an arbitrary one answer `412`, and a current one answers `200`. This held
  on both systems.
- SAP's refusal quotes only the timestamp and the start of the media type. Whether the
  28-character part takes part in the comparison is unmeasured.

**Not measured:**
- the other write paths: class includes, function modules, DDL and the other source types,
  and the other DDIC types;
- the legacy system (7.40).

## 2. Contract: `@mcp-abap-adt/interfaces-adt` (minor)

`IAdtOperationOptions` gains:

```ts
/**
 * The ETag a read answered for the document this write replaces. Sent as `If-Match`:
 * the system refuses the write (412) when the document changed since that read.
 */
ifMatch?: string;
```

The read side needs no contract change. A result strategy is handed the whole answer, headers
included (`IResultStrategy`, `IAdtWireResponse.headers`). The server's own reading takes the
ETag from there.

## 3. Implementation: adt-clients (minor), legacy

- **Sending it.** Every update that writes a document — source or XML — sends `If-Match: <ifMatch>`
  when `ifMatch` is given, and nothing otherwise. One place builds it: the update's request
  headers, beside `lockHandle`.
- **Unit tests.** For every update member: the header is present exactly when the option is
  given, with the value as given.
- **Live test**, on premise and cloud: one source write and one XML write, each with a stale
  ETag, answer `412`.
- **Legacy.** The legacy package overrides updates for 7.40. Each override passes `ifMatch`
  on as well.
  - E77 is measured. If 7.40 acts on `If-Match`, the legacy tools offer it. If it does not,
    `LEGACY.md` lists the guard among the capabilities the legacy system lacks, and the legacy
    server's tools do not offer the parameter.
- adt-strategies takes the same `interfaces-adt` range, as for 25.1.0.

## 4. Tools: mcp-abap-adt (minor)

**Reads answer `etag`.**
- `AdtReading` gains `etag?: string`. `reading()` sets it from the answer's `etag` header, as it
  arrived.
- Every read tool whose answer is a document an update tool writes adds `etag` to that answer:
  the high, low and compact `Get*` tools of source and of metadata. A read tool without an
  ETag in SAP's answer adds nothing.
- The version is the one the read asked for. The description of `etag` says: "The ETag of the
  version read. A write checks it against the newest version, so read `version: inactive` to
  write over a pending inactive change."

**Writes take `etag`.**
- Every update tool gets `etag` (optional string): high `Update*`, low `Update*`, and compact
  `HandlerUpdate`.
- Description: "The ETag a read of this object answered. When given, the write is refused if
  the object changed since that read. A change within the same second as the read is not
  detected."
- The handler passes it as `ifMatch` to the update. A `412` reaches the model as SAP gave it,
  through the existing error passthrough.
- **Several documents.** A class's includes, a function module and its group, a table's
  source and its settings each have their own ETag. Each update tool takes the ETag of the
  very document it writes. The read of that document answers it.

**Updates answer `etag`.**
- An update that did not activate answers the ETag of its write, from the `PUT`'s answer.
  The model can then write again without reading.
- An update that activated answers no `etag`: activation makes a new version, and its ETag is
  a read away. The description says to read again before the next guarded write.

**Batch.** `etag` is a parameter like the others. The batch lists change nowhere.

## 5. Tests

- **Server unit tests:**
  - `reading()` takes the ETag from the headers, and its absence leaves the field absent;
  - every update tool passes `etag` as `ifMatch`, and none passes it when it is absent;
  - every read tool of a written document answers `etag`;
  - a `412` reaches the answer as SAP gave it.
- **Live, on premise and cloud**, one test per write path in the plan's list:
  1. read;
  2. write with the ETag (`200`, a new `etag`);
  3. write again with the first ETag (`412`);
  4. write with the new one (`200`).

  A path the live test does not prove is not offered: its tool gets no `etag`, and the plan
  says why.
- `descriptionsFunctional`, the surface fixtures and the counts cover the changed tools.

## 6. Docs and order

- The README and `AVAILABLE_TOOLS*.md` (`npm run docs:tools`) and the CHANGELOG of each package.
- A section "Writing over a change" in the user guide: read, pass `etag`, a `412` means read
  again; the version rule of §4; the one-second limit.
- Order:
  1. interfaces-adt;
  2. adt-clients, adt-strategies and legacy, after the E77 measurement;
  3. mcp-abap-adt.

  Each is published before its consumer moves to it.
