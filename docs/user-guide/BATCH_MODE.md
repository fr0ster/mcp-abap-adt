# Batch Mode

Batch mode records tool calls instead of sending them, then sends all of them at once, in ADT
batch envelopes (`multipart/mixed`), and answers each call by its number. It is for work whose
requests do not depend on each other: reading twenty objects, locking ten, writing ten sources
under the locks already held, unlocking them. One envelope round trip replaces many.

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
   batch (a `Read<Type>` sends its source and its metadata together, under its one number).
   A call refused, or one whose handler refused its arguments before sending anything, takes no
   number.
3. **`BatchEnd`** sends every recorded call, in envelopes, with the credentials in force now, and
   leaves batch mode whatever happens. Nothing is sent twice and nothing is retried. It answers
   `{ "recorded": <count>, "failed": [<numbers>] }` — a number fails when its answer is an error
   — and, when the envelopes themselves failed, `came` beside it: what came for that failure (the
   error as it is, with its `step`).
4. **`BatchAnswers`** reads the answers by number: `number` (one) or `numbers` (a list, answered
   in the order given). Each answer is the answer the tool gives for that call outside batch
   mode, built from what SAP answered when `BatchEnd` sent it — its projection of a success, the
   failure as the tool answers it, or why the request was not sent (an earlier envelope failed).
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

1. lock — `HandlerLock`; read the lock handles with `BatchAnswers`;
2. write — `HandlerUpdate` with `lock_handle`;
3. unlock — `HandlerUnlock`;
4. read back, check — `HandlerGet`, `HandlerCheckRun`.

Only LOCK and UNLOCK go stateful, in their own envelopes, as adt-clients sends them; everything
else is stateless.

## What is refused

While a batch is open only the batch tools and the open batch's recordable calls are served.
Every other call is answered at once with the server's refusal and takes no number:

| Code | When |
|---|---|
| `batch_not_recordable` | the tool builds a request from another's answer, sends no request at all, or is not served while a batch is open (the debugger tools, the background-run tools, the leftover-session tools, a registry's own tools) |
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
| `GetBehaviorDefinition` | every call | GET /sap/bc/adt/bo/behaviordefinitions/{name}/source/main?version=active |
| `GetBehaviorDefinitionVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetBehaviorDefinitionVersions` | every call | GET /sap/bc/adt/bo/behaviordefinitions/{name}/source/main/versions |
| `GetBehaviorDefinitionVersionSource` | every call | GET the content_uri given |
| `GetBehaviorImplementation` | every call | GET /sap/bc/adt/oo/classes/{name}/source/main?version=active |
| `GetClass` | every call | GET /sap/bc/adt/oo/classes/{name}/source/main?version=active |
| `GetClassVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetClassVersions` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/main/versions |
| `GetClassVersionSource` | every call | GET the content_uri given |
| `GetDataElement` | every call | GET /sap/bc/adt/ddic/dataelements/{name} |
| `GetDdl` | every call | GET /sap/bc/adt/ddic/ddl/sources/{name}/source/main?version=active |
| `GetDdlVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetDdlVersions` | every call | GET /sap/bc/adt/ddic/ddl/sources/{name}/versions |
| `GetDdlVersionSource` | every call | GET the content_uri given |
| `GetDomain` | every call | GET /sap/bc/adt/ddic/domains/{name} |
| `GetEnhancements` | when object_type is one of CLASS, CLAS, CLAS/OC, FUNCTION_GROUP, FUNCTIONGROUP, FUGR, FUGR/F, PROGRAM, PROG, PROG/P and include_nested is not true | GET {object uri}/source/main/enhancements/elements for a class, program or function group named by its type (any other type is resolved by probing metadata first, so it is not listed) |
| `GetFunctionGroup` | every call | GET /sap/bc/adt/functions/groups/{name} |
| `GetFunctionModuleVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetFunctionModuleVersions` | every call | GET /sap/bc/adt/functions/groups/{group}/fmodules/{name}/source/main/versions |
| `GetFunctionModuleVersionSource` | every call | GET the content_uri given |
| `GetInactiveObjects` | every call | GET /sap/bc/adt/activation/inactiveobjects |
| `GetInclude` | every call | GET /sap/bc/adt/programs/includes/{name}/source/main |
| `GetInterface` | every call | GET /sap/bc/adt/oo/interfaces/{name}/source/main?version=active |
| `GetInterfaceVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetInterfaceVersions` | every call | GET /sap/bc/adt/oo/interfaces/{name}/source/main/versions |
| `GetInterfaceVersionSource` | every call | GET the content_uri given |
| `GetLocalDefinitions` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/definitions?version=active |
| `GetLocalMacros` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/macros?version=active |
| `GetLocalTestClass` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/testclasses?version=active |
| `GetLocalTypes` | every call | GET /sap/bc/adt/oo/classes/{name}/includes/implementations?version=active |
| `GetMessageClass` | every call | GET /sap/bc/adt/messageclass/{name} |
| `GetMessageClassMessage` | every call | GET /sap/bc/adt/messageclass/{name}, the message picked from it locally |
| `GetMetadataExtension` | every call | GET /sap/bc/adt/ddic/ddlx/sources/{name}/source/main |
| `GetMetadataExtensionVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetMetadataExtensionVersions` | every call | GET /sap/bc/adt/ddic/ddlx/sources/{name}/source/main/versions |
| `GetMetadataExtensionVersionSource` | every call | GET the content_uri given |
| `GetObjectsByType` | every call | POST /sap/bc/adt/repository/nodestructure for the one node asked |
| `GetObjectStructure` | every call | GET /sap/bc/adt/repository/objectstructure?objecttype=…&objectname=… |
| `GetObjectVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetObjectVersions` | every call | GET the versions feed of the object (…/versions) |
| `GetObjectVersionSource` | every call | GET the content_uri given |
| `GetPackage` | every call | GET /sap/bc/adt/packages/{name}?version=active |
| `GetProgram` | every call | GET /sap/bc/adt/programs/programs/{name}/source/main?version=active |
| `GetProgramVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetProgramVersions` | every call | GET /sap/bc/adt/programs/programs/{name}/source/main/versions |
| `GetProgramVersionSource` | every call | GET the content_uri given |
| `GetServiceBinding` | every call | GET /sap/bc/adt/businessservices/bindings/{name} |
| `GetServiceDefinition` | every call | GET /sap/bc/adt/ddic/srvd/sources/{name}/source/main?version=active |
| `GetSqlQuery` | every call | POST /sap/bc/adt/datapreview/freestyle?rowNumber=N with the SQL as the body |
| `GetStructure` | every call | GET /sap/bc/adt/ddic/structures/{name}/source/main?version=active |
| `GetStructureVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetStructureVersions` | every call | GET /sap/bc/adt/ddic/structures/{name}/source/main/versions |
| `GetStructureVersionSource` | every call | GET the content_uri given |
| `GetTable` | every call | GET /sap/bc/adt/ddic/tables/{name}/source/main?version=active |
| `GetTableContents` | every call | POST /sap/bc/adt/datapreview/ddic?rowNumber=N&ddicEntityName=… |
| `GetTableVersionDiff` | every call | GET content_uri_from and GET content_uri_to, sent together, diffed locally |
| `GetTableVersions` | every call | GET /sap/bc/adt/ddic/tables/{name}/source/main/versions |
| `GetTableVersionSource` | every call | GET the content_uri given |
| `GetTransport` | every call | GET /sap/bc/adt/cts/transportrequests/{number}?includeObjects=…&includeTasks=… |
| `GetWhereUsed` | when enable_all_types is not true and enable_only_types is not given and disable_types is not given | POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=… with the default scope (a type filter reads the scope first, so none is given) |
| `ListServiceBindingTypes` | every call | GET /sap/bc/adt/businessservices/bindings/bindingtypes |
| `MoveTransportObjects` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/moveobjects with all the objects given |
| `ReadBehaviorDefinition` | every call | GET /sap/bc/adt/bo/behaviordefinitions/{name}/source/main and GET /sap/bc/adt/bo/behaviordefinitions/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadBehaviorImplementation` | every call | GET /sap/bc/adt/oo/classes/{name}/source/main and GET /sap/bc/adt/oo/classes/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadClass` | every call | GET /sap/bc/adt/oo/classes/{name}/source/main and GET /sap/bc/adt/oo/classes/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadDataElement` | every call | GET /sap/bc/adt/ddic/dataelements/{name} |
| `ReadDdl` | every call | GET /sap/bc/adt/ddic/ddl/sources/{name}/source/main and GET /sap/bc/adt/ddic/ddl/sources/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadDomain` | every call | GET /sap/bc/adt/ddic/domains/{name} |
| `ReadFunctionGroup` | every call | GET /sap/bc/adt/functions/groups/{name} |
| `ReadFunctionInclude` | every call | GET /sap/bc/adt/functions/groups/{group}/includes/{name}/source/main and GET /sap/bc/adt/functions/groups/{group}/includes/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadInterface` | every call | GET /sap/bc/adt/oo/interfaces/{name}/source/main and GET /sap/bc/adt/oo/interfaces/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadMessageClass` | every call | GET /sap/bc/adt/messageclass/{name} |
| `ReadMessageClassMessage` | every call | GET /sap/bc/adt/messageclass/{name}, the message picked from it locally |
| `ReadMetadataExtension` | every call | GET /sap/bc/adt/ddic/ddlx/sources/{name}/source/main and GET /sap/bc/adt/ddic/ddlx/sources/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadPackage` | every call | GET /sap/bc/adt/packages/{name}?version=active |
| `ReadProgram` | every call | GET /sap/bc/adt/programs/programs/{name}/source/main and GET /sap/bc/adt/programs/programs/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadServiceBinding` | every call | GET /sap/bc/adt/businessservices/bindings/{name} twice (the binding and its metadata), sent together: neither needs the other's answer |
| `ReadServiceDefinition` | every call | GET /sap/bc/adt/ddic/srvd/sources/{name}/source/main and GET /sap/bc/adt/ddic/srvd/sources/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadStructure` | every call | GET /sap/bc/adt/ddic/structures/{name}/source/main and GET /sap/bc/adt/ddic/structures/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadTable` | every call | GET /sap/bc/adt/ddic/tables/{name}/source/main and GET /sap/bc/adt/ddic/tables/{name} (the metadata), sent together: neither needs the other's answer |
| `ReadTransportActionLog` | every call | GET /sap/bc/adt/cts/transportrequests/{number}/actionlogs |
| `ReadTransportObjects` | every call | GET /sap/bc/adt/cts/transportrequests/{number} |
| `RemoveTransportObject` | every call | PUT /sap/bc/adt/cts/transportrequests/{number} without the object |
| `RuntimeAnalyzeProfilerTrace` | every call | GET …/abaptraces/{id}/hitlist or /statements, summarised locally |
| `RuntimeCreateProfilerTraceParameters` | every call | POST /sap/bc/adt/runtime/traces/abaptraces/parameters |
| `RuntimeGetDumpById` | every call | GET /sap/bc/adt/runtime/dump/{id} (the view asked) |
| `RuntimeGetGatewayErrorLog` | every call | GET /sap/bc/adt/gw/errorlog, or the error_url given |
| `RuntimeGetProfilerTraceData` | every call | GET …/runtime/traces/abaptraces/{id}/hitlist, /statements or /dbAccesses |
| `RuntimeListFeeds` | when feed_type is one of descriptors, variants (absent reads as descriptors) | GET /sap/bc/adt/feeds (descriptors, or the variants read from the same list; the dumps, system messages and gateway errors feeds are read page by page, so they are not listed) |
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
| `HandlerActivate` | when objects is not given and object_adt_type is not given and object_type is one of DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, BEHAVIOR_DEFINITION, METADATA_EXTENSION | POST /sap/bc/adt/activation?method=activate&preauditRequested=true for the one object (a type the per-object activation maps; objects[] and object_adt_type go through an activation run and are not listed) |
| `HandlerCdsUnitTestStatus` | every call | GET /sap/bc/adt/abapunit/runs/{id}?withLongPolling=true |
| `HandlerCheckRun` | every call | POST /sap/bc/adt/checkruns?reporters=abapCheckRun for the one object (/checkruns for a package) |
| `HandlerDumpView` | every call | GET /sap/bc/adt/runtime/dump/{id} (the view asked) |
| `HandlerGet` | when part is source (absent reads as source) and object_type is one of PACKAGE, DOMAIN, DATA_ELEMENT, TRANSPORT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, PROGRAM, INTERFACE, FUNCTION_GROUP, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | GET the type's source, or its metadata document where it has no source (as the full set's Get<Type>) |
| `HandlerGet` | when part is metadata and object_type is one of PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, PROGRAM, INTERFACE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | GET the metadata document (as ReadPackage, ReadDomain, ReadDataElement, ReadFunctionGroup); for a type with a source, the source GET and the metadata GET together, neither waiting for the other (as Read<Type>). Not FUNCTION_MODULE: its source read is built from the metadata's function group |
| `HandlerGet` | when part is object_structure | GET /sap/bc/adt/repository/objectstructure?objecttype=…&objectname=… |
| `HandlerGet` | when part is node_structure and object_adt_type is given and object_adt_type is not DEVC/K | POST /sap/bc/adt/repository/nodestructure for the one node asked (a package's blank answer is checked with a second read, so DEVC/K is not listed) |
| `HandlerGet` | when part is virtual_folders | POST /sap/bc/adt/repository/informationsystem/virtualfolders/contents |
| `HandlerGetData` | every call | POST /sap/bc/adt/datapreview/freestyle (sql_query) or /datapreview/ddic (object_name) |
| `HandlerLock` | when object_type is one of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | POST {object uri}?_action=LOCK&accessMode=MODIFY, stateful |
| `HandlerLock` | when object_type is PACKAGE and the connection is HTTP | POST /sap/bc/adt/packages/{name}?_action=LOCK&accessMode=MODIFY, stateful; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerProfileList` | every call | GET /sap/bc/adt/runtime/traces/abaptraces |
| `HandlerProfileRun` | when profiling is false | POST the class or program run (profiling false: with profiling the trace is also scheduled and listed) |
| `HandlerProfileView` | every call | GET …/runtime/traces/abaptraces/{id}/hitlist, /statements or /dbAccesses (mode analyze: summarised locally) |
| `HandlerSearch` | every call | GET /sap/bc/adt/repository/informationsystem/search?operation=quickSearch&query=…&maxResults=…[&objectType=…] |
| `HandlerServiceBindingListTypes` | every call | GET /sap/bc/adt/businessservices/bindings/bindingtypes |
| `HandlerServiceBindingValidate` | every call | POST /sap/bc/adt/cts/transportchecks |
| `HandlerTransportCreate` | every call | POST /sap/bc/adt/cts/transportrequests |
| `HandlerTransportMoveObjects` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/moveobjects with all the objects given |
| `HandlerTransportSortAndCompress` | every call | POST /sap/bc/adt/cts/transportrequests/{number}/sortandcompress |
| `HandlerUnitTestRun` | every call | POST /sap/bc/adt/abapunit/runs: starts the run and answers its id; the result is read with HandlerUnitTestStatus / HandlerUnitTestResult |
| `HandlerUnitTestStatus` | every call | GET /sap/bc/adt/abapunit/runs/{id}?withLongPolling=true |
| `HandlerUnlock` | when object_type is one of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION | POST {object uri}?_action=UNLOCK&lockHandle=…, stateful |
| `HandlerUnlock` | when object_type is PACKAGE and the connection is HTTP | POST /sap/bc/adt/packages/{name}?_action=UNLOCK&lockHandle=…, stateful; over RFC the package lock is held in an ABAP session of its own, outside the batch |
| `HandlerUpdate` | when lock_handle is given and object_type is one of TABLE, STRUCTURE, DDL, CLASS, PROGRAM, INTERFACE, FUNCTION_MODULE, BEHAVIOR_DEFINITION, METADATA_EXTENSION | PUT the source under the lock_handle given ({object uri}/source/main?lockHandle=…[&corrNr=…]) |
| `HandlerValidate` | every call | POST the type's validation endpoint (…/validation?objname=…, /cts/transportchecks for a service binding) |
| `HandlerWhereUsed` | every call | POST /sap/bc/adt/repository/informationsystem/usageReferences?uri=… with the default scope |

<!-- batch-handlers:end -->
