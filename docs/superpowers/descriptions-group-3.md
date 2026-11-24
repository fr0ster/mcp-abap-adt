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

