# Debugger

The server debugs ABAP and AMDP for a model: it arms breakpoints, catches a
program at them, reads the stack, variables and memory, steps, and lets the
program go. This page describes what a debug session is, what keeps it alive
between tool calls, what ends it, and what the SAP system decides on its own.

The tool reference is generated: the [Debug group](AVAILABLE_TOOLS.md#debug-group)
of the full server, and the four debugger verbs of the
[compact server](../../compact/docs/AVAILABLE_TOOLS.md).

## Turning it on

The debugger tools are an **opt-in** set. No default exposition carries them,
because a breakpoint catches every request of the connected SAP user (see
[What a breakpoint catches](#what-a-breakpoint-catches)).

```bash
mcp-abap-adt --exposition=readonly,high,debug      # the full server, 29 debugger tools beside the rest
mcp-abap-adt-compact --exposition=rw,debug         # compact: four verbs beside the 25
```

The compact command refuses `--exposition=debug` alone: it names no half of the
facade. An embedder passes `includeDebug: true` to `HandlerExporter`, or adds
`DebugHandlersGroup` from `@mcp-abap-adt/lib/handlers` to its own registry.

## Scope: what it debugs

The debugger debugs **what it starts itself**, in the system's user mode
(`debuggingMode=user`): the model names a class (run as a console application) or
a report, and the server runs it in the background once it is listening.
Request-based (terminal) debugging, other users' requests, and attaching to a
process the server did not start are **not offered**.

## The debug session and its handle

A starting tool — `DebugStartListener`, `DebugTakeOverListener`, `AmdpDebugStart`,
or compact `HandlerDebugStart` — takes its parameters when it creates the session
(the breakpoints, an optional background run) and answers a **`state_handle`**.
Every other session tool requires that handle.

- The handle is opaque: 128 random bits, minted by the server instance that holds
  the session. It names the state of an LLM conversation, not a user and not an
  MCP session; one conversation may open any number of MCP sessions, and the
  handle is how it finds its debug session again.
- An unknown handle, and the handle of a session that has ended, get the same
  answer: `state is not available`.
- After a complete stop (`DebugStop`, compact `stop`, the idle bound) the handle
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

1. the request headers `x-sap-debug-terminal-id` and `x-sap-debug-ide-id` (HTTP;
   SSE: the session's opening request);
2. `SAP_DEBUG_TERMINAL_ID` and `SAP_DEBUG_IDE_ID` in the destination's own `.env`;
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
- The terminal id changes nothing in user mode.
- **Breakpoints belong to the SAP user, not to an id**: whichever listener of that
  user is active catches them.

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
| stdio | the process: one per client session, holding the session until it exits |
| SSE | the SSE session: one instance per connection; when the connection closes, the debug session is stopped |
| Streamable HTTP | the server's pool of instances: each request takes the instance its `tools/call`'s `state_handle` names, or a new one; an instance that still holds state after the response stays in the pool, one that holds nothing is disposed. One request at a time per instance; a JSON-RPC batch carrying a `state_handle` is refused |
| embedded (`EmbeddableMcpServer`) | the embedding host |

Why a pool and not a session carried by the client: over HTTP the system's stop
could be addressed again by its session cookies, but over RFC nothing carries an
ABAP session to another connection (measured on premise and on the cloud,
2026-10-10). Keeping the whole instance works over both.

## Catching, and one debuggee at a time

The listener attaches the first program caught **automatically**: a caught program
is attachable only while it waits, and the seconds between two model calls can
lose it. `DebugWait` (compact `HandlerDebugWait`) then answers `stopped`, with where
the program stands — the object address a breakpoint takes and the system's
technical place — and the top of the stack.

One debuggee at a time. While one is stopped, the listener does not poll; it
resumes once that one is released (a step that runs it to its end, `continue`
past the last breakpoint, a termination). A program that hits a breakpoint
meanwhile is not caught.

A background run reports its outcome — its output, or its failure — as the end of
the session state: `DebugWait` answers `ended` with reason `run_finished`. Other
reasons are `debuggee_ended`, `terminated`, `attach_refused` and
`attach_impossible`; none of them is an error.

Answers take `detail`: `terse` (default — what is needed to act), `full` (every
field, the whole stack) or `raw` (the system's document as it came).

## What a breakpoint catches

In user mode a breakpoint catches **every request of the connected SAP user**, not
only the program this server started: a report the same user runs in SAP GUI, an
OData request of a Fiori app under that user, a request of an IDE logged on as
that user. Measured: a breakpoint catches again on the next run without being
armed again.

Breakpoints are a line (`object_type`, `object_name`, `line`; a class's include
and a function module's group where needed), an exception class, an ABAP statement
or a message, each with an optional condition. `DebugSetBreakpoints` adds to the
set and answers which the system placed and which it refused, with its reason.
`DebugDeleteBreakpoint` removes one; `DebugListBreakpoints` lists the set this
session armed.

## Conflicts are errors

A listener of another IDE id of the same SAP user — an IDE, another server
instance — is the system's to report and yours to resolve:

- **refuse** (`DebugStartListener`; compact `take_over: false`, the default): the
  start fails with the system's message (`409`), nothing is armed and nothing is
  run; the other listener keeps listening.
- **take over** (`DebugTakeOverListener`; compact `take_over: true`): the start
  displaces the other debugger. The displaced listener's poll is answered with a
  conflict notification; if that listener is ours, its next `DebugWait` fails with
  that message and the listener is not restarted.

Taking over is for a case you mean, such as an IDE left holding the user's
debugging. Close the IDE's debugger otherwise.

## What ends a session

Nothing ends on a timer of the server's, with one exception (below). A session
ends by:

- **`DebugStop`** (compact `stop`): releases a stopped debuggee, deletes the
  breakpoints this session armed, stops the listener and closes the connections,
  ABAP and AMDP alike. It returns only after the system has answered the
  listener's open poll — so a conflict right after a stop means a real other
  listener, not our own still letting go. A part that could not be undone is
  reported, kept, and retried by the next stop; the handle stays valid until
  nothing is held.
- **`AmdpDebugStop`**: the AMDP part only (below).
- **the host**: stdio at exit, SSE when its connection closes, the pool at shutdown
  — each does the same complete stop and reports what it could not undo.
- **the SAP system**, when it answers the listener with an error or a conflict
  notification (another IDE took the user's debugging over): the listener ends.
  A debuggee that ends on its own ends only that debuggee; the session listens on.
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
first asks the system to stop a listener under those ids. Measured: a successor
started under the same stated ids ends the predecessor's listener poll. Under an
IDE id shared with an IDE, that stop may stop the IDE's listener too — sharing it
is the choice described above.

Breakpoints are different: they belong to the SAP user and stay armed after the
instance that set them is gone, and they catch again on the next run. The server
does not try to find or remove a predecessor's breakpoints. The ones a session set
itself are deleted by `DebugStop`, by `DebugDeleteBreakpoint` one at a time, and by
the host's or the idle bound's complete stop — which is why a clean stop matters.
Breakpoints an earlier process left behind are not removed by the server: it does
not know them (the system answers no listing of them), and sending an empty set
under the same ids was measured to remove nothing. Remove them where they are
visible, for example in an IDE's debugging of the same SAP user.

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
  the top five frames, each as the procedure, the ABAP address (`object_type`,
  `object_name`, `line`) and the line in the database procedure (`native_line`);
  a frame not compiled for debugging is marked `not_debug_compiled`. `AmdpDebugStep` steps `over` or `continue`s;
  `AmdpDebugGetTable` reads a table variable's rows (at most 100; an optional
  SELECT over it); `AmdpDebugCancel` cancels the execution.
- **Stop releases a suspended debuggee first.** A stop alone never releases it
  (measured), so `AmdpDebugStop` — and `DebugStop` — delete it first, then stop the
  session, and return once the system has answered the event read it ended.
  `AmdpDebugStop` ends the handle only when nothing else is held; an ABAP session
  under the same handle goes on.

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
- Remember that a breakpoint catches every request of that user while it is armed;
  stop the session when you are done.
- On a shared machine, treat the `state_handle` like a password.
