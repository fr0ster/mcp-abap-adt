# Tool descriptions: purpose only, old and new

The owner's decision: a description is its tag, its purpose and its usage notes, with no generated facts (measured on 1144 labelled queries). The crud2 branch's object-specific CRUD purposes are merged in, their facts dropped too. Then: a purpose opens with the verb of the tool's own action; the compact tools name their object types in words and no per-type parameter list; HandlerGet and HandlerSystem state their function in action words; the source readers say what sets them apart; a create states no package. Old: `8d435fe97`; new: this branch, as the regenerated tool pages list them.

### AddTransportObject

**Old:** Adds an existing ABAP object to a transport task, so it travels with the task's transport. Whether SAP took the change, that SAP's answer leaves the attachment unconfirmed, the transport task, the object named and where the change is confirmed.

**New:** Adds an existing ABAP object to a transport task, so it travels with the task's transport.

### AmdpDebugGetTable

**Old:** [read-only] Reads the records of a table variable at the AMDP stop, up to 100, through a SELECT over it when one is set. SAP's data as it came.

**New:** [read-only] Reads the records of a table variable at the AMDP stop, up to 100, through a SELECT over it when one is set.

### AmdpDebugSetBreakpoints

**Old:** [debug] Sets the AMDP breakpoints of a debug session to the set asked, as the system confirms them. For each breakpoint: its class, its source position, its state and SAP's reason for an invalid one.

**New:** [debug] Sets the AMDP breakpoints of a debug session to the set asked, as the system confirms them.

### AmdpDebugStart

**Old:** [debug] Opens an AMDP debug session of the connected SAP user with breakpoints in SQLScript methods, starting a background run once they are confirmed. The session's main id and the session's state handle. For each breakpoint the system confirmed: its class, its source position, its state and SAP's reason for an invalid one.

**New:** [debug] Starts an AMDP debug session of the connected SAP user with breakpoints in SQLScript methods, starting a background run once they are confirmed.

### AmdpDebugStep

**Old:** [debug] Steps the stopped AMDP debuggee over a statement or on to the next stop. The state after the step.

**New:** [debug] Steps the stopped AMDP debuggee over a statement or on to the next stop.

### AmdpDebugStop

**Old:** [debug] Ends the AMDP part of a debug session, releasing a suspended debuggee first.

**New:** [debug] Stops the AMDP part of a debug session, releasing a suspended debuggee first.

### AmdpDebugWait

**Old:** [read-only] Waits for the AMDP events of a debug session, up to the seconds asked. Whether the session is idle, waiting, at an event or ended, why it ended and the outcome of the run it started. For each event: its kind, its id, the debuggee, its source position and the depth of a stack cut to its top frames. For each variable an event carries: its name and its value. For each breakpoint an event reports: its class, its source position, its state and SAP's reason for an invalid one. For each frame of an event from the top: its database procedure, its ADT object address, its position in the database procedure and that its procedure lacks debug compilation.

**New:** [read-only] Waits for the AMDP events of a debug session, up to the seconds asked.

### CheckAbapGitExternalRepo

**Old:** [read-only] Checks an external git repository for abapGit before it is linked: its access and its branches. Whether the remote repository is public or private. For each branch of the remote repository: its name and whether it is the head.

**New:** [read-only] Checks an external git repository for abapGit before it is linked: its access and its branches.

### CreateBehaviorDefinition

**Old:** Creates a RAP behavior definition for a root entity in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Creates a managed, unmanaged, abstract or projection RAP behavior definition for a root entity, recorded in the transport given.

### CreateBehaviorImplementation

**Old:** Creates the RAP behavior implementation class of a behavior definition in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates the RAP behavior implementation class of a behavior definition, with its description, recorded in the transport given.

### CreateCdsUnitTest

**Old:** Creates an ABAP Unit test class for a CDS view in a package, from the test class source given, once the view supports CDS test doubles. Whether SAP took the change.

**New:** Creates an ABAP Unit test class for a CDS view, from the test class source given, once the view supports CDS test doubles.

### CreateClass

**Old:** Creates an ABAP class in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an ABAP class, with its description, its superclass and its FINAL and CREATE PROTECTED settings, recorded in the transport given.

### CreateDataElement

**Old:** Creates an ABAP data element in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Creates an ABAP data element, typed by a domain, a built-in type or a reference, with its labels and search help, recorded in the transport given.

### CreateDdl

**Old:** Creates a CDS view or classic DDL view in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates a CDS view or classic DDL view, with its description, recorded in the transport given.

### CreateDomain

**Old:** Creates an ABAP domain in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Creates an ABAP domain, with its data type, length, decimals, conversion exit, value table and fixed values, recorded in the transport given.

### CreateFunctionGroup

**Old:** Creates an ABAP function group in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an ABAP function group, with its description, activating it when asked, recorded in the transport given.

### CreateFunctionGroupUnitTest

**Old:** Creates the ABAP Unit test classes of an ABAP function group from the test class source given, in a test include activated with the group. Whether SAP took the change.

**New:** Creates the ABAP Unit test classes of an ABAP function group from the test class source given, in a test include activated with the group.

### CreateFunctionInclude

**Old:** Creates an include in an existing ABAP function group, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an include in an existing ABAP function group, with its description, recorded in the transport given.

### CreateFunctionModule

**Old:** Creates an ABAP function module in an existing function group, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an ABAP function module in an existing function group, with its description, recorded in the transport given.

### CreateInclude

**Old:** Creates an ABAP include in a package, with its description and the comment header SAP writes into it, recorded in the transport given. Whether SAP took the change.

**New:** Creates an ABAP include, with its description and the comment header SAP writes into it, recorded in the transport given.

### CreateInterface

**Old:** Creates an ABAP interface in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an ABAP interface, with its description, recorded in the transport given.

### CreateMessageClass

**Old:** Creates an ABAP message class (T100) in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an ABAP message class (T100), with its description, recorded in the transport given.

### CreateMessageClassMessage

**Old:** Creates a message, with its number and text, in an existing ABAP message class (T100), recorded in the transport given. Whether SAP took the change.

**New:** Creates a message in an existing ABAP message class (T100), with its number, text and self-explanatory flag, recorded in the transport given.

### CreateMetadataExtension

**Old:** Creates a CDS metadata extension in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Creates a CDS metadata extension, with its description, activating it when asked, recorded in the transport given.

### CreateProgram

**Old:** Creates an ABAP program (report) in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an executable ABAP program (report), with its description and application area, recorded in the transport given.

### CreateProgramUnitTest

**Old:** Creates the ABAP Unit test classes of an ABAP report from the test class source given, in a test include of the report, and activates the report. Whether SAP took the change.

**New:** Creates the ABAP Unit test classes of an ABAP report from the test class source given, in a test include of the report, and activates the report.

### CreateServiceBinding

**Old:** Creates an OData service binding (V2 or V4, UI or Web API) for a service definition in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an OData V2 or V4 service binding, UI or Web API, for a service definition, with its service name and version.

### CreateServiceDefinition

**Old:** Creates a service definition exposing CDS views as an OData service in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Creates a service definition exposing CDS views as an OData service, with its source code when given, activating it when asked.

### CreateStructure

**Old:** Creates an ABAP structure in a package, with its description, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Creates an ABAP structure, with its description, activating it when asked, recorded in the transport given.

### CreateTable

**Old:** Creates an ABAP database table in a package, with its description, recorded in the transport given. Whether SAP took the change.

**New:** Creates an ABAP database table by its name, recorded in the transport given.

### CreateTableType

**Old:** Creates an ABAP table type in a package, with the type it holds, its access type and primary key, activating it when asked, recorded in the transport given. Whether SAP took the change, a lock left held when its release failed, the version its stored definition was read at and SAP's failure when that read failed.

**New:** Creates an ABAP table type, with the type it holds, its access type and primary key, activating it when asked, recorded in the transport given.

### CreateTransport

**Old:** Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked. The number of the transport created, the number of its task, SAP's refusal of the task type and what is left to do when the task stays untyped.

**New:** Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked.

### CreateTransportTask

**Old:** Creates a task of the type asked under an existing transport, owned by the SAP user named. The number of the task created, its type, SAP's refusal of the task type and what is left to do when the task stays untyped.

**New:** Creates a task of the type asked under an existing transport, owned by the SAP user named.

### CreateUnitTest

**Old:** Creates the ABAP Unit test classes of an ABAP class from the test class source given, as its local test classes, and activates the class. Whether SAP took the change.

**New:** Creates the ABAP Unit test classes of an ABAP class from the test class source given, as its local test classes, and activates the class.

### DebugBatchAnswers

**Old:** [read-only] Reads the outcome of each recorded debugger call of the last sending, by its number. For each number asked: the number, whether it is an error, that the number is unanswered and why. For each block of the answer of a number: its kind, its text, its annotations and its metadata. For each part of SAP's answer a number kept: its status, its status text, its headers and its body.

**New:** [read-only] Reads the outcome of each recorded debugger call of the last sending, by its number.

### DebugBatchBegin

**Old:** [read-only] Starts recording the debugger calls at the stopped ABAP debuggee or at the AMDP break, each under the next number, to send them together. That recording is on and the state handle: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).

**New:** [read-only] Starts recording the debugger calls at the stopped ABAP debuggee or at the AMDP break, each under the next number, to send them together. Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).

### DebugBatchEnd

**Old:** [debug] Sends the recorded debugger calls together on the session they were recorded on, and splits SAP's answer by call. How many calls were recorded, how many were sent and how many parts SAP's answer held.

**New:** [debug] Ends the recording of debugger calls, sending them together on the session they were recorded on, and splits SAP's answer by call.

### DebugCreateMemorySnapshot

**Old:** [debug] Writes a memory snapshot of the stopped ABAP debuggee. SAP's data as it came.

**New:** [debug] Creates a memory snapshot of the stopped ABAP debuggee.

### DebugCreateWatchpoint

**Old:** [debug] Watches a variable of the stopped ABAP debuggee, stopping it when the variable changes, under a condition when one is set. SAP's data as it came.

**New:** [debug] Creates a watchpoint on a variable of the stopped ABAP debuggee, stopping it when the variable changes, under a condition when one is set.

### DebugDeleteBreakpoint

**Old:** [debug] Removes one breakpoint of an ABAP debug session by its id, the rest staying armed. The id deleted.

**New:** [debug] Deletes one breakpoint of an ABAP debug session by its id, the rest staying armed.

### DebugDeleteWatchpoint

**Old:** [debug] Removes a watchpoint of the stopped ABAP debuggee by its id. The id deleted.

**New:** [debug] Deletes a watchpoint of the stopped ABAP debuggee by its id.

### DebugGetMemorySizes

**Old:** [read-only] Reads how much memory the stopped ABAP debuggee uses. The memory its ABAP objects use, the internal memory it uses and the peak of its internal memory.

**New:** [read-only] Reads how much memory the stopped ABAP debuggee uses.

### DebugGetStack

**Old:** [read-only] Reads the call stack of the stopped ABAP debuggee, each frame with its ADT object address and its place in the source. Where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive and whether the step reached another debuggee. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed.

**New:** [read-only] Reads the call stack of the stopped ABAP debuggee, each frame with its ADT object address and its place in the source.

### DebugGetVariables

**Old:** [read-only] Reads variables of the stopped ABAP debuggee by name, or the members of parent variables. For each variable: its id, the parent id of its members, its name, its declared type, its value, the size of a table variable, the label of a member and the parent of a member, when several parents are read.

**New:** [read-only] Reads variables of the stopped ABAP debuggee by name, or the members of parent variables.

### DebugListBreakpoints

**Old:** [read-only] Shows the breakpoints an ABAP debug session armed. For each breakpoint: its id, its kind, its source position, its exception class, its statement, its message class, its message number, its message type, its condition, the tag it was sent with and SAP's reason for refusing it.

**New:** [read-only] Lists the breakpoints an ABAP debug session armed.

### DebugListWatchpoints

**Old:** [read-only] Shows the watchpoints of the stopped ABAP debuggee. SAP's data as it came.

**New:** [read-only] Lists the watchpoints of the stopped ABAP debuggee.

### DebugSetBreakpoints

**Old:** [debug] Adds breakpoints to an ABAP debug session: at a source position, optionally conditional, on an exception class, an ABAP statement or a message. For each breakpoint of the set placed: its id, its kind, its source position, its exception class, its statement, its message class, its message number, its message type, its condition, the tag it was sent with and SAP's reason for refusing it. For each breakpoint of this call SAP refused: the breakpoint sent and SAP's reason. For each earlier breakpoint that dropped out of the set: the breakpoint sent and SAP's reason. For each answer SAP gave beside the breakpoints sent: its kind, its id, its tag and SAP's reason.

**New:** [debug] Sets breakpoints in an ABAP debug session: at a source position, optionally conditional, on an exception class, an ABAP statement or a message.

### DebugSetSettings

**Old:** [debug] Changes the debugger settings of an ABAP debug session at its current stop, applied again after each later attach. Whether system programs are debugged, whether update tasks are debugged, whether exception objects are created, whether background RFC is debugged and whether shared objects are debugged.

**New:** [debug] Sets the debugger settings of an ABAP debug session at its current stop, applied again after each later attach.

### DebugSetStackPosition

**Old:** [debug] Selects the stack frame of a stopped debuggee whose variables are then shown, execution going on from the same point.

**New:** [debug] Sets the stack frame of a stopped debuggee whose variables are then shown, execution going on from the same point.

### DebugSetVariable

**Old:** [debug] Sets the value of a variable of the stopped ABAP debuggee. For each variable: its id, the parent id of its members, its name, its declared type, its value and the size of a table variable.

**New:** [debug] Sets the value of a variable of the stopped ABAP debuggee.

### DebugStartListener

**Old:** [debug] Opens an ABAP debug session: arms breakpoints, listens for a debuggee and attaches the first one caught. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force, why the settings could be applied only in part, the breakpoints placed and refused, the session's state handle, the terminal id its runs carry, the IDE id its runs carry, its debugging mode and the user whose runs it catches. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed.

**New:** [debug] Starts an ABAP debug session: arms breakpoints, listens for a debuggee and attaches the first one caught.

### DebugStep

**Old:** [debug] Steps the stopped ABAP debuggee into a call, over it, out of it or on to the next stop, or leaves it running by detaching or freeing the debugger. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force and why the settings could be applied only in part. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed.

**New:** [debug] Steps the stopped ABAP debuggee into a call, over it, out of it or on to the next stop, or leaves it running by detaching or freeing the debugger.

### DebugStepToLine

**Old:** [debug] Runs or jumps the stopped ABAP debuggee to a source position. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force and why the settings could be applied only in part. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed.

**New:** [debug] Steps the stopped ABAP debuggee to a source position, running or jumping there.

### DebugStop

**Old:** [debug] Ends a debug session, ABAP and AMDP: releases a stopped debuggee, removes the breakpoints, stops listening and closes its connections. That the session stopped. For each part that failed to undo: the step it failed at and its error as it came.

**New:** [debug] Stops a debug session, ABAP and AMDP: releases a stopped debuggee, removes the breakpoints, stops listening and closes its connections.

### DebugTakeOverListener

**Old:** [debug] Opens an ABAP debug session taking its user over from another debugger: arms breakpoints, listens for a debuggee and attaches the first one caught. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force, why the settings could be applied only in part, the breakpoints placed and refused, the session's state handle, the terminal id its runs carry, the IDE id its runs carry, its debugging mode and the user whose runs it catches. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed.

**New:** [debug] Takes the ABAP debugging of a user over from another debugger: arms breakpoints, listens for a debuggee and attaches the first one caught.

### DebugTerminate

**Old:** [debug] Ends the stopped ABAP debuggee and its program where it stands. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force and why the settings could be applied only in part. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed.

**New:** [debug] Terminates the stopped ABAP debuggee and its program where it stands.

### DebugWait

**Old:** [read-only] Waits for the next stop or end of an ABAP debug session, up to the seconds asked, and tells its state. Whether the session is idle, listening, stopped or ended, why it ended, the outcome of the run it started, SAP's message of an end, the failure of a refused attach, where the debuggee stopped, the depth of a stack cut to its top frames, whether SAP refuses to attach the catch, the short dump of a post-mortem catch, the kind of a catch other than a debuggee, whether the catch is post-mortem, whether the debuggee runs non-exclusive, whether the step reached another debuggee, why the stack could be read only in part, the debugger settings in force and why the settings could be applied only in part. For each frame from the top: its ADT object address, its processing unit, its program, its include and its position in the include. For each breakpoint whose condition SAP failed to evaluate: its id, its condition and where in the condition SAP failed.

**New:** [read-only] Waits for the next stop or end of an ABAP debug session, up to the seconds asked, and tells its state.

### DeleteBehaviorDefinition

**Old:** Deletes a RAP behavior definition, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes a RAP behavior definition, recorded in the transport given.

### DeleteBehaviorImplementation

**Old:** Deletes a RAP behavior implementation class, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes a RAP behavior implementation class, recorded in the transport given.

### DeleteCdsUnitTest

**Old:** Deletes a CDS view test class, with the ABAP Unit test classes it holds. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes a CDS view test class, with the ABAP Unit test classes it holds.

### DeleteClass

**Old:** Deletes an ABAP class, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP class, recorded in the transport given.

### DeleteDataElement

**Old:** Deletes an ABAP data element, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP data element, recorded in the transport given.

### DeleteDdl

**Old:** Deletes a CDS view or classic DDL view, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes a CDS view or classic DDL view, recorded in the transport given.

### DeleteDomain

**Old:** Deletes an ABAP domain, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP domain, recorded in the transport given.

### DeleteFunctionGroup

**Old:** Deletes an ABAP function group, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP function group, recorded in the transport given.

### DeleteFunctionInclude

**Old:** Deletes an include of an ABAP function group, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an include of an ABAP function group, recorded in the transport given.

### DeleteFunctionModule

**Old:** Deletes an ABAP function module, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP function module, recorded in the transport given.

### DeleteInclude

**Old:** Deletes an ABAP include, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP include, recorded in the transport given.

### DeleteInterface

**Old:** Deletes an ABAP interface, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP interface, recorded in the transport given.

### DeleteLocalDefinitions

**Old:** Clears the local definitions of an ABAP class, activating the class when asked. Whether SAP took the change and a lock left held when its release failed.

**New:** Deletes the local definitions of an ABAP class, activating the class when asked.

### DeleteLocalMacros

**Old:** Clears the local macros of an ABAP class, activating the class when asked. Whether SAP took the change and a lock left held when its release failed.

**New:** Deletes the local macros of an ABAP class, activating the class when asked.

### DeleteLocalTestClass

**Old:** Clears the local test classes of an ABAP class, activating the class when asked. Whether SAP took the change and a lock left held when its release failed.

**New:** Deletes the local test classes of an ABAP class, activating the class when asked.

### DeleteLocalTypes

**Old:** Clears the local types of an ABAP class, activating the class when asked. Whether SAP took the change and a lock left held when its release failed.

**New:** Deletes the local types of an ABAP class, activating the class when asked.

### DeleteMessageClass

**Old:** Deletes an ABAP message class (T100) with all its messages, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP message class (T100) with all its messages, recorded in the transport given.

### DeleteMessageClassMessage

**Old:** Deletes one message, by its number, from an ABAP message class (T100), keeping the class and its other messages. Whether SAP deleted the message, the message class, the message number and a sentence saying so.

**New:** Deletes one message, by its number, from an ABAP message class (T100), keeping the class and its other messages.

### DeleteMetadataExtension

**Old:** Deletes a CDS metadata extension, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes a CDS metadata extension, recorded in the transport given.

### DeletePackage

**Old:** Deletes an ABAP package, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP package, recorded in the transport given.

### DeleteProgram

**Old:** Deletes an ABAP program (report), recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP program (report), recorded in the transport given.

### DeleteServiceBinding

**Old:** Deletes an OData service binding, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an OData service binding, recorded in the transport given.

### DeleteServiceDefinition

**Old:** Deletes a service definition, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes a service definition, recorded in the transport given.

### DeleteStructure

**Old:** Deletes an ABAP structure, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP structure, recorded in the transport given.

### DeleteTable

**Old:** Deletes an ABAP database table, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP database table, recorded in the transport given.

### DeleteTableType

**Old:** Deletes an ABAP table type, recorded in the transport given. Whether SAP deleted the object, its name and SAP's message about it.

**New:** Deletes an ABAP table type, recorded in the transport given.

### DeleteUnitTest

**Old:** Deletes the ABAP Unit test classes of an ABAP class, keeping the class. Whether SAP took the change.

**New:** Deletes the ABAP Unit test classes of an ABAP class, keeping the class.

### DescribeByList

**Old:** [read-only] Describes several ABAP repository objects named in one call, each by its name and, when known, its type. For each object found: its name, its type, its description and its package. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Describes several ABAP repository objects named in one call, each by its name and, when known, its type. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### DiscardBackgroundRun

**Old:** [read-only] Ends a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted. Its run handle and whether it was cancelled or its answer deleted.

**New:** [read-only] Discards a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted.

### GetATCFindings

**Old:** [read-only] Reads the findings of an ATC run by its worklist, whether the run was waited for or goes on in the background. The worklist ID. How many objects the run covered. How many findings there are. What an empty worklist means, while the run is still filling it. How many findings each priority has. For each finding: its object, its object's type, the part of the source it is in, its position in that source, its offset at that position, its priority, the check that found it and what the check says. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the findings of an ATC run by its worklist, whether the run was waited for or goes on in the background. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetATCResult

**Old:** [read-only] Reads a stored ATC result by its display ID: its findings and the counts per priority. The result ID. Its title. Its check variant. When it was created. How many objects it covered. How many findings there are. How many findings each priority has. For each finding: its object, its object's type, the part of the source it is in, its position in that source, its offset at that position, its priority, the check that found it and what the check says. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads a stored ATC result by its display ID: its findings and the counts per priority. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetATCRunStatus

**Old:** [read-only] Reads the status of an ATC run by its id, and whether it has ended. The run's id, SAP's status of the run, whether the run has ended, the worklist holding its findings and the id of its result.

**New:** [read-only] Reads the status of an ATC run by its id, and whether it has ended.

### GetAbapGitBranchInfo

**Old:** Gets the abapGit branch information of a remote repository for the package it would be linked to. Whether the remote repository is public or private. For the branch: its name and how its folders map to packages.

**New:** Reads the abapGit branch information of a remote repository for the package it would be linked to.

### GetAbapGitErrorLog

**Old:** [read-only] Gets the error log of the last abapGit pull or push of a repository, object by object. For each object the run handled: its type, its name and the severity of SAP's message for it (S, I, W, E or A).

**New:** [read-only] Reads the error log of the last abapGit pull or push of a repository, object by object.

### GetAbapGitFile

**Old:** [read-only] Reads one file of an abapGit repository, as the system holds it or as the remote branch holds it. The file's text as it is.

**New:** [read-only] Reads one file of an abapGit repository, as the system holds it or as the remote branch holds it.

### GetAbapGitModifiedObjects

**Old:** [read-only] Gets the objects a pull of an abapGit repository would modify in the system, before it runs. For each object a pull would overwrite and each object a pull would move to another package: its type, its name and its package.

**New:** [read-only] Reads the objects a pull of an abapGit repository would modify in the system, before it runs.

### GetAbapGitStaging

**Old:** [read-only] Gets the abapGit staging of a linked repository: what changed, to choose what a push commits. The author and the committer SAP proposes. For each changed file left unstaged, each staged file and each ignored file: its object's type, its object's name, its object's package, its file name, its state in the system and its state in the remote.

**New:** [read-only] Reads the abapGit staging of a linked repository: what changed, to choose what a push commits.

### GetAdtTypes

**Old:** [read-only] Lists the repository object types the ABAP system knows, by their type codes: how many there are; for each object type: its code and its description.

**New:** [read-only] Reads the repository object types the ABAP system knows, by their type codes.

### GetBackgroundRun

**Old:** [read-only] Reads one of the caller's background runs by its run handle, with the answer of a run that has ended. Its run handle, whether it is running, finished or cancelled, the tool it runs, the object it runs, when it started, when it ended and what its tool answered once the run ended.

**New:** [read-only] Reads one of the caller's background runs by its run handle, with the answer of a run that has ended.

### GetBehaviorDefinition

**Old:** [read-only] Reads the source of a RAP behavior definition at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of a RAP behavior definition, or its metadata.

### GetBehaviorDefinitionVersionDiff

**Old:** [read-only] Compares two versions of the same RAP behavior definition, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same RAP behavior definition from its version history and compares them.

### GetBehaviorDefinitionVersionSource

**Old:** [read-only] Reads the source of one version of a RAP behavior definition, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of a RAP behavior definition's source from its version history.

### GetBehaviorDefinitionVersions

**Old:** [read-only] Lists the version history of a RAP behavior definition. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of a RAP behavior definition.

### GetBehaviorImplementation

**Old:** [read-only] Reads the source of a RAP behavior implementation class at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of a RAP behavior implementation class, or its metadata.

### GetClass

**Old:** [read-only] Reads the source of an ABAP class at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of an ABAP class, or its metadata.

### GetClassVersionDiff

**Old:** [read-only] Compares two versions of the same ABAP class, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same ABAP class from its version history and compares them.

### GetClassVersionSource

**Old:** [read-only] Reads the source of one version of an ABAP class, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of an ABAP class's source from its version history.

### GetClassVersions

**Old:** [read-only] Lists the version history of an ABAP class. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of an ABAP class.

### GetDataElement

**Old:** [read-only] Reads an ABAP data element at the version asked, with its domain or built-in type, its labels, search help, package and description. SAP's data as it came.

**New:** [read-only] Reads an ABAP data element at the version asked, with its domain or built-in type, its labels, search help, package and description.

### GetDdl

**Old:** [read-only] Reads the source of a CDS view or classic DDL view at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of a CDS view or classic DDL view, or its metadata.

### GetDdlVersionDiff

**Old:** [read-only] Compares two versions of the same CDS view (DDL source), taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same CDS view (DDL source) from its version history and compares them.

### GetDdlVersionSource

**Old:** [read-only] Reads the source of one version of a CDS view (DDL source), from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of the source of a CDS view (DDL source) from its version history.

### GetDdlVersions

**Old:** [read-only] Lists the version history of a CDS view (DDL source). For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of a CDS view (DDL source).

### GetDomain

**Old:** [read-only] Reads an ABAP domain at the version asked, with its data type, length, output format, value table, fixed values, package and description. SAP's data as it came.

**New:** [read-only] Reads an ABAP domain at the version asked, with its data type, length, output format, value table, fixed values, package and description.

### GetEnhancementImpl

**Old:** [read-only] Reads the active source of an ABAP enhancement implementation, by its name and enhancement spot. The enhancement spot, implementation's name and its source code.

**New:** [read-only] Reads the active source of an ABAP enhancement implementation, by its name and enhancement spot.

### GetEnhancementSpot

**Old:** [read-only] Reads an enhancement spot at its active version: its name, description, type, package and interface; for each BAdI definition: its name, short text and interface; for each related link: its address, relation, media type and title.

**New:** [read-only] Reads an enhancement spot at its active version.

### GetEnhancements

**Old:** [read-only] Lists the enhancement implementations of ABAP programs, includes, function groups or classes at their active version, and of their includes when asked. For each object read: its type and name, the main program of an include, how many enhancements it has and the total found across its includes. For each enhancement: its name, its type and its description. What SAP answered to each read it refused while finding the kind of an object. The includes whose enhancements SAP refused to read, with what it answered.

**New:** [read-only] Reads the enhancement implementations of ABAP programs, includes, function groups or classes at their active version, and of their includes when asked.

### GetFunctionGroup

**Old:** [read-only] Reads an ABAP function group at the version asked, with its package, description and contents. SAP's data as it came.

**New:** [read-only] Reads an ABAP function group at the version asked, with its package, description and contents.

### GetFunctionInclude

**Old:** [read-only] Reads the source of an include of an ABAP function group at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of an include of an ABAP function group, or its metadata.

### GetFunctionModule

**Old:** [read-only] Reads the source of an ABAP function module, BAPI and RFC-enabled ones too, with its parameter signature, at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of an ABAP function module, BAPI and RFC-enabled ones too, with its parameter signature, or its metadata.

### GetFunctionModuleVersionDiff

**Old:** [read-only] Compares two versions of the same ABAP function module, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same ABAP function module from its version history and compares them.

### GetFunctionModuleVersionSource

**Old:** [read-only] Reads the source of one version of an ABAP function module, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of an ABAP function module's source from its version history.

### GetFunctionModuleVersions

**Old:** [read-only] Lists the version history of an ABAP function module. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of an ABAP function module.

### GetInactiveObjects

**Old:** [read-only] Lists the inactive ABAP objects of the system: classes, tables, CDS views and other objects changed and awaiting activation: how many there are; for each inactive object: its type, its name and the object it belongs to, such as a function group.

**New:** [read-only] Reads the inactive ABAP objects of the system: classes, tables, CDS views and other objects changed and awaiting activation.

### GetInclude

**Old:** [read-only] Reads the source of an ABAP include at the version asked, or its metadata. Its source code. With a range asked, only that part of the source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of an ABAP include, or its metadata.

### GetIncludesList

**Old:** [read-only] Lists every include of an ABAP program or include, with the includes each one includes, down to the last. The object's type and name. The includes left unread are named. The object itself, its root and for each include it includes: its name and whether it includes itself again or was met before elsewhere. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads every include of an ABAP program or include, with the includes each one includes, down to the last. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetInterface

**Old:** [read-only] Reads the source of an ABAP interface at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of an ABAP interface, or its metadata.

### GetInterfaceVersionDiff

**Old:** [read-only] Compares two versions of the same ABAP interface, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same ABAP interface from its version history and compares them.

### GetInterfaceVersionSource

**Old:** [read-only] Reads the source of one version of an ABAP interface, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of an ABAP interface's source from its version history.

### GetInterfaceVersions

**Old:** [read-only] Lists the version history of an ABAP interface. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of an ABAP interface.

### GetLocalDefinitions

**Old:** [read-only] Reads the source of the local definitions include of an ABAP class at the version asked. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source.

**New:** [read-only] Reads the local definitions of an ABAP class.

### GetLocalMacros

**Old:** [read-only] Reads the source of the local macros include of an ABAP class at the version asked. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source.

**New:** [read-only] Reads the local macros of an ABAP class.

### GetLocalTestClass

**Old:** [read-only] Reads the source of the local test classes include of an ABAP class at the version asked. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source.

**New:** [read-only] Reads the local test classes of an ABAP class.

### GetLocalTypes

**Old:** [read-only] Reads the source of the local types (implementations) include of an ABAP class at the version asked. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source.

**New:** [read-only] Reads the local types and implementations of an ABAP class.

### GetMainPrograms

**Old:** [read-only] Finds the main programs of an ABAP include: each program that includes it, or the function group it belongs to. The include's name. For each main program: whether it is a program or a function group and its name.

**New:** [read-only] Reads the main programs of an ABAP include: each program that includes it, or the function group it belongs to.

### GetMessageClassMessage

**Old:** [read-only] Reads one message of an ABAP message class at its active version, with its number, text, self-explanatory and long-text flags, last changer and change time. SAP's data as it came.

**New:** [read-only] Reads one message of an ABAP message class at its active version, with its number, text, self-explanatory and long-text flags, last changer and change time.

### GetMetadataExtension

**Old:** [read-only] Reads the source of a CDS metadata extension at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of a CDS metadata extension, or its metadata.

### GetMetadataExtensionVersionDiff

**Old:** [read-only] Compares two versions of the same CDS metadata extension, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same CDS metadata extension from its version history and compares them.

### GetMetadataExtensionVersionSource

**Old:** [read-only] Reads the source of one version of a CDS metadata extension, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of a CDS metadata extension's source from its version history.

### GetMetadataExtensionVersions

**Old:** [read-only] Lists the version history of a CDS metadata extension. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of a CDS metadata extension.

### GetObjectDraft

**Old:** [read-only] Tells whether an ABAP class, interface, program, CDS view, table or other development object holds an unactivated change, and whose. Whether the object holds an unactivated change of any user. For each part, its main source or metadata or a class include: its name, its state (active, the caller's change, another user's change or undetermined), when that change was last written, how many seconds ago and the ETags of its active, inactive and working versions.

**New:** [read-only] Reads whether an ABAP class, interface, program, CDS view, table or other development object holds an unactivated change, and whose.

### GetObjectInfo

**Old:** [read-only] Reads the repository browser of a package, class, program, function group or other repository object, with descriptions and packages when asked: for each object: its type, name, description, package and objects it holds, down to the depth asked; for each object whose read failed: its type, name and failure. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the repository browser of a package, class, program, function group or other repository object, with descriptions and packages when asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetObjectOutline

**Old:** [read-only] Lists the components of an ABAP class, interface, program or function group, with where each one is defined in its source. The object's type and name. The include its components are defined in. For each component, such as a type, attribute, method, event, local class, form or module, at its depth: its name, its kind, its visibility, where its definition starts and the include it is defined in, where that differs.

**New:** [read-only] Reads the components of an ABAP class, interface, program or function group, with where each one is defined in its source.

### GetObjectStructure

**Old:** [read-only] Reads the structure of an ABAP repository object, such as a CDS view: its parts and their parts, down to the last level. Each part of the object, such as an element, an association or an annotation, is named by its type and its name or description, at its depth.

**New:** [read-only] Reads the structure of an ABAP repository object, such as a CDS view: its parts and their parts, down to the last level.

### GetObjectVersionDiff

**Old:** [read-only] Compares two versions of a class, program, CDS view or other source object, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of a class, program, CDS view or other source object from its version history and compares them.

### GetObjectVersionSource

**Old:** [read-only] Reads the source of one version of an ABAP class, program, interface, function module, table, CDS view or other versioned object, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of the source of an ABAP class, program, interface, function module, table, CDS view or other versioned object from its version history.

### GetObjectVersions

**Old:** [read-only] Lists the version history of an ABAP class, program, interface, function module, table, structure, CDS view or other versioned object. The object's type and name. For each version: its ID, its author, when it was saved, the transport that produced it and the URI of its source.

**New:** [read-only] Reads the version history of an ABAP class, program, interface, function module, table, structure, CDS view or other versioned object.

### GetObjectsByType

**Old:** [read-only] Lists the objects of one type, such as classes, tables, programs or interfaces, in an ABAP package or other composite object: the parent's type and name, node ID and number of objects; for each object of the type: its type, its name, its technical name where it differs, its URI when SAP lists it nameless and its short description, by default; the nodes SAP left unloaded are named; the nodes below it are named by their type and node ID.

**New:** [read-only] Reads the objects of one type, such as classes, tables, programs or interfaces, in an ABAP package or other composite object.

### GetObjectsList

**Old:** [read-only] Lists every object inside an ABAP program, function group, class, package or other composite object, down to its nested includes and subcomponents: the parent's type and name and number of objects; for each object inside it: its type, its name, its technical name where it differs and its URI when SAP lists it nameless. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads every object inside an ABAP program, function group, class, package or other composite object, down to its nested includes and subcomponents. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetPackage

**Old:** [read-only] Reads an ABAP package at the version asked: its name, description, type, super package, software component, application component, transport layer, language version and person responsible; for each subpackage: its name and its description.

**New:** [read-only] Reads an ABAP package at the version asked.

### GetPackageContents

**Old:** [read-only] Lists the objects of one or more ABAP packages, with the objects of their subpackages when asked. For each object of the package or a subpackage, under its own package: its type, its name, its technical name where it differs, its URI when SAP lists it nameless and its description, with descriptions asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the objects of one or more ABAP packages, with the objects of their subpackages when asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetPackageTree

**Old:** [read-only] Reads the whole hierarchy of one or more ABAP packages: each package with its subpackages and their objects, down to the last level. For each subpackage and object below it, at its depth: its type, its name, its technical name when SAP lists it nameless, its URI when SAP lists it nameless and its description, with descriptions asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the whole hierarchy of one or more ABAP packages: each package with its subpackages and their objects, down to the last level. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetProgram

**Old:** [read-only] Reads the source of an ABAP program (report), on ABAP Cloud one of SAP's standard programs, at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of an ABAP program (report), on ABAP Cloud one of SAP's standard programs, or its metadata.

### GetProgramVersionDiff

**Old:** [read-only] Compares two versions of the same ABAP program, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same ABAP program from its version history and compares them.

### GetProgramVersionSource

**Old:** [read-only] Reads the source of one version of an ABAP program, on ABAP Cloud one of SAP's standard programs, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of the source of an ABAP program, on ABAP Cloud one of SAP's standard programs from its version history.

### GetProgramVersions

**Old:** [read-only] Lists the version history of an ABAP program, on ABAP Cloud one of SAP's standard programs. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of an ABAP program, on ABAP Cloud one of SAP's standard programs.

### GetServiceBinding

**Old:** [read-only] Reads an OData service binding at its active version, with its binding definition, or its package, person responsible and description, in the format asked. SAP's data as it came.

**New:** [read-only] Reads an OData service binding at its active version, with its binding definition, or its package, person responsible and description, in the format asked.

### GetServiceBindingPreviewUrl

**Old:** [read-only] Builds the Fiori preview URL of a published OData service binding, with its service and $metadata URLs: its service's live state, OData protocol, service, service definition, service version, entity sets, binding category, client, logon language, associations, service URL, service URL source, $metadata URL, annotation URL, preview URL, preview descriptor, notes, whether it is published, whether the system's HTTP origin is known, what the preview URL still needs and the failure of reading the system's client and language.

**New:** [read-only] Reads the Fiori preview URL of a published OData service binding, with its service and $metadata URLs.

### GetServiceDefinition

**Old:** [read-only] Reads the source of a service definition at the version asked, or its metadata. Its source code and the version read. With a range asked, only that part of the source: where it starts, where it ends and the length of the whole source. Or, when asked, its metadata: its package, person responsible and description.

**New:** [read-only] Reads the current source code of a service definition, or its metadata.

### GetSqlQuery

**Old:** [read-only] Runs an ABAP SQL SELECT over database tables and CDS views and reads the data it selects, up to the number of records asked. SAP's data as it came. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the data an ABAP SQL SELECT selects from database tables and CDS views, up to the number of records asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetStructure

**Old:** [read-only] Reads an ABAP structure at the version asked, with its definition source, or its package, person responsible and description. SAP's data as it came.

**New:** [read-only] Reads an ABAP structure at the version asked, with its definition source, or its package, person responsible and description.

### GetStructureVersionDiff

**Old:** [read-only] Compares two versions of the same ABAP structure, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same ABAP structure from its version history and compares them.

### GetStructureVersionSource

**Old:** [read-only] Reads the source of one version of an ABAP structure, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of an ABAP structure's source from its version history.

### GetStructureVersions

**Old:** [read-only] Lists the version history of an ABAP structure. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of an ABAP structure.

### GetStructuresList

**Old:** [read-only] Reads the structures embedded in one or more ABAP structures, through their includes and appends, down to the last, at the version asked. The name of the structure read and whether its appends could be found. The appends SAP refused to read are named. For the structure itself and for each structure it embeds: its name, whether it is an include or an append, the component it is embedded under, whether it embeds itself again and whether SAP refused to read it. What SAP answered for each structure it refused to read. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the structures embedded in one or more ABAP structures, through their includes and appends, down to the last, at the version asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetTable

**Old:** [read-only] Reads an ABAP database table at the version asked, with its definition source, or its package, person responsible and description. SAP's data as it came.

**New:** [read-only] Reads an ABAP database table at the version asked, with its definition source, or its package, person responsible and description.

### GetTableContents

**Old:** [read-only] Reads the data of an ABAP database table or CDS view, as SE16 previews it, up to the number of records asked. SAP's data as it came. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the data of an ABAP database table or CDS view, as SE16 previews it, up to the number of records asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### GetTableSettings

**Old:** [read-only] Reads the technical settings of an ABAP database table at the version asked: its description, data class, size category, buffering, storage type, sharing type, load unit, translation, logging and whether AMDP may write to it on ABAP Cloud.

**New:** [read-only] Reads the technical settings of an ABAP database table at the version asked.

### GetTableType

**Old:** [read-only] Reads an ABAP table type at the version asked, with its element type, access, key, package and description. SAP's data as it came.

**New:** [read-only] Reads an ABAP table type at the version asked, with its element type, access, key, package and description.

### GetTableTypeVersions

**Old:** [read-only] Lists the version history of an ABAP table type. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of an ABAP table type.

### GetTableVersionDiff

**Old:** [read-only] Compares two versions of the same ABAP table, taken from its version history: the changes between their sources, whether they are identical and which source came back empty.

**New:** [read-only] Reads two versions of the same ABAP table from its version history and compares them.

### GetTableVersionSource

**Old:** [read-only] Reads the source of one version of an ABAP table, from its version history. The reference of the version read and its source code.

**New:** [read-only] Reads an older version of an ABAP table's source from its version history.

### GetTableVersions

**Old:** [read-only] Lists the version history of an ABAP table. For each version: its ID, its author, when it was saved, its title, the reference that reads its source, the transport that produced it and that transport's description.

**New:** [read-only] Reads the version history of an ABAP table.

### GetTextElements

**Old:** [read-only] Reads the text elements of an ABAP program, function group or class in its original language at the version asked: text symbols, selection texts and headings. For each text symbol: its key, its text and its maximum length. For each selection text: its name, its text and whether it is the dictionary's label. Its headings: the list heading, the first of the four headings below it, the second, the third and the fourth.

**New:** [read-only] Reads the text elements of an ABAP program, function group or class in its original language at the version asked: text symbols, selection texts and headings.

### GetTransaction

**Old:** [read-only] Reads the properties of an ABAP transaction code: the transaction's name, text and package; for each property, such as its application component, package, type, owner or language: its facet, its name and its text.

**New:** [read-only] Reads the properties of an ABAP transaction code.

### GetTransport

**Old:** [read-only] Reads an ABAP transport or one of its tasks by its number, and says which of the two it is. For a transport: its number, description, type, status, owner and target system and how many tasks it has. For each of its tasks: its number, owner, status, description and how many objects it holds. For a task: its number, its transport, description, type, status and owner, its transport's number, type, status and target system and how many objects it holds. For each of its objects: its program ID, type, name and position. The objects SAP lists only in part, with what it gives of each.

**New:** [read-only] Reads an ABAP transport or one of its tasks by its number, and says which of the two it is.

### GetUnitTestResult

**Old:** [read-only] Reads the result of an ABAP Unit test run by its id, waiting while the run goes on. The run's id, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it.

**New:** [read-only] Reads the result of an ABAP Unit test run by its id, waiting while the run goes on.

### GetWhereUsed

**Old:** [read-only] Finds where an ABAP class, function module, table or other repository object is used: every object that uses, calls or references it. How many references SAP counts. For each object that uses it, under its package: its type, its name, its URI when SAP lists it nameless and how it uses the object, where SAP tells it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads where an ABAP class, function module, table or other repository object is used: every object that uses, calls or references it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerAbapGit

**Old:** Changes abapGit repositories and their remotes: links a package to a remote, unlinks a package, pulls, pushes and switches the branch. action link: links an ABAP package to a remote abapGit repository on a branch and imports the branch's objects into it, recorded in a transport: SAP's status and whether SAP made the change or accepted it as its own job; for each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it. action unlink: unlinks an abapGit repository by its key, keeping its objects in the system and its remote as it is. action pull: pulls an abapGit repository from the branch it is linked on, importing every object changed in the remote, recorded in a transport: SAP's status and whether SAP made the change or accepted it as its own job; for each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it. action push: commits the objects and files chosen from an abapGit repository's staging, with its comment, author and committer, and pushes the commit to its remote branch: SAP's status and whether SAP made the change or accepted it as its own job. action switch_branch: switches an abapGit repository to a branch, creating the branch in the remote first when asked: SAP's status and whether SAP made the change or accepted it as its own job.

**New:** Changes abapGit repositories and their remotes: links a package to a remote, unlinks a package, pulls, pushes and switches the branch. action link: links an ABAP package to a remote abapGit repository on a branch and imports the branch's objects into it, recorded in a transport. action unlink: unlinks an abapGit repository by its key, keeping its objects in the system and its remote as it is. action pull: pulls an abapGit repository from the branch it is linked on, importing every object changed in the remote, recorded in a transport. action push: pushes the objects and files chosen from an abapGit repository's staging to its remote branch, as a commit with its comment, author and committer. action switch_branch: switches an abapGit repository to a branch, creating the branch in the remote first when asked.

### HandlerAbapGitGet

**Old:** [read-only] Reads abapGit repositories: the linked ones, a remote, the staged objects, the connection to a remote and a file. action repos: lists the abapGit repositories linked in the system, or the one with a key or of one package: for each repository linked: its key, its package, its branch, its remote URL and the state of its last pull or push on the cloud (blank initial, R running, S, W, E or A ended). action external_repo: checks an external git repository for abapGit before it is linked: its access and its branches: whether the remote repository is public or private; for each branch of the remote repository: its name and whether it is the head. action staging: gets the abapGit staging of a linked repository: what changed, to choose what a push commits: the author and the committer SAP proposes; for each changed file left unstaged, each staged file and each ignored file: its object's type, its object's name, its object's package, its file name, its state in the system and its state in the remote. action checks: checks that the system reaches an abapGit repository's remote and is let in. action file: reads one file of an abapGit repository, as the system holds it or as the remote branch holds it: the file's text as it is.

**New:** [read-only] Reads abapGit repositories: the linked ones, a remote, the staged objects, the connection to a remote and a file. action repos: lists the abapGit repositories linked in the system, or the one with a key or of one package. action external_repo: checks an external git repository for abapGit before it is linked: its access and its branches. action staging: reads the abapGit staging of a linked repository: what changed, to choose what a push commits. action checks: checks that the system reaches an abapGit repository's remote and is let in. action file: reads one file of an abapGit repository, as the system holds it or as the remote branch holds it.

### HandlerActivate

**Old:** Activates the ABAP repository object named, by its type or its ADT type, or the objects listed, at once or by an activation run it starts. object_type: CLASS, PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, TABLE, STRUCTURE, TABLE_TYPE, DDL, DOMAIN, DATA_ELEMENT, BEHAVIOR_DEFINITION, METADATA_EXTENSION, PACKAGE, SERVICE_DEFINITION, SERVICE_BINDING, FUNCTION_MODULE(object_name* as GROUP|MODULE, or object_name* with function_group_name*), BEHAVIOR_IMPLEMENTATION, PROGRAM_TEXT_ELEMENTS, FUNCTION_GROUP_TEXT_ELEMENTS, CLASS_TEXT_ELEMENTS.

**New:** Activates an ABAP class, program, include, interface, function group, table, structure, table type, CDS view, domain, data element, behavior definition, metadata extension, package, service definition, service binding, function module, behavior implementation, program text elements, function group text elements or class text elements, another object by its ADT type, or several objects together by an activation run.

### HandlerBackgroundRunDiscard

**Old:** [read-only] Ends a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted. Its run handle and whether it was cancelled or its answer deleted.

**New:** [read-only] Discards a background run by its run handle: a running read is cancelled and its session logged off, an ended run's answer deleted.

### HandlerBackgroundRunGet

**Old:** [read-only] Reads one of the caller's background runs by its run handle, with the answer of a run that has ended. Its run handle, whether it is running, finished or cancelled, the tool it runs, the object it runs, when it started, when it ended and what its tool answered once the run ended.

**New:** [read-only] Reads one of the caller's background runs by its run handle, with the answer of a run that has ended.

### HandlerBackgroundRunList

**Old:** [read-only] Lists the caller's background runs, running, finished and cancelled. For each run: its run handle, whether it is running, finished or cancelled, the tool it runs, the object it runs, when it started and when it ended.

**New:** [read-only] Lists the caller's background runs, running, finished and cancelled.

### HandlerBatch

**Old:** [read-only] Records the calls of the tools that allow it and sends them to SAP together, then reads each call's answer by its number. action begin: starts recording the calls of the tools that allow it, each under the next number, to send them together: that recording is on and the state handle: send it as the state_handle argument of every call (or in the x-mcp-state-handle header). action end: sends the recorded calls to SAP together, with the credentials in force, and splits SAP's answer by call: how many calls were recorded, how many were sent and how many parts SAP's answer held. action answers: reads the answer of each recorded call of the last sending, by its number: for each number asked: the number, whether it is an error, that the number is unanswered and why; for each block of the answer of a number: its kind, its text, its annotations and its metadata; for each part of SAP's answer a number kept: its status, its status text, its headers and its body.

**New:** [read-only] Records the calls of the tools that allow it and sends them to SAP together, then reads each call's answer by its number. action begin: starts recording the calls of the tools that allow it, each under the next number, to send them together. action end: sends the recorded calls to SAP together, with the credentials in force, and splits SAP's answer by call. action answers: reads the answer of each recorded call of the last sending, by its number. Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).

### HandlerCdsUnitTestResult

**Old:** [read-only] Reads the result of a CDS unit test run by its id. The run's id and the run's result as SAP gave it.

**New:** [read-only] Reads the result of a CDS unit test run by its id.

### HandlerCdsUnitTestStatus

**Old:** [read-only] Reads the status of a CDS unit test run by its id. The run's id, whether the run finished and SAP's progress status of the run.

**New:** [read-only] Reads the status of a CDS unit test run by its id.

### HandlerCheckRun

**Old:** [read-only] Checks the syntax of the ABAP repository object of the type object_type names, as stored or as the source given. object_type required: CLASS(object_name*), PROGRAM(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*), BEHAVIOR_DEFINITION(object_name*), METADATA_EXTENSION(object_name*).

**New:** [read-only] Checks the syntax of an ABAP class, program, interface, function group, function module, table, structure, table type, CDS view, domain, data element, package, behavior definition or metadata extension, as stored or as the source given.

### HandlerCreate

**Old:** Creates the ABAP repository object of the type object_type names, inactive, or a transport. Whether SAP took the change. For TRANSPORT: the number of the transport created, the number of its task, SAP's refusal of the task type and what is left to do when the task stays untyped. object_type required: PACKAGE(package_name*, super_package), DOMAIN(domain_name*, package_name*), DATA_ELEMENT(data_element_name*, package_name*), TRANSPORT(description*), TABLE(table_name*, package_name*), STRUCTURE(structure_name*, package_name*), TABLE_TYPE(table_type_name*, package_name*), DDL(ddl_name*, package_name*), SERVICE_DEFINITION(service_definition_name*, package_name*), SERVICE_BINDING(service_binding_name*, service_definition_name*, package_name*), CLASS(class_name*, package_name*), PROGRAM(program_name*, package_name*), INCLUDE(include_name*, package_name*), INTERFACE(interface_name*, package_name*), FUNCTION_GROUP(function_group_name*, package_name*), FUNCTION_MODULE(function_module_name*, function_group_name*), BEHAVIOR_DEFINITION(name*, package_name*, implementation_type*), BEHAVIOR_IMPLEMENTATION(class_name*, behavior_definition*, package_name*), METADATA_EXTENSION(name*, package_name*).

**New:** Creates an ABAP package, domain, data element, transport, table, structure, table type, CDS view, service definition, service binding, class, program, include, interface, function group, function module, behavior definition, behavior implementation or metadata extension, inactive where it is activated.

### HandlerDebugBatch

**Old:** [debug] Records the debugger calls at the stopped ABAP debuggee or the AMDP break and sends them together, then reads each call's outcome by its number. action begin: starts recording the debugger calls at the stopped ABAP debuggee or at the AMDP break, each under the next number, to send them together: that recording is on and the state handle: send it as the state_handle argument of every call (or in the x-mcp-state-handle header). action end: sends the recorded debugger calls together on the session they were recorded on, and splits SAP's answer by call: how many calls were recorded, how many were sent and how many parts SAP's answer held. action answers: reads the outcome of each recorded debugger call of the last sending, by its number: for each number asked: the number, whether it is an error, that the number is unanswered and why; for each block of the answer of a number: its kind, its text, its annotations and its metadata; for each part of SAP's answer a number kept: its status, its status text, its headers and its body.

**New:** [debug] Records the debugger calls at the stopped ABAP debuggee or the AMDP break and sends them together, then reads each call's outcome by its number. action begin: starts recording the debugger calls at the stopped ABAP debuggee or at the AMDP break, each under the next number, to send them together. action end: ends the recording of debugger calls, sending them together on the session they were recorded on, and splits SAP's answer by call. action answers: reads the outcome of each recorded debugger call of the last sending, by its number. Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).

### HandlerDebugBreakpoints

**Old:** [debug] Sets, rewrites and deletes the ABAP and AMDP debugger breakpoints, and the watchpoints of the attached ABAP debuggee. The debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header), the terminal id the runs carry, the IDE id the runs carry, the debugging mode and the user whose runs are caught. operation setBreakpoints: sets the ABAP breakpoint set of this debugging identity, shared by every IDE of the SAP user. operation syncBreakpoints: rewrites the ABAP breakpoints of the objects named or the whole set, or the breakpoints of the running AMDP session. operation deleteBreakpoint: deletes one ABAP breakpoint by its id: the id deleted. operation createWatchpoint: watches a variable of the attached ABAP debuggee. operation listWatchpoints: shows the watchpoints of the attached ABAP debuggee. operation deleteWatchpoint: removes a watchpoint of the attached ABAP debuggee.

**New:** [debug] Sets, rewrites and deletes the ABAP and AMDP debugger breakpoints, and the watchpoints of the attached ABAP debuggee. operation setBreakpoints: sets the ABAP breakpoint set of this debugging identity, shared by every IDE of the SAP user. operation syncBreakpoints: rewrites the ABAP breakpoints of the objects named or the whole set, or the breakpoints of the running AMDP session. operation deleteBreakpoint: deletes one ABAP breakpoint by its id. operation createWatchpoint: watches a variable of the attached ABAP debuggee. operation listWatchpoints: shows the watchpoints of the attached ABAP debuggee. operation deleteWatchpoint: removes a watchpoint of the attached ABAP debuggee.

### HandlerDebugMaintain

**Old:** [debug] Reads and changes the stopped ABAP or AMDP debuggee: its stack, its variables, its memory and its table variables. The debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header), the terminal id the runs carry, the IDE id the runs carry, the debugging mode and the user whose runs are caught. operation getStack: reads the call stack of the ABAP debuggee, the stopped position on top. operation getVariables: reads variables of the ABAP debuggee by name, a component or a table record by its path. operation getChildVariables: reads the members of variables of the ABAP debuggee, or its scopes. operation getMemorySizes: reads how much memory the ABAP debuggee uses. operation createMemorySnapshot: writes a memory snapshot of the ABAP debuggee. operation setVariableValue: sets the value of a variable of the ABAP debuggee. operation getDataPreview: reads the records of a table variable at an AMDP break.

**New:** [debug] Reads and changes the stopped ABAP or AMDP debuggee: its stack, its variables, its memory and its table variables. operation getStack: reads the call stack of the ABAP debuggee, the stopped position on top. operation getVariables: reads variables of the ABAP debuggee by name, a component or a table record by its path. operation getChildVariables: reads the members of variables of the ABAP debuggee, or its scopes. operation getMemorySizes: reads how much memory the ABAP debuggee uses. operation createMemorySnapshot: writes a memory snapshot of the ABAP debuggee. operation setVariableValue: sets the value of a variable of the ABAP debuggee. operation getDataPreview: reads the records of a table variable at an AMDP break.

### HandlerDebugSession

**Old:** [debug] Listens for, attaches and ends ABAP debuggees, and opens and ends AMDP debug sessions, one SAP call per operation. The debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header), the terminal id the runs carry, the IDE id the runs carry, the debugging mode and the user whose runs are caught. operation checkListener: checks whether another debugger holds the ABAP debugging of this identity: that the debugging of this identity is free to take. operation listen: listens for an ABAP debuggee for the seconds asked and gives the one caught. operation stopListener: stops the ABAP listener and deletes the identity's breakpoints: that the listener stopped. operation attach: attaches the caught ABAP debuggee, so it can be stepped and read. operation detachDebugger: detaches the debugger from the ABAP debuggee, which runs on: that the debugger let the debuggee go. operation terminateDebuggee: ends the ABAP debuggee where it stands: that the debuggee ended. operation terminateDebugger: frees the ABAP debugger: that the debugger is free. operation setDebuggerSettings: sets the debugger settings given at the attached ABAP debuggee: whether system programs are debugged, whether update tasks are debugged, whether exception objects are created, whether background RFC is debugged and whether shared objects are debugged. operation start: opens an AMDP debug session for the connected SAP user. operation getEvents: reads the events of the AMDP debug session: its breaks, its breakpoint confirmations and its close. operation stop: ends the AMDP debug session: the id SAP confirms it by in an event. operation deleteDebuggee: cancels the execution of an AMDP debuggee: the id SAP confirms it by in an event. operation end: logs off every connection of the debug state and ends it, the user's breakpoints staying set: that the debug state ended and how many connections were logged off.

**New:** [debug] Listens for, attaches and ends ABAP debuggees, and opens and ends AMDP debug sessions, one SAP call per operation. operation checkListener: checks whether another debugger holds the ABAP debugging of this identity. operation listen: listens for an ABAP debuggee for the seconds asked and gives the one caught. operation stopListener: stops the ABAP listener and deletes the identity's breakpoints. operation attach: attaches the caught ABAP debuggee, so it can be stepped and read. operation detachDebugger: detaches the debugger from the ABAP debuggee, which runs on. operation terminateDebuggee: ends the ABAP debuggee where it stands. operation terminateDebugger: frees the ABAP debugger. operation setDebuggerSettings: sets the debugger settings given at the attached ABAP debuggee. operation start: opens an AMDP debug session for the connected SAP user. operation getEvents: reads the events of the AMDP debug session: its breaks, its breakpoint confirmations and its close. operation stop: ends the AMDP debug session. operation deleteDebuggee: cancels the execution of an AMDP debuggee. operation end: logs off every connection of the debug state and ends it, the user's breakpoints staying set.

### HandlerDebugStep

**Old:** [debug] Moves the stopped ABAP or AMDP debuggee by one step, one SAP call per operation. The debug state's handle while it holds something: send it as the state_handle argument of every call (or in the x-mcp-state-handle header), the terminal id the runs carry, the IDE id the runs carry, the debugging mode and the user whose runs are caught. operation stepInto: steps the ABAP debuggee into the call where it stands. operation stepOver: steps the ABAP or AMDP debuggee over the statement where it stands. operation stepReturn: steps the ABAP debuggee out of the current call. operation stepContinue: lets the ABAP or AMDP debuggee run on to its next stop. operation stepRunToLine: runs the ABAP debuggee to the source position named. operation stepJumpToLine: moves the ABAP debuggee to the source position named, skipping what lies between. operation setStackPosition: selects the stack frame of the ABAP debuggee whose variables are read: the frame selected.

**New:** [debug] Steps the stopped ABAP or AMDP debuggee, one SAP call per operation. operation stepInto: steps the ABAP debuggee into the call where it stands. operation stepOver: steps the ABAP or AMDP debuggee over the statement where it stands. operation stepReturn: steps the ABAP debuggee out of the current call. operation stepContinue: lets the ABAP or AMDP debuggee run on to its next stop. operation stepRunToLine: runs the ABAP debuggee to the source position named. operation stepJumpToLine: moves the ABAP debuggee to the source position named, skipping what lies between. operation setStackPosition: selects the stack frame of the ABAP debuggee whose variables are read.

### HandlerDelete

**Old:** Deletes the ABAP repository object of the type object_type names, or empties a class include under the class's lock. Whether SAP deleted the object, its name and SAP's message about it. object_type required: PACKAGE(package_name*, transport_request), DOMAIN(domain_name*, transport_request), DATA_ELEMENT(data_element_name*, transport_request), TABLE(table_name*, transport_request), STRUCTURE(structure_name*, transport_request), TABLE_TYPE(table_type_name*, transport_request), DDL(ddl_name*, transport_request), SERVICE_DEFINITION(service_definition_name*, transport_request), SERVICE_BINDING(service_binding_name*, transport_request), CLASS(class_name*, transport_request), CDS_UNIT_TEST(class_name*, transport_request), PROGRAM(program_name*, transport_request), INCLUDE(include_name*, transport_request), INTERFACE(interface_name*, transport_request), FUNCTION_GROUP(function_group_name*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, transport_request), BEHAVIOR_DEFINITION(behavior_definition_name*, transport_request), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*, transport_request), METADATA_EXTENSION(metadata_extension_name*, transport_request), LOCAL_TEST_CLASS(class_name*, lock_handle*, transport_request), LOCAL_TYPES(class_name*, lock_handle*, transport_request), LOCAL_DEFINITIONS(class_name*, lock_handle*, transport_request), LOCAL_MACROS(class_name*, lock_handle*, transport_request), UNIT_TEST(class_name*, lock_handle*, transport_request). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**New:** Deletes an ABAP package, domain, data element, table, structure, table type, CDS view, service definition, service binding, class, CDS unit test, program, include, interface, function group, function module, behavior definition, behavior implementation, metadata extension, local test class, class local types, class local definitions, class local macros or class unit test, a class include under the class's lock. Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

### HandlerDeletionCheck

**Old:** [read-only] Asks SAP whether the ABAP repository object of the type object_type names can be deleted. Whether SAP lets the object be deleted, its name and SAP's message about it. object_type and object_name required: PACKAGE, DOMAIN, DATA_ELEMENT, TABLE, STRUCTURE, TABLE_TYPE, DDL, SERVICE_DEFINITION, SERVICE_BINDING, CLASS, CDS_UNIT_TEST (its test class), PROGRAM, INCLUDE, INTERFACE, FUNCTION_GROUP, FUNCTION_MODULE (object_name GROUP|MODULE), BEHAVIOR_DEFINITION, BEHAVIOR_IMPLEMENTATION, METADATA_EXTENSION.

**New:** [read-only] Checks whether SAP lets an ABAP package, domain, data element, table, structure, table type, CDS view, service definition, service binding, class, CDS unit test, program, include, interface, function group, function module, behavior definition, behavior implementation or metadata extension be deleted.

### HandlerDumpList

**Old:** [read-only] Reads one page of the short dumps, system messages or SAP Gateway errors of an ABAP system, newest first, by user, object and time. For the feed read: how many items it holds, where the next read starts when more remain and the second holding more items than one read gives. For each short dump, newest first: its dump ID, when it happened and its title. For each system message: its ID, when it was created, its author and its title. For each SAP Gateway error: its operation ID, the kind of its detail, when it happened, its type, its short text and the user it happened to. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Lists one page of the short dumps, system messages or SAP Gateway errors of an ABAP system, newest first, by user, object and time. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerDumpView

**Old:** [read-only] Reads an ABAP runtime dump by its id, with a summary of where and why its program terminated. The dump's id, the view read, the summary of where and why its program terminated and the dump as SAP gave it.

**New:** [read-only] Reads an ABAP runtime dump by its id, with a summary of where and why its program terminated.

### HandlerGet

**Old:** [read-only] Reads one part of the ABAP repository object of the type object_type names, of the repository by ADT address, or of an activation run by its id. part source: reads the source of the object at the version asked: its source code and the version read. part metadata: reads the metadata of the object at the version asked, as its type keeps it. part urls: builds the Fiori preview URL of a published OData service binding, with its service and $metadata URLs: its service's live state, OData protocol, service, service definition, service version, entity sets, binding category, client, logon language, associations, service URL, service URL source, $metadata URL, annotation URL, preview URL, preview descriptor, notes, whether it is published, whether the system's HTTP origin is known, what the preview URL still needs and the failure of reading the system's client and language. part contents: lists the objects of one or more ABAP packages, with the objects of their subpackages when asked: for each object of the package or a subpackage, under its own package: its type, its name, its technical name where it differs, its URI when SAP lists it nameless and its description, with descriptions asked. part main_programs: finds the main programs of an ABAP include: each program that includes it, or the function group it belongs to: the include's name; for each main program: whether it is a program or a function group and its name. part draft: tells whether an ABAP class, interface, program, CDS view, table or other development object holds an unactivated change, and whose: whether the object holds an unactivated change of any user; for each part, its main source or metadata or a class include: its name, its state (active, the caller's change, another user's change or undetermined), when that change was last written, how many seconds ago and the ETags of its active, inactive and working versions. part object_structure: reads the structure of an ABAP repository object, such as a CDS view: its parts and their parts, down to the last level: each part of the object, such as an element, an association or an annotation, is named by its type and its name or description, at its depth. part node_structure: reads one level of the repository browser of a package, class, program or other repository object, at its root or the node asked: whether SAP could load the level and what an empty package level means; for each object: its name, type, description, technical name and ADT URI; for each child node: its type and node ID. part virtual_folders: reads the virtual folders that group ABAP repository objects by package, group, type and other facets, for a name pattern: SAP's data as it came. part activation_status: reads the status of an activation run by its id: the run's id, the part read, the run's status, finished, error, failed or its progress and its status as SAP gave it. part activation_results: reads the results of an activation run by its id: SAP's verdict and the messages the run produced: the run's id, the part read, whether SAP activated it, by the results' verdict, whether it was already active and its results as SAP gave them; for each message of the run: its severity, its text, the object it is about, the address of that object, the object and its part as SAP describes them, the source it names, its position there and SAP's message code. object_type required: PACKAGE(package_name*; part contents: package_name* or package_names*), DOMAIN(domain_name*), DATA_ELEMENT(data_element_name*), TABLE(table_name*), STRUCTURE(structure_name*), TABLE_TYPE(table_type_name*), DDL(ddl_name*), SERVICE_DEFINITION(service_definition_name*), SERVICE_BINDING(service_binding_name*), CLASS(class_name*), LOCAL_TEST_CLASS(class_name*), LOCAL_TYPES(class_name*), LOCAL_DEFINITIONS(class_name*), LOCAL_MACROS(class_name*), PROGRAM(program_name*), INCLUDE(include_name*), INTERFACE(interface_name*), FUNCTION_GROUP(function_group_name*), FUNCTION_MODULE(function_module_name* as GROUP|MODULE, or function_module_name* with function_group_name*), BEHAVIOR_DEFINITION(behavior_definition_name*), BEHAVIOR_IMPLEMENTATION(behavior_implementation_name*), METADATA_EXTENSION(metadata_extension_name*), UNIT_TEST(run_id*), CDS_UNIT_TEST(run_id*), TRANSPORT(transport_number*), TABLE_SETTINGS(table_name*), PROGRAM_TEXT_ELEMENTS(program_name*), FUNCTION_GROUP_TEXT_ELEMENTS(function_group_name*), CLASS_TEXT_ELEMENTS(class_name*). Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the source code, metadata, contents, structure or unactivated change of an ABAP package, domain, data element, table, structure, table type, CDS view, service definition, service binding, class, local test class, class local types, class local definitions, class local macros, program, include, interface, function group, function module, behavior definition, behavior implementation, metadata extension, class unit test, CDS unit test, transport, table technical settings, program text elements, function group text elements or class text elements, or the status and results of an activation run. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerGetData

**Old:** [read-only] Reads the data of an ABAP database table or CDS view, or the data an ABAP SQL SELECT selects, up to the number of records asked. SAP's data as it came. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads the data of an ABAP database table or CDS view, or the data an ABAP SQL SELECT selects, up to the number of records asked. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerLeftoverSessionList

**Old:** [read-only] Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks. For each leftover session: its handle, whether it served an instance or a debug session, its destination, its SAP user and when it was last recorded.

**New:** [read-only] Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks.

### HandlerLeftoverSessionLogoff

**Old:** Logs off a leftover SAP session by its handle, releasing every lock it holds and deleting its record. The session's handle and that it is logged off.

**New:** Logs off a leftover SAP session by its handle, releasing every lock it holds and deleting its record.

### HandlerLock

**Old:** Locks the ABAP repository object of the type object_type names on the server instance that then holds the lock for its write, delete and unlock. The lock handle its write, delete and unlock take and the state handle of the instance that holds it: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header). object_type required: CLASS(object_name*), PROGRAM(object_name*), INCLUDE(object_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name*), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*, super_package), BEHAVIOR_DEFINITION(object_name*), BEHAVIOR_IMPLEMENTATION(object_name*), METADATA_EXTENSION(object_name*), SERVICE_DEFINITION(object_name*), SERVICE_BINDING(object_name*), TABLE_SETTINGS(object_name*), PROGRAM_TEXT_ELEMENTS(object_name*), FUNCTION_GROUP_TEXT_ELEMENTS(object_name*), CLASS_TEXT_ELEMENTS(object_name*).

**New:** Locks an ABAP class, program, include, interface, function group, function module, table, structure, table type, CDS view, domain, data element, package, behavior definition, behavior implementation, metadata extension, service definition, service binding, table technical settings, program text elements, function group text elements or class text elements for its update, delete and unlock on the server instance that holds the lock. Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).

### HandlerProfileList

**Old:** [read-only] Lists the ABAP profiler traces recorded in the system: how many there are; for each trace: its ID, when it was recorded, the object it traced, its state and its runtime.

**New:** [read-only] Lists the ABAP profiler traces recorded in the system.

### HandlerProfileRun

**Old:** Runs an ABAP class or an ABAP report, under a scheduled profiler trace when its profiler id is given. target_type CLASS: runs an ABAP class implementing if_oo_adt_classrun and gives its console output: the class that ran, its console output and the profiler and trace ids of a profiled run. target_type PROGRAM: runs an ABAP report and gives its output: the report that ran, its output and the profiler id of a profiled run.

**New:** Runs an ABAP class or an ABAP report, under a scheduled profiler trace when its profiler id is given. target_type CLASS: runs an ABAP class implementing if_oo_adt_classrun and gives its console output. target_type PROGRAM: runs an ABAP report and gives its output.

### HandlerProfileSchedule

**Old:** Schedules an ABAP profiler trace with its parameters, for a later profiled run of a class or a report. The profiler id a profiled run names.

**New:** Creates the parameters of an ABAP profiler trace, scheduling it for a later profiled run of a class or a report.

### HandlerProfileView

**Old:** [read-only] Reads one view of an ABAP profiler trace, its hit list, its statements or its database accesses, as recorded or summarised. mode raw: reads one view of an ABAP profiler trace: its hit list, its statements or its database accesses: the view read, the trace and the view's data as the profiler read it. mode analyze: summarises one view of an ABAP profiler trace, its hit list, its statements or its database accesses, ranked by time: the trace, the view read, the view's record count and its top records by time and the view's data as the profiler read it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads one view of an ABAP profiler trace, its hit list, its statements or its database accesses, as recorded or summarised. mode raw: reads one view of an ABAP profiler trace: its hit list, its statements or its database accesses. mode analyze: analyzes one view of an ABAP profiler trace, its hit list, its statements or its database accesses, ranked by time. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerServiceBindingListTypes

**Old:** [read-only] Lists the service binding types the system offers, such as OData V2 and OData V4, in the format asked. SAP's data as it came.

**New:** [read-only] Lists the service binding types the system offers, such as OData V2 and OData V4, in the format asked.

### HandlerSession (Streamable HTTP)

**Old:** [read-only] Opens or closes a long session on this server, which keeps its server instance and SAP connection between calls. action open: opens a long session on this server, keeping its server instance and SAP connection for every call that carries its state handle: the state handle every call of the session carries. action close: closes the long session a state handle names, logging off its SAP sessions and so releasing their locks: whether the session is closed and the locks, recorded calls and debug session it held.

**New:** [read-only] Opens or closes a long session on this server, which keeps its server instance and SAP connection between calls. action open: opens a long session on this server, keeping its server instance and SAP connection for every call that carries its state handle. action close: closes the long session a state handle names, logging off its SAP sessions and so releasing their locks.

### HandlerSystem

**Old:** [read-only] Reads across the ABAP system: source code, objects by name, usages, package hierarchies, transport orders, ATC findings, ATC results and one ATC result. action search_source: searches the ABAP source code of one or more packages for a text: programs, includes, function groups, classes, interfaces and CDS sources: how many objects and sources were searched, and how many objects matched; which limit stopped the search, when one did; the package parts SAP left unloaded are named, each by its package and type; the nameless objects SAP lists, left unsearched, are named by what tells them apart; for each match, under its object named by package, type and name: its include, its position in the source and the source code that matched, when snippets are asked; with objects asked, for each object it matched in, named by package, type and name: its include and how many matches it has. action search_object: finds ABAP repository objects by name or name pattern, of any type or of one: classes, programs, tables, interfaces and every other kind: for each object found: its name, its type, its description and its package. action where_used: finds where an ABAP class, function module, table or other repository object is used: every object that uses, calls or references it: how many references SAP counts; for each object that uses it, under its package: its type, its name, its URI when SAP lists it nameless and how it uses the object, where SAP tells it. action package_tree: reads the whole hierarchy of one or more ABAP packages: each package with its subpackages and their objects, down to the last level: for each subpackage and object below it, at its depth: its type, its name, its technical name when SAP lists it nameless, its URI when SAP lists it nameless and its description, with descriptions asked. action transports: lists a user's transports, workbench, customizing and transport-of-copies alike, that the user owns or holds a task in: how many there are; for each transport: its number, its type, its status, its owner, its target system and its description. action atc_findings: reads the findings of an ATC run by its worklist, whether the run was waited for or goes on in the background: the worklist ID; how many objects the run covered; how many findings there are; what an empty worklist means, while the run is still filling it; how many findings each priority has; for each finding: its object, its object's type, the part of the source it is in, its position in that source, its offset at that position, its priority, the check that found it and what the check says. action atc_results: lists the ATC results the system holds for a user or for every user, newest first, within an age range in days: how many results the system holds; for each result, newest first: its display id, its title, its check variant, its run series, when it was created, its finding counts per priority and its failure count. action atc_result: reads a stored ATC result by its display ID: its findings and the counts per priority: the result ID; its title; its check variant; when it was created; how many objects it covered; how many findings there are; how many findings each priority has; for each finding: its object, its object's type, the part of the source it is in, its position in that source, its offset at that position, its priority, the check that found it and what the check says. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Finds source code text, objects by name, where objects are used and package contents, and reads transport orders, ATC findings, ATC results and one ATC result. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### HandlerTransportCreate

**Old:** Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked. The number of the transport created, the number of its task, SAP's refusal of the task type and what is left to do when the task stays untyped.

**New:** Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked.

### HandlerTransportMoveObjects

**Old:** Moves objects from one transport task to another, each at its position in the task it leaves. Whether SAP took the change, the task they leave, the task they move to and where the change is confirmed. For each object sent: the object named and its position in the task it leaves.

**New:** Moves objects from one transport task to another, each at its position in the task it leaves.

### HandlerTransportSortAndCompress

**Old:** Sorts the objects of a transport task and merges its duplicates. Whether SAP took the change, the transport task and where the change is confirmed.

**New:** Sorts the objects of a transport task and merges its duplicates.

### HandlerUnitTestResult

**Old:** [read-only] Reads the result of an ABAP Unit test run by its id. The run's id and the run's result as SAP gave it.

**New:** [read-only] Reads the result of an ABAP Unit test run by its id.

### HandlerUnitTestRun

**Old:** Runs the ABAP Unit tests of chosen test classes, of a repository object or of a package, giving the run's id at once or the finished result of the test classes. The run's id to read its status and result by, the runner that ran it, whether the run finished and the run's result as SAP gave it.

**New:** Runs the ABAP Unit tests of chosen test classes, of a repository object or of a package, giving the run's id at once or the finished result of the test classes.

### HandlerUnitTestStatus

**Old:** [read-only] Reads the status of an ABAP Unit test run by its id. The run's id, whether the run finished and SAP's progress status of the run.

**New:** [read-only] Reads the status of an ABAP Unit test run by its id.

### HandlerUnlock

**Old:** Releases the lock this server instance holds on the ABAP repository object of the type object_type names, under its lock handle. Whether SAP took the change, that the lock was already released and why. object_type required: CLASS(object_name*, lock_handle*), PROGRAM(object_name*, lock_handle*), INCLUDE(object_name*, lock_handle*), INTERFACE(object_name*, lock_handle*), FUNCTION_GROUP(object_name*, lock_handle*), FUNCTION_MODULE(object_name*, lock_handle*), TABLE(object_name*, lock_handle*), STRUCTURE(object_name*, lock_handle*), TABLE_TYPE(object_name*, lock_handle*), DDL(object_name*, lock_handle*), DOMAIN(object_name*, lock_handle*), DATA_ELEMENT(object_name*, lock_handle*), PACKAGE(object_name*, lock_handle*), BEHAVIOR_DEFINITION(object_name*, lock_handle*), BEHAVIOR_IMPLEMENTATION(object_name*, lock_handle*), METADATA_EXTENSION(object_name*, lock_handle*), SERVICE_DEFINITION(object_name*, lock_handle*), SERVICE_BINDING(object_name*, lock_handle*), TABLE_SETTINGS(object_name*, lock_handle*), PROGRAM_TEXT_ELEMENTS(object_name*, lock_handle*), FUNCTION_GROUP_TEXT_ELEMENTS(object_name*, lock_handle*), CLASS_TEXT_ELEMENTS(object_name*, lock_handle*). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**New:** Unlocks an ABAP class, program, include, interface, function group, function module, table, structure, table type, CDS view, domain, data element, package, behavior definition, behavior implementation, metadata extension, service definition, service binding, table technical settings, program text elements, function group text elements or class text elements, releasing the lock this server instance holds. Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

### HandlerUpdate

**Old:** Writes the whole content of the ABAP repository object of the type object_type names, under the lock its lock handle names. Whether SAP took the change and a lock left held when its release failed. For SERVICE_BINDING: whether SAP made the change or started it, whether it has completed or runs in the background, SAP's severity, SAP's status text, what a started change means for the service and a lock left held when its release failed. object_type required: PACKAGE(package_name*, source_code*, transport_request), DOMAIN(domain_name*, source_code*, transport_request), DATA_ELEMENT(data_element_name*, source_code*, transport_request), TABLE_TYPE(table_type_name*, source_code*, transport_request), FUNCTION_GROUP(function_group_name*, source_code*, transport_request), TABLE(table_name*, ddl_code*, transport_request), STRUCTURE(structure_name*, ddl_code*, transport_request), DDL(ddl_name*, ddl_source*, transport_request), SERVICE_DEFINITION(service_definition_name*, source_code*, transport_request), CLASS(class_name*, source_code*, transport_request), LOCAL_TEST_CLASS(class_name*, test_class_code*, transport_request), LOCAL_TYPES(class_name*, local_types_code*, transport_request), LOCAL_DEFINITIONS(class_name*, definitions_code*, transport_request), LOCAL_MACROS(class_name*, macros_code*, transport_request), UNIT_TEST(class_name*, test_class_source*, transport_request), CDS_UNIT_TEST(class_name*, test_class_source*, transport_request), PROGRAM(program_name*, source_code*, transport_request), INCLUDE(include_name*, source_code*, part, transport_request), INTERFACE(interface_name*, source_code*, transport_request), FUNCTION_MODULE(function_module_name*, function_group_name*, source_code*, transport_request), BEHAVIOR_DEFINITION(name*, source_code*, transport_request), BEHAVIOR_IMPLEMENTATION(class_name*, implementation_code*, transport_request), METADATA_EXTENSION(name*, source_code*, transport_request), SERVICE_BINDING(service_binding_name*, desired_publication_state*, binding_variant*, service_name, service_version), TABLE_SETTINGS(table_name*, data_class, size_category, buffering, storage_type, sharing_type, load_unit, translation, logging_enabled, is_writable_by_amdp, transport_request), PROGRAM_TEXT_ELEMENTS(program_name*, symbols, selections, headings, transport_request), FUNCTION_GROUP_TEXT_ELEMENTS(function_group_name*, symbols, selections, headings, transport_request), CLASS_TEXT_ELEMENTS(class_name*, symbols, transport_request). Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

**New:** Updates an ABAP package, domain, data element, table type, function group, table, structure, CDS view, service definition, class, local test class, class local types, class local definitions, class local macros, class unit test, CDS unit test, program, include, interface, function module, behavior definition, behavior implementation, metadata extension, service binding, table technical settings, program text elements, function group text elements or class text elements, under its lock. Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).

### HandlerValidate

**Old:** [read-only] Validates the name of a new ABAP repository object of the type object_type names, before it is created. object_type required: CLASS(object_name*, superclass), PROGRAM(object_name*, package_name*), INCLUDE(object_name*, package_name*), INTERFACE(object_name*), FUNCTION_GROUP(object_name*), FUNCTION_MODULE(object_name* as GROUP|MODULE, description*), TABLE(object_name*), STRUCTURE(object_name*), TABLE_TYPE(object_name*, description), DDL(object_name*), DOMAIN(object_name*), DATA_ELEMENT(object_name*), PACKAGE(object_name*, super_package), BEHAVIOR_DEFINITION(object_name*, package_name*, description*, root_entity*, implementation_type*), BEHAVIOR_IMPLEMENTATION(object_name*, package_name*, behavior_definition), METADATA_EXTENSION(object_name*, description*, package_name*), SERVICE_BINDING(object_name*=service_binding_name*, service_definition_name*, package_name*).

**New:** [read-only] Validates the name of a new ABAP class, program, include, interface, function group, function module, table, structure, table type, CDS view, domain, data element, package, behavior definition, behavior implementation, metadata extension or service binding, before it is created.

### LinkAbapGitRepo

**Old:** Links an ABAP package to a remote abapGit repository on a branch and imports the branch's objects into it, recorded in a transport. SAP's status and whether SAP made the change or accepted it as its own job. For each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it.

**New:** Links an ABAP package to a remote abapGit repository on a branch and imports the branch's objects into it, recorded in a transport.

### ListATCResults

**Old:** [read-only] Lists the ATC results the system holds for a user or for every user, newest first, within an age range in days. How many results the system holds. For each result, newest first: its display id, its title, its check variant, its run series, when it was created, its finding counts per priority and its failure count. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Lists the ATC results the system holds for a user or for every user, newest first, within an age range in days. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### ListAbapGitRepos

**Old:** [read-only] Lists the abapGit repositories linked in the system, or the one with a key or of one package. For each repository linked: its key, its package, its branch, its remote URL and the state of its last pull or push on the cloud (blank initial, R running, S, W, E or A ended).

**New:** [read-only] Lists the abapGit repositories linked in the system, or the one with a key or of one package.

### ListBackgroundRuns

**Old:** [read-only] Lists the caller's background runs, running, finished and cancelled. For each run: its run handle, whether it is running, finished or cancelled, the tool it runs, the object it runs, when it started and when it ended.

**New:** [read-only] Lists the caller's background runs, running, finished and cancelled.

### ListFunctionGroupIncludes

**Old:** [read-only] Lists the includes of an ABAP function group, its TOP include among them, at its active version. The function group's name. How many there are. For each include: its name, its URI when SAP lists it nameless and its description.

**New:** [read-only] Lists the includes of an ABAP function group, its TOP include among them, at its active version.

### ListFunctionModules

**Old:** [read-only] Lists the function modules of an ABAP function group, at its active version. The function group's name. How many there are. For each function module: its name, its URI when SAP lists it nameless and its description.

**New:** [read-only] Lists the function modules of an ABAP function group, at its active version.

### ListLeftoverSessions

**Old:** [read-only] Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks. For each leftover session: its handle, whether it served an instance or a debug session, its destination, its SAP user and when it was last recorded.

**New:** [read-only] Lists the SAP sessions of this server's destination left open by an ended server process, which may still hold locks.

### ListServiceBindingTypes

**Old:** [read-only] Lists the service binding types the system offers, such as OData V2 and OData V4, in the format asked. SAP's data as it came.

**New:** [read-only] Lists the service binding types the system offers, such as OData V2 and OData V4, in the format asked.

### ListTransports

**Old:** [read-only] Lists a user's transports, workbench, customizing and transport-of-copies alike, that the user owns or holds a task in: how many there are; for each transport: its number, its type, its status, its owner, its target system and its description. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Lists a user's transports, workbench, customizing and transport-of-copies alike, that the user owns or holds a task in. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### LogoffLeftoverSession

**Old:** Logs off a leftover SAP session by its handle, releasing every lock it holds and deleting its record. The session's handle and that it is logged off.

**New:** Logs off a leftover SAP session by its handle, releasing every lock it holds and deleting its record.

### MemorySnapshotDelta

**Old:** [read-only] Compares two memory snapshots in a view: memory by kind, largest objects, an object's children or its referrers. SAP's data as it came.

**New:** [read-only] Compares two memory snapshots in a view: memory by kind, largest objects, an object's children or its referrers.

### MemorySnapshotGet

**Old:** [read-only] Reads one memory snapshot in a view: its header, memory by kind, largest objects, an object's children or its referrers. SAP's data as it came.

**New:** [read-only] Reads one memory snapshot in a view: its header, memory by kind, largest objects, an object's children or its referrers.

### MemorySnapshotList

**Old:** [read-only] Lists the memory snapshots the system holds, of one user when asked. Beside an empty set, that a user lacking the memory snapshot authorization gets one too. For each snapshot: its id, its user, when it was written, its size and the program it was written in.

**New:** [read-only] Lists the memory snapshots the system holds, of one user when asked.

### MoveTransportObjects

**Old:** Moves objects from one transport task to another, each at its position in the task it leaves. Whether SAP took the change, the task they leave, the task they move to and where the change is confirmed. For each object sent: the object named and its position in the task it leaves.

**New:** Moves objects from one transport task to another, each at its position in the task it leaves.

### PullAbapGitRepo

**Old:** Pulls an abapGit repository from the branch it is linked on, importing every object changed in the remote, recorded in a transport. SAP's status and whether SAP made the change or accepted it as its own job. For each object SAP lists: its type, its name, its package, its status and the severity of SAP's message for it.

**New:** Pulls an abapGit repository from the branch it is linked on, importing every object changed in the remote, recorded in a transport.

### PushAbapGitRepo

**Old:** Commits the objects and files chosen from an abapGit repository's staging, with its comment, author and committer, and pushes the commit to its remote branch. SAP's status and whether SAP made the change or accepted it as its own job.

**New:** Pushes the objects and files chosen from an abapGit repository's staging to its remote branch, as a commit with its comment, author and committer.

### ReadTransportActionLog

**Old:** [read-only] Reads the action log of a transport or task: every event of its life, its objects added and taken out among them: the transport number and number of events; for each event, such as created, object added, object deleted or owner changed: its text.

**New:** [read-only] Reads the action log of a transport or task: every event of its life, its objects added and taken out among them.

### ReadTransportObjects

**Old:** [read-only] Lists the objects a transport or one of its tasks holds, each with the position a removal names: the transport number and number of objects; for each object, under its task and its program ID: its type, its name and its position, which a removal names; the objects SAP lists nameless or untyped are named by what they carry.

**New:** [read-only] Reads the objects a transport or one of its tasks holds, each with the position a removal names.

### RemoveTransportObject

**Old:** Removes a named object from a transport task, at its position among the task's objects. Whether SAP took the change, that SAP's answer leaves the removal unconfirmed, the transport task, the object named, its position in the task and where the change is confirmed.

**New:** Removes a named object from a transport task, at its position among the task's objects.

### RunATC

**Old:** [read-only] Runs the ABAP Test Cockpit checks of a check variant over ABAP objects and packages, recording their findings in a new worklist. The check variant it ran, the worklist holding its findings, whether the call waited for the checks to end, the finding counts of a run waited for and the id of a started run to read its status by. For each object checked: its name, its type, the function group of a function include and the include of a class include.

**New:** [read-only] Runs the ABAP Test Cockpit checks of a check variant over ABAP objects and packages, recording their findings in a new worklist.

### RunAbapUnit

**Old:** Runs the ABAP Unit tests of a class, report, function group, function module's group, CDS view, package, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it.

**New:** Runs the ABAP Unit tests of a class, report, function group, function module's group, CDS view, package, waiting for the result or giving the run's id at once.

### RunCdsUnitTest

**Old:** Runs the ABAP Unit tests of a CDS view test class, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, whether the run finished and the run's result as SAP gave it.

**New:** Runs the ABAP Unit tests of a CDS view test class, waiting for the result or giving the run's id at once.

### RunFunctionGroupUnitTest

**Old:** Runs every ABAP Unit test of a function group, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it.

**New:** Runs every ABAP Unit test of a function group, waiting for the result or giving the run's id at once.

### RunFunctionModuleUnitTest

**Old:** Runs the ABAP Unit tests of the function group holding a function module, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it.

**New:** Runs the ABAP Unit tests of the function group holding a function module, waiting for the result or giving the run's id at once.

### RunProgramUnitTest

**Old:** Runs the ABAP Unit tests of an ABAP report, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it.

**New:** Runs the ABAP Unit tests of an ABAP report, waiting for the result or giving the run's id at once.

### RunUnitTest

**Old:** Runs the ABAP Unit tests of an ABAP class, waiting for the result or giving the run's id at once. The run's id to read its status and result by, SAP's status of a run yet to start, the runner that ran it, whether the run finished and the run's result as SAP gave it.

**New:** Runs the ABAP Unit tests of an ABAP class, waiting for the result or giving the run's id at once.

### RuntimeAnalyzeProfilerTrace

**Old:** [read-only] Summarises one view of an ABAP profiler trace, its hit list, its statements or its database accesses, ranked by time. The trace, the view read, the view's record count and its top records by time and the view's data as the profiler read it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Analyzes one view of an ABAP profiler trace, its hit list, its statements or its database accesses, ranked by time. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### RuntimeCreateProfilerTraceParameters

**Old:** Schedules an ABAP profiler trace with its parameters, for a later profiled run of a class or a report. The profiler id a profiled run names.

**New:** Creates the parameters of an ABAP profiler trace, scheduling it for a later profiled run of a class or a report.

### RuntimeGetDumpById

**Old:** [read-only] Reads an ABAP runtime dump by its id, with a summary of where and why its program terminated. The dump's id, the view read, the summary of where and why its program terminated and the dump as SAP gave it.

**New:** [read-only] Reads an ABAP runtime dump by its id, with a summary of where and why its program terminated.

### RuntimeGetGatewayErrorLog

**Old:** [read-only] Lists the errors of the SAP Gateway error log, the one /IWFND/ERROR_LOG shows, or reads the detail of one error: how many there are; for each error: its operation ID, the kind of its detail, when it happened, its type, its short text and the user it happened to.

**New:** [read-only] Reads the errors of the SAP Gateway error log, the one /IWFND/ERROR_LOG shows, or the detail of one error.

### RuntimeGetProfilerTraceData

**Old:** [read-only] Reads one view of an ABAP profiler trace: its hit list, its statements or its database accesses. The view read, the trace and the view's data as the profiler read it. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Reads one view of an ABAP profiler trace: its hit list, its statements or its database accesses. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### RuntimeListFeeds

**Old:** [read-only] Reads the runtime feeds of an ABAP system: its short dumps, system messages or SAP Gateway errors by user and time, or the feeds there are and their variants. For the feed read: how many items it holds, where the next read starts when more remain and the second holding more items than one read gives. For each feed there is: its ID, its title and its category. For each variant of a feed: its feed, its title, its query and whether it is the default. For each short dump, newest first: its dump ID, when it happened and its title. For each system message: its ID, when it was created, its author and its title. For each SAP Gateway error: its operation ID, the kind of its detail, when it happened, its type, its short text and the user it happened to. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Lists the short dumps, system messages or SAP Gateway errors of an ABAP system by user and time, or the runtime feeds there are and their variants. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### RuntimeListProfilerTraceFiles

**Old:** [read-only] Lists the ABAP profiler traces recorded in the system: how many there are; for each trace: its ID, when it was recorded, the object it traced, its state and its runtime.

**New:** [read-only] Lists the ABAP profiler traces recorded in the system.

### RuntimeListSystemMessages

**Old:** [read-only] Lists the system messages of the SAP system, the ones SM02 shows, optionally by one author: how many there are; for each system message: its ID, when it was created, its author and its title.

**New:** [read-only] Lists the system messages of the SAP system, the ones SM02 shows, optionally by one author.

### RuntimeRunClass

**Old:** Runs an ABAP class implementing if_oo_adt_classrun and gives its console output, under the ABAP profiler when asked. The class that ran, its console output and the profiler and trace ids of a profiled run.

**New:** Runs an ABAP class implementing if_oo_adt_classrun and gives its console output, under the ABAP profiler when asked.

### RuntimeRunProgram

**Old:** Runs an ABAP report and gives its output, under the ABAP profiler when asked. The report that ran, its output and the profiler id of a profiled run.

**New:** Runs an ABAP report and gives its output, under the ABAP profiler when asked.

### SearchObject

**Old:** [read-only] Finds ABAP repository objects by name or name pattern, of any type or of one: classes, programs, tables, interfaces and every other kind. For each object found: its name, its type, its description and its package. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Finds ABAP repository objects by name or name pattern, of any type or of one: classes, programs, tables, interfaces and every other kind. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### SearchSource

**Old:** [read-only] Searches the ABAP source code of one or more packages for a text: programs, includes, function groups, classes, interfaces and CDS sources. How many objects and sources were searched, and how many objects matched. Which limit stopped the search, when one did. The package parts SAP left unloaded are named, each by its package and type. The nameless objects SAP lists, left unsearched, are named by what tells them apart. For each match, under its object named by package, type and name: its include, its position in the source and the source code that matched, when snippets are asked. With objects asked, for each object it matched in, named by package, type and name: its include and how many matches it has. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

**New:** [read-only] Searches the ABAP source code of one or more packages for a text: programs, includes, function groups, classes, interfaces and CDS sources. Runs on an ABAP session of its own. By default the run goes on after the call, and its result comes back under the run_handle the call gives; with background false the result comes back in the call.

### SortAndCompressTransportTask

**Old:** Sorts the objects of a transport task and merges its duplicates. Whether SAP took the change, the transport task and where the change is confirmed.

**New:** Sorts the objects of a transport task and merges its duplicates.

### SwitchAbapGitBranch

**Old:** Switches an abapGit repository to a branch, creating the branch in the remote first when asked. SAP's status and whether SAP made the change or accepted it as its own job.

**New:** Switches an abapGit repository to a branch, creating the branch in the remote first when asked.

### UpdateBehaviorDefinition

**Old:** Updates the source code of an existing RAP behavior definition, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the source code of an existing RAP behavior definition, activating it when asked, recorded in the transport given.

### UpdateBehaviorImplementation

**Old:** Updates the implementations of an existing RAP behavior implementation class, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the implementations of an existing RAP behavior implementation class, activating it when asked, recorded in the transport given.

### UpdateCdsUnitTest

**Old:** Updates the ABAP Unit test classes of a CDS view test class from the test class source given, activating it, recorded in the transport given. Whether SAP took the change.

**New:** Updates the ABAP Unit test classes of a CDS view test class from the test class source given, activating it, recorded in the transport given.

### UpdateClass

**Old:** Updates the source code of an existing ABAP class, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the source code of an existing ABAP class, activating it when asked, recorded in the transport given.

### UpdateDataElement

**Old:** Updates the properties of an existing ABAP data element, replacing them whole and activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the type, labels, search help and SET/GET parameter of an existing ABAP data element, replacing them whole and activating it when asked.

### UpdateDdl

**Old:** Updates the DDL source of an existing CDS view or classic DDL view, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the DDL source of an existing CDS view or classic DDL view, activating it when asked, recorded in the transport given.

### UpdateDomain

**Old:** Updates the properties of an existing ABAP domain, replacing them whole and activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the data type, length, decimals, conversion exit, value table and fixed values of an existing ABAP domain, replacing them whole.

### UpdateFunctionGroup

**Old:** Updates the description of an existing ABAP function group, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the description of an existing ABAP function group, recorded in the transport given.

### UpdateFunctionGroupUnitTest

**Old:** Updates the ABAP Unit test classes of an ABAP function group from the test class source given, activating the group, recorded in the transport given. Whether SAP took the change.

**New:** Updates the ABAP Unit test classes of an ABAP function group from the test class source given, activating the group, recorded in the transport given.

### UpdateFunctionInclude

**Old:** Writes new source code into an existing include of an ABAP function group, activating it when asked.

**New:** Updates the source code of an existing include of an ABAP function group, activating it when asked.

### UpdateFunctionModule

**Old:** Updates the source code of an existing ABAP function module, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the source code of an existing ABAP function module in its function group, activating it when asked, recorded in the transport given.

### UpdateInclude

**Old:** Updates the source code of an existing ABAP include, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the source code of an existing ABAP include, activating it when asked, recorded in the transport given.

### UpdateIncludeMetadata

**Old:** Updates the stored metadata of an existing ABAP include, replacing it whole, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the stored metadata of an existing ABAP include, replacing it whole, recorded in the transport given.

### UpdateInterface

**Old:** Updates the source code of an existing ABAP interface, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the source code of an existing ABAP interface, activating it when asked, recorded in the transport given.

### UpdateLocalDefinitions

**Old:** Updates the local definitions of an existing ABAP class, activating the class when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the local definitions of an existing ABAP class, activating the class when asked, recorded in the transport given.

### UpdateLocalMacros

**Old:** Updates the local macros of an existing ABAP class, activating the class when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the local macros of an existing ABAP class, activating the class when asked, recorded in the transport given.

### UpdateLocalTestClass

**Old:** Updates the local test classes of an existing ABAP class, activating the class when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the local test classes of an existing ABAP class, activating the class when asked, recorded in the transport given.

### UpdateLocalTypes

**Old:** Updates the local types of an existing ABAP class, activating the class when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the local types of an existing ABAP class, activating the class when asked, recorded in the transport given.

### UpdateMessageClass

**Old:** Updates the description of an existing ABAP message class (T100), recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the description of an existing ABAP message class (T100), recorded in the transport given.

### UpdateMessageClassMessage

**Old:** Updates the text and flags of a message in an ABAP message class (T100), creating the message when the class lacks it, recorded in the transport given. Whether SAP took the change.

**New:** Updates the text and flags of a message in an ABAP message class (T100), creating the message when the class lacks it, recorded in the transport given.

### UpdateMetadataExtension

**Old:** Updates the source code of an existing CDS metadata extension, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the source code of an existing CDS metadata extension, activating it when asked, recorded in the transport given.

### UpdatePackage

**Old:** Updates the description of an existing ABAP package, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the description of an existing ABAP package, recorded in the transport given.

### UpdateProgram

**Old:** Updates the source code of an existing ABAP program (report), activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the source code of an existing ABAP program (report), activating it when asked, recorded in the transport given.

### UpdateProgramUnitTest

**Old:** Updates the ABAP Unit test classes of an ABAP report from the test class source given, activating the report, recorded in the transport given. Whether SAP took the change.

**New:** Updates the ABAP Unit test classes of an ABAP report from the test class source given, activating the report, recorded in the transport given.

### UpdateServiceBinding

**Old:** Updates the publication state of an existing OData service binding, publishing or unpublishing its service. Whether SAP made the change or started it, whether it has completed or runs in the background, SAP's severity, SAP's status text, what a started change means for the service and a lock left held when its release failed.

**New:** Updates the publication state of an existing OData service binding, publishing or unpublishing its service.

### UpdateServiceDefinition

**Old:** Updates the source code of an existing service definition, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the source code of an existing service definition, activating it when asked, recorded in the transport given.

### UpdateStructure

**Old:** Updates the DDL source of an existing ABAP structure, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the DDL source of an existing ABAP structure, which defines its components, activating it when asked, recorded in the transport given.

### UpdateTable

**Old:** Updates the DDL source of an existing ABAP database table, activating it when asked, recorded in the transport given. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the DDL source of an existing ABAP database table, which defines its key, components and delivery class, activating it when asked.

### UpdateTableSettings

**Old:** Updates the technical settings of an existing ABAP database table, each setting given over the stored one, activating the table when asked. Whether SAP took the change and a lock left held when its release failed.

**New:** Updates the technical settings of an existing ABAP database table, its data class, size category, buffering and logging, each given over the stored one.

### UpdateTableType

**Old:** Updates the definition of an existing ABAP table type : its description, the type it holds, its access type and primary key, activating it when asked. Whether SAP took the change, a lock left held when its release failed, the version its stored definition was read at and SAP's failure when that read failed.

**New:** Updates the definition of an existing ABAP table type: its description, the type it holds, its access type and primary key, activating it when asked.

### UpdateTextElements

**Old:** Updates the text elements of an existing ABAP program, function group or class, each part given replacing its stored one, activating the object when asked. Whether SAP took the change and a lock left held when its release failed. For each part SAP saved: its name and what was saved.

**New:** Updates the text elements of an existing ABAP program, function group or class, each part given replacing its stored one, activating the object when asked.

### UpdateUnitTest

**Old:** Updates the ABAP Unit test classes of an ABAP class from the test class source given, activating the class, recorded in the transport given. Whether SAP took the change.

**New:** Updates the ABAP Unit test classes of an ABAP class from the test class source given, activating the class, recorded in the transport given.

## Unchanged

- **ActivateBehaviorDefinition:** Activates a RAP behavior definition, so its inactive version is in force.
- **ActivateClass:** Activates an ABAP class, so its inactive version is in force.
- **ActivateDataElement:** Activates an ABAP data element, so its inactive version is in force.
- **ActivateDdl:** Activates a CDS view, so its inactive version is in force.
- **ActivateDomain:** Activates an ABAP domain, so its inactive version is in force.
- **ActivateFunctionGroup:** Activates an ABAP function group, so its inactive version is in force.
- **ActivateFunctionModule:** Activates an ABAP function module of a function group, so its inactive version is in force.
- **ActivateInclude:** Activates an ABAP include, so its inactive version is in force.
- **ActivateInterface:** Activates an ABAP interface, so its inactive version is in force.
- **ActivateMetadataExtension:** Activates a CDS metadata extension, so its inactive version is in force.
- **ActivateObjects:** Activates several ABAP repository objects of any type together in one activation, such as domains, data elements and tables at once.
- **ActivateProgram:** Activates an ABAP program (report), so its inactive version is in force.
- **ActivateServiceBinding:** Activates an OData service binding, so its inactive version is in force.
- **ActivateServiceDefinition:** Activates a service definition, so its inactive version is in force.
- **ActivateStructure:** Activates an ABAP structure, so its inactive version is in force.
- **ActivateTable:** Activates an ABAP database table, so its inactive version is in force.
- **ActivateTableType:** Activates an ABAP table type, so its inactive version is in force.
- **AmdpDebugCancel:** [debug] Cancels the execution of the stopped AMDP debuggee.
- **CheckAbapGitRepo:** [read-only] Checks that the system reaches an abapGit repository's remote and is let in.
- **CheckBehaviorDefinition:** [read-only] Checks the syntax of a RAP behavior definition.
- **CheckClass:** [read-only] Checks the syntax of an ABAP class as stored or as the source given.
- **CheckDataElement:** [read-only] Checks the syntax of an ABAP data element.
- **CheckDdl:** [read-only] Checks the syntax of a CDS view as stored or as the source given.
- **CheckDomain:** [read-only] Checks the syntax of an ABAP domain.
- **CheckFunctionGroup:** [read-only] Checks the syntax of an ABAP function group.
- **CheckFunctionModule:** [read-only] Checks the syntax of an ABAP function module of a function group.
- **CheckInterface:** [read-only] Checks the syntax of an ABAP interface.
- **CheckMetadataExtension:** [read-only] Checks the syntax of a CDS metadata extension.
- **CheckPackage:** [read-only] Checks the syntax of an ABAP package.
- **CheckProgram:** [read-only] Checks the syntax of an ABAP program (report).
- **CheckStructure:** [read-only] Checks the syntax of an ABAP structure as stored or as the source given.
- **CheckTable:** [read-only] Checks the syntax of an ABAP database table as stored or as the source given.
- **CheckTableType:** [read-only] Checks an ABAP table type for errors and warnings.
- **CreatePackage:** Creates a new ABAP package under a super package, with its type, software component, transport layer and description.
- **GetMessageClass:** [read-only] Reads an ABAP message class: its messages with their numbers and texts, and its master language.
- **GetObjectNodeFromCache:** [read-only] Reads one repository object the last objects listing named, by its type, name and technical name, with the content at its URI in the active version.
- **GetTypeInfo:** [read-only] Reads the DDIC definition of a type name: each data element, domain, structure or table type of that name, its inactive version where one exists.
- **HandlerServiceBindingValidate:** [read-only] Validates a new OData service binding for a service definition, in the package and version given, by SAP's transport check of its name and package.
- **UnlinkAbapGitRepo:** Unlinks an abapGit repository by its key, keeping its objects in the system and its remote as it is.
- **ValidateServiceBinding:** [read-only] Validates a new OData service binding for a service definition, in the package and version given, by SAP's transport check of its name and package.
