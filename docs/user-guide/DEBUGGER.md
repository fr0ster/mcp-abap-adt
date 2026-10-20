# Debugger

The server debugs ABAP and AMDP for a model: it arms breakpoints, catches a
program at them, reads the stack, variables and memory, steps, and lets the
program go. This page describes what a debug session is, what keeps it alive
between tool calls, what ends it, and what the SAP system decides on its own.

The tool reference is generated: the [Debug group](AVAILABLE_TOOLS.md#debug-group)
of the full server, and the four debugger tools of the
[compact server](../../compact/docs/AVAILABLE_TOOLS.md). The sections from "Catching" on describe
the full server's debug session; the compact debugger sends one request per call:
[The compact debugger](#the-compact-debugger-one-request-per-call).

## Where it is served

**The binary fixes the tool set** (19.0.0; there is no `--exposition`). The debugger is served,
always, by the write binaries and by no `-ro` binary, because in user mode a breakpoint catches
every request of the request user — the connected SAP user unless another is named (see
[What a breakpoint catches](#what-a-breakpoint-catches)):

```bash
mcp-abap-adt            # the full server (and -http, -sse): 30 debugger tools and the debugger batch beside the rest
mcp-abap-adt-compact    # compact (and -compact-http, -compact-sse): four debugger tools and HandlerDebugBatch beside the 29
mcp-abap-adt-ro         # no debugger (nor -http-ro, -sse-ro, -compact-ro, -compact-http-ro, -compact-sse-ro)
```

Where a breakpoint must not be possible, install a `-ro` binary. An embedder passes
`includeDebug: true` to `HandlerExporter`, or adds `DebugHandlersGroup` from
`@mcp-abap-adt/lib/handlers` to its own registry.

## Scope: what it debugs

The debugger catches **requests that start after it listens**. In user mode (the
default) those are the requests of one SAP user — the connected one, or another
named by `request_user`; in terminal mode (`debugging_mode: terminal`) those that
carry this debug session's terminal id and IDE id. The model can have the server
run a class (as a console application) or a report in the background once it
listens; in user mode it can also catch what that user runs elsewhere. It cannot
attach to a process or a request that is already running (see
[What ADT cannot do](#what-adt-cannot-do)).

## The debug session and its handle

A starting tool — `DebugStartListener`, `DebugTakeOverListener`, `AmdpDebugStart` —
takes its parameters when it creates the session
(the breakpoints, an optional background run; for ABAP also `request_user`,
`debugging_mode` and `settings`) and answers a **`state_handle`**. Every other
session tool requires that handle. A start needs **at least one breakpoint**: the
tool's schema requires it, and the session refuses an empty list before anything
is sent. An ABAP start answers the ids and the identity in force beside the handle
(`terminal_id`, `ide_id`, `debugging_mode`, and `request_user` in user mode).

- The handle is opaque: 128 random bits, minted by the server instance that holds
  the session. It names the state of an LLM conversation, not a user and not an
  MCP session; one conversation may open any number of MCP sessions, and the
  handle is how it finds its debug session again.
- An unknown handle, and the handle of a session that has ended, get the same
  answer: `state is not available`. Over Streamable HTTP the pool gives it before any instance
  is made: such a tool call logs on nowhere.
- After a complete stop (`DebugStop`, the idle bound) the handle
  is invalid for good; the next start answers a new one. A stop that could not
  undo everything keeps the handle valid, so the stop can be retried.
- **The handle is a bearer secret.** Whoever holds it acts with the SAP session
  behind it, like a session cookie. It travels in tool arguments, the model's
  context and transcripts; keeping it safe (HTTPS beyond `127.0.0.1`, isolation,
  no wire trace on a shared machine) is the deployer's. See
  [Security](../../SECURITY.md#credentials-sessions-and-state-handles). The
  server's own log lines never carry it.

There is no owner and no limit of the server's own: what bounds parallel debug
sessions is the SAP system's listener conflict (next section).

## The SAP ids, and when to share one

The system knows a debugger by the SAP user and two ids, a **terminal id** and an
**IDE id**. By default the server generates both at random for each server
instance (32 upper-case hex characters). Either can be stated instead, each on its
own; the first found wins:

1. the request headers `x-sap-debug-terminal-id` and `x-sap-debug-ide-id`
   (`@mcp-abap-adt/http`: each request; `@mcp-abap-adt/sse`: the connection's
   opening request);
2. `SAP_DEBUG_TERMINAL_ID` and `SAP_DEBUG_IDE_ID` in the destination's own `.env`
   — `@mcp-abap-adt/core` (stdio) only: HTTP and SSE serve no destination;
3. the same variables in the process environment.

The ids are read when the instance's debugger is first used — the first debug
tool call — and stay for that instance. They are never tool arguments. The server
does not validate them: the system judges them, and its refusal reaches the model
as a tool error.

What the system does with them, measured on premise and on the cloud
(2026-10-10/11):

- The listener conflict is keyed by the **IDE id** only. The same IDE id never
  conflicts: both listeners stay, and the newer one catches. Another IDE id of the
  same SAP user conflicts — see [Conflicts are errors](#conflicts-are-errors).
- The terminal id changes nothing in user mode; terminal mode catches by it and
  the IDE id (next bullet).
- In **terminal mode** (`debugging_mode: terminal`) a listener catches only the
  requests that carry its terminal id and IDE id, and the runs this server
  starts for the debug session carry them (measured on premise, 2026-10-12), so
  terminal mode needs neither id configured: a stated id only replaces the random
  one. Any other request is caught only if it carries the same ids, so a
  terminal start without a run catches only those.
- **Breakpoints belong to the SAP user, not to an IDE id**: in user mode the set
  is the SAP user's with the request user, in terminal mode the SAP user's whatever
  the ids (measured on premise (2026-10-12), BASIS 816). In user mode whichever
  listener of that user is active catches them. See
  [The breakpoint set and its key](#the-breakpoint-set-and-its-key).

So two server instances of the same SAP user, with the default random ids, meet as
the system's conflict. Sharing an IDE id is **your choice and your
responsibility**: it is how a server joins an IDE's debugging of the same user (or
finds its own listener again after a restart, below), and what it brings — shared
catches, no conflict between the two — comes with it.

## What keeps the live state between tool calls

What a debug session needs was measured (on premise, 2026-10-10):

- a breakpoint stops a program only while a listener poll is open — hit between
  two polls, the program ran through;
- a caught program that nobody attaches resumes by itself after about 30 s, and a
  late attach fails;
- after an attach, only the ABAP session that attached can work the stop — a new
  session under the same ids is answered `noSessionAttached`.

So the server keeps a listener poll open continuously, attaches a catch at once on
a connection of its own, and keeps that connection for the stop. That needs a
holder that lives between tool calls — the server instance — and something has to
keep the instance:

| Transport | Who keeps the instance |
|---|---|
| stdio (`@mcp-abap-adt/core`, `mcp-abap-adt`) | the process: one per client session, holding the session until it exits |
| SSE (`@mcp-abap-adt/sse`, `mcp-abap-adt-sse`) | the SSE connection: one instance per connection, its credential from the opening `GET`'s headers; when the connection closes, the debug session is stopped |
| Streamable HTTP (`@mcp-abap-adt/http`, `mcp-abap-adt-http`) | the server's pool of instances: each request takes the instance its `tools/call`'s `state_handle` names, or a new one, and its own `x-sap-*` headers give its credential; an instance that still holds state after the response stays in the pool, one that holds nothing is disposed. One request at a time per instance; a JSON-RPC batch carrying a `state_handle` is refused. The debug session keeps the connections it opened with the creating request's credential until it ends |
| embedded (`EmbeddableMcpServer`) | the embedding host |

**The debuggee session is the debugger's own.** The connections a debug session
opens are stateful for their whole life — attach and the steps need the ABAP
session that attached —, except the program run a start sends (`DebugStartListener`,
`AmdpDebugStart`): it goes on a stateless connection of its own (measured
2026-10-17: a run on a stateless connection is caught and held as on a stateful
one). They are not a tool's session: no other tool runs on
them, and they end with the debug session (its stop, the idle bound's stop, the
host's stop or the instance's end), each with its logoff. A tool's own session is
stateful only for a lock's `LOCK` and `UNLOCK`; the debugger's are the one place
the server itself asks for a stateful session (`tools/stateful-sites.json`).

Why a pool and not a session carried by the client: over HTTP the system's stop
could be addressed again by its session cookies, but over RFC nothing carries an
ABAP session to another connection (measured on premise and on the cloud,
2026-10-10). Keeping the whole instance works over both.

## The compact debugger: one request per call

The compact binaries serve four debugger tools, each for ABAP and AMDP (`kind: abap | amdp`).
Every call sends exactly one SAP request — the one `AbapDebugger` / `AmdpDebugger` method its
`operation` names — and answers what SAP answered. Nothing runs between the calls: no listener
polls in the background, a catch is attached only when you call `attach`, and a step reads no
stack. You chain the calls:

| Tool | ABAP operations | AMDP operations |
|---|---|---|
| `HandlerDebugBreakpoints` | `setBreakpoints`, `syncBreakpoints` (`sync_scope` `full` / `partial`), `deleteBreakpoint`, `createWatchpoint`, `listWatchpoints`, `deleteWatchpoint` | `syncBreakpoints` |
| `HandlerDebugSession` | `checkListener`, `listen` (`hold_seconds`, required), `stopListener`, `attach` (`debuggee_id`, `server`), `detachDebugger`, `terminateDebuggee`, `terminateDebugger`, `setDebuggerSettings` | `start`, `getEvents`, `stop`, `deleteDebuggee` |
| `HandlerDebugStep` | `stepInto`, `stepOver`, `stepReturn`, `stepContinue`, `stepRunToLine` / `stepJumpToLine` (`object_type`, `object_name`, `line`, required), `setStackPosition` | `stepOver`, `stepContinue` (`debuggee_id`) |
| `HandlerDebugMaintain` | `getStack`, `getVariables`, `getChildVariables`, `getMemorySizes`, `createMemorySnapshot`, `setVariableValue` | `getDataPreview` |

**The ABAP chain:**

1. `HandlerDebugBreakpoints` `setBreakpoints` — opens the debug state (no `state_handle`) and
   answers its `state_handle` with the identity in force (`terminal_id`, `ide_id`,
   `debugging_mode`, `request_user`); every later call takes the handle. The first ABAP call fixes
   the identity: a later call stating another `request_user` or `debugging_mode` is refused before
   any request.
2. `HandlerDebugSession` `listen` with `hold_seconds` — SAP holds the listen for exactly that many
   seconds (measured 2026-10-17) and answers the debuggee it caught (`debuggee_id`, `server`) or
   `caught: false`. A breakpoint stops a program only while a listen is open, so start the
   program while the listen holds; a caught program nobody attaches runs on by itself after about
   30 seconds (measured 2026-10-10). The other calls go on while it holds; a listen sent while
   another holds goes to SAP as it is, and SAP's answer comes back as it came.
3. `HandlerDebugSession` `attach` with `debuggee_id` and `server` — on the attaching session, which
   the first attach opens and every later attach, step and reading uses.
4. `HandlerDebugStep` and `HandlerDebugMaintain` — a step answers SAP's step result, and the
   stopped position is read from the stack (`getStack`): the step answer carries no position
   (measured 2026-10-17). A step answers `ended` when SAP reports the program's end.
   `stepRunToLine` / `stepJumpToLine` need the line's address; it is refused before any request
   without `object_type`, `object_name` and `line`.
5. To leave the program: `stepContinue`; `HandlerDebugSession` `detachDebugger`, which sends
   `detachDebugger` without a debuggee id on the attaching session — the debuggee is released and
   the program runs on (measured 2026-10-17; with an id SAP answers `200` and releases nothing);
   `terminateDebuggee`, which ends it; or `terminateDebugger`, which frees the debugger.
   SAP answers `terminateDebuggee` and `terminateDebugger` with a `500` when they succeed (measured
   2026-10-17), and the tool passes SAP's answer on as it came: a failure with its `status` and
   step (`terminate debuggee`, `terminate debugger`). The success shows in the next answer, which
   is `noSessionAttached`, or in the program's end.
6. `HandlerDebugSession` `end` with the `state_handle`.

**The closing chain:** `detachDebugger` (no id, on the attaching session) → `end`. `end` (either
kind) logs off each connection the debug state opened, one logoff each — the attaching session,
the listener, the control connection, the AMDP sessions — and sends nothing else. Then the debug
state and its handle end: the handle answers `state is not available`, and a new debug state of
either kind, under any identity, can open. What a logoff does, measured 2026-10-17: the attaching
session's logoff releases a stopped debuggee at once, and the program runs on; the logoff of both
AMDP sessions ends the AMDP debug session (measured with no suspended AMDP debuggee). The user's
breakpoints stay set until removed (`deleteBreakpoint`, or `stopListener`), as in an editor; they
are the SAP user's, and the next listen of that user catches at them. To remove them, send
`HandlerDebugBreakpoints` `deleteBreakpoint` or `HandlerDebugSession` `stopListener` before
`end`.

**The AMDP chain:** `HandlerDebugSession` `start` (answers `main_id`; `take_over: true` ends an
AMDP session of this user left behind) → `HandlerDebugBreakpoints` `syncBreakpoints` (answers the
request id; SAP confirms it in a `SYNC_BREAKPOINTS` event) → run the method → `HandlerDebugSession`
`getEvents` (a break names its debuggee id) → `HandlerDebugStep` `stepOver` / `stepContinue` and
`HandlerDebugMaintain` `getDataPreview` with that `debuggee_id` → `deleteDebuggee` (a stop alone
leaves a suspended debuggee held) → `stop` → `end`.

A call of one kind is refused while the instance holds the other. A failure is the method's error
as it is, with the operation's step (`set breakpoints`, `listen`, `attach`, `detach`, `step`,
`step to line`, `read stack`, `read events`, …). The refusal of the other kind names `end`. Only
`end` logs off; a debug state that is never ended closes at the idle bound, the host's stop or the
instance's close, whose cleanup also stops the listener a listen or a breakpoint left and an AMDP
session still running.

## The debugger batch: several calls at a stop in one envelope

At an ABAP stop, several debugger calls that need no answer of each other — step, then read the
stack and the variables — go to SAP in one debugger batch envelope (`POST
/sap/bc/adt/debugger/batch`) on the stop's connection, the attached session. At an AMDP break the
same envelope carries the AMDP debugger's calls — the data preview of a table variable, a step over
or a continue — on the AMDP session's command connection:

| | Full set (`mcp-abap-adt`, `-http`, `-sse`) | Compact (`mcp-abap-adt-compact`, `-compact-http`, `-compact-sse`) |
|---|---|---|
| begin | `DebugBatchBegin` | `HandlerDebugBatch` `action: 'begin'` |
| end | `DebugBatchEnd` | `HandlerDebugBatch` `action: 'end'` |
| answers | `BatchAnswers` (`number` or `numbers`) | `HandlerDebugBatch` `action: 'answers'` (`number` or `numbers`) |

No `-ro` binary serves them. The batch tools take no `state_handle`: the batch is the instance's (over
Streamable HTTP the `x-mcp-state-handle` header reaches the instance, as for the communication
batch, see [BATCH_MODE.md](BATCH_MODE.md#over-streamable-http)); begin answers `{ debug_batch: 'on', state_handle }`.

**What is recorded**, one request each:

| Operation | Full set | Compact |
|---|---|---|
| step (into, over, return, continue) | `DebugStep` | `HandlerDebugStep` `stepInto`, `stepOver`, `stepReturn`, `stepContinue` |
| step to line | `DebugStepToLine` | `HandlerDebugStep` `stepRunToLine` / `stepJumpToLine` (`object_type`, `object_name`, `line` required) |
| stack | `DebugGetStack` | `HandlerDebugMaintain` `getStack` |
| variables | `DebugGetVariables` with `names` | `HandlerDebugMaintain` `getVariables` |
| child variables | `DebugGetVariables` with `parents` | `HandlerDebugMaintain` `getChildVariables` |
| stack position | `DebugSetStackPosition` | `HandlerDebugStep` `setStackPosition` |
| set a variable | `DebugSetVariable` | `HandlerDebugMaintain` `setVariableValue` |

At an AMDP break, one request each:

| Operation | Full set | Compact |
|---|---|---|
| step over, continue | `AmdpDebugStep` `over` / `continue` | `HandlerDebugStep` `kind: 'amdp'`, `stepOver` / `stepContinue` (`debuggee_id` required) |
| data preview of a table variable | `AmdpDebugGetTable` | `HandlerDebugMaintain` `kind: 'amdp'`, `getDataPreview` (`debuggee_id`, `variable_name` required) |

Begin picks the stop it works on: the ABAP stop when one is held, else the AMDP break — the full
set's AMDP session with a stopped debuggee (`AmdpDebugWait` answered `ON_BREAK`), or the compact
set's running AMDP session. A batch records at its own stop only: in a batch begun at an AMDP break
every ABAP debugger call is refused, and in one begun at an ABAP stop every AMDP call.

A recorded call answers empty content and takes the next number, from 1, in the order recorded.
In the batch each operation sends its own request alone: a full-set step reads no stack after it
and `DebugSetStackPosition` answers the position — record `DebugGetStack` beside them to have the
stack in the same envelope. A call refused for its arguments before any request (a step to line
without its address) answers at once and takes no number. Every other tool is refused while the
debugger batch is open (`batch_not_recordable`, "<tool> is not served while a batch is open"):
breakpoints, watchpoints, the listener, start / wait / take-over / stop, attach, detach,
`release_debugger`, terminate, memory sizes and snapshots, settings, and every non-debugger tool.

**The end** sends the envelope on the connection the batch was begun on — the ABAP stop's, or the
AMDP session's command connection — keeps each call's answer by number — the answer the tool gives
for what SAP answered to its part — ends the batch whatever happens and answers `{ recorded,
failed }`. It leaves the debug session as it was: the stop, its view and its connection stay; when
a recorded step's answer says the program ended, that answer under its number shows it, and the
next ordinary debugger call learns it from SAP. At an AMDP break the full set's session keeps its
debuggee until its event read reports the next `ON_BREAK` or `ON_EXECUTION_END`: after a recorded
step, `AmdpDebugWait` answers where the debuggee went.

**The answers stay** readable (`BatchAnswers`, compact `HandlerDebugBatch` `answers`) until the
next batch's end, the debug state's complete stop or the idle bound: a complete `DebugStop`, or an
`AmdpDebugStop` that ends the whole debug state, lets the debugger batch's answers go with the
state, so the state's handle ends with the stop and then answers `state is not available`. A
stop that is refused, or leaves anything held, keeps them. A communication batch's answers are
not touched by a debugger stop.

**Refusals.** Begin needs an ABAP stop or an AMDP break (`no debuggee is stopped in this debug
session`); while a communication batch is open, or the debugger batch already is, begin is refused
`batch_mode_other` / `batch_mode_on`, and `BatchBegin` while the debugger batch is open
`batch_mode_other`.

**Measured (2026-10-19)** with `src/__tests__/integration/batch/debuggerBatch.test.ts`:

| Destination | The debugger batch at an ABAP stop | The AMDP gate |
|---|---|---|
| On premise over HTTP | passed: step over, stack and one variable recorded through the full server over stdio and sent in one `DebugBatchEnd` — 3 recorded, none failed; the stack stood on the line after the step, the variable held what the step left; the end took about 120 ms | passed (on HANA) |
| On premise over RFC | passed, the same answers; the end took about 120 ms | passed (on HANA) |
| ABAP Cloud | not run: no ABAP Cloud destination was configured | not measured there (the gate is measured on premise on HANA) |

The AMDP gate was measured in process, not through the served tools: at an AMDP break in a
SQLScript table function, the AMDP debugger's data preview of a table variable and a step over
went in one debugger batch envelope on the AMDP session's command connection. SAP answered the
envelope `202`, the data preview with its table document, the step with `200`, and the debuggee
moved on to the next line (its next `ON_BREAK`). On that measurement the server records the AMDP
operations in the debugger batch (above); the case through the served tools — `DebugBatchBegin` at
the AMDP break, the recorded AMDP calls, `DebugBatchEnd`, `BatchAnswers` — is written and not yet
run. The gate stops in a shared fixture, the
AMDP class `ZMCP_SHR_DBG_AMDP` and its table function `ZMCP_SHR_DBG_TF` (`shared_dependencies`,
created once by `npm run shared:setup`, never deleted); the test only reads them. It skips only
where SAP's system information names a database system other than HANA; a pair that is not
active fails it.

## Catching, and one debuggee at a time

The listener attaches the first program caught **automatically**: a caught program
is attachable only while it waits, and the seconds between two model calls can
lose it. `DebugWait` then answers `stopped`, with where
the program stands — the object address a breakpoint takes and the system's
technical place — and the stack. Under `terse` the stack keeps up to 50 frames
from the top, so an ordinary one (some 20–25 frames) comes whole; a deeper one
is cut and `stack_depth` says how deep it was — `detail: full` answers all of it.

One debuggee at a time. While one is stopped, the listener does not poll; it
resumes once that one is released (a step that runs it to its end, `continue`
past the last breakpoint, a termination, `detach`, `release_debugger`). A program that hits a breakpoint
meanwhile is not caught.

A background run reports its outcome — its output, or its failure — as the end of
the session state: `DebugWait` answers `ended` with reason `run_finished`. Other
reasons are `debuggee_ended`, `terminated`, `attach_refused` and
`attach_impossible`; none of them is an error. An `attach_refused` carries `failure`: SAP's
refusal as it is, with the step `attach`. A listener or an attach that fails by a throw of
ours (not an answer of SAP) fails the next wait as `client_threw` with the step `listen` or
`attach`.

Answers take `detail`: `terse` (default — what is needed to act), `full` (every
field, the whole stack) or `raw` (the system's document as it came).

## What a breakpoint catches

In user mode a breakpoint catches **every request of the request user**, not
only the program this server started: a report the same user runs in SAP GUI, an
OData request of a Fiori app under that user, a request of an IDE logged on as
that user. Measured: a breakpoint catches again on the next run without being
armed again. In terminal mode it catches only a request that carries this debug
session's ids — the run the server starts for it.

Breakpoints are a line (`object_type`, `object_name`, `line`; a class's include
and a function module's group where needed), an exception class, an ABAP statement
or a message; a line breakpoint may carry a condition, and a condition on another
kind is refused before anything is sent, naming the breakpoint (the system does
not evaluate one there).

`DebugSetBreakpoints` adds to the set. The server sends the whole set every time
and answers it whole:

- `placed` — every breakpoint in force, the earlier ones included;
- `refused` — this call's breakpoints the system did not place, each with its
  definition and the system's reason (`error`, missing when no row gave one);
- `lost` — earlier breakpoints no longer placed;
- `unexpected` — an answer row the server could not pair with a breakpoint it
  sent; a conforming system answers none.

The server tags every breakpoint it sends with an id of its own (`clientId`), and
the system echoes that tag on each row, placed or refused, whatever order it
answers them in (measured on premise (2026-10-11), BASIS 816: refused rows first,
ids renumbered) — so each row pairs exactly with its breakpoint.
`DebugDeleteBreakpoint` removes one by id, and is refused before anything is sent
for an id the session does not hold; `DebugListBreakpoints` lists the placed set.

## Another user

`request_user` (on `DebugStartListener`, `DebugTakeOverListener`, compact
`HandlerDebugBreakpoints` and `HandlerDebugSession` with `kind: abap`) names whose requests are caught; omitted,
it is the connected user. The catching user needs `S_DEVELOP` with `DEBUG` and
activity `90` on the user named; without it the system answers `403`, and the
answer reaches the model as the system gave it. A request user that does not exist
is refused the same way (`403`, measured on premise (2026-10-11), BASIS 816). Both
refusals come before anything is placed, so the start changes nothing. Measured end
to end on premise (2026-10-11), BASIS 816: the other user's run was caught within
about a second, attached, stepped and finished. Only a request that starts after
the breakpoint and the listener are in place is caught.

The identity — the mode and the request user — is fixed for the life of the
state handle: another user is another start, with another handle.

## Terminal mode

`debugging_mode: terminal` catches the requests that carry this debug session's
terminal id and IDE id instead of those of a user. It needs no configuration: the
ids are random per instance unless stated (see
[The SAP ids](#the-sap-ids-and-when-to-share-one)), and a stated id only replaces
the random one. `request_user` is refused in this mode: the system reads no request
user there.

- **The run the server starts carries the ids** (in its `SAP-PASSPORT`; a run's
  URL has no place for them), so this session's listener catches it and no other
  terminal-mode listener does, not even one of the same SAP user under other ids
  (measured on premise (2026-10-12), BASIS 816).
- **Any other request is caught only if it carries the same ids**, so a terminal
  start without `run` catches only such requests. A request from SAP GUI was not
  tested. If you try one and it is not caught, open an issue with: the mode;
  whether the stated terminal id is the one SAP GUI shows; how the program was
  started (SAP GUI, browser, RFC, background job); and the wire log of the
  requests (`DEBUG_HTTP_WIRE=true`).
- **The breakpoint set is still the SAP user's**: terminal mode separates the
  listeners and the catches, not the breakpoints (next section).
- **A second terminal-mode session of the same SAP user is refused under
  refuse.** The system itself accepts a second terminal-mode listener once its
  breakpoints are armed, and both listen, each catching its own runs; but the
  start's listener check answers `409` while the other one listens (measured on
  premise (2026-10-12), BASIS 816), so `DebugStartListener` is refused before anything is
  changed. A take-over (`DebugTakeOverListener`) does
  not ask under the default `replace`, and its arming replaces the other
  session's breakpoints, since the set is the SAP user's; whether the other
  listener then keeps listening in terminal mode is not measured.

## The breakpoint set and its key

The system keeps the breakpoints as one set per key, and the IDE id is not part of
the key:

- **user mode**: the SAP user the server logs on as, with the request user. So
  **every IDE of the same SAP user debugging the same request user shares one
  set** — an Eclipse, another server instance, this one. Sets of different request
  users were not measured.
- **terminal mode**: the SAP user, whatever the ids. Two IDEs of one SAP user under
  other terminal and IDE ids replaced each other's set (measured on premise
  (2026-10-12), BASIS 816).

Each change replaces that set as a whole. A listener's stop deletes it, whether
or not a listener ran — measured in user mode (on premise (2026-10-11), BASIS
816); in terminal mode it is not measured, and the session treats the set as gone
after its stop all the same. A listener's stop under another IDE id of the same
user also ends that IDE's listener in user mode, not in terminal mode (measured
on premise (2026-10-12), BASIS 816). The server keeps the definitions the system
placed and sends them all with every change, so a second `DebugSetBreakpoints`
keeps the first; a refused or lost one is dropped and not sent again.

Before it changes anything, a start under refuse (`DebugStartListener`) asks the system whether another debugger
listens for the user, and every later `DebugSetBreakpoints` of that session asks
again — see [Conflicts are errors](#conflicts-are-errors). The host chooses
whether a take-over asks too, `SAP_DEBUG_BREAKPOINT_CONFLICT` — the header
`x-sap-debug-breakpoint-conflict`, the destination's `.env`, the environment,
then an embedder's `breakpointConflict` passed to `createDebuggerInstance` (the
fallback), in that order:

- **`replace`** (the default): a take-over (`DebugTakeOverListener`) asks nothing; it sends the set whole and replaces another
  IDE's breakpoints under the key.
- **`refuse-if-held`**: the same check runs in every mode, before a take-over and
  before every later `DebugSetBreakpoints`; it refuses if another debugger
  listens, so a take-over is refused then.

The check sees a **listener**, not breakpoints: another IDE that armed breakpoints
and does not listen is not seen, and its set is replaced. An unknown value of
`SAP_DEBUG_BREAKPOINT_CONFLICT` is refused when the instance's debugger is first
used.

## Leaving a debuggee running

At a stop, `DebugStep` takes two more actions, ABAP
only:

- **`detach`**: the debugger leaves and the program runs on. The listener and the
  breakpoints stay for the next requests. The same run was not caught again
  (measured on premise (2026-10-12), BASIS 816: a run detached at an armed line
  in a loop finished without stopping at that line's next pass; the system
  answered the detach as the run ended, before the listener polled again).
- **`release_debugger`**: frees the debugger; the program runs on and returns its
  output. The system answers this with a plain `500` that is the request having
  worked (adt-clients' errata, "The debugger freeing its session is answered as an
  ICF 500"); the server reads exactly that as no failure, and anything else — an
  ADT document, an HTML page, a `400` — as a failure that keeps the stop for
  `DebugStop`. The freed ABAP session takes no further request, so the server sends
  it none, not even a logoff.

Both answer the listening state, or the run's end when the program finished before the answer (measured on premise (2026-10-12) for `release_debugger`). `DebugTerminate` ends the
program where it stands.

## Debugger settings

`settings` at a start — `system_debugging`,
`update_debugging`, `create_exception_object`, `background_rfc`,
`shared_object_debugging`, each a boolean — are kept and applied after each
attach; a field left out keeps its value. `DebugSetSettings` changes them at the
current stop, merges them into those kept and answers the settings in force; a
stop answers them under `settings` (and a failure to apply them under
`settings_error`, the stop standing; a stack that could not be read under `stack_error` —
each the method's error as it is, with its step: `set settings`, `read stack`). The first change after an attach ignores
`system_debugging: false` (server source, BASIS 816, read 2026-10-11) and its
answer cannot show it, so the server sends a `false` there twice. The display of
data aging is not offered: left out, it stays off, the system's default.

ABAP Cloud does not apply `create_exception_object`: asked for `true`, at a start
or through `DebugSetSettings`, it answers the settings in force with
`create_exception_object: false`, and the call is not refused (measured on the
ABAP Cloud trial, 2026-10-12). The settings a stop and `DebugSetSettings` answer
are what is in force, so read the field there rather than assume it applied. On
premise it is applied (BASIS 816).

## What ADT cannot do

It cannot attach to a process or a request that is already running. A request is
enabled for catching when it starts: a loop already running when the breakpoint
and the listener were armed is never caught (measured on premise (2026-10-11),
BASIS 816, for 45 s). Attaching a work process from the process overview opens
the debugger in the requester's SAP GUI, and nothing routes that stop to an ADT
listener (server source, BASIS 816, read 2026-10-11); SAP GUI is the route there.

## Conflicts are errors

A listener of another IDE id of the same SAP user — an IDE, another server
instance — is the system's to report and yours to resolve:

- **refuse** (`DebugStartListener`; compact `HandlerDebugSession` `listen` with `take_over` false or omitted, which answers the `409` as it came):
  before anything is changed, the start asks the system whether another debugger
  listens for the user. If one does (`409`), the start is refused: nothing is
  placed, nothing is run, and the other listener keeps listening with its
  breakpoints. A listener of this session's own answers no conflict, so every later
  `DebugSetBreakpoints` of the session asks the same way. The check is not atomic:
  a listener another IDE starts between the check and our listen has its
  breakpoints replaced by our arming, and in user mode our rollback after the
  listen's `409` ends its listener. That race is accepted and documented, not
  handled.
- **take over** (`DebugTakeOverListener`; compact `listen` with `take_over: true`): the start
  displaces the other debugger (measured in user mode; in terminal mode whether
  the other listener keeps listening is not measured). The displaced listener's
  poll is answered with a conflict notification; if that listener is ours, its next `DebugWait` fails with
  that message and the listener is not restarted. With
  `SAP_DEBUG_BREAKPOINT_CONFLICT=refuse-if-held` a take-over asks first too, and is
  refused if another debugger listens (see
  [The breakpoint set and its key](#the-breakpoint-set-and-its-key)).

The error is the system's answer as it is, with the step (`check listener`,
`listen`): SAP's document in `raw_body` names who holds the user's debugging —
the conflict text and, where it gives one, the IDE user. A debugger tool's
failure follows the same rule as every tool (see
[AUTHENTICATION.md](AUTHENTICATION.md#a-tool-failure-the-methods-error-as-it-is-plus-the-step)).

Taking over is for a case you mean, such as an IDE left holding the user's
debugging. Close the IDE's debugger otherwise.

## What ends a session

Nothing ends on a timer of the server's, with one exception (below). A session
ends by:

- **`DebugStop`**: stops the listener first — which deletes the key's breakpoints, those of
  every IDE sharing the key included (measured in user mode; in terminal mode the session takes
  the set as gone after the stop, not measured) — then releases a stopped debuggee and any
  release an earlier stop left owed, so a debuggee let go from a breakpoint inside a loop runs to
  its end instead of stopping there again (measured on premise, 2026-10-19), and closes the
  connections, ABAP and AMDP alike. Only when the
  listener's stop fails are this session's breakpoints deleted one by one; when the
  system refuses it for the user (`403` `notAuthorized`, `404` `invalidUser`),
  nothing is deleted and the answer names the breakpoints left on the system; the
  session ends when nothing else failed (another failure, such as a connection
  that did not close, is kept for the next stop as usual). It returns only
  after the system has answered the listener's open poll — so a conflict right
  after a stop means a real other listener, not our own still letting go. A stop right after a run ended can
  take up to the listener's hold (60 s) instead of under a second: the listener
  polls again at once when a run ends, and if that poll reaches the system after
  the stop, nothing wakes it. The stop then stops the listener once more, which
  in our runs answered it at once; when even that one arrives first, the stop
  waits for the poll's hold. The race is the system's and is documented, not
  closed (measured on premise, 2026-10-12). The second stop's failure is no failure of the
  stop, whatever it is: measured on premise (2026-10-19, `refusalFollowUps.test.ts`), with
  the listener's poll held so that the second stop is sent and the password made wrong
  between the two, over HTTP with the session ended between them the second stop was
  answered `400` (`ICMENOSESSION`) and over RFC it was answered `200`; each time the stop
  answered `stopped`, sent nothing more, asked nothing more of the credential and held
  nothing. A wrong password brings no credential refusal to the second stop on either
  transport — a live session's cookie, or the RFC conversation's one logon, authenticates
  it, and an ended session is answered by the ICM before any logon — so the stop's answer
  to a credential refusal there is not measured. That case is unit-tested only, because
  SAP does not produce it live (`secondStopCredentialRefusal.test.ts`: a stubbed credential
  refuses the second stop; the stop answers `stopped`, sends nothing more, asks the
  credential nothing more and holds nothing). A unit test is not a measurement. A part that could not be undone is
  reported, kept, and retried by the next stop — the answer is `{ failures, notes? }`, each
  entry the method's error as it is with its step (`release the debuggee`, `stop listener`,
  `delete breakpoint <id>`, `close the listener's connection`, `clear breakpoints`, `stop`,
  …), and SAP's final refusal of the listener's stop is a note in the same shape, the
  breakpoints it leaves on the system named under its `cleanup`. An AMDP session whose stop SAP
  accepted owes no breakpoint clear: a refused `clear breakpoints` is answered, and both of its
  connections are logged off all the same (SAP removes a breakpoint left behind on its own); a start that failed and could
  not undo everything answers what it could not undo the same way, under `cleanup.failures`;
  the handle stays valid, the
  identity (mode, request user) and the settings stay, and a new start is
  refused, until nothing is held. A debuggee the listener caught as the stop
  began is attached and released by the stop; measured on premise (2026-10-11), an attach after
  the listener was stopped still succeeds, and a caught debuggee nobody attaches
  is held by the system for about 30 seconds and then runs on.
- **a credential refusal during a stop** (the authentication chain's failure, or a `401` SAP
  answered) ends the stop where it arose: no request follows it — no further release, listener
  stop or breakpoint delete, ABAP and AMDP alike — since each would ask the credential again
  and be refused again. The answer is that refusal as it came, with its step (an
  `authentication_failed` answer, or SAP's `401` as the method's error), the stop's other
  failures beside it under `failures`, and the steps it did not send under `not_attempted`:

  ```json
  { "error": "authentication_failed", "kind": "credential-refused", "message": "…",
    "step": "release the debuggee",
    "not_attempted": {
      "message": "Not attempted: the credential was refused, and every further request would be refused again. They stay for the next stop.",
      "steps": ["stop listener"] } }
  ```

  The steps named there (`release the debuggee`, `release <what>` for a release an earlier
  stop owed, `stop listener`, `delete breakpoint <id>`, `release a debuggee caught during the
  stop (<id>)`, and the AMDP part's `release debuggee <id>` and `stop`) stay owed like a
  failure: the handle stays valid, a new start is refused, and the next stop — once the
  credential is usable again — sends them. The session's connections are still closed: a
  logoff carries the session's cookies and asks nothing of the credential provider
  (measured on premise over HTTP and over RFC, 2026-10-19, with
  `src/__tests__/integration/batch/refusalFollowUps.test.ts`: after a logon refused for a
  wrong password on the same credential, the closes of the refused connection and of a
  live one asked no moment of the provider, and over HTTP the live session's logoff landed —
  a connection built on its cookies was refused `401`). A start the credential refused cleans up the same way: its undo sends no request,
  and the answer is the refusal with its step, `not_attempted` naming what stays for the next
  stop — not the `cleanup.failures` of another failed start. A start whose reconciling
  listener stop (see [Restarting with stated ids](#restarting-with-stated-ids)) the credential
  refused ends with that refusal, nothing armed.
- **`AmdpDebugStop`**: the AMDP part only (below).
- **the client's close and the shutdown**: when stdio's client closes stdin, when an SSE
  connection closes, and at the process shutdown (every transport), every ADT session the instance
  opened — the debug session's own connections included — is logged off **at once**, and its
  running tool calls are interrupted: no stop is sent and nothing waits for a debugger call in
  flight; the logoff ends the debug session in the system.
- **the pool**, when it lets a Streamable HTTP instance go (a stop tool emptied it): the complete
  stop, then every ADT session the instance opened is logged off, **whatever the stop answered**:
  a stop that failed is reported, never a reason to keep a session open.
- **the idle bound's stop and a failed undo**: after the idle bound's stop the session's own
  connections are logged off whatever the stop answered (over Streamable HTTP, where the pooled
  instance ends with its state, every connection of the instance).
- **the SAP system**, when it answers the listener with an error or a conflict
  notification (another IDE took the user's debugging over): the listener ends.
  The listener's stop is still owed then: the state stays held until `DebugStop`,
  the host or the idle bound. A debuggee that ends on its own ends only that
  debuggee; the session listens on.
- **the idle bound** — the project owner's one exception to "no timeouts": held
  state ends when **no tool call** has reached its instance for
  `--state-idle-minutes` (env `MCP_STATE_IDLE_MINUTES`, YAML `state-idle-minutes`;
  default 30, at least 30, at most 35791). A call in flight pauses it, so waiting
  for the system is never timed; the listener's own background re-polls are not
  activity. It exists because the listener re-polls by itself, so the system's own
  session timeout never ends an abandoned debug session. On expiry it does the
  same complete stop as `DebugStop`, and says so on stderr (never with the handle).
  See [CLI Options → Held State](CLI_OPTIONS.md#held-state).

`DebugWait` waits at most `hold_seconds` (default 10, at most 30) and ends nothing.

## Restarting with stated ids

A process that restarts loses its live state; the system may still hold what the
previous one left. With **stated** ids (above), the first start of a new instance
first asks the system to stop a listener under those ids — in terminal mode only
when the terminal id is stated. Measured: a successor started under the same
stated ids ends the predecessor's listener poll. Under refuse, the listener check
runs before it (see [Conflicts are errors](#conflicts-are-errors)); our own IDE id
is no conflict. Under an IDE id shared with an IDE, that stop may stop the IDE's
listener too — sharing it is the choice described above.

The reconciliation's stop also deletes the key's breakpoints, a predecessor's
included (measured on premise (2026-10-11), BASIS 816: a listener's stop deletes
them whether or not a listener ran); the start's own breakpoints are armed after
it. Every IDE sharing the key loses its breakpoints with them (see
[The breakpoint set and its key](#the-breakpoint-set-and-its-key)). Without stated
ids nothing is reconciled: a predecessor's breakpoints under the key are replaced
by the start's arming all the same, since every change replaces the set.

Any other failure of the reconciliation's stop is no failure of the start. A
credential refusal is: the start ends with it as it came, nothing armed.

## Memory and memory snapshots

At a stop, `DebugGetMemorySizes` reads what the debuggee uses, and
`DebugCreateMemorySnapshot` writes a snapshot and answers the file written. Under
`terse` the sizes are three numbers in bytes — `abap_objects_used` (what the
program's own data objects hold), `internal_used` and `internal_peak_used` (its
internal session now and at most so far); `full` answers every size the system
sends.

`MemorySnapshotList`, `MemorySnapshotGet` and `MemorySnapshotDelta` work on the
snapshots the system lists, outside any debug session (no handle). They need the
memory snapshot authorization (`S_MEM_SNAP`): **without it the list is empty**,
not refused, so an empty list may mean a missing authorization. A snapshot is
read as a `header`, an `overview`, or a `ranking`, `children` or `references`
view; the last three answer at most `max_objects` objects (default 50), and
`children` and `references` need the object `key`.

## AMDP

AMDP debugging has its own session beside the ABAP one, under the same handle;
one AMDP session at a time. Its breakpoints are lines in SQLScript methods of a
class (`class_name`, `line`).

- **A run starts after the sync is confirmed.** `AmdpDebugStart` sends the
  breakpoints and waits, inside its own call, until the system confirms them; only
  then does it start the optional background run. `stop_existing` ends an AMDP
  session of this user left behind. `AmdpDebugSetBreakpoints` replaces the set and
  answers each breakpoint's state as confirmed.
- `AmdpDebugWait` answers the events that arrived — a break with its variables and
  its call stack, the end of the execution, a warning. Under `terse` a break keeps
  up to 50 frames from the top, as the ABAP stop does (`stack_depth` when cut) —
  the system sends the innermost first (measured on premise, 2026-10-11) — each as the procedure, the ABAP address (`object_type`,
  `object_name`, `line`) and the line in the database procedure (`native_line`).
  A caller not compiled for debugging is marked `not_debug_compiled` and keeps
  its object only: the system answers its method's first line and native line 0
  there, not where the call stands.
- `AmdpDebugStep` steps `over` or `continue`s;
  `AmdpDebugGetTable` reads a table variable's rows (at most 100; an optional
  SELECT over it); `AmdpDebugCancel` cancels the execution.
- **A failed event read** fails the next wait (or a start waiting for its sync). SAP's refusal is
  carried as it is with the step `read events`; a read that threw on our side (not an answer of
  SAP) is carried as `client_threw` with the same step.
- **Stop releases a suspended debuggee first.** A stop alone never releases it
  (measured), so `AmdpDebugStop` — and `DebugStop` — delete it first, wait until it has
  ended — the event read reports `ON_WARNING`, `ON_EXECUTION_END` or `STOP` and the run that
  called it has returned — then stop the session, and return once the system has answered the
  event read it ended. Measured on premise (2026-10-19): a stop and logoffs sent while the
  cancel was still under way left the AMDP debugger's ABAP sessions and their RFCs
  (`AMDP_DBG_EVENT_LISTENER`, `AMDP_DBG_ACTION_ON_DEBUGGEE_WP`) alive until their timeout;
  sent once the cancel had finished, nothing stayed. The wait has no clock of its own and holds
  no other call: a second stop, the debug state's end (a dispose, the idle bound, the instance's
  close, the process's shutdown) or the stop call's cancellation ends it, and the answer then
  names the debuggee that had not ended. A cancel SAP refuses sends no stop: the stop answers the
  refusal and the session stays for the next stop — at the debug state's end the stop is sent all
  the same.
  `AmdpDebugStop` ends the handle only when nothing else is held; an ABAP session
  under the same handle goes on. A credential refusal on one of these steps ends
  the stop as it does the ABAP one ([What ends a session](#what-ends-a-session)):
  the debuggees not yet released and the session's `stop` are named under
  `not_attempted` and stay for the next stop.

## Timings

Pessimistic averages, measured 2026-10-10/11: for each step, the worst of the
per-run averages, rounded up to 0.1 s. They depend on the
system; most of the time is the system's answer, not the server's.

| Step | on premise | cloud |
|---|---|---|
| Start (arm, listen, background run) | 4.1 s | 9.6 s |
| Run until caught | 1.0 s | 4.7 s |
| Stack | 0.2 s | 0.7 s |
| Variables | 0.2 s | 0.7 s |
| Step (into, over) | 0.3 s | 1.2 s |
| Run to line | 0.3 s | 1.3 s |
| Continue to the next breakpoint | 0.3 s | 1.4 s |
| Continue to the end | 0.2 s | 0.7 s |
| Stop | 0.7 s | 1.9 s |
| AMDP start (sync, run) | 1.8 s | 4.5 s |
| AMDP run until the break | 6.0 s | 2.2 s |
| AMDP step over | 0.2 s | 0.6 s |
| AMDP continue to the next break | 1.6 s | 0.7 s |
| AMDP continue to the end | 0.3 s | 2.4 s |
| AMDP table | 0.2 s | 0.6 s |
| AMDP stop | 0.4 s | 1.3 s |
| Memory sizes | 0.2 s | 0.7 s |
| Memory snapshot | 0.2 s | 0.7 s |
| Memory snapshot list | 0.2 s | 0.7 s |
| Baseline: the run without the debugger | 0.2 s | 0.7 s |
| Baseline: the run with the debugger, caught and released (start to end) | 4.9 s | 12.4 s |

The ABAP steps were measured through the server (stdio and Streamable HTTP) as
well as directly, and the server adds no measurable time; the AMDP, memory and
baseline rows were measured directly.

## Before you debug

- Close an IDE's debugger of the same SAP user, or decide to take it over.
- Remember that another IDE of the same SAP user shares the breakpoint set: a
  change here replaces its breakpoints, and a stop deletes them.
- Remember that in user mode a breakpoint catches every request of the request
  user while it is armed; stop the session when you are done.
- On a shared machine, treat the `state_handle` like a password.
