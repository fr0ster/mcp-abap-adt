# High-Level Tools - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

- Level: High-Level
- Total tools: 177

## Navigation

- [High-Level Group](#high-level-group)
  - [Behavior Definition](#high-level-behavior-definition)
    - [CheckBehaviorDefinition](#checkbehaviordefinition-high-level-behavior-definition)
    - [CreateBehaviorDefinition](#createbehaviordefinition-high-level-behavior-definition)
    - [DeleteBehaviorDefinition](#deletebehaviordefinition-high-level-behavior-definition)
    - [GetBehaviorDefinition](#getbehaviordefinition-high-level-behavior-definition)
    - [UpdateBehaviorDefinition](#updatebehaviordefinition-high-level-behavior-definition)
  - [Behavior Implementation](#high-level-behavior-implementation)
    - [CreateBehaviorImplementation](#createbehaviorimplementation-high-level-behavior-implementation)
    - [DeleteBehaviorImplementation](#deletebehaviorimplementation-high-level-behavior-implementation)
    - [GetBehaviorImplementation](#getbehaviorimplementation-high-level-behavior-implementation)
    - [UpdateBehaviorImplementation](#updatebehaviorimplementation-high-level-behavior-implementation)
  - [Class](#high-level-class)
    - [CheckClass](#checkclass-high-level-class)
    - [CreateClass](#createclass-high-level-class)
    - [DeleteClass](#deleteclass-high-level-class)
    - [DeleteLocalDefinitions](#deletelocaldefinitions-high-level-class)
    - [DeleteLocalMacros](#deletelocalmacros-high-level-class)
    - [DeleteLocalTestClass](#deletelocaltestclass-high-level-class)
    - [DeleteLocalTypes](#deletelocaltypes-high-level-class)
    - [GetClass](#getclass-high-level-class)
    - [GetLocalDefinitions](#getlocaldefinitions-high-level-class)
    - [GetLocalMacros](#getlocalmacros-high-level-class)
    - [GetLocalTestClass](#getlocaltestclass-high-level-class)
    - [GetLocalTypes](#getlocaltypes-high-level-class)
    - [UpdateClass](#updateclass-high-level-class)
    - [UpdateLocalDefinitions](#updatelocaldefinitions-high-level-class)
    - [UpdateLocalMacros](#updatelocalmacros-high-level-class)
    - [UpdateLocalTestClass](#updatelocaltestclass-high-level-class)
    - [UpdateLocalTypes](#updatelocaltypes-high-level-class)
  - [Common](#high-level-common)
    - [ActivateObjects](#activateobjects-high-level-common)
    - [GetBehaviorDefinitionVersionDiff](#getbehaviordefinitionversiondiff-high-level-common)
    - [GetBehaviorDefinitionVersions](#getbehaviordefinitionversions-high-level-common)
    - [GetBehaviorDefinitionVersionSource](#getbehaviordefinitionversionsource-high-level-common)
    - [GetClassVersionDiff](#getclassversiondiff-high-level-common)
    - [GetClassVersions](#getclassversions-high-level-common)
    - [GetClassVersionSource](#getclassversionsource-high-level-common)
    - [GetDataElementVersionDiff](#getdataelementversiondiff-high-level-common)
    - [GetDataElementVersions](#getdataelementversions-high-level-common)
    - [GetDataElementVersionSource](#getdataelementversionsource-high-level-common)
    - [GetDdlVersionDiff](#getddlversiondiff-high-level-common)
    - [GetDdlVersions](#getddlversions-high-level-common)
    - [GetDdlVersionSource](#getddlversionsource-high-level-common)
    - [GetDomainVersionDiff](#getdomainversiondiff-high-level-common)
    - [GetDomainVersions](#getdomainversions-high-level-common)
    - [GetDomainVersionSource](#getdomainversionsource-high-level-common)
    - [GetFunctionGroupVersionDiff](#getfunctiongroupversiondiff-high-level-common)
    - [GetFunctionGroupVersions](#getfunctiongroupversions-high-level-common)
    - [GetFunctionGroupVersionSource](#getfunctiongroupversionsource-high-level-common)
    - [GetFunctionModuleVersionDiff](#getfunctionmoduleversiondiff-high-level-common)
    - [GetFunctionModuleVersions](#getfunctionmoduleversions-high-level-common)
    - [GetFunctionModuleVersionSource](#getfunctionmoduleversionsource-high-level-common)
    - [GetInterfaceVersionDiff](#getinterfaceversiondiff-high-level-common)
    - [GetInterfaceVersions](#getinterfaceversions-high-level-common)
    - [GetInterfaceVersionSource](#getinterfaceversionsource-high-level-common)
    - [GetMetadataExtensionVersionDiff](#getmetadataextensionversiondiff-high-level-common)
    - [GetMetadataExtensionVersions](#getmetadataextensionversions-high-level-common)
    - [GetMetadataExtensionVersionSource](#getmetadataextensionversionsource-high-level-common)
    - [GetPackageVersionDiff](#getpackageversiondiff-high-level-common)
    - [GetPackageVersions](#getpackageversions-high-level-common)
    - [GetPackageVersionSource](#getpackageversionsource-high-level-common)
    - [GetProgramVersionDiff](#getprogramversiondiff-high-level-common)
    - [GetProgramVersions](#getprogramversions-high-level-common)
    - [GetProgramVersionSource](#getprogramversionsource-high-level-common)
    - [GetStructureVersionDiff](#getstructureversiondiff-high-level-common)
    - [GetStructureVersions](#getstructureversions-high-level-common)
    - [GetStructureVersionSource](#getstructureversionsource-high-level-common)
    - [GetTableVersionDiff](#gettableversiondiff-high-level-common)
    - [GetTableVersions](#gettableversions-high-level-common)
    - [GetTableVersionSource](#gettableversionsource-high-level-common)
  - [Compact](#high-level-compact)
    - [HandlerActivate](#handleractivate-high-level-compact)
    - [HandlerCdsUnitTestResult](#handlercdsunittestresult-high-level-compact)
    - [HandlerCdsUnitTestStatus](#handlercdsunitteststatus-high-level-compact)
    - [HandlerCheckRun](#handlercheckrun-high-level-compact)
    - [HandlerCreate](#handlercreate-high-level-compact)
    - [HandlerDelete](#handlerdelete-high-level-compact)
    - [HandlerDumpList](#handlerdumplist-high-level-compact)
    - [HandlerDumpView](#handlerdumpview-high-level-compact)
    - [HandlerGet](#handlerget-high-level-compact)
    - [HandlerLock](#handlerlock-high-level-compact)
    - [HandlerProfileList](#handlerprofilelist-high-level-compact)
    - [HandlerProfileRun](#handlerprofilerun-high-level-compact)
    - [HandlerProfileView](#handlerprofileview-high-level-compact)
    - [HandlerServiceBindingListTypes](#handlerservicebindinglisttypes-high-level-compact)
    - [HandlerServiceBindingValidate](#handlerservicebindingvalidate-high-level-compact)
    - [HandlerTransportCreate](#handlertransportcreate-high-level-compact)
    - [HandlerUnitTestResult](#handlerunittestresult-high-level-compact)
    - [HandlerUnitTestRun](#handlerunittestrun-high-level-compact)
    - [HandlerUnitTestStatus](#handlerunitteststatus-high-level-compact)
    - [HandlerUnlock](#handlerunlock-high-level-compact)
    - [HandlerUpdate](#handlerupdate-high-level-compact)
    - [HandlerValidate](#handlervalidate-high-level-compact)
  - [Data Element](#high-level-data-element)
    - [CheckDataElement](#checkdataelement-high-level-data-element)
    - [CreateDataElement](#createdataelement-high-level-data-element)
    - [DeleteDataElement](#deletedataelement-high-level-data-element)
    - [GetDataElement](#getdataelement-high-level-data-element)
    - [UpdateDataElement](#updatedataelement-high-level-data-element)
  - [Ddl](#high-level-ddl)
    - [CheckDdl](#checkddl-high-level-ddl)
    - [CreateDdl](#createddl-high-level-ddl)
    - [DeleteDdl](#deleteddl-high-level-ddl)
    - [GetDdl](#getddl-high-level-ddl)
    - [UpdateDdl](#updateddl-high-level-ddl)
  - [Ddlx](#high-level-ddlx)
    - [CheckMetadataExtension](#checkmetadataextension-high-level-ddlx)
    - [CreateMetadataExtension](#createmetadataextension-high-level-ddlx)
    - [UpdateMetadataExtension](#updatemetadataextension-high-level-ddlx)
  - [Domain](#high-level-domain)
    - [CheckDomain](#checkdomain-high-level-domain)
    - [CreateDomain](#createdomain-high-level-domain)
    - [DeleteDomain](#deletedomain-high-level-domain)
    - [GetDomain](#getdomain-high-level-domain)
    - [UpdateDomain](#updatedomain-high-level-domain)
  - [Function](#high-level-function)
    - [CheckFunctionGroup](#checkfunctiongroup-high-level-function)
    - [CheckFunctionModule](#checkfunctionmodule-high-level-function)
    - [CreateFunctionGroup](#createfunctiongroup-high-level-function)
    - [CreateFunctionModule](#createfunctionmodule-high-level-function)
    - [UpdateFunctionGroup](#updatefunctiongroup-high-level-function)
    - [UpdateFunctionModule](#updatefunctionmodule-high-level-function)
  - [Function Group](#high-level-function-group)
    - [DeleteFunctionGroup](#deletefunctiongroup-high-level-function-group)
    - [GetFunctionGroup](#getfunctiongroup-high-level-function-group)
  - [Function Include](#high-level-function-include)
    - [CreateFunctionInclude](#createfunctioninclude-high-level-function-include)
    - [DeleteFunctionInclude](#deletefunctioninclude-high-level-function-include)
    - [UpdateFunctionInclude](#updatefunctioninclude-high-level-function-include)
  - [Function Module](#high-level-function-module)
    - [DeleteFunctionModule](#deletefunctionmodule-high-level-function-module)
    - [GetFunctionModule](#getfunctionmodule-high-level-function-module)
  - [Interface](#high-level-interface)
    - [CheckInterface](#checkinterface-high-level-interface)
    - [CreateInterface](#createinterface-high-level-interface)
    - [DeleteInterface](#deleteinterface-high-level-interface)
    - [GetInterface](#getinterface-high-level-interface)
    - [UpdateInterface](#updateinterface-high-level-interface)
  - [Message Class](#high-level-message-class)
    - [CreateMessageClass](#createmessageclass-high-level-message-class)
    - [CreateMessageClassMessage](#createmessageclassmessage-high-level-message-class)
    - [DeleteMessageClass](#deletemessageclass-high-level-message-class)
    - [DeleteMessageClassMessage](#deletemessageclassmessage-high-level-message-class)
    - [GetMessageClass](#getmessageclass-high-level-message-class)
    - [GetMessageClassMessage](#getmessageclassmessage-high-level-message-class)
    - [UpdateMessageClass](#updatemessageclass-high-level-message-class)
    - [UpdateMessageClassMessage](#updatemessageclassmessage-high-level-message-class)
  - [Metadata Extension](#high-level-metadata-extension)
    - [DeleteMetadataExtension](#deletemetadataextension-high-level-metadata-extension)
    - [GetMetadataExtension](#getmetadataextension-high-level-metadata-extension)
  - [Package](#high-level-package)
    - [CheckPackage](#checkpackage-high-level-package)
    - [CreatePackage](#createpackage-high-level-package)
    - [GetPackage](#getpackage-high-level-package)
  - [Program](#high-level-program)
    - [CheckProgram](#checkprogram-high-level-program)
    - [CreateProgram](#createprogram-high-level-program)
    - [DeleteProgram](#deleteprogram-high-level-program)
    - [GetProgram](#getprogram-high-level-program)
    - [UpdateProgram](#updateprogram-high-level-program)
  - [Service Binding](#high-level-service-binding)
    - [CreateServiceBinding](#createservicebinding-high-level-service-binding)
    - [DeleteServiceBinding](#deleteservicebinding-high-level-service-binding)
    - [GetServiceBinding](#getservicebinding-high-level-service-binding)
    - [ListServiceBindingTypes](#listservicebindingtypes-high-level-service-binding)
    - [UpdateServiceBinding](#updateservicebinding-high-level-service-binding)
    - [ValidateServiceBinding](#validateservicebinding-high-level-service-binding)
  - [Service Definition](#high-level-service-definition)
    - [CreateServiceDefinition](#createservicedefinition-high-level-service-definition)
    - [DeleteServiceDefinition](#deleteservicedefinition-high-level-service-definition)
    - [GetServiceDefinition](#getservicedefinition-high-level-service-definition)
    - [UpdateServiceDefinition](#updateservicedefinition-high-level-service-definition)
  - [Structure](#high-level-structure)
    - [CheckStructure](#checkstructure-high-level-structure)
    - [CreateStructure](#createstructure-high-level-structure)
    - [DeleteStructure](#deletestructure-high-level-structure)
    - [GetStructure](#getstructure-high-level-structure)
    - [UpdateStructure](#updatestructure-high-level-structure)
  - [System](#high-level-system)
    - [GetPackageTree](#getpackagetree-high-level-system)
  - [Table](#high-level-table)
    - [CheckTable](#checktable-high-level-table)
    - [CreateTable](#createtable-high-level-table)
    - [DeleteTable](#deletetable-high-level-table)
    - [GetTable](#gettable-high-level-table)
    - [UpdateTable](#updatetable-high-level-table)
  - [Transport](#high-level-transport)
    - [CreateTransport](#createtransport-high-level-transport)
  - [Unit Test](#high-level-unit-test)
    - [CreateCdsUnitTest](#createcdsunittest-high-level-unit-test)
    - [CreateUnitTest](#createunittest-high-level-unit-test)
    - [DeleteCdsUnitTest](#deletecdsunittest-high-level-unit-test)
    - [DeleteUnitTest](#deleteunittest-high-level-unit-test)
    - [GetCdsUnitTest](#getcdsunittest-high-level-unit-test)
    - [GetCdsUnitTestResult](#getcdsunittestresult-high-level-unit-test)
    - [GetCdsUnitTestStatus](#getcdsunitteststatus-high-level-unit-test)
    - [GetUnitTest](#getunittest-high-level-unit-test)
    - [GetUnitTestResult](#getunittestresult-high-level-unit-test)
    - [GetUnitTestStatus](#getunitteststatus-high-level-unit-test)
    - [RunUnitTest](#rununittest-high-level-unit-test)
    - [UpdateCdsUnitTest](#updatecdsunittest-high-level-unit-test)
    - [UpdateUnitTest](#updateunittest-high-level-unit-test)

---

<a id="high-level-group"></a>
## High-Level Group

<a id="high-level-behavior-definition"></a>
### High-Level / Behavior Definition

<a id="checkbehaviordefinition-high-level-behavior-definition"></a>
#### CheckBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Perform syntax check on an ABAP behavior definition (BDEF). Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/behavior_definition/high/handleCheckBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name (e.g., ZI_MY_BDEF).

---

<a id="createbehaviordefinition-high-level-behavior-definition"></a>
#### CreateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Operation: Create. Subject: BehaviorDefinition. Will be useful for creating behavior definition. Create a new ABAP Behavior Definition (BDEF) in SAP system. Creates the behavior definition object in initial state.

**Source:** `src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `implementation_type` (string, required) - Implementation type: 'Managed', 'Unmanaged', 'Abstract', 'Projection'
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `name` (string, required) - Behavior Definition name (usually same as Root Entity name)
- `package_name` (string, required) - Package name
- `root_entity` (string, required) - Root Entity name (CDS View name)
- `transport_request` (string, optional) - Transport request number

---

<a id="deletebehaviordefinition-high-level-behavior-definition"></a>
#### DeleteBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Delete an ABAP behavior definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_definition/high/handleDeleteBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getbehaviordefinition-high-level-behavior-definition"></a>
#### GetBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Retrieve ABAP behavior definition definition. Supports reading active or inactive version.

**Source:** `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name (e.g., Z_MY_BEHAVIORDEFINITION).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatebehaviordefinition-high-level-behavior-definition"></a>
#### UpdateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Operation: Update, Create. Subject: BehaviorDefinition. Will be useful for updating or creating behavior definition. Update source code of an existing ABAP Behavior Definition (BDEF). Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally (not recommended for stateful flows).
- `name` (string, required) - Behavior Definition name
- `source_code` (string, required) - New source code
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="high-level-behavior-implementation"></a>
### High-Level / Behavior Implementation

<a id="createbehaviorimplementation-high-level-behavior-implementation"></a>
#### CreateBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Create a new ABAP behavior implementation class for a behavior definition. Creates the object in initial state. Use UpdateBehaviorImplementation to set implementation code afterwards.

**Source:** `src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation.ts`

**Parameters:**
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). The behavior definition must exist.
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions (typically starts with ZBP_ for behavior implementations).
- `description` (string, optional) - Class description. If not provided, class_name will be used.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletebehaviorimplementation-high-level-behavior-implementation"></a>
#### DeleteBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Delete an ABAP behavior implementation from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getbehaviorimplementation-high-level-behavior-implementation"></a>
#### GetBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Retrieve ABAP behavior implementation definition. Supports reading active or inactive version.

**Source:** `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatebehaviorimplementation-high-level-behavior-implementation"></a>
#### UpdateBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Update source code of an existing ABAP behavior implementation class. Updates both main source (with FOR BEHAVIOR OF clause) and implementations include. Uses stateful session with proper lock/unlock mechanism.

**Source:** `src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate behavior implementation after update. Default: true.
- `behavior_definition` (string, required) - Behavior Definition name (e.g., ZI_MY_ENTITY). Must match the behavior definition used when creating the class.
- `class_name` (string, required) - Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must exist in the system.
- `implementation_code` (string, required) - Implementation code for the implementations include. Contains the actual behavior implementation methods.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-class"></a>
### High-Level / Class

<a id="checkclass-high-level-class"></a>
#### CheckClass (High-Level / Class)
**Description:** Perform syntax check on an ABAP class. Can check existing class (active/inactive) or validate hypothetical source code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/class/high/handleCheckClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `version` (string, optional) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active.

---

<a id="createclass-high-level-class"></a>
#### CreateClass (High-Level / Class)
**Description:** Operation: Create. Subject: Class. Will be useful for creating class. Create a new ABAP class in SAP system. Creates the class object in initial state.

**Source:** `src/handlers/class/high/handleCreateClass.ts`

**Parameters:**
- `abstract` (boolean, optional) - Mark class as abstract. Default: false
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001).
- `create_protected` (boolean, optional) - Protected constructor. Default: false
- `description` (string, optional) - Class description (defaults to class_name).
- `final` (boolean, optional) - Mark class as final. Default: false
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP).
- `superclass` (string, optional) - Optional superclass name.
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="deleteclass-high-level-class"></a>
#### DeleteClass (High-Level / Class)
**Description:** Delete an ABAP class from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/class/high/handleDeleteClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="deletelocaldefinitions-high-level-class"></a>
#### DeleteLocalDefinitions (High-Level / Class)
**Description:** Delete local definitions from an ABAP class by clearing the definitions include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleDeleteLocalDefinitions.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

<a id="deletelocalmacros-high-level-class"></a>
#### DeleteLocalMacros (High-Level / Class)
**Description:** Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleDeleteLocalMacros.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

<a id="deletelocaltestclass-high-level-class"></a>
#### DeleteLocalTestClass (High-Level / Class)
**Description:** Delete a local test class from an ABAP class by clearing the testclasses include. Manages lock, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleDeleteLocalTestClass.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting test class. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number (required for transportable objects).

---

<a id="deletelocaltypes-high-level-class"></a>
#### DeleteLocalTypes (High-Level / Class)
**Description:** Delete local types from an ABAP class by clearing the implementations include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleDeleteLocalTypes.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `transport_request` (string, optional) - Transport request number.

---

<a id="getclass-high-level-class"></a>
#### GetClass (High-Level / Class)
**Description:** Retrieve ABAP class source code. Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getlocaldefinitions-high-level-class"></a>
#### GetLocalDefinitions (High-Level / Class)
**Description:** Retrieve local definitions source code from a class (definitions include). Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalDefinitions.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getlocalmacros-high-level-class"></a>
#### GetLocalMacros (High-Level / Class)
**Description:** Retrieve local macros source code from a class (macros include). Supports reading active or inactive version. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleGetLocalMacros.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getlocaltestclass-high-level-class"></a>
#### GetLocalTestClass (High-Level / Class)
**Description:** Retrieve local test class source code from a class. Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalTestClass.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getlocaltypes-high-level-class"></a>
#### GetLocalTypes (High-Level / Class)
**Description:** Retrieve local types source code from a class (implementations include). Supports reading active or inactive version.

**Source:** `src/handlers/class/high/handleGetLocalTypes.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateclass-high-level-class"></a>
#### UpdateClass (High-Level / Class)
**Description:** Operation: Update, Create. Subject: Class. Will be useful for updating or creating class. Update source code of an existing ABAP class. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/class/high/handleUpdateClass.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `class_name` (string, required) - Class name (e.g., ZCL_TEST_CLASS_001).
- `source_code` (string, required) - Complete ABAP class source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="updatelocaldefinitions-high-level-class"></a>
#### UpdateLocalDefinitions (High-Level / Class)
**Description:** Update local definitions in an ABAP class (definitions include). Manages lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleUpdateLocalDefinitions.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `definitions_code` (string, required) - Updated source code for local definitions.
- `transport_request` (string, optional) - Transport request number.

---

<a id="updatelocalmacros-high-level-class"></a>
#### UpdateLocalMacros (High-Level / Class)
**Description:** Update local macros in an ABAP class (macros include). Manages lock, check, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleUpdateLocalMacros.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `macros_code` (string, required) - Updated source code for local macros.
- `transport_request` (string, optional) - Transport request number.

---

<a id="updatelocaltestclass-high-level-class"></a>
#### UpdateLocalTestClass (High-Level / Class)
**Description:** Update a local test class in an ABAP class. Manages lock, check, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleUpdateLocalTestClass.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating test class. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `test_class_code` (string, required) - Updated source code for the local test class.
- `transport_request` (string, optional) - Transport request number (required for transportable objects).

---

<a id="updatelocaltypes-high-level-class"></a>
#### UpdateLocalTypes (High-Level / Class)
**Description:** Update local types in an ABAP class (implementations include). Manages lock, check, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleUpdateLocalTypes.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating. Default: false
- `class_name` (string, required) - Parent class name (e.g., ZCL_MY_CLASS).
- `local_types_code` (string, required) - Updated source code for local types.
- `transport_request` (string, optional) - Transport request number.

---

<a id="high-level-common"></a>
### High-Level / Common

<a id="activateobjects-high-level-common"></a>
#### ActivateObjects (High-Level / Common)
**Description:** Activate one or multiple ABAP repository objects. Use after Create/Update when objects remain inactive, or for group activation of related objects (e.g., domains + data elements + tables together). Works with any object type.

**Source:** `src/handlers/common/high/handleActivateObjects.ts`

**Parameters:**
- `objects` (array, required) - Array of objects to activate. Each object must have 'name' and 'type'.
- `preaudit` (boolean, optional) - Request pre-audit before activation. Default: true

---

<a id="getbehaviordefinitionversiondiff-high-level-common"></a>
#### GetBehaviorDefinitionVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two RAP behavior definition versions, by their content_uris (taken from GetBehaviorDefinitionVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetBehaviorDefinitionVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetBehaviorDefinitionVersions entry).

---

<a id="getbehaviordefinitionversions-high-level-common"></a>
#### GetBehaviorDefinitionVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a RAP behavior definition. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetBehaviorDefinitionVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - RAP behavior definition name.

---

<a id="getbehaviordefinitionversionsource-high-level-common"></a>
#### GetBehaviorDefinitionVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific RAP behavior definition version by its content_uri (taken from a GetBehaviorDefinitionVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetBehaviorDefinitionVersions entry.

---

<a id="getclassversiondiff-high-level-common"></a>
#### GetClassVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP class versions, by their content_uris (taken from GetClassVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetClassVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetClassVersions entry).

---

<a id="getclassversions-high-level-common"></a>
#### GetClassVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP class. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetClassVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `class_name` (string, required) - ABAP class name.

---

<a id="getclassversionsource-high-level-common"></a>
#### GetClassVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP class version by its content_uri (taken from a GetClassVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetClassVersions entry.

---

<a id="getdataelementversiondiff-high-level-common"></a>
#### GetDataElementVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP data element versions, by their content_uris (taken from GetDataElementVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetDataElementVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetDataElementVersions entry).

---

<a id="getdataelementversions-high-level-common"></a>
#### GetDataElementVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP data element. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetDataElementVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `data_element_name` (string, required) - ABAP data element name.

---

<a id="getdataelementversionsource-high-level-common"></a>
#### GetDataElementVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP data element version by its content_uri (taken from a GetDataElementVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetDataElementVersions entry.

---

<a id="getddlversiondiff-high-level-common"></a>
#### GetDdlVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two CDS view (DDL source) versions, by their content_uris (taken from GetDdlVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetDdlVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetDdlVersions entry).

---

<a id="getddlversions-high-level-common"></a>
#### GetDdlVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a CDS view (DDL source). Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetDdlVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `ddl_name` (string, required) - CDS view (DDL source) name.

---

<a id="getddlversionsource-high-level-common"></a>
#### GetDdlVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific CDS view (DDL source) version by its content_uri (taken from a GetDdlVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetDdlVersions entry.

---

<a id="getdomainversiondiff-high-level-common"></a>
#### GetDomainVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP domain versions, by their content_uris (taken from GetDomainVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetDomainVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetDomainVersions entry).

---

<a id="getdomainversions-high-level-common"></a>
#### GetDomainVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP domain. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetDomainVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `domain_name` (string, required) - ABAP domain name.

---

<a id="getdomainversionsource-high-level-common"></a>
#### GetDomainVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP domain version by its content_uri (taken from a GetDomainVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetDomainVersions entry.

---

<a id="getfunctiongroupversiondiff-high-level-common"></a>
#### GetFunctionGroupVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP function group versions, by their content_uris (taken from GetFunctionGroupVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetFunctionGroupVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetFunctionGroupVersions entry).

---

<a id="getfunctiongroupversions-high-level-common"></a>
#### GetFunctionGroupVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP function group. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetFunctionGroupVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `function_group_name` (string, required) - ABAP function group name.

---

<a id="getfunctiongroupversionsource-high-level-common"></a>
#### GetFunctionGroupVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP function group version by its content_uri (taken from a GetFunctionGroupVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetFunctionGroupVersions entry.

---

<a id="getfunctionmoduleversiondiff-high-level-common"></a>
#### GetFunctionModuleVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP function module versions, by their content_uris (taken from GetFunctionModuleVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetFunctionModuleVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetFunctionModuleVersions entry).

---

<a id="getfunctionmoduleversions-high-level-common"></a>
#### GetFunctionModuleVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP function module. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetFunctionModuleVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `function_group_name` (string, required) - Owning function group name (required).
- `function_module_name` (string, required) - ABAP function module name.

---

<a id="getfunctionmoduleversionsource-high-level-common"></a>
#### GetFunctionModuleVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP function module version by its content_uri (taken from a GetFunctionModuleVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetFunctionModuleVersions entry.

---

<a id="getinterfaceversiondiff-high-level-common"></a>
#### GetInterfaceVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP interface versions, by their content_uris (taken from GetInterfaceVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetInterfaceVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetInterfaceVersions entry).

---

<a id="getinterfaceversions-high-level-common"></a>
#### GetInterfaceVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP interface. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetInterfaceVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `interface_name` (string, required) - ABAP interface name.

---

<a id="getinterfaceversionsource-high-level-common"></a>
#### GetInterfaceVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP interface version by its content_uri (taken from a GetInterfaceVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetInterfaceVersions entry.

---

<a id="getmetadataextensionversiondiff-high-level-common"></a>
#### GetMetadataExtensionVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two CDS metadata extension versions, by their content_uris (taken from GetMetadataExtensionVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetMetadataExtensionVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetMetadataExtensionVersions entry).

---

<a id="getmetadataextensionversions-high-level-common"></a>
#### GetMetadataExtensionVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a CDS metadata extension. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetMetadataExtensionVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - CDS metadata extension name.

---

<a id="getmetadataextensionversionsource-high-level-common"></a>
#### GetMetadataExtensionVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific CDS metadata extension version by its content_uri (taken from a GetMetadataExtensionVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetMetadataExtensionVersions entry.

---

<a id="getpackageversiondiff-high-level-common"></a>
#### GetPackageVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP package versions, by their content_uris (taken from GetPackageVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetPackageVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetPackageVersions entry).

---

<a id="getpackageversions-high-level-common"></a>
#### GetPackageVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP package. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetPackageVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `package_name` (string, required) - ABAP package name.

---

<a id="getpackageversionsource-high-level-common"></a>
#### GetPackageVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP package version by its content_uri (taken from a GetPackageVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetPackageVersions entry.

---

<a id="getprogramversiondiff-high-level-common"></a>
#### GetProgramVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP program versions, by their content_uris (taken from GetProgramVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetProgramVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetProgramVersions entry).

---

<a id="getprogramversions-high-level-common"></a>
#### GetProgramVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP program. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetProgramVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `program_name` (string, required) - ABAP program name.

---

<a id="getprogramversionsource-high-level-common"></a>
#### GetProgramVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP program version by its content_uri (taken from a GetProgramVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetProgramVersions entry.

---

<a id="getstructureversiondiff-high-level-common"></a>
#### GetStructureVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP structure versions, by their content_uris (taken from GetStructureVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetStructureVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetStructureVersions entry).

---

<a id="getstructureversions-high-level-common"></a>
#### GetStructureVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP structure. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetStructureVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `structure_name` (string, required) - ABAP structure name.

---

<a id="getstructureversionsource-high-level-common"></a>
#### GetStructureVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP structure version by its content_uri (taken from a GetStructureVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetStructureVersions entry.

---

<a id="gettableversiondiff-high-level-common"></a>
#### GetTableVersionDiff (High-Level / Common)
**Description:** [read-only] Compute a unified diff between two ABAP table versions, by their content_uris (taken from GetTableVersions entries).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetTableVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetTableVersions entry).

---

<a id="gettableversions-high-level-common"></a>
#### GetTableVersions (High-Level / Common)
**Description:** [read-only] List the SAP version history of a ABAP table. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version's source via GetTableVersionSource.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `table_name` (string, required) - ABAP table name.

---

<a id="gettableversionsource-high-level-common"></a>
#### GetTableVersionSource (High-Level / Common)
**Description:** [read-only] Fetch the source of a specific ABAP table version by its content_uri (taken from a GetTableVersions entry).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetTableVersions entry.

---

<a id="high-level-compact"></a>
### High-Level / Compact

<a id="handleractivate-high-level-compact"></a>
#### HandlerActivate (High-Level / Compact)
**Description:** Activate operation. Single mode(object_name*, object_adt_type*). Batch mode(objects[].name*, objects[].type*).

**Source:** `src/handlers/compact/high/handleHandlerActivate.ts`

**Parameters:**
- `object_adt_type` (string, optional) - ADT object type code (e.g. CLAS/OC, PROG/P). Required for single-object activation form.
- `object_name` (string, optional) - Object name for single-object activation form.
- `object_type` (any, optional) - 
- `objects` (array, optional) - Explicit objects list for batch activation.
- `preaudit` (boolean, optional) - Run pre-audit checks before activation.

---

<a id="handlercdsunittestresult-high-level-compact"></a>
#### HandlerCdsUnitTestResult (High-Level / Compact)
**Description:** CDS unit test result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerCdsUnitTestResult.ts`

**Parameters:**
- `aggregate` (boolean, optional) - Aggregate profiling data.
- `all_db_events` (boolean, optional) - Trace all DB events.
- `all_dynpro_events` (boolean, optional) - Trace dynpro events.
- `all_internal_table_events` (boolean, optional) - Trace internal table events.
- `all_misc_abap_statements` (boolean, optional) - Trace miscellaneous ABAP statements.
- `all_procedural_units` (boolean, optional) - Trace all procedural units.
- `all_system_kernel_events` (boolean, optional) - Trace system kernel events.
- `amdp_trace` (boolean, optional) - Enable AMDP tracing.
- `class_name` (string, optional) - Class name for profiling.
- `description` (string, optional) - Profiler run description.
- `explicit_on_off` (boolean, optional) - Use explicit on/off trace sections.
- `max_size_for_trace_file` (number, optional) - Maximum trace file size.
- `max_time_for_tracing` (number, optional) - Maximum tracing time.
- `program_name` (string, optional) - Program name for profiling.
- `sql_trace` (boolean, optional) - Enable SQL trace.
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - Enable RFC tracing.

---

<a id="handlercdsunitteststatus-high-level-compact"></a>
#### HandlerCdsUnitTestStatus (High-Level / Compact)
**Description:** CDS unit test status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerCdsUnitTestStatus.ts`

**Parameters:**
- `aggregate` (boolean, optional) - Aggregate profiling data.
- `all_db_events` (boolean, optional) - Trace all DB events.
- `all_dynpro_events` (boolean, optional) - Trace dynpro events.
- `all_internal_table_events` (boolean, optional) - Trace internal table events.
- `all_misc_abap_statements` (boolean, optional) - Trace miscellaneous ABAP statements.
- `all_procedural_units` (boolean, optional) - Trace all procedural units.
- `all_system_kernel_events` (boolean, optional) - Trace system kernel events.
- `amdp_trace` (boolean, optional) - Enable AMDP tracing.
- `class_name` (string, optional) - Class name for profiling.
- `description` (string, optional) - Profiler run description.
- `explicit_on_off` (boolean, optional) - Use explicit on/off trace sections.
- `max_size_for_trace_file` (number, optional) - Maximum trace file size.
- `max_time_for_tracing` (number, optional) - Maximum tracing time.
- `program_name` (string, optional) - Program name for profiling.
- `sql_trace` (boolean, optional) - Enable SQL trace.
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - Enable RFC tracing.

---

<a id="handlercheckrun-high-level-compact"></a>
#### HandlerCheckRun (High-Level / Compact)
**Description:** CheckRun operation (syntax, no activation). object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).

**Source:** `src/handlers/compact/high/handleHandlerCheckRun.ts`

**Parameters:**
- `session_id` (string, optional) - Optional ADT session id for stateful check flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful check flow.
- `version` (string, optional (default: active)) - Version to syntax-check.

---

<a id="handlercreate-high-level-compact"></a>
#### HandlerCreate (High-Level / Compact)
**Description:** Create operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, root_entity*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, package_name*), METADATA_EXTENSION(name*, package_name*), UNIT_TEST(tests*), CDS_UNIT_TEST(class_name*, package_name*, cds_view_name*).

**Source:** `src/handlers/compact/high/handleHandlerCreate.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate object after create.
- `application` (string, optional) - Domain application area.
- `behavior_definition` (string, optional) - Referenced behavior definition name (behavior implementation create).
- `cds_view_name` (string, optional) - CDS view name to validate for unit test doubles.
- `class_name` (string, optional) - ABAP class name.
- `conversion_exit` (string, optional) - Conversion exit name.
- `data_element_name` (string, optional) - Data element name.
- `datatype` (string, optional) - ABAP data type.
- `ddl_name` (string, optional) - DDL source name (CDS view, AMDP table function, etc.).
- `decimals` (number, optional) - Decimal places.
- `description` (string, optional) - Human-readable object description.
- `domain_name` (string, optional) - ABAP domain name.
- `fields` (array, optional) - Structure fields (for STRUCTURE create).
- `fixed_values` (array, optional) - Domain fixed values list.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `implementation_type` (string, optional) - Behavior definition implementation type.
- `interface_name` (string, optional) - Interface name.
- `length` (number, optional) - Length for typed artifacts.
- `lowercase` (boolean, optional) - Allow lowercase values (domain setting).
- `name` (string, optional) - Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `object_type` (any, required) - 
- `package_name` (string, optional) - ABAP package name.
- `program_name` (string, optional) - ABAP program name.
- `program_type` (string, optional) - ABAP program type.
- `root_entity` (string, optional) - Root CDS entity name (behavior definition create).
- `service_binding_name` (string, optional) - Service binding name.
- `service_definition_name` (string, optional) - Service definition name.
- `sign_exists` (boolean, optional) - Allow signed values (domain setting).
- `structure_name` (string, optional) - Structure name.
- `table_name` (string, optional) - Table name.
- `tests` (array, optional) - Container/test class pairs (for UNIT_TEST create).
- `transport_request` (string, optional) - Transport request id (if required by system).
- `value_table` (string, optional) - Foreign key value table.

---

<a id="handlerdelete-high-level-compact"></a>
#### HandlerDelete (High-Level / Compact)
**Description:** Delete operation. object_type required: DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(class_name*).

**Source:** `src/handlers/compact/high/handleHandlerDelete.ts`

**Parameters:**
- `behavior_definition_name` (string, optional) - Behavior definition name.
- `behavior_implementation_name` (string, optional) - Behavior implementation name.
- `class_name` (string, optional) - ABAP class name.
- `data_element_name` (string, optional) - Data element name.
- `ddl_name` (string, optional) - DDL source name (CDS view, AMDP table function, etc.).
- `domain_name` (string, optional) - ABAP domain name.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `interface_name` (string, optional) - Interface name.
- `metadata_extension_name` (string, optional) - Metadata extension name.
- `object_type` (any, required) - 
- `program_name` (string, optional) - ABAP program name.
- `run_id` (string, optional) - Unit test run id (UNIT_TEST delete).
- `service_binding_name` (string, optional) - Service binding name.
- `service_definition_name` (string, optional) - Service definition name.
- `structure_name` (string, optional) - Structure name.
- `table_name` (string, optional) - Table name.
- `transport_request` (string, optional) - Transport request id (if required by system).

---

<a id="handlerdumplist-high-level-compact"></a>
#### HandlerDumpList (High-Level / Compact)
**Description:** Runtime dump list. object_type: not used. Required: none. Optional: user, top, from, to. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerDumpList.ts`

**Parameters:**
- `from` (string, optional) - Start of time range (YYYYMMDDHHMMSS).
- `to` (string, optional) - End of time range (YYYYMMDDHHMMSS).
- `top` (number, optional) - Limit number of returned dumps.
- `user` (string, optional) - Filter dumps by user.

---

<a id="handlerdumpview-high-level-compact"></a>
#### HandlerDumpView (High-Level / Compact)
**Description:** Runtime dump view. object_type: not used. Required: dump_id*. Optional: view(default|summary|formatted). Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerDumpView.ts`

**Parameters:**
- `dump_id` (string, required) - Runtime dump id.
- `view` (string, optional (default: default)) - Dump rendering mode.

---

<a id="handlerget-high-level-compact"></a>
#### HandlerGet (High-Level / Compact)
**Description:** Read operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*).

**Source:** `src/handlers/compact/high/handleHandlerGet.ts`

**Parameters:**
- `behavior_definition_name` (string, optional) - Behavior definition name.
- `behavior_implementation_name` (string, optional) - Behavior implementation name.
- `class_name` (string, optional) - Class name.
- `data_element_name` (string, optional) - Data element name.
- `ddl_name` (string, optional) - DDL source name.
- `domain_name` (string, optional) - Domain name.
- `function_group_name` (string, optional) - Function group name.
- `function_module_name` (string, optional) - Function module name.
- `interface_name` (string, optional) - Interface name.
- `metadata_extension_name` (string, optional) - Metadata extension name.
- `object_type` (any, required) - 
- `package_name` (string, optional) - Package name.
- `program_name` (string, optional) - Program name.
- `response_format` (string, optional) - Response format for SERVICE_BINDING reads.
- `run_id` (string, optional) - Unit test run id.
- `service_binding_name` (string, optional) - Service binding name.
- `service_definition_name` (string, optional) - Service definition name.
- `structure_name` (string, optional) - Structure name.
- `table_name` (string, optional) - Table name.
- `version` (any, optional) - 

---

<a id="handlerlock-high-level-compact"></a>
#### HandlerLock (High-Level / Compact)
**Description:** Lock operation. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).

**Source:** `src/handlers/compact/high/handleHandlerLock.ts`

**Parameters:**
- `session_id` (string, optional) - Optional ADT session id for stateful lock flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful lock flow.
- `super_package` (string, optional) - Super package context when relevant.

---

<a id="handlerprofilelist-high-level-compact"></a>
#### HandlerProfileList (High-Level / Compact)
**Description:** Runtime profiling list. object_type: not used. Required: none. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerProfileList.ts`

**Parameters:**
- See schema reference `compactProfileListSchema` in source file

---

<a id="handlerprofilerun-high-level-compact"></a>
#### HandlerProfileRun (High-Level / Compact)
**Description:** Runtime profiling run. object_type: not used. Required: target_type*(CLASS|PROGRAM) + class_name* for CLASS or program_name* for PROGRAM. Optional profiling flags and description. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerProfileRun.ts`

**Parameters:**
- `aggregate` (boolean, optional) - Aggregate profiling data.
- `all_db_events` (boolean, optional) - Trace all DB events.
- `all_dynpro_events` (boolean, optional) - Trace dynpro events.
- `all_internal_table_events` (boolean, optional) - Trace internal table events.
- `all_misc_abap_statements` (boolean, optional) - Trace miscellaneous ABAP statements.
- `all_procedural_units` (boolean, optional) - Trace all procedural units.
- `all_system_kernel_events` (boolean, optional) - Trace system kernel events.
- `amdp_trace` (boolean, optional) - Enable AMDP tracing.
- `class_name` (string, optional) - Class name for profiling.
- `description` (string, optional) - Profiler run description.
- `explicit_on_off` (boolean, optional) - Use explicit on/off trace sections.
- `max_size_for_trace_file` (number, optional) - Maximum trace file size.
- `max_time_for_tracing` (number, optional) - Maximum tracing time.
- `program_name` (string, optional) - Program name for profiling.
- `sql_trace` (boolean, optional) - Enable SQL trace.
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - Enable RFC tracing.

---

<a id="handlerprofileview-high-level-compact"></a>
#### HandlerProfileView (High-Level / Compact)
**Description:** Runtime profiling view. object_type: not used. Required: trace_id_or_uri*, view*(hitlist|statements|db_accesses). Optional: with_system_events, id, with_details, auto_drill_down_threshold. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerProfileView.ts`

**Parameters:**
- `auto_drill_down_threshold` (number, optional) - Auto drill-down threshold.
- `id` (number, optional) - Optional statement/access id.
- `trace_id_or_uri` (string, required) - Profiler trace id or URI.
- `view` (string, required) - Profiler trace view kind.
- `with_details` (boolean, optional) - Include detailed payload.
- `with_system_events` (boolean, optional) - Include system events in analysis.

---

<a id="handlerservicebindinglisttypes-high-level-compact"></a>
#### HandlerServiceBindingListTypes (High-Level / Compact)
**Description:** Service binding types list. object_type: not used. Required: none. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.

**Source:** `src/handlers/compact/high/handleHandlerServiceBindingListTypes.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - Response format for protocol types list.

---

<a id="handlerservicebindingvalidate-high-level-compact"></a>
#### HandlerServiceBindingValidate (High-Level / Compact)
**Description:** Service binding validate before create. object_type: not used. Required: service_binding_name*, service_definition_name*. Optional: service_binding_version, package_name, description. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerServiceBindingValidate.ts`

**Parameters:**
- `description` (string, optional) - Binding description.
- `package_name` (string, optional) - Target package name.
- `service_binding_name` (string, required) - Service binding name to validate.
- `service_binding_version` (string, optional) - Service binding version.
- `service_definition_name` (string, required) - Service definition name to pair with binding.

---

<a id="handlertransportcreate-high-level-compact"></a>
#### HandlerTransportCreate (High-Level / Compact)
**Description:** Transport create. object_type: not used. Required: description*. Optional: transport_type(workbench|customizing), target_system, owner. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerTransportCreate.ts`

**Parameters:**
- `description` (string, required) - Transport description.
- `owner` (string, optional) - Transport owner user.
- `target_system` (string, optional) - Target system id.
- `transport_type` (string, optional (default: workbench)) - Transport type.

---

<a id="handlerunittestresult-high-level-compact"></a>
#### HandlerUnitTestResult (High-Level / Compact)
**Description:** ABAP Unit result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format.
- `run_id` (string, required) - Unit test run id.
- `with_navigation_uris` (boolean, optional (default: false)) - Include ADT navigation URIs in the result payload.

---

<a id="handlerunittestrun-high-level-compact"></a>
#### HandlerUnitTestRun (High-Level / Compact)
**Description:** ABAP Unit run. object_type: not used. Required: tests[]{container_class*, test_class*}. Optional: title, context, scope, risk_level, duration. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestRun.ts`

**Parameters:**
- `context` (string, optional) - Run context label.
- `duration` (object, optional) - Allowed duration classes.
- `risk_level` (object, optional) - Allowed risk levels.
- `scope` (object, optional) - ABAP Unit scope flags.
- `tests` (array, required) - List of test classes to run.
- `title` (string, optional) - Run title shown in ABAP Unit logs.

---

<a id="handlerunitteststatus-high-level-compact"></a>
#### HandlerUnitTestStatus (High-Level / Compact)
**Description:** ABAP Unit status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Unit test run id.
- `with_long_polling` (boolean, optional (default: true)) - Use long polling while waiting for completion.

---

<a id="handlerunlock-high-level-compact"></a>
#### HandlerUnlock (High-Level / Compact)
**Description:** Unlock operation. object_type required: CLASS(object_name*, lock_handle*, session_id*), PROGRAM(object_name*, lock_handle*, session_id*), INTERFACE(object_name*, lock_handle*, session_id*), FUNCTION_GROUP(object_name*, lock_handle*, session_id*), FUNCTION_MODULE(object_name*, lock_handle*, session_id*), TABLE(object_name*, lock_handle*, session_id*), STRUCTURE(object_name*, lock_handle*, session_id*), DDL(object_name*, lock_handle*, session_id*), DOMAIN(object_name*, lock_handle*, session_id*), DATA_ELEMENT(object_name*, lock_handle*, session_id*), PACKAGE(object_name*, lock_handle*, session_id*), BEHAVIOR_DEFINITION(object_name*, lock_handle*, session_id*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*, session_id*), METADATA_EXTENSION(object_name*, lock_handle*, session_id*).

**Source:** `src/handlers/compact/high/handleHandlerUnlock.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle returned by lock.
- `session_id` (string, required) - ADT session id used during lock.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful unlock flow.

---

<a id="handlerupdate-high-level-compact"></a>
#### HandlerUpdate (High-Level / Compact)
**Description:** Update operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem/legacy only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, source_code*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, implementation_code*), METADATA_EXTENSION(name*, source_code*), UNIT_TEST(run_id*), CDS_UNIT_TEST(class_name*, test_class_source*).

**Source:** `src/handlers/compact/high/handleHandlerUpdate.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate object after update.
- `behavior_definition` (string, optional) - Referenced behavior definition name (behavior implementation update).
- `binding_variant` (string, optional) - Service binding variant (service binding update).
- `class_name` (string, optional) - ABAP class name.
- `conversion_exit` (string, optional) - Conversion exit name.
- `data_element_name` (string, optional) - Data element name.
- `datatype` (string, optional) - ABAP data type.
- `ddl_code` (string, optional) - Complete DDL source code (for TABLE/STRUCTURE update).
- `ddl_name` (string, optional) - DDL source name (CDS view, AMDP table function, etc.).
- `ddl_source` (string, optional) - Complete DDL source code (for DDL update).
- `decimals` (number, optional) - Decimal places.
- `definitions_code` (string, optional) - Updated source for class local definitions.
- `description` (string, optional) - Human-readable object description.
- `desired_publication_state` (string, optional) - Target publication state (service binding update).
- `domain_name` (string, optional) - ABAP domain name.
- `fixed_values` (array, optional) - Domain fixed values list.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `implementation_code` (string, optional) - Behavior implementation methods source code.
- `interface_name` (string, optional) - Interface name.
- `length` (number, optional) - Length for typed artifacts.
- `local_types_code` (string, optional) - Updated source for class local types.
- `lowercase` (boolean, optional) - Allow lowercase values (domain setting).
- `macros_code` (string, optional) - Updated source for class local macros.
- `name` (string, optional) - Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `object_type` (any, required) - 
- `package_name` (string, optional) - ABAP package name.
- `program_name` (string, optional) - ABAP program name.
- `run_id` (string, optional) - Unit test run id (UNIT_TEST update).
- `service_binding_name` (string, optional) - Service binding name.
- `service_definition_name` (string, optional) - Service definition name.
- `service_name` (string, optional) - Published service name (service binding update).
- `sign_exists` (boolean, optional) - Allow signed values (domain setting).
- `source_code` (string, optional) - ABAP source code payload.
- `structure_name` (string, optional) - Structure name.
- `table_name` (string, optional) - Table name.
- `test_class_code` (string, optional) - Updated source for the local test class.
- `test_class_source` (string, optional) - Updated local test class source (CDS_UNIT_TEST update).
- `transport_request` (string, optional) - Transport request id (if required by system).
- `value_table` (string, optional) - Foreign key value table.

---

<a id="handlervalidate-high-level-compact"></a>
#### HandlerValidate (High-Level / Compact)
**Description:** Validate before create only. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*).

**Source:** `src/handlers/compact/high/handleHandlerValidate.ts`

**Parameters:**
- `behavior_definition` (string, optional) - Optional behavior definition name, used when validating behavior implementation.
- `description` (string, optional) - Optional object description used during validation.
- `implementation_type` (string, optional) - Optional implementation type, used for behavior implementation validation.
- `object_name` (string, required) - Required object name. For SERVICE_BINDING this is the service binding name.
- `object_type` (string, required) - Object type to validate before create. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.
- `package_name` (string, optional) - Optional package context for validation (especially for create scenarios).
- `root_entity` (string, optional) - Optional CDS root entity name, used for behavior-related validation.
- `service_binding_version` (string, optional) - Optional service binding version for SERVICE_BINDING.
- `service_definition_name` (string, optional) - Required when object_type=SERVICE_BINDING. Service definition paired with the binding.
- `session_id` (string, optional) - Optional ADT session id for stateful validation flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful validation flow.

---

<a id="high-level-data-element"></a>
### High-Level / Data Element

<a id="checkdataelement-high-level-data-element"></a>
#### CheckDataElement (High-Level / Data Element)
**Description:** Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/data_element/high/handleCheckDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZDE_MY_ELEMENT).

---

<a id="createdataelement-high-level-data-element"></a>
#### CreateDataElement (High-Level / Data Element)
**Description:** Operation: Create. Subject: DataElement. Will be useful for creating data element. Create a new ABAP data element in SAP system. Creates the data element object in initial state.

**Source:** `src/handlers/data_element/high/handleCreateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions.
- `data_type` (string, optional (default: CHAR)) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'domain'.
- `decimals` (number, optional (default: 0)) - Decimal places. Usually inherited from domain.
- `description` (string, optional) - Data element description. If not provided, data_element_name will be used.
- `heading_label` (string, optional) - Heading field label (max 55 chars). Applied during update step after creation.
- `length` (number, optional (default: 100)) - Data type length. Usually inherited from domain.
- `long_label` (string, optional) - Long field label (max 40 chars). Applied during update step after creation.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `medium_label` (string, optional) - Medium field label (max 20 chars). Applied during update step after creation.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `search_help` (string, optional) - Search help name. Applied during update step after creation.
- `search_help_parameter` (string, optional) - Search help parameter. Applied during update step after creation.
- `set_get_parameter` (string, optional) - Set/Get parameter ID. Applied during update step after creation.
- `short_label` (string, optional) - Short field label (max 10 chars). Applied during update step after creation.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `type_kind` (string, optional (default: domain)) - Type kind: 'domain' (default), 'predefinedAbapType', 'refToPredefinedAbapType', 'refToDictionaryType', 'refToClifType'. If not specified, defaults to 'domain'.
- `type_name` (string, optional) - Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')

---

<a id="deletedataelement-high-level-data-element"></a>
#### DeleteDataElement (High-Level / Data Element)
**Description:** Delete an ABAP data element from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/data_element/high/handleDeleteDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getdataelement-high-level-data-element"></a>
#### GetDataElement (High-Level / Data Element)
**Description:** Retrieve ABAP data element definition. Supports reading active or inactive version.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name (e.g., Z_MY_DATA_ELEMENT).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatedataelement-high-level-data-element"></a>
#### UpdateDataElement (High-Level / Data Element)
**Description:** Operation: Update, Create. Subject: DataElement. Will be useful for updating or creating data element. Update an existing ABAP data element. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.

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

<a id="high-level-ddl"></a>
### High-Level / Ddl

<a id="checkddl-high-level-ddl"></a>
#### CheckDdl (High-Level / Ddl)
**Description:** Perform syntax check on an ABAP CDS view. Can check existing view (active/inactive) or validate hypothetical DDL source. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/ddl/high/handleCheckDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - CDS view name to check, passed as ddl_name (e.g., ZI_MY_VIEW).
- `ddl_source` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: inactive.

---

<a id="createddl-high-level-ddl"></a>
#### CreateDdl (High-Level / Ddl)
**Description:** Operation: Create. Subject: DDL source. Will be useful for creating a DDL source. Create a new CDS View or Classic View in SAP system. Creates the DDL source object in initial state. Use UpdateDdl to set DDL source code.

**Source:** `src/handlers/ddl/high/handleCreateDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW).
- `description` (string, optional) - Optional description (defaults to ddl_name).
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="deleteddl-high-level-ddl"></a>
#### DeleteDdl (High-Level / Ddl)
**Description:** Delete a DDL source from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/ddl/high/handleDeleteDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_VIEW).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getddl-high-level-ddl"></a>
#### GetDdl (High-Level / Ddl)
**Description:** Retrieve ABAP DDL source definition. Supports reading active or inactive version.

**Source:** `src/handlers/ddl/high/handleGetDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name (e.g., Z_MY_VIEW).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateddl-high-level-ddl"></a>
#### UpdateDdl (High-Level / Ddl)
**Description:** Operation: Update, Create. Subject: DDL source. Will be useful for updating or creating a DDL source. Update DDL source code of an existing CDS View or Classic View. Locks, updates, unlocks, and optionally activates. Use CreateDdl to create a new DDL source.

**Source:** `src/handlers/ddl/high/handleUpdateDdl.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `ddl_name` (string, required) - DDL source name (e.g., ZOK_R_TEST_0002).
- `ddl_source` (string, required) - Complete DDL source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="high-level-ddlx"></a>
### High-Level / Ddlx

<a id="checkmetadataextension-high-level-ddlx"></a>
#### CheckMetadataExtension (High-Level / Ddlx)
**Description:** Perform syntax check on an ABAP metadata extension (DDLX). Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/ddlx/high/handleCheckMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - Metadata extension name (e.g., ZC_MY_DDLX).

---

<a id="createmetadataextension-high-level-ddlx"></a>
#### CreateMetadataExtension (High-Level / Ddlx)
**Description:** Operation: Create. Subject: MetadataExtension. Will be useful for creating metadata extension. Create a new ABAP Metadata Extension (DDLX) in SAP system. Creates the metadata extension object in initial state.

**Source:** `src/handlers/ddlx/high/handleCreateMetadataExtension.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `name` (string, required) - Metadata Extension name
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number

---

<a id="updatemetadataextension-high-level-ddlx"></a>
#### UpdateMetadataExtension (High-Level / Ddlx)
**Description:** Operation: Update, Create. Subject: MetadataExtension. Will be useful for updating or creating metadata extension. Update source code of an existing ABAP Metadata Extension (DDLX). Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/ddlx/high/handleUpdateMetadataExtension.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally.
- `name` (string, required) - Metadata Extension name
- `source_code` (string, required) - New source code
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="high-level-domain"></a>
### High-Level / Domain

<a id="checkdomain-high-level-domain"></a>
#### CheckDomain (High-Level / Domain)
**Description:** Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/domain/high/handleCheckDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., ZDM_MY_DOMAIN).

---

<a id="createdomain-high-level-domain"></a>
#### CreateDomain (High-Level / Domain)
**Description:** Operation: Create. Subject: Domain. Will be useful for creating domain. Create a new ABAP domain in SAP system. Creates the domain object in initial state.

**Source:** `src/handlers/domain/high/handleCreateDomain.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - (optional) Activate domain after creation (default: true)
- `conversion_exit` (string, optional) - (optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional (default: CHAR)) - (optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional (default: 0)) - (optional) Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - (optional) Domain description. If not provided, domain_name will be used.
- `domain_name` (string, required) - Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions.
- `fixed_values` (array, optional) - (optional) Array of fixed values for domain value range
- `length` (number, optional (default: 100)) - (optional) Field length (max depends on datatype)
- `lowercase` (boolean, optional (default: false)) - (optional) Allow lowercase input
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, optional) - (optional) Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `sign_exists` (boolean, optional (default: false)) - (optional) Field has sign (+/-)
- `transport_request` (string, optional) - (optional) Transport request number (e.g., E19K905635). Required for transportable packages.
- `value_table` (string, optional) - (optional) Value table name for foreign key relationship

---

<a id="deletedomain-high-level-domain"></a>
#### DeleteDomain (High-Level / Domain)
**Description:** Delete an ABAP domain from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/domain/high/handleDeleteDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_DOMAIN).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getdomain-high-level-domain"></a>
#### GetDomain (High-Level / Domain)
**Description:** Retrieve ABAP domain definition. Supports reading active or inactive version.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name (e.g., Z_MY_DOMAIN).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatedomain-high-level-domain"></a>
#### UpdateDomain (High-Level / Domain)
**Description:** Operation: Update, Create. Subject: Domain. Will be useful for updating or creating domain. Update an existing ABAP domain. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.

**Source:** `src/handlers/domain/high/handleUpdateDomain.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - Activate domain after update (default: true)
- `conversion_exit` (string, optional) - Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional) - Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional) - Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - New domain description (optional)
- `domain_name` (string, required) - Domain name to update (e.g., ZZ_TEST_0001)
- `fixed_values` (array, optional) - Array of fixed values for domain value range
- `length` (number, optional) - Field length (max depends on datatype)
- `lowercase` (boolean, optional) - Allow lowercase input
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `sign_exists` (boolean, optional) - Field has sign (+/-)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.
- `value_table` (string, optional) - Value table name for foreign key relationship

---

<a id="high-level-function"></a>
### High-Level / Function

<a id="checkfunctiongroup-high-level-function"></a>
#### CheckFunctionGroup (High-Level / Function)
**Description:** Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/function/high/handleCheckFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name (e.g., ZFGRP_MY_GROUP).

---

<a id="checkfunctionmodule-high-level-function"></a>
#### CheckFunctionModule (High-Level / Function)
**Description:** Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/function/high/handleCheckFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module.
- `function_module_name` (string, required) - Function module name (e.g., Z_MY_FUNCTION).
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: active.

---

<a id="createfunctiongroup-high-level-function"></a>
#### CreateFunctionGroup (High-Level / Function)
**Description:** Create a new ABAP function group in SAP system. Function groups serve as containers for function modules. Uses stateful session for proper lock management.

**Source:** `src/handlers/function/high/handleCreateFunctionGroup.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate function group after creation. Default: true. Set to false for batch operations.
- `description` (string, optional) - Function group description. If not provided, function_group_name will be used.
- `function_group_name` (string, required) - Function group name (e.g., ZTEST_FG_001). Must follow SAP naming conventions (start with Z or Y, max 26 chars).
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="createfunctionmodule-high-level-function"></a>
#### CreateFunctionModule (High-Level / Function)
**Description:** Operation: Create. Subject: FunctionModule. Will be useful for creating function module. Create a new ABAP function module within an existing function group. Creates the function module in initial state.

**Source:** `src/handlers/function/high/handleCreateFunctionModule.ts`

**Parameters:**
- `description` (string, optional) - Optional description for the function module
- `function_group_name` (string, required) - Parent function group name (e.g., ZTEST_FG_001)
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="updatefunctiongroup-high-level-function"></a>
#### UpdateFunctionGroup (High-Level / Function)
**Description:** Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules and don't have source code to update directly. Uses stateful session with proper lock/unlock mechanism.

**Source:** `src/handlers/function/high/handleUpdateFunctionGroup.ts`

**Parameters:**
- `description` (string, required) - New description for the function group.
- `function_group_name` (string, required) - Function group name (e.g., ZTEST_FG_001). Must exist in the system.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="updatefunctionmodule-high-level-function"></a>
#### UpdateFunctionModule (High-Level / Function)
**Description:** Operation: Update, Create. Subject: FunctionModule. Will be useful for updating or creating function module. Update source code of an existing ABAP function module. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/function/high/handleUpdateFunctionModule.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate function module after source update. Default: false. Set to true to activate immediately.
- `function_group_name` (string, required) - Function group name containing the function module (e.g., ZOK_FG_MCP01).
- `function_module_name` (string, required) - Function module name (e.g., Z_TEST_FM_MCP01). Function module must already exist.
- `source_code` (string, required) - Complete ABAP function module source code. Must include FUNCTION statement with parameters and ENDFUNCTION. Example:\n\nFUNCTION Z_TEST_FM\n  IMPORTING\n    VALUE(iv_input) TYPE string\n  EXPORTING\n    VALUE(ev_output) TYPE string.\n  \n  ev_output = iv_input.\nENDFUNCTION.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable function modules.

---

<a id="high-level-function-group"></a>
### High-Level / Function Group

<a id="deletefunctiongroup-high-level-function-group"></a>
#### DeleteFunctionGroup (High-Level / Function Group)
**Description:** Delete an ABAP function group from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/function_group/high/handleDeleteFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getfunctiongroup-high-level-function-group"></a>
#### GetFunctionGroup (High-Level / Function Group)
**Description:** Retrieve ABAP function group definition. Supports reading active or inactive version.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name (e.g., Z_MY_FUNCTIONGROUP).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-function-include"></a>
### High-Level / Function Include

<a id="createfunctioninclude-high-level-function-include"></a>
#### CreateFunctionInclude (High-Level / Function Include)
**Description:** Operation: Create. Subject: FunctionInclude. Will be useful for creating function group include. Create a new ABAP include within an existing function group. Creates the include in initial state.

**Source:** `src/handlers/function_include/high/handleCreateFunctionInclude.ts`

**Parameters:**
- `description` (string, optional) - Optional description for the include
- `function_group_name` (string, required) - Parent function group name (e.g., ZTEST_FG_001)
- `include_name` (string, required) - Include name (e.g., LZTEST_FG_001F01).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletefunctioninclude-high-level-function-include"></a>
#### DeleteFunctionInclude (High-Level / Function Include)
**Description:** Delete an ABAP function group include from the SAP system. Note: function module includes must be deleted via the Function Builder; the backend rejects such deletions. Transport request optional for $TMP objects.

**Source:** `src/handlers/function_include/high/handleDeleteFunctionInclude.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the include (e.g., Z_MY_FG).
- `include_name` (string, required) - Include name (e.g., LZ_MY_FGF01).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="updatefunctioninclude-high-level-function-include"></a>
#### UpdateFunctionInclude (High-Level / Function Include)
**Description:** Operation: Update. Subject: FunctionInclude. Will be useful for updating a function group include. Update source code of an existing ABAP function group include.

**Source:** `src/handlers/function_include/high/handleUpdateFunctionInclude.ts`

**Parameters:**
- `activate` (boolean, optional (default: false)) - Activate the include after the source update. Default: false. Set true to make the updated source the active version immediately.
- `function_group_name` (string, required) - Function group name containing the include (e.g., ZOK_FG_MCP01).
- `include_name` (string, required) - Include name (e.g., LZOK_FG_MCP01F01). Include must already exist.
- `source_code` (string, required) - Complete ABAP include source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable includes.

---

<a id="high-level-function-module"></a>
### High-Level / Function Module

<a id="deletefunctionmodule-high-level-function-module"></a>
#### DeleteFunctionModule (High-Level / Function Module)
**Description:** Delete an ABAP function module from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/function_module/high/handleDeleteFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name containing the function module (e.g., Z_MY_FUNCTIONGROUP).
- `function_module_name` (string, required) - FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getfunctionmodule-high-level-function-module"></a>
#### GetFunctionModule (High-Level / Function Module)
**Description:** Retrieve ABAP function module definition. Supports reading active or inactive version.

**Source:** `src/handlers/function_module/high/handleGetFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name containing the function module (e.g., Z_MY_FUNCTIONGROUP).
- `function_module_name` (string, required) - FunctionModule name (e.g., Z_MY_FUNCTIONMODULE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-interface"></a>
### High-Level / Interface

<a id="checkinterface-high-level-interface"></a>
#### CheckInterface (High-Level / Interface)
**Description:** Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/interface/high/handleCheckInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE).

---

<a id="createinterface-high-level-interface"></a>
#### CreateInterface (High-Level / Interface)
**Description:** Operation: Create. Subject: Interface. Will be useful for creating interface. Create a new ABAP interface in SAP system. Creates the interface object in initial state.

**Source:** `src/handlers/interface/high/handleCreateInterface.ts`

**Parameters:**
- `description` (string, optional) - Interface description. If not provided, interface_name will be used.
- `interface_name` (string, required) - Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y).
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteinterface-high-level-interface"></a>
#### DeleteInterface (High-Level / Interface)
**Description:** Delete an ABAP interface from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/interface/high/handleDeleteInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_INTERFACE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getinterface-high-level-interface"></a>
#### GetInterface (High-Level / Interface)
**Description:** Retrieve ABAP interface definition. Supports reading active or inactive version.

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name (e.g., Z_MY_INTERFACE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateinterface-high-level-interface"></a>
#### UpdateInterface (High-Level / Interface)
**Description:** Operation: Update, Create. Subject: Interface. Will be useful for updating or creating interface. Update source code of an existing ABAP interface. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/interface/high/handleUpdateInterface.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate interface after update. Default: true.
- `interface_name` (string, required) - Interface name (e.g., ZIF_MY_INTERFACE). Must exist in the system.
- `source_code` (string, required) - Complete ABAP interface source code with INTERFACE...ENDINTERFACE section.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-message-class"></a>
### High-Level / Message Class

<a id="createmessageclass-high-level-message-class"></a>
#### CreateMessageClass (High-Level / Message Class)
**Description:** Operation: Create. Subject: Message Class (MSAG). Create a new ABAP message class (T100) shell. Individual messages are added afterwards with CreateMessageClassMessage. Message classes are not activated.

**Source:** `src/handlers/message_class/high/handleCreateMessageClass.ts`

**Parameters:**
- `description` (string, optional) - (optional) Short description. If not provided, message_class_name is used.
- `master_language` (string, optional) - (optional) Master/original language (e.g. "EN", "DE"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS). Must follow SAP naming conventions.
- `package_name` (string, required) - Package name (e.g., ZMY_PKG, $TMP for local objects).
- `transport_request` (string, optional) - (optional) Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="createmessageclassmessage-high-level-message-class"></a>
#### CreateMessageClassMessage (High-Level / Message Class)
**Description:** Operation: Create. Subject: a single message inside a Message Class (MSAG). Add a message (number + text) to an existing ABAP message class (T100). The parent class must exist first (CreateMessageClass).

**Source:** `src/handlers/message_class/high/handleCreateMessageClassMessage.ts`

**Parameters:**
- `description` (string, optional) - (optional) Long description for the message.
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number (e.g., "001").
- `msgtext` (string, required) - Message text. May contain placeholders &1 &2 &3 &4 (or &).
- `self_explanatory` (boolean, optional (default: false)) - (optional) Mark the message as self-explanatory (no long text needed). Default: false.
- `transport_request` (string, optional) - (optional) Transport request number. Required for transportable objects.

---

<a id="deletemessageclass-high-level-message-class"></a>
#### DeleteMessageClass (High-Level / Message Class)
**Description:** Delete an ABAP message class (MSAG) and all of its messages from the SAP system. Includes a deletion check before the actual deletion. Transport request required for transportable objects, optional for local ($TMP).

**Source:** `src/handlers/message_class/high/handleDeleteMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects, optional for local ($TMP).

---

<a id="deletemessageclassmessage-high-level-message-class"></a>
#### DeleteMessageClassMessage (High-Level / Message Class)
**Description:** Operation: Delete. Subject: a single message inside a Message Class (MSAG). Remove one message (by number) from an ABAP message class (T100), keeping the class and its other messages. Transport request required for transportable objects.

**Source:** `src/handlers/message_class/high/handleDeleteMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number to delete (e.g., "001").
- `transport_request` (string, optional) - Transport request number. Required for transportable objects, optional for local ($TMP).

---

<a id="getmessageclass-high-level-message-class"></a>
#### GetMessageClass (High-Level / Message Class)
**Description:** Retrieve an ABAP message class (MSAG/T100) with its messages: name, description, package, master language and the message list (msgno, msgtext, self-explanatory).

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS).

---

<a id="getmessageclassmessage-high-level-message-class"></a>
#### GetMessageClassMessage (High-Level / Message Class)
**Description:** Retrieve a single message (by number) from an ABAP message class (MSAG/T100). Returns msgno, msgtext, self-explanatory flag and description.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="updatemessageclass-high-level-message-class"></a>
#### UpdateMessageClass (High-Level / Message Class)
**Description:** Operation: Update. Subject: Message Class (MSAG). Update a message class header (e.g. its description). To add or change individual messages use CreateMessageClassMessage / UpdateMessageClassMessage.

**Source:** `src/handlers/message_class/high/handleUpdateMessageClass.ts`

**Parameters:**
- `description` (string, required) - New short description for the message class.
- `message_class_name` (string, required) - Message class name (e.g., ZMY_MSGS).
- `transport_request` (string, optional) - (optional) Transport request number. Required for transportable objects.

---

<a id="updatemessageclassmessage-high-level-message-class"></a>
#### UpdateMessageClassMessage (High-Level / Message Class)
**Description:** Operation: Update. Subject: a single message inside a Message Class (MSAG). Change the text / flags of an existing message in an ABAP message class (T100). Upserts the message if it does not exist yet.

**Source:** `src/handlers/message_class/high/handleUpdateMessageClassMessage.ts`

**Parameters:**
- `description` (string, optional) - (optional) Long description for the message.
- `message_class_name` (string, required) - Parent message class name (e.g., ZMY_MSGS).
- `msgno` (string, required) - Message number (e.g., "001").
- `msgtext` (string, required) - New message text. May contain placeholders &1 &2 &3 &4 (or &).
- `self_explanatory` (boolean, optional) - (optional) Mark the message as self-explanatory.
- `transport_request` (string, optional) - (optional) Transport request number. Required for transportable objects.

---

<a id="high-level-metadata-extension"></a>
### High-Level / Metadata Extension

<a id="deletemetadataextension-high-level-metadata-extension"></a>
#### DeleteMetadataExtension (High-Level / Metadata Extension)
**Description:** Delete an ABAP metadata extension from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/metadata_extension/high/handleDeleteMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getmetadataextension-high-level-metadata-extension"></a>
#### GetMetadataExtension (High-Level / Metadata Extension)
**Description:** Retrieve ABAP metadata extension definition. Supports reading active or inactive version.

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name (e.g., Z_MY_METADATAEXTENSION).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-package"></a>
### High-Level / Package

<a id="checkpackage-high-level-package"></a>
#### CheckPackage (High-Level / Package)
**Description:** Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/package/high/handleCheckPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., ZMY_PACKAGE).
- `super_package` (string, required) - Super package name (parent package).

---

<a id="createpackage-high-level-package"></a>
#### CreatePackage (High-Level / Package)
**Description:** Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.

**Source:** `src/handlers/package/high/handleCreatePackage.ts`

**Parameters:**
- None

---

<a id="getpackage-high-level-package"></a>
#### GetPackage (High-Level / Package)
**Description:** Retrieve ABAP package metadata (description, super-package, etc.). Supports reading active or inactive version.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name (e.g., Z_MY_PACKAGE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-program"></a>
### High-Level / Program

<a id="checkprogram-high-level-program"></a>
#### CheckProgram (High-Level / Program)
**Description:** Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Not available on cloud.

**Source:** `src/handlers/program/high/handleCheckProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., ZMCP_MY_PROGRAM).

---

<a id="createprogram-high-level-program"></a>
#### CreateProgram (High-Level / Program)
**Description:** Operation: Create. Subject: Program. Will be useful for creating program. Create a new ABAP program (report) in SAP system. Creates the program object in initial state.

**Source:** `src/handlers/program/high/handleCreateProgram.ts`

**Parameters:**
- `application` (string, optional) - Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'
- `description` (string, optional) - Program description. If not provided, program_name will be used.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LAB, $TMP for local objects)
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM_001). Must follow SAP naming conventions (start with Z or Y).
- `program_type` (string, optional) - Program type: 'executable' (Report), 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool'. Default: 'executable'
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteprogram-high-level-program"></a>
#### DeleteProgram (High-Level / Program)
**Description:** Delete an ABAP program from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/program/high/handleDeleteProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getprogram-high-level-program"></a>
#### GetProgram (High-Level / Program)
**Description:** Retrieve ABAP program definition. Supports reading active or inactive version.

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name (e.g., Z_MY_PROGRAM).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateprogram-high-level-program"></a>
#### UpdateProgram (High-Level / Program)
**Description:** Operation: Update, Create. Subject: Program. Will be useful for updating or creating program. Update source code of an existing ABAP program. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/program/high/handleUpdateProgram.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.
- `program_name` (string, required) - Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist.
- `source_code` (string, required) - Complete ABAP program source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="high-level-service-binding"></a>
### High-Level / Service Binding

<a id="createservicebinding-high-level-service-binding"></a>
#### CreateServiceBinding (High-Level / Service Binding)
**Description:** Operation: Create. Subject: ServiceBinding. Will be useful for creating service binding. Create a new ABAP service binding in SAP system. Creates the service binding object in initial state.

**Source:** `src/handlers/service_binding/high/handleCreateServiceBinding.ts`

**Parameters:**
- `activate` (boolean, optional (default: true)) - Activate service binding after create. Default: true.
- `binding_variant` (string, optional (default: ODATA_V4_UI)) - Service binding variant. ODATA_V4_UI = OData V4 for Fiori Elements, ODATA_V4_WEB_API = OData V4 Web API, ODATA_V2_UI = OData V2 for Fiori Elements, ODATA_V2_WEB_API = OData V2 Web API.
- `description` (string, optional) - Optional description. Defaults to service_binding_name when omitted.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - ABAP package name.
- `response_format` (string, optional (default: xml)) - 
- `service_binding_name` (string, required) - Service binding name.
- `service_definition_name` (string, required) - Referenced service definition name.
- `service_name` (string, optional) - Published service name. Default: service_binding_name if omitted.
- `service_version` (string, optional) - Published service version. Default: 0001.
- `transport_request` (string, optional) - Optional transport request for transport checks.

---

<a id="deleteservicebinding-high-level-service-binding"></a>
#### DeleteServiceBinding (High-Level / Service Binding)
**Description:** Delete ABAP service binding via ADT Business Services endpoint.

**Source:** `src/handlers/service_binding/high/handleDeleteServiceBinding.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - 
- `service_binding_name` (string, required) - Service binding name to delete.
- `transport_request` (string, optional) - Optional transport request for deletion transport flow.

---

<a id="getservicebinding-high-level-service-binding"></a>
#### GetServiceBinding (High-Level / Service Binding)
**Description:** Retrieve ABAP service binding source/metadata by name via ADT Business Services endpoint.

**Source:** `src/handlers/service_binding/high/handleGetServiceBinding.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.
- `service_binding_name` (string, required) - Service binding name (for example: ZUI_MY_BINDING). Case-insensitive.

---

<a id="listservicebindingtypes-high-level-service-binding"></a>
#### ListServiceBindingTypes (High-Level / Service Binding)
**Description:** List available service binding types (for example ODataV2/ODataV4) from ADT Business Services endpoint.

**Source:** `src/handlers/service_binding/high/handleListServiceBindingTypes.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - 

---

<a id="updateservicebinding-high-level-service-binding"></a>
#### UpdateServiceBinding (High-Level / Service Binding)
**Description:** Operation: Update, Create. Subject: ServiceBinding. Will be useful for updating or creating service binding. Update publication state of an existing ABAP service binding.

**Source:** `src/handlers/service_binding/high/handleUpdateServiceBinding.ts`

**Parameters:**
- `binding_variant` (string, required (default: ODATA_V4_UI)) - Service binding variant. Determines OData version for publish/unpublish routing.
- `desired_publication_state` (string, required) - Target publication state.
- `response_format` (string, optional (default: xml)) - 
- `service_binding_name` (string, required) - Service binding name to update.
- `service_name` (string, required) - Published service name.
- `service_version` (string, optional) - Published service version. Optional.

---

<a id="validateservicebinding-high-level-service-binding"></a>
#### ValidateServiceBinding (High-Level / Service Binding)
**Description:** Validate service binding parameters (name, service definition, package, version) via ADT validation endpoint.

**Source:** `src/handlers/service_binding/high/handleValidateServiceBinding.ts`

**Parameters:**
- `description` (string, optional) - Optional description used during validation.
- `package_name` (string, optional) - ABAP package for the binding.
- `service_binding_name` (string, required) - Service binding name to validate.
- `service_binding_version` (string, optional) - Service binding version (for example: 1.0).
- `service_definition_name` (string, required) - Service definition linked to binding.

---

<a id="high-level-service-definition"></a>
### High-Level / Service Definition

<a id="createservicedefinition-high-level-service-definition"></a>
#### CreateServiceDefinition (High-Level / Service Definition)
**Description:** Operation: Create. Subject: ServiceDefinition. Will be useful for creating service definition. Create a new ABAP service definition in SAP system. Creates the service definition object in initial state.

**Source:** `src/handlers/service_definition/high/handleCreateServiceDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after creation. Default: true.
- `description` (string, optional) - Service definition description. If not provided, service_definition_name will be used.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `service_definition_name` (string, required) - Service definition name (e.g., ZSD_MY_SERVICE). Must follow SAP naming conventions (start with Z or Y).
- `source_code` (string, optional) - Service definition source code (optional). If not provided, a minimal template will be created.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deleteservicedefinition-high-level-service-definition"></a>
#### DeleteServiceDefinition (High-Level / Service Definition)
**Description:** Delete an ABAP service definition from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/service_definition/high/handleDeleteServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getservicedefinition-high-level-service-definition"></a>
#### GetServiceDefinition (High-Level / Service Definition)
**Description:** Retrieve ABAP service definition definition. Supports reading active or inactive version.

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updateservicedefinition-high-level-service-definition"></a>
#### UpdateServiceDefinition (High-Level / Service Definition)
**Description:** Operation: Update, Create. Subject: ServiceDefinition. Will be useful for updating or creating service definition. Update source code of an existing ABAP service definition. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/service_definition/high/handleUpdateServiceDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after update. Default: true.
- `service_definition_name` (string, required) - Service definition name (e.g., ZSD_MY_SERVICE). Must exist in the system.
- `source_code` (string, required) - Complete service definition source code.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-structure"></a>
### High-Level / Structure

<a id="checkstructure-high-level-structure"></a>
#### CheckStructure (High-Level / Structure)
**Description:** Perform syntax check on an ABAP structure. Can check existing structure (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/structure/high/handleCheckStructure.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `structure_name` (string, required) - Structure name (e.g., ZST_MY_STRUCTURE).
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: inactive.

---

<a id="createstructure-high-level-structure"></a>
#### CreateStructure (High-Level / Structure)
**Description:** Operation: Create. Subject: Structure. Will be useful for creating structure. Create a new ABAP structure in SAP system. Creates the structure object in initial state.

**Source:** `src/handlers/structure/high/handleCreateStructure.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate structure after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `description` (string, optional) - Structure description. If not provided, structure_name will be used.
- `fields` (array, required (default: 0)) - Array of structure fields
- `includes` (array, optional) - Include other structures in this structure
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `structure_name` (string, required) - Structure name (e.g., ZZ_S_TEST_001). Must follow SAP naming conventions.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletestructure-high-level-structure"></a>
#### DeleteStructure (High-Level / Structure)
**Description:** Delete an ABAP structure from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/structure/high/handleDeleteStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="getstructure-high-level-structure"></a>
#### GetStructure (High-Level / Structure)
**Description:** Retrieve ABAP structure definition. Supports reading active or inactive version.

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name (e.g., Z_MY_STRUCTURE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatestructure-high-level-structure"></a>
#### UpdateStructure (High-Level / Structure)
**Description:** Operation: Update, Create. Subject: Structure. Will be useful for updating or creating structure. Update DDL source code of an existing ABAP structure. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/structure/high/handleUpdateStructure.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate structure after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for structure. Example: '@EndUserText.label : \'My Structure\' @AbapCatalog.tableCategory : #TRANSPARENT define structure zz_s_test_001 { client : abap.clnt not null; id : abap.char(10); name : abap.char(255); }'
- `structure_name` (string, required) - Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-system"></a>
### High-Level / System

<a id="getpackagetree-high-level-system"></a>
#### GetPackageTree (High-Level / System)
**Description:** [high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions.

**Source:** `src/handlers/system/high/handleGetPackageTree.ts`

**Parameters:**
- `debug` (boolean, optional (default: false)) - Include diagnostic metadata in response (counts, types, hierarchy info). Default: false
- `include_descriptions` (boolean, optional (default: true)) - Include object descriptions in response. Default: true
- `include_subpackages` (boolean, optional (default: true)) - Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true
- `max_depth` (integer, optional (default: 5)) - Maximum depth for recursive package traversal. Default: 5
- `package_name` (string, required) - Package name (e.g., "ZMY_PACKAGE")

---

<a id="high-level-table"></a>
### High-Level / Table

<a id="checktable-high-level-table"></a>
#### CheckTable (High-Level / Table)
**Description:** Perform syntax check on an ABAP table. Can check existing table (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/table/high/handleCheckTable.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `table_name` (string, required) - Table name (e.g., ZMCP_MY_TABLE).
- `version` (string, optional) - Version to check: 'active', 'inactive', or 'new'. Default: new.

---

<a id="createtable-high-level-table"></a>
#### CreateTable (High-Level / Table)
**Description:** Operation: Create. Subject: Table. Will be useful for creating table. Create a new ABAP table in SAP system. Creates the table object in initial state.

**Source:** `src/handlers/table/high/handleCreateTable.ts`

**Parameters:**
- `description` (string, optional) - Table description for validation and creation.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name (e.g., ZOK_LOCAL, $TMP for local objects)
- `table_name` (string, required) - Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable packages.

---

<a id="deletetable-high-level-table"></a>
#### DeleteTable (High-Level / Table)
**Description:** Delete an ABAP table from the SAP system. Includes deletion check before actual deletion. Transport request optional for $TMP objects.

**Source:** `src/handlers/table/high/handleDeleteTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE).
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).

---

<a id="gettable-high-level-table"></a>
#### GetTable (High-Level / Table)
**Description:** Retrieve ABAP table definition. Supports reading active or inactive version.

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name (e.g., Z_MY_TABLE).
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatetable-high-level-table"></a>
#### UpdateTable (High-Level / Table)
**Description:** Operation: Update, Create. Subject: Table. Will be useful for updating or creating table. Update DDL source code of an existing ABAP table. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/table/high/handleUpdateTable.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate table after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for table. Example: '@EndUserText.label : \'My Table\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'
- `table_name` (string, required) - Table name (e.g., ZZ_TEST_TABLE_001). Table must already exist.
- `transport_request` (string, optional) - Transport request number (e.g., E19K905635). Optional if object is local or already in transport.

---

<a id="high-level-transport"></a>
### High-Level / Transport

<a id="createtransport-high-level-transport"></a>
#### CreateTransport (High-Level / Transport)
**Description:** Create a new ABAP transport request in SAP system for development objects.

**Source:** `src/handlers/transport/high/handleCreateTransport.ts`

**Parameters:**
- `description` (string, required) - Transport request description (mandatory)
- `owner` (string, optional) - Transport owner (optional, defaults to current user)
- `target_system` (string, optional) - Target system for transport (optional, e.g., 'PRD', 'QAS'). If not provided or empty, uses 'LOCAL'
- `transport_type` (string, optional (default: workbench)) - Transport type: 'workbench' (cross-client) or 'customizing' (client-specific)

---

<a id="high-level-unit-test"></a>
### High-Level / Unit Test

<a id="createcdsunittest-high-level-unit-test"></a>
#### CreateCdsUnitTest (High-Level / Unit Test)
**Description:** Create a CDS unit test class with CDS validation. Creates the test class in initial state.

**Source:** `src/handlers/unit_test/high/handleCreateCdsUnitTest.ts`

**Parameters:**
- `cds_view_name` (string, required) - CDS view name to validate for unit test doubles.
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `description` (string, optional) - Optional description for the global test class.
- `package_name` (string, required) - Package name (e.g., ZOK_TEST_PKG_01, $TMP).
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="createunittest-high-level-unit-test"></a>
#### CreateUnitTest (High-Level / Unit Test)
**Description:** Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.

**Source:** `src/handlers/unit_test/high/handleCreateUnitTest.ts`

**Parameters:**
- `context` (string, optional) - Optional context string shown in SAP tools.
- `duration` (object, optional) - 
- `risk_level` (object, optional) - 
- `scope` (object, optional) - 
- `tests` (array, required) - List of container/test class pairs to execute.
- `title` (string, optional) - Optional title for the ABAP Unit run.

---

<a id="deletecdsunittest-high-level-unit-test"></a>
#### DeleteCdsUnitTest (High-Level / Unit Test)
**Description:** Delete a CDS unit test class (global class).

**Source:** `src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="deleteunittest-high-level-unit-test"></a>
#### DeleteUnitTest (High-Level / Unit Test)
**Description:** Delete an ABAP Unit test run. Note: ADT does not support deleting unit test runs and will return an error.

**Source:** `src/handlers/unit_test/high/handleDeleteUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by CreateUnitTest/RunUnitTest.

---

<a id="getcdsunittest-high-level-unit-test"></a>
#### GetCdsUnitTest (High-Level / Unit Test)
**Description:** Retrieve CDS unit test run status and result for a previously started run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.

---

<a id="getcdsunittestresult-high-level-unit-test"></a>
#### GetCdsUnitTestResult (High-Level / Unit Test)
**Description:** Retrieve CDS unit test run result for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format: abapunit or junit.
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_navigation_uris` (boolean, optional (default: false)) - Include navigation URIs in result if supported.

---

<a id="getcdsunitteststatus-high-level-unit-test"></a>
#### GetCdsUnitTestStatus (High-Level / Unit Test)
**Description:** Retrieve CDS unit test run status for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

<a id="getunittest-high-level-unit-test"></a>
#### GetUnitTest (High-Level / Unit Test)
**Description:** Retrieve ABAP Unit test run status and result for a previously started run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by RunUnitTest.

---

<a id="getunittestresult-high-level-unit-test"></a>
#### GetUnitTestResult (High-Level / Unit Test)
**Description:** Retrieve ABAP Unit test run result for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format: abapunit or junit.
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_navigation_uris` (boolean, optional (default: false)) - Include navigation URIs in result if supported.

---

<a id="getunitteststatus-high-level-unit-test"></a>
#### GetUnitTestStatus (High-Level / Unit Test)
**Description:** Retrieve ABAP Unit test run status for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

<a id="rununittest-high-level-unit-test"></a>
#### RunUnitTest (High-Level / Unit Test)
**Description:** Start an ABAP Unit test run for provided class test definitions. Returns run_id for status/result queries.

**Source:** `src/handlers/unit_test/high/handleRunUnitTest.ts`

**Parameters:**
- `context` (string, optional) - Optional context string shown in SAP tools.
- `duration` (object, optional) - 
- `risk_level` (object, optional) - 
- `scope` (object, optional) - 
- `tests` (array, required) - List of container/test class pairs to execute.
- `title` (string, optional) - Optional title for the ABAP Unit run.

---

<a id="updatecdsunittest-high-level-unit-test"></a>
#### UpdateCdsUnitTest (High-Level / Unit Test)
**Description:** Update a CDS unit test class local test class source code.

**Source:** `src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Global test class name (e.g., ZCL_CDS_TEST).
- `test_class_source` (string, required) - Updated local test class ABAP source code.
- `transport_request` (string, optional) - Transport request number (required for transportable packages).

---

<a id="updateunittest-high-level-unit-test"></a>
#### UpdateUnitTest (High-Level / Unit Test)
**Description:** Update an ABAP Unit test run. Note: ADT does not support updating unit test runs and will return an error.

**Source:** `src/handlers/unit_test/high/handleUpdateUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by CreateUnitTest/RunUnitTest.

---

*Last updated: 2026-07-05*
