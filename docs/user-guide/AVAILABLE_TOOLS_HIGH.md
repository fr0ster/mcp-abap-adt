# High-Level Tools - MCP ABAP ADT Server

Generated from the tool definitions the server builds (not from docs).

The high-level tools of `mcp-abap-adt`, `-http` and `-sse`.

- Level: High-Level
- Total tools: 196

## Navigation

- [High-Level Group](#high-level-group)
  - [Abapgit](#high-level-abapgit)
    - [GetAbapGitBranchInfo](#getabapgitbranchinfo-high-level-abapgit)
    - [LinkAbapGitRepo](#linkabapgitrepo-high-level-abapgit)
    - [PullAbapGitRepo](#pullabapgitrepo-high-level-abapgit)
    - [PushAbapGitRepo](#pushabapgitrepo-high-level-abapgit)
    - [SwitchAbapGitBranch](#switchabapgitbranch-high-level-abapgit)
    - [UnlinkAbapGitRepo](#unlinkabapgitrepo-high-level-abapgit)
  - [Atc](#high-level-atc)
    - [GetATCFindings](#getatcfindings-high-level-atc)
    - [GetATCResult](#getatcresult-high-level-atc)
    - [GetATCRunStatus](#getatcrunstatus-high-level-atc)
    - [ListATCResults](#listatcresults-high-level-atc)
    - [RunATC](#runatc-high-level-atc)
  - [Behavior Definition](#high-level-behavior-definition)
    - [ActivateBehaviorDefinition](#activatebehaviordefinition-high-level-behavior-definition)
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
    - [ActivateClass](#activateclass-high-level-class)
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
    - [GetTableTypeVersions](#gettabletypeversions-high-level-common)
    - [GetTableVersionDiff](#gettableversiondiff-high-level-common)
    - [GetTableVersions](#gettableversions-high-level-common)
    - [GetTableVersionSource](#gettableversionsource-high-level-common)
  - [Data Element](#high-level-data-element)
    - [ActivateDataElement](#activatedataelement-high-level-data-element)
    - [CheckDataElement](#checkdataelement-high-level-data-element)
    - [CreateDataElement](#createdataelement-high-level-data-element)
    - [DeleteDataElement](#deletedataelement-high-level-data-element)
    - [GetDataElement](#getdataelement-high-level-data-element)
    - [UpdateDataElement](#updatedataelement-high-level-data-element)
  - [Ddl](#high-level-ddl)
    - [ActivateDdl](#activateddl-high-level-ddl)
    - [CheckDdl](#checkddl-high-level-ddl)
    - [CreateDdl](#createddl-high-level-ddl)
    - [DeleteDdl](#deleteddl-high-level-ddl)
    - [GetDdl](#getddl-high-level-ddl)
    - [UpdateDdl](#updateddl-high-level-ddl)
  - [Ddlx](#high-level-ddlx)
    - [ActivateMetadataExtension](#activatemetadataextension-high-level-ddlx)
    - [CheckMetadataExtension](#checkmetadataextension-high-level-ddlx)
    - [CreateMetadataExtension](#createmetadataextension-high-level-ddlx)
    - [UpdateMetadataExtension](#updatemetadataextension-high-level-ddlx)
  - [Domain](#high-level-domain)
    - [ActivateDomain](#activatedomain-high-level-domain)
    - [CheckDomain](#checkdomain-high-level-domain)
    - [CreateDomain](#createdomain-high-level-domain)
    - [DeleteDomain](#deletedomain-high-level-domain)
    - [GetDomain](#getdomain-high-level-domain)
    - [UpdateDomain](#updatedomain-high-level-domain)
  - [Function](#high-level-function)
    - [ActivateFunctionGroup](#activatefunctiongroup-high-level-function)
    - [ActivateFunctionModule](#activatefunctionmodule-high-level-function)
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
  - [Include](#high-level-include)
    - [ActivateInclude](#activateinclude-high-level-include)
    - [CreateInclude](#createinclude-high-level-include)
    - [DeleteInclude](#deleteinclude-high-level-include)
    - [UpdateInclude](#updateinclude-high-level-include)
    - [UpdateIncludeMetadata](#updateincludemetadata-high-level-include)
  - [Interface](#high-level-interface)
    - [ActivateInterface](#activateinterface-high-level-interface)
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
    - [ActivateProgram](#activateprogram-high-level-program)
    - [CheckProgram](#checkprogram-high-level-program)
    - [CreateProgram](#createprogram-high-level-program)
    - [DeleteProgram](#deleteprogram-high-level-program)
    - [GetProgram](#getprogram-high-level-program)
    - [UpdateProgram](#updateprogram-high-level-program)
  - [Service Binding](#high-level-service-binding)
    - [ActivateServiceBinding](#activateservicebinding-high-level-service-binding)
    - [CreateServiceBinding](#createservicebinding-high-level-service-binding)
    - [DeleteServiceBinding](#deleteservicebinding-high-level-service-binding)
    - [GetServiceBinding](#getservicebinding-high-level-service-binding)
    - [ListServiceBindingTypes](#listservicebindingtypes-high-level-service-binding)
    - [UpdateServiceBinding](#updateservicebinding-high-level-service-binding)
    - [ValidateServiceBinding](#validateservicebinding-high-level-service-binding)
  - [Service Definition](#high-level-service-definition)
    - [ActivateServiceDefinition](#activateservicedefinition-high-level-service-definition)
    - [CreateServiceDefinition](#createservicedefinition-high-level-service-definition)
    - [DeleteServiceDefinition](#deleteservicedefinition-high-level-service-definition)
    - [GetServiceDefinition](#getservicedefinition-high-level-service-definition)
    - [UpdateServiceDefinition](#updateservicedefinition-high-level-service-definition)
  - [Structure](#high-level-structure)
    - [ActivateStructure](#activatestructure-high-level-structure)
    - [CheckStructure](#checkstructure-high-level-structure)
    - [CreateStructure](#createstructure-high-level-structure)
    - [DeleteStructure](#deletestructure-high-level-structure)
    - [GetStructure](#getstructure-high-level-structure)
    - [UpdateStructure](#updatestructure-high-level-structure)
  - [System](#high-level-system)
    - [GetPackageTree](#getpackagetree-high-level-system)
    - [RuntimeCreateProfilerTraceParameters](#runtimecreateprofilertraceparameters-high-level-system)
    - [RuntimeRunClass](#runtimerunclass-high-level-system)
    - [RuntimeRunProgram](#runtimerunprogram-high-level-system)
  - [Table](#high-level-table)
    - [ActivateTable](#activatetable-high-level-table)
    - [CheckTable](#checktable-high-level-table)
    - [CreateTable](#createtable-high-level-table)
    - [DeleteTable](#deletetable-high-level-table)
    - [GetTable](#gettable-high-level-table)
    - [UpdateTable](#updatetable-high-level-table)
    - [UpdateTableSettings](#updatetablesettings-high-level-table)
  - [Table Type](#high-level-table-type)
    - [ActivateTableType](#activatetabletype-high-level-table-type)
    - [CheckTableType](#checktabletype-high-level-table-type)
    - [CreateTableType](#createtabletype-high-level-table-type)
    - [DeleteTableType](#deletetabletype-high-level-table-type)
    - [GetTableType](#gettabletype-high-level-table-type)
    - [UpdateTableType](#updatetabletype-high-level-table-type)
  - [Text Elements](#high-level-text-elements)
    - [UpdateTextElements](#updatetextelements-high-level-text-elements)
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
    - [GetUnitTestResult](#getunittestresult-high-level-unit-test)
    - [RunAbapUnit](#runabapunit-high-level-unit-test)
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

<a id="high-level-abapgit"></a>
### High-Level / Abapgit

<a id="getabapgitbranchinfo-high-level-abapgit"></a>
#### GetAbapGitBranchInfo (High-Level / Abapgit)
**Description:** Reads the abapGit branch information of a remote repository for the package (DEVC) it would be linked to.

**Source:** `src/handlers/abapgit/high/handleGetAbapGitBranchInfo.ts`

**Parameters:**
- `branch` (string, required) - The branch, as CheckAbapGitExternalRepo lists it (for example refs/heads/main).
- `detail` (string, optional, one of: `terse`, `medium`, `full`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.
- `package_name` (string, required) - The ABAP package the repository is linked to.
- `url` (string, required) - The remote repository URL over HTTPS, without a user, a password, a query or a fragment.

---

<a id="linkabapgitrepo-high-level-abapgit"></a>
#### LinkAbapGitRepo (High-Level / Abapgit)
**Description:** Links an ABAP package (DEVC) to a remote abapGit repository on a branch and imports the branch's objects into it, recorded in a transport.

**Source:** `src/handlers/abapgit/high/handleLinkAbapGitRepo.ts`

**Parameters:**
- `background` (boolean, optional) - When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.
- `branch` (string, required) - The branch, as CheckAbapGitExternalRepo lists it (for example refs/heads/main).
- `package_name` (string, required) - The ABAP package the repository is linked to.
- `transport_request` (string, optional) - The transport request that records the objects written.
- `url` (string, required) - The remote repository URL over HTTPS, without a user, a password, a query or a fragment.

**On ABAP Cloud (`cloud`):** Links an ABAP package (DEVC) to a remote abapGit repository on a branch, mapping its folders to subpackages as asked.

**Parameters (`cloud`):**
- `branch` (string, required) - The branch, as CheckAbapGitExternalRepo lists it (for example refs/heads/main).
- `folder_logic` (string, optional, one of: `FULL`, `PREFIX`) - How the repository's folders map to subpackages: FULL or PREFIX (SAP's default FULL).
- `package_name` (string, required) - The ABAP package the repository is linked to.
- `transport_request` (string, optional) - The transport request that records the objects written.
- `url` (string, required) - The remote repository URL over HTTPS, without a user, a password, a query or a fragment.

---

<a id="pullabapgitrepo-high-level-abapgit"></a>
#### PullAbapGitRepo (High-Level / Abapgit)
**Description:** Pulls an abapGit repository from the branch it is linked on, importing every object changed in the remote, recorded in a transport.

**Source:** `src/handlers/abapgit/high/handlePullAbapGitRepo.ts`

**Parameters:**
- `background` (boolean, optional) - When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.
- `transport_request` (string, optional) - The transport request that records the objects written.

**On ABAP Cloud (`cloud`):** Pulls an abapGit repository from the branch it is linked on as an SAP job, recorded in a transport, its imported objects left inactive.

**Parameters (`cloud`):**
- `overwrite` (array, optional) - The objects listed by GetAbapGitModifiedObjects to overwrite with their remote version, each once, by type and name; a name the list holds under two types is refused, within one list or across both: SAP matches by name within each list, so a collision inside one list could take an object not named. SAP selects by name when its job runs, against the list as it stands then: of the objects outside the selection, the remote-only adds and updates are imported, and every other one (changes in the system, remote deletions, objects of other packages) keeps its system state; SAP leaves a package warning with action 5 (delete and re-create) out of every pull. Without it the job takes every other listed object.
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.
- `transport_request` (string, optional) - The transport request that records the objects written.

---

<a id="pushabapgitrepo-high-level-abapgit"></a>
#### PushAbapGitRepo (High-Level / Abapgit)
**Description:** Pushes the objects and files chosen from an abapGit repository's staging to its remote branch, as a commit with its comment, author and committer.

**Source:** `src/handlers/abapgit/high/handlePushAbapGitRepo.ts`

**Parameters:**
- `author` (object, required) - The commit author: name and email (GetAbapGitStaging answers the proposal of this system).
- `background` (boolean, optional) - When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.
- `comment` (string, required) - The commit message.
- `committer` (object, required) - The committer: name and email (GetAbapGitStaging answers the proposal of this system).
- `objects` (array, required) - The objects and files to commit, each as GetAbapGitStaging with detail "medium" answers it.
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.

**On ABAP Cloud (`cloud`):** Pushes the objects and files chosen from an abapGit repository's staging to its remote branch as a commit, run as an SAP job.

**Parameters (`cloud`):**
- `author` (object, required) - The commit author: name and email (GetAbapGitStaging answers the proposal of this system).
- `comment` (string, required) - The commit message.
- `committer` (object, required) - The committer: name and email (GetAbapGitStaging answers the proposal of this system).
- `objects` (array, required) - The objects and files to commit, each as GetAbapGitStaging with detail "medium" answers it.
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.

---

<a id="switchabapgitbranch-high-level-abapgit"></a>
#### SwitchAbapGitBranch (High-Level / Abapgit)
**Description:** Switches an abapGit repository to a branch, creating the branch in the remote first when asked.

**Source:** `src/handlers/abapgit/high/handleSwitchAbapGitBranch.ts`

**Parameters:**
- `branch` (string, required) - The branch, as CheckAbapGitExternalRepo lists it (for example refs/heads/main).
- `create` (boolean, required) - true creates the branch in the remote when it does not exist; false switches to an existing branch only.
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.

---

<a id="unlinkabapgitrepo-high-level-abapgit"></a>
#### UnlinkAbapGitRepo (High-Level / Abapgit)
**Description:** Unlinks an abapGit repository by its key, keeping its objects in the system and its remote as it is.

**Source:** `src/handlers/abapgit/high/handleUnlinkAbapGitRepo.ts`

**Parameters:**
- `repository_key` (string, required) - The key of a linked repository, as ListAbapGitRepos answers it.

---

<a id="high-level-atc"></a>
### High-Level / Atc

<a id="getatcfindings-high-level-atc"></a>
#### GetATCFindings (High-Level / Atc)
**Description:** [read-only] Reads the findings of an ATC run by its worklist, whether the run was waited for or goes on in the background. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/atc/high/handleGetATCFindings.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `worklist_id` (string, required) - Worklist identifier an ATC run answered.

---

<a id="getatcresult-high-level-atc"></a>
#### GetATCResult (High-Level / Atc)
**Description:** [read-only] Reads a stored ATC result by its display ID: its findings and the counts per priority. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/atc/high/handleGetATCResult.ts`

**Parameters:**
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `display_id` (string, required) - Display ID of a stored ATC result.

---

<a id="getatcrunstatus-high-level-atc"></a>
#### GetATCRunStatus (High-Level / Atc)
**Description:** [read-only] Reads the status of an ATC run by its id, and whether it has ended.

**Source:** `src/handlers/atc/high/handleGetATCRunStatus.ts`

**Parameters:**
- `run_id` (string, required) - Run identifier an ATC run started with wait=false answered.

---

<a id="listatcresults-high-level-atc"></a>
#### ListATCResults (High-Level / Atc)
**Description:** [read-only] Lists the ATC results the system holds for a user or for every user, newest first, within an age range in days. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Source:** `src/handlers/atc/high/handleListATCResults.ts`

**Parameters:**
- `age_max` (integer, optional) - Oldest age to list, in days.
- `age_min` (integer, optional) - Youngest age to list, in days.
- `background` (boolean, optional) - Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; GetBackgroundRun answers its result once, and DiscardBackgroundRun cancels it while it runs. false: the call answers the result itself.
- `central_only` (boolean, optional) - true lists central results only; absent lists every kind.
- `created_by` (string, required) - Whose results: a user name, or * for every user.

---

<a id="runatc-high-level-atc"></a>
#### RunATC (High-Level / Atc)
**Description:** [read-only] Runs the ABAP Test Cockpit checks of a check variant over ABAP objects and packages (DEVC), recording their findings in a new worklist.

**Source:** `src/handlers/atc/high/handleRunATC.ts`

**Parameters:**
- `check_variant` (string, optional) - ATC check variant. Omitted, the system's own default variant is used.
- `max_findings` (integer, optional (default: 100)) - Cap on findings the run records (maximumVerdicts). A whole number, at least 1. Default 100.
- `objects` (array, required) - The objects to check. One run may cover several; each needs a name and a type.
- `wait` (boolean, optional (default: false)) - Hold the request until the checks finish and answer the finding counts. Default false: the run starts and answers a run_id to poll.

---

<a id="high-level-behavior-definition"></a>
### High-Level / Behavior Definition

<a id="activatebehaviordefinition-high-level-behavior-definition"></a>
#### ActivateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Activates a RAP behavior definition (BDEF), so its inactive version is in force.

**Source:** `src/handlers/behavior_definition/low/handleActivateBehaviorDefinition.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `name` (string, required) - Behavior definition name (root entity).

---

<a id="checkbehaviordefinition-high-level-behavior-definition"></a>
#### CheckBehaviorDefinition (High-Level / Behavior Definition)
**Description:** [read-only] Checks the syntax of a RAP behavior definition (BDEF).

**Source:** `src/handlers/behavior_definition/high/handleCheckBehaviorDefinition.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `name` (string, required) - BehaviorDefinition name.
- `version` (string, optional, one of: `active`, `inactive`) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createbehaviordefinition-high-level-behavior-definition"></a>
#### CreateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Creates a managed, unmanaged, abstract or projection RAP behavior definition (BDEF) for a root entity, recorded in the transport given.

**Source:** `src/handlers/behavior_definition/high/handleCreateBehaviorDefinition.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `implementation_type` (string, required, one of: `Managed`, `Unmanaged`, `Abstract`, `Projection`) - Implementation type: 'Managed', 'Unmanaged', 'Abstract', 'Projection'
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `name` (string, required) - Behavior Definition name (usually same as Root Entity name)
- `package_name` (string, required) - Package name
- `root_entity` (string, required) - Root Entity name (CDS View name)
- `transport_request` (string, optional) - Transport request number, not a task

---

<a id="deletebehaviordefinition-high-level-behavior-definition"></a>
#### DeleteBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Deletes a RAP behavior definition (BDEF), recorded in the transport given.

**Source:** `src/handlers/behavior_definition/high/handleDeleteBehaviorDefinition.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `behavior_definition_name` (string, required) - BehaviorDefinition name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getbehaviordefinition-high-level-behavior-definition"></a>
#### GetBehaviorDefinition (High-Level / Behavior Definition)
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

<a id="updatebehaviordefinition-high-level-behavior-definition"></a>
#### UpdateBehaviorDefinition (High-Level / Behavior Definition)
**Description:** Updates the source code of an existing RAP behavior definition (BDEF), activating it when asked, recorded in the transport given.

**Source:** `src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `name` (string, required) - Behavior Definition name
- `source_code` (string, required) - New source code
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="high-level-behavior-implementation"></a>
### High-Level / Behavior Implementation

<a id="createbehaviorimplementation-high-level-behavior-implementation"></a>
#### CreateBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Creates the RAP behavior implementation class (CLAS) of a behavior definition (BDEF), with its description, recorded in the transport given.

**Source:** `src/handlers/behavior_implementation/high/handleCreateBehaviorImplementation.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `behavior_definition` (string, required) - Behavior Definition name. The behavior definition must exist. Accepted for compatibility; not forwarded to the create request — the shipped create endpoint posts a metadata document (name/description/package) only. The class is bound to this behavior definition when its FOR BEHAVIOR OF main source is written, separately, via UpdateClass.
- `class_name` (string, required) - Behavior Implementation class name.
- `description` (string, optional) - Class description. If not provided, class_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletebehaviorimplementation-high-level-behavior-implementation"></a>
#### DeleteBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Deletes a RAP behavior implementation class (CLAS), recorded in the transport given.

**Source:** `src/handlers/behavior_implementation/high/handleDeleteBehaviorImplementation.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `behavior_implementation_name` (string, required) - BehaviorImplementation name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getbehaviorimplementation-high-level-behavior-implementation"></a>
#### GetBehaviorImplementation (High-Level / Behavior Implementation)
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

<a id="updatebehaviorimplementation-high-level-behavior-implementation"></a>
#### UpdateBehaviorImplementation (High-Level / Behavior Implementation)
**Description:** Updates the implementations of an existing RAP behavior implementation class (CLAS), activating it when asked, recorded in the transport given.

**Source:** `src/handlers/behavior_implementation/high/handleUpdateBehaviorImplementation.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate behavior implementation after update. Default: true.
- `behavior_definition` (string, required) - Referenced Behavior Definition name. Accepted for compatibility; not forwarded to the write — the shipped update() no longer reads it (it writes the implementations include only, never the FOR BEHAVIOR OF main source).
- `class_name` (string, required) - Behavior Implementation class name. Must exist in the system.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `implementation_code` (string, required) - Implementation code for the implementations include. Contains the actual behavior implementation methods.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-class"></a>
### High-Level / Class

<a id="activateclass-high-level-class"></a>
#### ActivateClass (High-Level / Class)
**Description:** Activates an ABAP class (CLAS), so its inactive version is in force.

**Source:** `src/handlers/class/low/handleActivateClass.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

---

<a id="checkclass-high-level-class"></a>
#### CheckClass (High-Level / Class)
**Description:** [read-only] Checks the syntax of an ABAP class (CLAS) as stored or as the source given.

**Source:** `src/handlers/class/high/handleCheckClass.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class name.
- `source_code` (string, optional) - Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.
- `version` (string, optional, one of: `active`, `inactive`) - Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active.

---

<a id="createclass-high-level-class"></a>
#### CreateClass (High-Level / Class)
**Description:** Creates an ABAP class (CLAS), with its description, its superclass and its FINAL and CREATE PROTECTED settings, recorded in the transport given.

**Source:** `src/handlers/class/high/handleCreateClass.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class name.
- `create_protected` (boolean, optional) - Protected constructor. Default: false
- `description` (string, optional) - Class description (defaults to class_name).
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `final` (boolean, optional) - Mark class as final. Default: false
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name.
- `superclass` (string, optional) - Optional superclass name.
- `transport_request` (string, optional) - Transport request number (required for transportable packages), not a task.

---

<a id="deleteclass-high-level-class"></a>
#### DeleteClass (High-Level / Class)
**Description:** Deletes an ABAP class (CLAS), recorded in the transport given.

**Source:** `src/handlers/class/high/handleDeleteClass.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="deletelocaldefinitions-high-level-class"></a>
#### DeleteLocalDefinitions (High-Level / Class)
**Description:** Deletes the local definitions of an ABAP class (CLAS), activating the class when asked.

**Source:** `src/handlers/class/high/handleDeleteLocalDefinitions.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task.

---

<a id="deletelocalmacros-high-level-class"></a>
#### DeleteLocalMacros (High-Level / Class)
**Description:** Deletes the local macros of an ABAP class (CLAS), activating the class when asked.

**Source:** `src/handlers/class/high/handleDeleteLocalMacros.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task.

---

<a id="deletelocaltestclass-high-level-class"></a>
#### DeleteLocalTestClass (High-Level / Class)
**Description:** Deletes the local test classes of an ABAP class (CLAS), activating the class when asked.

**Source:** `src/handlers/class/high/handleDeleteLocalTestClass.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting test class. Default: false
- `class_name` (string, required) - Parent class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="deletelocaltypes-high-level-class"></a>
#### DeleteLocalTypes (High-Level / Class)
**Description:** Deletes the local types of an ABAP class (CLAS), activating the class when asked.

**Source:** `src/handlers/class/high/handleDeleteLocalTypes.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate_on_delete` (boolean, optional (default: false)) - Activate parent class after deleting. Default: false
- `class_name` (string, required) - Parent class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task.

---

<a id="getclass-high-level-class"></a>
#### GetClass (High-Level / Class)
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

<a id="getlocaldefinitions-high-level-class"></a>
#### GetLocalDefinitions (High-Level / Class)
**Description:** [read-only] Reads the local definitions of an ABAP class (CLAS).

**Source:** `src/handlers/class/high/handleGetLocalDefinitions.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getlocalmacros-high-level-class"></a>
#### GetLocalMacros (High-Level / Class)
**Description:** [read-only] Reads the local macros of an ABAP class (CLAS).

**Source:** `src/handlers/class/high/handleGetLocalMacros.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getlocaltestclass-high-level-class"></a>
#### GetLocalTestClass (High-Level / Class)
**Description:** [read-only] Reads the local test classes of an ABAP class (CLAS).

**Source:** `src/handlers/class/high/handleGetLocalTestClass.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="getlocaltypes-high-level-class"></a>
#### GetLocalTypes (High-Level / Class)
**Description:** [read-only] Reads the local types and implementations of an ABAP class (CLAS).

**Source:** `src/handlers/class/high/handleGetLocalTypes.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Parent class name.
- `end_line` (integer, optional) - Last line of the source to answer, included. Without it, to the last line.
- `start_line` (integer, optional) - First line of the source to answer, from 1. Without it, from the first line.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="updateclass-high-level-class"></a>
#### UpdateClass (High-Level / Class)
**Description:** Updates the source code of an existing ABAP class (CLAS), activating it when asked, recorded in the transport given.

**Source:** `src/handlers/class/high/handleUpdateClass.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `class_name` (string, required) - Class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `source_code` (string, required) - Complete ABAP class source code.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="updatelocaldefinitions-high-level-class"></a>
#### UpdateLocalDefinitions (High-Level / Class)
**Description:** Updates the local definitions of an existing ABAP class (CLAS), activating the class when asked, recorded in the transport given.

**Source:** `src/handlers/class/high/handleUpdateLocalDefinitions.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating local definitions. Default: false
- `class_name` (string, required) - Parent class name.
- `definitions_code` (string, required) - Updated source code for local definitions.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="updatelocalmacros-high-level-class"></a>
#### UpdateLocalMacros (High-Level / Class)
**Description:** Updates the local macros of an existing ABAP class (CLAS), activating the class when asked, recorded in the transport given.

**Source:** `src/handlers/class/high/handleUpdateLocalMacros.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating local macros. Default: false
- `class_name` (string, required) - Parent class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `macros_code` (string, required) - Updated source code for local macros.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="updatelocaltestclass-high-level-class"></a>
#### UpdateLocalTestClass (High-Level / Class)
**Description:** Updates the local test classes of an existing ABAP class (CLAS), activating the class when asked, recorded in the transport given.

**Source:** `src/handlers/class/high/handleUpdateLocalTestClass.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating test class. Default: false
- `class_name` (string, required) - Parent class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `test_class_code` (string, required) - Updated source code for the local test class.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="updatelocaltypes-high-level-class"></a>
#### UpdateLocalTypes (High-Level / Class)
**Description:** Updates the local types of an existing ABAP class (CLAS), activating the class when asked, recorded in the transport given.

**Source:** `src/handlers/class/high/handleUpdateLocalTypes.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate_on_update` (boolean, optional (default: false)) - Activate parent class after updating local types. Default: false
- `class_name` (string, required) - Parent class name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `local_types_code` (string, required) - Updated source code for local types.
- `transport_request` (string, optional) - Transport request number (required for transportable objects), not a task.

---

<a id="high-level-common"></a>
### High-Level / Common

<a id="activateobjects-high-level-common"></a>
#### ActivateObjects (High-Level / Common)
**Description:** Activates several ABAP repository objects of any type together in one activation, such as domains (DOMA), data elements (DTEL) and tables (TABL) at once.

**Source:** `src/handlers/common/high/handleActivateObjects.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `objects` (array, required) - Array of objects to activate. Each object must have 'name' and 'type', and 'parentName' where its type needs one.
- `preaudit` (boolean, optional) - Request pre-audit before activation. Default: true. Sent as preauditRequested on both paths, single-object activation and group activation. With true a system may answer the objects still inactive and activate nothing; sending them again with false is the next call. These codes and kinds (either case) and names (lower case) take single-object activation: CLAS/OC, PROG/P, INTF/OI, FUGR/F, TABL/DT, TABL/DS, DDLS/DF, DOMA/DD, DTEL/DE, BDEF/BDO, DDLX/EX, function_group, ddl, data_element, behavior_definition, metadata_extension, class, program, functiongroup, interface, table, structure, domain, dataelement, view, stru. So does a main type or a search name standing for one of these codes; any other call is a group activation.

**On ABAP Cloud (`cloud`):** Activates several ABAP repository objects of any type together in one activation, such as domains (DOMA), data elements (DTEL) and tables (TABL) at once.

**Parameters (`cloud`):**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `objects` (array, required) - Array of objects to activate. Each object must have 'name' and 'type', and 'parentName' where its type needs one.
- `preaudit` (boolean, optional) - Request pre-audit before activation. Default: true. Sent as preauditRequested on both paths, single-object activation and group activation. With true a system may answer the objects still inactive and activate nothing; sending them again with false is the next call. These codes and kinds (either case) and names (lower case) take single-object activation: CLAS/OC, INTF/OI, FUGR/F, TABL/DT, TABL/DS, DDLS/DF, DOMA/DD, DTEL/DE, BDEF/BDO, DDLX/EX, function_group, ddl, data_element, behavior_definition, metadata_extension, class, functiongroup, interface, table, structure, domain, dataelement, view, stru. So does a main type or a search name standing for one of these codes; any other call is a group activation.

---

<a id="getbehaviordefinitionversiondiff-high-level-common"></a>
#### GetBehaviorDefinitionVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same RAP behavior definition (BDEF) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the RAP behavior definition's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the RAP behavior definition's version history.

---

<a id="getbehaviordefinitionversions-high-level-common"></a>
#### GetBehaviorDefinitionVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of a RAP behavior definition (BDEF).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `behavior_definition_name` (string, required) - RAP behavior definition name.

---

<a id="getbehaviordefinitionversionsource-high-level-common"></a>
#### GetBehaviorDefinitionVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of a RAP behavior definition (BDEF) from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the RAP behavior definition's version history.

---

<a id="getclassversiondiff-high-level-common"></a>
#### GetClassVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same ABAP class (CLAS) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP class's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP class's version history.

---

<a id="getclassversions-high-level-common"></a>
#### GetClassVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of an ABAP class (CLAS).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `class_name` (string, required) - ABAP class name.

---

<a id="getclassversionsource-high-level-common"></a>
#### GetClassVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of an ABAP class (CLAS) from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP class's version history.

---

<a id="getddlversiondiff-high-level-common"></a>
#### GetDdlVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same CDS view (DDLS) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the CDS view's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the CDS view's version history.

---

<a id="getddlversions-high-level-common"></a>
#### GetDdlVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of a CDS view (DDLS).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `ddl_name` (string, required) - CDS view name.

---

<a id="getddlversionsource-high-level-common"></a>
#### GetDdlVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of a CDS view (DDLS) from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the CDS view's version history.

---

<a id="getfunctionmoduleversiondiff-high-level-common"></a>
#### GetFunctionModuleVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same ABAP function module (FUGR) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP function module's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP function module's version history.

---

<a id="getfunctionmoduleversions-high-level-common"></a>
#### GetFunctionModuleVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of an ABAP function module (FUGR).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `function_group_name` (string, required) - Owning function group name (required).
- `function_module_name` (string, required) - ABAP function module name.

---

<a id="getfunctionmoduleversionsource-high-level-common"></a>
#### GetFunctionModuleVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of an ABAP function module (FUGR) from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP function module's version history.

---

<a id="getinterfaceversiondiff-high-level-common"></a>
#### GetInterfaceVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same ABAP interface (INTF) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP interface's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP interface's version history.

---

<a id="getinterfaceversions-high-level-common"></a>
#### GetInterfaceVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of an ABAP interface (INTF).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `interface_name` (string, required) - ABAP interface name.

---

<a id="getinterfaceversionsource-high-level-common"></a>
#### GetInterfaceVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of an ABAP interface (INTF) from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP interface's version history.

---

<a id="getmetadataextensionversiondiff-high-level-common"></a>
#### GetMetadataExtensionVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same CDS metadata extension (DDLX) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the CDS metadata extension's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the CDS metadata extension's version history.

---

<a id="getmetadataextensionversions-high-level-common"></a>
#### GetMetadataExtensionVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of a CDS metadata extension (DDLX).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `metadata_extension_name` (string, required) - CDS metadata extension name.

---

<a id="getmetadataextensionversionsource-high-level-common"></a>
#### GetMetadataExtensionVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of a CDS metadata extension (DDLX) from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the CDS metadata extension's version history.

---

<a id="getprogramversiondiff-high-level-common"></a>
#### GetProgramVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same ABAP program (PROG) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP program's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP program's version history.

---

<a id="getprogramversions-high-level-common"></a>
#### GetProgramVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of an ABAP program (PROG), on ABAP Cloud one of SAP's standard programs.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `program_name` (string, required) - ABAP program name.

---

<a id="getprogramversionsource-high-level-common"></a>
#### GetProgramVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of an ABAP program (PROG), on ABAP Cloud one of SAP's standard programs from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP program's version history.

---

<a id="getstructureversiondiff-high-level-common"></a>
#### GetStructureVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same ABAP structure (TABL) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP structure's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP structure's version history.

---

<a id="getstructureversions-high-level-common"></a>
#### GetStructureVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of an ABAP structure (TABL).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `structure_name` (string, required) - ABAP structure name.

---

<a id="getstructureversionsource-high-level-common"></a>
#### GetStructureVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of an ABAP structure (TABL) from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP structure's version history.

---

<a id="gettabletypeversions-high-level-common"></a>
#### GetTableTypeVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of an ABAP table type (TTYP).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `table_type_name` (string, required) - ABAP table type name.

---

<a id="gettableversiondiff-high-level-common"></a>
#### GetTableVersionDiff (High-Level / Common)
**Description:** [read-only] Reads two versions of the same ABAP table (TABL) from its version history and compares them.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri_from` (string, required) - Opaque content_uri of the OLD/base version, from the ABAP table's version history.
- `content_uri_to` (string, required) - Opaque content_uri of the NEW/compare version, from the ABAP table's version history.

---

<a id="gettableversions-high-level-common"></a>
#### GetTableVersions (High-Level / Common)
**Description:** [read-only] Reads the version history of an ABAP table (TABL).

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `table_name` (string, required) - ABAP table name.

---

<a id="gettableversionsource-high-level-common"></a>
#### GetTableVersionSource (High-Level / Common)
**Description:** [read-only] Reads an older version of the source code of an ABAP table (TABL) from its version history.

**Source:** `src/handlers/common/high/objectVersionTools.ts`

**Parameters:**
- `content_uri` (string, required) - Opaque content_uri of a version, from the ABAP table's version history.

---

<a id="high-level-data-element"></a>
### High-Level / Data Element

<a id="activatedataelement-high-level-data-element"></a>
#### ActivateDataElement (High-Level / Data Element)
**Description:** Activates an ABAP data element (DTEL), so its inactive version is in force.

**Source:** `src/handlers/data_element/low/handleActivateDataElement.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

---

<a id="checkdataelement-high-level-data-element"></a>
#### CheckDataElement (High-Level / Data Element)
**Description:** [read-only] Checks the syntax of an ABAP data element (DTEL).

**Source:** `src/handlers/data_element/high/handleCheckDataElement.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional, one of: `active`, `inactive`) - Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createdataelement-high-level-data-element"></a>
#### CreateDataElement (High-Level / Data Element)
**Description:** Creates an ABAP data element (DTEL), typed by a domain (DOMA), a built-in type or a reference, with its labels and search help, recorded in the transport given.

**Source:** `src/handlers/data_element/high/handleCreateDataElement.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `data_type` (string, optional (default: CHAR)) - Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'domain'.
- `decimals` (number, optional (default: 0)) - Decimal places. Usually inherited from domain.
- `description` (string, optional) - Data element description. If not provided, data_element_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `heading_label` (string, optional) - Heading field label (max 55 chars). Applied during update step after creation.
- `length` (number, optional (default: 100)) - Data type length. Usually inherited from domain.
- `long_label` (string, optional) - Long field label (max 40 chars). Applied during update step after creation.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `medium_label` (string, optional) - Medium field label (max 20 chars). Applied during update step after creation.
- `package_name` (string, required) - Package name
- `search_help` (string, optional) - Search help name. Applied during update step after creation.
- `search_help_parameter` (string, optional) - Search help parameter. Applied during update step after creation.
- `set_get_parameter` (string, optional) - Set/Get parameter ID. Applied during update step after creation.
- `short_label` (string, optional) - Short field label (max 10 chars). Applied during update step after creation.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.
- `type_kind` (string, optional (default: domain), one of: `domain`, `predefinedAbapType`, `refToPredefinedAbapType`, `refToDictionaryType`, `refToClifType`) - Type kind: 'domain' (default), 'predefinedAbapType', 'refToPredefinedAbapType', 'refToDictionaryType', 'refToClifType'. If not specified, defaults to 'domain'.
- `type_name` (string, optional) - Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')

---

<a id="deletedataelement-high-level-data-element"></a>
#### DeleteDataElement (High-Level / Data Element)
**Description:** Deletes an ABAP data element (DTEL), recorded in the transport given.

**Source:** `src/handlers/data_element/high/handleDeleteDataElement.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getdataelement-high-level-data-element"></a>
#### GetDataElement (High-Level / Data Element)
**Description:** [read-only] Reads an ABAP data element (DTEL) at the version asked, with its domain (DOMA) or built-in type, its labels, search help, package (DEVC) and description.

**Source:** `src/handlers/data_element/high/handleGetDataElement.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `data_element_name` (string, required) - Data element name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="updatedataelement-high-level-data-element"></a>
#### UpdateDataElement (High-Level / Data Element)
**Description:** Updates the type, labels, search help and SET/GET parameter of an existing ABAP data element (DTEL), replacing them whole and activating it when asked.

**Source:** `src/handlers/data_element/high/handleUpdateDataElement.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional (default: true)) - Activate data element after update (default: true)
- `data_element_name` (string, required) - Data element name to update
- `data_type` (string, optional) - Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType
- `decimals` (number, optional) - Decimals - for predefinedAbapType or refToPredefinedAbapType
- `description` (string, optional) - New data element description
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
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
- `type_kind` (string, optional (default: domain), one of: `domain`, `predefinedAbapType`, `refToPredefinedAbapType`, `refToDictionaryType`, `refToClifType`) - Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType
- `type_name` (string, optional) - Type name: domain name, data element name, or class name (depending on type_kind)

---

<a id="high-level-ddl"></a>
### High-Level / Ddl

<a id="activateddl-high-level-ddl"></a>
#### ActivateDdl (High-Level / Ddl)
**Description:** Activates a CDS view (DDLS), so its inactive version is in force.

**Source:** `src/handlers/ddl/low/handleActivateDdl.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

---

<a id="checkddl-high-level-ddl"></a>
#### CheckDdl (High-Level / Ddl)
**Description:** [read-only] Checks the syntax of a CDS view (DDLS) as stored or as the source given.

**Source:** `src/handlers/ddl/high/handleCheckDdl.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `ddl_name` (string, required) - CDS view name to check, passed as ddl_name.
- `ddl_source` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `version` (string, optional, one of: `active`, `inactive`) - Version to check: 'active' or 'inactive'. Without `version` the active version is checked.

---

<a id="createddl-high-level-ddl"></a>
#### CreateDdl (High-Level / Ddl)
**Description:** Creates a CDS view (DDLS) or classic DDL view, with its description, recorded in the transport given.

**Source:** `src/handlers/ddl/high/handleCreateDdl.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `description` (string, optional) - Optional description (defaults to ddl_name).
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number (required for transportable packages), not a task.

---

<a id="deleteddl-high-level-ddl"></a>
#### DeleteDdl (High-Level / Ddl)
**Description:** Deletes a CDS view (DDLS) or classic DDL view, recorded in the transport given.

**Source:** `src/handlers/ddl/high/handleDeleteDdl.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `ddl_name` (string, required) - DDL source name.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getddl-high-level-ddl"></a>
#### GetDdl (High-Level / Ddl)
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

<a id="updateddl-high-level-ddl"></a>
#### UpdateDdl (High-Level / Ddl)
**Description:** Updates the DDL source of an existing CDS view (DDLS) or classic DDL view, activating it when asked, recorded in the transport given.

**Source:** `src/handlers/ddl/high/handleUpdateDdl.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: false.
- `ddl_name` (string, required) - DDL source name.
- `ddl_source` (string, required) - Complete DDL source code.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="high-level-ddlx"></a>
### High-Level / Ddlx

<a id="activatemetadataextension-high-level-ddlx"></a>
#### ActivateMetadataExtension (High-Level / Ddlx)
**Description:** Activates a CDS metadata extension (DDLX), so its inactive version is in force.

**Source:** `src/handlers/ddlx/low/handleActivateMetadataExtension.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `name` (string, required) - Metadata Extension name.

---

<a id="checkmetadataextension-high-level-ddlx"></a>
#### CheckMetadataExtension (High-Level / Ddlx)
**Description:** [read-only] Checks the syntax of a CDS metadata extension (DDLX).

**Source:** `src/handlers/ddlx/high/handleCheckMetadataExtension.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `name` (string, required) - Metadata extension name.
- `version` (string, optional (default: active), one of: `active`, `inactive`) - Which version to check: 'active' (default) or 'inactive', the unsaved one right after a write. This endpoint does not fall back to whichever exists.

---

<a id="createmetadataextension-high-level-ddlx"></a>
#### CreateMetadataExtension (High-Level / Ddlx)
**Description:** Creates a CDS metadata extension (DDLX), with its description, activating it when asked, recorded in the transport given.

**Source:** `src/handlers/ddlx/high/handleCreateMetadataExtension.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate after creation. Default: true
- `description` (string, optional) - Description
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `name` (string, required) - Metadata Extension name
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number, not a task

---

<a id="updatemetadataextension-high-level-ddlx"></a>
#### UpdateMetadataExtension (High-Level / Ddlx)
**Description:** Updates the source code of an existing CDS metadata extension (DDLX), activating it when asked, recorded in the transport given.

**Source:** `src/handlers/ddlx/high/handleUpdateMetadataExtension.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate after update. Default: true
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `name` (string, required) - Metadata Extension name
- `source_code` (string, required) - New source code
- `transport_request` (string, optional) - Transport request number (required for transportable packages), not a task.

---

<a id="high-level-domain"></a>
### High-Level / Domain

<a id="activatedomain-high-level-domain"></a>
#### ActivateDomain (High-Level / Domain)
**Description:** Activates an ABAP domain (DOMA), so its inactive version is in force.

**Source:** `src/handlers/domain/low/handleActivateDomain.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `domain_name` (string, required) - Domain name.

---

<a id="checkdomain-high-level-domain"></a>
#### CheckDomain (High-Level / Domain)
**Description:** [read-only] Checks the syntax of an ABAP domain (DOMA).

**Source:** `src/handlers/domain/high/handleCheckDomain.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional, one of: `active`, `inactive`) - Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createdomain-high-level-domain"></a>
#### CreateDomain (High-Level / Domain)
**Description:** Creates an ABAP domain (DOMA), with its data type, length, decimals, conversion exit, value table and fixed values, recorded in the transport given.

**Source:** `src/handlers/domain/high/handleCreateDomain.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional (default: true)) - (optional) Activate domain after creation (default: true)
- `conversion_exit` (string, optional) - (optional) Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional (default: CHAR)) - (optional) Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional (default: 0)) - (optional) Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - (optional) Domain description. If not provided, domain_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `domain_name` (string, required) - Domain name.
- `fixed_values` (array, optional) - (optional) Array of fixed values for domain value range
- `length` (number, optional (default: 100)) - (optional) Field length (max depends on datatype)
- `lowercase` (boolean, optional (default: false)) - (optional) Allow lowercase input
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package the domain is created in.
- `sign_exists` (boolean, optional (default: false)) - (optional) Field has sign (+/-)
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable packages.
- `value_table` (string, optional) - (optional) Value table name for foreign key relationship

---

<a id="deletedomain-high-level-domain"></a>
#### DeleteDomain (High-Level / Domain)
**Description:** Deletes an ABAP domain (DOMA), recorded in the transport given.

**Source:** `src/handlers/domain/high/handleDeleteDomain.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `domain_name` (string, required) - Domain name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getdomain-high-level-domain"></a>
#### GetDomain (High-Level / Domain)
**Description:** [read-only] Reads an ABAP domain (DOMA) at the version asked, with its data type, length, output format, value table, fixed values, package (DEVC) and description.

**Source:** `src/handlers/domain/high/handleGetDomain.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `domain_name` (string, required) - Domain name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="updatedomain-high-level-domain"></a>
#### UpdateDomain (High-Level / Domain)
**Description:** Updates the data type, length, decimals, conversion exit, value table and fixed values of an existing ABAP domain (DOMA), replacing them whole.

**Source:** `src/handlers/domain/high/handleUpdateDomain.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional (default: true)) - Activate domain after update (default: true)
- `conversion_exit` (string, optional) - Conversion exit routine name (without CONVERSION_EXIT_ prefix)
- `datatype` (string, optional) - Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.
- `decimals` (number, optional) - Decimal places (for DEC, CURR, QUAN types)
- `description` (string, optional) - New domain description (optional)
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
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

<a id="activatefunctiongroup-high-level-function"></a>
#### ActivateFunctionGroup (High-Level / Function)
**Description:** Activates an ABAP function group (FUGR), so its inactive version is in force.

**Source:** `src/handlers/function/low/handleActivateFunctionGroup.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name.

---

<a id="activatefunctionmodule-high-level-function"></a>
#### ActivateFunctionModule (High-Level / Function)
**Description:** Activates an ABAP function module (FUGR) of a function group (FUGR), so its inactive version is in force.

**Source:** `src/handlers/function/low/handleActivateFunctionModule.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name.
- `function_module_name` (string, required) - Function module name.

---

<a id="checkfunctiongroup-high-level-function"></a>
#### CheckFunctionGroup (High-Level / Function)
**Description:** [read-only] Checks the syntax of an ABAP function group (FUGR).

**Source:** `src/handlers/function/high/handleCheckFunctionGroup.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `function_group_name` (string, required) - Function group name.
- `version` (string, optional, one of: `active`, `inactive`) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="checkfunctionmodule-high-level-function"></a>
#### CheckFunctionModule (High-Level / Function)
**Description:** [read-only] Checks the syntax of an ABAP function module (FUGR) of a function group (FUGR).

**Source:** `src/handlers/function/high/handleCheckFunctionModule.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `function_group_name` (string, required) - Function group name containing the function module.
- `function_module_name` (string, required) - Function module name.
- `version` (string, optional, one of: `active`, `inactive`) - Version to check: 'active' or 'inactive'. Default: active.

---

<a id="createfunctiongroup-high-level-function"></a>
#### CreateFunctionGroup (High-Level / Function)
**Description:** Creates an ABAP function group (FUGR), with its description, activating it when asked, recorded in the transport given.

**Source:** `src/handlers/function/high/handleCreateFunctionGroup.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate function group after creation. Default: true. Set to false for batch operations.
- `description` (string, optional) - Function group description. If not provided, function_group_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name. Up to 26 characters.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="createfunctionmodule-high-level-function"></a>
#### CreateFunctionModule (High-Level / Function)
**Description:** Creates an ABAP function module (FUGR) in an existing function group (FUGR), with its description, recorded in the transport given.

**Source:** `src/handlers/function/high/handleCreateFunctionModule.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `description` (string, optional) - Optional description for the function module
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Parent function group name
- `function_module_name` (string, required) - Function module name. Up to 30 characters.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="updatefunctiongroup-high-level-function"></a>
#### UpdateFunctionGroup (High-Level / Function)
**Description:** Updates the description of an existing ABAP function group (FUGR), recorded in the transport given.

**Source:** `src/handlers/function/high/handleUpdateFunctionGroup.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `description` (string, required) - New description for the function group.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name. Must exist in the system.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="updatefunctionmodule-high-level-function"></a>
#### UpdateFunctionModule (High-Level / Function)
**Description:** Updates the source code of an existing ABAP function module (FUGR) in its function group (FUGR), activating it when asked, recorded in the transport given.

**Source:** `src/handlers/function/high/handleUpdateFunctionModule.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate function module after source update. Default: false. Set to true to activate immediately.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name containing the function module.
- `function_module_name` (string, required) - Function module name. Function module must already exist.
- `source_code` (string, required) - Complete ABAP function module source code, from FUNCTION to ENDFUNCTION.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable function modules.

---

<a id="high-level-function-group"></a>
### High-Level / Function Group

<a id="deletefunctiongroup-high-level-function-group"></a>
#### DeleteFunctionGroup (High-Level / Function Group)
**Description:** Deletes an ABAP function group (FUGR), recorded in the transport given.

**Source:** `src/handlers/function_group/high/handleDeleteFunctionGroup.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - FunctionGroup name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getfunctiongroup-high-level-function-group"></a>
#### GetFunctionGroup (High-Level / Function Group)
**Description:** [read-only] Reads an ABAP function group (FUGR) at the version asked, with its package (DEVC), description and contents.

**Source:** `src/handlers/function_group/high/handleGetFunctionGroup.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `function_group_name` (string, required) - FunctionGroup name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="high-level-function-include"></a>
### High-Level / Function Include

<a id="createfunctioninclude-high-level-function-include"></a>
#### CreateFunctionInclude (High-Level / Function Include)
**Description:** Creates an include (FUGR) in an existing ABAP function group (FUGR), with its description, recorded in the transport given.

**Source:** `src/handlers/function_include/high/handleCreateFunctionInclude.ts`

**Parameters:**
- `description` (string, optional) - Optional description for the include
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Parent function group name
- `include_name` (string, required) - Include name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletefunctioninclude-high-level-function-include"></a>
#### DeleteFunctionInclude (High-Level / Function Include)
**Description:** Deletes an include (FUGR) of an ABAP function group (FUGR), recorded in the transport given.

**Source:** `src/handlers/function_include/high/handleDeleteFunctionInclude.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name containing the include.
- `include_name` (string, required) - Include name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="updatefunctioninclude-high-level-function-include"></a>
#### UpdateFunctionInclude (High-Level / Function Include)
**Description:** Updates the source code of an existing include (FUGR) of an ABAP function group (FUGR), activating it when asked.

**Source:** `src/handlers/function_include/high/handleUpdateFunctionInclude.ts`

**Parameters:**
- `activate` (boolean, optional (default: false)) - Activate the include after the source update. Default: false. Set true to make the updated source the active version immediately.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group name containing the include.
- `include_name` (string, required) - Include name. Include must already exist.
- `source_code` (string, required) - Complete ABAP include source code.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable includes.

---

<a id="high-level-function-module"></a>
### High-Level / Function Module

<a id="deletefunctionmodule-high-level-function-module"></a>
#### DeleteFunctionModule (High-Level / Function Module)
**Description:** Deletes an ABAP function module (FUGR), recorded in the transport given.

**Source:** `src/handlers/function_module/high/handleDeleteFunctionModule.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - FunctionGroup name containing the function module.
- `function_module_name` (string, required) - FunctionModule name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getfunctionmodule-high-level-function-module"></a>
#### GetFunctionModule (High-Level / Function Module)
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

<a id="high-level-include"></a>
### High-Level / Include

<a id="activateinclude-high-level-include"></a>
#### ActivateInclude (High-Level / Include)
**Description:** Activates an ABAP include (PROG), so its inactive version is in force.

**Source:** `src/handlers/include/low/handleActivateInclude.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_name` (string, required) - Include name.

---

<a id="createinclude-high-level-include"></a>
#### CreateInclude (High-Level / Include)
**Description:** Creates an ABAP include (PROG), with its description and the comment header SAP writes into it, recorded in the transport given.

**Source:** `src/handlers/include/high/handleCreateInclude.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `description` (string, optional) - Include description. If not provided, include_name is used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_name` (string, required) - Include name.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deleteinclude-high-level-include"></a>
#### DeleteInclude (High-Level / Include)
**Description:** Deletes an ABAP include (PROG), recorded in the transport given.

**Source:** `src/handlers/include/high/handleDeleteInclude.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_name` (string, required) - Include name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="updateinclude-high-level-include"></a>
#### UpdateInclude (High-Level / Include)
**Description:** Updates the source code of an existing ABAP include (PROG), activating it when asked, recorded in the transport given.

**Source:** `src/handlers/include/high/handleUpdateInclude.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate the include after the write. Default: false.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_name` (string, required) - Include name. The include must already exist.
- `source_code` (string, required) - Complete ABAP source of the include.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="updateincludemetadata-high-level-include"></a>
#### UpdateIncludeMetadata (High-Level / Include)
**Description:** Updates the stored metadata of an existing ABAP include (PROG), replacing it whole, recorded in the transport given.

**Source:** `src/handlers/include/high/handleUpdateIncludeMetadata.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `include_name` (string, required) - Include name. The include must already exist.
- `metadata` (string, required) - The whole ADT metadata document of the include, as GetInclude part "metadata" returns it, with the changes made; it is sent as given and replaces the stored one.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="high-level-interface"></a>
### High-Level / Interface

<a id="activateinterface-high-level-interface"></a>
#### ActivateInterface (High-Level / Interface)
**Description:** Activates an ABAP interface (INTF), so its inactive version is in force.

**Source:** `src/handlers/interface/low/handleActivateInterface.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `interface_name` (string, required) - Interface name.

---

<a id="checkinterface-high-level-interface"></a>
#### CheckInterface (High-Level / Interface)
**Description:** [read-only] Checks the syntax of an ABAP interface (INTF).

**Source:** `src/handlers/interface/high/handleCheckInterface.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `interface_name` (string, required) - Interface name.
- `version` (string, optional, one of: `active`, `inactive`) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createinterface-high-level-interface"></a>
#### CreateInterface (High-Level / Interface)
**Description:** Creates an ABAP interface (INTF), with its description, recorded in the transport given.

**Source:** `src/handlers/interface/high/handleCreateInterface.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `description` (string, optional) - Interface description. If not provided, interface_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `interface_name` (string, required) - Interface name.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deleteinterface-high-level-interface"></a>
#### DeleteInterface (High-Level / Interface)
**Description:** Deletes an ABAP interface (INTF), recorded in the transport given.

**Source:** `src/handlers/interface/high/handleDeleteInterface.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `interface_name` (string, required) - Interface name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getinterface-high-level-interface"></a>
#### GetInterface (High-Level / Interface)
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

<a id="updateinterface-high-level-interface"></a>
#### UpdateInterface (High-Level / Interface)
**Description:** Updates the source code of an existing ABAP interface (INTF), activating it when asked, recorded in the transport given.

**Source:** `src/handlers/interface/high/handleUpdateInterface.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate interface after update. Default: true.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `interface_name` (string, required) - Interface name. Must exist in the system.
- `source_code` (string, required) - Complete ABAP interface source code with INTERFACE...ENDINTERFACE section.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-message-class"></a>
### High-Level / Message Class

<a id="createmessageclass-high-level-message-class"></a>
#### CreateMessageClass (High-Level / Message Class)
**Description:** Creates an ABAP message class (MSAG), with its description, recorded in the transport given.

**Source:** `src/handlers/message_class/high/handleCreateMessageClass.ts`

**Parameters:**
- `description` (string, optional) - (optional) Short description. If not provided, message_class_name is used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `message_class_name` (string, required) - Message class name.
- `package_name` (string, required) - Package name.
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable packages.

---

<a id="createmessageclassmessage-high-level-message-class"></a>
#### CreateMessageClassMessage (High-Level / Message Class)
**Description:** Creates a message in an existing ABAP message class (MSAG), with its number, text and self-explanatory flag, recorded in the transport given.

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
**Description:** Deletes an ABAP message class (MSAG) with all its messages, recorded in the transport given.

**Source:** `src/handlers/message_class/high/handleDeleteMessageClass.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `message_class_name` (string, required) - Message class name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects, optional for local ones.

---

<a id="deletemessageclassmessage-high-level-message-class"></a>
#### DeleteMessageClassMessage (High-Level / Message Class)
**Description:** Deletes one message, by its number, from an ABAP message class (MSAG), keeping the class (CLAS) and its other messages.

**Source:** `src/handlers/message_class/high/handleDeleteMessageClassMessage.ts`

**Parameters:**
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number to delete (e.g., "001").
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects, optional for local ones.

---

<a id="getmessageclass-high-level-message-class"></a>
#### GetMessageClass (High-Level / Message Class)
**Description:** [read-only] Reads an ABAP message class (MSAG): its messages with their numbers and texts, and its master language.

**Source:** `src/handlers/message_class/high/handleGetMessageClass.ts`

**Parameters:**
- `message_class_name` (string, required) - Message class name.

---

<a id="getmessageclassmessage-high-level-message-class"></a>
#### GetMessageClassMessage (High-Level / Message Class)
**Description:** [read-only] Reads one message of an ABAP message class (MSAG) at its active version, with its number, text, self-explanatory and long-text flags, last changer and change time.

**Source:** `src/handlers/message_class/high/handleGetMessageClassMessage.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `message_class_name` (string, required) - Parent message class name.
- `msgno` (string, required) - Message number (e.g., "001").

---

<a id="updatemessageclass-high-level-message-class"></a>
#### UpdateMessageClass (High-Level / Message Class)
**Description:** Updates the description of an existing ABAP message class (MSAG), recorded in the transport given.

**Source:** `src/handlers/message_class/high/handleUpdateMessageClass.ts`

**Parameters:**
- `description` (string, required) - New short description for the message class.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `message_class_name` (string, required) - Message class name.
- `transport_request` (string, optional) - (optional) Transport request number, not a task. Required for transportable objects.

---

<a id="updatemessageclassmessage-high-level-message-class"></a>
#### UpdateMessageClassMessage (High-Level / Message Class)
**Description:** Updates the text and flags of a message in an ABAP message class (MSAG), creating the message when the class (CLAS) lacks it, recorded in the transport given.

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
**Description:** Deletes a CDS metadata extension (DDLX), recorded in the transport given.

**Source:** `src/handlers/metadata_extension/high/handleDeleteMetadataExtension.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `metadata_extension_name` (string, required) - MetadataExtension name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getmetadataextension-high-level-metadata-extension"></a>
#### GetMetadataExtension (High-Level / Metadata Extension)
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

<a id="high-level-package"></a>
### High-Level / Package

<a id="checkpackage-high-level-package"></a>
#### CheckPackage (High-Level / Package)
**Description:** [read-only] Checks the syntax of an ABAP package (DEVC).

**Source:** `src/handlers/package/high/handleCheckPackage.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `package_name` (string, required) - Package name.
- `super_package` (string, optional) - Optional, and not read by the check endpoint — see CheckPackageLow. Requiring it refused the call before any request was made, for a package with no parent.

---

<a id="createpackage-high-level-package"></a>
#### CreatePackage (High-Level / Package)
**Description:** Creates a new ABAP package (DEVC) under a super package, with its type, software component, transport layer and description.

**Source:** `src/handlers/package/high/handleCreatePackage.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `application_component` (string, optional) - Application component (optional, e.g., BC-ABA)
- `description` (string, optional) - Package description. If not provided, package_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name.
- `package_type` (string, optional (default: development), one of: `development`, `structure`) - Package type: 'development' (default) or 'structure'
- `record_changes` (boolean, optional) - Enable change recording for the package. Required for transportable packages. Default: false.
- `software_component` (string, optional) - Software component. If not provided, SAP will set a default.
- `super_package` (string, optional) - Optional: the package this package belongs to, which must exist (SAP creates the package with no super package when the named one is missing). Without one the package is top level, which SAP allows for a structure package or a package in software component LOCAL ($ or TEST names, no transport layer); in an ABAP Cloud software component the top level is a structure package (SAP answers TR 462 to any other).
- `transport_layer` (string, optional) - Transport layer. Required for transportable packages.
- `transport_request` (string, optional) - Transport request number, not a task. Required if the package is transportable.

---

<a id="deletepackage-high-level-package"></a>
#### DeletePackage (High-Level / Package)
**Description:** Deletes an ABAP package (DEVC), recorded in the transport given.

**Source:** `src/handlers/package/high/handleDeletePackage.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `force_new_connection` (boolean, optional) - Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false.
- `package_name` (string, required) - Package name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getpackage-high-level-package"></a>
#### GetPackage (High-Level / Package)
**Description:** [read-only] Reads an ABAP package (DEVC) at the version asked.

**Source:** `src/handlers/package/high/handleGetPackage.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `package_name` (string, required) - Package name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="updatepackage-high-level-package"></a>
#### UpdatePackage (High-Level / Package)
**Description:** Updates the description of an existing ABAP package (DEVC), recorded in the transport given.

**Source:** `src/handlers/package/high/handleUpdatePackage.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `description` (string, required) - New description for the package.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `package_name` (string, required) - Package name. Package must already exist.
- `transport_request` (string, optional) - Transport request number (required for transportable packages), not a task.

---

<a id="high-level-program"></a>
### High-Level / Program

<a id="activateprogram-high-level-program"></a>
#### ActivateProgram (High-Level / Program)
**Description:** Activates an ABAP program (report (PROG)), so its inactive version is in force.

**Source:** `src/handlers/program/low/handleActivateProgram.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `program_name` (string, required) - Program name.

---

<a id="checkprogram-high-level-program"></a>
#### CheckProgram (High-Level / Program)
**Description:** [read-only] Checks the syntax of an ABAP program (PROG) or report.

**Source:** `src/handlers/program/high/handleCheckProgram.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `program_name` (string, required) - Program name.
- `version` (string, optional, one of: `active`, `inactive`) - Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createprogram-high-level-program"></a>
#### CreateProgram (High-Level / Program)
**Description:** Creates an executable ABAP program (PROG) or report, with its description and application area, recorded in the transport given.

**Source:** `src/handlers/program/high/handleCreateProgram.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `application` (string, optional) - Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'
- `description` (string, optional) - Program description. If not provided, program_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name
- `program_name` (string, required) - Program name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deleteprogram-high-level-program"></a>
#### DeleteProgram (High-Level / Program)
**Description:** Deletes an ABAP program (PROG) or report, recorded in the transport given.

**Source:** `src/handlers/program/high/handleDeleteProgram.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `program_name` (string, required) - Program name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getprogram-high-level-program"></a>
#### GetProgram (High-Level / Program)
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

<a id="updateprogram-high-level-program"></a>
#### UpdateProgram (High-Level / Program)
**Description:** Updates the source code of an existing ABAP program (PROG) or report, activating it when asked, recorded in the transport given.

**Source:** `src/handlers/program/high/handleUpdateProgram.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `program_name` (string, required) - Program name. Program must already exist.
- `source_code` (string, required) - Complete ABAP program source code.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="high-level-service-binding"></a>
### High-Level / Service Binding

<a id="activateservicebinding-high-level-service-binding"></a>
#### ActivateServiceBinding (High-Level / Service Binding)
**Description:** Activates an OData service binding (SRVB), so its inactive version is in force.

**Source:** `src/handlers/service_binding/low/handleActivateServiceBinding.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `name` (string, required) - Service binding name.

---

<a id="createservicebinding-high-level-service-binding"></a>
#### CreateServiceBinding (High-Level / Service Binding)
**Description:** Creates an OData V2 or V4 service binding (SRVB), UI or Web API, for a service definition (SRVD), with its service name and version.

**Source:** `src/handlers/service_binding/high/handleCreateServiceBinding.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional (default: true)) - Activate the service binding after create, then read its service group. Default: true.
- `binding_variant` (string, optional (default: ODATA_V4_UI), one of: `ODATA_V2_UI`, `ODATA_V2_WEB_API`, `ODATA_V4_UI`, `ODATA_V4_WEB_API`) - Service binding variant. ODATA_V4_UI = OData V4 for Fiori Elements, ODATA_V4_WEB_API = OData V4 Web API, ODATA_V2_UI = OData V2 for Fiori Elements, ODATA_V2_WEB_API = OData V2 Web API.
- `description` (string, optional) - Optional description. Defaults to service_binding_name when omitted.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - ABAP package name.
- `response_format` (string, optional (default: xml), one of: `xml`, `json`, `plain`) - Accepted for backward compatibility; no longer affects the answer, which is always the structured write result.
- `service_binding_name` (string, required) - Service binding name.
- `service_definition_name` (string, required) - Referenced service definition name.
- `service_name` (string, optional) - Published service name. Default: service_binding_name if omitted.
- `service_version` (string, optional) - Published service version. Default: 0001.
- `transport_request` (string, optional) - Optional transport request for transport checks.

---

<a id="deleteservicebinding-high-level-service-binding"></a>
#### DeleteServiceBinding (High-Level / Service Binding)
**Description:** Deletes an OData service binding (SRVB), recorded in the transport given.

**Source:** `src/handlers/service_binding/high/handleDeleteServiceBinding.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `response_format` (string, optional (default: xml), one of: `xml`, `json`, `plain`) - Accepted for backward compatibility; no longer affects the answer, which is always the structured deletion result.
- `service_binding_name` (string, required) - Service binding name to delete.
- `transport_request` (string, optional) - Optional transport request for deletion transport flow.

---

<a id="getservicebinding-high-level-service-binding"></a>
#### GetServiceBinding (High-Level / Service Binding)
**Description:** [read-only] Reads an OData service binding (SRVB) at its active version, with its binding definition, or its package (DEVC), person responsible and description, in the format asked.

**Source:** `src/handlers/service_binding/high/handleGetServiceBinding.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `part` (string, optional (default: source), one of: `source`, `metadata`) - The document to read: "source" (default) the source code, "metadata" the ADT metadata document (package, responsible, description, ...).
- `response_format` (string, optional (default: xml), one of: `xml`, `json`, `plain`) - Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.
- `service_binding_name` (string, required) - Service binding name. Case-insensitive.

---

<a id="listservicebindingtypes-high-level-service-binding"></a>
#### ListServiceBindingTypes (High-Level / Service Binding)
**Description:** [read-only] Lists the service binding (SRVB) types the system offers, such as OData V2 and OData V4, in the format asked.

**Source:** `src/handlers/service_binding/high/handleListServiceBindingTypes.ts`

**Parameters:**
- `response_format` (string, optional (default: xml), one of: `xml`, `json`, `plain`) - Shape of the answer: the document as the server sent it, the same parsed, or a flat list of the type names.

---

<a id="updateservicebinding-high-level-service-binding"></a>
#### UpdateServiceBinding (High-Level / Service Binding)
**Description:** Updates the publication state of an existing OData service binding (SRVB), publishing or unpublishing its service.

**Source:** `src/handlers/service_binding/high/handleUpdateServiceBinding.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `binding_variant` (string, required (default: ODATA_V4_UI), one of: `ODATA_V2_UI`, `ODATA_V2_WEB_API`, `ODATA_V4_UI`, `ODATA_V4_WEB_API`) - Service binding variant. Determines OData version for publish/unpublish routing.
- `desired_publication_state` (string, required, one of: `published`, `unpublished`, `unchanged`) - Target publication state.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `response_format` (string, optional (default: xml), one of: `xml`, `json`, `plain`) - Accepted for backward compatibility; no longer affects the answer, which is always the structured write result.
- `service_binding_name` (string, required) - Service binding name to update.
- `service_name` (string, required) - Published service name, from the binding. Required: an OData V2 publication job resolves the service by name and version and refuses without them. Ignored for V4, where the request names its target on its own.
- `service_version` (string, optional) - Published service version. Default 0001. Used by an OData V2 publication job together with the service name; ignored for V4.

---

<a id="validateservicebinding-high-level-service-binding"></a>
#### ValidateServiceBinding (High-Level / Service Binding)
**Description:** [read-only] Validates a new OData service binding (SRVB) for a service definition (SRVD), in the package (DEVC) and version given, by SAP's transport check of its name and package.

**Source:** `src/handlers/service_binding/high/handleValidateServiceBinding.ts`

**Parameters:**
- `description` (string, optional) - Optional description used during validation.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `package_name` (string, required) - ABAP package of the binding, which the validation checks.
- `service_binding_name` (string, required) - Service binding name to validate.
- `service_binding_version` (string, optional) - Service binding version (for example: 1.0). Accepted for backward compatibility; the transport check this now runs does not read it.
- `service_definition_name` (string, required) - Service definition linked to binding. Accepted for backward compatibility; the transport check this now runs does not read it.

---

<a id="high-level-service-definition"></a>
### High-Level / Service Definition

<a id="activateservicedefinition-high-level-service-definition"></a>
#### ActivateServiceDefinition (High-Level / Service Definition)
**Description:** Activates a service definition (SRVD), so its inactive version is in force.

**Source:** `src/handlers/service_definition/low/handleActivateServiceDefinition.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `name` (string, required) - Service definition name.

---

<a id="createservicedefinition-high-level-service-definition"></a>
#### CreateServiceDefinition (High-Level / Service Definition)
**Description:** Creates a service definition (SRVD) exposing CDS views (DDLS) as an OData service, with its source code when given, activating it when asked.

**Source:** `src/handlers/service_definition/high/handleCreateServiceDefinition.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after creation. Default: true.
- `description` (string, optional) - Service definition description. If not provided, service_definition_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name
- `service_definition_name` (string, required) - Service definition name.
- `source_code` (string, optional) - Service definition source code (optional). If not provided, a minimal template will be created.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deleteservicedefinition-high-level-service-definition"></a>
#### DeleteServiceDefinition (High-Level / Service Definition)
**Description:** Deletes a service definition (SRVD), recorded in the transport given.

**Source:** `src/handlers/service_definition/high/handleDeleteServiceDefinition.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `service_definition_name` (string, required) - ServiceDefinition name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getservicedefinition-high-level-service-definition"></a>
#### GetServiceDefinition (High-Level / Service Definition)
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

<a id="updateservicedefinition-high-level-service-definition"></a>
#### UpdateServiceDefinition (High-Level / Service Definition)
**Description:** Updates the source code of an existing service definition (SRVD), activating it when asked, recorded in the transport given.

**Source:** `src/handlers/service_definition/high/handleUpdateServiceDefinition.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate service definition after update. Default: true.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `service_definition_name` (string, required) - Service definition name. Must exist in the system.
- `source_code` (string, required) - Complete service definition source code.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-structure"></a>
### High-Level / Structure

<a id="activatestructure-high-level-structure"></a>
#### ActivateStructure (High-Level / Structure)
**Description:** Activates an ABAP structure (TABL), so its inactive version is in force.

**Source:** `src/handlers/structure/low/handleActivateStructure.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `structure_name` (string, required) - Structure name.

---

<a id="checkstructure-high-level-structure"></a>
#### CheckStructure (High-Level / Structure)
**Description:** [read-only] Checks the syntax of an ABAP structure (TABL) as stored or as the source given.

**Source:** `src/handlers/structure/high/handleCheckStructure.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `structure_name` (string, required) - Structure name.
- `version` (string, optional, one of: `active`, `inactive`) - Version to check: 'active' or 'inactive'. Without `version` the active version is checked.

---

<a id="createstructure-high-level-structure"></a>
#### CreateStructure (High-Level / Structure)
**Description:** Creates an ABAP structure (TABL), with its description, activating it when asked, recorded in the transport given.

**Source:** `src/handlers/structure/high/handleCreateStructure.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate structure after creation. Default: true. Set to false for batch operations (activate multiple objects later).
- `description` (string, optional) - Structure description. If not provided, structure_name will be used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `fields` (array, required) - Does not reach creation — the shipped create endpoint posts a metadata document only. Use UpdateStructure (with ddl_code) after creating to set the fields.
- `includes` (array, optional) - Does not reach creation — see `fields`. Use UpdateStructure (with ddl_code) after creating to set includes.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name
- `structure_name` (string, required) - Structure name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletestructure-high-level-structure"></a>
#### DeleteStructure (High-Level / Structure)
**Description:** Deletes an ABAP structure (TABL), recorded in the transport given.

**Source:** `src/handlers/structure/high/handleDeleteStructure.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `structure_name` (string, required) - Structure name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="getstructure-high-level-structure"></a>
#### GetStructure (High-Level / Structure)
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

<a id="updatestructure-high-level-structure"></a>
#### UpdateStructure (High-Level / Structure)
**Description:** Updates the DDL source of an existing ABAP structure (TABL), which defines its components, activating it when asked, recorded in the transport given.

**Source:** `src/handlers/structure/high/handleUpdateStructure.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate structure after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for structure. Example: '@EndUserText.label : \'My Structure\' @AbapCatalog.tableCategory : #TRANSPARENT define structure zz_s_test_001 { client : abap.clnt not null; id : abap.char(10); name : abap.char(255); }'
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `structure_name` (string, required) - Structure name. Structure must already exist.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="high-level-system"></a>
### High-Level / System

<a id="getpackagetree-high-level-system"></a>
#### GetPackageTree (High-Level / System)
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

<a id="runtimecreateprofilertraceparameters-high-level-system"></a>
#### RuntimeCreateProfilerTraceParameters (High-Level / System)
**Description:** Creates the parameters of an ABAP profiler trace, scheduling it for a later profiled run of a class (CLAS) or a report (PROG).

**Source:** `src/handlers/system/high/handleRuntimeCreateProfilerTraceParameters.ts`

**Parameters:**
- `aggregate` (boolean, optional)
- `all_db_events` (boolean, optional)
- `all_dynpro_events` (boolean, optional)
- `all_internal_table_events` (boolean, optional)
- `all_misc_abap_statements` (boolean, optional)
- `all_procedural_units` (boolean, optional)
- `all_system_kernel_events` (boolean, optional)
- `amdp_trace` (boolean, optional)
- `description` (string, required) - Human-readable trace description.
- `explicit_on_off` (boolean, optional)
- `max_size_for_trace_file` (number, optional)
- `max_time_for_tracing` (number, optional)
- `sql_trace` (boolean, optional)
- `with_rfc_tracing` (boolean, optional)

---

<a id="runtimerunclass-high-level-system"></a>
#### RuntimeRunClass (High-Level / System)
**Description:** Runs an ABAP class (CLAS) implementing if_oo_adt_classrun and gives its console output, under the ABAP profiler when asked.

**Source:** `src/handlers/system/high/handleRuntimeRunClass.ts`

**Parameters:**
- `aggregate` (boolean, optional)
- `all_db_events` (boolean, optional)
- `all_dynpro_events` (boolean, optional)
- `all_internal_table_events` (boolean, optional)
- `all_misc_abap_statements` (boolean, optional)
- `all_procedural_units` (boolean, optional)
- `all_system_kernel_events` (boolean, optional)
- `amdp_trace` (boolean, optional)
- `background` (boolean, optional) - When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.
- `class_name` (string, required) - ABAP class name to execute.
- `description` (string, optional) - Profiler trace description (only used when profile=true).
- `explicit_on_off` (boolean, optional)
- `max_size_for_trace_file` (number, optional)
- `max_time_for_tracing` (number, optional)
- `max_trace_attempts` (integer, optional) - Max attempts to poll the profiler feed for the trace this run produced (default 5). Only used when profile=true.
- `profile` (boolean, optional) - When true, run with the profiler and search the profiler feed for the resulting traceId. Default false.
- `sql_trace` (boolean, optional)
- `trace_lookup_uris` (array, optional) - Accepted for backward compatibility; no longer affects trace lookup. adt-clients 19 lists the profiler feed as one endpoint, optionally filtered by user — there is nowhere to put a URI.
- `trace_retry_delay_ms` (integer, optional) - Delay in ms between profiler-feed polling attempts (default 2000). Only used when profile=true.
- `with_rfc_tracing` (boolean, optional)

---

<a id="runtimerunprogram-high-level-system"></a>
#### RuntimeRunProgram (High-Level / System)
**Description:** Runs an ABAP report (PROG) and gives its output, under the ABAP profiler when asked.

**Source:** `src/handlers/system/high/handleRuntimeRunProgram.ts`

**Parameters:**
- `aggregate` (boolean, optional)
- `all_db_events` (boolean, optional)
- `all_dynpro_events` (boolean, optional)
- `all_internal_table_events` (boolean, optional)
- `all_misc_abap_statements` (boolean, optional)
- `all_procedural_units` (boolean, optional)
- `all_system_kernel_events` (boolean, optional)
- `amdp_trace` (boolean, optional)
- `background` (boolean, optional) - When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with GetBackgroundRun, and remove it with DiscardBackgroundRun. A started run cannot be stopped. No default: without it the call waits for the run to end.
- `description` (string, optional) - Profiler trace description (only used when profile=true).
- `explicit_on_off` (boolean, optional)
- `max_size_for_trace_file` (number, optional)
- `max_time_for_tracing` (number, optional)
- `profile` (boolean, optional) - When true, run with the profiler. Default false. Trace must be located afterwards via RuntimeListProfilerTraceFiles — program execution does not return traceId synchronously.
- `program_name` (string, required) - ABAP program name to execute.
- `sql_trace` (boolean, optional)
- `with_rfc_tracing` (boolean, optional)

---

<a id="high-level-table"></a>
### High-Level / Table

<a id="activatetable-high-level-table"></a>
#### ActivateTable (High-Level / Table)
**Description:** Activates an ABAP database table (TABL), so its inactive version is in force.

**Source:** `src/handlers/table/low/handleActivateTable.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `table_name` (string, required) - Table name.

---

<a id="checktable-high-level-table"></a>
#### CheckTable (High-Level / Table)
**Description:** [read-only] Checks the syntax of an ABAP database table (TABL) as stored or as the source given.

**Source:** `src/handlers/table/high/handleCheckTable.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `ddl_code` (string, optional) - Optional: DDL source code to validate instead of the saved version.
- `table_name` (string, required) - Table name.
- `version` (string, optional, one of: `active`, `inactive`, `new`) - Version to check: 'active', 'inactive', or 'new'. Without `version` the active version is checked.

---

<a id="createtable-high-level-table"></a>
#### CreateTable (High-Level / Table)
**Description:** Creates an ABAP database table (TABL) by its name, recorded in the transport given.

**Source:** `src/handlers/table/high/handleCreateTable.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `description` (string, optional) - Does not reach creation — the shipped create endpoint has no description field of its own. Use UpdateTable (with ddl_code) after creating to set the DDL source, which carries the description.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `master_language` (string, optional) - Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `package_name` (string, required) - Package name
- `table_name` (string, required) - Table name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletetable-high-level-table"></a>
#### DeleteTable (High-Level / Table)
**Description:** Deletes an ABAP database table (TABL), recorded in the transport given.

**Source:** `src/handlers/table/high/handleDeleteTable.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `table_name` (string, required) - Table name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="gettable-high-level-table"></a>
#### GetTable (High-Level / Table)
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

<a id="updatetable-high-level-table"></a>
#### UpdateTable (High-Level / Table)
**Description:** Updates the DDL source of an existing ABAP database table (TABL), which defines its key, components and delivery class, activating it when asked.

**Source:** `src/handlers/table/high/handleUpdateTable.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `activate` (boolean, optional) - Activate table after source update. Default: true.
- `ddl_code` (string, required) - Complete DDL source code for table. Example: '@EndUserText.label : \'My Table\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `table_name` (string, required) - Table name. Table must already exist.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if object is local or already in transport.

---

<a id="updatetablesettings-high-level-table"></a>
#### UpdateTableSettings (High-Level / Table)
**Description:** Updates the technical settings of an existing ABAP database table (TABL), its data class, size category, buffering and logging, each given over the stored one.

**Source:** `src/handlers/table/high/handleUpdateTableSettings.ts`

**Parameters:**
- `activate` (boolean, required) - true activates the table after the settings are written; false leaves them inactive.
- `buffering` (object, optional) - Buffering; each field given replaces the stored one.
- `data_class` (string, optional) - Data class. The value help lists APPL0 (master data), APPL1 (transaction data), APPL2 (organization and customizing) and DDIM, DFACT, DODS; SAP checks the value when the table is activated.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `load_unit` (string, optional) - Load unit.
- `logging_enabled` (boolean, optional) - Whether changes to the table data are logged.
- `sharing_type` (string, optional) - Sharing type.
- `size_category` (string, optional) - Size category, a digit from 0 to 9.
- `storage_type` (string, optional) - Storage type.
- `table_name` (string, required) - Table name. The table must already exist.
- `translation` (string, optional) - Translation value; the translation flags keep their stored values.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if the table is local or already in a transport request.

**On ABAP Cloud (`cloud`):** Updates the technical settings of an existing ABAP database table (TABL), its data class, size category, buffering and logging, each given over the stored one.

**Parameters (`cloud`):**
- `activate` (boolean, required) - true activates the table after the settings are written; false leaves them inactive.
- `buffering` (object, optional) - Buffering; each field given replaces the stored one.
- `data_class` (string, optional) - Data class. The value help lists APPL0 (master data), APPL1 (transaction data), APPL2 (organization and customizing) and DDIM, DFACT, DODS; SAP checks the value when the table is activated.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `is_writable_by_amdp` (boolean, optional) - true allows AMDP writes; activation then needs buffering N, logging off and no replacement object.
- `load_unit` (string, optional) - Load unit.
- `logging_enabled` (boolean, optional) - Whether changes to the table data are logged.
- `sharing_type` (string, optional) - Sharing type.
- `size_category` (string, optional) - Size category, a digit from 0 to 9.
- `storage_type` (string, optional) - Storage type.
- `table_name` (string, required) - Table name. The table must already exist.
- `translation` (string, optional) - Translation value; the translation flags keep their stored values.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if the table is local or already in a transport request.

---

<a id="high-level-table-type"></a>
### High-Level / Table Type

<a id="activatetabletype-high-level-table-type"></a>
#### ActivateTableType (High-Level / Table Type)
**Description:** Activates an ABAP table type (TTYP), so its inactive version is in force.

**Source:** `src/handlers/table_type/low/handleActivateTableType.ts`

**Prompt:** the `activate` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `table_type_name` (string, required) - Table type name.

---

<a id="checktabletype-high-level-table-type"></a>
#### CheckTableType (High-Level / Table Type)
**Description:** [read-only] Checks an ABAP table type (TTYP) for errors and warnings.

**Source:** `src/handlers/table_type/high/handleCheckTableType.ts`

**Prompt:** the `check` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `table_type_name` (string, required) - Table type name.
- `version` (string, optional, one of: `active`, `inactive`) - Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.

---

<a id="createtabletype-high-level-table-type"></a>
#### CreateTableType (High-Level / Table Type)
**Description:** Creates an ABAP table type (TTYP), with the type it holds, its access type and primary key, activating it when asked, recorded in the transport given.

**Source:** `src/handlers/table_type/high/handleCreateTableType.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `access_type` (string, optional, one of: `standard`, `sorted`, `hashed`, `index`, `notSpecified`) - Access type of the table (ttyp:accessType).
- `activate` (boolean, optional (default: true)) - Activate the table type after creation (default: true).
- `data_type` (string, optional) - Built-in data type of the row (ttyp:builtInType/ttyp:dataType).
- `decimals` (number, optional) - Decimal places of the built-in row type (ttyp:builtInType/ttyp:decimals).
- `description` (string, optional) - Table type description. When left out, table_type_name is used.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `key_definition` (string, optional, one of: `standard`, `rowType`, `empty`, `notSpecified`) - Definition of the primary key (ttyp:primaryKey/ttyp:definition).
- `key_kind` (string, optional, one of: `unique`, `nonUnique`, `notSpecified`) - Kind of the primary key (ttyp:primaryKey/ttyp:kind).
- `length` (number, optional) - Length of the built-in row type (ttyp:builtInType/ttyp:length).
- `package_name` (string, required) - Package the table type is created in.
- `row_type_kind` (string, optional, one of: `predefinedAbapType`, `dictionaryType`, `refToPredefinedAbapType`, `refToDictionaryType`, `refToClassOrInterfaceType`, `rangeTypeOnPredefinedType`, `rangeTypeOnDataelement`) - Kind of the row type (ttyp:rowType/ttyp:typeKind).
- `row_type_name` (string, optional) - Dictionary type used as the row type (ttyp:rowType/ttyp:typeName).
- `table_type_name` (string, required) - Table type name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="deletetabletype-high-level-table-type"></a>
#### DeleteTableType (High-Level / Table Type)
**Description:** Deletes an ABAP table type (TTYP), recorded in the transport given.

**Source:** `src/handlers/table_type/high/handleDeleteTableType.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `table_type_name` (string, required) - Table type name.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable objects. Optional for local objects.

---

<a id="gettabletype-high-level-table-type"></a>
#### GetTableType (High-Level / Table Type)
**Description:** [read-only] Reads an ABAP table type (TTYP) at the version asked, with its element type, access, key, package (DEVC) and description.

**Source:** `src/handlers/table_type/high/handleGetTableType.ts`

**Prompt:** the `get`, `update` prompts ask the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `table_type_name` (string, required) - Table type name.
- `version` (string, optional (default: active), one of: `active`, `inactive`, `workingArea`) - The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.

---

<a id="updatetabletype-high-level-table-type"></a>
#### UpdateTableType (High-Level / Table Type)
**Description:** Updates the definition of an existing ABAP table type (TTYP): its description, the type it holds, its access type and primary key, activating it when asked.

**Source:** `src/handlers/table_type/high/handleUpdateTableType.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `access_type` (string, optional, one of: `standard`, `sorted`, `hashed`, `index`, `notSpecified`) - Access type of the table (ttyp:accessType).
- `activate` (boolean, optional (default: true)) - Activate the table type after the update (default: true).
- `data_type` (string, optional) - Built-in data type of the row (ttyp:builtInType/ttyp:dataType).
- `decimals` (number, optional) - Decimal places of the built-in row type (ttyp:builtInType/ttyp:decimals).
- `description` (string, optional) - New table type description.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `key_definition` (string, optional, one of: `standard`, `rowType`, `empty`, `notSpecified`) - Definition of the primary key (ttyp:primaryKey/ttyp:definition).
- `key_kind` (string, optional, one of: `unique`, `nonUnique`, `notSpecified`) - Kind of the primary key (ttyp:primaryKey/ttyp:kind).
- `length` (number, optional) - Length of the built-in row type (ttyp:builtInType/ttyp:length).
- `row_type_kind` (string, optional, one of: `predefinedAbapType`, `dictionaryType`, `refToPredefinedAbapType`, `refToDictionaryType`, `refToClassOrInterfaceType`, `rangeTypeOnPredefinedType`, `rangeTypeOnDataelement`) - Kind of the row type (ttyp:rowType/ttyp:typeKind).
- `row_type_name` (string, optional) - Dictionary type used as the row type (ttyp:rowType/ttyp:typeName).
- `table_type_name` (string, required) - Table type name. The table type must already exist.
- `transport_request` (string, optional) - Transport request number, not a task. Required for transportable packages.

---

<a id="high-level-text-elements"></a>
### High-Level / Text Elements

<a id="updatetextelements-high-level-text-elements"></a>
#### UpdateTextElements (High-Level / Text Elements)
**Description:** Updates the text elements of an existing ABAP program (PROG), function group (FUGR) or class (CLAS), each part given replacing its stored one, activating the object when asked.

**Source:** `src/handlers/text_elements/high/handleUpdateTextElements.ts`

**Parameters:**
- `activate` (boolean, required) - true activates the object together with its text elements after the write; false leaves them inactive.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `headings` (object, optional) - The list header and four column headers (programs and function groups); a heading given empty or left out is deleted.
- `object_kind` (string, required, one of: `program`, `function_group`, `class`) - Kind of object: program, function_group, class.
- `object_name` (string, required) - Name of the program, function group or class.
- `selections` (array, optional) - The selection texts (programs and function groups): the whole list; texts left out are deleted.
- `symbols` (array, optional) - The text symbols: the whole list; symbols left out are deleted.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if the object is local or already in a transport request.

**On ABAP Cloud (`cloud`):** Updates the text elements of an existing ABAP program (PROG), function group (FUGR) or class (CLAS), each part given replacing its stored one, activating the object when asked.

**Parameters (`cloud`):**
- `activate` (boolean, required) - true activates the object together with its text elements after the write; false leaves them inactive.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `headings` (object, optional) - The list header and four column headers (programs and function groups); a heading given empty or left out is deleted.
- `object_kind` (string, required, one of: `function_group`, `class`) - Kind of object: function_group, class.
- `object_name` (string, required) - Name of the program, function group or class.
- `selections` (array, optional) - The selection texts (programs and function groups): the whole list; texts left out are deleted.
- `symbols` (array, optional) - The text symbols: the whole list; symbols left out are deleted.
- `transport_request` (string, optional) - Transport request number, not a task. Optional if the object is local or already in a transport request.

---

<a id="high-level-transport"></a>
### High-Level / Transport

<a id="addtransportobject-high-level-transport"></a>
#### AddTransportObject (High-Level / Transport)
**Description:** Adds an existing ABAP object to a transport task, so it travels with the task's transport.

**Source:** `src/handlers/transport/high/handleAddTransportObject.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `object_name` (string, required) - Object name.
- `object_type` (string, required) - Object-directory type — CLAS, FUGR, TABL, DOMA — not an ADT type code like CLAS/OC.
- `pgmid` (string, optional (default: R3TR)) - Program id. Defaults to R3TR, a workbench object's.
- `transport_number` (string, required) - Number of the transport task the object is added to.

---

<a id="createtransport-high-level-transport"></a>
#### CreateTransport (High-Level / Transport)
**Description:** Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked.

**Source:** `src/handlers/transport/high/handleCreateTransport.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `description` (string, required) - Transport request description (mandatory)
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `owner` (string, optional) - Transport owner (optional, defaults to current user)
- `target_system` (string, optional) - Target system for transport (optional, e.g., 'PRD', 'QAS'). If not provided or empty, uses 'LOCAL'
- `task_type` (string, optional (default: S), one of: `S`, `R`, `X`) - The type given to the request's task: S — Development/Correction (default), R — Repair, X — Unclassified, as SAP creates it.
- `transport_type` (string, optional (default: workbench), one of: `workbench`, `customizing`) - Transport type: 'workbench' (cross-client) or 'customizing' (client-specific)

---

<a id="createtransporttask-high-level-transport"></a>
#### CreateTransportTask (High-Level / Transport)
**Description:** Creates a task of the type asked under an existing transport, owned by the SAP user named.

**Source:** `src/handlers/transport/high/handleCreateTransportTask.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `target_user` (string, required) - The user the task belongs to: an SAP user id (sent in upper case), e.g. DEVELOPER. Required — the server will not choose one, and naming another user is how a task is made for somebody else.
- `task_type` (string, optional (default: S), one of: `S`, `R`, `X`) - S — Development/Correction (default), R — Repair of an object this system does not own, X — leave it Unclassified, as the server creates it. An Unclassified task refuses AddTransportObject on premise (TK127).
- `transport_number` (string, required) - The REQUEST to create the task under — never another task. The number that comes back is the task, and that is what AddTransportObject, RemoveTransportObject and ReadTransportObjects address afterwards.

---

<a id="movetransportobjects-high-level-transport"></a>
#### MoveTransportObjects (High-Level / Transport)
**Description:** Moves objects from one transport task to another, each at its position in the task it leaves.

**Source:** `src/handlers/transport/high/handleMoveTransportObjects.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `objects` (array, required) - The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.
- `target_number` (string, required) - Number of the transport task the entries move to.
- `transport_number` (string, required) - Number of the transport task that holds the entries.

---

<a id="removetransportobject-high-level-transport"></a>
#### RemoveTransportObject (High-Level / Transport)
**Description:** Removes a named object from a transport task, at its position among the task's objects.

**Source:** `src/handlers/transport/high/handleRemoveTransportObject.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `object_name` (string, required) - Object name.
- `object_type` (string, required) - Object-directory type — CLAS, FUGR, TABL, DOMA — not an ADT type code like CLAS/OC.
- `pgmid` (string, optional (default: R3TR)) - Program id. Defaults to R3TR, a workbench object's.
- `position` (string, required) - Position of the object's entry in the task's object list.
- `transport_number` (string, required) - Number of the transport task that holds the entry.

---

<a id="sortandcompresstransporttask-high-level-transport"></a>
#### SortAndCompressTransportTask (High-Level / Transport)
**Description:** Sorts the objects of a transport task and merges its duplicates.

**Source:** `src/handlers/transport/high/handleSortAndCompressTransportTask.ts`

**Prompt:** the `transport` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_number` (string, required) - Number of the transport task to sort and compress.

---

<a id="high-level-unit-test"></a>
### High-Level / Unit Test

<a id="createcdsunittest-high-level-unit-test"></a>
#### CreateCdsUnitTest (High-Level / Unit Test)
**Description:** Creates an ABAP Unit test class for a CDS view (DDLS), from the test class source given, once the view supports CDS test doubles.

**Source:** `src/handlers/unit_test/high/handleCreateCdsUnitTest.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `cds_view_name` (string, required) - CDS view under test (DDL source). Must be active and testable with test doubles.
- `class_name` (string, required) - Name of the new global class that holds the tests.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `package_name` (string, required) - Package of the new test class.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable package.

---

<a id="createfunctiongroupunittest-high-level-unit-test"></a>
#### CreateFunctionGroupUnitTest (High-Level / Unit Test)
**Description:** Creates the ABAP Unit test classes of an ABAP function group (FUGR) from the test class source given, in a test include activated with the group.

**Source:** `src/handlers/unit_test/high/handleCreateFunctionGroupUnitTest.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group that gets the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="createprogramunittest-high-level-unit-test"></a>
#### CreateProgramUnitTest (High-Level / Unit Test)
**Description:** Creates the ABAP Unit test classes of an ABAP report (PROG) from the test class source given, in a test include of the report, and activates the report.

**Source:** `src/handlers/unit_test/high/handleCreateProgramUnitTest.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `program_name` (string, required) - Report that gets the tests. Must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="createunittest-high-level-unit-test"></a>
#### CreateUnitTest (High-Level / Unit Test)
**Description:** Creates the ABAP Unit test classes of an ABAP class (CLAS) from the test class source given, as its local test classes, and activates the class.

**Source:** `src/handlers/unit_test/high/handleCreateUnitTest.ts`

**Prompt:** the `create` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="deletecdsunittest-high-level-unit-test"></a>
#### DeleteCdsUnitTest (High-Level / Unit Test)
**Description:** Deletes a CDS view (DDLS) test class, with the ABAP Unit test classes it holds.

**Source:** `src/handlers/unit_test/high/handleDeleteCdsUnitTest.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="deleteunittest-high-level-unit-test"></a>
#### DeleteUnitTest (High-Level / Unit Test)
**Description:** Deletes the ABAP Unit test classes of an ABAP class (CLAS), keeping the class.

**Source:** `src/handlers/unit_test/high/handleDeleteUnitTest.ts`

**Prompt:** the `delete` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="getunittestresult-high-level-unit-test"></a>
#### GetUnitTestResult (High-Level / Unit Test)
**Description:** [read-only] Reads the result of an ABAP Unit test run by its id, waiting while the run goes on.

**Source:** `src/handlers/unit_test/high/handleGetUnitTestResult.ts`

**Prompt:** the `unit_test` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `format` (string, optional, one of: `abapunit`, `junit`) - Result format: abapunit or junit.
- `run_id` (string, required) - Run id a unit test run answered.
- `with_navigation_uris` (boolean, optional) - Include navigation URIs in result if supported.

---

<a id="runabapunit-high-level-unit-test"></a>
#### RunAbapUnit (High-Level / Unit Test)
**Description:** Runs the ABAP Unit tests of a class (CLAS), report (PROG), function group (FUGR), function module's group, CDS view (DDLS), package (DEVC), waiting for the result or giving the run's id at once.

**Source:** `src/handlers/unit_test/high/handleRunAbapUnit.ts`

**Prompt:** the `unit_test` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `duration` (object, optional) - Durations the run accepts.
- `risk_level` (object, optional) - Risk levels the run accepts.
- `scope` (object, optional) - Which tests the run covers. Assigned tests are test classes linked to the object by an ABAP Doc @testing relation (the tests of a CDS view are such).
- `target` (object, required) - What the run covers: an object (kind object, name, type) or a package (kind package, name, include_subpackages).
- `wait` (boolean, optional) - true (default): the call reads the run's status at once, and a run SAP answers running again by long polling, SAP holding each read until the run finishes, and returns the result of a run SAP answers finished, the call lasting as long as the run; a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered. false: the call answers the run_id right after the start, and the run's status and result are read by run_id. A long run under a client with a request time limit is started with false.

---

<a id="runcdsunittest-high-level-unit-test"></a>
#### RunCdsUnitTest (High-Level / Unit Test)
**Description:** Runs the ABAP Unit tests of a CDS view (DDLS) test class, waiting for the result or giving the run's id at once.

**Source:** `src/handlers/unit_test/high/handleRunCdsUnitTest.ts`

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `wait` (boolean, optional) - true (default): the call reads the run's status at once, and a run SAP answers running again by long polling, SAP holding each read until the run finishes, and returns the result of a run SAP answers finished, the call lasting as long as the run; a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered. false: the call answers the run_id right after the start, and the run's status and result are read by run_id. A long run under a client with a request time limit is started with false.

---

<a id="runfunctiongroupunittest-high-level-unit-test"></a>
#### RunFunctionGroupUnitTest (High-Level / Unit Test)
**Description:** Runs every ABAP Unit test of a function group (FUGR), waiting for the result or giving the run's id at once.

**Source:** `src/handlers/unit_test/high/handleRunFunctionGroupUnitTest.ts`

**Prompt:** the `unit_test` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group whose tests run.
- `runner` (string, optional (default: async), one of: `async`, `sync`) - async (default): starts the run; wait decides whether the call returns the result once the run finished or the run_id right after the start; suited to long suites. sync: one request that returns the finished result, called with wait left out.
- `scope` (object, optional) - Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.
- `wait` (boolean, optional) - true (default): the call reads the run's status at once, and a run SAP answers running again by long polling, SAP holding each read until the run finishes, and returns the result of a run SAP answers finished, the call lasting as long as the run; a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered. false: the call answers the run_id right after the start, and the run's status and result are read by run_id. A long run under a client with a request time limit is started with false.

---

<a id="runfunctionmoduleunittest-high-level-unit-test"></a>
#### RunFunctionModuleUnitTest (High-Level / Unit Test)
**Description:** Runs the ABAP Unit tests of the function group (FUGR) holding a function module (FUGR), waiting for the result or giving the run's id at once.

**Source:** `src/handlers/unit_test/high/handleRunFunctionModuleUnitTest.ts`

**Prompt:** the `unit_test` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, optional) - Function group holding the function module; required by runner sync.
- `function_module_name` (string, required) - Function module whose function group the tests run for.
- `runner` (string, optional (default: async), one of: `async`, `sync`) - async (default): starts the run; wait decides whether the call returns the result once the run finished or the run_id right after the start; suited to long suites. sync: one request that returns the finished result, called with wait left out.
- `scope` (object, optional) - Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.
- `wait` (boolean, optional) - true (default): the call reads the run's status at once, and a run SAP answers running again by long polling, SAP holding each read until the run finishes, and returns the result of a run SAP answers finished, the call lasting as long as the run; a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered. false: the call answers the run_id right after the start, and the run's status and result are read by run_id. A long run under a client with a request time limit is started with false.

---

<a id="runprogramunittest-high-level-unit-test"></a>
#### RunProgramUnitTest (High-Level / Unit Test)
**Description:** Runs the ABAP Unit tests of an ABAP report (PROG), waiting for the result or giving the run's id at once.

**Source:** `src/handlers/unit_test/high/handleRunProgramUnitTest.ts`

**Prompt:** the `unit_test` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `program_name` (string, required) - Report whose tests run.
- `runner` (string, optional (default: async), one of: `async`, `sync`) - async (default): starts the run; wait decides whether the call returns the result once the run finished or the run_id right after the start; suited to long suites. sync: one request that returns the finished result, called with wait left out.
- `scope` (object, optional) - Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.
- `wait` (boolean, optional) - true (default): the call reads the run's status at once, and a run SAP answers running again by long polling, SAP holding each read until the run finishes, and returns the result of a run SAP answers finished, the call lasting as long as the run; a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered. false: the call answers the run_id right after the start, and the run's status and result are read by run_id. A long run under a client with a request time limit is started with false.

---

<a id="rununittest-high-level-unit-test"></a>
#### RunUnitTest (High-Level / Unit Test)
**Description:** Runs the ABAP Unit tests of an ABAP class (CLAS), waiting for the result or giving the run's id at once.

**Source:** `src/handlers/unit_test/high/handleRunUnitTest.ts`

**Prompt:** the `unit_test` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class whose tests run.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `runner` (string, optional (default: async), one of: `async`, `sync`) - async (default): starts the run; wait decides whether the call returns the result once the run finished or the run_id right after the start; suited to long suites. sync: one request that returns the finished result, called with wait left out.
- `scope` (object, optional) - Which tests the run covers, sent with either runner. Foreign tests are test classes linked to the object by an ABAP Doc @testing relation (a function module's tests are often linked so). With runner sync they execute only with foreign_tests true: with the defaults (foreign_tests false, add_foreign_tests_as_preview true) SAP lists them as a preview, unexecuted. Runner async executes them with the defaults as well.
- `wait` (boolean, optional) - true (default): the call reads the run's status at once, and a run SAP answers running again by long polling, SAP holding each read until the run finishes, and returns the result of a run SAP answers finished, the call lasting as long as the run; a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered. false: the call answers the run_id right after the start, and the run's status and result are read by run_id. A long run under a client with a request time limit is started with false.

---

<a id="updatecdsunittest-high-level-unit-test"></a>
#### UpdateCdsUnitTest (High-Level / Unit Test)
**Description:** Updates the ABAP Unit test classes of a CDS view (DDLS) test class from the test class source given, activating it, recorded in the transport given.

**Source:** `src/handlers/unit_test/high/handleUpdateCdsUnitTest.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Test class of the CDS view. Must already exist.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updatefunctiongroupunittest-high-level-unit-test"></a>
#### UpdateFunctionGroupUnitTest (High-Level / Unit Test)
**Description:** Updates the ABAP Unit test classes of an ABAP function group (FUGR) from the test class source given, activating the group, recorded in the transport given.

**Source:** `src/handlers/unit_test/high/handleUpdateFunctionGroupUnitTest.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `function_group_name` (string, required) - Function group whose tests are replaced. Its test include must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updateprogramunittest-high-level-unit-test"></a>
#### UpdateProgramUnitTest (High-Level / Unit Test)
**Description:** Updates the ABAP Unit test classes of an ABAP report (PROG) from the test class source given, activating the report, recorded in the transport given.

**Source:** `src/handlers/unit_test/high/handleUpdateProgramUnitTest.ts`

**Parameters:**
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `program_name` (string, required) - Report whose tests are replaced. Its test include must already exist.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="updateunittest-high-level-unit-test"></a>
#### UpdateUnitTest (High-Level / Unit Test)
**Description:** Updates the ABAP Unit test classes of an ABAP class (CLAS) from the test class source given, activating the class, recorded in the transport given.

**Source:** `src/handlers/unit_test/high/handleUpdateUnitTest.ts`

**Prompt:** the `update` prompt asks the model to call this tool ([PROMPTS.md](PROMPTS.md)).

**Parameters:**
- `class_name` (string, required) - Class that holds the tests. Must already exist.
- `detail` (string, optional (default: terse), one of: `terse`, `medium`, `full`, `raw`) - How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `test_class_source` (string, required) - ABAP source of the local test classes: definitions and implementations, FOR TESTING. Replaces what the include holds.
- `transport_request` (string, optional) - Transport request, not a task. Required for a transportable object.

---

<a id="streamable-http-binaries"></a>
## Streamable HTTP Binaries

On `mcp-abap-adt-http` (Streamable HTTP) every tool declares one more, optional argument, `state_handle` (string): "The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance." A tool whose own schema declares `state_handle` (the debugger tools) keeps its own declaration, required where it is required. No stdio or SSE binary declares it; the parameters listed per tool on this page are the stdio ones, without it.

*Last updated: 2026-11-25*
