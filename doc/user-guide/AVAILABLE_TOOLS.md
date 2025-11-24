# Available Tools Reference - MCP ABAP ADT Server

This document contains a complete list of all tools (functions) provided by the MCP ABAP ADT server, with descriptions of their purpose and parameters.

> **Note:** This document is automatically generated from `TOOL_DEFINITION` exports in handler modules. To regenerate, run:
> ```bash
> npm run docs:tools
> ```

## 📊 Tool Summary

- Total tools: 157
- High-level tools: 23
- Low-level tools: 97
- Read-only tools: 37
- Other tools: 0

## 📋 Navigation

The navigation below mirrors the document structure for easier discovery.

- [Programs, Classes, Functions](#programs,-classes,-functions) (39 tools – 7 high-level, 27 low-level, 5 read-only)
  - [Read-Only Tools](#programs,-classes,-functions-read-only)
    - [GetClass](#getclass-readonly)
    - [GetFunction](#getfunction-readonly)
    - [GetFunctionGroup](#getfunctiongroup-readonly)
    - [GetProgFullCode](#getprogfullcode-readonly)
    - [GetProgram](#getprogram-readonly)
  - [High-Level Tools](#programs,-classes,-functions-high-level)
    - [CreateClass](#createclass-high)
    - [CreateFunctionGroup](#createfunctiongroup-high)
    - [CreateFunctionModule](#createfunctionmodule-high)
    - [CreateProgram](#createprogram-high)
    - [UpdateClass](#updateclass-high)
    - [UpdateFunctionModule](#updatefunctionmodule-high)
    - [UpdateProgram](#updateprogram-high)
  - [Low-Level Tools](#programs,-classes,-functions-low-level)
    - [CheckClass](#checkclass-low)
    - [CheckFunctionGroup](#checkfunctiongroup-low)
    - [CheckFunctionModule](#checkfunctionmodule-low)
    - [CheckProgram](#checkprogram-low)
    - [CreateClass](#createclass-low)
    - [CreateFunctionGroup](#createfunctiongroup-low)
    - [CreateFunctionModule](#createfunctionmodule-low)
    - [CreateProgram](#createprogram-low)
    - [DeleteClass](#deleteclass-low)
    - [DeleteFunctionGroup](#deletefunctiongroup-low)
    - [DeleteFunctionModule](#deletefunctionmodule-low)
    - [DeleteProgram](#deleteprogram-low)
    - [LockClass](#lockclass-low)
    - [LockFunctionGroup](#lockfunctiongroup-low)
    - [LockFunctionModule](#lockfunctionmodule-low)
    - [LockProgram](#lockprogram-low)
    - [UnlockClass](#unlockclass-low)
    - [UnlockFunctionGroup](#unlockfunctiongroup-low)
    - [UnlockFunctionModule](#unlockfunctionmodule-low)
    - [UnlockProgram](#unlockprogram-low)
    - [UpdateClass](#updateclass-low)
    - [UpdateFunctionModule](#updatefunctionmodule-low)
    - [UpdateProgram](#updateprogram-low)
    - [ValidateClass](#validateclass-low)
    - [ValidateFunctionGroup](#validatefunctiongroup-low)
    - [ValidateFunctionModule](#validatefunctionmodule-low)
    - [ValidateProgram](#validateprogram-low)
- [Tables and Structures](#tables-and-structures) (49 tools – 8 high-level, 35 low-level, 6 read-only)
  - [Read-Only Tools](#tables-and-structures-read-only)
    - [GetDataElement](#getdataelement-readonly)
    - [GetDomain](#getdomain-readonly)
    - [GetStructure](#getstructure-readonly)
    - [GetTable](#gettable-readonly)
    - [GetTableContents](#gettablecontents-readonly)
    - [GetView](#getview-readonly)
  - [High-Level Tools](#tables-and-structures-high-level)
    - [CreateDataElement](#createdataelement-high)
    - [CreateDomain](#createdomain-high)
    - [CreateStructure](#createstructure-high)
    - [CreateTable](#createtable-high)
    - [CreateView](#createview-high)
    - [UpdateDataElement](#updatedataelement-high)
    - [UpdateDomain](#updatedomain-high)
    - [UpdateView](#updateview-high)
  - [Low-Level Tools](#tables-and-structures-low-level)
    - [CheckDataElement](#checkdataelement-low)
    - [CheckDomain](#checkdomain-low)
    - [CheckStructure](#checkstructure-low)
    - [CheckTable](#checktable-low)
    - [CheckView](#checkview-low)
    - [CreateDataElement](#createdataelement-low)
    - [CreateDomain](#createdomain-low)
    - [CreateStructure](#createstructure-low)
    - [CreateTable](#createtable-low)
    - [CreateView](#createview-low)
    - [DeleteDataElement](#deletedataelement-low)
    - [DeleteDomain](#deletedomain-low)
    - [DeleteStructure](#deletestructure-low)
    - [DeleteTable](#deletetable-low)
    - [DeleteView](#deleteview-low)
    - [LockDataElement](#lockdataelement-low)
    - [LockDomain](#lockdomain-low)
    - [LockStructure](#lockstructure-low)
    - [LockTable](#locktable-low)
    - [LockView](#lockview-low)
    - [UnlockDataElement](#unlockdataelement-low)
    - [UnlockDomain](#unlockdomain-low)
    - [UnlockStructure](#unlockstructure-low)
    - [UnlockTable](#unlocktable-low)
    - [UnlockView](#unlockview-low)
    - [UpdateDataElement](#updatedataelement-low)
    - [UpdateDomain](#updatedomain-low)
    - [UpdateStructure](#updatestructure-low)
    - [UpdateTable](#updatetable-low)
    - [UpdateView](#updateview-low)
    - [ValidateDataElement](#validatedataelement-low)
    - [ValidateDomain](#validatedomain-low)
    - [ValidateStructure](#validatestructure-low)
    - [ValidateTable](#validatetable-low)
    - [ValidateView](#validateview-low)
- [Packages and Interfaces](#packages-and-interfaces) (19 tools – 3 high-level, 14 low-level, 2 read-only)
  - [Read-Only Tools](#packages-and-interfaces-read-only)
    - [GetInterface](#getinterface-readonly)
    - [GetPackage](#getpackage-readonly)
  - [High-Level Tools](#packages-and-interfaces-high-level)
    - [CreateInterface](#createinterface-high)
    - [CreatePackage](#createpackage-high)
    - [UpdateInterface](#updateinterface-high)
  - [Low-Level Tools](#packages-and-interfaces-low-level)
    - [CheckInterface](#checkinterface-low)
    - [CheckPackage](#checkpackage-low)
    - [CreateInterface](#createinterface-low)
    - [CreatePackage](#createpackage-low)
    - [DeleteInterface](#deleteinterface-low)
    - [DeletePackage](#deletepackage-low)
    - [LockInterface](#lockinterface-low)
    - [LockPackage](#lockpackage-low)
    - [UnlockInterface](#unlockinterface-low)
    - [UnlockPackage](#unlockpackage-low)
    - [UpdateInterface](#updateinterface-low)
    - [UpdatePackage](#updatepackage-low)
    - [ValidateInterface](#validateinterface-low)
    - [ValidatePackage](#validatepackage-low)
- [Includes and Hierarchies](#includes-and-hierarchies) (2 tools – 2 read-only)
  - [Read-Only Tools](#includes-and-hierarchies-read-only)
    - [GetInclude](#getinclude-readonly)
    - [GetIncludesList](#getincludeslist-readonly)
- [Types, Descriptions, Metadata](#types,-descriptions,-metadata) (14 tools – 14 read-only)
  - [Read-Only Tools](#types,-descriptions,-metadata-read-only)
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
- [Search, SQL, Transactions](#search,-sql,-transactions) (6 tools – 1 high-level, 1 low-level, 4 read-only)
  - [Read-Only Tools](#search,-sql,-transactions-read-only)
    - [GetObjectsByType](#getobjectsbytype-readonly)
    - [GetObjectsList](#getobjectslist-readonly)
    - [GetTransport](#gettransport-readonly)
    - [SearchObject](#searchobject-readonly)
  - [High-Level Tools](#search,-sql,-transactions-high-level)
    - [CreateTransport](#createtransport-high)
  - [Low-Level Tools](#search,-sql,-transactions-low-level)
    - [CreateTransport](#createtransport-low)
- [Enhancements](#enhancements) (22 tools – 4 high-level, 14 low-level, 4 read-only)
  - [Read-Only Tools](#enhancements-read-only)
    - [GetBdef](#getbdef-readonly)
    - [GetEnhancementImpl](#getenhancementimpl-readonly)
    - [GetEnhancements](#getenhancements-readonly)
    - [GetEnhancementSpot](#getenhancementspot-readonly)
  - [High-Level Tools](#enhancements-high-level)
    - [CreateBehaviorDefinition](#createbehaviordefinition-high)
    - [CreateMetadataExtension](#createmetadataextension-high)
    - [UpdateBehaviorDefinition](#updatebehaviordefinition-high)
    - [UpdateMetadataExtension](#updatemetadataextension-high)
  - [Low-Level Tools](#enhancements-low-level)
    - [CheckBehaviorDefinition](#checkbehaviordefinition-low)
    - [CheckMetadataExtension](#checkmetadataextension-low)
    - [CreateBehaviorDefinition](#createbehaviordefinition-low)
    - [CreateMetadataExtension](#createmetadataextension-low)
    - [DeleteBehaviorDefinition](#deletebehaviordefinition-low)
    - [DeleteMetadataExtension](#deletemetadataextension-low)
    - [LockBehaviorDefinition](#lockbehaviordefinition-low)
    - [LockMetadataExtension](#lockmetadataextension-low)
    - [UnlockBehaviorDefinition](#unlockbehaviordefinition-low)
    - [UnlockMetadataExtension](#unlockmetadataextension-low)
    - [UpdateBehaviorDefinition](#updatebehaviordefinition-low)
    - [UpdateMetadataExtension](#updatemetadataextension-low)
    - [ValidateBehaviorDefinition](#validatebehaviordefinition-low)
    - [ValidateMetadataExtension](#validatemetadataextension-low)

---

## Programs, Classes, Functions

### Read-Only Tools {#programs,-classes,-functions-read-only}

*Read-only tools retrieve information without modifying the system.*

### GetClass {#getclass-readonly}
**Description:** [read-only] Retrieve ABAP class source code.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetFunction {#getfunction-readonly}
**Description:** [read-only] Retrieve ABAP Function Module source code.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetFunctionGroup {#getfunctiongroup-readonly}
**Description:** [read-only] Retrieve ABAP Function Group source code.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetProgFullCode {#getprogfullcode-readonly}
**Description:** [read-only] Returns the full code for a program or function group, including all includes, in tree traversal order.

**Parameters:**
- `inputSchema` (string, optional) - [read-only] Technical name of the program or function group (e.g., 
- `type` (string, required) - [read-only] 

**Example:**
```json
{
  "type": "\"PROG/P\""
}
```

---

### GetProgram {#getprogram-readonly}
**Description:** [read-only] Retrieve ABAP program source code. Returns only the main program source code without includes or enhancements.

**Parameters:** None

**Example:**
```json
{}
```

---


### High-Level Tools {#programs,-classes,-functions-high-level}

*High-level tools perform a chain of operations (e.g., validate → lock → update → check → unlock → activate).*

### CreateClass {#createclass-high}
**Description:** Create a new ABAP class in SAP system with source code. Supports public/protected/private sections, interfaces, and inheritance. Uses stateful session for proper lock management.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions (start with Z or Y).
- `description` (string, optional) - Class description. If not provided, class_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `superclass` (string, optional) - Optional superclass name for inheritance (e.g., CL_OBJECT)
- `final` (boolean, optional) - Mark class as final (cannot be inherited). Default: false
- `abstract` (boolean, optional) - Mark class as abstract (cannot be instantiated). Default: false
- `create_protected` (boolean, optional) - Constructor visibility is protected. Default: false (public)
- `source_code` (string, optional) - Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections. If not provided, generates minimal template.
- `activate` (boolean, optional) - Activate class after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `master_system` (string, optional) - Master system ID (e.g., 
- `responsible` (string, optional) - User responsible for the object (e.g., 

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreateFunctionGroup {#createfunctiongroup-high}
**Description:** Create a new ABAP function group in SAP system. Function groups serve as containers for function modules. Uses stateful session for proper lock management.

**Parameters:**
- `inputSchema` (string, optional) - Function group name (e.g., ZTEST_FG_001). Must follow SAP naming conventions (start with Z or Y, max 26 chars).
- `description` (string, optional) - Function group description. If not provided, function_group_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `activate` (boolean, optional) - Activate function group after creation. Default: true. Set to false for batch operations.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreateFunctionModule {#createfunctionmodule-high}
**Description:** Create a new ABAP function module within an existing function group. Uses stateful session with LOCK/UNLOCK workflow for source code upload.

**Parameters:**
- `inputSchema` (string, optional) - Parent function group name (e.g., ZTEST_FG_001)
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars).
- `source_code` (string, required) - ABAP source code for the function module including signature (FUNCTION name IMPORTING/EXPORTING ... ENDFUNCTION).
- `description` (string, optional) - Optional description for the function module
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `activate` (boolean, optional (default: "true)")) - Whether to activate the function module after creation (default: true)

**Example:**
```json
{
  "function_module_name": "\"ZMY_FUNCTION_MODULE_NAME\"",
  "source_code": "\"example_value\"",
  "activate": "true)"
}
```

---

### CreateProgram {#createprogram-high}
**Description:** Create a new ABAP program (report) in SAP system with source code. Supports executable programs, includes, module pools. Uses stateful session for proper lock management.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_TEST_PROGRAM_001). Must follow SAP naming conventions (start with Z or Y).
- `description` (string, optional) - Program description. If not provided, program_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `program_type` (string, optional) - Program type: 
- `application` (string, optional) - Application area (e.g., 
- `source_code` (string, optional) - Complete ABAP program source code. If not provided, generates minimal template based on program_type.
- `activate` (boolean, optional) - Activate program after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `master_system` (string, optional) - Master system ID (e.g., 
- `responsible` (string, optional) - User responsible for the object (e.g., 

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### UpdateClass {#updateclass-high}
**Description:** Update source code of an existing ABAP class. Locks the class, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing classes without re-creating metadata.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist.
- `source_code` (string, required) - Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections.
- `activate` (boolean, optional) - Activate class after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.

**Example:**
```json
{
  "source_code": "\"example_value\""
}
```

---

### UpdateFunctionModule {#updatefunctionmodule-high}
**Description:** Update source code of an existing ABAP function module. Locks the function module, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing function modules without re-creating metadata.

**Parameters:**
- `inputSchema` (string, optional) - Function group name containing the function module (e.g., ZOK_FG_MCP01).
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM_MCP01). Function module must already exist.
- `source_code` (string, required) - Complete ABAP function module source code. Must include FUNCTION statement with parameters and ENDFUNCTION. Example:\n\nFUNCTION Z_TEST_FM\n  IMPORTING\n    VALUE(iv_input) TYPE string\n  EXPORTING\n    VALUE(ev_output) TYPE string.\n  \n  ev_output = iv_input.\nENDFUNCTION.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable function modules.
- `activate` (boolean, optional) - Activate function module after source update. Default: false. Set to true to activate immediately.

**Example:**
```json
{
  "function_module_name": "\"ZMY_FUNCTION_MODULE_NAME\"",
  "source_code": "\"example_value\""
}
```

---

### UpdateProgram {#updateprogram-high}
**Description:** Update source code of an existing ABAP program. Locks the program, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing programs without re-creating metadata.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist.
- `source_code` (string, required) - Complete ABAP program source code.
- `activate` (boolean, optional) - Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.

**Example:**
```json
{
  "source_code": "\"example_value\""
}
```

---


### Low-Level Tools {#programs,-classes,-functions-low-level}

*Low-level tools perform a single operation (one method call to CrudClient).*

### CheckClass {#checkclass-low}
**Description:** [low-level] Perform syntax check on an ABAP class. Can check existing class (active/inactive) or hypothetical source code. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS)
- `version` (string, optional) - Version to check: 
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckFunctionGroup {#checkfunctiongroup-low}
**Description:** [low-level] Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckFunctionModule {#checkfunctionmodule-low}
**Description:** [low-level] Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Function group name (e.g., Z_FUGR_TEST_0001)
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM)
- `version` (string, optional) - Version to check: 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "function_module_name": "\"ZMY_FUNCTION_MODULE_NAME\""
}
```

---

### CheckProgram {#checkprogram-low}
**Description:** [low-level] Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CreateClass {#createclass-low}
**Description:** [low-level] Create a new ABAP class. - use CreateClass (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions.
- `description` (string, required) - Class description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `superclass` (string, optional) - Superclass name (optional).
- `final` (boolean, optional (default: "false).")) - Mark class as final (optional, default: false).
- `abstract` (boolean, optional (default: "false).")) - Mark class as abstract (optional, default: false).
- `create_protected` (boolean, optional (default: "false).")) - Create protected section (optional, default: false).
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the class (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "final": "false).",
  "abstract": "false).",
  "create_protected": "false)."
}
```

---

### CreateFunctionGroup {#createfunctiongroup-low}
**Description:** [low-level] Create a new ABAP function group. - use CreateFunctionGroup (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Function group name (e.g., ZFG_MY_GROUP). Must follow SAP naming conventions.
- `description` (string, required) - Function group description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreateFunctionModule {#createfunctionmodule-low}
**Description:** [low-level] Create a new ABAP function module. - use CreateFunctionModule (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Function module name (e.g., Z_MY_FUNCTION).
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `description` (string, required) - Function module description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "function_group_name": "\"ZMY_FUNCTION_GROUP_NAME\"",
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreateProgram {#createprogram-low}
**Description:** [low-level] Create a new ABAP program. - use CreateProgram (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - Program description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `program_type` (string, optional) - Program type: 
- `application` (string, optional (default: "*).")) - Application area (optional, default: 
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the program (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "application": "\"example_value\""
}
```

---

### DeleteClass {#deleteclass-low}
**Description:** [low-level] Delete an ABAP class from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteFunctionGroup {#deletefunctiongroup-low}
**Description:** [low-level] Delete an ABAP function group from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteFunctionModule {#deletefunctionmodule-low}
**Description:** [low-level] Delete an ABAP function module from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Function module name (e.g., Z_MY_FUNCTION).
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{
  "function_group_name": "\"ZMY_FUNCTION_GROUP_NAME\""
}
```

---

### DeleteProgram {#deleteprogram-low}
**Description:** [low-level] Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### LockClass {#lockclass-low}
**Description:** [low-level] Lock an ABAP class for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockFunctionGroup {#lockfunctiongroup-low}
**Description:** [low-level] Lock an ABAP function group for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockFunctionModule {#lockfunctionmodule-low}
**Description:** [low-level] Lock an ABAP function module for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - Function module name (e.g., Z_MY_FUNCTION).
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "function_group_name": "\"ZMY_FUNCTION_GROUP_NAME\""
}
```

---

### LockProgram {#lockprogram-low}
**Description:** [low-level] Lock an ABAP program for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### UnlockClass {#unlockclass-low}
**Description:** [low-level] Unlock an ABAP class after modification. Must use the same session_id and lock_handle from LockClass operation.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle from LockClass operation.
- `session_id` (string, required) - Session ID from LockClass operation. Must be the same as used in LockClass.
- `session_state` (object, optional) - Session state from LockClass (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockFunctionGroup {#unlockfunctiongroup-low}
**Description:** [low-level] Unlock an ABAP function group after modification. Must use the same session_id and lock_handle from LockFunctionGroup operation.

**Parameters:**
- `inputSchema` (string, optional) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockFunctionGroup operation.
- `session_id` (string, required) - Session ID from LockFunctionGroup operation. Must be the same as used in LockFunctionGroup.
- `session_state` (object, optional) - Session state from LockFunctionGroup (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockFunctionModule {#unlockfunctionmodule-low}
**Description:** [low-level] Unlock an ABAP function module after modification. Must use the same session_id and lock_handle from LockFunctionModule operation.

**Parameters:**
- `inputSchema` (string, optional) - Function module name (e.g., Z_MY_FUNCTION).
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `lock_handle` (string, required) - Lock handle from LockFunctionModule operation.
- `session_id` (string, required) - Session ID from LockFunctionModule operation. Must be the same as used in LockFunctionModule.
- `session_state` (object, optional) - Session state from LockFunctionModule (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "function_group_name": "\"ZMY_FUNCTION_GROUP_NAME\"",
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockProgram {#unlockprogram-low}
**Description:** [low-level] Unlock an ABAP program after modification. Must use the same session_id and lock_handle from LockProgram operation.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockProgram operation.
- `session_id` (string, required) - Session ID from LockProgram operation. Must be the same as used in LockProgram.
- `session_state` (object, optional) - Session state from LockProgram (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UpdateClass {#updateclass-low}
**Description:** [low-level] Update source code of an existing ABAP class. Requires lock handle from LockObject. - use UpdateClass (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist.
- `source_code` (string, required) - Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "source_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### UpdateFunctionModule {#updatefunctionmodule-low}
**Description:** [low-level] Update source code of an existing ABAP function module. Requires lock handle from LockObject and function group name. - use UpdateFunctionModule (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Function module name (e.g., Z_TEST_FM). Function module must already exist.
- `function_group_name` (string, required) - Function group name containing the function module (e.g., Z_TEST_FG).
- `source_code` (string, required) - Complete ABAP function module source code.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "function_group_name": "\"ZMY_FUNCTION_GROUP_NAME\"",
  "source_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### UpdateProgram {#updateprogram-low}
**Description:** [low-level] Update source code of an existing ABAP program. Requires lock handle from LockObject. - use UpdateProgram (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_TEST_PROGRAM). Program must already exist.
- `source_code` (string, required) - Complete ABAP program source code.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "source_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### ValidateClass {#validateclass-low}
**Description:** [low-level] Validate an ABAP class name before creation. Checks if the name is valid, available, and validates package, description, and superclass if provided. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Class name to validate (e.g., ZCL_MY_CLASS)
- `package_name` (string, optional) - Optional package name for validation
- `description` (string, optional) - Optional description for validation
- `superclass` (string, optional) - Optional superclass name for validation (e.g., CL_OBJECT)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ValidateFunctionGroup {#validatefunctiongroup-low}
**Description:** [low-level] Validate an ABAP function group name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - FunctionGroup name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ValidateFunctionModule {#validatefunctionmodule-low}
**Description:** [low-level] Validate an ABAP function module name before creation. Checks if the name is valid and available. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Function group name (e.g., Z_FUGR_TEST_0001)
- `function_module_name` (string, required) - Function module name to validate (e.g., Z_TEST_FM)
- `description` (string, optional) - Optional description for validation
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "function_module_name": "\"ZMY_FUNCTION_MODULE_NAME\""
}
```

---

### ValidateProgram {#validateprogram-low}
**Description:** [low-level] Validate an ABAP program name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Program name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---


## Tables and Structures

### Read-Only Tools {#tables-and-structures-read-only}

*Read-only tools retrieve information without modifying the system.*

### GetDataElement {#getdataelement-readonly}
**Description:** [read-only] Retrieve ABAP data element information including type definition, field labels, and metadata from SAP system via ADT API.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetDomain {#getdomain-readonly}
**Description:** [read-only] Retrieve ABAP domain structure and properties from SAP system.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetStructure {#getstructure-readonly}
**Description:** [read-only] Retrieve ABAP Structure.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetTable {#gettable-readonly}
**Description:** [read-only] Retrieve ABAP table structure.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetTableContents {#gettablecontents-readonly}
**Description:** [read-only] Retrieve contents of an ABAP table.

> **⚠️ ABAP Cloud Limitation:** Direct access to table data through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetView {#getview-readonly}
**Description:** [read-only] Retrieve ABAP database view definition including tables, fields, joins, and selection conditions.

**Parameters:** None

**Example:**
```json
{}
```

---


### High-Level Tools {#tables-and-structures-high-level}

*High-level tools perform a chain of operations (e.g., validate → lock → update → check → unlock → activate).*

### CreateDataElement {#createdataelement-high}
**Description:** Create a new ABAP data element in SAP system with all required steps: create, activate, and verify.

**Parameters:**
- `inputSchema` (string, optional) - Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions.
- `description` (string, optional) - Data element description. If not provided, data_element_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `domain_name` (string, required) - Domain name to use as type reference (e.g., ZZ_TEST_0001)
- `data_type` (string, optional (default: "CHAR")) - Data type (e.g., CHAR, NUMC). Usually inherited from domain.
- `length` (number, optional (default: "100")) - Data type length. Usually inherited from domain.
- `decimals` (number, optional (default: "0")) - Decimal places. Usually inherited from domain.
- `short_label` (string, optional) - Short field label (max 10 chars)
- `medium_label` (string, optional) - Medium field label (max 20 chars)
- `long_label` (string, optional) - Long field label (max 40 chars)
- `heading_label` (string, optional) - Heading field label (max 55 chars)

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "domain_name": "\"ZMY_DOMAIN_NAME\"",
  "data_type": "\"PROG/P\"",
  "length": "100",
  "decimals": "0"
}
```

---

### CreateDomain {#createdomain-high}
**Description:** Create a new ABAP domain in SAP system with all required steps: lock, create, check, unlock, activate, and verify.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions.
- `description` (string, optional) - (optional) Domain description. If not provided, domain_name will be used.
- `package_name` (string, optional) - (optional) Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - (optional) Transport request number (e.g., E19K905635). Required for transportable packages.
- `datatype` (string, optional (default: "CHAR")) - (optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `length` (number, optional (default: "100")) - (optional) Field length (max depends on datatype)
- `decimals` (number, optional (default: "0")) - (optional) Decimal places (for DEC, CURR, QUAN types)
- `conversion_exit` (string, optional) - (optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `lowercase` (boolean, optional (default: "false")) - (optional) Allow lowercase input
- `sign_exists` (boolean, optional (default: "false")) - (optional) Field has sign (+/-)
- `value_table` (string, optional) - (optional) Value table name for foreign key relationship
- `activate` (boolean, optional (default: "true)")) - (optional) Activate domain after creation (default: true)
- `fixed_values` (string, optional) - Fixed value (e.g., 
- `text` (string, required) - Description text for the fixed value

**Example:**
```json
{
  "datatype": "\"PROG/P\"",
  "length": "100",
  "decimals": "0",
  "lowercase": "false",
  "sign_exists": "false",
  "activate": "true)",
  "text": "\"example_value\""
}
```

---

### CreateStructure {#createstructure-high}
**Description:** Create a new ABAP structure in SAP system with fields and type references. Includes create, activate, and verify steps.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., ZZ_S_TEST_001). Must follow SAP naming conventions.
- `description` (string, optional) - Field description
- `package_name` (string, optional) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `fields` (string, optional) - Field name (e.g., CLIENT, MATERIAL_ID)
- `data_type` (string, optional) - Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `length` (number, optional) - Field length
- `decimals` (number, optional (default: "0")) - Decimal places (for DEC, CURR, QUAN types)
- `domain` (string, optional) - Domain name for type reference (optional)
- `data_element` (string, optional) - Data element name for type reference (optional)
- `structure_ref` (string, optional) - Include another structure (optional)
- `table_ref` (string, optional) - Reference to table type (optional)
- `includes` (string, optional) - Include structure name
- `suffix` (string, optional) - Optional suffix for include fields

**Example:**
```json
{
  "decimals": "0"
}
```

---

### CreateTable {#createtable-high}
**Description:** Create a new ABAP table via the ADT API using provided DDL. Mirrors Eclipse ADT behaviour with status/check runs, lock handling, activation and verification.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions.
- `ddl_code` (string, required) - Complete DDL code for table creation. Example: 
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

**Example:**
```json
{
  "ddl_code": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreateView {#createview-high}
**Description:** Create CDS View or Classic View in SAP using DDL syntax. Both types use the same API workflow, differing only in DDL content (CDS has @AbapCatalog annotations).

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW). Must follow SAP naming conventions.
- `ddl_source` (string, required) - Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `description` (string, optional) - Optional description. If not provided, view_name will be used.

**Example:**
```json
{
  "ddl_source": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### UpdateDataElement {#updatedataelement-high}
**Description:** Data element name to update (e.g., ZZ_TEST_DTEL_01)

**Parameters:**
- `inputSchema` (string, optional) - Data element name to update (e.g., ZZ_TEST_DTEL_01)
- `description` (string, optional) - New data element description
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `type_kind` (string, optional (default: "domain")) - Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType
- `type_name` (string, optional) - Type name: domain name, data element name, or class name (depending on type_kind)
- `data_type` (string, optional) - Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType
- `length` (number, optional) - Length - for predefinedAbapType or refToPredefinedAbapType
- `decimals` (number, optional) - Decimals - for predefinedAbapType or refToPredefinedAbapType
- `domain_name` (string, optional) - Domain name (deprecated - use type_name with type_kind=domain)
- `field_label_short` (string, optional) - Short field label (max 10 chars)
- `field_label_medium` (string, optional) - Medium field label (max 20 chars)
- `field_label_long` (string, optional) - Long field label (max 40 chars)
- `field_label_heading` (string, optional) - Heading field label (max 55 chars)
- `search_help` (string, optional) - Search help name
- `search_help_parameter` (string, optional) - Search help parameter
- `set_get_parameter` (string, optional) - Set/Get parameter ID
- `default_component_name` (string, optional) - Default component name
- `deactivate_input_history` (boolean, optional (default: "false")) - Deactivate input history
- `change_document` (boolean, optional (default: "false")) - Change document
- `left_to_right_direction` (boolean, optional (default: "false")) - Left to right direction
- `deactivate_bidi_filtering` (boolean, optional (default: "false")) - Deactivate BiDi filtering
- `activate` (boolean, optional (default: "true)")) - Activate data element after update (default: true)

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "type_kind": "\"PROG/P\"",
  "deactivate_input_history": "false",
  "change_document": "false",
  "left_to_right_direction": "false",
  "deactivate_bidi_filtering": "false",
  "activate": "true)"
}
```

---

### UpdateDomain {#updatedomain-high}
**Description:** Domain name to update (e.g., ZZ_TEST_0001)

**Parameters:**
- `inputSchema` (string, optional) - Domain name to update (e.g., ZZ_TEST_0001)
- `description` (string, optional) - New domain description (optional)
- `package_name` (string, optional) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `datatype` (string, optional) - Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `length` (number, optional) - Field length (max depends on datatype)
- `decimals` (number, optional) - Decimal places (for DEC, CURR, QUAN types)
- `conversion_exit` (string, optional) - Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `lowercase` (boolean, optional) - Allow lowercase input
- `sign_exists` (boolean, optional) - Field has sign (+/-)
- `value_table` (string, optional) - Value table name for foreign key relationship
- `activate` (boolean, optional (default: "true)")) - Activate domain after update (default: true)
- `fixed_values` (string, optional) - Fixed value (e.g., 
- `text` (string, required) - Description text for the fixed value

**Example:**
```json
{
  "activate": "true)",
  "text": "\"example_value\""
}
```

---

### UpdateView {#updateview-high}
**Description:** Update DDL source code of an existing CDS View or Classic View. Locks the view, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing views without re-creating metadata.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., ZOK_R_TEST_0002). View must already exist.
- `ddl_source` (string, required) - Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 
- `activate` (boolean, optional) - Activate view after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.

**Example:**
```json
{
  "ddl_source": "\"example_value\""
}
```

---


### Low-Level Tools {#tables-and-structures-low-level}

*Low-level tools perform a single operation (one method call to CrudClient).*

### CheckDataElement {#checkdataelement-low}
**Description:** [low-level] Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckDomain {#checkdomain-low}
**Description:** [low-level] Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckStructure {#checkstructure-low}
**Description:** [low-level] Perform syntax check on an ABAP structure. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckTable {#checktable-low}
**Description:** [low-level] Perform syntax check on an ABAP table. Returns syntax errors, warnings, and messages. Requires session_id for stateful operations. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., Z_MY_TABLE)
- `reporter` (string, optional) - Check reporter: 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckView {#checkview-low}
**Description:** [low-level] Perform syntax check on an ABAP view. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CreateDataElement {#createdataelement-low}
**Description:** [low-level] Create a new ABAP data element. - use CreateDataElement (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - DataElement description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `application` (string, optional (default: "*).")) - Application area (optional, default: 
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the data element (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "application": "\"example_value\""
}
```

---

### CreateDomain {#createdomain-low}
**Description:** [low-level] Create a new ABAP domain. - use CreateDomain (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - Domain description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `domain_type` (string, optional) - Domain type: 
- `application` (string, optional (default: "*).")) - Application area (optional, default: 
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the domain (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "application": "\"example_value\""
}
```

---

### CreateStructure {#createstructure-low}
**Description:** [low-level] Create a new ABAP structure. - use CreateStructure (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - Structure description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `structure_type` (string, optional) - Structure type: 
- `application` (string, optional (default: "*).")) - Application area (optional, default: 
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the structure (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "application": "\"example_value\""
}
```

---

### CreateTable {#createtable-low}
**Description:** [low-level] Create a new ABAP table. - use CreateTable (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., ZT_TEST_001). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreateView {#createview-low}
**Description:** [low-level] Create a new ABAP view. - use CreateView (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - View description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `view_type` (string, optional) - View type: 
- `application` (string, optional (default: "*).")) - Application area (optional, default: 
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the view (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "application": "\"example_value\""
}
```

---

### DeleteDataElement {#deletedataelement-low}
**Description:** [low-level] Delete an ABAP data element from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteDomain {#deletedomain-low}
**Description:** [low-level] Delete an ABAP domain from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteStructure {#deletestructure-low}
**Description:** [low-level] Delete an ABAP structure from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteTable {#deletetable-low}
**Description:** [low-level] Delete an ABAP table from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteView {#deleteview-low}
**Description:** [low-level] Delete an ABAP view from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### LockDataElement {#lockdataelement-low}
**Description:** [low-level] Lock an ABAP data element for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockDomain {#lockdomain-low}
**Description:** [low-level] Lock an ABAP domain for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockStructure {#lockstructure-low}
**Description:** [low-level] Lock an ABAP structure for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockTable {#locktable-low}
**Description:** [low-level] Lock an ABAP table for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockView {#lockview-low}
**Description:** [low-level] Lock an ABAP view for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### UnlockDataElement {#unlockdataelement-low}
**Description:** [low-level] Unlock an ABAP data element after modification. Must use the same session_id and lock_handle from LockDataElement operation.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDataElement operation.
- `session_id` (string, required) - Session ID from LockDataElement operation. Must be the same as used in LockDataElement.
- `session_state` (object, optional) - Session state from LockDataElement (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockDomain {#unlockdomain-low}
**Description:** [low-level] Unlock an ABAP domain after modification. Must use the same session_id and lock_handle from LockDomain operation.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDomain operation.
- `session_id` (string, required) - Session ID from LockDomain operation. Must be the same as used in LockDomain.
- `session_state` (object, optional) - Session state from LockDomain (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockStructure {#unlockstructure-low}
**Description:** [low-level] Unlock an ABAP structure after modification. Must use the same session_id and lock_handle from LockStructure operation.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockStructure operation.
- `session_id` (string, required) - Session ID from LockStructure operation. Must be the same as used in LockStructure.
- `session_state` (object, optional) - Session state from LockStructure (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockTable {#unlocktable-low}
**Description:** [low-level] Unlock an ABAP table after modification. Must use the same session_id and lock_handle from LockTable operation.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockTable operation.
- `session_id` (string, required) - Session ID from LockTable operation. Must be the same as used in LockTable.
- `session_state` (object, optional) - Session state from LockTable (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockView {#unlockview-low}
**Description:** [low-level] Unlock an ABAP view after modification. Must use the same session_id and lock_handle from LockView operation.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockView operation.
- `session_id` (string, required) - Session ID from LockView operation. Must be the same as used in LockView.
- `session_state` (object, optional) - Session state from LockView (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UpdateDataElement {#updatedataelement-low}
**Description:** [low-level] Update properties of an existing ABAP data element. Requires lock handle from LockObject. - use UpdateDataElement (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Data element name (e.g., ZOK_E_TEST_0001). Data element must already exist.
- `properties` (object, required) - Data element properties object. Can include: description, type_name, type_kind, domain_name, field_label_short, field_label_medium, field_label_long, etc.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "properties": {},
  "lock_handle": "\"example_value\""
}
```

---

### UpdateDomain {#updatedomain-low}
**Description:** [low-level] Update properties of an existing ABAP domain. Requires lock handle from LockObject. - use UpdateDomain (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., ZOK_D_TEST_0001). Domain must already exist.
- `properties` (object, required) - Domain properties object. Can include: description, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, etc.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "properties": {},
  "lock_handle": "\"example_value\""
}
```

---

### UpdateStructure {#updatestructure-low}
**Description:** [low-level] Update DDL source code of an existing ABAP structure. Requires lock handle from LockObject. - use UpdateStructureSource for full workflow with lock/unlock.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.
- `ddl_code` (string, required) - Complete DDL source code for the structure definition.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "ddl_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### UpdateTable {#updatetable-low}
**Description:** [low-level] Update DDL source code of an existing ABAP table. Requires lock handle from LockObject. - use CreateTable for full workflow with lock/unlock.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., ZOK_T_TEST_0001). Table must already exist.
- `ddl_code` (string, required) - Complete DDL source code for the table definition.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "ddl_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### UpdateView {#updateview-low}
**Description:** [low-level] Update DDL source code of an existing CDS View or Classic View. Requires lock handle from LockObject. - use UpdateView (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., ZOK_R_TEST_0002). View must already exist.
- `ddl_source` (string, required) - Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "ddl_source": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### ValidateDataElement {#validatedataelement-low}
**Description:** [low-level] Validate an ABAP data element name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ValidateDomain {#validatedomain-low}
**Description:** [low-level] Validate an ABAP domain name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Domain name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ValidateStructure {#validatestructure-low}
**Description:** [low-level] Validate an ABAP structure name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Structure name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ValidateTable {#validatetable-low}
**Description:** [low-level] Validate an ABAP table name before creation. Checks if the name is valid and available. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Table name to validate (e.g., Z_MY_TABLE)
- `description` (string, optional) - Optional description for validation
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ValidateView {#validateview-low}
**Description:** [low-level] Validate an ABAP view name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - View name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---


## Packages and Interfaces

### Read-Only Tools {#packages-and-interfaces-read-only}

*Read-only tools retrieve information without modifying the system.*

### GetInterface {#getinterface-readonly}
**Description:** [read-only] Retrieve ABAP interface source code.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetPackage {#getpackage-readonly}
**Description:** [read-only] Retrieve ABAP package details.

**Parameters:** None

**Example:**
```json
{}
```

---


### High-Level Tools {#packages-and-interfaces-high-level}

*High-level tools perform a chain of operations (e.g., validate → lock → update → check → unlock → activate).*

### CreateInterface {#createinterface-high}
**Description:** Create a new ABAP interface in SAP system with source code. Interfaces define method signatures, events, and types for implementation by classes. Uses stateful session for proper lock management.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y).
- `description` (string, optional) - Interface description. If not provided, interface_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `source_code` (string, optional) - Complete ABAP interface source code with INTERFACE...ENDINTERFACE section. If not provided, generates minimal template.
- `activate` (boolean, optional) - Activate interface after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `master_system` (string, optional) - Master system ID (e.g., 
- `responsible` (string, optional) - User responsible for the object (e.g., 

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreatePackage {#createpackage-high}
**Description:** Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.

**Parameters:** None

**Example:**
```json
{}
```

---

### UpdateInterface {#updateinterface-high}
**Description:** Update source code of an existing ABAP interface. Uses stateful session with proper lock/unlock mechanism. Lock handle and transport number are passed in URL parameters.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., ZIF_MY_INTERFACE). Must exist in the system.
- `source_code` (string, required) - Complete ABAP interface source code with INTERFACE...ENDINTERFACE section.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.
- `activate` (boolean, optional) - Activate interface after update. Default: true.

**Example:**
```json
{
  "source_code": "\"example_value\""
}
```

---


### Low-Level Tools {#packages-and-interfaces-low-level}

*Low-level tools perform a single operation (one method call to CrudClient).*

### CheckInterface {#checkinterface-low}
**Description:** [low-level] Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckPackage {#checkpackage-low}
**Description:** [low-level] Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., ZOK_TEST_0002).
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "super_package": "\"example_value\""
}
```

---

### CreateInterface {#createinterface-low}
**Description:** [low-level] Create a new ABAP interface. - use CreateInterface (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., ZIF_TEST_INTERFACE). Must follow SAP naming conventions.
- `description` (string, required) - Interface description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the interface (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreatePackage {#createpackage-low}
**Description:** [low-level] Create a new ABAP package. - use CreatePackage (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions.
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.
- `description` (string, required) - Package description.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "super_package": "\"example_value\"",
  "description": "\"example_value\""
}
```

---

### DeleteInterface {#deleteinterface-low}
**Description:** [low-level] Delete an ABAP interface from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeletePackage {#deletepackage-low}
**Description:** [low-level] Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### LockInterface {#lockinterface-low}
**Description:** [low-level] Lock an ABAP interface for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., ZIF_MY_INTERFACE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockPackage {#lockpackage-low}
**Description:** [low-level] Lock an ABAP package for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id. Requires super_package.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., ZOK_TEST_0002).
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "super_package": "\"example_value\""
}
```

---

### UnlockInterface {#unlockinterface-low}
**Description:** [low-level] Unlock an ABAP interface after modification. Must use the same session_id and lock_handle from LockInterface operation.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockInterface operation.
- `session_id` (string, required) - Session ID from LockInterface operation. Must be the same as used in LockInterface.
- `session_state` (object, optional) - Session state from LockInterface (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockPackage {#unlockpackage-low}
**Description:** [low-level] Unlock an ABAP package after modification. Requires lock handle from LockObject and superPackage. - must use the same session_id and lock_handle from LockObject.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., ZOK_TEST_0002). Package must already exist.
- `super_package` (string, required) - Super package (parent package) name. Required for package operations.
- `lock_handle` (string, required) - Lock handle from LockObject operation
- `session_id` (string, required) - Session ID from LockObject operation. Must be the same as used in LockObject.
- `session_state` (object, optional) - Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "super_package": "\"example_value\"",
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UpdateInterface {#updateinterface-low}
**Description:** [low-level] Update source code of an existing ABAP interface. Requires lock handle from LockObject. - use UpdateInterface (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., ZIF_TEST_INTERFACE). Interface must already exist.
- `source_code` (string, required) - Complete ABAP interface source code.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "source_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### UpdatePackage {#updatepackage-low}
**Description:** [low-level] Update description of an existing ABAP package. Requires lock handle from LockObject and superPackage. - use UpdatePackageSource for full workflow with lock/unlock.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., ZOK_TEST_0002). Package must already exist.
- `super_package` (string, required) - Super package (parent package) name. Required for package operations.
- `updated_description` (string, required) - New description for the package.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "super_package": "\"example_value\"",
  "updated_description": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### ValidateInterface {#validateinterface-low}
**Description:** [low-level] Validate an ABAP interface name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Interface name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ValidatePackage {#validatepackage-low}
**Description:** [low-level] Validate an ABAP package name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Package name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---


## Includes and Hierarchies

### Read-Only Tools {#includes-and-hierarchies-read-only}

*Read-only tools retrieve information without modifying the system.*

### GetInclude {#getinclude-readonly}
**Description:** [read-only] Retrieve source code of a specific ABAP include file.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetIncludesList {#getincludeslist-readonly}
**Description:** [read-only] Recursively discover and list ALL include files within an ABAP program or include.

**Parameters:** None

**Example:**
```json
{}
```

---


## Types, Descriptions, Metadata

### Read-Only Tools {#types,-descriptions,-metadata-read-only}

*Read-only tools retrieve information without modifying the system.*

### DescribeByList {#describebylist-readonly}
**Description:** [read-only] Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc.

**Parameters:**
- `inputSchema` (string, optional) - [read-only] Object name (required, must be valid ABAP object name or mask)
- `type` (string, optional) - [read-only] Optional type (e.g. PROG/P, CLAS/OC, etc.)

**Example:**
```json
{}
```

---

### GetAbapAST {#getabapast-readonly}
**Description:** [read-only] Parse ABAP code and return AST (Abstract Syntax Tree) in JSON format.

**Parameters:**
- `inputSchema` (string, optional) - ABAP source code to parse
- `filePath` (string, optional) - Optional file path to write the result to

**Example:**
```json
{}
```

---

### GetAbapSemanticAnalysis {#getabapsemanticanalysis-readonly}
**Description:** [read-only] Perform semantic analysis on ABAP code and return symbols, types, scopes, and dependencies.

**Parameters:**
- `inputSchema` (string, optional) - ABAP source code to analyze
- `filePath` (string, optional) - Optional file path to write the result to

**Example:**
```json
{}
```

---

### GetAbapSystemSymbols {#getabapsystemsymbols-readonly}
**Description:** [read-only] Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages.

**Parameters:**
- `inputSchema` (string, optional) - ABAP source code to analyze and resolve symbols for
- `filePath` (string, optional) - Optional file path to write the result to

**Example:**
```json
{}
```

---

### GetAdtTypes {#getadttypes-readonly}
**Description:** [read-only] Retrieve all valid ADT object types.

**Parameters:**
- `inputSchema` (string, optional) - Type name to validate (optional)

**Example:**
```json
{}
```

---

### GetInactiveObjects {#getinactiveobjects-readonly}
**Description:** [read-only] Get a list of inactive ABAP objects (objects that have been modified but not activated).

**Parameters:** None

**Example:**
```json
{}
```

---

### GetObjectInfo {#getobjectinfo-readonly}
**Description:** [read-only] Return ABAP object tree: root, group nodes, and terminal leaves up to maxDepth. Enrich each node via SearchObject if enrich=true. Group nodes are included for hierarchy. Each node has node_type: root, point, end.

**Parameters:**
- `inputSchema` (string, optional) - [read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P)
- `parent_name` (string, required) - [read-only] Parent object name
- `maxDepth` (integer, optional (default: "1")) - [read-only] Maximum tree depth (default depends on type)
- `enrich` (boolean, optional (default: "true")) - [read-only] Whether to add description and package via SearchObject (default true)

**Example:**
```json
{
  "parent_name": "\"ZMY_PARENT_NAME\"",
  "maxDepth": "\"example\"",
  "enrich": "true"
}
```

---

### GetObjectNodeFromCache {#getobjectnodefromcache-readonly}
**Description:** [read-only] Returns a node from the in-memory objects list cache by OBJECT_TYPE, OBJECT_NAME, TECH_NAME, and expands OBJECT_URI if present.

**Parameters:**
- `inputSchema` (string, optional) - [read-only] Object type
- `object_name` (string, required) - [read-only] Object name
- `tech_name` (string, required) - [read-only] Technical name

**Example:**
```json
{
  "object_name": "\"ZMY_OBJECT_NAME\"",
  "tech_name": "\"ZMY_TECH_NAME\""
}
```

---

### GetObjectStructure {#getobjectstructure-readonly}
**Description:** [read-only] Retrieve ADT object structure as a compact JSON tree.

**Parameters:**
- `inputSchema` (string, optional) - ADT object type (e.g. DDLS/DF)
- `objectname` (string, required) - ADT object name (e.g. /CBY/ACQ_DDL)

**Example:**
```json
{
  "objectname": "\"ZMY_OBJECTNAME\""
}
```

---

### GetSession {#getsession-readonly}
**Description:** [read-only] Get a new session ID and current session state (cookies, CSRF token) for reuse across multiple ADT operations. Use this to maintain the same session and lock handle across multiple requests.

**Parameters:**
- `inputSchema` (boolean, optional) - Force creation of a new session even if one exists. Default: false

**Example:**
```json
{}
```

---

### GetSqlQuery {#getsqlquery-readonly}
**Description:** [read-only] Execute freestyle SQL queries via SAP ADT Data Preview API.

> **⚠️ ABAP Cloud Limitation:** Direct execution of SQL queries through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetTransaction {#gettransaction-readonly}
**Description:** [read-only] Retrieve ABAP transaction details.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetTypeInfo {#gettypeinfo-readonly}
**Description:** [read-only] Retrieve ABAP type information.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetWhereUsed {#getwhereused-readonly}
**Description:** [read-only] Retrieve where-used references for ABAP objects via ADT usageReferences.

**Parameters:** None

**Example:**
```json
{}
```

---


## Search, SQL, Transactions

### Read-Only Tools {#search,-sql,-transactions-read-only}

*Read-only tools retrieve information without modifying the system.*

### GetObjectsByType {#getobjectsbytype-readonly}
**Description:** [read-only] Retrieves all ABAP objects of a specific type under a given node.

**Parameters:**
- `inputSchema` (string, optional) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type
- `node_id` (string, required) - [read-only] Node ID
- `format` (string, optional) - [read-only] Output format: 
- `with_short_descriptions` (boolean, optional) - [read-only] Include short descriptions

**Example:**
```json
{
  "parent_tech_name": "\"ZMY_PARENT_TECH_NAME\"",
  "parent_type": "\"PROG/P\"",
  "node_id": "\"example_value\""
}
```

---

### GetObjectsList {#getobjectslist-readonly}
**Description:** [read-only] Recursively retrieves all valid ABAP repository objects for a given parent (program, function group, etc.) including nested includes.

**Parameters:**
- `inputSchema` (string, optional) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `with_short_descriptions` (boolean, optional (default: "true)")) - [read-only] Include short descriptions (default: true)

**Example:**
```json
{
  "parent_tech_name": "\"ZMY_PARENT_TECH_NAME\"",
  "parent_type": "\"PROG/P\"",
  "with_short_descriptions": "true)"
}
```

---

### GetTransport {#gettransport-readonly}
**Description:** [read-only] Retrieve ABAP transport request information including metadata, included objects, and status from SAP system.

**Parameters:**
- `inputSchema` (string, optional) - Transport request number (e.g., E19K905635, DEVK905123)
- `include_objects` (boolean, optional (default: "true)")) - Include list of objects in transport (default: true)
- `include_tasks` (boolean, optional (default: "true)")) - Include list of tasks in transport (default: true)

**Example:**
```json
{
  "include_objects": "true)",
  "include_tasks": "true)"
}
```

---

### SearchObject {#searchobject-readonly}
**Description:** [read-only] Search for ABAP objects by name pattern. Parameters: object_name (with or without mask), object_type (optional), maxResults (optional). If object_type is specified, results are filtered by type.

**Parameters:**
- `inputSchema` (string, optional) - [read-only] Object name or mask (e.g. 
- `object_type` (string, optional) - [read-only] Optional ABAP object type (e.g. 
- `maxResults` (number, optional (default: "100")) - [read-only] Maximum number of results to return

**Example:**
```json
{
  "maxResults": "100"
}
```

---


### High-Level Tools {#search,-sql,-transactions-high-level}

*High-level tools perform a chain of operations (e.g., validate → lock → update → check → unlock → activate).*

### CreateTransport {#createtransport-high}
**Description:** Create a new ABAP transport request in SAP system for development objects.

**Parameters:**
- `inputSchema` (string, optional (default: "workbench")) - Transport type: 
- `description` (string, required) - Transport request description (mandatory)
- `target_system` (string, optional) - Target system for transport (optional, e.g., 
- `owner` (string, optional) - Transport owner (optional, defaults to current user)

**Example:**
```json
{
  "inputSchema": "\"example_value\"",
  "description": "\"example_value\""
}
```

---


### Low-Level Tools {#search,-sql,-transactions-low-level}

*Low-level tools perform a single operation (one method call to CrudClient).*

### CreateTransport {#createtransport-low}
**Description:** [low-level] Create a new ABAP transport request.

**Parameters:**
- `inputSchema` (string, optional) - Transport request description.
- `transport_type` (string, optional (default: "workbench).")) - Transport type: 

**Example:**
```json
{
  "transport_type": "\"PROG/P\""
}
```

---


## Enhancements

### Read-Only Tools {#enhancements-read-only}

*Read-only tools retrieve information without modifying the system.*

### GetBdef {#getbdef-readonly}
**Description:** [read-only] Retrieve the source code of a BDEF (Behavior Definition) for a CDS entity.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetEnhancementImpl {#getenhancementimpl-readonly}
**Description:** [read-only] Retrieve source code of a specific enhancement implementation by its name and enhancement spot.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetEnhancements {#getenhancements-readonly}
**Description:** [read-only] Retrieve a list of enhancements for a given ABAP object.

**Parameters:** None

**Example:**
```json
{}
```

---

### GetEnhancementSpot {#getenhancementspot-readonly}
**Description:** [read-only] Retrieve metadata and list of implementations for a specific enhancement spot.

**Parameters:** None

**Example:**
```json
{}
```

---


### High-Level Tools {#enhancements-high-level}

*High-level tools perform a chain of operations (e.g., validate → lock → update → check → unlock → activate).*

### CreateBehaviorDefinition {#createbehaviordefinition-high}
**Description:** Create a new ABAP Behavior Definition (BDEF) in SAP system.

**Parameters:**
- `inputSchema` (string, optional) - Behavior Definition name (usually same as Root Entity name)
- `description` (string, optional) - Description
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number
- `root_entity` (string, required) - Root Entity name (CDS View name)
- `implementation_type` (string, required) - Implementation type: 
- `activate` (boolean, optional) - Activate after creation. Default: true

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "root_entity": "\"example_value\"",
  "implementation_type": "\"PROG/P\""
}
```

---

### CreateMetadataExtension {#createmetadataextension-high}
**Description:** Create a new ABAP Metadata Extension (DDLX) in SAP system.

**Parameters:**
- `inputSchema` (string, optional) - Metadata Extension name
- `description` (string, optional) - Description
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number
- `activate` (boolean, optional) - Activate after creation. Default: true

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### UpdateBehaviorDefinition {#updatebehaviordefinition-high}
**Description:** Update source code of an ABAP Behavior Definition.

**Parameters:**
- `inputSchema` (string, optional) - Behavior Definition name
- `source_code` (string, required) - New source code
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally (not recommended for stateful flows).
- `activate` (boolean, optional) - Activate after update. Default: true

**Example:**
```json
{
  "source_code": "\"example_value\""
}
```

---

### UpdateMetadataExtension {#updatemetadataextension-high}
**Description:** Update source code of an ABAP Metadata Extension.

**Parameters:**
- `inputSchema` (string, optional) - Metadata Extension name
- `source_code` (string, required) - New source code
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally.
- `activate` (boolean, optional) - Activate after update. Default: true

**Example:**
```json
{
  "source_code": "\"example_value\""
}
```

---


### Low-Level Tools {#enhancements-low-level}

*Low-level tools perform a single operation (one method call to CrudClient).*

### CheckBehaviorDefinition {#checkbehaviordefinition-low}
**Description:** [low-level] Perform syntax check on an ABAP behavior definition. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - BehaviorDefinition name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckMetadataExtension {#checkmetadataextension-low}
**Description:** [low-level] Perform syntax check on an ABAP metadata extension. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CreateBehaviorDefinition {#createbehaviordefinition-low}
**Description:** [low-level] Create a new ABAP Behavior Definition. - use CreateBehaviorDefinition (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Behavior Definition name (e.g., ZI_MY_BDEF).
- `description` (string, required) - Behavior Definition description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, required) - Transport request number (e.g., E19K905635). Required.
- `root_entity` (string, required) - Root entity name (e.g., ZI_MY_ENTITY).
- `implementation_type` (string, required) - Implementation type: 
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the behavior definition (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "transport_request": "\"example_value\"",
  "root_entity": "\"example_value\"",
  "implementation_type": "\"PROG/P\""
}
```

---

### CreateMetadataExtension {#createmetadataextension-low}
**Description:** [low-level] Create a new ABAP Metadata Extension. - use CreateMetadataExtension (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Metadata Extension name (e.g., ZI_MY_DDLX).
- `description` (string, required) - Metadata Extension description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional for local objects.
- `master_language` (string, optional) - Master language (optional, e.g., 
- `master_system` (string, optional) - Master system (optional).
- `responsible` (string, optional) - User responsible for the metadata extension (optional).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "description": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### DeleteBehaviorDefinition {#deletebehaviordefinition-low}
**Description:** [low-level] Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteMetadataExtension {#deletemetadataextension-low}
**Description:** [low-level] Delete an ABAP metadata extension from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### LockBehaviorDefinition {#lockbehaviordefinition-low}
**Description:** [low-level] Lock an ABAP behavior definition for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockMetadataExtension {#lockmetadataextension-low}
**Description:** [low-level] Lock an ABAP metadata extension for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Parameters:**
- `inputSchema` (string, optional) - MetadataExtension name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### UnlockBehaviorDefinition {#unlockbehaviordefinition-low}
**Description:** [low-level] Unlock an ABAP behavior definition after modification. Must use the same session_id and lock_handle from LockBehaviorDefinition operation.

**Parameters:**
- `inputSchema` (string, optional) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `lock_handle` (string, required) - Lock handle from LockBehaviorDefinition operation.
- `session_id` (string, required) - Session ID from LockBehaviorDefinition operation. Must be the same as used in LockBehaviorDefinition.
- `session_state` (object, optional) - Session state from LockBehaviorDefinition (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UnlockMetadataExtension {#unlockmetadataextension-low}
**Description:** [low-level] Unlock an ABAP metadata extension after modification. Must use the same session_id and lock_handle from LockMetadataExtension operation.

**Parameters:**
- `inputSchema` (string, optional) - MetadataExtension name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockMetadataExtension operation.
- `session_id` (string, required) - Session ID from LockMetadataExtension operation. Must be the same as used in LockMetadataExtension.
- `session_state` (object, optional) - Session state from LockMetadataExtension (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\"",
  "session_id": "\"example_value\""
}
```

---

### UpdateBehaviorDefinition {#updatebehaviordefinition-low}
**Description:** [low-level] Update source code of an existing ABAP behavior definition. Requires lock handle from LockObject. - use UpdateBehaviorDefinition (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Behavior definition name (e.g., ZOK_C_TEST_0001). Behavior definition must already exist.
- `source_code` (string, required) - Complete behavior definition source code.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "source_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### UpdateMetadataExtension {#updatemetadataextension-low}
**Description:** [low-level] Update source code of an existing ABAP metadata extension. Requires lock handle from LockObject. - use UpdateMetadataExtension (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Metadata extension name (e.g., ZOK_C_TEST_0001). Metadata extension must already exist.
- `source_code` (string, required) - Complete metadata extension source code.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "source_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### ValidateBehaviorDefinition {#validatebehaviordefinition-low}
**Description:** [low-level] Validate an ABAP behavior definition name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - BehaviorDefinition name to validate (e.g., ZI_MY_BDEF).
- `root_entity` (string, required) - Root entity name (e.g., ZI_MY_ENTITY). Required for validation.
- `implementation_type` (string, required) - Implementation type: 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "root_entity": "\"example_value\"",
  "implementation_type": "\"PROG/P\""
}
```

---

### ValidateMetadataExtension {#validatemetadataextension-low}
**Description:** [low-level] Validate an ABAP metadata extension name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - MetadataExtension name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---


## Notes

### ABAP Cloud Limitations

Some functions have limitations when working with ABAP Cloud on SAP BTP:

- **GetTableContents** - Direct access to table data is blocked
- **GetSqlQuery** - Direct execution of SQL queries is blocked

These functions work only for on-premise systems.

### Caching

All handler modules use a centralized in-memory cache (`objectsListCache`) to improve performance and consistency.

### Response Format

All functions return MCP-compliant responses in the following format:
```typescript
{
  isError: boolean;
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

---

## Additional Information

- [Tools Architecture](../TOOLS_ARCHITECTURE.md) - Technical documentation about the tools architecture
- [Installation Guide](INSTALLATION_GUIDE_UA.md) - Setup and configuration instructions
- [README](../README.md) - Main project documentation

---

*Last updated: 2025-11-24*
*Document version: 1.0*
*Generated automatically from TOOL_DEFINITION exports*
