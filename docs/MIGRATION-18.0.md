# Migrating to 18.0.0

All five packages (`lib`, `core`, `compact`, `compact-readonly`, `compact-modify`) are
**18.0.0**. The debugger moved to `@mcp-abap-adt/adt-clients` 29, `@mcp-abap-adt/interfaces-adt`
15 and `@mcp-abap-adt/adt-strategies` 0.10. The authentication stack moved to
`@mcp-abap-adt/interfaces-auth` 7, `auth-providers` 6, `auth-broker` 5, `auth-stores` 5 and
`@mcp-abap-adt/connection` 15 — see [Authentication](#authentication) below.

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
   until then; `holdsState()` stays true while a listener's stop is owed. One exception: when the
   system refuses the listener's stop for the user (`403` `notAuthorized`, `404` `invalidUser`),
   the breakpoints are let go, not deleted — they stay on the system — the stop answers a note
   naming them; nothing of the breakpoints is owed and no later stop retries them. The session
   ends when nothing else failed; another failure keeps the identity and the settings as above.
8. **The host's breakpoint conflict.** `createDebuggerInstance(ids?, { breakpointConflict? })`;
   `resolveDebuggerIds()` also answers `terminalStated` (the terminal id came from configuration,
   which is when terminal mode reconciles with a predecessor); `resolveBreakpointConflict()` is
   new; the request scope carries `debugBreakpointConflict` (header
   `x-sap-debug-breakpoint-conflict`, `SAP_DEBUG_BREAKPOINT_CONFLICT` in a destination's `.env` or
   the environment). The order is the request scope, then the environment, then your
   `breakpointConflict` — a fallback, which the environment overrides. A host overriding
   `BaseMcpServer.debuggerFor()` passes the option there.

## Authentication

What a user of the server meets:

- **A stored session must say whom it was issued for.** Beside a token or cookies a session file
  holds `SAP_ISSUED_FOR` and `SAP_ISSUED_BY` (`XSUAA_ISSUED_FOR` / `XSUAA_ISSUED_BY` for XSUAA),
  present even when empty. A session without them — written by hand or by an older `mcp-auth` —
  is refused as a whole: `… the stored session for "X" is not in this store's format; regenerate
  it with mcp-auth`. Regenerate it with `mcp-auth` from `@mcp-abap-adt/auth-broker-cli` 3.1 or
  later: `mcp-auth --env <file>` or `mcp-auth --destination <name>` discards the old session and
  logs in anew, keeping the destination's other lines.
- **The first renewal after the upgrade is a login.** A session written before 18.0.0 reads as
  unbound: its token and refresh token are not used, and a browser login (`authorization_code`)
  runs once per destination.
- **A token you hold (`SAP_GRANT_TYPE=none`) in a `.env` needs its binding beside it**:
  `SAP_ISSUED_FOR` — `SAP_URL` with its port, plus `?sap-client=<client>` when `SAP_CLIENT` is set
  — and `SAP_ISSUED_BY` — `mcp-abap-adt-binding/2;jwt/none;;;;;;;;;;;;` when no UAA or OIDC settings are stated. Without
  them the file is refused; with other values the destination is refused naming `issuedFor` and
  `issuedBy`. The `x-sap-jwt-token` header is unchanged. See
  [Authentication → A token you hold](user-guide/AUTHENTICATION.md#a-token-you-hold).
- **`--browser` keeps its names** (`system`, `auto`, `chrome`, `edge`, `firefox`, `none`,
  `headless`); any other name opens the platform's default browser. The login URL is printed on
  stderr in every case, also when a browser could not be opened — the login then keeps waiting
  for the same callback. A login is no longer ended after 30 s: it waits until it completes, is
  refused, or the server shuts down.
- **Renewal** is unchanged in effect: the refresh token first, a new login when it is refused. A
  session write that does not land is logged and the call goes on; the shutdown's flush reports
  it (`Session secrets not stored: "<destination>": <words>`).
- **Refusals read in fixed words** of the authentication layer (`reason — hint`), such as `the
  user or password was refused — check the user and password`. Code that matched the old words
  must match the new ones.
- **Stdio inspection-only mode** (no `--mcp`, no `--env`): a tool call is refused with `this
  connection has no credential to renew`; how to connect is printed on stderr at startup.
- **`disconnect()` ends the SAP session** (connection 14.1 and later): the logoff is sent as Eclipse sends it,
  with the session's cookie and no credential, and on ABAP Cloud a closed connection no longer
  leaves its security session open until the server's timeout.

What an embedder of `@mcp-abap-adt/lib` meets:

1. **Dependencies.** One copy of each contract: `@mcp-abap-adt/interfaces-auth` `^7.5.0`,
   `@mcp-abap-adt/auth-errors` `^2.2.0`, `@mcp-abap-adt/auth-providers` `^6.0.1`,
   `@mcp-abap-adt/auth-broker` `^5.0.4`, `@mcp-abap-adt/auth-stores` `^5.0.0`,
   `@mcp-abap-adt/connection` `^15.0.0` (on `@mcp-abap-adt/interfaces-adt-connection` 2, so
   one copy of the connection contract is installed too). Check with
   `npm ls @mcp-abap-adt/interfaces-auth @mcp-abap-adt/auth-errors @mcp-abap-adt/interfaces-adt-connection`.
   An answer of `makeAdtRequest` whose type is not named is `unknown` (connection 15): name
   the type, or narrow it, before reading a field.
2. **`IAuthBrokerFactoryConfig.browserStrategy`** takes `{ browser?: IBrowser; port? }` — the
   browser is an `IBrowser` (interfaces-auth 7), not a name. `browser` in the config stays the
   name `--browser` gives; the factory turns it into an `IBrowser` with the new export
   `browserFor(name, platform?)`. auth-providers' `browserCallbackStrategy` fits as it is.
3. **A provider of your own answers minted refusals.** An `AuthOutcome` refusal is an
   `IAuthProviderError` built by `@mcp-abap-adt/auth-errors` (`authError[kind](facts)`); an
   object literal does not compile. `NO_CREDENTIAL_REFUSAL` (new export) is the outcome of a
   provider that has no credential.
4. **`describeAuthError`** reads a `DestinationConfigError` structurally
   (`isDestinationConfigError`), answers a session store's `record-format` refusal in its own
   words, and gives one hint for `issuedFor` / `issuedBy`. `settle()`'s `notStored` lines carry a
   failed write's fixed words (`"<destination>": <words>`) instead of an error class.
