# Server on auth-broker 4 — design

**Answers to:** `docs/superpowers/2026-10-03-broker4-migration-goal.md`. Every
section below is checked against the goal's *Holds throughout*; where one
touches an invariant, it names it (H0–H8).

**Status:** draft, for review in PR #269.

## 1. Dependencies

Root `package.json` (`@mcp-abap-adt/lib`):

| Package | Today | After |
|---|---|---|
| `@mcp-abap-adt/auth-broker` | ^3.0.4 | ^4.0.0 |
| `@mcp-abap-adt/auth-providers` | ^4.2.1 | ^5.2.1 |
| `@mcp-abap-adt/auth-stores` | ^1.2.4 | ^3.2.0 |
| `@mcp-abap-adt/connection` | ^9.4.2 | ^10.0.3 |
| `@mcp-abap-adt/interfaces-auth` | ^2.1.0 | ^3.0.0 |
| `@mcp-abap-adt/interfaces-auth-broker` | — | ^1.1.0 (new) |
| `@mcp-abap-adt/interfaces-auth-sap` | ^1.0.1 | ^2.0.0 |

`server/package.json` drops `@mcp-abap-adt/auth-broker` (it held a type the
server no longer names; it takes `AuthBrokerFactory` from `lib/auth`).
`sap-rfc-lite` stays an optional dependency. Every range resolves on the
registry today; the lockfile has no `"link": true` outside the workspace.

## 2. Building a connection

`src/lib/connectionFactory.ts` is the one place a connector is built (H0).

```ts
createAbapConnection(
  settings: SapConfig,          // url, client, authType, connectionType — no secret read
  credential: IAuthProvider,
  logger?: ILogger | null,
  sessionId?: string,
): IAbapConnection
```

- **The connector** is chosen by `resolveSystemKind(settings)`, unchanged:
  `SAP_SYSTEM_TYPE` / `--system-type` wins; absent, `jwt` means cloud. This is
  the system kind, not the credential — a stated default with an override, as
  today, not an inference about authentication (H1 is about auth type and
  grant). Changing it would re-route live deployments.
- **The transport**: cloud → `CloudHttpTransport`; on-premise with
  `connectionType: 'rfc'` → `RfcTransport(rfcConversationFrom(settings), …)`;
  else `OnPremHttpTransport(() => ({}), …)`. The `transportMaterial` thunk goes:
  in connection 10 TLS material arrives through the logon, not through
  `agentOptions`.
- **The credential is used as given.** The factory never reads
  `settings.authType` to choose or build a credential. The HTTP wire log
  wrapper (`DEBUG_HTTP_WIRE`) and the RFC wire options stay as they are.
- **A sibling connection** (a fresh ABAP session, `packageSessions.ts`) is
  opened from the same settings and the **same credential object**: the
  factory records, per connection it builds (a `WeakMap`), how to open
  another like it, and `openFreshConnection(connection, logger)` uses that
  record. A connection the factory did not build (one an embedder injected)
  falls back to its `getConfig()` through the `SapConfig` source below, as
  today.

### Provider sources (H0)

Exactly three, each its own function, none inside the connector construction:

1. **A destination** — `await factory.getProvider(destination)`: the
   broker's `getProvider`, counted (section 3).
2. **Request headers** — `credentialFromHeaders(headers)` (section 4):
   `x-sap-jwt-token` → `TokenAuthProvider.fixed(token)`;
   `x-sap-login` + `x-sap-password` → `new BasicAuthProvider(user, password)`.
3. **A caller's `SapConfig`** — `credentialFromSapConfig(config)`, for the
   exported `setSapConfigOverride` / `getConfig()` path and the fallback above:
   the per-auth-type switch `onPremCredential` holds today, moved here and
   kept as it is — `basic`, `jwt` (`TokenAuthProvider.fixed`), `saml`
   (`SamlAuthProvider`), `certificate` (`CertificateAuthProvider` +
   `FileCertificateMaterialLoader`), `kerberos` (refused) — imported from
   `auth-providers` 5. Unchanged behaviour, including certificates (goal:
   *Not in this release*).

A test pins the list: `createAbapConnection` is called only with a credential
from one of these three.

### `connection_config` on `DeletePackage` — removed

`DeletePackage` takes a `connection_config` argument: a whole `SapConfig` —
URL and credentials — from the tool call, i.e. from the model. It is a fourth
provider source, and one that lets a tool call aim the server at any system
with any credential. With the sibling opener above, a fresh session needs no
config from the caller: the argument is removed from the schema and the
handler. `force_new_connection` stays.

## 3. Destinations: `AuthBrokerFactory`

`src/lib/auth/brokerFactory.ts`, exported from `@mcp-abap-adt/lib/auth`.
Rewritten; the three "variants" and the session seeding go.

```ts
class AuthBrokerFactory {
  constructor(config: IAuthBrokerFactoryConfig);
  /** The destination the process serves when a request names none. */
  readonly defaultDestination: string | undefined;
  /** One broker per destination, built on first use, then cached. */
  getBroker(destination: string): Promise<AuthBroker>;
  /** The connector's settings: URL, client, auth type, connection type — no secret. */
  settingsFor(destination: string): Promise<SapConfig>;
  /** The destination's provider, counted while it works (see below). */
  getProvider(destination: string): Promise<IAuthProvider>;
  /**
   * Closes the gate on provider calls, waits for the ones in progress — a
   * login, a refresh — up to `deadlineMs`, then flush()es every broker built.
   */
  settle(deadlineMs: number): Promise<SettleReport>;
}
```

**Work in progress is counted at the provider.** `getProvider` hands out the
broker's provider behind a thin wrapper that forwards each of the four calls
(`prepare`, `establish`, `authorize`, `rejected`) unchanged and counts the
ones not yet answered. A renewal happens inside one of those calls and its
`onTokens` write is submitted before the call answers (broker 4), so once the
count is zero every renewal has reached the broker's writer, and `flush()`
covers it. The wrapper changes nothing a call returns or throws, and it is the
same object for every connection of the destination (section 2's sibling rule
holds). `settle` answers `{ abandoned: number }` — the calls still running at
the deadline — besides `flush()`'s outcome.

**A gate, closed before the wait.** A count of zero does not mean no renewal
can start: an ADT request already on the wire may come back `401` after the
wait has begun, and its `rejected()` would refresh after the flush. So
`settle` first closes the gate, then waits. Behind a closed gate the wrapper
starts no new call: each of the four answers `{ ok: false, refusal: {
reason: 'the server is shutting down' } }` at once, without reaching the
broker's provider — Oops, never a throw, as the `IAuthProvider` contract
requires. No renewal, so nothing new to store; the request fails with that
refusal. A call that passed the gate before it closed runs to its answer and
is waited for. Ordering: gate closed → wait for zero → `flush()`; nothing
opens the gate again.

`IAuthBrokerFactoryConfig`: `envFilePath?`, `mcpDestination?`,
`authBrokerPath?`, `unsafe`, `browser`, `browserAuthPort?`, `logger?`.
Removed: `initializeDefaultBroker`, `getOrCreateAuthBroker` (which returned
`undefined` on any failure and swallowed the reason), `getDefaultBroker`,
`clear`. A failure now reaches the caller as the error it is
(`DestinationConfigError`, a store error), and the transports report it.

### Where a destination lives

| Mode | Destination name | Means (`serviceKeyStore`) | Secret (`sessionStore`) |
|---|---|---|---|
| `--env` / `--env-path` / `MCP_ENV_PATH` / YAML `env` / `env-path` | `default` | `EnvDestinationStore.forFile(path)` | `EnvFileSessionStore(path)` |
| named, ABAP key or none (`--mcp=X`, `x-mcp-destination: X`) | `X` | `new EnvDestinationStore(sessionsDir, { fallback: new AbapServiceKeyStore(keysDir, { grantType: 'authorization_code' }) })` | `--unsafe`: `AbapSessionStore(sessionsDir)`; else `SafeAbapSessionStore()` |
| named, XSUAA key | `X` | `new EnvDestinationStore(sessionsDir, { variables: XSUAA_DESTINATION_VARS, fallback: new XsuaaServiceKeyStore(keysDir, { grantType: 'authorization_code' }) })` | `--unsafe`: `XsuaaSessionStore(sessionsDir)`; else `SafeXsuaaSessionStore()` |

`keysDir` / `sessionsDir` come from `getPlatformPaths` as today
(`--auth-broker-path`, `AUTH_BROKER_PATH`, the platform default) — never the
working directory: nothing is looked up where the process happens to start
(decided 2026-10-03), so the working directory leaves `getPlatformPaths`' list
and the working-directory `.env` fallback goes. Decisions in the table:

- **The key's shape picks which store reads it, never the auth type or grant
  (H1).** `keysDir/X.json` with `url` + `clientid` + `clientsecret` at the
  root is an XSUAA key; anything else — a nested `uaa`, or no key — is read as
  ABAP. The grant of a key is `authorization_code`, said to the store (goal).
- **A named destination reads `sessionsDir/X.env` first, field by field, then
  the key.** That is what lets a named destination be `basic` or `snc` with no
  key at all (an `.env` written by `mcp-auth generate-env`), and what gives an
  XSUAA key its system URL: `XSUAA_MCP_URL` in `sessionsDir/X.env`
  (`XSUAA_DESTINATION_VARS`).
- **An `--env` file is read and written as the user's own store.** Its means
  are read through `EnvDestinationStore.forFile`; its secret through
  `EnvFileSessionStore`, which (auth-stores 3) writes a renewed token, expiry
  and refresh token back into the same file and leaves every other line as it
  is. Today the server never writes that file. It now does, whatever
  `--unsafe` says: a `jwt` / `none` file must be read from it, a refresh
  token renewed must land somewhere the next start finds, and the file is
  the storage the user named. `--unsafe` keeps its meaning for the named
  destinations — whether `sessionsDir` is written.
- **The safe default stays in memory.** A named destination without
  `--unsafe` logs in once per process, as today; a `jwt` / `none` named
  destination needs `--unsafe` (its token is in `sessionsDir/X.env`).
- **No seeding, no means written.** The broker writes the secret alone; the
  server writes nothing (goal; broker 4).
- **Read once per process.** A destination's broker, provider and settings
  are built from its files once and cached for the life of the process. A
  change made to its `.env` from outside — a new password, a token handed
  over again — takes effect on restart (decided 2026-10-03). Nothing watches
  the files.

### Authentication handlers

The factory's one decision about authentication: which handler serves the
destination. `src/lib/auth/handlers/` holds one handler per authentication
the server supports, and the factory keeps them in a map keyed by
`authType` and, for `jwt`, `grantType`:

```ts
interface AuthenticationHandler {
  readonly authType: 'basic' | 'jwt' | 'snc';
  readonly grantType?: DestinationGrant;
  /** The broker options this authentication needs — nothing else. */
  brokerOptions(context: HandlerContext): Partial<AuthBrokerConfig>;
  /** Refuses settings this authentication cannot use; most accept all. */
  checkSettings?(settings: SapConfig): void;
}
```

| Handler | `brokerOptions` | `checkSettings` |
|---|---|---|
| `basic` | none | none |
| `snc` | none | `connectionType` must be `rfc`, else refused naming `connection-type` |
| `jwt` / `authorization_code` | `authorization: () => oneLoginAtATime(browserCallbackStrategy({ browser, port }))` | none |
| `jwt` / `none` | none | none |

**Building a destination's broker.** The factory composes the destination's
stores (table above), reads `getConnectionConfig` from the key store, and
decides in three steps, each before anything is built:

1. **Is what it states well formed?** The stores answer `authType` and
   `grantType` as the strings the file holds, unchecked. The factory checks
   them against the vocabulary broker 4 accepts, held in code:
   `authType` one of `basic`, `jwt`, `saml`, `snc`; for `jwt` and `saml`,
   `grantType` one of the `DestinationGrant` names (a list typed
   `satisfies readonly DestinationGrant[]` and checked exhaustive against
   the type at compile time, so a contract change breaks the build). A field
   absent, `''`, or outside the vocabulary is a `DestinationConfigError`
   (auth-broker's own class: `destination`, `missingFields: ['authType']` or
   `['grantType']`) — the case section 8's `mcp-auth generate-env --grant`
   hint is for. The value itself is never quoted: an unknown string reaches
   no message (H4).
2. **Is there a handler for it?** Only now, with both names from the
   vocabulary, the handler is looked up. None → an
   `UnsupportedAuthenticationError` (`destination`, `authType`, `grantType` —
   both vetted names): a well-formed authentication this server does not
   serve.
3. **Found → `new AuthBroker({ serviceKeyStore, sessionStore,
...handler.brokerOptions(context) }, brokerLogger)`, cached for the
   destination with its handler. `settingsFor` calls `handler.checkSettings`.

No broker, no provider and no login exists for a destination that fails step
1 or 2.

This runs where a session's server is set up (section 4): once under stdio,
per SSE session, per HTTP request — the first request to a destination
builds its broker, a later one finds it cached. A destination with no handler
fails that request; other sessions are untouched.

- **No implicit defaults (H2):** a broker gets exactly its handler's options.
  `context` carries `browser` (`--browser` / `MCP_BROWSER` / YAML `browser`,
  default `system`), `browserAuthPort` (default the library's `61001`;
  today's random 30000–39999 port in `server/src/AuthBrokerConfig.ts` goes —
  a random port cannot be registered as a redirect URI) and the process's
  login lock.
- **One interactive login at a time, across destinations.** Every
  strategy's callback listens on the same port, so two first logins — `X`
  and `Y` in two sessions — would race for it and one would fail on a busy
  port. `oneLoginAtATime` runs `authorize()` under the one process-wide
  lock; a second login waits for the first to settle. A settled login has
  released the port (auth-providers' callback scope settles only once the
  socket is free), so the next one binds it. The per-destination lock of
  section 4 stays: it keeps one destination from starting two logins at all.
- No `provider` option: the token API is not used by the server.

### Adding an authentication later

The four are this server's choice (goal). When a system it must reach
authorizes another way, the change touches these places and no others:

- a new handler in `src/lib/auth/handlers/`: its key, the broker options its
  grant needs (`authorization`, `oidcAuthorization`, `deviceCodePresenter`,
  …) built from the parameter table (section 6) if the user must choose
  something, and `checkSettings` only if it limits the connection, as SNC
  does;
- the docs' table of supported authentications and the migration note;
- a test for the new row, and a live check on the system that needs it.

The connector construction and the provider sources (section 2) do not change:
a new authentication is a new provider from the broker, not a new source.

### The URL a connector needs

`getProvider` does not require `serviceUrl`; a connector does. Before the
first connect, `factory.settingsFor(destination)` reads `getConnectionConfig`
and refuses a destination without `serviceUrl` with a `DestinationConfigError`
naming the key the user must set: `SAP_URL` (an ABAP destination or an
`--env` file) or `XSUAA_MCP_URL` (an XSUAA key). `settings` is
`{ url: serviceUrl, client: sapClient, authType, connectionType }` — no
password, no token (H4).

## 4. `BaseMcpServer` and the transports

- **`setConnectionContext(destination, destinations)`** — same name; the
  second argument is no longer an `AuthBroker` but the factory, through a
  small interface it implements (`IDestinations`: `settingsFor`,
  `getProvider`), so every provider a connection holds is the counted one.
  It reads `settingsFor(destination)` (section 3), then
  `credential = await destinations.getProvider(destination)`. No `getToken`, no
  `authType` branch, no `connectionParams` per auth type (H0, H1). The
  setup-time master-system lookup goes (decided 2026-10-03): under
  connection 10 its temporary connection is never connected, so it never ran;
  the master system and responsible are resolved per call on the connected
  connection (`withResolvedSystemContext`), and a cloud destination without
  `SAP_CLIENT` uses the system's default client.
- **Master system and responsible** (decided 2026-10-03): from configuration,
  or by a request in the cloud — nothing else. Configuration first (tool
  arguments, the request scope, the process configuration); a request
  (`systeminformation`) only when the connection is to a cloud system. The kind
  is stated, never guessed from the URL: a connection the factory built
  follows its recorded settings (`resolveSystemKind`: `--system-type` /
  `SAP_SYSTEM_TYPE`, else `jwt` is cloud); any other connection takes the
  server's own `systemType` option (an embedder's `EmbeddableMcpServer`), then
  `SAP_SYSTEM_TYPE`, else on-premise (controller ruling, for H6: an embedder
  states `systemType` per server without setting the environment).
  Order (decided 2026-10-03): the tool's arguments; the request's
  `x-sap-responsible` / `x-sap-master-system` headers; the destination's own
  `.env` (`SAP_RESPONSIBLE` / `SAP_MASTER_SYSTEM`, read per destination — an
  `--env` file or `sessions/<destination>.env` — not only through the process
  environment); the process environment (`SAP_RESPONSIBLE`, else
  `SAP_USERNAME`; `SAP_MASTER_SYSTEM`); for a cloud system, `systeminformation`.
  An operation that needs either and finds neither is refused by the server,
  naming the key to set — never sent to ADT with an empty value: ADT changes
  are not made without them.
- **Removed parameters are refused** (decided 2026-10-03): `--auth-broker`,
  `MCP_USE_AUTH_BROKER` and YAML `auth-broker` stop the start, saying they
  were removed in 16.0.0 and must be dropped from the configuration.
- **`setConnectionContextFromHeaders(headers)`** — `x-sap-url` (+
  `x-sap-client`) as settings, `credentialFromHeaders` as credential; the
  rest unchanged. `authType` in the settings is `jwt` or `basic` by which
  header came — the request states it.
- **`ConnectionContext`** gains `credential: IAuthProvider`;
  `connectionParams` keeps its name and type (`SapConfig`) and now holds the
  settings alone. `cloud-llm-hub` does not use it (H6).
- **`getConnection()`** — `createAbapConnection(connectionParams,
  credential, …)`, then `connect()`. The `createTokenRefresher` lookup goes.
  Stdio keeps its cached connection; HTTP and SSE keep a connection per
  request or session, now sharing the provider the broker caches per
  destination, so a token obtained once serves every request.
- **HTTP / SSE**: the factory itself in place of
  `getOrCreateAuthBroker(destination)`; a failure answers the request with the error's
  words (a `DestinationConfigError` names the destination and fields) instead
  of "Auth broker not initialized". The per-destination lock around the first
  connect stays: it serialises the first login.
- **stdio**: `--mcp=X` → destination `X`; an `--env` file → `default`; one
  broker either way (goal). Inspection-only mode (no
  destination) keeps its mock, minus the `getToken` stub.
- **Startup summary** (`launcher.ts`): read through `getConnectionConfig`
  and `getAuthorizationConfig` — no `(broker as any).sessionStore`. The mask
  stays as it is (H4, the stated exception).
- **Removed from `src/lib/utils.ts`**: `registerAuthBroker`, `getAuthBroker`
  (they served the refresher), and `getConnectionForSession` with the
  `sessionContext` branch of `getManagedConnection` (nothing calls
  `sessionContext.run`). Kept: `getManagedConnection`'s override paths —
  `setSapConfigOverride`, `setAbapConnectionOverride` — and `getConfig()`.

## 5. SNC

A destination stating `SAP_AUTH_TYPE=snc` and `SAP_SNC_PARTNERNAME` (with
`SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME` when set) gets
`SncLogonProvider` from the broker; its handler adds no broker option. No
user and no password: the user is whoever the Secure Login Client holds a
credential for, mapped to an ABAP user by its SNC name. SNC protects RFC, not
HTTP: the `snc` handler's `checkSettings` refuses a connection type other than
`rfc`, naming `connection-type`. The SNC library is
found by the provider (`SNC_LIB_64`, `SNC_LIB`, the Secure Login Client's
install path) — not by the server.

## 6. Parameters: CLI, env, YAML (H7)

One table in code (`src/lib/config/authParameters.ts`) lists each parameter's
names; the CLI parser, the env reader, the YAML loader, the template
`--config` generates and the help text are all read from it. Every parameter
has a CLI and a YAML form; the env forms are the ones that exist today, kept
for compatibility, and none is added (decided 2026-10-03: environment
variables, like `.env`, are for secrets and the session; YAML is
configuration). Precedence: CLI, then env, then YAML.

| Parameter | CLI | env | YAML |
|---|---|---|---|
| destination | `--mcp` | — | `mcp` |
| env file by name | `--env` | — | `env` |
| env file by path | `--env-path` | `MCP_ENV_PATH` | `env-path` |
| stores' base directory | `--auth-broker-path` | `AUTH_BROKER_PATH` | `auth-broker-path` |
| write named sessions to disk | `--unsafe` | `MCP_UNSAFE` | `unsafe` |
| browser for a login | `--browser` (wired) | `MCP_BROWSER` (wired) | `browser` (new form) |
| login callback port | `--browser-auth-port` | `MCP_BROWSER_AUTH_PORT` | `browser-auth-port` (new form) |
| honour `x-mcp-destination` | `--allow-destination-header` | — | `allow-destination-header` (new form) |
| HTTP or RFC | `--connection-type` | `SAP_CONNECTION_TYPE` | `connection-type` (new form) |
| system kind | `--system-type` | `SAP_SYSTEM_TYPE` | `system-type` (new form) |

No new parameter — new YAML forms of existing ones. `--browser` today reaches
nothing (`ServerConfigManager` never sets it); it reaches the strategy.
`runtimeConfig.ts`'s unused `buildRuntimeConfig` goes, and so does the
exported `ConfigLoader`, which no caller uses and which merges YAML its own
way, against this table.

**No secret or session value in YAML.** The YAML validator refuses any key,
at any depth, whose name says it carries one — it contains `password`,
`passphrase`, `secret`, `token`, `cookie`, `refresh` or `credential`
(case-insensitive) — naming the key and never its value. They belong in the
destination's `.env` or the environment.

## 7. Shutdown (H5)

`server/src/shutdown.ts`, installed by the launcher only — the program, not
the library, so an embedder's process is never taken over:

- **Triggers:** `SIGTERM`, `SIGINT`, and — for stdio — the transport closing
  (stdin ends: the client went away).
- **Once:** the first trigger runs it; later ones wait for it.
- **What it does, in order:**
  1. stop taking work where it can be stopped: HTTP and SSE servers stop
     accepting connections (`close()`). That does not stop requests already
     running, and under stdio a signal is not the end of input — the gate in
     step 2 is what holds;
  2. `await factory.settle(30_000)` — closes the provider gate first, so no
     login or renewal starts from here (a request answered `401` now gets
     the shutdown refusal instead of a refresh), then waits for the calls
     already running, so a token they obtain is submitted before the flush.
     30 s is the callback strategy's login timeout: a login waiting on a
     browser ends by then either way;
  3. exit `0` when everything is stored and nothing was abandoned. Otherwise
     one stderr line per fact — `[MCP] Session secrets not stored: "X":
     StorageError` (the `AggregateError`'s entries: destination and error
     class only — broker 4), `[MCP] 1 authorization still running at
     shutdown, its result is lost` — and exit `1`. Nothing on stdout (H3).
- A request that is not a provider call (a tool's ADT request in flight) is
  not waited for: it may be cut, as today.

## 8. Errors and messages (H1, H4)

- A `DestinationConfigError` reaches the user as
  `Destination "X" lacks: <fields>` plus, for the fields the server knows a
  remedy for, one fixed hint: `grantType` → regenerate with
  `mcp-auth generate-env --grant …` (from `@mcp-abap-adt/auth-broker-cli`);
  `serviceUrl` → `SAP_URL` / `XSUAA_MCP_URL`; `connection-type` → SNC needs
  `--connection-type=rfc`. Field names only; no value.
- An `IAuthProvider` refusal surfaces through the connector's
  `AuthRefusedError`, whose wording is fixed (auth-providers 5).

## 9. Docs

Updated, each for what the change touches:

- `README.md` — the four supported authentications, the `.env` keys
  (`SAP_AUTH_TYPE`, `SAP_GRANT_TYPE`, `SAP_SNC_*`), `mcp-auth` from
  `@mcp-abap-adt/auth-broker-cli`.
- `docs/user-guide/AUTHENTICATION.md`, `CLI_OPTIONS.md`,
  `CLIENT_CONFIGURATION.md`, `TERMINOLOGY.md` (an XSUAA key, `XSUAA_MCP_URL`).
- `docs/configuration/YAML_CONFIG.md` — the new YAML keys.
- `docs/installation/INSTALLATION.md`, `README.md`, `CLINE_CONFIGURATION.md`,
  `examples/SERVICE_KEY_SETUP.md` — the CLI package; `--browser-auth-port`
  default.
- `docs/installation/RFC_SETUP.md` — SNC over RFC; `sap-rfc-lite` is an
  optional dependency.
- `docs/architecture/*`, `src/lib/auth/brokerFactory/UNIFIED_BROKER_LOGIC.md`,
  `src/embeddable/docs/*` — the getProvider path; stale `getToken` text goes.
- In-code help (`utils.ts`, `launcher.ts`, `ServerConfigManager.ts`): the
  stale `npm install -g @mcp-abap-adt/auth-broker` and the 5000/4000/4001 port
  defaults.
- **`docs/MIGRATION-16.0.md`** — what a user on 15.x must do: a `jwt` `.env`
  states `SAP_GRANT_TYPE` (regenerate with `mcp-auth generate-env --grant`);
  install `mcp-auth` from `@mcp-abap-adt/auth-broker-cli`; an XSUAA key needs
  `XSUAA_MCP_URL` in `sessions/<dest>.env`; an `--env` file is now written
  back with a renewed token; `DeletePackage` lost `connection_config`; the
  browser callback port is `61001` unless set; a changed `.env` takes effect
  on restart; an invalid port or enum value is now refused at startup
  instead of ignored; a YAML key that looks like a secret is refused; for
  embedders,
  `AuthBrokerFactory`'s new methods and `ConnectionContext.credential`.
- `CHANGELOG.md`.

## 10. Versions and release

All five packages move together, as they do today (`lib`, `core`, `compact`,
`compact-readonly`, `compact-modify`): **16.0.0** — `lib` changes public
types and exports (`AuthBrokerFactory`, `BaseMcpServer`, `ConnectionContext`,
`registerAuthBroker` / `getAuthBroker` gone), and a `jwt` `.env` without a
grant stops working. One release with #264, #266, #267, #268. Before tagging:
the bin smoke test against the packed tarballs (repository rule: a release is
verified when an installed copy runs).

## 11. Tests

Unit tests, no live system, each named for the invariant it protects; each is
proven load-bearing by breaking the rule and watching it fail.

| Test | Protects |
|---|---|
| `connectionFactory`: the credential object given is the one the connector holds, for every system kind and transport; no `authType` read | H0 |
| provider sources: `createAbapConnection` is reached only from the three sources (a spy over the call sites) | H0 |
| sibling connection reuses the credential object | H0 |
| `AuthBrokerFactory`, temp directories: each mode of the table builds the stores it names — observed through `getConnectionConfig` / `getProvider`'s class, not by inspecting fields | H1, goal |
| a named destination's `.env` overrides its key field by field; an XSUAA key without `XSUAA_MCP_URL` is refused naming it | goal |
| `--mcp=X` builds one broker (count constructor calls) | goal |
| each handler: the broker it builds gets exactly its `brokerOptions` (the `authorization_code` one: the browser strategy under the login lock; the others: none) | H2 |
| a `jwt` destination without `SAP_GRANT_TYPE`, with `''`, and with an unknown grant: `DestinationConfigError` naming `grantType`, the `mcp-auth` hint, the unknown string absent from the message | H1, H4 |
| `SAP_AUTH_TYPE` absent and unknown (a made-up string): `DestinationConfigError` naming `authType`, the string absent from the message | H1, H4 |
| a well-formed destination no handler serves (`saml` / `saml2_bearer`, `jwt` / `passcode`, `jwt` / `client_credentials`): `UnsupportedAuthenticationError` naming them; no broker constructed, no `getProvider` | goal |
| the grant list is exhaustive over `DestinationGrant` (a type-level check in `test:check`) | H1 |
| HTTP: a request whose destination has no handler fails; the next request, to one that has, succeeds | goal |
| `setConnectionContext` with a broker that has no `getToken` / `createTokenRefresher`: still connects | H0 |
| SNC on HTTP: refused naming `connection-type` | goal |
| parameter table: every row's CLI and YAML forms (and its env form, where one exists) yield the same config; precedence CLI > env > YAML; the generated template lists every row; no env form exists for `--mcp`, `--env`, `--allow-destination-header` | H7 |
| YAML holding a secret- or session-looking key (`password`, `sap-token`, nested `client_secret`, `Refresh_Token`): refused naming the key, the value absent from the message | H4, H7 |
| `--browser` reaches `browserCallbackStrategy` | goal |
| shutdown: a trigger settles once; a rejection prints the destinations and classes and exits `1`; nothing on stdout | H3, H5 |
| shutdown during a refresh held open by the test: the refresh answers, its token is in the session store, then the process exits `0`; with the refresh held past the deadline, exit `1` naming one abandoned call | H5 |
| an ADT request answered `401` after shutdown began: `rejected()` gets the shutdown refusal, the underlying provider is never called, nothing is written after the flush, exit `0` | H5 |
| behind the closed gate each of the four calls answers Oops with the fixed reason and throws nothing | H5 |
| two destinations' first logins at once: the second `authorize()` starts only after the first settles, and both bind the one port | goal |
| an `--env` file: a renewed token is written back, other lines untouched | H5 |
| `DeletePackage` schema has no `connection_config` | H0 |

Existing tests that pin the old wiring (`connectionAuthRouting.test.ts`,
`certKerberosConfig.test.ts`, the integration helpers that build
`AuthorizationCodeProvider` by hand) move to the new API.

## 12. Live checks (H8)

Run against real systems after implementation, before merge, with the built
server (`node server/dist/...` from the PR's worktree); each recorded in the
PR with platform and date, never a system id:

1. `basic` over HTTP, on premise — an `.env` file; a read tool answers.
2. `basic` over RFC, on premise — the same with `--connection-type=rfc`.
3. `jwt` / `authorization_code`, BTP ABAP environment — a service key,
   `--unsafe`; the stored token is replaced by an invalid one, a read tool
   answers after a `401` and the renewal, and `sessions/<dest>.env` holds the
   new token with `SAP_ISSUED_FOR` / `SAP_ISSUED_BY`.
4. `snc` over RFC, Windows with the Secure Login Client — run by the user on
   the machine that has it.

Before 3 opens a browser: ask which browser and profile, and wait.
