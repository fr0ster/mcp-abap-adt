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

## The flow

1. **`BatchBegin`** switches the server into batch mode. It sends nothing and answers
   `{ "batch": "on", "state_handle": "…" }`.
2. **Recording.** From now on, a call of a tool none of whose requests depends on another's
   answer is recorded and answers nothing (an empty content). Every recorded call is numbered,
   in the order made, from 1 — one number per call, covering every request it put into the
   batch (`GetObjectVersionDiff` sends its two version reads together, under its one number).
   A call refused, or one whose handler refused its arguments before sending anything, takes no
   number. A batch holds one kind of request — LOCK, UNLOCK or stateless — and its first recorded
   call decides which; a call of another kind is refused `batch_other_kind` (see Phases).
3. **`BatchEnd`** sends every recorded call, in one envelope, with the credentials in force now, and
   leaves batch mode whatever happens. Nothing is sent twice and nothing is retried. It answers
   `{ "recorded": <count>, "failed": [<numbers>] }` — a number fails when its answer is an error
   — and, when the envelope itself failed, `came` beside it: what came for that failure (the
   error as it is, with its `step`).
4. **`BatchAnswers`** reads the answers by number: `number` (one) or `numbers` (a list, answered
   in the order given). Each answer is the answer the tool gives for that call outside batch
   mode, built from what SAP answered when `BatchEnd` sent it — its projection of a success, the
   failure as the tool answers it, or, when the envelope failed, that failure.
   A number the last batch does not have answers `{ "number": n, "error": "no_answer", "message":
   "no answer with that number" }`.

The answers stay readable until the next `BatchEnd` replaces them (or the server instance ends),
so a phase can read the lock handles of the previous one while it is being recorded.
`BatchAnswers` is served while a batch is open; nothing else of the batch runs on a clock — the
held state's idle bound (`stateIdleMinutes`, 30 minutes by default) is the one clock that touches
it.

When the server instance ends with a batch open — the client closes its connection (stdio, an SSE
stream), the HTTP pool lets the instance go, the process shuts down — or the idle bound ends the
held state, the open batch is dropped: nothing recorded is sent, and the last batch's answers go
with it. A `BatchEnd` after the idle bound is refused `batch_mode_off`, and `BatchAnswers` answers
"no answer with that number".

## Phases

A tool that builds a request from an earlier answer cannot be recorded — a high-level create
(validate, create, lock, write, unlock, check, activate), an update that reads the metadata and
writes it back patched, a `404` fallback, a poll. Run such work as phases, each its own batch,
with the single-step tools:

1. create — `HandlerCreate` (compact);
2. lock — `HandlerLock`; read the lock handles with `BatchAnswers` (over Streamable HTTP the
   lock is the instance's held state: every later phase sends that instance's `state_handle`);
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

Running unit tests is three phases, each its own batch:

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

### A read answered `406` in an envelope

Each read in an envelope is sent with the Accept the connection's accept cache holds for its
method and URL, when it holds one. Right after a phase's envelope answers, before any answer is
read, the reads SAP answered `406` naming the types it serves go in one more envelope: only those
reads, each with the Accept its own `406` names. That Accept is kept in the connection's accept
cache — the one the correction outside a batch keeps — so a later read with the same method and
URL, in an envelope or outside one, is sent with it directly. One round: what that envelope
answers is the read's answer. A `406` that names no type, or names the Accept the read sent, is
the read's answer. `DescribeByList` answers an object whose typed search stays `406` with that
search's error, and searches without the type only after an empty or otherwise failed typed
search.

Outside a batch, the server switches adt-clients' accept correction on for every connection it
builds: a request SAP answers `406` (`415`) naming the types it serves is sent once more with
them, and the corrected type is kept in the same cache.

`BatchEnd` corrects nothing: a recorded call's `406` is its answer (see "Credentials and
failures").

### Descriptions in the batched walks

The package walks (`GetPackageContents`, compact `HandlerGet` part `contents`, `GetPackageTree`)
and `GetObjectInfo` read the node structure levels in envelopes and then the metadata of every
object found in one more envelope: one read per object, sent as that type's `Get<Type>` handler
sends its metadata read (the same URL and Accept header; a package's
`/sap/bc/adt/packages/<name>`), whose `adtcore:description` is the description in the answer.
The node structure parts' `DESCRIPTION` is not used: measured 2026-10-18, inside one envelope SAP
can answer a node structure part after the first with another part's `DESCRIPTION` (everything
else byte-identical to the request sent alone), while metadata reads in one envelope answer as
they do alone. An access control (`DCLS/DL`), which has no `Get<Type>` tool, is read as
adt-clients reads its metadata: `GET /sap/bc/adt/acm/dcl/sources/<name>?version=active`, Accept
`application/vnd.sap.adt.dclSource+xml`. An object whose metadata read fails, or of a type with no
metadata read (a class's method, a program's include, …), has no description in the batched answer.
`GetObjectsList` and `SearchSource` answer no descriptions and read no metadata; `GetIncludesList`
and `GetEnhancements` take only the include names from their node structure parts.

Measured 2026-10-18 on the system, for the types the test packages hold that had no metadata read:
each object's read sent alone, and the same read inside one envelope after three other metadata
parts and again in reverse order. The access control's answer was byte-identical in every
envelope, its `adtcore:description` equal to the one sent alone and to the node structure's. Three
types have no readable metadata: a class enhancement (`ENHO/XH`) and a classic enhancement spot
(`ENHS/XS`) answer their `OBJECT_URI` with `406` under `application/xml` and `404` under the Accept
the ADT discovery names, and an OData V4 service group (`G4BA`) answers its `OBJECT_URI` with `400`
(a required parameter missing). They get no metadata read; the node structure gave none of them a
description in the sequential answer either.
Where the destination has no communication batch, the sequential reads answer the descriptions
of the node structure, as before.

### Batched against sequential: measured 2026-10-18 on the system

`src/__tests__/integration/batch/batchedReadsTiming.test.ts`, on one on-premise system, over HTTP
and over RFC (the same system through its gateway). Each tool read "the package" (the test
config's default package) and "a larger package" (the config's super package, its subpackages
included where the tool walks them); each path three times, alternating which goes first, after
one untimed sequential read. The sequential path is a destination already marked not served (no
envelope); the batched path is a fresh destination, which learned "served" from its first
envelope. ms is the median wall time of the three; requests are the round trips (envelopes
included); parts are the requests inside the envelopes. Arguments: `GetPackageContents` with
`include_subpackages: true`; `GetPackageTree` defaults; `GetObjectsList` and `GetObjectInfo`
(`maxDepth: 5`, enriched) on `DEVC/K`; `HandlerGet` part `contents`; `SearchSource` for `DATA`.

| Tool | Package | Transport | Sequential ms | Sequential requests | Batched ms | Batched requests = envelopes | Batched parts |
|---|---|---|---:|---:|---:|---:|---:|
| GetPackageContents | the package | HTTP | 1005 | 8 | 830 | 5 | 10 |
| GetPackageContents | a larger package | HTTP | 4920 | 38 | 2398 | 5 | 114 |
| GetPackageTree | the package | HTTP | 1174 | 9 | 921 | 5 | 11 |
| GetPackageTree | a larger package | HTTP | 4986 | 39 | 2502 | 5 | 115 |
| GetObjectsList | the package | HTTP | 1240 | 10 | 531 | 3 | 10 |
| GetObjectsList | a larger package | HTTP | 1242 | 10 | 506 | 3 | 10 |
| GetObjectInfo | the package | HTTP | 1271 | 10 | 966 | 6 | 12 |
| GetObjectInfo | a larger package | HTTP | 5525 | 43 | 2654 | 6 | 119 |
| HandlerGet contents | the package | HTTP | 780 | 6 | 497 | 3 | 8 |
| HandlerGet contents | a larger package | HTTP | 762 | 6 | 701 | 3 | 17 |
| SearchSource | the package | HTTP | 1155 | 9 | 776 | 5 | 9 |
| SearchSource | a larger package | HTTP | 5850 | 69 | 1466 | 6 | 68 |
| GetPackageContents | the package | RFC | 1701 | 8 | 1172 | 5 | 10 |
| GetPackageContents | a larger package | RFC | 8036 | 38 | 2913 | 5 | 114 |
| GetPackageTree | the package | RFC | 1924 | 9 | 1157 | 5 | 11 |
| GetPackageTree | a larger package | RFC | 8297 | 39 | 2876 | 5 | 115 |
| GetObjectsList | the package | RFC | 2065 | 10 | 688 | 3 | 10 |
| GetObjectsList | a larger package | RFC | 2055 | 10 | 669 | 3 | 10 |
| GetObjectInfo | the package | RFC | 2136 | 10 | 1385 | 6 | 12 |
| GetObjectInfo | a larger package | RFC | 9112 | 43 | 2938 | 6 | 119 |
| HandlerGet contents | the package | RFC | 1278 | 6 | 721 | 3 | 8 |
| HandlerGet contents | a larger package | RFC | 1556 | 6 | 956 | 3 | 17 |
| SearchSource | the package | RFC | 1890 | 9 | 1101 | 5 | 9 |
| SearchSource | a larger package | RFC | 14370 | 69 | 1942 | 6 | 68 |

Every batched read was faster; its envelopes did not grow with the subtree (5 or 6 for the larger
package), while the sequential requests did. The batched package walks and `GetObjectInfo` send
more parts than the sequential path sends requests: the metadata read per object behind the
descriptions (above). The answers were equal but for one difference on the larger package, in
`GetPackageContents`, `GetPackageTree` and `GetObjectInfo` alike: an access control (`DCLS/DL`)
has its description in the sequential answer and none in the batched one — the "type with no
`Get<Type>` metadata read" case above. Those three cases fail the test's equality check on this
system; their timings are written before the check.

Not measured in this run: ABAP Cloud, and the tools of the internal batches not yet built.

## What is refused

While a batch is open only the batch tools and the open batch's recordable calls are served.
Every other call is answered at once with the server's refusal and takes no number:

| Code | When |
|---|---|
| `batch_not_recordable` | the tool builds a request from another's answer, sends no request at all, or is not served while a batch is open (the debugger tools, the background-run tools, the leftover-session tools, a registry's own tools) |
| `batch_other_kind` | the call's request is of another kind (LOCK, UNLOCK, stateless) than the open batch holds — its first recorded call decided it: record it in the next batch |
| `batch_no_timeout` | a long read given `timeout` in batch mode: the batch is sent at `BatchEnd`, with no deadline |
| `batch_mode_on` | `BatchBegin` while a batch is open |
| `batch_mode_other` | the debugger batch is open |
| `batch_mode_off` | `BatchEnd` with no batch open — refused before any connection is taken |
| `batch_mode_unavailable` | the host gave this server instance no batch owner (an embedder's `EmbeddableMcpServer` without `batch`) |

Every tool's description says which applies to it: it ends with one sentence — recorded, recorded
only for some arguments (which ones), refused (a request of it depends on another's answer), or not
served in batch mode (a tool that sends no request, a debugger, background-run or leftover-session
tool, a registry's own tool: run it outside batch mode). The sentence is there where the server
instance has a batch owner.

## Over Streamable HTTP

Every HTTP request is an MCP session of its own, served by a pooled server instance. Send the
`state_handle` `BatchBegin` answers in the `x-mcp-state-handle` request header on every call of
the batch, `BatchEnd` and `BatchAnswers` included: the pool routes the call to the instance that
holds the batch, one request at a time, in the order they arrive. A call without the header (or
with a handle the pool does not know) reaches an instance where no batch is open. The header comes
first; without it the pool routes by a `tools/call`'s `state_handle` argument, which only the
debugger tools take — no batch tool takes one. The handle is a bearer secret: whoever holds it
reaches the batch. A client that leaves during `BatchEnd` does not stop it: the answers are kept
for the next `BatchAnswers` with the header. On stdio and SSE nothing is needed: the batch is the
process's (stdio) or the connection's (SSE).

## Credentials and failures

`BatchEnd` sends on the instance's connection as it is at that moment, with the credential in
force then; it holds that connection for the whole send. A credential refusal ends `BatchEnd` and
reaches the caller as it came; every recorded call's answer is what it met. If `BatchEnd` fails
before anything is sent (taking the connection, the system lookup), batch mode ends too, and every
recorded call's answer is that failure.

A part SAP answered `401`, `406` or `415` is that call's answer, as any other failure: in batch
mode nothing recorded is corrected and sent again.

## Raw parts

With `--batch-keep-raw-parts` (`MCP_BATCH_KEEP_RAW_PARTS`, YAML `batch.keepRawParts`; default
off) each answer also carries SAP's raw parts of its call's requests, in the order sent:
`{ status, status_text, headers, body }`, `body` `""` when a part had none. A request not sent has
no raw part.

## Which calls are recorded

<!-- batch-handlers:start -->

170 entries, rendered from `tools/batch-handlers.json`. A tool that is not listed is refused in batch mode. A `-ro` binary serves an entry when it serves the tool.

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
| `CreateServiceDefinition` | when activate is false and source_code is not given | POST /sap/bc/adt/ddic/srvd/sources: the create alone (no source written, nothing activated) |
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
| `GetEnhancements` | when object_type is one of CLASS, CLAS, CLAS/OC, FUNCTION_GROUP, FUNCTIONGROUP, FUGR, FUGR/F, PROGRAM, PROG, PROG/P and include_nested is not true | GET {object uri}/source/main/enhancements/elements for a class, program or function group named by its type (any other type is resolved by probing metadata first, so it is not listed) |
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
| `GetTableContents` | every call | POST /sap/bc/adt/datapreview/ddic?rowNumber=N&ddicEntityName=… |
| `GetTableVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetTableVersions` | every call | GET /sap/bc/adt/ddic/tables/{name}/source/main/versions |
| `GetTableVersionSource` | every call | GET the content_uri given |
| `GetTransport` | every call | GET /sap/bc/adt/cts/transportrequests/{number}?includeObjects=…&includeTasks=… |
| `GetWhereUsed` | when enable_all_types is not true and enable_only_types is not given and disable_types is not given and objects is not given | POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=… with the default scope (a type filter reads the scope first, so none is given) |
| `ListServiceBindingTypes` | every call | GET /sap/bc/adt/businessservices/bindings/bindingtypes |
| `MoveTransportObjects` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/moveobjects with all the objects given |
| `ReadTransportActionLog` | every call | GET /sap/bc/adt/cts/transportrequests/{number}/actionlogs |
| `ReadTransportObjects` | every call | GET /sap/bc/adt/cts/transportrequests/{number} |
| `RemoveTransportObject` | every call | PUT /sap/bc/adt/cts/transportrequests/{number} without the object |
| `RuntimeAnalyzeProfilerTrace` | every call | GET …/abaptraces/{id}/hitlist or /statements, summarised locally |
| `RuntimeCreateProfilerTraceParameters` | every call | POST /sap/bc/adt/runtime/traces/abaptraces/parameters |
| `RuntimeGetDumpById` | every call | GET /sap/bc/adt/runtime/dump/{id} (the view asked) |
| `RuntimeGetGatewayErrorLog` | every call | GET /sap/bc/adt/gw/errorlog, or the error_url given |
| `RuntimeGetProfilerTraceData` | every call | GET …/runtime/traces/abaptraces/{id}/hitlist, /statements or /dbAccesses |
| `RuntimeListFeeds` | when feed_type is one of descriptors, variants (absent reads as descriptors) and feed_types is not given | GET /sap/bc/adt/feeds (descriptors, or the variants read from the same list; the dumps, system messages and gateway errors feeds are read page by page, so they are not listed) |
| `RuntimeListProfilerTraceFiles` | every call | GET /sap/bc/adt/runtime/traces/abaptraces |
| `RuntimeListSystemMessages` | every call | GET /sap/bc/adt/runtime/systemmessages |
| `RuntimeRunClass` | when profile is not true | POST /sap/bc/adt/oo/classrun/{name} (without profile: with it the trace is also scheduled and listed) |
| `RuntimeRunProgram` | when profile is not true | POST /sap/bc/adt/programs/programrun/{name} (without profile: with it the trace is scheduled first) |
| `SearchObject` | every call | GET /sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=…&maxResults=…[&objectType=…] |
| `SortAndCompressTransportTask` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/sortandcompress |
| `ValidateServiceBinding` | every call | POST /sap/bc/adt/cts/transportchecks |

### Compact sets (`mcp-abap-adt-compact`, `-compact-http`, `-compact-sse`, and their `-ro` binaries for the reads)

| Tool | Recorded | Sends |
|---|---|---|
| `HandlerActivate` | when objects is not given and object_adt_type is not given and object_type is one of DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, BEHAVIOR_DEFINITION, METADATA_EXTENSION | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object (a type the per-object activation maps) |
| `HandlerActivate` | when objects is given | one request: POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=… for the objects listed, answering { run_id } (one object of a type the per-object activation maps: POST /sap/bc/adt/activation?method=activate) |
| `HandlerActivate` | when objects is not given and object_adt_type is given | one request: POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=… for the one object, answering { run_id } (a code the per-object activation maps: POST /sap/bc/adt/activation?method=activate) |
| `HandlerActivate` | when objects is not given and object_adt_type is not given and object_type is one of PACKAGE, SERVICE_DEFINITION, SERVICE_BINDING | POST /sap/bc/adt/activation/runs?method=activate&preauditRequested=true for the one object, answering { run_id } |
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
| `HandlerGetData` | every call | POST /sap/bc/adt/datapreview/freestyle (sql_query) or /datapreview/ddic (object_name) |
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
| `HandlerUnitTestRun` | every call | POST /sap/bc/adt/abapunit/runs: starts the run and answers its id; the result is read with HandlerUnitTestStatus / HandlerUnitTestResult |
| `HandlerUnitTestStatus` | every call | GET /sap/bc/adt/abapunit/runs/{id}?withLongPolling=true |
| `HandlerUnlock` | when object_type is one of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING | POST {object uri}?_action=UNLOCK&lockHandle=…, stateful |
| `HandlerUnlock` | when object_type is PACKAGE and the connection is HTTP | POST /sap/bc/adt/packages/{name}?_action=UNLOCK&lockHandle=…, stateful; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerUpdate` | when lock_handle is given and object_type is one of DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST, PROGRAM, INTERFACE, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | one request under the lock_handle given: PUT of the source, the class include or the metadata document as given ({object uri}…?lockHandle=…[&corrNr=…]); for SERVICE_BINDING its publication request |
| `HandlerUpdate` | when lock_handle is given and object_type is PACKAGE and the connection is HTTP | PUT /sap/bc/adt/packages/{name}?lockHandle=…[&corrNr=…], the metadata document as given; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerValidate` | every call | POST the type's validation endpoint (…/validation?objname=…, /cts/transportchecks for a service binding) |
| `HandlerWhereUsed` | every call | POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=… with the default scope |

<!-- batch-handlers:end -->
