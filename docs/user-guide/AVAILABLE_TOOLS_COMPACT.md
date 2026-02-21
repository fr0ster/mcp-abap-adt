# Compact Tools - MCP ABAP ADT Server

Generated from code in `src/handlers/compact/high` (not from docs).

- Group: Compact
- Total tools: 22

## How It Works

Compact is a facade over existing high-level/runtime handlers.
You call one compact tool by intent and route by typed payload fields.

## Start Here

Pick tool by intent:

- Create object -> `HandlerCreate`
- Read object -> `HandlerGet`
- Update object -> `HandlerUpdate`
- Delete object -> `HandlerDelete`
- Validate object/binding -> `HandlerValidate`
- Activate object(s) -> `HandlerActivate`
- Lock object -> `HandlerLock`
- Unlock object -> `HandlerUnlock`
- Check run (syntax) -> `HandlerCheckRun`
- ABAP Unit run/status/result -> `HandlerUnitTestRun|HandlerUnitTestStatus|HandlerUnitTestResult`
- CDS Unit status/result -> `HandlerCdsUnitTestStatus|HandlerCdsUnitTestResult`
- Runtime profile run/list/view -> `HandlerProfileRun|HandlerProfileList|HandlerProfileView`
- Runtime dump list/view -> `HandlerDumpList|HandlerDumpView`
- Service binding list/validate -> `HandlerServiceBindingListTypes|HandlerServiceBindingValidate`
- Transport create -> `HandlerTransportCreate`

Request contract:

- CRUD: `HandlerCreate|HandlerGet|HandlerUpdate|HandlerDelete` with required `object_type`.
- Lifecycle: `HandlerValidate|HandlerActivate|HandlerLock|HandlerUnlock|HandlerCheckRun` with compact lifecycle params.
- Action-specific tools above use narrow typed payloads.

## Routing Matrix

Source of truth: `src/handlers/compact/high/compactMatrix.ts`.
Facade dispatch is deterministic by `object_type` and CRUD operation.

| object_type | CRUD |
| --- | --- |
| `BEHAVIOR_DEFINITION` | `create`, `get`, `update`, `delete` |
| `BEHAVIOR_IMPLEMENTATION` | `create`, `get`, `update`, `delete` |
| `CDS_UNIT_TEST` | `create`, `get`, `update`, `delete` |
| `CLASS` | `create`, `get`, `update`, `delete` |
| `DATA_ELEMENT` | `create`, `get`, `update`, `delete` |
| `DOMAIN` | `create`, `get`, `update`, `delete` |
| `FUNCTION_GROUP` | `create`, `get`, `update`, `delete` |
| `FUNCTION_MODULE` | `create`, `get`, `update`, `delete` |
| `INTERFACE` | `create`, `get`, `update`, `delete` |
| `LOCAL_DEFINITIONS` | `create`, `get`, `update`, `delete` |
| `LOCAL_MACROS` | `create`, `get`, `update`, `delete` |
| `LOCAL_TEST_CLASS` | `create`, `get`, `update`, `delete` |
| `LOCAL_TYPES` | `create`, `get`, `update`, `delete` |
| `METADATA_EXTENSION` | `create`, `get`, `update`, `delete` |
| `PACKAGE` | `create`, `get` |
| `PROGRAM` | `create`, `get`, `update`, `delete` |
| `RUNTIME_DUMP` | - |
| `RUNTIME_PROFILE` | - |
| `SERVICE_BINDING` | `create`, `get`, `update`, `delete` |
| `SERVICE_DEFINITION` | `create`, `get`, `update`, `delete` |
| `STRUCTURE` | `create`, `get`, `update`, `delete` |
| `TABLE` | `create`, `get`, `update`, `delete` |
| `TRANSPORT` | `create` |
| `UNIT_TEST` | `create`, `get`, `update`, `delete` |
| `VIEW` | `create`, `get`, `update`, `delete` |

Unsupported combinations return deterministic error:
- `Unsupported <operation> for object_type: <TYPE>`

## Action Recipes

Preferred dedicated compact tools and minimal payloads:

| Goal | Tool | Required fields |
| --- | --- | --- |
| Run ABAP Unit | `HandlerUnitTestRun` | `tests[]` |
| Unit status | `HandlerUnitTestStatus` | `run_id` |
| Unit result | `HandlerUnitTestResult` | `run_id` |
| CDS unit status | `HandlerCdsUnitTestStatus` | `run_id` |
| CDS unit result | `HandlerCdsUnitTestResult` | `run_id` |
| List binding types | `HandlerServiceBindingListTypes` | none |
| Validate binding | `HandlerServiceBindingValidate` | `service_binding_name`, `service_definition_name` |
| Create transport | `HandlerTransportCreate` | `description` |
| Run profiling (class/program) | `HandlerProfileRun` | `target_type` + target name |
| List profiler traces | `HandlerProfileList` | none |
| Read profiler trace | `HandlerProfileView` | `trace_id_or_uri`, `view` |
| List dumps | `HandlerDumpList` | none |
| Read dump | `HandlerDumpView` | `dump_id` |

## Minimal Payload Contracts

- `HandlerCreate|Get|Update|Delete`: always require `object_type`, plus object-specific fields.
- Dedicated action tools above expose narrow payloads.
- Common required pairs:
  - unit tests status/result: `run_id`
  - dump details: `dump_id`
  - profiler details: `trace_id_or_uri` + `view` (`hitlist|statements|db_accesses`)
  - service binding validate: `service_binding_name` + `service_definition_name`
  - class profiling: `class_name`
  - program profiling: `program_name`

### Quick Examples

- Run profiling for class:
  - `HandlerProfileRun` + `{ "target_type":"CLASS", "class_name":"ZCL_FOO" }`
- Read one profiler trace:
  - `HandlerProfileView` + `{ "trace_id_or_uri":"...", "view":"hitlist" }`
- Read one dump:
  - `HandlerDumpView` + `{ "dump_id":"...", "view":"summary" }`

- List dumps:
  - `HandlerDumpList` + `{ "top":20, "orderby":"CREATED_AT desc" }`
- List profiler traces:
  - `HandlerProfileList` + `{}`
- Validate service binding:
  - `HandlerServiceBindingValidate` + `{ "service_binding_name":"ZSB_FOO", "service_definition_name":"ZSD_FOO" }`

## Navigation

- [Compact Group](#compact-group)
  - [HandlerActivate](#handleractivate-compact)
  - [HandlerCdsUnitTestResult](#handlercdsunittestresult-compact)
  - [HandlerCdsUnitTestStatus](#handlercdsunitteststatus-compact)
  - [HandlerCheckRun](#handlercheckrun-compact)
  - [HandlerCreate](#handlercreate-compact)
  - [HandlerDelete](#handlerdelete-compact)
  - [HandlerDumpList](#handlerdumplist-compact)
  - [HandlerDumpView](#handlerdumpview-compact)
  - [HandlerGet](#handlerget-compact)
  - [HandlerLock](#handlerlock-compact)
  - [HandlerProfileList](#handlerprofilelist-compact)
  - [HandlerProfileRun](#handlerprofilerun-compact)
  - [HandlerProfileView](#handlerprofileview-compact)
  - [HandlerServiceBindingListTypes](#handlerservicebindinglisttypes-compact)
  - [HandlerServiceBindingValidate](#handlerservicebindingvalidate-compact)
  - [HandlerTransportCreate](#handlertransportcreate-compact)
  - [HandlerUnitTestResult](#handlerunittestresult-compact)
  - [HandlerUnitTestRun](#handlerunittestrun-compact)
  - [HandlerUnitTestStatus](#handlerunitteststatus-compact)
  - [HandlerUnlock](#handlerunlock-compact)
  - [HandlerUpdate](#handlerupdate-compact)
  - [HandlerValidate](#handlervalidate-compact)

---

<a id="compact-group"></a>
## Compact Group

<a id="compact"></a>
### Compact

<a id="handleractivate-compact"></a>
#### HandlerActivate (Compact)
**Description:** Compact lifecycle activate operation. Activate objects by ADT type list or single object mapping.

**Source:** `src/handlers/compact/high/handleHandlerActivate.ts`

**Parameters:**
- `object_adt_type` (string, optional) - ADT object type code (e.g. CLAS/OC, PROG/P). Required for single-object activation form.
- `object_name` (string, optional) - 
- `object_type` (any, optional) - 
- `objects` (array, optional) - 
- `preaudit` (boolean, optional) - 

---

<a id="handlercdsunittestresult-compact"></a>
#### HandlerCdsUnitTestResult (Compact)
**Description:** Compact CDS unit test result. Reads run result by run_id.

**Source:** `src/handlers/compact/high/handleHandlerCdsUnitTestResult.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `class_name` (string, optional) - 
- `description` (string, optional) - 
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `program_name` (string, optional) - 
- `sql_trace` (boolean, optional) - 
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="handlercdsunitteststatus-compact"></a>
#### HandlerCdsUnitTestStatus (Compact)
**Description:** Compact CDS unit test status. Reads run status by run_id.

**Source:** `src/handlers/compact/high/handleHandlerCdsUnitTestStatus.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `class_name` (string, optional) - 
- `description` (string, optional) - 
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `program_name` (string, optional) - 
- `sql_trace` (boolean, optional) - 
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="handlercheckrun-compact"></a>
#### HandlerCheckRun (Compact)
**Description:** Compact lifecycle check-run operation. Runs syntax check without activation.

**Source:** `src/handlers/compact/high/handleHandlerCheckRun.ts`

**Parameters:**
- `session_id` (string, optional) - 
- `session_state` (object, optional) - 
- `version` (string, optional (default: active)) - 

---

<a id="handlercreate-compact"></a>
#### HandlerCreate (Compact)
**Description:** Compact facade create operation. Routes by object_type to create supported ABAP object types.

**Source:** `src/handlers/compact/high/handleHandlerCreate.ts`

**Parameters:**
- `activate` (boolean, optional) - 
- `application` (string, optional) - 
- `class_name` (string, optional) - 
- `conversion_exit` (string, optional) - 
- `datatype` (string, optional) - 
- `decimals` (number, optional) - 
- `description` (string, optional) - 
- `domain_name` (string, optional) - 
- `fixed_values` (array, optional) - 
- `function_group_name` (string, optional) - 
- `function_module_name` (string, optional) - 
- `length` (number, optional) - 
- `lowercase` (boolean, optional) - 
- `object_type` (any, required) - 
- `package_name` (string, optional) - 
- `program_name` (string, optional) - 
- `program_type` (string, optional) - 
- `sign_exists` (boolean, optional) - 
- `source_code` (string, optional) - 
- `transport_request` (string, optional) - 
- `value_table` (string, optional) - 

---

<a id="handlerdelete-compact"></a>
#### HandlerDelete (Compact)
**Description:** Compact facade delete operation. Routes by object_type to delete supported ABAP object types.

**Source:** `src/handlers/compact/high/handleHandlerDelete.ts`

**Parameters:**
- `class_name` (string, optional) - 
- `domain_name` (string, optional) - 
- `function_group_name` (string, optional) - 
- `function_module_name` (string, optional) - 
- `object_type` (any, required) - 
- `program_name` (string, optional) - 
- `transport_request` (string, optional) - 

---

<a id="handlerdumplist-compact"></a>
#### HandlerDumpList (Compact)
**Description:** Compact runtime dump list. Returns runtime dumps with filters.

**Source:** `src/handlers/compact/high/handleHandlerDumpList.ts`

**Parameters:**
- `inlinecount` (string, optional) - 
- `orderby` (string, optional) - 
- `skip` (number, optional) - 
- `top` (number, optional) - 
- `user` (string, optional) - 

---

<a id="handlerdumpview-compact"></a>
#### HandlerDumpView (Compact)
**Description:** Compact runtime dump view. Reads one dump by dump_id.

**Source:** `src/handlers/compact/high/handleHandlerDumpView.ts`

**Parameters:**
- `dump_id` (string, required) - 
- `view` (string, optional (default: default)) - 

---

<a id="handlerget-compact"></a>
#### HandlerGet (Compact)
**Description:** Compact facade read operation. Routes by object_type to get supported ABAP object types.

**Source:** `src/handlers/compact/high/handleHandlerGet.ts`

**Parameters:**
- `class_name` (string, optional) - 
- `domain_name` (string, optional) - 
- `function_group_name` (string, optional) - 
- `function_module_name` (string, optional) - 
- `object_type` (any, required) - 
- `program_name` (string, optional) - 
- `version` (any, optional) - 

---

<a id="handlerlock-compact"></a>
#### HandlerLock (Compact)
**Description:** Compact lifecycle lock operation. Locks object for subsequent updates.

**Source:** `src/handlers/compact/high/handleHandlerLock.ts`

**Parameters:**
- `session_id` (string, optional) - 
- `session_state` (object, optional) - 
- `super_package` (string, optional) - 

---

<a id="handlerprofilelist-compact"></a>
#### HandlerProfileList (Compact)
**Description:** Compact runtime profiling list. Returns available profiler traces.

**Source:** `src/handlers/compact/high/handleHandlerProfileList.ts`

**Parameters:**
- See schema reference `compactProfileListSchema` in source file

---

<a id="handlerprofilerun-compact"></a>
#### HandlerProfileRun (Compact)
**Description:** Compact runtime profiling run. Executes CLASS or PROGRAM with profiling enabled.

**Source:** `src/handlers/compact/high/handleHandlerProfileRun.ts`

**Parameters:**
- `aggregate` (boolean, optional) - 
- `all_db_events` (boolean, optional) - 
- `all_dynpro_events` (boolean, optional) - 
- `all_internal_table_events` (boolean, optional) - 
- `all_misc_abap_statements` (boolean, optional) - 
- `all_procedural_units` (boolean, optional) - 
- `all_system_kernel_events` (boolean, optional) - 
- `amdp_trace` (boolean, optional) - 
- `class_name` (string, optional) - 
- `description` (string, optional) - 
- `explicit_on_off` (boolean, optional) - 
- `max_size_for_trace_file` (number, optional) - 
- `max_time_for_tracing` (number, optional) - 
- `program_name` (string, optional) - 
- `sql_trace` (boolean, optional) - 
- `target_type` (string, required) - Profile execution target kind.
- `with_rfc_tracing` (boolean, optional) - 

---

<a id="handlerprofileview-compact"></a>
#### HandlerProfileView (Compact)
**Description:** Compact runtime profiling view. Reads one profiler trace by trace_id_or_uri.

**Source:** `src/handlers/compact/high/handleHandlerProfileView.ts`

**Parameters:**
- `auto_drill_down_threshold` (number, optional) - 
- `id` (number, optional) - 
- `trace_id_or_uri` (string, required) - 
- `view` (string, required) - 
- `with_details` (boolean, optional) - 
- `with_system_events` (boolean, optional) - 

---

<a id="handlerservicebindinglisttypes-compact"></a>
#### HandlerServiceBindingListTypes (Compact)
**Description:** Compact service binding list types. Returns available binding protocol types.

**Source:** `src/handlers/compact/high/handleHandlerServiceBindingListTypes.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - 

---

<a id="handlerservicebindingvalidate-compact"></a>
#### HandlerServiceBindingValidate (Compact)
**Description:** Compact service binding validate. Validates binding and service definition pair.

**Source:** `src/handlers/compact/high/handleHandlerServiceBindingValidate.ts`

**Parameters:**
- `description` (string, optional) - 
- `package_name` (string, optional) - 
- `service_binding_name` (string, required) - 
- `service_binding_version` (string, optional) - 
- `service_definition_name` (string, required) - 

---

<a id="handlertransportcreate-compact"></a>
#### HandlerTransportCreate (Compact)
**Description:** Compact transport create. Creates a new transport request.

**Source:** `src/handlers/compact/high/handleHandlerTransportCreate.ts`

**Parameters:**
- `description` (string, required) - 
- `owner` (string, optional) - 
- `target_system` (string, optional) - 
- `transport_type` (string, optional (default: workbench)) - 

---

<a id="handlerunittestresult-compact"></a>
#### HandlerUnitTestResult (Compact)
**Description:** Compact ABAP Unit result. Reads run result by run_id.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - 
- `run_id` (string, required) - 
- `with_navigation_uris` (boolean, optional (default: false)) - 

---

<a id="handlerunittestrun-compact"></a>
#### HandlerUnitTestRun (Compact)
**Description:** Compact ABAP Unit run. Starts a test run and returns run_id.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestRun.ts`

**Parameters:**
- `context` (string, optional) - 
- `duration` (object, optional) - 
- `risk_level` (object, optional) - 
- `scope` (object, optional) - 
- `tests` (array, required) - 
- `title` (string, optional) - 

---

<a id="handlerunitteststatus-compact"></a>
#### HandlerUnitTestStatus (Compact)
**Description:** Compact ABAP Unit status. Reads run status by run_id.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - 
- `with_long_polling` (boolean, optional (default: true)) - 

---

<a id="handlerunlock-compact"></a>
#### HandlerUnlock (Compact)
**Description:** Compact lifecycle unlock operation. Unlocks object after modifications.

**Source:** `src/handlers/compact/high/handleHandlerUnlock.ts`

**Parameters:**
- `lock_handle` (string, required) - 
- `session_id` (string, required) - 
- `session_state` (object, optional) - 

---

<a id="handlerupdate-compact"></a>
#### HandlerUpdate (Compact)
**Description:** Compact facade update operation. Routes by object_type to update supported ABAP object types.

**Source:** `src/handlers/compact/high/handleHandlerUpdate.ts`

**Parameters:**
- `activate` (boolean, optional) - 
- `class_name` (string, optional) - 
- `conversion_exit` (string, optional) - 
- `datatype` (string, optional) - 
- `decimals` (number, optional) - 
- `description` (string, optional) - 
- `domain_name` (string, optional) - 
- `fixed_values` (array, optional) - 
- `function_group_name` (string, optional) - 
- `function_module_name` (string, optional) - 
- `length` (number, optional) - 
- `lowercase` (boolean, optional) - 
- `object_type` (any, required) - 
- `package_name` (string, optional) - 
- `program_name` (string, optional) - 
- `sign_exists` (boolean, optional) - 
- `source_code` (string, optional) - 
- `transport_request` (string, optional) - 
- `value_table` (string, optional) - 

---

<a id="handlervalidate-compact"></a>
#### HandlerValidate (Compact)
**Description:** Compact lifecycle validate operation. Validates object names/params by object_type.

**Source:** `src/handlers/compact/high/handleHandlerValidate.ts`

**Parameters:**
- `behavior_definition` (string, optional) - 
- `description` (string, optional) - 
- `implementation_type` (string, optional) - 
- `package_name` (string, optional) - 
- `root_entity` (string, optional) - 
- `service_binding_version` (string, optional) - 
- `service_definition_name` (string, optional) - 
- `session_id` (string, optional) - 
- `session_state` (object, optional) - 

---

*Last updated: 2026-02-21*
