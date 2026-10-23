# Batch Mode

Batch mode records tool calls instead of sending them, then sends all of them at once, in one
ADT batch envelope (`multipart/mixed`), and answers each call by its number. It is for work whose
requests do not depend on each other: reading twenty objects, locking ten, writing ten sources
under the locks already held, unlocking them — each of these a batch of its own. One envelope
round trip replaces many.

Every binary serves it, on stdio, Streamable HTTP and SSE:

| Binaries | Tools |
|---|---|
| `mcp-abap-adt`, `-http`, `-sse`, and their `-ro` binaries | `BatchBegin`, `BatchEnd`, `BatchAnswers` |
| `mcp-abap-adt-compact`, `-compact-http`, `-compact-sse`, and their `-ro` binaries | `HandlerBatch` with `action: 'begin' \| 'end' \| 'answers'` |

`HandlerBatch` is the three tools in one: `begin` is `BatchBegin`, `end` is `BatchEnd`,
`answers` is `BatchAnswers`; `number` / `numbers` go with `answers` alone.

The debugger has a batch of its own — `DebugBatchBegin` / `DebugBatchEnd`, compact
`HandlerDebugBatch` — at an ABAP stop or an AMDP break; its answers are read with `BatchAnswers`
(compact `HandlerDebugBatch` `answers`), and one batch of either kind is open at a time. See
[DEBUGGER.md](DEBUGGER.md#the-debugger-batch-several-calls-at-a-stop-in-one-envelope).

## The flow

1. **`BatchBegin`** switches the server into batch mode. It sends nothing and answers
   `{ "batch": "on", "state_handle": "…" }`.
2. **Recording.** From now on, a call of a tool none of whose requests depends on another's
   answer is recorded and answers nothing (an empty content). Every recorded call is numbered,
   in the order made, from 1 — one number per call, covering every request it put into the
   batch (`GetObjectVersionDiff` sends its two version reads together, under its one number).
   A call refused, or one whose handler refused its arguments before sending anything, takes no
   number: a call no entry of the table below admits is refused `batch_not_recordable`, and a
   long read given a `timeout` `batch_no_timeout` ("in batch mode a read takes no timeout: the
   batch is sent at BatchEnd, with no deadline"). A batch holds one kind of request — LOCK, UNLOCK or stateless — and its first recorded
   call decides which; a call of another kind is refused `batch_other_kind` (see Phases).
3. **`BatchEnd`** sends every recorded call, in one envelope, with the credentials in force now, and
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

   Which part belongs to which call is known only when `BatchEnd` worked without error; after
   its error, every number of that batch answers that same error.
4. **`BatchAnswers`** reads the map by number: `number` (one) or `numbers` (a list, answered
   in the order given). A number's answer is built when it is first read: the call's handler,
   waiting since its request was recorded, is given its parts and builds the answer the tool
   gives for that call outside batch mode for the same SAP answer — its projection of a
   success, or the failure as the tool answers it. The numbers asked in one call are built in
   parallel; an answer, once built, is kept, and a number read again answers the same. A
   handler that would send another request after its parts is refused `batch_ended` ("the batch
   has ended; this call can send nothing more"), and that is its answer. A number of a batch
   whose `BatchEnd` failed answers that error. A number the last batch does not have answers
   `{ "number": n, "error": "no_answer", "message": "no answer with that number" }`.

The map stays readable until the next `BatchEnd` replaces it (or the server instance ends),
so a phase can read the lock handles of the previous one while it is being recorded. A number
never read is left with its map: when the map is replaced or the instance ends, its call is let
go, nothing sent for it.
`BatchAnswers` is served while a batch is open; nothing else of the batch runs on a clock — the
held state's idle bound (`stateIdleMinutes`, 30 minutes by default) is the one clock that touches
it.

When the server instance ends with a batch open — the client closes its connection (stdio, an SSE
stream), the HTTP pool lets the instance go, a long session's `SessionClose`, the process shuts down — or the idle bound ends the
held state, the open batch is dropped: nothing recorded is sent, and the last batch's map goes
with it. A `BatchEnd` after the idle bound is refused `batch_mode_off`, and `BatchAnswers` answers
"no answer with that number".

## Phases

A tool that builds a request from an earlier answer cannot be recorded — a high-level create
(validate, create, lock, write, unlock, check, activate), an update that reads the metadata and
writes it back patched, a `404` fallback, a poll. Run such work as phases, each its own batch,
with the single-step tools:

1. create — `HandlerCreate` (compact);
2. lock — `HandlerLock`; read the lock handles with `BatchAnswers` (over Streamable HTTP the
   lock is the instance's held state: every later phase sends that instance's `state_handle`).
   The instance holds a lock once its number is read, and only while the SAP session the
   envelope went out on is still the instance's: a lock read after that session ended answers
   its handle, and a write or an unlock under it is refused, sending nothing — lock again. A
   lock number never read before the next `BatchEnd` replaces the map, and a lock batch whose
   `BatchEnd` failed, leave locks in SAP that no handle reaches: they last until that session's
   logoff (stdio: the process's end; Streamable HTTP: the pooled instance's end; or SAP's own
   session timeout). An unlock number is read the same way: the instance drops the handle from its
   held locks when that number is read, so an unlock number never read leaves the handle held after
   SAP unlocked it — a later write under that handle is sent and SAP refuses it, where a read
   unlock makes the instance refuse it at once, sending nothing — and over Streamable HTTP the
   pooled instance stays held for a lock that no longer exists, until the instance ends and its
   session's logoff releases every lock. Read every lock number and every unlock number before the
   next phase's `BatchEnd`;
3. write — `HandlerUpdate` with `lock_handle` (for PACKAGE, DOMAIN, DATA_ELEMENT and
   FUNCTION_GROUP the whole metadata document in `source_code`, read beforehand with `HandlerGet`
   part `metadata`);
4. unlock — `HandlerUnlock`;
5. read back, check — `HandlerGet` (one part per call: `source`, `metadata`), `HandlerCheckRun`.
6. activate — `HandlerActivate`: one object of a type the per-object activation maps answers its
   verdict; a list (`objects[]`), an `object_adt_type`, PACKAGE, SERVICE_DEFINITION and
   SERVICE_BINDING start an activation run and answer `{ run_id }`;
7. the run's state, as often as you choose — `HandlerGet` `part: activation_status` with that
   `run_id` (`finished`, `error`, `failed`, or its progress), then `part: activation_results`
   for the messages it produced.

Running unit tests with the synchronous runner is one call — `HandlerUnitTestRun` with
`runner: 'sync'` (in the full sets `RunUnitTest`, `RunProgramUnitTest`, `RunFunctionGroupUnitTest`,
and `RunFunctionModuleUnitTest` with `function_group_name`, each with `runner: 'sync'`): one
`POST /sap/bc/adt/abapunit/testruns`, its answer the finished result at `BatchEnd`.
`HandlerUnitTestRun` runs every test class of each container named; a function module's run covers
every test of its group. With the asynchronous runner (`runner: 'async'`, the default) it is three
phases, each its own batch:

1. start — `HandlerUnitTestRun`, answering the run's `run_id`;
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

1. deletion check — `HandlerDeletionCheck` per object; read each verdict with `BatchAnswers`;
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
DATA_ELEMENT and FUNCTION_GROUP, `source_code` is the whole metadata document, sent byte for byte:
nothing is read before the write or after it. Locking, unlocking and activating are their own
calls (`HandlerLock`, `HandlerUnlock`, `HandlerActivate`); for `LOCAL_*`, `UNIT_TEST` and
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
DOMAIN, DATA_ELEMENT and FUNCTION_GROUP have a metadata document and no source: `source` (and an
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
`{ run_id, part, messages, document }`), each with SAP's document as it came. Asking again until the
status settles is yours: the server sets no timer.

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
already recorded, the words say so with its number — that part is sent at `BatchEnd`, and its
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
6. unlock — `HandlerUnlock` × 3;
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
run predates the map: `BatchEnd` then built every answer itself.) The objects' entries went into
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

## A system without the communication batch

The tools that read several independent things inside one call (the package walks,
`GetObjectInfo`, `SearchSource`, `GetIncludesList`, `GetStructuresList`, `GetEnhancements`,
`ListTransports`, `DescribeByList`, `GetAbapSystemSymbols`, `GetWhereUsed`, `RuntimeListFeeds`)
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

`BatchEnd` corrects nothing: a recorded call's `406`/`415` is its answer (see "Credentials and
failures").

The members, their default pairs and the correction in full:
[Request headers](../architecture/REQUEST_HEADERS.md).

## Over Streamable HTTP

Every HTTP request is an MCP session of its own, served by a pooled server instance. Send the
`state_handle` `BatchBegin` answers as the `state_handle` argument on every call of the batch,
`BatchEnd` and `BatchAnswers` included — every tool of the Streamable HTTP binaries declares that
optional argument — or, from a client that sets headers, in the `x-mcp-state-handle` request
header: the pool routes the call to the instance that holds the batch, one request at a time, in
the order they arrive. A call without the handle reaches an instance where no batch is open. A tool call whose handle the pool does not know — one
that never existed, or whose state ended — is answered `state is not available` by the pool itself,
before any instance is made and with nothing logged on; a JSON-RPC array holding a tool call is
answered the same, one such answer per request in it that has an `id` (an array whose tool call
carries a `state_handle` argument is answered `400`: "a JSON-RPC batch cannot carry
state_handle"). When both the header and the argument are sent, the header wins. The handle is
a bearer secret: whoever holds it reaches the batch. A client that leaves during `BatchEnd` does
not stop it: the map is kept for the next `BatchAnswers` with the handle.

**Batches inside a long session.** A long session (`SessionOpen`; compact `HandlerSession`
`action: 'open'`) keeps one instance and its SAP session across calls, and its `state_handle` is
the instance's: `BatchBegin` on it answers that same handle, and the phases (lock, write, unlock)
all run on that one SAP session. The session tools run at once and are never recorded, in a
communication batch and in a debugger batch alike: `SessionOpen` leaves an open batch open;
`SessionClose` closes the instance, which drops an open batch and its answers with nothing sent
and logs off the SAP session (which releases its locks); its answer names what was held
(`"batch": true`). On stdio and SSE nothing is needed: the batch is the process's
(stdio) or the connection's (SSE).

## Credentials and failures

`BatchEnd` sends on the instance's connection as it is at that moment, with the credential in
force then; it holds that connection for the whole send. A credential refusal — refused before
SAP was asked, or SAP's `401` the credential could not renew — ends `BatchEnd` and reaches the
caller as it came; there is no map, and every number read answers the same refusal. If
`BatchEnd` fails before anything is sent (taking the connection, the system lookup), batch mode
ends too, there is no map, and every number read answers that failure.

A part SAP answered `401`, `406` or `415` is that call's answer, as any other failure: in batch
mode nothing recorded is corrected and sent again.

## Raw parts

With `--batch-keep-raw-parts` (`MCP_BATCH_KEEP_RAW_PARTS`, YAML `batch.keepRawParts`; default
off) each answer also carries SAP's raw parts of its call's requests, in the order sent:
`{ status, status_text, headers, body }`, `body` `""` when a part had none. A number of a batch
whose `BatchEnd` failed answers that error alone, with no raw part.

## Which calls are recorded

<!-- batch-handlers:start -->

175 entries, rendered from `tools/batch-handlers.json`. A tool that is not listed is refused in batch mode. A `-ro` binary serves an entry when it serves the tool.

### Full sets (`mcp-abap-adt`, `-http`, `-sse`, and their `-ro` binaries for the reads)

| Tool | Recorded | Sends |
|---|---|---|
| `ActivateBehaviorDefinition` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateClass` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateDataElement` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateDdl` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateDomain` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateFunctionGroup` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateFunctionModule` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateInterface` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateMetadataExtension` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateProgram` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateServiceBinding` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateServiceDefinition` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateStructure` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `ActivateTable` | every call | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object |
| `AddTransportObject` | every call | PUT /sap/bc/adt/cts/transportrequests/{number} with the object |
| `CheckBehaviorDefinition` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckClass` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckDataElement` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckDdl` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckDomain` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckFunctionGroup` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckFunctionModule` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckInterface` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckMetadataExtension` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckPackage` | every call | POST /sap/bc/adt/checkruns for the package |
| `CheckProgram` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckStructure` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CheckTable` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object |
| `CreateBehaviorImplementation` | every call | POST /sap/bc/adt/oo/classes: the create alone |
| `CreateClass` | every call | POST /sap/bc/adt/oo/classes: the create alone |
| `CreateDdl` | every call | POST /sap/bc/adt/ddic/ddl/sources: the create alone |
| `CreateFunctionGroup` | when activate is false | POST /sap/bc/adt/functions/groups: the create alone (nothing activated) |
| `CreateFunctionInclude` | every call | POST /sap/bc/adt/functions/groups/{group}/includes: the create alone |
| `CreateFunctionModule` | every call | POST /sap/bc/adt/functions/groups/{group}/fmodules: the create alone |
| `CreateInterface` | every call | POST /sap/bc/adt/oo/interfaces: the create alone |
| `CreateMessageClass` | every call | POST /sap/bc/adt/messageclass: the create alone |
| `CreatePackage` | when the connection is HTTP | POST /sap/bc/adt/packages; over RFC the create runs in an ABAP session of its own, outside the batch |
| `CreateProgram` | every call | POST /sap/bc/adt/programs/programs: the create alone |
| `CreateServiceBinding` | when activate is false | POST /sap/bc/adt/businessservices/bindings: the create alone (nothing activated) |
| `CreateServiceDefinition` | when activate is false and source_code is absent | POST /sap/bc/adt/ddic/srvd/sources: the create alone (no source written, nothing activated) |
| `CreateTable` | every call | POST /sap/bc/adt/ddic/tables: the create alone |
| `CreateTransport` | every call | POST /sap/bc/adt/cts/transportrequests |
| `CreateTransportTask` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/tasks |
| `GetAdtTypes` | every call | GET /sap/bc/adt/repository/informationsystem/objecttypes?maxItemCount=999&name=*&data=usedByProvider |
| `GetATCFindings` | every call | GET /sap/bc/adt/atc/worklists/{id}?includeExemptedFindings=false |
| `GetATCRunStatus` | every call | GET /sap/bc/adt/atc/runs/{id} |
| `GetBehaviorDefinition` | every call | one request: GET /sap/bc/adt/bo/behaviordefinitions/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/bo/behaviordefinitions/{name} (part metadata) |
| `GetBehaviorDefinitionVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetBehaviorDefinitionVersions` | every call | GET /sap/bc/adt/bo/behaviordefinitions/{name}/source/main/versions |
| `GetBehaviorDefinitionVersionSource` | every call | GET the content_uri given |
| `GetBehaviorImplementation` | every call | one request: GET /sap/bc/adt/oo/classes/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/oo/classes/{name} (part metadata) |
| `GetClass` | every call | one request: GET /sap/bc/adt/oo/classes/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/oo/classes/{name} (part metadata) |
| `GetClassVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetClassVersions` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/main/versions |
| `GetClassVersionSource` | every call | GET the content_uri given |
| `GetDataElement` | every call | GET /sap/bc/adt/ddic/dataelements/{name} |
| `GetDdl` | every call | one request: GET /sap/bc/adt/ddic/ddl/sources/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/ddic/ddl/sources/{name} (part metadata) |
| `GetDdlVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetDdlVersions` | every call | GET /sap/bc/adt/ddic/ddl/sources/{name}/versions |
| `GetDdlVersionSource` | every call | GET the content_uri given |
| `GetDomain` | every call | GET /sap/bc/adt/ddic/domains/{name} |
| `GetEnhancements` | when object_type is one of CLASS, CLAS, CLAS/OC, FUNCTION_GROUP, FUNCTIONGROUP, FUGR, FUGR/F, PROGRAM, PROG, PROG/P and include_nested is any value but true | GET {object uri}/source/main/enhancements/elements for a class, program or function group named by its type (any other type is resolved by probing metadata first, so it is not listed) |
| `GetFunctionGroup` | every call | GET /sap/bc/adt/functions/groups/{name} |
| `GetFunctionInclude` | every call | one request: GET /sap/bc/adt/functions/groups/{group}/includes/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/functions/groups/{group}/includes/{name} (part metadata) |
| `GetFunctionModule` | every call | one request at the group given: GET /sap/bc/adt/functions/groups/{group}/fmodules/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/functions/groups/{group}/fmodules/{name} (part metadata) |
| `GetFunctionModuleVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetFunctionModuleVersions` | every call | GET /sap/bc/adt/functions/groups/{group}/fmodules/{name}/source/main/versions |
| `GetFunctionModuleVersionSource` | every call | GET the content_uri given |
| `GetInactiveObjects` | every call | GET /sap/bc/adt/activation/inactiveobjects |
| `GetInclude` | every call | GET /sap/bc/adt/programs/includes/{name}/source/main |
| `GetInterface` | every call | one request: GET /sap/bc/adt/oo/interfaces/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/oo/interfaces/{name} (part metadata) |
| `GetInterfaceVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetInterfaceVersions` | every call | GET /sap/bc/adt/oo/interfaces/{name}/source/main/versions |
| `GetInterfaceVersionSource` | every call | GET the content_uri given |
| `GetLocalDefinitions` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/definitions?version=active |
| `GetLocalMacros` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/macros?version=active |
| `GetLocalTestClass` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/testclasses?version=active |
| `GetLocalTypes` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/implementations?version=active |
| `GetMessageClass` | every call | GET /sap/bc/adt/messageclass/{name} |
| `GetMessageClassMessage` | every call | GET /sap/bc/adt/messageclass/{name}, the message picked from it locally |
| `GetMetadataExtension` | every call | one request: GET /sap/bc/adt/ddic/ddlx/sources/{name}/source/main (part source, the default), or GET /sap/bc/adt/ddic/ddlx/sources/{name} (part metadata) |
| `GetMetadataExtensionVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetMetadataExtensionVersions` | every call | GET /sap/bc/adt/ddic/ddlx/sources/{name}/source/main/versions |
| `GetMetadataExtensionVersionSource` | every call | GET the content_uri given |
| `GetObjectsByType` | every call | POST /sap/bc/adt/repository/nodestructure for the one node asked |
| `GetObjectStructure` | every call | GET /sap/bc/adt/repository/objectstructure?objecttype=…&objectname=… |
| `GetObjectVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetObjectVersions` | every call | GET the versions feed of the object (…/versions) |
| `GetObjectVersionSource` | every call | GET the content_uri given |
| `GetPackage` | every call | GET /sap/bc/adt/packages/{name}?version=active |
| `GetProgram` | every call | one request: GET /sap/bc/adt/programs/programs/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/programs/programs/{name} (part metadata) |
| `GetProgramVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetProgramVersions` | every call | GET /sap/bc/adt/programs/programs/{name}/source/main/versions |
| `GetProgramVersionSource` | every call | GET the content_uri given |
| `GetServiceBinding` | every call | one request: GET /sap/bc/adt/businessservices/bindings/{name}, the binding document (part source, the default) or its metadata document (part metadata) |
| `GetServiceDefinition` | every call | one request: GET /sap/bc/adt/ddic/srvd/sources/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/ddic/srvd/sources/{name} (part metadata) |
| `GetSqlQuery` | every call | POST /sap/bc/adt/datapreview/freestyle?rowNumber=N with the SQL as the body |
| `GetStructure` | every call | one request: GET /sap/bc/adt/ddic/structures/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/ddic/structures/{name} (part metadata) |
| `GetStructureVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetStructureVersions` | every call | GET /sap/bc/adt/ddic/structures/{name}/source/main/versions |
| `GetStructureVersionSource` | every call | GET the content_uri given |
| `GetTable` | every call | one request: GET /sap/bc/adt/ddic/tables/{name}/source/main?version=active (part source, the default), or GET /sap/bc/adt/ddic/tables/{name} (part metadata) |
| `GetTableContents` | every call | POST /sap/bc/adt/datapreview/freestyle?rowNumber=N with SELECT * FROM the table as the body |
| `GetTableVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetTableVersions` | every call | GET /sap/bc/adt/ddic/tables/{name}/source/main/versions |
| `GetTableVersionSource` | every call | GET the content_uri given |
| `GetTransport` | every call | GET /sap/bc/adt/cts/transportrequests/{number}?includeObjects=…&includeTasks=… |
| `GetWhereUsed` | when enable_all_types is any value but true and enable_only_types is absent and disable_types is absent and objects is absent | POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=… with the default scope (a type filter reads the scope first, so none is given) |
| `ListServiceBindingTypes` | every call | GET /sap/bc/adt/businessservices/bindings/bindingtypes |
| `MoveTransportObjects` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/moveobjects with all the objects given |
| `ReadTransportActionLog` | every call | GET /sap/bc/adt/cts/transportrequests/{number}/actionlogs |
| `ReadTransportObjects` | every call | GET /sap/bc/adt/cts/transportrequests/{number} |
| `RemoveTransportObject` | every call | PUT /sap/bc/adt/cts/transportrequests/{number} without the object |
| `RunFunctionGroupUnitTest` | when runner is sync | POST /sap/bc/adt/abapunit/testruns: runs every test class of the function group and answers the finished result |
| `RunFunctionModuleUnitTest` | when runner is sync and function_group_name is given | POST /sap/bc/adt/abapunit/testruns at the module under its function group: runs every test of the group and answers the finished result |
| `RunProgramUnitTest` | when runner is sync | POST /sap/bc/adt/abapunit/testruns: runs every test class of the report and answers the finished result |
| `RuntimeAnalyzeProfilerTrace` | every call | GET …/abaptraces/{id}/hitlist or /statements, summarised locally |
| `RuntimeCreateProfilerTraceParameters` | every call | POST /sap/bc/adt/runtime/traces/abaptraces/parameters |
| `RuntimeGetDumpById` | every call | GET /sap/bc/adt/runtime/dump/{id} (the view asked) |
| `RuntimeGetGatewayErrorLog` | every call | GET /sap/bc/adt/gw/errorlog, or the error_url given |
| `RuntimeGetProfilerTraceData` | every call | GET …/runtime/traces/abaptraces/{id}/hitlist, /statements or /dbAccesses |
| `RuntimeListFeeds` | when feed_type is one of descriptors, variants (absent reads as descriptors) and feed_types is absent | GET /sap/bc/adt/feeds (descriptors, or the variants read from the same list; the dumps, system messages and gateway errors feeds are read page by page, so they are not listed) |
| `RuntimeListProfilerTraceFiles` | every call | GET /sap/bc/adt/runtime/traces/abaptraces |
| `RuntimeListSystemMessages` | every call | GET /sap/bc/adt/runtime/systemmessages |
| `RuntimeRunClass` | when profile is any value but true | POST /sap/bc/adt/oo/classrun/{name} (without profile: with it the trace is also scheduled and listed) |
| `RuntimeRunProgram` | when profile is any value but true | POST /sap/bc/adt/programs/programrun/{name} (without profile: with it the trace is scheduled first) |
| `RunUnitTest` | when runner is sync | POST /sap/bc/adt/abapunit/testruns: runs every test class of the class and answers the finished result |
| `SearchObject` | every call | GET /sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=…&maxResults=…[&objectType=…] |
| `SortAndCompressTransportTask` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/sortandcompress |
| `ValidateServiceBinding` | every call | POST /sap/bc/adt/cts/transportchecks |

### Compact sets (`mcp-abap-adt-compact`, `-compact-http`, `-compact-sse`, and their `-ro` binaries for the reads)

| Tool | Recorded | Sends |
|---|---|---|
| `HandlerActivate` | when objects is absent and object_adt_type is absent and object_type is one of DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, BEHAVIOR_DEFINITION, METADATA_EXTENSION | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object (a type the per-object activation maps) |
| `HandlerActivate` | when objects is given | one request: POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=… for the objects listed, answering { run_id } (one object of a type the per-object activation maps: POST /sap/bc/adt/activation?method=activate) |
| `HandlerActivate` | when objects is absent and object_adt_type is given | one request: POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=… for the one object, answering { run_id } (a code the per-object activation maps: POST /sap/bc/adt/activation?method=activate) |
| `HandlerActivate` | when objects is absent and object_adt_type is absent and object_type is one of PACKAGE, SERVICE_DEFINITION, SERVICE_BINDING | POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=true for the one object, answering { run_id } |
| `HandlerCdsUnitTestResult` | when run_id is given | GET /sap/bc/adt/abapunit/results/{run_id}[?withNavigationUris=false] |
| `HandlerCdsUnitTestStatus` | every call | GET /sap/bc/adt/abapunit/runs/{id}?withLongPolling=true |
| `HandlerCheckRun` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object (/checkruns for a package) |
| `HandlerCreate` | when object_type is one of DOMAIN, DATA_ELEMENT, TRANSPORT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | POST the create request of the type's create() alone ({collection uri}[?corrNr=…]) — no validate, lock, write, unlock, check or activate |
| `HandlerCreate` | when object_type is PACKAGE and the connection is HTTP | POST /sap/bc/adt/packages[?corrNr=…], the package create alone; over RFC a package is created in an ABAP session of its own, outside the batch |
| `HandlerDelete` | when object_type is one of PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | the deletion request alone: POST /sap/bc/adt/deletion/delete (a metadata extension: DELETE /sap/bc/adt/ddic/ddlx/sources/{name}[?corrNr=…]) |
| `HandlerDelete` | when lock_handle is given and object_type is one of LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST | PUT of empty content to the class include under the lock_handle given ({class uri}/includes/{include}?lockHandle=…[&corrNr=…]) |
| `HandlerDeletionCheck` | every call | POST /sap/bc/adt/deletion/check for the one object |
| `HandlerDumpList` | every call | GET /sap/bc/adt/runtime/dumps (feed_type system_messages: /sap/bc/adt/runtime/systemmessages; gateway_errors: /sap/bc/adt/gw/errorlog) with $top (1 to 100), to, from and the dump filters: one page, SAP's next link answered as next_to |
| `HandlerDumpView` | every call | GET /sap/bc/adt/runtime/dump/{id} (the view asked) |
| `HandlerGet` | when part is source (absent reads as source) and object_type is one of TRANSPORT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, PROGRAM, INTERFACE, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | one request: GET the type's source (as the full set's Get<Type>, part source); FUNCTION_MODULE at the group its arguments name |
| `HandlerGet` | when part is metadata and object_type is one of PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, PROGRAM, INTERFACE, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | one request: GET the type's metadata document (as the full set's Get<Type>, part metadata); FUNCTION_MODULE at the group its arguments name |
| `HandlerGet` | when part is object_structure | GET /sap/bc/adt/repository/objectstructure?objecttype=…&objectname=… |
| `HandlerGet` | when part is node_structure and object_adt_type is given | POST /sap/bc/adt/repository/nodestructure for the one node asked |
| `HandlerGet` | when part is virtual_folders | POST /sap/bc/adt/repository/informationsystem/virtualfolders/contents |
| `HandlerGet` | when part is activation_status and run_id is given | GET /sap/bc/adt/activation/runs/{run_id} |
| `HandlerGet` | when part is activation_results and run_id is given | GET /sap/bc/adt/activation/results/{run_id} |
| `HandlerGet` | when part is source (absent reads as source) and object_type is one of UNIT_TEST, CDS_UNIT_TEST and run_id is given | GET /sap/bc/adt/abapunit/results/{run_id}: the run's result, part source |
| `HandlerGetData` | every call | POST /sap/bc/adt/datapreview/freestyle with sql_query, or with SELECT * FROM object_name, as the body |
| `HandlerLock` | when object_type is one of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING | POST {object uri}?_action=LOCK&accessMode=MODIFY, stateful |
| `HandlerLock` | when object_type is PACKAGE and the connection is HTTP | POST /sap/bc/adt/packages/{name}?_action=LOCK&accessMode=MODIFY, stateful; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerProfileList` | every call | GET /sap/bc/adt/runtime/traces/abaptraces |
| `HandlerProfileRun` | every call | POST /sap/bc/adt/oo/classrun/{name} or /sap/bc/adt/programs/programrun/{name}; with profiler_id, ?profilerId={profiler_id} |
| `HandlerProfileSchedule` | every call | POST /sap/bc/adt/runtime/traces/abaptraces/parameters: schedules a trace and answers its profiler_id |
| `HandlerProfileView` | every call | GET …/runtime/traces/abaptraces/{id}/hitlist, /statements or /dbAccesses (mode analyze: summarised locally) |
| `HandlerSearch` | every call | GET /sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=…&maxResults=…[&objectType=…] |
| `HandlerServiceBindingListTypes` | every call | GET /sap/bc/adt/businessservices/bindings/bindingtypes |
| `HandlerServiceBindingValidate` | every call | POST /sap/bc/adt/cts/transportchecks |
| `HandlerTransportCreate` | every call | POST /sap/bc/adt/cts/transportrequests |
| `HandlerTransportMoveObjects` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/moveobjects with all the objects given |
| `HandlerTransportSortAndCompress` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/sortandcompress |
| `HandlerUnitTestResult` | when run_id is given | GET /sap/bc/adt/abapunit/results/{run_id}[?withNavigationUris=false] |
| `HandlerUnitTestRun` | when runner is sync | POST /sap/bc/adt/abapunit/testruns: runs every test class of each container named and answers the finished result |
| `HandlerUnitTestRun` | when runner is async (absent reads as async) | POST /sap/bc/adt/abapunit/runs: starts the run and answers its id; the result is read with HandlerUnitTestStatus / HandlerUnitTestResult |
| `HandlerUnitTestStatus` | every call | GET /sap/bc/adt/abapunit/runs/{id}?withLongPolling=true |
| `HandlerUnlock` | when object_type is one of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING | POST {object uri}?_action=UNLOCK&lockHandle=…, stateful |
| `HandlerUnlock` | when object_type is PACKAGE and the connection is HTTP | POST /sap/bc/adt/packages/{name}?_action=UNLOCK&lockHandle=…, stateful; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerUpdate` | when lock_handle is given and object_type is one of DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST, PROGRAM, INTERFACE, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | one request under the lock_handle given: PUT of the source, the class include or the metadata document as given ({object uri}…?lockHandle=…[&corrNr=…]); for SERVICE_BINDING its publication request |
| `HandlerUpdate` | when lock_handle is given and object_type is PACKAGE and the connection is HTTP | PUT /sap/bc/adt/packages/{name}?lockHandle=…[&corrNr=…], the metadata document as given; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerValidate` | every call | POST the type's validation endpoint (…/validation?objname=…, /cts/transportchecks for a service binding) |
| `HandlerWhereUsed` | every call | POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=… with the default scope |

<!-- batch-handlers:end -->
