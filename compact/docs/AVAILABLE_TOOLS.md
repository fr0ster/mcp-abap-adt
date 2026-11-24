# Compact Tools — MCP ABAP ADT

Generated from the built packages, not from source text: these are the tool
definitions a client receives.

- Tools: 40
- Read-only half: `@mcp-abap-adt/compact-readonly-entries`
- Modifying half: `@mcp-abap-adt/compact-modify`
- Debugger verbs: `@mcp-abap-adt/compact`, served by the write binaries always, by no `-ro` binary
- Leftover-session tools: `@mcp-abap-adt/lib`, on stdio only (`mcp-abap-adt-compact`, `mcp-abap-adt-compact-ro`): the list and the logoff in both; no `-compact-http` or `-compact-sse` binary serves them
- Background-run tools: `@mcp-abap-adt/lib`, in every compact binary: the long reads run in the background by default, and in the write binaries `HandlerProfileRun` too
- Batch mode: `HandlerBatch` of `@mcp-abap-adt/lib`, in every compact binary, on every transport. Every other tool's description, as the server lists it, ends with one sentence saying how a call of it behaves in batch mode: recordable, recordable for the arguments it names, or run outside batch mode; the descriptions on this page are the tools' own, without it ([Batch Mode](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/BATCH_MODE.md))
- Commands: `mcp-abap-adt-compact` (`@mcp-abap-adt/compact`) serves every tool under Tools; `mcp-abap-adt-compact-ro` (`@mcp-abap-adt/compact-ro`) the read-only half, the background-run tools and the leftover-session list and logoff. `-compact-sse` and `-compact-sse-ro` serve the same without the leftover-session tools; `-compact-http` and `-compact-http-ro` the same, with what [Streamable HTTP Binaries](#streamable-http-binaries) adds

## How it works

One tool per OPERATION, with the object in `object_type`: `HandlerCreate` with
`object_type: "CLASS"` rather than a `CreateClass` tool. 40 schemas instead of
the object-oriented surface's hundreds, for a host that cannot select tools
per request.

## Tools

### HandlerGet

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the metadata of a package (DEVC), reads the contents of a package (DEVC), reads the metadata of a domain (DOMA), reads the metadata of a data element (DTEL), reads the source code of a table (TABL), reads the metadata of a table (TABL), reads the source code of a structure (TABL), reads the metadata of a structure (TABL), reads the metadata of a table type (TTYP), reads the source code of a CDS view (DDLS), reads the metadata of a CDS view (DDLS), reads the source code of a service definition (SRVD), reads the metadata of a service definition (SRVD), reads the source code of a service binding (SRVB), reads the metadata of a service binding (SRVB), reads the URLs of a service binding (SRVB), reads the source code of a class (CLAS), reads the metadata of a class (CLAS), reads the local test classes of a class (CLAS), reads the local types of a class (CLAS), reads the local definitions of a class (CLAS), reads the local macros of a class (CLAS), reads the source code of a program (PROG), reads the metadata of a program (PROG), reads the source code of an include (PROG), reads the metadata of an include (PROG), reads the source code of an interface (INTF), reads the metadata of an interface (INTF), reads the metadata of a function group (FUGR), reads the source code of a function module (FUGR), reads the metadata of a function module (FUGR), reads the source code of a behavior definition (BDEF), reads the metadata of a behavior definition (BDEF), reads the source code of a behavior implementation (CLAS), reads the metadata of a behavior implementation (CLAS), reads the source code of a metadata extension (DDLX), reads the metadata of a metadata extension (DDLX), reads an ABAP Unit run's result, reads a CDS unit test run's result, reads the objects of a transport, reads the header of a transport, reads the technical settings of a table (TABL), reads the text elements of a program (PROG), reads the text elements of a function group (FUGR), reads the text elements of a class (CLAS), reads the main programs (PROG) of an include (PROG), reads a repository object's unactivated change, reads a repository object's structure, reads a repository browser node, reads virtual folders, reads an activation run's status, reads an activation run's results. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Available in:** cloud, onprem

**Parameters:**

- `background` — Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; HandlerBackgroundRunGet answers its result once, and HandlerBackgroundRunDiscard cancels it while it runs. false: the call answers the result itself. Applies to the repository reads: object_type PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, TRANSPORT, TABLE_SETTINGS, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS, and the parts object_structure, node_structure, virtual_folders.
- `object_type` — ABAP object type for routed compact operation.
- `part` — The part to read: source (the source alone), metadata (the ADT metadata document alone), urls (the service and preview URLs), contents (the objects a package holds); each object type answers the parts it has, and a part outside them is answered with the list of its parts. Three parts read the repository by ADT address: object_structure (object_adt_type*, object_name*), node_structure (object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders (object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by run_id*: activation_status (its status) and activation_results (the messages it produced). main_programs (INCLUDE): the include's main programs. draft (PROGRAM, INCLUDE, INTERFACE, CLASS, BEHAVIOR_IMPLEMENTATION, FUNCTION_MODULE, FUNCTION_GROUP, DDL, BEHAVIOR_DEFINITION, METADATA_EXTENSION, SERVICE_DEFINITION, TABLE, STRUCTURE, DOMAIN, DATA_ELEMENT, TABLE_TYPE): whether each part of the object holds an unactivated change, and whose.
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `package_name` — Package name.
- `package_names` — Several package names (part contents), read together, as GetPackageContents answers them: at detail terse each package's rows under its '# asked' line, else one entry per package, in the order given.
- `max_results` — Accepted for compatibility (part contents): every member is answered.
- `include_descriptions` — Include each member's description (part contents). The walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes.
- `class_name` — Class name.
- `interface_name` — Interface name.
- `program_name` — Program name.
- `include_name` — Include name.
- `domain_name` — Domain name.
- `data_element_name` — Data element name.
- `table_name` — Table name.
- `structure_name` — Structure name.
- `table_type_name` — Table type name.
- `ddl_name` — DDL source name.
- `function_module_name` — Function module name: GROUP|MODULE, its function group first, or the module alone with function_group_name.
- `function_group_name` — Function group name (FUNCTION_GROUP; FUNCTION_MODULE given as the module's name).
- `behavior_definition_name` — Behavior definition name.
- `behavior_implementation_name` — Behavior implementation name.
- `metadata_extension_name` — Metadata extension name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `transport_number` — Transport request or task number (TRANSPORT). A request lists the entries of all its tasks; a task lists its own. With part metadata: the request or task itself.
- `run_id` — Run id: a unit test run (UNIT_TEST, CDS_UNIT_TEST) or an activation run (parts activation_status, activation_results).
- `with_long_polling` — With part activation_status: when true, the status read is held by SAP until the activation run ends, and answers its final status.
- `response_format` — Response format for SERVICE_BINDING reads.
- `version` — The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.
- `object_adt_type` — ADT type code of the object (object_structure) or of the parent node (node_structure).
- `object_name` — Object name (object_structure) or parent name (node_structure).
- `node_id` — Node id to expand (node_structure); the root when absent.
- `with_short_descriptions` — Include short descriptions (node_structure).
- `object_search_pattern` — Object name pattern (virtual_folders).
- `preselection` — Facet preselections (virtual_folders).
- `facet_order` — Facet order (virtual_folders).
- `with_versions` — Include versions (virtual_folders).
- `ignore_short_descriptions` — Leave out short descriptions (virtual_folders).

**On ABAP Cloud (`cloud`):** [read-only] Reads the metadata of a package (DEVC), reads the contents of a package (DEVC), reads the metadata of a domain (DOMA), reads the metadata of a data element (DTEL), reads the source code of a table (TABL), reads the metadata of a table (TABL), reads the source code of a structure (TABL), reads the metadata of a structure (TABL), reads the metadata of a table type (TTYP), reads the source code of a CDS view (DDLS), reads the metadata of a CDS view (DDLS), reads the source code of a service definition (SRVD), reads the metadata of a service definition (SRVD), reads the source code of a service binding (SRVB), reads the metadata of a service binding (SRVB), reads the URLs of a service binding (SRVB), reads the source code of a class (CLAS), reads the metadata of a class (CLAS), reads the local test classes of a class (CLAS), reads the local types of a class (CLAS), reads the local definitions of a class (CLAS), reads the local macros of a class (CLAS), reads the source code of a program (PROG), reads the metadata of a program (PROG), reads the source code of an include (PROG), reads the metadata of an include (PROG), reads the source code of an interface (INTF), reads the metadata of an interface (INTF), reads the metadata of a function group (FUGR), reads the source code of a function module (FUGR), reads the metadata of a function module (FUGR), reads the source code of a behavior definition (BDEF), reads the metadata of a behavior definition (BDEF), reads the source code of a behavior implementation (CLAS), reads the metadata of a behavior implementation (CLAS), reads the source code of a metadata extension (DDLX), reads the metadata of a metadata extension (DDLX), reads an ABAP Unit run's result, reads a CDS unit test run's result, reads the objects of a transport, reads the header of a transport, reads the technical settings of a table (TABL), reads the text elements of a program (PROG), reads the text elements of a function group (FUGR), reads the text elements of a class (CLAS), reads a repository object's unactivated change, reads a repository object's structure, reads a repository browser node, reads virtual folders, reads an activation run's status, reads an activation run's results. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Parameters (`cloud`):**

- `background` — Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; HandlerBackgroundRunGet answers its result once, and HandlerBackgroundRunDiscard cancels it while it runs. false: the call answers the result itself. Applies to the repository reads: object_type PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, TRANSPORT, TABLE_SETTINGS, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS, and the parts object_structure, node_structure, virtual_folders.
- `object_type` — ABAP object type for routed compact operation.
- `part` — The part to read: source (the source alone), metadata (the ADT metadata document alone), urls (the service and preview URLs), contents (the objects a package holds); each object type answers the parts it has, and a part outside them is answered with the list of its parts. Three parts read the repository by ADT address: object_structure (object_adt_type*, object_name*), node_structure (object_adt_type*, object_name*, node_id, with_short_descriptions) and virtual_folders (object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by run_id*: activation_status (its status) and activation_results (the messages it produced). draft (INTERFACE, CLASS, BEHAVIOR_IMPLEMENTATION, FUNCTION_MODULE, FUNCTION_GROUP, DDL, BEHAVIOR_DEFINITION, METADATA_EXTENSION, SERVICE_DEFINITION, TABLE, STRUCTURE, DOMAIN, DATA_ELEMENT, TABLE_TYPE): whether each part of the object holds an unactivated change, and whose.
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `package_name` — Package name.
- `package_names` — Several package names (part contents), read together, as GetPackageContents answers them: at detail terse each package's rows under its '# asked' line, else one entry per package, in the order given.
- `max_results` — Accepted for compatibility (part contents): every member is answered.
- `include_descriptions` — Include each member's description (part contents). The walk's levels are then read as single requests, several at a time, rather than in ADT batch envelopes.
- `class_name` — Class name.
- `interface_name` — Interface name.
- `program_name` — Program name.
- `include_name` — Include name.
- `domain_name` — Domain name.
- `data_element_name` — Data element name.
- `table_name` — Table name.
- `structure_name` — Structure name.
- `table_type_name` — Table type name.
- `ddl_name` — DDL source name.
- `function_module_name` — Function module name: GROUP|MODULE, its function group first, or the module alone with function_group_name.
- `function_group_name` — Function group name (FUNCTION_GROUP; FUNCTION_MODULE given as the module's name).
- `behavior_definition_name` — Behavior definition name.
- `behavior_implementation_name` — Behavior implementation name.
- `metadata_extension_name` — Metadata extension name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `transport_number` — Transport request or task number (TRANSPORT). A request lists the entries of all its tasks; a task lists its own. With part metadata: the request or task itself.
- `run_id` — Run id: a unit test run (UNIT_TEST, CDS_UNIT_TEST) or an activation run (parts activation_status, activation_results).
- `with_long_polling` — With part activation_status: when true, the status read is held by SAP until the activation run ends, and answers its final status.
- `response_format` — Response format for SERVICE_BINDING reads.
- `version` — The version read: "active" (default) the activated version, "inactive" the version saved and awaiting activation, "workingArea" the version in the working area, as ADT answers it.
- `object_adt_type` — ADT type code of the object (object_structure) or of the parent node (node_structure).
- `object_name` — Object name (object_structure) or parent name (node_structure).
- `node_id` — Node id to expand (node_structure); the root when absent.
- `with_short_descriptions` — Include short descriptions (node_structure).
- `object_search_pattern` — Object name pattern (virtual_folders).
- `preselection` — Facet preselections (virtual_folders).
- `facet_order` — Facet order (virtual_folders).
- `with_versions` — Include versions (virtual_folders).
- `ignore_short_descriptions` — Leave out short descriptions (virtual_folders).

### HandlerSystem

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Searches the source code of packages (DEVC) for text, finds repository objects by name, finds where a repository object is used, reads a package (DEVC) with its subpackages and their objects, reads a user's transports, reads an ATC run's findings, reads the stored ATC results, reads one stored ATC result with its findings. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Available in:** cloud, onprem

**Parameters:**

- `background` — Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; HandlerBackgroundRunGet answers its result once, and HandlerBackgroundRunDiscard cancels it while it runs. false: the call answers the result itself.
- `action` (required) — The read: search_source (source text in packages), search_object (objects by name or mask), where_used (the objects that use an object), package_tree (a package tree), transports (transport requests), atc_findings (the findings of an ATC run), atc_results (the stored ATC results), atc_result (one stored ATC result).
- `query` — search_source: primary substring to match (case-insensitive, ABAP CS).
- `query2` — search_source: a second substring; when set, both query and query2 must appear on the same line.
- `exclude` — search_source: up to 3 substrings; a line containing any of them is dropped.
- `packages` — search_source: packages to scan, each an exact package name or a mask (`*` zero or more characters, `?` one character; `+`, `_`, `%` and `#` are characters of the name).
- `include_subpackages` — search_source: recurse into subpackages (default true). package_tree: expand subpackages recursively (default true).
- `object_filter` — search_source: glob applied to object names within each package (e.g. "Z*").
- `object_types` — search_source: object types to scan, by main type: PROG (programs and program includes), FUGR, CLAS, INTF, DDLS, BDEF, DDLX, SRVD (default all of them).
- `exclude_comments` — search_source: skip col-1 '*' and full-line '"' comment lines (default false).
- `max_hits_per_object` — search_source: the most hits answered per object; absent, every hit.
- `max_hits` — search_source: the most hits of the whole answer; reached, the scan stops reading. Absent, every hit.
- `answer` — search_source: what each hit is answered as: lines (the default at detail terse), snippets (the default at medium and full) or objects.
- `version` — search_source: the version every source is read at (default active).
- `object_name` — search_object: object name or mask (e.g. 'MARA*'). where_used: name of the object (with object_type), a function module as 'GROUP|FM_NAME'.
- `object_type` — search_object: Optional: restrict the search to one type: a name of the system's object types list — a main type (e.g. CLAS, DEVC, TABL), an alias of one subtype (e.g. STRU for structures, DTAB for database tables, FUNC for function modules) or a group — or an ADT type code, which stands for the name that selects it (e.g. TABL/DS for STRU, FUGR/FF for FUNC, ENHO/XHH for ENHO), either case; or a name standing for a code, written in lower case (e.g. class, structure, table, function), read as its code: view is a CDS view (DDLS), dbview a dictionary view (VIEW). A value in upper case is a search name or a code first, so VIEW is the dictionary views; it is a name only when it is neither (CLASS is class). where_used: Type of the ABAP object: an ADT type code (either case), or a name standing for one (in brackets after it): CLAS/OC (class), INTF/OI (interface), PROG/P (program), PROG/I (include), FUGR/F (functiongroup), FUGR/FF (function, functionmodule, function_module, func), DEVC/K (package), DDLS/DF (view), VIEW/DV (dbview), TABL/DT (table), TABL/DS (structure, stru), TTYP/DA, DOMA/DD (domain), DTEL/DE (dataelement), DCLS/DL, BDEF/BDO, DDLX/EX, SRVD/SRV, SRVB/SVB, DSFD/SCF, DSFI/SFI, XSLT/VT, MSAG/N, FTG2/FT, AUTH, ENHO/XHH, ENHO/XHB, ENHS/XSB, PROG/PX. A function module is named as object_name says. PROG/PX is a program's or a function group's text elements; container says which. A name is written in lower case: view is a CDS view (DDLS/DF). A value in upper case is a code, a main type or a search name of the system's object types list first, so VIEW is the dictionary views (VIEW/DV); it is a name only when it is none of these (CLASS is class). A main type, the part of a code before its slash, stands for its code when exactly one listed code has it. In upper case, a search name of the system's object types list stands for the listed code its list item has (e.g. STRU for TABL/DS).
- `container` — where_used: with object_type PROG/PX, required: whose text elements they are, program or function_group; taken by PROG/PX alone.
- `maxResults` — search_object: maximum number of results to return (default 100).
- `detail` — search_source, search_object, where_used, package_tree, transports, atc_findings, atc_result: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
- `objects` — where_used: several objects, read together (give this or object_name and object_type); the type filters apply to every object.
- `enable_all_types` — where_used: true selects every object type of the where-used scope (default false, the SAP default scope).
- `enable_only_types` — where_used: the only ADT object types searched, codes of the object's where-used scope (e.g. 'CLAS/OC', 'DDLS/DF').
- `disable_types` — where_used: ADT object types removed from the scope (e.g. ['CLAS/OC']).
- `package_name` — package_tree: package name (give this or package_names).
- `package_names` — package_tree: several package names, read together (give this or package_name).
- `max_depth` — package_tree: maximum depth of the walk (default 5).
- `include_descriptions` — package_tree: each object's description in the answer (default false).
- `debug` — package_tree: diagnostic metadata in the answer (counts, types, hierarchy; default false).
- `user` — transports: the SAP user id whose requests are listed (default the session's user).
- `modifiable_only` — transports: only modifiable (unreleased) requests (default true).
- `worklist_id` — atc_findings: worklist identifier an ATC run answered.
- `created_by` — atc_results: whose results: a user name, or * for every user.
- `central_only` — atc_results: true lists central results only.
- `age_min` — atc_results: youngest age to list, in days.
- `age_max` — atc_results: oldest age to list, in days.
- `display_id` — atc_result: display ID of a stored ATC result.

### HandlerValidate

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Validates the name of a new class (CLAS), validates the name of a new program (PROG), validates the name of a new include (PROG), validates the name of a new interface (INTF), validates the name of a new function group (FUGR), validates the name of a new function module (FUGR), validates the name of a new table (TABL), validates the name of a new structure (TABL), validates the name of a new table type (TTYP), validates the name of a new CDS view (DDLS), validates the name of a new domain (DOMA), validates the name of a new data element (DTEL), validates the name of a new package (DEVC), validates the name of a new behavior definition (BDEF), validates the name of a new behavior implementation (CLAS), validates the name of a new metadata extension (DDLX), validates the name of a new service binding (SRVB).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type to validate before create. Supported: CLASS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, TABLE_TYPE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.
- `object_name` (required) — Required object name. For SERVICE_BINDING this is the service binding name; a function module is named GROUP|MODULE.
- `package_name` — Package of the object to validate. Required for BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION and SERVICE_BINDING.
- `super_package` — Super package of the package to validate (PACKAGE).
- `superclass` — Superclass of the class to validate (CLASS).
- `description` — Object description used during validation. Required for FUNCTION_MODULE, BEHAVIOR_DEFINITION and METADATA_EXTENSION.
- `behavior_definition` — Behavior definition the behavior implementation is for (BEHAVIOR_IMPLEMENTATION).
- `root_entity` — CDS root entity of the behavior definition to validate. Required for BEHAVIOR_DEFINITION.
- `implementation_type` — Implementation type of the behavior definition to validate (Managed, Unmanaged, Abstract or Projection). Required for BEHAVIOR_DEFINITION.
- `service_definition_name` — Required when object_type=SERVICE_BINDING. Service definition paired with the binding.
- `service_binding_version` — Optional service binding version for SERVICE_BINDING.

**On ABAP Cloud (`cloud`):** [read-only] Validates the name of a new class (CLAS), validates the name of a new interface (INTF), validates the name of a new function group (FUGR), validates the name of a new function module (FUGR), validates the name of a new table (TABL), validates the name of a new structure (TABL), validates the name of a new table type (TTYP), validates the name of a new CDS view (DDLS), validates the name of a new domain (DOMA), validates the name of a new data element (DTEL), validates the name of a new package (DEVC), validates the name of a new behavior definition (BDEF), validates the name of a new behavior implementation (CLAS), validates the name of a new metadata extension (DDLX), validates the name of a new service binding (SRVB).

**Parameters (`cloud`):**

- `object_type` (required) — Object type to validate before create. Supported: CLASS, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, TABLE_TYPE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_BINDING.
- `object_name` (required) — Required object name. For SERVICE_BINDING this is the service binding name; a function module is named GROUP|MODULE.
- `package_name` — Package of the object to validate. Required for BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION and SERVICE_BINDING.
- `super_package` — Super package of the package to validate (PACKAGE).
- `superclass` — Superclass of the class to validate (CLASS).
- `description` — Object description used during validation. Required for FUNCTION_MODULE, BEHAVIOR_DEFINITION and METADATA_EXTENSION.
- `behavior_definition` — Behavior definition the behavior implementation is for (BEHAVIOR_IMPLEMENTATION).
- `root_entity` — CDS root entity of the behavior definition to validate. Required for BEHAVIOR_DEFINITION.
- `implementation_type` — Implementation type of the behavior definition to validate (Managed, Unmanaged, Abstract or Projection). Required for BEHAVIOR_DEFINITION.
- `service_definition_name` — Required when object_type=SERVICE_BINDING. Service definition paired with the binding.
- `service_binding_version` — Optional service binding version for SERVICE_BINDING.

### HandlerCheckRun

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Checks the syntax of a class (CLAS), checks the syntax of a program (PROG), checks the syntax of an interface (INTF), checks the syntax of a function group (FUGR), checks the syntax of a function module (FUGR), checks the syntax of a table (TABL), checks the syntax of a structure (TABL), checks the syntax of a table type (TTYP), checks the syntax of a CDS view (DDLS), checks the syntax of a domain (DOMA), checks the syntax of a data element (DTEL), checks the syntax of a package (DEVC), checks the syntax of a behavior definition (BDEF), checks the syntax of a metadata extension (DDLX).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, TABLE_TYPE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, METADATA_EXTENSION.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `version` — Version to syntax-check.
- `source_code` — Source to check instead of the saved one; nothing is saved. CLASS, STRUCTURE and DDL only.

### HandlerDeletionCheck

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Checks whether a package (DEVC) can be deleted, checks whether a domain (DOMA) can be deleted, checks whether a data element (DTEL) can be deleted, checks whether a table (TABL) can be deleted, checks whether a structure (TABL) can be deleted, checks whether a table type (TTYP) can be deleted, checks whether a CDS view (DDLS) can be deleted, checks whether a service definition (SRVD) can be deleted, checks whether a service binding (SRVB) can be deleted, checks whether a class (CLAS) can be deleted, checks whether the unit tests of a CDS view (DDLS) can be deleted, checks whether a program (PROG) can be deleted, checks whether an include (PROG) can be deleted, checks whether an interface (INTF) can be deleted, checks whether a function group (FUGR) can be deleted, checks whether a function module (FUGR) can be deleted, checks whether a behavior definition (BDEF) can be deleted, checks whether a behavior implementation (CLAS) can be deleted, checks whether a metadata extension (DDLX) can be deleted.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.

### HandlerUnitTestStatus

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the status of an ABAP Unit test run by its id.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_long_polling` — Use long polling while waiting for completion.

### HandlerUnitTestResult

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the result of an ABAP Unit test run by its id.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_navigation_uris` — Include ADT navigation URIs in the result payload.
- `format` — Result format.
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerCdsUnitTestStatus

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the status of a CDS unit test run by its id.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_long_polling` — Use long polling while waiting for completion.

### HandlerCdsUnitTestResult

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads the result of a CDS unit test run by its id.

**Available in:** cloud, onprem

**Parameters:**

- `run_id` (required) — Unit test run id.
- `with_navigation_uris` — Include ADT navigation URIs in the result payload.
- `format` — Result format.
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerProfileList

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Lists the ABAP profiler traces recorded in the system.

**Available in:** cloud, onprem

**Parameters:**

- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerProfileView

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Reads a profiler trace view, analyzes a profiler trace view. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Available in:** cloud, onprem

**Parameters:**

- `background` — Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; HandlerBackgroundRunGet answers its result once, and HandlerBackgroundRunDiscard cancels it while it runs. false: the call answers the result itself.
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

**Description:** [read-only] Lists one page of the short dumps, system messages or SAP Gateway errors of an ABAP system, newest first, by user, object and time. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Available in:** cloud, onprem

**Parameters:**

- `background` — Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; HandlerBackgroundRunGet answers its result once, and HandlerBackgroundRunDiscard cancels it while it runs. false: the call answers the result itself.
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.
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

**Description:** [read-only] Reads an ABAP runtime dump by its id, with a summary of where and why its program (PROG) terminated.

**Available in:** cloud, onprem

**Parameters:**

- `dump_id` (required) — The dump's dump_id, or its URI.
- `view` — "summary" — runtime error, exception, terminated program, time, user and termination position; "default" — that summary and the parsed dump; "formatted" — the dump as formatted text.

### HandlerServiceBindingListTypes

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Lists the service binding (SRVB) types the system offers, such as OData V2 and OData V4, in the format asked.

**Available in:** cloud, onprem

**Parameters:**

- `response_format` — Response format for protocol types list.

### HandlerServiceBindingValidate

**Half:** `@mcp-abap-adt/compact-readonly-entries`

**Description:** [read-only] Validates a new OData service binding (SRVB) for a service definition (SRVD), in the package (DEVC) and version given, by SAP's transport check of its name and package.

**Available in:** cloud, onprem

**Parameters:**

- `service_binding_name` (required) — Service binding name to validate.
- `service_definition_name` (required) — Service definition name to pair with binding.
- `service_binding_version` — Service binding version.
- `package_name` (required) — The binding's package, which the validation checks.
- `description` — Binding description.

### HandlerGetData

**Half:** `@mcp-abap-adt/compact-readonly-entries` (`compactDataEntries`). **Opt-in:** served only by a binary started with `--enable-data-tools` (`MCP_ENABLE_DATA_TOOLS`, `enable-data-tools`); off by default. SAP API Policy FAQ v1.3 (June 2026), Q33, says ADT APIs are not intended for reading application tables, exporting business data or running SQL against SAP systems; whether to enable it is the customer's decision.

**Description:** [read-only] Reads the data of an ABAP database table (TABL) or CDS view (DDLS), or the data an ABAP SQL SELECT selects, up to the number of records asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**Available in:** cloud, onprem

**Parameters:**

- `background` — Default true: the read runs in the background on an ABAP session of its own and the call answers at once with a run_handle; HandlerBackgroundRunGet answers its result once, and HandlerBackgroundRunDiscard cancels it while it runs. false: the call answers the result itself.
- `object_name` — Table or CDS view whose rows are read, all columns. Used when sql_query is absent.
- `sql_query` — ABAP SQL SELECT naming the columns, conditions and order to read.
- `max_rows` — Maximum number of rows returned.

### HandlerCreate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Creates a package (DEVC), creates a domain (DOMA), creates a data element (DTEL), creates a transport, creates a table (TABL), creates a structure (TABL), creates a table type (TTYP), creates a CDS view (DDLS), creates a service definition (SRVD), creates a service binding (SRVB), creates a class (CLAS), creates a program (PROG), creates an include (PROG), creates an interface (INTF), creates a function group (FUGR), creates a function module (FUGR), creates a behavior definition (BDEF), creates a behavior implementation (CLAS), creates a metadata extension (DDLX).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — ABAP object type for routed compact operation.
- `class_name` — ABAP class name (CLASS, BEHAVIOR_IMPLEMENTATION).
- `behavior_definition` — Behavior definition the implementation is for (BEHAVIOR_IMPLEMENTATION, required there).
- `program_name` — ABAP program name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name (FUNCTION_GROUP; the group of a FUNCTION_MODULE).
- `package_name` — ABAP package name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `description` — Human-readable object description.
- `transport_request` — Transport request id (if required by system).
- `master_language` — Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `super_package` — PACKAGE create. Optional: the package this package belongs to, which must exist (SAP creates the package with no super package when the named one is missing). Without one the package is top level, which SAP allows for a structure package or a package in software component LOCAL ($ or TEST names, no transport layer); in an ABAP Cloud software component the top level is a structure package (SAP answers TR 462 to any other).
- `package_type` — Package type (PACKAGE create).
- `software_component` — Software component (PACKAGE create).
- `transport_layer` — Transport layer (PACKAGE create).
- `record_changes` — Record changes (PACKAGE create).
- `application_component` — Application component (PACKAGE create).
- `transport_type` — Transport request type (TRANSPORT create).
- `target_system` — Target system of the transport request (TRANSPORT create).
- `owner` — Owner of the transport request (TRANSPORT create).
- `task_type` — The type given to the request's task (TRANSPORT create): S — Development/Correction (default), R — Repair, X — Unclassified, as SAP creates it.
- `superclass` — Superclass name (CLASS create).
- `final` — Mark the class final (CLASS create).
- `create_protected` — Protected constructor (CLASS create).
- `application` — Application area (PROGRAM create).
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `include_name` — Include name.
- `table_type_name` — Table type name.
- `service_definition_name` — Service definition name (SERVICE_DEFINITION; the definition a SERVICE_BINDING binds).
- `service_binding_name` — Service binding name.
- `service_name` — Service name of the binding (SERVICE_BINDING create); the binding name when absent.
- `service_version` — Service version of the binding (SERVICE_BINDING create); 0001 when absent.
- `binding_variant` — Binding variant (SERVICE_BINDING create); ODATA_V4_UI when absent.
- `name` — Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `implementation_type` — Behavior definition implementation type.
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

**On ABAP Cloud (`cloud`):** Creates a package (DEVC), creates a domain (DOMA), creates a data element (DTEL), creates a transport, creates a table (TABL), creates a structure (TABL), creates a table type (TTYP), creates a CDS view (DDLS), creates a service definition (SRVD), creates a service binding (SRVB), creates a class (CLAS), creates an interface (INTF), creates a function group (FUGR), creates a function module (FUGR), creates a behavior definition (BDEF), creates a behavior implementation (CLAS), creates a metadata extension (DDLX).

**Parameters (`cloud`):**

- `object_type` (required) — ABAP object type for routed compact operation.
- `class_name` — ABAP class name (CLASS, BEHAVIOR_IMPLEMENTATION).
- `behavior_definition` — Behavior definition the implementation is for (BEHAVIOR_IMPLEMENTATION, required there).
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name (FUNCTION_GROUP; the group of a FUNCTION_MODULE).
- `package_name` — ABAP package name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `description` — Human-readable object description.
- `transport_request` — Transport request id (if required by system).
- `master_language` — Original language of the created object (e.g. EN, DE). Absent, the session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon language applies.
- `super_package` — PACKAGE create. Optional: the package this package belongs to, which must exist (SAP creates the package with no super package when the named one is missing). Without one the package is top level, which SAP allows for a structure package or a package in software component LOCAL ($ or TEST names, no transport layer); in an ABAP Cloud software component the top level is a structure package (SAP answers TR 462 to any other).
- `package_type` — Package type (PACKAGE create).
- `software_component` — Software component (PACKAGE create).
- `transport_layer` — Transport layer (PACKAGE create).
- `record_changes` — Record changes (PACKAGE create).
- `application_component` — Application component (PACKAGE create).
- `transport_type` — Transport request type (TRANSPORT create).
- `target_system` — Target system of the transport request (TRANSPORT create).
- `owner` — Owner of the transport request (TRANSPORT create).
- `task_type` — The type given to the request's task (TRANSPORT create): S — Development/Correction (default), R — Repair, X — Unclassified, as SAP creates it.
- `superclass` — Superclass name (CLASS create).
- `final` — Mark the class final (CLASS create).
- `create_protected` — Protected constructor (CLASS create).
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `table_type_name` — Table type name.
- `service_definition_name` — Service definition name (SERVICE_DEFINITION; the definition a SERVICE_BINDING binds).
- `service_binding_name` — Service binding name.
- `service_name` — Service name of the binding (SERVICE_BINDING create); the binding name when absent.
- `service_version` — Service version of the binding (SERVICE_BINDING create); 0001 when absent.
- `binding_variant` — Binding variant (SERVICE_BINDING create); ODATA_V4_UI when absent.
- `name` — Object name for handlers that require a generic `name` (behavior definition, metadata extension).
- `implementation_type` — Behavior definition implementation type.
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerUpdate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Updates a package (DEVC), updates a domain (DOMA), updates a data element (DTEL), updates a table type (TTYP), updates a function group (FUGR), updates a table (TABL), updates a structure (TABL), updates a CDS view (DDLS), updates a service definition (SRVD), updates a class (CLAS), updates the local test classes of a class (CLAS), updates the local types of a class (CLAS), updates the local definitions of a class (CLAS), updates the local macros of a class (CLAS), updates the unit tests of a class (CLAS), updates the unit tests of a CDS view (DDLS), updates a program (PROG), updates an include (PROG), updates an interface (INTF), updates a function module (FUGR), updates a behavior definition (BDEF), updates a behavior implementation (CLAS), updates a metadata extension (DDLX), updates a service binding (SRVB), updates the technical settings of a table (TABL), updates the text elements of a program (PROG), updates the text elements of a function group (FUGR), updates the text elements of a class (CLAS). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

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
- `source_code` — The content written: the source, or for PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE_TYPE and INCLUDE with part metadata the whole metadata document.
- `part` — The part of an INCLUDE written: source (when absent) its source, metadata its metadata document. Taken by INCLUDE alone.
- `ddl_source` — Complete DDL source code (for DDL update).
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `include_name` — Include name.
- `table_type_name` — Table type name.
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
- `data_class` — Data class. The value help lists APPL0 (master data), APPL1 (transaction data), APPL2 (organization and customizing) and DDIM, DFACT, DODS; SAP checks the value when the table is activated.
- `size_category` — Size category, a digit from 0 to 9.
- `buffering` — Buffering; each field given replaces the stored one.
- `storage_type` — Storage type.
- `sharing_type` — Sharing type.
- `load_unit` — Load unit.
- `translation` — Translation value; the translation flags keep their stored values.
- `logging_enabled` — Whether changes to the table data are logged.
- `is_writable_by_amdp` — TABLE_SETTINGS on the cloud: true allows AMDP writes; activation then needs buffering N, logging off and no replacement object.
- `symbols` — The text symbols: the whole list; symbols left out are deleted.
- `selections` — The selection texts (programs and function groups): the whole list; texts left out are deleted.
- `headings` — The list header and four column headers (programs and function groups); a heading given empty or left out is deleted.

**On ABAP Cloud (`cloud`):** Updates a package (DEVC), updates a domain (DOMA), updates a data element (DTEL), updates a table type (TTYP), updates a function group (FUGR), updates a table (TABL), updates a structure (TABL), updates a CDS view (DDLS), updates a service definition (SRVD), updates a class (CLAS), updates the local test classes of a class (CLAS), updates the local types of a class (CLAS), updates the local definitions of a class (CLAS), updates the local macros of a class (CLAS), updates the unit tests of a class (CLAS), updates the unit tests of a CDS view (DDLS), updates an interface (INTF), updates a function module (FUGR), updates a behavior definition (BDEF), updates a behavior implementation (CLAS), updates a metadata extension (DDLX), updates a service binding (SRVB), updates the technical settings of a table (TABL), updates the text elements of a function group (FUGR), updates the text elements of a class (CLAS). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**Parameters (`cloud`):**

- `object_type` (required) — ABAP object type for routed compact operation.
- `lock_handle` (required) — The lock handle of the object (for a class include, of the class): the write is sent under it.
- `transport_request` — Transport request id, sent as the write's corrNr (the types whose description names it).
- `class_name` — ABAP class name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name.
- `package_name` — ABAP package name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `source_code` — The content written: the source, or for PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE_TYPE and INCLUDE with part metadata the whole metadata document.
- `ddl_source` — Complete DDL source code (for DDL update).
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `table_type_name` — Table type name.
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
- `data_class` — Data class. The value help lists APPL0 (master data), APPL1 (transaction data), APPL2 (organization and customizing) and DDIM, DFACT, DODS; SAP checks the value when the table is activated.
- `size_category` — Size category, a digit from 0 to 9.
- `buffering` — Buffering; each field given replaces the stored one.
- `storage_type` — Storage type.
- `sharing_type` — Sharing type.
- `load_unit` — Load unit.
- `translation` — Translation value; the translation flags keep their stored values.
- `logging_enabled` — Whether changes to the table data are logged.
- `is_writable_by_amdp` — TABLE_SETTINGS on the cloud: true allows AMDP writes; activation then needs buffering N, logging off and no replacement object.
- `symbols` — The text symbols: the whole list; symbols left out are deleted.
- `selections` — The selection texts (programs and function groups): the whole list; texts left out are deleted.
- `headings` — The list header and four column headers (programs and function groups); a heading given empty or left out is deleted.

### HandlerDelete

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Deletes a package (DEVC), deletes a domain (DOMA), deletes a data element (DTEL), deletes a table (TABL), deletes a structure (TABL), deletes a table type (TTYP), deletes a CDS view (DDLS), deletes a service definition (SRVD), deletes a service binding (SRVB), deletes a class (CLAS), deletes the unit tests of a CDS view (DDLS), deletes a program (PROG), deletes an include (PROG), deletes an interface (INTF), deletes a function group (FUGR), deletes a function module (FUGR), deletes a behavior definition (BDEF), deletes a behavior implementation (CLAS), deletes a metadata extension (DDLX), deletes the local test classes of a class (CLAS), deletes the local types of a class (CLAS), deletes the local definitions of a class (CLAS), deletes the local macros of a class (CLAS), deletes the unit tests of a class (CLAS). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST.
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
- `include_name` — Include name.
- `table_type_name` — Table type name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `behavior_definition_name` — Behavior definition name.
- `behavior_implementation_name` — Behavior implementation name.
- `metadata_extension_name` — Metadata extension name.

**On ABAP Cloud (`cloud`):** Deletes a package (DEVC), deletes a domain (DOMA), deletes a data element (DTEL), deletes a table (TABL), deletes a structure (TABL), deletes a table type (TTYP), deletes a CDS view (DDLS), deletes a service definition (SRVD), deletes a service binding (SRVB), deletes a class (CLAS), deletes the unit tests of a CDS view (DDLS), deletes an interface (INTF), deletes a function group (FUGR), deletes a function module (FUGR), deletes a behavior definition (BDEF), deletes a behavior implementation (CLAS), deletes a metadata extension (DDLX), deletes the local test classes of a class (CLAS), deletes the local types of a class (CLAS), deletes the local definitions of a class (CLAS), deletes the local macros of a class (CLAS), deletes the unit tests of a class (CLAS). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**Parameters (`cloud`):**

- `object_type` (required) — Object type. Supported: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST.
- `lock_handle` — The lock handle of the class (LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST): the include is written empty under it.
- `package_name` — ABAP package name.
- `class_name` — ABAP class name.
- `domain_name` — ABAP domain name.
- `function_module_name` — ABAP function module name.
- `function_group_name` — ABAP function group name.
- `ddl_name` — DDL source name (CDS view, AMDP table function, etc.).
- `transport_request` — Transport request id, sent with the deletion (or the include write).
- `table_name` — Table name.
- `structure_name` — Structure name.
- `data_element_name` — Data element name.
- `interface_name` — Interface name.
- `table_type_name` — Table type name.
- `service_definition_name` — Service definition name.
- `service_binding_name` — Service binding name.
- `behavior_definition_name` — Behavior definition name.
- `behavior_implementation_name` — Behavior implementation name.
- `metadata_extension_name` — Metadata extension name.

### HandlerActivate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Activates a class (CLAS), activates a program (PROG), activates an include (PROG), activates an interface (INTF), activates a function group (FUGR), activates a table (TABL), activates a structure (TABL), activates a table type (TTYP), activates a CDS view (DDLS), activates a domain (DOMA), activates a data element (DTEL), activates a behavior definition (BDEF), activates a metadata extension (DDLX), activates a package (DEVC), activates a service definition (SRVD), activates a service binding (SRVB), activates a function module (FUGR), activates a behavior implementation (CLAS), activates the text elements of a program (PROG), activates the text elements of a function group (FUGR), activates the text elements of a class (CLAS), activates another object by its ADT type, activates several objects together.

**Available in:** cloud, onprem

**Parameters:**

- `object_type` — ABAP object type for routed compact operation. Names the object's type in the single form.
- `object_name` — Object name (single form). A function module is named GROUP|MODULE, its function group first, or the module alone with function_group_name.
- `function_group_name` — A function module's function group (single form, FUNCTION_MODULE).
- `object_adt_type` — ADT object type code (e.g. CLAS/OC, PROG/P) of the object (single form).
- `parentName` — With object_adt_type (single form): The function group the object belongs to; its address is built from it. Required for FUGR/FF (function, functionmodule, function_module, func), FUGR/I. With PROG/PX, the function group whose text elements are activated.
- `objects` — The objects activated together (list form).
- `preaudit` — Run pre-audit checks before activation.

**On ABAP Cloud (`cloud`):** Activates a class (CLAS), activates an interface (INTF), activates a function group (FUGR), activates a table (TABL), activates a structure (TABL), activates a table type (TTYP), activates a CDS view (DDLS), activates a domain (DOMA), activates a data element (DTEL), activates a behavior definition (BDEF), activates a metadata extension (DDLX), activates a package (DEVC), activates a service definition (SRVD), activates a service binding (SRVB), activates a function module (FUGR), activates a behavior implementation (CLAS), activates the text elements of a program (PROG), activates the text elements of a function group (FUGR), activates the text elements of a class (CLAS), activates another object by its ADT type, activates several objects together.

**Parameters (`cloud`):**

- `object_type` — ABAP object type for routed compact operation. Names the object's type in the single form.
- `object_name` — Object name (single form). A function module is named GROUP|MODULE, its function group first, or the module alone with function_group_name.
- `function_group_name` — A function module's function group (single form, FUNCTION_MODULE).
- `object_adt_type` — ADT object type code (e.g. CLAS/OC, PROG/P) of the object (single form).
- `parentName` — With object_adt_type (single form): The function group the object belongs to; its address is built from it. Required for FUGR/FF (function, functionmodule, function_module, func), FUGR/I. With PROG/PX, the function group whose text elements are activated.
- `objects` — The objects activated together (list form).
- `preaudit` — Run pre-audit checks before activation.

### HandlerTransportCreate

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked.

**Available in:** cloud, onprem

**Parameters:**

- `transport_type` — Transport type.
- `description` (required) — Transport description.
- `target_system` — Target system id.
- `owner` — Transport owner user.
- `task_type` — Type given to the request's task: S Development/Correction (default), R Repair, X Unclassified.
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerTransportSortAndCompress

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Sorts the objects of a transport task and merges its duplicates.

**Available in:** cloud, onprem

**Parameters:**

- `transport_number` (required) — Number of the transport task to sort and compress.

### HandlerTransportMoveObjects

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Moves objects from one transport task to another, each at its position in the task it leaves.

**Available in:** cloud, onprem

**Parameters:**

- `transport_number` (required) — Number of the transport task that holds the entries.
- `target_number` (required) — Number of the transport task the entries move to.
- `objects` (required) — The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.

### HandlerLock

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Locks or unlocks a class (CLAS), locks or unlocks a program (PROG), locks or unlocks an include (PROG), locks or unlocks an interface (INTF), locks or unlocks a function group (FUGR), locks or unlocks a function module (FUGR), locks or unlocks a table (TABL), locks or unlocks a structure (TABL), locks or unlocks a table type (TTYP), locks or unlocks a CDS view (DDLS), locks or unlocks a domain (DOMA), locks or unlocks a data element (DTEL), locks or unlocks a package (DEVC), locks or unlocks a behavior definition (BDEF), locks or unlocks a behavior implementation (CLAS), locks or unlocks a metadata extension (DDLX), locks or unlocks a service definition (SRVD), locks or unlocks a service binding (SRVB), locks or unlocks the technical settings of a table (TABL), locks or unlocks the text elements of a program (PROG), locks or unlocks the text elements of a function group (FUGR), locks or unlocks the text elements of a class (CLAS) for editing. Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**Available in:** cloud, onprem

**Parameters:**

- `object_type` (required) — Object type. Supported: CLASS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, TABLE_TYPE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING, TABLE_SETTINGS, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `action` — lock (default): lock the object for editing; unlock: release the lock lock_handle names.
- `lock_handle` — unlock: the lock handle the lock gave.
- `super_package` — PACKAGE: accepted for compatibility; the lock uses the package's name.

**On ABAP Cloud (`cloud`):** Locks or unlocks a class (CLAS), locks or unlocks an interface (INTF), locks or unlocks a function group (FUGR), locks or unlocks a function module (FUGR), locks or unlocks a table (TABL), locks or unlocks a structure (TABL), locks or unlocks a table type (TTYP), locks or unlocks a CDS view (DDLS), locks or unlocks a domain (DOMA), locks or unlocks a data element (DTEL), locks or unlocks a package (DEVC), locks or unlocks a behavior definition (BDEF), locks or unlocks a behavior implementation (CLAS), locks or unlocks a metadata extension (DDLX), locks or unlocks a service definition (SRVD), locks or unlocks a service binding (SRVB), locks or unlocks the technical settings of a table (TABL), locks or unlocks the text elements of a function group (FUGR), locks or unlocks the text elements of a class (CLAS) for editing. Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**Parameters (`cloud`):**

- `object_type` (required) — Object type. Supported: CLASS, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE, TABLE, STRUCTURE, TABLE_TYPE, DDL, DOMAIN, DATA_ELEMENT, PACKAGE, BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION, SERVICE_DEFINITION, SERVICE_BINDING, TABLE_SETTINGS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS.
- `object_name` (required) — Object name. A function module is named GROUP|MODULE, its function group first.
- `action` — lock (default): lock the object for editing; unlock: release the lock lock_handle names.
- `lock_handle` — unlock: the lock handle the lock gave.
- `super_package` — PACKAGE: accepted for compatibility; the lock uses the package's name.

### HandlerUnitTestRun

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Runs the ABAP Unit tests of chosen test classes, of a repository object or of a package (DEVC), giving the run's id at once or the finished result of the test classes.

**Available in:** cloud, onprem

**Parameters:**

- `tests` — Test classes to run, each named by its global class and its local test class (exactly one of tests and target).
- `target` — What the run covers: an object (kind object, name, type) or a package (kind package, name, include_subpackages).
- `runner` — async (default): starts the run and returns its run_id, whose status and result are read by run_id; suited to long suites. sync (tests only): one request that runs every test class of each container_class and returns the finished result. A target run is async.
- `title` — Run title shown in ABAP Unit test logs; sent by the async runner.
- `context` — Run context label; sent by the async runner.
- `scope` — ABAP Unit test scope flags.
- `risk_level` — Allowed risk levels.
- `duration` — Allowed duration classes.

### HandlerProfileSchedule

**Half:** `@mcp-abap-adt/compact-modify`

**Description:** Creates the parameters of an ABAP profiler trace, scheduling it for a later profiled run of a class (CLAS) or a report (PROG).

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

**Description:** Runs an ABAP class (CLAS), runs an ABAP report (PROG).

**Available in:** cloud, onprem

**Parameters:**

- `target_type` (required) — Run target kind.
- `class_name` — Class to run.
- `program_name` — Program to run.
- `profiler_id` — The profiler id of a scheduled trace. Given, the run goes under that trace; absent, the run is plain.
- `background` — When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end.

**On ABAP Cloud (`cloud`):** Runs an ABAP class (CLAS).

**Parameters (`cloud`):**

- `target_type` (required) — Run target kind.
- `class_name` — Class to run.
- `profiler_id` — The profiler id of a scheduled trace. Given, the run goes under that trace; absent, the run is plain.
- `background` — When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end.

### HandlerDebugBreakpoints

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [debug] Sets the ABAP breakpoints of this debugging identity, syncs the ABAP or AMDP breakpoints, deletes an ABAP breakpoint, creates a watchpoint on a variable, lists the watchpoints, deletes a watchpoint.

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
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerDebugSession

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [debug] Checks whether another debugger holds this identity's debugging, listens for an ABAP debuggee, stops the ABAP listener, attaches an ABAP debuggee, detaches the debugger from the debuggee, terminates the ABAP debuggee, terminates the debugger, sets the debugger settings, starts an AMDP debug session, gets the AMDP session's events, stops the AMDP debug session, deletes an AMDP debuggee, ends the debug state.

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
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerDebugStep

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [debug] Steps into the call where the debuggee stands, steps over a statement, steps out of the current call, continues to the next stop, runs to a source position, jumps to a source position, sets the stack frame whose variables are read.

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
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerDebugMaintain

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [debug] Gets the debuggee's call stack, gets variables by name, gets a variable's members, gets the debuggee's memory sizes, creates a memory snapshot, sets a variable's value, gets an AMDP table variable's records.

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
- `detail` — How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer; "raw" what SAP sent.

### HandlerDebugBatch

**Half:** debugger tools of `@mcp-abap-adt/compact` (the write binaries; no `-ro` one)

**Description:** [debug] Begins recording the debugger calls at a stopped debuggee, ends the recording and sends the recorded debugger calls together, reads each recorded debugger call's outcome by its number. Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).

**Available in:** cloud, onprem

**Parameters:**

- `action` (required) — begin starts the debugger batch on the stopped ABAP debuggee or at the AMDP break; end sends the recorded calls and ends it; answers reads the last batch's answers by number, with number or numbers.
- `number` — answers: one batch number to read, at least 1.
- `numbers` — answers: several batch numbers to read, each at least 1, answered in the order given.

### HandlerBackgroundRunGet

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** [read-only] Reads one of the caller's background runs by its run handle, with the answer of a run that has ended.

**Available in:** all

**Parameters:**

- `run_handle` (required) — The run_handle a background run answered at its start.

### HandlerBackgroundRunList

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** [read-only] Lists the caller's background runs, running, finished and cancelled.

**Available in:** all

**Parameters:** none

### HandlerBackgroundRunDiscard

**Half:** background-run tools of `@mcp-abap-adt/lib` (the write binaries, where `HandlerProfileRun` is)

**Description:** [read-only] Discards a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted.

**Available in:** all

**Parameters:**

- `run_handle` (required) — The run_handle a background run answered at its start.

### HandlerLeftoverSessionList

**Half:** leftover-session tools of `@mcp-abap-adt/lib`, stdio binaries only (the list and the logoff in both)

**Description:** [read-only] Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks.

**Available in:** all

**Parameters:** none

### HandlerLeftoverSessionLogoff

**Half:** leftover-session tools of `@mcp-abap-adt/lib`, stdio binaries only (the list and the logoff in both)

**Description:** Logs off a leftover SAP session by its handle, releasing every lock it holds and deleting its record.

**Available in:** all

**Parameters:**

- `handle` (required) — The handle of a leftover session, as the list answers it.

### HandlerBatch

**Half:** batch mode of `@mcp-abap-adt/lib`, in every compact binary

**Description:** [read-only] Begins recording the calls of the tools that allow it, ends the recording and sends the recorded calls to SAP together, reads each recorded call's answer by its number. Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).

**Available in:** all

**Parameters:**

- `action` (required) — begin: switch into batch mode; end: send the recorded calls and leave batch mode; answers: read the last batch's answers by number (with number or numbers).
- `number` — answers only: one batch number to read (an integer of at least 1); give this or numbers, not both.
- `numbers` — answers only: several batch numbers to read, answered in the order given; give this or number, not both.

### HandlerAbapGitGet

**Half:** abapGit tools of `@mcp-abap-adt/lib` (`HandlerAbapGitGet` in every compact binary, `HandlerAbapGit` in the write binaries), always listed; a call on a system whose discovery does not list abapGit is refused `abapgit_not_served`

**Description:** [read-only] Reads the linked abapGit repositories, checks a remote repository, reads a repository's staging, checks a repository's connection to its remote, reads a repository file.

**Available in:** all

**Parameters:**

- `action` (required) — The read: repos (the linked repositories), external_repo (what a remote repository offers), staging (what changed), checks (the repository's connection to its remote), file (one file of the repository).
- `repository_key` — repos: only the repository with this key. staging: required, the repository. checks: required, the repository. file: required, the repository.
- `package_name` — repos: only the repository linked to this package.
- `url` — external_repo: required, the remote repository URL over HTTPS, without a user, a password, a query or a fragment.
- `filename` — file: required, the file name.
- `version` — file: required, local (the system's) or remote (the remote branch's).
- `detail` — repos: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer. external_repo: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer. staging: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.

**On ABAP Cloud (`cloud`):** [read-only] Reads the linked abapGit repositories, checks a remote repository, reads what a pull would change, reads a repository's staging, checks a repository's connection to its remote, reads a repository file, reads a run's error log.

**Parameters (`cloud`):**

- `action` (required) — The read: repos (the linked repositories), external_repo (what a remote repository offers), modified_objects (what a pull would change), staging (what changed), checks (the repository's connection to its remote), file (one file of the repository), error_log (a run's log).
- `repository_key` — repos: only the repository with this key. modified_objects: required, the repository. staging: required, the repository. checks: required, the repository. file: required, the repository. error_log: required, the repository.
- `package_name` — repos: only the repository linked to this package.
- `url` — external_repo: required, the remote repository URL over HTTPS, without a user, a password, a query or a fragment.
- `filename` — file: required, the file name.
- `version` — file: required, local (the system's) or remote (the remote branch's).
- `app_log_key` — error_log: required, the run log key the repository list answers for the repository's last run.
- `detail` — repos: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer. external_repo: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer. modified_objects: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer. staging: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer. error_log: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.

### HandlerAbapGit

**Half:** abapGit tools of `@mcp-abap-adt/lib` (`HandlerAbapGitGet` in every compact binary, `HandlerAbapGit` in the write binaries), always listed; a call on a system whose discovery does not list abapGit is refused `abapgit_not_served`

**Description:** Links a package (DEVC) to a remote repository, unlinks a repository from its package (DEVC), pulls a repository, pushes a commit to a remote branch, switches a repository's branch.

**Available in:** all

**Parameters:**

- `action` (required) — The write: link (link a package to a remote repository), unlink (end a repository's binding to its package), pull (import the remote branch), push (commit and push chosen objects), switch_branch (switch or create the repository's branch).
- `repository_key` — unlink: required, the repository. pull: required, the repository. push: required, the repository. switch_branch: required, the repository.
- `package_name` — link: required, the package linked.
- `url` — link: required, the remote repository URL over HTTPS.
- `branch` — link: required, the branch linked. switch_branch: required, the branch switched to.
- `transport_request` — link: the transport request that records the objects written. pull: the transport request that records the objects written.
- `objects` — push: required, the objects and files to commit, as staging with detail "medium" answers them.
- `comment` — push: required, the commit message.
- `author` — push: required, the commit author: name and email.
- `committer` — push: required, the committer: name and email.
- `create` — switch_branch: required, true creates the branch in the remote when it does not exist.
- `background` — link: When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end. pull: When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end. push: When true, the run goes on in the background on an ABAP session of its own and the call answers at once with a run_handle; read its answer later with HandlerBackgroundRunGet, and remove it with HandlerBackgroundRunDiscard. A started run cannot be stopped. No default: without it the call waits for the run to end.

**On ABAP Cloud (`cloud`):** Links a package (DEVC) to a remote repository, unlinks a repository from its package (DEVC), pulls a repository, pushes a commit to a remote branch, reads a remote branch's information.

**Parameters (`cloud`):**

- `action` (required) — The write: link (link a package to a remote repository), unlink (end a repository's binding to its package), pull (import the remote branch), push (commit and push chosen objects), branch_info (one remote branch for a package, SAP links and unlinks to answer it).
- `repository_key` — unlink: required, the repository. pull: required, the repository. push: required, the repository.
- `package_name` — link: required, the package linked. branch_info: required, the package SAP links to answer.
- `url` — link: required, the remote repository URL over HTTPS. branch_info: required, the remote repository URL over HTTPS.
- `branch` — link: required, the branch linked. branch_info: required, the branch read.
- `transport_request` — link: the transport request that records the objects written. pull: the transport request that records the objects written.
- `folder_logic` — link: cloud: how folders map to subpackages, FULL or PREFIX.
- `objects` — push: required, the objects and files to commit, as staging with detail "medium" answers them.
- `overwrite` — pull: cloud: the objects of modified_objects to overwrite with their remote version, each once, by type and name; a name the list holds under two types is refused, within one list or across both: SAP matches by name within each list, so a collision inside one list could take an object not named. SAP selects by name when its job runs, against the list as it stands then: of the objects outside the selection, the remote-only adds and updates are imported, and every other one (changes in the system, remote deletions, objects of other packages) keeps its system state; SAP leaves a package warning with action 5 (delete and re-create) out of every pull. Without it the job takes every other listed object.
- `comment` — push: required, the commit message.
- `author` — push: required, the commit author: name and email.
- `committer` — push: required, the committer: name and email.
- `detail` — branch_info: How much of the answer to return: "terse" (default) what a next call needs: the identifiers and a short description; "medium" every item the tool read, with its main properties; "full" the tool's whole answer.

## Streamable HTTP Binaries

`mcp-abap-adt-compact-sse`, `mcp-abap-adt-compact-sse-ro` (SSE) serve the tools of `mcp-abap-adt-compact`, `mcp-abap-adt-compact-ro` without `HandlerLeftoverSessionList`, `HandlerLeftoverSessionLogoff`, which are stdio's only. `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-http-ro` (Streamable HTTP) serve the same tools, and beside them:

- **The `state_handle` argument.** Every tool they serve declares one more, optional argument, `state_handle` (string): "The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance." A tool whose own schema declares `state_handle` (the debugger tools) keeps its own declaration, required where it is required. No stdio or SSE binary declares it; the parameters listed per tool above are the stdio ones, without it.
- **The long session:** `HandlerSession`, served by no stdio or SSE binary. Its parameters below are the ones these binaries register, `state_handle` included.

### HandlerSession (Streamable HTTP)

**Description:** [read-only] Opens a long session on this server, closes a long session.

**Parameters:**

- `action` (required) — open: open a long session and answer its state_handle. close: close the long session the state_handle names.
- `state_handle` — The state_handle a long session, a lock or a batch answered: the call runs on the server instance that holds that state. Without it the call runs on a new instance.

