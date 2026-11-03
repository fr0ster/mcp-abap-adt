# Migrating to 24.0.0

Go through the section that fits how you use the server; the [CHANGELOG](../CHANGELOG.md) has every
item.

## compact users: `HandlerCreate` `BEHAVIOR_IMPLEMENTATION` takes `behavior_definition`

A behavior implementation is created for a behavior definition, and adt-clients' create requires
it. `HandlerCreate` with `object_type: BEHAVIOR_IMPLEMENTATION` now takes `behavior_definition`, and
requires it with `class_name` and `package_name`: a call without it, or with an empty one, is
refused before any request is sent (`behavior_definition is required`). The create request on the
wire is the same as in 23.x.

**What you do:** pass the behavior definition's name.

| You sent | 24.0 |
|---|---|
| `HandlerCreate` `{ object_type: 'BEHAVIOR_IMPLEMENTATION', class_name, package_name, … }` | `HandlerCreate` `{ object_type: 'BEHAVIOR_IMPLEMENTATION', class_name, behavior_definition, package_name, … }` |

## Former users of the low set: each low tool and its compact call today

The low set left the full binaries in 19.0.0 ([MIGRATION-19.0](MIGRATION-19.0.md), "The low set
leaves the full binaries", whose table shows the mapping as it was released). The table below is
the mapping as it stands now, tested against a stand-in (`src/__tests__/unit/lowToCompact.test.ts`)
with the low tool's requests captured before it was removed (`tools/low-to-compact.json`): the same
ADT requests, except where a row names an accepted difference.

<!-- low-to-compact table: rendered from tools/low-to-compact.json -->
| Low tool | Compact call | Difference / note |
|---|---|---|
| `ActivateBehaviorDefinitionLow` | `HandlerActivate` (object_type: BEHAVIOR_DEFINITION, object_name) | the same requests |
| `ActivateClassLow` | `HandlerActivate` (object_type: CLASS, object_name) | the same requests |
| `ActivateDataElementLow` | `HandlerActivate` (object_type: DATA_ELEMENT, object_name) | the same requests |
| `ActivateDdlLow` | `HandlerActivate` (object_type: DDL, object_name) | the same requests |
| `ActivateDomainLow` | `HandlerActivate` (object_type: DOMAIN, object_name) | the same requests |
| `ActivateFunctionGroupLow` | `HandlerActivate` (object_type: FUNCTION_GROUP, object_name) | the same requests |
| `ActivateFunctionModuleLow` | `HandlerActivate` (objects) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateInterfaceLow` | `HandlerActivate` (object_type: INTERFACE, object_name) | the same requests |
| `ActivateMetadataExtensionLow` | `HandlerActivate` (object_type: METADATA_EXTENSION, object_name) | the same requests |
| `ActivateObjectLow` | `HandlerActivate` (objects, preaudit) | the same requests |
| `ActivateProgramLow` | `HandlerActivate` (object_type: PROGRAM, object_name) | the same requests |
| `ActivateServiceBindingLow` | `HandlerActivate` (object_type: SERVICE_BINDING, object_name) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateServiceDefinitionLow` | `HandlerActivate` (object_type: SERVICE_DEFINITION, object_name) | **accepted:** HandlerActivate activates this type through the activation run (POST /sap/bc/adt/activation/runs, then the run's status and results) instead of the single-object POST /sap/bc/adt/activation. |
| `ActivateStructureLow` | `HandlerActivate` (object_type: STRUCTURE, object_name) | the same requests |
| `ActivateTableLow` | `HandlerActivate` (object_type: TABLE, object_name) | the same requests |
| `CheckBdefLow` | `HandlerCheckRun` (object_type: BEHAVIOR_DEFINITION, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckClassLow` | `HandlerCheckRun` (object_type: CLASS, object_name, version, source_code) | The low tool's source_code is HandlerCheckRun's source_code. |
| `CheckDataElementLow` | `HandlerCheckRun` (object_type: DATA_ELEMENT, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckDdlLow` | `HandlerCheckRun` (object_type: DDL, object_name, version, source_code) | The low tool's ddl_source is HandlerCheckRun's source_code. |
| `CheckDomainLow` | `HandlerCheckRun` (object_type: DOMAIN, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckFunctionGroupLow` | `HandlerCheckRun` (object_type: FUNCTION_GROUP, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckFunctionModuleLow` | `HandlerCheckRun` (object_type: FUNCTION_MODULE, object_name, version) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `CheckInterfaceLow` | `HandlerCheckRun` (object_type: INTERFACE, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckMetadataExtensionLow` | `HandlerCheckRun` (object_type: METADATA_EXTENSION, object_name, version) | the same requests |
| `CheckPackageLow` | `HandlerCheckRun` (object_type: PACKAGE, object_name) | the same requests |
| `CheckProgramLow` | `HandlerCheckRun` (object_type: PROGRAM, object_name, version) | The low tool passed an omitted version on as undefined, which the client checks as inactive; HandlerCheckRun defaults to active, so state version. |
| `CheckStructureLow` | `HandlerCheckRun` (object_type: STRUCTURE, object_name, version, source_code) | The low tool's ddl_code is HandlerCheckRun's source_code. |
| `CheckTableLow` | `HandlerCheckRun` (object_type: TABLE, object_name, version) | CheckTableLow accepted ddl_code and reporter and sent neither. |
| `CreateBehaviorDefinitionLow` | `HandlerCreate` (object_type: BEHAVIOR_DEFINITION, name, description, package_name, transport_request, implementation_type) | the same requests |
| `CreateBehaviorImplementationLow` | `HandlerCreate` (object_type: BEHAVIOR_IMPLEMENTATION, class_name, behavior_definition, description, package_name, transport_request), then `HandlerLock` (object_type: BEHAVIOR_IMPLEMENTATION, object_name), then `HandlerUpdate` (object_type: BEHAVIOR_IMPLEMENTATION, class_name, implementation_code, transport_request, lock_handle), then `HandlerUnlock` (object_type: BEHAVIOR_IMPLEMENTATION, object_name, lock_handle) | With implementation_code, four compact calls, one request each: the create, the lock, the write of the implementations include under the lock_handle the lock answered, the unlock. |
| `CreateClassLow` | `HandlerCreate` (object_type: CLASS, class_name, description, package_name, transport_request, superclass, final, create_protected) | the same requests |
| `CreateDataElementLow` | `HandlerCreate` (object_type: DATA_ELEMENT, data_element_name, description, package_name, transport_request) | the same requests |
| `CreateDdlLow` | `HandlerCreate` (object_type: DDL, ddl_name, description, package_name, transport_request) | the same requests |
| `CreateDomainLow` | `HandlerCreate` (object_type: DOMAIN, domain_name, description, package_name, transport_request) | the same requests |
| `CreateFunctionGroupLow` | `HandlerCreate` (object_type: FUNCTION_GROUP, function_group_name, description, package_name, transport_request) | On the 400 "Interface SAPL… has not been created" the low tool read the group back; HandlerCreate answers the 400 as it came — read the group with HandlerGet part metadata to see whether it landed. |
| `CreateFunctionModuleLow` | `HandlerCreate` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, description, transport_request) | the same requests |
| `CreateInterfaceLow` | `HandlerCreate` (object_type: INTERFACE, interface_name, description, package_name, transport_request) | the same requests |
| `CreateMetadataExtensionLow` | `HandlerCreate` (object_type: METADATA_EXTENSION, name, description, package_name, transport_request, master_language) | the same requests |
| `CreatePackageLow` | `HandlerCreate` (object_type: PACKAGE, package_name, super_package, description, package_type, software_component, transport_layer, transport_request, record_changes, application_component) | the same requests |
| `CreateProgramLow` | `HandlerCreate` (object_type: PROGRAM, program_name, description, package_name, transport_request, program_type, application) | the same requests |
| `CreateStructureLow` | `HandlerCreate` (object_type: STRUCTURE, structure_name, description, package_name, transport_request) | HandlerCreate STRUCTURE sends the create alone; the fields reach the structure through a later write (HandlerLock, HandlerUpdate with the lock_handle, HandlerUnlock). |
| `CreateTableLow` | `HandlerCreate` (object_type: TABLE, table_name, package_name, transport_request) | the same requests |
| `CreateTransportLow` | `HandlerTransportCreate` (description, transport_type) | the same requests |
| `DeleteBehaviorDefinitionLow` | `HandlerDelete` (object_type: BEHAVIOR_DEFINITION, behavior_definition_name, transport_request) | the same requests |
| `DeleteClassLow` | `HandlerDelete` (object_type: CLASS, class_name, transport_request) | the same requests |
| `DeleteDataElementLow` | `HandlerDelete` (object_type: DATA_ELEMENT, data_element_name, transport_request) | the same requests |
| `DeleteDdlLow` | `HandlerDelete` (object_type: DDL, ddl_name, transport_request) | the same requests |
| `DeleteDomainLow` | `HandlerDelete` (object_type: DOMAIN, domain_name, transport_request) | the same requests |
| `DeleteFunctionGroupLow` | `HandlerDelete` (object_type: FUNCTION_GROUP, function_group_name, transport_request) | the same requests |
| `DeleteFunctionModuleLow` | `HandlerDelete` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, transport_request) | the same requests |
| `DeleteInterfaceLow` | `HandlerDelete` (object_type: INTERFACE, interface_name, transport_request) | the same requests |
| `DeleteMetadataExtensionLow` | `HandlerDelete` (object_type: METADATA_EXTENSION, metadata_extension_name, transport_request) | the same requests |
| `DeletePackageLow` | `HandlerDelete` (object_type: PACKAGE, package_name, transport_request) | The deletion request alone, as the low tool sent it, on the call's connection. The low tool's force_new_connection has no compact counterpart: compact locks and writes a package in an ABAP session of its own, so the call's session never holds a saved package; the full set's DeletePackage keeps force_new_connection. |
| `DeleteProgramLow` | `HandlerDelete` (object_type: PROGRAM, program_name, transport_request) | the same requests |
| `DeleteStructureLow` | `HandlerDelete` (object_type: STRUCTURE, structure_name, transport_request) | the same requests |
| `DeleteTableLow` | `HandlerDelete` (object_type: TABLE, table_name, transport_request) | the same requests |
| `GetNodeStructureLow` | `HandlerGet` (part: node_structure, object_adt_type, object_name, node_id, with_short_descriptions) | A package's (DEVC/K) blank body: the low tool read the package's metadata to tell an empty package from an absent one; HandlerGet answers the empty listing with blank stating both readings, one request — read the package with HandlerGet part metadata to know which holds. |
| `GetObjectStructureLow` | `HandlerGet` (part: object_structure, object_adt_type, object_name) | the same requests |
| `GetVirtualFoldersLow` | `HandlerGet` (part: virtual_folders, object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions) | the same requests |
| `LockBehaviorDefinitionLow` | `HandlerLock` (object_type: BEHAVIOR_DEFINITION, object_name) | the same requests |
| `LockBehaviorImplementationLow` | `HandlerLock` (object_type: BEHAVIOR_IMPLEMENTATION, object_name) | the same requests |
| `LockClassLow` | `HandlerLock` (object_type: CLASS, object_name) | the same requests |
| `LockDataElementLow` | `HandlerLock` (object_type: DATA_ELEMENT, object_name) | the same requests |
| `LockDdlLow` | `HandlerLock` (object_type: DDL, object_name) | the same requests |
| `LockDomainLow` | `HandlerLock` (object_type: DOMAIN, object_name) | the same requests |
| `LockFunctionGroupLow` | `HandlerLock` (object_type: FUNCTION_GROUP, object_name) | the same requests |
| `LockFunctionModuleLow` | `HandlerLock` (object_type: FUNCTION_MODULE, object_name) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `LockInterfaceLow` | `HandlerLock` (object_type: INTERFACE, object_name) | the same requests |
| `LockMetadataExtensionLow` | `HandlerLock` (object_type: METADATA_EXTENSION, object_name) | the same requests |
| `LockPackageLow` | `HandlerLock` (object_type: PACKAGE, object_name, super_package) | the same requests |
| `LockProgramLow` | `HandlerLock` (object_type: PROGRAM, object_name) | the same requests |
| `LockStructureLow` | `HandlerLock` (object_type: STRUCTURE, object_name) | the same requests |
| `LockTableLow` | `HandlerLock` (object_type: TABLE, object_name) | the same requests |
| `UnlockBehaviorDefinitionLow` | `HandlerUnlock` (object_type: BEHAVIOR_DEFINITION, object_name, lock_handle) | the same requests |
| `UnlockClassLow` | `HandlerUnlock` (object_type: CLASS, object_name, lock_handle) | the same requests |
| `UnlockDataElementLow` | `HandlerUnlock` (object_type: DATA_ELEMENT, object_name, lock_handle) | the same requests |
| `UnlockDdlLow` | `HandlerUnlock` (object_type: DDL, object_name, lock_handle) | the same requests |
| `UnlockDomainLow` | `HandlerUnlock` (object_type: DOMAIN, object_name, lock_handle) | the same requests |
| `UnlockFunctionGroupLow` | `HandlerUnlock` (object_type: FUNCTION_GROUP, object_name, lock_handle) | the same requests |
| `UnlockFunctionModuleLow` | `HandlerUnlock` (object_type: FUNCTION_MODULE, object_name, lock_handle) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `UnlockInterfaceLow` | `HandlerUnlock` (object_type: INTERFACE, object_name, lock_handle) | the same requests |
| `UnlockMetadataExtensionLow` | `HandlerUnlock` (object_type: METADATA_EXTENSION, object_name, lock_handle) | the same requests |
| `UnlockPackageLow` | `HandlerUnlock` (object_type: PACKAGE, object_name, lock_handle) | the same requests |
| `UnlockProgramLow` | `HandlerUnlock` (object_type: PROGRAM, object_name, lock_handle) | the same requests |
| `UnlockStructureLow` | `HandlerUnlock` (object_type: STRUCTURE, object_name, lock_handle) | the same requests |
| `UnlockTableLow` | `HandlerUnlock` (object_type: TABLE, object_name, lock_handle) | the same requests |
| `UpdateBehaviorDefinitionLow` | `HandlerUpdate` (object_type: BEHAVIOR_DEFINITION, name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateClassLow` | `HandlerUpdate` (object_type: CLASS, class_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateDataElementLow` | `HandlerGet` (object_type: DATA_ELEMENT, data_element_name, part: metadata), then `HandlerUpdate` (object_type: DATA_ELEMENT, data_element_name, source_code, lock_handle) | **accepted:** Since 23.0.0 every read names its version: the compact HandlerGet part metadata reads /sap/bc/adt/ddic/dataelements/dtel_a?version=active (its default); the low tool's read sent no version, which ADT answers from the working area. Two compact calls, one request each: HandlerGet part metadata reads the document; HandlerUpdate writes the changed document, whole, under the lock_handle. |
| `UpdateDdlLow` | `HandlerUpdate` (object_type: DDL, ddl_name, ddl_source, lock_handle, transport_request) | the same requests |
| `UpdateDomainLow` | `HandlerGet` (object_type: DOMAIN, domain_name, part: metadata), then `HandlerUpdate` (object_type: DOMAIN, domain_name, source_code, lock_handle) | **accepted:** Since 23.0.0 every read names its version: the compact HandlerGet part metadata reads /sap/bc/adt/ddic/domains/dom_a?version=active (its default); the low tool's read sent no version, which ADT answers from the working area. Two compact calls, one request each: HandlerGet part metadata reads the document; HandlerUpdate writes the changed document, whole, under the lock_handle. |
| `UpdateFunctionModuleLow` | `HandlerUpdate` (object_type: FUNCTION_MODULE, function_module_name, function_group_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateInterfaceLow` | `HandlerUpdate` (object_type: INTERFACE, interface_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateMetadataExtensionLow` | `HandlerUpdate` (object_type: METADATA_EXTENSION, name, source_code, lock_handle, transport_request) | the same requests |
| `UpdatePackageLow` | `HandlerGet` (object_type: PACKAGE, package_name, part: metadata), then `HandlerUpdate` (object_type: PACKAGE, package_name, source_code, lock_handle, transport_request) | Two compact calls, one request each: HandlerGet part metadata reads the document; HandlerUpdate writes the changed document, whole, under the lock_handle. |
| `UpdateProgramLow` | `HandlerUpdate` (object_type: PROGRAM, program_name, source_code, lock_handle, transport_request) | the same requests |
| `UpdateStructureLow` | `HandlerUpdate` (object_type: STRUCTURE, structure_name, ddl_code, lock_handle, transport_request) | the same requests |
| `UpdateTableLow` | `HandlerUpdate` (object_type: TABLE, table_name, ddl_code, lock_handle, transport_request) | the same requests |
| `ValidateBehaviorDefinitionLow` | `HandlerValidate` (object_type: BEHAVIOR_DEFINITION, object_name, root_entity, implementation_type, package_name, description) | ValidateBehaviorDefinitionLow validated the root entity's name; object_name carries it. |
| `ValidateBehaviorImplementationLow` | `HandlerValidate` (object_type: BEHAVIOR_IMPLEMENTATION, object_name, behavior_definition, package_name, description) | the same requests |
| `ValidateClassLow` | `HandlerValidate` (object_type: CLASS, object_name, package_name, description, superclass) | the same requests |
| `ValidateDataElementLow` | `HandlerValidate` (object_type: DATA_ELEMENT, object_name, description, package_name) | the same requests |
| `ValidateDdlLow` | `HandlerValidate` (object_type: DDL, object_name, package_name, description) | the same requests |
| `ValidateDomainLow` | `HandlerValidate` (object_type: DOMAIN, object_name, description, package_name) | the same requests |
| `ValidateFunctionGroupLow` | `HandlerValidate` (object_type: FUNCTION_GROUP, object_name, package_name, description) | the same requests |
| `ValidateFunctionModuleLow` | `HandlerValidate` (object_type: FUNCTION_MODULE, object_name, description) | The lifecycle tools name a function module GROUP\|MODULE in object_name. |
| `ValidateInterfaceLow` | `HandlerValidate` (object_type: INTERFACE, object_name, package_name, description) | the same requests |
| `ValidateMetadataExtensionLow` | `HandlerValidate` (object_type: METADATA_EXTENSION, object_name, package_name, description) | the same requests |
| `ValidatePackageLow` | `HandlerValidate` (object_type: PACKAGE, object_name, super_package) | the same requests |
| `ValidateProgramLow` | `HandlerValidate` (object_type: PROGRAM, object_name, package_name, description) | the same requests |
| `ValidateStructureLow` | `HandlerValidate` (object_type: STRUCTURE, object_name, package_name, description) | the same requests |
| `ValidateTableLow` | `HandlerValidate` (object_type: TABLE, object_name, package_name, description) | the same requests |
<!-- end of the low-to-compact table -->
