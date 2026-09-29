# Compact Tools — MCP ABAP ADT

Generated from the built packages, not from source text: these are the tool
definitions a client receives.

- Tools: 22
- Read-only half: `@mcp-abap-adt/compact-readonly`
- Modifying half: `@mcp-abap-adt/compact-modify`
- Command: `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`)

## How it works

One tool per OPERATION, with the object in `object_type`: `HandlerCreate` with
`object_type: "CLASS"` rather than a `CreateClass` tool. 22 schemas instead of
the object-oriented surface's hundreds, for a host that cannot select tools
per request.

## Tools

### HandlerGet

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** Read operation. part selects the aspect: source (default), metadata, or urls; a part the type does not offer is refused, naming the ones it does. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `part` — Which aspect to read: the source, the ADT metadata document, or the service and preview URLs. A part this object type does not offer is refused, naming the parts it does.
- `package_name` — Package name.
- `class_name` — Class name.
- `interface_name` — Interface name.
- `program_name` — Program name.
- `domain_name` — Domain name.
- `data_element_name` — Data element name.
- `table_name` — Table name.
- `structure_name` — Structure name.
- `ddl_name` — DDL source name.
- `function_module_name` — Function module name.
- `function_group_name` — Function group name.
- `behavior_definition_name` — Behavior definition name.
- `behavior_implementation_name` — Behavior implementation name.
- `metadata_extension_name` — Metadata extension name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `run_id` — Unit test run id.
- `response_format` — Response format for SERVICE_BINDING reads.
- `version` — Object version to read/check.

### HandlerValidate

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** Validate before create only. object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type to validate before create. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.
- `object_name` (required) — Required object name. For SERVICE_BINDING this is the service binding name.
- `package_name` — Optional package context for validation (especially for create scenarios).
- `description` — Optional object description used during validation.
- `behavior_definition` — Optional behavior definition name, used when validating behavior implementation.
- `root_entity` — Optional CDS root entity name, used for behavior-related validation.
- `implementation_type` — Optional implementation type, used for behavior implementation validation.
- `service_definition_name` — Required when object_type=SERVICE_BINDING. Service definition paired with the binding.
- `service_binding_version` — Optional service binding version for SERVICE_BINDING.
- `session_id` — Optional ADT session id for stateful validation flow.
- `session_state` — Optional ADT session state container (cookies/CSRF) for stateful validation flow.

### HandlerCheckRun

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** CheckRun operation (syntax, no activation). object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `object_name` (required) — Primary object name for lifecycle operation.
- `version` — Version to syntax-check.
- `session_id` — Optional ADT session id for stateful check flow.
- `session_state` — Optional ADT session state container (cookies/CSRF) for stateful check flow.

### HandlerUnitTestStatus

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** ABAP Unit status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_long_polling` — Use long polling while waiting for completion.

### HandlerUnitTestResult

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** ABAP Unit result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_navigation_uris` — Include ADT navigation URIs in the result payload.
- `format` — Result format.

### HandlerCdsUnitTestStatus

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** CDS unit test status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_long_polling` — Use long polling while waiting for completion.

### HandlerCdsUnitTestResult

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** CDS unit test result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_navigation_uris` — Include ADT navigation URIs in the result payload.
- `format` — Result format.

### HandlerProfileList

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** Runtime profiling list. object_type: not used. Required: none. Response: JSON.

**Available in:** cloud, onprem

**Parameters:** none

### HandlerProfileView

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** Runtime profiling view. object_type: not used. Required: trace_id_or_uri*, view*(hitlist|statements|db_accesses). Optional: mode(raw|analyze, default raw), top(analyze only), with_system_events, id, with_details, auto_drill_down_threshold. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `trace_id_or_uri` (required) — Profiler trace id or URI.
- `view` (required) — Profiler trace view kind.
- `mode` — "raw" returns the parsed trace payload as-is (default). "analyze" returns a compact summary instead — totals plus the top-ranked entries — via the same trace view.
- `top` — Number of top-ranked rows to include when mode is "analyze". Default 10. Ignored for mode "raw".
- `with_system_events` — Include system events in analysis.
- `id` — Optional statement/access id.
- `with_details` — Include detailed payload.
- `auto_drill_down_threshold` — Auto drill-down threshold.

### HandlerDumpList

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** Runtime feed list. object_type: not used. Optional: feed_type(dumps|system_messages|gateway_errors, default dumps), user, top, from, to. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `feed_type` — Which runtime feed to list. Default "dumps" (ABAP short dumps). "system_messages" and "gateway_errors" read the other two ADT runtime feeds through the same call.
- `user` — Filter entries by user.
- `top` — Limit number of returned entries.
- `from` — Start of time range (YYYYMMDDHHMMSS).
- `to` — End of time range (YYYYMMDDHHMMSS).

### HandlerDumpView

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** Runtime dump view. object_type: not used. Required: dump_id*. Optional: view(default|summary|formatted). Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `dump_id` (required) — Runtime dump id.
- `view` — Dump rendering mode.

### HandlerServiceBindingListTypes

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** Service binding types list. object_type: not used. Required: none. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.

**Available in:** cloud, onprem

**Parameters:**

- `response_format` — Response format for protocol types list.

### HandlerServiceBindingValidate

**Half:** `@mcp-abap-adt/compact-readonly`

**Description:** Service binding validate before create. object_type: not used. Required: service_binding_name*, service_definition_name*. Optional: service_binding_version, package_name, description. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `service_binding_name` (required) — Service binding name to validate.
- `service_definition_name` (required) — Service definition name to pair with binding.
- `service_binding_version` — Service binding version.
- `package_name` — Target package name.
- `description` — Binding description.

### HandlerCreate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Create operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, root_entity*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, package_name*), METADATA_EXTENSION(name*, package_name*), UNIT_TEST(tests*), CDS_UNIT_TEST(class_name*, package_name*, cds_view_name*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `class_name` — ABAP class name.
- `program_name` — ABAP program name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name.
- `package_name` — ABAP package name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `description` — Human-readable object description.
- `transport_request` — Transport request id (if required by system).
- `activate` — Activate object after create.
- `program_type` — ABAP program type.
- `application` — Domain application area.
- `datatype` — ABAP data type.
- `length` — Length for typed artifacts.
- `decimals` — Decimal places.
- `conversion_exit` — Conversion exit name.
- `lowercase` — Allow lowercase values (domain setting).
- `sign_exists` — Allow signed values (domain setting).
- `value_table` — Foreign key value table.
- `fixed_values` — Domain fixed values list.
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `name` — Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `root_entity` — Root CDS entity name (behavior definition create).
- `implementation_type` — Behavior definition implementation type.
- `behavior_definition` — Referenced behavior definition name (behavior implementation create).
- `cds_view_name` — CDS view name to validate for unit test doubles.
- `fields` — Structure fields (for STRUCTURE create).
- `tests` — Container/test class pairs (for UNIT_TEST create).

### HandlerUpdate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Update operation. object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, source_code*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, implementation_code*), METADATA_EXTENSION(name*, source_code*), UNIT_TEST(run_id*), CDS_UNIT_TEST(class_name*, test_class_source*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `class_name` — ABAP class name.
- `program_name` — ABAP program name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name.
- `package_name` — ABAP package name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `source_code` — ABAP source code payload.
- `ddl_source` — Complete DDL source code (for DDL update).
- `transport_request` — Transport request id (if required by system).
- `activate` — Activate object after update.
- `description` — Human-readable object description.
- `datatype` — ABAP data type.
- `length` — Length for typed artifacts.
- `decimals` — Decimal places.
- `conversion_exit` — Conversion exit name.
- `lowercase` — Allow lowercase values (domain setting).
- `sign_exists` — Allow signed values (domain setting).
- `value_table` — Foreign key value table.
- `fixed_values` — Domain fixed values list.
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `service_name` — Published service name (service binding update).
- `name` — Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `behavior_definition` — Referenced behavior definition name (behavior implementation update).
- `ddl_code` — Complete DDL source code (for TABLE/STRUCTURE update).
- `implementation_code` — Behavior implementation methods source code.
- `test_class_source` — Updated local test class source (CDS_UNIT_TEST update).
- `test_class_code` — Updated source for the local test class.
- `local_types_code` — Updated source for class local types.
- `definitions_code` — Updated source for class local definitions.
- `macros_code` — Updated source for class local macros.
- `run_id` — Unit test run id (UNIT_TEST update).
- `binding_variant` — Service binding variant (service binding update).
- `desired_publication_state` — Target publication state (service binding update).

### HandlerDelete

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Delete operation. object_type required: DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(class_name*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `class_name` — ABAP class name.
- `program_name` — ABAP program name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `transport_request` — Transport request id (if required by system).
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `behavior_definition_name` — Behavior definition name.
- `behavior_implementation_name` — Behavior implementation name.
- `metadata_extension_name` — Metadata extension name.
- `run_id` — Unit test run id (UNIT_TEST delete).

### HandlerActivate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Activate operation. Single mode(object_name*, object_type or object_adt_type*). object_type is enough for CLASS, PROGRAM [onprem only], INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, METADATA_EXTENSION, PACKAGE, SERVICE_DEFINITION and SERVICE_BINDING; any other type needs object_adt_type (e.g. "CLAS/OC"). FUNCTION_MODULE needs the batch mode with objects[].parentName set to its function group, because a module is addressed under the group. Batch mode(objects[].name*, objects[].type*, objects[].parentName, objects[].uri).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` — ABAP object type for routed compact operation. For single-object activation, this alone is enough — no ADT type code needed.
- `object_name` — Object name for single-object activation form.
- `object_adt_type` — ADT object type code (e.g. CLAS/OC, PROG/P), for a type object_type does not cover. Only needed when object_type is not enough; prefer object_type otherwise.
- `objects` — Explicit objects list for batch activation.
- `preaudit` — Run pre-audit checks before activation.

### HandlerTransportCreate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Transport create. object_type: not used. Required: description*. Optional: transport_type(workbench|customizing), target_system, owner. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `transport_type` — Transport type.
- `description` (required) — Transport description.
- `target_system` — Target system id.
- `owner` — Transport owner user.

### HandlerLock

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Lock operation. object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `object_name` (required) — Primary object name for lifecycle operation.
- `super_package` — Super package context when relevant.
- `session_id` — Optional ADT session id for stateful lock flow.
- `session_state` — Optional ADT session state container (cookies/CSRF) for stateful lock flow.

### HandlerUnlock

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Unlock operation. object_type required: CLASS(object_name*, lock_handle*, session_id*), PROGRAM(object_name*, lock_handle*, session_id*) [onprem only], INTERFACE(object_name*, lock_handle*, session_id*), FUNCTION_GROUP(object_name*, lock_handle*, session_id*), FUNCTION_MODULE(object_name*, lock_handle*, session_id*), TABLE(object_name*, lock_handle*, session_id*), STRUCTURE(object_name*, lock_handle*, session_id*), DDL(object_name*, lock_handle*, session_id*), DOMAIN(object_name*, lock_handle*, session_id*), DATA_ELEMENT(object_name*, lock_handle*, session_id*), PACKAGE(object_name*, lock_handle*, session_id*), BEHAVIOR_DEFINITION(object_name*, lock_handle*, session_id*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*, session_id*), METADATA_EXTENSION(object_name*, lock_handle*, session_id*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `object_name` (required) — Primary object name for lifecycle operation.
- `lock_handle` (required) — Lock handle returned by lock.
- `session_id` (required) — ADT session id used during lock.
- `session_state` — Optional ADT session state container (cookies/CSRF) for stateful unlock flow.

### HandlerUnitTestRun

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** ABAP Unit run. object_type: not used. Required: tests[]{container_class*, test_class*}. Optional: title, context, scope, risk_level, duration. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `tests` (required) — List of test classes to run.
- `title` — Run title shown in ABAP Unit logs.
- `context` — Run context label.
- `scope` — ABAP Unit scope flags.
- `risk_level` — Allowed risk levels.
- `duration` — Allowed duration classes.

### HandlerProfileRun

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Runtime profiling run. object_type: not used. Required: target_type*(CLASS|PROGRAM) + class_name* for CLASS or program_name* for PROGRAM [onprem only — ABAP Cloud has no programs]. Optional: profiling(default true; set false for a plain run with no trace), profiling flags, description. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `target_type` (required) — Profile execution target kind.
- `class_name` — Class name for profiling.
- `program_name` — Program name for profiling.
- `profiling` — Whether to capture a profiler trace while running. Default true. Set false for a plain run with no tracing — the profiling flags below are then ignored.
- `description` — Profiler run description.
- `all_procedural_units` — Trace all procedural units.
- `all_misc_abap_statements` — Trace miscellaneous ABAP statements.
- `all_internal_table_events` — Trace internal table events.
- `all_dynpro_events` — Trace dynpro events.
- `aggregate` — Aggregate profiling data.
- `explicit_on_off` — Use explicit on/off trace sections.
- `with_rfc_tracing` — Enable RFC tracing.
- `all_system_kernel_events` — Trace system kernel events.
- `sql_trace` — Enable SQL trace.
- `all_db_events` — Trace all DB events.
- `max_size_for_trace_file` — Maximum trace file size.
- `amdp_trace` — Enable AMDP tracing.
- `max_time_for_tracing` — Maximum tracing time.

