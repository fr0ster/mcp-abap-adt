# Tool descriptions, groups 7–9 (plan step 10.6): old and new

Each tool's description before and after it was assembled from its purpose and the facts of its answer type.

## Group 7 — ABAP Unit runs and their reads

### RunUnitTest

| Old | New |
| --- | --- |
| Runs the ABAP Unit tests of the ABAP class named by class_name. runner async (default): the run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request that returns the finished result, called with wait left out. | Runs the ABAP Unit tests of an ABAP class, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it. |

### RunAbapUnit

| Old | New |
| --- | --- |
| Runs the ABAP Unit tests of the run target named by target. target.kind object: the tests of the object named by target.name, of the run object type target.type (CLAS/OC a class, CLAS/OCL its test class include, PROG/P a program, FUGR/F a function group, FUNC a function module, whose run covers the ABAP Unit tests of the module's whole function group, DDLS/DF a CDS view, among the listed types). target.kind package: the tests of the package named by target.name, its subpackages too when target.include_subpackages is true. A CDS view has assigned tests: test classes elsewhere marked "! @testing <view>"; they execute when scope.foreign_tests is true, and with the default scope the result lists them as a preview, unexecuted. The run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id. A long run under a client with a request time limit is started with wait false. | Runs the ABAP Unit tests of a class, report, function group, function module's group, CDS view, package, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it. |

### RunCdsUnitTest

| Old | New |
| --- | --- |
| Runs the ABAP Unit tests of the CDS view test class named by class_name. The run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id. A long run under a client with a request time limit is started with wait false. | Runs the ABAP Unit tests of a CDS view test class, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it. |

### RunFunctionGroupUnitTest

| Old | New |
| --- | --- |
| Runs every ABAP Unit test of the function group named by function_group_name. runner async (default): the run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request that returns the finished result, called with wait left out. | Runs every ABAP Unit test of a function group, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it. |

### RunFunctionModuleUnitTest

| Old | New |
| --- | --- |
| Runs the ABAP Unit tests of the module's whole function group: the function module named by function_module_name is run, and SAP runs the tests of the function group holding it. runner async (default), addressed by function_module_name alone: the run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request, addressed by function_group_name and function_module_name, that returns the finished result of every test of the module's function group, called with wait left out. | Runs the ABAP Unit tests of the function group holding a function module, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it. |

### RunProgramUnitTest

| Old | New |
| --- | --- |
| Runs the ABAP Unit tests of the report named by program_name. runner async (default): the run is started; with wait true (default) its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes: a run SAP answers finished returns its result, the call lasting as long as the run, a run SAP reports unstarted is read again by long polling, and a run that long-polled read reports unstarted returns the run_id and that status, and any other status is an error stating what SAP answered; with wait false the call answers the run_id right after the start, and the status and result are read by run_id; suited to long suites. A long run under a client with a request time limit is started with wait false. runner sync: one request that returns the finished result, called with wait left out. On ABAP Cloud, the programs are SAP's standard programs. | Runs the ABAP Unit tests of an ABAP report, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it. |

### GetUnitTest

| Old | New |
| --- | --- |
| [read-only] Retrieve ABAP Unit test run status and result for a previously started run_id: its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes; a run SAP answers finished answers its status and result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id and for a run whose start SAP has yet to record) answers the run_id and that status at once, and any other status is an error stating what SAP answered. | [read-only] Reads the status and result of an ABAP Unit test run by its id, waiting while the run goes on. The run's id, SAP's status of a run yet to start, whether the run finished, SAP's progress of the run and the run's result as SAP gave it. |

### GetUnitTestResult

| Old | New |
| --- | --- |
| [read-only] Reads the result of the ABAP Unit test run named by run_id, for a run started with wait false or still running: its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes; a run SAP answers finished answers its result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id and for a run whose start SAP has yet to record) answers the run_id and that status at once, and any other status is an error stating what SAP answered. | [read-only] Reads the result of an ABAP Unit test run by its id, waiting while the run goes on. The run's id, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it. |

### GetUnitTestStatus

| Old | New |
| --- | --- |
| [read-only] Retrieve ABAP Unit test run status for a run_id. | [read-only] Reads the status of an ABAP Unit test run by its id. The run's id, whether the run finished and SAP's progress status of the run. |

### GetCdsUnitTest

| Old | New |
| --- | --- |
| [read-only] Retrieve CDS unit test run status and result for a previously started run_id: its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes; a run SAP answers finished answers its status and result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id and for a run whose start SAP has yet to record) answers the run_id and that status at once, and any other status is an error stating what SAP answered. | [read-only] Reads the status and result of a CDS unit test run by its id, waiting while the run goes on. The run's id, SAP's status of a run yet to start, whether the run finished, SAP's progress of the run and the run's result as SAP gave it. |

### GetCdsUnitTestResult

| Old | New |
| --- | --- |
| [read-only] Retrieve CDS unit test run result for a run_id: its status is read at once, and a run SAP answers running is read again by long polling, SAP holding each read until the run finishes; a run SAP answers finished answers its result, the call lasting as long as the run, a run SAP reports unstarted (its answer for an unknown run_id and for a run whose start SAP has yet to record) answers the run_id and that status at once, and any other status is an error stating what SAP answered. | [read-only] Reads the result of a CDS unit test run by its id, waiting while the run goes on. The run's id, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it. |

### GetCdsUnitTestStatus

| Old | New |
| --- | --- |
| [read-only] Retrieve CDS unit test run status for a run_id.  | [read-only] Reads the status of a CDS unit test run by its id. The run's id, whether the run finished and SAP's progress status of the run. |

## Group 7 — ATC, class and report runs, profiler, dumps

### RunATC

| Old | New |
| --- | --- |
| [read-only] Runs the ABAP Test Cockpit (ATC) checks of the check variant named by check_variant over the objects named by objects. Each object is a name and a type: class, interface, function_group, package, ddl_source, table, behavior_definition, program, program_include, function_include (with function_group, the include's function group), class_include (with include_kind: definitions, implementations, macros or testclasses; name is the class). Creates a worklist for the check variant, then starts the run. Answers worklist_id always — the run's findings are read by it, for either value of wait. With wait=false it also answers run_id, which the run's status is read by; with wait=true the server holds the request until the checks finish and answers the finding counts. | [read-only] Runs the ABAP Test Cockpit checks of a check variant over ABAP objects and packages, recording their findings in a new worklist. The check variant it ran, the worklist holding its findings, whether the call waited for the checks to end, the finding counts of a run waited for and the id of a started run to read its status by. For each object checked: its name, its type, the function group of a function include and the include of a class include. |

### GetATCRunStatus

| Old | New |
| --- | --- |
| [read-only] Answers whether the ATC run named by run_id has ended (a run started with wait=false answers its run_id). Answers the status the server reports and whether it is finished — finished means ended, whatever the checks found. The run's findings are read by its worklist_id. | [read-only] Reads the status of an ATC run by its id, and whether it has ended. The run's id, SAP's status of the run, whether the run has ended, the worklist holding its findings and the id of its result. |

### ListATCResults

| Old | New |
| --- | --- |
| [read-only] Lists the ATC results the system holds, newest first. Answers each result with its display_id, title, check_variant, run_series, created_at, the finding counts per priority and the failure count. created_by names whose results (a user name, or * for every user); central_only=true lists central results only; age_min and age_max bound the age in days, and when both are absent the system applies an age window of its own. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. | [read-only] Lists the ATC results the system holds for a user or for every user, newest first, within an age range in days. How many results the system holds. For each result, newest first: its display id, its title, its check variant, its run series, when it was created, its finding counts per priority and its failure count. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. |

### RuntimeRunClass

| Old | New |
| --- | --- |
| [runtime] Runs the ABAP class named by class_name, which implements if_oo_adt_classrun, and returns its console output. Set profile=true to also capture a profiler trace: schedules the trace, runs the class under it, then searches the profiler feed for the id this run produced (bounded by max_trace_attempts/trace_retry_delay_ms). If the trace appears only after that bound, the run still answers success with output and profiler_id, trace_id absent — the trace is then found later in the list of profiler trace files. | Runs an ABAP class implementing if_oo_adt_classrun and gives its console output, under the ABAP profiler when asked. The class that ran, its console output and the profiler and trace ids of a profiled run. |

### RuntimeRunProgram

| Old | New |
| --- | --- |
| [runtime] Runs the ABAP program (report) named by program_name and returns its output. Set profile=true to also start a profiler trace; the trace is then found in the list of profiler trace files (program execution is fire-and-forget, so the traceId arrives later, through that list). | Runs an ABAP report and gives its output, under the ABAP profiler when asked. The report that ran, its output and the profiler id of a profiled run. |

### RuntimeCreateProfilerTraceParameters

| Old | New |
| --- | --- |
| [runtime] Schedule ABAP profiler trace parameters and return profilerId (the request id) for profiled execution. | Schedules an ABAP profiler trace with its parameters, for a later profiled run of a class or a report. The profiler id a profiled run names. |

### RuntimeAnalyzeProfilerTrace

| Old | New |
| --- | --- |
| [read-only] [runtime] Read profiler trace view and return compact analysis summary (totals + top entries). Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. | [read-only] Summarises one view of an ABAP profiler trace, its hit list, its statements or its database accesses, ranked by time. The trace, the view read, the view's record count and its top records by time and the view's data as the profiler read it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. |

### RuntimeGetProfilerTraceData

| Old | New |
| --- | --- |
| [read-only] [runtime] Read profiler trace data by trace id/uri: hitlist, statements, or db accesses. Returns parsed JSON payload. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. | [read-only] Reads one view of an ABAP profiler trace: its hit list, its statements or its database accesses. The view read, the trace and the view's data as the profiler read it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call. |

### RuntimeGetDumpById

| Old | New |
| --- | --- |
| [read-only] [runtime] Read an ABAP runtime dump by its dump_id or URI. Answers a summary — runtime error, exception, terminated program, time, user, and the source position where it terminated — and the parsed dump. | [read-only] Reads an ABAP runtime dump by its id, with a summary of where and why its program terminated. The dump's id, the view read, the summary of where and why its program terminated and the dump as SAP gave it. |

## Group 8 — long, leftover and background sessions

### SessionOpen

| Old | New |
| --- | --- |
| [read-only] Opens a long session on this server: the server instance and its SAP connection are kept for every call that carries the session's state_handle, until the session is closed or the server's idle bound passes between two calls. Answers the state_handle: send it as the state_handle argument of every call of the session (or in the x-mcp-state-handle header). Called with the state_handle of an instance that already holds state, or of an open session, answers that same state_handle and keeps what the instance holds. In batch mode it runs at once and the batch stays open. | [read-only] Opens a long session on this server, keeping its server instance and SAP connection for every call that carries its state handle. The state handle every call of the session carries. |

### SessionClose

| Old | New |
| --- | --- |
| [read-only] Closes the long session the state_handle names: once this answer is written the server instance is closed — every SAP session it holds is logged off, which releases the locks taken in it; an open batch and its recorded calls are dropped unsent — and the state_handle ends: a later call carrying it gets the unavailable-state answer. Answers that the session is closed and what it held: its locks, a batch, a debug session. Called with an unknown state_handle, or on a new instance, it gets the unavailable-state answer. In batch mode it runs at once and drops the batch. | [read-only] Closes the long session a state handle names, logging off its SAP sessions and so releasing their locks. Whether the session is closed and the locks, recorded calls and debug session it held. |

### ListLeftoverSessions

| Old | New |
| --- | --- |
| [read-only] [session] Lists the SAP sessions of this server's destination that an ended server process left open (it was killed before it could log them off), with the locks they may hold: handle, role (built: an instance connection; debugger: a debug session connection), destination, user (absent for a token login) and when it was last recorded. Read from the session records alone, on this machine. Only sessions of ended processes are listed. Log one off by its handle. A server process that starts while exactly one instance session (built) of its destination is left is born on it, before any tool call; with several, all stay here, untaken. | [read-only] Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks. For each leftover session: its handle, whether it served an instance or a debug session, its destination, its SAP user and when it was last recorded. |

### LogoffLeftoverSession

| Old | New |
| --- | --- |
| [session] Logs off a leftover SAP session (any role): the session ends, and every lock it holds is released. Only the logoff is sent, credential-free. The session record is deleted afterwards. | Logs off a leftover SAP session by its handle, releasing every lock it holds and deleting its record. The session's handle and that it is logged off. |

### GetBackgroundRun

| Old | New |
| --- | --- |
| [read-only] [runtime] Reads one of your background runs by its run_handle: running; finished with what the run tool answered (the system answer as it is, an error included); or cancelled. A read run's finished or cancelled answer is answered once and then deleted, so a lost answer is read again by starting the read again; a code run's answer is kept until it is discarded. | [read-only] Reads one of the caller's background runs by its run handle, with the answer of a run that has ended. Its run handle, whether it is running, finished or cancelled, the tool it runs, the object it runs, when it started, when it ended and what its tool answered once the run ended. |

### ListBackgroundRuns

| Old | New |
| --- | --- |
| [read-only] [runtime] Lists your background runs: run_handle, tool, object, when it started, and its state: running, finished or cancelled. A run's output is read by its run_handle; a read run leaves the list once its answer was read. | [read-only] Lists the caller's background runs, running, finished and cancelled. For each run: its run handle, whether it is running, finished or cancelled, the tool it runs, the object it runs, when it started and when it ended. |

### DiscardBackgroundRun

| Old | New |
| --- | --- |
| [read-only] [runtime] Ends the run named by run_handle: a running read is cancelled and its session logged off; a finished run's answer is deleted; a running code run is refused. | [read-only] Ends a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted. Its run handle and whether it was cancelled or its answer deleted. |

## Group 8 — transports

### AddTransportObject

| Old | New |
| --- | --- |
| Adds the existing object named by object_name and object_type to the transport task named by transport_number, so it travels with the task's request. | Adds an existing ABAP object to a transport task, so it travels with the task's transport. Whether SAP took the change, that SAP's answer leaves the attachment unconfirmed, the transport task, the object named and where the change is confirmed. |

### CreateTransport

| Old | New |
| --- | --- |
| Creates a transport request and gives the task SAP creates with it the type task_type (default S, Development/Correction). Response: JSON with transport_number and task_number (and task_type_error or a note when the task is left untyped); with detail medium, the request as created too. | Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked. The number of the transport created, the number of its task, SAP's refusal of the task type and what is left to do when the task stays untyped. |

### CreateTransportTask

| Old | New |
| --- | --- |
| Creates a task under the existing transport request named by transport_number, owned by the user named by target_user, of the type task_type. The task is itself a request resource — it reads, writes and releases like one — and is what adding and removing an object entry address, since a request's objects live on its tasks. `target_user` is required: it names the task's owner, and an empty owner is refused with SCTS_ADT_MSG 009. The task is typed Development/Correction (S) by default, because an Unclassified task refuses an added object on premise with SCTS_ADT_MSG 009 / TK127. | Creates a task of the type asked under an existing transport, owned by the SAP user named. The number of the task created, its type, SAP's refusal of the task type and what is left to do when the task stays untyped. |

### MoveTransportObjects

| Old | New |
| --- | --- |
| Moves the object entries named by objects from the transport task named by transport_number to the task named by target_number. Each entry is named by its position in the source task's object list. | Moves objects from one transport task to another, each at its position in the task it leaves. Whether SAP took the change, the task they leave, the task they move to and where the change is confirmed. For each object sent: the object named and its position in the task it leaves. |

### RemoveTransportObject

| Old | New |
| --- | --- |
| Removes the entry of the object named by object_name and object_type from the transport task named by transport_number, at position. | Removes a named object from a transport task, at its position among the task's objects. Whether SAP took the change, that SAP's answer leaves the removal unconfirmed, the transport task, the object named, its position in the task and where the change is confirmed. |

### SortAndCompressTransportTask

| Old | New |
| --- | --- |
| Sorts the object list of the transport task named by transport_number and merges its duplicate entries. A task holding the same entry twice refuses removing an entry until this has run. | Sorts the objects of a transport task and merges its duplicates. Whether SAP took the change, the transport task and where the change is confirmed. |

## Group 8 — abapGit writes (on premise, then cloud)

### LinkAbapGitRepo

| Old | New |
| --- | --- |
| Links package_name to the remote repository at url on branch, and imports every object of the branch into the package and its subpackages, overwriting objects of the system and objects held by other packages, recorded in transport_request. Ends on SAP's answer, or with background true runs on an ABAP session of its own. Answers facts only: SAP's status, done, and the objects SAP lists. | Links an ABAP package to a remote abapGit repository on a branch and imports the branch's objects into it, recorded in a transport. SAP's status and whether SAP made the change or accepted it as its own job. For each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it. |

### LinkAbapGitRepo (cloud)

| Old | New |
| --- | --- |
| Links package_name to the remote repository at url on branch, and links only: a pull imports the objects. folder_logic says how folders map to subpackages. Answers facts only: SAP's status, done, and the objects SAP lists. | Links an ABAP package to a remote abapGit repository on a branch, mapping its folders to subpackages as asked. SAP's status and whether SAP made the change or accepted it as its own job. For each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it. |

### PullAbapGitRepo

| Old | New |
| --- | --- |
| Pulls the repository repository_key from the branch it is linked on, recorded in transport_request: every object changed in the remote is imported, objects changed in the system are overwritten, and objects held by other packages are written too. Ends on SAP's answer, or with background true runs on an ABAP session of its own. When SAP's request or its response is lost mid-import (an SSE or stdio close logs the connection off), the outcome is unknown to this server and what SAP does then is unverified (unread in SAP's code, unmeasured): the repository's staging read shows the current differences, whichever writes made them. Answers facts only: SAP's status, done, and the objects SAP lists. | Pulls an abapGit repository from the branch it is linked on, importing every object changed in the remote, recorded in a transport. SAP's status and whether SAP made the change or accepted it as its own job. For each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it. |

### PullAbapGitRepo (cloud)

| Old | New |
| --- | --- |
| Pulls the repository repository_key from the branch it is linked on, recorded in transport_request: the job takes every object the modified-objects read lists and brings it to its remote version, a package warning with action 5 (delete and re-create) excepted: SAP leaves it out; given overwrite, SAP selects by name against the list as it stands when its job runs: of the objects outside the selection, the remote-only adds and updates are imported, and every other one (changes in the system, remote deletions, objects of other packages) keeps its system state. SAP accepts it as its own job, which runs to its end whatever happens to the client or its connection after the call; the objects it imports are inactive, and the repository list shows its run state. Answers facts only: SAP's status and accepted. | Pulls an abapGit repository from the branch it is linked on as an SAP job, recorded in a transport, its imported objects left inactive. SAP's status and whether SAP made the change or accepted it as its own job. For each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it. |

### PushAbapGitRepo

| Old | New |
| --- | --- |
| Commits the objects and files chosen from the staging with comment, author and committer, and pushes the commit to the remote branch of the repository repository_key. Ends on SAP's answer, or with background true runs on an ABAP session of its own. Answers facts only: SAP's status and done. | Commits the objects and files chosen from an abapGit repository's staging, with its comment, author and committer, and pushes the commit to its remote branch. SAP's status and whether SAP made the change or accepted it as its own job. |

### PushAbapGitRepo (cloud)

| Old | New |
| --- | --- |
| Commits the objects and files chosen from the staging with comment, author and committer, and pushes the commit to the remote branch of the repository repository_key. SAP accepts it as its own job, which runs to its end; the repository list shows its run state. Answers facts only: SAP's status and accepted. | Commits the objects and files chosen from an abapGit repository's staging and pushes the commit to its remote branch, as an SAP job. SAP's status and whether SAP made the change or accepted it as its own job. |

### SwitchAbapGitBranch

| Old | New |
| --- | --- |
| Switches the repository repository_key to branch; with create true, creates branch in the remote first when the remote lacks it; with create false and a branch the remote lacks, the repository stays on its branch and SAP answers success. Answers facts only: SAP's status. | Switches an abapGit repository to a branch, creating the branch in the remote first when asked. SAP's status and whether SAP made the change or accepted it as its own job. |

## Group 9 — ABAP debug session, steps and stack

### DebugStartListener

| Old | New |
| --- | --- |
| [debug] Opens a debug session: arms breakpoints, listens for a debuggee and attaches the first one caught; refused before anything is placed while another debugger listens for that user. Needs at least one breakpoint. Takes whose requests are caught, the debugging mode and the debugger settings. In user mode it catches every request of the request user (the connected SAP user, or the one named), from this server and from anywhere else. Its breakpoints are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change rewrites that set as a whole. | [debug] Opens an ABAP debug session: arms breakpoints, listens for a debuggee and attaches the first one caught. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force, why the settings could be applied only in part, the breakpoints placed and refused, the session's state handle, the terminal id its runs carry, the IDE id its runs carry, its debugging mode and the user whose runs it catches. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed. |

### DebugTakeOverListener

| Old | New |
| --- | --- |
| [debug] Opens a debug session: arms breakpoints, listens for a debuggee and attaches the first one caught. Displaces another debugger listening for the same user. Needs at least one breakpoint. Takes whose requests are caught, the debugging mode and the debugger settings. In user mode it catches every request of the request user (the connected SAP user, or the one named), from this server and from anywhere else. Its breakpoints are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change rewrites that set as a whole. | [debug] Opens an ABAP debug session taking its user over from another debugger: arms breakpoints, listens for a debuggee and attaches the first one caught. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force, why the settings could be applied only in part, the breakpoints placed and refused, the session's state handle, the terminal id its runs carry, the IDE id its runs carry, its debugging mode and the user whose runs it catches. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed. |

### DebugWait

| Old | New |
| --- | --- |
| [read-only] [debug] State of a debug session after waiting up to hold_seconds; a debugger that took the user over is an error carrying the system's message. | [read-only] Waits for the next stop or end of an ABAP debug session, up to the seconds asked, and tells its state. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force and why the settings could be applied only in part. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed. |

### DebugStep

| Old | New |
| --- | --- |
| [debug] Moves the stopped debuggee into a call, over it, out of the current one or on to the next stop; or leaves it running, the listener and the breakpoints kept, by detaching or by freeing the debugger. | [debug] Steps the stopped ABAP debuggee into a call, over it, out of it or on to the next stop, or leaves it running by detaching or freeing the debugger. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force and why the settings could be applied only in part. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed. |

### DebugStepToLine

| Old | New |
| --- | --- |
| [debug] Runs or jumps the stopped debuggee to a line. | [debug] Runs or jumps the stopped ABAP debuggee to a source position. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force and why the settings could be applied only in part. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed. |

### DebugTerminate

| Old | New |
| --- | --- |
| [debug] Ends the stopped debuggee and its program where it stands. | [debug] Ends the stopped ABAP debuggee and its program where it stands. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force and why the settings could be applied only in part. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed. |

### DebugGetStack

| Old | New |
| --- | --- |
| [read-only] [debug] Call stack of the stopped debuggee of the debug session named by state_handle, each frame with its ADT object address and its technical place. Needs a stopped debuggee. | [read-only] Reads the call stack of the stopped ABAP debuggee, each frame with its ADT object address and its place in the source. Where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive and whether the step reached another debuggee. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed. |

### DebugStop

| Old | New |
| --- | --- |
| [debug] Ends a debug session, ABAP and AMDP: releases a stopped debuggee, removes the breakpoints, stops listening, closes the connections and lets the kept answers of its debugger batch go; a part that failed to undo is reported and kept with the answers. | [debug] Ends a debug session, ABAP and AMDP: releases a stopped debuggee, removes the breakpoints, stops listening and closes its connections. That the session stopped. For each part that failed to undo: the step it failed at and its error as it came. |

## Group 9 — variables, breakpoints, watchpoints, settings

### DebugGetVariables

| Old | New |
| --- | --- |
| [read-only] [debug] Variables of the stopped debuggee, by name or as members of a parent. Needs a stopped debuggee. | [read-only] Reads variables of the stopped ABAP debuggee by name, or the members of parent variables. For each variable: its id, the parent id of its members, its name, its declared type, its value, the size of a table variable, the label of a member and the parent of a member, when several parents are read. |

### DebugSetVariable

| Old | New |
| --- | --- |
| [debug] Sets a variable of the stopped debuggee. Needs a stopped debuggee. | [debug] Sets the value of a variable of the stopped ABAP debuggee. For each variable: its id, the parent id of its members, its name, its declared type, its value and the size of a table variable. |

### DebugSetBreakpoints

| Old | New |
| --- | --- |
| [debug] Adds breakpoints to a debug session — a line, an exception class, an ABAP statement or a message; a line breakpoint may carry a condition — and answers the whole set placed, this call's refusals each with its breakpoint and reason, earlier breakpoints that dropped out of the set, and any answer row left unpaired with a breakpoint. Its breakpoints are one set, shared by every IDE of the same SAP user (in user mode, debugging the same request user; in terminal mode, whatever its ids), and each change rewrites that set as a whole. | [debug] Adds breakpoints to an ABAP debug session: at a source position, optionally conditional, on an exception class, an ABAP statement or a message. For each breakpoint of the set placed: its id, its kind, its source position, its exception class, its statement, its message class, its message number, its message type, its condition, the tag it was sent with and SAP's reason for refusing it. For each breakpoint of this call SAP refused: the breakpoint sent and SAP's reason. For each earlier breakpoint that dropped out of the set: the breakpoint sent and SAP's reason. For each answer SAP gave beside the breakpoints sent: its kind, its id, its tag and SAP's reason. |

### DebugListBreakpoints

| Old | New |
| --- | --- |
| [read-only] [debug] Breakpoints a debug session armed. | [read-only] Shows the breakpoints an ABAP debug session armed. For each breakpoint: its id, its kind, its source position, its exception class, its statement, its message class, its message number, its message type, its condition, the tag it was sent with and SAP's reason for refusing it. |

### DebugDeleteBreakpoint

| Old | New |
| --- | --- |
| [debug] Removes one breakpoint of a debug session by its id; the rest of the set stays armed. An id outside the session's set is refused. | [debug] Removes one breakpoint of an ABAP debug session by its id, the rest staying armed. The id deleted. |

### DebugCreateWatchpoint

| Old | New |
| --- | --- |
| [debug] Watches a variable of the stopped debuggee: it stops when the variable changes, optionally under a condition. | [debug] Watches a variable of the stopped ABAP debuggee, stopping it when the variable changes, under a condition when one is set. SAP's data as it came. |

### DebugListWatchpoints

| Old | New |
| --- | --- |
| [read-only] [debug] Watchpoints of the stopped debuggee. | [read-only] Shows the watchpoints of the stopped ABAP debuggee. SAP's data as it came. |

### DebugDeleteWatchpoint

| Old | New |
| --- | --- |
| [debug] Removes a watchpoint. | [debug] Removes a watchpoint of the stopped ABAP debuggee by its id. The id deleted. |

### DebugSetSettings

| Old | New |
| --- | --- |
| [debug] Changes the debugger settings at the current stop and answers the settings in force; a field left out keeps its value. The debug session applies them again after each later attach. | [debug] Changes the debugger settings of an ABAP debug session at its current stop, applied again after each later attach. Whether system programs are debugged, whether update tasks are debugged, whether exception objects are created, whether background RFC is debugged and whether shared objects are debugged. |

## Group 9 — memory and recorded calls

### DebugGetMemorySizes

| Old | New |
| --- | --- |
| [read-only] [debug] Memory the stopped debuggee uses. Needs a stopped debuggee. | [read-only] Reads how much memory the stopped ABAP debuggee uses. The memory its ABAP objects use, the internal memory it uses and the peak of its internal memory. |

### DebugCreateMemorySnapshot

| Old | New |
| --- | --- |
| [debug] Writes a memory snapshot of the stopped debuggee and answers the file written. | [debug] Writes a memory snapshot of the stopped ABAP debuggee. SAP's data as it came. |

### MemorySnapshotList

| Old | New |
| --- | --- |
| [read-only] [debug] Memory snapshots the system lists. Empty when the user lacks the memory snapshot authorization. | [read-only] Lists the memory snapshots the system holds, of one user when asked. Beside an empty set, that a user lacking the memory snapshot authorization gets one too. For each snapshot: its id, its user, when it was written, its size and the program it was written in. |

### MemorySnapshotGet

| Old | New |
| --- | --- |
| [read-only] [debug] One memory snapshot in a view: header, memory by kind, largest objects, an object's children or its referrers. Needs the memory snapshot authorization. | [read-only] Reads one memory snapshot in a view: its header, memory by kind, largest objects, an object's children or its referrers. SAP's data as it came. |

### MemorySnapshotDelta

| Old | New |
| --- | --- |
| [read-only] [debug] Two memory snapshots compared in a view: memory by kind, largest objects, an object's children or its referrers. Needs the memory snapshot authorization. | [read-only] Compares two memory snapshots in a view: memory by kind, largest objects, an object's children or its referrers. SAP's data as it came. |

### DebugBatchBegin

| Old | New |
| --- | --- |
| [read-only] [debug] Starts the debugger batch on the stopped ABAP debuggee, else at the AMDP break. In the debugger batch each call of step, step to line, stack, variables, child variables, stack position or setting a variable at the ABAP debuggee, and of step over, continue or the data preview of a table variable at the AMDP break, is recorded under the next number, starting at 1, and answers with empty content. Answers the state_handle: over Streamable HTTP send it as the state_handle argument of every call of the batch (or in the x-mcp-state-handle header). | [read-only] Starts recording the debugger calls at the stopped ABAP debuggee or at the AMDP break, each under the next number, to send them together. That recording is on and the state handle: send it as the state_handle argument of every call (or in the x-mcp-state-handle header). |

### DebugBatchEnd

| Old | New |
| --- | --- |
| [debug] Sends the recorded calls of the stopped debuggee in one envelope on the session the batch started on — the ABAP debuggee's session, or the AMDP session's command session — and ends the debugger batch. Splits SAP's answer into each call's parts and answers the number of recorded calls, of requests sent and of parts received; when sending fails, the parts received differ from the requests sent or the answer fails to split, answers that error, and every number of the batch then answers it. | [debug] Sends the recorded debugger calls together on the session they were recorded on, and splits SAP's answer by call. How many calls were recorded, how many were sent and how many parts SAP's answer held. |

### DebugBatchAnswers

| Old | New |
| --- | --- |
| [read-only] [debug] Answers the calls of the last executed batch by number: for each number asked, the tool's answer, built from the call's parts of SAP's response when the number is first read and kept for later reads; the numbers asked are processed in parallel. Takes one number or a list of numbers; an unknown number answers as unknown. | [read-only] Reads the outcome of each recorded debugger call of the last sending, by its number. For each number asked: the number, whether it is an error, that the number is unanswered and why. For each block of the answer of a number: its kind, its text, its annotations and its metadata. For each part of SAP's answer a number kept: its status, its status text, its headers and its body. |

## Group 9 — AMDP

### AmdpDebugStart

| Old | New |
| --- | --- |
| [debug] Opens an AMDP debug session of the connected SAP user with breakpoints on lines in SQLScript methods; a background run, when given, starts once the system confirmed the breakpoints. Catches every request of the connected SAP user, from this server and from anywhere else. | [debug] Opens an AMDP debug session of the connected SAP user with breakpoints in SQLScript methods, starting a background run once they are confirmed. The session's main id and the session's state handle. For each breakpoint the system confirmed: its class, its source position, its state and SAP's reason for an invalid one. |

### AmdpDebugSetBreakpoints

| Old | New |
| --- | --- |
| [debug] Sets the AMDP breakpoints of a debug session to the set given, as confirmed by the system. Catches every request of the connected SAP user, from this server and from anywhere else. | [debug] Sets the AMDP breakpoints of a debug session to the set asked, as the system confirms them. For each breakpoint: its class, its source position, its state and SAP's reason for an invalid one. |

### AmdpDebugWait

| Old | New |
| --- | --- |
| [read-only] [debug] AMDP events of a debug session after waiting up to hold_seconds. | [read-only] Waits for the AMDP events of a debug session, up to the seconds asked. Whether the session is idle, waiting, at an event or ended, why it ended and the outcome of the run it started. For each event: its kind, its id, the debuggee, its source position and the depth of a stack cut to its top frames. For each variable an event carries: its name and its value. For each breakpoint an event reports: its class, its source position, its state and SAP's reason for an invalid one. For each frame of an event from the top: its database procedure, its ADT object address, its position in the database procedure and that its procedure lacks debug compilation. |

### AmdpDebugStep

| Old | New |
| --- | --- |
| [debug] Steps the stopped AMDP debuggee over a statement or on to the next stop. | [debug] Steps the stopped AMDP debuggee over a statement or on to the next stop. The state after the step. |

### AmdpDebugGetTable

| Old | New |
| --- | --- |
| [read-only] [debug] Rows of a table variable at the AMDP stop, up to 100; optionally through a SELECT over it. | [read-only] Reads the records of a table variable at the AMDP stop, up to 100, through a SELECT over it when one is set. SAP's data as it came. |

### AmdpDebugCancel

| Old | New |
| --- | --- |
| [debug] Cancels the stopped AMDP debuggee's execution. | [debug] Cancels the execution of the stopped AMDP debuggee. |

### AmdpDebugStop

| Old | New |
| --- | --- |
| [debug] Ends the AMDP part of a debug session, releasing a suspended debuggee first; when the whole debug session ends with it, the kept answers of its debugger batch go too. A part that failed to undo is reported and kept with the answers. | [debug] Ends the AMDP part of a debug session, releasing a suspended debuggee first. |
