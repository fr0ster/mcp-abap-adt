# Debugger on adt-clients 29 — design

The consumer side of fr0ster/mcp-abap-adt-clients#217 (adt-clients 29.0.0, interfaces-adt 15.0.0, adt-strategies 0.10.0).
The library side, its measurements and its errata are in adt-clients: `docs/research/debugger-modes.md`,
`docs/research/debugger-endpoints.md`, `docs/usage/MIGRATION-28.md`, `docs/usage/MIGRATION-29.md`, `docs/usage/ERRATA.md`.
The file keeps its name (`-28-`), as does the branch; the contract is 29's.

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
  - In `terminal` mode, it is the SAP user plus `terminalId`; a `terminalId` equal to `ideId` keys on the IDE id alone.
  - `ideId` does not separate breakpoints.
  - So every IDE of the same SAP user debugging the same request user shares one set.
- **`stopListener` deletes the key's breakpoints.**
- **The listener context is bound per ABAP session.** The first listen, check, stop or attach on a session fixes the identity of that session. So each identity needs a debug session of its own.
- **`terminateDebugger` frees the debugger's own session and answers a plain `500`.** The program runs on. `analyseDebuggerFreed` reads that answer as success. The freed session takes no further request.
- **The first `setDebuggerSettings` after an attach ignores `systemDebugging=false`.** This is server source; the answer cannot show it. `showDataAging` does not merge: when it is left out, it is off.
- **`detachDebugger` leaves the debuggee running.** Without an id, the debugger leaves and the program runs on. An armed breakpoint can catch the same run again.
- **The server echoes the caller's `clientId` on every answer row.** adt-clients 29 sends a `clientId` on each breakpoint row that has one. The answer carries it back on every row, placed and refused alike.
  - The rows do not keep the request's order: the refused rows came first.
  - Ids are renumbered, so a row's id says nothing about which request row it answers.
  - A placed line row also echoes `adtcore:uri` and `condition`.
  - So neither the position nor the id pairs an answer row with its request; the `clientId` does.
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
- **`DebugStep`** gains two methods, ABAP only. Both are refused for an AMDP session. The transitions are under "The session and its owner".
  - **`detach`.** The debugger leaves and the program runs on. An armed breakpoint can catch it again.
  - **`release_debugger`.** Frees the debugger. The program runs on. It is read with `analyseDebuggerFreed`.
- **`DebugSetSettings`** (new). Changes the settings at the current stop and answers the settings in force. The session's kept settings are updated with it.
- **`DebugSetBreakpoints` and `DebugDeleteBreakpoint`.**
  - The session keeps its full list and sends it whole on every change. Deleting is by id.
  - Nothing is re-asked one by one. Why a breakpoint was refused is read from the rows of the one answer, each row paired with its breakpoint by the `clientId` the session sent with it. A row that carries no `clientId` of this request is reported as unexpected; it is never guessed.
  - The descriptions say that the set is shared by every IDE of the same SAP user for the same request user (or terminal id), and is replaced as a whole.
- **Breakpoint schema.** `condition` is accepted on a line breakpoint only. A condition on another kind is refused before the wire, naming the breakpoint. Core and compact descriptions that say "each with an optional condition" change to "a line breakpoint may carry a condition".
- **Unchanged.** `DebugTerminate` and a step that runs to the end keep `analyseDebuggeeEnd`.

## Tools (compact)

Compact keeps its four debugger tools.

- **`HandlerDebugStart` with `kind: abap`** gains `request_user`, `debugging_mode` and `settings`, with the same rules as core. With `kind: amdp` they are refused before the wire.
- **`HandlerDebugStep`** gains the actions `detach` and `release_debugger`.
- **Settings in the middle of a session are core only.** Compact sets them at the start.
- **`take_over` description.** It says that the user's breakpoints of the same key are replaced.

## The session and its owner

**Identity and lifecycle.**

- `DebugSession` builds the identity from the start's arguments:
  - `user`: `{ debuggingMode: 'user', requestUser, terminalId, ideId }`;
  - `terminal`: `{ debuggingMode: 'terminal', terminalId, ideId }`.
- The identity is fixed for the life of the state handle. Another identity means another start, with another handle.
- **Clearing the identity on stop.** It is cleared, with the request user, the mode and the settings, only when the stop's cleanup succeeded completely.
  - While anything is kept for a later stop (a listener not stopped, breakpoints not deleted, a connection not closed), the identity is kept, so the retry addresses the same key.
  - A new start is refused until that cleanup is done.
- `reconciled` stays true for the life of the instance. The predecessor of stated ids is reconciled once per process, as today.
- The listener and each attach already run on connections of their own. This stays, and a test pins that a listener for another request user never reuses a connection that served another identity.

**Order at the start.** It is fixed because `stopListener` deletes the key's breakpoints:

1. With `refuse-if-held`, the preflight runs first, on the control connection, never on a polling connection: `checkListener(identity)`.
   - A `409` refuses the start, carrying `readListenerConflict`'s `conflictText` and `ideUser`. Nothing has been sent that changes anything.
   - Our own listener under the same `ideId` is never reported as a conflict (measured: the same `ideId` never conflicts). So the check protects against another IDE, not against ourselves.
   - The check is not atomic: a listener started between the check and the arming is not caught.
2. The reconciliation of a stated-id predecessor (`stopListener`) runs only after a successful preflight. It deletes the key's breakpoints, which the arming then replaces.
3. Arming, then listening, as today.

`refuse-if-held` runs the same preflight before every later replacement (`DebugSetBreakpoints`), with the same rules.

**The arming contract.**

- The session keeps two lists:
  - `requested`: the breakpoint definitions as the caller gave them, deduplicated by kind, target and condition, each with the `clientId` the session assigned it;
  - `armed`: the server's rows with ids, as now.
- **The `clientId`.** The session assigns each definition its tag when the definition first enters `requested`: `bp` followed by a decimal counter the session instance keeps (`bp1`, `bp2`, …).
  - The tag stays with the definition for as long as it is in `requested`, so every re-send carries the same tag.
  - The counter never goes back and is never reset, not by a stop and not by a new start of the same instance. A tag is never reused, so an echo of an earlier definition can never pair with a later one.
  - It is unique within a request by construction: deduplication leaves one definition per key, and each definition has one tag.
  - It is short and contains only `[a-z0-9]`. The library escapes the value, but this one needs no escaping, and its length does not depend on a URI or a condition, so no field length of the server comes into question.
  - A tag derived from the definition (kind, target and condition) was rejected. It is as long as the URI and the condition together and carries whatever characters a condition holds. Its only gain would be the same tag for the same definition across a delete and a re-add, and pairing is per request, so that gains nothing.
  - A `clientId` on a definition handed to the session is not the caller's to choose: the session's tag replaces it on the wire, and the tool schemas have no such field.
- A change (a start with breakpoints, or `DebugSetBreakpoints`) sends `requested ∪ new` in one request, every row with its tag. A delete by id removes the breakpoint from both lists and sends nothing else. An id the session does not hold is refused before the wire.
- **Pairing answer rows with definitions** is by the echoed `clientId` alone:
  - A row whose `clientId` is a tag sent in this request answers that definition: placed when it has an id, refused when it has none (with the row's reason, if it gives one).
  - A sent definition that no row answers was not placed. It is refused, or lost if it was sent before, without a reason.
  - **A row that cannot be paired** is reported as `unexpected: [{ kind, id?, clientId?, error? }]`, a new field of the answer, and never paired by guess. That is a row with no `clientId`, a row with a `clientId` this request did not send, or a second row for a tag already answered. A conforming server never sends one.
    - A placed row of this kind is still on the server under the key. So it is in `placed` and in `armed`, where a delete by its id and the stop reach it. Deleting it touches no definition.
    - A refused row of this kind only appears in `unexpected`.
  - The server may rewrite a line URI in a placed row and echoes the condition. Neither is used for pairing; the tag is.
- **After the answer:**
  - `armed` is exactly the placed rows of this answer, the surviving old breakpoints included.
  - `requested` keeps only the definitions that were placed.
  - The answer reports four things:
    - `placed`: the full resulting set, not just this call;
    - `refused`: this call's definitions that were not placed, each with its definition and the reason its row gave;
    - `lost`: earlier definitions that are no longer placed, the same way;
    - `unexpected`: the rows that could not be paired.
- No `validationOnly` request is ever made.

**Stop and a failed start.** `stopListener` deletes the key's breakpoints, so it is the authoritative cleanup.

- **Stop.**
  1. Release a held stop.
  2. Stop the listener.
  3. If `stopListener` succeeded, clear `armed` and `requested`, and drop any per-id deletion failure: the listener's deletion covered them.
  4. If it failed, delete by id as today. What fails stays for the next stop.
- **A start refused before any change.** No mutation was sent: a preflight `409`, a refusal before the wire such as `terminal` without a terminal id or a condition on a non-line breakpoint, or a failure of the preflight itself. Such a start closes only the connections it opened, and sends no `stopListener` and no deletion.
- **A start that failed after a change.** That is from the reconciliation or the arming on. It runs the same cleanup as a stop. It no longer deletes by the ids "placed here", because after a replacement those ids no longer say what this start added.

**Detach and release.**

- **`detach`.**
  1. `detachDebugger()` on the attached session.
  2. The attachment is cleared and its connection closed. A close that fails is recorded, as today.
  3. The listener, `requested` and `armed` stay, and polling resumes.
  4. The state handle stays, and the answer is the listening state.
- **`release_debugger`.**
  1. `terminateDebugger()` with `analyseDebuggerFreed`.
  2. The attaching session is freed by the server, so its connection is dropped without any further request and without a logoff.
  3. The listener, `requested` and `armed` stay, and polling resumes.
  4. The answer is the listening state.
  5. A failure that is not the freed `500` (an ADT document, a gateway or HTML `500`, a `400`) stays a failure, and the attachment is kept for `DebugStop`.

**Settings.**

- The session keeps the requested preferences, the fields the caller set.
- It reports the effective settings: the last answer of `setDebuggerSettings`.
- After each attach it sends the preferences. If they set `system_debugging` to false, it sends them a second time, because the first call after an attach ignores that value (server source). The reported settings are those of the second answer.
- `DebugSetSettings` merges into the preferences, applies them, and reports the effective settings.
- `showDataAging` is not exposed. The library leaves it out, so it stays off, which is the server's default.

**Breakpoint conflict.** This is a choice of the host, stated like the ids: the request scope, then the environment variable `SAP_DEBUG_BREAKPOINT_CONFLICT`, then an option of `createDebuggerInstance` for an embedder.

- **`replace`** (the default) sends the full list.
- **`refuse-if-held`** runs the preflight above.

**Errors.**

- A listener conflict (`409`) carries `conflictText` and `ideUser` from `readListenerConflict`.
- A `403` for another user passes as SAP said it.
- The plain `500` of `release_debugger` is no failure. Every other answer stays one.

## Dependencies and version

- **Dependencies.** `@mcp-abap-adt/adt-clients ^29.0.0` and `@mcp-abap-adt/adt-strategies ^0.10.0`, plus `@mcp-abap-adt/interfaces-adt ^15.0.0` wherever a package of this repository depends on it directly. All are from the registry, and `npm ls @mcp-abap-adt/interfaces-adt` shows one version (adt-strategies 0.10.0 declares the same `^15`).
  - 29 is chosen over 28 because it is the first release that sends `clientId`, which the arming contract pairs by. interfaces-adt 15 is the contract it is built on; adt-strategies 0.10.0 is the release on that contract.
- **Version: 18.0.0.**
  - lib's public surface exposes the upstream debugger types: the exported `Debugger`, `DebugSessionPorts`, and the breakpoint and answer signatures. Moving to interfaces-adt 15 and adt-clients 29 changes `attach`, makes the identity a union and refuses a condition on a non-line breakpoint. The breakpoint types lose `skipCount` and gain `clientId`.
  - The answer gains `unexpected` and `lost`.
  - The model-facing tools only gain optional parameters, methods and one tool.
  - A migration note for embedders (`docs/` and the CHANGELOG) says what changed and what to do: declare the new ranges; drop `skipCount`, which no longer compiles; a `clientId` on a definition handed to the session is replaced by the session's own; read `unexpected` and `lost` from the answer.

## Testing

**Unit tests**, with mocked ports:

- **Identity by mode.** `terminal` without a terminal id is refused. `request_user` with `terminal` is refused.
- **The order at the start.**
  - With `refuse-if-held` and stated ids, a `409` from the preflight refuses the start before any `stopListener` or arming.
  - The preflight runs on the control connection.
  - Our own same-`ideId` listener does not block an update.
- **The arming contract.**
  - A second change sends `requested ∪ new`, each definition with the same tag it had before and a new one with the next tag.
  - Tags are never reused, also across a stop and a new start of the same instance.
  - No `validationOnly` request is made.
  - Fixtures cover rows out of the request's order (refused first), several definitions of one kind each paired exactly, a rewritten line URI in a placed row, a refusal with its definition, a definition no row answers, and a partial refusal where an old breakpoint comes back refused (`lost`).
  - `unexpected`: a row without a `clientId`, a row with a tag this request did not send, and a second row for one tag are reported and paired with nothing. A placed one of them stays in `placed` and `armed`.
  - A delete by id removes exactly its definition, and the next change does not re-send it. An unknown id is refused before the wire.
  - `armed` and `requested` match the rules.
- **Stop and a failed start.**
  - After a successful `stopListener`, `armed` and `requested` are empty and per-id deletion failures are gone.
  - After a failed `stopListener`, the per-id deletes run and their failures remain.
  - A failed start after a change runs the same cleanup.
  - A start refused by the preflight `409`, or before the wire, sends no `stopListener` and no deletion.
  - A failed stop keeps the identity, a new start is refused, and the retry addresses the same key.
  - The identity and settings are cleared only after a complete cleanup.
- **Detach and release.**
  - Each ends in the listening state with the listener, `requested` and `armed` kept.
  - `release_debugger` drops the freed connection without a further request.
  - Its freed `500` (`text/plain` or empty) is no failure. An ADT document `500`, an HTML `500` and a `400` stay failures, with the attachment kept.
  - Both are refused for AMDP.
- **Settings.**
  - The preferences are applied after attach, and again after a re-attach (a catch after `detach` or `release_debugger`).
  - `system_debugging: false` is sent twice after an attach.
  - `DebugSetSettings` merges, and the reported settings are the last answer's.
- **Compact.** It gets the same parameters and actions, and they are refused for `kind: amdp`.
- **Descriptions.**
  - `toolDescriptionsCarryNoLiterals` covers the new text.
  - A test pins that no breakpoint description says every kind takes a condition.

**Integration on premise.** Soft mode, with hard mode for the new tools. Each run is asked of the user first.

- **The regression.** Two `DebugSetBreakpoints` in a row, and the program stops at both. Both answers have `unexpected` empty. A third change adds a line that takes no breakpoint: exactly that definition is `refused`, the other two stay placed, and nothing is `lost`.
- **Another user.** `DebugStartListener` with `request_user` set to a second configured user. That user runs a class; the run is caught, stepped and continued. Skipped unless a second user is configured.
- **`detach`.** The run is caught again at the next pass of an armed line in a loop, then continued to its end.
- **`release_debugger`.** The run finishes, the answer is no failure, and the listener catches the next run.
- **Settings.** At the start and through `DebugSetSettings`, with the reported settings recorded after each.
- **Terminal mode without SAP GUI.** The listener starts and stops. No catch is asserted.

## Documentation

- **`docs/user-guide/DEBUGGER.md`.**
  - Another user, and the authorisation it needs.
  - Terminal mode: where SAP GUI shows its terminal id; that a catch in this mode is not measured; what an issue should carry (the mode, whether the id is SAP GUI's, how the program was started, and `DEBUG_HTTP_WIRE` output).
  - The shared breakpoint key and `SAP_DEBUG_BREAKPOINT_CONFLICT`.
  - `detach`, `release_debugger` and the settings.
  - What ADT cannot do: attach to a running process or request.
- **`CLAUDE.md`.** In the state-handle section, the sentence saying terminal mode, other users and processes "wait on adt-clients (fr0ster/mcp-abap-adt-clients#217)" is replaced with what now holds.
- **The rest.** README, the generated tool docs (`npm run docs:tools`), CHANGELOG, and the release metadata the release tests demand.
