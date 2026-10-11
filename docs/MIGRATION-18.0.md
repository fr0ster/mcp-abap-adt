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

## Every binary: `--transport` is gone, and each reads only its own parameters

- **Remove `--transport`** (and `MCP_TRANSPORT`, and the YAML key `transport`) from every command
  line, client configuration, service unit and config file: a binary is its transport. Any value —
  `--transport=stdio` included — stops the start with the binary's sentence, e.g. "`--transport`
  is gone: `mcp-abap-adt` serves stdio; for Streamable HTTP run `mcp-abap-adt-http`, for SSE
  `mcp-abap-adt-sse` (compact: `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`)". For
  Streamable HTTP run `mcp-abap-adt-http`, for SSE `mcp-abap-adt-sse`.
- **An option of another binary stops the start**, in any form (CLI, environment, YAML), naming the
  binary that serves it — 17.x ignored it. Per binary:

  | Binary | Refused, with the words |
  |---|---|
  | `mcp-abap-adt` | the SSE options (`--sse-host`, `--sse-port`, `--sse-path`, `--post-path`, `--sse-allowed-*`, `--sse-enable-dns-protection`, `MCP_SSE_*`, YAML `sse`): "SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)"; the Streamable HTTP ones (`--host`, `--port`, `--path`, `--http-*`, `MCP_HTTP_*`, YAML `http`): "Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)"; `--tls-*` / `MCP_TLS_*`: "TLS is an option of `mcp-abap-adt-http` and `mcp-abap-adt-sse`"; `--allow-destination-header` (gone) |
  | `mcp-abap-adt-http` | the destination and login options (`--mcp`, `--env`, `--env-path`, `--auth-broker-path`, `--allow-destination-header`, `--unsafe`, `--connection-type`, `--browser*`, `--login-timeout`, `--renewal`, `--auth-debug`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_BROWSER*`, `MCP_RENEWAL`, `MCP_LOGIN_TIMEOUT`, their YAML keys): "destinations and logins are served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers"; the SSE options, with the SSE words |
  | `mcp-abap-adt-sse` | the destination and login options, as for http; the Streamable HTTP options — `--host`, `--port` and `--path` included — with the Streamable HTTP words |

  Each refusal names the form you used first: `--sse-port: SSE is served by …`.
- **Each binary's `--help`, `--conf` template and YAML validation come from its own table.** A
  config file written for 17.x that mixes `transport`, `mcp`, `http:` and `sse:` keys is refused by
  every binary: keep one file per binary, or regenerate it with `--conf=<new file>` (the binary
  writes its template there). The `http:` / `sse:` keys keep their 17.x shape (`http.port`,
  `sse.tls.cert`, …).
- **Values are checked in every form**: a port outside 1-65535, a flag that is not `true` /
  `false`, is refused at start (17.x fell back to the default for `--http-port` / `--sse-port`).
  TLS needs `--tls-cert` and `--tls-key` together (17.x served plain HTTP when one was missing).
- `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES` / `state-idle-minutes`, `--exposition` (with
  `debug`), `--system-type` and `--conf` are in every binary's table, unchanged.

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
- **The debugger works as in 17.2**: `--exposition=...,debug`, the `state_handle` routes a call back
  to the pooled instance that holds the state, the idle bound is `--state-idle-minutes`. Each
  request's own headers give its credential, also on a pooled instance. The debugger's ids come from
  `x-sap-debug-terminal-id` / `x-sap-debug-ide-id`, then `SAP_DEBUG_TERMINAL_ID` /
  `SAP_DEBUG_IDE_ID` of the environment; a destination's `.env` (and its `SAP_DEBUG_*`) is read only
  by `mcp-abap-adt` (stdio).

## SSE users

- **Install `@mcp-abap-adt/sse` and run `mcp-abap-adt-sse`**, without `--transport` (see above).
  The SSE options keep their names: `--sse-host` / `MCP_SSE_HOST`,
  `--sse-port` / `MCP_SSE_PORT`, `--sse-path`, `--post-path`, `--sse-allowed-hosts`,
  `--sse-allowed-origins`, `--sse-enable-dns-protection` (and their `MCP_SSE_*`), `--tls-*`
  (`MCP_TLS_*`), `--system-type`, `--exposition`, `--state-idle-minutes`, `--conf`. **`--host`
  and `--port` no longer apply to SSE** (17.x: they beat the SSE ones): they are Streamable HTTP's
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
- **The debugger works as in 17.2**: the debug session lives in the connection's instance until the
  connection closes, its stop tool runs or the idle bound ends it. Its ids come from the opening
  `GET`'s `x-sap-debug-*` headers, then `SAP_DEBUG_*` of the environment; a destination's `.env` is
  read only by `mcp-abap-adt` (stdio).

## compact users

### Over stdio

### Over Streamable HTTP

### Over SSE

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
- **`ConnectionContext` is the instance's source** (`@mcp-abap-adt/lib/embeddable`):
  `{ kind: 'built', source: ConnectionSource } | { kind: 'injected', connection }`, plus
  `sessionId` and `metadata?`. A `ConnectionSource` answers `resolve(signal)` with `{ settings,
  credential, systemContext? }`. `BaseMcpServer.setConnectionContext(context)` takes it (17.x:
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
- **`registryForExposition(exposition, { extraGroups?, includeSearch? })`**
  (`@mcp-abap-adt/lib/handlers`) builds the tool list every binary serves.
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
  `resolvePortOption`, `resolveBooleanOption`, `resolveListOption` — the 17.x help and transport
  parsing nothing read.
