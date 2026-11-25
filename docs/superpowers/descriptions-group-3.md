# Descriptions: group 2 (the last four) and group 3

The old and the new description of every tool this branch moves, side by side.

## Group 2: the last four writer tools

These four are assembled and left out of the tie (owner); their check is the final vector measurement.

### GetStructuresList

| | |
|---|---|
| Old | [read-only] Recursively list the structures embedded in an ABAP structure (.INCLUDE / append), as a tree. Takes structure_name (one structure: its tree) or structure_names (several structures: one entry per structure, in the order given, each its tree answer or { structure_name, error }). Works on BASIS 7.50 and later, where the DDIC structure/table endpoints it reads exist; legacy systems (BASIS < 7.50) refuse it (issue #207). Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. |
| New | [read-only] Reads the structures embedded in one or more ABAP structures, through their includes and appends, down to the last, at the version asked. The name of the structure read and whether its appends could be found. The appends SAP refused to read are named. For the structure itself and for each structure it embeds: its name, whether it is an include or an append, the component it is embedded under, whether it embeds itself again and whether SAP refused to read it. What SAP answered for each structure it refused to read. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. |

### GetEnhancements

| | |
|---|---|
| Old | [read-only] Lists the enhancements (enhancement implementations) of the program, include, function group or class named by object_name and object_type, read at its active version. Takes object_name and object_type (one object: its enhancements) or objects (several objects: one entry per object, in the order given, each its enhancements answer or { object_name, object_type, error }). |
| New | [read-only] Lists the enhancement implementations of ABAP programs, includes, function groups or classes at their active version, and of their includes when asked. For each object read: its type and name, the main program of an include, how many enhancements it has and the total found across its includes. For each enhancement: its name, its type and its description. What SAP answered to each read it refused while finding the kind of an object. The includes whose enhancements SAP refused to read, with what it answered. |

### GetTransport

| | |
|---|---|
| Old | [read-only] Reads the transport request or transport task named by transport_number; kind says which: 'request' or 'task'. A transport request answers its header (number, description, type, status, owner, target system) and its tasks, each with number, owner, status, description and object count. A transport task answers its header (number, parent request, description, type, status, owner), its parent request (number, type, status, target system), and its objects, each with pgmid, type, name and position, with their count; an object SAP lists nameless or untyped is listed apart, under incomplete_objects, with the fields it has, and counted. |
| New | [read-only] Reads an ABAP transport or one of its tasks by its number, and says which of the two it is. For a transport: its number, description, type, status, owner and target system and how many tasks it has. For each of its tasks: its number, owner, status, description and how many objects it holds. For a task: its number, its transport, description, type, status and owner, its transport's number, type, status and target system and how many objects it holds. For each of its objects: its program ID, type, name and position. The objects SAP lists only in part, with what it gives of each. |

### RuntimeListFeeds

| | |
|---|---|
| Old | [read-only] [runtime] Reads the ADT runtime feed named by feed_type: with feed_type "dumps", the ABAP short dumps (runtime errors) of the program or object named by object_name, of the user named by user, in the time range from–to, filtered also by runtime error, exception, package and application component; with "system_messages" or "gateway_errors", the system messages or SAP Gateway errors of the user and time range; with "descriptors" (the default) or "variants", the feeds and their variants. Entries come newest first; each dump carries its dump_id. When more entries remain, next_to is the `to` that reads on; incomplete_second names a second holding more entries than SAP answers in one request. Takes feed_type (one feed: its answer) or feed_types (several feeds with the same filters: one entry per feed, in the order given, each its answer or { feed_type, error }). By default (detail terse) TSV under "# feed" and "# count" lines, next_to and incomplete_second as "#" lines: descriptors id, title, category; variants feed, title, query, is_default; dumps dump_id, updated, title; system messages id, createdOn, author, title; gateway errors opid, detail_kind, dateTime, type, shortText, username. With detail medium or full every field as JSON. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. |
| New | [read-only] Reads the runtime feeds of an ABAP system: its short dumps, system messages or SAP Gateway errors by user and time, or the feeds there are and their variants. For the feed read: how many items it holds, where the next read starts when more remain and the second holding more items than one read gives. For each feed there is: its ID, its title and its category. For each variant of a feed: its feed, its title, its query and whether it is the default. For each short dump, newest first: its dump ID, when it happened and its title. For each system message: its ID, when it was created, its author and its title. For each SAP Gateway error: its operation ID, the kind of its detail, when it happened, its type, its short text and the user it happened to. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. |


## Group 3: the source readers

### GetClass

| | |
|---|---|
| Old | [read-only] Reads the ABAP class named by class_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of an ABAP class at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetProgram

| | |
|---|---|
| Old | [read-only] Reads the ABAP program (report) named by program_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. On ABAP Cloud, the programs are SAP's standard programs. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of an ABAP program (report), on ABAP Cloud one of SAP's standard programs, at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetInterface

| | |
|---|---|
| Old | [read-only] Reads the ABAP interface named by interface_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of an ABAP interface at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetInclude

| | |
|---|---|
| Old | [read-only] Reads the ABAP include named by include_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of an ABAP include at the version asked, or its metadata. Its source code. With a range asked, only that part of the source. Or, when asked, its metadata: its package, person responsible and description. |

### GetFunctionModule

| | |
|---|---|
| Old | [read-only] Reads the ABAP function module named by function_module_name, BAPI or RFC-enabled ones included, in the function group named by function_group_name: its source code, which declares the parameter signature (part "source", the default), or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. The module's metadata is read first, and the part is answered only when the function group named holds the module. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of an ABAP function module, BAPI and RFC-enabled ones too, with its parameter signature, at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetFunctionInclude

| | |
|---|---|
| Old | [read-only] Reads the include named by include_name of the ABAP function group named by function_group_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata"), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of an include of an ABAP function group at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetDdl

| | |
|---|---|
| Old | [read-only] Reads the CDS view (or classic DDL view) named by ddl_name in one request: its DDL source (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of a CDS view or classic DDL view at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetBehaviorDefinition

| | |
|---|---|
| Old | [read-only] Reads the RAP behavior definition named by behavior_definition_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of a RAP behavior definition at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetBehaviorImplementation

| | |
|---|---|
| Old | [read-only] Reads the RAP behavior implementation (its class) named by behavior_implementation_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of a RAP behavior implementation class at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetMetadataExtension

| | |
|---|---|
| Old | [read-only] Reads the CDS metadata extension named by metadata_extension_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of a CDS metadata extension at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetServiceDefinition

| | |
|---|---|
| Old | [read-only] Reads the service definition named by service_definition_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of a service definition at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description. |

### GetLocalDefinitions

| | |
|---|---|
| Old | [read-only] Reads the local definitions include (the definitions include) of the ABAP class named by class_name, at the version asked. Returns { class_name, version, part: 'source', source }. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of the local definitions include of an ABAP class at the version asked. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. |

### GetLocalMacros

| | |
|---|---|
| Old | [read-only] Reads the local macros include of the ABAP class named by class_name, at the version asked. Returns { class_name, version, part: 'source', source }. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of the local macros include of an ABAP class at the version asked. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. |

### GetLocalTestClass

| | |
|---|---|
| Old | [read-only] Reads the local test classes include of the ABAP class named by class_name, at the version asked. Returns { class_name, version, part: 'source', source }. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of the local test classes include of an ABAP class at the version asked. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. |

### GetLocalTypes

| | |
|---|---|
| Old | [read-only] Reads the local types include (the implementations include) of the ABAP class named by class_name, at the version asked. Returns { class_name, version, part: 'source', source }. With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source). |
| New | [read-only] Reads the source of the local types (implementations) include of an ABAP class at the version asked. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. |

### GetEnhancementImpl

| | |
|---|---|
| Old | [read-only] Retrieve the active source code of a specific enhancement implementation by its name and enhancement spot. |
| New | [read-only] Reads the active source of an ABAP enhancement implementation, by its name and enhancement spot. The enhancement spot, implementation's name and its source code. |

### GetObjectDraft

| | |
|---|---|
| Old | [read-only] Reads the active, inactive and working versions of each part of the object named by object_type and object_name, together, and tells whether it holds an unactivated change and whose. Answers { object_type, object_name, has_draft, parts }: per part (main, the source or metadata; for CLASS and BEHAVIOR_IMPLEMENTATION the includes implementations, definitions, testclasses, macros in place of the main source) draft states whose unactivated change it holds — own (the caller's), other (another user's), undetermined (its three ETags in another pattern), and the active state when its versions are equal — with changed_at (the change's last write, UTC) and age_seconds by the server's clock for own and other (null for METADATA_EXTENSION and SERVICE_DEFINITION, whose ETag carries a constant time), and the three ETags (active, inactive, workspace); has_draft is true when any part holds a change of a user's |
| New | [read-only] Tells whether an ABAP class, interface, program, CDS view, table or other development object holds an unactivated change, and whose. Whether the object holds an unactivated change of any user. For each part, its main source or metadata or a class include: its name, its state (active, the caller's change, another user's change or undetermined), when that change was last written, how many seconds ago and the ETags of its active, inactive and working versions. |

### GetObjectVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source code of the object version named by content_uri, an entry of an object's version history, for the object type named by object_type. |
| New | [read-only] Reads the source of one version of an ABAP class, program, interface, function module, table, CDS view or other versioned object, from its version history. The reference of the version read and its source code. |

### GetTextElements

| | |
|---|---|
| Old | [read-only] Reads the text elements of the program, function group or class named by object_kind and object_name, in the object's original language, at the version asked: text symbols (key, text, maximum length), selection texts (name, text, and whether the text is the dictionary's label) and the list and column headings. A class has text symbols only. Reads the parts named by parts, every part of the object by default. |
| New | [read-only] Reads the text elements of an ABAP program, function group or class in its original language at the version asked: text symbols, selection texts and headings. For each text symbol: its key, its text and its maximum length. For each selection text: its name, its text and whether it is the dictionary's label. Its headings: the list heading, the first of the four headings below it, the second, the third and the fourth. |

### GetAbapGitFile

| | |
|---|---|
| Old | [read-only] Reads one file of the repository: the system's version (local) or the remote branch's (remote). Answers the file's text as it is. |
| New | [read-only] Reads one file of an abapGit repository, as the system holds it or as the remote branch holds it. The file's text as it is. |


### The per-type version tools

### GetClassVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the ABAP class named by class_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of an ABAP class. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetClassVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the ABAP class version named by content_uri, an entry of the ABAP class's version history. |
| New | [read-only] Reads the source of one version of an ABAP class, from its version history. The reference of the version read and its source code. |

### GetProgramVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the ABAP program named by program_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. On ABAP Cloud, the programs are SAP's standard programs. |
| New | [read-only] Lists the version history of an ABAP program, on ABAP Cloud one of SAP's standard programs. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetProgramVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the ABAP program version named by content_uri, an entry of the ABAP program's version history. On ABAP Cloud, the programs are SAP's standard programs. |
| New | [read-only] Reads the source of one version of an ABAP program, on ABAP Cloud one of SAP's standard programs, from its version history. The reference of the version read and its source code. |

### GetInterfaceVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the ABAP interface named by interface_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of an ABAP interface. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetInterfaceVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the ABAP interface version named by content_uri, an entry of the ABAP interface's version history. |
| New | [read-only] Reads the source of one version of an ABAP interface, from its version history. The reference of the version read and its source code. |

### GetFunctionModuleVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the ABAP function module named by function_module_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of an ABAP function module. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetFunctionModuleVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the ABAP function module version named by content_uri, an entry of the ABAP function module's version history. |
| New | [read-only] Reads the source of one version of an ABAP function module, from its version history. The reference of the version read and its source code. |

### GetTableVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the ABAP table named by table_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of an ABAP table. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetTableVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the ABAP table version named by content_uri, an entry of the ABAP table's version history. |
| New | [read-only] Reads the source of one version of an ABAP table, from its version history. The reference of the version read and its source code. |

### GetStructureVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the ABAP structure named by structure_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of an ABAP structure. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetStructureVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the ABAP structure version named by content_uri, an entry of the ABAP structure's version history. |
| New | [read-only] Reads the source of one version of an ABAP structure, from its version history. The reference of the version read and its source code. |

### GetDdlVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the CDS view (DDL source) named by ddl_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of a CDS view (DDL source). For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetDdlVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the CDS view (DDL source) version named by content_uri, an entry of the CDS view (DDL source)'s version history. |
| New | [read-only] Reads the source of one version of a CDS view (DDL source), from its version history. The reference of the version read and its source code. |

### GetBehaviorDefinitionVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the RAP behavior definition named by behavior_definition_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of a RAP behavior definition. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetBehaviorDefinitionVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the RAP behavior definition version named by content_uri, an entry of the RAP behavior definition's version history. |
| New | [read-only] Reads the source of one version of a RAP behavior definition, from its version history. The reference of the version read and its source code. |

### GetMetadataExtensionVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the CDS metadata extension named by metadata_extension_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of a CDS metadata extension. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

### GetMetadataExtensionVersionSource

| | |
|---|---|
| Old | [read-only] Reads the source of the CDS metadata extension version named by content_uri, an entry of the CDS metadata extension's version history. |
| New | [read-only] Reads the source of one version of a CDS metadata extension, from its version history. The reference of the version read and its source code. |

### GetTableTypeVersions

| | |
|---|---|
| Old | [read-only] Lists the version history of the ABAP table type named by table_type_name: each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source. |
| New | [read-only] Lists the version history of an ABAP table type. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description. |

