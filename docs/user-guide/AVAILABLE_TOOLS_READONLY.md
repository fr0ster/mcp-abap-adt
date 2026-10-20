# Read-Only Tools - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

Exactly the tools `mcp-abap-adt-ro` serves (and `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro`: the same set without `ListLeftoverSessions` and `LogoffLeftoverSession`, which are stdio's only), with the parameters they take there — taken from `fullReadOnlyToolSet`, the set those binaries use. No high, debugger, background-run or resume tool; the run tools take no `background`. The batch tools are served here too: the reads none of whose requests depends on another's answer are recorded in batch mode. Each tool's description, as the server lists it, ends with one more sentence on batch mode — recordable, recordable for the arguments it names, or run outside batch mode; the descriptions here are the handlers' own, without it ([BATCH_MODE.md](BATCH_MODE.md) lists every recordable call). `mcp-abap-adt` serves these and more: [all tools](AVAILABLE_TOOLS.md).

- Level: Read-Only
- Total tools: 71

## Navigation

- [Read-Only Group](#read-only-group)
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
  - [Interface](#read-only-interface)
    - [GetInterface](#getinterface-read-only-interface)
  - [Leftover Session](#read-only-leftover-session)
    - [ListLeftoverSessions](#listleftoversessions-read-only-leftover-session)
    - [LogoffLeftoverSession](#logoffleftoversession-read-only-leftover-session)
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
    - [RuntimeCreateProfilerTraceParameters](#runtimecreateprofilertraceparameters-read-only-system)
    - [RuntimeListProfilerTraceFiles](#runtimelistprofilertracefiles-read-only-system)
    - [RuntimeGetProfilerTraceData](#runtimegetprofilertracedata-read-only-system)
    - [RuntimeGetDumpById](#runtimegetdumpbyid-read-only-system)
    - [RuntimeRunClass](#runtimerunclass-read-only-system)
    - [RuntimeRunProgram](#runtimerunprogram-read-only-system)
    - [RuntimeAnalyzeProfilerTrace](#runtimeanalyzeprofilertrace-read-only-system)
    - [RuntimeListFeeds](#runtimelistfeeds-read-only-system)
    - [RuntimeListSystemMessages](#runtimelistsystemmessages-read-only-system)
    - [RuntimeGetGatewayErrorLog](#runtimegetgatewayerrorlog-read-only-system)
    - [GetSqlQuery](#getsqlquery-read-only-system)
    - [GetWhereUsed](#getwhereused-read-only-system)
    - [GetObjectInfo](#getobjectinfo-read-only-system)
    - [GetAbapAST](#getabapast-read-only-system)
    - [GetAbapSemanticAnalysis](#getabapsemanticanalysis-read-only-system)
    - [GetAbapSystemSymbols](#getabapsystemsymbols-read-only-system)
    - [GetInactiveObjects](#getinactiveobjects-read-only-system)
    - [GetAdtTypes](#getadttypes-read-only-system)
    - [GetObjectStructure](#getobjectstructure-read-only-system)
    - [GetObjectNodeFromCache](#getobjectnodefromcache-read-only-system)
    - [DescribeByList](#describebylist-read-only-system)
    - [GetPackageTree](#getpackagetree-read-only-system)
    - [SearchSource](#searchsource-read-only-system)
  - [Table](#read-only-table)
    - [GetTableContents](#gettablecontents-read-only-table)
    - [GetTable](#gettable-read-only-table)
  - [Transport](#read-only-transport)
    - [GetTransport](#gettransport-read-only-transport)
    - [ListTransports](#listtransports-read-only-transport)
    - [ReadTransportObjects](#readtransportobjects-read-only-transport)
    - [ReadTransportActionLog](#readtransportactionlog-read-only-transport)
  - [Unit Test](#read-only-unit-test)
    - [GetUnitTestResult](#getunittestresult-read-only-unit-test)

---

<a id="read-only-group"></a>
## Read-Only Group

<a id="read-only-batch"></a>
### Read-Only / Batch

<a id="batchbegin-read-only-batch"></a>
#### BatchBegin (Read-Only / Batch)
**Description:** Starts batch mode on this server. In batch mode each call of a tool marked recordable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle, which HTTP clients send in the x-mcp-state-handle header with every call of the batch.

**Source:** `src/handlers/batch/batch/handleBatchBegin.ts`

**Parameters:**
- None

---

<a id="batchend-read-only-batch"></a>
#### BatchEnd (Read-Only / Batch)
**Description:** Sends the recorded calls in one envelope with the credentials in force and ends batch mode. Splits SAP's answer into each call's parts and answers the number of recorded calls, of requests sent and of parts received; when sending fails, the parts received differ from the requests sent or the answer fails to split, answers that error, and every number of the batch then answers it.

**Source:** `src/handlers/batch/batch/handleBatchEnd.ts`

**Parameters:**
- None

---

<a id="batchanswers-read-only-batch"></a>
#### BatchAnswers (Read-Only / Batch)
**Description:** Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.

**Source:** `src/handlers/batch/batch/handleBatchAnswers.ts`

**Parameters:**
- `number` (integer, optional) - One batch number to read (an integer of at least 1); give this or numbers, not both.
- `numbers` (array, optional) - Several batch numbers to read, answered in the order given; give this or number, not both.

---

<a id="read-only-behavior-definition"></a>
### Read-Only / Behavior Definition

<a id="getbehaviordefinition-read-only-behavior-definition"></a>
#### GetBehaviorDefinition (Read-Only / Behavior Definition)
**Description:** [read-only] Reads the RAP behavior definition named by behavior_definition_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-behavior-implementation"></a>
### Read-Only / Behavior Implementation

<a id="getbehaviorimplementation-read-only-behavior-implementation"></a>
#### GetBehaviorImplementation (Read-Only / Behavior Implementation)
**Description:** [read-only] Reads the RAP behavior implementation (its class) named by behavior_implementation_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-class"></a>
### Read-Only / Class

<a id="getclass-read-only-class"></a>
#### GetClass (Read-Only / Class)
**Description:** [read-only] Reads the ABAP class named by class_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-common"></a>
### Read-Only / Common

<a id="getobjectversions-read-only-common"></a>
#### GetObjectVersions (Read-Only / Common)
**Description:** [read-only] Lists the version history of the class, program, interface, function module, table, structure, CDS view, behavior definition or metadata extension named by object_name and object_type. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/readonly/handleGetObjectVersions.ts`

**Parameters:**
- `function_group_name` (string, optional) - Owning function group name. Required when object_type is function_module.
- `object_name` (string, required) - Object name.
- `object_type` (string, required) - Object type.

---

<a id="getobjectversionsource-read-only-common"></a>
#### GetObjectVersionSource (Read-Only / Common)
**Description:** [read-only] Reads the source code of the object version named by content_uri, an entry of an object's version history, for the object type named by object_type.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionSource.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the object's version history.
- `object_type` (string, required) - Object type (the same value the version history was read with).

---

<a id="getobjectversiondiff-read-only-common"></a>
#### GetObjectVersionDiff (Read-Only / Common)
**Description:** [read-only] Compares the two object versions named by content_uri_from and content_uri_to, entries of an object's version history, for the object type named by object_type: returns the unified diff (jsdiff) of their sources.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionDiff.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from the object's version history).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from the object's version history).
- `object_type` (string, required) - Object type (the same value the version history was read with).

---

<a id="read-only-data-element"></a>
### Read-Only / Data Element

<a id="getdataelement-read-only-data-element"></a>
#### GetDataElement (Read-Only / Data Element)
**Description:** [read-only] Reads the ABAP data element named by data_element_name in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="read-only-ddl"></a>
### Read-Only / Ddl

<a id="getddl-read-only-ddl"></a>
#### GetDdl (Read-Only / Ddl)
**Description:** [read-only] Reads the CDS view (or classic DDL view) named by ddl_name in one request: its DDL source (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/ddl/high/handleGetDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-domain"></a>
### Read-Only / Domain

<a id="getdomain-read-only-domain"></a>
#### GetDomain (Read-Only / Domain)
**Description:** [read-only] Reads the ABAP domain named by domain_name in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="read-only-enhancement"></a>
### Read-Only / Enhancement

<a id="getenhancements-read-only-enhancement"></a>
#### GetEnhancements (Read-Only / Enhancement)
**Description:** [read-only] Lists the enhancements (enhancement implementations) of the program, include or class named by object_name and object_type. Takes object_name and object_type (one object: its enhancements) or objects (several objects: one entry per object, in the order given, each its enhancements answer or { object_name, object_type, error }).

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancements.ts`

**Parameters:**
- `object_name` (string, optional) - Name of the ABAP object (with object_type; or give objects)
- `object_type` (string, optional) - [read-only] Type of the ABAP object
- `objects` (array, optional) - [read-only] Several objects, read together (give this or object_name and object_type)

---

<a id="getenhancementspot-read-only-enhancement"></a>
#### GetEnhancementSpot (Read-Only / Enhancement)
**Description:** [read-only] Retrieve metadata and list of implementations for a specific enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts`

**Parameters:**
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="getenhancementimpl-read-only-enhancement"></a>
#### GetEnhancementImpl (Read-Only / Enhancement)
**Description:** [read-only] Retrieve source code of a specific enhancement implementation by its name and enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts`

**Parameters:**
- `enhancement_name` (string, required) - [read-only] Name of the enhancement implementation
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="read-only-function-group"></a>
### Read-Only / Function Group

<a id="getfunctiongroup-read-only-function-group"></a>
#### GetFunctionGroup (Read-Only / Function Group)
**Description:** [read-only] Reads the ABAP function group named by function_group_name in one request: its ADT metadata document (package, description, contents). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="read-only-function-include"></a>
### Read-Only / Function Include

<a id="listfunctiongroupincludes-read-only-function-include"></a>
#### ListFunctionGroupIncludes (Read-Only / Function Include)
**Description:** [read-only] List the includes (TOP, custom) of an ABAP function group.

**Source:** `src/handlers/function_include/readonly/handleListFunctionGroupIncludes.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name.

---

<a id="listfunctionmodules-read-only-function-include"></a>
#### ListFunctionModules (Read-Only / Function Include)
**Description:** [read-only] List the function modules of an ABAP function group.

**Source:** `src/handlers/function_include/readonly/handleListFunctionModules.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name.

---

<a id="getfunctioninclude-read-only-function-include"></a>
#### GetFunctionInclude (Read-Only / Function Include)
**Description:** [read-only] Reads the include named by include_name of the ABAP function group named by function_group_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata"). Returns the part read.

**Source:** `src/handlers/function_include/readonly/handleGetFunctionInclude.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group containing the include.
- `include_name` (string, required) - Include name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-function-module"></a>
### Read-Only / Function Module

<a id="getfunctionmodule-read-only-function-module"></a>
#### GetFunctionModule (Read-Only / Function Module)
**Description:** [read-only] Reads the ABAP function module named by function_module_name, BAPI or RFC-enabled ones included, in the function group named by function_group_name, in one request: its source code, which declares the parameter signature (part "source", the default; active or inactive version), or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/function_module/high/handleGetFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group containing the function module.
- `function_module_name` (string, required) - Function module name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-include"></a>
### Read-Only / Include

<a id="getinclude-read-only-include"></a>
#### GetInclude (Read-Only / Include)
**Description:** [read-only] Read ANY single ABAP include source by name, from anywhere in the repository (an include may live outside any single program tree). Reads includes (PROG/I) by name.

**Source:** `src/handlers/include/readonly/handleGetInclude.ts`

**Parameters:**
- None

---

<a id="getincludeslist-read-only-include"></a>
#### GetIncludesList (Read-Only / Include)
**Description:** [read-only] Recursively discover and list ALL include files within an ABAP program or include. Takes object_name and object_type (one object: its tree) or objects (several objects: one entry per object, in the order given, each { object_name, object_type, tree } or { object_name, object_type, error }). Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/include/readonly/handleGetIncludesList.ts`

**Parameters:**
- `detailed` (boolean, optional (default: false)) - [read-only] If true, returns structured JSON with metadata and raw XML.
- `object_name` (string, optional) - Name of the ABAP program or include (with object_type; or give objects)
- `object_type` (string, optional) - [read-only] ADT object type of the parent. Only these four values are supported: 'PROG/P' (program), 'PROG/I' (include), 'FUGR' (function group), 'CLAS/OC' (class). Any other value is rejected by the schema.
- `objects` (array, optional) - [read-only] Several objects, read together (give this or object_name and object_type)
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="read-only-interface"></a>
### Read-Only / Interface

<a id="getinterface-read-only-interface"></a>
#### GetInterface (Read-Only / Interface)
**Description:** [read-only] Reads the ABAP interface named by interface_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-leftover-session"></a>
### Read-Only / Leftover Session

<a id="listleftoversessions-read-only-leftover-session"></a>
#### ListLeftoverSessions (Read-Only / Leftover Session)
**Description:** [session] Lists the SAP sessions of this server's destination that an ended server process left open (it was killed before it could log them off), with the locks they may hold: handle, role (built: an instance connection; debugger: a debug session connection), destination, user (absent for a token login) and when it was last recorded. Read from the session records alone, on this machine. Only sessions of ended processes are listed. Log one off by its handle. A server process that starts while exactly one instance session (built) of its destination is left is born on it, before any tool call; with several, all stay here, untaken.

**Source:** `src/handlers/leftover_session/session/handleListLeftoverSessions.ts`

**Parameters:**
- None

---

<a id="logoffleftoversession-read-only-leftover-session"></a>
#### LogoffLeftoverSession (Read-Only / Leftover Session)
**Description:** [session] Logs off a leftover SAP session (any role): the session ends, and every lock it holds is released. Only the logoff is sent, credential-free. The session record is deleted afterwards.

**Source:** `src/handlers/leftover_session/session/handleLogoffLeftoverSession.ts`

**Parameters:**
- `handle` (string, required) - The handle of a leftover session, as the list of leftover sessions answers it.

---

<a id="read-only-message-class"></a>
### Read-Only / Message Class

<a id="getmessageclass-read-only-message-class"></a>
#### GetMessageClass (Read-Only / Message Class)
**Description:** [read-only] Reads the ABAP message class (MSAG/T100) named by message_class_name in one request: its ADT metadata document (XML: name, description, package, master language, messages). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name.

---

<a id="getmessageclassmessage-read-only-message-class"></a>
#### GetMessageClassMessage (Read-Only / Message Class)
**Description:** [read-only] Reads the message numbered msgno of the ABAP message class (MSAG/T100) named by message_class_name in one request: the class's ADT document (XML) that holds it, under `metadata`, with `part: "metadata"`; a number absent from the class is refused as missing.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="read-only-metadata-extension"></a>
### Read-Only / Metadata Extension

<a id="getmetadataextension-read-only-metadata-extension"></a>
#### GetMetadataExtension (Read-Only / Metadata Extension)
**Description:** [read-only] Reads the CDS metadata extension named by metadata_extension_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-package"></a>
### Read-Only / Package

<a id="getpackagecontents-read-only-package"></a>
#### GetPackageContents (Read-Only / Package)
**Description:** [read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages. Takes package_name (one package: its list) or package_names (several packages: one entry per package, in the order given, each { package_name, objects } or { package_name, error }). Each level of the walk is read in one ADT batch envelope: the root node structures of its packages, then their type nodes. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/package/readonly/handleGetPackageContents.ts`

**Parameters:**
- None

---

<a id="getpackage-read-only-package"></a>
#### GetPackage (Read-Only / Package)
**Description:** [read-only] Reads the ABAP package named by package_name in one request: its ADT metadata document (description, super-package, sub-packages, ...), active or inactive version. Returns it under `metadata`, with `part: "metadata"`: a summary, the details or the document as SAP sent it, per `detail`.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="read-only-program"></a>
### Read-Only / Program

<a id="getprogram-read-only-program"></a>
#### GetProgram (Read-Only / Program)
**Description:** [read-only] Reads the ABAP program (report) named by program_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `program_name` (string, required) - Program name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-search"></a>
### Read-Only / Search

<a id="searchobject-read-only-search"></a>
#### SearchObject (Read-Only / Search)
**Description:** [read-only] Search ABAP repository by object name or wildcard pattern (e.g. 'Z*'). Answers: "find object X", "does X exist", "list objects matching...", "search for program/class/table by name". Supports all repository object types — optionally filter by type (PROG, CLAS, INTF, DEVC, TABL, DDLS, DTEL, FUGR, SRVD, SRVB, BDEF, DDLX, etc.). Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/search/readonly/handleSearchObject.ts`

**Parameters:**
- `maxResults` (number, optional (default: 100)) - [read-only] Maximum number of results to return
- `object_name` (string, required) - [read-only] Object name or mask (e.g. 'MARA*')
- `object_type` (string, optional) - [read-only] Optional ABAP object type (e.g. 'TABL', 'CLAS/OC')
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="getobjectslist-read-only-search"></a>
#### GetObjectsList (Read-Only / Search)
**Description:** [read-only] Recursively lists every child repository object of the program (PROG), function group (FUGR), class (CLAS), package (DEVC) or other composite object named by parent_name, parent_tech_name and parent_type, nested includes and subcomponents included. Takes parent_name, parent_tech_name and parent_type (one parent: its list) or objects (several parents: one entry per parent, in the order given, each { parent_name, parent_type, total_objects, objects } or { parent_name, parent_type, error }). Each level of the node tree is read in one ADT batch envelope. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/search/readonly/handleGetObjectsList.ts`

**Parameters:**
- `objects` (array, optional) - [read-only] Several parents, read together (give this or parent_name)
- `parent_name` (string, optional) - [read-only] Parent object name (with parent_tech_name and parent_type; or give objects)
- `parent_tech_name` (string, optional) - [read-only] Parent technical name
- `parent_type` (string, optional) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `with_short_descriptions` (boolean, optional (default: true))) - [read-only] Include short descriptions (default: true)

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
**Description:** [read-only] Reads the OData service binding named by service_binding_name in one request: its binding document (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), each in the response_format given. Returns the part read.

**Source:** `src/handlers/service_binding/high/handleGetServiceBinding.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `response_format` (string, optional (default: xml)) - Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.
- `service_binding_name` (string, required) - Service binding name. Case-insensitive.

---

<a id="read-only-service-definition"></a>
### Read-Only / Service Definition

<a id="getservicedefinition-read-only-service-definition"></a>
#### GetServiceDefinition (Read-Only / Service Definition)
**Description:** [read-only] Reads the service definition named by service_definition_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `service_definition_name` (string, required) - ServiceDefinition name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-structure"></a>
### Read-Only / Structure

<a id="getstructureslist-read-only-structure"></a>
#### GetStructuresList (Read-Only / Structure)
**Description:** [read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree. Takes structure_name (one structure: its tree) or structure_names (several structures: one entry per structure, in the order given, each its tree answer or { structure_name, error }). Works on BASIS 7.50 and later, where the DDIC structure/table endpoints it reads exist; legacy systems (BASIS < 7.50) refuse it (issue #207). Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/structure/readonly/handleGetStructuresList.ts`

**Parameters:**
- `include_extensions` (boolean, optional (default: true)) - [read-only] Also find extension (append) structures via where-used (objects that `extend type <this> with …`). Default true. Set false to skip the (slower) where-used lookups and return includes only.
- `structure_name` (string, optional) - Structure name (or give structure_names).
- `structure_names` (array, optional) - Several structure names, read together (give this or structure_name).
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="getstructure-read-only-structure"></a>
#### GetStructure (Read-Only / Structure)
**Description:** [read-only] Reads the ABAP structure named by structure_name in one request: its definition with its fields, as source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `structure_name` (string, required) - Structure name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-system"></a>
### Read-Only / System

<a id="getservicebindingpreviewurl-read-only-system"></a>
#### GetServiceBindingPreviewUrl (Read-Only / System)
**Description:** [read-only] Build the browser URL that previews a published service binding, and the service and $metadata URLs beside it. Answers: "open the service in a browser", "preview this service binding", "what is the OData URL of this binding". Reads the binding for the service, version and protocol, and the service definition for the entity sets; the preview URL needs an entity set, and the answer names what is missing. A Web API binding answers the service URLs alone.

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
**Description:** [read-only] Retrieve ABAP type information for domains (DOMA), data elements (DTEL), table types, and structures. Returns field definitions, value ranges, fixed values, and DDIC metadata.

**Source:** `src/handlers/system/readonly/handleGetTypeInfo.ts`

**Parameters:**
- `include_structure_fallback` (boolean, optional (default: true)) - When true (default), tries DDIC structure lookup only if type lookup returns 404/empty.
- `type_name` (string, required) - Name of the ABAP type

---

<a id="gettransaction-read-only-system"></a>
#### GetTransaction (Read-Only / System)
**Description:** [read-only] Retrieve ABAP transaction (t-code) details — program, screen, authorization object, and transaction type (dialog, report, OO).

**Source:** `src/handlers/system/readonly/handleGetTransaction.ts`

**Parameters:**
- `transaction_name` (string, required) - Name of the ABAP transaction

---

<a id="runtimecreateprofilertraceparameters-read-only-system"></a>
#### RuntimeCreateProfilerTraceParameters (Read-Only / System)
**Description:** [runtime] Schedule ABAP profiler trace parameters and return profilerId (the request id) for profiled execution.

**Source:** `src/handlers/system/readonly/handleRuntimeCreateProfilerTraceParameters.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `description` (string, required) - Human-readable trace description.
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `sql_trace` (boolean, optional) - 
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="runtimelistprofilertracefiles-read-only-system"></a>
#### RuntimeListProfilerTraceFiles (Read-Only / System)
**Description:** [runtime] List ABAP profiler trace files available in ADT runtime. Returns structured entries with id, recordedAt, user, objectName, state, expiresAt, and sizing/timing fields.

**Source:** `src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts`

**Parameters:**
- None

---

<a id="runtimegetprofilertracedata-read-only-system"></a>
#### RuntimeGetProfilerTraceData (Read-Only / System)
**Description:** [runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleRuntimeGetProfilerTraceData.ts`

**Parameters:**
- `auto_drill_down_threshold` (number, optional) - Auto drill-down threshold (for statements view).
- `id` (number, optional) - Statement node ID (for statements view).
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `trace_id_or_uri` (string, required) - Profiler trace ID or full ADT trace URI.
- `view` (string, required) - Trace view to retrieve.
- `with_details` (boolean, optional) - Include statement details (for statements view).
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimegetdumpbyid-read-only-system"></a>
#### RuntimeGetDumpById (Read-Only / System)
**Description:** [runtime] Read an ABAP runtime dump by its dump_id or URI. Answers a summary — runtime error, exception, terminated program, time, user, and the source position where it terminated — and the parsed dump.

**Source:** `src/handlers/system/readonly/handleRuntimeGetDumpById.ts`

**Parameters:**
- `dump_id` (string, required) - The dump's id, or its URI as a dumps feed entry carries it.
- `response_mode` (string, optional (default: both)) - What is returned: "payload" — the parsed dump, "summary" — runtime error, exception, terminated program, time, user and termination position, "both" — summary and payload.
- `view` (string, optional (default: default)) - Dump view mode: default payload, summary section, or formatted long text.

---

<a id="runtimerunclass-read-only-system"></a>
#### RuntimeRunClass (Read-Only / System)
**Description:** [runtime] Runs the ABAP class named by class_name, which implements if_oo_adt_classrun, and returns its console output. Set profile=true to also capture a profiler trace: schedules the trace, runs the class under it, then searches the profiler feed for the id this run produced (bounded by max_trace_attempts/trace_retry_delay_ms). If the trace appears only after that bound, the run still answers success with output and profiler_id, trace_id absent — the trace is then found later in the list of profiler trace files.

**Source:** `src/handlers/system/readonly/handleRuntimeRunClass.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `class_name` (string, required) - ABAP class name to execute.
- `description` (string, optional) - Profiler trace description (only used when profile=true).
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `max_trace_attempts` (integer, optional) - Max attempts to poll the profiler feed for the trace this run produced (default 5). Only used when profile=true.
- `profile` (boolean, optional) - When true, run with the profiler and search the profiler feed for the resulting traceId. Default false.
- `sql_trace` (boolean, optional) - 
- `trace_lookup_uris` (array, optional) - Accepted for backward compatibility; no longer affects trace lookup. adt-clients 19 lists the profiler feed as one endpoint, optionally filtered by user — there is nowhere to put a URI.
- `trace_retry_delay_ms` (integer, optional) - Delay in ms between profiler-feed polling attempts (default 2000). Only used when profile=true.
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="runtimerunprogram-read-only-system"></a>
#### RuntimeRunProgram (Read-Only / System)
**Description:** [runtime] Runs the ABAP program (report) named by program_name and returns its output. Set profile=true to also start a profiler trace; the trace is then found in the list of profiler trace files (program execution is fire-and-forget, so the traceId arrives later, through that list).

**Source:** `src/handlers/system/readonly/handleRuntimeRunProgram.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `description` (string, optional) - Profiler trace description (only used when profile=true).
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `profile` (boolean, optional) - When true, run with the profiler. Default false. Trace must be located afterwards via RuntimeListProfilerTraceFiles — program execution does not return traceId synchronously.
- `program_name` (string, required) - ABAP program name to execute.
- `sql_trace` (boolean, optional) - 
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="runtimeanalyzeprofilertrace-read-only-system"></a>
#### RuntimeAnalyzeProfilerTrace (Read-Only / System)
**Description:** [runtime] Read profiler trace view and return compact analysis summary (totals + top entries). Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts`

**Parameters:**
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `top` (number, optional) - Number of top rows for summary. Default: 10.
- `trace_id_or_uri` (string, required) - Profiler trace ID or full trace URI.
- `view` (string, optional (default: hitlist)) - 
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimelistfeeds-read-only-system"></a>
#### RuntimeListFeeds (Read-Only / System)
**Description:** [runtime] Reads the ABAP short dumps (runtime errors) of the program or object named by object_name, of the user named by user, in the time range from–to, and lists the runtime feeds and their variants: also system messages and SAP Gateway errors, by feed_type; dumps also by runtime error, exception, object, package and application component. Entries come newest first; each dump carries its dump_id. When more entries remain, next_to is the `to` that reads on; incomplete_second names a second holding more entries than SAP answers in one request. Takes feed_type (one feed: its answer) or feed_types (several feeds with the same filters: one entry per feed, in the order given, each its answer or { feed_type, error }). Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleRuntimeListFeeds.ts`

**Parameters:**
- `component` (string, optional) - Dumps whose application component contains this text, in any case.
- `exception` (string, optional) - Dumps whose exception class contains this text, in any case.
- `feed_type` (string, optional) - Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.
- `feed_types` (array, optional) - Several feeds, read together with the same filters (give this or feed_type).
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Most entries to return, up to 1000; SAP answers at most 100 per request and the pages are read in turn. An answer holds whole seconds, so it may hold a few entries fewer, or a crowded second more, than asked. Default: 50.
- `object_name` (string, optional) - Dumps whose terminated object name contains this text, in any case.
- `package` (string, optional) - Dumps whose object package contains this text, in any case.
- `runtime_error` (string, optional) - Dumps whose runtime error contains this text, in any case.
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format, inclusive; pass a previous next_to here to read on.
- `user` (string, optional) - Entries of this SAP user (exact match).

---

<a id="runtimelistsystemmessages-read-only-system"></a>
#### RuntimeListSystemMessages (Read-Only / System)
**Description:** [runtime] List SM02 system messages. Returns structured entries with id, title, text, severity, validity period, and author.

**Source:** `src/handlers/system/readonly/handleRuntimeListSystemMessages.ts`

**Parameters:**
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of messages to return.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter by author username.

---

<a id="runtimegetgatewayerrorlog-read-only-system"></a>
#### RuntimeGetGatewayErrorLog (Read-Only / System)
**Description:** [runtime] List SAP Gateway error log (/IWFND/ERROR_LOG) or get error detail. Returns structured entries with type, shortText, transactionId, dateTime, username. With error_url returns full detail including serviceInfo, errorContext, sourceCode, callStack.

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
**Description:** [read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleGetSqlQuery.ts`

**Parameters:**
- `row_number` (number, optional (default: 100)) - [read-only] Maximum number of rows to return
- `sql_query` (string, required) - SQL query to execute
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="getwhereused-read-only-system"></a>
#### GetWhereUsed (Read-Only / System)
**Description:** [read-only] Lists where the object named by object_name and object_type is used — a class, interface, program, include, function group, function module (BAPI included), package, table, structure, domain, data element or CDS DDL source: every object that uses, calls or references it, with its type and package. Takes object_name and object_type (one object: its list) or objects (several objects: one entry per object, in the order given, each its list or { object_name, object_type, error }). Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleGetWhereUsed.ts`

**Parameters:**
- `disable_types` (array, optional) - Remove these ADT object types from the default scope, keeping the rest (e.g. ['CLAS/OC'] to drop class usages). Applied on top of the default scope or of enable_only_types/enable_all_types.
- `enable_all_types` (boolean, optional (default: false)) - If true, expands the scope to all available object types (Eclipse 'select all' behavior) by flipping every isSelected flag in the scope XML. Default: false (SAP default scope). Note: on large systems this can make the search significantly slower.
- `enable_only_types` (array, optional) - Restrict the search to ONLY these ADT object types (e.g. ['TABL/DS','TABL/DT'] for structures, ['DDLS/DF'] for CDS sources). SAP applies the selection server-side, so unwanted types (e.g. hundreds of CLAS/OC) are never searched nor returned — use this instead of enable_all_types to avoid huge result sets. Values must be object-type codes from THIS object's where-used scope (the searchable categories, e.g. 'CLAS/OC','INTF/OI','FUGR/FF','DDLS/DF', not result-row codes like 'FUGR/F'). If any value is not searchable for the object the call returns an error listing the supported types — it never falls back to the unfiltered default set. Takes precedence over enable_all_types.
- `object_name` (string, optional) - Name of the ABAP object (with object_type; or give objects). For function modules the name MUST be in the form 'GROUP|FM_NAME' (function group name, pipe, function module name).
- `object_type` (string, optional) - Type of the ABAP object. Case-insensitive. Accepts either a human alias or an ADT type code. Supported values: 'class' / 'clas/oc', 'interface' / 'intf/if', 'program' / 'prog/p', 'include', 'function' / 'functiongroup' / 'fugr' (function group), 'functionmodule' / 'function_module' / 'fugr/ff' (function module — see object_name format), 'package' / 'devc/k', 'table' / 'tabl/dt', 'structure' / 'stru/dt', 'domain' / 'doma/dd', 'dataelement' / 'dtel', 'view' / 'ddls/df' (CDS DDL source).
- `objects` (array, optional) - Several objects, read together (give this or object_name and object_type). The type filters apply to every object.
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="getobjectinfo-read-only-system"></a>
#### GetObjectInfo (Read-Only / System)
**Description:** [read-only] Returns the object tree of the package (DEVC), class (CLAS), program (PROG), function group (FUGR) or other object named by parent_type and parent_name. Shows root, group nodes, and terminal leaves up to maxDepth. With enrich=true each node also carries its description and package, from a repository search. Takes parent_type and parent_name (one object: its tree) or objects (several objects: one tree per object, in the order given; a failed one as { OBJECT_TYPE, OBJECT_NAME, error }). Read in ADT batch envelopes: per tier the root node structures of its nodes, then their type nodes; with enrich, the search of every node last. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleGetObjectInfo.ts`

**Parameters:**
- `enrich` (boolean, optional (default: true)) - [read-only] Whether to add description and package via SearchObject (default true)
- `maxDepth` (integer, optional (default: 1)) - [read-only] Maximum tree depth (default depends on type). Every object's own type folders and their contents are always shown (one tier); a higher value only descends further for PACKAGES, expanding nested subpackages that many tiers deep — no captured node-structure document shows a non-package object usefully recursable beyond its own type folders, so other object types are capped at one tier regardless of a higher value here.
- `objects` (array, optional) - [read-only] Several objects, read together (give this or parent_type and parent_name)
- `parent_name` (string, optional) - [read-only] Parent object name
- `parent_type` (string, optional) - [read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P); with parent_name, or give objects
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="getabapast-read-only-system"></a>
#### GetAbapAST (Read-Only / System)
**Description:** [read-only] Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format.

**Source:** `src/handlers/system/readonly/handleGetAbapAST.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to parse

---

<a id="getabapsemanticanalysis-read-only-system"></a>
#### GetAbapSemanticAnalysis (Read-Only / System)
**Description:** [read-only] Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies.

**Source:** `src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze

---

<a id="getabapsystemsymbols-read-only-system"></a>
#### GetAbapSystemSymbols (Read-Only / System)
**Description:** [read-only] Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze and resolve symbols for
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="getinactiveobjects-read-only-system"></a>
#### GetInactiveObjects (Read-Only / System)
**Description:** [read-only] Get a list of inactive ABAP objects — modified and pending activation. Shows classes, tables, CDS views, and other objects awaiting activation.

**Source:** `src/handlers/system/readonly/handleGetInactiveObjects.ts`

**Parameters:**
- None

---

<a id="getadttypes-read-only-system"></a>
#### GetAdtTypes (Read-Only / System)
**Description:** [read-only] Retrieve all valid ADT object types (CLAS, TABL, PROG, DEVC, FUGR, INTF, DDLS, DTEL, DOMA, SRVD, SRVB, BDEF, DDLX, etc.) or validate a specific type name.

**Source:** `src/handlers/system/readonly/handleGetAllTypes.ts`

**Parameters:**
- `validate_type` (string, optional) - Type name to validate (optional)

---

<a id="getobjectstructure-read-only-system"></a>
#### GetObjectStructure (Read-Only / System)
**Description:** [read-only] Returns the ADT structure of the repository object named by objecttype and objectname as a compact JSON tree.

**Source:** `src/handlers/system/readonly/handleGetObjectStructure.ts`

**Parameters:**
- `objectname` (string, required) - ADT object name (e.g. /CBY/ACQ_DDL)
- `objecttype` (string, required) - ADT object type (e.g. DDLS/DF)

---

<a id="getobjectnodefromcache-read-only-system"></a>
#### GetObjectNodeFromCache (Read-Only / System)
**Description:** [read-only] Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present.

**Source:** `src/handlers/system/readonly/handleGetObjectNodeFromCache.ts`

**Parameters:**
- `object_name` (string, required) - [read-only] Object name
- `object_type` (string, required) - [read-only] Object type
- `tech_name` (string, required) - [read-only] Technical name

---

<a id="describebylist-read-only-system"></a>
#### DescribeByList (Read-Only / System)
**Description:** [read-only] Describes each repository object named in objects, in one call: its type, description and package. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleDescribeByList.ts`

**Parameters:**
- `objects` (array, required) - [read-only] Object name (required, must be valid ABAP object name or mask)
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="getpackagetree-read-only-system"></a>
#### GetPackageTree (Read-Only / System)
**Description:** [read-only] Returns the complete tree of the ABAP package named by package_name: its subpackages and objects. Returns hierarchical tree with object names, types, and descriptions. Takes package_name (one package: its tree) or package_names (several packages: one entry per package, in the order given, each { package_name, tree, metadata } or { package_name, error }). Read in ADT batch envelopes: the package metadata with the root node structure, then each level of the walk. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/high/handleGetPackageTree.ts`

**Parameters:**
- `debug` (boolean, optional (default: false)) - Include diagnostic metadata in response (counts, types, hierarchy info). Default: false
- `include_descriptions` (boolean, optional (default: true)) - Include object descriptions in response. Default: true
- `include_subpackages` (boolean, optional (default: true)) - Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true
- `max_depth` (integer, optional (default: 5)) - Maximum depth for recursive package traversal. Default: 5
- `package_name` (string, optional) - Package name (give this or package_names)
- `package_names` (array, optional) - Several package names, read together (give this or package_name)
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="searchsource-read-only-system"></a>
#### SearchSource (Read-Only / System)
**Description:** [read-only] Search ABAP source text inside one or more packages (programs, function groups, classes). Onprem-only (cloud lacks an indexed source-search endpoint). `packages` accepts `*` masks (Z*, /NS/Z*) alongside exact names; mask resolution is best-effort and scoped to the ADT repository-search result window — some matching packages may be left unscanned. For certainty, pass concrete package names. When using masks, narrow the mask itself and use `object_types`, `object_filter`, and `max_objects` as scan-target controls that apply after package resolution. Comments are searched by default; set exclude_comments=true to drop col-1 `*` and full-line `"` comments. The `version` parameter affects PROG and CLAS main include reads only — FUGR subinclude reads always go against the active version (the include endpoint reads the active version alone). `truncated.by_object_cap` means at least one object had MORE hits than `max_hits_per_object`, so that object's hits were capped. The object-count limit is `max_objects` (which sets `truncated.by_max_objects`). To avoid `by_object_cap`, raise `max_hits_per_object`. The scan is read in ADT batch envelopes, one per phase: the searches of the package masks, each level of the package walk, then the sources of the scanned objects (main sources and function group structures, then function group includes and function modules); `time_budget_ms` is checked between phases. Run only ONE SearchSource per destination at a time — multiple parallel SearchSource calls against the same SAP system saturate the scan backend and can make all of them time out. Prefer combining terms into a single call over parallel calls. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/readonly/handleSearchSource.ts`

**Parameters:**
- None

---

<a id="read-only-table"></a>
### Read-Only / Table

<a id="gettablecontents-read-only-table"></a>
#### GetTableContents (Read-Only / Table)
**Description:** [read-only] Retrieve contents (data preview) of an ABAP database table or CDS view. Returns rows of data like SE16/SE16N. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/table/readonly/handleGetTableContents.ts`

**Parameters:**
- None

---

<a id="gettable-read-only-table"></a>
#### GetTable (Read-Only / Table)
**Description:** [read-only] Reads the ABAP database table named by table_name in one request: its definition with its fields, as source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `table_name` (string, required) - Table name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-transport"></a>
### Read-Only / Transport

<a id="gettransport-read-only-transport"></a>
#### GetTransport (Read-Only / Transport)
**Description:** [read-only] Retrieve ABAP transport request information including metadata, included objects, and status from SAP system.

**Source:** `src/handlers/transport/readonly/handleGetTransport.ts`

**Parameters:**
- `include_objects` (boolean, optional (default: true))) - Include list of objects in transport (default: true)
- `include_tasks` (boolean, optional (default: true))) - Include list of tasks in transport (default: true)
- `transport_number` (string, required) - Transport request number, not a task

---

<a id="listtransports-read-only-transport"></a>
#### ListTransports (Read-Only / Transport)
**Description:** [read-only] List transport requests for the current or specified user. Returns modifiable and/or released workbench and customizing requests. `user` and modifiable-only are both applied client-side, over every request the server's default search configuration answers; ADT receives the default search alone. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/transport/readonly/handleListTransports.ts`

**Parameters:**
- `modifiable_only` (boolean, optional) - Only return modifiable (not yet released) transports; applied client-side. Default: true.
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `user` (string, optional) - The user to filter to: an SAP user id (matched in upper case); applied client-side. If not provided, defaults to the current session user, so an unfiltered call already answers only that user's transports.

---

<a id="readtransportobjects-read-only-transport"></a>
#### ReadTransportObjects (Read-Only / Transport)
**Description:** [read-only] Lists the objects the transport request or task named by transport_number holds, each with its `position`, which a removal of the entry names. A task answers its own entries; a request answers every task's entries, each once, with its `task` number and position — the task a removal addresses.

**Source:** `src/handlers/transport/readonly/handleReadTransportObjects.ts`

**Parameters:**
- `transport_number` (string, required) - Transport REQUEST or TASK number. A task answers its own entries; a request answers the entries of each of its tasks, each with its `task` number — the task a removal addresses.

---

<a id="readtransportactionlog-read-only-transport"></a>
#### ReadTransportActionLog (Read-Only / Transport)
**Description:** [read-only] Reads the action log of the transport request named by transport_number: one entry per lifecycle event — created, object added, object deleted, owner changed. It confirms that an object entry was taken out of the request, since a removal answers by echoing what it was asked.

**Source:** `src/handlers/transport/readonly/handleReadTransportActionLog.ts`

**Parameters:**
- `transport_number` (string, required) - Transport REQUEST or TASK number. A request answers its own lifecycle events; a task answers the events of the objects on it.

---

<a id="read-only-unit-test"></a>
### Read-Only / Unit Test

<a id="getunittestresult-read-only-unit-test"></a>
#### GetUnitTestResult (Read-Only / Unit Test)
**Description:** [read-only] Reads the result of the ABAP Unit test run named by run_id, for a run still running when its start answered. Waits for it within a bound.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Parameters:**
- `run_id` (string, required) - Run id a unit test run answered.

---

*Last updated: 2026-10-20*
