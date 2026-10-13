# Migrating to 19.0.0

19.0.0 splits the server by transport into packages, one mode each, and moves it onto the 6.0.0
auth chain. Go through the section that fits how you run the server.

The packages, all at **19.0.0**:

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

## Every binary: `--transport` is gone, and each reads only its own parameters

- **Remove `--transport`** (and `MCP_TRANSPORT`, and the YAML key `transport`) from every command
  line, client configuration, service unit and config file: a binary is its transport. Any value —
  `--transport=stdio` included — stops the start with the binary's sentence, e.g. "`--transport`
  is gone: `mcp-abap-adt` serves stdio; for Streamable HTTP run `mcp-abap-adt-http`, for SSE
  `mcp-abap-adt-sse` (compact: `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`)". For
  Streamable HTTP run `mcp-abap-adt-http`, for SSE `mcp-abap-adt-sse`.
- **An option of another binary stops the start** in its CLI and YAML forms, naming the binary that
  serves it — 18.x ignored it. Its **environment variable is not read** — ignored, no refusal, no
  warning — so one shell profile or one `EnvironmentFile` can serve several binaries; only
  `MCP_TRANSPORT` is refused everywhere. Per binary:

  | Binary | Refused, with the words |
  |---|---|
  | `mcp-abap-adt` | the SSE options (`--sse-host`, `--sse-port`, `--sse-path`, `--post-path`, `--sse-allowed-*`, `--sse-enable-dns-protection`, YAML `sse`): "SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)"; the Streamable HTTP ones (`--host`, `--port`, `--path`, `--http-*`, YAML `http`): "Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)"; `--tls-*`: "TLS is an option of `mcp-abap-adt-http` and `mcp-abap-adt-sse`"; `--allow-destination-header` (gone). Not read: `MCP_SSE_*`, `MCP_HTTP_*`, `MCP_TLS_*` |
  | `mcp-abap-adt-http` | the destination and login options (`--mcp`, `--env`, `--env-path`, `--auth-broker-path`, `--allow-destination-header`, `--unsafe`, `--connection-type`, `--browser*`, `--login-timeout`, `--renewal`, `--auth-debug`, their YAML keys): "destinations and logins are served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers"; the SSE options, with the SSE words. Not read: `MCP_SSE_*`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_BROWSER*`, `MCP_LOGIN_TIMEOUT`, `MCP_RENEWAL`, `AUTH_BROKER_PATH`, `SAP_CONNECTION_TYPE` |
  | `mcp-abap-adt-sse` | the destination and login options, as for http; the Streamable HTTP options — `--host`, `--port` and `--path` included — with the Streamable HTTP words. Not read: `MCP_HTTP_*`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_BROWSER*`, `MCP_LOGIN_TIMEOUT`, `MCP_RENEWAL`, `AUTH_BROKER_PATH`, `SAP_CONNECTION_TYPE` |

  Each refusal names the form you used first: `--sse-port: SSE is served by …`.
- **Each binary's `--help`, `--conf` template and YAML validation come from its own table.** A
  config file written for 18.x that mixes `transport`, `mcp`, `http:` and `sse:` keys is refused by
  every binary: keep one file per binary, or regenerate it with `--conf=<new file>` (the binary
  writes its template there). The `http:` / `sse:` keys keep their 18.x shape (`http.port`,
  `sse.tls.cert`, …).
- **Values are checked in every form**: a port outside 1-65535, a flag that is not `true` /
  `false`, is refused at start (18.x fell back to the default for `--http-port` / `--sse-port`).
  TLS needs `--tls-cert` and `--tls-key` together (18.x served plain HTTP when one was missing).
- `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES` / `state-idle-minutes`, `--exposition` (with
  `debug`), `--system-type` and `--conf` are in every binary's table, unchanged.
- **An unknown `--exposition` word stops the full binaries** (`mcp-abap-adt`, `mcp-abap-adt-http`,
  `mcp-abap-adt-sse`), in the CLI and the YAML form: they take `readonly`, `high`, `low` and
  `debug`. 18.x dropped any other word silently — `mcp-abap-adt --exposition=ro` served
  `readonly,high`. Now: *Invalid exposition: 'ro' is not a set of this command, which takes
  readonly, high, low and debug, comma-separated. 'ro' and 'rw' are the sets of
  \`mcp-abap-adt-compact\` (@mcp-abap-adt/compact).* — the compact binary named is the one of the
  binary's own transport (`mcp-abap-adt-compact-http` / `-compact-sse`), and so is the one
  `--exposition=compact` names. Remove `search` or `system` from an exposition (they come with
  every set and with `readonly`).

## HTTP users

- **Install `@mcp-abap-adt/http` and run `mcp-abap-adt-http`**, without `--transport` (see
  above). The options keep their names: `--host` / `--http-host` /
  `MCP_HTTP_HOST`, `--port` / `--http-port` / `MCP_HTTP_PORT`, `--path` / `--http-path`,
  `--http-json-response`, `--http-allowed-hosts`, `--http-allowed-origins`,
  `--http-enable-dns-protection` (and their `MCP_HTTP_*`), `--tls-cert` / `--tls-key` / `--tls-ca`
  (`MCP_TLS_*`), `--system-type`, `--exposition`, `--state-idle-minutes`, `--conf`. `GET
  /mcp/health` answers as before.
- **Credentials come only from each request's headers**: `x-sap-url`, `x-sap-client`, and
  `x-sap-jwt-token`, or `x-sap-login` with `x-sap-password`. A request without them is answered
  `400` — *this server takes credentials only from the request's headers: send x-sap-url with
  x-sap-jwt-token, or with x-sap-login and x-sap-password* (`ping` answers without them). Nothing is
  stored, shared or cached across requests.
- **No destination is served over HTTP.** The default destination (`--mcp`, `--env`,
  `--env-path`), `x-mcp-destination` and `--allow-destination-header` are gone from HTTP: a request
  carrying `x-mcp-destination` is answered `400` — *destinations are served only by mcp-abap-adt
  (stdio); send x-sap-* headers*. There is no broker, no store, no session file and no login, so
  the `service-keys` / `sessions` mounts (`AUTH_BROKER_PATH`) of a container or service running
  HTTP are no longer read: send the credential in the headers instead. A token you hold goes in
  `x-sap-jwt-token`.
- **The debugger works as in 18.0**: `--exposition=...,debug`, the `state_handle` routes a call back
  to the pooled instance that holds the state, the idle bound is `--state-idle-minutes`. Each
  request's own headers give its credential, also on a pooled instance. The debugger's ids come from
  `x-sap-debug-terminal-id` / `x-sap-debug-ide-id`, then `SAP_DEBUG_TERMINAL_ID` /
  `SAP_DEBUG_IDE_ID` of the environment; a destination's `.env` (and its `SAP_DEBUG_*`) is read only
  by `mcp-abap-adt` (stdio).
- **Every ADT session ends with a logoff.** A request's instance logs off its ADT session when the
  pool lets it go (after the request when it holds nothing; for a pooled instance, when its state
  ends — its stop tool or the idle bound — or at shutdown), whatever the state's undo answered.
- **Shutdown waits for the running tools** (no 30-second deadline): `SIGTERM` / `SIGINT` stops new
  requests (`503`), waits for every running tool on every instance — none aborted —, then disposes
  the pool's instances and logs off their sessions; exit `0`, or `1` with one line per instance
  whose state could not be undone (named by its ordinal). A second signal or
  **`--shutdown-timeout=<seconds>`** ends the waiting: every session is still logged off, exit `1`
  naming the requests still running. In a container, set it below the orchestrator's kill grace.

## SSE users

- **Install `@mcp-abap-adt/sse` and run `mcp-abap-adt-sse`**, without `--transport` (see above).
  The SSE options keep their names: `--sse-host` / `MCP_SSE_HOST`,
  `--sse-port` / `MCP_SSE_PORT`, `--sse-path`, `--post-path`, `--sse-allowed-hosts`,
  `--sse-allowed-origins`, `--sse-enable-dns-protection` (and their `MCP_SSE_*`), `--tls-*`
  (`MCP_TLS_*`), `--system-type`, `--exposition`, `--state-idle-minutes`, `--conf`. **`--host`
  and `--port` no longer apply to SSE** (18.x: they beat the SSE ones): they are Streamable HTTP's
  and stop the SSE start; use `--sse-host` / `--sse-port`.
- **Credentials come only from the `x-sap-*` headers of the `GET` that opens each SSE
  connection** (`x-sap-url`, `x-sap-client`, and `x-sap-jwt-token`, or `x-sap-login` with
  `x-sap-password`); that connection's `POST`s are served with them. A `GET` without them is
  answered `400` with the sentence above. A `POST` is routed by its `sessionId` alone: its own
  `x-sap-*` headers are not read. Nothing is shared with another connection, and nothing outlives
  one.
- **No destination is served over SSE**: the default destination, `x-mcp-destination` (a `GET` or a
  `POST` carrying it is answered `400`), `--allow-destination-header` and the `service-keys` /
  `sessions` mounts are gone, as for HTTP.
- **The debugger works as in 18.0**: the debug session lives in the connection's instance until the
  connection closes, its stop tool runs or the idle bound ends it. Its ids come from the opening
  `GET`'s `x-sap-debug-*` headers, then `SAP_DEBUG_*` of the environment; a destination's `.env` is
  read only by `mcp-abap-adt` (stdio).
- **A closed SSE connection's instance is disposed after its tools finished.** Its running tools
  run to their end (18.x undid the state while they ran), then its held state is undone and its
  ADT sessions are logged off — whatever the undo answered —, then its stream is closed. A `POST`
  for a closing connection reaches no tool. A connection that closes, or fails, while it is being
  set up is disposed too (18.x left it).
- **Shutdown waits for the running tools**, as for HTTP: every open connection's instance is closed
  after its tools settled, its sessions logged off, its stream ended; `--shutdown-timeout` and a
  second signal end the waiting the same way.

## compact users

**A package per transport, and the same tools on each.** The compact tool set is served by three
packages, each with one binary and its transport's options only:

| You ran | Install | Run |
|---|---|---|
| `mcp-abap-adt-compact` (stdio) | `@mcp-abap-adt/compact` | `mcp-abap-adt-compact` |
| `mcp-abap-adt-compact --transport=http` | `@mcp-abap-adt/compact-http` | `mcp-abap-adt-compact-http` |
| `mcp-abap-adt-compact --transport=sse` | `@mcp-abap-adt/compact-sse` | `mcp-abap-adt-compact-sse` |

- Each binary is its full counterpart's launcher with the compact tool set, nothing else:
  `mcp-abap-adt-compact` takes `mcp-abap-adt`'s options (the destination, the login),
  `mcp-abap-adt-compact-http` `mcp-abap-adt-http`'s (credentials from each request's `x-sap-*`
  headers), `mcp-abap-adt-compact-sse` `mcp-abap-adt-sse`'s. The sections above apply to each as
  to its counterpart; only the tool list and `--exposition` differ.
- **`--exposition` is compact's on each**: `rw` (all 25 tools, the default) or `ro` (the 16 that
  change nothing), and `debug` beside either for the four debugger verbs (`HandlerDebugStart`,
  `…Wait`, `…View`, `…Step`) — on stdio, Streamable HTTP and SSE alike. `debug` alone, an empty
  value and a set of the full binaries (`readonly`, `high`, `low`) stop the start, as in 18.x.
- **A config file's `exposition` is honoured now.** 18.x read compact's exposition from the command
  line only, and its `--conf` template wrote the full set's `exposition: readonly,high`, which it
  ignored. Each compact binary's template now writes `exposition: rw`, its help lists `ro` / `rw`
  / `debug`, and a config file's `exposition` is read by the same parser as the flag (the flag
  wins): `exposition: ro` serves the 16 tools, `exposition: readonly,high` stops the start —
  replace it with `ro` or `rw`.
- `@mcp-abap-adt/compact-http` and `@mcp-abap-adt/compact-sse` do not depend on
  `@mcp-abap-adt/core`: neither the auth broker nor the stores are installed with them.

## stdio users

- **`mcp-abap-adt` serves stdio only** (`@mcp-abap-adt/core`). **Remove `--transport=stdio`**
  from your MCP client's `args`: it now stops the start (see above). The HTTP, SSE and TLS options
  stop it too, naming `mcp-abap-adt-http` or `mcp-abap-adt-sse`; core no longer depends on
  `@mcp-abap-adt/http` or `@mcp-abap-adt/sse`. `--allow-destination-header` is gone: the process
  serves the one destination it is started with.
- **`jwt` / `none` is no longer served over stdio** (a token you hold: `SAP_AUTH_TYPE=jwt`,
  `SAP_GRANT_TYPE=none`, `SAP_JWT_TOKEN`). Such a destination stops the start with `Destination "X"
  uses jwt / none, which this server does not support` and the hint *a token you hold is sent in the
  x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse; for stdio, create the session
  with mcp-auth*. Send the token in `x-sap-jwt-token` to `mcp-abap-adt-http` / `mcp-abap-adt-sse`,
  or create the session with `mcp-auth` (a `jwt` / `authorization_code` destination). stdio serves
  three authentications: `basic`, `snc`, `jwt` / `authorization_code`.
- **The auth chain is 6.0.** The server runs on `@mcp-abap-adt/auth-broker` 5,
  `@mcp-abap-adt/auth-providers` 6 and `@mcp-abap-adt/auth-stores` 5. Service keys keep working
  as they are; a destination's means in a `.env` too.
- **Only the chain's own session format is read** (auth-stores 5). Session records written by
  `mcp-auth` (`@mcp-abap-adt/auth-broker-cli` 3.x) or by the server are read as before. A
  destination with no session record logs in on first use (a `.env` holding only the means is no
  session). An existing record of an older format — a token with no `SAP_ISSUED_FOR` /
  `SAP_ISSUED_BY` beside it (written by auth-stores 2.x–3.0, auth-broker 3.x or by hand), a token
  and cookies both, an expiry that is not epoch milliseconds — **stops the start**, without a login:
  `Destination "X" cannot be used: its session record is not in the store's format`, with the hint
  *regenerate the session with mcp-auth: `mcp-auth --destination <name> --type abap|xsuaa`, or
  `mcp-auth --service-key <file> --output <file> --type abap|xsuaa` (from
  @mcp-abap-adt/auth-broker-cli)*. A tool call answers the same, `destination_refused`. Removing
  `SAP_ISSUED_*` is no longer a remedy: regenerate the session with `mcp-auth`. A session bound to
  another destination's means is not used; the destination logs in afresh.
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
  default, `refresh-then-login`, is what 18.x did. `refresh-only` never logs in: a destination that
  would need a login answers `renewal-declined` with "Logins are off (`--renewal=refresh-only`):
  log in with `mcp-auth`, or start without it."
- **A failed write to your `--env` / `--env-path` file fails the request** and refuses the
  destination until a write lands (18.x logged it and went on): the tool answers `unknown`
  (`persisting-tokens`) with "The session could not be written to the destination's file." A
  named destination's failed write (`--unsafe`) lets the request go on and writes one stderr line,
  `[MCP] A session write did not land: …`, **whatever `DEBUG_AUTH_LOG` says** (18.x: only with
  `DEBUG_AUTH_LOG=true`).
- **There is no shutdown deadline** (18.x gave up after 30 seconds). On `SIGTERM`, `SIGINT` or the
  end of stdin the server stops taking calls (a call read from then on is answered "The server is
  shutting down."), **waits for every running tool to finish** — none is aborted, so a write's
  `UNLOCK` still goes out —, undoes its held state, **logs off every ADT session it opened** (the
  logoff is what releases a lock a tool left), then writes the pending session secrets and exits
  `0`, or `1` with one stderr line per fact not done. stdin's `end` and `close` are one trigger.
  No interactive login starts once the shutdown began.
- **Ending the waiting early**: a second `SIGTERM` / `SIGINT`, or **`--shutdown-timeout=<seconds>`**
  (`MCP_SHUTDOWN_TIMEOUT`, YAML `shutdown-timeout`; 1-86400, no default). Either is the forced
  close: no more waiting on a tool, a state undo or a session write; every ADT session is still
  logged off; exit `1` with a line per tool still running and the step that was cut short. What it
  costs: a tool cut short mid-write, a session write lost — a discarded refresh token can come
  back on the next start.
- **A crash outside a tool logs off too** (every binary): an uncaught exception or an unhandled
  promise rejection runs the forced close — every ADT session logged off, one stderr line
  `[MCP] The process failed (<ErrorClass>): …`, exit `1` (18.x exited with Node's default and
  logged nothing off). A killed process (`SIGKILL`, out of memory) cannot log off: SAP's own idle
  timeout ends its sessions and their locks.
- **The startup check builds the credential.** A destination the broker refuses (a missing client
  field, say) now stops the start, exit `1`, instead of failing the first tool call.
- **There is no 30-second login timeout.** A login waits until the browser answers, the identity
  provider refuses, or the request is cancelled — a cancelled request (or a client that closed
  its connection) ends the login it started once no other request waits for it. To bound a login,
  set **`--login-timeout=<seconds>`** (`MCP_LOGIN_TIMEOUT`, YAML `login-timeout`; a whole number
  from 1 to 86400, no default): a login still waiting then ends `aborted`, answered with "The
  login was ended by the server's login timeout (`--login-timeout=<n>`)." (the bound named in the
  form you set it).
- **A cancelled request does not reach its tool**, on every transport: once its client cancels
  it (or closes its connection), its waits end — a shared connect or login goes on for the other
  requests waiting for it — and its tool is never called. A tool already running runs to its end,
  and a cancel does nothing to SAP: no logoff, no new session. A connect that completes after
  every request waiting for it was cancelled is kept as the server's connection and used by the
  next request.
- **`npm run auth` is gone.** Write a `.env` with `mcp-auth` from
  `@mcp-abap-adt/auth-broker-cli`: `npm install -g @mcp-abap-adt/auth-broker-cli`, then
  `mcp-auth --service-key ./service-key.json --output ./mcp.env --type abap` (`--type xsuaa` for an
  XSUAA key), or `mcp-auth --destination <name> --type abap|xsuaa` for a destination of the
  destination folder (`mcp-auth --help` lists the rest).
- **`DeletePackage` with `force_new_connection` no longer falls back** to the session you asked
  it to avoid. If no fresh connection can be had, the call answers that failure, and nothing is
  deleted. 18.x logged the failure and deleted on the current session.
- **Editing a destination's files while the server runs is not supported**: it may combine old and
  new values until the next start. Restart after any change.
- **Inspection-only mode** (stdio without a destination) answers a tool call with the server's own
  `inspection_only` refusal, before any connection.
- **A tool call that fails on authentication answers JSON** (`isError: true`): `{ error, kind?,
  message, hint?, cause_kind?, server? }`. `error` is `authentication_failed` for a failure of the
  auth chain (`kind`, `message` and `hint` are the chain's), `destination_refused` for a destination
  the server cannot use, or one of the server's own refusals (`inspection_only`, `fresh_connection_unavailable`, `credentials_required`). The words are
  no longer a plain line of text, and no error's message, diagnostics or facts beyond `kind` are in
  them; the diagnostics go to stderr as auth-errors' `logFields`. See
  [What an MCP client sees](user-guide/AUTHENTICATION.md#what-an-mcp-client-sees-when-a-tool-call-fails-on-authentication).
- **A destination refused for its fields reads `Destination "X" cannot be used: <fields>`**
  (18.x: `lacks: <fields>`); a browser login on a platform with no known browser reads
  `Destination "X" logs in through a browser, and none is known on this platform (<platform>)`.

## Embedders

- **The chain under lib is the removal chain**: `@mcp-abap-adt/connection` **16**,
  `@mcp-abap-adt/interfaces-adt-connection` **3**, `@mcp-abap-adt/interfaces-adt` **16**,
  `@mcp-abap-adt/adt-clients` **31** (and `@mcp-abap-adt/adt-strategies` 0.11). None of them takes a
  signal: `IAbapRequestOptions.signal` and `IAdtClientOptions.signal` are gone, there is no
  `ADT_REQUEST_ERROR` / `ADT_REQUEST_ABORTED`, and `IAdtError` has no `refusal` — an
  authentication failure inside a tool reaches the model with the connection's own words. A
  connection's `disconnect()` resolves once its logoff is written, not answered; one instance is
  one SAP session, so a second `disconnect()`, or a `connect()` after it, rejects. A connection you
  inject, or return from `freshConnection`, is used on these contracts; move your own connection
  to them when you move to lib 19. The server builds its own connections with connection's
  `createConnection({ system, transport, … })`.
- **`AuthBrokerFactory` left `@mcp-abap-adt/lib/auth`.** It is now
  `@mcp-abap-adt/core/auth`, with `IAuthBrokerFactoryConfig`: import both from there.
- **`IAuthBrokerFactoryConfig`** takes `browser?: IBrowser` (build it with `browserOf(browserFor(
  { browser, program }, process.platform))` from `@mcp-abap-adt/core/auth`, or pass your own) in
  place of `browser: string`, a `browserStrategy` taking `{ browser?: IBrowser; port?: number }`
  (auth-providers 6's `browserCallbackStrategy` fits), a required `promptLogger`
  (`promptLogger(stderr, diagnostics)`), `renewal?: 'refresh-then-login' | 'refresh-only'`, and
  `loginTimeoutMs?` (`--login-timeout` in milliseconds; absent: no bound).
- **Each tool call has a request signal** (`BaseMcpServer`): aborted when the MCP request's
  `extra.signal` aborts, and when the call ends. The handler runs inside the request
  signal scope — `currentRequestSignal()` reads it; nothing sent to SAP carries it — and a call
  cancelled before its tool starts ends with `RequestAbortedError` without reaching it (there is no
  `request_aborted` answer); the tools a registry
  registers itself (`registerAllTools`) are tracked the same way. A
  `ConnectionSource.resolve(signal)` gets it and should race its own waits against it
  (`raceRequestSignal(work, signal)`). All of these come from `@mcp-abap-adt/lib/embeddable`.
- **The registry of live calls aborts nothing** (`@mcp-abap-adt/lib/embeddable`): `activeTools()`
  lists the calls of every instance, `settled(instance?)` waits for them, `latch(instance?)` makes
  every later call of the process (or of one instance) answer the shutdown refusal before any
  connection, `pending()` names what still runs. Nothing aborts a call that runs: a tool already
  running runs to its end, and a cancelled call ends only its waits.
- **Ending an instance has two parts.** `BaseMcpServer.dispose()` stays the state undo — callable
  again, each call retrying what is left — and closes no connection. Beside it,
  **`terminalClose()`** (lib's `closeOwnedConnections(instance)`) closes every connection the
  instance owns — the one it built, held state's own, package lock sessions, fresh connections
  still open — each with its one `disconnect()` (the logoff, which releases its SAP locks),
  whatever the undo answered; a connection you injected is never closed. A host that lets an
  instance go runs both; **`closeInstance(instance)`** runs the whole close in order (the
  instance's latch, its calls settle, the undo, the terminal close, the MCP server's close), once
  per instance. `forceClose()` logs off every connection the process owns without waiting on
  anything else, for a host's own escape.
- **The server replaces its connection only when SAP lost its session** (or a new credential
  arrives): the next call gets a new connection instance, the spent one is logged off; the call
  that met the loss gets the connection's error as it is.
- **`IAuthBrokerFactoryConfig.loginTimeoutStated?`** names the bound in D10's sentence (the
  launcher passes the form the user set, `` `--login-timeout=300` ``); absent, the sentence names
  `` `loginTimeoutMs: <ms>` ``, never a value the CLI would refuse.
- **`IDestinations.getProvider(destination, { signal })`** takes the request's signal.
  `settle({ signal })` takes **no deadline** (18.x: `settle(deadlineMs)`): it closes the gate,
  disposes the logins, waits for the counted calls as long as they take, and hands the signal to
  the broker's `flush`; `SettleReport` is `{ notStored }` — `abandoned` is gone.
  `SettleReport.notStored` lines are `"<destination>": <reason>`, the reason auth-errors'
  classification. `beginShutdown()` (new) refuses every later interactive login with the shutdown
  sentence while the gate stays open for running tools.
- **`inspectionOnlyDestinations()` is gone**: `new StdioServer(registry, undefined)` is
  inspection-only, and a tool call answers lib's `ServerRefusal('inspection_only')`
  (`@mcp-abap-adt/lib/auth`).
- **The closed provider gate answers auth-errors' `interactive-login` `aborted`**, minted, in place
  of `{ reason: 'the server is shutting down' }`.
- **`describeAuthError` is gone; read a failure with `failureOf(thrown)`** from
  `@mcp-abap-adt/lib/auth`: structural (no `instanceof`, no `message`, no `name`), total, it answers
  a `ReadFailure` (`error`, `kind?`, `message`, `hint?`, …) for a chain failure
  (`AuthProviderFailure`, connection's `AuthRefusedError`) or a `ServerRefusal`, else `undefined`.
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
- **`EmbeddableMcpServer` takes `freshConnection?: () => Promise<IAbapConnection>`.** Some operations need an ABAP session of their own: `CreatePackage`
  (high and low) and `LockPackage` over RFC, `DeletePackage` with `force_new_connection`, and a
  debug session's own connections. On an injected connection, these now take that session from
  your factory, and from nowhere else. 18.x rebuilt one from the injected connection's
  `getConfig()` / `config`.
  - **Without the factory, these operations are refused** with `fresh_connection_unavailable`
    ("This operation needs an ABAP session of its own; the connection was given by the host, which
    supplied no fresh-connection factory (`freshConnection`)"). Nothing is sent. A connection set
    through `setAbapConnectionOverride` gets the same refusal.
  - **Once your factory returns a connection, it is the server's.** The server calls `connect()` on
    it, holds it for the operation (or under the package lock's handle until the unlock), and closes
    it with `disconnect()`. Build the connection with its own credential.
  - **The factory receives no signal.** It is called with no argument: a fresh connection is made
    inside a started tool, which runs to its end. A package lock's connection and a debug session's
    connection outlive the request that opened them.
  - **The latest injection of a connection object decides.** Injecting the same object again
    without `freshConnection` clears the earlier factory.
- **`credentialFromSapConfig` refuses instead of guessing** (`setSapConfigOverride`,
  `getManagedConnection`, `@mcp-abap-adt/lib/auth`):
  - an `authType` other than `basic`, `jwt`, `saml` or `certificate`, or none at all, is refused
    with "The SapConfig `authType` must be basic, jwt, saml or certificate". 18.x built a basic
    credential with an empty user;
  - `snc` is refused with "The SapConfig `authType` snc is served through a destination of
    mcp-abap-adt (stdio)";
  - `kerberos` stays refused;
  - a missing or empty `username`, `password`, `jwtToken` or `sessionCookies` is refused with "The
    SapConfig for <authType> authentication has no `<field>`". 18.x used `''`.

  A refusal names the field, never a value.
- **`ConnectionContext` is the instance's source** (`@mcp-abap-adt/lib/embeddable`):
  `{ kind: 'built', source: ConnectionSource } | { kind: 'injected', connection }`, plus
  `sessionId` and `metadata?`. A `ConnectionSource` answers `resolve(signal)` with `{ settings,
  credential, systemContext? }`. `BaseMcpServer.setConnectionContext(context)` takes it (18.x:
  `(destination, destinations)`); `setConnectionContextFromHeaders` is gone — pass
  `headerContext(headers)` from `@mcp-abap-adt/lib/http-transport`; `getConnection(signal)` takes
  the request's signal. A built connection is kept while the source answers the same credential
  object. `EmbeddableMcpServer`'s `connection` is an injected source, used as given.
- **`IDestinations`, `IAuthBrokerFactory` and `SettleReport` left `@mcp-abap-adt/lib/auth`** for
  `@mcp-abap-adt/core/auth`, beside core's `destinationSource(destination, destinations)`.
  `DestinationSystemContext` stays in `@mcp-abap-adt/lib/auth`.
- **`StreamableHttpServer` and `SseServer` moved** to `@mcp-abap-adt/http` and `@mcp-abap-adt/sse`
  (core no longer re-exports them) and lost their destinations argument:
  `new StreamableHttpServer(handlersRegistry, options)`, `new SseServer(handlersRegistry,
  options)`. Their `defaultDestination`, `allowDestinationHeader` and `readFailure` options are
  gone; a failed tool call is answered by `BaseMcpServer`'s `readFailure`.
- **`@mcp-abap-adt/lib/http-transport`** holds what both transports share: `headerSource`,
  `headerContext`, `refuseDestinationHeader`, `hasHeaderCredentials`, `requestFailureAnswer`,
  `installTransportShutdown`, `CREDENTIALS_REQUIRED_WORDS`, `DESTINATIONS_ONLY_STDIO_WORDS`,
  besides the DNS-rebinding protection and the TLS listener. `destinationFromHeader`,
  `FirstConnectLock`, `destinationFailureAnswer` and `DestinationHeaderError` are gone.
- **The tools a binary serves are its `ToolSet`** (`@mcp-abap-adt/lib/tool-set`): the groups for
  an exposition, and the exposition's row, default and help. `fullToolSet` is the full binaries'
  (readonly, high, low, debug, search, system); `compactToolSetOf({ readOnly, modify })` composes
  the compact halves' entry builders (`compactReadOnlyEntries`, `compactModifyEntries`) — the
  compact debugger verbs moved into lib with it; `registryOf(toolSet, exposition)` builds the
  registry. core's, http's and sse's `main({ toolSet, program, version })` take nothing else of the
  tools: `LauncherOptions`' `extraGroups`, `exposition`, `helpExposition` and `includeSearch` are
  gone, and `main()` without options is a type error; a second, optional argument gives the
  process's edges (`processEdges()` of `@mcp-abap-adt/lib/config` by default). A `ToolSet`'s
  `expositionHelp(transport)`, `expositionExamples(program)` and `exposition(read, argv,
  transport)` take the binary's transport (`ServedTransport`: `stdio` / `http` / `sse`). Each binary's table is a function of the set
  (`coreParameters(toolSet)`, `httpParameters(toolSet)`, `sseParameters(toolSet)`; the constants are
  the full set's), and `readCoreConfig` / `readHttpConfig` / `readSseConfig` take the set as a
  fourth argument (default `fullToolSet`). `@mcp-abap-adt/compact` no longer exports
  `CompactHandlersGroup` or `compactExtraGroups`: it exports `compactToolSet` and `main`.
  `registryForExposition(exposition)` (`@mcp-abap-adt/lib/handlers`) stays, building the full
  set's registry; its `extraGroups` / `includeSearch` options are gone (a command passes a
  `ToolSet`).
- **An exposition the set does not serve stops the start in its words** (`--exposition=high,low`,
  `compact` on a full binary): `[MCP] Invalid exposition: …`, exit 1 — 18.x failed the launcher with
  no words.
- **Each binary reads its own parameter table** (`@mcp-abap-adt/lib/config` keeps the machinery
  and the shared rows). `ServerConfigManager`, `ArgumentsParser` and `applyYamlConfigToArgs` are
  gone: read a binary's configuration with `readCoreConfig(argv, env, yaml)` / `CORE_PARAMETERS`
  (`@mcp-abap-adt/core`), `readHttpConfig` / `HTTP_PARAMETERS` (`@mcp-abap-adt/http`),
  `readSseConfig` / `SSE_PARAMETERS` (`@mcp-abap-adt/sse`). lib's `readParameters(table, argv,
  env, yaml)`, `parameterSource`, `generateHelp(table, …)`, `readStartupConfig(table, …)` and the
  shared rows (`CONF_ROW`, `EXPOSITION_ROW`, `SYSTEM_TYPE_ROW`, `STATE_IDLE_ROW`, `tlsRows`) build
  a table of your own; a refusal is a `ParameterRefusal` carrying its `words`.
  `loadYamlConfig(table, path)`, `validateYamlConfig(table, config)`,
  `generateYamlConfigTemplate(table)` and `generateConfigTemplateIfNeeded(table, path)` take the
  table; `parseConfigArg(argv?)` reads `--conf` / `--config`.
- **`IServerConfig` holds the shared fields only** (`exposition`, `configFile`, `systemType`,
  `systemTypeSource`, `stateIdleMinutes`): the destination fields are core's `CoreConfig`, the
  listener fields http's `HttpConfig` and sse's `SseConfig`. `Transport`, `IV2ServerConfig` and
  the legacy `transport`, `transportConfig`, `defaultMcpDestination`, `defaultDestination` and
  `logger` fields are gone.
- **Moved to `@mcp-abap-adt/core`:** `getPlatformPaths` (was also re-exported by
  `@mcp-abap-adt/lib/auth`), `resolveEnvFilePath`, `hydrateSystemContextFromEnvFile`,
  `ENV_FILE_CONTEXT_KEYS`.
- **Gone from `@mcp-abap-adt/lib/utils`:** `showHelp`, `parseTransportConfig`, `TransportConfig`
  (and `ServerOptions.transportConfig`), `getArgValue`, `hasFlag`, `parseBoolean`,
  `resolvePortOption`, `resolveBooleanOption`, `resolveListOption` — the 18.x help and transport
  parsing nothing read.
