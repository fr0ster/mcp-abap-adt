# Read-Only Tools - MCP ABAP ADT Server

Generated from the tool definitions the server builds (not from docs).

Exactly the tools `mcp-abap-adt-ro` serves, with the parameters they take there — taken from `fullReadOnlyToolSet`, the set the read-only binaries use. `mcp-abap-adt-sse-ro` serves them without `ListLeftoverSessions`, which is stdio's only, and `mcp-abap-adt-http-ro` the same, with what its [Streamable HTTP section](#streamable-http-binaries) adds. Nothing here changes the system: no high, run, debugger, leftover-session logoff or resume tool; the background-run tools serve the long reads, which run in the background by default. Batch mode is the compact binaries' (`HandlerBatch`, [BATCH_MODE.md](BATCH_MODE.md)): none is served here. `mcp-abap-adt` serves these and more: [all tools](AVAILABLE_TOOLS.md).

- Level: Read-Only
- Total tools: 82

## Navigation

- [Read-Only Group](#read-only-group)
  - [Abapgit](#read-only-abapgit)
    - [ListAbapGitRepos](#listabapgitrepos-read-only-abapgit)
    - [CheckAbapGitExternalRepo](#checkabapgitexternalrepo-read-only-abapgit)
    - [GetAbapGitModifiedObjects](#getabapgitmodifiedobjects-read-only-abapgit)
    - [GetAbapGitStaging](#getabapgitstaging-read-only-abapgit)
    - [CheckAbapGitRepo](#checkabapgitrepo-read-only-abapgit)
    - [GetAbapGitFile](#getabapgitfile-read-only-abapgit)
    - [GetAbapGitErrorLog](#getabapgiterrorlog-read-only-abapgit)
  - [Atc](#read-only-atc)
    - [RunATC](#runatc-read-only-atc)
    - [GetATCRunStatus](#getatcrunstatus-read-only-atc)
    - [GetATCFindings](#getatcfindings-read-only-atc)
    - [ListATCResults](#listatcresults-read-only-atc)
    - [GetATCResult](#getatcresult-read-only-atc)
  - [Background Run](#read-only-background-run)
    - [GetBackgroundRun](#getbackgroundrun-read-only-background-run)
    - [ListBackgroundRuns](#listbackgroundruns-read-only-background-run)
    - [DiscardBackgroundRun](#discardbackgroundrun-read-only-background-run)
  - [Behavior Definition](#read-only-behavior-definition)
    - [GetBehaviorDefinition](#getbehaviordefinition-read-only-behavior-definition)
  - [Behavior Implementation](#read-only-behavior-implementation)
    - [GetBehaviorImplementation](#getbehaviorimplementation-read-only-behavior-implementation)
  - [Class](#read-only-class)
    - [GetClass](#getclass-read-only-class)
  - [Common](#read-only-common)
    - [GetObjectVersions](#getobjectversions-read-only-common)
    - [GetObjectDraft](#getobjectdraft-read-only-common)
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
    - [GetMainPrograms](#getmainprograms-read-only-include)
  - [Interface](#read-only-interface)
    - [GetInterface](#getinterface-read-only-interface)
  - [Leftover Session](#read-only-leftover-session)
    - [ListLeftoverSessions](#listleftoversessions-read-only-leftover-session)
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
    - [RuntimeListProfilerTraceFiles](#runtimelistprofilertracefiles-read-only-system)
    - [RuntimeGetProfilerTraceData](#runtimegetprofilertracedata-read-only-system)
    - [RuntimeGetDumpById](#runtimegetdumpbyid-read-only-system)
    - [RuntimeAnalyzeProfilerTrace](#runtimeanalyzeprofilertrace-read-only-system)
    - [RuntimeListFeeds](#runtimelistfeeds-read-only-system)
    - [RuntimeListSystemMessages](#runtimelistsystemmessages-read-only-system)
    - [RuntimeGetGatewayErrorLog](#runtimegetgatewayerrorlog-read-only-system)
    - [GetWhereUsed](#getwhereused-read-only-system)
    - [GetObjectInfo](#getobjectinfo-read-only-system)
    - [GetInactiveObjects](#getinactiveobjects-read-only-system)
    - [GetAdtTypes](#getadttypes-read-only-system)
    - [GetObjectStructure](#getobjectstructure-read-only-system)
    - [GetObjectOutline](#getobjectoutline-read-only-system)
    - [GetObjectNodeFromCache](#getobjectnodefromcache-read-only-system)
    - [DescribeByList](#describebylist-read-only-system)
    - [GetPackageTree](#getpackagetree-read-only-system)
    - [GetSqlQuery](#getsqlquery-read-only-system)
    - [SearchSource](#searchsource-read-only-system)
  - [Table](#read-only-table)
    - [GetTableSettings](#gettablesettings-read-only-table)
    - [GetTable](#gettable-read-only-table)
    - [GetTableContents](#gettablecontents-read-only-table)
  - [Table Type](#read-only-table-type)
    - [GetTableType](#gettabletype-read-only-table-type)
  - [Text Elements](#read-only-text-elements)
    - [GetTextElements](#gettextelements-read-only-text-elements)
  - [Transport](#read-only-transport)
    - [GetTransport](#gettransport-read-only-transport)
    - [ListTransports](#listtransports-read-only-transport)
    - [ReadTransportObjects](#readtransportobjects-read-only-transport)
    - [ReadTransportActionLog](#readtransportactionlog-read-only-transport)
  - [Unit Test](#read-only-unit-test)
    - [GetUnitTestResult](#getunittestresult-read-only-unit-test)
- [Streamable HTTP Binaries](#streamable-http-binaries)
  - [SessionOpen](#sessionopen-streamable-http)
  - [SessionClose](#sessionclose-streamable-http)

---

<a id="read-only-group"></a>
## Read-Only Group

<a id="read-only-abapgit"></a>
### Read-Only / Abapgit

<a id="listabapgitrepos-read-only-abapgit"></a>
#### ListAbapGitRepos (Read-Only / Abapgit)
**Description:** [read-only] Lists the abapGit repositories linked in the system, or the one with a key or of one package (DEVC).

**Source:** `src/handlers/abapgit/readonly/handleListAbapGitRepos.ts`

**Parameters:**
- `detail` (string, optional, one of: `terse`, `medium`, `full`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.
- `package_name` (string, optional) - Only the repository linked to this package.
- `repository_key` (string, optional) - Only the repository with this key.

---

<a id="checkabapgitexternalrepo-read-only-abapgit"></a>
#### CheckAbapGitExternalRepo (Read-Only / Abapgit)
**Description:** [read-only] Checks an external git repository for abapGit before it is linked: its access and its branches.

**Source:** `src/handlers/abapgit/readonly/handleCheckAbapGitExternalRepo.ts`

**Parameters:**
- `detail` (string, optional, one of: `terse`, `medium`, `full`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.
- `url` (string, required) - The remote repository URL over HTTPS, without a user, a password, a query or a fragment.

---

<a id="getabapgitmodifiedobjects-read-only-abapgit"></a>
#### GetAbapGitModifiedObjects (Read-Only / Abapgit)
**Description:** [read-only] Reads the objects a pull of an abapGit repository would modify in the system, before it runs.

**Source:** `src/handlers/abapgit/readonly/handleGetAbapGitModifiedObjects.ts`

**Parameters:**
- `detail` (string, optional, one of: `terse`, `medium`, `full`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.

---

<a id="getabapgitstaging-read-only-abapgit"></a>
#### GetAbapGitStaging (Read-Only / Abapgit)
**Description:** [read-only] Reads the abapGit staging of a linked repository: what changed, to choose what a push commits.

**Source:** `src/handlers/abapgit/readonly/handleGetAbapGitStaging.ts`

**Parameters:**
- `detail` (string, optional, one of: `terse`, `medium`, `full`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.

---

<a id="checkabapgitrepo-read-only-abapgit"></a>
#### CheckAbapGitRepo (Read-Only / Abapgit)
**Description:** [read-only] Checks that the system reaches an abapGit repository's remote and is let in.

**Source:** `src/handlers/abapgit/readonly/handleCheckAbapGitRepo.ts`

**Parameters:**
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.

---

<a id="getabapgitfile-read-only-abapgit"></a>
#### GetAbapGitFile (Read-Only / Abapgit)
**Description:** [read-only] Reads one file of an abapGit repository, as the system holds it or as the remote branch holds it.

**Source:** `src/handlers/abapgit/readonly/handleGetAbapGitFile.ts`

**Parameters:**
- `filename` (string, required) - The file name, as GetAbapGitStaging lists it (for example zcl_demo.clas.abap).
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.
- `version` (string, required, one of: `local`, `remote`) - Which version of the file: local (the system's) or remote (the remote branch's).

---

<a id="getabapgiterrorlog-read-only-abapgit"></a>
#### GetAbapGitErrorLog (Read-Only / Abapgit)
**Description:** [read-only] Reads the error log of the last abapGit pull or push of a repository, object by object.

**Source:** `src/handlers/abapgit/readonly/handleGetAbapGitErrorLog.ts`

**Parameters:**
- `app_log_key` (string, required) - The run log key ListAbapGitRepos answers for the repository's last run.
- `detail` (string, optional, one of: `terse`, `medium`, `full`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.

---

<a id="read-only-atc"></a>
### Read-Only / Atc

<a id="runatc-read-only-atc"></a>
#### RunATC (Read-Only / Atc)
**Description:** [read-only] Runs the ABAP Test Cockpit checks of a check variant over ABAP objects and packages (DEVC), recording their findings in a new worklist.

**Source:** `src/handlers/atc/high/handleRunATC.ts`

**Parameters:**
- `check_variant` (string, optional) - ATC check variant. Omitted, the system's own default variant is used.
- `max_findings` (integer, optional (default: 100)) - Cap on findings the run records (maximumVerdicts). A whole number, at least 1. Default 100.
- `objects` (array, required) - The objects to check. One run may cover several; each needs a name and a type.
- `wait` (boolean, optional (default: false)) - Hold the request until the checks finish and answer the finding counts. Default false: the run starts and answers a run_id to poll.

---

<a id="getatcrunstatus-read-only-atc"></a>
#### GetATCRunStatus (Read-Only / Atc)
**Description:** [read-only] Reads the status of an ATC run by its id, and whether it has ended.

**Source:** `src/handlers/atc/high/handleGetATCRunStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier an ATC run started with wait=false answered.

---

<a id="getatcfindings-read-only-atc"></a>
#### GetATCFindings (Read-Only / Atc)
**Description:** [read-only] Reads the findings of an ATC run by its worklist, whether the run was waited for or goes on in the background. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/atc/high/handleGetATCFindings.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `worklist_id` (string, required) - Worklist identifier an ATC run answered.

---

<a id="listatcresults-read-only-atc"></a>
#### ListATCResults (Read-Only / Atc)
**Description:** [read-only] Lists the ATC results the system holds for a user or for every user, newest first, within an age range in days. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/atc/high/handleListATCResults.ts`

**Parameters:**
- `age_max` (integer, optional) - Oldest age to list, in days.
- `age_min` (integer, optional) - Youngest age to list, in days.
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `central_only` (boolean, optional) - true lists central results only; absent lists every kind.
- `created_by` (string, required) - Whose results: a user name, or * for every user.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

---

<a id="getatcresult-read-only-atc"></a>
#### GetATCResult (Read-Only / Atc)
**Description:** [read-only] Reads a stored ATC result by its display ID: its findings and the counts per priority. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/atc/high/handleGetATCResult.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `display_id` (string, required) - Display ID of a stored ATC result.

---

<a id="read-only-background-run"></a>
### Read-Only / Background Run

<a id="getbackgroundrun-read-only-background-run"></a>
#### GetBackgroundRun (Read-Only / Background Run)
**Description:** [read-only] Reads one of the caller's background runs by its run handle, with the answer of a run that has ended.

**Source:** `src/handlers/background_run/readonly/handleGetBackgroundRun.ts`

**Parameters:**
- `run_handle` (string, required) - The run_handle a background run answered at its start.

---

<a id="listbackgroundruns-read-only-background-run"></a>
#### ListBackgroundRuns (Read-Only / Background Run)
**Description:** [read-only] Lists the caller's background runs, running, finished and cancelled.

**Source:** `src/handlers/background_run/readonly/handleListBackgroundRuns.ts`

**Parameters:**
- None

---

<a id="discardbackgroundrun-read-only-background-run"></a>
#### DiscardBackgroundRun (Read-Only / Background Run)
**Description:** [read-only] Discards a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted.

**Source:** `src/handlers/background_run/readonly/handleDiscardBackgroundRun.ts`

**Parameters:**
- `run_handle` (string, required) - The run_handle a background run answered at its start.

---

<a id="read-only-behavior-definition"></a>
### Read-Only / Behavior Definition

<a id="getbehaviordefinition-read-only-behavior-definition"></a>
#### GetBehaviorDefinition (Read-Only / Behavior Definition)
**Description:** [read-only] Reads the current source code of a RAP behavior definition (BDEF), or its metadata.

**Source:** `src/handlers/behavior_definition/high/handleGetBehaviorDefinition.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-behavior-implementation"></a>
### Read-Only / Behavior Implementation

<a id="getbehaviorimplementation-read-only-behavior-implementation"></a>
#### GetBehaviorImplementation (Read-Only / Behavior Implementation)
**Description:** [read-only] Reads the current source code of a RAP behavior implementation class (CLAS), or its metadata.

**Source:** `src/handlers/behavior_implementation/high/handleGetBehaviorImplementation.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-class"></a>
### Read-Only / Class

<a id="getclass-read-only-class"></a>
#### GetClass (Read-Only / Class)
**Description:** [read-only] Reads the current source code of an ABAP class (CLAS), or its metadata.

**Source:** `src/handlers/class/high/handleGetClass.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-common"></a>
### Read-Only / Common

<a id="getobjectversions-read-only-common"></a>
#### GetObjectVersions (Read-Only / Common)
**Description:** [read-only] Reads the version history of an ABAP class (CLAS), program (PROG), interface (INTF), function module (FUGR), table (TABL), structure (TABL), CDS view (DDLS) or other versioned object.

**Source:** `src/handlers/common/readonly/handleGetObjectVersions.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, optional) - Owning function group name. Required when object_type is function_module.
- `object_name` (string, required) - Object name.
- `object_type` (string, required, one of: `class`, `program`, `interface`, `function_module`, `table`, `structure`, `ddl`, `behavior_definition`, `metadata_extension`, `table_type`) - Object type.

---

<a id="getobjectdraft-read-only-common"></a>
#### GetObjectDraft (Read-Only / Common)
**Description:** [read-only] Reads whether an ABAP class (CLAS), interface (INTF), program (PROG), CDS view (DDLS), table (TABL) or other development object holds an unactivated change, and whose.

**Source:** `src/handlers/common/readonly/handleGetObjectDraft.ts`

**Parameters:**
- `function_group_name` (string, optional) - The function group of a FUNCTION_MODULE (required for it).
- `object_name` (string, required) - Object name.
- `object_type` (string, required, one of: `PROGRAM`, `INCLUDE`, `INTERFACE`, `CLASS`, `BEHAVIOR_IMPLEMENTATION`, `FUNCTION_MODULE`, `FUNCTION_GROUP`, `DDL`, `BEHAVIOR_DEFINITION`, `METADATA_EXTENSION`, `SERVICE_DEFINITION`, `TABLE`, `STRUCTURE`, `DOMAIN`, `DATA_ELEMENT`, `TABLE_TYPE`) - Object type.

**On ABAP Cloud (`cloud`):** [read-only] Reads whether an ABAP class (CLAS), interface (INTF), function module (FUGR), CDS view (DDLS), table (TABL) or other development object holds an unactivated change, and whose.

**Parameters (`cloud`):**
- `function_group_name` (string, optional) - The function group of a FUNCTION_MODULE (required for it).
- `object_name` (string, required) - Object name.
- `object_type` (string, required, one of: `INTERFACE`, `CLASS`, `BEHAVIOR_IMPLEMENTATION`, `FUNCTION_MODULE`, `FUNCTION_GROUP`, `DDL`, `BEHAVIOR_DEFINITION`, `METADATA_EXTENSION`, `SERVICE_DEFINITION`, `TABLE`, `STRUCTURE`, `DOMAIN`, `DATA_ELEMENT`, `TABLE_TYPE`) - Object type.

---

<a id="getobjectversionsource-read-only-common"></a>
#### GetObjectVersionSource (Read-Only / Common)
**Description:** [read-only] Reads an older version of the source code of an ABAP class (CLAS), program (PROG), function module (FUGR), table (TABL), CDS view (DDLS) or other versioned object from its version history.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionSource.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the object's version history.
- `object_type` (string, required, one of: `class`, `program`, `interface`, `function_module`, `table`, `structure`, `ddl`, `behavior_definition`, `metadata_extension`) - Object type (the same value the version history was read with).

---

<a id="getobjectversiondiff-read-only-common"></a>
#### GetObjectVersionDiff (Read-Only / Common)
**Description:** [read-only] Reads two versions of a class (CLAS), program (PROG), CDS view (DDLS) or other source object from its version history and compares them.

**Source:** `src/handlers/common/readonly/handleGetObjectVersionDiff.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version (from the object's version history).
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version (from the object's version history).
- `object_type` (string, required, one of: `class`, `program`, `interface`, `function_module`, `table`, `structure`, `ddl`, `behavior_definition`, `metadata_extension`) - Object type (the same value the version history was read with).

---

<a id="read-only-data-element"></a>
### Read-Only / Data Element

<a id="getdataelement-read-only-data-element"></a>
#### GetDataElement (Read-Only / Data Element)
**Description:** [read-only] Reads an ABAP data element (DTEL) at the version asked, with its domain (DOMA) or built-in type, its labels, search help, package (DEVC) and description.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-ddl"></a>
### Read-Only / Ddl

<a id="getddl-read-only-ddl"></a>
#### GetDdl (Read-Only / Ddl)
**Description:** [read-only] Reads the current source code of a CDS view (DDLS) or classic DDL view, or its metadata.

**Source:** `src/handlers/ddl/high/handleGetDdl.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-domain"></a>
### Read-Only / Domain

<a id="getdomain-read-only-domain"></a>
#### GetDomain (Read-Only / Domain)
**Description:** [read-only] Reads an ABAP domain (DOMA) at the version asked, with its data type, length, output format, value table, fixed values, package (DEVC) and description.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-enhancement"></a>
### Read-Only / Enhancement

<a id="getenhancements-read-only-enhancement"></a>
#### GetEnhancements (Read-Only / Enhancement)
**Description:** [read-only] Reads the enhancement implementations (ENHO) of ABAP programs (PROG), includes (PROG), function groups (FUGR) or classes (CLAS) at their active version, and of their includes when asked.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancements.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `detailed` (boolean, optional) - [read-only] true: every field of each enhancement, as read; false (default): each enhancement by name, type and source. Either way every object read is answered, one without enhancements with total_enhancements 0
- `include_nested` (boolean, optional) - [read-only] true: also the enhancements of every include of a program or function group
- `max_includes` (integer, optional) - [read-only] With include_nested: how many includes are read (default 50)
- `object_name` (string, optional) - Name of the ABAP object (with object_type; or give objects)
- `object_type` (string, optional) - [read-only] Type of the ABAP object
- `objects` (array, optional) - [read-only] Several objects, read together (give this or object_name and object_type)
- `program` (string, optional) - [read-only] An include's main program, when its metadata names none

---

<a id="getenhancementspot-read-only-enhancement"></a>
#### GetEnhancementSpot (Read-Only / Enhancement)
**Description:** [read-only] Reads an enhancement spot (ENHS) at its active version.

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementSpot.ts`

**Parameters:**
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="getenhancementimpl-read-only-enhancement"></a>
#### GetEnhancementImpl (Read-Only / Enhancement)
**Description:** [read-only] Reads the active source code of an ABAP enhancement implementation (ENHO), by its name and enhancement spot (ENHS).

**Source:** `src/handlers/enhancement/readonly/handleGetEnhancementImpl.ts`

**Parameters:**
- `enhancement_name` (string, required) - [read-only] Name of the enhancement implementation
- `enhancement_spot` (string, required) - Name of the enhancement spot

---

<a id="read-only-function-group"></a>
### Read-Only / Function Group

<a id="getfunctiongroup-read-only-function-group"></a>
#### GetFunctionGroup (Read-Only / Function Group)
**Description:** [read-only] Reads an ABAP function group (FUGR) at the version asked, with its package (DEVC), description and contents.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-function-include"></a>
### Read-Only / Function Include

<a id="listfunctiongroupincludes-read-only-function-include"></a>
#### ListFunctionGroupIncludes (Read-Only / Function Include)
**Description:** [read-only] Lists the includes (FUGR) of an ABAP function group (FUGR), its TOP include among them, at its active version.

**Source:** `src/handlers/function_include/readonly/handleListFunctionGroupIncludes.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name.

---

<a id="listfunctionmodules-read-only-function-include"></a>
#### ListFunctionModules (Read-Only / Function Include)
**Description:** [read-only] Lists the function modules (FUGR) of an ABAP function group (FUGR), at its active version.

**Source:** `src/handlers/function_include/readonly/handleListFunctionModules.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name.

---

<a id="getfunctioninclude-read-only-function-include"></a>
#### GetFunctionInclude (Read-Only / Function Include)
**Description:** [read-only] Reads the current source code of an include (FUGR) of an ABAP function group (FUGR), or its metadata.

**Source:** `src/handlers/function_include/readonly/handleGetFunctionInclude.ts`

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `function_group_name` (string, required) - Function group containing the include.
- `include_name` (string, required) - Include name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-function-module"></a>
### Read-Only / Function Module

<a id="getfunctionmodule-read-only-function-module"></a>
#### GetFunctionModule (Read-Only / Function Module)
**Description:** [read-only] Reads the current source code of an ABAP function module (FUGR), BAPI and RFC-enabled ones too, with its parameter signature, or its metadata.

**Source:** `src/handlers/function_module/high/handleGetFunctionModule.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `function_group_name` (string, required) - Function group containing the function module.
- `function_module_name` (string, required) - Function module name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-include"></a>
### Read-Only / Include

<a id="getinclude-read-only-include"></a>
#### GetInclude (Read-Only / Include)
**Description:** [read-only] Reads the current source code of an ABAP include (PROG), or its metadata.

**Source:** `src/handlers/include/readonly/handleGetInclude.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `include_name` (string, required) - Include name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional, one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getincludeslist-read-only-include"></a>
#### GetIncludesList (Read-Only / Include)
**Description:** [read-only] Reads every include (PROG) of an ABAP program (PROG) or include, with the includes each one includes, down to the last. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/include/readonly/handleGetIncludesList.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `detailed` (boolean, optional (default: false)) - [read-only] If true, returns structured JSON with metadata and raw XML.
- `object_name` (string, optional) - Name of the ABAP program or include (with object_type; or give objects)
- `object_type` (string, optional, one of: `PROG/P`, `PROG/I`, `FUGR/F`, `CLAS/OC`, `FUGR`, `CLAS`) - [read-only] ADT object type of the parent. Supported: PROG/P, PROG/I, FUGR/F, CLAS/OC. A main type, the part of a code before its slash, stands for its code when exactly one listed code has it. In upper case, a search name of the system's object types list stands for the listed code its list item has (e.g. STRU for TABL/DS).
- `objects` (array, optional) - [read-only] Several objects, read together (give this or object_name and object_type)

---

<a id="getmainprograms-read-only-include"></a>
#### GetMainPrograms (Read-Only / Include)
**Description:** [read-only] Reads the main programs (PROG) of an ABAP include (PROG): each program that includes it, or the function group (FUGR) it belongs to.

**Source:** `src/handlers/include/readonly/handleGetMainPrograms.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_name` (string, required) - Include name.

---

<a id="read-only-interface"></a>
### Read-Only / Interface

<a id="getinterface-read-only-interface"></a>
#### GetInterface (Read-Only / Interface)
**Description:** [read-only] Reads the current source code of an ABAP interface (INTF), or its metadata.

**Source:** `src/handlers/interface/high/handleGetInterface.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `interface_name` (string, required) - Interface name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-leftover-session"></a>
### Read-Only / Leftover Session

<a id="listleftoversessions-read-only-leftover-session"></a>
#### ListLeftoverSessions (Read-Only / Leftover Session)
**Description:** [read-only] Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks.

**Source:** `src/handlers/leftover_session/session/handleListLeftoverSessions.ts`

**Parameters:**
- None

---

<a id="read-only-message-class"></a>
### Read-Only / Message Class

<a id="getmessageclass-read-only-message-class"></a>
#### GetMessageClass (Read-Only / Message Class)
**Description:** [read-only] Reads an ABAP message class (MSAG): its messages with their numbers and texts, and its master language.

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name.

---

<a id="getmessageclassmessage-read-only-message-class"></a>
#### GetMessageClassMessage (Read-Only / Message Class)
**Description:** [read-only] Reads one message of an ABAP message class (MSAG) at its active version, with its number, text, self-explanatory and long-text flags, last changer and change time.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="read-only-metadata-extension"></a>
### Read-Only / Metadata Extension

<a id="getmetadataextension-read-only-metadata-extension"></a>
#### GetMetadataExtension (Read-Only / Metadata Extension)
**Description:** [read-only] Reads the current source code of a CDS metadata extension (DDLX), or its metadata.

**Source:** `src/handlers/metadata_extension/high/handleGetMetadataExtension.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `metadata_extension_name` (string, required) - MetadataExtension name.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-package"></a>
### Read-Only / Package

<a id="getpackagecontents-read-only-package"></a>
#### GetPackageContents (Read-Only / Package)
**Description:** [read-only] Reads the objects of one or more ABAP packages (DEVC), with the objects of their subpackages when asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/package/readonly/handleGetPackageContents.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_descriptions` (boolean, optional) - Include each object's description in the response. The walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes (default: false)
- `include_subpackages` (boolean, optional) - Include contents of subpackages recursively (default: false)
- `max_depth` (number, optional) - Maximum depth for recursive package traversal (default: 5)
- `package_name` (string, optional) - Name of the ABAP package (give this or package_names)
- `package_names` (array, optional) - Names of several ABAP packages, read together (give this or package_name)

---

<a id="getpackage-read-only-package"></a>
#### GetPackage (Read-Only / Package)
**Description:** [read-only] Reads an ABAP package (DEVC) at the version asked.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `package_name` (string, required) - Package name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-program"></a>
### Read-Only / Program

<a id="getprogram-read-only-program"></a>
#### GetProgram (Read-Only / Program)
**Description:** [read-only] Reads the current source code of an ABAP program (PROG) or report, on ABAP Cloud one of SAP's standard programs, or its metadata.

**Source:** `src/handlers/program/high/handleGetProgram.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `program_name` (string, required) - Program name.
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-search"></a>
### Read-Only / Search

<a id="searchobject-read-only-search"></a>
#### SearchObject (Read-Only / Search)
**Description:** [read-only] Finds ABAP repository objects by name or name pattern, of any type or of one: classes (CLAS), programs (PROG), tables (TABL), interfaces (INTF) and every other kind. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/search/readonly/handleSearchObject.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `maxResults` (number, optional (default: 100)) - [read-only] Maximum number of results to return
- `object_name` (string, required) - [read-only] Object name or mask (e.g. 'MARA*')
- `object_type` (string, optional) - [read-only] Optional: restrict the search to one type: a name of the system's object types list — a main type (e.g. CLAS, DEVC, TABL), an alias of one subtype (e.g. STRU for structures, DTAB for database tables, FUNC for function modules) or a group — or an ADT type code, which stands for the name that selects it (e.g. TABL/DS for STRU, FUGR/FF for FUNC, ENHO/XHH for ENHO), either case; or a name standing for a code, written in lower case (e.g. class, structure, table, function), read as its code: view is a CDS view (DDLS), dbview a dictionary view (VIEW). A value in upper case is a search name or a code first, so VIEW is the dictionary views; it is a name only when it is neither (CLASS is class).

---

<a id="getobjectslist-read-only-search"></a>
#### GetObjectsList (Read-Only / Search)
**Description:** [read-only] Reads every object inside an ABAP program (PROG), function group (FUGR), class (CLAS), package (DEVC) or other composite object, down to its nested includes (PROG) and subcomponents. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/search/readonly/handleGetObjectsList.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `objects` (array, optional) - [read-only] Several parents, read together (give this or parent_name)
- `parent_name` (string, optional) - [read-only] Parent object name (with parent_tech_name and parent_type; or give objects)
- `parent_tech_name` (string, optional) - [read-only] Parent technical name
- `parent_type` (string, optional) - [read-only] Parent object type (e.g. PROG/P, FUGR)
- `with_short_descriptions` (boolean, optional) - [read-only] With detail medium or full: read each object's description from its metadata (default: true)

---

<a id="getobjectsbytype-read-only-search"></a>
#### GetObjectsByType (Read-Only / Search)
**Description:** [read-only] Reads the objects of one type, such as classes (CLAS), tables (TABL), programs (PROG) or interfaces (INTF), in an ABAP package (DEVC) or other composite object.

**Source:** `src/handlers/search/readonly/handleGetObjectsByType.ts`

**Parameters:**
- `format` (string, optional) - [read-only] Output format: 'parsed' (default). 'raw' is accepted for backward compatibility and answers the same TSV.
- `node_id` (string, required) - [read-only] Node ID
- `parent_name` (string, required) - [read-only] Parent object name
- `parent_tech_name` (string, required) - [read-only] Parent technical name
- `parent_type` (string, required) - [read-only] Parent object type
- `with_short_descriptions` (boolean, optional) - [read-only] Include short descriptions (default true): a description column on each row

---

<a id="read-only-service-binding"></a>
### Read-Only / Service Binding

<a id="getservicebinding-read-only-service-binding"></a>
#### GetServiceBinding (Read-Only / Service Binding)
**Description:** [read-only] Reads an OData service binding (SRVB) at its active version, with its binding definition, or its package (DEVC), person responsible and description, in the format asked.

**Source:** `src/handlers/service_binding/high/handleGetServiceBinding.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `response_format` (string, optional (default: xml), one of: `xml`, `json`, `plain`) - Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.
- `service_binding_name` (string, required) - Service binding name. Case-insensitive.

---

<a id="read-only-service-definition"></a>
### Read-Only / Service Definition

<a id="getservicedefinition-read-only-service-definition"></a>
#### GetServiceDefinition (Read-Only / Service Definition)
**Description:** [read-only] Reads the current source code of a service definition (SRVD), or its metadata.

**Source:** `src/handlers/service_definition/high/handleGetServiceDefinition.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `service_definition_name` (string, required) - ServiceDefinition name.
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-structure"></a>
### Read-Only / Structure

<a id="getstructureslist-read-only-structure"></a>
#### GetStructuresList (Read-Only / Structure)
**Description:** [read-only] Reads the structures (TABL) embedded in one or more ABAP structures, through their includes and appends, down to the last, at the version asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/structure/readonly/handleGetStructuresList.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_extensions` (boolean, optional (default: true)) - [read-only] Also find extension (append) structures via where-used (objects that `extend type <this> with …`). Default true. Set false to skip the (slower) where-used lookups and return includes only.
- `structure_name` (string, optional) - Structure name (or give structure_names).
- `structure_names` (array, optional) - Several structure names, read together (give this or structure_name).
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getstructure-read-only-structure"></a>
#### GetStructure (Read-Only / Structure)
**Description:** [read-only] Reads an ABAP structure (TABL) at the version asked, with its source code, or its package (DEVC), person responsible and description.

**Source:** `src/handlers/structure/high/handleGetStructure.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `structure_name` (string, required) - Structure name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-system"></a>
### Read-Only / System

<a id="getservicebindingpreviewurl-read-only-system"></a>
#### GetServiceBindingPreviewUrl (Read-Only / System)
**Description:** [read-only] Reads the Fiori preview URL of a published OData service binding (SRVB), with its service and $metadata URLs.

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
**Description:** [read-only] Reads the DDIC definition of a type name: each data element (DTEL), domain (DOMA), structure (TABL) or table type (TTYP) of that name, its inactive version where one exists.

**Source:** `src/handlers/system/readonly/handleGetTypeInfo.ts`

**Parameters:**
- `include_structure_fallback` (boolean, optional (default: true)) - When true (default), the name is also read as a DDIC structure; false leaves the structure read out.
- `type_name` (string, required) - Name of the ABAP type

---

<a id="gettransaction-read-only-system"></a>
#### GetTransaction (Read-Only / System)
**Description:** [read-only] Reads the properties of an ABAP transaction code.

**Source:** `src/handlers/system/readonly/handleGetTransaction.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transaction_name` (string, required) - Name of the ABAP transaction

---

<a id="runtimelistprofilertracefiles-read-only-system"></a>
#### RuntimeListProfilerTraceFiles (Read-Only / System)
**Description:** [read-only] Lists the ABAP profiler traces recorded in the system.

**Source:** `src/handlers/system/readonly/handleRuntimeListProfilerTraceFiles.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

---

<a id="runtimegetprofilertracedata-read-only-system"></a>
#### RuntimeGetProfilerTraceData (Read-Only / System)
**Description:** [read-only] Reads one view of an ABAP profiler trace: its hit list, its statements or its database accesses. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/readonly/handleRuntimeGetProfilerTraceData.ts`

**Parameters:**
- `auto_drill_down_threshold` (number, optional) - Auto drill-down threshold (for statements view).
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `id` (number, optional) - Statement node ID (for statements view).
- `trace_id_or_uri` (string, required) - Profiler trace ID or full ADT trace URI.
- `view` (string, required, one of: `hitlist`, `statements`, `db_accesses`) - Trace view to retrieve.
- `with_details` (boolean, optional) - Include statement details (for statements view).
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimegetdumpbyid-read-only-system"></a>
#### RuntimeGetDumpById (Read-Only / System)
**Description:** [read-only] Reads an ABAP runtime dump by its id, with a summary of where and why its program (PROG) terminated.

**Source:** `src/handlers/system/readonly/handleRuntimeGetDumpById.ts`

**Parameters:**
- `dump_id` (string, required) - The dump's id, or its URI as a dumps feed entry carries it.
- `response_mode` (string, optional, one of: `payload`, `summary`, `both`) - What is returned: "payload" — the parsed dump, "summary" — runtime error, exception, terminated program, time, user and termination position, "both" — summary and payload. "summary" and "both" need view "default". Default: "both" with view "default", "payload" with the other views.
- `view` (string, optional (default: default), one of: `default`, `summary`, `formatted`) - Dump view mode: default payload, summary section, or formatted long text. The summary fields are read from view "default" only.

---

<a id="runtimeanalyzeprofilertrace-read-only-system"></a>
#### RuntimeAnalyzeProfilerTrace (Read-Only / System)
**Description:** [read-only] Analyzes one view of an ABAP profiler trace, its hit list, its statements or its database accesses, ranked by time. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/readonly/handleRuntimeAnalyzeProfilerTrace.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `top` (number, optional) - Number of top rows for summary. Default: 10.
- `trace_id_or_uri` (string, required) - Profiler trace ID or full trace URI.
- `view` (string, optional (default: hitlist), one of: `hitlist`, `statements`, `db_accesses`)
- `with_system_events` (boolean, optional) - Include system events.

---

<a id="runtimelistfeeds-read-only-system"></a>
#### RuntimeListFeeds (Read-Only / System)
**Description:** [read-only] Lists the short dumps, system messages or SAP Gateway errors of an ABAP system by user and time, or the runtime feeds there are and their variants. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/readonly/handleRuntimeListFeeds.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `component` (string, optional) - Dumps whose application component contains this text, in any case.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `exception` (string, optional) - Dumps whose exception class contains this text, in any case.
- `feed_type` (string, optional, one of: `descriptors`, `variants`, `dumps`, `system_messages`, `gateway_errors`) - Feed to read. "descriptors" lists available feeds, "variants" lists feed variants, others read that specific feed. Default: descriptors.
- `feed_types` (array, optional) - Several feeds, read together with the same filters (give this or feed_type).
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Most entries to return, up to 1000; SAP answers at most 100 per request and the pages are read in turn. An answer holds whole seconds, so it may hold a few entries fewer, or a crowded second more, than asked. Default: 50.
- `object_name` (string, optional) - Dumps whose terminated object name contains this text, in any case.
- `package` (string, optional) - Dumps whose object package contains this text, in any case.
- `runtime_error` (string, optional) - Dumps whose runtime error contains this text, in any case.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format, inclusive; pass a previous next_to here to read on.
- `user` (string, optional) - Entries of this SAP user (exact match).

---

<a id="runtimelistsystemmessages-read-only-system"></a>
#### RuntimeListSystemMessages (Read-Only / System)
**Description:** [read-only] Lists the system messages of the SAP system, the ones SM02 shows, optionally by one author.

**Source:** `src/handlers/system/readonly/handleRuntimeListSystemMessages.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of messages to return.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter by author username.

---

<a id="runtimegetgatewayerrorlog-read-only-system"></a>
#### RuntimeGetGatewayErrorLog (Read-Only / System)
**Description:** [read-only] Reads the errors of the SAP Gateway error log, the one /IWFND/ERROR_LOG shows, or the detail of one error.

**Source:** `src/handlers/system/readonly/handleRuntimeGetGatewayErrorLog.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `detail_kind` (string, optional) - The error's detail_kind, from the list: the kind its detail is read under. Required with opid.
- `error_url` (string, optional) - An error's detailUri, from the list at detail medium or full: answers that error's detail instead of the list.
- `from` (string, optional) - Start of time range in YYYYMMDDHHMMSS format.
- `max_results` (number, optional) - Maximum number of errors to return.
- `opid` (string, optional) - An error's opid, from the list: with detail_kind, answers that error's detail instead of the list.
- `to` (string, optional) - End of time range in YYYYMMDDHHMMSS format.
- `user` (string, optional) - Filter errors by SAP username.

---

<a id="getwhereused-read-only-system"></a>
#### GetWhereUsed (Read-Only / System)
**Description:** [read-only] Reads where an ABAP class (CLAS), function module (FUGR), table (TABL) or other repository object is used: every object that uses, calls or references it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/readonly/handleGetWhereUsed.ts`

**Prompt:** the `where_used` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Answer:** `terse` (default) is TSV: a `# total N` line, then the tab-separated header `type name element uri usage` and one row per usage, grouped under `# package P` lines. Read the columns by the header, never by position: `element` (and, with `in_object`, `code`) were added in 24.2.1, and a column may be added again.
- A usage inside a method or a section of a class (SAP lists it with no type, the class only as its `parentUri`) is written under a `# in TYPE NAME` line that names the class by its type (`CLAS/OC`) and name, once per class, after the plain rows of its package; each row under it carries the method or section in `element` and its `usage`. The line holds until the next `# in` or `# package` line. The class is the node of the same answer at that `parentUri`, by the type SAP lists it with; a reference SAP leaves unresolved keeps its plain row. A program's usage names the program: SAP names no FORM.
- `uri` is filled only for a reference SAP lists without a name, or without a type and with no node of the answer at its `parentUri`: such a row is answered as SAP gave it, its type empty, its URI telling where it is.
- **`in_object`** (type and name of one using object, as the answer names it) answers that object's usages only, each with the source line it is on in a `code` column, trimmed (`DATA: lv_test TYPE ZMCP_SHR_DTEL.`), one row per line, after a `# in_object TYPE NAME: N usage(s)` line (`0 usage(s)` when it uses nothing, no error). The lines are read with one `usageSnippets` request over exactly that object's usages, as Eclipse reads them for the node opened; where a line's position names a method and the usage names none, that method is its `element`; a usage not in code has no line; a usage SAP's answer leaves out is counted on a `# no_snippet_sent N usage(s)` line (`snippets_absent: true` at medium and full). The type and the name may not be blank. Call it once per using object whose code is wanted; it is taken with one object, not with `objects`, and is not recorded in batch mode. A refused or unreadable `usageSnippets` read is the call's failure (step `read where-used code lines`).
- `medium` is JSON, one object per row: an element usage carries the class's `type` and `name` with `element` beside them, every row `package_name`, `responsible`, `usage_information` (and with `in_object` its `code`), and `uri` only where terse shows it. `full` keeps SAP's fields as they came (`name`, `type`, `uri`, …) and adds `parent_uri`, `object_identifier`, for an element usage `parent_type`, `parent_name`, `parent_package` and `element`, and with `in_object` SAP's `snippets` (each line's `uri` with its position, `content` as SAP sent it, `matches`).

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `container` (string, optional, one of: `program`, `function_group`) - With object_type PROG/PX, required: whose text elements they are, program or function_group. Taken by PROG/PX alone.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `disable_types` (array, optional) - Remove these ADT object types from the default scope, keeping the rest (e.g. ['CLAS/OC'] to drop class usages). Applied on top of the default scope or of enable_only_types/enable_all_types.
- `enable_all_types` (boolean, optional (default: false)) - If true, expands the scope to all available object types (Eclipse 'select all' behavior) by flipping every isSelected flag in the scope XML. Default: false (SAP default scope). Note: on large systems this can make the search significantly slower.
- `enable_only_types` (array, optional) - Restrict the search to ONLY these ADT object types (e.g. ['TABL/DS','TABL/DT'] for structures, ['DDLS/DF'] for CDS sources). SAP applies the selection server-side, so unwanted types (e.g. hundreds of CLAS/OC) are never searched nor returned — use this instead of enable_all_types to avoid huge result sets. Values must be object-type codes from THIS object's where-used scope (the searchable categories, e.g. 'CLAS/OC','INTF/OI','FUGR/FF','DDLS/DF', not result-row codes like 'FUGR/F'). If any value is not searchable for the object the call returns an error listing the supported types — it never falls back to the unfiltered default set. Takes precedence over enable_all_types.
- `in_object` (object, optional) - One object that uses it, as a where-used answer names it (type and name): the answer is then that object's usages only, each with its method or section and the source line it is on. Call once for each using object whose code lines are wanted; without it the answer is where each usage is, with no code lines.
- `object_name` (string, optional) - Name of the ABAP object (with object_type; or give objects). For function modules the name MUST be in the form 'GROUP|FM_NAME' (function group name, pipe, function module name).
- `object_type` (string, optional) - Type of the ABAP object: an ADT type code (either case), or a name standing for one (in brackets after it): CLAS/OC (class), INTF/OI (interface), PROG/P (program), PROG/I (include), FUGR/F (functiongroup), FUGR/FF (function, functionmodule, function_module, func), DEVC/K (package), DDLS/DF (view), VIEW/DV (dbview), TABL/DT (table), TABL/DS (structure, stru), TTYP/DA, DOMA/DD (domain), DTEL/DE (dataelement), DCLS/DL, BDEF/BDO, DDLX/EX, SRVD/SRV, SRVB/SVB, DSFD/SCF, DSFI/SFI, XSLT/VT, MSAG/N, FTG2/FT, AUTH, ENHO/XHH, ENHO/XHB, ENHS/XSB, PROG/PX. A function module is named as object_name says. PROG/PX is a program's or a function group's text elements; container says which. A name is written in lower case: view is a CDS view (DDLS/DF). A value in upper case is a code, a main type or a search name of the system's object types list first, so VIEW is the dictionary views (VIEW/DV); it is a name only when it is none of these (CLASS is class). A main type, the part of a code before its slash, stands for its code when exactly one listed code has it. In upper case, a search name of the system's object types list stands for the listed code its list item has (e.g. STRU for TABL/DS).
- `objects` (array, optional) - Several objects, read together (give this or object_name and object_type). The type filters apply to every object.

---

<a id="getobjectinfo-read-only-system"></a>
#### GetObjectInfo (Read-Only / System)
**Description:** [read-only] Reads the repository browser of a package (DEVC), class (CLAS), program (PROG), function group (FUGR) or other repository object, with descriptions and packages when asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/readonly/handleGetObjectInfo.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `enrich` (boolean, optional (default: true)) - [read-only] Whether to add description and package via SearchObject (default true)
- `include_descriptions` (boolean, optional (default: false)) - [read-only] Include each leaf's description, read from the leaf's metadata once the structure is read: one more read per leaf (in ADT batch envelopes where the system serves them), which on a large tree takes most of the call (default false)
- `maxDepth` (integer, optional (default: 1)) - [read-only] Maximum tree depth (default depends on type). Every object's own type folders and their contents are always shown (one tier); a higher value only descends further for PACKAGES, expanding nested subpackages that many tiers deep — no captured node-structure document shows a non-package object usefully recursable beyond its own type folders, so other object types are capped at one tier regardless of a higher value here.
- `objects` (array, optional) - [read-only] Several objects, read together (give this or parent_type and parent_name)
- `parent_name` (string, optional) - [read-only] Parent object name
- `parent_type` (string, optional) - [read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P); with parent_name, or give objects

---

<a id="getinactiveobjects-read-only-system"></a>
#### GetInactiveObjects (Read-Only / System)
**Description:** [read-only] Reads the inactive ABAP objects of the system: classes (CLAS), tables (TABL), CDS views (DDLS) and other objects changed and awaiting activation.

**Source:** `src/handlers/system/readonly/handleGetInactiveObjects.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

---

<a id="getadttypes-read-only-system"></a>
#### GetAdtTypes (Read-Only / System)
**Description:** [read-only] Reads the repository object types the ABAP system knows, by their type codes.

**Source:** `src/handlers/system/readonly/handleGetAllTypes.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `validate_type` (string, optional) - Type name to validate (optional)

---

<a id="getobjectstructure-read-only-system"></a>
#### GetObjectStructure (Read-Only / System)
**Description:** [read-only] Reads the structure (TABL) of an ABAP repository object, such as a CDS view (DDLS): its parts and their parts, down to the last level.

**Source:** `src/handlers/system/readonly/handleGetObjectStructure.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `objectname` (string, required) - ADT object name (e.g. /CBY/ACQ_DDL)
- `objecttype` (string, required) - ADT object type (e.g. DDLS/DF)

---

<a id="getobjectoutline-read-only-system"></a>
#### GetObjectOutline (Read-Only / System)
**Description:** [read-only] Reads the components of an ABAP class (CLAS), interface (INTF), program (PROG) or function group (FUGR), with where each one is defined in its source.

**Source:** `src/handlers/system/readonly/handleGetObjectOutline.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `object_name` (string, required) - Object name.
- `object_type` (string, required, one of: `CLAS/OC`, `INTF/OI`, `PROG/P`, `FUGR/F`) - ADT type of the object: CLAS/OC, INTF/OI, PROG/P, FUGR/F (class, interface, program, function group).
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

**On ABAP Cloud (`cloud`):** [read-only] Reads the components of an ABAP class (CLAS), interface (INTF), program (PROG) or function group (FUGR), with where each one is defined in its source.

**Parameters (`cloud`):**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `object_name` (string, required) - Object name.
- `object_type` (string, required, one of: `CLAS/OC`, `INTF/OI`, `FUGR/F`) - ADT type of the object: CLAS/OC, INTF/OI, FUGR/F (class, interface, function group).
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getobjectnodefromcache-read-only-system"></a>
#### GetObjectNodeFromCache (Read-Only / System)
**Description:** [read-only] Reads one repository object the last objects listing named, by its type, name and technical name, with the content at its URI in the active version.

**Source:** `src/handlers/system/readonly/handleGetObjectNodeFromCache.ts`

**Parameters:**
- `object_name` (string, required) - [read-only] Object name
- `object_type` (string, required) - [read-only] Object type
- `tech_name` (string, required) - [read-only] Technical name

---

<a id="describebylist-read-only-system"></a>
#### DescribeByList (Read-Only / System)
**Description:** [read-only] Describes several ABAP repository objects named in one call, each by its name and, when known, its type. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/readonly/handleDescribeByList.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `objects` (array, required)

---

<a id="getpackagetree-read-only-system"></a>
#### GetPackageTree (Read-Only / System)
**Description:** [read-only] Reads the whole hierarchy of one or more ABAP packages (DEVC): each package with its subpackages and their objects, down to the last level. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/high/handleGetPackageTree.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `debug` (boolean, optional (default: false)) - Include diagnostic metadata in response (counts, types, hierarchy info). Default: false
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_descriptions` (boolean, optional (default: false)) - Include each object's description in the response. The package metadata and the walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes. Default: false
- `include_subpackages` (boolean, optional (default: true)) - Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true
- `max_depth` (integer, optional (default: 5)) - Maximum depth for recursive package traversal. Default: 5
- `package_name` (string, optional) - Package name (give this or package_names)
- `package_names` (array, optional) - Several package names, read together (give this or package_name)

---

<a id="getsqlquery-read-only-system"></a>
#### GetSqlQuery (Read-Only / System)
**Description:** [read-only] Reads the data an ABAP SQL SELECT selects from database tables (TABL) and CDS views (DDLS), up to the number of records asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/readonly/handleGetSqlQuery.ts`

**Opt-in:** served only by a binary started with `--enable-data-tools` (`MCP_ENABLE_DATA_TOOLS`, `enable-data-tools`); off by default. SAP API Policy FAQ v1.3 (June 2026), Q33, says ADT APIs are not intended for reading application tables, exporting business data or running SQL against SAP systems; whether to enable it is the customer's decision.

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `row_number` (number, optional (default: 100)) - [read-only] Maximum number of rows to return
- `sql_query` (string, required) - SQL query to execute

---

<a id="searchsource-read-only-system"></a>
#### SearchSource (Read-Only / System)
**Description:** [read-only] Searches the ABAP source code of one or more packages (DEVC) for a text: programs (PROG), includes (PROG), function groups (FUGR), classes (CLAS), interfaces (INTF) and CDS sources. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/system/readonly/handleSearchSource.ts`

**Parameters:**
- `answer` (string, optional, one of: `objects`, `lines`, `snippets`) - What each hit is answered as: lines (line, no snippet; the default at detail terse), snippets (line and snippet; the default at medium and full) or objects (one entry per object and include with its number of hits).
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `exclude` (array, optional) - Substrings; a line containing any of them is dropped. Absent, no line is dropped.
- `exclude_comments` (boolean, optional) - Skip col-1 '*' and full-line '"' comment lines. Default false (comments are scanned).
- `include_subpackages` (boolean, optional) - Recurse into subpackages (default true).
- `max_hits` (integer, optional) - The most hits of the whole answer, counted in the scan order after max_hits_per_object; reached, the scan stops reading the next objects and truncated.by_max_hits is true when anything was left. Absent, no limit: every object is read and every hit answered.
- `max_hits_per_object` (integer, optional) - The most hits answered per object, across its sources; absent, no limit. When an object has more, truncated.by_object_cap is true.
- `object_filter` (string, optional) - Glob applied to object names within each package (e.g. "Z*").
- `object_types` (array, optional) - Object types to scan, by main type: PROG (programs and program includes), FUGR, CLAS, INTF, DDLS, BDEF, DDLX, SRVD. Default: all of them.
- `packages` (array, required) - Packages to scan. Each entry is an exact package name or a mask: `*` stands for zero or more characters, `?` for one character, and a namespace prefix may lead it; `+`, `_`, `%` and `#` are characters of the name.
- `query` (string, required) - Primary substring to match (case-insensitive, ABAP CS).
- `query2` (string, optional) - Optional second substring. When set, both query and query2 must appear on the same line.
- `version` (string, optional, one of: `active`, `inactive`, `workingArea`) - The version every source is read at. Default active.

---

<a id="read-only-table"></a>
### Read-Only / Table

<a id="gettablesettings-read-only-table"></a>
#### GetTableSettings (Read-Only / Table)
**Description:** [read-only] Reads the technical settings of an ABAP database table (TABL) at the version asked.

**Source:** `src/handlers/table/readonly/handleGetTableSettings.ts`

**Parameters:**
- `table_name` (string, required) - Table name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="gettable-read-only-table"></a>
#### GetTable (Read-Only / Table)
**Description:** [read-only] Reads an ABAP database table (TABL) at the version asked, with its source code, or its package (DEVC), person responsible and description.

**Source:** `src/handlers/table/high/handleGetTable.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `table_name` (string, required) - Table name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="gettablecontents-read-only-table"></a>
#### GetTableContents (Read-Only / Table)
**Description:** [read-only] Reads the data of an ABAP database table (TABL) or CDS view (DDLS), as SE16 previews it, up to the number of records asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/table/readonly/handleGetTableContents.ts`

**Opt-in:** served only by a binary started with `--enable-data-tools` (`MCP_ENABLE_DATA_TOOLS`, `enable-data-tools`); off by default. SAP API Policy FAQ v1.3 (June 2026), Q33, says ADT APIs are not intended for reading application tables, exporting business data or running SQL against SAP systems; whether to enable it is the customer's decision.

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `max_rows` (number, optional) - Maximum number of rows to retrieve
- `table_name` (string, required) - Name of the ABAP table

---

<a id="read-only-table-type"></a>
### Read-Only / Table Type

<a id="gettabletype-read-only-table-type"></a>
#### GetTableType (Read-Only / Table Type)
**Description:** [read-only] Reads an ABAP table type (TTYP) at the version asked, with its element type, access, key, package (DEVC) and description.

**Source:** `src/handlers/table_type/high/handleGetTableType.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `table_type_name` (string, required) - Table type name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-text-elements"></a>
### Read-Only / Text Elements

<a id="gettextelements-read-only-text-elements"></a>
#### GetTextElements (Read-Only / Text Elements)
**Description:** [read-only] Reads the text elements of an ABAP program (PROG), function group (FUGR) or class (CLAS) in its original language at the version asked: text symbols, selection texts and headings.

**Source:** `src/handlers/text_elements/readonly/handleGetTextElements.ts`

**Parameters:**
- `object_kind` (string, required, one of: `program`, `function_group`, `class`) - Kind of object: program, function_group or class.
- `object_name` (string, required) - Name of the program, function group or class.
- `parts` (array, optional) - Parts to read: symbols, selections, headings. Default: every part of the object; a class has symbols only.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="read-only-transport"></a>
### Read-Only / Transport

<a id="gettransport-read-only-transport"></a>
#### GetTransport (Read-Only / Transport)
**Description:** [read-only] Reads an ABAP transport or one of its tasks by its number, and says which of the two it is.

**Source:** `src/handlers/transport/readonly/handleGetTransport.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_objects` (boolean, optional (default: true)) - With detail terse: list a task's objects (default: true); their count is answered either way.
- `include_tasks` (boolean, optional (default: true)) - With detail terse: list a request's tasks (default: true); their count is answered either way.
- `transport_number` (string, required) - Transport request or task number

---

<a id="listtransports-read-only-transport"></a>
#### ListTransports (Read-Only / Transport)
**Description:** [read-only] Lists a user's transports, workbench, customizing and transport-of-copies alike, that the user owns or holds a task in. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/transport/readonly/handleListTransports.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `modifiable_only` (boolean, optional) - Modifiable requests only (true, the default), or modifiable and released requests (false; released ones from SAP's default window of the last 14 days).
- `user` (string, optional) - The SAP user whose requests to list, sent in upper case. Default: the session's login user.

---

<a id="readtransportobjects-read-only-transport"></a>
#### ReadTransportObjects (Read-Only / Transport)
**Description:** [read-only] Reads the objects a transport or one of its tasks holds, each with the position a removal names.

**Source:** `src/handlers/transport/readonly/handleReadTransportObjects.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_number` (string, required) - Transport REQUEST or TASK number. A task answers its own entries; a request answers the entries of each of its tasks, each with its `task` number — the task a removal addresses.

---

<a id="readtransportactionlog-read-only-transport"></a>
#### ReadTransportActionLog (Read-Only / Transport)
**Description:** [read-only] Reads the action log of a transport or task: every event of its life, its objects added and taken out among them.

**Source:** `src/handlers/transport/readonly/handleReadTransportActionLog.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_number` (string, required) - Transport REQUEST or TASK number. A request answers its own lifecycle events; a task answers the events of the objects on it.

---

<a id="read-only-unit-test"></a>
### Read-Only / Unit Test

<a id="getunittestresult-read-only-unit-test"></a>
#### GetUnitTestResult (Read-Only / Unit Test)
**Description:** [read-only] Reads the result of an ABAP Unit test run by its id, waiting while the run goes on.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Prompt:** the `unit_test` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `format` (string, optional, one of: `abapunit`, `junit`) - Result format: abapunit or junit.
- `run_id` (string, required) - Run id a unit test run answered.
- `with_navigation_uris` (boolean, optional) - Include navigation URIs in result if supported.

---

<a id="streamable-http-binaries"></a>
## Streamable HTTP Binaries

`mcp-abap-adt-sse-ro` (SSE) serves the tools of `mcp-abap-adt-ro` without `ListLeftoverSessions`, which are stdio's only. `mcp-abap-adt-http-ro` (Streamable HTTP) serves the same tools, and beside them:

- **The `state_handle` argument.** On `mcp-abap-adt-http-ro` (Streamable HTTP) every tool declares one more, optional argument, `state_handle` (string): "The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance." A tool whose own schema declares `state_handle` (the debugger tools) keeps its own declaration, required where it is required. No stdio or SSE binary declares it; the parameters listed per tool on this page are the stdio ones, without it.
- **The long session:** `SessionOpen`, `SessionClose`, served by no stdio or SSE binary. Their parameters below are the ones `mcp-abap-adt-http-ro` registers, `state_handle` included.

<a id="sessionopen-streamable-http"></a>
### SessionOpen (Streamable HTTP)
**Description:** [read-only] Opens a long session on this server, keeping its server instance and SAP connection for every call that carries its state handle.

**Parameters:**
- `state_handle` (string, optional) - The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.

---

<a id="sessionclose-streamable-http"></a>
### SessionClose (Streamable HTTP)
**Description:** [read-only] Closes the long session a state handle names, logging off its SAP sessions and so releasing their locks.

**Parameters:**
- `state_handle` (string, optional) - The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.

---

*Last updated: 2026-11-27*
