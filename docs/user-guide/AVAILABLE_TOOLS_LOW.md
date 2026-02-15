# Low-Level Tools - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

- Level: Low-Level
- Total tools: 122

## Navigation

- [Low-Level Group](#low-level-group)
  - [Behavior Definition](#low-level-behavior-definition)
    - [ActivateBehaviorDefinitionLow](#activatebehaviordefinitionlow-low-level-behavior-definition)
    - [CheckBdefLow](#checkbdeflow-low-level-behavior-definition)
    - [CreateBehaviorDefinitionLow](#createbehaviordefinitionlow-low-level-behavior-definition)
    - [DeleteBehaviorDefinitionLow](#deletebehaviordefinitionlow-low-level-behavior-definition)
    - [LockBehaviorDefinitionLow](#lockbehaviordefinitionlow-low-level-behavior-definition)
    - [UnlockBehaviorDefinitionLow](#unlockbehaviordefinitionlow-low-level-behavior-definition)
    - [UpdateBehaviorDefinitionLow](#updatebehaviordefinitionlow-low-level-behavior-definition)
    - [ValidateBehaviorDefinitionLow](#validatebehaviordefinitionlow-low-level-behavior-definition)
  - [Behavior Implementation](#low-level-behavior-implementation)
    - [CreateBehaviorImplementationLow](#createbehaviorimplementationlow-low-level-behavior-implementation)
    - [LockBehaviorImplementationLow](#lockbehaviorimplementationlow-low-level-behavior-implementation)
    - [ValidateBehaviorImplementationLow](#validatebehaviorimplementationlow-low-level-behavior-implementation)
  - [Class](#low-level-class)
    - [ActivateClassLow](#activateclasslow-low-level-class)
    - [ActivateClassTestClassesLow](#activateclasstestclasseslow-low-level-class)
    - [CheckClassLow](#checkclasslow-low-level-class)
    - [CreateClassLow](#createclasslow-low-level-class)
    - [DeleteClassLow](#deleteclasslow-low-level-class)
    - [GetClassUnitTestResultLow](#getclassunittestresultlow-low-level-class)
    - [GetClassUnitTestStatusLow](#getclassunitteststatuslow-low-level-class)
    - [LockClassLow](#lockclasslow-low-level-class)
    - [LockClassTestClassesLow](#lockclasstestclasseslow-low-level-class)
    - [RunClassUnitTestsLow](#runclassunittestslow-low-level-class)
    - [UnlockClassLow](#unlockclasslow-low-level-class)
    - [UnlockClassTestClassesLow](#unlockclasstestclasseslow-low-level-class)
    - [UpdateClassLow](#updateclasslow-low-level-class)
    - [UpdateClassTestClassesLow](#updateclasstestclasseslow-low-level-class)
    - [ValidateClassLow](#validateclasslow-low-level-class)
  - [Common](#low-level-common)
    - [ActivateObjectLow](#activateobjectlow-low-level-common)
    - [CheckObjectLow](#checkobjectlow-low-level-common)
    - [DeleteObjectLow](#deleteobjectlow-low-level-common)
    - [LockObjectLow](#lockobjectlow-low-level-common)
    - [UnlockObjectLow](#unlockobjectlow-low-level-common)
    - [ValidateObjectLow](#validateobjectlow-low-level-common)
  - [Data Element](#low-level-data-element)
    - [ActivateDataElementLow](#activatedataelementlow-low-level-data-element)
    - [CheckDataElementLow](#checkdataelementlow-low-level-data-element)
    - [CreateDataElementLow](#createdataelementlow-low-level-data-element)
    - [DeleteDataElementLow](#deletedataelementlow-low-level-data-element)
    - [LockDataElementLow](#lockdataelementlow-low-level-data-element)
    - [UnlockDataElementLow](#unlockdataelementlow-low-level-data-element)
    - [UpdateDataElementLow](#updatedataelementlow-low-level-data-element)
    - [ValidateDataElementLow](#validatedataelementlow-low-level-data-element)
  - [Ddlx](#low-level-ddlx)
    - [ActivateMetadataExtensionLow](#activatemetadataextensionlow-low-level-ddlx)
    - [CheckMetadataExtensionLow](#checkmetadataextensionlow-low-level-ddlx)
    - [CreateMetadataExtensionLow](#createmetadataextensionlow-low-level-ddlx)
    - [DeleteMetadataExtensionLow](#deletemetadataextensionlow-low-level-ddlx)
    - [LockMetadataExtensionLow](#lockmetadataextensionlow-low-level-ddlx)
    - [UnlockMetadataExtensionLow](#unlockmetadataextensionlow-low-level-ddlx)
    - [UpdateMetadataExtensionLow](#updatemetadataextensionlow-low-level-ddlx)
    - [ValidateMetadataExtensionLow](#validatemetadataextensionlow-low-level-ddlx)
  - [Domain](#low-level-domain)
    - [ActivateDomainLow](#activatedomainlow-low-level-domain)
    - [CheckDomainLow](#checkdomainlow-low-level-domain)
    - [CreateDomainLow](#createdomainlow-low-level-domain)
    - [DeleteDomainLow](#deletedomainlow-low-level-domain)
    - [LockDomainLow](#lockdomainlow-low-level-domain)
    - [UnlockDomainLow](#unlockdomainlow-low-level-domain)
    - [UpdateDomainLow](#updatedomainlow-low-level-domain)
    - [ValidateDomainLow](#validatedomainlow-low-level-domain)
  - [Function](#low-level-function)
    - [ActivateFunctionGroupLow](#activatefunctiongrouplow-low-level-function)
    - [ActivateFunctionModuleLow](#activatefunctionmodulelow-low-level-function)
    - [CheckFunctionGroupLow](#checkfunctiongrouplow-low-level-function)
    - [CheckFunctionModuleLow](#checkfunctionmodulelow-low-level-function)
    - [CreateFunctionGroupLow](#createfunctiongrouplow-low-level-function)
    - [CreateFunctionModuleLow](#createfunctionmodulelow-low-level-function)
    - [DeleteFunctionGroupLow](#deletefunctiongrouplow-low-level-function)
    - [DeleteFunctionModuleLow](#deletefunctionmodulelow-low-level-function)
    - [LockFunctionGroupLow](#lockfunctiongrouplow-low-level-function)
    - [LockFunctionModuleLow](#lockfunctionmodulelow-low-level-function)
    - [UnlockFunctionGroupLow](#unlockfunctiongrouplow-low-level-function)
    - [UnlockFunctionModuleLow](#unlockfunctionmodulelow-low-level-function)
    - [UpdateFunctionModuleLow](#updatefunctionmodulelow-low-level-function)
    - [ValidateFunctionGroupLow](#validatefunctiongrouplow-low-level-function)
    - [ValidateFunctionModuleLow](#validatefunctionmodulelow-low-level-function)
  - [Interface](#low-level-interface)
    - [ActivateInterfaceLow](#activateinterfacelow-low-level-interface)
    - [CheckInterfaceLow](#checkinterfacelow-low-level-interface)
    - [CreateInterfaceLow](#createinterfacelow-low-level-interface)
    - [DeleteInterfaceLow](#deleteinterfacelow-low-level-interface)
    - [LockInterfaceLow](#lockinterfacelow-low-level-interface)
    - [UnlockInterfaceLow](#unlockinterfacelow-low-level-interface)
    - [UpdateInterfaceLow](#updateinterfacelow-low-level-interface)
    - [ValidateInterfaceLow](#validateinterfacelow-low-level-interface)
  - [Package](#low-level-package)
    - [CheckPackageLow](#checkpackagelow-low-level-package)
    - [CreatePackageLow](#createpackagelow-low-level-package)
    - [DeletePackageLow](#deletepackagelow-low-level-package)
    - [LockPackageLow](#lockpackagelow-low-level-package)
    - [UnlockPackageLow](#unlockpackagelow-low-level-package)
    - [UpdatePackageLow](#updatepackagelow-low-level-package)
    - [ValidatePackageLow](#validatepackagelow-low-level-package)
  - [Program](#low-level-program)
    - [ActivateProgramLow](#activateprogramlow-low-level-program)
    - [CheckProgramLow](#checkprogramlow-low-level-program)
    - [CreateProgramLow](#createprogramlow-low-level-program)
    - [DeleteProgramLow](#deleteprogramlow-low-level-program)
    - [LockProgramLow](#lockprogramlow-low-level-program)
    - [UnlockProgramLow](#unlockprogramlow-low-level-program)
    - [UpdateProgramLow](#updateprogramlow-low-level-program)
    - [ValidateProgramLow](#validateprogramlow-low-level-program)
  - [Structure](#low-level-structure)
    - [ActivateStructureLow](#activatestructurelow-low-level-structure)
    - [CheckStructureLow](#checkstructurelow-low-level-structure)
    - [CreateStructureLow](#createstructurelow-low-level-structure)
    - [DeleteStructureLow](#deletestructurelow-low-level-structure)
    - [LockStructureLow](#lockstructurelow-low-level-structure)
    - [UnlockStructureLow](#unlockstructurelow-low-level-structure)
    - [UpdateStructureLow](#updatestructurelow-low-level-structure)
    - [ValidateStructureLow](#validatestructurelow-low-level-structure)
  - [System](#low-level-system)
    - [GetNodeStructureLow](#getnodestructurelow-low-level-system)
    - [GetObjectStructureLow](#getobjectstructurelow-low-level-system)
    - [GetVirtualFoldersLow](#getvirtualfolderslow-low-level-system)
  - [Table](#low-level-table)
    - [ActivateTableLow](#activatetablelow-low-level-table)
    - [CheckTableLow](#checktablelow-low-level-table)
    - [CreateTableLow](#createtablelow-low-level-table)
    - [DeleteTableLow](#deletetablelow-low-level-table)
    - [LockTableLow](#locktablelow-low-level-table)
    - [UnlockTableLow](#unlocktablelow-low-level-table)
    - [UpdateTableLow](#updatetablelow-low-level-table)
    - [ValidateTableLow](#validatetablelow-low-level-table)
  - [Transport](#low-level-transport)
    - [CreateTransportLow](#createtransportlow-low-level-transport)
  - [View](#low-level-view)
    - [ActivateViewLow](#activateviewlow-low-level-view)
    - [CheckViewLow](#checkviewlow-low-level-view)
    - [CreateViewLow](#createviewlow-low-level-view)
    - [DeleteViewLow](#deleteviewlow-low-level-view)
    - [LockViewLow](#lockviewlow-low-level-view)
    - [UnlockViewLow](#unlockviewlow-low-level-view)
    - [UpdateViewLow](#updateviewlow-low-level-view)
    - [ValidateViewLow](#validateviewlow-low-level-view)

---

<a id="low-level-group"></a>
## Low-Level Group

<a id="low-level-behavior-definition"></a>
### Low-Level / Behavior Definition

<a id="activatebehaviordefinitionlow-low-level-behavior-definition"></a>
#### ActivateBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Activate an ABAP behavior definition. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_definition/low/handleActivateBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - Behavior definition name (root entity, e.g., ZI_MY_ENTITY).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkbdeflow-low-level-behavior-definition"></a>
#### CheckBdefLow (Low-Level / Behavior Definition)
**Description:** [low-level] Perform syntax check on an ABAP behavior definition. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/behavior_definition/low/handleCheckBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createbehaviordefinitionlow-low-level-behavior-definition"></a>
#### CreateBehaviorDefinitionLow (Low-Level / Behavior Definition)
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

<a id="deletebehaviordefinitionlow-low-level-behavior-definition"></a>
#### DeleteBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_definition/low/handleDeleteBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockbehaviordefinitionlow-low-level-behavior-definition"></a>
#### LockBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Lock an ABAP behavior definition for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/behavior_definition/low/handleLockBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockbehaviordefinitionlow-low-level-behavior-definition"></a>
#### UnlockBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Unlock an ABAP behavior definition after modification. Must use the same session_id and lock_handle from LockBehaviorDefinition operation.

**Source:** `src/handlers/behavior_definition/low/handleUnlockBehaviorDefinition.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockBehaviorDefinition operation.
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).
- `session_id` (string, required) - Session ID from LockBehaviorDefinition operation. Must be the same as used in LockBehaviorDefinition.
- `session_state` (object, optional) - Session state from LockBehaviorDefinition (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatebehaviordefinitionlow-low-level-behavior-definition"></a>
#### UpdateBehaviorDefinitionLow (Low-Level / Behavior Definition)
**Description:** [low-level] Update source code of an existing ABAP behavior definition. Requires lock handle from LockObject. - use UpdateBehaviorDefinition (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/behavior_definition/low/handleUpdateBehaviorDefinition.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `name` (string, required) - Behavior definition name (e.g., ZOK_C_TEST_0001). Behavior definition must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete behavior definition source code.

---

<a id="validatebehaviordefinitionlow-low-level-behavior-definition"></a>
#### ValidateBehaviorDefinitionLow (Low-Level / Behavior Definition)
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

<a id="low-level-behavior-implementation"></a>
### Low-Level / Behavior Implementation

<a id="createbehaviorimplementationlow-low-level-behavior-implementation"></a>
#### CreateBehaviorImplementationLow (Low-Level / Behavior Implementation)
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

<a id="lockbehaviorimplementationlow-low-level-behavior-implementation"></a>
#### LockBehaviorImplementationLow (Low-Level / Behavior Implementation)
**Description:** [low-level] Lock an ABAP behavior implementation class for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/behavior_implementation/low/handleLockBehaviorImplementation.ts`

**Parameters:**
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validatebehaviorimplementationlow-low-level-behavior-implementation"></a>
#### ValidateBehaviorImplementationLow (Low-Level / Behavior Implementation)
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

<a id="low-level-class"></a>
### Low-Level / Class

<a id="activateclasslow-low-level-class"></a>
#### ActivateClassLow (Low-Level / Class)
**Description:** [low-level] Activate an ABAP class. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/class/low/handleActivateClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="activateclasstestclasseslow-low-level-class"></a>
#### ActivateClassTestClassesLow (Low-Level / Class)
**Description:** [low-level] Activate ABAP Unit test classes include for an existing class. Should be executed after updating and unlocking test classes.

**Source:** `src/handlers/class/low/handleActivateClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `test_class_name` (string, optional) - Optional ABAP Unit test class name (e.g., LTCL_MY_CLASS). Defaults to auto-detected value.

---

<a id="checkclasslow-low-level-class"></a>
#### CheckClassLow (Low-Level / Class)
**Description:** [low-level] Perform syntax check on an ABAP class. Can check existing class (active/inactive) or hypothetical source code. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/class/low/handleCheckClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `version` (string, optional) - Version to check: 

---

<a id="createclasslow-low-level-class"></a>
#### CreateClassLow (Low-Level / Class)
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

<a id="deleteclasslow-low-level-class"></a>
#### DeleteClassLow (Low-Level / Class)
**Description:** [low-level] Delete an ABAP class from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/class/low/handleDeleteClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getclassunittestresultlow-low-level-class"></a>
#### GetClassUnitTestResultLow (Low-Level / Class)
**Description:** [low-level] Retrieve ABAP Unit run result (ABAPUnit or JUnit XML) for a completed run_id.

**Source:** `src/handlers/class/low/handleGetClassUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Preferred response format. Defaults to 
- `run_id` (string, required) - Run identifier returned by RunClassUnitTestsLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `with_navigation_uris` (boolean, optional) - Optional flag to request navigation URIs in SAP response (default true).

---

<a id="getclassunitteststatuslow-low-level-class"></a>
#### GetClassUnitTestStatusLow (Low-Level / Class)
**Description:** [low-level] Retrieve ABAP Unit run status XML for a previously started run_id.

**Source:** `src/handlers/class/low/handleGetClassUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by RunClassUnitTestsLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `with_long_polling` (boolean, optional) - Optional flag to enable SAP long-polling (default true).

---

<a id="lockclasslow-low-level-class"></a>
#### LockClassLow (Low-Level / Class)
**Description:** [low-level] Lock an ABAP class for modification. Uses session from HandlerContext. Returns lock handle that must be used in subsequent update/unlock operations.

**Source:** `src/handlers/class/low/handleLockClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).

---

<a id="lockclasstestclasseslow-low-level-class"></a>
#### LockClassTestClassesLow (Low-Level / Class)
**Description:** [low-level] Lock ABAP Unit test classes include (CLAS/OC testclasses) for the specified class. Returns a test_classes_lock_handle for subsequent update/unlock operations using the same session.

**Source:** `src/handlers/class/low/handleLockClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="runclassunittestslow-low-level-class"></a>
#### RunClassUnitTestsLow (Low-Level / Class)
**Description:** [low-level] Start an ABAP Unit test run for provided class test definitions. Returns run_id extracted from SAP response headers.

**Source:** `src/handlers/class/low/handleRunClassUnitTests.ts`

**Parameters:**
- `test_class` (string, required) - Test class name inside the include (e.g., LTCL_MAIN_CLASS).
- `tests` (array, optional) - List of container/test class pairs to execute.

---

<a id="unlockclasslow-low-level-class"></a>
#### UnlockClassLow (Low-Level / Class)
**Description:** [low-level] Unlock an ABAP class after modification. Uses session from HandlerContext. Must use the same lock_handle from LockClass operation.

**Source:** `src/handlers/class/low/handleUnlockClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle from LockClass operation.

---

<a id="unlockclasstestclasseslow-low-level-class"></a>
#### UnlockClassTestClassesLow (Low-Level / Class)
**Description:** [low-level] Unlock ABAP Unit test classes include for a class using the test_classes_lock_handle obtained from LockClassTestClassesLow.

**Source:** `src/handlers/class/low/handleUnlockClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Lock handle returned by LockClassTestClassesLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updateclasslow-low-level-class"></a>
#### UpdateClassLow (Low-Level / Class)
**Description:** [low-level] Update source code of an existing ABAP class. Uses session from HandlerContext. Requires lock handle from LockClass operation. - use UpdateClass (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/class/low/handleUpdateClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist.
- `lock_handle` (string, required) - Lock handle from LockClass operation. Required for update operation.
- `source_code` (string, required) - Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections.

---

<a id="updateclasstestclasseslow-low-level-class"></a>
#### UpdateClassTestClassesLow (Low-Level / Class)
**Description:** [low-level] Upload ABAP Unit test include source code for an existing class. Requires test_classes_lock_handle from LockClassTestClassesLow.

**Source:** `src/handlers/class/low/handleUpdateClassTestClasses.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `lock_handle` (string, required) - Test classes lock handle from LockClassTestClassesLow.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `test_class_source` (string, required) - Complete ABAP Unit test class source code.

---

<a id="validateclasslow-low-level-class"></a>
#### ValidateClassLow (Low-Level / Class)
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

<a id="low-level-common"></a>
### Low-Level / Common

<a id="activateobjectlow-low-level-common"></a>
#### ActivateObjectLow (Low-Level / Common)
**Description:** [low-level] Activate one or multiple ABAP repository objects. Works with any object type; URI is auto-generated from name and type.

**Source:** `src/handlers/common/low/handleActivateObject.ts`

**Parameters:**
- `objects` (array, optional) - Array of objects to activate. Each object must have 

---

<a id="checkobjectlow-low-level-common"></a>
#### CheckObjectLow (Low-Level / Common)
**Description:** [low-level] Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/common/low/handleCheckObject.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM)
- `object_type` (string, required) - Object type
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 

---

<a id="deleteobjectlow-low-level-common"></a>
#### DeleteObjectLow (Low-Level / Common)
**Description:** [low-level] Delete an ABAP object via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/common/low/handleDeleteObject.ts`

**Parameters:**
- `function_group_name` (string, optional) - Required only for function_module type
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS)
- `object_type` (string, required) - Object type (class/program/interface/function_group/function_module/table/structure/view/domain/data_element/behavior_definition/metadata_extension)
- `transport_request` (string, optional) - Transport request number

---

<a id="lockobjectlow-low-level-common"></a>
#### LockObjectLow (Low-Level / Common)
**Description:** [low-level] Lock an ABAP object for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/common/low/handleLockObject.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME
- `object_type` (string, required) - Object type
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, optional) - Super package (required for package locking)

---

<a id="unlockobjectlow-low-level-common"></a>
#### UnlockObjectLow (Low-Level / Common)
**Description:** [low-level] Unlock an ABAP object after modification. Must use the same session_id and lock_handle from the LockObject operation.

**Source:** `src/handlers/common/low/handleUnlockObject.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject operation
- `object_name` (string, required) - Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME
- `object_type` (string, required) - Object type
- `session_id` (string, required) - Session ID from LockObject operation. Must be the same session.
- `session_state` (object, optional) - Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validateobjectlow-low-level-common"></a>
#### ValidateObjectLow (Low-Level / Common)
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

<a id="low-level-data-element"></a>
### Low-Level / Data Element

<a id="activatedataelementlow-low-level-data-element"></a>
#### ActivateDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Activate an ABAP data element. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleActivateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZDT_MY_ELEMENT).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkdataelementlow-low-level-data-element"></a>
#### CheckDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleCheckDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createdataelementlow-low-level-data-element"></a>
#### CreateDataElementLow (Low-Level / Data Element)
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

<a id="deletedataelementlow-low-level-data-element"></a>
#### DeleteDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Delete an ABAP data element from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/data_element/low/handleDeleteDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockdataelementlow-low-level-data-element"></a>
#### LockDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Lock an ABAP data element for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/data_element/low/handleLockDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockdataelementlow-low-level-data-element"></a>
#### UnlockDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Unlock an ABAP data element after modification. Must use the same session_id and lock_handle from LockDataElement operation.

**Source:** `src/handlers/data_element/low/handleUnlockDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDataElement operation.
- `session_id` (string, required) - Session ID from LockDataElement operation. Must be the same as used in LockDataElement.
- `session_state` (object, optional) - Session state from LockDataElement (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatedataelementlow-low-level-data-element"></a>
#### UpdateDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Update properties of an existing ABAP data element. Requires lock handle from LockObject. - use UpdateDataElement (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/data_element/low/handleUpdateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZOK_E_TEST_0001). Data element must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `properties` (object, required) - Data element properties object. Can include: description, type_name, type_kind, data_type, field_label_short, field_label_medium, field_label_long, etc.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validatedataelementlow-low-level-data-element"></a>
#### ValidateDataElementLow (Low-Level / Data Element)
**Description:** [low-level] Validate an ABAP data element name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/data_element/low/handleValidateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - DataElement name to validate (e.g., Z_MY_PROGRAM).
- `description` (string, required) - DataElement description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-ddlx"></a>
### Low-Level / Ddlx

<a id="activatemetadataextensionlow-low-level-ddlx"></a>
#### ActivateMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Activate an ABAP metadata extension. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleActivateMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - Metadata extension name (e.g., ZC_MY_EXTENSION).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkmetadataextensionlow-low-level-ddlx"></a>
#### CheckMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Perform syntax check on an ABAP metadata extension. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleCheckMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createmetadataextensionlow-low-level-ddlx"></a>
#### CreateMetadataExtensionLow (Low-Level / Ddlx)
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

<a id="deletemetadataextensionlow-low-level-ddlx"></a>
#### DeleteMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Delete an ABAP metadata extension from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/ddlx/low/handleDeleteMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - MetadataExtension name (e.g., ZI_MY_DDLX).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockmetadataextensionlow-low-level-ddlx"></a>
#### LockMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Lock an ABAP metadata extension for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/ddlx/low/handleLockMetadataExtension.ts`

**Parameters:**
- `objName` (string, optional) - MetadataExtension name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockmetadataextensionlow-low-level-ddlx"></a>
#### UnlockMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Unlock an ABAP metadata extension after modification. Must use the same session_id and lock_handle from LockMetadataExtension operation.

**Source:** `src/handlers/ddlx/low/handleUnlockMetadataExtension.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockMetadataExtension operation.
- `objName` (string, optional) - MetadataExtension name (e.g., Z_MY_PROGRAM).
- `session_id` (string, required) - Session ID from LockMetadataExtension operation. Must be the same as used in LockMetadataExtension.
- `session_state` (object, optional) - Session state from LockMetadataExtension (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatemetadataextensionlow-low-level-ddlx"></a>
#### UpdateMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Update source code of an existing ABAP metadata extension. Requires lock handle from LockObject. - use UpdateMetadataExtension (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/ddlx/low/handleUpdateMetadataExtension.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `name` (string, required) - Metadata extension name (e.g., ZOK_C_TEST_0001). Metadata extension must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete metadata extension source code.

---

<a id="validatemetadataextensionlow-low-level-ddlx"></a>
#### ValidateMetadataExtensionLow (Low-Level / Ddlx)
**Description:** [low-level] Validate an ABAP metadata extension name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/ddlx/low/handleValidateMetadataExtension.ts`

**Parameters:**
- `objName` (string, optional) - MetadataExtension name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-domain"></a>
### Low-Level / Domain

<a id="activatedomainlow-low-level-domain"></a>
#### ActivateDomainLow (Low-Level / Domain)
**Description:** [low-level] Activate an ABAP domain. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleActivateDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., ZDM_MY_DOMAIN).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkdomainlow-low-level-domain"></a>
#### CheckDomainLow (Low-Level / Domain)
**Description:** [low-level] Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleCheckDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createdomainlow-low-level-domain"></a>
#### CreateDomainLow (Low-Level / Domain)
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

<a id="deletedomainlow-low-level-domain"></a>
#### DeleteDomainLow (Low-Level / Domain)
**Description:** [low-level] Delete an ABAP domain from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/domain/low/handleDeleteDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockdomainlow-low-level-domain"></a>
#### LockDomainLow (Low-Level / Domain)
**Description:** [low-level] Lock an ABAP domain for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/domain/low/handleLockDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockdomainlow-low-level-domain"></a>
#### UnlockDomainLow (Low-Level / Domain)
**Description:** [low-level] Unlock an ABAP domain after modification. Must use the same session_id and lock_handle from LockDomain operation.

**Source:** `src/handlers/domain/low/handleUnlockDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockDomain operation.
- `session_id` (string, required) - Session ID from LockDomain operation. Must be the same as used in LockDomain.
- `session_state` (object, optional) - Session state from LockDomain (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatedomainlow-low-level-domain"></a>
#### UpdateDomainLow (Low-Level / Domain)
**Description:** [low-level] Update properties of an existing ABAP domain. Requires lock handle from LockObject. - use UpdateDomain (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/domain/low/handleUpdateDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., ZOK_D_TEST_0001). Domain must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `properties` (object, required) - Domain properties object. Can include: description, datatype, length, decimals, conversion_exit, lowercase, sign_exists, value_table, fixed_values, etc.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validatedomainlow-low-level-domain"></a>
#### ValidateDomainLow (Low-Level / Domain)
**Description:** [low-level] Validate an ABAP domain name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/domain/low/handleValidateDomain.ts`

**Parameters:**
- `description` (string, required) - Domain description (required for validation).
- `domain_name` (string, required) - Domain name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (required for validation).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-function"></a>
### Low-Level / Function

<a id="activatefunctiongrouplow-low-level-function"></a>
#### ActivateFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Activate an ABAP function group. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleActivateFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FG_TEST).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="activatefunctionmodulelow-low-level-function"></a>
#### ActivateFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Activate an ABAP function module. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleActivateFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FG_TEST).
- `function_module_name` (string, required) - Function module name (e.g., Z_FM_TEST).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkfunctiongrouplow-low-level-function"></a>
#### CheckFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleCheckFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkfunctionmodulelow-low-level-function"></a>
#### CheckFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleCheckFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., Z_FUGR_TEST_0001)
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 

---

<a id="createfunctiongrouplow-low-level-function"></a>
#### CreateFunctionGroupLow (Low-Level / Function)
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

<a id="createfunctionmodulelow-low-level-function"></a>
#### CreateFunctionModuleLow (Low-Level / Function)
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

<a id="deletefunctiongrouplow-low-level-function"></a>
#### DeleteFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Delete an ABAP function group from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/function/low/handleDeleteFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="deletefunctionmodulelow-low-level-function"></a>
#### DeleteFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Delete an ABAP function module from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/function/low/handleDeleteFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockfunctiongrouplow-low-level-function"></a>
#### LockFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Lock an ABAP function group for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/function/low/handleLockFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="lockfunctionmodulelow-low-level-function"></a>
#### LockFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Lock an ABAP function module for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/function/low/handleLockFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockfunctiongrouplow-low-level-function"></a>
#### UnlockFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Unlock an ABAP function group after modification. Must use the same session_id and lock_handle from LockFunctionGroup operation.

**Source:** `src/handlers/function/low/handleUnlockFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockFunctionGroup operation.
- `session_id` (string, required) - Session ID from LockFunctionGroup operation. Must be the same as used in LockFunctionGroup.
- `session_state` (object, optional) - Session state from LockFunctionGroup (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockfunctionmodulelow-low-level-function"></a>
#### UnlockFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Unlock an ABAP function module after modification. Must use the same session_id and lock_handle from LockFunctionModule operation.

**Source:** `src/handlers/function/low/handleUnlockFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFG_MY_GROUP).
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `lock_handle` (string, required) - Lock handle from LockFunctionModule operation.
- `session_id` (string, required) - Session ID from LockFunctionModule operation. Must be the same as used in LockFunctionModule.
- `session_state` (object, optional) - Session state from LockFunctionModule (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updatefunctionmodulelow-low-level-function"></a>
#### UpdateFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Update source code of an existing ABAP function module. Requires lock handle from LockObject and function group name. - use UpdateFunctionModule (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/function/low/handleUpdateFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module (e.g., Z_TEST_FG).
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM). Function module must already exist.
- `lock_handle` (string, required) - Lock handle from LockFunctionModule. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP function module source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects locked in a request.

---

<a id="validatefunctiongrouplow-low-level-function"></a>
#### ValidateFunctionGroupLow (Low-Level / Function)
**Description:** [low-level] Validate an ABAP function group name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleValidateFunctionGroup.ts`

**Parameters:**
- `description` (string, optional) - Optional description for validation
- `function_group_name` (string, required) - FunctionGroup name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, optional) - Package name for validation (optional but recommended).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="validatefunctionmodulelow-low-level-function"></a>
#### ValidateFunctionModuleLow (Low-Level / Function)
**Description:** [low-level] Validate an ABAP function module name before creation. Checks if the name is valid and available. Requires function group name. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/function/low/handleValidateFunctionModule.ts`

**Parameters:**
- `description` (string, optional) - Optional description for validation
- `function_group_name` (string, required) - Function group name (e.g., Z_FUGR_TEST_0001)
- `function_module_name` (string, required) - Function module name to validate (e.g., Z_TEST_FM)
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-interface"></a>
### Low-Level / Interface

<a id="activateinterfacelow-low-level-interface"></a>
#### ActivateInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Activate an ABAP interface. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleActivateInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkinterfacelow-low-level-interface"></a>
#### CheckInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleCheckInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createinterfacelow-low-level-interface"></a>
#### CreateInterfaceLow (Low-Level / Interface)
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

<a id="deleteinterfacelow-low-level-interface"></a>
#### DeleteInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Delete an ABAP interface from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/interface/low/handleDeleteInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockinterfacelow-low-level-interface"></a>
#### LockInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Lock an ABAP interface for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/interface/low/handleLockInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockinterfacelow-low-level-interface"></a>
#### UnlockInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Unlock an ABAP interface after modification. Must use the same session_id and lock_handle from LockInterface operation.

**Source:** `src/handlers/interface/low/handleUnlockInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_PROGRAM).
- `lock_handle` (string, required) - Lock handle from LockInterface operation.
- `session_id` (string, required) - Session ID from LockInterface operation. Must be the same as used in LockInterface.
- `session_state` (object, optional) - Session state from LockInterface (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updateinterfacelow-low-level-interface"></a>
#### UpdateInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Update source code of an existing ABAP interface. Requires lock handle from LockObject. - use UpdateInterface (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/interface/low/handleUpdateInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_TEST_INTERFACE). Interface must already exist.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP interface source code.

---

<a id="validateinterfacelow-low-level-interface"></a>
#### ValidateInterfaceLow (Low-Level / Interface)
**Description:** [low-level] Validate an ABAP interface name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/interface/low/handleValidateInterface.ts`

**Parameters:**
- `description` (string, required) - Interface description. Required for validation.
- `interface_name` (string, required) - Interface name to validate (e.g., Z_MY_PROGRAM).
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-package"></a>
### Low-Level / Package

<a id="checkpackagelow-low-level-package"></a>
#### CheckPackageLow (Low-Level / Package)
**Description:** [low-level] Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/package/low/handleCheckPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.

---

<a id="createpackagelow-low-level-package"></a>
#### CreatePackageLow (Low-Level / Package)
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

<a id="deletepackagelow-low-level-package"></a>
#### DeletePackageLow (Low-Level / Package)
**Description:** [low-level] Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/package/low/handleDeletePackage.ts`

**Parameters:**
- `connection_config` (object, optional) - Optional SAP connection config to create a fresh connection for deletion. Useful when the existing connection config is unavailable.
- `force_new_connection` (boolean, optional) - Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false.
- `package_name` (string, required) - Package name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockpackagelow-low-level-package"></a>
#### LockPackageLow (Low-Level / Package)
**Description:** [low-level] Lock an ABAP package for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id. Requires super_package.

**Source:** `src/handlers/package/low/handleLockPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name (e.g., ZOK_PACKAGE). Required.

---

<a id="unlockpackagelow-low-level-package"></a>
#### UnlockPackageLow (Low-Level / Package)
**Description:** [low-level] Unlock an ABAP package after modification. Requires lock handle from LockObject and superPackage. - must use the same session_id and lock_handle from LockObject.

**Source:** `src/handlers/package/low/handleUnlockPackage.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject operation
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_0002). Package must already exist.
- `session_id` (string, required) - Session ID from LockObject operation. Must be the same as used in LockObject.
- `session_state` (object, optional) - Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `super_package` (string, required) - Super package (parent package) name. Required for package operations.

---

<a id="updatepackagelow-low-level-package"></a>
#### UpdatePackageLow (Low-Level / Package)
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

<a id="validatepackagelow-low-level-package"></a>
#### ValidatePackageLow (Low-Level / Package)
**Description:** [low-level] Validate an ABAP package name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/package/low/handleValidatePackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-program"></a>
### Low-Level / Program

<a id="activateprogramlow-low-level-program"></a>
#### ActivateProgramLow (Low-Level / Program)
**Description:** [low-level] Activate an ABAP program. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleActivateProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="checkprogramlow-low-level-program"></a>
#### CheckProgramLow (Low-Level / Program)
**Description:** [low-level] Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleCheckProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="createprogramlow-low-level-program"></a>
#### CreateProgramLow (Low-Level / Program)
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

<a id="deleteprogramlow-low-level-program"></a>
#### DeleteProgramLow (Low-Level / Program)
**Description:** [low-level] Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/program/low/handleDeleteProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockprogramlow-low-level-program"></a>
#### LockProgramLow (Low-Level / Program)
**Description:** [low-level] Lock an ABAP program for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/program/low/handleLockProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="unlockprogramlow-low-level-program"></a>
#### UnlockProgramLow (Low-Level / Program)
**Description:** [low-level] Unlock an ABAP program after modification. Must use the same session_id and lock_handle from LockProgram operation.

**Source:** `src/handlers/program/low/handleUnlockProgram.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockProgram operation.
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `session_id` (string, required) - Session ID from LockProgram operation. Must be the same as used in LockProgram.
- `session_state` (object, optional) - Session state from LockProgram (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="updateprogramlow-low-level-program"></a>
#### UpdateProgramLow (Low-Level / Program)
**Description:** [low-level] Update source code of an existing ABAP program. Requires lock handle from LockObject. - use UpdateProgram (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/program/low/handleUpdateProgram.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM). Program must already exist.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `source_code` (string, required) - Complete ABAP program source code.

---

<a id="validateprogramlow-low-level-program"></a>
#### ValidateProgramLow (Low-Level / Program)
**Description:** [low-level] Validate an ABAP program name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/program/low/handleValidateProgram.ts`

**Parameters:**
- `description` (string, required) - Program description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `program_name` (string, required) - Program name to validate (e.g., Z_MY_PROGRAM).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="low-level-structure"></a>
### Low-Level / Structure

<a id="activatestructurelow-low-level-structure"></a>
#### ActivateStructureLow (Low-Level / Structure)
**Description:** [low-level] Activate an ABAP structure. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/structure/low/handleActivateStructure.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., ZST_MY_STRUCTURE).

---

<a id="checkstructurelow-low-level-structure"></a>
#### CheckStructureLow (Low-Level / Structure)
**Description:** [low-level] Perform syntax check on an ABAP structure. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_code is provided, validates new/unsaved code (will be base64 encoded in request).

**Source:** `src/handlers/structure/low/handleCheckStructure.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).
- `version` (string, optional) - Version to check: 

---

<a id="createstructurelow-low-level-structure"></a>
#### CreateStructureLow (Low-Level / Structure)
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

<a id="deletestructurelow-low-level-structure"></a>
#### DeleteStructureLow (Low-Level / Structure)
**Description:** [low-level] Delete an ABAP structure from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/structure/low/handleDeleteStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="lockstructurelow-low-level-structure"></a>
#### LockStructureLow (Low-Level / Structure)
**Description:** [low-level] Lock an ABAP structure for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/structure/low/handleLockStructure.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).

---

<a id="unlockstructurelow-low-level-structure"></a>
#### UnlockStructureLow (Low-Level / Structure)
**Description:** [low-level] Unlock an ABAP structure after modification. Must use the same session_id and lock_handle from LockStructure operation.

**Source:** `src/handlers/structure/low/handleUnlockStructure.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockStructure operation.
- `session_id` (string, required) - Session ID from LockStructure operation. Must be the same as used in LockStructure.
- `session_state` (object, optional) - Session state from LockStructure (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., Z_MY_PROGRAM).

---

<a id="updatestructurelow-low-level-structure"></a>
#### UpdateStructureLow (Low-Level / Structure)
**Description:** [low-level] Update DDL source code of an existing ABAP structure. Requires lock handle from LockObject. - use UpdateStructureSource for full workflow with lock/unlock.

**Source:** `src/handlers/structure/low/handleUpdateStructure.ts`

**Parameters:**
- `ddl_code` (string, required) - Complete DDL source code for the structure definition.
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.

---

<a id="validatestructurelow-low-level-structure"></a>
#### ValidateStructureLow (Low-Level / Structure)
**Description:** [low-level] Validate an ABAP structure name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/structure/low/handleValidateStructure.ts`

**Parameters:**
- `description` (string, required) - Structure description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `structure_name` (string, required) - Structure name to validate (e.g., Z_MY_PROGRAM).

---

<a id="low-level-system"></a>
### Low-Level / System

<a id="getnodestructurelow-low-level-system"></a>
#### GetNodeStructureLow (Low-Level / System)
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

<a id="getobjectstructurelow-low-level-system"></a>
#### GetObjectStructureLow (Low-Level / System)
**Description:** [low-level] Retrieve ADT object structure as compact JSON tree. Returns XML response with object structure tree. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/system/low/handleGetObjectStructure.ts`

**Parameters:**
- `object_name` (string, required) - Object name (e.g., 
- `object_type` (string, required) - Object type (e.g., 
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.

---

<a id="getvirtualfolderslow-low-level-system"></a>
#### GetVirtualFoldersLow (Low-Level / System)
**Description:** [low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.

**Source:** `src/handlers/system/low/handleGetVirtualFolders.ts`

**Parameters:**
- `object_search_pattern` (string, optional (default: *)) - Object search pattern (e.g., 
- `preselection` (array, optional) - Optional preselection filters (facet-value pairs for filtering)
- `values` (array, required) - Array of facet values to filter by

---

<a id="low-level-table"></a>
### Low-Level / Table

<a id="activatetablelow-low-level-table"></a>
#### ActivateTableLow (Low-Level / Table)
**Description:** [low-level] Activate an ABAP table. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/table/low/handleActivateTable.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., ZTB_MY_TABLE).

---

<a id="checktablelow-low-level-table"></a>
#### CheckTableLow (Low-Level / Table)
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

<a id="createtablelow-low-level-table"></a>
#### CreateTableLow (Low-Level / Table)
**Description:** [low-level] Create a new ABAP table. - use CreateTable (high-level) for full workflow with validation, lock, update, check, unlock, and activate.

**Source:** `src/handlers/table/low/handleCreateTable.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects).
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., ZT_TEST_001). Must follow SAP naming conventions.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletetablelow-low-level-table"></a>
#### DeleteTableLow (Low-Level / Table)
**Description:** [low-level] Delete an ABAP table from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/table/low/handleDeleteTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="locktablelow-low-level-table"></a>
#### LockTableLow (Low-Level / Table)
**Description:** [low-level] Lock an ABAP table for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/table/low/handleLockTable.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).

---

<a id="unlocktablelow-low-level-table"></a>
#### UnlockTableLow (Low-Level / Table)
**Description:** [low-level] Unlock an ABAP table after modification. Must use the same session_id and lock_handle from LockTable operation.

**Source:** `src/handlers/table/low/handleUnlockTable.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockTable operation.
- `session_id` (string, required) - Session ID from LockTable operation. Must be the same as used in LockTable.
- `session_state` (object, optional) - Session state from LockTable (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name (e.g., Z_MY_PROGRAM).

---

<a id="updatetablelow-low-level-table"></a>
#### UpdateTableLow (Low-Level / Table)
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

<a id="validatetablelow-low-level-table"></a>
#### ValidateTableLow (Low-Level / Table)
**Description:** [low-level] Validate an ABAP table name before creation. Checks if the name is valid and available. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/table/low/handleValidateTable.ts`

**Parameters:**
- `description` (string, required) - Table description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `table_name` (string, required) - Table name to validate (e.g., Z_MY_TABLE)

---

<a id="low-level-transport"></a>
### Low-Level / Transport

<a id="createtransportlow-low-level-transport"></a>
#### CreateTransportLow (Low-Level / Transport)
**Description:** [low-level] Create a new ABAP transport request.

**Source:** `src/handlers/transport/low/handleCreateTransport.ts`

**Parameters:**
- `description` (string, required) - Transport request description.
- `transport_type` (string, optional (default: workbench').)) - Transport type: 

---

<a id="low-level-view"></a>
### Low-Level / View

<a id="activateviewlow-low-level-view"></a>
#### ActivateViewLow (Low-Level / View)
**Description:** [low-level] Activate an ABAP view (CDS view). Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/view/low/handleActivateView.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name (e.g., ZVW_MY_VIEW).

---

<a id="checkviewlow-low-level-view"></a>
#### CheckViewLow (Low-Level / View)
**Description:** [low-level] Perform syntax check on an ABAP view. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_source is provided, validates new/unsaved code (will be base64 encoded in request).

**Source:** `src/handlers/view/low/handleCheckView.ts`

**Parameters:**
- `ddl_source` (string, optional) - Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `version` (string, optional) - Version to check: 
- `view_name` (string, required) - View name (e.g., Z_MY_PROGRAM).

---

<a id="createviewlow-low-level-view"></a>
#### CreateViewLow (Low-Level / View)
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

<a id="deleteviewlow-low-level-view"></a>
#### DeleteViewLow (Low-Level / View)
**Description:** [low-level] Delete an ABAP view from the SAP system via ADT deletion API. Transport request optional for $TMP objects.

**Source:** `src/handlers/view/low/handleDeleteView.ts`

**Parameters:**
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).
- `view_name` (string, required) - View name (e.g., Z_MY_PROGRAM).

---

<a id="lockviewlow-low-level-view"></a>
#### LockViewLow (Low-Level / View)
**Description:** [low-level] Lock an ABAP view for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.

**Source:** `src/handlers/view/low/handleLockView.ts`

**Parameters:**
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name (e.g., Z_MY_PROGRAM).

---

<a id="unlockviewlow-low-level-view"></a>
#### UnlockViewLow (Low-Level / View)
**Description:** [low-level] Unlock an ABAP view after modification. Must use the same session_id and lock_handle from LockView operation.

**Source:** `src/handlers/view/low/handleUnlockView.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle from LockView operation.
- `session_id` (string, required) - Session ID from LockView operation. Must be the same as used in LockView.
- `session_state` (object, optional) - Session state from LockView (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name (e.g., Z_MY_PROGRAM).

---

<a id="updateviewlow-low-level-view"></a>
#### UpdateViewLow (Low-Level / View)
**Description:** [low-level] Update DDL source code of an existing CDS View or Classic View. Requires lock handle from LockObject. - use UpdateView (high-level) for full workflow with lock/unlock/activate.

**Source:** `src/handlers/view/low/handleUpdateView.ts`

**Parameters:**
- `ddl_source` (string, required) - Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 
- `lock_handle` (string, required) - Lock handle from LockObject. Required for update operation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name (e.g., ZOK_R_TEST_0002). View must already exist.

---

<a id="validateviewlow-low-level-view"></a>
#### ValidateViewLow (Low-Level / View)
**Description:** [low-level] Validate an ABAP view name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.

**Source:** `src/handlers/view/low/handleValidateView.ts`

**Parameters:**
- `description` (string, required) - View description. Required for validation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.
- `session_id` (string, optional) - Session ID from GetSession. If not provided, a new session will be created.
- `session_state` (object, optional) - Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.
- `view_name` (string, required) - View name to validate (e.g., Z_MY_PROGRAM).

---

*Last updated: 2026-02-15*
