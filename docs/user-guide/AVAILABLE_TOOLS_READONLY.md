# Read-Only Tools - MCP ABAP ADT Server

Generated from the tool definitions the server builds (not from docs).

Exactly the tools `mcp-abap-adt-ro` serves, with the parameters they take there — taken from `fullReadOnlyToolSet`, the set the read-only binaries use. `mcp-abap-adt-sse-ro` serves them without `ListLeftoverSessions`, which is stdio's only, and `mcp-abap-adt-http-ro` the same, with what its [Streamable HTTP section](#streamable-http-binaries) adds. Nothing here changes the system: no high, run, debugger, leftover-session logoff or resume tool; the background-run tools serve the long reads, which run in the background by default. The batch tools are served here too: the reads none of whose requests depends on another's answer are recorded in batch mode. Each tool's description, as the server lists it, ends with one more sentence on batch mode — recordable, recordable for the arguments it names, or run outside batch mode; the descriptions here are the handlers' own, without it ([BATCH_MODE.md](BATCH_MODE.md) lists every recordable call). `mcp-abap-adt` serves these and more: [all tools](AVAILABLE_TOOLS.md).

- Level: Read-Only
- Total tools: 75

## Navigation

- [Read-Only Group](#read-only-group)
  - [Atc](#read-only-atc)
    - [RunATC](#runatc-read-only-atc)
    - [GetATCRunStatus](#getatcrunstatus-read-only-atc)
    - [GetATCFindings](#getatcfindings-read-only-atc)
    - [ListATCResults](#listatcresults-read-only-atc)
    - [GetATCResult](#getatcresult-read-only-atc)
  - [Background Run](#read-only-background-run)
    - [GetBackgroundRun](#getbackgroundrun-read-only-background-run)
    - [ListBackgroundRuns](#listbackgroundruns-read-only-background-run)
    - [DiscardBackgroundRun](#discardbackgroundrun-read-only-background-run)
  - [Batch](#read-only-batch)
    - [BatchBegin](#batchbegin-read-only-batch)
    - [BatchEnd](#batchend-read-only-batch)
    - [BatchAnswers](#batchanswers-read-only-batch)
  - [Behavior Definition](#read-only-behavior-definition)
    - [GetBehaviorDefinition](#getbehaviordefinition-read-only-behavior-definition)
  - [Behavior Implementation](#read-only-behavior-implementation)
    - [GetBehaviorImplementation](#getbehaviorimplementation-read-only-behavior-implementation)
  - [Class](#read-only-class)
    - [GetClass](#getclass-read-only-class)
  - [Common](#read-only-common)
    - [GetObjectVersions](#getobjectversions-read-only-common)
    - [GetObjectVersionSource](#getobjectversionsource-read-only-common)
    - [GetObjectVersionDiff](#getobjectversiondiff-read-only-common)
  - [Data Element](#read-only-data-element)
    - [GetDataElement](#getdataelement-read-only-data-element)
  - [Ddl](#read-only-ddl)
    - [GetDdl](#getddl-read-only-ddl)
  - [Domain](#read-only-domain)
    - [GetDomain](#getdomain-read-only-domain)
  - [Enhancement](#read-only-enhancement)
    - [GetEnhancements](#getenhancements-read-only-enhancement)
    - [GetEnhancementSpot](#getenhancementspot-read-only-enhancement)
    - [GetEnhancementImpl](#getenhancementimpl-read-only-enhancement)
  - [Function Group](#read-only-function-group)
    - [GetFunctionGroup](#getfunctiongroup-read-only-function-group)
  - [Function Include](#read-only-function-include)
    - [ListFunctionGroupIncludes](#listfunctiongroupincludes-read-only-function-include)
    - [ListFunctionModules](#listfunctionmodules-read-only-function-include)
    - [GetFunctionInclude](#getfunctioninclude-read-only-function-include)
  - [Function Module](#read-only-function-module)
    - [GetFunctionModule](#getfunctionmodule-read-only-function-module)
  - [Include](#read-only-include)
    - [GetInclude](#getinclude-read-only-include)
    - [GetIncludesList](#getincludeslist-read-only-include)
    - [GetMainPrograms](#getmainprograms-read-only-include)
  - [Interface](#read-only-interface)
    - [GetInterface](#getinterface-read-only-interface)
  - [Leftover Session](#read-only-leftover-session)
    - [ListLeftoverSessions](#listleftoversessions-read-only-leftover-session)
  - [Message Class](#read-only-message-class)
    - [GetMessageClass](#getmessageclass-read-only-message-class)
    - [GetMessageClassMessage](#getmessageclassmessage-read-only-message-class)
  - [Metadata Extension](#read-only-metadata-extension)
    - [GetMetadataExtension](#getmetadataextension-read-only-metadata-extension)
  - [Package](#read-only-package)
    - [GetPackageContents](#getpackagecontents-read-only-package)
    - [GetPackage](#getpackage-read-only-package)
  - [Program](#read-only-program)
    - [GetProgram](#getprogram-read-only-program)
  - [Search](#read-only-search)
    - [SearchObject](#searchobject-read-only-search)
    - [GetObjectsList](#getobjectslist-read-only-search)
    - [GetObjectsByType](#getobjectsbytype-read-only-search)
  - [Service Binding](#read-only-service-binding)
    - [GetServiceBinding](#getservicebinding-read-only-service-binding)
  - [Service Definition](#read-only-service-definition)
    - [GetServiceDefinition](#getservicedefinition-read-only-service-definition)
  - [Structure](#read-only-structure)
    - [GetStructuresList](#getstructureslist-read-only-structure)
    - [GetStructure](#getstructure-read-only-structure)
  - [System](#read-only-system)
    - [GetServiceBindingPreviewUrl](#getservicebindingpreviewurl-read-only-system)
    - [GetTypeInfo](#gettypeinfo-read-only-system)
    - [GetTransaction](#gettransaction-read-only-system)
    - [RuntimeListProfilerTraceFiles](#runtimelistprofilertracefiles-read-only-system)
    - [RuntimeGetProfilerTraceData](#runtimegetprofilertracedata-read-only-system)
    - [RuntimeGetDumpById](#runtimegetdumpbyid-read-only-system)
    - [RuntimeAnalyzeProfilerTrace](#runtimeanalyzeprofilertrace-read-only-system)
    - [RuntimeListFeeds](#runtimelistfeeds-read-only-system)
    - [RuntimeListSystemMessages](#runtimelistsystemmessages-read-only-system)
    - [RuntimeGetGatewayErrorLog](#runtimegetgatewayerrorlog-read-only-system)
    - [GetSqlQuery](#getsqlquery-read-only-system)
    - [GetWhereUsed](#getwhereused-read-only-system)
    - [GetObjectInfo](#getobjectinfo-read-only-system)
    - [GetInactiveObjects](#getinactiveobjects-read-only-system)
    - [GetAdtTypes](#getadttypes-read-only-system)
    - [GetObjectStructure](#getobjectstructure-read-only-system)
    - [GetObjectOutline](#getobjectoutline-read-only-system)
    - [GetObjectNodeFromCache](#getobjectnodefromcache-read-only-system)
    - [DescribeByList](#describebylist-read-only-system)
    - [GetPackageTree](#getpackagetree-read-only-system)
    - [SearchSource](#searchsource-read-only-system)
  - [Table](#read-only-table)
    - [GetTableContents](#gettablecontents-read-only-table)
    - [GetTable](#gettable-read-only-table)
  - [Table Type](#read-only-table-type)
    - [GetTableType](#gettabletype-read-only-table-type)
  - [Transport](#read-only-transport)
    - [GetTransport](#gettransport-read-only-transport)
    - [ListTransports](#listtransports-read-only-transport)
    - [ReadTransportObjects](#readtransportobjects-read-only-transport)
    - [ReadTransportActionLog](#readtransportactionlog-read-only-transport)
  - [Unit Test](#read-only-unit-test)
    - [GetUnitTestResult](#getunittestresult-read-only-unit-test)
- [Streamable HTTP Binaries](#streamable-http-binaries)
  - [SessionOpen](#sessionopen-streamable-http)
  - [SessionClose](#sessionclose-streamable-http)

---

<a id="read-only-group"></a>
## Read-Only Group

<a id="read-only-atc"></a>
### Read-Only / Atc

<a id="runatc-read-only-atc"></a>
#### RunATC (Read-Only / Atc)
**Description:** [read-only] Runs the ABAP Test Cockpit (ATC) checks of the check variant named by check_variant over the objects named by objects. Each object is a name and a type: class, interface, function_group, package, ddl_source, table, behavior_definition, program, program_include, function_include (with function_group, the include's function group), class_include (with include_kind: definitions, implementations, macros or testclasses; name is the class). Creates a worklist for the check variant, then starts the run. Answers worklist_id always — the run's findings are read by it, for either value of wait. With wait=false it also answers run_id, which the run's status is read by; with wait=true the server holds the request until the checks finish and answers the finding counts.

**Source:** `src/handlers/atc/high/handleRunATC.ts`

**Parameters:**
- `check_variant` (string, optional) - ATC check variant. Omitted, the system's own default variant is used.
- `max_findings` (integer, optional (default: 100)) - Cap on findings the run records (maximumVerdicts). A whole number, at least 1. Default 100.
- `objects` (array, required) - The objects to check. One run may cover several; each needs a name and a type.
- `wait` (boolean, optional (default: false)) - Hold the request until the checks finish and answer the finding counts. Default false: the run starts and answers a run_id to poll.

---

<a id="getatcrunstatus-read-only-atc"></a>
#### GetATCRunStatus (Read-Only / Atc)
**Description:** [read-only] Answers whether the ATC run named by run_id has ended (a run started with wait=false answers its run_id). Answers the status the server reports and whether it is finished — finished means ended, whatever the checks found. The run's findings are read by its worklist_id.

**Source:** `src/handlers/atc/high/handleGetATCRunStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier an ATC run started with wait=false answered.

---

<a id="getatcfindings-read-only-atc"></a>
#### GetATCFindings (Read-Only / Atc)
**Description:** [read-only] Reads the findings of the ATC run whose worklist is named by worklist_id, for a run started with wait=true or wait=false. Answers each finding with the object, the source position (location and line), the priority, which check ran and what it said, plus how many objects were covered and the counts per priority. With detail=full each finding also carries the column, check_id, check_class, message_id, documentation_uri (the finding's ATC documentation), exemption_approval and exemption_kind as the worklist gives them, and quickfixes (the manual, automatic, pseudo, ai_based and ai_enabled flags of the finding's quick fixes). Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/atc/high/handleGetATCFindings.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `worklist_id` (string, required) - Worklist identifier an ATC run answered.

---

<a id="listatcresults-read-only-atc"></a>
#### ListATCResults (Read-Only / Atc)
**Description:** [read-only] Lists the ATC results the system holds, newest first. Answers each result with its display_id, title, check_variant, run_series, created_at, the finding counts per priority and the failure count. created_by names whose results (a user name, or * for every user); central_only=true lists central results only; age_min and age_max bound the age in days, and when both are absent the system applies an age window of its own. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/atc/high/handleListATCResults.ts`

**Parameters:**
- `age_max` (integer, optional) - Oldest age to list, in days.
- `age_min` (integer, optional) - Youngest age to list, in days.
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `central_only` (boolean, optional) - true lists central results only; absent lists every kind.
- `created_by` (string, required) - Whose results: a user name, or * for every user.

---

<a id="getatcresult-read-only-atc"></a>
#### GetATCResult (Read-Only / Atc)
**Description:** [read-only] Reads the stored ATC result named by display_id. Answers the result's title, check_variant and created_at, how many objects it covered, the counts per priority and each finding with the object, the source position (location and line), the priority, which check ran and what it said. With detail=full each finding also carries the column, check_id, check_class, message_id, documentation_uri (the finding's ATC documentation), exemption_approval and exemption_kind as the result gives them, and quickfixes (the manual, automatic, pseudo, ai_based and ai_enabled flags of the finding's quick fixes). Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/atc/high/handleGetATCResult.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `display_id` (string, required) - Display ID of a stored ATC result.

---

<a id="read-only-background-run"></a>
### Read-Only / Background Run

<a id="getbackgroundrun-read-only-background-run"></a>
#### GetBackgroundRun (Read-Only / Background Run)
**Description:** [read-only] [runtime] Reads one of your background runs by its run_handle: running; finished with what the run tool answered (the system answer as it is, an error included); or cancelled. A read run's finished or cancelled answer is answered once and then deleted, so a lost answer is read again by starting the read again; a code run's answer is kept until it is discarded.

**Source:** `src/handlers/background_run/readonly/handleGetBackgroundRun.ts`

**Parameters:**
- `run_handle` (string, required) - The run_handle a background run answered at its start.

---

<a id="listbackgroundruns-read-only-background-run"></a>
#### ListBackgroundRuns (Read-Only / Background Run)
**Description:** [read-only] [runtime] Lists your background runs: run_handle, tool, object, when it started, and its state: running, finished or cancelled. A run's output is read by its run_handle; a read run leaves the list once its answer was read.

**Source:** `src/handlers/background_run/readonly/handleListBackgroundRuns.ts`

**Parameters:**
- None

---

<a id="discardbackgroundrun-read-only-background-run"></a>
#### DiscardBackgroundRun (Read-Only / Background Run)
**Description:** [read-only] [runtime] Ends the run named by run_handle: a running read is cancelled and its session logged off; a finished run's answer is deleted; a running code run is refused.

**Source:** `src/handlers/background_run/readonly/handleDiscardBackgroundRun.ts`

**Parameters:**
- `run_handle` (string, required) - The run_handle a background run answered at its start.

---

<a id="read-only-batch"></a>
### Read-Only / Batch

<a id="batchbegin-read-only-batch"></a>
#### BatchBegin (Read-Only / Batch)
**Description:** [read-only] Starts batch mode on this server. In batch mode each call of a tool marked recordable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle: over Streamable HTTP send it as the state_handle argument of every call of the batch (or in the x-mcp-state-handle header).

**Source:** `src/handlers/batch/batch/handleBatchBegin.ts`

**Parameters:**
- None

---

<a id="batchend-read-only-batch"></a>
#### BatchEnd (Read-Only / Batch)
**Description:** [read-only] Sends the recorded calls in one envelope with the credentials in force and ends batch mode. Splits SAP's answer into each call's parts and answers the number of recorded calls, of requests sent and of parts received; when sending fails, the parts received differ from the requests sent or the answer fails to split, answers that error, and every number of the batch then answers it.

**Source:** `src/handlers/batch/batch/handleBatchEnd.ts`

**Parameters:**
- None

---

<a id="batchanswers-read-only-batch"></a>
#### BatchAnswers (Read-Only / Batch)
**Description:** [read-only] Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.

**Source:** `src/handlers/batch/batch/handleBatchAnswers.ts`

**Parameters:**
- `number` (integer, optional) - One batch number to read (an integer of at least 1); give this or numbers, not both.
- `numbers` (array, optional) - Several batch numbers to read, answered in the order given; give this or number, not both.

---

<a id="read-only-behavior-definition"></a>
### Read-Only / Behavior Definition

<a id="getbehaviordefinition-read-only-behavior-definition"></a>
#### GetBehaviorDefinition (Read-Only / Behavior Definition)
**Description:** [read-only] Reads the RAP behavior definition named by behavior_definition_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-behavior-implementation"></a>
### Read-Only / Behavior Implementation

<a id="getbehaviorimplementation-read-only-behavior-implementation"></a>
#### GetBehaviorImplementation (Read-Only / Behavior Implementation)
**Description:** [read-only] Reads the RAP behavior implementation (its class) named by behavior_implementation_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-class"></a>
### Read-Only / Class

<a id="getclass-read-only-class"></a>
#### GetClass (Read-Only / Class)
**Description:** [read-only] Reads the ABAP class named by class_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-common"></a>
### Read-Only / Common

<a id="getobjectversions-read-only-common"></a>
#### GetObjectVersions (Read-Only / Common)
**Description:** [read-only] Lists the version history of the class, program, interface, function module, table, structure, table type, CDS view, behavior definition or metadata extension named by object_name and object_type. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/readonly/handleGetObjectVersions.ts`

**Parameters:**
- `function_group_name` (string, optional) - Owning function group name. Required when object_type is function_module.
- `object_name` (string, required) - Object name.
- `object_type` (string, required, one of: `class`, `program`, `interface`, `function_module`, `table`, `structure`, `ddl`, `behavior_definition`, `metadata_extension`, `table_type`) - Object type.

---

<a id="getobjectversionsource-read-only-common"></a>
#### GetObjectVersionSource (Read-Only / Common)
**Description:** [read-only] Reads the source code of the object version named by content_uri, an entry of an object's version history, for the object type named by object_type.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionSource.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the object's version history.
- `object_type` (string, required, one of: `class`, `program`, `interface`, `function_module`, `table`, `structure`, `ddl`, `behavior_definition`, `metadata_extension`) - Object type (the same value the version history was read with).

---

<a id="getobjectversiondiff-read-only-common"></a>
#### GetObjectVersionDiff (Read-Only / Common)
**Description:** [read-only] Compares the two object versions named by content_uri_from and content_uri_to, entries of an object's version history, for the object type named by object_type: returns the unified diff (jsdiff) of their sources.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionDiff.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from the object's version history).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from the object's version history).
- `object_type` (string, required, one of: `class`, `program`, `interface`, `function_module`, `table`, `structure`, `ddl`, `behavior_definition`, `metadata_extension`) - Object type (the same value the version history was read with).

---

<a id="read-only-data-element"></a>
### Read-Only / Data Element

<a id="getdataelement-read-only-data-element"></a>
#### GetDataElement (Read-Only / Data Element)
**Description:** [read-only] Reads the ABAP data element named by data_element_name in one request: its ADT metadata document (definition, package, description), at the version asked. Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-ddl"></a>
### Read-Only / Ddl

<a id="getddl-read-only-ddl"></a>
#### GetDdl (Read-Only / Ddl)
**Description:** [read-only] Reads the CDS view (or classic DDL view) named by ddl_name in one request: its DDL source (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/ddl/high/handleGetDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-domain"></a>
### Read-Only / Domain

<a id="getdomain-read-only-domain"></a>
#### GetDomain (Read-Only / Domain)
**Description:** [read-only] Reads the ABAP domain named by domain_name in one request: its ADT metadata document (definition, package, description), at the version asked. Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-enhancement"></a>
### Read-Only / Enhancement

<a id="getenhancements-read-only-enhancement"></a>
#### GetEnhancements (Read-Only / Enhancement)
**Description:** [read-only] Lists the enhancements (enhancement implementations) of the program, include, function group or class named by object_name and object_type, read at its active version. Takes object_name and object_type (one object: its enhancements) or objects (several objects: one entry per object, in the order given, each its enhancements answer or { object_name, object_type, error }).

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancements.ts`

**Parameters:**
- `detailed` (boolean, optional) - [read-only] true: every enhancement with its whole source; false (default): a short one
- `include_nested` (boolean, optional) - [read-only] true: also the enhancements of every include of a program or function group
- `max_includes` (integer, optional) - [read-only] With include_nested: how many includes are read (default 50)
- `object_name` (string, optional) - Name of the ABAP object (with object_type; or give objects)
- `object_type` (string, optional) - [read-only] Type of the ABAP object
- `objects` (array, optional) - [read-only] Several objects, read together (give this or object_name and object_type)
- `program` (string, optional) - [read-only] An include's main program, when its metadata names none

---

<a id="getenhancementspot-read-only-enhancement"></a>
#### GetEnhancementSpot (Read-Only / Enhancement)
**Description:** [read-only] Retrieve metadata and list of implementations for a specific enhancement spot, at its active version.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts`

**Parameters:**
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="getenhancementimpl-read-only-enhancement"></a>
#### GetEnhancementImpl (Read-Only / Enhancement)
**Description:** [read-only] Retrieve the active source code of a specific enhancement implementation by its name and enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts`

**Parameters:**
- `enhancement_name` (string, required) - [read-only] Name of the enhancement implementation
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="read-only-function-group"></a>
### Read-Only / Function Group

<a id="getfunctiongroup-read-only-function-group"></a>
#### GetFunctionGroup (Read-Only / Function Group)
**Description:** [read-only] Reads the ABAP function group named by function_group_name in one request: its ADT metadata document (package, description, contents), at the version asked. Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-function-include"></a>
### Read-Only / Function Include

<a id="listfunctiongroupincludes-read-only-function-include"></a>
#### ListFunctionGroupIncludes (Read-Only / Function Include)
**Description:** [read-only] List the includes (TOP, custom) of an ABAP function group, read at its active version.

**Source:** `src/handlers/function_include/readonly/handleListFunctionGroupIncludes.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name.

---

<a id="listfunctionmodules-read-only-function-include"></a>
#### ListFunctionModules (Read-Only / Function Include)
**Description:** [read-only] List the function modules of an ABAP function group, read at its active version.

**Source:** `src/handlers/function_include/readonly/handleListFunctionModules.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name.

---

<a id="getfunctioninclude-read-only-function-include"></a>
#### GetFunctionInclude (Read-Only / Function Include)
**Description:** [read-only] Reads the include named by include_name of the ABAP function group named by function_group_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata"), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/function_include/readonly/handleGetFunctionInclude.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `function_group_name` (string, required) - Function group containing the include.
- `include_name` (string, required) - Include name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-function-module"></a>
### Read-Only / Function Module

<a id="getfunctionmodule-read-only-function-module"></a>
#### GetFunctionModule (Read-Only / Function Module)
**Description:** [read-only] Reads the ABAP function module named by function_module_name, BAPI or RFC-enabled ones included, in the function group named by function_group_name: its source code, which declares the parameter signature (part "source", the default), or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. The module's metadata is read first, and the part is answered only when the function group named holds the module. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/function_module/high/handleGetFunctionModule.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `function_group_name` (string, required) - Function group containing the function module.
- `function_module_name` (string, required) - Function module name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-include"></a>
### Read-Only / Include

<a id="getinclude-read-only-include"></a>
#### GetInclude (Read-Only / Include)
**Description:** [read-only] Reads the ABAP include named by include_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/include/readonly/handleGetInclude.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `include_name` (string, required) - Include name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional, one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getincludeslist-read-only-include"></a>
#### GetIncludesList (Read-Only / Include)
**Description:** [read-only] Recursively discover and list ALL include files within an ABAP program or include. Takes object_name and object_type (one object: its tree) or objects (several objects: one entry per object, in the order given, each { object_name, object_type, tree } or { object_name, object_type, error }). Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/include/readonly/handleGetIncludesList.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detailed` (boolean, optional (default: false)) - [read-only] If true, returns structured JSON with metadata and raw XML.
- `object_name` (string, optional) - Name of the ABAP program or include (with object_type; or give objects)
- `object_type` (string, optional, one of: `PROG/P`, `PROG/I`, `FUGR/F`, `CLAS/OC`, `FUGR`, `CLAS`) - [read-only] ADT object type of the parent. Supported: PROG/P, PROG/I, FUGR/F, CLAS/OC. A main type, the part of a code before its slash, stands for its code when exactly one listed code has it. In upper case, a search name of the system's object types list stands for the listed code its list item has (e.g. STRU for TABL/DS).
- `objects` (array, optional) - [read-only] Several objects, read together (give this or object_name and object_type)

---

<a id="getmainprograms-read-only-include"></a>
#### GetMainPrograms (Read-Only / Include)
**Description:** [read-only] Reads the main programs of the ABAP include named by include_name in one request: each program that includes it, or for an include of a function group the group. Returns main_programs, a list of { name, type, uri } — type PROG/P for a program, FUGR/F for a function group.

**Source:** `src/handlers/include/readonly/handleGetMainPrograms.ts`

**Parameters:**
- `include_name` (string, required) - Include name.

---

<a id="read-only-interface"></a>
### Read-Only / Interface

<a id="getinterface-read-only-interface"></a>
#### GetInterface (Read-Only / Interface)
**Description:** [read-only] Reads the ABAP interface named by interface_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `interface_name` (string, required) - Interface name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-leftover-session"></a>
### Read-Only / Leftover Session

<a id="listleftoversessions-read-only-leftover-session"></a>
#### ListLeftoverSessions (Read-Only / Leftover Session)
**Description:** [read-only] [session] Lists the SAP sessions of this server's destination that an ended server process left open (it was killed before it could log them off), with the locks they may hold: handle, role (built: an instance connection; debugger: a debug session connection), destination, user (absent for a token login) and when it was last recorded. Read from the session records alone, on this machine. Only sessions of ended processes are listed. Log one off by its handle. A server process that starts while exactly one instance session (built) of its destination is left is born on it, before any tool call; with several, all stay here, untaken.

**Source:** `src/handlers/leftover_session/session/handleListLeftoverSessions.ts`

**Parameters:**
- None

---

<a id="read-only-message-class"></a>
### Read-Only / Message Class

<a id="getmessageclass-read-only-message-class"></a>
#### GetMessageClass (Read-Only / Message Class)
**Description:** [read-only] Reads the ABAP message class (MSAG/T100) named by message_class_name in one request, at its active version: its ADT metadata document (XML: name, description, package, master language, messages). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name.

---

<a id="getmessageclassmessage-read-only-message-class"></a>
#### GetMessageClassMessage (Read-Only / Message Class)
**Description:** [read-only] Reads the message numbered msgno of the ABAP message class (MSAG/T100) named by message_class_name in one request, from the active version of the class. Answers the one message under `message`: its number (msgno), text (msgtext), self-explanatory flag (selfexplainatory), long-text flag (documented), last changer (lastchangedby), change time (lastmodified), and every other field the system gives the message. A number absent from the class is refused as missing.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="read-only-metadata-extension"></a>
### Read-Only / Metadata Extension

<a id="getmetadataextension-read-only-metadata-extension"></a>
#### GetMetadataExtension (Read-Only / Metadata Extension)
**Description:** [read-only] Reads the CDS metadata extension named by metadata_extension_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `metadata_extension_name` (string, required) - MetadataExtension name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-package"></a>
### Read-Only / Package

<a id="getpackagecontents-read-only-package"></a>
#### GetPackageContents (Read-Only / Package)
**Description:** [read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages. Takes package_name (one package: its list) or package_names (several packages: one entry per package, in the order given, each { package_name, objects } or { package_name, error }). Each level of the walk is read in one ADT batch envelope: the root node structures of its packages, then their type nodes; with include_descriptions, as single requests, several at a time. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/package/readonly/handleGetPackageContents.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `include_descriptions` (boolean, optional) - Include each object's description in the response. The walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes (default: false)
- `include_subpackages` (boolean, optional) - Include contents of subpackages recursively (default: false)
- `max_depth` (number, optional) - Maximum depth for recursive package traversal (default: 5)
- `package_name` (string, optional) - Name of the ABAP package (give this or package_names)
- `package_names` (array, optional) - Names of several ABAP packages, read together (give this or package_name)

---

<a id="getpackage-read-only-package"></a>
#### GetPackage (Read-Only / Package)
**Description:** [read-only] Reads the ABAP package named by package_name in one request: its ADT metadata document (description, super-package, sub-packages, ...), at the version asked. Returns it under `metadata`, with `part: "metadata"`: a summary, the details or the document as SAP sent it, per `detail`.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `package_name` (string, required) - Package name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-program"></a>
### Read-Only / Program

<a id="getprogram-read-only-program"></a>
#### GetProgram (Read-Only / Program)
**Description:** [read-only] Reads the ABAP program (report) named by program_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. On ABAP Cloud, the programs are SAP's standard programs. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `program_name` (string, required) - Program name.
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-search"></a>
### Read-Only / Search

<a id="searchobject-read-only-search"></a>
#### SearchObject (Read-Only / Search)
**Description:** [read-only] Search ABAP repository by object name or wildcard pattern (e.g. 'Z*'). Answers: "find object X", "does X exist", "list objects matching...", "search for program/class/table by name". Supports all repository object types — optionally filter by a name of the system's object types list (PROG, CLAS, INTF, DEVC, TABL, STRU, DDLS, DTEL, FUGR, FUNC, SRVD, SRVB, BDEF, DDLX, etc.). Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/search/readonly/handleSearchObject.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `maxResults` (number, optional (default: 100)) - [read-only] Maximum number of results to return
- `object_name` (string, required) - [read-only] Object name or mask (e.g. 'MARA*')
- `object_type` (string, optional) - [read-only] Optional: restrict the search to one type: a name of the system's object types list — a main type (e.g. CLAS, DEVC, TABL), an alias of one subtype (e.g. STRU for structures, DTAB for database tables, FUNC for function modules) or a group — or an ADT type code, which stands for the name that selects it (e.g. TABL/DS for STRU, FUGR/FF for FUNC, ENHO/XHH for ENHO), either case; or a name standing for a code, written in lower case (e.g. class, structure, table, function), read as its code: view is a CDS view (DDLS), dbview a dictionary view (VIEW). A value in upper case is a search name or a code first, so VIEW is the dictionary views; it is a name only when it is neither (CLASS is class).

---

<a id="getobjectslist-read-only-search"></a>
#### GetObjectsList (Read-Only / Search)
**Description:** [read-only] Recursively lists every child repository object of the program (PROG), function group (FUGR), class (CLAS), package (DEVC) or other composite object named by parent_name, parent_tech_name and parent_type, nested includes and subcomponents included. Takes parent_name, parent_tech_name and parent_type (one parent: its list) or objects (several parents: one entry per parent, in the order given, each { parent_name, parent_type, total_objects, objects } or { parent_name, parent_type, error }). Each level of the node tree is read in one ADT batch envelope. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/search/readonly/handleGetObjectsList.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `objects` (array, optional) - [read-only] Several parents, read together (give this or parent_name)
- `parent_name` (string, optional) - [read-only] Parent object name (with parent_tech_name and parent_type; or give objects)
- `parent_tech_name` (string, optional) - [read-only] Parent technical name
- `parent_type` (string, optional) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `with_short_descriptions` (boolean, optional) - [read-only] Include short descriptions (default: true)

---

<a id="getobjectsbytype-read-only-search"></a>
#### GetObjectsByType (Read-Only / Search)
**Description:** [read-only] Lists the objects of one type (classes, tables, programs, interfaces, etc.), the type whose node in the object tree is named by node_id, under the package or composite object named by parent_name, parent_tech_name and parent_type.

**Source:** `src/handlers/search/readonly/handleGetObjectsByType.ts`

**Parameters:**
- `format` (string, optional) - [read-only] Output format: 'parsed' (default). 'raw' is accepted for backward compatibility but answers the same parsed text — see the note on `nodeLevel` below.
- `node_id` (string, required) - [read-only] Node ID
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type
- `with_short_descriptions` (boolean, optional) - [read-only] Include short descriptions

---

<a id="read-only-service-binding"></a>
### Read-Only / Service Binding

<a id="getservicebinding-read-only-service-binding"></a>
#### GetServiceBinding (Read-Only / Service Binding)
**Description:** [read-only] Reads the OData service binding named by service_binding_name in one request, at its active version: its binding document (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), each in the response_format given. Returns the part read.

**Source:** `src/handlers/service_binding/high/handleGetServiceBinding.ts`

**Parameters:**
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `response_format` (string, optional (default: xml), one of: `xml`, `json`, `plain`) - Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.
- `service_binding_name` (string, required) - Service binding name. Case-insensitive.

---

<a id="read-only-service-definition"></a>
### Read-Only / Service Definition

<a id="getservicedefinition-read-only-service-definition"></a>
#### GetServiceDefinition (Read-Only / Service Definition)
**Description:** [read-only] Reads the service definition named by service_definition_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `service_definition_name` (string, required) - ServiceDefinition name.
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-structure"></a>
### Read-Only / Structure

<a id="getstructureslist-read-only-structure"></a>
#### GetStructuresList (Read-Only / Structure)
**Description:** [read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree. Takes structure_name (one structure: its tree) or structure_names (several structures: one entry per structure, in the order given, each its tree answer or { structure_name, error }). Works on BASIS 7.50 and later, where the DDIC structure/table endpoints it reads exist; legacy systems (BASIS < 7.50) refuse it (issue #207). Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/structure/readonly/handleGetStructuresList.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `include_extensions` (boolean, optional (default: true)) - [read-only] Also find extension (append) structures via where-used (objects that `extend type <this> with …`). Default true. Set false to skip the (slower) where-used lookups and return includes only.
- `structure_name` (string, optional) - Structure name (or give structure_names).
- `structure_names` (array, optional) - Several structure names, read together (give this or structure_name).
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getstructure-read-only-structure"></a>
#### GetStructure (Read-Only / Structure)
**Description:** [read-only] Reads the ABAP structure named by structure_name in one request: its definition with its fields, as source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `structure_name` (string, required) - Structure name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-system"></a>
### Read-Only / System

<a id="getservicebindingpreviewurl-read-only-system"></a>
#### GetServiceBindingPreviewUrl (Read-Only / System)
**Description:** [read-only] Build the browser URL that previews a published service binding, and the service and $metadata URLs beside it. Answers: "open the service in a browser", "preview this service binding", "what is the OData URL of this binding". Reads the active binding for the service, version and protocol, and the active service definition for the entity sets; the preview URL needs an entity set, and the answer names what is missing. A Web API binding answers the service URLs alone.

**Source:** `src/handlers/system/readonly/handleGetServiceBindingPreviewUrl.ts`

**Parameters:**
- `client` (string, optional) - Client for the sap-client parameter. Omitted, the client the system reports is used; an empty string leaves the parameter out.
- `entity_set` (string, optional) - Entity set to open. Omitted, the first one the service definition exposes is used.
- `language` (string, optional) - Logon language for the preview. Omitted, the language the system reports is used.
- `navigation` (string, optional) - Association or composition to follow. Omitted, the first one of the exposed root view is used.
- `service_binding_name` (string, required) - Service binding name.
- `target_entity_set` (string, optional) - Entity set the navigation reaches. Omitted, the second exposed entity set is used.

---

<a id="gettypeinfo-read-only-system"></a>
#### GetTypeInfo (Read-Only / System)
**Description:** [read-only] Retrieve ABAP type information for a DDIC type name: data elements (DTEL), domains (DOMA), structures and table types. One name can be more than one type (MANDT is a data element and a domain): the answer lists every type the name is, in alphabetical order of type, each with its definition — data type, length and decimals, field labels, a domain's output format, value table and fixed values, a table type's row type and key. Each type is read from the working area: its inactive version where one exists.

**Source:** `src/handlers/system/readonly/handleGetTypeInfo.ts`

**Parameters:**
- `include_structure_fallback` (boolean, optional (default: true)) - When true (default), the name is also read as a DDIC structure; false leaves the structure read out.
- `type_name` (string, required) - Name of the ABAP type

---

<a id="gettransaction-read-only-system"></a>
#### GetTransaction (Read-Only / System)
**Description:** [read-only] Reads the properties of the ABAP transaction (t-code) named by transaction_name in one request. Answers the transaction under `object` (name, text, type, package) and its facets under `properties`, in the order the system gives them — the application component chain, the package chain, type, owner, language, creation and the others the system names — each entry with its facet, name, displayName and text.

**Source:** `src/handlers/system/readonly/handleGetTransaction.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `transaction_name` (string, required) - Name of the ABAP transaction

---

<a id="runtimelistprofilertracefiles-read-only-system"></a>
#### RuntimeListProfilerTraceFiles (Read-Only / System)
**Description:** [read-only] [runtime] List ABAP profiler trace files available in ADT runtime. Returns structured entries with id, recordedAt, user, objectName, state, expiresAt, and sizing/timing fields.

**Source:** `src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts`

**Parameters:**
- None

---

<a id="runtimegetprofilertracedata-read-only-system"></a>
#### RuntimeGetProfilerTraceData (Read-Only / System)
**Description:** [read-only] [runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/readonly/handleRuntimeGetProfilerTraceData.ts`

**Parameters:**
- `auto_drill_down_threshold` (number, optional) - Auto drill-down threshold (for statements view).
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `id` (number, optional) - Statement node ID (for statements view).
- `trace_id_or_uri` (string, required) - Profiler trace ID or full ADT trace URI.
- `view` (string, required, one of: `hitlist`, `statements`, `db_accesses`) - Trace view to retrieve.
- `with_details` (boolean, optional) - Include statement details (for statements view).
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimegetdumpbyid-read-only-system"></a>
#### RuntimeGetDumpById (Read-Only / System)
**Description:** [read-only] [runtime] Read an ABAP runtime dump by its dump_id or URI. Answers a summary — runtime error, exception, terminated program, time, user, and the source position where it terminated — and the parsed dump.

**Source:** `src/handlers/system/readonly/handleRuntimeGetDumpById.ts`

**Parameters:**
- `dump_id` (string, required) - The dump's id, or its URI as a dumps feed entry carries it.
- `response_mode` (string, optional (default: both), one of: `payload`, `summary`, `both`) - What is returned: "payload" — the parsed dump, "summary" — runtime error, exception, terminated program, time, user and termination position, "both" — summary and payload.
- `view` (string, optional (default: default), one of: `default`, `summary`, `formatted`) - Dump view mode: default payload, summary section, or formatted long text.

---

<a id="runtimeanalyzeprofilertrace-read-only-system"></a>
#### RuntimeAnalyzeProfilerTrace (Read-Only / System)
**Description:** [read-only] [runtime] Read profiler trace view and return compact analysis summary (totals + top entries). Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `top` (number, optional) - Number of top rows for summary. Default: 10.
- `trace_id_or_uri` (string, required) - Profiler trace ID or full trace URI.
- `view` (string, optional (default: hitlist), one of: `hitlist`, `statements`, `db_accesses`)
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimelistfeeds-read-only-system"></a>
#### RuntimeListFeeds (Read-Only / System)
**Description:** [read-only] [runtime] Reads the ADT runtime feed named by feed_type: with feed_type "dumps", the ABAP short dumps (runtime errors) of the program or object named by object_name, of the user named by user, in the time range from–to, filtered also by runtime error, exception, package and application component; with "system_messages" or "gateway_errors", the system messages or SAP Gateway errors of the user and time range; with "descriptors" (the default) or "variants", the feeds and their variants. Entries come newest first; each dump carries its dump_id. When more entries remain, next_to is the `to` that reads on; incomplete_second names a second holding more entries than SAP answers in one request. Takes feed_type (one feed: its answer) or feed_types (several feeds with the same filters: one entry per feed, in the order given, each its answer or { feed_type, error }). Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/readonly/handleRuntimeListFeeds.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `component` (string, optional) - Dumps whose application component contains this text, in any case.
- `exception` (string, optional) - Dumps whose exception class contains this text, in any case.
- `feed_type` (string, optional, one of: `descriptors`, `variants`, `dumps`, `system_messages`, `gateway_errors`) - Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.
- `feed_types` (array, optional) - Several feeds, read together with the same filters (give this or feed_type).
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Most entries to return, up to 1000; SAP answers at most 100 per request and the pages are read in turn. An answer holds whole seconds, so it may hold a few entries fewer, or a crowded second more, than asked. Default: 50.
- `object_name` (string, optional) - Dumps whose terminated object name contains this text, in any case.
- `package` (string, optional) - Dumps whose object package contains this text, in any case.
- `runtime_error` (string, optional) - Dumps whose runtime error contains this text, in any case.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format, inclusive; pass a previous next_to here to read on.
- `user` (string, optional) - Entries of this SAP user (exact match).

---

<a id="runtimelistsystemmessages-read-only-system"></a>
#### RuntimeListSystemMessages (Read-Only / System)
**Description:** [read-only] [runtime] List SM02 system messages. Returns structured entries with id, title, text, severity, validity period, and author.

**Source:** `src/handlers/system/readonly/handleRuntimeListSystemMessages.ts`

**Parameters:**
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of messages to return.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter by author username.

---

<a id="runtimegetgatewayerrorlog-read-only-system"></a>
#### RuntimeGetGatewayErrorLog (Read-Only / System)
**Description:** [read-only] [runtime] List SAP Gateway error log (/IWFND/ERROR_LOG) or get error detail. Returns structured entries with type, shortText, transactionId, dateTime, username. With error_url returns full detail including serviceInfo, errorContext, sourceCode, callStack.

**Source:** `src/handlers/system/readonly/handleRuntimeGetGatewayErrorLog.ts`

**Parameters:**
- `error_url` (string, optional) - Feed URL of a specific error entry (from a previous list response link field). When provided, returns detailed error info instead of listing.
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of errors to return.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter errors by SAP username.

---

<a id="getsqlquery-read-only-system"></a>
#### GetSqlQuery (Read-Only / System)
**Description:** [read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/readonly/handleGetSqlQuery.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `row_number` (number, optional (default: 100)) - [read-only] Maximum number of rows to return
- `sql_query` (string, required) - SQL query to execute

---

<a id="getwhereused-read-only-system"></a>
#### GetWhereUsed (Read-Only / System)
**Description:** [read-only] Lists where the object named by object_name and object_type is used, for every type object_type takes, a function module (BAPI included) too: every object that uses, calls or references it, with its type and package. Takes object_name and object_type (one object: its list) or objects (several objects: one entry per object, in the order given, each its list or { object_name, object_type, error }). Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/readonly/handleGetWhereUsed.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `disable_types` (array, optional) - Remove these ADT object types from the default scope, keeping the rest (e.g. ['CLAS/OC'] to drop class usages). Applied on top of the default scope or of enable_only_types/enable_all_types.
- `enable_all_types` (boolean, optional (default: false)) - If true, expands the scope to all available object types (Eclipse 'select all' behavior) by flipping every isSelected flag in the scope XML. Default: false (SAP default scope). Note: on large systems this can make the search significantly slower.
- `enable_only_types` (array, optional) - Restrict the search to ONLY these ADT object types (e.g. ['TABL/DS','TABL/DT'] for structures, ['DDLS/DF'] for CDS sources). SAP applies the selection server-side, so unwanted types (e.g. hundreds of CLAS/OC) are never searched nor returned — use this instead of enable_all_types to avoid huge result sets. Values must be object-type codes from THIS object's where-used scope (the searchable categories, e.g. 'CLAS/OC','INTF/OI','FUGR/FF','DDLS/DF', not result-row codes like 'FUGR/F'). If any value is not searchable for the object the call returns an error listing the supported types — it never falls back to the unfiltered default set. Takes precedence over enable_all_types.
- `object_name` (string, optional) - Name of the ABAP object (with object_type; or give objects). For function modules the name MUST be in the form 'GROUP|FM_NAME' (function group name, pipe, function module name).
- `object_type` (string, optional) - Type of the ABAP object: an ADT type code (either case), or a name standing for one (in brackets after it): CLAS/OC (class), INTF/OI (interface), PROG/P (program), PROG/I (include), FUGR/F (functiongroup), FUGR/FF (function, functionmodule, function_module, func), DEVC/K (package), DDLS/DF (view), VIEW/DV (dbview), TABL/DT (table), TABL/DS (structure, stru), TTYP/DA, DOMA/DD (domain), DTEL/DE (dataelement), DCLS/DL, BDEF/BDO, DDLX/EX, SRVD/SRV, SRVB/SVB, DSFD/SCF, DSFI/SFI, XSLT/VT, MSAG/N, FTG2/FT, AUTH, ENHO/XHH, ENHO/XHB, ENHS/XSB. A function module is named as object_name says. A name is written in lower case: view is a CDS view (DDLS/DF). A value in upper case is a code, a main type or a search name of the system's object types list first, so VIEW is the dictionary views (VIEW/DV); it is a name only when it is none of these (CLASS is class). A main type, the part of a code before its slash, stands for its code when exactly one listed code has it. In upper case, a search name of the system's object types list stands for the listed code its list item has (e.g. STRU for TABL/DS).
- `objects` (array, optional) - Several objects, read together (give this or object_name and object_type). The type filters apply to every object.

---

<a id="getobjectinfo-read-only-system"></a>
#### GetObjectInfo (Read-Only / System)
**Description:** [read-only] Returns the object tree of the package (DEVC), class (CLAS), program (PROG), function group (FUGR) or other object named by parent_type and parent_name. Shows root, group nodes, and terminal leaves up to maxDepth. With enrich=true each node also carries its description and package, from a repository search. Takes parent_type and parent_name (one object: its tree) or objects (several objects: one tree per object, in the order given; a failed one as { OBJECT_TYPE, OBJECT_NAME, error }). Read in ADT batch envelopes: per tier the root node structures of its nodes, then their type nodes; with enrich, the search of every node last. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/readonly/handleGetObjectInfo.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `enrich` (boolean, optional (default: true)) - [read-only] Whether to add description and package via SearchObject (default true)
- `include_descriptions` (boolean, optional (default: false)) - [read-only] Include each leaf's description. Where the system serves ADT batch, each description is read from the leaf's metadata: one more read per leaf, which on a large tree takes most of the call (default false)
- `maxDepth` (integer, optional (default: 1)) - [read-only] Maximum tree depth (default depends on type). Every object's own type folders and their contents are always shown (one tier); a higher value only descends further for PACKAGES, expanding nested subpackages that many tiers deep — no captured node-structure document shows a non-package object usefully recursable beyond its own type folders, so other object types are capped at one tier regardless of a higher value here.
- `objects` (array, optional) - [read-only] Several objects, read together (give this or parent_type and parent_name)
- `parent_name` (string, optional) - [read-only] Parent object name
- `parent_type` (string, optional) - [read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P); with parent_name, or give objects

---

<a id="getinactiveobjects-read-only-system"></a>
#### GetInactiveObjects (Read-Only / System)
**Description:** [read-only] Get a list of inactive ABAP objects — modified and pending activation. Shows classes, tables, CDS views, and other objects awaiting activation.

**Source:** `src/handlers/system/readonly/handleGetInactiveObjects.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

---

<a id="getadttypes-read-only-system"></a>
#### GetAdtTypes (Read-Only / System)
**Description:** [read-only] Retrieve all valid ADT object types (CLAS, TABL, PROG, DEVC, FUGR, INTF, DDLS, DTEL, DOMA, SRVD, SRVB, BDEF, DDLX, etc.) or validate a specific type name.

**Source:** `src/handlers/system/readonly/handleGetAllTypes.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `validate_type` (string, optional) - Type name to validate (optional)

---

<a id="getobjectstructure-read-only-system"></a>
#### GetObjectStructure (Read-Only / System)
**Description:** [read-only] Returns the ADT structure of the repository object named by objecttype and objectname as a compact JSON tree.

**Source:** `src/handlers/system/readonly/handleGetObjectStructure.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `objectname` (string, required) - ADT object name (e.g. /CBY/ACQ_DDL)
- `objecttype` (string, required) - ADT object type (e.g. DDLS/DF)

---

<a id="getobjectoutline-read-only-system"></a>
#### GetObjectOutline (Read-Only / System)
**Description:** [read-only] Lists the components of the ABAP object named by object_type and object_name — types, attributes, methods, events, local classes, forms, includes or modules — with their kind, visibility and level, and the source positions SAP's object structure states for each: the include each link points into and, for a class or an interface, its start and end line and column (lines from 1, columns from 0, the end exclusive), the lines a ranged source read (start_line, end_line) answers. Returns the components as a tree.

**Source:** `src/handlers/system/readonly/handleGetObjectOutline.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `object_name` (string, required) - Object name.
- `object_type` (string, required, one of: `CLAS/OC`, `INTF/OI`, `PROG/P`, `FUGR/F`) - ADT type of the object: CLAS/OC, INTF/OI, PROG/P, FUGR/F (class, interface, program, function group).
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getobjectnodefromcache-read-only-system"></a>
#### GetObjectNodeFromCache (Read-Only / System)
**Description:** [read-only] Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present, reading the active version of the object it names.

**Source:** `src/handlers/system/readonly/handleGetObjectNodeFromCache.ts`

**Parameters:**
- `object_name` (string, required) - [read-only] Object name
- `object_type` (string, required) - [read-only] Object type
- `tech_name` (string, required) - [read-only] Technical name

---

<a id="describebylist-read-only-system"></a>
#### DescribeByList (Read-Only / System)
**Description:** [read-only] Describes each repository object named in objects, in one call: its type, description and package. Input: objects: Array<{ name: string, type?: string }>. Each object's type is optional: a name of the system's object types list (e.g. CLAS, DTAB, STRU) or an ADT type code (e.g. PROG/P, PROG/I, FUGR/F, FUGR/FF, CLAS/OC, INTF/OI), either case, or a name standing for a code, in lower case (e.g. class, table, structure; view is a CDS view, while VIEW is the dictionary views); an object of any other type is searched by its name alone. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/readonly/handleDescribeByList.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `objects` (array, required)

---

<a id="getpackagetree-read-only-system"></a>
#### GetPackageTree (Read-Only / System)
**Description:** [read-only] Returns the complete tree of the ABAP package named by package_name: its subpackages and objects. Returns hierarchical tree with object names, types, and descriptions. Takes package_name (one package: its tree) or package_names (several packages: one entry per package, in the order given, each { package_name, tree, metadata } or { package_name, error }). Read in ADT batch envelopes: the active package metadata with the root node structure, then each level of the walk; with include_descriptions, as single requests, several at a time. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/high/handleGetPackageTree.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `debug` (boolean, optional (default: false)) - Include diagnostic metadata in response (counts, types, hierarchy info). Default: false
- `include_descriptions` (boolean, optional (default: false)) - Include each object's description in the response. The package metadata and the walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes. Default: false
- `include_subpackages` (boolean, optional (default: true)) - Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true
- `max_depth` (integer, optional (default: 5)) - Maximum depth for recursive package traversal. Default: 5
- `package_name` (string, optional) - Package name (give this or package_names)
- `package_names` (array, optional) - Several package names, read together (give this or package_name)

---

<a id="searchsource-read-only-system"></a>
#### SearchSource (Read-Only / System)
**Description:** [read-only] Search ABAP source text inside one or more packages: programs, program includes, function groups (function modules and includes), classes (main source and the four local includes), interfaces, CDS data definitions, behavior definitions, metadata extensions and service definitions. Each source is read at the call's `version` (default active). `packages` takes exact package names and masks (Z*, /NS/Z?); in a mask `*` (zero or more characters) and `?` (one character) are the wildcards, and `+`, `_`, `%` and `#` are characters of the name; a mask is resolved by the repository quick search to every package it matches. `object_types` and `object_filter` select the scan targets of the resolved packages (`PROG` selects programs and program includes, `FUGR` function groups with their modules and includes); every target is read in one run, unless `max_hits` is reached. A line matches when it contains `query` (and `query2`, when given), case-insensitively, and a line containing an `exclude` entry is dropped; `exclude_comments` skips col-1 `*` and full-line `"` comment lines. `max_hits_per_object` limits the hits of each object only when given; each module and each include of a function group is an object of its own. `max_hits` limits the hits of the whole answer, counted in the scan order after `max_hits_per_object`: reached, the scan stops reading, and `truncated.by_max_hits` is true when anything was left. `answer` sets what each hit is answered as: `snippets` (the default) with line and snippet, `lines` with the line only, `objects` one entry per object and include with its number of hits. The answer lists each hit (`results`: package, object type, object name, include, line, snippet). The `object_type` of a hit names its kind of source: `PROG` a program, `PROG/I` a program include (`object_name` the include name), `CLAS` a class with `include` the class name for its main source or `definitions`, `implementations`, `macros`, `testclasses` for its local includes, `INTF`, `DDLS`, `BDEF`, `DDLX` and `SRVD` the object source; a hit in a function module is `FUGR/FF` (`object_name` the module) and a hit in an include addressed under its function group is `FUGR/I` (`object_name` the include), each with `function_group_name`, the group, in place of `include`; an include a function group lists among the program includes is `PROG/I`; `scanned.objects` counts the objects read, `scanned.sources` the sources read (each once) and `scanned.objects_with_hits` the objects with a hit; `truncated.by_object_cap` is true when an object had more hits than `max_hits_per_object`. At a stop the counters report what was done until it; where the reads go in batches, `scanned.sources` counts the sources of the last batch read, those read past the stop included. A source, an object or a package SAP refuses is skipped, and a type node or subpackage SAP refuses is skipped with everything under it; a read that fails before SAP answers ends the call as an error. Sources are read in ADT batch envelopes where the system offers them, each source once per call. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/system/readonly/handleSearchSource.ts`

**Parameters:**
- `answer` (string, optional, one of: `objects`, `lines`, `snippets`) - What each hit is answered as: snippets (the default: line and snippet), lines (line, no snippet) or objects (one entry per object and include with its number of hits).
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `exclude` (array, optional) - Up to 3 substrings; a line containing any of them is dropped.
- `exclude_comments` (boolean, optional) - Skip col-1 '*' and full-line '"' comment lines. Default false (comments are scanned).
- `include_subpackages` (boolean, optional) - Recurse into subpackages (default true).
- `max_hits` (integer, optional) - The most hits of the whole answer, counted in the scan order after max_hits_per_object; reached, the scan stops reading and truncated.by_max_hits is true when anything was left. Absent, no limit.
- `max_hits_per_object` (integer, optional) - The most hits answered per object, across its sources; absent, no limit. When an object has more, truncated.by_object_cap is true.
- `object_filter` (string, optional) - Glob applied to object names within each package (e.g. "Z*").
- `object_types` (array, optional) - Object types to scan, by main type: PROG (programs and program includes), FUGR, CLAS, INTF, DDLS, BDEF, DDLX, SRVD. Default: all of them.
- `packages` (array, required) - Packages to scan. Each entry is an exact package name or a mask: `*` stands for zero or more characters, `?` for one character, and a namespace prefix may lead it; `+`, `_`, `%` and `#` are characters of the name.
- `query` (string, required) - Primary substring to match (case-insensitive, ABAP CS).
- `query2` (string, optional) - Optional second substring. When set, both query and query2 must appear on the same line.
- `version` (string, optional, one of: `active`, `inactive`, `workingArea`) - The version every source is read at. Default active.

---

<a id="read-only-table"></a>
### Read-Only / Table

<a id="gettablecontents-read-only-table"></a>
#### GetTableContents (Read-Only / Table)
**Description:** [read-only] Reads the contents (data preview, like SE16/SE16N) of the ABAP database table or CDS view named by table_name: every column, up to max_rows rows (default 100). Answers sql_query, row_number (the max_rows asked), execution_time, total_rows (the rows the table or view holds), columns and rows. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/table/readonly/handleGetTableContents.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `max_rows` (number, optional) - Maximum number of rows to retrieve
- `table_name` (string, required) - Name of the ABAP table

---

<a id="gettable-read-only-table"></a>
#### GetTable (Read-Only / Table)
**Description:** [read-only] Reads the ABAP database table named by table_name in one request: its definition with its fields, as source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `table_name` (string, required) - Table name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-table-type"></a>
### Read-Only / Table Type

<a id="gettabletype-read-only-table-type"></a>
#### GetTableType (Read-Only / Table Type)
**Description:** [read-only] Reads the ABAP table type named by table_type_name in one request: its ADT metadata document (row type, access, key, package, description), at the version asked. Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/table_type/high/handleGetTableType.ts`

**Parameters:**
- `table_type_name` (string, required) - Table type name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-transport"></a>
### Read-Only / Transport

<a id="gettransport-read-only-transport"></a>
#### GetTransport (Read-Only / Transport)
**Description:** [read-only] Retrieve ABAP transport request information including metadata, included objects, and status from SAP system.

**Source:** `src/handlers/transport/readonly/handleGetTransport.ts`

**Parameters:**
- `include_objects` (boolean, optional (default: true)) - Include list of objects in transport (default: true)
- `include_tasks` (boolean, optional (default: true)) - Include list of tasks in transport (default: true)
- `transport_number` (string, required) - Transport request number, not a task

---

<a id="listtransports-read-only-transport"></a>
#### ListTransports (Read-Only / Transport)
**Description:** [read-only] List transport requests for the current or specified user. Returns modifiable and/or released workbench and customizing requests. `user` and modifiable-only are both applied client-side, over every request the server's default search configuration answers; ADT receives the default search alone. Runs on an ABAP session of its own. By default the call answers at once with a run_handle, whose result is read by that handle; with background false it answers the result in the call.

**Source:** `src/handlers/transport/readonly/handleListTransports.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `modifiable_only` (boolean, optional) - Only return modifiable (not yet released) transports; applied client-side. Default: true.
- `user` (string, optional) - The user to filter to: an SAP user id (matched in upper case); applied client-side. If not provided, defaults to the current session user, so an unfiltered call already answers only that user's transports.

---

<a id="readtransportobjects-read-only-transport"></a>
#### ReadTransportObjects (Read-Only / Transport)
**Description:** [read-only] Lists the objects the transport request or task named by transport_number holds, each with its `position`, which a removal of the entry names. A task answers its own entries; a request answers every task's entries, each once, with its `task` number and position — the task a removal addresses.

**Source:** `src/handlers/transport/readonly/handleReadTransportObjects.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `transport_number` (string, required) - Transport REQUEST or TASK number. A task answers its own entries; a request answers the entries of each of its tasks, each with its `task` number — the task a removal addresses.

---

<a id="readtransportactionlog-read-only-transport"></a>
#### ReadTransportActionLog (Read-Only / Transport)
**Description:** [read-only] Reads the action log of the transport request named by transport_number: one entry per lifecycle event — created, object added, object deleted, owner changed. It confirms that an object entry was taken out of the request, since a removal answers by echoing what it was asked.

**Source:** `src/handlers/transport/readonly/handleReadTransportActionLog.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `transport_number` (string, required) - Transport REQUEST or TASK number. A request answers its own lifecycle events; a task answers the events of the objects on it.

---

<a id="read-only-unit-test"></a>
### Read-Only / Unit Test

<a id="getunittestresult-read-only-unit-test"></a>
#### GetUnitTestResult (Read-Only / Unit Test)
**Description:** [read-only] Reads the result of the ABAP Unit test run named by run_id, for a run started with wait false or still running: its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes; a run SAP answers finished answers its result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id) answers the run_id and that status at once, and any other status is an error stating what SAP answered.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `full`, `raw`) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `format` (string, optional, one of: `abapunit`, `junit`) - Result format: abapunit or junit.
- `run_id` (string, required) - Run id a unit test run answered.
- `with_navigation_uris` (boolean, optional) - Include navigation URIs in result if supported.

---

<a id="streamable-http-binaries"></a>
## Streamable HTTP Binaries

`mcp-abap-adt-sse-ro` (SSE) serves the tools of `mcp-abap-adt-ro` without `ListLeftoverSessions`, which are stdio's only. `mcp-abap-adt-http-ro` (Streamable HTTP) serves the same tools, and beside them:

- **The `state_handle` argument.** On `mcp-abap-adt-http-ro` (Streamable HTTP) every tool declares one more, optional argument, `state_handle` (string): "The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance." A tool whose own schema declares `state_handle` (the debugger tools) keeps its own declaration, required where it is required. No stdio or SSE binary declares it; the parameters listed per tool on this page are the stdio ones, without it.
- **The long session:** `SessionOpen`, `SessionClose`, served by no stdio or SSE binary. Their parameters below are the ones `mcp-abap-adt-http-ro` registers, `state_handle` included.

<a id="sessionopen-streamable-http"></a>
### SessionOpen (Streamable HTTP)
**Description:** [read-only] Opens a long session on this server: the server instance and its SAP connection are kept for every call that carries the session's state_handle, until the session is closed or the server's idle bound passes between two calls. Answers the state_handle: send it as the state_handle argument of every call of the session (or in the x-mcp-state-handle header). Called with the state_handle of an instance that already holds state, or of an open session, answers that same state_handle and keeps what the instance holds. In batch mode it runs at once and the batch stays open.

**Parameters:**
- `state_handle` (string, optional) - The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.

---

<a id="sessionclose-streamable-http"></a>
### SessionClose (Streamable HTTP)
**Description:** [read-only] Closes the long session the state_handle names: once this answer is written the server instance is closed — every SAP session it holds is logged off, which releases the locks taken in it; an open batch and its recorded calls are dropped unsent — and the state_handle ends: a later call carrying it gets the unavailable-state answer. Answers that the session is closed and what it held: its locks, a batch, a debug session. Called with an unknown state_handle, or on a new instance, it gets the unavailable-state answer. In batch mode it runs at once and drops the batch.

**Parameters:**
- `state_handle` (string, optional) - The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.

---

*Last updated: 2026-11-07*
