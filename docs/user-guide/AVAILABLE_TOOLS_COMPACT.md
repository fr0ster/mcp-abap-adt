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
**Description:** Activate operation. Single mode(object_name*, object_adt_type*). Batch mode(objects[].name*, objects[].type*).

**Source:** `src/handlers/compact/high/handleHandlerActivate.ts`

**Parameters:**
- `object_adt_type` (string, optional) - ADT object type code (e.g. CLAS/OC, PROG/P). Required for single-object activation form.
- `object_name` (string, optional) - Object name for single-object activation form.
- `object_type` (any, optional) - 
- `objects` (array, optional) - Explicit objects list for batch activation.
- `preaudit` (boolean, optional) - Run pre-audit checks before activation.

---

<a id="handlercdsunittestresult-compact"></a>
#### HandlerCdsUnitTestResult (Compact)
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

<a id="handlercdsunitteststatus-compact"></a>
#### HandlerCdsUnitTestStatus (Compact)
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

<a id="handlercheckrun-compact"></a>
#### HandlerCheckRun (Compact)
**Description:** CheckRun operation (syntax, no activation). object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), VIEW(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).

**Source:** `src/handlers/compact/high/handleHandlerCheckRun.ts`

**Parameters:**
- `session_id` (string, optional) - Optional ADT session id for stateful check flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful check flow.
- `version` (string, optional (default: active)) - Version to syntax-check.

---

<a id="handlercreate-compact"></a>
#### HandlerCreate (Compact)
**Description:** Create operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), VIEW(view_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*), INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*).

**Source:** `src/handlers/compact/high/handleHandlerCreate.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate object after create.
- `application` (string, optional) - Domain application area.
- `class_name` (string, optional) - ABAP class name.
- `conversion_exit` (string, optional) - Conversion exit name.
- `datatype` (string, optional) - ABAP data type.
- `decimals` (number, optional) - Decimal places.
- `description` (string, optional) - Human-readable object description.
- `domain_name` (string, optional) - ABAP domain name.
- `fixed_values` (array, optional) - Domain fixed values list.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `length` (number, optional) - Length for typed artifacts.
- `lowercase` (boolean, optional) - Allow lowercase values (domain setting).
- `object_type` (any, required) - 
- `package_name` (string, optional) - ABAP package name.
- `program_name` (string, optional) - ABAP program name.
- `program_type` (string, optional) - ABAP program type.
- `sign_exists` (boolean, optional) - Allow signed values (domain setting).
- `source_code` (string, optional) - ABAP source code payload.
- `transport_request` (string, optional) - Transport request id (if required by system).
- `value_table` (string, optional) - Foreign key value table.

---

<a id="handlerdelete-compact"></a>
#### HandlerDelete (Compact)
**Description:** Delete operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), VIEW(view_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*), INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*).

**Source:** `src/handlers/compact/high/handleHandlerDelete.ts`

**Parameters:**
- `class_name` (string, optional) - ABAP class name.
- `domain_name` (string, optional) - ABAP domain name.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `object_type` (any, required) - 
- `program_name` (string, optional) - ABAP program name.
- `transport_request` (string, optional) - Transport request id (if required by system).

---

<a id="handlerdumplist-compact"></a>
#### HandlerDumpList (Compact)
**Description:** Runtime dump list. object_type: not used. Required: none. Optional: user, inlinecount, top, skip, orderby. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerDumpList.ts`

**Parameters:**
- `inlinecount` (string, optional) - Include total count in response.
- `orderby` (string, optional) - Sort expression.
- `skip` (number, optional) - Offset for pagination.
- `top` (number, optional) - Limit number of returned dumps.
- `user` (string, optional) - Filter dumps by user.

---

<a id="handlerdumpview-compact"></a>
#### HandlerDumpView (Compact)
**Description:** Runtime dump view. object_type: not used. Required: dump_id*. Optional: view(default|summary|formatted). Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerDumpView.ts`

**Parameters:**
- `dump_id` (string, required) - Runtime dump id.
- `view` (string, optional (default: default)) - Dump rendering mode.

---

<a id="handlerget-compact"></a>
#### HandlerGet (Compact)
**Description:** Read operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), VIEW(view_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*), INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*).

**Source:** `src/handlers/compact/high/handleHandlerGet.ts`

**Parameters:**
- `behavior_definition_name` (string, optional) - Behavior definition name.
- `behavior_implementation_name` (string, optional) - Behavior implementation name.
- `class_name` (string, optional) - Class name.
- `data_element_name` (string, optional) - Data element name.
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
- `view_name` (string, optional) - View name.

---

<a id="handlerlock-compact"></a>
#### HandlerLock (Compact)
**Description:** Lock operation. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), VIEW(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).

**Source:** `src/handlers/compact/high/handleHandlerLock.ts`

**Parameters:**
- `session_id` (string, optional) - Optional ADT session id for stateful lock flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful lock flow.
- `super_package` (string, optional) - Super package context when relevant.

---

<a id="handlerprofilelist-compact"></a>
#### HandlerProfileList (Compact)
**Description:** Runtime profiling list. object_type: not used. Required: none. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerProfileList.ts`

**Parameters:**
- See schema reference `compactProfileListSchema` in source file

---

<a id="handlerprofilerun-compact"></a>
#### HandlerProfileRun (Compact)
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

<a id="handlerprofileview-compact"></a>
#### HandlerProfileView (Compact)
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

<a id="handlerservicebindinglisttypes-compact"></a>
#### HandlerServiceBindingListTypes (Compact)
**Description:** Service binding types list. object_type: not used. Required: none. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.

**Source:** `src/handlers/compact/high/handleHandlerServiceBindingListTypes.ts`

**Parameters:**
- `response_format` (string, optional (default: xml)) - Response format for protocol types list.

---

<a id="handlerservicebindingvalidate-compact"></a>
#### HandlerServiceBindingValidate (Compact)
**Description:** Service binding validate before create. object_type: not used. Required: service_binding_name*, service_definition_name*. Optional: service_binding_version, package_name, description. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerServiceBindingValidate.ts`

**Parameters:**
- `description` (string, optional) - Binding description.
- `package_name` (string, optional) - Target package name.
- `service_binding_name` (string, required) - Service binding name to validate.
- `service_binding_version` (string, optional) - Service binding version.
- `service_definition_name` (string, required) - Service definition name to pair with binding.

---

<a id="handlertransportcreate-compact"></a>
#### HandlerTransportCreate (Compact)
**Description:** Transport create. object_type: not used. Required: description*. Optional: transport_type(workbench|customizing), target_system, owner. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerTransportCreate.ts`

**Parameters:**
- `description` (string, required) - Transport description.
- `owner` (string, optional) - Transport owner user.
- `target_system` (string, optional) - Target system id.
- `transport_type` (string, optional (default: workbench)) - Transport type.

---

<a id="handlerunittestresult-compact"></a>
#### HandlerUnitTestResult (Compact)
**Description:** ABAP Unit result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestResult.ts`

**Parameters:**
- `format` (string, optional) - Result format.
- `run_id` (string, required) - Unit test run id.
- `with_navigation_uris` (boolean, optional (default: false)) - Include ADT navigation URIs in the result payload.

---

<a id="handlerunittestrun-compact"></a>
#### HandlerUnitTestRun (Compact)
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

<a id="handlerunitteststatus-compact"></a>
#### HandlerUnitTestStatus (Compact)
**Description:** ABAP Unit status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Source:** `src/handlers/compact/high/handleHandlerUnitTestStatus.ts`

**Parameters:**
- `run_id` (string, required) - Unit test run id.
- `with_long_polling` (boolean, optional (default: true)) - Use long polling while waiting for completion.

---

<a id="handlerunlock-compact"></a>
#### HandlerUnlock (Compact)
**Description:** Unlock operation. object_type required: CLASS(object_name*, lock_handle*, session_id*), PROGRAM(object_name*, lock_handle*, session_id*), INTERFACE(object_name*, lock_handle*, session_id*), FUNCTION_GROUP(object_name*, lock_handle*, session_id*), FUNCTION_MODULE(object_name*, lock_handle*, session_id*), TABLE(object_name*, lock_handle*, session_id*), STRUCTURE(object_name*, lock_handle*, session_id*), VIEW(object_name*, lock_handle*, session_id*), DOMAIN(object_name*, lock_handle*, session_id*), DATA_ELEMENT(object_name*, lock_handle*, session_id*), PACKAGE(object_name*, lock_handle*, session_id*), BEHAVIOR_DEFINITION(object_name*, lock_handle*, session_id*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*, session_id*), METADATA_EXTENSION(object_name*, lock_handle*, session_id*).

**Source:** `src/handlers/compact/high/handleHandlerUnlock.ts`

**Parameters:**
- `lock_handle` (string, required) - Lock handle returned by lock.
- `session_id` (string, required) - ADT session id used during lock.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful unlock flow.

---

<a id="handlerupdate-compact"></a>
#### HandlerUpdate (Compact)
**Description:** Update operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), VIEW(view_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*), INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*).

**Source:** `src/handlers/compact/high/handleHandlerUpdate.ts`

**Parameters:**
- `activate` (boolean, optional) - Activate object after update.
- `class_name` (string, optional) - ABAP class name.
- `conversion_exit` (string, optional) - Conversion exit name.
- `datatype` (string, optional) - ABAP data type.
- `decimals` (number, optional) - Decimal places.
- `description` (string, optional) - Human-readable object description.
- `domain_name` (string, optional) - ABAP domain name.
- `fixed_values` (array, optional) - Domain fixed values list.
- `function_group_name` (string, optional) - ABAP function group name.
- `function_module_name` (string, optional) - ABAP function module name.
- `length` (number, optional) - Length for typed artifacts.
- `lowercase` (boolean, optional) - Allow lowercase values (domain setting).
- `object_type` (any, required) - 
- `package_name` (string, optional) - ABAP package name.
- `program_name` (string, optional) - ABAP program name.
- `sign_exists` (boolean, optional) - Allow signed values (domain setting).
- `source_code` (string, optional) - ABAP source code payload.
- `transport_request` (string, optional) - Transport request id (if required by system).
- `value_table` (string, optional) - Foreign key value table.

---

<a id="handlervalidate-compact"></a>
#### HandlerValidate (Compact)
**Description:** Validate before create only. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), VIEW(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*).

**Source:** `src/handlers/compact/high/handleHandlerValidate.ts`

**Parameters:**
- `behavior_definition` (string, optional) - Optional behavior definition name, used when validating behavior implementation.
- `description` (string, optional) - Optional object description used during validation.
- `implementation_type` (string, optional) - Optional implementation type, used for behavior implementation validation.
- `object_name` (string, required) - Required object name. For SERVICE_BINDING this is the service binding name.
- `object_type` (string, required) - Object type to validate before create. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, VIEW, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.
- `package_name` (string, optional) - Optional package context for validation (especially for create scenarios).
- `root_entity` (string, optional) - Optional CDS root entity name, used for behavior-related validation.
- `service_binding_version` (string, optional) - Optional service binding version for SERVICE_BINDING.
- `service_definition_name` (string, optional) - Required when object_type=SERVICE_BINDING. Service definition paired with the binding.
- `session_id` (string, optional) - Optional ADT session id for stateful validation flow.
- `session_state` (object, optional) - Optional ADT session state container (cookies/CSRF) for stateful validation flow.

---

*Last updated: 2026-02-21*
