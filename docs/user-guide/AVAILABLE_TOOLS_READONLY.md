# Read-Only Tools - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

- Level: Read-Only
- Total tools: 37

## Navigation

- [Read-Only Group](#read-only-group)
  - [Enhancement](#read-only-enhancement)
    - [GetEnhancementImpl](#getenhancementimpl-read-only-enhancement)
    - [GetEnhancements](#getenhancements-read-only-enhancement)
    - [GetEnhancementSpot](#getenhancementspot-read-only-enhancement)
  - [Function](#read-only-function)
    - [GetFunction](#getfunction-read-only-function)
  - [Include](#read-only-include)
    - [GetInclude](#getinclude-read-only-include)
    - [GetIncludesList](#getincludeslist-read-only-include)
  - [Package](#read-only-package)
    - [GetPackageContents](#getpackagecontents-read-only-package)
  - [Program](#read-only-program)
    - [GetProgFullCode](#getprogfullcode-read-only-program)
  - [Search](#read-only-search)
    - [GetObjectsByType](#getobjectsbytype-read-only-search)
    - [GetObjectsList](#getobjectslist-read-only-search)
    - [SearchObject](#searchobject-read-only-search)
  - [System](#read-only-system)
    - [DescribeByList](#describebylist-read-only-system)
    - [GetAbapAST](#getabapast-read-only-system)
    - [GetAbapSemanticAnalysis](#getabapsemanticanalysis-read-only-system)
    - [GetAbapSystemSymbols](#getabapsystemsymbols-read-only-system)
    - [GetAdtTypes](#getadttypes-read-only-system)
    - [GetInactiveObjects](#getinactiveobjects-read-only-system)
    - [GetObjectInfo](#getobjectinfo-read-only-system)
    - [GetObjectNodeFromCache](#getobjectnodefromcache-read-only-system)
    - [GetObjectStructure](#getobjectstructure-read-only-system)
    - [GetSession](#getsession-read-only-system)
    - [GetSqlQuery](#getsqlquery-read-only-system)
    - [GetTransaction](#gettransaction-read-only-system)
    - [GetTypeInfo](#gettypeinfo-read-only-system)
    - [GetWhereUsed](#getwhereused-read-only-system)
    - [RuntimeAnalyzeDump](#runtimeanalyzedump-read-only-system)
    - [RuntimeAnalyzeProfilerTrace](#runtimeanalyzeprofilertrace-read-only-system)
    - [RuntimeCreateProfilerTraceParameters](#runtimecreateprofilertraceparameters-read-only-system)
    - [RuntimeGetDumpById](#runtimegetdumpbyid-read-only-system)
    - [RuntimeGetProfilerTraceData](#runtimegetprofilertracedata-read-only-system)
    - [RuntimeListDumps](#runtimelistdumps-read-only-system)
    - [RuntimeListProfilerTraceFiles](#runtimelistprofilertracefiles-read-only-system)
    - [RuntimeRunClassWithProfiling](#runtimerunclasswithprofiling-read-only-system)
    - [RuntimeRunProgramWithProfiling](#runtimerunprogramwithprofiling-read-only-system)
  - [Table](#read-only-table)
    - [GetTableContents](#gettablecontents-read-only-table)
  - [Transport](#read-only-transport)
    - [GetTransport](#gettransport-read-only-transport)
    - [ResolveTransport](#resolvetransport-read-only-transport)

---

<a id="read-only-group"></a>
## Read-Only Group

<a id="read-only-enhancement"></a>
### Read-Only / Enhancement

<a id="getenhancementimpl-read-only-enhancement"></a>
#### GetEnhancementImpl (Read-Only / Enhancement)
**Description:** [read-only] Retrieve source code of a specific enhancement implementation by its name and enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts`

**Parameters:**
- `enhancement_name` (string, required) - [read-only] Name of the enhancement implementation
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="getenhancements-read-only-enhancement"></a>
#### GetEnhancements (Read-Only / Enhancement)
**Description:** [read-only] Retrieve a list of enhancements for a given ABAP object.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancements.ts`

**Parameters:**
- `object_name` (string, required) - Name of the ABAP object
- `object_type` (string, required) - [read-only] Type of the ABAP object

---

<a id="getenhancementspot-read-only-enhancement"></a>
#### GetEnhancementSpot (Read-Only / Enhancement)
**Description:** [read-only] Retrieve metadata and list of implementations for a specific enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts`

**Parameters:**
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="read-only-function"></a>
### Read-Only / Function

<a id="getfunction-read-only-function"></a>
#### GetFunction (Read-Only / Function)
**Description:** [read-only] Retrieve ABAP Function Module source code.

**Source:** `src/handlers/function/readonly/handleGetFunction.ts`

**Parameters:**
- None

---

<a id="read-only-include"></a>
### Read-Only / Include

<a id="getinclude-read-only-include"></a>
#### GetInclude (Read-Only / Include)
**Description:** [read-only] Retrieve source code of a specific ABAP include file.

**Source:** `src/handlers/include/readonly/handleGetInclude.ts`

**Parameters:**
- None

---

<a id="getincludeslist-read-only-include"></a>
#### GetIncludesList (Read-Only / Include)
**Description:** [read-only] Recursively discover and list ALL include files within an ABAP program or include.

**Source:** `src/handlers/include/readonly/handleGetIncludesList.ts`

**Parameters:**
- `detailed` (boolean, optional (default: false)) - [read-only] If true, returns structured JSON with metadata and raw XML.
- `object_name` (string, required) - Name of the ABAP program or include
- `object_type` (string, required) - [read-only] ADT object type (e.g. PROG/P, PROG/I, FUGR, CLAS/OC)
- `timeout` (number, optional) - [read-only] Timeout in ms for each ADT request.

---

<a id="read-only-package"></a>
### Read-Only / Package

<a id="getpackagecontents-read-only-package"></a>
#### GetPackageContents (Read-Only / Package)
**Description:** [read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages.

**Source:** `src/handlers/package/readonly/handleGetPackageContents.ts`

**Parameters:**
- None

---

<a id="read-only-program"></a>
### Read-Only / Program

<a id="getprogfullcode-read-only-program"></a>
#### GetProgFullCode (Read-Only / Program)
**Description:** [read-only] Returns the full code for a program or function group, including all includes, in tree traversal order.

**Source:** `src/handlers/program/readonly/handleGetProgFullCode.ts`

**Parameters:**
- `name` (string, required) - [read-only] Technical name of the program or function group (e.g., 
- `type` (string, required) - [read-only] 

---

<a id="read-only-search"></a>
### Read-Only / Search

<a id="getobjectsbytype-read-only-search"></a>
#### GetObjectsByType (Read-Only / Search)
**Description:** [read-only] Retrieves all ABAP objects of a specific type under a given node.

**Source:** `src/handlers/search/readonly/handleGetObjectsByType.ts`

**Parameters:**
- `format` (string, optional) - [read-only] Output format: 
- `node_id` (string, required) - [read-only] Node ID
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type
- `with_short_descriptions` (boolean, optional) - [read-only] Include short descriptions

---

<a id="getobjectslist-read-only-search"></a>
#### GetObjectsList (Read-Only / Search)
**Description:** [read-only] Recursively retrieves all valid ABAP repository objects for a given parent (program, function group, etc.) including nested includes.

**Source:** `src/handlers/search/readonly/handleGetObjectsList.ts`

**Parameters:**
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `with_short_descriptions` (boolean, optional (default: true))) - [read-only] Include short descriptions (default: true)

---

<a id="searchobject-read-only-search"></a>
#### SearchObject (Read-Only / Search)
**Description:** [read-only] Search for ABAP objects by name pattern. Parameters: object_name (with or without mask), object_type (optional), maxResults (optional). If object_type is specified, results are filtered by type.

**Source:** `src/handlers/search/readonly/handleSearchObject.ts`

**Parameters:**
- `maxResults` (number, optional (default: 100)) - [read-only] Maximum number of results to return
- `object_name` (string, required) - [read-only] Object name or mask (e.g. 
- `object_type` (string, optional) - [read-only] Optional ABAP object type (e.g. 

---

<a id="read-only-system"></a>
### Read-Only / System

<a id="describebylist-read-only-system"></a>
#### DescribeByList (Read-Only / System)
**Description:** [read-only] Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.

**Source:** `src/handlers/system/readonly/handleDescribeByList.ts`

**Parameters:**
- `objects` (array, required) - [read-only] Object name (required, must be valid ABAP object name or mask)

---

<a id="getabapast-read-only-system"></a>
#### GetAbapAST (Read-Only / System)
**Description:** [read-only] Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format.

**Source:** `src/handlers/system/readonly/handleGetAbapAST.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to parse
- `filePath` (string, optional) - Optional file path to write the result to

---

<a id="getabapsemanticanalysis-read-only-system"></a>
#### GetAbapSemanticAnalysis (Read-Only / System)
**Description:** [read-only] Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies.

**Source:** `src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze
- `filePath` (string, optional) - Optional file path to write the result to

---

<a id="getabapsystemsymbols-read-only-system"></a>
#### GetAbapSystemSymbols (Read-Only / System)
**Description:** [read-only] Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.

**Source:** `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze and resolve symbols for
- `filePath` (string, optional) - Optional file path to write the result to

---

<a id="getadttypes-read-only-system"></a>
#### GetAdtTypes (Read-Only / System)
**Description:** [read-only] Retrieve all valid ADT object types.

**Source:** `src/handlers/system/readonly/handleGetAllTypes.ts`

**Parameters:**
- `validate_type` (string, optional) - Type name to validate (optional)

---

<a id="getinactiveobjects-read-only-system"></a>
#### GetInactiveObjects (Read-Only / System)
**Description:** [read-only] Get a list of inactive ABAP objects (objects that have been modified but not activated).

**Source:** `src/handlers/system/readonly/handleGetInactiveObjects.ts`

**Parameters:**
- None

---

<a id="getobjectinfo-read-only-system"></a>
#### GetObjectInfo (Read-Only / System)
**Description:** [read-only] Return ABAP object tree: root, group nodes, and terminal leaves up to maxDepth. Enrich each node via SearchObject if enrich=true. Group nodes are included for hierarchy. Each node has node_type: root, point, end.

**Source:** `src/handlers/system/readonly/handleGetObjectInfo.ts`

**Parameters:**
- `enrich` (boolean, optional (default: true)) - [read-only] Whether to add description and package via SearchObject (default true)
- `maxDepth` (integer, optional (default: 1)) - [read-only] Maximum tree depth (default depends on type)
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_type` (string, required) - [read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P)

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

<a id="getobjectstructure-read-only-system"></a>
#### GetObjectStructure (Read-Only / System)
**Description:** [read-only] Retrieve ADT object structure as a compact JSON tree.

**Source:** `src/handlers/system/readonly/handleGetObjectStructure.ts`

**Parameters:**
- `objectname` (string, required) - ADT object name (e.g. /CBY/ACQ_DDL)
- `objecttype` (string, required) - ADT object type (e.g. DDLS/DF)

---

<a id="getsession-read-only-system"></a>
#### GetSession (Read-Only / System)
**Description:** [read-only] Get a new session ID and current session state (cookies, CSRF token) for reuse across multiple ADT operations. Use this to maintain the same session and lock handle across multiple requests.

**Source:** `src/handlers/system/readonly/handleGetSession.ts`

**Parameters:**
- `force_new` (boolean, optional) - Force creation of a new session even if one exists. Default: false

---

<a id="getsqlquery-read-only-system"></a>
#### GetSqlQuery (Read-Only / System)
**Description:** [read-only] Execute freestyle SQL queries via SAP ADT Data Preview API.

**Source:** `src/handlers/system/readonly/handleGetSqlQuery.ts`

**Parameters:**
- `row_number` (number, optional (default: 100)) - [read-only] Maximum number of rows to return
- `sql_query` (string, required) - SQL query to execute

---

<a id="gettransaction-read-only-system"></a>
#### GetTransaction (Read-Only / System)
**Description:** [read-only] Retrieve ABAP transaction details.

**Source:** `src/handlers/system/readonly/handleGetTransaction.ts`

**Parameters:**
- `transaction_name` (string, required) - Name of the ABAP transaction

---

<a id="gettypeinfo-read-only-system"></a>
#### GetTypeInfo (Read-Only / System)
**Description:** [read-only] Retrieve ABAP type information.

**Source:** `src/handlers/system/readonly/handleGetTypeInfo.ts`

**Parameters:**
- `include_structure_fallback` (boolean, optional (default: true)) - When true (default), tries DDIC structure lookup only if type lookup returns 404/empty.
- `type_name` (string, required) - Name of the ABAP type

---

<a id="getwhereused-read-only-system"></a>
#### GetWhereUsed (Read-Only / System)
**Description:** [read-only] Retrieve where-used references for ABAP objects via ADT usageReferences. Returns parsed list of referencing objects with their types and packages.

**Source:** `src/handlers/system/readonly/handleGetWhereUsed.ts`

**Parameters:**
- `enable_all_types` (boolean, optional (default: false)) - If true, searches in all available object types (Eclipse 
- `object_name` (string, required) - Name of the ABAP object
- `object_type` (string, required) - Type of the ABAP object (class, interface, program, table, etc.)

---

<a id="runtimeanalyzedump-read-only-system"></a>
#### RuntimeAnalyzeDump (Read-Only / System)
**Description:** [runtime] Read runtime dump by ID and return compact analysis summary with key fields.

**Source:** `src/handlers/system/readonly/handleRuntimeAnalyzeDump.ts`

**Parameters:**
- `dump_id` (string, required) - Runtime dump ID.
- `include_payload` (boolean, optional (default: true)) - Include full parsed payload in response.
- `view` (string, optional (default: default)) - Dump view mode to analyze: default payload, summary section, or formatted long text.

---

<a id="runtimeanalyzeprofilertrace-read-only-system"></a>
#### RuntimeAnalyzeProfilerTrace (Read-Only / System)
**Description:** [runtime] Read profiler trace view and return compact analysis summary (totals + top entries).

**Source:** `src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts`

**Parameters:**
- `top` (number, optional) - Number of top rows for summary. Default: 10.
- `trace_id_or_uri` (string, required) - Profiler trace ID or full trace URI.
- `view` (string, optional (default: hitlist)) - 
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimecreateprofilertraceparameters-read-only-system"></a>
#### RuntimeCreateProfilerTraceParameters (Read-Only / System)
**Description:** [runtime] Create ABAP profiler trace parameters and return profilerId (URI) for profiled execution.

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

<a id="runtimegetdumpbyid-read-only-system"></a>
#### RuntimeGetDumpById (Read-Only / System)
**Description:** [runtime] Read a specific ABAP runtime dump by dump ID. Returns parsed JSON payload.

**Source:** `src/handlers/system/readonly/handleRuntimeGetDumpById.ts`

**Parameters:**
- `dump_id` (string, required) - Runtime dump ID (for example: 694AB694097211F1929806D06D234D38).
- `view` (string, optional (default: default)) - Dump view mode: default payload, summary section, or formatted long text.

---

<a id="runtimegetprofilertracedata-read-only-system"></a>
#### RuntimeGetProfilerTraceData (Read-Only / System)
**Description:** [runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload.

**Source:** `src/handlers/system/readonly/handleRuntimeGetProfilerTraceData.ts`

**Parameters:**
- `auto_drill_down_threshold` (number, optional) - Auto drill-down threshold (for statements view).
- `id` (number, optional) - Statement node ID (for statements view).
- `trace_id_or_uri` (string, required) - Profiler trace ID or full ADT trace URI.
- `view` (string, required) - Trace view to retrieve.
- `with_details` (boolean, optional) - Include statement details (for statements view).
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimelistdumps-read-only-system"></a>
#### RuntimeListDumps (Read-Only / System)
**Description:** [runtime] List ABAP runtime dumps with optional user filter and paging. Returns parsed JSON payload.

**Source:** `src/handlers/system/readonly/handleRuntimeListDumps.ts`

**Parameters:**
- `inlinecount` (string, optional) - Include total count metadata.
- `orderby` (string, optional) - ADT order by expression.
- `skip` (number, optional) - Number of records to skip.
- `top` (number, optional) - Maximum number of records to return.
- `user` (string, optional) - Optional username filter. If omitted, dumps for all users are returned.

---

<a id="runtimelistprofilertracefiles-read-only-system"></a>
#### RuntimeListProfilerTraceFiles (Read-Only / System)
**Description:** [runtime] List ABAP profiler trace files available in ADT runtime. Returns parsed JSON payload.

**Source:** `src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts`

**Parameters:**
- None

---

<a id="runtimerunclasswithprofiling-read-only-system"></a>
#### RuntimeRunClassWithProfiling (Read-Only / System)
**Description:** [runtime] Execute ABAP class with profiler enabled and return created profilerId + traceId.

**Source:** `src/handlers/system/readonly/handleRuntimeRunClassWithProfiling.ts`

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
- `description` (string, optional) - Profiler trace description.
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `sql_trace` (boolean, optional) - 
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="runtimerunprogramwithprofiling-read-only-system"></a>
#### RuntimeRunProgramWithProfiling (Read-Only / System)
**Description:** [runtime] Execute ABAP program with profiler enabled and return created profilerId + traceId.

**Source:** `src/handlers/system/readonly/handleRuntimeRunProgramWithProfiling.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `description` (string, optional) - Profiler trace description.
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `program_name` (string, required) - ABAP program name to execute.
- `sql_trace` (boolean, optional) - 
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="read-only-table"></a>
### Read-Only / Table

<a id="gettablecontents-read-only-table"></a>
#### GetTableContents (Read-Only / Table)
**Description:** [read-only] Retrieve contents of an ABAP table.

**Source:** `src/handlers/table/readonly/handleGetTableContents.ts`

**Parameters:**
- None

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
- `transport_number` (string, required) - Transport request number (e.g., E19K905635, DEVK905123)

---

<a id="resolvetransport-read-only-transport"></a>
#### ResolveTransport (Read-Only / Transport)
**Description:** [read-only] Resolve transport request for an ABAP object. Returns locked transport, available transports, and whether the package is local. Call before create/update to determine the correct transport request.

**Source:** `src/handlers/transport/readonly/handleResolveTransport.ts`

**Parameters:**
- `object_name` (string, optional) - Object name, e.g. ZCL_MY_CLASS.
- `object_type` (string, optional) - Object type, e.g. CLAS, PROG, DDLS, TABL, DOMA, DTEL, FUGR, INTF, DEVC, SRVD, BDEF, DDLX.
- `object_uri` (string, optional) - Object ADT URI, e.g. /sap/bc/adt/oo/classes/zcl_my_class. Optional.
- `operation` (string, optional) - Operation: I = insert (create new object), U = update (modify existing). Default: I.
- `package_name` (string, required) - Package name (DEVCLASS), e.g. ZPACKAGE, $TMP, ZLOCAL.
- `pgmid` (string, optional) - Program ID, e.g. R3TR. Default: R3TR.

---

*Last updated: 2026-02-27*
