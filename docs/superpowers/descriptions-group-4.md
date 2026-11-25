# Group 4 — metadata readers: old and new descriptions

Plan step 10.6/10.7, group 4. Each tool: the description before (HEAD `7cef3eade`) and the assembled one.

## GetDomain

- Old: [read-only] Reads the ABAP domain named by domain_name in one request: its ADT metadata document (definition, package, description), at the version asked. Returns it under `metadata`, with `part: "metadata"`.
- New: [read-only] Reads an ABAP domain at the version asked, with its data type, length, output format, value table, fixed values, package and description. SAP's data as it came.

## GetDataElement

- Old: [read-only] Reads the ABAP data element named by data_element_name in one request: its ADT metadata document (definition, package, description), at the version asked. Returns it under `metadata`, with `part: "metadata"`.
- New: [read-only] Reads an ABAP data element at the version asked, with its domain or built-in type, its labels, search help, package and description. SAP's data as it came.

## GetStructure

- Old: [read-only] Reads the ABAP structure named by structure_name in one request: its definition with its fields, as source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).
- New: [read-only] Reads an ABAP structure at the version asked, with its definition source, or its package, person responsible and description. SAP's data as it came.

## GetTable

- Old: [read-only] Reads the ABAP database table named by table_name in one request: its definition with its fields, as source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).
- New: [read-only] Reads an ABAP database table at the version asked, with its definition source, or its package, person responsible and description. SAP's data as it came.

## GetTableType

- Old: [read-only] Reads the ABAP table type named by table_type_name in one request: its ADT metadata document (row type, access, key, package, description), at the version asked. Returns it under `metadata`, with `part: "metadata"`.
- New: [read-only] Reads an ABAP table type at the version asked, with its element type, access, key, package and description. SAP's data as it came.

## GetTableSettings

- Old: [read-only] Reads the technical settings of the database table named by table_name, at the version asked: data class, size category, buffering (allowed, type, number of key fields), storage type, sharing type, load unit, translation, logging, and the table's description; on ABAP Cloud also whether AMDP may write to the table.
- New: [read-only] Reads the technical settings of an ABAP database table at the version asked: its description, data class, size category, buffering, storage type, sharing type, load unit, translation, logging and whether AMDP may write to it on ABAP Cloud.

## GetFunctionGroup

- Old: [read-only] Reads the ABAP function group named by function_group_name in one request: its ADT metadata document (package, description, contents), at the version asked. Returns it under `metadata`, with `part: "metadata"`.
- New: [read-only] Reads an ABAP function group at the version asked, with its package, description and contents. SAP's data as it came.

## GetMessageClassMessage

- Old: [read-only] Reads the message numbered msgno of the ABAP message class (MSAG/T100) named by message_class_name in one request, from the active version of the class. Answers the one message under `message`: its number (msgno), text (msgtext), self-explanatory flag (selfexplainatory), long-text flag (documented), last changer (lastchangedby), change time (lastmodified), and every other field the system gives the message. A number absent from the class is refused as missing.
- New: [read-only] Reads one message of an ABAP message class at its active version, with its number, text, self-explanatory and long-text flags, last changer and change time. SAP's data as it came.

## GetServiceBinding

- Old: [read-only] Reads the OData service binding named by service_binding_name in one request, at its active version: its binding document (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), each in the response_format given. Returns the part read.
- New: [read-only] Reads an OData service binding at its active version, with its binding definition, or its package, person responsible and description, in the format asked. SAP's data as it came.

## ListServiceBindingTypes

- Old: [read-only] Lists the available service binding types (for example ODataV2/ODataV4) from the ADT Business Services endpoint, in the response_format given.
- New: [read-only] Lists the service binding types the system offers, such as OData V2 and OData V4, in the format asked. SAP's data as it came.

## GetServiceBindingPreviewUrl

- Old: [read-only] Build the browser URL that previews a published service binding, and the service and $metadata URLs beside it. Answers: "open the service in a browser", "preview this service binding", "what is the OData URL of this binding". Reads the active binding for the service, version and protocol, and the active service definition for the entity sets; the preview URL needs an entity set, and the answer names what is missing. For a published binding it also reads the $metadata of the service once and answers live: true when the service answers 200, or live: false with the status (live_status) and the words (live_text) SAP answered — on ABAP Cloud a publication is a background job of SAP, and the service answers 403, blocked by UCON, until that job ends. A Web API binding answers the service URLs alone. Over RFC, the URLs are answered as their paths and query, to prefix with the HTTP origin of the system.
- New: [read-only] Builds the Fiori preview URL of a published OData service binding, with its service and $metadata URLs: its service's live state, OData protocol, service, service definition, service version, entity sets, binding category, client, logon language, associations, service URL, service URL source, $metadata URL, annotation URL, preview URL, preview descriptor, notes, whether it is published, whether the system's HTTP origin is known, what the preview URL still needs and the failure of reading the system's client and language.

## GetEnhancementSpot

- Old: [read-only] Retrieve metadata and list of implementations for a specific enhancement spot, at its active version.
- New: [read-only] Reads an enhancement spot at its active version: its name, description, type, package and interface; for each BAdI definition: its name, short text and interface; for each related link: its address, relation, media type and title.

## GetObjectInfo

- Old: [read-only] Returns the object tree of the package (DEVC), class (CLAS), program (PROG), function group (FUGR) or other object named by parent_type and parent_name. Shows root, group nodes, and terminal leaves up to maxDepth. With enrich=true each node also carries its description and package, from a repository search. Takes parent_type and parent_name (one object: its tree) or objects (several objects: one tree per object, in the order given; a failed one as { OBJECT_TYPE, OBJECT_NAME, error }). Read in ADT batch envelopes: per tier the root node structures of its nodes, then their type nodes; with enrich, the search of every node last. + the long-run advice (withLongToolAdvice)
- New: [read-only] Reads the repository browser of a package, class, program, function group or other repository object, with descriptions and packages when asked: for each object: its type, name, description, package and objects it holds, down to the depth asked; for each object whose read failed: its type, name and failure. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

## GetNodeStructureLow

- Old: [low-level] Fetch node structure from ADT repository. Used for object tree navigation and structure discovery.
- New: [low-level] Reads one level of the repository browser of a package, class, program or other repository object, at its root or the node asked: whether SAP could load the level and what an empty package level means; for each object: its name, type, description, technical name and ADT URI; for each child node: its type and node ID.

## GetVirtualFoldersLow

- Old: [low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.
- New: [low-level] Reads the virtual folders that group ABAP repository objects by package, group, type and other facets, for a name pattern. SAP's data as it came.

## GetObjectVersionDiff

- Old: [read-only] Compares the two object versions named by content_uri_from and content_uri_to, entries of an object's version history, for the object type named by object_type: returns the unified diff (jsdiff) of their sources.
- New: [read-only] Compares two versions of a class, program, CDS view or other source object, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetClassVersionDiff

- Old: [read-only] Compares the two ABAP class versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.
- New: [read-only] Compares two versions of the same ABAP class, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetProgramVersionDiff

- Old: [read-only] Compares the two ABAP program versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources. On ABAP Cloud, the programs are SAP's standard programs.
- New: [read-only] Compares two versions of the same ABAP program, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetInterfaceVersionDiff

- Old: [read-only] Compares the two ABAP interface versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.
- New: [read-only] Compares two versions of the same ABAP interface, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetFunctionModuleVersionDiff

- Old: [read-only] Compares the two ABAP function module versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.
- New: [read-only] Compares two versions of the same ABAP function module, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetTableVersionDiff

- Old: [read-only] Compares the two ABAP table versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.
- New: [read-only] Compares two versions of the same ABAP table, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetStructureVersionDiff

- Old: [read-only] Compares the two ABAP structure versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.
- New: [read-only] Compares two versions of the same ABAP structure, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetDdlVersionDiff

- Old: [read-only] Compares the two CDS view (DDL source) versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.
- New: [read-only] Compares two versions of the same CDS view (DDL source), taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetBehaviorDefinitionVersionDiff

- Old: [read-only] Compares the two RAP behavior definition versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.
- New: [read-only] Compares two versions of the same RAP behavior definition, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

## GetMetadataExtensionVersionDiff

- Old: [read-only] Compares the two CDS metadata extension versions named by content_uri_from and content_uri_to, entries of its version history: answers the unified diff of their sources.
- New: [read-only] Compares two versions of the same CDS metadata extension, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.
