# Migrating to 18.0.0

All five packages (`lib`, `core`, `compact`, `compact-readonly`, `compact-modify`) are
**18.0.0**. The debugger moved to `@mcp-abap-adt/adt-clients` 29, `@mcp-abap-adt/interfaces-adt`
15 and `@mcp-abap-adt/adt-strategies` 0.10. Nothing outside the debugger changed.

## A model, an MCP client, a configuration

Nothing to configure. The tools gained optional parameters (`request_user`, `debugging_mode`,
`settings`), two `DebugStep` actions (`detach`, `release_debugger`) and one tool
(`DebugSetSettings`). Three things a caller may notice:

- **`DebugStartListener` and `DebugTakeOverListener` require `breakpoints`, at least one.** A
  start without them was accepted up to 17.x and listened for nothing it had asked for; it is now
  refused by the tool's schema, and the session refuses an empty list before anything is sent.
  Compact `HandlerDebugStart` required them already.
- **The breakpoints answer is the whole set.** `placed` is every breakpoint in force, not only this
  call's; `refused[].error` may be missing (no row answered that breakpoint, or its row gave no
  reason); `lost` and `unexpected` are new. See
  [Debugger → What a breakpoint catches](user-guide/DEBUGGER.md#what-a-breakpoint-catches).
- **A `condition` on an exception, statement or message breakpoint is refused**, naming the
  breakpoint. The system never evaluated it there.

What the breakpoints are shared with, and what a change or a stop does to another IDE of the same
SAP user, is in [Debugger → The breakpoint set and its key](user-guide/DEBUGGER.md#the-breakpoint-set-and-its-key).
A host that wants a take-over to ask first sets `SAP_DEBUG_BREAKPOINT_CONFLICT=refuse-if-held`.

## An embedder of `@mcp-abap-adt/lib/debugger`

1. **Dependencies.** Declare `@mcp-abap-adt/interfaces-adt` `^15.1.0` if you import it, and
   `@mcp-abap-adt/adt-clients` `^29.1.0` if you import that, so npm installs one copy:
   `npm ls @mcp-abap-adt/interfaces-adt` must show one version.
2. **`Debugger`** is adt-clients 29's `AbapDebugger`: `attach(identity, debuggeeId, options)`
   takes the identity, and `IDebuggerIdentity` states `debuggingMode` (`user` with `requestUser`,
   or `terminal` without). `IDebuggerBreakpoint` has no `skipCount` (a definition that sets it no
   longer compiles; the system ignored it) and takes an optional `clientId` on every kind.
   adt-clients' `docs/usage/MIGRATION-28.md` and `docs/usage/MIGRATION-29.md` have the rest.
3. **`DebugSessionPorts`** changes in two members. Ports of your own follow:
   - `dropConnection(connection)` is new and required: forget a connection whose ABAP session the
     system freed (`terminateDebugger`) and send nothing on it, not even a logoff.
   - `run(connection, target, debuggee?)` takes a third argument. In terminal mode the session
     passes its ids (`IDebuggeeIds`: `terminalId`, `ideId`), and the run must carry them — the live
     port hands them to adt-clients' executor (`debuggee`), which sends them in the run's
     `SAP-PASSPORT`. A run that drops them is caught by no terminal-mode listener. In user mode the
     argument is absent.
4. **`DebugSession`.** `start(conflict, options)` requires `options.breakpoints` (at least one;
   an empty list is refused with `DebugRefusedError`) and takes `requestUser`, `debuggingMode` and
   `settings` beside `breakpoints` and `run`; the constructor takes a third argument,
   `{ breakpointConflict }`; the protected `identity()` is gone and `currentIdentity()` answers the
   identity in force. New: `detach()`, `releaseDebugger()`, `setSettings()`, `settingsInForce()`,
   `preferredSettings()`, `requestedBreakpoints()`.
5. **`BreakpointsAnswer`**: `{ placed, refused, lost, unexpected }`, `refused[].error` optional;
   `BreakpointReading` carries the echoed `clientId`. The session tags each definition it keeps
   with a `clientId` of its own (`bp` and a counter, never reused in the instance) and pairs the
   answer by it; a `clientId` on a definition you hand it is replaced on the wire.
   It keeps only the definitions the system placed: a refused or lost one is dropped
   and not sent again. `requestedBreakpoints()` answers the kept definitions as you
   gave them.
6. **Errors.** `DebugRefusedError` (refused before anything was sent, or by the system before
   anything of ours was left to undo) and `DebugConflictError` (a `409`, with `conflictText` and
   `ideUser`; it extends `DebugListenerError`) are new.
7. **Behaviour you may rely on.** A start under `refuse` asks the system whether another debugger
   listens for the user before it changes anything, and so does every later `setBreakpoints` of
   that session. A stop releases a held stop, then stops the listener, which deletes the key's
   breakpoints — every IDE's under that key (measured in user mode; in terminal mode the session
   treats the set as gone after its stop, not measured); it deletes by id only when the
   listener's stop fails.
   The identity and the settings stay until a stop undid everything, and a new start is refused
   until then; `holdsState()` stays true while a listener's stop is owed.
8. **The host's breakpoint conflict.** `createDebuggerInstance(ids?, { breakpointConflict? })`;
   `resolveDebuggerIds()` also answers `terminalStated` (the terminal id came from configuration,
   which is when terminal mode reconciles with a predecessor); `resolveBreakpointConflict()` is
   new; the request scope carries `debugBreakpointConflict` (header
   `x-sap-debug-breakpoint-conflict`, `SAP_DEBUG_BREAKPOINT_CONFLICT` in a destination's `.env` or
   the environment). The order is the request scope, then the environment, then your
   `breakpointConflict` — a fallback, which the environment overrides. A host overriding
   `BaseMcpServer.debuggerFor()` passes the option there.
