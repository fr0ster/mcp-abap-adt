# Available Tools Reference - MCP ABAP ADT Server

Generated from code in `src/handlers/**` (not from docs).

## Summary

- Total tools: 266
- Read-only tools: 68
- High-level tools: 161
- Debug tools: 32
- Session tools: 2
- Batch tools: 3

## Handler Sets

The binary fixes its tool set (19.0.0); there is no `--exposition`.

- `readonly` -> [Read-Only Group](#read-only-group): `mcp-abap-adt` (and `-http`, `-sse`). The read-only binaries (`mcp-abap-adt-ro`, `-http-ro`, `-sse-ro`) serve a set of their own, listed exactly in [AVAILABLE_TOOLS_READONLY.md](AVAILABLE_TOOLS_READONLY.md): this group without the background-run tools, the system and search tools, on stdio the leftover-session list and logoff, and the run tools without `background`
- `high` -> [High-Level Group](#high-level-group): `mcp-abap-adt`, `-http`, `-sse`
- `debug` -> [Debug Group](#debug-group): `mcp-abap-adt`, `-http`, `-sse`; no `-ro` binary
- every stdio binary -> [Session Group](#session-group) (leftover SAP sessions of an ended process: list and logoff). No http or sse binary serves them: such a server holds the sessions of many users and writes no session file
- every binary -> [Batch Group](#batch-group) (batch mode: record independent calls, send them together at BatchEnd, read their answers by number; see [BATCH_MODE.md](BATCH_MODE.md)). The compact binaries serve batch mode as one tool, `HandlerBatch`. Every other tool's description, as the server lists it, ends with one sentence saying whether a call of it is recorded in batch mode, for which arguments, refused, or not served; the descriptions on this page are the handlers' own, without it
- compact -> [the compact package](../../compact/README.md): `mcp-abap-adt-compact` and `mcp-abap-adt-compact-ro` (and `-compact-http`, `-compact-sse`, each with its `-ro`)

## Navigation

- [Read-Only Group](#read-only-group)
  - [Background Run](#read-only-background-run)
    - [DiscardBackgroundRun](#discardbackgroundrun-read-only-background-run)
    - [GetBackgroundRun](#getbackgroundrun-read-only-background-run)
    - [ListBackgroundRuns](#listbackgroundruns-read-only-background-run)
  - [Behavior Definition](#read-only-behavior-definition)
    - [GetBehaviorDefinition](#getbehaviordefinition-read-only-behavior-definition)
  - [Behavior Implementation](#read-only-behavior-implementation)
    - [GetBehaviorImplementation](#getbehaviorimplementation-read-only-behavior-implementation)
  - [Class](#read-only-class)
    - [GetClass](#getclass-read-only-class)
  - [Common](#read-only-common)
    - [GetObjectVersionDiff](#getobjectversiondiff-read-only-common)
    - [GetObjectVersions](#getobjectversions-read-only-common)
    - [GetObjectVersionSource](#getobjectversionsource-read-only-common)
  - [Data Element](#read-only-data-element)
    - [GetDataElement](#getdataelement-read-only-data-element)
  - [Ddl](#read-only-ddl)
    - [GetDdl](#getddl-read-only-ddl)
  - [Domain](#read-only-domain)
    - [GetDomain](#getdomain-read-only-domain)
  - [Enhancement](#read-only-enhancement)
    - [GetEnhancementImpl](#getenhancementimpl-read-only-enhancement)
    - [GetEnhancements](#getenhancements-read-only-enhancement)
    - [GetEnhancementSpot](#getenhancementspot-read-only-enhancement)
  - [Function Group](#read-only-function-group)
    - [GetFunctionGroup](#getfunctiongroup-read-only-function-group)
  - [Function Include](#read-only-function-include)
    - [GetFunctionInclude](#getfunctioninclude-read-only-function-include)
    - [ListFunctionGroupIncludes](#listfunctiongroupincludes-read-only-function-include)
    - [ListFunctionModules](#listfunctionmodules-read-only-function-include)
  - [Function Module](#read-only-function-module)
    - [GetFunctionModule](#getfunctionmodule-read-only-function-module)
  - [Include](#read-only-include)
    - [GetInclude](#getinclude-read-only-include)
    - [GetIncludesList](#getincludeslist-read-only-include)
  - [Interface](#read-only-interface)
    - [GetInterface](#getinterface-read-only-interface)
  - [Message Class](#read-only-message-class)
    - [GetMessageClass](#getmessageclass-read-only-message-class)
    - [GetMessageClassMessage](#getmessageclassmessage-read-only-message-class)
  - [Metadata Extension](#read-only-metadata-extension)
    - [GetMetadataExtension](#getmetadataextension-read-only-metadata-extension)
  - [Package](#read-only-package)
    - [GetPackage](#getpackage-read-only-package)
    - [GetPackageContents](#getpackagecontents-read-only-package)
  - [Program](#read-only-program)
    - [GetProgram](#getprogram-read-only-program)
  - [Search](#read-only-search)
    - [GetObjectsByType](#getobjectsbytype-read-only-search)
    - [GetObjectsList](#getobjectslist-read-only-search)
    - [SearchObject](#searchobject-read-only-search)
  - [Service Binding](#read-only-service-binding)
    - [GetServiceBinding](#getservicebinding-read-only-service-binding)
  - [Service Definition](#read-only-service-definition)
    - [GetServiceDefinition](#getservicedefinition-read-only-service-definition)
  - [Structure](#read-only-structure)
    - [GetStructure](#getstructure-read-only-structure)
    - [GetStructuresList](#getstructureslist-read-only-structure)
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
    - [GetServiceBindingPreviewUrl](#getservicebindingpreviewurl-read-only-system)
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
    - [RuntimeRunClass](#runtimerunclass-read-only-system)
    - [RuntimeRunProgram](#runtimerunprogram-read-only-system)
    - [SearchSource](#searchsource-read-only-system)
  - [Table](#read-only-table)
    - [GetTable](#gettable-read-only-table)
    - [GetTableContents](#gettablecontents-read-only-table)
  - [Transport](#read-only-transport)
    - [GetTransport](#gettransport-read-only-transport)
    - [ListTransports](#listtransports-read-only-transport)
    - [ReadTransportActionLog](#readtransportactionlog-read-only-transport)
    - [ReadTransportObjects](#readtransportobjects-read-only-transport)
  - [Unit Test](#read-only-unit-test)
    - [GetUnitTestResult](#getunittestresult-read-only-unit-test)
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
    - [GetProgramVersionDiff](#getprogramversiondiff-high-level-common)
    - [GetProgramVersions](#getprogramversions-high-level-common)
    - [GetProgramVersionSource](#getprogramversionsource-high-level-common)
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
- [Debug Group](#debug-group)
  - [Debugger](#debug-debugger)
    - [AmdpDebugCancel](#amdpdebugcancel-debug-debugger)
    - [AmdpDebugGetTable](#amdpdebuggettable-debug-debugger)
    - [AmdpDebugSetBreakpoints](#amdpdebugsetbreakpoints-debug-debugger)
    - [AmdpDebugStart](#amdpdebugstart-debug-debugger)
    - [AmdpDebugStep](#amdpdebugstep-debug-debugger)
    - [AmdpDebugStop](#amdpdebugstop-debug-debugger)
    - [AmdpDebugWait](#amdpdebugwait-debug-debugger)
    - [DebugBatchBegin](#debugbatchbegin-debug-debugger)
    - [DebugBatchEnd](#debugbatchend-debug-debugger)
    - [DebugCreateMemorySnapshot](#debugcreatememorysnapshot-debug-debugger)
    - [DebugCreateWatchpoint](#debugcreatewatchpoint-debug-debugger)
    - [DebugDeleteBreakpoint](#debugdeletebreakpoint-debug-debugger)
    - [DebugDeleteWatchpoint](#debugdeletewatchpoint-debug-debugger)
    - [DebugGetMemorySizes](#debuggetmemorysizes-debug-debugger)
    - [DebugGetStack](#debuggetstack-debug-debugger)
    - [DebugGetVariables](#debuggetvariables-debug-debugger)
    - [DebugListBreakpoints](#debuglistbreakpoints-debug-debugger)
    - [DebugListWatchpoints](#debuglistwatchpoints-debug-debugger)
    - [DebugSetBreakpoints](#debugsetbreakpoints-debug-debugger)
    - [DebugSetSettings](#debugsetsettings-debug-debugger)
    - [DebugSetStackPosition](#debugsetstackposition-debug-debugger)
    - [DebugSetVariable](#debugsetvariable-debug-debugger)
    - [DebugStartListener](#debugstartlistener-debug-debugger)
    - [DebugStep](#debugstep-debug-debugger)
    - [DebugStepToLine](#debugsteptoline-debug-debugger)
    - [DebugStop](#debugstop-debug-debugger)
    - [DebugTakeOverListener](#debugtakeoverlistener-debug-debugger)
    - [DebugTerminate](#debugterminate-debug-debugger)
    - [DebugWait](#debugwait-debug-debugger)
    - [MemorySnapshotDelta](#memorysnapshotdelta-debug-debugger)
    - [MemorySnapshotGet](#memorysnapshotget-debug-debugger)
    - [MemorySnapshotList](#memorysnapshotlist-debug-debugger)
- [Session Group](#session-group)
  - [Leftover Session](#session-leftover-session)
    - [ListLeftoverSessions](#listleftoversessions-session-leftover-session)
    - [LogoffLeftoverSession](#logoffleftoversession-session-leftover-session)
- [Batch Group](#batch-group)
  - [Batch](#batch-batch)
    - [BatchAnswers](#batchanswers-batch-batch)
    - [BatchBegin](#batchbegin-batch-batch)
    - [BatchEnd](#batchend-batch-batch)

---

<a id="read-only-group"></a>
## Read-Only Group

<a id="read-only-background-run"></a>
### Read-Only / Background Run

<a id="discardbackgroundrun-read-only-background-run"></a>
#### DiscardBackgroundRun (Read-Only / Background Run)
**Description:** [runtime] Removes the kept answer of one of your finished background runs. A run still running cannot be discarded: a started run cannot be stopped.

**Source:** `src/handlers/background_run/readonly/handleDiscardBackgroundRun.ts`

**Parameters:**
- `run_handle` (string, required) - The run_handle a run started with background=true answered.

---

<a id="getbackgroundrun-read-only-background-run"></a>
#### GetBackgroundRun (Read-Only / Background Run)
**Description:** [runtime] Reads one of your background runs by its run_handle: running, or finished with what the run tool answered (the system answer as it is, an error included). Reading does not remove it; a finished run is kept until you discard it.

**Source:** `src/handlers/background_run/readonly/handleGetBackgroundRun.ts`

**Parameters:**
- `run_handle` (string, required) - The run_handle a run started with background=true answered.

---

<a id="listbackgroundruns-read-only-background-run"></a>
#### ListBackgroundRuns (Read-Only / Background Run)
**Description:** [runtime] Lists your background runs: run_handle, tool, object, when it started, and running or finished. No output: read a run with its run_handle.

**Source:** `src/handlers/background_run/readonly/handleListBackgroundRuns.ts`

**Parameters:**
- None

---

<a id="read-only-behavior-definition"></a>
### Read-Only / Behavior Definition

<a id="getbehaviordefinition-read-only-behavior-definition"></a>
#### GetBehaviorDefinition (Read-Only / Behavior Definition)
**Description:** Read an ABAP behavior definition in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

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
**Description:** Read an ABAP behavior implementation (its class) in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

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
**Description:** Read an ABAP class in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-common"></a>
### Read-Only / Common

<a id="getobjectversiondiff-read-only-common"></a>
#### GetObjectVersionDiff (Read-Only / Common)
**Description:** [read-only] Compute a unified diff between two object versions. Pass the two opaque content_uris from GetObjectVersions entries; returns the unified diff (jsdiff) of their sources.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionDiff.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from a GetObjectVersions entry).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from a GetObjectVersions entry).
- `object_type` (string, required) - Object type (same value used in GetObjectVersions).

---

<a id="getobjectversions-read-only-common"></a>
#### GetObjectVersions (Read-Only / Common)
**Description:** [read-only] List the version history of an ABAP object. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version source via GetObjectVersionSource.

**Source:** `src/handlers/common/readonly/handleGetObjectVersions.ts`

**Parameters:**
- `function_group_name` (string, optional) - Owning function group name. Required when object_type is function_module.
- `object_name` (string, required) - Object name.
- `object_type` (string, required) - Object type.

---

<a id="getobjectversionsource-read-only-common"></a>
#### GetObjectVersionSource (Read-Only / Common)
**Description:** [read-only] Fetch the source code of a specific object version. Pass the opaque content_uri from a GetObjectVersions entry.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionSource.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri taken from a GetObjectVersions version entry.
- `object_type` (string, required) - Object type (same value used in GetObjectVersions).

---

<a id="read-only-data-element"></a>
### Read-Only / Data Element

<a id="getdataelement-read-only-data-element"></a>
#### GetDataElement (Read-Only / Data Element)
**Description:** Read an ABAP data element in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="read-only-ddl"></a>
### Read-Only / Ddl

<a id="getddl-read-only-ddl"></a>
#### GetDdl (Read-Only / Ddl)
**Description:** Read an ABAP DDL source (CDS) in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

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
**Description:** Read an ABAP domain in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

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
**Description:** [read-only] Retrieve a list of enhancements for a given ABAP object. Takes object_name and object_type (one object: its enhancements) or objects (several objects: one entry per object, in the order given, each its enhancements answer or { object_name, object_type, error }).

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

<a id="read-only-function-group"></a>
### Read-Only / Function Group

<a id="getfunctiongroup-read-only-function-group"></a>
#### GetFunctionGroup (Read-Only / Function Group)
**Description:** Read an ABAP function group in one request: its ADT metadata document (package, description, contents). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="read-only-function-include"></a>
### Read-Only / Function Include

<a id="getfunctioninclude-read-only-function-include"></a>
#### GetFunctionInclude (Read-Only / Function Include)
**Description:** Read an include of an ABAP function group in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata"). Returns the part read.

**Source:** `src/handlers/function_include/readonly/handleGetFunctionInclude.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group containing the include.
- `include_name` (string, required) - Include name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

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

<a id="read-only-function-module"></a>
### Read-Only / Function Module

<a id="getfunctionmodule-read-only-function-module"></a>
#### GetFunctionModule (Read-Only / Function Module)
**Description:** Read an ABAP function module, BAPI or RFC-enabled ones included, in one request at the function group given: its source code, which declares the parameter signature (part "source", the default; active or inactive version), or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

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
**Description:** [read-only] Recursively discover and list ALL include files within an ABAP program or include. Takes object_name and object_type (one object: its tree) or objects (several objects: one entry per object, in the order given, each { object_name, object_type, tree } or { object_name, object_type, error }). Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

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
**Description:** Read an ABAP interface in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-message-class"></a>
### Read-Only / Message Class

<a id="getmessageclass-read-only-message-class"></a>
#### GetMessageClass (Read-Only / Message Class)
**Description:** Read an ABAP message class (MSAG/T100) in one request: its ADT metadata document (XML: name, description, package, master language, messages). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name.

---

<a id="getmessageclassmessage-read-only-message-class"></a>
#### GetMessageClassMessage (Read-Only / Message Class)
**Description:** Read one message (by number) of an ABAP message class (MSAG/T100) in one request: the class's ADT document (XML) that holds it, under `metadata`, with `part: "metadata"`; a number absent from the class is refused as not found.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="read-only-metadata-extension"></a>
### Read-Only / Metadata Extension

<a id="getmetadataextension-read-only-metadata-extension"></a>
#### GetMetadataExtension (Read-Only / Metadata Extension)
**Description:** Read an ABAP metadata extension in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-package"></a>
### Read-Only / Package

<a id="getpackage-read-only-package"></a>
#### GetPackage (Read-Only / Package)
**Description:** Read an ABAP package in one request: its ADT metadata document (description, super-package, sub-packages, ...), active or inactive version. Returns it under `metadata`, with `part: "metadata"`: a summary, the details or the document as SAP sent it, per `detail`.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Parameters:**
- `package_name` (string, required) - Package name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.

---

<a id="getpackagecontents-read-only-package"></a>
#### GetPackageContents (Read-Only / Package)
**Description:** [read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages. Takes package_name (one package: its list) or package_names (several packages: one entry per package, in the order given, each { package_name, objects } or { package_name, error }). Each level of the walk is read in one ADT batch envelope: the root node structures of its packages, then their type nodes. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/package/readonly/handleGetPackageContents.ts`

**Parameters:**
- None

---

<a id="read-only-program"></a>
### Read-Only / Program

<a id="getprogram-read-only-program"></a>
#### GetProgram (Read-Only / Program)
**Description:** Read an ABAP program in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `program_name` (string, required) - Program name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-search"></a>
### Read-Only / Search

<a id="getobjectsbytype-read-only-search"></a>
#### GetObjectsByType (Read-Only / Search)
**Description:** [read-only] Retrieves all ABAP objects of a specific type (classes, tables, programs, interfaces, etc.) under a given parent node. Useful for listing all objects of one type within a package or composite object.

**Source:** `src/handlers/search/readonly/handleGetObjectsByType.ts`

**Parameters:**
- `format` (string, optional) - [read-only] Output format: 'parsed' (default). 'raw' is accepted for backward compatibility but answers the same parsed text — see the note on `nodeLevel` below.
- `node_id` (string, required) - [read-only] Node ID
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type
- `with_short_descriptions` (boolean, optional) - [read-only] Include short descriptions

---

<a id="getobjectslist-read-only-search"></a>
#### GetObjectsList (Read-Only / Search)
**Description:** [read-only] Recursively retrieves all child ABAP repository objects for a given parent — programs (PROG), function groups (FUGR), classes (CLAS), packages (DEVC), and other composite objects — including nested includes and subcomponents. Takes parent_name, parent_tech_name and parent_type (one parent: its list) or objects (several parents: one entry per parent, in the order given, each { parent_name, parent_type, total_objects, objects } or { parent_name, parent_type, error }). Each level of the node tree is read in one ADT batch envelope. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/search/readonly/handleGetObjectsList.ts`

**Parameters:**
- `objects` (array, optional) - [read-only] Several parents, read together (give this or parent_name)
- `parent_name` (string, optional) - [read-only] Parent object name (with parent_tech_name and parent_type; or give objects)
- `parent_tech_name` (string, optional) - [read-only] Parent technical name
- `parent_type` (string, optional) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `with_short_descriptions` (boolean, optional (default: true))) - [read-only] Include short descriptions (default: true)

---

<a id="searchobject-read-only-search"></a>
#### SearchObject (Read-Only / Search)
**Description:** [read-only] Search ABAP repository by object name or wildcard pattern (e.g. 'Z*'). Answers: "find object X", "does X exist", "list objects matching...", "search for program/class/table by name". Supports all repository object types — optionally filter by type (PROG, CLAS, INTF, DEVC, TABL, DDLS, DTEL, FUGR, SRVD, SRVB, BDEF, DDLX, etc.). Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/search/readonly/handleSearchObject.ts`

**Parameters:**
- `maxResults` (number, optional (default: 100)) - [read-only] Maximum number of results to return
- `object_name` (string, required) - [read-only] Object name or mask (e.g. 'MARA*')
- `object_type` (string, optional) - [read-only] Optional ABAP object type (e.g. 'TABL', 'CLAS/OC')
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

---

<a id="read-only-service-binding"></a>
### Read-Only / Service Binding

<a id="getservicebinding-read-only-service-binding"></a>
#### GetServiceBinding (Read-Only / Service Binding)
**Description:** Read an ABAP service binding in one request: its binding document (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), each in the response_format given. Returns the part read.

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
**Description:** Read an ABAP service definition in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `service_definition_name` (string, required) - ServiceDefinition name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="read-only-structure"></a>
### Read-Only / Structure

<a id="getstructure-read-only-structure"></a>
#### GetStructure (Read-Only / Structure)
**Description:** Read an ABAP structure in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `structure_name` (string, required) - Structure name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getstructureslist-read-only-structure"></a>
#### GetStructuresList (Read-Only / Structure)
**Description:** [read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree. Takes structure_name (one structure: its tree) or structure_names (several structures: one entry per structure, in the order given, each its tree answer or { structure_name, error }). Refused outright on legacy systems (BASIS < 7.50): AdtClientLegacy.getStructure()/getTable() both throw — the DDIC structure/table endpoints this needs are not present there (issue #207). Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/structure/readonly/handleGetStructuresList.ts`

**Parameters:**
- `include_extensions` (boolean, optional (default: true)) - [read-only] Also find extension (append) structures via where-used (objects that `extend type <this> with …`). Default true. Set false to skip the (slower) where-used lookups and return includes only.
- `structure_name` (string, optional) - Structure name (or give structure_names).
- `structure_names` (array, optional) - Several structure names, read together (give this or structure_name).
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `version` (string, optional (default: active)) - Version to read: "active" (default) or "inactive".

---

<a id="read-only-system"></a>
### Read-Only / System

<a id="describebylist-read-only-system"></a>
#### DescribeByList (Read-Only / System)
**Description:** [read-only] Batch description for a list of ABAP objects. Input: objects: Array<{ name: string, type?: string }>. Each object may be of type: PROG/P, FUGR, PROG/I, CLAS/OC, FUGR/FC, INTF/OI, TABLE, STRUCTURE, etc. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/system/readonly/handleDescribeByList.ts`

**Parameters:**
- `objects` (array, required) - [read-only] Object name (required, must be valid ABAP object name or mask)
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
**Description:** [read-only] Resolve ABAP symbols from semantic analysis with SAP system information including types, scopes, descriptions, and packages. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/system/readonly/handleGetAbapSystemSymbols.ts`

**Parameters:**
- `code` (string, required) - ABAP source code to analyze and resolve symbols for
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

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
**Description:** [read-only] Return ABAP object tree structure for packages (DEVC), classes (CLAS), programs (PROG), function groups (FUGR), and other objects. Shows root, group nodes, and terminal leaves up to maxDepth. Enrich each node with description and package via SearchObject if enrich=true. Takes parent_type and parent_name (one object: its tree) or objects (several objects: one tree per object, in the order given; a failed one as { OBJECT_TYPE, OBJECT_NAME, error }). Read in ADT batch envelopes: per tier the root node structures of its nodes, then their type nodes; with enrich, the search of every node last. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/system/readonly/handleGetObjectInfo.ts`

**Parameters:**
- `enrich` (boolean, optional (default: true)) - [read-only] Whether to add description and package via SearchObject (default true)
- `maxDepth` (integer, optional (default: 1)) - [read-only] Maximum tree depth (default depends on type). Every object's own type folders and their contents are always shown (one tier); a higher value only descends further for PACKAGES, expanding nested subpackages that many tiers deep — no captured node-structure document shows a non-package object usefully recursable beyond its own type folders, so other object types are capped at one tier regardless of a higher value here.
- `objects` (array, optional) - [read-only] Several objects, read together (give this or parent_type and parent_name)
- `parent_name` (string, optional) - [read-only] Parent object name
- `parent_type` (string, optional) - [read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P); with parent_name, or give objects
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

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

<a id="getservicebindingpreviewurl-read-only-system"></a>
#### GetServiceBindingPreviewUrl (Read-Only / System)
**Description:** [read-only] Build the browser URL that previews a published service binding, and the service and $metadata URLs beside it. Answers: "open the service in a browser", "preview this service binding", "what is the OData URL of this binding". Reads the binding for the service, version and protocol, and the service definition for the entity sets; the preview URL needs an entity set, and says what is missing rather than guessing. A Web API binding has no preview page and answers the service URLs instead.

**Source:** `src/handlers/system/readonly/handleGetServiceBindingPreviewUrl.ts`

**Parameters:**
- `client` (string, optional) - Client for the sap-client parameter. Omitted, the client the system reports is used; an empty string leaves the parameter out.
- `entity_set` (string, optional) - Entity set to open. Omitted, the first one the service definition exposes is used.
- `language` (string, optional) - Logon language for the preview. Omitted, the language the system reports is used.
- `navigation` (string, optional) - Association or composition to follow. Omitted, the first one of the exposed root view is used.
- `service_binding_name` (string, required) - Service binding name.
- `target_entity_set` (string, optional) - Entity set the navigation reaches. Omitted, the second exposed entity set is used.

---

<a id="getsqlquery-read-only-system"></a>
#### GetSqlQuery (Read-Only / System)
**Description:** [read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/system/readonly/handleGetSqlQuery.ts`

**Parameters:**
- `row_number` (number, optional (default: 100)) - [read-only] Maximum number of rows to return
- `sql_query` (string, required) - SQL query to execute
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

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
**Description:** [read-only] Where-used list of an ABAP object: every object that uses, calls or references it, with its type and package. Takes object_name and object_type (one object: its list) or objects (several objects: one entry per object, in the order given, each its list or { object_name, object_type, error }). Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

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

<a id="runtimeanalyzeprofilertrace-read-only-system"></a>
#### RuntimeAnalyzeProfilerTrace (Read-Only / System)
**Description:** [runtime] Read profiler trace view and return compact analysis summary (totals + top entries). Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts`

**Parameters:**
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `top` (number, optional) - Number of top rows for summary. Default: 10.
- `trace_id_or_uri` (string, required) - Profiler trace ID or full trace URI.
- `view` (string, optional (default: hitlist)) - 
- `with_system_events` (boolean, optional) - Include system events.

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

<a id="runtimegetdumpbyid-read-only-system"></a>
#### RuntimeGetDumpById (Read-Only / System)
**Description:** [runtime] Read an ABAP runtime dump by its dump_id or URI. Answers a summary — runtime error, exception, terminated program, time, user, and the source position where it terminated — and the parsed dump.

**Source:** `src/handlers/system/readonly/handleRuntimeGetDumpById.ts`

**Parameters:**
- `dump_id` (string, required) - The dump's id, or its URI as a dumps feed entry carries it.
- `response_mode` (string, optional (default: both)) - What is returned: "payload" — the parsed dump, "summary" — runtime error, exception, terminated program, time, user and termination position, "both" — summary and payload.
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
**Description:** [runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

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

<a id="runtimelistfeeds-read-only-system"></a>
#### RuntimeListFeeds (Read-Only / System)
**Description:** [runtime] List the ADT runtime feeds and their variants, or read one: ABAP short dumps, system messages or SAP Gateway errors, filtered by user and time range; dumps also by runtime error, exception, object, package and application component. Entries come newest first; each dump carries its dump_id. When more entries remain, next_to is the `to` that reads on; incomplete_second names a second holding more entries than SAP answers in one request. Takes feed_type (one feed: its answer) or feed_types (several feeds with the same filters: one entry per feed, in the order given, each its answer or { feed_type, error }). Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/system/readonly/handleRuntimeListFeeds.ts`

**Parameters:**
- `component` (string, optional) - Dumps whose application component contains this text, in any case.
- `exception` (string, optional) - Dumps whose exception class contains this text, in any case.
- `feed_type` (string, optional (default: descriptors)) - Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.
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

<a id="runtimelistprofilertracefiles-read-only-system"></a>
#### RuntimeListProfilerTraceFiles (Read-Only / System)
**Description:** [runtime] List ABAP profiler trace files available in ADT runtime. Returns structured entries with id, recordedAt, user, objectName, state, expiresAt, and sizing/timing fields.

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

<a id="runtimerunclass-read-only-system"></a>
#### RuntimeRunClass (Read-Only / System)
**Description:** [runtime] Execute an ABAP class implementing if_oo_adt_classrun and return its output. Set profile=true to also capture a profiler trace: schedules the trace, runs the class under it, then searches the profiler feed for the id this run produced (bounded by max_trace_attempts/trace_retry_delay_ms). If the trace has not appeared within that bound, the run still answers success with output and profiler_id but no trace_id — poll RuntimeListProfilerTraceFiles or RuntimeAnalyzeProfilerTrace afterwards. No run_status or trace_requests_status field is returned — the client exposes no transport status for a run.

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
- `background` (any, optional) - When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.
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
**Description:** [runtime] Execute an ABAP program (report) and return its output. Set profile=true to also start a profiler trace; use RuntimeListProfilerTraceFiles afterwards to locate the trace (program execution is fire-and-forget, so traceId is not returned synchronously).

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
- `background` (any, optional) - When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.
- `description` (string, optional) - Profiler trace description (only used when profile=true).
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `profile` (boolean, optional) - When true, run with the profiler. Default false. Trace must be located afterwards via RuntimeListProfilerTraceFiles — program execution does not return traceId synchronously.
- `program_name` (string, required) - ABAP program name to execute.
- `sql_trace` (boolean, optional) - 
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="searchsource-read-only-system"></a>
#### SearchSource (Read-Only / System)
**Description:** [read-only] Search ABAP source text inside one or more packages (programs, function groups, classes). Onprem-only (cloud lacks an indexed source-search endpoint). `packages` accepts `*` masks (Z*, /NS/Z*) alongside exact names; mask resolution is best-effort and scoped to the ADT repository-search result window — there is no guarantee that every matching package is scanned. If you need certainty, pass concrete package names. When using masks, narrow the mask itself and use `object_types`, `object_filter`, and `max_objects` as scan-target controls that apply after package resolution. Comments are searched by default; set exclude_comments=true to drop col-1 `*` and full-line `"` comments. The `version` parameter affects PROG and CLAS main include reads only — FUGR subinclude reads always go against the active version (the include endpoint exposes no version selector). `truncated.by_object_cap` means at least one object had MORE hits than `max_hits_per_object`, so that object's hits were capped — it is NOT a limit on the number of objects scanned. The object-count limit is `max_objects` (which sets `truncated.by_max_objects`). To avoid `by_object_cap`, raise `max_hits_per_object`. The scan is read in ADT batch envelopes, one per phase: the searches of the package masks, each level of the package walk, then the sources of the scanned objects (main sources and function group structures, then function group includes and function modules); `time_budget_ms` is checked between phases. Run only ONE SearchSource per destination at a time — multiple parallel SearchSource calls against the same SAP system saturate the scan backend and can make all of them time out. Prefer combining terms into a single call over parallel calls. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/system/readonly/handleSearchSource.ts`

**Parameters:**
- None

---

<a id="read-only-table"></a>
### Read-Only / Table

<a id="gettable-read-only-table"></a>
#### GetTable (Read-Only / Table)
**Description:** Read an ABAP table in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `table_name` (string, required) - Table name.
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="gettablecontents-read-only-table"></a>
#### GetTableContents (Read-Only / Table)
**Description:** [read-only] Retrieve contents (data preview) of an ABAP database table or CDS view. Returns rows of data like SE16/SE16N. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

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
- `transport_number` (string, required) - Transport request number, not a task

---

<a id="listtransports-read-only-transport"></a>
#### ListTransports (Read-Only / Transport)
**Description:** [read-only] List transport requests for the current or specified user. Returns modifiable and/or released workbench and customizing requests. `user` and modifiable-only are both applied client-side, over every request the server's default search configuration answers — not sent to ADT as filters. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/transport/readonly/handleListTransports.ts`

**Parameters:**
- `modifiable_only` (boolean, optional) - Only return modifiable (not yet released) transports; applied client-side. Default: true.
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `user` (string, optional) - The user to filter to: an SAP user id (matched in upper case); applied client-side. If not provided, defaults to the current session user, so an unfiltered call already answers only that user's transports.

---

<a id="readtransportactionlog-read-only-transport"></a>
#### ReadTransportActionLog (Read-Only / Transport)
**Description:** [read-only] Read the action log of a transport request: one entry per lifecycle event — created, object added, object deleted, owner changed. This is what confirms a RemoveTransportObject landed, since that call answers by echoing what it was asked.

**Source:** `src/handlers/transport/readonly/handleReadTransportActionLog.ts`

**Parameters:**
- `transport_number` (string, required) - Transport REQUEST or TASK number. A request answers its own lifecycle events; a task answers the events of the objects on it.

---

<a id="readtransportobjects-read-only-transport"></a>
#### ReadTransportObjects (Read-Only / Transport)
**Description:** [read-only] List the objects a transport request or task holds, each with the `position` that RemoveTransportObject needs. A task answers its own entries; a request answers every task's entries, each once, with its `task` number and position — the task a removal addresses.

**Source:** `src/handlers/transport/readonly/handleReadTransportObjects.ts`

**Parameters:**
- `transport_number` (string, required) - Transport REQUEST or TASK number. A task answers its own entries; a request answers the entries of each of its tasks, each with its `task` number — the task a removal addresses.

---

<a id="read-only-unit-test"></a>
### Read-Only / Unit Test

<a id="getunittestresult-read-only-unit-test"></a>
#### GetUnitTestResult (Read-Only / Unit Test)
**Description:** Get the result of an ABAP Unit test run by its run_id, for a run that had not finished when it was started. Waits for it within a bound.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Parameters:**
- `run_id` (string, required) - Run id a unit test run answered.

---

<a id="high-level-group"></a>
## High-Level Group

<a id="high-level-atc"></a>
### High-Level / Atc

<a id="getatcfindings-high-level-atc"></a>
#### GetATCFindings (High-Level / Atc)
**Description:** Read what an ATC run found, by the worklist_id RunATC answered. Works whether or not the run waited. Answers each finding with the object, the source position, the priority, which check ran and what it said, plus how many objects were covered and the counts per priority. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Source:** `src/handlers/atc/high/handleGetATCFindings.ts`

**Parameters:**
- `timeout` (any, optional) - Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `worklist_id` (string, required) - Worklist identifier answered by RunATC.

---

<a id="getatcrunstatus-high-level-atc"></a>
#### GetATCRunStatus (High-Level / Atc)
**Description:** Ask whether an ATC run has ended. Takes the run_id from RunATC (only a run started with wait=false has one). Answers the status the server reports and whether it is finished — finished means ended, not that the checks passed. Read what it found with GetATCFindings, by worklist_id.

**Source:** `src/handlers/atc/high/handleGetATCRunStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier answered by RunATC when wait was false.

---

<a id="runatc-high-level-atc"></a>
#### RunATC (High-Level / Atc)
**Description:** Run ABAP Test Cockpit checks over one or more objects. Creates a worklist for the check variant, then starts the run. Answers worklist_id always — findings stay readable with GetATCFindings whether or not the run waited. With wait=false it also answers run_id, for GetATCRunStatus; with wait=true the server holds the request until the checks finish and answers the finding counts.

**Source:** `src/handlers/atc/high/handleRunATC.ts`

**Parameters:**
- `check_variant` (string, optional) - ATC check variant. Omitted, the system's own default variant is used.
- `max_findings` (integer, optional (default: 100)) - Cap on findings the run records (maximumVerdicts). A whole number, at least 1. Default 100.
- `objects` (array, required) - The objects to check. One run may cover several; each needs a name and a type.
- `wait` (boolean, optional (default: false)) - Hold the request until the checks finish and answer the finding counts. Default false: the run starts and answers a run_id to poll.

---

<a id="high-level-behavior-definition"></a>
### High-Level / Behavior Definition

<a id="checkbehaviordefinition-high-level-behavior-definition"></a>
#### CheckBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Perform syntax check on an ABAP behavior definition (BDEF). Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/behavior_definition/high/handleCheckBehaviorDefinition.ts`

**Parameters:**
- `name` (string, required) - BehaviorDefinition name.
- `version` (string, optional) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Omitted, the inactive one is checked; an object that is only active has none, and SAP answers such a check with a finding against an empty source (e.g. G46 "REPORT/PROGRAM statement is missing") or "Inactive version … does not exist" — ask for active.

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
**Description:** Read an ABAP behavior definition in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
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
**Description:** Create a new ABAP behavior implementation class for a behavior definition. Creates the object in initial state — no FOR BEHAVIOR OF main source and no implementations include yet. Use UpdateClass to write the main source and UpdateBehaviorImplementation (with a lock handle from LockClass) to write the implementations include.

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
**Description:** Read an ABAP behavior implementation (its class) in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts`

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
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
**Description:** Perform syntax check on an ABAP class. Can check existing class (active/inactive) or validate hypothetical source code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/class/high/handleCheckClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name.
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `version` (string, optional) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active.

---

<a id="createclass-high-level-class"></a>
#### CreateClass (High-Level / Class)
**Description:** Create a new ABAP class in SAP system. Creates the class object in initial state. Use UpdateClass to set source code.

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
**Description:** Delete local macros from an ABAP class by clearing the macros include. Manages lock, update, unlock, and optional activation. Note: Macros are supported in older ABAP versions but not in newer ones.

**Source:** `src/handlers/class/high/handleDeleteLocalMacros.ts`

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name.
- `transport_request` (string, optional) - Transport request number, not a task.

---

<a id="deletelocaltestclass-high-level-class"></a>
#### DeleteLocalTestClass (High-Level / Class)
**Description:** Clear the local test classes include of a class under the class lock, and optionally activate the class.

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
**Description:** Read an ABAP class in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Parameters:**
- `class_name` (string, required) - Class name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getlocaldefinitions-high-level-class"></a>
#### GetLocalDefinitions (High-Level / Class)
**Description:** Read the local definitions include of a class (its definitions include), active or inactive version. Returns { class_name, version, part: 'source', source }.

**Source:** `src/handlers/class/high/handleGetLocalDefinitions.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getlocalmacros-high-level-class"></a>
#### GetLocalMacros (High-Level / Class)
**Description:** Read the local macros include of a class, active or inactive version. Returns { class_name, version, part: 'source', source }.

**Source:** `src/handlers/class/high/handleGetLocalMacros.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getlocaltestclass-high-level-class"></a>
#### GetLocalTestClass (High-Level / Class)
**Description:** Read the local test classes include of a class, active or inactive version. Returns { class_name, version, part: 'source', source }.

**Source:** `src/handlers/class/high/handleGetLocalTestClass.ts`

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `version` (string, optional (default: active)) - Version to read: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="getlocaltypes-high-level-class"></a>
#### GetLocalTypes (High-Level / Class)
**Description:** Read the local types include of a class (its implementations include), active or inactive version. Returns { class_name, version, part: 'source', source }.

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
**Description:** Write the local test classes include of a class under the class lock, and optionally activate the class.

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

<a id="high-level-data-element"></a>
### High-Level / Data Element

<a id="checkdataelement-high-level-data-element"></a>
#### CheckDataElement (High-Level / Data Element)
**Description:** Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/data_element/high/handleCheckDataElement.ts`

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional) - Which version to check. Defaults to the inactive one, what a caller wants right after a write; an object that is only active has no inactive version, and SAP answers such a check with "Error while importing object … from the database" — ask for active.

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
**Description:** Read an ABAP data element in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.

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
**Description:** Perform syntax check on an ABAP CDS view. Can check existing view (active/inactive) or validate hypothetical DDL source. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/ddl/high/handleCheckDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - CDS view name to check, passed as ddl_name.
- `ddl_source` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: inactive.

---

<a id="createddl-high-level-ddl"></a>
#### CreateDdl (High-Level / Ddl)
**Description:** Create a new CDS View or Classic View in SAP system. Creates the DDL source object in initial state. Use UpdateDdl to set DDL source code.

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
**Description:** Read an ABAP DDL source (CDS) in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/ddl/high/handleGetDdl.ts`

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="updateddl-high-level-ddl"></a>
#### UpdateDdl (High-Level / Ddl)
**Description:** Update DDL source code of an existing CDS View or Classic View. Locks, updates, unlocks, and optionally activates. Use CreateDdl to create a new DDL source.

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
**Description:** Perform syntax check on an ABAP metadata extension (DDLX). Returns syntax errors, warnings, and messages.

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
**Description:** Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/domain/high/handleCheckDomain.ts`

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional) - Which version to check. Defaults to the inactive one, what a caller wants right after a write; an object that is only active has no inactive version, and SAP answers such a check with "Error while importing object … from the database" — ask for active.

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
**Description:** Read an ABAP domain in one request: its ADT metadata document (definition, package, description). Returns it under `metadata`, with `part: "metadata"`.

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
**Description:** Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/function/high/handleCheckFunctionGroup.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group name.
- `version` (string, optional) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Omitted, the inactive one is checked; an object that is only active has none, and SAP answers such a check with a finding against an empty source (e.g. G46 "REPORT/PROGRAM statement is missing") or "Inactive version … does not exist" — ask for active.

---

<a id="checkfunctionmodule-high-level-function"></a>
#### CheckFunctionModule (High-Level / Function)
**Description:** Perform syntax check on an ABAP function module. Returns syntax errors, warnings, and messages.

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
**Description:** Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules and don't have source code to update directly. Locks the group, writes, and unlocks it.

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
**Description:** Read an ABAP function group in one request: its ADT metadata document (package, description, contents). Returns it under `metadata`, with `part: "metadata"`.

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
**Description:** Read an ABAP function module, BAPI or RFC-enabled ones included, in one request at the function group given: its source code, which declares the parameter signature (part "source", the default; active or inactive version), or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/function_module/high/handleGetFunctionModule.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group containing the function module.
- `function_module_name` (string, required) - Function module name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="high-level-interface"></a>
### High-Level / Interface

<a id="checkinterface-high-level-interface"></a>
#### CheckInterface (High-Level / Interface)
**Description:** Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/interface/high/handleCheckInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name.
- `version` (string, optional) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Omitted, the inactive one is checked; an object that is only active has none, and SAP answers such a check with a finding against an empty source (e.g. G46 "REPORT/PROGRAM statement is missing") or "Inactive version … does not exist" — ask for active.

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
**Description:** Read an ABAP interface in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Parameters:**
- `interface_name` (string, required) - Interface name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
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
**Description:** Create a new ABAP message class (T100) shell. Individual messages are added afterwards with CreateMessageClassMessage. Message classes are not activated.

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
**Description:** Add a message (number + text) to an existing ABAP message class (T100). The parent class must exist first (CreateMessageClass).

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
**Description:** Read an ABAP message class (MSAG/T100) in one request: its ADT metadata document (XML: name, description, package, master language, messages). Returns it under `metadata`, with `part: "metadata"`.

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name.

---

<a id="getmessageclassmessage-high-level-message-class"></a>
#### GetMessageClassMessage (High-Level / Message Class)
**Description:** Read one message (by number) of an ABAP message class (MSAG/T100) in one request: the class's ADT document (XML) that holds it, under `metadata`, with `part: "metadata"`; a number absent from the class is refused as not found.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="updatemessageclass-high-level-message-class"></a>
#### UpdateMessageClass (High-Level / Message Class)
**Description:** Update a message class header (e.g. its description). To add or change individual messages use CreateMessageClassMessage / UpdateMessageClassMessage.

**Source:** `src/handlers/message_class/high/handleUpdateMessageClass.ts`

**Parameters:**
- `description` (string, required) - New short description for the message class.
- `message_class_name` (string, required) - Message class name.
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable objects.

---

<a id="updatemessageclassmessage-high-level-message-class"></a>
#### UpdateMessageClassMessage (High-Level / Message Class)
**Description:** Change the text / flags of an existing message in an ABAP message class (T100). Upserts the message if it does not exist yet.

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
**Description:** Read an ABAP metadata extension in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - MetadataExtension name.
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `version` (string, optional (default: active)) - Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.

---

<a id="high-level-package"></a>
### High-Level / Package

<a id="checkpackage-high-level-package"></a>
#### CheckPackage (High-Level / Package)
**Description:** Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages.

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
**Description:** Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for local objects. A package can be saved only once per ABAP session (PAK/058 "Package … is already locked" otherwise). The package tools of this server never save a package in its own session, so a delete here works after them; for a package saved elsewhere through this connection, pass force_new_connection=true to delete from a new session, closed afterwards.

**Source:** `src/handlers/package/high/handleDeletePackage.ts`

**Parameters:**
- `force_new_connection` (boolean, optional) - Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false.
- `package_name` (string, required) - Package name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getpackage-high-level-package"></a>
#### GetPackage (High-Level / Package)
**Description:** Read an ABAP package in one request: its ADT metadata document (description, super-package, sub-packages, ...), active or inactive version. Returns it under `metadata`, with `part: "metadata"`: a summary, the details or the document as SAP sent it, per `detail`.

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
**Description:** Perform syntax check on an ABAP program. Returns syntax errors, warnings, and messages. Not available on cloud.

**Source:** `src/handlers/program/high/handleCheckProgram.ts`

**Parameters:**
- `program_name` (string, required) - Program name.
- `version` (string, optional) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Omitted, the inactive one is checked; an object that is only active has none, and SAP answers such a check with a finding against an empty source (e.g. G46 "REPORT/PROGRAM statement is missing") or "Inactive version … does not exist" — ask for active.

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
**Description:** Read an ABAP program in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
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
**Description:** Read an ABAP service binding in one request: its binding document (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), each in the response_format given. Returns the part read.

**Source:** `src/handlers/service_binding/high/handleGetServiceBinding.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `response_format` (string, optional (default: xml)) - Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.
- `service_binding_name` (string, required) - Service binding name. Case-insensitive.

---

<a id="listservicebindingtypes-high-level-service-binding"></a>
#### ListServiceBindingTypes (High-Level / Service Binding)
**Description:** List available service binding types (for example ODataV2/ODataV4) from ADT Business Services endpoint.

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
**Description:** Validate service binding parameters (name, service definition, package, version) via ADT validation endpoint.

**Source:** `src/handlers/service_binding/high/handleValidateServiceBinding.ts`

**Parameters:**
- `description` (string, optional) - Optional description used during validation.
- `package_name` (string, optional) - ABAP package for the binding.
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
**Description:** Read an ABAP service definition in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
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
**Description:** Perform syntax check on an ABAP structure. Can check existing structure (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/structure/high/handleCheckStructure.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `structure_name` (string, required) - Structure name.
- `version` (string, optional) - Version to check: 'active' or 'inactive'. Default: inactive.

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
**Description:** Read an ABAP structure in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
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
**Description:** [high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions. Takes package_name (one package: its tree) or package_names (several packages: one entry per package, in the order given, each { package_name, tree, metadata } or { package_name, error }). Read in ADT batch envelopes: the package metadata with the root node structure, then each level of the walk. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

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

<a id="high-level-table"></a>
### High-Level / Table

<a id="checktable-high-level-table"></a>
#### CheckTable (High-Level / Table)
**Description:** Perform syntax check on an ABAP table. Can check existing table (active/inactive) or validate hypothetical DDL code. Returns syntax errors, warnings, and messages.

**Source:** `src/handlers/table/high/handleCheckTable.ts`

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `table_name` (string, required) - Table name.
- `version` (string, optional) - Version to check: 'active', 'inactive', or 'new'. Default: new.

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
**Description:** Read an ABAP table in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Parameters:**
- `part` (any, optional) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
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
**Description:** Add an existing ABAP object to a transport task, so it travels with the task's request.

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
**Description:** Create a task under an existing transport request, owned by a named user, and give it a type. The task is itself a request resource — it reads, writes and releases like one — and is what AddTransportObject and RemoveTransportObject address, since a request's objects live on its tasks. `target_user` is required: without it the server resolves an empty owner and refuses with SCTS_ADT_MSG 009. The task is typed Development/Correction (S) by default, because an Unclassified task refuses AddTransportObject on premise with SCTS_ADT_MSG 009 / TK127.

**Source:** `src/handlers/transport/high/handleCreateTransportTask.ts`

**Parameters:**
- `target_user` (string, required) - The user the task belongs to: an SAP user id (sent in upper case), e.g. DEVELOPER. Required — the server will not choose one, and naming another user is how a task is made for somebody else.
- `task_type` (string, optional (default: S)) - S — Development/Correction (default), R — Repair of an object this system does not own, X — leave it Unclassified, as the server creates it. An Unclassified task refuses AddTransportObject on premise (TK127).
- `transport_number` (string, required) - The REQUEST to create the task under — never another task. The number that comes back is the task, and that is what AddTransportObject, RemoveTransportObject and ReadTransportObjects address afterwards.

---

<a id="movetransportobjects-high-level-transport"></a>
#### MoveTransportObjects (High-Level / Transport)
**Description:** Move object entries from one transport task to another. Each entry is named by its position in the source task's object list.

**Source:** `src/handlers/transport/high/handleMoveTransportObjects.ts`

**Parameters:**
- `objects` (array, required) - The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.
- `target_number` (string, required) - Number of the transport task the entries move to.
- `transport_number` (string, required) - Number of the transport task that holds the entries.

---

<a id="removetransportobject-high-level-transport"></a>
#### RemoveTransportObject (High-Level / Transport)
**Description:** Remove an object's entry from the transport task that holds it.

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
**Description:** Sort a transport task's object list and merge its duplicate entries. A task holding the same entry twice refuses RemoveTransportObject until this has run.

**Source:** `src/handlers/transport/high/handleSortAndCompressTransportTask.ts`

**Parameters:**
- `transport_number` (string, required) - Number of the transport task to sort and compress.

---

<a id="high-level-unit-test"></a>
### High-Level / Unit Test

<a id="createcdsunittest-high-level-unit-test"></a>
#### CreateCdsUnitTest (High-Level / Unit Test)
**Description:** Create ABAP Unit tests for a CDS view: check the view supports CDS test doubles, create a test class holding the local test classes, activate it.

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
**Description:** Create ABAP Unit tests for a function group: a test include with its local test classes, activated with the group.

**Source:** `src/handlers/unit_test/high/handleCreateFunctionGroupUnitTest.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group that gets the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="createprogramunittest-high-level-unit-test"></a>
#### CreateProgramUnitTest (High-Level / Unit Test)
**Description:** Create ABAP Unit tests for a report: a test include with its local test classes, included into the report and activated.

**Source:** `src/handlers/unit_test/high/handleCreateProgramUnitTest.ts`

**Parameters:**
- `program_name` (string, required) - Report that gets the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="createunittest-high-level-unit-test"></a>
#### CreateUnitTest (High-Level / Unit Test)
**Description:** Create ABAP Unit tests for a class: write its local test classes and activate the class.

**Source:** `src/handlers/unit_test/high/handleCreateUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="deletecdsunittest-high-level-unit-test"></a>
#### DeleteCdsUnitTest (High-Level / Unit Test)
**Description:** Delete the ABAP Unit tests of a CDS view: delete its test class.

**Source:** `src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="deleteunittest-high-level-unit-test"></a>
#### DeleteUnitTest (High-Level / Unit Test)
**Description:** Delete the ABAP Unit tests of a class: remove its local test classes, keeping the class.

**Source:** `src/handlers/unit_test/high/handleDeleteUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="getcdsunittest-high-level-unit-test"></a>
#### GetCdsUnitTest (High-Level / Unit Test)
**Description:** Retrieve CDS unit test run status and result for a previously started run_id. Polls the run a bounded number of times; if it has not finished within that bound, answers finished:false with the last status seen rather than the result. 

**Source:** `src/handlers/unit_test/high/handleGetCdsUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.

---

<a id="getcdsunittestresult-high-level-unit-test"></a>
#### GetCdsUnitTestResult (High-Level / Unit Test)
**Description:** Retrieve CDS unit test run result for a run_id. Polls the run status a bounded number of times first — this member has no result of its own to answer for a run that has not finished, and no fixture in the corpus proves what one would look like, so this never guesses: it answers finished:false with the last status seen instead. 

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
**Description:** Retrieve ABAP Unit test run status and result for a previously started run_id. Polls the run a bounded number of times; if it has not finished within that bound, answers finished:false with the last status seen rather than the result.

**Source:** `src/handlers/unit_test/high/handleGetUnitTest.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by RunUnitTest.

---

<a id="getunittestresult-high-level-unit-test"></a>
#### GetUnitTestResult (High-Level / Unit Test)
**Description:** Get the result of an ABAP Unit test run by its run_id, for a run that had not finished when it was started. Waits for it within a bound.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Parameters:**
- `run_id` (string, required) - Run id a unit test run answered.

---

<a id="getunitteststatus-high-level-unit-test"></a>
#### GetUnitTestStatus (High-Level / Unit Test)
**Description:** Retrieve ABAP Unit test run status for a run_id.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier returned by unit test run.
- `with_long_polling` (boolean, optional (default: true)) - Enable long polling while waiting for status.

---

<a id="runcdsunittest-high-level-unit-test"></a>
#### RunCdsUnitTest (High-Level / Unit Test)
**Description:** Run the ABAP Unit tests of a CDS view and return the result.

**Source:** `src/handlers/unit_test/high/handleRunCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view.

---

<a id="runfunctiongroupunittest-high-level-unit-test"></a>
#### RunFunctionGroupUnitTest (High-Level / Unit Test)
**Description:** Run all ABAP Unit tests of a function group and return the result.

**Source:** `src/handlers/unit_test/high/handleRunFunctionGroupUnitTest.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group whose tests run.

---

<a id="runfunctionmoduleunittest-high-level-unit-test"></a>
#### RunFunctionModuleUnitTest (High-Level / Unit Test)
**Description:** Run the ABAP Unit tests of a function module and return the result.

**Source:** `src/handlers/unit_test/high/handleRunFunctionModuleUnitTest.ts`

**Parameters:**
- `function_module_name` (string, required) - Function module whose tests run.

---

<a id="runprogramunittest-high-level-unit-test"></a>
#### RunProgramUnitTest (High-Level / Unit Test)
**Description:** Run the ABAP Unit tests of a report and return the result.

**Source:** `src/handlers/unit_test/high/handleRunProgramUnitTest.ts`

**Parameters:**
- `program_name` (string, required) - Report whose tests run.

---

<a id="rununittest-high-level-unit-test"></a>
#### RunUnitTest (High-Level / Unit Test)
**Description:** Run the ABAP Unit tests of a class and return the result.

**Source:** `src/handlers/unit_test/high/handleRunUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Class whose tests run.

---

<a id="updatecdsunittest-high-level-unit-test"></a>
#### UpdateCdsUnitTest (High-Level / Unit Test)
**Description:** Update the ABAP Unit tests of a CDS view: replace the local test classes in its test class and activate it.

**Source:** `src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updatefunctiongroupunittest-high-level-unit-test"></a>
#### UpdateFunctionGroupUnitTest (High-Level / Unit Test)
**Description:** Update the ABAP Unit tests of a function group: replace the local test classes in its test include and activate it.

**Source:** `src/handlers/unit_test/high/handleUpdateFunctionGroupUnitTest.ts`

**Parameters:**
- `function_group_name` (string, required) - Function group whose tests are replaced. Its test include must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updateprogramunittest-high-level-unit-test"></a>
#### UpdateProgramUnitTest (High-Level / Unit Test)
**Description:** Update the ABAP Unit tests of a report: replace the local test classes in its test include and activate it.

**Source:** `src/handlers/unit_test/high/handleUpdateProgramUnitTest.ts`

**Parameters:**
- `program_name` (string, required) - Report whose tests are replaced. Its test include must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updateunittest-high-level-unit-test"></a>
#### UpdateUnitTest (High-Level / Unit Test)
**Description:** Update the ABAP Unit tests of a class: replace its local test classes and activate the class.

**Source:** `src/handlers/unit_test/high/handleUpdateUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="debug-group"></a>
## Debug Group

<a id="debug-debugger"></a>
### Debug / Debugger

<a id="amdpdebugcancel-debug-debugger"></a>
#### AmdpDebugCancel (Debug / Debugger)
**Description:** [debug] Cancels the stopped AMDP debuggee's execution.

**Source:** `src/handlers/debugger/debug/handleAmdpDebugCancel.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="amdpdebuggettable-debug-debugger"></a>
#### AmdpDebugGetTable (Debug / Debugger)
**Description:** [debug] Rows of a table variable at the AMDP stop, up to 100; optionally through a SELECT over it.

**Source:** `src/handlers/debugger/debug/handleAmdpDebugGetTable.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `query` (string, optional) - A SELECT over the variable.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.
- `variable` (string, required) - The table variable to read.

---

<a id="amdpdebugsetbreakpoints-debug-debugger"></a>
#### AmdpDebugSetBreakpoints (Debug / Debugger)
**Description:** [debug] Replaces the AMDP breakpoints of a debug session, as confirmed by the system. Catches every request of the connected SAP user, not only programs run by this server.

**Source:** `src/handlers/debugger/debug/handleAmdpDebugSetBreakpoints.ts`

**Parameters:**
- `breakpoints` (array, required) - Lines in SQLScript methods of a class.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="amdpdebugstart-debug-debugger"></a>
#### AmdpDebugStart (Debug / Debugger)
**Description:** [debug] Opens an AMDP debug session of the connected SAP user with breakpoints on lines in SQLScript methods; a background run, when given, starts once the system confirmed the breakpoints. Catches every request of the connected SAP user, not only programs run by this server.

**Source:** `src/handlers/debugger/debug/handleAmdpDebugStart.ts`

**Parameters:**
- `breakpoints` (array, required) - Lines in SQLScript methods of a class.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `run` (object, optional) - A class (as a console application) or a report started in the background once listening; its outcome is reported as the end of the session.
- `stop_existing` (boolean, optional (default: false)) - Ends an AMDP debug session of this user left behind.

---

<a id="amdpdebugstep-debug-debugger"></a>
#### AmdpDebugStep (Debug / Debugger)
**Description:** [debug] Steps the stopped AMDP debuggee over a statement or on to the next stop.

**Source:** `src/handlers/debugger/debug/handleAmdpDebugStep.ts`

**Parameters:**
- `action` (string, required) - over runs the current statement, continue runs to the next stop.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="amdpdebugstop-debug-debugger"></a>
#### AmdpDebugStop (Debug / Debugger)
**Description:** [debug] Ends the AMDP part of a debug session, releasing a suspended debuggee first; a part that could not be undone is reported and kept.

**Source:** `src/handlers/debugger/debug/handleAmdpDebugStop.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="amdpdebugwait-debug-debugger"></a>
#### AmdpDebugWait (Debug / Debugger)
**Description:** [debug] AMDP events of a debug session after waiting up to hold_seconds.

**Source:** `src/handlers/debugger/debug/handleAmdpDebugWait.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `hold_seconds` (number, optional (default: 10)) - Longest wait for a change, at most 30 seconds.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugbatchbegin-debug-debugger"></a>
#### DebugBatchBegin (Debug / Debugger)
**Description:** [debug] Starts the debugger batch on the stopped debuggee. In the debugger batch each call of step, step to line, stack, variables, child variables, stack position or setting a variable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle, which HTTP clients send in the x-mcp-state-handle header with every call of the batch.

**Source:** `src/handlers/debugger/debug/handleDebugBatchBegin.ts`

**Parameters:**
- None

---

<a id="debugbatchend-debug-debugger"></a>
#### DebugBatchEnd (Debug / Debugger)
**Description:** [debug] Sends the recorded calls of the stopped debuggee in one envelope on the debuggee's session and ends the debugger batch. Answers the number of recorded calls, the numbers whose answer is an error, and SAP's answer to the envelope when the envelope failed.

**Source:** `src/handlers/debugger/debug/handleDebugBatchEnd.ts`

**Parameters:**
- None

---

<a id="debugcreatememorysnapshot-debug-debugger"></a>
#### DebugCreateMemorySnapshot (Debug / Debugger)
**Description:** [debug] Writes a memory snapshot of the stopped debuggee and answers the file written.

**Source:** `src/handlers/debugger/debug/handleDebugCreateMemorySnapshot.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugcreatewatchpoint-debug-debugger"></a>
#### DebugCreateWatchpoint (Debug / Debugger)
**Description:** [debug] Watches a variable of the stopped debuggee: it stops when the variable changes, optionally under a condition.

**Source:** `src/handlers/debugger/debug/handleDebugCreateWatchpoint.ts`

**Parameters:**
- `condition` (string, optional) - Stops only when this ABAP condition holds.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `name` (string, required) - Variable to watch; a path reaches a component.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugdeletebreakpoint-debug-debugger"></a>
#### DebugDeleteBreakpoint (Debug / Debugger)
**Description:** [debug] Removes one breakpoint of a debug session by its id; the rest of the set stays armed. Refused for an id the session does not hold.

**Source:** `src/handlers/debugger/debug/handleDebugDeleteBreakpoint.ts`

**Parameters:**
- `breakpoint_id` (string, required) - Breakpoint id.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugdeletewatchpoint-debug-debugger"></a>
#### DebugDeleteWatchpoint (Debug / Debugger)
**Description:** [debug] Removes a watchpoint.

**Source:** `src/handlers/debugger/debug/handleDebugDeleteWatchpoint.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.
- `watchpoint_id` (string, required) - Watchpoint id.

---

<a id="debuggetmemorysizes-debug-debugger"></a>
#### DebugGetMemorySizes (Debug / Debugger)
**Description:** [debug] Memory the stopped debuggee uses. Needs a stopped debuggee.

**Source:** `src/handlers/debugger/debug/handleDebugGetMemorySizes.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debuggetstack-debug-debugger"></a>
#### DebugGetStack (Debug / Debugger)
**Description:** [debug] Call stack of the stopped debuggee, each frame as an object address and as its technical place. Needs a stopped debuggee.

**Source:** `src/handlers/debugger/debug/handleDebugGetStack.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debuggetvariables-debug-debugger"></a>
#### DebugGetVariables (Debug / Debugger)
**Description:** [debug] Variables of the stopped debuggee, by name or as members of a parent. Needs a stopped debuggee.

**Source:** `src/handlers/debugger/debug/handleDebugGetVariables.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `names` (array, optional) - Variables by name; a path reads a component or a table row.
- `parents` (array, optional) - Instead of names: members of these scopes, objects or tables.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debuglistbreakpoints-debug-debugger"></a>
#### DebugListBreakpoints (Debug / Debugger)
**Description:** [debug] Breakpoints a debug session armed.

**Source:** `src/handlers/debugger/debug/handleDebugListBreakpoints.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debuglistwatchpoints-debug-debugger"></a>
#### DebugListWatchpoints (Debug / Debugger)
**Description:** [debug] Watchpoints of the stopped debuggee.

**Source:** `src/handlers/debugger/debug/handleDebugListWatchpoints.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugsetbreakpoints-debug-debugger"></a>
#### DebugSetBreakpoints (Debug / Debugger)
**Description:** [debug] Adds breakpoints to a debug session — a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition — and answers the whole set placed, this call's refusals each with its breakpoint and reason, earlier breakpoints no longer placed, and any answer row it cannot pair with a breakpoint. Its breakpoints are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change replaces that set as a whole.

**Source:** `src/handlers/debugger/debug/handleDebugSetBreakpoints.ts`

**Parameters:**
- `breakpoints` (array, required) - Breakpoints: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugsetsettings-debug-debugger"></a>
#### DebugSetSettings (Debug / Debugger)
**Description:** [debug] Changes the debugger settings at the current stop and answers the settings in force; a field left out keeps its value. The debug session applies them again after each later attach.

**Source:** `src/handlers/debugger/debug/handleDebugSetSettings.ts`

**Parameters:**
- `background_rfc` (boolean, optional) - Debugs background RFC calls.
- `create_exception_object` (boolean, optional) - Creates the exception object even where a CATCH does not ask for it.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `shared_object_debugging` (boolean, optional) - Debugs shared objects.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.
- `system_debugging` (boolean, optional) - Steps into system programs and stops at breakpoints there.
- `update_debugging` (boolean, optional) - Debugs update tasks.

---

<a id="debugsetstackposition-debug-debugger"></a>
#### DebugSetStackPosition (Debug / Debugger)
**Description:** [debug] Selects the stack frame variables are read in; what runs next does not change. Needs a stopped debuggee.

**Source:** `src/handlers/debugger/debug/handleDebugSetStackPosition.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `position` (integer, required) - Frame position as the stack numbers it; the stopped frame has the highest position.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugsetvariable-debug-debugger"></a>
#### DebugSetVariable (Debug / Debugger)
**Description:** [debug] Sets a variable of the stopped debuggee. Needs a stopped debuggee.

**Source:** `src/handlers/debugger/debug/handleDebugSetVariable.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `name` (string, required) - Variable to set; a path reaches a component.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.
- `value` (string, required) - New value; converted to the type by the system.

---

<a id="debugstartlistener-debug-debugger"></a>
#### DebugStartListener (Debug / Debugger)
**Description:** [debug] Opens a debug session: arms breakpoints, listens for a debuggee and attaches the first one caught; refused before anything is placed while another debugger listens for that user. Needs at least one breakpoint. Takes whose requests are caught, the debugging mode and the debugger settings. In user mode it catches every request of the request user (the connected SAP user unless another is named), not only programs run by this server. Its breakpoints are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change replaces that set as a whole.

**Source:** `src/handlers/debugger/debug/handleDebugStartListener.ts`

**Parameters:**
- `breakpoints` (array, required) - Breakpoints, at least one: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition.
- `debugging_mode` (string, optional) - user (when omitted) catches the requests of the request user; terminal catches the requests that carry this debug session's ids and needs no configuration: the run it starts carries them, so without run it catches only requests carrying the same ids.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `request_user` (string, optional) - User mode: the SAP user whose requests are caught; the connected user when omitted. Debugging another user's requests needs the debug authorization for that user. Not taken in terminal mode.
- `run` (object, optional) - A class (as a console application) or a report started in the background once listening; its outcome is reported as the end of the session.
- `settings` (object, optional) - Debugger settings, applied after each attach; a field left out keeps its value.

---

<a id="debugstep-debug-debugger"></a>
#### DebugStep (Debug / Debugger)
**Description:** [debug] Moves the stopped debuggee into a call, over it, out of the current one or on to the next stop; or leaves it running, the listener and the breakpoints kept, by detaching or by freeing the debugger.

**Source:** `src/handlers/debugger/debug/handleDebugStep.ts`

**Parameters:**
- `action` (string, required) - into enters the call, over runs it, return leaves the current one, continue runs to the next stop; detach lets the program run on, the listener and the breakpoints kept; release_debugger frees the debugger and the program runs on. detach and release_debugger apply to ABAP only.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugsteptoline-debug-debugger"></a>
#### DebugStepToLine (Debug / Debugger)
**Description:** [debug] Runs or jumps the stopped debuggee to a line.

**Source:** `src/handlers/debugger/debug/handleDebugStepToLine.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `include` (string, optional) - For a class: definitions, implementations, macros or testclasses; the main source when omitted.
- `line` (integer, required) - For a line: the line in the object source.
- `mode` (string, required) - run executes up to the line; jump moves there without executing what lies between.
- `object_name` (string, required) - For a line: the object holding it.
- `object_type` (string, required) - For a line: CLAS, PROG, INCL or FUNC.
- `parent_name` (string, optional) - For a function module: its function group.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugstop-debug-debugger"></a>
#### DebugStop (Debug / Debugger)
**Description:** [debug] Ends a debug session, ABAP and AMDP: releases a stopped debuggee, removes the breakpoints, stops listening and closes the connections; a part that could not be undone is reported and kept.

**Source:** `src/handlers/debugger/debug/handleDebugStop.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugtakeoverlistener-debug-debugger"></a>
#### DebugTakeOverListener (Debug / Debugger)
**Description:** [debug] Opens a debug session: arms breakpoints, listens for a debuggee and attaches the first one caught. Displaces another debugger listening for the same user. Needs at least one breakpoint. Takes whose requests are caught, the debugging mode and the debugger settings. In user mode it catches every request of the request user (the connected SAP user unless another is named), not only programs run by this server. Its breakpoints are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change replaces that set as a whole.

**Source:** `src/handlers/debugger/debug/handleDebugTakeOverListener.ts`

**Parameters:**
- `breakpoints` (array, required) - Breakpoints, at least one: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition.
- `debugging_mode` (string, optional) - user (when omitted) catches the requests of the request user; terminal catches the requests that carry this debug session's ids and needs no configuration: the run it starts carries them, so without run it catches only requests carrying the same ids.
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `request_user` (string, optional) - User mode: the SAP user whose requests are caught; the connected user when omitted. Debugging another user's requests needs the debug authorization for that user. Not taken in terminal mode.
- `run` (object, optional) - A class (as a console application) or a report started in the background once listening; its outcome is reported as the end of the session.
- `settings` (object, optional) - Debugger settings, applied after each attach; a field left out keeps its value.

---

<a id="debugterminate-debug-debugger"></a>
#### DebugTerminate (Debug / Debugger)
**Description:** [debug] Ends the stopped debuggee where it stands; the program does not run on.

**Source:** `src/handlers/debugger/debug/handleDebugTerminate.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="debugwait-debug-debugger"></a>
#### DebugWait (Debug / Debugger)
**Description:** [debug] State of a debug session after waiting up to hold_seconds; a debugger that took the user over is an error carrying the system's message.

**Source:** `src/handlers/debugger/debug/handleDebugWait.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `hold_seconds` (number, optional (default: 10)) - Longest wait for a change, at most 30 seconds.
- `state_handle` (string, required) - Opaque handle identifying the server-held state this operation works on.

---

<a id="memorysnapshotdelta-debug-debugger"></a>
#### MemorySnapshotDelta (Debug / Debugger)
**Description:** [debug] Two memory snapshots compared in a view: memory by kind, largest objects, an object's children or its referrers. Needs the memory snapshot authorization.

**Source:** `src/handlers/debugger/debug/handleMemorySnapshotDelta.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `from_id` (string, required) - Snapshot id to compare from.
- `key` (string, optional) - Object key, for children and references.
- `max_objects` (integer, optional (default: 50)) - Objects in a ranking, children or references answer.
- `to_id` (string, required) - Snapshot id to compare to.
- `view` (string, optional (default: overview)) - overview: memory by kind; ranking: the largest objects; children: what an object holds; references: what holds an object.

---

<a id="memorysnapshotget-debug-debugger"></a>
#### MemorySnapshotGet (Debug / Debugger)
**Description:** [debug] One memory snapshot in a view: header, memory by kind, largest objects, an object's children or its referrers. Needs the memory snapshot authorization.

**Source:** `src/handlers/debugger/debug/handleMemorySnapshotGet.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `key` (string, optional) - Object key, for children and references.
- `max_objects` (integer, optional (default: 50)) - Objects in a ranking, children or references answer.
- `snapshot_id` (string, required) - Snapshot id.
- `view` (string, optional (default: overview)) - header: the snapshot; overview: memory by kind; ranking: the largest objects; children: what an object holds; references: what holds an object.

---

<a id="memorysnapshotlist-debug-debugger"></a>
#### MemorySnapshotList (Debug / Debugger)
**Description:** [debug] Memory snapshots the system lists. Empty without the memory snapshot authorization.

**Source:** `src/handlers/debugger/debug/handleMemorySnapshotList.ts`

**Parameters:**
- `detail` (string, optional (default: terse)) - How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).
- `user` (string, optional) - Only the snapshots of this SAP user.

---

<a id="session-group"></a>
## Session Group

<a id="session-leftover-session"></a>
### Session / Leftover Session

<a id="listleftoversessions-session-leftover-session"></a>
#### ListLeftoverSessions (Session / Leftover Session)
**Description:** [session] Lists the SAP sessions of this server's destination that an ended server process left open (it was killed before it could log them off), with the locks they may hold: handle, role (built: an instance connection; debugger: a debug session connection), destination, user (none for a token login) and when it was last recorded. Read from the session records alone: nothing is sent to SAP. Sessions of a running process are not listed. Log one off by its handle. A server process that starts while exactly one instance session (built) of its destination is left is born on it, before any tool call; with several, none is taken and they stay here.

**Source:** `src/handlers/leftover_session/session/handleListLeftoverSessions.ts`

**Parameters:**
- None

---

<a id="logoffleftoversession-session-leftover-session"></a>
#### LogoffLeftoverSession (Session / Leftover Session)
**Description:** [session] Logs off a leftover SAP session (any role): the session ends, and every lock it holds is released. Only the logoff is sent, with no credential. The session record is deleted afterwards.

**Source:** `src/handlers/leftover_session/session/handleLogoffLeftoverSession.ts`

**Parameters:**
- `handle` (string, required) - The handle of a leftover session, as the list of leftover sessions answers it.

---

<a id="batch-group"></a>
## Batch Group

<a id="batch-batch"></a>
### Batch / Batch

<a id="batchanswers-batch-batch"></a>
#### BatchAnswers (Batch / Batch)
**Description:** The answers of the last batch, by number: each is the answer the tool gives for that call, built when BatchEnd sent it — SAP's answer or why it was not sent. A number the last batch does not have answers: no answer with that number.

**Source:** `src/handlers/batch/batch/handleBatchAnswers.ts`

**Parameters:**
- `number` (integer, optional) - One batch number to read (an integer of at least 1); give this or numbers, not both.
- `numbers` (array, optional) - Several batch numbers to read, answered in the order given; give this or number, not both.

---

<a id="batchbegin-batch-batch"></a>
#### BatchBegin (Batch / Batch)
**Description:** Switches this server into batch mode: from now on each call of a tool none of whose requests depends on another's answer is recorded instead of sent, and returns nothing. Every recorded call is numbered, in the order made, from 1. A tool that builds a request from an earlier answer is refused in batch mode; use the low-level tools (compact: HandlerCreate, HandlerLock, HandlerUpdate with lock_handle, HandlerUnlock, HandlerGet) and run each phase as its own batch. BatchEnd sends the recorded calls; read their answers by number with BatchAnswers. Over HTTP, send the state_handle this answers in the request header on every call of the batch.

**Source:** `src/handlers/batch/batch/handleBatchBegin.ts`

**Parameters:**
- None

---

<a id="batchend-batch-batch"></a>
#### BatchEnd (Batch / Batch)
**Description:** Sends every call recorded since BatchBegin, in one envelope, with the credentials in force now, and leaves batch mode whatever happens; nothing is sent twice. Answers how many calls were recorded and which numbers failed; read each answer with BatchAnswers.

**Source:** `src/handlers/batch/batch/handleBatchEnd.ts`

**Parameters:**
- None

---

*Last updated: 2026-10-18*
