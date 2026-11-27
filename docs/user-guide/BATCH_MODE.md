# Batch Mode

Batch mode records tool calls instead of sending them, then sends all of them at once, in one
ADT batch envelope (`multipart/mixed`), and answers each call by its number. It is for work whose
requests do not depend on each other: reading twenty objects, locking ten, writing ten sources
under the locks already held, unlocking them — each of these a batch of its own. One envelope
round trip replaces many.

The compact binaries serve it, on stdio, Streamable HTTP and SSE:

| Binaries | Tool |
|---|---|
| `mcp-abap-adt-compact`, `-compact-http`, `-compact-sse`, and their `-ro` binaries | `HandlerBatch` with `action: 'begin' \| 'end' \| 'answers'` |

`number` / `numbers` go with `answers` alone. The full binaries (`mcp-abap-adt`, `-http`, `-sse`
and their `-ro` binaries) serve no batch mode, and their tools' descriptions carry no batch
sentence.

The debugger has a batch of its own — `DebugBatchBegin` / `DebugBatchEnd` / `DebugBatchAnswers`
in the full binaries, compact `HandlerDebugBatch` — at an ABAP stop or an AMDP break; its answers
are read with `DebugBatchAnswers` (compact `HandlerDebugBatch` `answers`), and one batch of either
kind is open at a time. See
[DEBUGGER.md](DEBUGGER.md#the-debugger-batch-several-calls-at-a-stop-in-one-envelope).

## The flow

1. **`HandlerBatch` `begin`** switches the server into batch mode. It sends nothing and answers
   `{ "batch": "on", "state_handle": "…" }`.
2. **Recording.** From now on, a call of a tool none of whose requests depends on another's
   answer is recorded and answers nothing (an empty content). Every recorded call is numbered,
   in the order made, from 1 — one number per call, covering every request it put into the
   batch (`HandlerGet` `part: 'draft'` sends each part's three version reads together, under its
   one number).
   A call refused, or one whose handler refused its arguments before sending anything, takes no
   number: a call no entry of the table below admits is refused `batch_not_recordable`, and a
   long read given `background: true` `batch_no_background` ("in batch mode a read takes no
   background: it is recorded, and the batch is sent at its end"). A long read without
   `background` is recorded. A batch holds one kind of request — LOCK, UNLOCK or stateless — and its first recorded
   call decides which; a call of another kind is refused `batch_other_kind` (see Phases).
3. **`HandlerBatch` `end`** sends every recorded call, in one envelope, with the credentials in force now, and
   leaves batch mode whatever happens. Nothing is sent twice and nothing is retried. It splits
   SAP's answer by number into **the map** — each number, the parts of its call's requests, in
   the order sent — and builds no call's answer. It answers
   `{ "recorded": <calls>, "sent": <requests>, "received": <parts> }`, `sent` equal to
   `received`. Or it answers its own error, and then there is no map:
   - the envelope failed — what came, as it came: SAP's answer to the envelope (its status and
     body, with `step: "execute"`), the transport's error, or a credential refusal;
   - fewer parts came than requests were sent — `batch_parts_mismatch` ("1 of 2 parts came; the
     answers cannot be matched to the calls"); more parts than requests — `batch_parts_mismatch`
     ("more parts came than the 2 requests sent; the answers cannot be matched to the calls");
   - the answer could not be split into parts — `batch_unsplit` ("the envelope's answer could
     not be split into the calls' parts").

   Which part belongs to which call is known only when `HandlerBatch` `end` worked without error; after
   its error, every number of that batch answers that same error.
4. **`HandlerBatch` `answers`** reads the map by number: `number` (one) or `numbers` (a list, answered
   in the order given). A number's answer is built when it is first read: the call's handler,
   waiting since its request was recorded, is given its parts and builds the answer the tool
   gives for that call outside batch mode for the same SAP answer — its projection of a
   success, or the failure as the tool answers it. The numbers asked in one call are built in
   parallel; an answer, once built, is kept, and a number read again answers the same. A
   handler that would send another request after its parts is refused `batch_ended` ("the batch
   has ended; this call can send nothing more"), and that is its answer. A number of a batch
   whose `HandlerBatch` `end` failed answers that error. A number the last batch does not have answers
   `{ "number": n, "error": "no_answer", "message": "no answer with that number" }`.

The map stays readable until the next `HandlerBatch` `end` replaces it (or the server instance ends),
so a phase can read the lock handles of the previous one while it is being recorded. A number
never read is left with its map: when the map is replaced or the instance ends, its call is let
go, nothing sent for it.
`HandlerBatch` `answers` is served while a batch is open; nothing else of the batch runs on a clock — over
Streamable HTTP and SSE the held state's idle bound (`stateIdleMinutes`, 30 minutes by default)
is the one clock that touches it. stdio has no idle bound: there no clock touches it, and the
batch lasts until its `HandlerBatch` `end`, the client closing stdin, or the process's shutdown.

When the server instance ends with a batch open — the client closes its connection (stdio, an SSE
stream), the HTTP pool lets the instance go, a long session's `SessionClose`, the process shuts down — or (HTTP, SSE) the idle bound ends the
held state, the open batch is dropped: nothing recorded is sent, and the last batch's map goes
with it. A `HandlerBatch` `end` after the idle bound is refused `batch_mode_off`, and `HandlerBatch` `answers` answers
"no answer with that number".

## Phases

A tool that builds a request from an earlier answer cannot be recorded — a high-level create
(validate, create, lock, write, unlock, check, activate), an update that reads the metadata and
writes it back patched, a `404` fallback, a poll. Run such work as phases, each its own batch,
with the single-step tools:

1. create — `HandlerCreate` (compact);
2. lock — `HandlerLock`; read the lock handles with `HandlerBatch` `answers` (over Streamable HTTP the
   lock is the instance's held state: every later phase sends that instance's `state_handle`).
   The instance holds a lock once its number is read, and only while the SAP session the
   envelope went out on is still the instance's: a lock read after that session ended answers
   its handle, and a write or an unlock under it is refused, sending nothing — lock again. A
   lock number never read before the next `HandlerBatch` `end` replaces the map, and a lock batch whose
   `HandlerBatch` `end` failed, leave locks in SAP that no handle reaches: they last until that session's
   logoff (stdio: the process's end; SSE: the connection's end; Streamable HTTP: the pooled
   instance's end; or SAP's own
   session timeout). An unlock number is read the same way: the instance drops the handle from its
   held locks when that number is read, so an unlock number never read leaves the handle held after
   SAP unlocked it — a later write under that handle is sent and SAP refuses it, where a read
   unlock makes the instance refuse it at once, sending nothing — and over Streamable HTTP the
   pooled instance stays held for a lock that no longer exists, until the instance ends and its
   session's logoff releases every lock. Read every lock number and every unlock number before the
   next phase's `HandlerBatch` `end`;
3. write — `HandlerUpdate` with `lock_handle` (for PACKAGE, DOMAIN, DATA_ELEMENT and
   FUNCTION_GROUP the whole metadata document in `source_code`, read beforehand with `HandlerGet`
   part `metadata`);
4. unlock — `HandlerLock` `action: unlock`;
5. read back, check — `HandlerGet` (one part per call: `source`, `metadata`), `HandlerCheckRun`.
6. activate — `HandlerActivate`: one object of a type the per-object activation maps answers its
   verdict; a list (`objects[]`), an `object_adt_type`, PACKAGE, SERVICE_DEFINITION and
   SERVICE_BINDING start an activation run and answer `{ run_id }`;
7. the run's state — `HandlerGet` `part: activation_status` with that `run_id` (`running` while
   the run goes on; `finished`, `error` or `failed` once it ended): with `with_long_polling: true`
   one read that SAP holds until the run ends and that answers its final status, without it a read
   answered at once, as often as you choose; then `part: activation_results` for the messages it
   produced.

Running unit tests with the synchronous runner is one call — `HandlerUnitTestRun` with
`runner: 'sync'`: one `POST /sap/bc/adt/abapunit/testruns`, its answer the finished result at
the batch's end.
`HandlerUnitTestRun` runs every test class of each container named; a function module's run covers
every test of its group. With the asynchronous runner (`runner: 'async'`, the default) it is three
phases, each its own batch:

1. start — `HandlerUnitTestRun`, answering the run's `run_id` (with `tests`, or with `target`: all
   tests of one object of any run object type, or of a package — a target run takes this runner);
2. the run's status, as often as you choose — `HandlerUnitTestStatus` (a CDS unit test:
   `HandlerCdsUnitTestStatus`) with that `run_id`, until it says `FINISHED`;
3. the result — `HandlerUnitTestResult` (`HandlerCdsUnitTestResult`, or `HandlerGet` with
   `object_type: UNIT_TEST` / `CDS_UNIT_TEST`) with the `run_id`.

Profiling a run is three phases, each its own batch:

1. schedule — `HandlerProfileSchedule` with the profiling flags, answering the `profiler_id`;
2. run — `HandlerProfileRun` with `target_type`, the class or program name and that `profiler_id`;
3. the trace, as often as you choose — `HandlerProfileList` until the run's trace is listed, then
   `HandlerProfileView` with its id.

Deleting is two phases, each its own batch:

1. deletion check — `HandlerDeletionCheck` per object; read each verdict with `HandlerBatch` `answers`;
2. delete — `HandlerDelete` for the objects whose check permitted it: the deletion request alone,
   with no lock held on the object (a held lock is what makes ADT refuse a deletion).

A class include (`LOCAL_TEST_CLASS`, `LOCAL_TYPES`, `LOCAL_DEFINITIONS`, `LOCAL_MACROS`) and a
class's unit tests (`UNIT_TEST`) are removed by writing them empty under the class lock: lock
(`HandlerLock` `object_type: CLASS`), delete (`HandlerDelete` with that `lock_handle`), unlock,
activate — each phase its own batch, as a write.

Compact `HandlerCreate` is one request for every type, in batch mode and outside it alike: the
create request of the type's create alone — no validation, lock, write, check or activation, no
service-group read for a service binding, no read-back after a function group's `400`; the object
is created inactive with what the create carries. Its schema lists only what a create sends —
`activate`, `fields`, `source_code`, `fixed_values`, `test_class_source`, a class's `abstract`, a
behavior definition's `root_entity`, a behavior implementation's `behavior_definition` are gone
from it: the content goes in through the write phase, the activation through `HandlerActivate`.
`UNIT_TEST` and `CDS_UNIT_TEST` are refused before anything is
sent: their create is a chain (the test classes' lock, write, unlock and activation; a CDS unit
test also checks the view and creates the class first) — "HandlerCreate does not create <type>:
its create is a chain of requests, not one — use CreateUnitTest / CreateCdsUnitTest of the full
set". A `PACKAGE` is recorded over HTTP only: over RFC a package is created in an ABAP session of
its own, outside the batch.

Compact `HandlerUpdate` is one request for every type, in batch mode and outside it alike: the
write of the type under the `lock_handle` the caller passes (required) — the `PUT` of the source,
of the class include (`LOCAL_*`, `UNIT_TEST`, `CDS_UNIT_TEST`, `BEHAVIOR_IMPLEMENTATION`) or of
the metadata document, and for `SERVICE_BINDING` its publication request. For PACKAGE, DOMAIN,
DATA_ELEMENT, FUNCTION_GROUP and TABLE_TYPE, and for INCLUDE with `part: 'metadata'`, `source_code`
is the whole metadata document, sent byte for byte:
nothing is read before the write or after it. Locking, unlocking and activating are their own
calls (`HandlerLock`, `HandlerLock` `action: unlock`, `HandlerActivate`); for `LOCAL_*`, `UNIT_TEST` and
`CDS_UNIT_TEST` the lock is the class's — `HandlerLock` with `object_type: CLASS`. A `PACKAGE` update is recorded over HTTP
only: over RFC the package lock is held in an ABAP session of its own, outside the batch.

Compact `HandlerDelete` is one request for every type, in batch mode and outside it alike: the
deletion request alone, as adt-clients' `delete()` sends it — no lock, no deletion check; SAP's
answer is the result, as it came. `HandlerDeletionCheck` sends the one deletion check
(`POST /sap/bc/adt/deletion/check`) and answers SAP's verdict as it came: `deletable: true` with
SAP's message when it carries one (a permitted check whose message says the object does not exist
included), or SAP's refusal in its words.
For `LOCAL_*` and `UNIT_TEST` (a `DELETE` on an include answers `405`), `HandlerDelete` is one
`PUT` of empty content under the `lock_handle` given — the class's lock; no lock, unlock or
activation of its own. `CDS_UNIT_TEST` deletes its test class.

Compact `HandlerGet` is one request per part, in batch mode and outside it alike: `part: source`
(the default) the source alone, `part: metadata` the metadata document alone, each answered
`{ part: 'source', source }` or `{ part: 'metadata', metadata }` beside the object's name. PACKAGE,
DOMAIN, DATA_ELEMENT, FUNCTION_GROUP and TABLE_TYPE have a metadata document and no source: `source` (and an
absent `part`) is refused before anything is sent, naming the parts the type has. A function module
is read at the group its arguments name — `function_module_name` as `GROUP|MODULE`, or with
`function_group_name`. `node_structure` of a package (`DEVC/K`) is one request: SAP answers an
empty package and a package that does not exist with the same blank body, and that answer is the
empty listing with `blank` stating both readings — `part: metadata` of the package tells them
apart. `urls` (up to five requests, each built from an earlier answer) and `contents` (the package
walk) are refused in batch mode (`batch_not_recordable`).

Compact `HandlerActivate` is one request, in batch mode and outside it alike. One object of
CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT,
BEHAVIOR_DEFINITION or METADATA_EXTENSION (by `object_type` or its ADT code) is the per-object
`POST /sap/bc/adt/activation`, answering the verdict. Every other call is the one
`POST /sap/bc/adt/activation/runs`, answering `{ run_id }`: the run was accepted and has no verdict
yet (an answer without a run id is a failure with `step: start activation run`). `HandlerGet` reads it by that id, one request per part: `activation_status`
(`GET /sap/bc/adt/activation/runs/{run_id}`, answered `{ run_id, part, status, document }`) and
`activation_results` (`GET /sap/bc/adt/activation/results/{run_id}`, answered
`{ run_id, part, messages, document }`), each with SAP's document as it came. `activation_status`
with `with_long_polling: true` is `GET /sap/bc/adt/activation/runs/{run_id}?withLongPolling=true`:
SAP holds that one request until the run ends and answers its final status (`finished`, `error` or
`failed`). Without it the read answers at once, `running` while the run goes on; asking again is
yours: the server sets no timer. On a system whose discovery offers no activation runs
(SAP_BASIS 751, 7.40), the run's `POST` answers SAP's refusal; a group activation there is
`ActivateObjects` (the full set) or `ActivateObjectLow` (the low handlers group).

Compact `HandlerDumpList` reads one page per call: the one `GET /sap/bc/adt/runtime/dumps` (or the
system-messages or gateway-errors feed) with `$top` from 1 to 100 (SAP answers at most 100; `top`
101 is refused before any request, naming the cap), answered `{ feed_type, count, entries, next_to }`.
`next_to` is the `to` of SAP's next link, as it came. Listing further is a chain of calls, each its
own batch: `HandlerDumpList` with `to` set to the previous answer's `next_to`, until an answer
carries no `next_to`. The next link's page starts at the boundary second, inclusive: entries of that
second may repeat; match them by `dump_id`.

Compact `HandlerUnitTestResult`, `HandlerCdsUnitTestResult` and `HandlerGet` with `object_type:
UNIT_TEST` / `CDS_UNIT_TEST` are one request each, in batch mode and outside it alike: the
`GET /sap/bc/adt/abapunit/results/{run_id}` alone, answered `{ success, run_id, run_result }` with
the result document SAP answered, parsed. The run's status is its own call
(`HandlerUnitTestStatus` / `HandlerCdsUnitTestStatus`, one status read with long polling). A result
read before the status says `FINISHED` is whatever SAP answers for it; a finished run's result
carries `executionTime` on each test method.

**Every batch end sends one envelope.** Only LOCK and UNLOCK go stateful, as adt-clients sends
them, and adt-clients puts each kind — LOCK, UNLOCK, stateless — into an envelope of its own. So a
batch holds one kind: its first recorded call decides it, and a call of another kind is refused
`batch_other_kind` before it records anything (no number): "<tool> is a <kind> request; this
batch holds <kind> requests — record it in the next batch". The phases above are exactly these
kinds: create, write, read back and check are stateless batches, lock a LOCK batch, unlock an
UNLOCK batch — each phase its own batch, one envelope each. Every recordable call's requests are
of one kind (the eligibility proof checks each listed call). Should a part of a call be refused
anyway, the call answers `batch_other_kind` and records nothing more; if an earlier part of it was
already recorded, the words say so with its number — that part is sent at `HandlerBatch` `end`, and its
number answers the same refusal.

### The phases, measured

Measured 2026-10-19 (`src/__tests__/integration/batch/communicationBatch.test.ts`, the case
`batch.test_cases.communication`): the compact server started over stdio and called through an MCP
client, with three objects — a class, an interface and a domain — in a package with a transport
request. Each phase was one `HandlerBatch` begin, the calls, end, then the answers by number:

1. reads — `HandlerGet` part `metadata` of each object, each answering `404` (the names are free);
2. create — `HandlerCreate` × 3;
3. reads — `HandlerGet` part `metadata` of the domain, the document its write sends back whole;
4. lock — `HandlerLock` × 3, the lock handles read from the answers;
5. write — `HandlerUpdate` × 3 under those handles: the class's and the interface's sources, the
   domain's whole document in `source_code`;
6. unlock — `HandlerLock` `action: unlock` × 3;
7. activate — `HandlerActivate` × 3, one object each, each answering `activated: true`;
8. reads — `HandlerGet` × 3: the sources and the document as written;
9. deletion check — `HandlerDeletionCheck` × 3, each answering `deletable: true`;
10. delete — `HandlerDelete` × 3;
11. reads — `HandlerGet` part `metadata` of each object, each answering `404`.

| Destination | Result | Runs |
|---|---|---|
| on premise (HTTP) | passed | 2 |
| on premise (RFC) | passed | 2 |
| ABAP Cloud | not run: the test configuration names no ABAP Cloud destination | — |

On both, every recorded call answered nothing, every batch end recorded 3 calls (1 for the
domain document) with no envelope failure, and every number's answer was its own: in phases 1 and
11 numbers 1, 2 and 3 answered `404` each, in every other phase no number answered an error. (This
run predates the map: `HandlerBatch` `end` then built every answer itself.) The objects' entries went into
the configured transport request; no other request was created. The server, stopped by the end of
its stdin, logged its sessions off and exited `0`. Over RFC the server connected to the RFC
gateway only, with no HTTP connection to the system.

Time of each batch end, in milliseconds (the last run on each; recording a call took 1–10 ms):

| Phase | on premise (HTTP) | on premise (RFC) |
|---|---:|---:|
| reads (names free) | 538 | 238 |
| create | 999 | 947 |
| reads (domain document) | 141 | 235 |
| lock | 862 | 202 |
| write | 471 | 611 |
| unlock | 108 | 104 |
| activate | 1436 | 1402 |
| reads (written) | 205 | 356 |
| deletion check | 595 | 647 |
| delete | 3265 | 3062 |
| reads (deleted) | 386 | 212 |

## Reads of several objects inside one call

Two rules decide what goes in an envelope:

1. **Independence.** One envelope holds only calls that do not depend on each other; a call
   that needs another's answer goes in a later envelope.
2. **The node structure workaround.** Several node structure parts in one envelope cross-talk
   their metadata (a part carries another part's `DESCRIPTION`, measured 2026-10-18), so the
   metadata of the objects read is read separately, in a second phase of requests that do not
   conflict.

Within those rules, the tools below send a phase of one read — and, in some, the reads of one
object — as single requests rather than as an envelope of one part. That is an implementation
choice, not a rule: an envelope of one part would be as correct.

- **Function module group checks.** A group activation (`ActivateObjects`, `HandlerActivate` with
  `objects`) and `GetWhereUsed` with several `GROUP|FM` targets check, before anything else, that
  each function module is in the group its reference names, from the module's metadata. Two or
  more modules have their metadata reads in one envelope; the answer is the one read one after
  another: the first failure in the references' order. A module that does not exist is its own
  `404` part beside the other modules' `200`s, answered as SAP's `404` with its key, as before.
  Every module of an envelope is read, also after a failure in it; no later envelope is sent after
  one, and the refusal says so ("only function module metadata was read"). One module is its one
  request.
- **`GetEnhancements`.** An object of no known `object_type` is probed as a class, a program and an
  include, by their metadata. With `objects` naming two or more objects (two spellings of one name
  and type are one), every probe of every such object goes in one envelope, and each object's kind
  is decided over those answers as the sequential version decides it: a `404` part means not that
  kind; a probe the decision does not reach (the program probe of a class) decides nothing, a
  `401` there included; a `401` on a probe the decision reaches ends the list there, as the
  sequential version ends it. Then every object's enhancements; with `include_nested`, an object's
  includes root only after its enhancements answered, in the next envelope. A phase left with one
  object's reads sends them as single requests, and one object — `object_name`, or `objects`
  naming one — is read as the sequential version reads it (an implementation choice).
- **`GetObjectsList`.** Pass 1 reads the node structures in envelopes, level by level, without
  descriptions — one parent included; at medium and full, pass 2 reads each object's own metadata
  in a second batch (rule 2).
- **`GetObjectInfo`: the structure first, the descriptions second.** The structure comes back
  first, each node structure sent as its own request whatever `include_descriptions` says (rule 2:
  node structures cross-talk inside an envelope). `include_descriptions: false` (the default) reads no
  object metadata; the enrichment (`enrich`, on by default) still runs its searches, one per node,
  in an envelope. With `include_descriptions: true` the server also runs the metadata phase itself:
  every leaf's metadata, in envelopes (the second phase of rule 2: metadata reads do not
  conflict), and each leaf's
  description is its metadata's. The sequential version reads the same metadata, one request
  each, so both paths answer from one source. A leaf whose metadata read SAP refused — a `401`
  included — has no description, and the call answers, on both paths.
- **`SearchSource`.** Several targets' rounds go in envelopes; without `max_hits` a single target,
  and any phase of one read (one mask's quickSearch, a walk level of one node structure, a round of
  one source read), goes as single requests (an implementation choice). With `max_hits` a target's
  rounds of two or more reads go in envelopes (below).
- **No bound of the server's own on an envelope.** By default all independent reads of
  a phase go in one envelope. The consumer may set a bound: `--batch-parts-per-envelope=<parts>`
  (`MCP_BATCH_PARTS_PER_ENVELOPE`, YAML `batch.partsPerEnvelope`; a positive whole number; an
  embedder's `partsPerEnvelope` option). It applies to every phase, in one place
  (`runPhaseOutcome` / `runPhase`, `src/lib/batch/phases.ts`), and it counts **parts** — the
  requests in the envelope. Every read of the phase runs once and records its requests, nothing
  sent; the recorded parts are planned in consecutive envelopes of at most that many parts,
  balanced (`packByParts`: 302 one-request reads at 300 are 151 and 151, never 300 and 2), each
  read's parts together — one that does not fit starts the next envelope — and the plan's part
  counts are checked before the first envelope is sent (`checkedEnvelopes`): a read that needs more
  parts than the bound is answered an error naming both numbers — "a read of this step needs N
  parts in one ADT batch envelope, more than the B parts per envelope set" — and nothing of the
  phase is sent. The envelopes then go one after another, each read handed its own answers.
- **A failed envelope is answered as SAP answered it.** An envelope SAP refuses or fails is every
  part's failure, as it came, and the call answers that; with a bound, an envelope that failed or
  met a credential refusal ends the phase: no later envelope is sent, and the reads it would have
  carried answer that same failure, as one envelope holding them all would have. A part SAP
  answered `401` — in the envelope or in its format-correction envelope — and a correction envelope
  that failed end the phase the same way, `GetEnhancements` included. The group checks also stop
  after an envelope holding a failure (the first failure is the answer). **The exception is
  `GetObjectInfo`'s metadata phase** (`include_descriptions: true`): a failed metadata read — a part
  SAP refused, or a whole envelope that failed — gives those leaves no description and the call
  still answers, the next envelope sent; only a credential refusal ends it.
- **`SearchSource` and `max_hits`.** Without `max_hits` every target is read and every hit
  answered: every target's round goes in one phase (one envelope, or the bound's). With
  `max_hits` the targets are read one per round, bound or not, each target's reads still in
  envelopes (of at most the bound), the hits counted after each envelope, and the scan stops as
  soon as they reach `max_hits`: no later envelope is sent. SAP's own
  envelope limit is not measured.
- **Descriptions are never taken from a batched node structure.** Inside an envelope a node
  structure part can carry another part's `DESCRIPTION` (measured, 2026-10-18). The package
  listings with `include_descriptions: true` send each node structure as its own request and take
  each object's description from it; `GetObjectInfo` and `GetObjectsList` take each object's
  from its metadata, in the second phase (above).
- **Single requests over RFC go one at a time.** Where a tool reads single requests several at a
  time — the package listings with `include_descriptions: true` and `GetObjectInfo`'s structure,
  whatever its options (8 at once),
  `SearchSource` without a communication batch — an RFC connection gets one at a time
  (`readsInFlight`, `src/lib/connectionKind.ts`), a batch connection or another view over it
  included: an RFC connection is one ABAP session, and reads sent to it in parallel were lost
  without an error (measured on premise, 2026-09-26, `SearchSource`). The others over RFC are
  unit-tested only.
- **An envelope that fails as a whole** is every read's failure in it: the answer is the one the
  sequential reads give with those reads failed, each naming the envelope's request. An envelope
  whose own request answered `404` once the endpoint is known served is such a failure, never each
  part's "not found" (`GetEnhancements` reports its probes refused, not the object missing). A
  credential refusal ends the call as it came. A destination with no communication batch reads one
  after another, as before.
- **A credential refusal in a list reports the first one in object order.** Where two objects of a
  list meet a credential refusal on different reads, the call answers the refusal of the first
  object in the list, which may not be the read the sequential version would have sent first. A
  credential refusal stops everything anyway; the answer names one of them (accepted by the
  owner).

A part's `404` beside other parts' `200`s is that part's answer: measured (see "The phases,
measured" above, and adt-clients' `docs/usage/BATCH.md`). The function module metadata reads and
the `GetEnhancements` probes in one envelope are pinned by unit tests only
(`src/__tests__/unit/batch/moduleGroupChecks.test.ts`, `includeTrees.test.ts`); they are not yet
measured on a system.

## A system without the communication batch

The tools that read several independent things inside one call (the package walks,
`GetObjectInfo`, `SearchSource`, `GetIncludesList`, `GetStructuresList`, `GetEnhancements`,
`DescribeByList`, `GetWhereUsed`, `RuntimeListFeeds`, and the function module group checks of a
group activation — `ActivateObjects`, `HandlerActivate` with `objects`)
send them in envelopes to `/sap/bc/adt/communication/batch`.
Whether a destination has that endpoint is learned only from the outer status of its first
envelope: `2xx` means served, for good; `404` means not served, and from then on that
destination's reads run sequentially, one request after another. Any other status decides
nothing, and an inner part's status is that item's answer, never a verdict.

Measured 2026-10-18 on the system (`src/__tests__/integration/batch/noCommunicationBatch.test.ts`,
one `GetObjectInfo` of a package, one tier, no enrichment): the first envelope's outer status was
`202`; the destination was marked served, and a second call on it sent its reads in envelopes
again. The system serves the communication batch, so the not-served branch (an outer `404`, the
destination marked, the reads sequential) is shown by the unit tests only
(`src/__tests__/unit/batch/availability.test.ts`), not measured.

### `GetWhereUsed`'s objects cache after a credential refusal

`GetWhereUsed` with `objects` keeps each object it answers in the objects cache that
`GetObjectNodeFromCache` reads. A call that ends on a credential refusal keeps what it answered
before the refusal, and the two versions answer a different amount before it:

- Without the batch, each object is answered, and cached, before the next one is read; the
  objects before the refused read are in the cache.
- In envelopes, a refusal in the last phase still caches the objects before the refused one.
  A refusal in an earlier phase — with a type filter, a scope read answered `401` — ends the call
  before the scoped searches are sent, so the objects whose scope was already answered get no
  where-used answer and are not cached; a refusal thrown for a whole envelope caches nothing from
  that phase.

A call that ends without a refusal caches the same objects on both versions.

### Request headers and a request answered `406` or `415`

The server sends every request of the adt-clients members that take an `Accept` and
`Content-Type` pair (adt-clients 36: create, update, delete, check, activate, the deletion check,
the where-used, node structure and virtual folder reads, the data previews, the transport
actions, the debugger's requests, the trace scheduling, abapGit's link and pull) with a pair of
its own: one default pair per member and object type — the pair adt-clients 35 sent, completed
where it sent one header or none — and a corrected pair once the system named another.

A request SAP answers `406` naming the types it serves is sent once more with them as the
`Accept` (the `Content-Type` as sent); one answered `415` naming a type, once more with it as the
`Content-Type` (the `Accept` as sent). The corrected pair is kept for that system and member —
the system the destination points at, whatever the credentials: two destinations to the same
system share it — and sent from then on, in an envelope and outside one. It is kept in memory
for the process and replaced when a later `406`/`415` corrects it again. A `406`/`415` that names
no type, or names what was sent, is the request's answer; the second request's answer is the
call's answer.

In the tools above that read in envelopes, the correction is the phase's: right after a phase's
envelope answers, before any answer is read, the requests SAP answered `406`/`415` go in one more
envelope — only those requests, each sent again by its member with the corrected pair. One round:
what that envelope answers is the request's answer. A read without a header pair (a search, a
source or metadata read) is sent as it is, and its `406` is its answer: `DescribeByList` answers an
object whose typed search is refused `406` with that search's error, and searches without the
type only after an empty or otherwise failed typed search.

The correction is the server's, around the member calls, so it applies on whatever connection
the server is given — an embedder's injected one included.

`HandlerBatch` `end` corrects nothing: a recorded call's `406`/`415` is its answer (see "Credentials and
failures").

The members, their default pairs and the correction in full:
[Request headers](../architecture/REQUEST_HEADERS.md).

## Over Streamable HTTP

Every HTTP request is an MCP session of its own, served by a pooled server instance. Send the
`state_handle` `HandlerBatch` `begin` answers as the `state_handle` argument on every call of the batch,
`HandlerBatch` `end` and `HandlerBatch` `answers` included — every tool of the Streamable HTTP binaries declares that
optional argument — or, from a client that sets headers, in the `x-mcp-state-handle` request
header: the pool routes the call to the instance that holds the batch, one request at a time, in
the order they arrive. A call without the handle reaches an instance where no batch is open. A tool call whose handle the pool does not know — one
that never existed, or whose state ended — is answered `state is not available` by the pool itself,
before any instance is made and with nothing logged on; a JSON-RPC array holding a tool call is
answered the same, one such answer per request in it that has an `id` (an array whose tool call
carries a `state_handle` argument is answered `400`: "a JSON-RPC batch cannot carry
state_handle"). When both the header and the argument are sent, the header wins. The handle is
a bearer secret: whoever holds it reaches the batch. A client that leaves during `HandlerBatch` `end` does
not stop it: the map is kept for the next `HandlerBatch` `answers` with the handle.

**Batches inside a long session.** A long session (`SessionOpen`; compact `HandlerSession`
`action: 'open'`) keeps one instance and its SAP session across calls, and its `state_handle` is
the instance's: `HandlerBatch` `begin` on it answers that same handle, and the phases (lock, write, unlock)
all run on that one SAP session. The session tools run at once and are never recorded, in a
communication batch and in a debugger batch alike: `SessionOpen` leaves an open batch open;
`SessionClose` closes the instance, which drops an open batch and its answers with nothing sent
and logs off the SAP session (which releases its locks); its answer names what was held
(`"batch": true`). On stdio and SSE nothing is needed: the batch is the process's
(stdio) or the connection's (SSE).

## Credentials and failures

`HandlerBatch` `end` sends on the instance's connection as it is at that moment, with the credential in
force then; it holds that connection for the whole send. A credential refusal — refused before
SAP was asked, or SAP's `401` the credential could not renew — ends `HandlerBatch` `end` and reaches the
caller as it came; there is no map, and every number read answers the same refusal. If
`HandlerBatch` `end` fails before anything is sent (taking the connection, the system lookup), batch mode
ends too, there is no map, and every number read answers that failure.

A part SAP answered `401`, `406` or `415` is that call's answer, as any other failure: in batch
mode nothing recorded is corrected and sent again.

## Raw parts

With `--batch-keep-raw-parts` (`MCP_BATCH_KEEP_RAW_PARTS`, YAML `batch.keepRawParts`; default
off) each answer also carries SAP's raw parts of its call's requests, in the order sent:
`{ status, status_text, headers, body }`, `body` `""` when a part had none. A number of a batch
whose `HandlerBatch` `end` failed answers that error alone, with no raw part.

## Which calls are recorded

A call refused by the access restrictions ([Access restrictions](ACCESS_RESTRICTIONS.md)) is
refused when it is recorded, before anything else: it takes no number. A package-tree read the
check makes is sent on the instance's connection at once, not recorded. `HandlerGet`
`part: 'draft'` is recorded: each part's three version reads go into the envelope,
and a `$batch` part keeps its `ETag` (measured).

The data tool (compact `HandlerGetData`) is recorded as listed below where it is served: only by
a binary started with `--enable-data-tools`.

The transport creates are not recorded: `HandlerTransportCreate` and `HandlerCreate`
`object_type: 'TRANSPORT'` read the new request and type its task from the create's answer, and
one envelope cannot hold a request built from another's answer. Each is refused
`batch_not_recordable`, takes no number and sends nothing.

<!-- batch-handlers:start -->

48 entries, rendered from `tools/batch-handlers.json`. A tool that is not listed is refused in batch mode. A `-ro` binary serves an entry when it serves the tool.

### Compact sets (`mcp-abap-adt-compact`, `-compact-http`, `-compact-sse`, and their `-ro` binaries for the reads)

| Tool | Recorded | Sends |
|---|---|---|
| `HandlerActivate` | when objects is absent and object_adt_type is absent and object_type is one of DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, BEHAVIOR_DEFINITION, METADATA_EXTENSION, BEHAVIOR_IMPLEMENTATION | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object (a type the per-object activation maps) |
| `HandlerActivate` | when objects is given and the type of every objects item is any value but FUGR/FF, function, functionmodule, function_module, func | one request: POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=… for the objects listed, answering { run_id } (one object of a type the per-object activation maps: POST /sap/bc/adt/activation?method=activate) |
| `HandlerActivate` | when objects is absent and object_adt_type is given and object_adt_type is any value but FUGR/FF, function, functionmodule, function_module, func | one request: POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=… for the one object, answering { run_id } (a code the per-object activation maps: POST /sap/bc/adt/activation?method=activate) |
| `HandlerActivate` | when objects is absent and object_adt_type is absent and object_type is one of PACKAGE, SERVICE_DEFINITION, SERVICE_BINDING, INCLUDE, TABLE_TYPE, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS | POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=true for the one object, answering { run_id } |
| `HandlerCdsUnitTestResult` | when run_id is given | GET /sap/bc/adt/abapunit/results/{run_id}[?withNavigationUris=false] |
| `HandlerCdsUnitTestStatus` | every call | GET /sap/bc/adt/abapunit/runs/{id}?withLongPolling=true |
| `HandlerCheckRun` | when object_type is any value but FUNCTION_MODULE | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object (/checkruns for a package) |
| `HandlerCreate` | when object_type is one of DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, INCLUDE, TABLE_TYPE | POST the create request of the type's create() alone ({collection uri}[?corrNr=…]) — no validate, lock, write, unlock, check or activate |
| `HandlerCreate` | when object_type is PACKAGE and the connection is HTTP | POST /sap/bc/adt/packages[?corrNr=…], the package create alone; over RFC a package is created in an ABAP session of its own, outside the batch |
| `HandlerDelete` | when object_type is one of PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST, PROGRAM, INTERFACE, FUNCTION_GROUP, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, INCLUDE, TABLE_TYPE | the deletion request alone: POST /sap/bc/adt/deletion/delete (a metadata extension: DELETE /sap/bc/adt/ddic/ddlx/sources/{name}[?corrNr=…]) |
| `HandlerDelete` | when lock_handle is given and object_type is one of LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST | PUT of empty content to the class include under the lock_handle given ({class uri}/includes/{include}?lockHandle=…[&corrNr=…]) |
| `HandlerDeletionCheck` | when object_type is any value but FUNCTION_MODULE | POST /sap/bc/adt/deletion/check for the one object |
| `HandlerDumpList` | every call | GET /sap/bc/adt/runtime/dumps (feed_type system_messages: /sap/bc/adt/runtime/systemmessages; gateway_errors: /sap/bc/adt/gw/errorlog) with $top (1 to 100), to, from and the dump filters: one page, SAP's next link answered as next_to |
| `HandlerDumpView` | every call | GET /sap/bc/adt/runtime/dump/{id} (the view asked) |
| `HandlerGet` | when part is source (absent reads as source) and object_type is one of TRANSPORT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, PROGRAM, INCLUDE, INTERFACE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, CLASS_TEXT_ELEMENTS | one request: GET the type's source (as the full set's Get<Type>, part source) |
| `HandlerGet` | when part is metadata and object_type is one of PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, TABLE_TYPE | one request: GET the type's metadata document (as the full set's Get<Type>, part metadata); FUNCTION_MODULE at the group its arguments name |
| `HandlerGet` | when part is object_structure | GET /sap/bc/adt/repository/objectstructure?objecttype=…&objectname=… |
| `HandlerGet` | when part is node_structure and object_adt_type is given | POST /sap/bc/adt/repository/nodestructure for the one node asked |
| `HandlerGet` | when part is virtual_folders | POST /sap/bc/adt/repository/informationsystem/virtualfolders/contents |
| `HandlerGet` | when part is activation_status and run_id is given | GET /sap/bc/adt/activation/runs/{run_id}; with with_long_polling true, GET /sap/bc/adt/activation/runs/{run_id}?withLongPolling=true, which SAP holds until the run ends |
| `HandlerGet` | when part is activation_results and run_id is given | GET /sap/bc/adt/activation/results/{run_id} |
| `HandlerGet` | when part is source (absent reads as source) and object_type is one of UNIT_TEST, CDS_UNIT_TEST and run_id is given | GET /sap/bc/adt/abapunit/results/{run_id}: the run's result, part source |
| `HandlerGet` | when part is draft | as the full set's draft read: for each part of the object, GET its source or metadata ?version=active, ?version=inactive and ?version=workingArea, all sent together |
| `HandlerGetData` | every call | POST /sap/bc/adt/datapreview/freestyle with sql_query, or with SELECT * FROM object_name, as the body |
| `HandlerLock` | when action is lock (absent reads as lock) and object_type is one of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING, INCLUDE, TABLE_TYPE, TABLE_SETTINGS, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS | POST {object uri}?_action=LOCK&accessMode=MODIFY, stateful |
| `HandlerLock` | when action is lock (absent reads as lock) and object_type is PACKAGE and the connection is HTTP | POST /sap/bc/adt/packages/{name}?_action=LOCK&accessMode=MODIFY, stateful; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerLock` | when action is unlock and object_type is one of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING, INCLUDE, TABLE_TYPE, TABLE_SETTINGS, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS and lock_handle is given | POST {object uri}?_action=UNLOCK&lockHandle=…, stateful |
| `HandlerLock` | when action is unlock and object_type is PACKAGE and lock_handle is given and the connection is HTTP | POST /sap/bc/adt/packages/{name}?_action=UNLOCK&lockHandle=…, stateful; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerProfileList` | every call | GET /sap/bc/adt/runtime/traces/abaptraces |
| `HandlerProfileRun` | every call | POST /sap/bc/adt/oo/classrun/{name} or /sap/bc/adt/programs/programrun/{name}; with profiler_id, ?profilerId={profiler_id} |
| `HandlerProfileSchedule` | every call | POST /sap/bc/adt/runtime/traces/abaptraces/parameters: schedules a trace and answers its profiler_id |
| `HandlerProfileView` | every call | GET …/runtime/traces/abaptraces/{id}/hitlist, /statements or /dbAccesses (mode analyze: summarised locally) |
| `HandlerServiceBindingListTypes` | every call | GET /sap/bc/adt/businessservices/bindings/bindingtypes |
| `HandlerServiceBindingValidate` | every call | POST /sap/bc/adt/cts/transportchecks |
| `HandlerSystem` | when action is search_object | search_object: GET /sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=…&maxResults=…[&objectType=…] |
| `HandlerSystem` | when action is where_used and objects is absent and enable_all_types is any value but true and enable_only_types is absent and disable_types is absent and in_object is absent and object_type is any value but FUGR/FF, function, functionmodule, function_module, func | where_used of one object without a type filter and without in_object: POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=… with the default scope; with in_object its code lines are read with the identifiers that answer returns, so it is no entry |
| `HandlerSystem` | when action is atc_findings | atc_findings: GET /sap/bc/adt/atc/worklists/{id}?includeExemptedFindings=false |
| `HandlerSystem` | when action is atc_results | atc_results: GET /sap/bc/adt/atc/results?createdBy={user}[&centralResult=true][&ageMin=N][&ageMax=N] |
| `HandlerSystem` | when action is atc_result | atc_result: GET /sap/bc/adt/atc/results/{displayId} |
| `HandlerTransportMoveObjects` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/moveobjects with all the objects given |
| `HandlerTransportSortAndCompress` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/sortandcompress |
| `HandlerUnitTestResult` | when run_id is given | GET /sap/bc/adt/abapunit/results/{run_id}[?withNavigationUris=false] |
| `HandlerUnitTestRun` | when runner is sync | POST /sap/bc/adt/abapunit/testruns: runs every test class of each container named and answers the finished result |
| `HandlerUnitTestRun` | when runner is async (absent reads as async) | POST /sap/bc/adt/abapunit/runs: starts the run and answers its id; the result is read with HandlerUnitTestStatus / HandlerUnitTestResult |
| `HandlerUnitTestStatus` | every call | GET /sap/bc/adt/abapunit/runs/{id}?withLongPolling=true |
| `HandlerUpdate` | when lock_handle is given and object_type is one of DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST, PROGRAM, INTERFACE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, INCLUDE, TABLE_TYPE, CLASS_TEXT_ELEMENTS | one request under the lock_handle given: PUT of the source, the class include or the metadata document as given ({object uri}…?lockHandle=…[&corrNr=…]); for SERVICE_BINDING its publication request |
| `HandlerUpdate` | when lock_handle is given and object_type is PACKAGE and the connection is HTTP | PUT /sap/bc/adt/packages/{name}?lockHandle=…[&corrNr=…], the metadata document as given; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerValidate` | every call | POST the type's validation endpoint (…/validation?objname=…, /cts/transportchecks for a service binding) |

<!-- batch-handlers:end -->
