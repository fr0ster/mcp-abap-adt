# Compact Tools — MCP ABAP ADT

Generated from the built packages, not from source text: these are the tool
definitions a client receives.

- Tools: 37
- Read-only half: `@mcp-abap-adt/compact-readonly-entries`
- Modifying half: `@mcp-abap-adt/compact-modify`
- Debugger verbs: `@mcp-abap-adt/compact`, served by the write binaries always, by no `-ro` binary
- Leftover-session tools: `@mcp-abap-adt/lib`, on stdio only (`mcp-abap-adt-compact`, `mcp-abap-adt-compact-ro`): the list and the logoff in both; no `-compact-http` or `-compact-sse` binary serves them
- Background-run tools: `@mcp-abap-adt/lib`, in the write binaries (where `HandlerProfileRun` is)
- Batch mode: `HandlerBatch` of `@mcp-abap-adt/lib`, in every compact binary, on every transport. Every other tool's description, as the server lists it, ends with one sentence saying whether a call of it is recorded in batch mode, for which arguments, refused, or not served; the descriptions on this page are the tools' own, without it ([Batch Mode](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/BATCH_MODE.md))
- Commands: `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`) serves every tool below; `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`) the read-only half and the leftover-session list and logoff (and `-compact-http`, `-compact-sse`, each with its `-ro`, the same without the leftover-session tools)

## How it works

One tool per OPERATION, with the object in `object_type`: `HandlerCreate` with
`object_type: "CLASS"` rather than a `CreateClass` tool. 37 schemas instead of
the object-oriented surface's hundreds, for a host that cannot select tools
per request.

## Tools

### HandlerGet

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Read operation. part selects the aspect: source (default), metadata, urls, or contents (the objects of a PACKAGE); a part the type does not offer is refused, naming the ones it does. Three parts read the repository by ADT address and take no object_type: object_structure(object_adt_type*, object_name*), node_structure(object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders(object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Otherwise object_type required: PACKAGE(package_name*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*), TRANSPORT(transport_number*). TRANSPORT answers the objects the transport request or task holds, each with the position HandlerTransportMoveObjects takes. timeout applies to the reads only: UNIT_TEST and CDS_UNIT_TEST take none. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `object_type` — ABAP object type for routed compact operation.
- `part` — Which aspect to read: the source, the ADT metadata document, the service and preview URLs, or the objects a package contains. A part this object type does not offer is refused, naming the parts it does. Three parts read the repository by ADT address and take no object_type: object_structure (object_adt_type*, object_name*), node_structure (object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders (object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions).
- `package_name` — Package name.
- `max_results` — Maximum number of members listed (part contents).
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
- `transport_number` — Transport request or task number (TRANSPORT). A request lists the entries of all its tasks; a task lists its own.
- `run_id` — Unit test run id.
- `response_format` — Response format for SERVICE_BINDING reads.
- `version` — Object version to read/check.
- `object_adt_type` — ADT type code of the object (object_structure) or of the parent node (node_structure).
- `object_name` — Object name (object_structure) or parent name (node_structure).
- `node_id` — Node id to expand (node_structure); the root when absent.
- `with_short_descriptions` — Include short descriptions (node_structure).
- `object_search_pattern` — Object name pattern (virtual_folders).
- `preselection` — Facet preselections (virtual_folders).
- `facet_order` — Facet order (virtual_folders).
- `with_versions` — Include versions (virtual_folders).
- `ignore_short_descriptions` — Leave out short descriptions (virtual_folders).

### HandlerSearch

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Search ABAP repository objects by name or mask. Required: query*. Optional: object_type, max_results (default 100). Response: one object per line. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `query` (required) — Object name or mask, with * as a wildcard.
- `object_type` — ADT object type to restrict the search to.
- `max_results` — Maximum number of objects returned.

### HandlerWhereUsed

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Where-used list of an ABAP object: the objects that use, call or reference it, with type and package. Required: object_type*, object_name*. Optional: function_group_name (FUNCTION_MODULE), max_results (default 100). Response: JSON. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `object_type` (required) — Type of the object whose usages are listed.
- `object_name` (required) — Object name.
- `function_group_name` — Function group of the function module (FUNCTION_MODULE).
- `max_results` — Maximum number of referencing objects returned.

### HandlerGetData

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Read rows of a table or CDS view: every column of object_name, or what sql_query selects with its columns, conditions and order. Required: object_name or sql_query. Optional: max_rows (default 100). Response: JSON. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `object_name` — Table or CDS view whose rows are read, all columns. Used when sql_query is absent.
- `sql_query` — ABAP SQL SELECT naming the columns, conditions and order to read.
- `max_rows` — Maximum number of rows returned.

### HandlerValidate

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Validate before create only. object_type required: CLASS(object_name*, superclass), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*, super_package), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type to validate before create. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.
- `object_name` (required) — Required object name. For SERVICE_BINDING this is the service binding name; a function module is named GROUP|MODULE.
- `package_name` — Optional package context for validation (especially for create scenarios).
- `super_package` — Super package of the package to validate (PACKAGE).
- `superclass` — Superclass of the class to validate (CLASS).
- `description` — Optional object description used during validation.
- `behavior_definition` — Optional behavior definition name, used when validating behavior implementation.
- `root_entity` — Optional CDS root entity name, used for behavior-related validation.
- `implementation_type` — Optional implementation type, used for behavior implementation validation.
- `service_definition_name` — Required when object_type=SERVICE_BINDING. Service definition paired with the binding.
- `service_binding_version` — Optional service binding version for SERVICE_BINDING.

### HandlerCheckRun

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** CheckRun operation (syntax, no activation). object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), METADATA_EXTENSION(object_name*). source_code checks source that is not saved, for CLASS, STRUCTURE and DDL.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, METADATA_EXTENSION.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `version` — Version to syntax-check.
- `source_code` — Source to check instead of the saved one; nothing is saved. CLASS, STRUCTURE and DDL only.

### HandlerUnitTestStatus

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** ABAP Unit test run status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_long_polling` — Use long polling while waiting for completion.

### HandlerUnitTestResult

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** ABAP Unit test run result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_navigation_uris` — Include ADT navigation URIs in the result payload.
- `format` — Result format.

### HandlerCdsUnitTestStatus

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** CDS unit test run status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_long_polling` — Use long polling while waiting for completion.

### HandlerCdsUnitTestResult

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** CDS unit test run result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_navigation_uris` — Include ADT navigation URIs in the result payload.
- `format` — Result format.

### HandlerProfileList

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Runtime profiling list. object_type: not used. Required: none. Response: JSON.

**Available in:** cloud, onprem

**Parameters:** none

### HandlerProfileView

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Runtime profiling view. object_type: not used. Required: trace_id_or_uri*, view*(hitlist|statements|db_accesses). Optional: mode(raw|analyze, default raw), top(analyze only), with_system_events, id, with_details, auto_drill_down_threshold. Response: JSON. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `trace_id_or_uri` (required) — Profiler trace id or URI.
- `view` (required) — Profiler trace view kind.
- `mode` — "raw" returns the parsed trace payload as-is (default). "analyze" returns a compact summary instead — totals plus the top-ranked entries — via the same trace view.
- `top` — Number of top-ranked rows to include when mode is "analyze". Default 10. Ignored for mode "raw".
- `with_system_events` — Include system events in analysis.
- `id` — Optional statement/access id.
- `with_details` — Include detailed payload.
- `auto_drill_down_threshold` — Auto drill-down threshold.

### HandlerDumpList

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Runtime feed list, newest first. object_type: not used. Optional: feed_type(dumps|system_messages|gateway_errors, default dumps), user, runtime_error, exception, object_name, package, component, top, from, to. Response: JSON; each dump carries dump_id, and next_to when more remain. Runs on an ABAP session of its own. Optional timeout (seconds) cancels the read when it passes — nothing is changed; set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `feed_type` — Which runtime feed to list. Default "dumps" (ABAP short dumps). "system_messages" and "gateway_errors" read the other two ADT runtime feeds through the same call.
- `user` — Entries of this user.
- `runtime_error` — Dumps whose runtime error contains this text, in any case.
- `exception` — Dumps whose exception class contains this text, in any case.
- `object_name` — Dumps whose terminated object name contains this text, in any case.
- `package` — Dumps whose object package contains this text, in any case.
- `component` — Dumps whose application component contains this text, in any case.
- `top` — Most entries, up to 1000 (default 50); SAP answers 100 per request and the pages are read in turn.
- `from` — Start of time range (YYYYMMDDHHMMSS).
- `to` — End of time range (YYYYMMDDHHMMSS); a previous next_to reads on.

### HandlerDumpView

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Runtime dump view. object_type: not used. Required: dump_id* (id or URI). Optional: view(default|summary|formatted). Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `dump_id` (required) — The dump's dump_id, or its URI.
- `view` — "summary" — runtime error, exception, terminated program, time, user and termination position; "default" — that summary and the parsed dump; "formatted" — the dump as formatted text.

### HandlerServiceBindingListTypes

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** Service binding types list. object_type: not used. Required: none. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.

**Available in:** cloud, onprem

**Parameters:**

- `response_format` — Response format for protocol types list.

### HandlerServiceBindingValidate

**Half:** `@mcp-abap-adt/compact-readonly-entries`

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

**Description:** Creates the object: sends the create request for the given type with the given parameters, and answers SAP's result. The object is created inactive. object_type required: PACKAGE(package_name*, super_package*), DOMAIN(domain_name*, package_name*), DATA_ELEMENT(data_element_name*, package_name*), TRANSPORT(description*), TABLE(table_name*, package_name*), STRUCTURE(structure_name*, package_name*), DDL(ddl_name*, package_name*), SERVICE_DEFINITION(service_definition_name*, package_name*), SERVICE_BINDING(service_binding_name*, service_definition_name*, package_name*), CLASS(class_name*, package_name*), PROGRAM(program_name*, package_name*) [onprem only], INTERFACE(interface_name*, package_name*), FUNCTION_GROUP(function_group_name*, package_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, package_name*), METADATA_EXTENSION(name*, package_name*). Optional for every type: description, transport_request.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `class_name` — ABAP class name (CLASS, BEHAVIOR_IMPLEMENTATION).
- `program_name` — ABAP program name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name (FUNCTION_GROUP; the group of a FUNCTION_MODULE).
- `package_name` — ABAP package name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `description` — Human-readable object description.
- `transport_request` — Transport request id (if required by system).
- `master_language` — Original language of the created object; the session language when absent.
- `super_package` — Super package (PACKAGE create).
- `package_type` — Package type (PACKAGE create).
- `software_component` — Software component (PACKAGE create).
- `transport_layer` — Transport layer (PACKAGE create).
- `record_changes` — Record changes (PACKAGE create).
- `application_component` — Application component (PACKAGE create).
- `transport_type` — Transport request type (TRANSPORT create).
- `target_system` — Target system of the transport request (TRANSPORT create).
- `owner` — Owner of the transport request (TRANSPORT create).
- `superclass` — Superclass name (CLASS create).
- `final` — Mark the class final (CLASS create).
- `create_protected` — Protected constructor (CLASS create).
- `program_type` — ABAP program type (PROGRAM create).
- `application` — Application area (PROGRAM create).
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `service_definition_name` — Service definition name (SERVICE_DEFINITION; the definition a SERVICE_BINDING binds).
- `service_binding_name` — Service binding name.
- `service_name` — Service name of the binding (SERVICE_BINDING create); the binding name when absent.
- `service_version` — Service version of the binding (SERVICE_BINDING create); 0001 when absent.
- `binding_variant` — Binding variant (SERVICE_BINDING create); ODATA_V4_UI when absent.
- `name` — Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `implementation_type` — Behavior definition implementation type.

### HandlerUpdate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Writes the object under its lock: sends the one write request of the given type under lock_handle, the lock handle of the object, and answers SAP's result. The write replaces the whole content with the one given. lock_handle and object_type required: PACKAGE(package_name*, source_code*, transport_request), DOMAIN(domain_name*, source_code*, transport_request), DATA_ELEMENT(data_element_name*, source_code*, transport_request), FUNCTION_GROUP(function_group_name*, source_code*, transport_request), TABLE(table_name*, ddl_code*, transport_request), STRUCTURE(structure_name*, ddl_code*, transport_request), DDL(ddl_name*, ddl_source*, transport_request), SERVICE_DEFINITION(service_definition_name*, source_code*, transport_request), CLASS(class_name*, source_code*, transport_request), LOCAL_TEST_CLASS(class_name*, test_class_code*, transport_request), LOCAL_TYPES(class_name*, local_types_code*, transport_request), LOCAL_DEFINITIONS(class_name*, definitions_code*, transport_request), LOCAL_MACROS(class_name*, macros_code*, transport_request), UNIT_TEST(class_name*, test_class_source*, transport_request), CDS_UNIT_TEST(class_name*, test_class_source*, transport_request), PROGRAM(program_name*, source_code*, transport_request) [onprem only], INTERFACE(interface_name*, source_code*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, source_code*, transport_request), BEHAVIOR_DEFINITION(name*, source_code*, transport_request), BEHAVIOR_IMPLEMENTATION(class_name*, implementation_code*, transport_request), METADATA_EXTENSION(name*, source_code*, transport_request), SERVICE_BINDING(service_binding_name*, desired_publication_state*, binding_variant*, service_name, service_version). For PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP, source_code is the whole metadata document, sent as given. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST and BEHAVIOR_IMPLEMENTATION, lock_handle is the class's lock handle. For SERVICE_BINDING the write is its publication request, sent under the lock_handle given, an empty one included; service_name and service_version (default 0001) name the service of an OData V2 binding. transport_request is sent as the write's corrNr. Over Streamable HTTP the request carries the lock's state_handle in the x-mcp-state-handle header: the write is sent only under a lock the instance it reaches holds.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `lock_handle` (required) — The lock handle of the object (for a class include, of the class): the write is sent under it.
- `transport_request` — Transport request id, sent as the write's corrNr (the types whose description names it).
- `class_name` — ABAP class name.
- `program_name` — ABAP program name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name.
- `package_name` — ABAP package name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `source_code` — The content written: the source, or for PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP the whole metadata document.
- `ddl_source` — Complete DDL source code (for DDL update).
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `service_name` — Published service name (SERVICE_BINDING, an OData V2 binding).
- `service_version` — Published service version (SERVICE_BINDING, an OData V2 binding). Default 0001.
- `name` — Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `ddl_code` — Complete DDL source code (for TABLE/STRUCTURE update).
- `implementation_code` — Behavior implementation methods source code.
- `test_class_source` — ABAP source of the local test classes (UNIT_TEST and CDS_UNIT_TEST update).
- `test_class_code` — Updated source for the local test class.
- `local_types_code` — Updated source for class local types.
- `definitions_code` — Updated source for class local definitions.
- `macros_code` — Updated source for class local macros.
- `binding_variant` — Service binding variant (service binding update).
- `desired_publication_state` — Target publication state (service binding update).

### HandlerDelete

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Delete operation. object_type required: PACKAGE(package_name*; force_new_connection deletes from a new connection), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(class_name*), CDS_UNIT_TEST(class_name*).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `package_name` — ABAP package name.
- `force_new_connection` — PACKAGE: delete from a new connection, closed afterwards — for a package saved earlier through this connection.
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

### HandlerTransportSortAndCompress

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Transport task sort and compress: sorts a task's object list and merges its duplicate entries. object_type: not used. Required: transport_number* (a task). A task holding the same entry twice refuses removing an entry until this has run. Response: JSON — acceptance only; a re-read of the task's objects with HandlerGet (object_type TRANSPORT) confirms it.

**Available in:** cloud, onprem

**Parameters:**

- `transport_number` (required) — Number of the transport task to sort and compress.

### HandlerTransportMoveObjects

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Transport move objects: moves object entries from one task to another. Top-level object_type: not used. Required: transport_number* (the source task), target_number* (the target task), objects* (at least one: object_name*, object_type*, position* in the source task's object list, pgmid). The positions come from HandlerGet with object_type TRANSPORT on the source task. Response: JSON — acceptance only; a re-read of both tasks with HandlerGet (object_type TRANSPORT) confirms it.

**Available in:** cloud, onprem

**Parameters:**

- `transport_number` (required) — Number of the transport task that holds the entries.
- `target_number` (required) — Number of the transport task the entries move to.
- `objects` (required) — The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.

### HandlerLock

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Lock operation. object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_DEFINITION(object_name*), SERVICE_BINDING(object_name*). Answers the lock_handle; a SERVICE_BINDING open in an editing session answers an empty one, under which its publication runs. Over Streamable HTTP the answer also carries the state_handle of the instance that holds the lock: the write and the unlock under this lock send it in the x-mcp-state-handle header.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `super_package` — Super package context when relevant.

### HandlerUnlock

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Unlock operation. object_type required: CLASS(object_name*, lock_handle*), PROGRAM(object_name*, lock_handle*) [onprem only], INTERFACE(object_name*, lock_handle*), FUNCTION_GROUP(object_name*, lock_handle*), FUNCTION_MODULE(object_name*, lock_handle*), TABLE(object_name*, lock_handle*), STRUCTURE(object_name*, lock_handle*), DDL(object_name*, lock_handle*), DOMAIN(object_name*, lock_handle*), DATA_ELEMENT(object_name*, lock_handle*), PACKAGE(object_name*, lock_handle*), BEHAVIOR_DEFINITION(object_name*, lock_handle*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*), METADATA_EXTENSION(object_name*, lock_handle*), SERVICE_DEFINITION(object_name*, lock_handle*), SERVICE_BINDING(object_name*, lock_handle*); an empty lock_handle of a SERVICE_BINDING answers that there is nothing to unlock. Over Streamable HTTP the request carries the lock's state_handle in the x-mcp-state-handle header; the unlock ends the instance's hold on the lock.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `lock_handle` (required) — Lock handle returned by lock.

### HandlerUnitTestRun

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** ABAP Unit test run. object_type: not used. Required: tests[]{container_class*, test_class*}. Optional: title, context, scope, risk_level, duration. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `tests` (required) — List of test classes to run.
- `title` — Run title shown in ABAP Unit test logs.
- `context` — Run context label.
- `scope` — ABAP Unit test scope flags.
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
- `background` — When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end.
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

### HandlerDebugStart

**Half:** debugger verbs of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** Debugger start. kind: abap (line, exception, statement or message breakpoints) or amdp (lines in SQLScript methods). Arms the breakpoints, listens (abap) or opens an AMDP session, and optionally runs a class or report in the background. request_user, debugging_mode and settings apply to abap only. take_over: abap — Displaces another debugger listening for the same user; amdp — ends an AMDP session of this user left behind. Without take_over, abap is refused before anything is placed while another debugger listens for that user. abap: in user mode it catches every request of the request user (the connected SAP user unless another is named), not only programs run by this server. abap: the breakpoints are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change replaces that set as a whole. amdp: catches every request of the connected SAP user, not only programs run by this server.

**Available in:** cloud, onprem

**Parameters:**

- `kind` (required) — abap debugs ABAP code; amdp debugs SQLScript methods of a class.
- `breakpoints` (required) — abap: a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition. amdp: object_name (the class) and line of each.
- `take_over` — abap: takes over from another debugger listening for this user instead of refusing; the breakpoints of this SAP user (in user mode, for the same request user) are replaced. amdp: ends an AMDP session of this user left behind instead of refusing.
- `request_user` — User mode: the SAP user whose requests are caught; the connected user when omitted. Debugging another user's requests needs the debug authorization for that user. Not taken in terminal mode.
- `debugging_mode` — user (when omitted) catches the requests of the request user; terminal catches the requests that carry this debug session's ids and needs no configuration: the run it starts carries them, so without run it catches only requests carrying the same ids.
- `settings` — Debugger settings, applied after each attach; a field left out keeps its value.
- `run` — A class (as a console application) or a report started in the background once listening; its outcome is reported as the end of the session.
- `detail` — How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

### HandlerDebugWait

**Half:** debugger verbs of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** State of a debug session after waiting up to hold_seconds; for AMDP, its events.

**Available in:** cloud, onprem

**Parameters:**

- `state_handle` (required) — Opaque handle identifying the server-held state this operation works on.
- `hold_seconds` — Longest wait for a change, at most 30 seconds.
- `detail` — How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

### HandlerDebugView

**Half:** debugger verbs of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** The stopped debuggee: stack, variables (by name, or the scopes), memory, or an AMDP table variable's rows.

**Available in:** cloud, onprem

**Parameters:**

- `state_handle` (required) — Opaque handle identifying the server-held state this operation works on.
- `what` (required) — stack, variables and memory read an ABAP stop; table reads an AMDP stop.
- `names` — variables: names to read, a path reads a component or a table row; the scopes when omitted. table: the table variable, first entry.
- `detail` — How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

### HandlerDebugStep

**Half:** debugger verbs of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** Moves the stopped debuggee (into, over, return, continue, run or jump to a line), leaves it running (detach, release_debugger), ends it where it stands, or ends the debug session.

**Available in:** cloud, onprem

**Parameters:**

- `state_handle` (required) — Opaque handle identifying the server-held state this operation works on.
- `action` (required) — into enters the call, over runs it, return leaves the current one, continue runs to the next stop; run_to_line executes up to the line, jump_to_line moves there without executing what lies between; detach lets the program run on, the listener and the breakpoints kept; release_debugger frees the debugger and the program runs on; terminate ends the debuggee where it stands; stop ends the debug session. For AMDP only over, continue, terminate and stop apply.
- `object_type` — For a line: CLAS, PROG, INCL or FUNC.
- `object_name` — For a line: the object holding it.
- `line` — For a line: the line in the object source.
- `include` — For a class: definitions, implementations, macros or testclasses; the main source when omitted.
- `parent_name` — For a function module: its function group.
- `detail` — How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

### HandlerBackgroundRunGet

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** Reads one of your background runs by its run_handle: running, or finished with what HandlerProfileRun answered (the system answer as it is, an error included). Reading does not remove it.

**Available in:** all

**Parameters:**

- `run_handle` (required) — The run_handle a run started with background=true answered.

### HandlerBackgroundRunList

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** Lists your background runs: run_handle, tool, object, when it started, and running or finished. No output.

**Available in:** all

**Parameters:** none

### HandlerBackgroundRunDiscard

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** Removes the kept answer of one of your finished background runs. A run still running cannot be discarded: a started run cannot be stopped.

**Available in:** all

**Parameters:**

- `run_handle` (required) — The run_handle a run started with background=true answered.

### HandlerLeftoverSessionList

**Half:** leftover-session tools of `@mcp-abap-adt/lib`, stdio binaries only (the list and the logoff in both)

**Description:** Lists the SAP sessions of this server's destination an ended server process left open (it was killed before logging them off): handle, role (built or debugger), destination, user, when recorded. Nothing is sent to SAP. Sessions of a running process are not listed. A server starting while exactly one built session of its destination is left is born on it; with several, none is taken.

**Available in:** all

**Parameters:** none

### HandlerLeftoverSessionLogoff

**Half:** leftover-session tools of `@mcp-abap-adt/lib`, stdio binaries only (the list and the logoff in both)

**Description:** Logs off a leftover SAP session (any role), releasing every lock it holds; only the logoff is sent, with no credential. Its record is deleted afterwards.

**Available in:** all

**Parameters:**

- `handle` (required) — The handle of a leftover session, as the list answers it.

### HandlerBatch

**Half:** batch mode of `@mcp-abap-adt/lib`, in every compact binary

**Description:** action 'begin': Switches this server into batch mode: from now on each call of a tool none of whose requests depends on another's answer is recorded instead of sent, and returns nothing. Every recorded call is numbered, in the order made, from 1. A tool that builds a request from an earlier answer is refused in batch mode; use the low-level tools (HandlerCreate, HandlerLock, HandlerUpdate with lock_handle, HandlerUnlock, HandlerGet) and run each phase as its own batch. action 'end' sends the recorded calls; read their answers by number with action 'answers'. Over HTTP, send the state_handle this answers in the request header on every call of the batch. action 'end': Sends every call recorded since action 'begin', in one envelope, with the credentials in force now, and leaves batch mode whatever happens; nothing is sent twice. Answers how many calls were recorded and which numbers failed; read each answer with action 'answers'. action 'answers' (with number or numbers): The answers of the last batch, by number: each is the answer the tool gives for that call, built when action 'end' sent it — SAP's answer or why it was not sent. A number the last batch does not have answers: no answer with that number.

**Available in:** all

**Parameters:**

- `action` (required) — begin: switch into batch mode; end: send the recorded calls and leave batch mode; answers: read the last batch's answers by number (with number or numbers).
- `number` — answers only: one batch number to read (an integer of at least 1); give this or numbers, not both.
- `numbers` — answers only: several batch numbers to read, answered in the order given; give this or number, not both.

