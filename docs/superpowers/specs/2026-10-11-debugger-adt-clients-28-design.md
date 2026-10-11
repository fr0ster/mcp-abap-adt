# Debugger on adt-clients 28 — design

The consumer side of fr0ster/mcp-abap-adt-clients#217 (adt-clients 28.0.0, interfaces-adt 14.0.0, adt-strategies 0.9.0).
The library side, its measurements and its errata are in adt-clients: `docs/research/debugger-modes.md`,
`docs/research/debugger-endpoints.md`, `docs/usage/MIGRATION-28.md`, `docs/usage/ERRATA.md`.

## Goal

The debug session gets four things:

- **Another user's runs.** It can debug a run started by another user, not only the connected one.
- **Terminal mode.** It can listen in terminal mode, with a terminal id the host configures.
- **More ways to end and steer.** It can leave a debuggee running, free the debugger, and change the debugger settings.

It also stops losing breakpoints it has already armed.

## What the library measured, and what it means here

All of this was measured on premise (2026-10-11), BASIS 816:

- **`setBreakpoints` without `syncScope` replaces the whole set of the key.** It does so even with `validationOnly`.
  - In `user` mode, the key is the SAP user we log on as plus `requestUser`.
  - In `terminal` mode, it is the SAP user plus `terminalId`.
  - `ideId` does not separate breakpoints.
  - So every IDE of the same SAP user debugging the same request user shares one set.
- **`stopListener` deletes the key's breakpoints.**
- **The listener context is bound per ABAP session.** The first listen, check, stop or attach on a session fixes the identity of that session. So each identity needs a debug session of its own.
- **`terminateDebugger` frees the debugger's own session and answers a plain `500`.** The program runs on. `analyseDebuggerFreed` reads that answer as success.
- **`detachDebugger` leaves the debuggee running.** Without an id, the debugger leaves and the program runs on. An armed breakpoint can catch the same run again.
- **The server ignores `skipCount` on external breakpoints.** The library refuses it.
- **Another user needs authorisation.** Debugging another user's requests needs `S_DEVELOP` DEBUG ACTVT 90 on that user; without it the answer is `403`.

The bug this fixes, in 17.2.x:

- `DebugSession.armLocked` sends only the new breakpoints, so a second `DebugSetBreakpoints` wipes the first. The session's `armed` still lists them.
- When several refusals of one kind are ambiguous, it re-asks each one with `validationOnly`. That wipes the set as well.

## Tools (core)

- **`DebugStartListener` and `DebugTakeOverListener`** gain three optional parameters:
  - **`request_user`.** Whose requests are caught. The default is the connected user. A `403` reaches the model as SAP said it.
  - **`debugging_mode`: `user` | `terminal`.** The default is `user`.
    - `terminal` uses the terminal id the host configures: the request scope (header or the destination's `.env`), then `SAP_DEBUG_TERMINAL_ID`.
    - With no terminal id configured, `terminal` is refused before the wire: "no terminal id is configured".
    - `request_user` together with `terminal` is refused before the wire, because the server reads no request user in terminal mode.
  - **`settings`.** Any of `system_debugging`, `update_debugging`, `create_exception_object`, `background_rfc` and `shared_object_debugging`, each a boolean. The session keeps them and applies them after each attach. A field left out keeps its value.
- **`DebugStep`** gains two methods:
  - **`detach`.** The debugger leaves and the program runs on. An armed breakpoint can catch it again.
  - **`release_debugger`.** Frees the debugger. The program runs on, and the debug session's attachment ends. It is read with `analyseDebuggerFreed`.
- **`DebugSetSettings`** (new). Changes the settings at the current stop and answers the settings in force. The session's kept settings are updated with it.
- **`DebugSetBreakpoints` and `DebugDeleteBreakpoint`.**
  - The session keeps its full list and sends it whole on every change. Deleting is by id.
  - Nothing is re-asked one by one. Why a breakpoint was refused is read from the rows of the one answer. If a refusal cannot be paired with a requested breakpoint, the answer says so; it does not guess.
  - The descriptions say that the set is shared by every IDE of the same SAP user for the same request user (or terminal id), and is replaced as a whole.
- **Breakpoint schema.** `condition` is accepted on a line breakpoint only. There is no `skip_count`.
- **Unchanged.** `DebugTerminate` and a step that runs to the end keep `analyseDebuggeeEnd`.

## Tools (compact)

Compact keeps its four debugger tools.

- **`HandlerDebugStart` with `kind: abap`** gains `request_user`, `debugging_mode` and `settings`, with the same rules as core. With `kind: amdp` they are refused before the wire.
- **`HandlerDebugStep`** gains the actions `detach` and `release_debugger`.
- **Settings in the middle of a session are core only.** Compact sets them at the start.
- **`take_over` description.** It says that the user's breakpoints of the same key are replaced.

## The session and its owner

- **Identity by mode.** `DebugSession` builds the identity from the start's arguments:
  - `user`: `{ debuggingMode: 'user', requestUser, terminalId, ideId }`;
  - `terminal`: `{ debuggingMode: 'terminal', terminalId, ideId }`.

  The identity is fixed for the life of the state handle. Another identity means another start, with another handle.
- **Sessions per identity.** The listener and each attach already run on connections of their own. This stays, and a test pins that a listener for another request user never reuses a connection that served another identity.
- **Arming.**
  - `armLocked` sends `armed ∪ new` in one request.
  - `armed` is rebuilt from the placed rows of that answer.
  - There is no `validationOnly` re-ask.
- **Breakpoint conflict.** This is a choice of the host, stated like the ids: the request scope, then the environment variable `SAP_DEBUG_BREAKPOINT_CONFLICT`, then an option of `createDebuggerInstance` for an embedder.
  - **`replace`** (the default) sends the full list.
  - **`refuse-if-held`** asks `checkListener` first. If another listener holds the key, it refuses before the replacement, and the answer carries `readListenerConflict`'s `conflictText` and `ideUser`.
- **Settings.** Kept on the session and applied after each attach. `DebugSetSettings` applies them and updates what is kept.
- **Errors.**
  - A listener conflict (`409`) carries `conflictText` and `ideUser` from `readListenerConflict`.
  - A `403` for another user passes as SAP said it.
  - The plain `500` of `release_debugger` is no failure.

## Dependencies and version

- **Dependencies.** `@mcp-abap-adt/adt-clients ^28.0.0` and `@mcp-abap-adt/adt-strategies ^0.9.0`, plus `@mcp-abap-adt/interfaces-adt ^14.0.0` wherever a package of this repository depends on it directly. All are from the registry.
- **Version.**
  - The tools only gain optional parameters, methods and one tool, so nothing breaks for a model.
  - If lib's public API changes in a way that breaks an embedder (a debugger type, a session or an owner signature), the release is 18.0.0. Otherwise it is 17.3.0.
  - The plan checks this and states which.

## Testing

- **Unit.**
  - **Identity by mode:**
    - `terminal` without a terminal id is refused;
    - `request_user` with `terminal` is refused.
  - **Arming:**
    - a second `DebugSetBreakpoints` sends the first breakpoints with the new ones;
    - no `validationOnly` request is made;
    - `armed` matches the answer;
    - `refuse-if-held` refuses when `checkListener` answers `409`, carrying `conflictText` and `ideUser`.
  - **New actions and settings:**
    - `detach` and `release_debugger`, core and compact;
    - `release_debugger`'s plain `500` reads as success;
    - `DebugSetSettings`;
    - settings applied after attach.
  - **Descriptions:** the existing `toolDescriptionsCarryNoLiterals` covers the new text.
- **Integration on premise.** Soft mode, with hard mode for the new tools. Each run is asked of the user first.
  - **The regression:** two `DebugSetBreakpoints` in a row, and the program stops at both.
  - **Another user:** `DebugStartListener` with `request_user` set to a second configured user. That user runs a class, and the run is caught, stepped and continued. Skipped unless a second user is configured.
  - **`detach`:** the run finishes.
  - **`release_debugger`:** the run finishes, and the session's answer is no failure.
  - **Settings:** at the start and through `DebugSetSettings`.
  - **Terminal mode without SAP GUI:** the listener starts and stops. No catch is asserted.

## Documentation

- **`docs/user-guide/DEBUGGER.md`.**
  - Another user, and the authorisation it needs.
  - Terminal mode: where SAP GUI shows its terminal id; that a catch in this mode is not measured; what an issue should carry (the mode, whether the id is SAP GUI's, how the program was started, and `DEBUG_HTTP_WIRE` output).
  - The shared breakpoint key and `SAP_DEBUG_BREAKPOINT_CONFLICT`.
  - `detach`, `release_debugger` and the settings.
  - What ADT cannot do: attach to a running process or request.
- **`CLAUDE.md`.** In the state-handle section, the sentence saying terminal mode, other users and processes "wait on adt-clients (fr0ster/mcp-abap-adt-clients#217)" is replaced with what now holds.
- **The rest.** README, the generated tool docs (`npm run docs:tools`), CHANGELOG, and the release metadata the release tests demand.
