# Available Tools Reference - MCP ABAP ADT Server

This document contains a complete list of all tools (functions) provided by the MCP ABAP ADT server, with descriptions of their purpose and parameters.

> **Note:** This document is automatically generated from `TOOL_DEFINITION` exports in handler modules. To regenerate, run:
> ```bash
> npm run docs:tools
> ```

## 📊 Tool Summary

- Total tools: 234
- High-level tools: 88
- Low-level tools: 119
- Read-only tools: 27
- Other tools: 0

## 📋 Navigation

The navigation below mirrors the document structure for easier discovery.

- [Programs, Classes, Functions](#programs,-classes,-functions) (68 tools – 28 high-level, 38 low-level, 2 read-only)
  - [Read-Only Tools](#programs,-classes,-functions-read-only)
    - [GetFunction](#getfunction-readonly)
    - [GetProgFullCode](#getprogfullcode-readonly)
  - [High-Level Tools](#programs,-classes,-functions-high-level)
    - [CreateClass](#createclass-high)
    - [CreateFunctionGroup](#createfunctiongroup-high)
    - [CreateFunctionModule](#createfunctionmodule-high)
    - [CreateLocalDefinitions](#createlocaldefinitions-high)
    - [CreateLocalMacros](#createlocalmacros-high)
    - [CreateLocalTestClass](#createlocaltestclass-high)
    - [CreateLocalTypes](#createlocaltypes-high)
    - [CreateProgram](#createprogram-high)
    - [DeleteClass](#deleteclass-high)
    - [DeleteLocalDefinitions](#deletelocaldefinitions-high)
    - [DeleteLocalMacros](#deletelocalmacros-high)
    - [DeleteLocalTestClass](#deletelocaltestclass-high)
    - [DeleteLocalTypes](#deletelocaltypes-high)
    - [DeleteProgram](#deleteprogram-high)
    - [GetClass](#getclass-high)
    - [GetLocalDefinitions](#getlocaldefinitions-high)
    - [GetLocalMacros](#getlocalmacros-high)
    - [GetLocalTestClass](#getlocaltestclass-high)
    - [GetLocalTypes](#getlocaltypes-high)
    - [GetProgram](#getprogram-high)
    - [UpdateClass](#updateclass-high)
    - [UpdateFunctionGroup](#updatefunctiongroup-high)
    - [UpdateFunctionModule](#updatefunctionmodule-high)
    - [UpdateLocalDefinitions](#updatelocaldefinitions-high)
    - [UpdateLocalMacros](#updatelocalmacros-high)
    - [UpdateLocalTestClass](#updatelocaltestclass-high)
    - [UpdateLocalTypes](#updatelocaltypes-high)
    - [UpdateProgram](#updateprogram-high)
  - [Low-Level Tools](#programs,-classes,-functions-low-level)
    - [ActivateClassLow](#activateclasslow-low)
    - [ActivateClassTestClassesLow](#activateclasstestclasseslow-low)
    - [ActivateFunctionGroupLow](#activatefunctiongrouplow-low)
    - [ActivateFunctionModuleLow](#activatefunctionmodulelow-low)
    - [ActivateProgramLow](#activateprogramlow-low)
    - [CheckClassLow](#checkclasslow-low)
    - [CheckFunctionGroupLow](#checkfunctiongrouplow-low)
    - [CheckFunctionModuleLow](#checkfunctionmodulelow-low)
    - [CheckProgramLow](#checkprogramlow-low)
    - [CreateClassLow](#createclasslow-low)
    - [CreateFunctionGroupLow](#createfunctiongrouplow-low)
    - [CreateFunctionModuleLow](#createfunctionmodulelow-low)
    - [CreateProgramLow](#createprogramlow-low)
    - [DeleteClassLow](#deleteclasslow-low)
    - [DeleteFunctionGroupLow](#deletefunctiongrouplow-low)
    - [DeleteFunctionModuleLow](#deletefunctionmodulelow-low)
    - [DeleteProgramLow](#deleteprogramlow-low)
    - [GetClassUnitTestResultLow](#getclassunittestresultlow-low)
    - [GetClassUnitTestStatusLow](#getclassunitteststatuslow-low)
    - [LockClassLow](#lockclasslow-low)
    - [LockClassTestClassesLow](#lockclasstestclasseslow-low)
    - [LockFunctionGroupLow](#lockfunctiongrouplow-low)
    - [LockFunctionModuleLow](#lockfunctionmodulelow-low)
    - [LockProgramLow](#lockprogramlow-low)
    - [RunClassUnitTestsLow](#runclassunittestslow-low)
    - [UnlockClassLow](#unlockclasslow-low)
    - [UnlockClassTestClassesLow](#unlockclasstestclasseslow-low)
    - [UnlockFunctionGroupLow](#unlockfunctiongrouplow-low)
    - [UnlockFunctionModuleLow](#unlockfunctionmodulelow-low)
    - [UnlockProgramLow](#unlockprogramlow-low)
    - [UpdateClassLow](#updateclasslow-low)
    - [UpdateClassTestClassesLow](#updateclasstestclasseslow-low)
    - [UpdateFunctionModuleLow](#updatefunctionmodulelow-low)
    - [UpdateProgramLow](#updateprogramlow-low)
    - [ValidateClassLow](#validateclasslow-low)
    - [ValidateFunctionGroupLow](#validatefunctiongrouplow-low)
    - [ValidateFunctionModuleLow](#validatefunctionmodulelow-low)
    - [ValidateProgramLow](#validateprogramlow-low)
- [Tables and Structures](#tables-and-structures) (65 tools – 24 high-level, 40 low-level, 1 read-only)
  - [Read-Only Tools](#tables-and-structures-read-only)
    - [GetTableContents](#gettablecontents-readonly)
  - [High-Level Tools](#tables-and-structures-high-level)
    - [CreateDataElement](#createdataelement-high)
    - [CreateDomain](#createdomain-high)
    - [CreateServiceDefinition](#createservicedefinition-high)
    - [CreateStructure](#createstructure-high)
    - [CreateTable](#createtable-high)
    - [CreateView](#createview-high)
    - [DeleteDataElement](#deletedataelement-high)
    - [DeleteDomain](#deletedomain-high)
    - [DeleteServiceDefinition](#deleteservicedefinition-high)
    - [DeleteStructure](#deletestructure-high)
    - [DeleteTable](#deletetable-high)
    - [DeleteView](#deleteview-high)
    - [GetDataElement](#getdataelement-high)
    - [GetDomain](#getdomain-high)
    - [GetServiceDefinition](#getservicedefinition-high)
    - [GetStructure](#getstructure-high)
    - [GetTable](#gettable-high)
    - [GetView](#getview-high)
    - [UpdateDataElement](#updatedataelement-high)
    - [UpdateDomain](#updatedomain-high)
    - [UpdateServiceDefinition](#updateservicedefinition-high)
    - [UpdateStructure](#updatestructure-high)
    - [UpdateTable](#updatetable-high)
    - [UpdateView](#updateview-high)
  - [Low-Level Tools](#tables-and-structures-low-level)
    - [ActivateDataElementLow](#activatedataelementlow-low)
    - [ActivateDomainLow](#activatedomainlow-low)
    - [ActivateStructureLow](#activatestructurelow-low)
    - [ActivateTableLow](#activatetablelow-low)
    - [ActivateViewLow](#activateviewlow-low)
    - [CheckDataElementLow](#checkdataelementlow-low)
    - [CheckDomainLow](#checkdomainlow-low)
    - [CheckStructureLow](#checkstructurelow-low)
    - [CheckTableLow](#checktablelow-low)
    - [CheckViewLow](#checkviewlow-low)
    - [CreateDataElementLow](#createdataelementlow-low)
    - [CreateDomainLow](#createdomainlow-low)
    - [CreateStructureLow](#createstructurelow-low)
    - [CreateTableLow](#createtablelow-low)
    - [CreateViewLow](#createviewlow-low)
    - [DeleteDataElementLow](#deletedataelementlow-low)
    - [DeleteDomainLow](#deletedomainlow-low)
    - [DeleteStructureLow](#deletestructurelow-low)
    - [DeleteTableLow](#deletetablelow-low)
    - [DeleteViewLow](#deleteviewlow-low)
    - [LockDataElementLow](#lockdataelementlow-low)
    - [LockDomainLow](#lockdomainlow-low)
    - [LockStructureLow](#lockstructurelow-low)
    - [LockTableLow](#locktablelow-low)
    - [LockViewLow](#lockviewlow-low)
    - [UnlockDataElementLow](#unlockdataelementlow-low)
    - [UnlockDomainLow](#unlockdomainlow-low)
    - [UnlockStructureLow](#unlockstructurelow-low)
    - [UnlockTableLow](#unlocktablelow-low)
    - [UnlockViewLow](#unlockviewlow-low)
    - [UpdateDataElementLow](#updatedataelementlow-low)
    - [UpdateDomainLow](#updatedomainlow-low)
    - [UpdateStructureLow](#updatestructurelow-low)
    - [UpdateTableLow](#updatetablelow-low)
    - [UpdateViewLow](#updateviewlow-low)
    - [ValidateDataElementLow](#validatedataelementlow-low)
    - [ValidateDomainLow](#validatedomainlow-low)
    - [ValidateStructureLow](#validatestructurelow-low)
    - [ValidateTableLow](#validatetablelow-low)
    - [ValidateViewLow](#validateviewlow-low)
- [Packages and Interfaces](#packages-and-interfaces) (21 tools – 5 high-level, 15 low-level, 1 read-only)
  - [Read-Only Tools](#packages-and-interfaces-read-only)
    - [GetPackage](#getpackage-readonly)
  - [High-Level Tools](#packages-and-interfaces-high-level)
    - [CreateInterface](#createinterface-high)
    - [CreatePackage](#createpackage-high)
    - [DeleteInterface](#deleteinterface-high)
    - [GetInterface](#getinterface-high)
    - [UpdateInterface](#updateinterface-high)
  - [Low-Level Tools](#packages-and-interfaces-low-level)
    - [ActivateInterfaceLow](#activateinterfacelow-low)
    - [CheckInterfaceLow](#checkinterfacelow-low)
    - [CheckPackageLow](#checkpackagelow-low)
    - [CreateInterfaceLow](#createinterfacelow-low)
    - [CreatePackageLow](#createpackagelow-low)
    - [DeleteInterfaceLow](#deleteinterfacelow-low)
    - [DeletePackageLow](#deletepackagelow-low)
    - [LockInterfaceLow](#lockinterfacelow-low)
    - [LockPackageLow](#lockpackagelow-low)
    - [UnlockInterfaceLow](#unlockinterfacelow-low)
    - [UnlockPackageLow](#unlockpackagelow-low)
    - [UpdateInterfaceLow](#updateinterfacelow-low)
    - [UpdatePackageLow](#updatepackagelow-low)
    - [ValidateInterfaceLow](#validateinterfacelow-low)
    - [ValidatePackageLow](#validatepackagelow-low)
- [Includes and Hierarchies](#includes-and-hierarchies) (2 tools – 2 read-only)
  - [Read-Only Tools](#includes-and-hierarchies-read-only)
    - [GetInclude](#getinclude-readonly)
    - [GetIncludesList](#getincludeslist-readonly)
- [Types, Descriptions, Metadata](#types,-descriptions,-metadata) (18 tools – 1 high-level, 3 low-level, 14 read-only)
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
  - [High-Level Tools](#types,-descriptions,-metadata-high-level)
    - [GetPackageTree](#getpackagetree-high)
  - [Low-Level Tools](#types,-descriptions,-metadata-low-level)
    - [GetNodeStructureLow](#getnodestructurelow-low)
    - [GetObjectStructureLow](#getobjectstructurelow-low)
    - [GetVirtualFoldersLow](#getvirtualfolderslow-low)
- [Search, SQL, Transactions](#search,-sql,-transactions) (6 tools – 1 high-level, 1 low-level, 4 read-only)
  - [Read-Only Tools](#search,-sql,-transactions-read-only)
    - [GetObjectsByType](#getobjectsbytype-readonly)
    - [GetObjectsList](#getobjectslist-readonly)
    - [GetTransport](#gettransport-readonly)
    - [SearchObject](#searchobject-readonly)
  - [High-Level Tools](#search,-sql,-transactions-high-level)
    - [CreateTransport](#createtransport-high)
  - [Low-Level Tools](#search,-sql,-transactions-low-level)
    - [CreateTransportLow](#createtransportlow-low)
- [Enhancements](#enhancements) (13 tools – 2 high-level, 8 low-level, 3 read-only)
  - [Read-Only Tools](#enhancements-read-only)
    - [GetEnhancementImpl](#getenhancementimpl-readonly)
    - [GetEnhancements](#getenhancements-readonly)
    - [GetEnhancementSpot](#getenhancementspot-readonly)
  - [High-Level Tools](#enhancements-high-level)
    - [CreateMetadataExtension](#createmetadataextension-high)
    - [UpdateMetadataExtension](#updatemetadataextension-high)
  - [Low-Level Tools](#enhancements-low-level)
    - [ActivateMetadataExtensionLow](#activatemetadataextensionlow-low)
    - [CheckMetadataExtensionLow](#checkmetadataextensionlow-low)
    - [CreateMetadataExtensionLow](#createmetadataextensionlow-low)
    - [DeleteMetadataExtensionLow](#deletemetadataextensionlow-low)
    - [LockMetadataExtensionLow](#lockmetadataextensionlow-low)
    - [UnlockMetadataExtensionLow](#unlockmetadataextensionlow-low)
    - [UpdateMetadataExtensionLow](#updatemetadataextensionlow-low)
    - [ValidateMetadataExtensionLow](#validatemetadataextensionlow-low)

---

## Programs, Classes, Functions

### Read-Only Tools {#programs,-classes,-functions-read-only}

*Read-only tools retrieve information without modifying the system.*

### GetFunction {#getfunction-readonly}
**Description:** [read-only] Retrieve ABAP Function Module source code.

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


### High-Level Tools {#programs,-classes,-functions-high-level}

*High-level tools perform a chain of operations (e.g., validate → lock → update → check → unlock → activate).*

### CreateClass {#createclass-high}
**Description:** Create a new ABAP class with optional activation. Manages validation, lock, check, update, unlock, and optional activation.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_TEST_CLASS_001).
- `description` (string, optional) - Class description (defaults to class_name).
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP).
- `transport_request` (string, optional) - Transport request number (required for transportable packages).
- `superclass` (string, optional) - Optional superclass name.
- `final` (boolean, optional) - Mark class as final. Default: false
- `abstract` (boolean, optional) - Mark class as abstract. Default: false
- `create_protected` (boolean, optional) - Protected constructor. Default: false
- `source_code` (string, optional) - Full ABAP class source code. If omitted, a minimal template is generated.
- `activate` (boolean, optional) - Activate after creation. Default: true.

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

### CreateLocalDefinitions {#createlocaldefinitions-high}
**Description:** Create local definitions in an ABAP class (definitions include). Manages lock, check, update, unlock, and optional activation.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `definitions_code` (string, required) - Source code for local definitions.
- `transport_request` (string, optional) - Transport request number.
- `activate_on_create` (boolean, optional (default: "false")) - Activate parent class after creating. Default: false

**Example:**
```json
{
  "definitions_code": "\"example_value\"",
  "activate_on_create": "false"
}
```

---

### CreateLocalMacros {#createlocalmacros-high}
**Description:** Create local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `macros_code` (string, required) - Source code for local macros.
- `transport_request` (string, optional) - Transport request number.
- `activate_on_create` (boolean, optional (default: "false")) - Activate parent class after creating. Default: false

**Example:**
```json
{
  "macros_code": "\"example_value\"",
  "activate_on_create": "false"
}
```

---

### CreateLocalTestClass {#createlocaltestclass-high}
**Description:** Create a local test class in an ABAP class. Manages lock, check, update, unlock, and optional activation of parent class.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `test_class_code` (string, required) - Source code for the local test class.
- `test_class_name` (string, optional) - Optional test class name (e.g., lcl_test).
- `transport_request` (string, optional) - Transport request number (required for transportable objects).
- `activate_on_create` (boolean, optional (default: "false")) - Activate parent class after creating test class. Default: false

**Example:**
```json
{
  "test_class_code": "\"example_value\"",
  "activate_on_create": "false"
}
```

---

### CreateLocalTypes {#createlocaltypes-high}
**Description:** Create local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `local_types_code` (string, required) - Source code for local types.
- `transport_request` (string, optional) - Transport request number.
- `activate_on_create` (boolean, optional (default: "false")) - Activate parent class after creating. Default: false

**Example:**
```json
{
  "local_types_code": "\"PROG/P\"",
  "activate_on_create": "false"
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

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### DeleteClass {#deleteclass-high}
**Description:** Delete an ABAP class from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteLocalDefinitions {#deletelocaldefinitions-high}
**Description:** Delete local definitions from an ABAP class by clearing the definitions include. Manages lock, update, unlock, and optional activation.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.
- `activate_on_delete` (boolean, optional (default: "false")) - Activate parent class after deleting. Default: false

**Example:**
```json
{
  "activate_on_delete": "false"
}
```

---

### DeleteLocalMacros {#deletelocalmacros-high}
**Description:** Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.
- `activate_on_delete` (boolean, optional (default: "false")) - Activate parent class after deleting. Default: false

**Example:**
```json
{
  "activate_on_delete": "false"
}
```

---

### DeleteLocalTestClass {#deletelocaltestclass-high}
**Description:** Delete a local test class from an ABAP class by clearing the testclasses include. Manages lock, update, unlock, and optional activation of parent class.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (required for transportable objects).
- `activate_on_delete` (boolean, optional (default: "false")) - Activate parent class after deleting test class. Default: false

**Example:**
```json
{
  "activate_on_delete": "false"
}
```

---

### DeleteLocalTypes {#deletelocaltypes-high}
**Description:** Delete local types from an ABAP class by clearing the implementations include. Manages lock, update, unlock, and optional activation.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.
- `activate_on_delete` (boolean, optional (default: "false")) - Activate parent class after deleting. Default: false

**Example:**
```json
{
  "activate_on_delete": "false"
}
```

---

### DeleteProgram {#deleteprogram-high}
**Description:** Delete an ABAP program from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### GetClass {#getclass-high}
**Description:** Retrieve ABAP class source code. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetLocalDefinitions {#getlocaldefinitions-high}
**Description:** Retrieve local definitions source code from a class (definitions include). Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetLocalMacros {#getlocalmacros-high}
**Description:** Retrieve local macros source code from a class (macros include). Supports reading active or inactive version. Note: Macros are supported in older ABAP versions but not in newer ones.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetLocalTestClass {#getlocaltestclass-high}
**Description:** Retrieve local test class source code from a class. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetLocalTypes {#getlocaltypes-high}
**Description:** Retrieve local types source code from a class (implementations include). Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetProgram {#getprogram-high}
**Description:** Retrieve ABAP program definition. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_MY_PROGRAM).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### UpdateClass {#updateclass-high}
**Description:** Update source code of an existing ABAP class. Locks, checks, updates, unlocks, and optionally activates.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_TEST_CLASS_001).
- `source_code` (string, required) - Complete ABAP class source code.
- `activate` (boolean, optional) - Activate after update. Default: false.

**Example:**
```json
{
  "source_code": "\"example_value\""
}
```

---

### UpdateFunctionGroup {#updatefunctiongroup-high}
**Description:** Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules and don

**Parameters:**
- `inputSchema` (string, optional) - Function group name (e.g., ZTEST_FG_001). Must exist in the system.
- `description` (string, required) - New description for the function group.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

**Example:**
```json
{
  "description": "\"example_value\""
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

### UpdateLocalDefinitions {#updatelocaldefinitions-high}
**Description:** Update local definitions in an ABAP class (definitions include). Manages lock, check, update, unlock, and optional activation.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `definitions_code` (string, required) - Updated source code for local definitions.
- `transport_request` (string, optional) - Transport request number.
- `activate_on_update` (boolean, optional (default: "false")) - Activate parent class after updating. Default: false

**Example:**
```json
{
  "definitions_code": "\"example_value\"",
  "activate_on_update": "false"
}
```

---

### UpdateLocalMacros {#updatelocalmacros-high}
**Description:** Update local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `macros_code` (string, required) - Updated source code for local macros.
- `transport_request` (string, optional) - Transport request number.
- `activate_on_update` (boolean, optional (default: "false")) - Activate parent class after updating. Default: false

**Example:**
```json
{
  "macros_code": "\"example_value\"",
  "activate_on_update": "false"
}
```

---

### UpdateLocalTestClass {#updatelocaltestclass-high}
**Description:** Update a local test class in an ABAP class. Manages lock, check, update, unlock, and optional activation of parent class.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `test_class_code` (string, required) - Updated source code for the local test class.
- `transport_request` (string, optional) - Transport request number (required for transportable objects).
- `activate_on_update` (boolean, optional (default: "false")) - Activate parent class after updating test class. Default: false

**Example:**
```json
{
  "test_class_code": "\"example_value\"",
  "activate_on_update": "false"
}
```

---

### UpdateLocalTypes {#updatelocaltypes-high}
**Description:** Update local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.

**Parameters:**
- `inputSchema` (string, optional) - Parent class name (e.g., ZCL_MY_CLASS).
- `local_types_code` (string, required) - Updated source code for local types.
- `transport_request` (string, optional) - Transport request number.
- `activate_on_update` (boolean, optional (default: "false")) - Activate parent class after updating. Default: false

**Example:**
```json
{
  "local_types_code": "\"PROG/P\"",
  "activate_on_update": "false"
}
```

---

### UpdateProgram {#updateprogram-high}
**Description:** Update source code of an existing ABAP program. Locks the program, checks new code, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing programs without re-creating metadata.

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

*Low-level tools perform a single operation (one method call to AdtClient).*

### ActivateClassLow {#activateclasslow-low}
**Description:** [low-level] Activate an ABAP class. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ActivateClassTestClassesLow {#activateclasstestclasseslow-low}
**Description:** [low-level] Activate ABAP Unit test classes include for an existing class. Should be executed after updating and unlocking test classes.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `test_class_name` (string, optional) - Optional ABAP Unit test class name (e.g., LTCL_MY_CLASS). Defaults to auto-detected value.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ActivateFunctionGroupLow {#activatefunctiongrouplow-low}
**Description:** [low-level] Activate an ABAP function group. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Function group name (e.g., Z_FG_TEST).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ActivateFunctionModuleLow {#activatefunctionmodulelow-low}
**Description:** [low-level] Activate an ABAP function module. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Function module name (e.g., Z_FM_TEST).
- `function_group_name` (string, required) - Function group name (e.g., Z_FG_TEST).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "function_group_name": "\"ZMY_FUNCTION_GROUP_NAME\""
}
```

---

### ActivateProgramLow {#activateprogramlow-low}
**Description:** [low-level] Activate an ABAP program. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckClassLow {#checkclasslow-low}
**Description:** [low-level] Perform syntax check on an ABAP class. Can check existing class (active/inactive) or hypothetical source code. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS)
- `version` (string, optional) - Version to check: 
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckFunctionGroupLow {#checkfunctiongrouplow-low}
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

### CheckFunctionModuleLow {#checkfunctionmodulelow-low}
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

### CheckProgramLow {#checkprogramlow-low}
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

### CreateClassLow {#createclasslow-low}
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

### CreateFunctionGroupLow {#createfunctiongrouplow-low}
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

### CreateFunctionModuleLow {#createfunctionmodulelow-low}
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

### CreateProgramLow {#createprogramlow-low}
**Description:** [low-level] Create a new ABAP program. - use CreateProgram (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - Program description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `program_type` (string, optional) - Program type: 
- `application` (string, optional (default: "*).")) - Application area (optional, default: 
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

### DeleteClassLow {#deleteclasslow-low}
**Description:** [low-level] Delete an ABAP class from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteFunctionGroupLow {#deletefunctiongrouplow-low}
**Description:** [low-level] Delete an ABAP function group from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteFunctionModuleLow {#deletefunctionmodulelow-low}
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

### DeleteProgramLow {#deleteprogramlow-low}
**Description:** [low-level] Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### GetClassUnitTestResultLow {#getclassunittestresultlow-low}
**Description:** [low-level] Retrieve ABAP Unit run result (ABAPUnit or JUnit XML) for a completed run_id.

**Parameters:**
- `inputSchema` (string, optional) - Run identifier returned by RunClassUnitTestsLow.
- `with_navigation_uris` (boolean, optional) - Optional flag to request navigation URIs in SAP response (default true).
- `format` (string, optional) - Preferred response format. Defaults to 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### GetClassUnitTestStatusLow {#getclassunitteststatuslow-low}
**Description:** [low-level] Retrieve ABAP Unit run status XML for a previously started run_id.

**Parameters:**
- `inputSchema` (string, optional) - Run identifier returned by RunClassUnitTestsLow.
- `with_long_polling` (boolean, optional) - Optional flag to enable SAP long-polling (default true).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockClassLow {#lockclasslow-low}
**Description:** [low-level] Lock an ABAP class for modification. Uses session from HandlerContext. Returns lock handle that must be used in subsequent update/unlock operations.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).

**Example:**
```json
{}
```

---

### LockClassTestClassesLow {#lockclasstestclasseslow-low}
**Description:** [low-level] Lock ABAP Unit test classes include (CLAS/OC testclasses) for the specified class. Returns a test_classes_lock_handle for subsequent update/unlock operations using the same session.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### LockFunctionGroupLow {#lockfunctiongrouplow-low}
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

### LockFunctionModuleLow {#lockfunctionmodulelow-low}
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

### LockProgramLow {#lockprogramlow-low}
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

### RunClassUnitTestsLow {#runclassunittestslow-low}
**Description:** [low-level] Start an ABAP Unit test run for provided class test definitions. Returns run_id extracted from SAP response headers.

**Parameters:**
- `inputSchema` (string, optional) - Class that owns the test include (e.g., ZCL_MAIN_CLASS).
- `test_class` (string, required) - Test class name inside the include (e.g., LTCL_MAIN_CLASS).
- `title` (string, optional) - Optional title for the ABAP Unit run.
- `context` (string, optional) - Optional context string shown in SAP tools.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "test_class": "\"example_value\""
}
```

---

### UnlockClassLow {#unlockclasslow-low}
**Description:** [low-level] Unlock an ABAP class after modification. Uses session from HandlerContext. Must use the same lock_handle from LockClass operation.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle from LockClass operation.

**Example:**
```json
{
  "lock_handle": "\"example_value\""
}
```

---

### UnlockClassTestClassesLow {#unlockclasstestclasseslow-low}
**Description:** [low-level] Unlock ABAP Unit test classes include for a class using the test_classes_lock_handle obtained from LockClassTestClassesLow.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle returned by LockClassTestClassesLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "lock_handle": "\"example_value\""
}
```

---

### UnlockFunctionGroupLow {#unlockfunctiongrouplow-low}
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

### UnlockFunctionModuleLow {#unlockfunctionmodulelow-low}
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

### UnlockProgramLow {#unlockprogramlow-low}
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

### UpdateClassLow {#updateclasslow-low}
**Description:** [low-level] Update source code of an existing ABAP class. Uses session from HandlerContext. Requires lock handle from LockClass operation. - use UpdateClass (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist.
- `source_code` (string, required) - Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections.
- `lock_handle` (string, required) - Lock handle from LockClass operation. Required for update operation.

**Example:**
```json
{
  "source_code": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### UpdateClassTestClassesLow {#updateclasstestclasseslow-low}
**Description:** [low-level] Upload ABAP Unit test include source code for an existing class. Requires test_classes_lock_handle from LockClassTestClassesLow.

**Parameters:**
- `inputSchema` (string, optional) - Class name (e.g., ZCL_MY_CLASS).
- `test_class_source` (string, required) - Complete ABAP Unit test class source code.
- `lock_handle` (string, required) - Test classes lock handle from LockClassTestClassesLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "test_class_source": "\"example_value\"",
  "lock_handle": "\"example_value\""
}
```

---

### UpdateFunctionModuleLow {#updatefunctionmodulelow-low}
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

### UpdateProgramLow {#updateprogramlow-low}
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

### ValidateClassLow {#validateclasslow-low}
**Description:** [low-level] Validate an ABAP class name before creation. Checks if the name is valid, available, and validates package, description, and superclass if provided. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Class name to validate (e.g., ZCL_MY_CLASS)
- `package_name` (string, required) - Package name for validation (required).
- `description` (string, required) - Description for validation (required).
- `superclass` (string, optional) - Optional superclass name for validation (e.g., CL_OBJECT)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "description": "\"example_value\""
}
```

---

### ValidateFunctionGroupLow {#validatefunctiongrouplow-low}
**Description:** [low-level] Validate an ABAP function group name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - FunctionGroup name to validate (e.g., Z_MY_PROGRAM).
- `description` (string, optional) - Optional description for validation
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ValidateFunctionModuleLow {#validatefunctionmodulelow-low}
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

### ValidateProgramLow {#validateprogramlow-low}
**Description:** [low-level] Validate an ABAP program name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Program name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `description` (string, required) - Program description. Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "description": "\"example_value\""
}
```

---


## Tables and Structures

### Read-Only Tools {#tables-and-structures-read-only}

*Read-only tools retrieve information without modifying the system.*

### GetTableContents {#gettablecontents-readonly}
**Description:** [read-only] Retrieve contents of an ABAP table.

> **⚠️ ABAP Cloud Limitation:** Direct access to table data through ADT Data Preview is blocked by SAP BTP backend policies. When authenticating via JWT/XSUAA, the server will return a descriptive error. This function works only for on-premise systems.

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
- `data_type` (string, optional (default: "CHAR")) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 
- `length` (number, optional (default: "100")) - Data type length. Usually inherited from domain.
- `decimals` (number, optional (default: "0")) - Decimal places. Usually inherited from domain.
- `short_label` (string, optional) - Short field label (max 10 chars). Applied during update step after creation.
- `medium_label` (string, optional) - Medium field label (max 20 chars). Applied during update step after creation.
- `long_label` (string, optional) - Long field label (max 40 chars). Applied during update step after creation.
- `heading_label` (string, optional) - Heading field label (max 55 chars). Applied during update step after creation.
- `type_kind` (string, optional (default: "domain")) - Type kind: 
- `type_name` (string, optional) - Type name: domain name (when type_kind is 
- `search_help` (string, optional) - Search help name. Applied during update step after creation.
- `search_help_parameter` (string, optional) - Search help parameter. Applied during update step after creation.
- `set_get_parameter` (string, optional) - Set/Get parameter ID. Applied during update step after creation.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "data_type": "\"PROG/P\"",
  "length": "100",
  "decimals": "0",
  "type_kind": "\"PROG/P\""
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

### CreateServiceDefinition {#createservicedefinition-high}
**Description:** Create a new ABAP service definition for OData services. Service definitions define the structure and behavior of OData services. Uses stateful session for proper lock management.

**Parameters:**
- `inputSchema` (string, optional) - Service definition name (e.g., ZSD_MY_SERVICE). Must follow SAP naming conventions (start with Z or Y).
- `description` (string, optional) - Service definition description. If not provided, service_definition_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `source_code` (string, optional) - Service definition source code (optional). If not provided, a minimal template will be created.
- `activate` (boolean, optional) - Activate service definition after creation. Default: true.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\""
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
- `activate` (boolean, optional) - Activate structure after creation. Default: true. Set to false for batch operations (activate multiple objects later).

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
- `activate` (boolean, optional) - Activate table after creation. Default: true. Set to false for batch operations (activate multiple objects later).

**Example:**
```json
{
  "ddl_code": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### CreateView {#createview-high}
**Description:** Create CDS View or Classic View in SAP using DDL syntax. Both types use the same API workflow, differing only in DDL content (CDS has @AbapCatalog.sqlViewName and other annotations).

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW).
- `ddl_source` (string, required) - Complete DDL source code.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (required for transportable packages).
- `description` (string, optional) - Optional description (defaults to view_name).
- `activate` (boolean, optional) - Activate after creation. Default: true.

**Example:**
```json
{
  "ddl_source": "\"example_value\"",
  "package_name": "\"ZMY_PACKAGE_NAME\""
}
```

---

### DeleteDataElement {#deletedataelement-high}
**Description:** Delete an ABAP data element from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteDomain {#deletedomain-high}
**Description:** Delete an ABAP domain from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_MY_DOMAIN).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteServiceDefinition {#deleteservicedefinition-high}
**Description:** Delete an ABAP service definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteStructure {#deletestructure-high}
**Description:** Delete an ABAP structure from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_MY_STRUCTURE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteTable {#deletetable-high}
**Description:** Delete an ABAP table from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., Z_MY_TABLE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteView {#deleteview-high}
**Description:** Delete an ABAP view from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_MY_VIEW).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### GetDataElement {#getdataelement-high}
**Description:** Retrieve ABAP data element definition. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetDomain {#getdomain-high}
**Description:** Retrieve ABAP domain definition. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_MY_DOMAIN).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetServiceDefinition {#getservicedefinition-high}
**Description:** Retrieve ABAP service definition definition. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetStructure {#getstructure-high}
**Description:** Retrieve ABAP structure definition. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_MY_STRUCTURE).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetTable {#gettable-high}
**Description:** Retrieve ABAP table definition. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., Z_MY_TABLE).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
```

---

### GetView {#getview-high}
**Description:** Retrieve ABAP view definition. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_MY_VIEW).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
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
- `field_label_short` (string, optional) - Short field label (max 10 chars)
- `field_label_medium` (string, optional) - Medium field label (max 20 chars)
- `field_label_long` (string, optional) - Long field label (max 40 chars)
- `field_label_heading` (string, optional) - Heading field label (max 55 chars)
- `search_help` (string, optional) - Search help name
- `search_help_parameter` (string, optional) - Search help parameter
- `set_get_parameter` (string, optional) - Set/Get parameter ID
- `activate` (boolean, optional (default: "true)")) - Activate data element after update (default: true)

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "type_kind": "\"PROG/P\"",
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

### UpdateServiceDefinition {#updateservicedefinition-high}
**Description:** Update source code of an existing ABAP service definition. Uses stateful session with proper lock/unlock mechanism.

**Parameters:**
- `inputSchema` (string, optional) - Service definition name (e.g., ZSD_MY_SERVICE). Must exist in the system.
- `source_code` (string, required) - Complete service definition source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.
- `activate` (boolean, optional) - Activate service definition after update. Default: true.

**Example:**
```json
{
  "source_code": "\"example_value\""
}
```

---

### UpdateStructure {#updatestructure-high}
**Description:** Update DDL source code of an existing ABAP structure. Locks the structure, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing structures without re-creating metadata.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.
- `ddl_code` (string, required) - Complete DDL source code for structure. Example: 
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.
- `activate` (boolean, optional) - Activate structure after source update. Default: true.

**Example:**
```json
{
  "ddl_code": "\"example_value\""
}
```

---

### UpdateTable {#updatetable-high}
**Description:** Update DDL source code of an existing ABAP table. Locks the table, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing tables without re-creating metadata.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., ZZ_TEST_TABLE_001). Table must already exist.
- `ddl_code` (string, required) - Complete DDL source code for table. Example: 
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.
- `activate` (boolean, optional) - Activate table after source update. Default: true.

**Example:**
```json
{
  "ddl_code": "\"example_value\""
}
```

---

### UpdateView {#updateview-high}
**Description:** Update DDL source code of an existing CDS View or Classic View. Locks the view, checks new code, uploads new DDL source, unlocks, and optionally activates.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., ZOK_R_TEST_0002).
- `ddl_source` (string, required) - Complete DDL source code.
- `activate` (boolean, optional) - Activate after update. Default: false.

**Example:**
```json
{
  "ddl_source": "\"example_value\""
}
```

---


### Low-Level Tools {#tables-and-structures-low-level}

*Low-level tools perform a single operation (one method call to AdtClient).*

### ActivateDataElementLow {#activatedataelementlow-low}
**Description:** [low-level] Activate an ABAP data element. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Data element name (e.g., ZDT_MY_ELEMENT).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ActivateDomainLow {#activatedomainlow-low}
**Description:** [low-level] Activate an ABAP domain. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., ZDM_MY_DOMAIN).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ActivateStructureLow {#activatestructurelow-low}
**Description:** [low-level] Activate an ABAP structure. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., ZST_MY_STRUCTURE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ActivateTableLow {#activatetablelow-low}
**Description:** [low-level] Activate an ABAP table. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., ZTB_MY_TABLE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### ActivateViewLow {#activateviewlow-low}
**Description:** [low-level] Activate an ABAP view (CDS view). Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., ZVW_MY_VIEW).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckDataElementLow {#checkdataelementlow-low}
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

### CheckDomainLow {#checkdomainlow-low}
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

### CheckStructureLow {#checkstructurelow-low}
**Description:** [low-level] Perform syntax check on an ABAP structure. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_MY_PROGRAM).
- `ddl_code` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `version` (string, optional) - Version to check: 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckTableLow {#checktablelow-low}
**Description:** [low-level] Perform syntax check on an ABAP table. Returns syntax errors, warnings, and messages. Requires session_id for stateful operations. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., Z_MY_TABLE)
- `ddl_code` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `version` (string, optional) - Version to check: 
- `reporter` (string, optional) - Check reporter: 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckViewLow {#checkviewlow-low}
**Description:** [low-level] Perform syntax check on an ABAP view. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_source is provided, validates new/unsaved code (will be base64 encoded in request).

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_MY_PROGRAM).
- `ddl_source` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `version` (string, optional) - Version to check: 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CreateDataElementLow {#createdataelementlow-low}
**Description:** [low-level] Create a new ABAP data element. - use CreateDataElement (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - DataElement description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `data_type` (string, optional) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 
- `type_kind` (string, optional) - Type kind: 
- `type_name` (string, optional) - Type name: domain name (when type_kind is 
- `length` (number, optional) - Data type length (for predefinedAbapType or refToPredefinedAbapType)
- `decimals` (number, optional) - Decimal places (for predefinedAbapType or refToPredefinedAbapType)
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

### CreateDomainLow {#createdomainlow-low}
**Description:** [low-level] Create a new ABAP domain. - use CreateDomain (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - Domain description.
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

### CreateStructureLow {#createstructurelow-low}
**Description:** [low-level] Create a new ABAP structure. - use CreateStructure (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - Structure description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `structure_type` (string, optional) - Structure type: 
- `application` (string, optional (default: "*).")) - Application area (optional, default: 
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

### CreateTableLow {#createtablelow-low}
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

### CreateViewLow {#createviewlow-low}
**Description:** [low-level] Create a new ABAP view. - use CreateView (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_TEST_PROGRAM). Must follow SAP naming conventions.
- `description` (string, required) - View description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `view_type` (string, optional) - View type: 
- `application` (string, optional (default: "*).")) - Application area (optional, default: 
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

### DeleteDataElementLow {#deletedataelementlow-low}
**Description:** [low-level] Delete an ABAP data element from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteDomainLow {#deletedomainlow-low}
**Description:** [low-level] Delete an ABAP domain from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Domain name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteStructureLow {#deletestructurelow-low}
**Description:** [low-level] Delete an ABAP structure from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Structure name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteTableLow {#deletetablelow-low}
**Description:** [low-level] Delete an ABAP table from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeleteViewLow {#deleteviewlow-low}
**Description:** [low-level] Delete an ABAP view from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - View name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### LockDataElementLow {#lockdataelementlow-low}
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

### LockDomainLow {#lockdomainlow-low}
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

### LockStructureLow {#lockstructurelow-low}
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

### LockTableLow {#locktablelow-low}
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

### LockViewLow {#lockviewlow-low}
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

### UnlockDataElementLow {#unlockdataelementlow-low}
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

### UnlockDomainLow {#unlockdomainlow-low}
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

### UnlockStructureLow {#unlockstructurelow-low}
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

### UnlockTableLow {#unlocktablelow-low}
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

### UnlockViewLow {#unlockviewlow-low}
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

### UpdateDataElementLow {#updatedataelementlow-low}
**Description:** [low-level] Update properties of an existing ABAP data element. Requires lock handle from LockObject. - use UpdateDataElement (high-level) for full workflow with lock/unlock/activate.

**Parameters:**
- `inputSchema` (string, optional) - Data element name (e.g., ZOK_E_TEST_0001). Data element must already exist.
- `properties` (object, required) - Data element properties object. Can include: description, type_name, type_kind, data_type, field_label_short, field_label_medium, field_label_long, etc.
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

### UpdateDomainLow {#updatedomainlow-low}
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

### UpdateStructureLow {#updatestructurelow-low}
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

### UpdateTableLow {#updatetablelow-low}
**Description:** [low-level] Update DDL source code of an existing ABAP table. Requires lock handle from LockObject. - use CreateTable for full workflow with lock/unlock.

**Parameters:**
- `inputSchema` (string, optional) - Table name (e.g., ZOK_T_TEST_0001). Table must already exist.
- `ddl_code` (string, required) - Complete DDL source code for the table definition.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.
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

### UpdateViewLow {#updateviewlow-low}
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

### ValidateDataElementLow {#validatedataelementlow-low}
**Description:** [low-level] Validate an ABAP data element name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - DataElement name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `description` (string, required) - DataElement description. Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "description": "\"example_value\""
}
```

---

### ValidateDomainLow {#validatedomainlow-low}
**Description:** [low-level] Validate an ABAP domain name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Domain name to validate (e.g., Z_MY_PROGRAM).
- `description` (string, required) - Domain description (required for validation).
- `package_name` (string, required) - Package name (required for validation).
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

### ValidateStructureLow {#validatestructurelow-low}
**Description:** [low-level] Validate an ABAP structure name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Structure name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `description` (string, required) - Structure description. Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "description": "\"example_value\""
}
```

---

### ValidateTableLow {#validatetablelow-low}
**Description:** [low-level] Validate an ABAP table name before creation. Checks if the name is valid and available. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Table name to validate (e.g., Z_MY_TABLE)
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `description` (string, required) - Table description. Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "description": "\"example_value\""
}
```

---

### ValidateViewLow {#validateviewlow-low}
**Description:** [low-level] Validate an ABAP view name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - View name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `description` (string, required) - View description. Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "description": "\"example_value\""
}
```

---


## Packages and Interfaces

### Read-Only Tools {#packages-and-interfaces-read-only}

*Read-only tools retrieve information without modifying the system.*

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

### DeleteInterface {#deleteinterface-high}
**Description:** Delete an ABAP interface from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., Z_MY_INTERFACE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### GetInterface {#getinterface-high}
**Description:** Retrieve ABAP interface definition. Supports reading active or inactive version.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., Z_MY_INTERFACE).
- `version` (string, optional (default: "active")) - Version to read: 

**Example:**
```json
{
  "version": "\"example_value\""
}
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

*Low-level tools perform a single operation (one method call to AdtClient).*

### ActivateInterfaceLow {#activateinterfacelow-low}
**Description:** [low-level] Activate an ABAP interface. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., ZIF_MY_INTERFACE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckInterfaceLow {#checkinterfacelow-low}
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

### CheckPackageLow {#checkpackagelow-low}
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

### CreateInterfaceLow {#createinterfacelow-low}
**Description:** [low-level] Create a new ABAP interface. - use CreateInterface (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., ZIF_TEST_INTERFACE). Must follow SAP naming conventions.
- `description` (string, required) - Interface description.
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

### CreatePackageLow {#createpackagelow-low}
**Description:** [low-level] Create a new ABAP package. - use CreatePackage (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., ZOK_TEST_0002). Must follow SAP naming conventions.
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.
- `description` (string, required) - Package description.
- `package_type` (string, optional) - Package type (development/structure). Defaults to development.
- `software_component` (string, optional) - Software component (e.g., HOME, ZLOCAL). If not provided, SAP will set a default (typically ZLOCAL for local packages).
- `transport_layer` (string, optional) - Transport layer (e.g., ZDEV). Required for transportable packages.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `application_component` (string, optional) - Application component (e.g., BC-ABA).
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

### DeleteInterfaceLow {#deleteinterfacelow-low}
**Description:** [low-level] Delete an ABAP interface from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Interface name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### DeletePackageLow {#deletepackagelow-low}
**Description:** [low-level] Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).
- `force_new_connection` (boolean, optional) - Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false.

**Example:**
```json
{}
```

---

### LockInterfaceLow {#lockinterfacelow-low}
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

### LockPackageLow {#lockpackagelow-low}
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

### UnlockInterfaceLow {#unlockinterfacelow-low}
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

### UnlockPackageLow {#unlockpackagelow-low}
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

### UpdateInterfaceLow {#updateinterfacelow-low}
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

### UpdatePackageLow {#updatepackagelow-low}
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

### ValidateInterfaceLow {#validateinterfacelow-low}
**Description:** [low-level] Validate an ABAP interface name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Interface name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `description` (string, required) - Interface description. Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "package_name": "\"ZMY_PACKAGE_NAME\"",
  "description": "\"example_value\""
}
```

---

### ValidatePackageLow {#validatepackagelow-low}
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

**Parameters:**
- `inputSchema` (string, optional) - Name of the ABAP program or include
- `object_type` (string, required) - [read-only] ADT object type (e.g. PROG/P, PROG/I, FUGR, CLAS/OC)
- `detailed` (boolean, optional (default: "false")) - [read-only] If true, returns structured JSON with metadata and raw XML.
- `timeout` (number, optional) - [read-only] Timeout in ms for each ADT request.

**Example:**
```json
{
  "object_type": "\"PROG/P\"",
  "detailed": "false"
}
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

**Parameters:**
- `inputSchema` (string, optional) - SQL query to execute
- `row_number` (number, optional (default: "100")) - [read-only] Maximum number of rows to return

**Example:**
```json
{
  "row_number": "100"
}
```

---

### GetTransaction {#gettransaction-readonly}
**Description:** [read-only] Retrieve ABAP transaction details.

**Parameters:**
- `inputSchema` (string, optional) - Name of the ABAP transaction

**Example:**
```json
{}
```

---

### GetTypeInfo {#gettypeinfo-readonly}
**Description:** [read-only] Retrieve ABAP type information.

**Parameters:**
- `inputSchema` (string, optional) - Name of the ABAP type

**Example:**
```json
{}
```

---

### GetWhereUsed {#getwhereused-readonly}
**Description:** [read-only] Retrieve where-used references for ABAP objects via ADT usageReferences. Uses Eclipse ADT-compatible two-step workflow with optional scope customization.

**Parameters:**
- `inputSchema` (string, optional) - Name of the ABAP object
- `object_type` (string, required) - Type of the ABAP object (class, interface, program, table, etc.)
- `enable_all_types` (boolean, optional (default: "false")) - If true, searches in all available object types (Eclipse 

**Example:**
```json
{
  "object_type": "\"PROG/P\"",
  "enable_all_types": "false"
}
```

---


### High-Level Tools {#types,-descriptions,-metadata-high-level}

*High-level tools perform a chain of operations (e.g., validate → lock → update → check → unlock → activate).*

### GetPackageTree {#getpackagetree-high}
**Description:** [high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions.

**Parameters:**
- `inputSchema` (string, optional) - Package name (e.g., 
- `include_subpackages` (boolean, optional (default: "true")) - Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true
- `max_depth` (integer, optional (default: "5")) - Maximum depth for recursive package traversal. Default: 5
- `include_descriptions` (boolean, optional (default: "true")) - Include object descriptions in response. Default: true
- `debug` (boolean, optional (default: "false")) - Include diagnostic metadata in response (counts, types, hierarchy info). Default: false

**Example:**
```json
{
  "include_subpackages": "true",
  "max_depth": "\"example\"",
  "include_descriptions": "true",
  "debug": "false"
}
```

---


### Low-Level Tools {#types,-descriptions,-metadata-low-level}

*Low-level tools perform a single operation (one method call to AdtClient).*

### GetNodeStructureLow {#getnodestructurelow-low}
**Description:** [low-level] Fetch node structure from ADT repository. Used for object tree navigation and structure discovery. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Parent object type (e.g., 
- `parent_name` (string, required) - Parent object name
- `node_id` (string, optional (default: "0000 for root). Use to fetch child nodes.")) - Optional node ID (default: 
- `with_short_descriptions` (boolean, optional (default: "true")) - Include short descriptions in response
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "parent_name": "\"ZMY_PARENT_NAME\"",
  "node_id": "\"example_value\"",
  "with_short_descriptions": "true"
}
```

---

### GetObjectStructureLow {#getobjectstructurelow-low}
**Description:** [low-level] Retrieve ADT object structure as compact JSON tree. Returns XML response with object structure tree. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Object type (e.g., 
- `object_name` (string, required) - Object name (e.g., 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{
  "object_name": "\"ZMY_OBJECT_NAME\""
}
```

---

### GetVirtualFoldersLow {#getvirtualfolderslow-low}
**Description:** [low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.

**Parameters:**
- `inputSchema` (string, optional (default: "*")) - Object search pattern (e.g., 
- `preselection` (string, optional) - Facet name (e.g., 
- `with_versions` (boolean, optional (default: "false")) - Include version information in response
- `ignore_short_descriptions` (boolean, optional (default: "false")) - Ignore short descriptions in response

**Example:**
```json
{
  "inputSchema": "\"example_value\"",
  "with_versions": "false",
  "ignore_short_descriptions": "false"
}
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

*Low-level tools perform a single operation (one method call to AdtClient).*

### CreateTransportLow {#createtransportlow-low}
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

### GetEnhancementImpl {#getenhancementimpl-readonly}
**Description:** [read-only] Retrieve source code of a specific enhancement implementation by its name and enhancement spot.

**Parameters:**
- `inputSchema` (string, optional) - Name of the enhancement spot
- `enhancement_name` (string, required) - [read-only] Name of the enhancement implementation

**Example:**
```json
{
  "enhancement_name": "\"ZMY_ENHANCEMENT_NAME\""
}
```

---

### GetEnhancements {#getenhancements-readonly}
**Description:** [read-only] Retrieve a list of enhancements for a given ABAP object.

**Parameters:**
- `inputSchema` (string, optional) - Name of the ABAP object
- `object_type` (string, required) - [read-only] Type of the ABAP object

**Example:**
```json
{
  "object_type": "\"PROG/P\""
}
```

---

### GetEnhancementSpot {#getenhancementspot-readonly}
**Description:** [read-only] Retrieve metadata and list of implementations for a specific enhancement spot.

**Parameters:**
- `inputSchema` (string, optional) - Name of the enhancement spot

**Example:**
```json
{}
```

---


### High-Level Tools {#enhancements-high-level}

*High-level tools perform a chain of operations (e.g., validate → lock → update → check → unlock → activate).*

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

*Low-level tools perform a single operation (one method call to AdtClient).*

### ActivateMetadataExtensionLow {#activatemetadataextensionlow-low}
**Description:** [low-level] Activate an ABAP metadata extension. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Parameters:**
- `inputSchema` (string, optional) - Metadata extension name (e.g., ZC_MY_EXTENSION).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

**Example:**
```json
{}
```

---

### CheckMetadataExtensionLow {#checkmetadataextensionlow-low}
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

### CreateMetadataExtensionLow {#createmetadataextensionlow-low}
**Description:** [low-level] Create a new ABAP Metadata Extension. - use CreateMetadataExtension (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Parameters:**
- `inputSchema` (string, optional) - Metadata Extension name (e.g., ZI_MY_DDLX).
- `description` (string, required) - Metadata Extension description.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional for local objects.
- `master_language` (string, optional) - Master language (optional, e.g., 
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

### DeleteMetadataExtensionLow {#deletemetadataextensionlow-low}
**Description:** [low-level] Delete an ABAP metadata extension from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Parameters:**
- `inputSchema` (string, optional) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

**Example:**
```json
{}
```

---

### LockMetadataExtensionLow {#lockmetadataextensionlow-low}
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

### UnlockMetadataExtensionLow {#unlockmetadataextensionlow-low}
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

### UpdateMetadataExtensionLow {#updatemetadataextensionlow-low}
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

### ValidateMetadataExtensionLow {#validatemetadataextensionlow-low}
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

*Last updated: 2025-12-27*
*Document version: 1.0*
*Generated automatically from TOOL_DEFINITION exports*
