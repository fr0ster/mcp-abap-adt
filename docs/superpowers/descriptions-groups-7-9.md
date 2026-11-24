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
