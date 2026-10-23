# Compact Tools — MCP ABAP ADT

Generated from the built packages, not from source text: these are the tool
definitions a client receives.

- Tools: 40
- Read-only half: `@mcp-abap-adt/compact-readonly-entries`
- Modifying half: `@mcp-abap-adt/compact-modify`
- Debugger verbs: `@mcp-abap-adt/compact`, served by the write binaries always, by no `-ro` binary
- Leftover-session tools: `@mcp-abap-adt/lib`, on stdio only (`mcp-abap-adt-compact`, `mcp-abap-adt-compact-ro`): the list and the logoff in both; no `-compact-http` or `-compact-sse` binary serves them
- Background-run tools: `@mcp-abap-adt/lib`, in the write binaries (where `HandlerProfileRun` is)
- Batch mode: `HandlerBatch` of `@mcp-abap-adt/lib`, in every compact binary, on every transport. Every other tool's description, as the server lists it, ends with one sentence saying how a call of it behaves in batch mode: recordable, recordable for the arguments it names, or run outside batch mode; the descriptions on this page are the tools' own, without it ([Batch Mode](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/BATCH_MODE.md))
- Commands: `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`) serves every tool under Tools; `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`) the read-only half and the leftover-session list and logoff. `-compact-sse` and `-compact-sse-ro` serve the same without the leftover-session tools; `-compact-http` and `-compact-http-ro` the same, with what [Streamable HTTP Binaries](#streamable-http-binaries) adds

## How it works

One tool per OPERATION, with the object in `object_type`: `HandlerCreate` with
`object_type: "CLASS"` rather than a `CreateClass` tool. 40 schemas instead of
the object-oriented surface's hundreds, for a host that cannot select tools
per request.

## Tools

### HandlerGet

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads one part of the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …). part selects it: source (default) the source alone, in one request; metadata the ADT metadata document alone, in one request; urls (SERVICE_BINDING) the service URL, its $metadata and the browser preview, contents (PACKAGE) the objects the package holds, its walk read level by level in ADT batch envelopes; package_names lists several packages, read together, one entry per package in the order given. A source document answers { part: 'source', source } and a metadata document { part: 'metadata', metadata }, beside the object's name. Parts per type: PACKAGE metadata, contents; DOMAIN, DATA_ELEMENT, FUNCTION_GROUP metadata; LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, TRANSPORT, UNIT_TEST, CDS_UNIT_TEST source; SERVICE_BINDING source, metadata, urls; every other type source, metadata. A part outside the type's list is answered with that list. Three parts read the repository by ADT address: object_structure(object_adt_type*, object_name*), node_structure(object_adt_type*, object_name*, node_id, with_short_descriptions; one node level; a package's blank answer is the empty listing with blank stating its two readings: an empty package, or an unknown package name) and virtual_folders(object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by its id, in one request each: activation_status(run_id*) answers { run_id, part, status, document }, the run's status (finished, error, failed, or its progress while it runs) and its status document as SAP answered it; activation_results(run_id*) answers { run_id, part, messages, document }, the messages the run produced and its results document as SAP answered it. Otherwise object_type required: PACKAGE(package_name*; part contents: package_name* or package_names*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*) [onprem only], INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name* as GROUP|MODULE, or function_module_name* with function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*), TRANSPORT(transport_number*). TRANSPORT answers the objects a task holds, each with its position in the task's object list; for a request, every task's entries, each once, with its task number and position. UNIT_TEST and CDS_UNIT_TEST read the run's result in one request and answer { success, run_id, run_result }, run_result the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP. Applies to the repository reads: object_type PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, TRANSPORT, and the parts object_structure, node_structure, virtual_folders.
- `object_type` — ABAP object type for routed compact operation.
- `part` — The part to read: source (the source alone), metadata (the ADT metadata document alone), urls (the service and preview URLs), contents (the objects a package holds); each object type answers the parts it has, and a part outside them is answered with the list of its parts. Three parts read the repository by ADT address: object_structure (object_adt_type*, object_name*), node_structure (object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders (object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by run_id*: activation_status (its status) and activation_results (the messages it produced).
- `package_name` — Package name.
- `package_names` — Several package names (part contents), read together: one entry per package, in the order given, each { package_name, contents } or { package_name, error }.
- `max_results` — Maximum number of members listed per package (part contents).
- `include_descriptions` — Include each member's description (part contents). The walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes.
- `class_name` — Class name.
- `interface_name` — Interface name.
- `program_name` — Program name.
- `domain_name` — Domain name.
- `data_element_name` — Data element name.
- `table_name` — Table name.
- `structure_name` — Structure name.
- `ddl_name` — DDL source name.
- `function_module_name` — Function module name: GROUP|MODULE, its function group first, or the module alone with function_group_name.
- `function_group_name` — Function group name (FUNCTION_GROUP; FUNCTION_MODULE given as the module's name).
- `behavior_definition_name` — Behavior definition name.
- `behavior_implementation_name` — Behavior implementation name.
- `metadata_extension_name` — Metadata extension name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `transport_number` — Transport request or task number (TRANSPORT). A request lists the entries of all its tasks; a task lists its own.
- `run_id` — Run id: a unit test run (UNIT_TEST, CDS_UNIT_TEST) or an activation run (parts activation_status, activation_results).
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

**Description:** [read-only] Searches the ABAP repository for the objects whose name matches query, a name or a mask. Required: query*. Optional: object_type, max_results (default 100). Response: one object per line. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `query` (required) — Object name or mask, with * as a wildcard.
- `object_type` — ADT object type to restrict the search to.
- `max_results` — Maximum number of objects returned.

### HandlerWhereUsed

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Lists where the object named by object_type and object_name is used — a class, interface, program, include, function group, function module (BAPI included), package, table, structure, domain, data element or CDS DDL source: the objects that use, call or reference it, with type and package. Required: object_type*, object_name*. Optional: function_group_name (FUNCTION_MODULE), max_results (default 100). Response: JSON. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `object_type` (required) — Type of the object whose usages are listed.
- `object_name` (required) — Object name.
- `function_group_name` — Function group of the function module (FUNCTION_MODULE).
- `max_results` — Maximum number of referencing objects returned.

### HandlerGetData

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the rows of the table or CDS view named by object_name, or the rows sql_query selects: every column of object_name, or what sql_query selects with its columns, conditions and order. Required: object_name or sql_query. Optional: max_rows (default 100). Response: JSON. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

**Available in:** cloud, onprem

**Parameters:**

- `timeout` — Seconds to wait for the answer: a whole number, at least 1, no default — without it the call waits until SAP answers. When it passes, the read is cancelled (its ABAP session is logged off) and the call answers that nothing was changed. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a cancel does nothing to SAP.
- `object_name` — Table or CDS view whose rows are read, all columns. Used when sql_query is absent.
- `sql_query` — ABAP SQL SELECT naming the columns, conditions and order to read.
- `max_rows` — Maximum number of rows returned.

### HandlerValidate

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Validates a new object named by object_type and object_name before it is created. object_type required: CLASS(object_name*, superclass), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*, super_package), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*).

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

**Description:** [read-only] Runs a syntax check on the object named by object_type and object_name. object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), METADATA_EXTENSION(object_name*). source_code checks unsaved source given in the call, for CLASS, STRUCTURE and DDL.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, METADATA_EXTENSION.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `version` — Version to syntax-check.
- `source_code` — Source to check instead of the saved one; nothing is saved. CLASS, STRUCTURE and DDL only.

### HandlerDeletionCheck

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Asks SAP whether the object named by object_type and object_name can be deleted: sends the deletion check request for its type, and answers SAP's verdict as it came: deletable true with the object and SAP's message when it carries one, or SAP's refusal with its words. object_type and object_name required: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST (its test class), PROGRAM [onprem only], INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE (object_name GROUP|MODULE), BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.

### HandlerUnitTestStatus

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the status of the ABAP Unit test run named by run_id. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_long_polling` — Use long polling while waiting for completion.

### HandlerUnitTestResult

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the result of the ABAP Unit test run named by run_id*, in one request (GET /sap/bc/adt/abapunit/results/{run_id}), and answers { success, run_id, run_result }: run_result is the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. Optional: with_navigation_uris, format (abapunit or junit).

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_navigation_uris` — Include ADT navigation URIs in the result payload.
- `format` — Result format.

### HandlerCdsUnitTestStatus

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the status of the CDS unit test run named by run_id. Required: run_id*. Optional: with_long_polling. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_long_polling` — Use long polling while waiting for completion.

### HandlerCdsUnitTestResult

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the result of the CDS unit test run named by run_id*, in one request (GET /sap/bc/adt/abapunit/results/{run_id}), and answers { success, run_id, run_result }: run_result is the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. Optional: with_navigation_uris, format (abapunit or junit).

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_navigation_uris` — Include ADT navigation URIs in the result payload.
- `format` — Result format.

### HandlerProfileList

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Lists the ABAP profiler trace files. Response: JSON.

**Available in:** cloud, onprem

**Parameters:** none

### HandlerProfileView

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the ABAP profiler trace named by trace_id_or_uri in the view given (hit list, statements or database accesses), raw or analysed. Required: trace_id_or_uri*, view*(hitlist|statements|db_accesses). Optional: mode(raw|analyze, default raw), top(analyze only), with_system_events, id, with_details, auto_drill_down_threshold. Response: JSON. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

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

**Description:** [read-only] Reads one page of the runtime feed named by feed_type in one request, newest first: the ABAP short dumps (runtime errors) of the user, object_name or time range from–to given, or system messages or SAP Gateway errors. Optional: feed_type(dumps|system_messages|gateway_errors, default dumps), user, runtime_error, exception, object_name, package, component, top (1 to 100), from, to. Response: JSON { feed_type, count, entries, next_to }; each dump carries dump_id; next_to is the `to` of SAP's next link, present when more remain. The next link's page starts at the boundary second, inclusive: entries of that second may repeat; match them by dump_id. Runs on an ABAP session of its own. Optional timeout (seconds): when it passes, the read is cancelled, its ABAP session logged off, and the system stays as it was. Set it below your MCP client's request limit — the TypeScript SDK's client cancels at 60 s; a client's cancel ends only the client's wait, and SAP runs the read on.

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
- `top` — Entries the page holds, 1 to 100 (SAP answers 100 when top is absent).
- `from` — Start of time range (YYYYMMDDHHMMSS).
- `to` — End of time range (YYYYMMDDHHMMSS), inclusive: the page holds the entries up to that second; a previous answer's next_to is the next page's to, and that page starts at the boundary second, inclusive.

### HandlerDumpView

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the ABAP short dump (runtime error) named by dump_id in the view given. Required: dump_id* (id or URI). Optional: view(default|summary|formatted). Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `dump_id` (required) — The dump's dump_id, or its URI.
- `view` — "summary" — runtime error, exception, terminated program, time, user and termination position; "default" — that summary and the parsed dump; "formatted" — the dump as formatted text.

### HandlerServiceBindingListTypes

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Lists the available service binding types. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.

**Available in:** cloud, onprem

**Parameters:**

- `response_format` — Response format for protocol types list.

### HandlerServiceBindingValidate

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Validates a new service binding named by service_binding_name for the service definition named by service_definition_name, before it is created. Required: service_binding_name*, service_definition_name*. Optional: service_binding_version, package_name, description. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `service_binding_name` (required) — Service binding name to validate.
- `service_definition_name` (required) — Service definition name to pair with binding.
- `service_binding_version` — Service binding version.
- `package_name` — Target package name.
- `description` — Binding description.

### HandlerCreate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Creates the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …): sends the create request for its type with the given parameters, and answers SAP's result. The object is created inactive. object_type required: PACKAGE(package_name*, super_package*), DOMAIN(domain_name*, package_name*), DATA_ELEMENT(data_element_name*, package_name*), TRANSPORT(description*), TABLE(table_name*, package_name*), STRUCTURE(structure_name*, package_name*), DDL(ddl_name*, package_name*), SERVICE_DEFINITION(service_definition_name*, package_name*), SERVICE_BINDING(service_binding_name*, service_definition_name*, package_name*), CLASS(class_name*, package_name*), PROGRAM(program_name*, package_name*) [onprem only], INTERFACE(interface_name*, package_name*), FUNCTION_GROUP(function_group_name*, package_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, package_name*), METADATA_EXTENSION(name*, package_name*). Optional for every type: description, transport_request.

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

**Description:** Writes the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …) under its lock: sends the one write request of its type under lock_handle, the lock handle of the object, and answers SAP's result. The write sets the whole content to the one given. lock_handle and object_type required: PACKAGE(package_name*, source_code*, transport_request), DOMAIN(domain_name*, source_code*, transport_request), DATA_ELEMENT(data_element_name*, source_code*, transport_request), FUNCTION_GROUP(function_group_name*, source_code*, transport_request), TABLE(table_name*, ddl_code*, transport_request), STRUCTURE(structure_name*, ddl_code*, transport_request), DDL(ddl_name*, ddl_source*, transport_request), SERVICE_DEFINITION(service_definition_name*, source_code*, transport_request), CLASS(class_name*, source_code*, transport_request), LOCAL_TEST_CLASS(class_name*, test_class_code*, transport_request), LOCAL_TYPES(class_name*, local_types_code*, transport_request), LOCAL_DEFINITIONS(class_name*, definitions_code*, transport_request), LOCAL_MACROS(class_name*, macros_code*, transport_request), UNIT_TEST(class_name*, test_class_source*, transport_request), CDS_UNIT_TEST(class_name*, test_class_source*, transport_request), PROGRAM(program_name*, source_code*, transport_request) [onprem only], INTERFACE(interface_name*, source_code*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, source_code*, transport_request), BEHAVIOR_DEFINITION(name*, source_code*, transport_request), BEHAVIOR_IMPLEMENTATION(class_name*, implementation_code*, transport_request), METADATA_EXTENSION(name*, source_code*, transport_request), SERVICE_BINDING(service_binding_name*, desired_publication_state*, binding_variant*, service_name, service_version). For PACKAGE, DOMAIN, DATA_ELEMENT and FUNCTION_GROUP, source_code is the whole metadata document, sent as given. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST and BEHAVIOR_IMPLEMENTATION, lock_handle is the class's lock handle. For SERVICE_BINDING the write is its publication request, sent under the lock_handle given, an empty one included; service_name and service_version (default 0001) name the service of an OData V2 binding. transport_request is sent as the write's corrNr. Over Streamable HTTP the write takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); the write is sent only under a lock the instance it reaches holds.

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

**Description:** Deletes the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …): sends the deletion request for its type, and answers SAP's result. object_type required: PACKAGE(package_name*, transport_request), DOMAIN(domain_name*, transport_request), DATA_ELEMENT(data_element_name*, transport_request), TABLE(table_name*, transport_request), STRUCTURE(structure_name*, transport_request), DDL(ddl_name*, transport_request), SERVICE_DEFINITION(service_definition_name*, transport_request), SERVICE_BINDING(service_binding_name*, transport_request), CLASS(class_name*, transport_request), CDS_UNIT_TEST(class_name*, transport_request), PROGRAM(program_name*, transport_request) [onprem only], INTERFACE(interface_name*, transport_request), FUNCTION_GROUP(function_group_name*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, transport_request), BEHAVIOR_DEFINITION(behavior_definition_name*, transport_request), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*, transport_request), METADATA_EXTENSION(metadata_extension_name*, transport_request), LOCAL_TEST_CLASS(class_name*, lock_handle*, transport_request), LOCAL_TYPES(class_name*, lock_handle*, transport_request), LOCAL_DEFINITIONS(class_name*, lock_handle*, transport_request), LOCAL_MACROS(class_name*, lock_handle*, transport_request), UNIT_TEST(class_name*, lock_handle*, transport_request). CDS_UNIT_TEST deletes its test class. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS and LOCAL_MACROS (the class's local includes) and UNIT_TEST (its test classes include) the include is written empty under lock_handle, the class's lock handle. transport_request is sent with the request. Over Streamable HTTP an include write takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); it is sent only under a lock the instance it reaches holds.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST.
- `lock_handle` — The lock handle of the class (LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST): the include is written empty under it.
- `package_name` — ABAP package name.
- `class_name` — ABAP class name.
- `program_name` — ABAP program name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `transport_request` — Transport request id, sent with the deletion (or the include write).
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

**Description:** Activates the object named by object_name and object_type (or object_adt_type), or the objects named by objects, in one request. Single form (object_name*, object_type or object_adt_type*): object_type is enough for CLASS, PROGRAM [onprem only], INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, METADATA_EXTENSION, PACKAGE, SERVICE_DEFINITION and SERVICE_BINDING; any other type takes object_adt_type (e.g. "CLAS/OC"). List form (objects[].name*, objects[].type*, objects[].parentName, objects[].uri); a function module is listed with objects[].parentName set to its function group, type FUGR/FF. One object of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION or METADATA_EXTENSION (by object_type or its ADT type code) is activated directly and answers the activation verdict. Every other call starts an activation run and answers { run_id }: the id of the accepted run, whose status and messages are read by that id.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` — ABAP object type for routed compact operation. Names the object's type in the single form.
- `object_name` — Object name (single form).
- `object_adt_type` — ADT object type code (e.g. CLAS/OC, PROG/P) of the object (single form).
- `objects` — The objects activated together (list form).
- `preaudit` — Run pre-audit checks before activation.

### HandlerTransportCreate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Transport create. Required: description*. Optional: transport_type(workbench|customizing), target_system, owner. Response: JSON.

**Available in:** cloud, onprem

**Parameters:**

- `transport_type` — Transport type.
- `description` (required) — Transport description.
- `target_system` — Target system id.
- `owner` — Transport owner user.

### HandlerTransportSortAndCompress

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Sorts the object list of the transport task named by transport_number and merges its duplicate entries. Required: transport_number* (a task). A task holding the same entry twice refuses removing an entry until this has run. Response: JSON — acceptance only; a re-read of the task's objects (object_type TRANSPORT) confirms it.

**Available in:** cloud, onprem

**Parameters:**

- `transport_number` (required) — Number of the transport task to sort and compress.

### HandlerTransportMoveObjects

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Moves the object entries named by objects from the transport task named by transport_number to the task named by target_number. Required: transport_number* (the source task), target_number* (the target task), objects* (at least one: object_name*, object_type*, position* in the source task's object list, pgmid). The positions come from a read of the source task's objects (object_type TRANSPORT). Response: JSON — acceptance only; a re-read of both tasks' objects (object_type TRANSPORT) confirms it.

**Available in:** cloud, onprem

**Parameters:**

- `transport_number` (required) — Number of the transport task that holds the entries.
- `target_number` (required) — Number of the transport task the entries move to.
- `objects` (required) — The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.

### HandlerLock

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Lock operation. object_type required: CLASS(object_name*), PROGRAM(object_name*) [onprem only], INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_DEFINITION(object_name*), SERVICE_BINDING(object_name*). Answers the lock_handle; a SERVICE_BINDING open in an editing session answers an empty one, under which its publication runs. Over Streamable HTTP the answer also carries the state_handle of the instance that holds the lock: send it as the state_handle argument of every call under this lock, the write and the unlock (or in the x-mcp-state-handle header).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `super_package` — Super package context when relevant.

### HandlerUnlock

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Unlock operation. object_type required: CLASS(object_name*, lock_handle*), PROGRAM(object_name*, lock_handle*) [onprem only], INTERFACE(object_name*, lock_handle*), FUNCTION_GROUP(object_name*, lock_handle*), FUNCTION_MODULE(object_name*, lock_handle*), TABLE(object_name*, lock_handle*), STRUCTURE(object_name*, lock_handle*), DDL(object_name*, lock_handle*), DOMAIN(object_name*, lock_handle*), DATA_ELEMENT(object_name*, lock_handle*), PACKAGE(object_name*, lock_handle*), BEHAVIOR_DEFINITION(object_name*, lock_handle*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*), METADATA_EXTENSION(object_name*, lock_handle*), SERVICE_DEFINITION(object_name*, lock_handle*), SERVICE_BINDING(object_name*, lock_handle*); an empty lock_handle of a SERVICE_BINDING answers that the binding is already unlocked. Over Streamable HTTP the unlock takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); the unlock ends the instance's hold on the lock.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `lock_handle` (required) — Lock handle returned by lock.

### HandlerUnitTestRun

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** [read-only] ABAP Unit test run. Required: tests[]{container_class*, test_class*}. Optional: runner (async | sync, default async), title, context, scope, risk_level, duration. Response: JSON — runner async: { success, run_id }, the status and result read later by run_id, suited to long suites; runner sync: { success, runner, finished, run_result }, the finished result of every test class of each container_class in one request.

**Available in:** cloud, onprem

**Parameters:**

- `tests` (required) — List of test classes to run.
- `runner` — async (default): starts the run and returns its run_id, whose status and result are read by run_id; suited to long suites. sync: one request that runs every test class of each container_class and returns the finished result.
- `title` — Run title shown in ABAP Unit test logs; sent by the async runner.
- `context` — Run context label; sent by the async runner.
- `scope` — ABAP Unit test scope flags.
- `risk_level` — Allowed risk levels.
- `duration` — Allowed duration classes.

### HandlerProfileSchedule

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** [read-only] Schedules an ABAP profiler trace in one request. Optional: description, profiling flags (all_procedural_units, all_misc_abap_statements, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing). Response: JSON { success, profiler_id }, profiler_id the id of the scheduled trace.

**Available in:** cloud, onprem

**Parameters:**

- `description` — Profiler trace description.
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

### HandlerProfileRun

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** [read-only] Runs a class or a program in one request. Required: target_type*(CLASS|PROGRAM) + class_name* for CLASS or program_name* for PROGRAM [onprem only — programs exist on premise]. Optional: profiler_id (the profiler id of a scheduled trace; given, the run goes under that trace; absent, the run is plain), background. Response: JSON { success, class_name | program_name, output }, plus profile: { profiler_id } for a run under a trace.

**Available in:** cloud, onprem

**Parameters:**

- `target_type` (required) — Run target kind.
- `class_name` — Class to run.
- `program_name` — Program to run.
- `profiler_id` — The profiler id of a scheduled trace. Given, the run goes under that trace; absent, the run is plain.
- `background` — When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end.

### HandlerDebugBreakpoints

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [read-only] Debugger breakpoints and watchpoints: each call sends one SAP request, the operation's, and answers what SAP answered. kind abap: setBreakpoints sets the breakpoint set of this debugging identity to breakpoints and answers each row SAP placed or refused; syncBreakpoints rewrites the full set (sync_scope full) or the part of the objects in sync_objects (sync_scope partial); deleteBreakpoint deletes breakpoint_id; createWatchpoint, listWatchpoints and deleteWatchpoint work on the attached debuggee. In user mode the breakpoints catch every request of the request user; the set is one per SAP user and request user, shared by every IDE of that user, and each change rewrites it as a whole. kind amdp: syncBreakpoints rewrites the breakpoints of the running AMDP session and answers the request id; SAP confirms them in a SYNC_BREAKPOINTS event. The answer carries state_handle, and for abap the identity in force.

**Available in:** cloud, onprem

**Parameters:**

- `state_handle` — The handle of this server's debug state. abap setBreakpoints and syncBreakpoints open the debug state when it is omitted and answer its handle; every other operation takes it.
- `kind` (required) — abap works with the ABAP debugger; amdp with the AMDP debugger of SQLScript methods.
- `operation` (required) — The one request: abap setBreakpoints, syncBreakpoints, deleteBreakpoint, createWatchpoint, listWatchpoints or deleteWatchpoint; amdp syncBreakpoints.
- `breakpoints` — setBreakpoints and syncBreakpoints: abap a line, an exception class, an ABAP statement or a message, a line breakpoint may carry a condition; amdp object_name (the class) and line of each, an empty list clears them.
- `sync_scope` — abap syncBreakpoints: full replaces every breakpoint of the set; partial replaces those of the objects in sync_objects and takes line breakpoints.
- `sync_objects` — abap syncBreakpoints with sync_scope partial: the ADT URIs of the objects whose breakpoints are replaced.
- `breakpoint_id` — abap deleteBreakpoint: the id SAP gave the breakpoint.
- `variable_name` — abap createWatchpoint: the variable watched.
- `condition` — abap createWatchpoint: the ABAP condition the watchpoint stops on.
- `watchpoint_id` — abap deleteWatchpoint: the id SAP gave the watchpoint.
- `request_user` — abap, user mode: the SAP user whose requests the breakpoints and the listener catch; the connected SAP user when omitted. The first abap call of a debug state fixes it.
- `debugging_mode` — abap: user (when omitted) catches every request of the request user; terminal catches the requests that carry this debug state's terminal_id and ide_id. The first abap call of a debug state fixes it.
- `detail` — How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

### HandlerDebugSession

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [read-only] Debugger listener and session. Each operation up to end sends one SAP request, the operation's, and answers what SAP answered. kind abap: checkListener answers whether another debugger holds this identity's debugging (SAP's 409 names the holder); listen waits for a debuggee for exactly hold_seconds, SAP's hold, and answers the debuggee caught (debuggee_id, its server) or caught: false; a breakpoint stops a program while a listen is open; stopListener ends the listener and deletes the identity's breakpoints; attach attaches debuggee_id on the attaching session, which the first attach opens and every later attach, step and reading uses; detachDebugger sends detachDebugger on the attaching session, which releases the debuggee, and the program runs on; terminateDebuggee ends the debuggee where it stands and terminateDebugger frees the debugger; each answers SAP's answer as it came, which is a 500 when it succeeded, and the next answer shows the success (noSessionAttached, or the program's end); setDebuggerSettings sends the settings given at the attached debuggee. kind amdp: start opens an AMDP session for the connected SAP user and answers its main_id; getEvents answers the events SAP sends (breaks with their debuggee ids, breakpoint confirmations, ends); stop ends the AMDP session; deleteDebuggee cancels the execution of debuggee_id. end, for either kind, takes state_handle and logs off each connection the debug state opened, one logoff each: an attached debuggee runs on, an AMDP debug session ends, and the user's breakpoints stay set until stopListener removes them; the debug state and its handle end with it, and a new debug state of either kind and any identity opens after it. The answer carries state_handle while the debug state holds something, and for abap the identity in force.

**Available in:** cloud, onprem

**Parameters:**

- `state_handle` — The handle of this server's debug state. abap checkListener, listen, stopListener and attach, and amdp start, open the debug state when it is omitted and answer its handle; every other operation takes it.
- `kind` (required) — abap works with the ABAP debugger; amdp with the AMDP debugger of SQLScript methods.
- `operation` (required) — The one request: abap checkListener, listen, stopListener, attach, detachDebugger, terminateDebuggee, terminateDebugger or setDebuggerSettings; amdp start, getEvents, stop or deleteDebuggee. end, for either kind, logs off the debug state.
- `hold_seconds` — abap listen: how long SAP holds the listen, in seconds; SAP answers at a catch or when the hold ends.
- `take_over` — abap listen: true displaces another debugger listening for the same user; false, or omitted, answers its 409. amdp start: true ends an AMDP session of this user left behind.
- `debuggee_id` — abap attach: the debuggee_id listen answered. amdp deleteDebuggee: the debuggee id of a break event.
- `server` — abap attach: the debuggee's application server, as listen answered it.
- `settings` — abap setDebuggerSettings: the settings sent; a field left out keeps its value.
- `request_user` — abap, user mode: the SAP user whose requests the breakpoints and the listener catch; the connected SAP user when omitted. The first abap call of a debug state fixes it.
- `debugging_mode` — abap: user (when omitted) catches every request of the request user; terminal catches the requests that carry this debug state's terminal_id and ide_id. The first abap call of a debug state fixes it.
- `detail` — How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

### HandlerDebugStep

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [read-only] Moves the stopped debuggee: each call sends one SAP request, the operation's. kind abap, on the attached debuggee: stepInto, stepOver, stepReturn and stepContinue step from where it stands; stepRunToLine runs to the line object_type, object_name and line name, stepJumpToLine moves there and skips what lies between; a step answers SAP's step result, or ended when SAP reports the program's end, and the stopped position is read from the stack. setStackPosition makes frame position the one variables are read in. kind amdp: stepOver and stepContinue move debuggee_id and answer the request id; the next stop arrives as a break event.

**Available in:** cloud, onprem

**Parameters:**

- `state_handle` (required) — Opaque handle identifying the server-held state this operation works on.
- `kind` (required) — abap works with the ABAP debugger; amdp with the AMDP debugger of SQLScript methods.
- `operation` (required) — The one request: abap stepInto, stepOver, stepReturn, stepContinue, stepRunToLine, stepJumpToLine or setStackPosition; amdp stepOver or stepContinue.
- `object_type` — For a line: CLAS, PROG, INCL or FUNC.
- `object_name` — For a line: the object holding it.
- `line` — For a line: the line in the object source.
- `include` — For a class: definitions, implementations, macros or testclasses; the main source when omitted.
- `parent_name` — For a function module: its function group.
- `position` — abap setStackPosition: the frame's position in the stack.
- `debuggee_id` — amdp: the debuggee id of the break event.
- `detail` — How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

### HandlerDebugMaintain

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [read-only] Reads and changes the stopped debuggee: each call sends one SAP request, chosen by operation. kind abap, on the attached debuggee: getStack answers the frames, each with its program, include, line and ADT address, the stopped position on top; getVariables answers the variables in names (a path reads a component or a table row); getChildVariables answers the members of the ids in parents, the scopes (@ROOT) when parents is omitted; getMemorySizes answers the memory sizes; createMemorySnapshot creates a memory snapshot; setVariableValue sets variable_name to value and answers the variable. kind amdp: getDataPreview answers the rows of the table variable variable_name of debuggee_id.

**Available in:** cloud, onprem

**Parameters:**

- `state_handle` (required) — Opaque handle identifying the server-held state this operation works on.
- `kind` (required) — abap works with the ABAP debugger; amdp with the AMDP debugger of SQLScript methods.
- `operation` (required) — What the call does: abap getStack (the stack), getVariables (variables by name), getChildVariables (child variables), getMemorySizes (memory sizes), createMemorySnapshot (a snapshot) or setVariableValue (set a value); amdp getDataPreview (the data preview of a table variable).
- `names` — abap getVariables: the variables read.
- `parents` — abap getChildVariables: the ids whose members are read; @ROOT, the scopes, when omitted.
- `variable_name` — abap setVariableValue: the variable set. amdp getDataPreview: the table variable read.
- `value` — abap setVariableValue: the new value.
- `debuggee_id` — amdp getDataPreview: the debuggee id of the break event.
- `query` — amdp getDataPreview: a SELECT over the table variable; every column when omitted.
- `row_number` — amdp getDataPreview: how many rows SAP answers; SAP's own count when omitted.
- `detail` — How much of the answer to return: "terse" (default, the fields you need to act), "full" (the whole parse), "raw" (the document as ADT sent it).

### HandlerDebugBatch

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [read-only] action 'begin': Starts the debugger batch on the stopped ABAP debuggee, else at the AMDP break. In the debugger batch each call of step, step to line, stack, variables, child variables, stack position or setting a variable at the ABAP debuggee, and of step over, continue or the data preview of a table variable at the AMDP break, is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle: over Streamable HTTP send it as the state_handle argument of every call of the batch (or in the x-mcp-state-handle header). action 'end': Sends the recorded calls of the stopped debuggee in one envelope on the session the batch started on — the ABAP debuggee's session, or the AMDP session's command session — and ends the debugger batch. Splits SAP's answer into each call's parts and answers the number of recorded calls, of requests sent and of parts received; when sending fails, the parts received differ from the requests sent or the answer fails to split, answers that error, and every number of the batch then answers it. action 'answers' (with number or numbers): Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.

**Available in:** cloud, onprem

**Parameters:**

- `action` (required) — begin starts the debugger batch on the stopped ABAP debuggee or at the AMDP break; end sends the recorded calls and ends it; answers reads the last batch's answers by number, with number or numbers.
- `number` — answers: one batch number to read, at least 1.
- `numbers` — answers: several batch numbers to read, each at least 1, answered in the order given.

### HandlerBackgroundRunGet

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** [read-only] Reads one of your background runs by its run_handle: running, or finished with what the run tool answered (the system answer as it is, an error included). A read keeps the run.

**Available in:** all

**Parameters:**

- `run_handle` (required) — The run_handle a run started with background=true answered.

### HandlerBackgroundRunList

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** [read-only] Lists your background runs: run_handle, tool, object, when it started, and running or finished. A run's output is read by its run_handle.

**Available in:** all

**Parameters:** none

### HandlerBackgroundRunDiscard

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** [read-only] Removes the kept answer of one of your finished background runs. Works on a finished run; a started run runs to its end.

**Available in:** all

**Parameters:**

- `run_handle` (required) — The run_handle a run started with background=true answered.

### HandlerLeftoverSessionList

**Half:** leftover-session tools of `@mcp-abap-adt/lib`, stdio binaries only (the list and the logoff in both)

**Description:** [read-only] Lists the SAP sessions of this server's destination an ended server process left open (it was killed before logging them off): handle, role (built or debugger), destination, user, when recorded. Read from the session records alone. Only sessions of ended processes are listed. A server starting while exactly one built session of its destination is left is born on it; with several, all stay listed and untaken.

**Available in:** all

**Parameters:** none

### HandlerLeftoverSessionLogoff

**Half:** leftover-session tools of `@mcp-abap-adt/lib`, stdio binaries only (the list and the logoff in both)

**Description:** [read-only] Logs off a leftover SAP session (any role), releasing every lock it holds; only the logoff is sent, credential-free. Its record is deleted afterwards.

**Available in:** all

**Parameters:**

- `handle` (required) — The handle of a leftover session, as the list answers it.

### HandlerBatch

**Half:** batch mode of `@mcp-abap-adt/lib`, in every compact binary

**Description:** [read-only] action 'begin': Starts batch mode on this server. In batch mode each call of a tool marked recordable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle: over Streamable HTTP send it as the state_handle argument of every call of the batch (or in the x-mcp-state-handle header). action 'end': Sends the recorded calls in one envelope with the credentials in force and ends batch mode. Splits SAP's answer into each call's parts and answers the number of recorded calls, of requests sent and of parts received; when sending fails, the parts received differ from the requests sent or the answer fails to split, answers that error, and every number of the batch then answers it. action 'answers' (with number or numbers): Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.

**Available in:** all

**Parameters:**

- `action` (required) — begin: switch into batch mode; end: send the recorded calls and leave batch mode; answers: read the last batch's answers by number (with number or numbers).
- `number` — answers only: one batch number to read (an integer of at least 1); give this or numbers, not both.
- `numbers` — answers only: several batch numbers to read, answered in the order given; give this or number, not both.

## Streamable HTTP Binaries

`mcp-abap-adt-compact-sse`, `mcp-abap-adt-compact-sse-ro` (SSE) serve the tools of `mcp-abap-adt-compact`, `mcp-abap-adt-compact-ro` without `HandlerLeftoverSessionList`, `HandlerLeftoverSessionLogoff`, which are stdio's only. `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-http-ro` (Streamable HTTP) serve the same tools, and beside them:

- **The `state_handle` argument.** Every tool they serve declares one more, optional argument, `state_handle` (string): "The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance." A tool whose own schema declares `state_handle` (the debugger tools) keeps its own declaration, required where it is required. No stdio or SSE binary declares it; the parameters listed per tool above are the stdio ones, without it.
- **The long session:** `HandlerSession`, served by no stdio or SSE binary. Its parameters below are the ones these binaries register, `state_handle` included.

### HandlerSession (Streamable HTTP)

**Description:** [read-only] action 'open': Opens a long session on this server: the server instance and its SAP connection are kept for every call that carries the session's state_handle, until the session is closed or the server's idle bound passes between two calls. Answers the state_handle: send it as the state_handle argument of every call of the session (or in the x-mcp-state-handle header). Called with the state_handle of an instance that already holds state, or of an open session, answers that same state_handle and keeps what the instance holds. In batch mode it runs at once and the batch stays open. action 'close': Closes the long session the state_handle names: once this answer is written the server instance is closed — every SAP session it holds is logged off, which releases the locks taken in it; an open batch and its recorded calls are dropped unsent — and the state_handle ends: a later call carrying it gets the unavailable-state answer. Answers that the session is closed and what it held: its locks, a batch, a debug session. Called with an unknown state_handle, or on a new instance, it gets the unavailable-state answer. In batch mode it runs at once and drops the batch.

**Parameters:**

- `action` (required) — open: open a long session and answer its state_handle. close: close the long session the state_handle names.
- `state_handle` — The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.

