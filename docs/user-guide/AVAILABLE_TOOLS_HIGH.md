# High-Level Tools - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

The high-level tools of `mcp-abap-adt`, `-http` and `-sse`. Each tool's description, as the server lists it, ends with one more sentence on batch mode — recordable, recordable for the arguments it names, or run outside batch mode; the descriptions here are the handlers' own, without it ([BATCH_MODE.md](BATCH_MODE.md) lists every recordable call).

- Level: High-Level
- Total tools: 158

## Navigation

- [High-Level Group](#high-level-group)
  - [Atc](#high-level-atc)
    - [GetATCFindings](#getatcfindings-high-level-atc)
    - [GetATCRunStatus](#getatcrunstatus-high-level-atc)
    - [RunATC](#runatc-high-level-atc)
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
    - [GetDdlVersionDiff](#getddlversiondiff-high-level-common)
    - [GetDdlVersions](#getddlversions-high-level-common)
    - [GetDdlVersionSource](#getddlversionsource-high-level-common)
    - [GetFunctionModuleVersionDiff](#getfunctionmoduleversiondiff-high-level-common)
    - [GetFunctionModuleVersions](#getfunctionmoduleversions-high-level-common)
    - [GetFunctionModuleVersionSource](#getfunctionmoduleversionsource-high-level-common)
    - [GetInterfaceVersionDiff](#getinterfaceversiondiff-high-level-common)
    - [GetInterfaceVersions](#getinterfaceversions-high-level-common)
    - [GetInterfaceVersionSource](#getinterfaceversionsource-high-level-common)
    - [GetMetadataExtensionVersionDiff](#getmetadataextensionversiondiff-high-level-common)
    - [GetMetadataExtensionVersions](#getmetadataextensionversions-high-level-common)
    - [GetMetadataExtensionVersionSource](#getmetadataextensionversionsource-high-level-common)
    - [GetStructureVersionDiff](#getstructureversiondiff-high-level-common)
    - [GetStructureVersions](#getstructureversions-high-level-common)
    - [GetStructureVersionSource](#getstructureversionsource-high-level-common)
    - [GetTableVersionDiff](#gettableversiondiff-high-level-common)
    - [GetTableVersions](#gettableversions-high-level-common)
    - [GetTableVersionSource](#gettableversionsource-high-level-common)
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
    - [DeletePackage](#deletepackage-high-level-package)
    - [GetPackage](#getpackage-high-level-package)
    - [UpdatePackage](#updatepackage-high-level-package)
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
    - [AddTransportObject](#addtransportobject-high-level-transport)
    - [CreateTransport](#createtransport-high-level-transport)
    - [CreateTransportTask](#createtransporttask-high-level-transport)
    - [MoveTransportObjects](#movetransportobjects-high-level-transport)
    - [RemoveTransportObject](#removetransportobject-high-level-transport)
    - [SortAndCompressTransportTask](#sortandcompresstransporttask-high-level-transport)
  - [Unit Test](#high-level-unit-test)
    - [CreateCdsUnitTest](#createcdsunittest-high-level-unit-test)
    - [CreateFunctionGroupUnitTest](#createfunctiongroupunittest-high-level-unit-test)
    - [CreateProgramUnitTest](#createprogramunittest-high-level-unit-test)
    - [CreateUnitTest](#createunittest-high-level-unit-test)
    - [DeleteCdsUnitTest](#deletecdsunittest-high-level-unit-test)
    - [DeleteUnitTest](#deleteunittest-high-level-unit-test)
    - [GetCdsUnitTest](#getcdsunittest-high-level-unit-test)
    - [GetCdsUnitTestResult](#getcdsunittestresult-high-level-unit-test)
    - [GetCdsUnitTestStatus](#getcdsunitteststatus-high-level-unit-test)
    - [GetUnitTest](#getunittest-high-level-unit-test)
    - [GetUnitTestResult](#getunittestresult-high-level-unit-test)
    - [GetUnitTestStatus](#getunitteststatus-high-level-unit-test)
    - [RunCdsUnitTest](#runcdsunittest-high-level-unit-test)
    - [RunFunctionGroupUnitTest](#runfunctiongroupunittest-high-level-unit-test)
    - [RunFunctionModuleUnitTest](#runfunctionmoduleunittest-high-level-unit-test)
    - [RunProgramUnitTest](#runprogramunittest-high-level-unit-test)
    - [RunUnitTest](#rununittest-high-level-unit-test)
    - [UpdateCdsUnitTest](#updatecdsunittest-high-level-unit-test)
    - [UpdateFunctionGroupUnitTest](#updatefunctiongroupunittest-high-level-unit-test)
    - [UpdateProgramUnitTest](#updateprogramunittest-high-level-unit-test)
    - [UpdateUnitTest](#updateunittest-high-level-unit-test)
- [Streamable HTTP Binaries](#streamable-http-binaries)

---

<a id="high-level-group"></a>
## High-Level Group

<a id="high-level-atc"></a>
### High-Level / Atc

<a id="getatcfindings-high-level-atc"></a>
#### GetATCFindings (High-Level / Atc)
**Description:** [read-only] Reads the findings of the ATC run whose worklist is named by worklist_id, for a run started with wait=true or wait=false. Answers each finding with the object, the source position (location and line), the priority, which check ran and what it said, plus how many objects were covered and the counts per priority. With detail=full each finding also carries the column, check_id, check_class, message_id, documentation_uri (the finding's ATC documentation), exemption_approval and exemption_kind as the worklist gives them, and quickfixes (the manual, automatic, pseudo, ai_based and ai_enabled flags of the finding's quick fixes). Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/atc/high/handleGetATCFindings.ts`

**Parameters:**
- `timeout` (integer, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `worklist_id` (string, required) - Worklist identifier an ATC run answered.

---

<a id="getatcrunstatus-high-level-atc"></a>
#### GetATCRunStatus (High-Level / Atc)
**Description:** [read-only] Answers whether the ATC run named by run_id has ended (a run started with wait=false answers its run_id). Answers the status the server reports and whether it is finished — finished means ended, whatever the checks found. The run's findings are read by its worklist_id.

**Source:** `src/handlers/atc/high/handleGetATCRunStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier an ATC run started with wait=false answered.

---

<a id="runatc-high-level-atc"></a>
#### RunATC (High-Level / Atc)
**Description:** [read-only] Runs the ABAP Test Cockpit (ATC) checks of the check variant named by check_variant over the objects named by objects. Each object is a name and a type: class, interface, function_group, package, ddl_source, table, behavior_definition, program, program_include, function_include (with function_group, the include's function group), class_include (with include_kind: definitions, implementations, macros or testclasses; name is the class). Creates a worklist for the check variant, then starts the run. Answers worklist_id always — the run's findings are read by it, for either value of wait. With wait=false it also answers run_id, which the run's status is read by; with wait=true the server holds the request until the checks finish and answers the finding counts.

**Source:** `src/handlers/atc/high/handleRunATC.ts`

**Parameters:**
- See schema reference `runAtcSchema` in source file

---

<a id="high-level-behavior-definition"></a>
### High-Level / Behavior Definition

<a id="checkbehaviordefinition-high-level-behavior-definition"></a>
#### CheckBehaviorDefinition (High-Level / Behavior Definition)
**Description:** [read-only] Runs a syntax check on the RAP behavior definition (BDEF) named by name. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/behavior_definition/high/handleCheckBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name.
- `version` (string, optional) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createbehaviordefinition-high-level-behavior-definition"></a>
#### CreateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Create a new ABAP Behavior Definition (BDEF) in SAP system. Creates the behavior definition object in initial state.

**Source:** `src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `implementation_type` (string, required) - Implementation type: 'Managed', 'Unmanaged', 'Abstract', 'Projection'
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `name` (string, required) - Behavior Definition name (usually same as Root Entity name)
- `package_name` (string, required) - Package name
- `root_entity` (string, required) - Root Entity name (CDS View name)
- `transport_request` (string, optional) - Transport request number, not a task

---

<a id="deletebehaviordefinition-high-level-behavior-definition"></a>
#### DeleteBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/behavior_definition/high/handleDeleteBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getbehaviordefinition-high-level-behavior-definition"></a>
#### GetBehaviorDefinition (High-Level / Behavior Definition)
**Description:** [read-only] Reads the RAP behavior definition named by behavior_definition_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name.
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updatebehaviordefinition-high-level-behavior-definition"></a>
#### UpdateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Update source code of an existing ABAP Behavior Definition (BDEF). Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally (not recommended for stateful flows).
- `name` (string, required) - Behavior Definition name
- `source_code` (string, required) - New source code
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="high-level-behavior-implementation"></a>
### High-Level / Behavior Implementation

<a id="createbehaviorimplementation-high-level-behavior-implementation"></a>
#### CreateBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Creates the RAP behavior implementation class named by class_name for the behavior definition named by behavior_definition, in initial state: the FOR BEHAVIOR OF main source and the implementations include are written afterwards, the main source as a class source and the implementations include under the class lock.

**Source:** `src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation.ts`

**Parameters:**
- `behavior_definition` (string, required) - Behavior Definition name. The behavior definition must exist. Accepted for compatibility; not forwarded to the create request — the shipped create endpoint posts a metadata document (name/description/package) only. The class is bound to this behavior definition when its FOR BEHAVIOR OF main source is written, separately, via UpdateClass.
- `class_name` (string, required) - Behavior Implementation class name.
- `description` (string, optional) - Class description. If not provided, class_name will be used.
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletebehaviorimplementation-high-level-behavior-implementation"></a>
#### DeleteBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Delete an ABAP behavior implementation from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getbehaviorimplementation-high-level-behavior-implementation"></a>
#### GetBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** [read-only] Reads the RAP behavior implementation (its class) named by behavior_implementation_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name.
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updatebehaviorimplementation-high-level-behavior-implementation"></a>
#### UpdateBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Update source code of an existing ABAP behavior implementation class. Updates the implementations include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate behavior implementation after update. Default: true.
- `behavior_definition` (string, required) - Referenced Behavior Definition name. Accepted for compatibility; not forwarded to the write — the shipped update() no longer reads it (it writes the implementations include only, never the FOR BEHAVIOR OF main source).
- `class_name` (string, required) - Behavior Implementation class name. Must exist in the system.
- `implementation_code` (string, required) - Implementation code for the implementations include. Contains the actual behavior implementation methods.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-class"></a>
### High-Level / Class

<a id="checkclass-high-level-class"></a>
#### CheckClass (High-Level / Class)
**Description:** [read-only] Runs a syntax check on the ABAP class named by class_name. Can check existing class (active/inactive) or validate hypothetical source code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/class/high/handleCheckClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name.
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `version` (string, optional) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active.

---

<a id="createclass-high-level-class"></a>
#### CreateClass (High-Level / Class)
**Description:** Creates the ABAP class named by class_name in the package named by package_name, in initial state: the class object alone; its source code is written by an update of the class.

**Source:** `src/handlers/class/high/handleCreateClass.ts`

**Parameters:**
- `abstract` (boolean, optional) - Mark class as abstract. Default: false
- `class_name` (string, required) - Class name.
- `create_protected` (boolean, optional) - Protected constructor. Default: false
- `description` (string, optional) - Class description (defaults to class_name).
- `final` (boolean, optional) - Mark class as final. Default: false
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name.
- `superclass` (string, optional) - Optional superclass name.
- `transport_request` (string, optional) - Transport request number (required for transportable packages), not a task.

---

<a id="deleteclass-high-level-class"></a>
#### DeleteClass (High-Level / Class)
**Description:** Delete an ABAP class from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/class/high/handleDeleteClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="deletelocaldefinitions-high-level-class"></a>
#### DeleteLocalDefinitions (High-Level / Class)
**Description:** Delete local definitions from an ABAP class by clearing the definitions include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleDeleteLocalDefinitions.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name.
- `transport_request` (string, optional) - Transport request number, not a task.

---

<a id="deletelocalmacros-high-level-class"></a>
#### DeleteLocalMacros (High-Level / Class)
**Description:** Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros belong to older ABAP versions.

**Source:** `src/handlers/class/high/handleDeleteLocalMacros.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name.
- `transport_request` (string, optional) - Transport request number, not a task.

---

<a id="deletelocaltestclass-high-level-class"></a>
#### DeleteLocalTestClass (High-Level / Class)
**Description:** Clears the local test classes include of the ABAP class named by class_name. The include is cleared under the class lock; with activate_on_delete the class is activated.

**Source:** `src/handlers/class/high/handleDeleteLocalTestClass.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting test class. Default: false
- `class_name` (string, required) - Parent class name.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="deletelocaltypes-high-level-class"></a>
#### DeleteLocalTypes (High-Level / Class)
**Description:** Delete local types from an ABAP class by clearing the implementations include. Manages lock, update, unlock, and optional activation.

**Source:** `src/handlers/class/high/handleDeleteLocalTypes.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name.
- `transport_request` (string, optional) - Transport request number, not a task.

---

<a id="getclass-high-level-class"></a>
#### GetClass (High-Level / Class)
**Description:** [read-only] Reads the ABAP class named by class_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name.
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getlocaldefinitions-high-level-class"></a>
#### GetLocalDefinitions (High-Level / Class)
**Description:** [read-only] Reads the local definitions include (the definitions include) of the ABAP class named by class_name, active or inactive version. Returns { class_name, version, part: 'source', source }.

**Source:** `src/handlers/class/high/handleGetLocalDefinitions.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getlocalmacros-high-level-class"></a>
#### GetLocalMacros (High-Level / Class)
**Description:** [read-only] Reads the local macros include of the ABAP class named by class_name, active or inactive version. Returns { class_name, version, part: 'source', source }.

**Source:** `src/handlers/class/high/handleGetLocalMacros.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getlocaltestclass-high-level-class"></a>
#### GetLocalTestClass (High-Level / Class)
**Description:** [read-only] Reads the local test classes include of the ABAP class named by class_name, active or inactive version. Returns { class_name, version, part: 'source', source }.

**Source:** `src/handlers/class/high/handleGetLocalTestClass.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getlocaltypes-high-level-class"></a>
#### GetLocalTypes (High-Level / Class)
**Description:** [read-only] Reads the local types include (the implementations include) of the ABAP class named by class_name, active or inactive version. Returns { class_name, version, part: 'source', source }.

**Source:** `src/handlers/class/high/handleGetLocalTypes.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updateclass-high-level-class"></a>
#### UpdateClass (High-Level / Class)
**Description:** Update source code of an existing ABAP class. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/class/high/handleUpdateClass.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `class_name` (string, required) - Class name.
- `source_code` (string, required) - Complete ABAP class source code.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="updatelocaldefinitions-high-level-class"></a>
#### UpdateLocalDefinitions (High-Level / Class)
**Description:** Update local definitions (class-local types/constants) in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleUpdateLocalDefinitions.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating local definitions. Default: false
- `class_name` (string, required) - Parent class name.
- `definitions_code` (string, required) - Updated source code for local definitions.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="updatelocalmacros-high-level-class"></a>
#### UpdateLocalMacros (High-Level / Class)
**Description:** Update local macros in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleUpdateLocalMacros.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating local macros. Default: false
- `class_name` (string, required) - Parent class name.
- `macros_code` (string, required) - Updated source code for local macros.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="updatelocaltestclass-high-level-class"></a>
#### UpdateLocalTestClass (High-Level / Class)
**Description:** Writes test_class_code as the local test classes include of the ABAP class named by class_name. The include is written under the class lock; with activate_on_update the class is activated.

**Source:** `src/handlers/class/high/handleUpdateLocalTestClass.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating test class. Default: false
- `class_name` (string, required) - Parent class name.
- `test_class_code` (string, required) - Updated source code for the local test class.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="updatelocaltypes-high-level-class"></a>
#### UpdateLocalTypes (High-Level / Class)
**Description:** Update local types definitions in an ABAP class. Manages lock, update, unlock, and optional activation of parent class.

**Source:** `src/handlers/class/high/handleUpdateLocalTypes.ts`

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating local types. Default: false
- `class_name` (string, required) - Parent class name.
- `local_types_code` (string, required) - Updated source code for local types.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="high-level-common"></a>
### High-Level / Common

<a id="activateobjects-high-level-common"></a>
#### ActivateObjects (High-Level / Common)
**Description:** Activates the repository objects named by objects (each a name and a type) together, in one activation: any object type, related objects such as domains, data elements and tables at once.

**Source:** `src/handlers/common/high/handleActivateObjects.ts`

**Parameters:**
- See schema reference `activateObjectsSchema` in source file

---

<a id="getbehaviordefinitionversiondiff-high-level-common"></a>
#### GetBehaviorDefinitionVersionDiff (High-Level / Common)
**Description:** [read-only] Compares the two RAP behavior definition versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the RAP behavior definition's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the RAP behavior definition's version history.

---

<a id="getbehaviordefinitionversions-high-level-common"></a>
#### GetBehaviorDefinitionVersions (High-Level / Common)
**Description:** [read-only] Lists the version history of the RAP behavior definition named by behavior_definition_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - RAP behavior definition name.

---

<a id="getbehaviordefinitionversionsource-high-level-common"></a>
#### GetBehaviorDefinitionVersionSource (High-Level / Common)
**Description:** [read-only] Reads the source of the RAP behavior definition version named by content_uri, an entry of the RAP behavior definition's version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the RAP behavior definition's version history.

---

<a id="getclassversiondiff-high-level-common"></a>
#### GetClassVersionDiff (High-Level / Common)
**Description:** [read-only] Compares the two ABAP class versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP class's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP class's version history.

---

<a id="getclassversions-high-level-common"></a>
#### GetClassVersions (High-Level / Common)
**Description:** [read-only] Lists the version history of the ABAP class named by class_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `class_name` (string, required) - ABAP class name.

---

<a id="getclassversionsource-high-level-common"></a>
#### GetClassVersionSource (High-Level / Common)
**Description:** [read-only] Reads the source of the ABAP class version named by content_uri, an entry of the ABAP class's version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP class's version history.

---

<a id="getddlversiondiff-high-level-common"></a>
#### GetDdlVersionDiff (High-Level / Common)
**Description:** [read-only] Compares the two CDS view (DDL source) versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the CDS view (DDL source)'s version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the CDS view (DDL source)'s version history.

---

<a id="getddlversions-high-level-common"></a>
#### GetDdlVersions (High-Level / Common)
**Description:** [read-only] Lists the version history of the CDS view (DDL source) named by ddl_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `ddl_name` (string, required) - CDS view (DDL source) name.

---

<a id="getddlversionsource-high-level-common"></a>
#### GetDdlVersionSource (High-Level / Common)
**Description:** [read-only] Reads the source of the CDS view (DDL source) version named by content_uri, an entry of the CDS view (DDL source)'s version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the CDS view (DDL source)'s version history.

---

<a id="getfunctionmoduleversiondiff-high-level-common"></a>
#### GetFunctionModuleVersionDiff (High-Level / Common)
**Description:** [read-only] Compares the two ABAP function module versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP function module's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP function module's version history.

---

<a id="getfunctionmoduleversions-high-level-common"></a>
#### GetFunctionModuleVersions (High-Level / Common)
**Description:** [read-only] Lists the version history of the ABAP function module named by function_module_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `function_group_name` (string, required) - Owning function group name (required).
- `function_module_name` (string, required) - ABAP function module name.

---

<a id="getfunctionmoduleversionsource-high-level-common"></a>
#### GetFunctionModuleVersionSource (High-Level / Common)
**Description:** [read-only] Reads the source of the ABAP function module version named by content_uri, an entry of the ABAP function module's version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP function module's version history.

---

<a id="getinterfaceversiondiff-high-level-common"></a>
#### GetInterfaceVersionDiff (High-Level / Common)
**Description:** [read-only] Compares the two ABAP interface versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP interface's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP interface's version history.

---

<a id="getinterfaceversions-high-level-common"></a>
#### GetInterfaceVersions (High-Level / Common)
**Description:** [read-only] Lists the version history of the ABAP interface named by interface_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `interface_name` (string, required) - ABAP interface name.

---

<a id="getinterfaceversionsource-high-level-common"></a>
#### GetInterfaceVersionSource (High-Level / Common)
**Description:** [read-only] Reads the source of the ABAP interface version named by content_uri, an entry of the ABAP interface's version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP interface's version history.

---

<a id="getmetadataextensionversiondiff-high-level-common"></a>
#### GetMetadataExtensionVersionDiff (High-Level / Common)
**Description:** [read-only] Compares the two CDS metadata extension versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the CDS metadata extension's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the CDS metadata extension's version history.

---

<a id="getmetadataextensionversions-high-level-common"></a>
#### GetMetadataExtensionVersions (High-Level / Common)
**Description:** [read-only] Lists the version history of the CDS metadata extension named by metadata_extension_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - CDS metadata extension name.

---

<a id="getmetadataextensionversionsource-high-level-common"></a>
#### GetMetadataExtensionVersionSource (High-Level / Common)
**Description:** [read-only] Reads the source of the CDS metadata extension version named by content_uri, an entry of the CDS metadata extension's version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the CDS metadata extension's version history.

---

<a id="getstructureversiondiff-high-level-common"></a>
#### GetStructureVersionDiff (High-Level / Common)
**Description:** [read-only] Compares the two ABAP structure versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP structure's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP structure's version history.

---

<a id="getstructureversions-high-level-common"></a>
#### GetStructureVersions (High-Level / Common)
**Description:** [read-only] Lists the version history of the ABAP structure named by structure_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `structure_name` (string, required) - ABAP structure name.

---

<a id="getstructureversionsource-high-level-common"></a>
#### GetStructureVersionSource (High-Level / Common)
**Description:** [read-only] Reads the source of the ABAP structure version named by content_uri, an entry of the ABAP structure's version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP structure's version history.

---

<a id="gettableversiondiff-high-level-common"></a>
#### GetTableVersionDiff (High-Level / Common)
**Description:** [read-only] Compares the two ABAP table versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP table's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP table's version history.

---

<a id="gettableversions-high-level-common"></a>
#### GetTableVersions (High-Level / Common)
**Description:** [read-only] Lists the version history of the ABAP table named by table_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `table_name` (string, required) - ABAP table name.

---

<a id="gettableversionsource-high-level-common"></a>
#### GetTableVersionSource (High-Level / Common)
**Description:** [read-only] Reads the source of the ABAP table version named by content_uri, an entry of the ABAP table's version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP table's version history.

---

<a id="high-level-data-element"></a>
### High-Level / Data Element

<a id="checkdataelement-high-level-data-element"></a>
#### CheckDataElement (High-Level / Data Element)
**Description:** [read-only] Runs a syntax check on the ABAP data element named by data_element_name. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/data_element/high/handleCheckDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional) - Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createdataelement-high-level-data-element"></a>
#### CreateDataElement (High-Level / Data Element)
**Description:** Create a new ABAP data element in SAP system. Creates the data element object in initial state.

**Source:** `src/handlers/data_element/high/handleCreateDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `data_type` (string, optional (default: CHAR)) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'domain'.
- `decimals` (number, optional (default: 0)) - Decimal places. Usually inherited from domain.
- `description` (string, optional) - Data element description. If not provided, data_element_name will be used.
- `heading_label` (string, optional) - Heading field label (max 55 chars). Applied during update step after creation.
- `length` (number, optional (default: 100)) - Data type length. Usually inherited from domain.
- `long_label` (string, optional) - Long field label (max 40 chars). Applied during update step after creation.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `medium_label` (string, optional) - Medium field label (max 20 chars). Applied during update step after creation.
- `package_name` (string, required) - Package name
- `search_help` (string, optional) - Search help name. Applied during update step after creation.
- `search_help_parameter` (string, optional) - Search help parameter. Applied during update step after creation.
- `set_get_parameter` (string, optional) - Set/Get parameter ID. Applied during update step after creation.
- `short_label` (string, optional) - Short field label (max 10 chars). Applied during update step after creation.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.
- `type_kind` (string, optional (default: domain)) - Type kind: 'domain' (default), 'predefinedAbapType', 'refToPredefinedAbapType', 'refToDictionaryType', 'refToClifType'. If not specified, defaults to 'domain'.
- `type_name` (string, optional) - Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')

---

<a id="deletedataelement-high-level-data-element"></a>
#### DeleteDataElement (High-Level / Data Element)
**Description:** Delete an ABAP data element from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/data_element/high/handleDeleteDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getdataelement-high-level-data-element"></a>
#### GetDataElement (High-Level / Data Element)
**Description:** [read-only] Reads the ABAP data element named by data_element_name in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatedataelement-high-level-data-element"></a>
#### UpdateDataElement (High-Level / Data Element)
**Description:** Update an existing ABAP data element. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.

**Source:** `src/handlers/data_element/high/handleUpdateDataElement.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - Activate data element after update (default: true)
- `data_element_name` (string, required) - Data element name to update
- `data_type` (string, optional) - Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType
- `decimals` (number, optional) - Decimals - for predefinedAbapType or refToPredefinedAbapType
- `description` (string, optional) - New data element description
- `field_label_heading` (string, optional) - Heading field label (max 55 chars)
- `field_label_long` (string, optional) - Long field label (max 40 chars)
- `field_label_medium` (string, optional) - Medium field label (max 20 chars)
- `field_label_short` (string, optional) - Short field label (max 10 chars)
- `length` (number, optional) - Length - for predefinedAbapType or refToPredefinedAbapType
- `package_name` (string, required) - Package name
- `search_help` (string, optional) - Search help name
- `search_help_parameter` (string, optional) - Search help parameter
- `set_get_parameter` (string, optional) - Set/Get parameter ID
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.
- `type_kind` (string, optional (default: domain)) - Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType
- `type_name` (string, optional) - Type name: domain name, data element name, or class name (depending on type_kind)

---

<a id="high-level-ddl"></a>
### High-Level / Ddl

<a id="checkddl-high-level-ddl"></a>
#### CheckDdl (High-Level / Ddl)
**Description:** [read-only] Runs a syntax check on the CDS view named by ddl_name. Can check existing view (active/inactive) or validate hypothetical DDL source. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/ddl/high/handleCheckDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - CDS view name to check, passed as ddl_name.
- `ddl_source` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Without `version` the active version is checked.

---

<a id="createddl-high-level-ddl"></a>
#### CreateDdl (High-Level / Ddl)
**Description:** Creates the CDS view or classic DDL view named by ddl_name in the package named by package_name, in initial state: the DDL source object, its DDL source code written afterwards.

**Source:** `src/handlers/ddl/high/handleCreateDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `description` (string, optional) - Optional description (defaults to ddl_name).
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number (required for transportable packages), not a task.

---

<a id="deleteddl-high-level-ddl"></a>
#### DeleteDdl (High-Level / Ddl)
**Description:** Delete a DDL source from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/ddl/high/handleDeleteDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getddl-high-level-ddl"></a>
#### GetDdl (High-Level / Ddl)
**Description:** [read-only] Reads the CDS view (or classic DDL view) named by ddl_name in one request: its DDL source (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/ddl/high/handleGetDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updateddl-high-level-ddl"></a>
#### UpdateDdl (High-Level / Ddl)
**Description:** Updates the DDL source code of the existing CDS view or classic DDL view named by ddl_name to ddl_source. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/ddl/high/handleUpdateDdl.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `ddl_name` (string, required) - DDL source name.
- `ddl_source` (string, required) - Complete DDL source code.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="high-level-ddlx"></a>
### High-Level / Ddlx

<a id="checkmetadataextension-high-level-ddlx"></a>
#### CheckMetadataExtension (High-Level / Ddlx)
**Description:** [read-only] Runs a syntax check on the CDS metadata extension (DDLX) named by name. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/ddlx/high/handleCheckMetadataExtension.ts`

**Parameters:**
- `name` (string, required) - Metadata extension name.
- `version` (string, optional (default: active)) - Which version to check: 'active' (default) or 'inactive', the unsaved one right after a write. This endpoint does not fall back to whichever exists.

---

<a id="createmetadataextension-high-level-ddlx"></a>
#### CreateMetadataExtension (High-Level / Ddlx)
**Description:** Create a new ABAP Metadata Extension (DDLX) in SAP system. Creates the metadata extension object in initial state.

**Source:** `src/handlers/ddlx/high/handleCreateMetadataExtension.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `name` (string, required) - Metadata Extension name
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number, not a task

---

<a id="updatemetadataextension-high-level-ddlx"></a>
#### UpdateMetadataExtension (High-Level / Ddlx)
**Description:** Update source code of an existing ABAP Metadata Extension (DDLX). Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/ddlx/high/handleUpdateMetadataExtension.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `lock_handle` (string, optional) - Lock handle from LockObject. If not provided, will attempt to lock internally.
- `name` (string, required) - Metadata Extension name
- `source_code` (string, required) - New source code
- `transport_request` (string, optional) - Transport request number (required for transportable packages), not a task.

---

<a id="high-level-domain"></a>
### High-Level / Domain

<a id="checkdomain-high-level-domain"></a>
#### CheckDomain (High-Level / Domain)
**Description:** [read-only] Runs a syntax check on the ABAP domain named by domain_name. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/domain/high/handleCheckDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional) - Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createdomain-high-level-domain"></a>
#### CreateDomain (High-Level / Domain)
**Description:** Create a new ABAP domain in SAP system. Creates the domain object in initial state.

**Source:** `src/handlers/domain/high/handleCreateDomain.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - (optional) Activate domain after creation (default: true)
- `conversion_exit` (string, optional) - (optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional (default: CHAR)) - (optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional (default: 0)) - (optional) Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - (optional) Domain description. If not provided, domain_name will be used.
- `domain_name` (string, required) - Domain name.
- `fixed_values` (array, optional) - (optional) Array of fixed values for domain value range
- `length` (number, optional (default: 100)) - (optional) Field length (max depends on datatype)
- `lowercase` (boolean, optional (default: false)) - (optional) Allow lowercase input
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, optional) - (optional) Package name
- `sign_exists` (boolean, optional (default: false)) - (optional) Field has sign (+/-)
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable packages.
- `value_table` (string, optional) - (optional) Value table name for foreign key relationship

---

<a id="deletedomain-high-level-domain"></a>
#### DeleteDomain (High-Level / Domain)
**Description:** Delete an ABAP domain from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/domain/high/handleDeleteDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getdomain-high-level-domain"></a>
#### GetDomain (High-Level / Domain)
**Description:** [read-only] Reads the ABAP domain named by domain_name in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatedomain-high-level-domain"></a>
#### UpdateDomain (High-Level / Domain)
**Description:** Update an existing ABAP domain. Locks, updates with provided parameters (complete replacement), unlocks, and optionally activates.

**Source:** `src/handlers/domain/high/handleUpdateDomain.ts`

**Parameters:**
- `activate` (boolean, optional (default: true))) - Activate domain after update (default: true)
- `conversion_exit` (string, optional) - Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional) - Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional) - Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - New domain description (optional)
- `domain_name` (string, required) - Domain name to update
- `fixed_values` (array, optional) - Array of fixed values for domain value range
- `length` (number, optional) - Field length (max depends on datatype)
- `lowercase` (boolean, optional) - Allow lowercase input
- `package_name` (string, required) - Package name
- `sign_exists` (boolean, optional) - Field has sign (+/-)
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.
- `value_table` (string, optional) - Value table name for foreign key relationship

---

<a id="high-level-function"></a>
### High-Level / Function

<a id="checkfunctiongroup-high-level-function"></a>
#### CheckFunctionGroup (High-Level / Function)
**Description:** [read-only] Runs a syntax check on the ABAP function group named by function_group_name. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/function/high/handleCheckFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name.
- `version` (string, optional) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="checkfunctionmodule-high-level-function"></a>
#### CheckFunctionModule (High-Level / Function)
**Description:** [read-only] Runs a syntax check on the ABAP function module named by function_module_name in the function group named by function_group_name. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/function/high/handleCheckFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module.
- `function_module_name` (string, required) - Function module name.
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: active.

---

<a id="createfunctiongroup-high-level-function"></a>
#### CreateFunctionGroup (High-Level / Function)
**Description:** Create a new ABAP function group in SAP system. Function groups serve as containers for function modules.

**Source:** `src/handlers/function/high/handleCreateFunctionGroup.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate function group after creation. Default: true. Set to false for batch operations.
- `description` (string, optional) - Function group description. If not provided, function_group_name will be used.
- `function_group_name` (string, required) - Function group name. Up to 26 characters.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="createfunctionmodule-high-level-function"></a>
#### CreateFunctionModule (High-Level / Function)
**Description:** Create a new ABAP function module within an existing function group. Creates the function module in initial state.

**Source:** `src/handlers/function/high/handleCreateFunctionModule.ts`

**Parameters:**
- `description` (string, optional) - Optional description for the function module
- `function_group_name` (string, required) - Parent function group name
- `function_module_name` (string, required) - Function module name. Up to 30 characters.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="updatefunctiongroup-high-level-function"></a>
#### UpdateFunctionGroup (High-Level / Function)
**Description:** Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules, which carry the source; this updates the group's metadata alone. Locks the group, writes, and unlocks it.

**Source:** `src/handlers/function/high/handleUpdateFunctionGroup.ts`

**Parameters:**
- `description` (string, required) - New description for the function group.
- `function_group_name` (string, required) - Function group name. Must exist in the system.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="updatefunctionmodule-high-level-function"></a>
#### UpdateFunctionModule (High-Level / Function)
**Description:** Update source code of an existing ABAP function module. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/function/high/handleUpdateFunctionModule.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate function module after source update. Default: false. Set to true to activate immediately.
- `function_group_name` (string, required) - Function group name containing the function module.
- `function_module_name` (string, required) - Function module name. Function module must already exist.
- `source_code` (string, required) - Complete ABAP function module source code, from FUNCTION to ENDFUNCTION.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable function modules.

---

<a id="high-level-function-group"></a>
### High-Level / Function Group

<a id="deletefunctiongroup-high-level-function-group"></a>
#### DeleteFunctionGroup (High-Level / Function Group)
**Description:** Delete an ABAP function group from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/function_group/high/handleDeleteFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getfunctiongroup-high-level-function-group"></a>
#### GetFunctionGroup (High-Level / Function Group)
**Description:** [read-only] Reads the ABAP function group named by function_group_name in one request: its ADT metadata document (package, description, contents). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="high-level-function-include"></a>
### High-Level / Function Include

<a id="createfunctioninclude-high-level-function-include"></a>
#### CreateFunctionInclude (High-Level / Function Include)
**Description:** Create a new ABAP include within an existing function group. Creates the include in initial state.

**Source:** `src/handlers/function_include/high/handleCreateFunctionInclude.ts`

**Parameters:**
- `description` (string, optional) - Optional description for the include
- `function_group_name` (string, required) - Parent function group name
- `include_name` (string, required) - Include name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletefunctioninclude-high-level-function-include"></a>
#### DeleteFunctionInclude (High-Level / Function Include)
**Description:** Delete an ABAP function group include from the SAP system via ADT deletion API. Note: function module includes must be deleted via the Function Builder; the backend rejects such deletions. Transport request optional for local objects.

**Source:** `src/handlers/function_include/high/handleDeleteFunctionInclude.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the include.
- `include_name` (string, required) - Include name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="updatefunctioninclude-high-level-function-include"></a>
#### UpdateFunctionInclude (High-Level / Function Include)
**Description:** Update source code of an existing ABAP function group include.

**Source:** `src/handlers/function_include/high/handleUpdateFunctionInclude.ts`

**Parameters:**
- `activate` (boolean, optional (default: false)) - Activate the include after the source update. Default: false. Set true to make the updated source the active version immediately.
- `function_group_name` (string, required) - Function group name containing the include.
- `include_name` (string, required) - Include name. Include must already exist.
- `source_code` (string, required) - Complete ABAP include source code.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable includes.

---

<a id="high-level-function-module"></a>
### High-Level / Function Module

<a id="deletefunctionmodule-high-level-function-module"></a>
#### DeleteFunctionModule (High-Level / Function Module)
**Description:** Delete an ABAP function module from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/function_module/high/handleDeleteFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name containing the function module.
- `function_module_name` (string, required) - FunctionModule name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getfunctionmodule-high-level-function-module"></a>
#### GetFunctionModule (High-Level / Function Module)
**Description:** [read-only] Reads the ABAP function module named by function_module_name, BAPI or RFC-enabled ones included, in the function group named by function_group_name, in one request: its source code, which declares the parameter signature (part "source", the default; active or inactive version), or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/function_module/high/handleGetFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group containing the function module.
- `function_module_name` (string, required) - Function module name.
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="high-level-interface"></a>
### High-Level / Interface

<a id="checkinterface-high-level-interface"></a>
#### CheckInterface (High-Level / Interface)
**Description:** [read-only] Runs a syntax check on the ABAP interface named by interface_name. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/interface/high/handleCheckInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name.
- `version` (string, optional) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createinterface-high-level-interface"></a>
#### CreateInterface (High-Level / Interface)
**Description:** Create a new ABAP interface in SAP system. Creates the interface object in initial state.

**Source:** `src/handlers/interface/high/handleCreateInterface.ts`

**Parameters:**
- `description` (string, optional) - Interface description. If not provided, interface_name will be used.
- `interface_name` (string, required) - Interface name.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deleteinterface-high-level-interface"></a>
#### DeleteInterface (High-Level / Interface)
**Description:** Delete an ABAP interface from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/interface/high/handleDeleteInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getinterface-high-level-interface"></a>
#### GetInterface (High-Level / Interface)
**Description:** [read-only] Reads the ABAP interface named by interface_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name.
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updateinterface-high-level-interface"></a>
#### UpdateInterface (High-Level / Interface)
**Description:** Update source code of an existing ABAP interface. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/interface/high/handleUpdateInterface.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate interface after update. Default: true.
- `interface_name` (string, required) - Interface name. Must exist in the system.
- `source_code` (string, required) - Complete ABAP interface source code with INTERFACE...ENDINTERFACE section.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-message-class"></a>
### High-Level / Message Class

<a id="createmessageclass-high-level-message-class"></a>
#### CreateMessageClass (High-Level / Message Class)
**Description:** Creates the ABAP message class (T100) named by message_class_name, with its description, in the package named by package_name: a shell whose messages are added afterwards. A message class is in effect once saved.

**Source:** `src/handlers/message_class/high/handleCreateMessageClass.ts`

**Parameters:**
- `description` (string, optional) - (optional) Short description. If not provided, message_class_name is used.
- `master_language` (string, optional) - (optional) Master/original language (e.g. "EN", "DE"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `message_class_name` (string, required) - Message class name.
- `package_name` (string, required) - Package name.
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable packages.

---

<a id="createmessageclassmessage-high-level-message-class"></a>
#### CreateMessageClassMessage (High-Level / Message Class)
**Description:** Adds the message numbered msgno, with the text msgtext, to the existing ABAP message class (T100) named by message_class_name.

**Source:** `src/handlers/message_class/high/handleCreateMessageClassMessage.ts`

**Parameters:**
- `description` (string, optional) - (optional) Long description for the message.
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").
- `msgtext` (string, required) - Message text. May contain placeholders &1 &2 &3 &4 (or &).
- `self_explanatory` (boolean, optional (default: false)) - (optional) Mark the message as self-explanatory (no long text needed). Default: false.
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable objects.

---

<a id="deletemessageclass-high-level-message-class"></a>
#### DeleteMessageClass (High-Level / Message Class)
**Description:** Delete an ABAP message class (MSAG) and all of its messages from the SAP system via ADT deletion API. Transport request required for transportable objects, optional for local objects.

**Source:** `src/handlers/message_class/high/handleDeleteMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects, optional for local ones.

---

<a id="deletemessageclassmessage-high-level-message-class"></a>
#### DeleteMessageClassMessage (High-Level / Message Class)
**Description:** Remove one message (by number) from an ABAP message class (T100), keeping the class and its other messages. Transport request required for transportable objects.

**Source:** `src/handlers/message_class/high/handleDeleteMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number to delete (e.g., "001").
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects, optional for local ones.

---

<a id="getmessageclass-high-level-message-class"></a>
#### GetMessageClass (High-Level / Message Class)
**Description:** [read-only] Reads the ABAP message class (MSAG/T100) named by message_class_name in one request: its ADT metadata document (XML: name, description, package, master language, messages). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name.

---

<a id="getmessageclassmessage-high-level-message-class"></a>
#### GetMessageClassMessage (High-Level / Message Class)
**Description:** [read-only] Reads the message numbered msgno of the ABAP message class (MSAG/T100) named by message_class_name in one request. Answers the one message under `message`: its number (msgno), text (msgtext), self-explanatory flag (selfexplainatory), long-text flag (documented), last changer (lastchangedby), change time (lastmodified), and every other field the system gives the message. A number absent from the class is refused as missing.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="updatemessageclass-high-level-message-class"></a>
#### UpdateMessageClass (High-Level / Message Class)
**Description:** Updates the header of the ABAP message class named by message_class_name: its description.

**Source:** `src/handlers/message_class/high/handleUpdateMessageClass.ts`

**Parameters:**
- `description` (string, required) - New short description for the message class.
- `message_class_name` (string, required) - Message class name.
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable objects.

---

<a id="updatemessageclassmessage-high-level-message-class"></a>
#### UpdateMessageClassMessage (High-Level / Message Class)
**Description:** Change the text / flags of an existing message in an ABAP message class (T100). Creates the message when the class lacks it (upsert).

**Source:** `src/handlers/message_class/high/handleUpdateMessageClassMessage.ts`

**Parameters:**
- `description` (string, optional) - (optional) Long description for the message.
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").
- `msgtext` (string, required) - New message text. May contain placeholders &1 &2 &3 &4 (or &).
- `self_explanatory` (boolean, optional) - (optional) Mark the message as self-explanatory.
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable objects.

---

<a id="high-level-metadata-extension"></a>
### High-Level / Metadata Extension

<a id="deletemetadataextension-high-level-metadata-extension"></a>
#### DeleteMetadataExtension (High-Level / Metadata Extension)
**Description:** Delete an ABAP metadata extension from the SAP system. Transport request optional for local objects.

**Source:** `src/handlers/metadata_extension/high/handleDeleteMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getmetadataextension-high-level-metadata-extension"></a>
#### GetMetadataExtension (High-Level / Metadata Extension)
**Description:** [read-only] Reads the CDS metadata extension named by metadata_extension_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name.
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="high-level-package"></a>
### High-Level / Package

<a id="checkpackage-high-level-package"></a>
#### CheckPackage (High-Level / Package)
**Description:** [read-only] Runs a syntax check on the ABAP package named by package_name. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/package/high/handleCheckPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name.
- `super_package` (string, optional) - Optional, and not read by the check endpoint — see CheckPackageLow. Requiring it refused the call before any request was made, for a package with no parent.

---

<a id="createpackage-high-level-package"></a>
#### CreatePackage (High-Level / Package)
**Description:** Create a new ABAP package in SAP system. Packages are containers for development objects and are essential for organizing code.

**Source:** `src/handlers/package/high/handleCreatePackage.ts`

**Parameters:**
- None

---

<a id="deletepackage-high-level-package"></a>
#### DeletePackage (High-Level / Package)
**Description:** Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for local objects. A package can be saved only once per ABAP session (PAK/058 "Package … is already locked" otherwise). The package tools of this server save a package on a session apart from this one, so a delete here works after them; for a package saved elsewhere through this connection, pass force_new_connection=true to delete from a new session, closed afterwards.

**Source:** `src/handlers/package/high/handleDeletePackage.ts`

**Parameters:**
- `force_new_connection` (boolean, optional) - Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false.
- `package_name` (string, required) - Package name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getpackage-high-level-package"></a>
#### GetPackage (High-Level / Package)
**Description:** [read-only] Reads the ABAP package named by package_name in one request: its ADT metadata document (description, super-package, sub-packages, ...), active or inactive version. Returns it under `metadata`, with `part: "metadata"`: a summary, the details or the document as SAP sent it, per `detail`.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="updatepackage-high-level-package"></a>
#### UpdatePackage (High-Level / Package)
**Description:** Update the description of an existing ABAP package. Locks the package, writes, and unlocks it again, whatever the write answered. Over RFC this runs in an ABAP session of its own, closed afterwards.

**Source:** `src/handlers/package/high/handleUpdatePackage.ts`

**Parameters:**
- `description` (string, required) - New description for the package.
- `package_name` (string, required) - Package name. Package must already exist.
- `transport_request` (string, optional) - Transport request number (required for transportable packages), not a task.

---

<a id="high-level-program"></a>
### High-Level / Program

<a id="checkprogram-high-level-program"></a>
#### CheckProgram (High-Level / Program)
**Description:** [read-only] Runs a syntax check on the ABAP program (report) named by program_name. Returns syntax errors, warnings, and messages. On ABAP Cloud, the programs are SAP's standard programs.

**Source:** `src/handlers/program/high/handleCheckProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name.
- `version` (string, optional) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createprogram-high-level-program"></a>
#### CreateProgram (High-Level / Program)
**Description:** Create a new ABAP program (report) in SAP system. Creates the program object in initial state.

**Source:** `src/handlers/program/high/handleCreateProgram.ts`

**Parameters:**
- `application` (string, optional) - Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'
- `description` (string, optional) - Program description. If not provided, program_name will be used.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name
- `program_name` (string, required) - Program name.
- `program_type` (string, optional) - Program type: 'executable' (Report), 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool'. Default: 'executable'
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deleteprogram-high-level-program"></a>
#### DeleteProgram (High-Level / Program)
**Description:** Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/program/high/handleDeleteProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getprogram-high-level-program"></a>
#### GetProgram (High-Level / Program)
**Description:** [read-only] Reads the ABAP program (report) named by program_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read. On ABAP Cloud, the programs are SAP's standard programs.

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Parameters:**
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `program_name` (string, required) - Program name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updateprogram-high-level-program"></a>
#### UpdateProgram (High-Level / Program)
**Description:** Update source code of an existing ABAP program. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/program/high/handleUpdateProgram.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.
- `program_name` (string, required) - Program name. Program must already exist.
- `source_code` (string, required) - Complete ABAP program source code.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="high-level-service-binding"></a>
### High-Level / Service Binding

<a id="createservicebinding-high-level-service-binding"></a>
#### CreateServiceBinding (High-Level / Service Binding)
**Description:** Create an OData service binding (V2 or V4, UI or Web API) for a service definition, in initial state.

**Source:** `src/handlers/service_binding/high/handleCreateServiceBinding.ts`

**Parameters:**
- `activate` (boolean, optional (default: true)) - Activate the service binding after create, then read its service group. Default: true.
- `binding_variant` (string, optional (default: ODATA_V4_UI)) - Service binding variant. ODATA_V4_UI = OData V4 for Fiori Elements, ODATA_V4_WEB_API = OData V4 Web API, ODATA_V2_UI = OData V2 for Fiori Elements, ODATA_V2_WEB_API = OData V2 Web API.
- `description` (string, optional) - Optional description. Defaults to service_binding_name when omitted.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - ABAP package name.
- `response_format` (string, optional (default: xml)) - Accepted for backward compatibility; no longer affects the answer, which is always the structured write result.
- `service_binding_name` (string, required) - Service binding name.
- `service_definition_name` (string, required) - Referenced service definition name.
- `service_name` (string, optional) - Published service name. Default: service_binding_name if omitted.
- `service_version` (string, optional) - Published service version. Default: 0001.
- `transport_request` (string, optional) - Optional transport request for transport checks.

---

<a id="deleteservicebinding-high-level-service-binding"></a>
#### DeleteServiceBinding (High-Level / Service Binding)
**Description:** Delete ABAP service binding via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/service_binding/high/handleDeleteServiceBinding.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - Accepted for backward compatibility; no longer affects the answer, which is always the structured deletion result.
- `service_binding_name` (string, required) - Service binding name to delete.
- `transport_request` (string, optional) - Optional transport request for deletion transport flow.

---

<a id="getservicebinding-high-level-service-binding"></a>
#### GetServiceBinding (High-Level / Service Binding)
**Description:** [read-only] Reads the OData service binding named by service_binding_name in one request: its binding document (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), each in the response_format given. Returns the part read.

**Source:** `src/handlers/service_binding/high/handleGetServiceBinding.ts`

**Parameters:**
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `response_format` (string, optional (default: xml)) - Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.
- `service_binding_name` (string, required) - Service binding name. Case-insensitive.

---

<a id="listservicebindingtypes-high-level-service-binding"></a>
#### ListServiceBindingTypes (High-Level / Service Binding)
**Description:** [read-only] Lists the available service binding types (for example ODataV2/ODataV4) from the ADT Business Services endpoint, in the response_format given.

**Source:** `src/handlers/service_binding/high/handleListServiceBindingTypes.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - Shape of the answer: the document as the server sent it, the same parsed, or a flat list of the type names.

---

<a id="updateservicebinding-high-level-service-binding"></a>
#### UpdateServiceBinding (High-Level / Service Binding)
**Description:** Update publication state of an existing ABAP service binding.

**Source:** `src/handlers/service_binding/high/handleUpdateServiceBinding.ts`

**Parameters:**
- `binding_variant` (string, required (default: ODATA_V4_UI)) - Service binding variant. Determines OData version for publish/unpublish routing.
- `desired_publication_state` (string, required) - Target publication state.
- `response_format` (string, optional (default: xml)) - Accepted for backward compatibility; no longer affects the answer, which is always the structured write result.
- `service_binding_name` (string, required) - Service binding name to update.
- `service_name` (string, required) - Published service name, from the binding. Required: an OData V2 publication job resolves the service by name and version and refuses without them. Ignored for V4, where the request names its target on its own.
- `service_version` (string, optional) - Published service version. Default 0001. Used by an OData V2 publication job together with the service name; ignored for V4.

---

<a id="validateservicebinding-high-level-service-binding"></a>
#### ValidateServiceBinding (High-Level / Service Binding)
**Description:** [read-only] Validates a new service binding named by service_binding_name for the service definition named by service_definition_name, in the package and version given, through the ADT validation endpoint.

**Source:** `src/handlers/service_binding/high/handleValidateServiceBinding.ts`

**Parameters:**
- `description` (string, optional) - Optional description used during validation.
- `package_name` (string, required) - ABAP package of the binding, which the validation checks.
- `service_binding_name` (string, required) - Service binding name to validate.
- `service_binding_version` (string, optional) - Service binding version (for example: 1.0). Accepted for backward compatibility; the transport check this now runs does not read it.
- `service_definition_name` (string, required) - Service definition linked to binding. Accepted for backward compatibility; the transport check this now runs does not read it.

---

<a id="high-level-service-definition"></a>
### High-Level / Service Definition

<a id="createservicedefinition-high-level-service-definition"></a>
#### CreateServiceDefinition (High-Level / Service Definition)
**Description:** Create a service definition that exposes CDS views as an OData service, in initial state.

**Source:** `src/handlers/service_definition/high/handleCreateServiceDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after creation. Default: true.
- `description` (string, optional) - Service definition description. If not provided, service_definition_name will be used.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name
- `service_definition_name` (string, required) - Service definition name.
- `source_code` (string, optional) - Service definition source code (optional). If not provided, a minimal template will be created.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deleteservicedefinition-high-level-service-definition"></a>
#### DeleteServiceDefinition (High-Level / Service Definition)
**Description:** Delete an ABAP service definition from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/service_definition/high/handleDeleteServiceDefinition.ts`

**Parameters:**
- `service_definition_name` (string, required) - ServiceDefinition name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getservicedefinition-high-level-service-definition"></a>
#### GetServiceDefinition (High-Level / Service Definition)
**Description:** [read-only] Reads the service definition named by service_definition_name in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Parameters:**
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `service_definition_name` (string, required) - ServiceDefinition name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updateservicedefinition-high-level-service-definition"></a>
#### UpdateServiceDefinition (High-Level / Service Definition)
**Description:** Update source code of an existing ABAP service definition. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/service_definition/high/handleUpdateServiceDefinition.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after update. Default: true.
- `service_definition_name` (string, required) - Service definition name. Must exist in the system.
- `source_code` (string, required) - Complete service definition source code.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-structure"></a>
### High-Level / Structure

<a id="checkstructure-high-level-structure"></a>
#### CheckStructure (High-Level / Structure)
**Description:** [read-only] Runs a syntax check on the ABAP structure named by structure_name. Can check existing structure (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/structure/high/handleCheckStructure.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `structure_name` (string, required) - Structure name.
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Without `version` the active version is checked.

---

<a id="createstructure-high-level-structure"></a>
#### CreateStructure (High-Level / Structure)
**Description:** Create a new ABAP structure in SAP system. Creates the structure object in initial state.

**Source:** `src/handlers/structure/high/handleCreateStructure.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate structure after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `description` (string, optional) - Structure description. If not provided, structure_name will be used.
- `fields` (array, required (default: 0)) - Does not reach creation — the shipped create endpoint posts a metadata document only. Use UpdateStructure (with ddl_code) after creating to set the fields.
- `includes` (array, optional) - Does not reach creation — see `fields`. Use UpdateStructure (with ddl_code) after creating to set includes.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name
- `structure_name` (string, required) - Structure name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletestructure-high-level-structure"></a>
#### DeleteStructure (High-Level / Structure)
**Description:** Delete an ABAP structure from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/structure/high/handleDeleteStructure.ts`

**Parameters:**
- `structure_name` (string, required) - Structure name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getstructure-high-level-structure"></a>
#### GetStructure (High-Level / Structure)
**Description:** [read-only] Reads the ABAP structure named by structure_name in one request: its definition with its fields, as source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Parameters:**
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `structure_name` (string, required) - Structure name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updatestructure-high-level-structure"></a>
#### UpdateStructure (High-Level / Structure)
**Description:** Update DDL source code of an existing ABAP structure. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/structure/high/handleUpdateStructure.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate structure after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for structure. Example: '@EndUserText.label : \'My Structure\' @AbapCatalog.tableCategory : #TRANSPARENT define structure zz_s_test_001 { client : abap.clnt not null; id : abap.char(10); name : abap.char(255); }'
- `structure_name` (string, required) - Structure name. Structure must already exist.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-system"></a>
### High-Level / System

<a id="getpackagetree-high-level-system"></a>
#### GetPackageTree (High-Level / System)
**Description:** [read-only] Returns the complete tree of the ABAP package named by package_name: its subpackages and objects. Returns hierarchical tree with object names, types, and descriptions. Takes package_name (one package: its tree) or package_names (several packages: one entry per package, in the order given, each { package_name, tree, metadata } or { package_name, error }). Read in ADT batch envelopes: the package metadata with the root node structure, then each level of the walk; with include_descriptions, as single requests, several at a time. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Source:** `src/handlers/system/high/handleGetPackageTree.ts`

**Parameters:**
- `debug` (boolean, optional (default: false)) - Include diagnostic metadata in response (counts, types, hierarchy info). Default: false
- `include_descriptions` (boolean, optional (default: false)) - Include each object's description in the response. The package metadata and the walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes. Default: false
- `include_subpackages` (boolean, optional (default: true)) - Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true
- `max_depth` (integer, optional (default: 5)) - Maximum depth for recursive package traversal. Default: 5
- `package_name` (string, optional) - Package name (give this or package_names)
- `package_names` (array, optional) - Several package names, read together (give this or package_name)
- `timeout` (integer, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="high-level-table"></a>
### High-Level / Table

<a id="checktable-high-level-table"></a>
#### CheckTable (High-Level / Table)
**Description:** [read-only] Runs a syntax check on the ABAP database table named by table_name. Can check existing table (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/table/high/handleCheckTable.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `table_name` (string, required) - Table name.
- `version` (string, optional) - Version to check: 'active', 'inactive', or 'new'. Without `version` the active version is checked.

---

<a id="createtable-high-level-table"></a>
#### CreateTable (High-Level / Table)
**Description:** Create a new ABAP table in SAP system. Creates the table object in initial state.

**Source:** `src/handlers/table/high/handleCreateTable.ts`

**Parameters:**
- `description` (string, optional) - Does not reach creation — the shipped create endpoint has no description field of its own. Use UpdateTable (with ddl_code) after creating to set the DDL source, which carries the description.
- `master_language` (string, optional) - Optional master/original language for the created object (e.g. "EN", "DE", "ZH"). Defaults to the session language (SAP_LANGUAGE) or EN.
- `package_name` (string, required) - Package name
- `table_name` (string, required) - Table name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletetable-high-level-table"></a>
#### DeleteTable (High-Level / Table)
**Description:** Delete an ABAP table from the SAP system via ADT deletion API. Transport request optional for local objects.

**Source:** `src/handlers/table/high/handleDeleteTable.ts`

**Parameters:**
- `table_name` (string, required) - Table name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="gettable-high-level-table"></a>
#### GetTable (High-Level / Table)
**Description:** [read-only] Reads the ABAP database table named by table_name in one request: its definition with its fields, as source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Parameters:**
- `part` (string, optional (default: source)) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `table_name` (string, required) - Table name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updatetable-high-level-table"></a>
#### UpdateTable (High-Level / Table)
**Description:** Update DDL source code of an existing ABAP table. Locks, updates, unlocks, and optionally activates.

**Source:** `src/handlers/table/high/handleUpdateTable.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate table after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for table. Example: '@EndUserText.label : \'My Table\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'
- `table_name` (string, required) - Table name. Table must already exist.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-transport"></a>
### High-Level / Transport

<a id="addtransportobject-high-level-transport"></a>
#### AddTransportObject (High-Level / Transport)
**Description:** Adds the existing object named by object_name and object_type to the transport task named by transport_number, so it travels with the task's request.

**Source:** `src/handlers/transport/high/handleAddTransportObject.ts`

**Parameters:**
- `object_name` (string, required) - Object name.
- `object_type` (string, required) - Object-directory type — CLAS, FUGR, TABL, DOMA — not an ADT type code like CLAS/OC.
- `pgmid` (string, optional (default: R3TR)) - Program id. Defaults to R3TR, a workbench object's.
- `transport_number` (string, required) - Number of the transport task the object is added to.

---

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

<a id="createtransporttask-high-level-transport"></a>
#### CreateTransportTask (High-Level / Transport)
**Description:** Creates a task under the existing transport request named by transport_number, owned by the user named by target_user, of the type task_type. The task is itself a request resource — it reads, writes and releases like one — and is what adding and removing an object entry address, since a request's objects live on its tasks. `target_user` is required: it names the task's owner, and an empty owner is refused with SCTS_ADT_MSG 009. The task is typed Development/Correction (S) by default, because an Unclassified task refuses an added object on premise with SCTS_ADT_MSG 009 / TK127.

**Source:** `src/handlers/transport/high/handleCreateTransportTask.ts`

**Parameters:**
- `target_user` (string, required) - The user the task belongs to: an SAP user id (sent in upper case), e.g. DEVELOPER. Required — the server will not choose one, and naming another user is how a task is made for somebody else.
- `task_type` (string, optional (default: S)) - S — Development/Correction (default), R — Repair of an object this system does not own, X — leave it Unclassified, as the server creates it. An Unclassified task refuses AddTransportObject on premise (TK127).
- `transport_number` (string, required) - The REQUEST to create the task under — never another task. The number that comes back is the task, and that is what AddTransportObject, RemoveTransportObject and ReadTransportObjects address afterwards.

---

<a id="movetransportobjects-high-level-transport"></a>
#### MoveTransportObjects (High-Level / Transport)
**Description:** Moves the object entries named by objects from the transport task named by transport_number to the task named by target_number. Each entry is named by its position in the source task's object list.

**Source:** `src/handlers/transport/high/handleMoveTransportObjects.ts`

**Parameters:**
- `objects` (array, required) - The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.
- `target_number` (string, required) - Number of the transport task the entries move to.
- `transport_number` (string, required) - Number of the transport task that holds the entries.

---

<a id="removetransportobject-high-level-transport"></a>
#### RemoveTransportObject (High-Level / Transport)
**Description:** Removes the entry of the object named by object_name and object_type from the transport task named by transport_number, at position.

**Source:** `src/handlers/transport/high/handleRemoveTransportObject.ts`

**Parameters:**
- `object_name` (string, required) - Object name.
- `object_type` (string, required) - Object-directory type — CLAS, FUGR, TABL, DOMA — not an ADT type code like CLAS/OC.
- `pgmid` (string, optional (default: R3TR)) - Program id. Defaults to R3TR, a workbench object's.
- `position` (string, required) - Position of the object's entry in the task's object list.
- `transport_number` (string, required) - Number of the transport task that holds the entry.

---

<a id="sortandcompresstransporttask-high-level-transport"></a>
#### SortAndCompressTransportTask (High-Level / Transport)
**Description:** Sorts the object list of the transport task named by transport_number and merges its duplicate entries. A task holding the same entry twice refuses removing an entry until this has run.

**Source:** `src/handlers/transport/high/handleSortAndCompressTransportTask.ts`

**Parameters:**
- `transport_number` (string, required) - Number of the transport task to sort and compress.

---

<a id="high-level-unit-test"></a>
### High-Level / Unit Test

<a id="createcdsunittest-high-level-unit-test"></a>
#### CreateCdsUnitTest (High-Level / Unit Test)
**Description:** Creates the ABAP Unit test class named by class_name for the CDS view named by cds_view_name, from test_class_source. The view is checked to support CDS test doubles, the test class holding the local test classes is created in the package named by package_name, and it is activated.

**Source:** `src/handlers/unit_test/high/handleCreateCdsUnitTest.ts`

**Parameters:**
- `cds_view_name` (string, required) - CDS view under test (DDL source). Must be active and testable with test doubles.
- `class_name` (string, required) - Name of the new global class that holds the tests.
- `package_name` (string, required) - Package of the new test class.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable package.

---

<a id="createfunctiongroupunittest-high-level-unit-test"></a>
#### CreateFunctionGroupUnitTest (High-Level / Unit Test)
**Description:** Creates the ABAP Unit test classes of the function group named by function_group_name, from test_class_source. They are written to a test include, which is activated with the group.

**Source:** `src/handlers/unit_test/high/handleCreateFunctionGroupUnitTest.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group that gets the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="createprogramunittest-high-level-unit-test"></a>
#### CreateProgramUnitTest (High-Level / Unit Test)
**Description:** Creates the ABAP Unit test classes of the report named by program_name, from test_class_source. They are written to a test include, which is included into the report, and the report is activated.

**Source:** `src/handlers/unit_test/high/handleCreateProgramUnitTest.ts`

**Parameters:**
- `program_name` (string, required) - Report that gets the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="createunittest-high-level-unit-test"></a>
#### CreateUnitTest (High-Level / Unit Test)
**Description:** Creates the ABAP Unit test classes of the ABAP class named by class_name, from test_class_source. They are written as the class's local test classes, and the class is activated.

**Source:** `src/handlers/unit_test/high/handleCreateUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="deletecdsunittest-high-level-unit-test"></a>
#### DeleteCdsUnitTest (High-Level / Unit Test)
**Description:** Deletes the CDS view test class named by class_name, with the ABAP Unit test classes it holds.

**Source:** `src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="deleteunittest-high-level-unit-test"></a>
#### DeleteUnitTest (High-Level / Unit Test)
**Description:** Deletes the ABAP Unit test classes of the ABAP class named by class_name. The class's local test classes are deleted, and the class stays.

**Source:** `src/handlers/unit_test/high/handleDeleteUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="getcdsunittest-high-level-unit-test"></a>
#### GetCdsUnitTest (High-Level / Unit Test)
**Description:** [read-only] Retrieve CDS unit test run status and result for a previously started run_id. Polls the run a bounded number of times; if it has not finished within that bound, answers finished:false with the last status seen rather than the result. 

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.

---

<a id="getcdsunittestresult-high-level-unit-test"></a>
#### GetCdsUnitTestResult (High-Level / Unit Test)
**Description:** [read-only] Retrieve CDS unit test run result for a run_id. Polls the run status a bounded number of times first — this member has no result of its own to answer for a run that has not finished, and no fixture in the corpus proves what one would look like, so this never guesses: it answers finished:false with the last status seen instead. 

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format: abapunit or junit.
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_navigation_uris` (boolean, optional (default: false)) - Include navigation URIs in result if supported.

---

<a id="getcdsunitteststatus-high-level-unit-test"></a>
#### GetCdsUnitTestStatus (High-Level / Unit Test)
**Description:** [read-only] Retrieve CDS unit test run status for a run_id. 

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

<a id="getunittest-high-level-unit-test"></a>
#### GetUnitTest (High-Level / Unit Test)
**Description:** [read-only] Retrieve ABAP Unit test run status and result for a previously started run_id. Polls the run a bounded number of times; if it has not finished within that bound, answers finished:false with the last status seen rather than the result.

**Source:** `src/handlers/unit_test/high/handleGetUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by RunUnitTest.

---

<a id="getunittestresult-high-level-unit-test"></a>
#### GetUnitTestResult (High-Level / Unit Test)
**Description:** [read-only] Reads the result of the ABAP Unit test run named by run_id, for a run still running when its start answered. Waits for it within a bound.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Parameters:**
- `run_id` (string, required) - Run id a unit test run answered.

---

<a id="getunitteststatus-high-level-unit-test"></a>
#### GetUnitTestStatus (High-Level / Unit Test)
**Description:** [read-only] Retrieve ABAP Unit test run status for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

<a id="runcdsunittest-high-level-unit-test"></a>
#### RunCdsUnitTest (High-Level / Unit Test)
**Description:** [read-only] Runs the ABAP Unit tests of the CDS view test class named by class_name and returns the result.

**Source:** `src/handlers/unit_test/high/handleRunCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view.

---

<a id="runfunctiongroupunittest-high-level-unit-test"></a>
#### RunFunctionGroupUnitTest (High-Level / Unit Test)
**Description:** [read-only] Runs every ABAP Unit test of the function group named by function_group_name and returns the result. runner async (default): the run is started and waited for within a bound, and a run that outlasts it returns its run_id, whose status and result are read by run_id; suited to long suites. runner sync: one request that returns the finished result.

**Source:** `src/handlers/unit_test/high/handleRunFunctionGroupUnitTest.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group whose tests run.
- `runner` (string, optional (default: async)) - async (default): starts the run, waits for it within a bound and returns the result, or the run_id of a run that outlasts the bound, whose status and result are read by run_id; suited to long suites. sync: one request that returns the finished result.
- `scope` (object, optional) - Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.

---

<a id="runfunctionmoduleunittest-high-level-unit-test"></a>
#### RunFunctionModuleUnitTest (High-Level / Unit Test)
**Description:** [read-only] Runs the ABAP Unit tests of the function module named by function_module_name and returns the result. runner async (default): the run is started and waited for within a bound, and a run that outlasts it returns its run_id, whose status and result are read by run_id; suited to long suites. runner sync: one request, addressed by function_group_name and function_module_name, that returns the finished result of every test of the module's function group.

**Source:** `src/handlers/unit_test/high/handleRunFunctionModuleUnitTest.ts`

**Parameters:**
- `function_group_name` (string, optional) - Function group holding the function module; required by runner sync.
- `function_module_name` (string, required) - Function module whose tests run.
- `runner` (string, optional (default: async)) - async (default): starts the run, waits for it within a bound and returns the result, or the run_id of a run that outlasts the bound, whose status and result are read by run_id; suited to long suites. sync: one request that returns the finished result.
- `scope` (object, optional) - Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.

---

<a id="runprogramunittest-high-level-unit-test"></a>
#### RunProgramUnitTest (High-Level / Unit Test)
**Description:** [read-only] Runs the ABAP Unit tests of the report named by program_name and returns the result. runner async (default): the run is started and waited for within a bound, and a run that outlasts it returns its run_id, whose status and result are read by run_id; suited to long suites. runner sync: one request that returns the finished result. On ABAP Cloud, the programs are SAP's standard programs.

**Source:** `src/handlers/unit_test/high/handleRunProgramUnitTest.ts`

**Parameters:**
- `program_name` (string, required) - Report whose tests run.
- `runner` (string, optional (default: async)) - async (default): starts the run, waits for it within a bound and returns the result, or the run_id of a run that outlasts the bound, whose status and result are read by run_id; suited to long suites. sync: one request that returns the finished result.
- `scope` (object, optional) - Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.

---

<a id="rununittest-high-level-unit-test"></a>
#### RunUnitTest (High-Level / Unit Test)
**Description:** [read-only] Runs the ABAP Unit tests of the ABAP class named by class_name and returns the result. runner async (default): the run is started and waited for within a bound, and a run that outlasts it returns its run_id, whose status and result are read by run_id; suited to long suites. runner sync: one request that returns the finished result.

**Source:** `src/handlers/unit_test/high/handleRunUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Class whose tests run.
- `runner` (string, optional (default: async)) - async (default): starts the run, waits for it within a bound and returns the result, or the run_id of a run that outlasts the bound, whose status and result are read by run_id; suited to long suites. sync: one request that returns the finished result.
- `scope` (object, optional) - Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.

---

<a id="updatecdsunittest-high-level-unit-test"></a>
#### UpdateCdsUnitTest (High-Level / Unit Test)
**Description:** Writes test_class_source as the ABAP Unit test classes of the CDS view test class named by class_name. The local test classes in the test class are rewritten, and it is activated.

**Source:** `src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updatefunctiongroupunittest-high-level-unit-test"></a>
#### UpdateFunctionGroupUnitTest (High-Level / Unit Test)
**Description:** Writes test_class_source as the ABAP Unit test classes of the function group named by function_group_name. The local test classes in its test include are rewritten, and it is activated.

**Source:** `src/handlers/unit_test/high/handleUpdateFunctionGroupUnitTest.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group whose tests are replaced. Its test include must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updateprogramunittest-high-level-unit-test"></a>
#### UpdateProgramUnitTest (High-Level / Unit Test)
**Description:** Writes test_class_source as the ABAP Unit test classes of the report named by program_name. The local test classes in its test include are rewritten, and it is activated.

**Source:** `src/handlers/unit_test/high/handleUpdateProgramUnitTest.ts`

**Parameters:**
- `program_name` (string, required) - Report whose tests are replaced. Its test include must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updateunittest-high-level-unit-test"></a>
#### UpdateUnitTest (High-Level / Unit Test)
**Description:** Writes test_class_source as the ABAP Unit test classes of the ABAP class named by class_name. The class's local test classes are rewritten, and the class is activated.

**Source:** `src/handlers/unit_test/high/handleUpdateUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="streamable-http-binaries"></a>
## Streamable HTTP Binaries

On `mcp-abap-adt-http` (Streamable HTTP) every tool declares one more, optional argument, `state_handle` (string): "The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance." A tool whose own schema declares `state_handle` (the debugger tools) keeps its own declaration, required where it is required. No stdio or SSE binary declares it; the parameters listed per tool on this page are the stdio ones, without it.

*Last updated: 2026-10-30*
