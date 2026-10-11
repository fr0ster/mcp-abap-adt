# Migrating to 18.0.0

18.0.0 splits the server by transport into packages, one mode each, and moves it onto the 6.0.0
auth chain. Go through the section that fits how you run the server.

The packages, all at **18.0.0**:

| Package | Directory | Binary | Serves |
|---|---|---|---|
| `@mcp-abap-adt/lib` | `.` | — | the handlers and the embeddable server |
| `@mcp-abap-adt/core` | `server/` | `mcp-abap-adt` | stdio |
| `@mcp-abap-adt/http` | `http/` | `mcp-abap-adt-http` | Streamable HTTP |
| `@mcp-abap-adt/sse` | `sse/` | `mcp-abap-adt-sse` | HTTP+SSE |
| `@mcp-abap-adt/compact-readonly`, `@mcp-abap-adt/compact-modify` | `compact-readonly/`, `compact-modify/` | — | the compact tool set's halves |
| `@mcp-abap-adt/compact` | `compact/` | `mcp-abap-adt-compact` | the compact tool set over stdio |
| `@mcp-abap-adt/compact-http` | `compact-http/` | `mcp-abap-adt-compact-http` | the compact tool set over Streamable HTTP |
| `@mcp-abap-adt/compact-sse` | `compact-sse/` | `mcp-abap-adt-compact-sse` | the compact tool set over HTTP+SSE |

## HTTP users

## SSE users

## compact users

### Over stdio

### Over Streamable HTTP

### Over SSE

## stdio users

- **The auth chain is 6.0.** The server runs on `@mcp-abap-adt/auth-broker` 5,
  `@mcp-abap-adt/auth-providers` 6 and `@mcp-abap-adt/auth-stores` 4. Your `.env` files and
  service keys keep working as they are.
- **The first start logs in once per destination.** A `jwt` / `authorization_code` destination
  logs in on its first tool call; from then on the token is refreshed, and a new login happens only
  when the refresh token is gone or refused.
- **`--browser` is mapped by the platform** to one of auth-providers' browsers:

  | `--browser` | Linux | macOS | Windows | another platform |
  |---|---|---|---|---|
  | `system` (default), `auto` | `xdg-open` | `open` | the default browser | none: a `jwt` / `authorization_code` destination is refused at start (use `--browser=none` or `--browser-program`); other destinations start |
  | `chrome` | `google-chrome` | `Google Chrome` | `chrome` | none (as above) |
  | `edge` | `microsoft-edge` | `Microsoft Edge` | `msedge` | none (as above) |
  | `firefox` | `firefox` | `Firefox` | `firefox` | none (as above) |
  | `none`, `headless` | no browser: the URL on stderr; the login waits | the same | the same | the same |

  A name outside the table now stops the start instead of being passed on. On a platform outside
  the table only a `jwt` / `authorization_code` destination is refused for the missing browser, at
  the startup check. `auto` is new and means
  `system`. `--browser=none` no longer gives up at once: it prints the URL and waits for the
  callback. A browser that is not in the table: `--browser-program=<program>` (`MCP_BROWSER_PROGRAM`,
  YAML `browser-program`), which excludes `--browser`.
- **`--renewal=refresh-then-login|refresh-only`** (`MCP_RENEWAL`, YAML `renewal`) is new. The
  default, `refresh-then-login`, is what 17.x did. `refresh-only` never logs in: a destination that
  would need a login answers `renewal-declined` with "Logins are off (`--renewal=refresh-only`):
  log in with `mcp-auth`, or start without it."
- **A failed write to your `--env` / `--env-path` file fails the request** and refuses the
  destination until a write lands (17.x logged it and went on). A named destination's failed write
  is still only logged (on stderr only with `DEBUG_AUTH_LOG=true`).
- **The startup check builds the credential.** A destination the broker refuses (a missing client
  field, say) now stops the start, exit `1`, instead of failing the first tool call.
- **There is no 30-second login timeout.** A login waits until the browser answers, the identity
  provider refuses, or the request is cancelled.
- **`npm run auth` is gone.** Write a `.env` with `mcp-auth` from
  `@mcp-abap-adt/auth-broker-cli`: `npm install -g @mcp-abap-adt/auth-broker-cli`, then
  `mcp-auth --service-key ./service-key.json --output ./mcp.env --type abap` (`--type xsuaa` for an
  XSUAA key), or `mcp-auth --destination <name> --type abap|xsuaa` for a destination of the
  destination folder (`mcp-auth --help` lists the rest).
- **Editing a destination's files while the server runs is not supported**: it may combine old and
  new values until the next start. Restart after any change.
- **Inspection-only mode** (stdio without a destination) answers a tool call with the server's own
  `inspection_only` refusal, before any connection.
- **A tool call that fails on authentication answers JSON** (`isError: true`): `{ error, kind?,
  message, hint?, cause_kind?, server? }`. `error` is `authentication_failed` for a failure of the
  auth chain (`kind`, `message` and `hint` are the chain's), `destination_refused` for a destination
  the server cannot use, `request_aborted` for a cancelled request, or one of the server's own
  refusals (`inspection_only`, `fresh_connection_unavailable`, `credentials_required`). The words are
  no longer a plain line of text, and no error's message, diagnostics or facts beyond `kind` are in
  them; the diagnostics go to stderr as auth-errors' `logFields`. See
  [What an MCP client sees](user-guide/AUTHENTICATION.md#what-an-mcp-client-sees-when-a-tool-call-fails-on-authentication).
- **A destination refused for its fields reads `Destination "X" cannot be used: <fields>`**
  (17.x: `lacks: <fields>`); a browser login on a platform with no known browser reads
  `Destination "X" logs in through a browser, and none is known on this platform (<platform>)`.

## Embedders

- **`AuthBrokerFactory` left `@mcp-abap-adt/lib/auth`.** It is now
  `@mcp-abap-adt/core/auth`, with `IAuthBrokerFactoryConfig`: import both from there.
- **`IAuthBrokerFactoryConfig`** takes `browser?: IBrowser` (build it with `browserOf(browserFor(
  { browser, program }, process.platform))` from `@mcp-abap-adt/core/auth`, or pass your own) in
  place of `browser: string`, a `browserStrategy` taking `{ browser?: IBrowser; port?: number }`
  (auth-providers 6's `browserCallbackStrategy` fits), a required `promptLogger`
  (`promptLogger(stderr, diagnostics)`), and `renewal?: 'refresh-then-login' | 'refresh-only'`.
- **`IDestinations.getProvider(destination, { signal })`** takes the request's signal, and
  `settle(deadlineMs, { signal })` hands it to the broker's `flush`. `SettleReport.notStored` lines
  are `"<destination>": <reason>`, the reason auth-errors' classification.
- **`inspectionOnlyDestinations()` is gone**: `new StdioServer(registry, undefined)` is
  inspection-only, and a tool call answers lib's `ServerRefusal('inspection_only')`
  (`@mcp-abap-adt/lib/auth`).
- **The closed provider gate answers auth-errors' `interactive-login` `aborted`**, minted, in place
  of `{ reason: 'the server is shutting down' }`.
- **`describeAuthError` is gone; read a failure with `failureOf(thrown)`** from
  `@mcp-abap-adt/lib/auth`: structural (no `instanceof`, no `message`, no `name`), total, it answers
  a `ReadFailure` (`error`, `kind?`, `message`, `hint?`, …) for a chain failure
  (`AuthProviderFailure`, connection's `AuthRefusedError`, an `IAdtError` carrying a `refusal`), an
  aborted request (`code: 'ADT_REQUEST_ABORTED'`) or a `ServerRefusal`, else `undefined`.
  `answerFailure(read)` renders the §7.3 JSON, `failureLogLine(where, read)` the stderr line,
  `answerRead(read)` both; `readGuarded(reader, thrown)` answers auth-errors' fixed `unknown`
  words when a reader you do not own throws. The
  destination layer's reader, `DestinationConfigError` first, is core's `destinationFailureOf(thrown,
  { platform?, sentenceFor? })` (`@mcp-abap-adt/core/auth`); a `BaseMcpServer` subclass overrides
  `protected readFailure(thrown)` to read more.
- **Moved to `@mcp-abap-adt/core/auth`:** `UnsupportedAuthenticationError`, `DestinationRefusal`
  (both now a `ServerRefusal` answered `destination_refused`), `vetMeans`, `AuthType`,
  `VettedAuthentication`. `@mcp-abap-adt/lib/auth` no longer re-exports auth-broker's
  `DestinationConfigError`: import it from `@mcp-abap-adt/auth-broker`. `assertDestinationName`
  throws `ServerRefusal('destination_refused', …)`. `ServerRefusal` takes
  `destination_refused` with its words, and `fresh_connection_unavailable` /
  `credentials_required` with fixed ones.
- **`StreamableHttpServer` and `SseServer` take `readFailure?`**, the reader they answer a failed
  destination and a failed tool call with (default `failureOf`).
