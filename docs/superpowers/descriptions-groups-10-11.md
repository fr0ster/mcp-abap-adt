# Tool descriptions, groups 10–11: old and new

Group 10 assembles the compact tools; group 11 removes the allowlist. Each compact action, operation or part is stated by its function, its facts the full tool's it maps to. The owner's decision during the round: a check, an activation or a validation states its function alone, without the verdict facts. The old text is the head `01d8db165`; the new is this branch, as the regenerated tool pages list them (without the batch sentence a server appends).

## Compact tools

### HandlerAbapGit

**Old:** Changes abapGit repositories and their remotes, one write per action: link(package_name*, url*, branch*, transport_request) links the package to the remote repository; on premise it also imports every object of the branch; unlink(repository_key*) ends the repository's binding to its package; the objects stay; pull(repository_key*, transport_request) imports every object changed in the remote branch the repository is linked on; on premise it overwrites local changes and objects of other packages, and when the SAP request or its response is lost mid-import (an SSE or stdio close logs the connection off) the outcome is unknown to this server and what SAP does then is unverified (the staging action shows the current differences, whichever writes made them); on cloud SAP runs it as its own job, which runs to its end whatever happens to the connection, its objects are inactive, and it brings every object modified_objects lists to its remote version, a package warning with action 5 (delete and re-create) excepted, or with overwrite selects by name: of the objects outside the selection, the remote-only adds and updates are imported, and every other one (changes in the system, remote deletions, objects of other packages) keeps its system state; push(repository_key*, objects*, comment*, author*, committer*) commits the chosen objects and pushes the commit; on cloud SAP runs it as its own job; switch_branch(repository_key*, branch*, create*) switches the branch, creating it in the remote with create true. Answers facts only. Each argument is described with the actions that take it.

**New:** Changes abapGit repositories and their remotes: links a package to a remote, unlinks a package, pulls, pushes and switches the branch. action link: links an ABAP package to a remote abapGit repository on a branch and imports the branch's objects into it, recorded in a transport: SAP's status and whether SAP made the change or accepted it as its own job; for each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it. action unlink: unlinks an abapGit repository by its key, keeping its objects in the system and its remote as it is. action pull: pulls an abapGit repository from the branch it is linked on, importing every object changed in the remote, recorded in a transport: SAP's status and whether SAP made the change or accepted it as its own job; for each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it. action push: commits the objects and files chosen from an abapGit repository's staging, with its comment, author and committer, and pushes the commit to its remote branch: SAP's status and whether SAP made the change or accepted it as its own job. action switch_branch: switches an abapGit repository to a branch, creating the branch in the remote first when asked: SAP's status and whether SAP made the change or accepted it as its own job.

### HandlerAbapGitGet

**Old:** [read-only] Reads abapGit repositories, one read per action: repos(package_name, repository_key, detail) the linked repositories: key, package, branch, remote URL and on cloud the run state (status, status text, run log key); external_repo(url*, detail) the access mode and the branches of the remote repository at url; staging(repository_key*, detail) the unstaged, staged and ignored objects with their files, and the proposed author and committer; checks(repository_key*) SAP's status of the connection to the remote; a refusal with SAP's message key and on cloud the git host's HTTP status; file(repository_key*, filename*, version*) the text of one file, local or remote. Answers facts only. Each argument is described with the actions that take it.

**New:** [read-only] Reads abapGit repositories: the linked ones, a remote, the staged objects, the connection to a remote and a file. action repos: lists the abapGit repositories linked in the system, or the one with a key or of one package: for each repository linked: its key, its package, its branch, its remote URL and the state of its last pull or push on the cloud (blank initial, R running, S, W, E or A ended). action external_repo: checks an external git repository for abapGit before it is linked: its access and its branches: whether the remote repository is public or private; for each branch of the remote repository: its name and whether it is the head. action staging: gets the abapGit staging of a linked repository: what changed, to choose what a push commits: the author and the committer SAP proposes; for each changed file left unstaged, each staged file and each ignored file: its object's type, its object's name, its object's package, its file name, its state in the system and its state in the remote. action checks: checks that the system reaches an abapGit repository's remote and is let in. action file: reads one file of an abapGit repository, as the system holds it or as the remote branch holds it: the file's text as it is.

### HandlerActivate

**Old:** Activates the object named by object_name and object_type (or object_adt_type), or the objects named by objects, in one request. Single form (object_name*, object_type or object_adt_type*): object_type is enough for CLASS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, TABLE_TYPE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, METADATA_EXTENSION, PACKAGE, SERVICE_DEFINITION, SERVICE_BINDING, BEHAVIOR_IMPLEMENTATION, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS and CLASS_TEXT_ELEMENTS; FUNCTION_MODULE(object_name* as GROUP|MODULE, or object_name* with function_group_name*) is activated under its function group; any other type takes object_adt_type (e.g. "CLAS/OC"), with parentName for a part of a function group (FUGR/FF, FUGR/I). List form (objects[].name*, objects[].type*, objects[].parentName, objects[].uri); an object of FUGR/FF, FUGR/I is listed with objects[].parentName set to its function group. One object of CLASS, PROGRAM, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, METADATA_EXTENSION or BEHAVIOR_IMPLEMENTATION (by object_type or its ADT type code) is activated directly and answers the activation verdict. Every other call starts an activation run and answers { run_id }: the id of the accepted run, whose status and messages are read by that id. Where the system's discovery leaves out the activation runs (SAP_BASIS 751, 7.40), that call answers SAP's refusal; a group activation there is ActivateObjects (the full set) or ActivateObjectLow (the low handlers group).

**New:** Activates the ABAP repository object named, by its type or its ADT type, or the objects listed, at once or by an activation run it starts. object_type: CLASS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, TABLE_TYPE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, METADATA_EXTENSION, PACKAGE, SERVICE_DEFINITION, SERVICE_BINDING, FUNCTION_MODULE(object_name* as GROUP|MODULE, or object_name* with function_group_name*), BEHAVIOR_IMPLEMENTATION, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS.

### HandlerBackgroundRunDiscard

**Old:** [read-only] Ends the run named by run_handle: a running read is cancelled and its session logged off; a finished run's answer is deleted; a running code run is refused.

**New:** [read-only] Ends a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted. Its run handle and whether it was cancelled or its answer deleted.

### HandlerBackgroundRunGet

**Old:** [read-only] Reads one of your background runs by its run_handle: running; finished with what the run tool answered (the system answer as it is, an error included); or cancelled. A read run's finished or cancelled answer is answered once and then deleted, so a lost answer is read again by starting the read again; a code run's answer is kept until it is discarded.

**New:** [read-only] Reads one of the caller's background runs by its run handle, with the answer of a run that has ended. Its run handle, whether it is running, finished or cancelled, the tool it runs, the object it runs, when it started, when it ended and what its tool answered once the run ended.

### HandlerBackgroundRunList

**Old:** [read-only] Lists your background runs: run_handle, tool, object, when it started, and its state: running, finished or cancelled. A run's output is read by its run_handle; a read run leaves the list once its answer was read.

**New:** [read-only] Lists the caller's background runs, running, finished and cancelled. For each run: its run handle, whether it is running, finished or cancelled, the tool it runs, the object it runs, when it started and when it ended.

### HandlerBatch

**Old:** [read-only] action 'begin': Starts batch mode on this server. In batch mode each call of a tool marked recordable is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle: over Streamable HTTP send it as the state_handle argument of every call of the batch (or in the x-mcp-state-handle header). action 'end': Sends the recorded calls in one envelope with the credentials in force and ends batch mode. Splits SAP's answer into each call's parts and answers the number of recorded calls, of requests sent and of parts received; when sending fails, the parts received differ from the requests sent or the answer fails to split, answers that error, and every number of the batch then answers it. action 'answers' (with number or numbers): Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown.

**New:** [read-only] Records the calls of the tools that allow it and sends them to SAP together, then reads each call's answer by its number. action begin: starts recording the calls of the tools that allow it, each under the next number, to send them together: that recording is on and the state handle: send it as the state_handle argument of every call (or in the x-mcp-state-handle header). action end: sends the recorded calls to SAP together, with the credentials in force, and splits SAP's answer by call: how many calls were recorded, how many were sent and how many parts SAP's answer held. action answers: reads the answer of each recorded call of the last sending, by its number: for each number asked: the number, whether it is an error, that the number is unanswered and why; for each block of the answer of a number: its kind, its text, its annotations and its metadata; for each part of SAP's answer a number kept: its status, its status text, its headers and its body.

### HandlerCdsUnitTestResult

**Old:** [read-only] Reads the result of the CDS unit test run named by run_id*, in one request (GET /sap/bc/adt/abapunit/results/{run_id}), and answers { success, run_id, run_result }: run_result is the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. Optional: with_navigation_uris, format (abapunit or junit).

**New:** [read-only] Reads the result of a CDS unit test run by its id. The run's id and the run's result as SAP gave it.

### HandlerCdsUnitTestStatus

**Old:** [read-only] Reads the status of the CDS unit test run named by run_id. Required: run_id*. Optional: with_long_polling. Response: JSON.

**New:** [read-only] Reads the status of a CDS unit test run by its id. The run's id, whether the run finished and SAP's progress status of the run.

### HandlerCheckRun

**Old:** [read-only] Runs a syntax check on the object named by object_type and object_name. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), METADATA_EXTENSION(object_name*). source_code checks unsaved source given in the call, for CLASS, STRUCTURE and DDL.

**New:** [read-only] Checks the syntax of the ABAP repository object of the type object_type names, as stored or as the source given. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), METADATA_EXTENSION(object_name*).

### HandlerCreate

**Old:** Creates the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …): sends the create request for its type with the given parameters, and answers SAP's result. The object is created inactive. object_type required: PACKAGE(package_name*, super_package), DOMAIN(domain_name*, package_name*), DATA_ELEMENT(data_element_name*, package_name*), TRANSPORT(description*), TABLE(table_name*, package_name*), STRUCTURE(structure_name*, package_name*), TABLE_TYPE(table_type_name*, package_name*), DDL(ddl_name*, package_name*), SERVICE_DEFINITION(service_definition_name*, package_name*), SERVICE_BINDING(service_binding_name*, service_definition_name*, package_name*), CLASS(class_name*, package_name*), PROGRAM(program_name*, package_name*), INCLUDE(include_name*, package_name*), INTERFACE(interface_name*, package_name*), FUNCTION_GROUP(function_group_name*, package_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, package_name*), METADATA_EXTENSION(name*, package_name*). Optional for every type: description, transport_request.

**New:** Creates the ABAP repository object of the type object_type names, inactive, or a transport. Whether SAP took the change. For TRANSPORT: the number of the transport created, the number of its task, SAP's refusal of the task type and what is left to do when the task stays untyped. object_type required: PACKAGE(package_name*, super_package), DOMAIN(domain_name*, package_name*), DATA_ELEMENT(data_element_name*, package_name*), TRANSPORT(description*), TABLE(table_name*, package_name*), STRUCTURE(structure_name*, package_name*), TABLE_TYPE(table_type_name*, package_name*), DDL(ddl_name*, package_name*), SERVICE_DEFINITION(service_definition_name*, package_name*), SERVICE_BINDING(service_binding_name*, service_definition_name*, package_name*), CLASS(class_name*, package_name*), PROGRAM(program_name*, package_name*), INCLUDE(include_name*, package_name*), INTERFACE(interface_name*, package_name*), FUNCTION_GROUP(function_group_name*, package_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, package_name*), METADATA_EXTENSION(name*, package_name*).

### HandlerDebugBatch

**Old:** action 'begin': Starts recording the debugger calls at the stopped ABAP debuggee or at the AMDP break, each under the next number, to send them together. That recording is on and the state handle: send it as the state_handle argument of every call (or in the x-mcp-state-handle header). action 'end': Sends the recorded debugger calls together on the session they were recorded on, and splits SAP's answer by call. How many calls were recorded, how many were sent and how many parts SAP's answer held. action 'answers' (with number or numbers): Reads the outcome of each recorded debugger call of the last sending, by its number. For each number asked: the number, whether it is an error, that the number is unanswered and why. For each block of the answer of a number: its kind, its text, its annotations and its metadata. For each part of SAP's answer a number kept: its status, its status text, its headers and its body.

**New:** [debug] Records the debugger calls at the stopped ABAP debuggee or the AMDP break and sends them together, then reads each call's outcome by its number. action begin: starts recording the debugger calls at the stopped ABAP debuggee or at the AMDP break, each under the next number, to send them together: that recording is on and the state handle: send it as the state_handle argument of every call (or in the x-mcp-state-handle header). action end: sends the recorded debugger calls together on the session they were recorded on, and splits SAP's answer by call: how many calls were recorded, how many were sent and how many parts SAP's answer held. action answers: reads the outcome of each recorded debugger call of the last sending, by its number: for each number asked: the number, whether it is an error, that the number is unanswered and why; for each block of the answer of a number: its kind, its text, its annotations and its metadata; for each part of SAP's answer a number kept: its status, its status text, its headers and its body.

### HandlerDebugBreakpoints

**Old:** Debugger breakpoints and watchpoints: each call sends one SAP request, the operation's, and answers what SAP answered. kind abap: setBreakpoints sets the breakpoint set of this debugging identity to breakpoints and answers each row SAP placed or refused; syncBreakpoints rewrites the full set (sync_scope full) or the part of the objects in sync_objects (sync_scope partial); deleteBreakpoint deletes breakpoint_id; createWatchpoint, listWatchpoints and deleteWatchpoint work on the attached debuggee. In user mode the breakpoints catch every request of the request user; the set is one per SAP user and request user, shared by every IDE of that user, and each change rewrites it as a whole. kind amdp: syncBreakpoints rewrites the breakpoints of the running AMDP session and answers the request id; SAP confirms them in a SYNC_BREAKPOINTS event. The answer carries state_handle, and for abap the identity in force.

**New:** [debug] Sets, rewrites and deletes the ABAP and AMDP debugger breakpoints, and the watchpoints of the attached ABAP debuggee. The debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header), the terminal id the runs carry, the IDE id the runs carry, the debugging mode and the user whose runs are caught. operation setBreakpoints: sets the ABAP breakpoint set of this debugging identity, shared by every IDE of the SAP user. operation syncBreakpoints: rewrites the ABAP breakpoints of the objects named or the whole set, or the breakpoints of the running AMDP session. operation deleteBreakpoint: deletes one ABAP breakpoint by its id: the id deleted. operation createWatchpoint: watches a variable of the attached ABAP debuggee. operation listWatchpoints: shows the watchpoints of the attached ABAP debuggee. operation deleteWatchpoint: removes a watchpoint of the attached ABAP debuggee.

### HandlerDebugMaintain

**Old:** Reads and changes the stopped debuggee: each call sends one SAP request, chosen by operation. kind abap, on the attached debuggee: getStack answers the frames, each with its program, include, line and ADT address, the stopped position on top; getVariables answers the variables in names (a path reads a component or a table row); getChildVariables answers the members of the ids in parents, the scopes (@ROOT) when parents is omitted; getMemorySizes answers the memory sizes; createMemorySnapshot creates a memory snapshot; setVariableValue sets variable_name to value and answers the variable. kind amdp: getDataPreview answers the rows of the table variable variable_name of debuggee_id.

**New:** [debug] Reads and changes the stopped ABAP or AMDP debuggee: its stack, its variables, its memory and its table variables. The debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header), the terminal id the runs carry, the IDE id the runs carry, the debugging mode and the user whose runs are caught. operation getStack: reads the call stack of the ABAP debuggee, the stopped position on top. operation getVariables: reads variables of the ABAP debuggee by name, a component or a table record by its path. operation getChildVariables: reads the members of variables of the ABAP debuggee, or its scopes. operation getMemorySizes: reads how much memory the ABAP debuggee uses. operation createMemorySnapshot: writes a memory snapshot of the ABAP debuggee. operation setVariableValue: sets the value of a variable of the ABAP debuggee. operation getDataPreview: reads the records of a table variable at an AMDP break.

### HandlerDebugSession

**Old:** Debugger listener and session. Each operation up to end sends one SAP request, the operation's, and answers what SAP answered. kind abap: checkListener answers whether another debugger holds this identity's debugging (SAP's 409 names the holder); listen waits for a debuggee for exactly hold_seconds, SAP's hold, and answers the debuggee caught (debuggee_id, its server) or caught: false; a breakpoint stops a program while a listen is open; stopListener ends the listener and deletes the identity's breakpoints; attach attaches debuggee_id on the attaching session, which the first attach opens and every later attach, step and reading uses; detachDebugger sends detachDebugger on the attaching session, which releases the debuggee, and the program runs on; terminateDebuggee ends the debuggee where it stands and terminateDebugger frees the debugger; each answers SAP's answer as it came, which is a 500 when it succeeded, and the next answer shows the success (noSessionAttached, or the program's end); setDebuggerSettings sends the settings given at the attached debuggee. kind amdp: start opens an AMDP session for the connected SAP user and answers its main_id; getEvents answers the events SAP sends (breaks with their debuggee ids, breakpoint confirmations, ends); stop ends the AMDP session; deleteDebuggee cancels the execution of debuggee_id. end, for either kind, takes state_handle and logs off each connection the debug state opened, one logoff each: an attached debuggee runs on, an AMDP debug session ends, and the user's breakpoints stay set until stopListener removes them; the debug state and its handle end with it, and a new debug state of either kind and any identity opens after it. The answer carries state_handle while the debug state holds something, and for abap the identity in force.

**New:** [debug] Listens for, attaches and ends ABAP debuggees, and opens and ends AMDP debug sessions, one SAP call per operation. The debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header), the terminal id the runs carry, the IDE id the runs carry, the debugging mode and the user whose runs are caught. operation checkListener: checks whether another debugger holds the ABAP debugging of this identity: that the debugging of this identity is free to take. operation listen: listens for an ABAP debuggee for the seconds asked and gives the one caught. operation stopListener: stops the ABAP listener and deletes the identity's breakpoints: that the listener stopped. operation attach: attaches the caught ABAP debuggee, so it can be stepped and read. operation detachDebugger: detaches the debugger from the ABAP debuggee, which runs on: that the debugger let the debuggee go. operation terminateDebuggee: ends the ABAP debuggee where it stands: that the debuggee ended. operation terminateDebugger: frees the ABAP debugger: that the debugger is free. operation setDebuggerSettings: sets the debugger settings given at the attached ABAP debuggee: whether system programs are debugged, whether update tasks are debugged, whether exception objects are created, whether background RFC is debugged and whether shared objects are debugged. operation start: opens an AMDP debug session for the connected SAP user. operation getEvents: reads the events of the AMDP debug session: its breaks, its breakpoint confirmations and its close. operation stop: ends the AMDP debug session: the id SAP confirms it by in an event. operation deleteDebuggee: cancels the execution of an AMDP debuggee: the id SAP confirms it by in an event. operation end: logs off every connection of the debug state and ends it, the user's breakpoints staying set: that the debug state ended and how many connections were logged off.

### HandlerDebugStep

**Old:** Moves the stopped debuggee: each call sends one SAP request, the operation's. kind abap, on the attached debuggee: stepInto, stepOver, stepReturn and stepContinue step from where it stands; stepRunToLine runs to the line object_type, object_name and line name, stepJumpToLine moves there and skips what lies between; a step answers SAP's step result, or ended when SAP reports the program's end, and the stopped position is read from the stack. setStackPosition makes frame position the one variables are read in. kind amdp: stepOver and stepContinue move debuggee_id and answer the request id; the next stop arrives as a break event.

**New:** [debug] Moves the stopped ABAP or AMDP debuggee by one step, one SAP call per operation. The debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header), the terminal id the runs carry, the IDE id the runs carry, the debugging mode and the user whose runs are caught. operation stepInto: steps the ABAP debuggee into the call where it stands. operation stepOver: steps the ABAP or AMDP debuggee over the statement where it stands. operation stepReturn: steps the ABAP debuggee out of the current call. operation stepContinue: lets the ABAP or AMDP debuggee run on to its next stop. operation stepRunToLine: runs the ABAP debuggee to the source position named. operation stepJumpToLine: moves the ABAP debuggee to the source position named, skipping what lies between. operation setStackPosition: selects the stack frame of the ABAP debuggee whose variables are read: the frame selected.

### HandlerDelete

**Old:** Deletes the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …): sends the deletion request for its type, and answers SAP's result. object_type required: PACKAGE(package_name*, transport_request), DOMAIN(domain_name*, transport_request), DATA_ELEMENT(data_element_name*, transport_request), TABLE(table_name*, transport_request), STRUCTURE(structure_name*, transport_request), TABLE_TYPE(table_type_name*, transport_request), DDL(ddl_name*, transport_request), SERVICE_DEFINITION(service_definition_name*, transport_request), SERVICE_BINDING(service_binding_name*, transport_request), CLASS(class_name*, transport_request), CDS_UNIT_TEST(class_name*, transport_request), PROGRAM(program_name*, transport_request), INCLUDE(include_name*, transport_request), INTERFACE(interface_name*, transport_request), FUNCTION_GROUP(function_group_name*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, transport_request), BEHAVIOR_DEFINITION(behavior_definition_name*, transport_request), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*, transport_request), METADATA_EXTENSION(metadata_extension_name*, transport_request), LOCAL_TEST_CLASS(class_name*, lock_handle*, transport_request), LOCAL_TYPES(class_name*, lock_handle*, transport_request), LOCAL_DEFINITIONS(class_name*, lock_handle*, transport_request), LOCAL_MACROS(class_name*, lock_handle*, transport_request), UNIT_TEST(class_name*, lock_handle*, transport_request). CDS_UNIT_TEST deletes its test class. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS and LOCAL_MACROS (the class's local includes) and UNIT_TEST (its test classes include) the include is written empty under lock_handle, the class's lock handle. transport_request is sent with the request. Over Streamable HTTP an include write takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); it is sent only under a lock the instance it reaches holds.

**New:** Deletes the ABAP repository object of the type object_type names, or empties a class include under the class's lock. Whether SAP deleted the object, its name and SAP's message about it. object_type required: PACKAGE(package_name*, transport_request), DOMAIN(domain_name*, transport_request), DATA_ELEMENT(data_element_name*, transport_request), TABLE(table_name*, transport_request), STRUCTURE(structure_name*, transport_request), TABLE_TYPE(table_type_name*, transport_request), DDL(ddl_name*, transport_request), SERVICE_DEFINITION(service_definition_name*, transport_request), SERVICE_BINDING(service_binding_name*, transport_request), CLASS(class_name*, transport_request), CDS_UNIT_TEST(class_name*, transport_request), PROGRAM(program_name*, transport_request), INCLUDE(include_name*, transport_request), INTERFACE(interface_name*, transport_request), FUNCTION_GROUP(function_group_name*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, transport_request), BEHAVIOR_DEFINITION(behavior_definition_name*, transport_request), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*, transport_request), METADATA_EXTENSION(metadata_extension_name*, transport_request), LOCAL_TEST_CLASS(class_name*, lock_handle*, transport_request), LOCAL_TYPES(class_name*, lock_handle*, transport_request), LOCAL_DEFINITIONS(class_name*, lock_handle*, transport_request), LOCAL_MACROS(class_name*, lock_handle*, transport_request), UNIT_TEST(class_name*, lock_handle*, transport_request). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

### HandlerDeletionCheck

**Old:** [read-only] Asks SAP whether the object named by object_type and object_name can be deleted: sends the deletion check request for its type, and answers SAP's verdict as it came: deletable true with the object and SAP's message when it carries one, or SAP's refusal with its words. object_type and object_name required: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST (its test class), PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE (object_name GROUP|MODULE), BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION.

**New:** [read-only] Asks SAP whether the ABAP repository object of the type object_type names can be deleted. Whether SAP lets the object be deleted, its name and SAP's message about it. object_type and object_name required: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST (its test class), PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE (object_name GROUP|MODULE), BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION.

### HandlerDumpList

**Old:** [read-only] Reads one page of the runtime feed named by feed_type in one request, newest first: the ABAP short dumps (runtime errors) of the user, object_name or time range from–to given, or system messages or SAP Gateway errors. Optional: feed_type(dumps|system_messages|gateway_errors, default dumps), user, runtime_error, exception, object_name, package, component, top (1 to 100), from, to. Response, by default (detail terse): TSV under '# feed' and '# count' lines, '# next_to' (the `to` of SAP's next link) when more remain; dumps dump_id, updated, title; system messages id, createdOn, author, title; gateway errors opid, detail_kind, dateTime, type, shortText, username. With detail medium or full: JSON { feed_type, count, entries, next_to }, each dump with its dump_id. The next link's page starts at the boundary second, inclusive: entries of that second may repeat; match them by dump_id. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads one page of the short dumps, system messages or SAP Gateway errors of an ABAP system, newest first, by user, object and time. For the feed read: how many items it holds, where the next read starts when more remain and the second holding more items than one read gives. For each short dump, newest first: its dump ID, when it happened and its title. For each system message: its ID, when it was created, its author and its title. For each SAP Gateway error: its operation ID, the kind of its detail, when it happened, its type, its short text and the user it happened to. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerDumpView

**Old:** [read-only] Reads the ABAP short dump (runtime error) named by dump_id in the view given. Required: dump_id* (id or URI). Optional: view(default|summary|formatted). Response: JSON.

**New:** [read-only] Reads an ABAP runtime dump by its id, with a summary of where and why its program terminated. The dump's id, the view read, the summary of where and why its program terminated and the dump as SAP gave it.

### HandlerGet

**Old:** [read-only] Reads one part of the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …). part selects it: source (default) the source alone, in one request; metadata the ADT metadata document alone, in one request; urls (SERVICE_BINDING) the service URL, its $metadata and the browser preview, contents (PACKAGE) the objects the package holds, its walk read level by level in ADT batch envelopes; package_names lists several packages, read together, one entry per package in the order given. A source document answers { part: 'source', source } and a metadata document { part: 'metadata', metadata }, beside the object's name. Parts per type: PACKAGE metadata, contents; DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE_TYPE metadata; LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST source; TRANSPORT source, metadata; SERVICE_BINDING source, metadata, urls; TABLE_SETTINGS source (the technical settings, in one request); CLASS_TEXT_ELEMENTS source (the text symbols, in one request); PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS source (symbols, selections and headings, one request each); every other type source, metadata. A part outside the type's list is answered with that list. Three parts read the repository by ADT address: object_structure(object_adt_type*, object_name*), node_structure(object_adt_type*, object_name*, node_id, with_short_descriptions; one node level; a package's blank answer is the empty listing with blank stating its two readings: an empty package, or an unknown package name) and virtual_folders(object_search_pattern, preselection, facet_order, with_versions, ignore_short_descriptions). Two parts read an activation run by its id, in one request each: activation_status(run_id*) answers { run_id, part, status, document }, the run's status (finished, error, failed, or its progress while it runs) and its status document as SAP answered it; activation_results(run_id*) answers { run_id, part, activated, messages, document }: activated is SAP's verdict as the results state it: true where they say activationExecuted="true" and every message is below error severity, false where they say activationExecuted="false" (a run SAP cancelled, or one whose message list is empty) or carry an error-severity message, null where they leave activationExecuted out; beside the messages the run produced and its results document as SAP answered it. Otherwise object_type required: PACKAGE(package_name*; part contents: package_name* or package_names*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), TABLE_TYPE(table_type_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*), INCLUDE(include_name*), INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name* as GROUP|MODULE, or function_module_name* with function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*), TRANSPORT(transport_number*), TABLE_SETTINGS(table_name*), PROGRAM_TEXT_ELEMENTS(program_name*), FUNCTION_GROUP_TEXT_ELEMENTS(function_group_name*), CLASS_TEXT_ELEMENTS(class_name*). TRANSPORT answers the objects a task holds, each with its position in the task's object list; for a request, every task's entries, each once, with its task number and position. TRANSPORT with part metadata reads the request or task itself, kind saying which: a request's header and its tasks with their object counts; a task's header, its parent request and its objects with their positions. UNIT_TEST and CDS_UNIT_TEST read the run's result in one request and answer { success, run_id, run_result }, run_result the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. draft (PROGRAM, INCLUDE, INTERFACE, CLASS, BEHAVIOR_IMPLEMENTATION, FUNCTION_MODULE, FUNCTION_GROUP, DDL, BEHAVIOR_DEFINITION, METADATA_EXTENSION, SERVICE_DEFINITION, TABLE, STRUCTURE, DOMAIN, DATA_ELEMENT and TABLE_TYPE) reads the active, inactive and working versions of each part of the object together (main, the source or metadata; for CLASS and BEHAVIOR_IMPLEMENTATION the includes implementations, definitions, testclasses, macros in place of the main source) and answers { object_type, object_name, has_draft, parts }: per part draft states whose unactivated change it holds — own (the caller's), other (another user's), undetermined (its three ETags in another pattern), and the active state when its versions are equal — with changed_at (the change's last write, UTC) and age_seconds by the server's clock for own and other (null for METADATA_EXTENSION and SERVICE_DEFINITION, whose ETag carries a constant time), and the three ETags (active, inactive, workspace); has_draft is true when any part holds a change of a user's. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads one part of the ABAP repository object of the type object_type names, of the repository by ADT address, or of an activation run by its id. part source: reads the source of the object at the version asked: its source code and the version read. part metadata: reads the metadata of the object at the version asked, as its type keeps it. part urls: builds the Fiori preview URL of a published OData service binding, with its service and $metadata URLs: its service's live state, OData protocol, service, service definition, service version, entity sets, binding category, client, logon language, associations, service URL, service URL source, $metadata URL, annotation URL, preview URL, preview descriptor, notes, whether it is published, whether the system's HTTP origin is known, what the preview URL still needs and the failure of reading the system's client and language. part contents: lists the objects of one or more ABAP packages, with the objects of their subpackages when asked: for each object of the package or a subpackage, under its own package: its type, its name, its technical name where it differs, its URI when SAP lists it nameless and its description, with descriptions asked. part main_programs: finds the main programs of an ABAP include: each program that includes it, or the function group it belongs to: the include's name; for each main program: whether it is a program or a function group and its name. part draft: tells whether an ABAP class, interface, program, CDS view, table or other development object holds an unactivated change, and whose: whether the object holds an unactivated change of any user; for each part, its main source or metadata or a class include: its name, its state (active, the caller's change, another user's change or undetermined), when that change was last written, how many seconds ago and the ETags of its active, inactive and working versions. part object_structure: reads the structure of an ABAP repository object, such as a CDS view: its parts and their parts, down to the last level: each part of the object, such as an element, an association or an annotation, is named by its type and its name or description, at its depth. part node_structure: reads one level of the repository browser of a package, class, program or other repository object, at its root or the node asked: whether SAP could load the level and what an empty package level means; for each object: its name, type, description, technical name and ADT URI; for each child node: its type and node ID. part virtual_folders: reads the virtual folders that group ABAP repository objects by package, group, type and other facets, for a name pattern: SAP's data as it came. part activation_status: reads the status of an activation run by its id: the run's id, the part read, the run's status, finished, error, failed or its progress and its status as SAP gave it. part activation_results: reads the results of an activation run by its id: SAP's verdict and the messages the run produced: the run's id, the part read, whether SAP activated it, by the results' verdict, whether it was already active and its results as SAP gave them; for each message of the run: its severity, its text, the object it is about, the address of that object, the object and its part as SAP describes them, the source it names, its position there and SAP's message code. object_type required: PACKAGE(package_name*; part contents: package_name* or package_names*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), TABLE_TYPE(table_type_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*), INCLUDE(include_name*), INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name* as GROUP|MODULE, or function_module_name* with function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*), TRANSPORT(transport_number*), TABLE_SETTINGS(table_name*), PROGRAM_TEXT_ELEMENTS(program_name*), FUNCTION_GROUP_TEXT_ELEMENTS(function_group_name*), CLASS_TEXT_ELEMENTS(class_name*). Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerGetData

**Old:** [read-only] Reads the rows of the table or CDS view named by object_name, or the rows sql_query selects: every column of object_name, or what sql_query selects with its columns, conditions and order. Required: object_name or sql_query. Optional: max_rows (default 100). Response: JSON. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the data of an ABAP database table or CDS view, or the data an ABAP SQL SELECT selects, up to the number of records asked. SAP's data as it came. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerLeftoverSessionList

**Old:** [read-only] Lists the SAP sessions of this server's destination an ended server process left open (it was killed before logging them off): handle, role (built or debugger), destination, user, when recorded. Read from the session records alone. Only sessions of ended processes are listed. A server starting while exactly one built session of its destination is left is born on it; with several, all stay listed and untaken.

**New:** [read-only] Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks. For each leftover session: its handle, whether it served an instance or a debug session, its destination, its SAP user and when it was last recorded.

### HandlerLeftoverSessionLogoff

**Old:** Logs off a leftover SAP session (any role), releasing every lock it holds; only the logoff is sent, credential-free. Its record is deleted afterwards.

**New:** Logs off a leftover SAP session by its handle, releasing every lock it holds and deleting its record. The session's handle and that it is logged off.

### HandlerLock

**Old:** Lock operation. object_type required: CLASS(object_name*), PROGRAM(object_name*), INCLUDE(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*, super_package), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_DEFINITION(object_name*), SERVICE_BINDING(object_name*), TABLE_SETTINGS(object_name*), PROGRAM_TEXT_ELEMENTS(object_name*), FUNCTION_GROUP_TEXT_ELEMENTS(object_name*), CLASS_TEXT_ELEMENTS(object_name*). Answers the lock_handle and the state_handle of the server instance that holds the lock; a SERVICE_BINDING open in an editing session answers an empty lock_handle, under which its publication runs. A write, a delete or an unlock under the lock_handle runs on the instance that holds it. Over Streamable HTTP send it as the state_handle argument of every call under this lock, the write and the unlock (or in the x-mcp-state-handle header).

**New:** Locks the ABAP repository object of the type object_type names on the server instance that then holds the lock for its write, delete and unlock. The lock handle its write, delete and unlock take and the state handle of the instance that holds it: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header). object_type required: CLASS(object_name*), PROGRAM(object_name*), INCLUDE(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*, super_package), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_DEFINITION(object_name*), SERVICE_BINDING(object_name*), TABLE_SETTINGS(object_name*), PROGRAM_TEXT_ELEMENTS(object_name*), FUNCTION_GROUP_TEXT_ELEMENTS(object_name*), CLASS_TEXT_ELEMENTS(object_name*).

### HandlerProfileList

**Old:** [read-only] Lists the ABAP profiler trace files. Response, by default (detail terse): TSV, one row per trace (id, recordedAt, objectName, state, runtime); with detail medium or full every field as JSON.

**New:** [read-only] Lists the ABAP profiler traces recorded in the system: how many there are; for each trace: its ID, when it was recorded, the object it traced, its state and its runtime.

### HandlerProfileRun

**Old:** Runs a class or a program in one request. Required: target_type*(CLASS|PROGRAM) + class_name* for CLASS or program_name* for PROGRAM. Optional: profiler_id (the profiler id of a scheduled trace; given, the run goes under that trace; absent, the run is plain), background. Response: JSON { success, class_name | program_name, output }, plus profile: { profiler_id } for a run under a trace.

**New:** Runs an ABAP class or an ABAP report, under a scheduled profiler trace when its profiler id is given. target_type CLASS: runs an ABAP class implementing if_oo_adt_classrun and gives its console output: the class that ran, its console output and the profiler and trace ids of a profiled run. target_type PROGRAM: runs an ABAP report and gives its output: the report that ran, its output and the profiler id of a profiled run.

### HandlerProfileSchedule

**Old:** Schedules an ABAP profiler trace in one request. Optional: description, profiling flags (all_procedural_units, all_misc_abap_statements, all_internal_table_events, all_dynpro_events, aggregate, explicit_on_off, with_rfc_tracing, all_system_kernel_events, sql_trace, all_db_events, max_size_for_trace_file, amdp_trace, max_time_for_tracing). Response: JSON { success, profiler_id }, profiler_id the id of the scheduled trace.

**New:** Schedules an ABAP profiler trace with its parameters, for a later profiled run of a class or a report. The profiler id a profiled run names.

### HandlerProfileView

**Old:** [read-only] Reads the ABAP profiler trace named by trace_id_or_uri in the view given (hit list, statements or database accesses), raw or analysed. Required: trace_id_or_uri*, view*(hitlist|statements|db_accesses). Optional: mode(raw|analyze, default raw), top(analyze only), with_system_events, id, with_details, auto_drill_down_threshold. Response: JSON. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads one view of an ABAP profiler trace, its hit list, its statements or its database accesses, as recorded or summarised. mode raw: reads one view of an ABAP profiler trace: its hit list, its statements or its database accesses: the view read, the trace and the view's data as the profiler read it. mode analyze: summarises one view of an ABAP profiler trace, its hit list, its statements or its database accesses, ranked by time: the trace, the view read, the view's record count and its top records by time and the view's data as the profiler read it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerServiceBindingListTypes

**Old:** [read-only] Lists the available service binding types. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.

**New:** [read-only] Lists the service binding types the system offers, such as OData V2 and OData V4, in the format asked. SAP's data as it came.

### HandlerServiceBindingValidate

**Old:** [read-only] Validates a new service binding named by service_binding_name for the service definition named by service_definition_name, in the package named by package_name, before it is created; the check names the binding's package. Required: service_binding_name*, service_definition_name*, package_name* (the binding's package). Optional: service_binding_version, description. The answer is the verdict of SAP's transport check for the binding's name and package: admissible true where SAP answers S, false where it answers E, each with SAP's messages, and any other value as result; creating the binding checks the name, the package and the service definition itself. Response: JSON.

**New:** [read-only] Validates a new OData service binding for a service definition, in the package and version given, by SAP's transport check of its name and package.

### HandlerSession (Streamable HTTP)

**Old:** [read-only] action 'open': Opens a long session on this server: the server instance and its SAP connection are kept for every call that carries the session's state_handle, until the session is closed or the server's idle bound passes between two calls. Answers the state_handle: send it as the state_handle argument of every call of the session (or in the x-mcp-state-handle header). Called with the state_handle of an instance that already holds state, or of an open session, answers that same state_handle and keeps what the instance holds. In batch mode it runs at once and the batch stays open. action 'close': Closes the long session the state_handle names: once this answer is written the server instance is closed — every SAP session it holds is logged off, which releases the locks taken in it; an open batch and its recorded calls are dropped unsent — and the state_handle ends: a later call carrying it gets the unavailable-state answer. Answers that the session is closed and what it held: its locks, a batch, a debug session. Called with an unknown state_handle, or on a new instance, it gets the unavailable-state answer. In batch mode it runs at once and drops the batch.

**New:** [read-only] Opens or closes a long session on this server, which keeps its server instance and SAP connection between calls. action open: opens a long session on this server, keeping its server instance and SAP connection for every call that carries its state handle: the state handle every call of the session carries. action close: closes the long session a state handle names, logging off its SAP sessions and so releasing their locks: whether the session is closed and the locks, recorded calls and debug session it held.

### HandlerSystem

**Old:** [read-only] Reads across the ABAP system, one read per action: search_source(query*, packages*, query2, exclude, include_subpackages, object_filter, object_types, exclude_comments, max_hits_per_object, max_hits, answer, version) the source lines of the objects in packages that contain query; search_object(object_name*, object_type, maxResults, detail) the objects whose name matches object_name, a name or a mask; where_used(object_name* and object_type*, or objects*; container, enable_all_types, enable_only_types, disable_types) every object that uses, calls or references the object named, with its type and package; package_tree(package_name* or package_names*; include_subpackages, max_depth, include_descriptions, debug) the subpackages and objects of a package as a tree; transports(user, modifiable_only, detail) the transport requests of user, by default the session's user; atc_findings(worklist_id*, detail) the findings of the ATC run whose worklist is worklist_id; atc_results(created_by*, central_only, age_min, age_max) the stored ATC results, newest first; atc_result(display_id*, detail) the stored ATC result display_id with its findings. Each argument is described with the actions that take it. Response: JSON, per action: search_source the hits (package, object type, object name, include, line, snippet) with the scanned and truncated counters; search_object the objects found; where_used the references with their total (one entry per object for objects); package_tree the tree (one entry per package for package_names); transports the requests; atc_findings the findings with the counts per priority; atc_results one entry per result; atc_result the findings with the counts per priority. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads across the ABAP system: source code, objects by name, usages, package hierarchies, transport orders, ATC findings, ATC results and one ATC result. action search_source: searches the ABAP source code of one or more packages for a text: programs, includes, function groups, classes, interfaces and CDS sources: how many objects and sources were searched, and how many objects matched; which limit stopped the search, when one did; the package parts SAP left unloaded are named, each by its package and type; the nameless objects SAP lists, left unsearched, are named by what tells them apart; for each match, under its object named by package, type and name: its include, its position in the source and the source code that matched, when snippets are asked; with objects asked, for each object it matched in, named by package, type and name: its include and how many matches it has. action search_object: finds ABAP repository objects by name or name pattern, of any type or of one: classes, programs, tables, interfaces and every other kind: for each object found: its name, its type, its description and its package. action where_used: finds where an ABAP class, function module, table or other repository object is used: every object that uses, calls or references it: how many references SAP counts; for each object that uses it, under its package: its type, its name, its URI when SAP lists it nameless and how it uses the object, where SAP tells it. action package_tree: reads the whole hierarchy of one or more ABAP packages: each package with its subpackages and their objects, down to the last level: for each subpackage and object below it, at its depth: its type, its name, its technical name when SAP lists it nameless, its URI when SAP lists it nameless and its description, with descriptions asked. action transports: lists a user's transports, workbench, customizing and transport-of-copies alike, that the user owns or holds a task in: how many there are; for each transport: its number, its type, its status, its owner, its target system and its description. action atc_findings: reads the findings of an ATC run by its worklist, whether the run was waited for or goes on in the background: the worklist ID; how many objects the run covered; how many findings there are; what an empty worklist means, while the run is still filling it; how many findings each priority has; for each finding: its object, its object's type, the part of the source it is in, its position in that source, its offset at that position, its priority, the check that found it and what the check says. action atc_results: lists the ATC results the system holds for a user or for every user, newest first, within an age range in days: how many results the system holds; for each result, newest first: its display id, its title, its check variant, its run series, when it was created, its finding counts per priority and its failure count. action atc_result: reads a stored ATC result by its display ID: its findings and the counts per priority: the result ID; its title; its check variant; when it was created; how many objects it covered; how many findings there are; how many findings each priority has; for each finding: its object, its object's type, the part of the source it is in, its position in that source, its offset at that position, its priority, the check that found it and what the check says. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerTransportCreate

**Old:** Creates a transport request and gives its task the type task_type. Required: description*. Optional: transport_type(workbench|customizing), target_system, owner, task_type(S|R|X, default S). Response, by default (detail terse): JSON with transport_number and task_number, and a note when SAP refused the task type; with detail medium or full the whole answer, as CreateTransport gives it.

**New:** Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked. The number of the transport created, the number of its task, SAP's refusal of the task type and what is left to do when the task stays untyped.

### HandlerTransportMoveObjects

**Old:** Moves the object entries named by objects from the transport task named by transport_number to the task named by target_number. Required: transport_number* (the source task), target_number* (the target task), objects* (at least one: object_name*, object_type*, position* in the source task's object list, pgmid). The positions come from a read of the source task's objects (object_type TRANSPORT). Response: JSON — acceptance only; a re-read of both tasks' objects (object_type TRANSPORT) confirms it.

**New:** Moves objects from one transport task to another, each at its position in the task it leaves. Whether SAP took the change, the task they leave, the task they move to and where the change is confirmed. For each object sent: the object named and its position in the task it leaves.

### HandlerTransportSortAndCompress

**Old:** Sorts the object list of the transport task named by transport_number and merges its duplicate entries. Required: transport_number* (a task). A task holding the same entry twice refuses removing an entry until this has run. Response: JSON — acceptance only; a re-read of the task's objects (object_type TRANSPORT) confirms it.

**New:** Sorts the objects of a transport task and merges its duplicates. Whether SAP took the change, the transport task and where the change is confirmed.

### HandlerUnitTestResult

**Old:** [read-only] Reads the result of the ABAP Unit test run named by run_id*, in one request (GET /sap/bc/adt/abapunit/results/{run_id}), and answers { success, run_id, run_result }: run_result is the result document SAP answered, parsed. Valid once the status is FINISHED; a finished run's result carries executionTime. Optional: with_navigation_uris, format (abapunit or junit).

**New:** [read-only] Reads the result of an ABAP Unit test run by its id. The run's id and the run's result as SAP gave it.

### HandlerUnitTestRun

**Old:** ABAP Unit test run, for exactly one of tests and target. tests[]{container_class*, test_class*}: chosen local test classes of global classes. target: all tests of one object of any run object type — { kind: object, name, type }, e.g. CLAS/OC a class, PROG/P a report, FUGR/F a function group, FUNC a function module, whose run covers the ABAP Unit tests of the module's whole function group, DDLS/DF a CDS view (its tests run with scope.foreign_tests true) — or of a package — { kind: package, name, include_subpackages }. Optional: runner (async | sync, default async; sync with tests only), title, context, scope, risk_level, duration. Response: JSON — runner async (tests or target): { success, run_id }, the status and result read later by run_id, suited to long suites; runner sync: { success, runner, finished, run_result }, the finished result of every test class of each container_class in one request.

**New:** Runs the ABAP Unit tests of chosen test classes, of a repository object or of a package, giving the run's id at once or the finished result of the test classes. The run's id to read its status and result by, the runner that ran it, whether the run finished and the run's result as SAP gave it.

### HandlerUnitTestStatus

**Old:** [read-only] Reads the status of the ABAP Unit test run named by run_id. Required: run_id*. Optional: with_long_polling. Response: JSON.

**New:** [read-only] Reads the status of an ABAP Unit test run by its id. The run's id, whether the run finished and SAP's progress status of the run.

### HandlerUnlock

**Old:** Unlock operation. object_type required: CLASS(object_name*, lock_handle*), PROGRAM(object_name*, lock_handle*), INCLUDE(object_name*, lock_handle*), INTERFACE(object_name*, lock_handle*), FUNCTION_GROUP(object_name*, lock_handle*), FUNCTION_MODULE(object_name*, lock_handle*), TABLE(object_name*, lock_handle*), STRUCTURE(object_name*, lock_handle*), TABLE_TYPE(object_name*, lock_handle*), DDL(object_name*, lock_handle*), DOMAIN(object_name*, lock_handle*), DATA_ELEMENT(object_name*, lock_handle*), PACKAGE(object_name*, lock_handle*), BEHAVIOR_DEFINITION(object_name*, lock_handle*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*), METADATA_EXTENSION(object_name*, lock_handle*), SERVICE_DEFINITION(object_name*, lock_handle*), SERVICE_BINDING(object_name*, lock_handle*), TABLE_SETTINGS(object_name*, lock_handle*), PROGRAM_TEXT_ELEMENTS(object_name*, lock_handle*), FUNCTION_GROUP_TEXT_ELEMENTS(object_name*, lock_handle*), CLASS_TEXT_ELEMENTS(object_name*, lock_handle*); an empty lock_handle of a SERVICE_BINDING answers that the binding is already unlocked. The lock_handle is one a lock of this server instance answered; the unlock ends the instance's hold on the lock. Over Streamable HTTP the unlock takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**New:** Releases the lock this server instance holds on the ABAP repository object of the type object_type names, under its lock handle. Whether SAP took the change, that the lock was already released and why. object_type required: CLASS(object_name*, lock_handle*), PROGRAM(object_name*, lock_handle*), INCLUDE(object_name*, lock_handle*), INTERFACE(object_name*, lock_handle*), FUNCTION_GROUP(object_name*, lock_handle*), FUNCTION_MODULE(object_name*, lock_handle*), TABLE(object_name*, lock_handle*), STRUCTURE(object_name*, lock_handle*), TABLE_TYPE(object_name*, lock_handle*), DDL(object_name*, lock_handle*), DOMAIN(object_name*, lock_handle*), DATA_ELEMENT(object_name*, lock_handle*), PACKAGE(object_name*, lock_handle*), BEHAVIOR_DEFINITION(object_name*, lock_handle*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*), METADATA_EXTENSION(object_name*, lock_handle*), SERVICE_DEFINITION(object_name*, lock_handle*), SERVICE_BINDING(object_name*, lock_handle*), TABLE_SETTINGS(object_name*, lock_handle*), PROGRAM_TEXT_ELEMENTS(object_name*, lock_handle*), FUNCTION_GROUP_TEXT_ELEMENTS(object_name*, lock_handle*), CLASS_TEXT_ELEMENTS(object_name*, lock_handle*). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

### HandlerUpdate

**Old:** Writes the object named by object_type and its name parameter (class_name, program_name, ddl_name, table_name, …) under its lock: sends the write of its type under lock_handle, the lock handle of the object, one request (TABLE_SETTINGS, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS and CLASS_TEXT_ELEMENTS: as their sentences below say), and answers SAP's result. The write sets the whole content to the one given. lock_handle and object_type required: PACKAGE(package_name*, source_code*, transport_request), DOMAIN(domain_name*, source_code*, transport_request), DATA_ELEMENT(data_element_name*, source_code*, transport_request), TABLE_TYPE(table_type_name*, source_code*, transport_request), FUNCTION_GROUP(function_group_name*, source_code*, transport_request), TABLE(table_name*, ddl_code*, transport_request), STRUCTURE(structure_name*, ddl_code*, transport_request), DDL(ddl_name*, ddl_source*, transport_request), SERVICE_DEFINITION(service_definition_name*, source_code*, transport_request), CLASS(class_name*, source_code*, transport_request), LOCAL_TEST_CLASS(class_name*, test_class_code*, transport_request), LOCAL_TYPES(class_name*, local_types_code*, transport_request), LOCAL_DEFINITIONS(class_name*, definitions_code*, transport_request), LOCAL_MACROS(class_name*, macros_code*, transport_request), UNIT_TEST(class_name*, test_class_source*, transport_request), CDS_UNIT_TEST(class_name*, test_class_source*, transport_request), PROGRAM(program_name*, source_code*, transport_request), INCLUDE(include_name*, source_code*, part, transport_request), INTERFACE(interface_name*, source_code*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, source_code*, transport_request), BEHAVIOR_DEFINITION(name*, source_code*, transport_request), BEHAVIOR_IMPLEMENTATION(class_name*, implementation_code*, transport_request), METADATA_EXTENSION(name*, source_code*, transport_request), SERVICE_BINDING(service_binding_name*, desired_publication_state*, binding_variant*, service_name, service_version), TABLE_SETTINGS(table_name*, data_class, size_category, buffering, storage_type, sharing_type, load_unit, translation, logging_enabled, is_writable_by_amdp, transport_request), PROGRAM_TEXT_ELEMENTS(program_name*, symbols, selections, headings, transport_request), FUNCTION_GROUP_TEXT_ELEMENTS(function_group_name*, symbols, selections, headings, transport_request), CLASS_TEXT_ELEMENTS(class_name*, symbols, transport_request). For PACKAGE, DOMAIN, DATA_ELEMENT, FUNCTION_GROUP, TABLE_TYPE and INCLUDE with part metadata, source_code is the whole metadata document, sent as given. part is taken by INCLUDE alone: source (when absent) writes its source, metadata its metadata document. For LOCAL_TEST_CLASS, LOCAL_TYPES, LOCAL_DEFINITIONS, LOCAL_MACROS, UNIT_TEST, CDS_UNIT_TEST and BEHAVIOR_IMPLEMENTATION, lock_handle is the class's lock handle. For TABLE_SETTINGS, lock_handle is the lock handle of TABLE_SETTINGS; the settings document is read and written back with each setting given, at least one, over the stored one, every other setting keeping its stored value: two requests; is_writable_by_amdp is taken on the cloud. For PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS and CLASS_TEXT_ELEMENTS, lock_handle is the lock handle of the same object_type; each of symbols, selections and headings given, at least one, is written as its whole list, one request each. For SERVICE_BINDING the write is its publication request, sent under the lock_handle given, an empty one included; service_name and service_version (default 0001) name the service of an OData V2 binding. transport_request is sent as the write's corrNr. Over Streamable HTTP the write takes the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header); the write is sent only under a lock the instance it reaches holds.

**New:** Writes the whole content of the ABAP repository object of the type object_type names, under the lock its lock handle names. Whether SAP took the change and a lock left held when its release failed. For SERVICE_BINDING: whether SAP made the change or started it, whether it has completed or runs in the background, SAP's severity, SAP's status text, what a started change means for the service and a lock left held when its release failed. object_type required: PACKAGE(package_name*, source_code*, transport_request), DOMAIN(domain_name*, source_code*, transport_request), DATA_ELEMENT(data_element_name*, source_code*, transport_request), TABLE_TYPE(table_type_name*, source_code*, transport_request), FUNCTION_GROUP(function_group_name*, source_code*, transport_request), TABLE(table_name*, ddl_code*, transport_request), STRUCTURE(structure_name*, ddl_code*, transport_request), DDL(ddl_name*, ddl_source*, transport_request), SERVICE_DEFINITION(service_definition_name*, source_code*, transport_request), CLASS(class_name*, source_code*, transport_request), LOCAL_TEST_CLASS(class_name*, test_class_code*, transport_request), LOCAL_TYPES(class_name*, local_types_code*, transport_request), LOCAL_DEFINITIONS(class_name*, definitions_code*, transport_request), LOCAL_MACROS(class_name*, macros_code*, transport_request), UNIT_TEST(class_name*, test_class_source*, transport_request), CDS_UNIT_TEST(class_name*, test_class_source*, transport_request), PROGRAM(program_name*, source_code*, transport_request), INCLUDE(include_name*, source_code*, part, transport_request), INTERFACE(interface_name*, source_code*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, source_code*, transport_request), BEHAVIOR_DEFINITION(name*, source_code*, transport_request), BEHAVIOR_IMPLEMENTATION(class_name*, implementation_code*, transport_request), METADATA_EXTENSION(name*, source_code*, transport_request), SERVICE_BINDING(service_binding_name*, desired_publication_state*, binding_variant*, service_name, service_version), TABLE_SETTINGS(table_name*, data_class, size_category, buffering, storage_type, sharing_type, load_unit, translation, logging_enabled, is_writable_by_amdp, transport_request), PROGRAM_TEXT_ELEMENTS(program_name*, symbols, selections, headings, transport_request), FUNCTION_GROUP_TEXT_ELEMENTS(function_group_name*, symbols, selections, headings, transport_request), CLASS_TEXT_ELEMENTS(class_name*, symbols, transport_request). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

### HandlerValidate

**Old:** [read-only] Validates a new object named by object_type and object_name before it is created. object_type required: CLASS(object_name*, superclass), PROGRAM(object_name*, package_name*), INCLUDE(object_name*, package_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE, description*), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*, description), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*, super_package), BEHAVIOR_DEFINITION(object_name*, package_name*, description*, root_entity*, implementation_type*), BEHAVIOR_IMPLEMENTATION(object_name*, package_name*, behavior_definition), METADATA_EXTENSION(object_name*, description*, package_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*, package_name*). For SERVICE_BINDING the answer is the verdict of SAP's transport check for the binding's name and package: admissible true where SAP answers S, false where it answers E, each with SAP's messages, and any other value as result; creating the binding checks the name, the package and the service definition itself.

**New:** [read-only] Validates the name of a new ABAP repository object of the type object_type names, before it is created. object_type required: CLASS(object_name*, superclass), PROGRAM(object_name*, package_name*), INCLUDE(object_name*, package_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE, description*), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*, description), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*, super_package), BEHAVIOR_DEFINITION(object_name*, package_name*, description*, root_entity*, implementation_type*), BEHAVIOR_IMPLEMENTATION(object_name*, package_name*, behavior_definition), METADATA_EXTENSION(object_name*, description*, package_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*, package_name*).

## Full tools changed in this round

GetSqlQuery and GetTableContents (no typed result: the fixed fact), the activations, checks and validations (function alone), and GetMainPrograms (a main program's kind in words).

### ActivateBehaviorDefinition

**Old:** Activates a RAP behavior definition, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates a RAP behavior definition, so its inactive version is in force.

### ActivateClass

**Old:** Activates an ABAP class, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP class, so its inactive version is in force.

### ActivateDataElement

**Old:** Activates an ABAP data element, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP data element, so its inactive version is in force.

### ActivateDdl

**Old:** Activates a CDS view, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates a CDS view, so its inactive version is in force.

### ActivateDomain

**Old:** Activates an ABAP domain, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP domain, so its inactive version is in force.

### ActivateFunctionGroup

**Old:** Activates an ABAP function group, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP function group, so its inactive version is in force.

### ActivateFunctionModule

**Old:** Activates an ABAP function module of a function group, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP function module of a function group, so its inactive version is in force.

### ActivateInclude

**Old:** Activates an ABAP include, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP include, so its inactive version is in force.

### ActivateInterface

**Old:** Activates an ABAP interface, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP interface, so its inactive version is in force.

### ActivateMetadataExtension

**Old:** Activates a CDS metadata extension, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates a CDS metadata extension, so its inactive version is in force.

### ActivateObjects

**Old:** Activates several ABAP repository objects of any type together in one activation, such as domains, data elements and tables at once. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates several ABAP repository objects of any type together in one activation, such as domains, data elements and tables at once.

### ActivateProgram

**Old:** Activates an ABAP program (report), so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP program (report), so its inactive version is in force.

### ActivateServiceBinding

**Old:** Activates an OData service binding, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an OData service binding, so its inactive version is in force.

### ActivateServiceDefinition

**Old:** Activates a service definition, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates a service definition, so its inactive version is in force.

### ActivateStructure

**Old:** Activates an ABAP structure, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP structure, so its inactive version is in force.

### ActivateTable

**Old:** Activates an ABAP database table, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP database table, so its inactive version is in force.

### ActivateTableType

**Old:** Activates an ABAP table type, so its inactive version is in force. Whether SAP activated it, whether SAP generated it and whether it was already active. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** Activates an ABAP table type, so its inactive version is in force.

### CheckAbapGitRepo

**Old:** [read-only] Checks that the system reaches an abapGit repository's remote and is let in. SAP's status and whether SAP has done it or accepted it.

**New:** [read-only] Checks that the system reaches an abapGit repository's remote and is let in.

### CheckBehaviorDefinition

**Old:** [read-only] Checks the syntax of a RAP behavior definition. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of a RAP behavior definition.

### CheckClass

**Old:** [read-only] Checks the syntax of an ABAP class as stored or as the source given. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP class as stored or as the source given.

### CheckDataElement

**Old:** [read-only] Checks the syntax of an ABAP data element. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP data element.

### CheckDdl

**Old:** [read-only] Checks the syntax of a CDS view as stored or as the source given. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of a CDS view as stored or as the source given.

### CheckDomain

**Old:** [read-only] Checks the syntax of an ABAP domain. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP domain.

### CheckFunctionGroup

**Old:** [read-only] Checks the syntax of an ABAP function group. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP function group.

### CheckFunctionModule

**Old:** [read-only] Checks the syntax of an ABAP function module of a function group. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP function module of a function group.

### CheckInterface

**Old:** [read-only] Checks the syntax of an ABAP interface. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP interface.

### CheckMetadataExtension

**Old:** [read-only] Checks the syntax of a CDS metadata extension. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of a CDS metadata extension.

### CheckPackage

**Old:** [read-only] Checks the syntax of an ABAP package. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP package.

### CheckProgram

**Old:** [read-only] Checks the syntax of an ABAP program (report). Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP program (report).

### CheckStructure

**Old:** [read-only] Checks the syntax of an ABAP structure as stored or as the source given. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP structure as stored or as the source given.

### CheckTable

**Old:** [read-only] Checks the syntax of an ABAP database table as stored or as the source given. Whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks the syntax of an ABAP database table as stored or as the source given.

### CheckTableType

**Old:** [read-only] Checks an ABAP table type for errors and warnings. The object checked, whether the check ran and SAP's status text. For each message: its severity, its text, the object it is about, the source it names, its position there and SAP's message code.

**New:** [read-only] Checks an ABAP table type for errors and warnings.

### GetMainPrograms

**Old:** [read-only] Finds the main programs of an ABAP include: each program that includes it, or the function group it belongs to. The include's name. For each main program: its type, PROG/P for a program or FUGR/F for a function group and its name.

**New:** [read-only] Finds the main programs of an ABAP include: each program that includes it, or the function group it belongs to. The include's name. For each main program: whether it is a program or a function group and its name.

### GetSqlQuery

**Old:** [read-only] Execute ABAP SQL SELECT queries on database tables and CDS views via SAP ADT Data Preview API. Use for ad-hoc data retrieval, row counts, and filtered queries. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Runs an ABAP SQL SELECT over database tables and CDS views and reads the data it selects, up to the number of records asked. SAP's data as it came. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetTableContents

**Old:** [read-only] Reads the contents (data preview, like SE16/SE16N) of the ABAP database table or CDS view named by table_name: every column, up to max_rows rows (default 100). Answers sql_query, row_number (the max_rows asked), execution_time, total_rows (the rows the table or view holds), columns and rows. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the data of an ABAP database table or CDS view, as SE16 previews it, up to the number of records asked. SAP's data as it came. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### ValidateServiceBinding

**Old:** [read-only] Validates a new OData service binding for a service definition, in the package and version given, by SAP's transport check of its name and package. Whether SAP admits it and SAP's verdict when it is another. For each message: its severity and its text.

**New:** [read-only] Validates a new OData service binding for a service definition, in the package and version given, by SAP's transport check of its name and package.
