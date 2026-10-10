# Debugger tools — design

**Status:** approved in conversation 2026-10-10, awaiting review of this text.
**Builds on:** `@mcp-abap-adt/adt-clients` 27.0.0 (`AbapDebugger`, `AmdpDebugger`,
`MemorySnapshots`), `@mcp-abap-adt/adt-strategies` 0.8.1 (`analyseDebuggeeEnd`),
`@mcp-abap-adt/interfaces-adt` 13.2.0 (`IAbapDebugger`, `IAmdpDebugger`,
`IMemorySnapshots`).

## Goal

Let a model debug ABAP and AMDP through the server: set breakpoints, catch a
program at them, read the stack, variables and memory, step, and let the
program go — whether the model starts the program itself or someone else does
(a user in Fiori or SAP GUI, another system, a background process).

The library already does every request (measured on premise, SAP_BASIS 758 and
816, HTTP and RFC, and on SAP BTP ABAP Environment). What is new here is the
**state that lives between tool calls** and **what a model sees**.

## Decisions taken

| # | Decision |
|---|---|
| D1 | **One MCP server = one user session** (one connection to the SAP system it exposes). Debugger state lives in the server process; no per-user registry, no session handles in tool arguments. Every session from the server to ABAP is exclusive to that server instance — the listener's and the stop's connections included; the rest is the MCP standard's. What only the consumer controls — opening parallel sessions, several servers for the same SAP user — is not ours to manage: the user's responsibility. SAP's listener conflict is caught and returned to the user as a tool error carrying SAP's message; nothing more is done about it. |
| D2 | **Both scenarios**: the model starts the program, or someone else does. The listener lives in the background; the model asks whether something was caught. |
| D3 | **Attach automatically** when the listener catches a debuggee: a debuggee is attachable only while it waits, and seconds between two model calls can lose it. |
| D4 | **Idle timeout 5 minutes**: an attached debuggee no tool call has touched for 5 minutes is let go (`stepContinue`), so a suspended request of someone else does not hang until its session dies. |
| D5 | **One debuggee at a time.** While one is attached the listener stands; it resumes when that one is released. |
| D6 | **Refuse or take over** are two core tools, not a parameter (decided 2026-10-09); in compact a flag. |
| D7 | **Compact: four verb tools**, `HandlerDebugStart`, `HandlerDebugWait`, `HandlerDebugView`, `HandlerDebugStep`, with `kind: abap|amdp`. |
| D8 | **Opt-in exposition set `debug`**, not part of `readonly` or `high`: user-mode breakpoints catch every request of that SAP user. |

## 1. Architecture: where the state lives

A new module `src/lib/debugger/` holds one `DebugSession` per process (D1), and
the handlers are thin over it.

`DebugSession` owns:

- **identity** — `{requestUser, terminalId, ideId}`, one per server instance. The
  user is the connection's ABAP user (`systeminformation` where the login is not
  it, as on the cloud). `terminalId` and `ideId` are **generated per instance**,
  random, 32 upper-case hex characters — never derived from the URL and the user.
  One user may open several MCP sessions with the same credentials (several to
  one HTTP server, or several servers); identical ids would never conflict (the
  same `ideId` never does, measured), so two instances would silently share one
  listener's catches and delete each other's breakpoints. Distinct ids make them
  meet as SAP's listener conflict instead — a tool error under `refuse`, a
  deliberate displacement under take over — and keep each instance's breakpoints
  its own. The cost: breakpoints of an instance that dies without cleaning up
  stay under an identity nobody recreates, which is why shutdown cleanup is
  required, not best effort.

  **The user may set them.** `SAP_DEBUG_TERMINAL_ID` and `SAP_DEBUG_IDE_ID`
  (the destination's `.env` or the process environment, for stdio), or over HTTP
  the headers `x-sap-debug-terminal-id` and `x-sap-debug-ide-id` for the MCP
  session — the way `SAP_RESPONSIBLE` and `x-sap-responsible` are taken. Either
  one set replaces only its own random default. Two cases want it: sharing an
  IDE's debugging (the same `ideId` never conflicts), and finding again, after a
  restart, the breakpoints a previous instance left under those ids. What a
  shared id brings — shared catches, no conflict between the two — is the user's
  choice and responsibility (D1). The values are not validated here: SAP judges
  them, and its refusal reaches the user as a tool error.
- **the conflict mode** — `refuse` or `takeOver`, set by the tool that started the
  listener (D6), passed to `AbapDebugger` as its constructor option.
- **the breakpoints set** — kept by the server, because SAP answers no listing
  (`GET /debugger/breakpoints` is not an operation discovery offers).
- **the background listener** — a stateful connection of its own
  (`openFreshConnection`), looping `listen({holdSeconds: 60})` while there is no
  current stop.
- **the current stop** (D3, D5) — on a catch: a new stateful connection, `attach`
  with the debuggee's server (`saplb`), the stack read; the listener stands.
- **the idle timer** (D4) — reset by every tool call that touches the stop; on
  expiry `step('stepContinue', {analyse: analyseDebuggeeEnd})`, the stop's
  connection closed, the listener resumed.
- **a background run** — when the starting tool names a class or a report, it is
  run on a connection of its own; its outcome (output or failure) is kept for
  `Wait` to report as `ended`.
- **AMDP, separately** — its own pair of connections (the event session and the
  command session) and the current `mainId`; one AMDP session at a time.

**Which transports carry it.** The state needs a server instance that lives as
long as the MCP session: stdio has one per process. Over HTTP the MCP session is
the one `Mcp-Session-Id` names; the current HTTP server builds an instance per
request, which keeps no state between tool calls, so the `debug` set is offered
there only once an instance lives per MCP session (the HTTP split in #287).

**Shutdown** (stdin closed, signal, or `DebugStop`): breakpoints deleted, the
listener stopped, a current debuggee released, every connection closed.

**A conflict is an error; a debuggee's end is not.** A listener conflict is the
user's to resolve (D1), so it is caught and returned as a tool error carrying
SAP's message, never turned into a state:

- **at the start** — another debugger holds the user's debugging and `refuse` is
  answered 409: `DebugStartListener` (`HandlerDebugStart`) fails; nothing is
  armed and nothing is run;
- **later** — another debugger took the user over and our poll is answered 409
  `conflictNotification`: the next `DebugWait` fails with that message, and the
  listener is not restarted.

A debuggee that ended (`debuggeeEnded`, `terminateDebuggee`, read through
`analyseDebuggeeEnd`) is the end of a stop, not an error: the listener resumes.

## 2. Core tools

All act on the process's one `DebugSession`. One tool, one action; minimal
parameters.

**ABAP**

| Tool | Does |
|---|---|
| `DebugSetBreakpoints` | Adds line, exception, statement or message breakpoints, each with an optional condition. Answers which were placed and which refused (refusals matched by content, not position). |
| `DebugDeleteBreakpoint` | Removes one by id. |
| `DebugListBreakpoints` | The set the server keeps. |
| `DebugStartListener` | Starts the background listener refusing to displace another debugger. Optional `run`: a class or report to start in the background. |
| `DebugTakeOverListener` | The same, displacing another debugger of the user (an IDE). |
| `DebugWait` | Waits up to `hold_seconds` (≤ 30) and answers the state: `listening`, `stopped` or `ended`. A listener conflict is a tool error with SAP's message. |
| `DebugGetStack` | The current stop's stack. |
| `DebugSetStackPosition` | The frame variables are read in. |
| `DebugGetVariables` | By name, or the children of a parent: locals, globals, an object's attributes, a table's rows by index. |
| `DebugSetVariable` | Sets a variable's value at the stop. |
| `DebugStep` | `into`, `over`, `return`, `continue`. |
| `DebugStepToLine` | `run` or `jump` to a line. |
| `DebugTerminate` | Ends the debuggee where it stands. |
| `DebugCreateWatchpoint`, `DebugListWatchpoints`, `DebugDeleteWatchpoint` | Watchpoints at the stop. |
| `DebugGetMemorySizes`, `DebugCreateMemorySnapshot` | The debuggee's memory; a snapshot written (answers its file). |
| `DebugStop` | Everything off: breakpoints, listener, current stop. |

**Memory snapshots** (`MemorySnapshots`, no session state)

| Tool | Does |
|---|---|
| `MemorySnapshotList` | The snapshots the system lists. |
| `MemorySnapshotGet` | One snapshot, `view: header|overview|ranking|children|references`. |
| `MemorySnapshotDelta` | Two snapshots compared, same views. |

**AMDP**

| Tool | Does |
|---|---|
| `AmdpDebugStart` | Starts the AMDP debugger (`stopExisting` takes over a session left behind). |
| `AmdpDebugSetBreakpoints` | Replaces the AMDP breakpoints. |
| `AmdpDebugWait` | The next event: `ON_BREAK` (with variables and stack), `ON_EXECUTION_END`, `ON_WARNING`, … |
| `AmdpDebugStep` | `over`, `continue`. |
| `AmdpDebugGetTable` | A table variable's rows; optional SELECT. |
| `AmdpDebugCancel` | Deletes the debuggee: the execution is cancelled. |
| `AmdpDebugStop` | Ends the session (a suspended debuggee is released first — a stop alone never releases it). |

**Why a run is a parameter, not the existing run tools.** `RuntimeRunClass` and
the report run wait for the program to finish; with a breakpoint set, such a
call would hang for the whole stop. Under the debugger the run goes in the
background inside `DebugSession`, and its outcome arrives through `DebugWait` as
`ended`.

**Exposition (D8).** The tools form an opt-in set `debug`
(`--exposition=…,debug`; `HandlerSet` gains `'debug'`). Neither `readonly` nor
`high` carries them.

## 3. Compact, addressing, and what a model sees

**Compact (D7)** — four tools over the same `DebugSession`, and opt-in for the
same reason as in core (D8): the compact launcher's `--exposition` gains `debug`
beside `ro` and `rw`, and without it the four are not registered.


| Tool | Parameters | Does |
|---|---|---|
| `HandlerDebugStart` | `kind: abap|amdp`, `breakpoints`, `take_over?`, `run?` | Breakpoints, listener (or the AMDP session), and an optional background run. |
| `HandlerDebugWait` | `hold_seconds?` | The state, or the next AMDP event. |
| `HandlerDebugView` | `what: stack|variables|memory|table`, `names?` | The current stop. `table` is an AMDP table variable. |
| `HandlerDebugStep` | `action: into|over|return|continue|run_to_line|jump_to_line|terminate|stop`, `line?` | Moves the stop, ends it, or `stop`s everything. |

**Addressing a breakpoint**, the same in core and compact: a model does not know
ADT URIs. A line breakpoint is `{object_type, object_name, line}` (a class's
include optional), and the server builds the source URI with the builders it
already uses for reads. The other kinds are `exception_class`, `statement`, or
`message {id, number, type}`. An AMDP breakpoint is the AMDP class and the
SQLScript line.

**What a model sees.** The library answers documents; refining them for a model
is the server's job. Every tool takes `detail`, as the others do:

- `terse` (default):
  - `stopped` → program, include, line, the top 5 frames;
  - variables → `{name, type, value}`; a table's rows as an array;
  - memory → the two or three numbers that matter (dynamic objects, total);
  - an AMDP event → its kind, line, variables.
- `full` — every field, the whole stack.
- `raw` — SAP's document as it came, for diagnosis.

**Descriptions** name nothing concrete (CLAUDE.md, "What we write names nothing
concrete"). The description of every tool that sets breakpoints or starts a
listener says that user-mode debugging catches every request of that SAP user,
and that taking over displaces another debugger, such as an IDE.

## 4. Tests and release

**Unit, no SAP**

- `DebugSession` as a state machine, with `AbapDebugger`/`AmdpDebugger` factories
  injected as fakes and fake timers:
  - listening → caught → attached, the listener standing;
  - 5 minutes idle → `stepContinue` → listening again;
  - a conflict at the start fails the start tool, a later one fails the next `Wait`; the listener is not restarted;
  - `debuggeeEnded` ends the stop, not as an error;
  - a background run ends as `ended` with its output;
  - `DebugStop` and shutdown clean up everything;
  - no second attach while a stop exists.
- Handlers: arguments reach `DebugSession`; a breakpoint's URI is built from
  `{object_type, object_name, line}`.
- Readings for the model (stack, variables, memory, AMDP event) checked against
  recorded answers from the adt-clients corpus (`debugger-*`,
  `debugger-terminate`, `memory-snapshot-list`), not invented ones.

**Integration, soft mode, on premise and on the cloud**

- a probe class created and deleted by the test;
- ABAP chain: `DebugStartListener` with `run` → `Wait` → `stopped` on the line →
  stack and variables → `Step` → `StepToLine` → `Wait` → `ended` with the output;
- conflict: a second listener under the same user, refusing, fails with SAP's conflict message;
- AMDP: start → breakpoint → `Wait` → `ON_BREAK` → table → `continue` →
  `ON_EXECUTION_END`;
- memory: sizes and a snapshot at a stop;
- one ABAP chain in hard mode (the full server over stdio).

An IDE debugging the same SAP user must be closed during these runs.

**Release**

- New tools only, so a minor: mcp-abap-adt 17.2.0 — the five packages and both
  registry entries, per the release checklist.
- Compact grows from 25 to 29 tools; its tool-count and tool-list tests follow.
- Docs: README (tool list, the `debug` set), a debugger page under `docs/` (the
  two sessions, the idle timeout, the user-mode warning), CHANGELOG.
- **#287** (auth chain 6) makes core a stdio server; the debugger lives in core
  and fits it, and the `debug` set survives the split.

## Out of scope

- More than one debuggee at a time (D5); adding it later adds a parameter and
  breaks no tool's contract.
- The debugger batch (a step answered with the stack in one round trip) and the
  AMDP cell substring — not measured.
- Debugger state shared across server processes, or across users of one HTTP
  server (D1).
- Coordinating several servers or sessions of the same SAP user (D1): what the
  consumer opens is the consumer's to control; two of them meet as SAP's
  listener conflict, returned as a tool error.
