# Read-Only Tools - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

- Level: Read-Only
- Total tools: 54

## Navigation

- [Read-Only Group](#read-only-group)
  - [Behavior Definition](#read-only-behavior-definition)
    - [ReadBehaviorDefinition](#readbehaviordefinition-read-only-behavior-definition)
  - [Behavior Implementation](#read-only-behavior-implementation)
    - [ReadBehaviorImplementation](#readbehaviorimplementation-read-only-behavior-implementation)
  - [Class](#read-only-class)
    - [ReadClass](#readclass-read-only-class)
  - [Data Element](#read-only-data-element)
    - [ReadDataElement](#readdataelement-read-only-data-element)
  - [Domain](#read-only-domain)
    - [ReadDomain](#readdomain-read-only-domain)
  - [Enhancement](#read-only-enhancement)
    - [GetEnhancementImpl](#getenhancementimpl-read-only-enhancement)
    - [GetEnhancements](#getenhancements-read-only-enhancement)
    - [GetEnhancementSpot](#getenhancementspot-read-only-enhancement)
  - [Function Group](#read-only-function-group)
    - [ReadFunctionGroup](#readfunctiongroup-read-only-function-group)
  - [Function Module](#read-only-function-module)
    - [ReadFunctionModule](#readfunctionmodule-read-only-function-module)
  - [Include](#read-only-include)
    - [GetInclude](#getinclude-read-only-include)
    - [GetIncludesList](#getincludeslist-read-only-include)
  - [Interface](#read-only-interface)
    - [ReadInterface](#readinterface-read-only-interface)
  - [Metadata Extension](#read-only-metadata-extension)
    - [ReadMetadataExtension](#readmetadataextension-read-only-metadata-extension)
  - [Package](#read-only-package)
    - [GetPackageContents](#getpackagecontents-read-only-package)
    - [ReadPackage](#readpackage-read-only-package)
  - [Program](#read-only-program)
    - [GetProgFullCode](#getprogfullcode-read-only-program)
    - [ReadProgram](#readprogram-read-only-program)
  - [Search](#read-only-search)
    - [GetObjectsByType](#getobjectsbytype-read-only-search)
    - [GetObjectsList](#getobjectslist-read-only-search)
    - [SearchObject](#searchobject-read-only-search)
  - [Service Binding](#read-only-service-binding)
    - [ReadServiceBinding](#readservicebinding-read-only-service-binding)
  - [Service Definition](#read-only-service-definition)
    - [ReadServiceDefinition](#readservicedefinition-read-only-service-definition)
  - [Structure](#read-only-structure)
    - [ReadStructure](#readstructure-read-only-structure)
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
    - [RuntimeAnalyzeProfilerTrace](#runtimeanalyzeprofilertrace-read-only-system)
    - [RuntimeCreateProfilerTraceParameters](#runtimecreateprofilertraceparameters-read-only-system)
    - [RuntimeGetDumpById](#runtimegetdumpbyid-read-only-system)
    - [RuntimeGetGatewayErrorLog](#runtimegetgatewayerrorlog-read-only-system)
    - [RuntimeGetProfilerTraceData](#runtimegetprofilertracedata-read-only-system)
    - [RuntimeListFeeds](#runtimelistfeeds-read-only-system)
    - [RuntimeListProfilerTraceFiles](#runtimelistprofilertracefiles-read-only-system)
    - [RuntimeListSystemMessages](#runtimelistsystemmessages-read-only-system)
    - [RuntimeRunClassWithProfiling](#runtimerunclasswithprofiling-read-only-system)
    - [RuntimeRunProgramWithProfiling](#runtimerunprogramwithprofiling-read-only-system)
  - [Table](#read-only-table)
    - [GetTableContents](#gettablecontents-read-only-table)
    - [ReadTable](#readtable-read-only-table)
  - [Transport](#read-only-transport)
    - [GetTransport](#gettransport-read-only-transport)
    - [ListTransports](#listtransports-read-only-transport)
  - [View](#read-only-view)
    - [ReadView](#readview-read-only-view)

---

<a id="read-only-group"></a>
## Read-Only Group

<a id="read-only-behavior-definition"></a>
### Read-Only / Behavior Definition

<a id="readbehaviordefinition-read-only-behavior-definition"></a>
#### ReadBehaviorDefinition (Read-Only / Behavior Definition)
**Description:** [read-only] Read ABAP RAP behavior definition (BDEF) source code and metadata. Answers: 

**Source:** `src/handlers/behavior_definition/readonly/handleReadBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - Behavior definition name (e.g., Z_MY_BDEF).
- `version` (string, optional (default: active)) - Version to read: 

---

<a id="read-only-behavior-implementation"></a>
### Read-Only / Behavior Implementation

<a id="readbehaviorimplementation-read-only-behavior-implementation"></a>
#### ReadBehaviorImplementation (Read-Only / Behavior Implementation)
**Description:** [read-only] Read ABAP RAP behavior implementation source code and metadata. Answers: 

**Source:** `src/handlers/behavior_implementation/readonly/handleReadBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - Behavior implementation name (e.g., ZBP_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: 

---

<a id="read-only-class"></a>
### Read-Only / Class

<a id="readclass-read-only-class"></a>
#### ReadClass (Read-Only / Class)
**Description:** [read-only] Read ABAP class source code and metadata. Answers: 

**Source:** `src/handlers/class/readonly/handleReadClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: 

---

<a id="read-only-data-element"></a>
### Read-Only / Data Element

<a id="readdataelement-read-only-data-element"></a>
#### ReadDataElement (Read-Only / Data Element)
**Description:** [read-only] Read ABAP data element definition and metadata. Answers: 

**Source:** `src/handlers/data_element/readonly/handleReadDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `version` (string, optional (default: active)) - Version to read: 

---

<a id="read-only-domain"></a>
### Read-Only / Domain

<a id="readdomain-read-only-domain"></a>
#### ReadDomain (Read-Only / Domain)
**Description:** [read-only] Read ABAP domain definition and metadata. Answers: 

**Source:** `src/handlers/domain/readonly/handleReadDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_DOMAIN).
- `version` (string, optional (default: active)) - Version to read: 

---

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

<a id="read-only-function-group"></a>
### Read-Only / Function Group

<a id="readfunctiongroup-read-only-function-group"></a>
#### ReadFunctionGroup (Read-Only / Function Group)
**Description:** [read-only] Read ABAP function group source code and metadata. Answers: 

**Source:** `src/handlers/function_group/readonly/handleReadFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_MY_FG).
- `version` (string, optional (default: active)) - Version to read: 

---

<a id="read-only-function-module"></a>
### Read-Only / Function Module

<a id="readfunctionmodule-read-only-function-module"></a>
#### ReadFunctionModule (Read-Only / Function Module)
**Description:** [read-only] Read ABAP function module source code and metadata. Answers: 

**Source:** `src/handlers/function_module/readonly/handleReadFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module (e.g., Z_MY_FG).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FM).
- `version` (string, optional (default: active)) - Version to read: 

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

<a id="read-only-interface"></a>
### Read-Only / Interface

<a id="readinterface-read-only-interface"></a>
#### ReadInterface (Read-Only / Interface)
**Description:** [read-only] Read ABAP interface source code and metadata. Answers: 

**Source:** `src/handlers/interface/readonly/handleReadInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).
- `version` (string, optional (default: active)) - Version to read: 

---

<a id="read-only-metadata-extension"></a>
### Read-Only / Metadata Extension

<a id="readmetadataextension-read-only-metadata-extension"></a>
#### ReadMetadataExtension (Read-Only / Metadata Extension)
**Description:** [read-only] Read ABAP metadata extension (DDLX) source code and metadata. Answers: 

**Source:** `src/handlers/metadata_extension/readonly/handleReadMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - Metadata extension name (e.g., Z_MY_DDLX).
- `version` (string, optional (default: active)) - Version to read: 

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

<a id="readpackage-read-only-package"></a>
#### ReadPackage (Read-Only / Package)
**Description:** [read-only] Read ABAP package definition and metadata. Answers: 

**Source:** `src/handlers/package/readonly/handleReadPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., Z_MY_PACKAGE).
- `version` (string, optional (default: active)) - Version to read: 

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

<a id="readprogram-read-only-program"></a>
#### ReadProgram (Read-Only / Program)
**Description:** [read-only] Read ABAP program (report) source code and metadata. Answers: 

**Source:** `src/handlers/program/readonly/handleReadProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `version` (string, optional (default: active)) - Version to read: 

---

<a id="read-only-search"></a>
### Read-Only / Search

<a id="getobjectsbytype-read-only-search"></a>
#### GetObjectsByType (Read-Only / Search)
**Description:** [read-only] Retrieves all ABAP objects of a specific type (classes, tables, programs, interfaces, etc.) under a given parent node. Useful for listing all objects of one type within a package or composite object.

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
**Description:** [read-only] Recursively retrieves all child ABAP repository objects for a given parent — programs (PROG), function groups (FUGR), classes (CLAS), packages (DEVC), and other composite objects — including nested includes and subcomponents.

**Source:** `src/handlers/search/readonly/handleGetObjectsList.ts`

**Parameters:**
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `with_short_descriptions` (boolean, optional (default: true))) - [read-only] Include short descriptions (default: true)

---

<a id="searchobject-read-only-search"></a>
#### SearchObject (Read-Only / Search)
**Description:** [read-only] Search ABAP repository by object name or wildcard pattern (e.g. \

**Source:** `src/handlers/search/readonly/handleSearchObject.ts`

**Parameters:**
- `maxResults` (number, optional (default: 100)) - [read-only] Maximum number of results to return
- `object_name` (string, required) - [read-only] Object name or mask (e.g. 
- `object_type` (string, optional) - [read-only] Optional ABAP object type (e.g. 

---

<a id="read-only-service-binding"></a>
### Read-Only / Service Binding

<a id="readservicebinding-read-only-service-binding"></a>
#### ReadServiceBinding (Read-Only / Service Binding)
**Description:** [read-only] Read ABAP service binding (SRVB) payload and metadata. Answers: 

**Source:** `src/handlers/service_binding/readonly/handleReadServiceBinding.ts`

**Parameters:**
- `service_binding_name` (string, required) - Service binding name (e.g., ZUI_MY_BINDING).

---

<a id="read-only-service-definition"></a>
### Read-Only / Service Definition

<a id="readservicedefinition-read-only-service-definition"></a>
#### ReadServiceDefinition (Read-Only / Service Definition)
**Description:** [read-only] Read ABAP service definition (SRVD) source code and metadata. Answers: 

**Source:** `src/handlers/service_definition/readonly/handleReadServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - Service definition name (e.g., Z_MY_SRVD).
- `version` (string, optional (default: active)) - Version to read: 

---

<a id="read-only-structure"></a>
### Read-Only / Structure

<a id="readstructure-read-only-structure"></a>
#### ReadStructure (Read-Only / Structure)
**Description:** [read-only] Read ABAP structure definition and metadata. Answers: 

**Source:** `src/handlers/structure/readonly/handleReadStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `version` (string, optional (default: active)) - Version to read: 

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
**Description:** [read-only] Retrieve all valid ADT object types (CLAS, TABL, PROG, DEVC, FUGR, INTF, DDLS, DTEL, DOMA, SRVD, SRVB, BDEF, DDLX, etc.) or validate a specific type name.

**Source:** `src/handlers/system/readonly/handleGetAllTypes.ts`

**Parameters:**
- `validate_type` (string, optional) - Type name to validate (optional)

---

<a id="getinactiveobjects-read-only-system"></a>
#### GetInactiveObjects (Read-Only / System)
**Description:** [read-only] Get a list of inactive ABAP objects — modified but not yet activated, pending activation. Shows classes, tables, CDS views, and other objects awaiting activation.

**Source:** `src/handlers/system/readonly/handleGetInactiveObjects.ts`

**Parameters:**
- None

---

<a id="getobjectinfo-read-only-system"></a>
#### GetObjectInfo (Read-Only / System)
**Description:** [read-only] Return ABAP object tree structure for packages (DEVC), classes (CLAS), programs (PROG), function groups (FUGR), and other objects. Shows root, group nodes, and terminal leaves up to maxDepth. Enrich each node with description and package via SearchObject if enrich=true.

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
**Description:** [read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries.

**Source:** `src/handlers/system/readonly/handleGetSqlQuery.ts`

**Parameters:**
- `row_number` (number, optional (default: 100)) - [read-only] Maximum number of rows to return
- `sql_query` (string, required) - SQL query to execute

---

<a id="gettransaction-read-only-system"></a>
#### GetTransaction (Read-Only / System)
**Description:** [read-only] Retrieve ABAP transaction (t-code) details — program, screen, authorization object, and transaction type (dialog, report, OO).

**Source:** `src/handlers/system/readonly/handleGetTransaction.ts`

**Parameters:**
- `transaction_name` (string, required) - Name of the ABAP transaction

---

<a id="gettypeinfo-read-only-system"></a>
#### GetTypeInfo (Read-Only / System)
**Description:** [read-only] Retrieve ABAP type information for domains (DOMA), data elements (DTEL), table types, and structures. Returns field definitions, value ranges, fixed values, and DDIC metadata.

**Source:** `src/handlers/system/readonly/handleGetTypeInfo.ts`

**Parameters:**
- `include_structure_fallback` (boolean, optional (default: true)) - When true (default), tries DDIC structure lookup only if type lookup returns 404/empty.
- `type_name` (string, required) - Name of the ABAP type

---

<a id="getwhereused-read-only-system"></a>
#### GetWhereUsed (Read-Only / System)
**Description:** [read-only] Search where-used references — find all objects that reference or depend on a given ABAP object. Answers: 

**Source:** `src/handlers/system/readonly/handleGetWhereUsed.ts`

**Parameters:**
- `enable_all_types` (boolean, optional (default: false)) - If true, searches in all available object types (Eclipse 
- `object_name` (string, required) - Name of the ABAP object
- `object_type` (string, required) - Type of the ABAP object (class, interface, program, table, etc.)

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
**Description:** [runtime] Read a specific ABAP runtime dump. Identify the dump by datetime + user (preferred, e.g. from a CALM event), or pass dump_id directly if already known. Use response_mode to control output detail level.

**Source:** `src/handlers/system/readonly/handleRuntimeGetDumpById.ts`

**Parameters:**
- `datetime` (string, optional) - Dump datetime (ISO or 
- `dump_id` (string, optional) - Full runtime dump ID. Use only when already known; prefer datetime + user otherwise.
- `response_mode` (string, optional (default: both)) - Controls what is returned: 
- `user` (string, optional) - SAP username whose dump to read. Required when using datetime lookup.
- `view` (string, optional (default: default)) - Dump view mode: default payload, summary section, or formatted long text.

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

<a id="runtimelistfeeds-read-only-system"></a>
#### RuntimeListFeeds (Read-Only / System)
**Description:** [runtime] List available ADT runtime feeds or read a specific feed type. Feed types: dumps, system_messages, gateway_errors. Without feed_type returns available feed descriptors.

**Source:** `src/handlers/system/readonly/handleRuntimeListFeeds.ts`

**Parameters:**
- `feed_type` (string, optional (default: descriptors)) - Feed to read. 
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of entries to return.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter feed entries by SAP username.

---

<a id="runtimelistprofilertracefiles-read-only-system"></a>
#### RuntimeListProfilerTraceFiles (Read-Only / System)
**Description:** [runtime] List ABAP profiler trace files available in ADT runtime. Returns parsed JSON payload.

**Source:** `src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts`

**Parameters:**
- None

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
**Description:** [read-only] Retrieve contents (data preview) of an ABAP database table or CDS view. Returns rows of data like SE16/SE16N.

**Source:** `src/handlers/table/readonly/handleGetTableContents.ts`

**Parameters:**
- None

---

<a id="readtable-read-only-table"></a>
#### ReadTable (Read-Only / Table)
**Description:** [read-only] Read ABAP table definition and metadata. Answers: 

**Source:** `src/handlers/table/readonly/handleReadTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE).
- `version` (string, optional (default: active)) - Version to read: 

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

<a id="listtransports-read-only-transport"></a>
#### ListTransports (Read-Only / Transport)
**Description:** [read-only] List transport requests for the current or specified user. Returns modifiable and/or released workbench and customizing requests.

**Source:** `src/handlers/transport/readonly/handleListTransports.ts`

**Parameters:**
- `modifiable_only` (boolean, optional) - Only return modifiable (not yet released) transports. Default: true.
- `user` (string, optional) - SAP user name. If not provided, returns transports for the current user.

---

<a id="read-only-view"></a>
### Read-Only / View

<a id="readview-read-only-view"></a>
#### ReadView (Read-Only / View)
**Description:** [read-only] Read ABAP CDS view source code and metadata. Answers: 

**Source:** `src/handlers/view/readonly/handleReadView.ts`

**Parameters:**
- `version` (string, optional (default: active)) - Version to read: 
- `view_name` (string, required) - View name (e.g., Z_MY_VIEW).

---

*Last updated: 2026-04-13*
