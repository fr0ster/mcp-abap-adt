# Available Tools Reference - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

## Summary

- Total tools: 238
- Read-only tools: 27
- High-level tools: 89
- Low-level tools: 122

## Navigation

- [Read-Only Group](#read-only-group)
  - [Enhancement](#read-only-enhancement)
    - [GetEnhancementImpl](#getenhancementimpl-readonly)
    - [GetEnhancements](#getenhancements-readonly)
    - [GetEnhancementSpot](#getenhancementspot-readonly)
  - [Function](#read-only-function)
    - [GetFunction](#getfunction-readonly)
  - [Include](#read-only-include)
    - [GetInclude](#getinclude-readonly)
    - [GetIncludesList](#getincludeslist-readonly)
  - [Package](#read-only-package)
    - [GetPackageContents](#getpackagecontents-readonly)
  - [Program](#read-only-program)
    - [GetProgFullCode](#getprogfullcode-readonly)
  - [Search](#read-only-search)
    - [GetObjectsByType](#getobjectsbytype-readonly)
    - [GetObjectsList](#getobjectslist-readonly)
    - [SearchObject](#searchobject-readonly)
  - [System](#read-only-system)
    - [DescribeByList](#describebylist-readonly)
    - [GetAbapAST](#getabapast-readonly)
    - [GetAbapSemanticAnalysis](#getabapsemanticanalysis-readonly)
    - [GetAbapSystemSymbols](#getabapsystemsymbols-readonly)
    - [GetAdtTypes](#getadttypes-readonly)
    - [GetInactiveObjects](#getinactiveobjects-readonly)
    - [GetObjectInfo](#getobjectinfo-readonly)
    - [GetObjectNodeFromCache](#getobjectnodefromcache-readonly)
    - [GetObjectStructure](#getobjectstructure-readonly)
    - [GetSession](#getsession-readonly)
    - [GetSqlQuery](#getsqlquery-readonly)
    - [GetTransaction](#gettransaction-readonly)
    - [GetTypeInfo](#gettypeinfo-readonly)
    - [GetWhereUsed](#getwhereused-readonly)
  - [Table](#read-only-table)
    - [GetTableContents](#gettablecontents-readonly)
  - [Transport](#read-only-transport)
    - [GetTransport](#gettransport-readonly)
- [High-Level Group](#high-level-group)
  - [Behavior Definition](#high-level-behavior-definition)
    - [CreateBehaviorDefinition](#createbehaviordefinition-high)
    - [DeleteBehaviorDefinition](#deletebehaviordefinition-high)
    - [GetBehaviorDefinition](#getbehaviordefinition-high)
    - [UpdateBehaviorDefinition](#updatebehaviordefinition-high)
  - [Behavior Implementation](#high-level-behavior-implementation)
    - [CreateBehaviorImplementation](#createbehaviorimplementation-high)
    - [DeleteBehaviorImplementation](#deletebehaviorimplementation-high)
    - [GetBehaviorImplementation](#getbehaviorimplementation-high)
    - [UpdateBehaviorImplementation](#updatebehaviorimplementation-high)
  - [Class](#high-level-class)
    - [CreateClass](#createclass-high)
    - [CreateLocalDefinitions](#createlocaldefinitions-high)
    - [CreateLocalMacros](#createlocalmacros-high)
    - [CreateLocalTestClass](#createlocaltestclass-high)
    - [CreateLocalTypes](#createlocaltypes-high)
    - [DeleteClass](#deleteclass-high)
    - [DeleteLocalDefinitions](#deletelocaldefinitions-high)
    - [DeleteLocalMacros](#deletelocalmacros-high)
    - [DeleteLocalTestClass](#deletelocaltestclass-high)
    - [DeleteLocalTypes](#deletelocaltypes-high)
    - [GetClass](#getclass-high)
    - [GetLocalDefinitions](#getlocaldefinitions-high)
    - [GetLocalMacros](#getlocalmacros-high)
    - [GetLocalTestClass](#getlocaltestclass-high)
    - [GetLocalTypes](#getlocaltypes-high)
    - [UpdateClass](#updateclass-high)
    - [UpdateLocalDefinitions](#updatelocaldefinitions-high)
    - [UpdateLocalMacros](#updatelocalmacros-high)
    - [UpdateLocalTestClass](#updatelocaltestclass-high)
    - [UpdateLocalTypes](#updatelocaltypes-high)
  - [Data Element](#high-level-data-element)
    - [CreateDataElement](#createdataelement-high)
    - [DeleteDataElement](#deletedataelement-high)
    - [GetDataElement](#getdataelement-high)
    - [UpdateDataElement](#updatedataelement-high)
  - [Ddlx](#high-level-ddlx)
    - [CreateMetadataExtension](#createmetadataextension-high)
    - [UpdateMetadataExtension](#updatemetadataextension-high)
  - [Domain](#high-level-domain)
    - [CreateDomain](#createdomain-high)
    - [DeleteDomain](#deletedomain-high)
    - [GetDomain](#getdomain-high)
    - [UpdateDomain](#updatedomain-high)
  - [Function](#high-level-function)
    - [CreateFunctionGroup](#createfunctiongroup-high)
    - [CreateFunctionModule](#createfunctionmodule-high)
    - [UpdateFunctionGroup](#updatefunctiongroup-high)
    - [UpdateFunctionModule](#updatefunctionmodule-high)
  - [Function Group](#high-level-function-group)
    - [DeleteFunctionGroup](#deletefunctiongroup-high)
    - [GetFunctionGroup](#getfunctiongroup-high)
  - [Function Module](#high-level-function-module)
    - [DeleteFunctionModule](#deletefunctionmodule-high)
    - [GetFunctionModule](#getfunctionmodule-high)
  - [Interface](#high-level-interface)
    - [CreateInterface](#createinterface-high)
    - [DeleteInterface](#deleteinterface-high)
    - [GetInterface](#getinterface-high)
    - [UpdateInterface](#updateinterface-high)
  - [Metadata Extension](#high-level-metadata-extension)
    - [DeleteMetadataExtension](#deletemetadataextension-high)
    - [GetMetadataExtension](#getmetadataextension-high)
  - [Package](#high-level-package)
    - [CreatePackage](#createpackage-high)
    - [GetPackage](#getpackage-high)
  - [Program](#high-level-program)
    - [CreateProgram](#createprogram-high)
    - [DeleteProgram](#deleteprogram-high)
    - [GetProgram](#getprogram-high)
    - [UpdateProgram](#updateprogram-high)
  - [Service Definition](#high-level-service-definition)
    - [CreateServiceDefinition](#createservicedefinition-high)
    - [DeleteServiceDefinition](#deleteservicedefinition-high)
    - [GetServiceDefinition](#getservicedefinition-high)
    - [UpdateServiceDefinition](#updateservicedefinition-high)
  - [Structure](#high-level-structure)
    - [CreateStructure](#createstructure-high)
    - [DeleteStructure](#deletestructure-high)
    - [GetStructure](#getstructure-high)
    - [UpdateStructure](#updatestructure-high)
  - [System](#high-level-system)
    - [GetPackageTree](#getpackagetree-high)
  - [Table](#high-level-table)
    - [CreateTable](#createtable-high)
    - [DeleteTable](#deletetable-high)
    - [GetTable](#gettable-high)
    - [UpdateTable](#updatetable-high)
  - [Transport](#high-level-transport)
    - [CreateTransport](#createtransport-high)
  - [Unit Test](#high-level-unit-test)
    - [CreateCdsUnitTest](#createcdsunittest-high)
    - [CreateUnitTest](#createunittest-high)
    - [DeleteCdsUnitTest](#deletecdsunittest-high)
    - [DeleteUnitTest](#deleteunittest-high)
    - [GetCdsUnitTest](#getcdsunittest-high)
    - [GetCdsUnitTestResult](#getcdsunittestresult-high)
    - [GetCdsUnitTestStatus](#getcdsunitteststatus-high)
    - [GetUnitTest](#getunittest-high)
    - [GetUnitTestResult](#getunittestresult-high)
    - [GetUnitTestStatus](#getunitteststatus-high)
    - [RunUnitTest](#rununittest-high)
    - [UpdateCdsUnitTest](#updatecdsunittest-high)
    - [UpdateUnitTest](#updateunittest-high)
  - [View](#high-level-view)
    - [CreateView](#createview-high)
    - [DeleteView](#deleteview-high)
    - [GetView](#getview-high)
    - [UpdateView](#updateview-high)
- [Low-Level Group](#low-level-group)
  - [Behavior Definition](#low-level-behavior-definition)
    - [ActivateBehaviorDefinitionLow](#activatebehaviordefinitionlow-low)
    - [CheckBdefLow](#checkbdeflow-low)
    - [CreateBehaviorDefinitionLow](#createbehaviordefinitionlow-low)
    - [DeleteBehaviorDefinitionLow](#deletebehaviordefinitionlow-low)
    - [LockBehaviorDefinitionLow](#lockbehaviordefinitionlow-low)
    - [UnlockBehaviorDefinitionLow](#unlockbehaviordefinitionlow-low)
    - [UpdateBehaviorDefinitionLow](#updatebehaviordefinitionlow-low)
    - [ValidateBehaviorDefinitionLow](#validatebehaviordefinitionlow-low)
  - [Behavior Implementation](#low-level-behavior-implementation)
    - [CreateBehaviorImplementationLow](#createbehaviorimplementationlow-low)
    - [LockBehaviorImplementationLow](#lockbehaviorimplementationlow-low)
    - [ValidateBehaviorImplementationLow](#validatebehaviorimplementationlow-low)
  - [Class](#low-level-class)
    - [ActivateClassLow](#activateclasslow-low)
    - [ActivateClassTestClassesLow](#activateclasstestclasseslow-low)
    - [CheckClassLow](#checkclasslow-low)
    - [CreateClassLow](#createclasslow-low)
    - [DeleteClassLow](#deleteclasslow-low)
    - [GetClassUnitTestResultLow](#getclassunittestresultlow-low)
    - [GetClassUnitTestStatusLow](#getclassunitteststatuslow-low)
    - [LockClassLow](#lockclasslow-low)
    - [LockClassTestClassesLow](#lockclasstestclasseslow-low)
    - [RunClassUnitTestsLow](#runclassunittestslow-low)
    - [UnlockClassLow](#unlockclasslow-low)
    - [UnlockClassTestClassesLow](#unlockclasstestclasseslow-low)
    - [UpdateClassLow](#updateclasslow-low)
    - [UpdateClassTestClassesLow](#updateclasstestclasseslow-low)
    - [ValidateClassLow](#validateclasslow-low)
  - [Common](#low-level-common)
    - [ActivateObjectLow](#activateobjectlow-low)
    - [CheckObjectLow](#checkobjectlow-low)
    - [DeleteObjectLow](#deleteobjectlow-low)
    - [LockObjectLow](#lockobjectlow-low)
    - [UnlockObjectLow](#unlockobjectlow-low)
    - [ValidateObjectLow](#validateobjectlow-low)
  - [Data Element](#low-level-data-element)
    - [ActivateDataElementLow](#activatedataelementlow-low)
    - [CheckDataElementLow](#checkdataelementlow-low)
    - [CreateDataElementLow](#createdataelementlow-low)
    - [DeleteDataElementLow](#deletedataelementlow-low)
    - [LockDataElementLow](#lockdataelementlow-low)
    - [UnlockDataElementLow](#unlockdataelementlow-low)
    - [UpdateDataElementLow](#updatedataelementlow-low)
    - [ValidateDataElementLow](#validatedataelementlow-low)
  - [Ddlx](#low-level-ddlx)
    - [ActivateMetadataExtensionLow](#activatemetadataextensionlow-low)
    - [CheckMetadataExtensionLow](#checkmetadataextensionlow-low)
    - [CreateMetadataExtensionLow](#createmetadataextensionlow-low)
    - [DeleteMetadataExtensionLow](#deletemetadataextensionlow-low)
    - [LockMetadataExtensionLow](#lockmetadataextensionlow-low)
    - [UnlockMetadataExtensionLow](#unlockmetadataextensionlow-low)
    - [UpdateMetadataExtensionLow](#updatemetadataextensionlow-low)
    - [ValidateMetadataExtensionLow](#validatemetadataextensionlow-low)
  - [Domain](#low-level-domain)
    - [ActivateDomainLow](#activatedomainlow-low)
    - [CheckDomainLow](#checkdomainlow-low)
    - [CreateDomainLow](#createdomainlow-low)
    - [DeleteDomainLow](#deletedomainlow-low)
    - [LockDomainLow](#lockdomainlow-low)
    - [UnlockDomainLow](#unlockdomainlow-low)
    - [UpdateDomainLow](#updatedomainlow-low)
    - [ValidateDomainLow](#validatedomainlow-low)
  - [Function](#low-level-function)
    - [ActivateFunctionGroupLow](#activatefunctiongrouplow-low)
    - [ActivateFunctionModuleLow](#activatefunctionmodulelow-low)
    - [CheckFunctionGroupLow](#checkfunctiongrouplow-low)
    - [CheckFunctionModuleLow](#checkfunctionmodulelow-low)
    - [CreateFunctionGroupLow](#createfunctiongrouplow-low)
    - [CreateFunctionModuleLow](#createfunctionmodulelow-low)
    - [DeleteFunctionGroupLow](#deletefunctiongrouplow-low)
    - [DeleteFunctionModuleLow](#deletefunctionmodulelow-low)
    - [LockFunctionGroupLow](#lockfunctiongrouplow-low)
    - [LockFunctionModuleLow](#lockfunctionmodulelow-low)
    - [UnlockFunctionGroupLow](#unlockfunctiongrouplow-low)
    - [UnlockFunctionModuleLow](#unlockfunctionmodulelow-low)
    - [UpdateFunctionModuleLow](#updatefunctionmodulelow-low)
    - [ValidateFunctionGroupLow](#validatefunctiongrouplow-low)
    - [ValidateFunctionModuleLow](#validatefunctionmodulelow-low)
  - [Interface](#low-level-interface)
    - [ActivateInterfaceLow](#activateinterfacelow-low)
    - [CheckInterfaceLow](#checkinterfacelow-low)
    - [CreateInterfaceLow](#createinterfacelow-low)
    - [DeleteInterfaceLow](#deleteinterfacelow-low)
    - [LockInterfaceLow](#lockinterfacelow-low)
    - [UnlockInterfaceLow](#unlockinterfacelow-low)
    - [UpdateInterfaceLow](#updateinterfacelow-low)
    - [ValidateInterfaceLow](#validateinterfacelow-low)
  - [Package](#low-level-package)
    - [CheckPackageLow](#checkpackagelow-low)
    - [CreatePackageLow](#createpackagelow-low)
    - [DeletePackageLow](#deletepackagelow-low)
    - [LockPackageLow](#lockpackagelow-low)
    - [UnlockPackageLow](#unlockpackagelow-low)
    - [UpdatePackageLow](#updatepackagelow-low)
    - [ValidatePackageLow](#validatepackagelow-low)
  - [Program](#low-level-program)
    - [ActivateProgramLow](#activateprogramlow-low)
    - [CheckProgramLow](#checkprogramlow-low)
    - [CreateProgramLow](#createprogramlow-low)
    - [DeleteProgramLow](#deleteprogramlow-low)
    - [LockProgramLow](#lockprogramlow-low)
    - [UnlockProgramLow](#unlockprogramlow-low)
    - [UpdateProgramLow](#updateprogramlow-low)
    - [ValidateProgramLow](#validateprogramlow-low)
  - [Structure](#low-level-structure)
    - [ActivateStructureLow](#activatestructurelow-low)
    - [CheckStructureLow](#checkstructurelow-low)
    - [CreateStructureLow](#createstructurelow-low)
    - [DeleteStructureLow](#deletestructurelow-low)
    - [LockStructureLow](#lockstructurelow-low)
    - [UnlockStructureLow](#unlockstructurelow-low)
    - [UpdateStructureLow](#updatestructurelow-low)
    - [ValidateStructureLow](#validatestructurelow-low)
  - [System](#low-level-system)
    - [GetNodeStructureLow](#getnodestructurelow-low)
    - [GetObjectStructureLow](#getobjectstructurelow-low)
    - [GetVirtualFoldersLow](#getvirtualfolderslow-low)
  - [Table](#low-level-table)
    - [ActivateTableLow](#activatetablelow-low)
    - [CheckTableLow](#checktablelow-low)
    - [CreateTableLow](#createtablelow-low)
    - [DeleteTableLow](#deletetablelow-low)
    - [LockTableLow](#locktablelow-low)
    - [UnlockTableLow](#unlocktablelow-low)
    - [UpdateTableLow](#updatetablelow-low)
    - [ValidateTableLow](#validatetablelow-low)
  - [Transport](#low-level-transport)
    - [CreateTransportLow](#createtransportlow-low)
  - [View](#low-level-view)
    - [ActivateViewLow](#activateviewlow-low)
    - [CheckViewLow](#checkviewlow-low)
    - [CreateViewLow](#createviewlow-low)
    - [DeleteViewLow](#deleteviewlow-low)
    - [LockViewLow](#lockviewlow-low)
    - [UnlockViewLow](#unlockviewlow-low)
    - [UpdateViewLow](#updateviewlow-low)
    - [ValidateViewLow](#validateviewlow-low)

---

## Read-Only Group {#read-only-group}

### Enhancement {#read-only-enhancement}

#### GetEnhancementImpl {#getenhancementimpl-readonly}
**Description:** [read-only] Retrieve source code of a specific enhancement implementation by its name and enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts`

**Parameters:**
- `enhancement_name` (string, required) - [read-only] Name of the enhancement implementation
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

#### GetEnhancements {#getenhancements-readonly}
**Description:** [read-only] Retrieve a list of enhancements for a given ABAP object.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancements.ts`

**Parameters:**
- `object_name` (string, required) - Name of the ABAP object
- `object_type` (string, required) - [read-only] Type of the ABAP object

---

#### GetEnhancementSpot {#getenhancementspot-readonly}
**Description:** [read-only] Retrieve metadata and list of implementations for a specific enhancement spot.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts`

**Parameters:**
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

### Function {#read-only-function}

#### GetFunction {#getfunction-readonly}
**Description:** [read-only] Retrieve ABAP Function Module source code.

**Source:** `src/handlers/function/readonly/handleGetFunction.ts`

**Parameters:**
- None

---

### Include {#read-only-include}

#### GetInclude {#getinclude-readonly}
**Description:** [read-only] Retrieve source code of a specific ABAP include file.

**Source:** `src/handlers/include/readonly/handleGetInclude.ts`

**Parameters:**
- None

---

#### GetIncludesList {#getincludeslist-readonly}
**Description:** [read-only] Recursively discover and list ALL include files within an ABAP program or include.

**Source:** `src/handlers/include/readonly/handleGetIncludesList.ts`

**Parameters:**
- `detailed` (boolean, optional (default: false)) - [read-only] If true, returns structured JSON with metadata and raw XML.
- `object_name` (string, required) - Name of the ABAP program or include
- `object_type` (string, required) - [read-only] ADT object type (e.g. PROG/P, PROG/I, FUGR, CLAS/OC)
- `timeout` (number, optional) - [read-only] Timeout in ms for each ADT request.

---

### Package {#read-only-package}

#### GetPackageContents {#getpackagecontents-readonly}
**Description:** [read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages.

**Source:** `src/handlers/package/readonly/handleGetPackageContents.ts`

**Parameters:**
- None

---

### Program {#read-only-program}

#### GetProgFullCode {#getprogfullcode-readonly}
**Description:** [read-only] Returns the full code for a program or function group, including all includes, in tree traversal order.

**Source:** `src/handlers/program/readonly/handleGetProgFullCode.ts`

**Parameters:**
- `name` (string, required) - [read-only] Technical name of the program or function group (e.g., 
- `type` (string, required) - [read-only] 

---

### Search {#read-only-search}

#### GetObjectsByType {#getobjectsbytype-readonly}
**Description:** [read-only] Retrieves all ABAP objects of a specific type under a given node.

**Source:** `src/handlers/search/readonly/handleGetObjectsByType.ts`

**Parameters:**
- `node_id` (string, required) - [read-only] Node ID
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type
- `with_short_descriptions` (boolean, optional) - [read-only] Include short descriptions

---

#### GetObjectsList {#getobjectslist-readonly}
**Description:** [read-only] Recursively retrieves all valid ABAP repository objects for a given parent (program, function group, etc.) including nested includes.

**Source:** `src/handlers/search/readonly/handleGetObjectsList.ts`

**Parameters:**
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `with_short_descriptions` (boolean, optional (default: true))) - [read-only] Include short descriptions (default: true)

---

#### SearchObject {#searchobject-readonly}
**Description:** [read-only] Search for ABAP objects by name pattern. Parameters: object_name (with or without mask), object_type (optional), maxResults (optional). If object_type is specified, results are filtered by type.

**Source:** `src/handlers/search/readonly/handleSearchObject.ts`

**Parameters:**
- `maxResults` (number, optional (default: 100)) - [read-only] Maximum number of results to return
- `object_name` (string, required) - [read-only] Object name or mask (e.g. 
- `object_type` (string, optional) - [read-only] Optional ABAP object type (e.g. 

---

### System {#read-only-system}

#### DescribeByList {#describebylist-readonly}
**Description:** [read-only] Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.

**Source:** `src/handlers/system/readonly/handleDescribeByList.ts`

**Parameters:**
- `objects` (array, required) - [read-only] Object name (required, must be valid ABAP object name or mask)
- `type` (string, optional) - [read-only] Optional type (e.g. PROG/P, CLAS/OC, etc.)

---

#### GetAbapAST {#getabapast-readonly}
**Description:** [read-only] Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format.

**Source:** `src/handlers/system/readonly/handleGetAbapAST.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to parse
- `filePath` (string, optional) - Optional file path to write the result to

---

#### GetAbapSemanticAnalysis {#getabapsemanticanalysis-readonly}
**Description:** [read-only] Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies.

**Source:** `src/handlers/system/readonly/handleGetAbapSemanticAnalysis.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze
- `filePath` (string, optional) - Optional file path to write the result to

---

#### GetAbapSystemSymbols {#getabapsystemsymbols-readonly}
**Description:** [read-only] Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.

**Source:** `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze and resolve symbols for
- `filePath` (string, optional) - Optional file path to write the result to

---

#### GetAdtTypes {#getadttypes-readonly}
**Description:** [read-only] Retrieve all valid ADT object types.

**Source:** `src/handlers/system/readonly/handleGetAllTypes.ts`

**Parameters:**
- `validate_type` (string, optional) - Type name to validate (optional)

---

#### GetInactiveObjects {#getinactiveobjects-readonly}
**Description:** [read-only] Get a list of inactive ABAP objects (objects that have been modified but not activated).

**Source:** `src/handlers/system/readonly/handleGetInactiveObjects.ts`

**Parameters:**
- None

---

#### GetObjectInfo {#getobjectinfo-readonly}
**Description:** [read-only] Return ABAP object tree: root, group nodes, and terminal leaves up to maxDepth. Enrich each node via SearchObject if enrich=true. Group nodes are included for hierarchy. Each node has node_type: root, point, end.

**Source:** `src/handlers/system/readonly/handleGetObjectInfo.ts`

**Parameters:**
- `enrich` (boolean, optional (default: true)) - [read-only] Whether to add description and package via SearchObject (default true)
- `maxDepth` (integer, optional (default: 1)) - [read-only] Maximum tree depth (default depends on type)
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_type` (string, required) - [read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P)

---

#### GetObjectNodeFromCache {#getobjectnodefromcache-readonly}
**Description:** [read-only] Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present.

**Source:** `src/handlers/system/readonly/handleGetObjectNodeFromCache.ts`

**Parameters:**
- None

---

#### GetObjectStructure {#getobjectstructure-readonly}
**Description:** [read-only] Retrieve ADT object structure as a compact JSON tree.

**Source:** `src/handlers/system/readonly/handleGetObjectStructure.ts`

**Parameters:**
- `objectname` (string, required) - ADT object name (e.g. /CBY/ACQ_DDL)
- `objecttype` (string, required) - ADT object type (e.g. DDLS/DF)

---

#### GetSession {#getsession-readonly}
**Description:** [read-only] Get a new session ID and current session state (cookies, CSRF token) for reuse across multiple ADT operations. Use this to maintain the same session and lock handle across multiple requests.

**Source:** `src/handlers/system/readonly/handleGetSession.ts`

**Parameters:**
- `force_new` (boolean, optional) - Force creation of a new session even if one exists. Default: false

---

#### GetSqlQuery {#getsqlquery-readonly}
**Description:** [read-only] Execute freestyle SQL queries via SAP ADT Data Preview API.

**Source:** `src/handlers/system/readonly/handleGetSqlQuery.ts`

**Parameters:**
- `row_number` (number, optional (default: 100)) - [read-only] Maximum number of rows to return
- `sql_query` (string, required) - SQL query to execute

---

#### GetTransaction {#gettransaction-readonly}
**Description:** [read-only] Retrieve ABAP transaction details.

**Source:** `src/handlers/system/readonly/handleGetTransaction.ts`

**Parameters:**
- `transaction_name` (string, required) - Name of the ABAP transaction

---

#### GetTypeInfo {#gettypeinfo-readonly}
**Description:** [read-only] Retrieve ABAP type information.

**Source:** `src/handlers/system/readonly/handleGetTypeInfo.ts`

**Parameters:**
- `type_name` (string, required) - Name of the ABAP type

---

#### GetWhereUsed {#getwhereused-readonly}
**Description:** [read-only] Retrieve where-used references for ABAP objects via ADT usageReferences. Returns parsed list of referencing objects with their types and packages.

**Source:** `src/handlers/system/readonly/handleGetWhereUsed.ts`

**Parameters:**
- `enable_all_types` (boolean, optional (default: false)) - If true, searches in all available object types (Eclipse 
- `object_name` (string, required) - Name of the ABAP object
- `object_type` (string, required) - Type of the ABAP object (class, interface, program, table, etc.)

---

### Table {#read-only-table}

#### GetTableContents {#gettablecontents-readonly}
**Description:** [read-only] Retrieve contents of an ABAP table.

**Source:** `src/handlers/table/readonly/handleGetTableContents.ts`

**Parameters:**
- None

---

### Transport {#read-only-transport}

#### GetTransport {#gettransport-readonly}
**Description:** [read-only] Retrieve ABAP transport request information including metadata, included objects, and status from SAP system.

**Source:** `src/handlers/transport/readonly/handleGetTransport.ts`

**Parameters:**
- `include_objects` (boolean, optional (default: true))) - Include list of objects in transport (default: true)
- `include_tasks` (boolean, optional (default: true))) - Include list of tasks in transport (default: true)
- `transport_number` (string, required) - Transport request number (e.g., E19K905635, DEVK905123)

---

## High-Level Group {#high-level-group}

### Behavior Definition {#high-level-behavior-definition}

#### CreateBehaviorDefinition {#createbehaviordefinition-high}
**Description:** Create a new ABAP Behavior Definition (BDEF) in SAP system.

**Source:** `src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `implementation_type` (string, required) - Implementation type: 
- `name` (string, required) - Behavior Definition name (usually same as Root Entity name)
- `package_name` (string, required) - Package name
- `root_entity` (string, required) - Root Entity name (CDS View name)
- `transport_request` (string, optional) - Transport request number

---

#### DeleteBehaviorDefinition {#deletebehaviordefinition-high}
**Description:** Delete an ABAP behavior definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_definition/high/handleDeleteBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetBehaviorDefinition {#getbehaviordefinition-high}
**Description:** Retrieve ABAP behavior definition definition. Supports reading active or inactive version.

**Source:** `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateBehaviorDefinition {#updatebehaviordefinition-high}
**Description:** Update source code of an ABAP Behavior Definition.

**Source:** `src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally (not recommended for stateful flows).
- `name` (string, required) - Behavior Definition name
- `source_code` (string, required) - New source code

---

### Behavior Implementation {#high-level-behavior-implementation}

#### CreateBehaviorImplementation {#createbehaviorimplementation-high}
**Description:** Create a new ABAP behavior implementation class for a behavior definition. Behavior implementations contain the business logic for RAP entities. Uses stateful session for proper lock management.

**Source:** `src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate behavior implementation after creation. Default: true.
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). The behavior definition must exist.
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions (typically starts with ZBP_ for behavior implementations).
- `description` (string, optional) - Class description. If not provided, class_name will be used.
- `implementation_code` (string, optional) - Implementation code for the implementations include (optional). Contains the actual behavior implementation methods.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteBehaviorImplementation {#deletebehaviorimplementation-high}
**Description:** Delete an ABAP behavior implementation from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetBehaviorImplementation {#getbehaviorimplementation-high}
**Description:** Retrieve ABAP behavior implementation definition. Supports reading active or inactive version.

**Source:** `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateBehaviorImplementation {#updatebehaviorimplementation-high}
**Description:** Update source code of an existing ABAP behavior implementation class. Updates both main source (with FOR BEHAVIOR OF clause) and implementations include. Uses stateful session with proper lock/unlock mechanism.

**Source:** `src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate behavior implementation after update. Default: true.
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). Must match the behavior definition used when creating the class.
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must exist in the system.
- `implementation_code` (string, required) - Implementation code for the implementations include. Contains the actual behavior implementation methods.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

### Class {#high-level-class}

#### CreateClass {#createclass-high}
**Description:** Create a new ABAP class with optional activation. Manages validation, lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleCreateClass.ts`

**Parameters:**
- `abstract` (boolean, optional) - Mark class as abstract. Default: false
- `activate` (boolean, optional) - Activate after creation. Default: true.
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001).
- `create_protected` (boolean, optional) - Protected constructor. Default: false
- `description` (string, optional) - Class description (defaults to class_name).
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP).
- `source_code` (string, optional) - Full ABAP class source code. If omitted, a minimal template is generated.
- `superclass` (string, optional) - Optional superclass name.
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

#### CreateLocalDefinitions {#createlocaldefinitions-high}
**Description:** Create local definitions in an ABAP class (definitions include). Manages lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleCreateLocalDefinitions.ts`

**Parameters:**
- `activate_on_create` (boolean, optional (default: false)) - Activate parent class after creating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `definitions_code` (string, required) - Source code for local definitions.
- `transport_request` (string, optional) - Transport request number.

---

#### CreateLocalMacros {#createlocalmacros-high}
**Description:** Create local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleCreateLocalMacros.ts`

**Parameters:**
- `activate_on_create` (boolean, optional (default: false)) - Activate parent class after creating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `macros_code` (string, required) - Source code for local macros.
- `transport_request` (string, optional) - Transport request number.

---

#### CreateLocalTestClass {#createlocaltestclass-high}
**Description:** Create a local test class in an ABAP class. Manages lock, check, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleCreateLocalTestClass.ts`

**Parameters:**
- `activate_on_create` (boolean, optional (default: false)) - Activate parent class after creating test class. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `test_class_code` (string, required) - Source code for the local test class.
- `test_class_name` (string, optional) - Optional test class name (e.g., lcl_test).
- `transport_request` (string, optional) - Transport request number (required for transportable objects).

---

#### CreateLocalTypes {#createlocaltypes-high}
**Description:** Create local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleCreateLocalTypes.ts`

**Parameters:**
- `activate_on_create` (boolean, optional (default: false)) - Activate parent class after creating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `local_types_code` (string, required) - Source code for local types.
- `transport_request` (string, optional) - Transport request number.

---

#### DeleteClass {#deleteclass-high}
**Description:** Delete an ABAP class from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/class/high/handleDeleteClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### DeleteLocalDefinitions {#deletelocaldefinitions-high}
**Description:** Delete local definitions from an ABAP class by clearing the definitions include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleDeleteLocalDefinitions.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

#### DeleteLocalMacros {#deletelocalmacros-high}
**Description:** Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleDeleteLocalMacros.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

#### DeleteLocalTestClass {#deletelocaltestclass-high}
**Description:** Delete a local test class from an ABAP class by clearing the testclasses include. Manages lock, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleDeleteLocalTestClass.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting test class. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (required for transportable objects).

---

#### DeleteLocalTypes {#deletelocaltypes-high}
**Description:** Delete local types from an ABAP class by clearing the implementations include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleDeleteLocalTypes.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

#### GetClass {#getclass-high}
**Description:** Retrieve ABAP class source code. Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: 

---

#### GetLocalDefinitions {#getlocaldefinitions-high}
**Description:** Retrieve local definitions source code from a class (definitions include). Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalDefinitions.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: 

---

#### GetLocalMacros {#getlocalmacros-high}
**Description:** Retrieve local macros source code from a class (macros include). Supports reading active or inactive version. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleGetLocalMacros.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: 

---

#### GetLocalTestClass {#getlocaltestclass-high}
**Description:** Retrieve local test class source code from a class. Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalTestClass.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: 

---

#### GetLocalTypes {#getlocaltypes-high}
**Description:** Retrieve local types source code from a class (implementations include). Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalTypes.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateClass {#updateclass-high}
**Description:** Update source code of an existing ABAP class. Locks, checks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/class/high/handleUpdateClass.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001).
- `source_code` (string, required) - Complete ABAP class source code.

---

#### UpdateLocalDefinitions {#updatelocaldefinitions-high}
**Description:** Update local definitions in an ABAP class (definitions include). Manages lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleUpdateLocalDefinitions.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `definitions_code` (string, required) - Updated source code for local definitions.
- `transport_request` (string, optional) - Transport request number.

---

#### UpdateLocalMacros {#updatelocalmacros-high}
**Description:** Update local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleUpdateLocalMacros.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `macros_code` (string, required) - Updated source code for local macros.
- `transport_request` (string, optional) - Transport request number.

---

#### UpdateLocalTestClass {#updatelocaltestclass-high}
**Description:** Update a local test class in an ABAP class. Manages lock, check, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleUpdateLocalTestClass.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating test class. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `test_class_code` (string, required) - Updated source code for the local test class.
- `transport_request` (string, optional) - Transport request number (required for transportable objects).

---

#### UpdateLocalTypes {#updatelocaltypes-high}
**Description:** Update local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleUpdateLocalTypes.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `local_types_code` (string, required) - Updated source code for local types.
- `transport_request` (string, optional) - Transport request number.

---

### Data Element {#high-level-data-element}

#### CreateDataElement {#createdataelement-high}
**Description:** Create a new ABAP data element in SAP system with all required steps: create, activate, and verify.

**Source:** `src/handlers/data_element/high/handleCreateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions.
- `data_type` (string, optional (default: CHAR)) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 
- `decimals` (number, optional (default: 0)) - Decimal places. Usually inherited from domain.
- `description` (string, optional) - Data element description. If not provided, data_element_name will be used.
- `heading_label` (string, optional) - Heading field label (max 55 chars). Applied during update step after creation.
- `length` (number, optional (default: 100)) - Data type length. Usually inherited from domain.
- `long_label` (string, optional) - Long field label (max 40 chars). Applied during update step after creation.
- `medium_label` (string, optional) - Medium field label (max 20 chars). Applied during update step after creation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `search_help` (string, optional) - Search help name. Applied during update step after creation.
- `search_help_parameter` (string, optional) - Search help parameter. Applied during update step after creation.
- `set_get_parameter` (string, optional) - Set/Get parameter ID. Applied during update step after creation.
- `short_label` (string, optional) - Short field label (max 10 chars). Applied during update step after creation.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `type_kind` (string, optional (default: domain)) - Type kind: 
- `type_name` (string, optional) - Type name: domain name (when type_kind is 

---

#### DeleteDataElement {#deletedataelement-high}
**Description:** Delete an ABAP data element from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/data_element/high/handleDeleteDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetDataElement {#getdataelement-high}
**Description:** Retrieve ABAP data element definition. Supports reading active or inactive version.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateDataElement {#updatedataelement-high}
**Description:** Data element name to update (e.g., ZZ_TEST_DTEL_01)

**Source:** `src/handlers/data_element/high/handleUpdateDataElement.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - Activate data element after update (default: true)
- `data_element_name` (string, required) - Data element name to update (e.g., ZZ_TEST_DTEL_01)
- `data_type` (string, optional) - Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType
- `decimals` (number, optional) - Decimals - for predefinedAbapType or refToPredefinedAbapType
- `description` (string, optional) - New data element description
- `field_label_heading` (string, optional) - Heading field label (max 55 chars)
- `field_label_long` (string, optional) - Long field label (max 40 chars)
- `field_label_medium` (string, optional) - Medium field label (max 20 chars)
- `field_label_short` (string, optional) - Short field label (max 10 chars)
- `length` (number, optional) - Length - for predefinedAbapType or refToPredefinedAbapType
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `search_help` (string, optional) - Search help name
- `search_help_parameter` (string, optional) - Search help parameter
- `set_get_parameter` (string, optional) - Set/Get parameter ID
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `type_kind` (string, optional (default: domain)) - Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType
- `type_name` (string, optional) - Type name: domain name, data element name, or class name (depending on type_kind)

---

### Ddlx {#high-level-ddlx}

#### CreateMetadataExtension {#createmetadataextension-high}
**Description:** Create a new ABAP Metadata Extension (DDLX) in SAP system.

**Source:** `src/handlers/ddlx/high/handleCreateMetadataExtension.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `name` (string, required) - Metadata Extension name
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number

---

#### UpdateMetadataExtension {#updatemetadataextension-high}
**Description:** Update source code of an ABAP Metadata Extension.

**Source:** `src/handlers/ddlx/high/handleUpdateMetadataExtension.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally.
- `name` (string, required) - Metadata Extension name
- `source_code` (string, required) - New source code

---

### Domain {#high-level-domain}

#### CreateDomain {#createdomain-high}
**Description:** Create a new ABAP domain in SAP system with all required steps: lock, create, check, unlock, activate, and verify.

**Source:** `src/handlers/domain/high/handleCreateDomain.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - (optional) Activate domain after creation (default: true)
- `conversion_exit` (string, optional) - (optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional (default: CHAR)) - (optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional (default: 0)) - (optional) Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - (optional) Domain description. If not provided, domain_name will be used.
- `domain_name` (string, optional) - Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions.
- `fixed_values` (array, optional) - (optional) Array of fixed values for domain value range
- `length` (number, optional (default: 100)) - (optional) Field length (max depends on datatype)
- `lowercase` (boolean, optional (default: false)) - (optional) Allow lowercase input
- `package_name` (string, optional) - (optional) Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `sign_exists` (boolean, optional (default: false)) - (optional) Field has sign (+/-)
- `text` (string, required) - Description text for the fixed value
- `transport_request` (string, optional) - (optional) Transport request number (e.g., E19K905635). Required for transportable packages.
- `value_table` (string, optional) - (optional) Value table name for foreign key relationship

---

#### DeleteDomain {#deletedomain-high}
**Description:** Delete an ABAP domain from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/domain/high/handleDeleteDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_DOMAIN).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetDomain {#getdomain-high}
**Description:** Retrieve ABAP domain definition. Supports reading active or inactive version.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_DOMAIN).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateDomain {#updatedomain-high}
**Description:** Domain name to update (e.g., ZZ_TEST_0001)

**Source:** `src/handlers/domain/high/handleUpdateDomain.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - Activate domain after update (default: true)
- `conversion_exit` (string, optional) - Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional) - Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional) - Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - New domain description (optional)
- `domain_name` (string, optional) - Domain name to update (e.g., ZZ_TEST_0001)
- `fixed_values` (array, optional) - Array of fixed values for domain value range
- `length` (number, optional) - Field length (max depends on datatype)
- `lowercase` (boolean, optional) - Allow lowercase input
- `package_name` (string, optional) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `sign_exists` (boolean, optional) - Field has sign (+/-)
- `text` (string, required) - Description text for the fixed value
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `value_table` (string, optional) - Value table name for foreign key relationship

---

### Function {#high-level-function}

#### CreateFunctionGroup {#createfunctiongroup-high}
**Description:** Create a new ABAP function group in SAP system. Function groups serve as containers for function modules. Uses stateful session for proper lock management.

**Source:** `src/handlers/function/high/handleCreateFunctionGroup.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate function group after creation. Default: true. Set to false for batch operations.
- `description` (string, optional) - Function group description. If not provided, function_group_name will be used.
- `function_group_name` (string, required) - Function group name (e.g., ZTEST_FG_001). Must follow SAP naming conventions (start with Z or Y, max 26 chars).
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### CreateFunctionModule {#createfunctionmodule-high}
**Description:** Create a new ABAP function module within an existing function group. Uses stateful session with LOCK/UNLOCK workflow for source code upload.

**Source:** `src/handlers/function/high/handleCreateFunctionModule.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - Whether to activate the function module after creation (default: true)
- `description` (string, optional) - Optional description for the function module
- `function_group_name` (string, required) - Parent function group name (e.g., ZTEST_FG_001)
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars).
- `source_code` (string, required) - ABAP source code for the function module including signature (FUNCTION name IMPORTING/EXPORTING ... ENDFUNCTION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### UpdateFunctionGroup {#updatefunctiongroup-high}
**Description:** Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules and don

**Source:** `src/handlers/function/high/handleUpdateFunctionGroup.ts`

**Parameters:**
- `description` (string, required) - New description for the function group.
- `function_group_name` (string, required) - Function group name (e.g., ZTEST_FG_001). Must exist in the system.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

#### UpdateFunctionModule {#updatefunctionmodule-high}
**Description:** Update source code of an existing ABAP function module. Locks the function module, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing function modules without re-creating metadata.

**Source:** `src/handlers/function/high/handleUpdateFunctionModule.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate function module after source update. Default: false. Set to true to activate immediately.
- `function_group_name` (string, required) - Function group name containing the function module (e.g., ZOK_FG_MCP01).
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM_MCP01). Function module must already exist.
- `source_code` (string, required) - Complete ABAP function module source code. Must include FUNCTION statement with parameters and ENDFUNCTION. Example:\n\nFUNCTION Z_TEST_FM\n  IMPORTING\n    VALUE(iv_input) TYPE string\n  EXPORTING\n    VALUE(ev_output) TYPE string.\n  \n  ev_output = iv_input.\nENDFUNCTION.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable function modules.

---

### Function Group {#high-level-function-group}

#### DeleteFunctionGroup {#deletefunctiongroup-high}
**Description:** Delete an ABAP function group from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/function_group/high/handleDeleteFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetFunctionGroup {#getfunctiongroup-high}
**Description:** Retrieve ABAP function group definition. Supports reading active or inactive version.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).
- `version` (string, optional (default: active)) - Version to read: 

---

### Function Module {#high-level-function-module}

#### DeleteFunctionModule {#deletefunctionmodule-high}
**Description:** Delete an ABAP function module from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/function_module/high/handleDeleteFunctionModule.ts`

**Parameters:**
- `function_module_name` (string, required) - FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetFunctionModule {#getfunctionmodule-high}
**Description:** Retrieve ABAP function module definition. Supports reading active or inactive version.

**Source:** `src/handlers/function_module/high/handleGetFunctionModule.ts`

**Parameters:**
- `function_module_name` (string, required) - FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).
- `version` (string, optional (default: active)) - Version to read: 

---

### Interface {#high-level-interface}

#### CreateInterface {#createinterface-high}
**Description:** Create a new ABAP interface in SAP system with source code. Interfaces define method signatures, events, and types for implementation by classes. Uses stateful session for proper lock management.

**Source:** `src/handlers/interface/high/handleCreateInterface.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate interface after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `description` (string, optional) - Interface description. If not provided, interface_name will be used.
- `interface_name` (string, required) - Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y).
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `source_code` (string, optional) - Complete ABAP interface source code with INTERFACE...ENDINTERFACE section. If not provided, generates minimal template.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteInterface {#deleteinterface-high}
**Description:** Delete an ABAP interface from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/interface/high/handleDeleteInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_INTERFACE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetInterface {#getinterface-high}
**Description:** Retrieve ABAP interface definition. Supports reading active or inactive version.

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_INTERFACE).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateInterface {#updateinterface-high}
**Description:** Update source code of an existing ABAP interface. Uses stateful session with proper lock/unlock mechanism. Lock handle and transport number are passed in URL parameters.

**Source:** `src/handlers/interface/high/handleUpdateInterface.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate interface after update. Default: true.
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE). Must exist in the system.
- `source_code` (string, required) - Complete ABAP interface source code with INTERFACE...ENDINTERFACE section.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

### Metadata Extension {#high-level-metadata-extension}

#### DeleteMetadataExtension {#deletemetadataextension-high}
**Description:** Delete an ABAP metadata extension from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/metadata_extension/high/handleDeleteMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetMetadataExtension {#getmetadataextension-high}
**Description:** Retrieve ABAP metadata extension definition. Supports reading active or inactive version.

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).
- `version` (string, optional (default: active)) - Version to read: 

---

### Package {#high-level-package}

#### CreatePackage {#createpackage-high}
**Description:** Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.

**Source:** `src/handlers/package/high/handleCreatePackage.ts`

**Parameters:**
- None

---

#### GetPackage {#getpackage-high}
**Description:** Retrieve ABAP package metadata (description, super-package, etc.). Supports reading active or inactive version.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., Z_MY_PACKAGE).
- `version` (string, optional (default: active)) - Version to read: 

---

### Program {#high-level-program}

#### CreateProgram {#createprogram-high}
**Description:** Create a new ABAP program (report) in SAP system with source code. Supports executable programs, includes, module pools. Uses stateful session for proper lock management.

**Source:** `src/handlers/program/high/handleCreateProgram.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate program after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `application` (string, optional) - Application area (e.g., 
- `description` (string, optional) - Program description. If not provided, program_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM_001). Must follow SAP naming conventions (start with Z or Y).
- `program_type` (string, optional) - Program type: 
- `source_code` (string, optional) - Complete ABAP program source code. If not provided, generates minimal template based on program_type.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteProgram {#deleteprogram-high}
**Description:** Delete an ABAP program from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/program/high/handleDeleteProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetProgram {#getprogram-high}
**Description:** Retrieve ABAP program definition. Supports reading active or inactive version.

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateProgram {#updateprogram-high}
**Description:** Update source code of an existing ABAP program. Locks the program, checks new code, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing programs without re-creating metadata.

**Source:** `src/handlers/program/high/handleUpdateProgram.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist.
- `source_code` (string, required) - Complete ABAP program source code.

---

### Service Definition {#high-level-service-definition}

#### CreateServiceDefinition {#createservicedefinition-high}
**Description:** Create a new ABAP service definition for OData services. Service definitions define the structure and behavior of OData services. Uses stateful session for proper lock management.

**Source:** `src/handlers/service_definition/high/handleCreateServiceDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after creation. Default: true.
- `description` (string, optional) - Service definition description. If not provided, service_definition_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `service_definition_name` (string, required) - Service definition name (e.g., ZSD_MY_SERVICE). Must follow SAP naming conventions (start with Z or Y).
- `source_code` (string, optional) - Service definition source code (optional). If not provided, a minimal template will be created.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteServiceDefinition {#deleteservicedefinition-high}
**Description:** Delete an ABAP service definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/service_definition/high/handleDeleteServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetServiceDefinition {#getservicedefinition-high}
**Description:** Retrieve ABAP service definition definition. Supports reading active or inactive version.

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateServiceDefinition {#updateservicedefinition-high}
**Description:** Update source code of an existing ABAP service definition. Uses stateful session with proper lock/unlock mechanism.

**Source:** `src/handlers/service_definition/high/handleUpdateServiceDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after update. Default: true.
- `service_definition_name` (string, required) - Service definition name (e.g., ZSD_MY_SERVICE). Must exist in the system.
- `source_code` (string, required) - Complete service definition source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

### Structure {#high-level-structure}

#### CreateStructure {#createstructure-high}
**Description:** Create a new ABAP structure in SAP system with fields and type references. Includes create, activate, and verify steps.

**Source:** `src/handlers/structure/high/handleCreateStructure.ts`

**Parameters:**
- `data_element` (string, optional) - Data element name for type reference (optional)
- `data_type` (string, optional) - Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional (default: 0)) - Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - Field description
- `domain` (string, optional) - Domain name for type reference (optional)
- `fields` (array, optional) - Array of structure fields
- `length` (number, optional) - Field length
- `package_name` (string, optional) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `structure_name` (string, optional) - Structure name (e.g., ZZ_S_TEST_001). Must follow SAP naming conventions.
- `structure_ref` (string, optional) - Include another structure (optional)
- `table_ref` (string, optional) - Reference to table type (optional)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteStructure {#deletestructure-high}
**Description:** Delete an ABAP structure from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/structure/high/handleDeleteStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetStructure {#getstructure-high}
**Description:** Retrieve ABAP structure definition. Supports reading active or inactive version.

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateStructure {#updatestructure-high}
**Description:** Update DDL source code of an existing ABAP structure. Locks the structure, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing structures without re-creating metadata.

**Source:** `src/handlers/structure/high/handleUpdateStructure.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate structure after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for structure. Example: 
- `structure_name` (string, required) - Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

### System {#high-level-system}

#### GetPackageTree {#getpackagetree-high}
**Description:** [high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions.

**Source:** `src/handlers/system/high/handleGetPackageTree.ts`

**Parameters:**
- `debug` (boolean, optional (default: false)) - Include diagnostic metadata in response (counts, types, hierarchy info). Default: false
- `include_descriptions` (boolean, optional (default: true)) - Include object descriptions in response. Default: true
- `include_subpackages` (boolean, optional (default: true)) - Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true
- `max_depth` (integer, optional (default: 5)) - Maximum depth for recursive package traversal. Default: 5
- `package_name` (string, required) - Package name (e.g., 

---

### Table {#high-level-table}

#### CreateTable {#createtable-high}
**Description:** Create a new ABAP table via the ADT API using provided DDL. Mirrors Eclipse ADT behaviour with status/check runs, lock handling, activation and verification.

**Source:** `src/handlers/table/high/handleCreateTable.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate table after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `ddl_code` (string, required) - Complete DDL code for table creation. Example: 
- `description` (string, optional) - Table description for validation and creation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `table_name` (string, required) - Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteTable {#deletetable-high}
**Description:** Delete an ABAP table from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/table/high/handleDeleteTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetTable {#gettable-high}
**Description:** Retrieve ABAP table definition. Supports reading active or inactive version.

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE).
- `version` (string, optional (default: active)) - Version to read: 

---

#### UpdateTable {#updatetable-high}
**Description:** Update DDL source code of an existing ABAP table. Locks the table, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing tables without re-creating metadata.

**Source:** `src/handlers/table/high/handleUpdateTable.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate table after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for table. Example: 
- `table_name` (string, required) - Table name (e.g., ZZ_TEST_TABLE_001). Table must already exist.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

### Transport {#high-level-transport}

#### CreateTransport {#createtransport-high}
**Description:** Create a new ABAP transport request in SAP system for development objects.

**Source:** `src/handlers/transport/high/handleCreateTransport.ts`

**Parameters:**
- `description` (string, required) - Transport request description (mandatory)
- `owner` (string, optional) - Transport owner (optional, defaults to current user)
- `target_system` (string, optional) - Target system for transport (optional, e.g., 
- `transport_type` (string, optional (default: workbench)) - Transport type: 

---

### Unit Test {#high-level-unit-test}

#### CreateCdsUnitTest {#createcdsunittest-high}
**Description:** Create a CDS unit test class with CDS validation, class template, and local test class source.

**Source:** `src/handlers/unit_test/high/handleCreateCdsUnitTest.ts`

**Parameters:**
- `cds_view_name` (string, required) - CDS view name to validate for unit test doubles.
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `class_template` (string, required) - ABAP class template used for CDS unit tests.
- `description` (string, optional) - Optional description for the global test class.
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_PKG_01, $TMP).
- `test_class_source` (string, required) - Local test class ABAP source code.
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

#### CreateUnitTest {#createunittest-high}
**Description:** Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.

**Source:** `src/handlers/unit_test/high/handleCreateUnitTest.ts`

**Parameters:**
- `test_class` (string, required) - Test class name inside the include (e.g., LTCL_MAIN_CLASS).
- `tests` (array, optional) - List of container/test class pairs to execute.

---

#### DeleteCdsUnitTest {#deletecdsunittest-high}
**Description:** Delete a CDS unit test class (global class).

**Source:** `src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

#### DeleteUnitTest {#deleteunittest-high}
**Description:** Delete an ABAP Unit test run. Note: ADT does not support deleting unit test runs and will return an error.

**Source:** `src/handlers/unit_test/high/handleDeleteUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by CreateUnitTest/RunUnitTest.

---

#### GetCdsUnitTest {#getcdsunittest-high}
**Description:** Retrieve CDS unit test run status and result for a previously started run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.

---

#### GetCdsUnitTestResult {#getcdsunittestresult-high}
**Description:** Retrieve CDS unit test run result for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format: abapunit or junit.
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_navigation_uris` (boolean, optional (default: false)) - Include navigation URIs in result if supported.

---

#### GetCdsUnitTestStatus {#getcdsunitteststatus-high}
**Description:** Retrieve CDS unit test run status for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

#### GetUnitTest {#getunittest-high}
**Description:** Retrieve ABAP Unit test run status and result for a previously started run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by RunUnitTest.

---

#### GetUnitTestResult {#getunittestresult-high}
**Description:** Retrieve ABAP Unit test run result for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format: abapunit or junit.
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_navigation_uris` (boolean, optional (default: false)) - Include navigation URIs in result if supported.

---

#### GetUnitTestStatus {#getunitteststatus-high}
**Description:** Retrieve ABAP Unit test run status for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

#### RunUnitTest {#rununittest-high}
**Description:** Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.

**Source:** `src/handlers/unit_test/high/handleRunUnitTest.ts`

**Parameters:**
- `test_class` (string, required) - Test class name inside the include (e.g., LTCL_MAIN_CLASS).
- `tests` (array, optional) - List of container/test class pairs to execute.

---

#### UpdateCdsUnitTest {#updatecdsunittest-high}
**Description:** Update a CDS unit test class local test class source code.

**Source:** `src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `test_class_source` (string, required) - Updated local test class ABAP source code.
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

#### UpdateUnitTest {#updateunittest-high}
**Description:** Update an ABAP Unit test run. Note: ADT does not support updating unit test runs and will return an error.

**Source:** `src/handlers/unit_test/high/handleUpdateUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by CreateUnitTest/RunUnitTest.

---

### View {#high-level-view}

#### CreateView {#createview-high}
**Description:** Create CDS View or Classic View in SAP using DDL syntax. Both types use the same API workflow, differing only in DDL content (CDS has @AbapCatalog.sqlViewName and other annotations).

**Source:** `src/handlers/view/high/handleCreateView.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true.
- `ddl_source` (string, required) - Complete DDL source code.
- `description` (string, optional) - Optional description (defaults to view_name).
- `transport_request` (string, optional) - Transport request number (required for transportable packages).
- `view_name` (string, required) - View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW).

---

#### DeleteView {#deleteview-high}
**Description:** Delete an ABAP view from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/view/high/handleDeleteView.ts`

**Parameters:**
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).
- `view_name` (string, required) - View name (e.g., Z_MY_VIEW).

---

#### GetView {#getview-high}
**Description:** Retrieve ABAP view definition. Supports reading active or inactive version.

**Source:** `src/handlers/view/high/handleGetView.ts`

**Parameters:**
- `version` (string, optional (default: active)) - Version to read: 
- `view_name` (string, required) - View name (e.g., Z_MY_VIEW).

---

#### UpdateView {#updateview-high}
**Description:** Update DDL source code of an existing CDS View or Classic View. Locks the view, checks new code, uploads new DDL source, unlocks, and optionally activates.

**Source:** `src/handlers/view/high/handleUpdateView.ts`

**Parameters:**
- `ddl_source` (string, required) - Complete DDL source code.
- `view_name` (string, required) - View name (e.g., ZOK_R_TEST_0002).

---

## Low-Level Group {#low-level-group}

### Behavior Definition {#low-level-behavior-definition}

#### ActivateBehaviorDefinitionLow {#activatebehaviordefinitionlow-low}
**Description:** [low-level] Activate an ABAP behavior definition. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_definition/low/handleActivateBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - Behavior definition name (root entity, e.g., ZI_MY_ENTITY).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CheckBdefLow {#checkbdeflow-low}
**Description:** [low-level] Perform syntax check on an ABAP behavior definition. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_definition/low/handleCheckBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CreateBehaviorDefinitionLow {#createbehaviordefinitionlow-low}
**Description:** [low-level] Create a new ABAP Behavior Definition. - use CreateBehaviorDefinition (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/behavior_definition/low/handleCreateBehaviorDefinition.ts`

**Parameters:**
- `description` (string, required) - Behavior Definition description.
- `implementation_type` (string, required) - Implementation type: 
- `name` (string, required) - Behavior Definition name (e.g., ZI_MY_BDEF).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `root_entity` (string, required) - Root entity name (e.g., ZI_MY_ENTITY).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, required) - Transport request number (e.g., E19K905635). Required.

---

#### DeleteBehaviorDefinitionLow {#deletebehaviordefinitionlow-low}
**Description:** [low-level] Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_definition/low/handleDeleteBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockBehaviorDefinitionLow {#lockbehaviordefinitionlow-low}
**Description:** [low-level] Lock an ABAP behavior definition for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/behavior_definition/low/handleLockBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UnlockBehaviorDefinitionLow {#unlockbehaviordefinitionlow-low}
**Description:** [low-level] Unlock an ABAP behavior definition after modification. Must use the same session_id and lock_handle from LockBehaviorDefinition operation.

**Source:** `src/handlers/behavior_definition/low/handleUnlockBehaviorDefinition.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockBehaviorDefinition operation.
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `session_id` (string, required) - Session ID from LockBehaviorDefinition operation. Must be the same as used in LockBehaviorDefinition.
- `session_state` (object, optional) - Session state from LockBehaviorDefinition (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UpdateBehaviorDefinitionLow {#updatebehaviordefinitionlow-low}
**Description:** [low-level] Update source code of an existing ABAP behavior definition. Requires lock handle from LockObject. - use UpdateBehaviorDefinition (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/behavior_definition/low/handleUpdateBehaviorDefinition.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `name` (string, required) - Behavior definition name (e.g., ZOK_C_TEST_0001). Behavior definition must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete behavior definition source code.

---

#### ValidateBehaviorDefinitionLow {#validatebehaviordefinitionlow-low}
**Description:** [low-level] Validate an ABAP behavior definition name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_definition/low/handleValidateBehaviorDefinition.ts`

**Parameters:**
- `description` (string, required) - BehaviorDefinition description. Required for validation.
- `implementation_type` (string, required) - Implementation type: 
- `name` (string, required) - BehaviorDefinition name to validate (e.g., ZI_MY_BDEF).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `root_entity` (string, required) - Root entity name (e.g., ZI_MY_ENTITY). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Behavior Implementation {#low-level-behavior-implementation}

#### CreateBehaviorImplementationLow {#createbehaviorimplementationlow-low}
**Description:** [low-level] Create a new ABAP behavior implementation class with full workflow (create, lock, update main source, update implementations, unlock, activate). - use CreateBehaviorImplementation (high-level) for additional validation.

**Source:** `src/handlers/behavior_implementation/low/handleCreateBehaviorImplementation.ts`

**Parameters:**
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). Required.
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions.
- `description` (string, required) - Class description.
- `implementation_code` (string, optional) - Implementation code for the implementations include (optional).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### LockBehaviorImplementationLow {#lockbehaviorimplementationlow-low}
**Description:** [low-level] Lock an ABAP behavior implementation class for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/behavior_implementation/low/handleLockBehaviorImplementation.ts`

**Parameters:**
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### ValidateBehaviorImplementationLow {#validatebehaviorimplementationlow-low}
**Description:** [low-level] Validate an ABAP behavior implementation class name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_implementation/low/handleValidateBehaviorImplementation.ts`

**Parameters:**
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). Required for validation.
- `class_name` (string, required) - Behavior Implementation class name to validate (e.g., ZBP_MY_ENTITY).
- `description` (string, required) - Class description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Class {#low-level-class}

#### ActivateClassLow {#activateclasslow-low}
**Description:** [low-level] Activate an ABAP class. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/class/low/handleActivateClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### ActivateClassTestClassesLow {#activateclasstestclasseslow-low}
**Description:** [low-level] Activate ABAP Unit test classes include for an existing class. Should be executed after updating and unlocking test classes.

**Source:** `src/handlers/class/low/handleActivateClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `test_class_name` (string, optional) - Optional ABAP Unit test class name (e.g., LTCL_MY_CLASS). Defaults to auto-detected value.

---

#### CheckClassLow {#checkclasslow-low}
**Description:** [low-level] Perform syntax check on an ABAP class. Can check existing class (active/inactive) or hypothetical source code. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/class/low/handleCheckClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `version` (string, optional) - Version to check: 

---

#### CreateClassLow {#createclasslow-low}
**Description:** [low-level] Create a new ABAP class. - use CreateClass (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/class/low/handleCreateClass.ts`

**Parameters:**
- `abstract` (boolean, optional (default: false).)) - Mark class as abstract (optional, default: false).
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions.
- `create_protected` (boolean, optional (default: false).)) - Create protected section (optional, default: false).
- `description` (string, required) - Class description.
- `final` (boolean, optional (default: false).)) - Mark class as final (optional, default: false).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `superclass` (string, optional) - Superclass name (optional).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteClassLow {#deleteclasslow-low}
**Description:** [low-level] Delete an ABAP class from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/class/low/handleDeleteClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### GetClassUnitTestResultLow {#getclassunittestresultlow-low}
**Description:** [low-level] Retrieve ABAP Unit run result (ABAPUnit or JUnit XML) for a completed run_id.

**Source:** `src/handlers/class/low/handleGetClassUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Preferred response format. Defaults to 
- `run_id` (string, required) - Run identifier returned by RunClassUnitTestsLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `with_navigation_uris` (boolean, optional) - Optional flag to request navigation URIs in SAP response (default true).

---

#### GetClassUnitTestStatusLow {#getclassunitteststatuslow-low}
**Description:** [low-level] Retrieve ABAP Unit run status XML for a previously started run_id.

**Source:** `src/handlers/class/low/handleGetClassUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by RunClassUnitTestsLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `with_long_polling` (boolean, optional) - Optional flag to enable SAP long-polling (default true).

---

#### LockClassLow {#lockclasslow-low}
**Description:** [low-level] Lock an ABAP class for modification. Uses session from HandlerContext. Returns lock handle that must be used in subsequent update/unlock operations.

**Source:** `src/handlers/class/low/handleLockClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).

---

#### LockClassTestClassesLow {#lockclasstestclasseslow-low}
**Description:** [low-level] Lock ABAP Unit test classes include (CLAS/OC testclasses) for the specified class. Returns a test_classes_lock_handle for subsequent update/unlock operations using the same session.

**Source:** `src/handlers/class/low/handleLockClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### RunClassUnitTestsLow {#runclassunittestslow-low}
**Description:** [low-level] Start an ABAP Unit test run for provided class test definitions. Returns run_id extracted from SAP response headers.

**Source:** `src/handlers/class/low/handleRunClassUnitTests.ts`

**Parameters:**
- `test_class` (string, required) - Test class name inside the include (e.g., LTCL_MAIN_CLASS).
- `tests` (array, optional) - List of container/test class pairs to execute.

---

#### UnlockClassLow {#unlockclasslow-low}
**Description:** [low-level] Unlock an ABAP class after modification. Uses session from HandlerContext. Must use the same lock_handle from LockClass operation.

**Source:** `src/handlers/class/low/handleUnlockClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle from LockClass operation.

---

#### UnlockClassTestClassesLow {#unlockclasstestclasseslow-low}
**Description:** [low-level] Unlock ABAP Unit test classes include for a class using the test_classes_lock_handle obtained from LockClassTestClassesLow.

**Source:** `src/handlers/class/low/handleUnlockClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle returned by LockClassTestClassesLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UpdateClassLow {#updateclasslow-low}
**Description:** [low-level] Update source code of an existing ABAP class. Uses session from HandlerContext. Requires lock handle from LockClass operation. - use UpdateClass (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/class/low/handleUpdateClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist.
- `lock_handle` (string, required) - Lock handle from LockClass operation. Required for update operation.
- `source_code` (string, required) - Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections.

---

#### UpdateClassTestClassesLow {#updateclasstestclasseslow-low}
**Description:** [low-level] Upload ABAP Unit test include source code for an existing class. Requires test_classes_lock_handle from LockClassTestClassesLow.

**Source:** `src/handlers/class/low/handleUpdateClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Test classes lock handle from LockClassTestClassesLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `test_class_source` (string, required) - Complete ABAP Unit test class source code.

---

#### ValidateClassLow {#validateclasslow-low}
**Description:** [low-level] Validate an ABAP class name before creation. Checks if the name is valid, available, and validates package, description, and superclass if provided. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/class/low/handleValidateClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name to validate (e.g., ZCL_MY_CLASS)
- `description` (string, required) - Description for validation (required).
- `package_name` (string, required) - Package name for validation (required).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `superclass` (string, optional) - Optional superclass name for validation (e.g., CL_OBJECT)

---

### Common {#low-level-common}

#### ActivateObjectLow {#activateobjectlow-low}
**Description:** [low-level] Activate one or multiple ABAP repository objects. Works with any object type; URI is auto-generated from name and type.

**Source:** `src/handlers/common/low/handleActivateObject.ts`

**Parameters:**
- `objects` (array, optional) - Array of objects to activate. Each object must have 

---

#### CheckObjectLow {#checkobjectlow-low}
**Description:** [low-level] Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/common/low/handleCheckObject.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM)
- `object_type` (string, required) - Object type
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 

---

#### DeleteObjectLow {#deleteobjectlow-low}
**Description:** [low-level] Delete an ABAP object via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/common/low/handleDeleteObject.ts`

**Parameters:**
- `function_group_name` (string, optional) - Required only for function_module type
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS)
- `object_type` (string, required) - Object type (class/program/interface/function_group/function_module/table/structure/view/domain/data_element/behavior_definition/metadata_extension)
- `transport_request` (string, optional) - Transport request number

---

#### LockObjectLow {#lockobjectlow-low}
**Description:** [low-level] Lock an ABAP object for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/common/low/handleLockObject.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME
- `object_type` (string, required) - Object type
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, optional) - Super package (required for package locking)

---

#### UnlockObjectLow {#unlockobjectlow-low}
**Description:** [low-level] Unlock an ABAP object after modification. Must use the same session_id and lock_handle from the LockObject operation.

**Source:** `src/handlers/common/low/handleUnlockObject.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject operation
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME
- `object_type` (string, required) - Object type
- `session_id` (string, required) - Session ID from LockObject operation. Must be the same session.
- `session_state` (object, optional) - Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### ValidateObjectLow {#validateobjectlow-low}
**Description:** [low-level] Validate an ABAP object name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/common/low/handleValidateObject.ts`

**Parameters:**
- `behavior_definition` (string, optional) - Optional behavior definition name (required for behavior_implementation validation)
- `description` (string, optional) - Optional description for validation
- `implementation_type` (string, optional) - Implementation type: 
- `object_name` (string, required) - Object name to validate (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE)
- `object_type` (string, required) - Object type: 
- `package_name` (string, optional) - Optional package name for validation
- `root_entity` (string, optional) - Root entity name (required for behavior_definition validation)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Data Element {#low-level-data-element}

#### ActivateDataElementLow {#activatedataelementlow-low}
**Description:** [low-level] Activate an ABAP data element. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleActivateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZDT_MY_ELEMENT).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CheckDataElementLow {#checkdataelementlow-low}
**Description:** [low-level] Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleCheckDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CreateDataElementLow {#createdataelementlow-low}
**Description:** [low-level] Create a new ABAP data element. - use CreateDataElement (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/data_element/low/handleCreateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `data_type` (string, optional) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 
- `decimals` (number, optional) - Decimal places (for predefinedAbapType or refToPredefinedAbapType)
- `description` (string, required) - DataElement description.
- `length` (number, optional) - Data type length (for predefinedAbapType or refToPredefinedAbapType)
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `type_kind` (string, optional) - Type kind: 
- `type_name` (string, optional) - Type name: domain name (when type_kind is 

---

#### DeleteDataElementLow {#deletedataelementlow-low}
**Description:** [low-level] Delete an ABAP data element from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/data_element/low/handleDeleteDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockDataElementLow {#lockdataelementlow-low}
**Description:** [low-level] Lock an ABAP data element for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/data_element/low/handleLockDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UnlockDataElementLow {#unlockdataelementlow-low}
**Description:** [low-level] Unlock an ABAP data element after modification. Must use the same session_id and lock_handle from LockDataElement operation.

**Source:** `src/handlers/data_element/low/handleUnlockDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDataElement operation.
- `session_id` (string, required) - Session ID from LockDataElement operation. Must be the same as used in LockDataElement.
- `session_state` (object, optional) - Session state from LockDataElement (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UpdateDataElementLow {#updatedataelementlow-low}
**Description:** [low-level] Update properties of an existing ABAP data element. Requires lock handle from LockObject. - use UpdateDataElement (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/data_element/low/handleUpdateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZOK_E_TEST_0001). Data element must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `properties` (object, required) - Data element properties object. Can include: description, type_name, type_kind, data_type, field_label_short, field_label_medium, field_label_long, etc.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### ValidateDataElementLow {#validatedataelementlow-low}
**Description:** [low-level] Validate an ABAP data element name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleValidateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name to validate (e.g., Z_MY_PROGRAM).
- `description` (string, required) - DataElement description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Ddlx {#low-level-ddlx}

#### ActivateMetadataExtensionLow {#activatemetadataextensionlow-low}
**Description:** [low-level] Activate an ABAP metadata extension. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleActivateMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - Metadata extension name (e.g., ZC_MY_EXTENSION).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CheckMetadataExtensionLow {#checkmetadataextensionlow-low}
**Description:** [low-level] Perform syntax check on an ABAP metadata extension. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleCheckMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CreateMetadataExtensionLow {#createmetadataextensionlow-low}
**Description:** [low-level] Create a new ABAP Metadata Extension. - use CreateMetadataExtension (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/ddlx/low/handleCreateMetadataExtension.ts`

**Parameters:**
- `description` (string, required) - Metadata Extension description.
- `master_language` (string, optional) - Master language (optional, e.g., 
- `name` (string, required) - Metadata Extension name (e.g., ZI_MY_DDLX).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional for local objects.

---

#### DeleteMetadataExtensionLow {#deletemetadataextensionlow-low}
**Description:** [low-level] Delete an ABAP metadata extension from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/ddlx/low/handleDeleteMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockMetadataExtensionLow {#lockmetadataextensionlow-low}
**Description:** [low-level] Lock an ABAP metadata extension for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/ddlx/low/handleLockMetadataExtension.ts`

**Parameters:**
- `objName` (string, optional) - MetadataExtension name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UnlockMetadataExtensionLow {#unlockmetadataextensionlow-low}
**Description:** [low-level] Unlock an ABAP metadata extension after modification. Must use the same session_id and lock_handle from LockMetadataExtension operation.

**Source:** `src/handlers/ddlx/low/handleUnlockMetadataExtension.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockMetadataExtension operation.
- `objName` (string, optional) - MetadataExtension name (e.g., Z_MY_PROGRAM).
- `session_id` (string, required) - Session ID from LockMetadataExtension operation. Must be the same as used in LockMetadataExtension.
- `session_state` (object, optional) - Session state from LockMetadataExtension (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UpdateMetadataExtensionLow {#updatemetadataextensionlow-low}
**Description:** [low-level] Update source code of an existing ABAP metadata extension. Requires lock handle from LockObject. - use UpdateMetadataExtension (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/ddlx/low/handleUpdateMetadataExtension.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `name` (string, required) - Metadata extension name (e.g., ZOK_C_TEST_0001). Metadata extension must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete metadata extension source code.

---

#### ValidateMetadataExtensionLow {#validatemetadataextensionlow-low}
**Description:** [low-level] Validate an ABAP metadata extension name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleValidateMetadataExtension.ts`

**Parameters:**
- `objName` (string, optional) - MetadataExtension name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Domain {#low-level-domain}

#### ActivateDomainLow {#activatedomainlow-low}
**Description:** [low-level] Activate an ABAP domain. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleActivateDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., ZDM_MY_DOMAIN).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CheckDomainLow {#checkdomainlow-low}
**Description:** [low-level] Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleCheckDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CreateDomainLow {#createdomainlow-low}
**Description:** [low-level] Create a new ABAP domain. - use CreateDomain (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/domain/low/handleCreateDomain.ts`

**Parameters:**
- `description` (string, required) - Domain description.
- `domain_name` (string, required) - Domain name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteDomainLow {#deletedomainlow-low}
**Description:** [low-level] Delete an ABAP domain from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/domain/low/handleDeleteDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockDomainLow {#lockdomainlow-low}
**Description:** [low-level] Lock an ABAP domain for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/domain/low/handleLockDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UnlockDomainLow {#unlockdomainlow-low}
**Description:** [low-level] Unlock an ABAP domain after modification. Must use the same session_id and lock_handle from LockDomain operation.

**Source:** `src/handlers/domain/low/handleUnlockDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDomain operation.
- `session_id` (string, required) - Session ID from LockDomain operation. Must be the same as used in LockDomain.
- `session_state` (object, optional) - Session state from LockDomain (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UpdateDomainLow {#updatedomainlow-low}
**Description:** [low-level] Update properties of an existing ABAP domain. Requires lock handle from LockObject. - use UpdateDomain (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/domain/low/handleUpdateDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., ZOK_D_TEST_0001). Domain must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `properties` (object, required) - Domain properties object. Can include: description, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, etc.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### ValidateDomainLow {#validatedomainlow-low}
**Description:** [low-level] Validate an ABAP domain name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleValidateDomain.ts`

**Parameters:**
- `description` (string, required) - Domain description (required for validation).
- `domain_name` (string, required) - Domain name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (required for validation).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Function {#low-level-function}

#### ActivateFunctionGroupLow {#activatefunctiongrouplow-low}
**Description:** [low-level] Activate an ABAP function group. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleActivateFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FG_TEST).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### ActivateFunctionModuleLow {#activatefunctionmodulelow-low}
**Description:** [low-level] Activate an ABAP function module. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleActivateFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FG_TEST).
- `function_module_name` (string, required) - Function module name (e.g., Z_FM_TEST).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CheckFunctionGroupLow {#checkfunctiongrouplow-low}
**Description:** [low-level] Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleCheckFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CheckFunctionModuleLow {#checkfunctionmodulelow-low}
**Description:** [low-level] Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleCheckFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FUGR_TEST_0001)
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 

---

#### CreateFunctionGroupLow {#createfunctiongrouplow-low}
**Description:** [low-level] Create a new ABAP function group. - use CreateFunctionGroup (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/function/low/handleCreateFunctionGroup.ts`

**Parameters:**
- `description` (string, required) - Function group description.
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### CreateFunctionModuleLow {#createfunctionmodulelow-low}
**Description:** [low-level] Create a new ABAP function module. - use CreateFunctionModule (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/function/low/handleCreateFunctionModule.ts`

**Parameters:**
- `description` (string, required) - Function module description.
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteFunctionGroupLow {#deletefunctiongrouplow-low}
**Description:** [low-level] Delete an ABAP function group from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/function/low/handleDeleteFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### DeleteFunctionModuleLow {#deletefunctionmodulelow-low}
**Description:** [low-level] Delete an ABAP function module from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/function/low/handleDeleteFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockFunctionGroupLow {#lockfunctiongrouplow-low}
**Description:** [low-level] Lock an ABAP function group for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/function/low/handleLockFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### LockFunctionModuleLow {#lockfunctionmodulelow-low}
**Description:** [low-level] Lock an ABAP function module for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/function/low/handleLockFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UnlockFunctionGroupLow {#unlockfunctiongrouplow-low}
**Description:** [low-level] Unlock an ABAP function group after modification. Must use the same session_id and lock_handle from LockFunctionGroup operation.

**Source:** `src/handlers/function/low/handleUnlockFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockFunctionGroup operation.
- `session_id` (string, required) - Session ID from LockFunctionGroup operation. Must be the same as used in LockFunctionGroup.
- `session_state` (object, optional) - Session state from LockFunctionGroup (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UnlockFunctionModuleLow {#unlockfunctionmodulelow-low}
**Description:** [low-level] Unlock an ABAP function module after modification. Must use the same session_id and lock_handle from LockFunctionModule operation.

**Source:** `src/handlers/function/low/handleUnlockFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `lock_handle` (string, required) - Lock handle from LockFunctionModule operation.
- `session_id` (string, required) - Session ID from LockFunctionModule operation. Must be the same as used in LockFunctionModule.
- `session_state` (object, optional) - Session state from LockFunctionModule (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UpdateFunctionModuleLow {#updatefunctionmodulelow-low}
**Description:** [low-level] Update source code of an existing ABAP function module. Requires lock handle from LockObject and function group name. - use UpdateFunctionModule (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/function/low/handleUpdateFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module (e.g., Z_TEST_FG).
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM). Function module must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP function module source code.

---

#### ValidateFunctionGroupLow {#validatefunctiongrouplow-low}
**Description:** [low-level] Validate an ABAP function group name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleValidateFunctionGroup.ts`

**Parameters:**
- `description` (string, optional) - Optional description for validation
- `function_group_name` (string, required) - FunctionGroup name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, optional) - Package name for validation (optional but recommended).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### ValidateFunctionModuleLow {#validatefunctionmodulelow-low}
**Description:** [low-level] Validate an ABAP function module name before creation. Checks if the name is valid and available. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleValidateFunctionModule.ts`

**Parameters:**
- `description` (string, optional) - Optional description for validation
- `function_group_name` (string, required) - Function group name (e.g., Z_FUGR_TEST_0001)
- `function_module_name` (string, required) - Function module name to validate (e.g., Z_TEST_FM)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Interface {#low-level-interface}

#### ActivateInterfaceLow {#activateinterfacelow-low}
**Description:** [low-level] Activate an ABAP interface. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleActivateInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CheckInterfaceLow {#checkinterfacelow-low}
**Description:** [low-level] Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleCheckInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CreateInterfaceLow {#createinterfacelow-low}
**Description:** [low-level] Create a new ABAP interface. - use CreateInterface (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/interface/low/handleCreateInterface.ts`

**Parameters:**
- `description` (string, required) - Interface description.
- `interface_name` (string, required) - Interface name (e.g., ZIF_TEST_INTERFACE). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteInterfaceLow {#deleteinterfacelow-low}
**Description:** [low-level] Delete an ABAP interface from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/interface/low/handleDeleteInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockInterfaceLow {#lockinterfacelow-low}
**Description:** [low-level] Lock an ABAP interface for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/interface/low/handleLockInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UnlockInterfaceLow {#unlockinterfacelow-low}
**Description:** [low-level] Unlock an ABAP interface after modification. Must use the same session_id and lock_handle from LockInterface operation.

**Source:** `src/handlers/interface/low/handleUnlockInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockInterface operation.
- `session_id` (string, required) - Session ID from LockInterface operation. Must be the same as used in LockInterface.
- `session_state` (object, optional) - Session state from LockInterface (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UpdateInterfaceLow {#updateinterfacelow-low}
**Description:** [low-level] Update source code of an existing ABAP interface. Requires lock handle from LockObject. - use UpdateInterface (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/interface/low/handleUpdateInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_TEST_INTERFACE). Interface must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP interface source code.

---

#### ValidateInterfaceLow {#validateinterfacelow-low}
**Description:** [low-level] Validate an ABAP interface name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleValidateInterface.ts`

**Parameters:**
- `description` (string, required) - Interface description. Required for validation.
- `interface_name` (string, required) - Interface name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Package {#low-level-package}

#### CheckPackageLow {#checkpackagelow-low}
**Description:** [low-level] Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/package/low/handleCheckPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.

---

#### CreatePackageLow {#createpackagelow-low}
**Description:** [low-level] Create a new ABAP package. - use CreatePackage (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/package/low/handleCreatePackage.ts`

**Parameters:**
- `application_component` (string, optional) - Application component (e.g., BC-ABA).
- `description` (string, required) - Package description.
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions.
- `package_type` (string, optional) - Package type (development/structure). Defaults to development.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `software_component` (string, optional) - Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages).
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.
- `transport_layer` (string, optional) - Transport layer (e.g., ZDEV). Required for transportable packages.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeletePackageLow {#deletepackagelow-low}
**Description:** [low-level] Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/package/low/handleDeletePackage.ts`

**Parameters:**
- `connection_config` (object, optional) - Optional SAP connection config to create a fresh connection for deletion. Useful when the existing connection config is unavailable.
- `force_new_connection` (boolean, optional) - Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false.
- `package_name` (string, required) - Package name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockPackageLow {#lockpackagelow-low}
**Description:** [low-level] Lock an ABAP package for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id. Requires super_package.

**Source:** `src/handlers/package/low/handleLockPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.

---

#### UnlockPackageLow {#unlockpackagelow-low}
**Description:** [low-level] Unlock an ABAP package after modification. Requires lock handle from LockObject and superPackage. - must use the same session_id and lock_handle from LockObject.

**Source:** `src/handlers/package/low/handleUnlockPackage.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject operation
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002). Package must already exist.
- `session_id` (string, required) - Session ID from LockObject operation. Must be the same as used in LockObject.
- `session_state` (object, optional) - Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name. Required for package operations.

---

#### UpdatePackageLow {#updatepackagelow-low}
**Description:** [low-level] Update description of an existing ABAP package. Requires lock handle from LockObject and superPackage. - use UpdatePackageSource for full workflow with lock/unlock.

**Source:** `src/handlers/package/low/handleUpdatePackage.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002). Package must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name. Required for package operations.
- `updated_description` (string, required) - New description for the package.

---

#### ValidatePackageLow {#validatepackagelow-low}
**Description:** [low-level] Validate an ABAP package name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/package/low/handleValidatePackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Program {#low-level-program}

#### ActivateProgramLow {#activateprogramlow-low}
**Description:** [low-level] Activate an ABAP program. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleActivateProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CheckProgramLow {#checkprogramlow-low}
**Description:** [low-level] Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleCheckProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### CreateProgramLow {#createprogramlow-low}
**Description:** [low-level] Create a new ABAP program. - use CreateProgram (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/program/low/handleCreateProgram.ts`

**Parameters:**
- `application` (string, optional (default: *').)) - Application area (optional, default: 
- `description` (string, required) - Program description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `program_type` (string, optional) - Program type: 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteProgramLow {#deleteprogramlow-low}
**Description:** [low-level] Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/program/low/handleDeleteProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockProgramLow {#lockprogramlow-low}
**Description:** [low-level] Lock an ABAP program for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/program/low/handleLockProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UnlockProgramLow {#unlockprogramlow-low}
**Description:** [low-level] Unlock an ABAP program after modification. Must use the same session_id and lock_handle from LockProgram operation.

**Source:** `src/handlers/program/low/handleUnlockProgram.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockProgram operation.
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, required) - Session ID from LockProgram operation. Must be the same as used in LockProgram.
- `session_state` (object, optional) - Session state from LockProgram (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### UpdateProgramLow {#updateprogramlow-low}
**Description:** [low-level] Update source code of an existing ABAP program. Requires lock handle from LockObject. - use UpdateProgram (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/program/low/handleUpdateProgram.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM). Program must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP program source code.

---

#### ValidateProgramLow {#validateprogramlow-low}
**Description:** [low-level] Validate an ABAP program name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleValidateProgram.ts`

**Parameters:**
- `description` (string, required) - Program description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `program_name` (string, required) - Program name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

### Structure {#low-level-structure}

#### ActivateStructureLow {#activatestructurelow-low}
**Description:** [low-level] Activate an ABAP structure. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/structure/low/handleActivateStructure.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., ZST_MY_STRUCTURE).

---

#### CheckStructureLow {#checkstructurelow-low}
**Description:** [low-level] Perform syntax check on an ABAP structure. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).

**Source:** `src/handlers/structure/low/handleCheckStructure.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).
- `version` (string, optional) - Version to check: 

---

#### CreateStructureLow {#createstructurelow-low}
**Description:** [low-level] Create a new ABAP structure. - use CreateStructure (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/structure/low/handleCreateStructure.ts`

**Parameters:**
- `application` (string, optional (default: *').)) - Application area (optional, default: 
- `description` (string, required) - Structure description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `structure_type` (string, optional) - Structure type: 
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteStructureLow {#deletestructurelow-low}
**Description:** [low-level] Delete an ABAP structure from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/structure/low/handleDeleteStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockStructureLow {#lockstructurelow-low}
**Description:** [low-level] Lock an ABAP structure for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/structure/low/handleLockStructure.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).

---

#### UnlockStructureLow {#unlockstructurelow-low}
**Description:** [low-level] Unlock an ABAP structure after modification. Must use the same session_id and lock_handle from LockStructure operation.

**Source:** `src/handlers/structure/low/handleUnlockStructure.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockStructure operation.
- `session_id` (string, required) - Session ID from LockStructure operation. Must be the same as used in LockStructure.
- `session_state` (object, optional) - Session state from LockStructure (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).

---

#### UpdateStructureLow {#updatestructurelow-low}
**Description:** [low-level] Update DDL source code of an existing ABAP structure. Requires lock handle from LockObject. - use UpdateStructureSource for full workflow with lock/unlock.

**Source:** `src/handlers/structure/low/handleUpdateStructure.ts`

**Parameters:**
- `ddl_code` (string, required) - Complete DDL source code for the structure definition.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.

---

#### ValidateStructureLow {#validatestructurelow-low}
**Description:** [low-level] Validate an ABAP structure name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/structure/low/handleValidateStructure.ts`

**Parameters:**
- `description` (string, required) - Structure description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name to validate (e.g., Z_MY_PROGRAM).

---

### System {#low-level-system}

#### GetNodeStructureLow {#getnodestructurelow-low}
**Description:** [low-level] Fetch node structure from ADT repository. Used for object tree navigation and structure discovery. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/system/low/handleGetNodeStructure.ts`

**Parameters:**
- `node_id` (string, optional (default: 0000" for root). Use to fetch child nodes.)) - Optional node ID (default: 
- `parent_name` (string, required) - Parent object name
- `parent_type` (string, required) - Parent object type (e.g., 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `with_short_descriptions` (boolean, optional (default: true)) - Include short descriptions in response

---

#### GetObjectStructureLow {#getobjectstructurelow-low}
**Description:** [low-level] Retrieve ADT object structure as compact JSON tree. Returns XML response with object structure tree. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/system/low/handleGetObjectStructure.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., 
- `object_type` (string, required) - Object type (e.g., 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

#### GetVirtualFoldersLow {#getvirtualfolderslow-low}
**Description:** [low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.

**Source:** `src/handlers/system/low/handleGetVirtualFolders.ts`

**Parameters:**
- `object_search_pattern` (string, optional (default: *)) - Object search pattern (e.g., 
- `preselection` (array, optional) - Optional preselection filters (facet-value pairs for filtering)
- `values` (array, required) - Array of facet values to filter by

---

### Table {#low-level-table}

#### ActivateTableLow {#activatetablelow-low}
**Description:** [low-level] Activate an ABAP table. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/table/low/handleActivateTable.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., ZTB_MY_TABLE).

---

#### CheckTableLow {#checktablelow-low}
**Description:** [low-level] Perform syntax check on an ABAP table. Returns syntax errors, warnings, and messages. Requires session_id for stateful operations. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).

**Source:** `src/handlers/table/low/handleCheckTable.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `reporter` (string, optional) - Check reporter: 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE)
- `version` (string, optional) - Version to check: 

---

#### CreateTableLow {#createtablelow-low}
**Description:** [low-level] Create a new ABAP table. - use CreateTable (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/table/low/handleCreateTable.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., ZT_TEST_001). Must follow SAP naming conventions.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

#### DeleteTableLow {#deletetablelow-low}
**Description:** [low-level] Delete an ABAP table from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/table/low/handleDeleteTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

#### LockTableLow {#locktablelow-low}
**Description:** [low-level] Lock an ABAP table for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/table/low/handleLockTable.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).

---

#### UnlockTableLow {#unlocktablelow-low}
**Description:** [low-level] Unlock an ABAP table after modification. Must use the same session_id and lock_handle from LockTable operation.

**Source:** `src/handlers/table/low/handleUnlockTable.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockTable operation.
- `session_id` (string, required) - Session ID from LockTable operation. Must be the same as used in LockTable.
- `session_state` (object, optional) - Session state from LockTable (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).

---

#### UpdateTableLow {#updatetablelow-low}
**Description:** [low-level] Update DDL source code of an existing ABAP table. Requires lock handle from LockObject. - use CreateTable for full workflow with lock/unlock.

**Source:** `src/handlers/table/low/handleUpdateTable.ts`

**Parameters:**
- `ddl_code` (string, required) - Complete DDL source code for the table definition.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., ZOK_T_TEST_0001). Table must already exist.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

#### ValidateTableLow {#validatetablelow-low}
**Description:** [low-level] Validate an ABAP table name before creation. Checks if the name is valid and available. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/table/low/handleValidateTable.ts`

**Parameters:**
- `description` (string, required) - Table description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name to validate (e.g., Z_MY_TABLE)

---

### Transport {#low-level-transport}

#### CreateTransportLow {#createtransportlow-low}
**Description:** [low-level] Create a new ABAP transport request.

**Source:** `src/handlers/transport/low/handleCreateTransport.ts`

**Parameters:**
- `description` (string, required) - Transport request description.
- `transport_type` (string, optional (default: workbench').)) - Transport type: 

---

### View {#low-level-view}

#### ActivateViewLow {#activateviewlow-low}
**Description:** [low-level] Activate an ABAP view (CDS view). Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/view/low/handleActivateView.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name (e.g., ZVW_MY_VIEW).

---

#### CheckViewLow {#checkviewlow-low}
**Description:** [low-level] Perform syntax check on an ABAP view. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_source is provided, validates new/unsaved code (will be base64 encoded in request).

**Source:** `src/handlers/view/low/handleCheckView.ts`

**Parameters:**
- `ddl_source` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 
- `view_name` (string, required) - View name (e.g., Z_MY_PROGRAM).

---

#### CreateViewLow {#createviewlow-low}
**Description:** [low-level] Create a new ABAP view. - use CreateView (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/view/low/handleCreateView.ts`

**Parameters:**
- `application` (string, optional (default: *').)) - Application area (optional, default: 
- `description` (string, required) - View description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `view_name` (string, required) - View name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `view_type` (string, optional) - View type: 

---

#### DeleteViewLow {#deleteviewlow-low}
**Description:** [low-level] Delete an ABAP view from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/view/low/handleDeleteView.ts`

**Parameters:**
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).
- `view_name` (string, required) - View name (e.g., Z_MY_PROGRAM).

---

#### LockViewLow {#lockviewlow-low}
**Description:** [low-level] Lock an ABAP view for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/view/low/handleLockView.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name (e.g., Z_MY_PROGRAM).

---

#### UnlockViewLow {#unlockviewlow-low}
**Description:** [low-level] Unlock an ABAP view after modification. Must use the same session_id and lock_handle from LockView operation.

**Source:** `src/handlers/view/low/handleUnlockView.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockView operation.
- `session_id` (string, required) - Session ID from LockView operation. Must be the same as used in LockView.
- `session_state` (object, optional) - Session state from LockView (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name (e.g., Z_MY_PROGRAM).

---

#### UpdateViewLow {#updateviewlow-low}
**Description:** [low-level] Update DDL source code of an existing CDS View or Classic View. Requires lock handle from LockObject. - use UpdateView (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/view/low/handleUpdateView.ts`

**Parameters:**
- `ddl_source` (string, required) - Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name (e.g., ZOK_R_TEST_0002). View must already exist.

---

#### ValidateViewLow {#validateviewlow-low}
**Description:** [low-level] Validate an ABAP view name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/view/low/handleValidateView.ts`

**Parameters:**
- `description` (string, required) - View description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name to validate (e.g., Z_MY_PROGRAM).

---

*Last updated: 2026-02-11*
