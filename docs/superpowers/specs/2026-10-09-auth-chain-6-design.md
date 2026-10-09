# The server on the 6.0.0 auth chain — design spec

Answers [`../2026-10-09-auth-chain-6-goal.md`](../2026-10-09-auth-chain-6-goal.md).
Every item of the goal's *Holds throughout* (H1–H7 below, in its order) binds
this spec; §16 says how each holds. Where the spec would have to depart from
one, the goal changes first. Every decision is marked **(D*n*)** where it is
made, with its reason; §17 lists the ones the user should confirm, with the
options and the recommendation the spec is written on.

File and line references are to this worktree at `d0fa6d5c` (the server's own
`src/…`, `server/src/…`) and to the published chain read from its repositories
at their release commits: auth-broker 5.0.1 / auth-broker-cli 3.0.1
(`5ec4e5f`), auth-providers 6.0.1 (`6ea3c5f`), auth-errors 2.2.0 (`40bd4a4`),
connection 14.0.1 (`6f6bb41`), auth-stores 4.0.0 (`2dbced7`), interfaces-auth
7.5.0.

## 0. Contents

1. Traceability: goal → sections
2. What the server does today
3. Versions and dependencies
4. The three credential sources
5. Cancellation
6. Renewal, session writes, shutdown
7. Failures: how they are read and what an MCP client sees
8. The browser
9. Debug output and logging
10. The configuration surface and every API change
11. Documentation and migration notes
12. Version and release
13. Tests
14. Live measurements
15. Overlap with the parallel debugger work
16. Holds throughout: how each holds
17. Decisions for the user

## 1. Traceability: goal → sections

| Goal item | Answered in |
|---|---|
| Success: failures reach the user as the chain made them | §7; D14–D17, D28 |
| Success: a connection derived from an injected one stays the consumer's | §4.3; D20–D22 |
| Success: a login ends when someone ends it — before any MCP request exists | §5.3; D6, D32 |
| Success: … cancellation follows the MCP client | §3.1, §5.2, §5.4; D4, D5, D7, D31, D32, D34 |
| Success: … closing a session cancels its waits | §5.5 |
| Success: … any bound is the server's, and visible | §5.7; D10 |
| Success: … nothing keeps waiting for a client that left | §5.1–§5.6, §6.4; D31–D33 |
| Success: … one waiter leaving ends only its own wait | §3.1, §5.1, §5.2, §5.6; D31, D32; §13.3 |
| Success: session writes are the server's stated choice | §6.2–§6.4; D12, D33 |
| Success: renewal is the server's stated choice | §6.1; D11 |
| Success: debug output is opt-in and safe | §9; D24, D25 |
| Success: what works today keeps working, or the migration note says what to do | §8, §11; D9, D19, D21, D30 |
| Success: measured on real systems before release | §14 |
| Open 1 — where the login bound lives | §5.7; D10 |
| Open 2 — how disconnect, cancellation and close reach the broker and the providers; what `LoginLock` becomes | §5; D4–D8, D13, D23, D31, D32 |
| Open 3 — renewal and `onWriteFailure` | §6; D11, D12 |
| Open 4 — what an MCP client sees per `kind` | §7.3, §7.4; D14–D17, D28 |
| Open 5 — the browser choice | §8; D9 |
| Open 6 — version, release, migration notes | §11, §12; D29 |

## 2. What the server does today

The facts the design changes, each checked against the file:

- **Dependencies.** `package.json` declares `auth-broker ^4.1.0`, `auth-providers ^5.4.0`,
  `auth-stores ^3.3.0`, `connection ^11.0.0`, `interfaces-auth ^3.2.0`,
  `interfaces-auth-broker ^1.2.0`, `interfaces-auth-sap ^2.0.0`; no `auth-errors`. The script
  `"auth": "npx sap-abap-auth auth"` (`package.json:116`) names the command connection 14 removed.
- **One `AuthBroker` per destination**, built on first use with the destination's own stores
  (`src/lib/auth/brokerFactory.ts:246-260`); its provider is cached by the factory for the whole
  process (`:184-198`), and so are its settings (`:114-125`).
- **Failures are read by class and by text.** `describeAuthError` decides with `instanceof
  DestinationConfigError` and `instanceof AuthRefusedError` and returns the latter's `message`
  (`src/lib/auth/errors.ts:97-118`). `notStoredOf` matches each `AggregateError` entry's message
  against the regular expression `ENTRY` (`brokerFactory.ts:51-68`). `errorClassOf` reads a
  constructor name through a regular expression (`errors.ts:55-61`).
- **No signal reaches any login.** `getProvider(destination)` is called without options
  (`brokerFactory.ts:189`); `flush()` without options (`:217`). The tool wrapper takes `args` only
  (`src/embeddable/BaseMcpServer.ts:257`), so the MCP SDK's request signal is never read.
- **Logins are serialized process-wide** by `LoginLock` (`src/lib/auth/loginLock.ts:16-44`),
  wrapped around the strategy in `handlers/jwtAuthorizationCode.ts:5-18`; a queued login cannot
  leave the queue.
- **First connects are serialized per destination** by `FirstConnectLock`
  (`server/src/destinationRequest.ts:68-96`), used by `StreamableHttpServer.ts:205-209` and
  `SseServer.ts:325-329`; a queued client cannot leave the queue. The HTTP `close` listener is
  installed only after setup (`StreamableHttpServer.ts:228-230`), the SSE one only after the MCP
  transport connects (`SseServer.ts:387-392`): a client that leaves during setup is not observed.
- **Unminted refusals.** The closed provider gate answers `{ reason: 'the server is shutting
  down' }` (`src/lib/auth/countedProvider.ts:24-27`); inspection-only mode answers `{ reason:
  INSPECTION_ONLY }` (`server/src/StdioServer.ts:51-67`). connection 12+ re-checks every outcome
  and turns either into `connection` `provider-threw`, "the credential provider failed"
  (connection `docs/MIGRATION-12.0.md`, *The connection re-checks what a provider answers*).
- **A fresh connection is rebuilt from an injected connection's configuration.**
  `openFreshConnection` (`src/lib/packageSessions.ts:40-61`) uses the factory's record when the
  server built the connection, else `getConfig()` / `config` of the connection and
  `credentialFromSapConfig(settings)` (`:45-47`, `:55`). Callers: `CreatePackage` high
  (`src/handlers/package/high/handleCreatePackage.ts:134`) and low
  (`…/low/handleCreatePackage.ts:160`) through `inOwnSessionOverRfc`, `LockPackage`
  (`…/low/handleLockPackage.ts:91`) through `connectionForPackageLock`, and `DeletePackage` with
  `force_new_connection` (`…/low/handleDeletePackage.ts:93-108`), which on any failure logs the
  error's `message` and falls back to the caller's connection.
- **`credentialFromSapConfig` guesses.** An `authType` outside its cases — `snc` included — gets a
  `BasicAuthProvider` with `''` for what is missing (`src/lib/credentialSources.ts:53-58`); a `jwt`
  without a token gets `TokenAuthProvider.fixed('')` (`:43`).
- **Secrets in a log line.** The startup summary prints the password, the token and the refresh
  token through `maskSensitiveValue`, which keeps the first and last four characters of a value
  longer than 20 (`server/src/launcher.ts:451-466`, `src/lib/utils.ts:1764-1781`). SSE logs a
  failed POST's `message` and the whole error object (`SseServer.ts:436-439`); `closeQuietly`
  (`packageSessions.ts:74-78`) and `DeletePackage`'s fallback (`handleDeletePackage.ts:101-105`)
  log a `message`.
- **Debug from the environment.** The broker's logger is stderr when `DEBUG_AUTH_LOG=true`, else
  silent (`launcher.ts:50-51`); nothing sets `authDebug`.
- **Bounds.** No login bound of the server's own; the shutdown deadline `SHUTDOWN_DEADLINE_MS =
  30_000` is documented as "the callback strategy's login timeout" (`server/src/shutdown.ts:22-23`),
  a timeout auth-providers 6 no longer has. `docs/user-guide/AUTHENTICATION.md` says "The login
  waits up to 30 s".
- **The browser is a string** (`IAuthBrokerFactoryConfig.browser`,
  `src/lib/auth/IAuthBrokerFactoryConfig.ts:26`; `--browser` is a free `string` row,
  `src/lib/config/authParameters.ts:75-82`) handed to auth-providers 5's
  `browserCallbackStrategy({ browser, port })` (`launcher.ts:257`).
- **Regular expressions over untrusted input** in the files this change touches:
  `assertDestinationName` (`src/lib/auth/destinationName.ts:9`, `:21`, `:31` — the value of the
  `x-mcp-destination` header), the port parser (`authParameters.ts:195`), `return_error`'s
  `ENOTFOUND` extraction and `McpError` prefix strip over an error's message
  (`src/lib/utils.ts:249-250`, `:320-321`, `:366`).

What the chain does that matters here:

- **AuthRefusedError is not read by `readFailure`.** connection's `AuthRefusedError` carries the
  minted error in `refusal` (connection `src/connection/authErrors.ts:24-39`); auth-errors'
  `classify` reads a carrier's `error`, never `refusal` (auth-errors `src/classify.ts:113-127`), so
  `readFailure(authRefusedError)` answers `unknown`.
- **adt-clients drops the thrown value.** A request that throws without a response becomes
  `IAdtError { origin: 'connection', message: thrown.message }`, nothing else kept
  (`node_modules/@mcp-abap-adt/adt-clients/dist/utils/adtResponse.js:84-96`). Inside a handler an
  auth failure reaches the server as connection's words (`reason — hint`) and no `kind`.
- **A provider's moment waits on all its parties.** A login a moment starts is aborted only when
  every party live at its start, and every party attached while it runs, has aborted
  (auth-providers `src/providers/BaseTokenProvider.ts:415-440`; auth-errors README, *Shared
  attempts*). `getProvider(d, { signal })` attaches its signal as a party; a party is released only
  by its abort (broker README, *Cancellation*).
- **The MCP SDK aborts every in-flight handler's signal** on `notifications/cancelled` and when its
  transport closes (`@modelcontextprotocol/sdk` 1.32.0 `dist/cjs/shared/protocol.js:182`,
  `:266-270`).
- **The connection takes no signal** in any moment (connection 14 `src/connection/*`), and a request
  carries none (`IAbapRequestOptions` of interfaces-adt-connection 1: `url`, `method`, `timeout`,
  `data`, `params`, `headers`): cancellation reaches a provider's moment only through its parties.

**Measured on the published packages** (2026-10-09, Linux, Node 26; a scratch install of
connection 14.0.1, auth-providers 6.0.1, auth-broker 5.0.1, auth-stores 4.0.0, auth-errors 2.2.0 —
outside the repository; the scripts are not kept, each becomes a test in §13):

- **M1 — a cancelled request's mutation is resent after a renewal.** Two `POST`s on one
  `AdtOnPremConnector` against a local HTTP stand-in that answers `401` to the old token; the
  provider's `rejected()` waits on one shared "login"; the first request's signal is aborted while
  both wait; the login completes. Both requests are resent with the new token and both answer `200`
  — the cancelled one included. The path is `answerCredentialFailure` → `renewCredential` →
  `authorizedFrom` → `sendObserved` (connection `src/connection/AbstractAbapConnection.ts:1489-1521`),
  which reads no signal: the connection has none to read.
- **M2 — a gate in the provider stops that resend over HTTP** (superseded: it sees only provider calls, not an RFC conversation's own logon and open; the user chose the connection prerequisite of §3.1). The same run with a
  provider whose `authorize()` answers `interactive-login` `aborted` when the signal of the request
  it is called for — read from an `AsyncLocalStorage` the request entered — is aborted: the
  cancelled request rejects with `AuthRefusedError` (`interactive-login`) and is **not** resent;
  the other gets `200`. `authorize()` is asked per attempt, in the request's own async chain
  (`authorizedFrom` → `credentialHeaders` → `authorizeRequest`, `AbstractAbapConnection.ts:939-958`,
  `:1225-1239`), and each request renews through its own `rejected()` (`renewal.spent` is per
  request, `:1604-1625`).
- **M3 — a cancelled party keeps waiting in a moment.** A `ClientCredentialsProvider` with two
  attached signals and a token endpoint held open: after the first signal aborts, its `prepare()`
  stays pending until the endpoint answers (+700 ms), with the other's; a `Promise.race` of the
  same `prepare()` against the first signal settles at the abort (+200 ms). The moment's wait is
  collective by design (`BaseTokenProvider.ts:428-440`, `asMoment`).
- **M4 — two equal settings reads do not tie a provider to them.** With `EnvDestinationStore`: the
  file says A (`https://a.example`, `userA`) for the first `getConnectionConfig`, B for
  `getProvider`, A again for the second read. Both reads answer A; the provider presents
  `userB:pw-userB`. The next `getProvider` builds yet another provider. The broker exposes nothing
  that says which means a provider was built from (`bindingOf` binds token rows only, and `basic`
  binds nothing).
- **M5 — means and client can come from two states of the file.** A `jwt` /
  `client_credentials` destination in an `EnvDestinationStore` file, two local token endpoints
  (A's client answers `tokenA`, B's `tokenB`); the file changes from A to B right after the first
  `getConnectionConfig`. auth-stores 4.0.0 reads the file anew in each projection
  (`EnvDestinationStore.readFile` from `getConnectionConfig`, `getAuthorizationConfig` and
  `getClientCertificate`; `getServiceKey` calls the first two again; the key-file fallbacks reload
  their JSON per call through `loadKeyFile`), and broker 5.0.1 reads `means` and `client` as two
  reads (`AuthBroker.js` `storeReads`). The server connects to `https://a.example` and the provider presents **`Bearer tokenB`** — A's means
  and URL frozen with B's client.
- **M6 — `authorize()` itself waits on a renewal, and its late Ok sends a cancelled mutation** (a boundary the §3.1 contract names). A
  `ClientCredentialsProvider` whose token expires at once (`expires_in: 1`) on one
  `AdtOnPremConnector`; the token endpoint is held after `connect()`; R1 and R2 each `POST`, both
  reach `authorize()`, which waits on the one renewal (`BaseTokenProvider` `onAuthorize` →
  `tokensFor`). R1 is cancelled 200 ms in, after a gate's entry check had passed; the endpoint is
  released at 500 ms. **With a check on entry only:** R1 is sent with the new token and answers
  `200` at +505 ms. **With `authorize()` raced against R1's signal, the provider writing into a
  target of the gate's own that is replayed onto the connection's only if R1 is still live after
  the provider answered:** R1 settles `aborted` at +201 ms, R2 answers `200` at +505 ms, and only
  R2's `POST` reaches the system.
- **M7 — a piped stdin's EOF emits both `end` and `close`.** `printf 'x\n' | node -e …` with
  `data`, `end` and `close` listeners on `process.stdin` (Node 26.7.0) logs `end`, then `close`;
  `installShutdown` listens to both (`server/src/shutdown.ts:94-97`). An ordinary client leaving
  is two triggers.

## 3. Versions and dependencies

**(D1)** `@mcp-abap-adt/lib` (the root `package.json`):

| Dependency | 17.1.0 | 18.0.0 |
|---|---|---|
| `@mcp-abap-adt/auth-broker` | `^4.1.0` | `^5.0.1` |
| `@mcp-abap-adt/auth-providers` | `^5.4.0` | `^6.0.1` |
| `@mcp-abap-adt/auth-stores` | `^3.3.0` | `^4.0.0` |
| `@mcp-abap-adt/connection` | `^11.0.0` | `^14.1.0` — **a prerequisite** (§3.1) |
| `@mcp-abap-adt/interfaces-auth` | `^3.2.0` | `^7.5.0` |
| `@mcp-abap-adt/auth-errors` | — | `^2.2.0` (new: `readFailure`, `classify`, `isAuthProviderFailure`, `isMinted`, `isAuthProviderErrorKind`, `logFields`, `authError`, `AuthProviderFailure`) |
| `@mcp-abap-adt/interfaces-auth-broker` | `^1.2.0` | `^1.3.0` |
| `@mcp-abap-adt/interfaces-auth-sap` | `^2.0.0` | `^3.3.0` |
| `@mcp-abap-adt/interfaces-adt-connection` | `^1.0.1` | `^1.1.0` — **a prerequisite** (§3.1) |
| `@mcp-abap-adt/adt-clients`, `adt-strategies`, `interfaces-adt`, `interfaces-network`, `interfaces-utils` | unchanged | unchanged |

Reason: each chain range is the published release the goal names, and `connection` /
`interfaces-adt-connection` the prerequisite releases of §3.1, published before the server; one copy of `interfaces-auth` 7 and of
`auth-errors` 2 must resolve (`npm ls @mcp-abap-adt/interfaces-auth @mcp-abap-adt/auth-errors`
shows each once), since a failure of a second copy loses its diagnostics and a refusal of a second
copy is rebuilt.

**adt-clients, adt-strategies, interfaces-adt need nothing.** adt-clients 25.0.1 and adt-strategies
0.7.0 depend on `interfaces-adt ^12` and `interfaces-adt-connection ^1` (`npm view`), and
connection 14.0.1 on `interfaces-adt-connection ^1.0.0` (14.1.0 on `^1.1.0`, which they dedupe
to); the server stays on the 1.x line. interfaces-adt
13.0.0 and interfaces-adt-connection 2.0.0 are published, but nothing in this change needs them,
and moving to them is adt-clients' change first. The one gap the server meets there — adt-clients
drops the thrown value (§2) — is answered on the server's side (§7.2, D15), not by a change there.

`@mcp-abap-adt/core`, `compact`, `compact-readonly`, `compact-modify` take `@mcp-abap-adt/lib`
`^18.0.0` (and `core` `^18.0.0` for `compact`); `core` adds no chain dependency — the browser
mapping (§8) lives in `lib`. The `auth` script is removed (connection 14 has no `sap-abap-auth`;
`mcp-auth` belongs to `@mcp-abap-adt/auth-broker-cli`, which is not a dependency of the server).

### 3.1 Prerequisites: a per-request signal in connection

**Decided by the user: option (a).** A cancelled request must not be sent at any boundary on either
transport, and the boundaries are the connection's: after the server's checks pass, an RFC call can
still open its own conversation — the provider's `establish()` into the logon parameters, then
`conversation.open()` — and only then send (`RfcTransport.ts:397-470`, read on connection 14.0.1:
`carryOnKept` / `carryOnThrowaway` → `openOwn` → `loggedOn` → `carry`), and an HTTP resend follows
`rejected()` and `authorize()` with no signal (M1, M6). The server waits for these releases and
depends on them; it does not gate the connection's boundaries itself.

**1. `@mcp-abap-adt/interfaces-adt-connection` 1.1.0** (repository `mcp-abap-adt-interfaces`; a
minor on the 1.x line, from `interfaces-adt-connection-v1.0.1`, because connection 14, adt-clients 25
and the server are on `^1`; the same two additions go into 2.1.0 for the 2.x line):

```ts
export interface IAbapRequestOptions {
  // … unchanged …
  /**
   * The caller no longer needs this request. Checked by the connection before
   * every send boundary; once aborted, nothing more of this request is sent,
   * and the request rejects with ADT_REQUEST_ERROR.ABORTED. A request already
   * sent is not recalled.
   */
  signal?: AbortSignal | undefined;
}

export const ADT_REQUEST_ERROR = {
  /** The request's signal aborted before it was sent (or before a resend). */
  ABORTED: 'ADT_REQUEST_ABORTED',
} as const;
```

**2. `@mcp-abap-adt/connection` 14.1.0** (repository `mcp-abap-connection`; a minor: an optional
field honoured, nothing else changes), depending on `interfaces-adt-connection ^1.1.0`:

- **Checked at every send boundary, on both transports:** before the first send; after the
  credential's `authorize()` answers; after the logon — `establish()` and, over RFC, the
  conversation's `open()` in `openOwn` / `loggedOn`, kept and throwaway conversations alike; before
  calling `rejected()` and after it answers; before every resend (the CSRF recovery's included).
  Aborted at any of them → nothing more of this request is sent and it rejects with an error whose
  `code` is `ADT_REQUEST_ERROR.ABORTED` and whose message is fixed ("the request was aborted;
  nothing more of it was sent"); never `AuthRefusedError`, never a session verdict. A conversation
  opened for this request alone is closed. **What connection mints for an abort today: nothing** —
  it reads no signal; the closest codes are `ADT_SESSION_ERROR`'s, which are about the session, not
  the caller (D34 names the alternative).
- **Its waits for a request race the request's signal, for that caller only:** the credential's
  `authorize()` (which may wait on a renewal, M6), `rejected()` (which may wait on a login), the
  logon and `conversation.open()`. An abort settles that request at once; the shared work runs on
  for every other caller — the provider's renewal, an establishment others joined, a kept
  conversation; a late answer to the aborted caller is handled (no unhandled rejection) and
  dropped; a conversation opened for it alone is closed when its open settles.
- **Not recalled:** a request whose bytes left is answered as today.
- **Without a signal** (`signal` absent): exactly 14.0.1's behaviour.
- **Tests in connection**, on HTTP and RFC (RFC through its conversation seam, no SAP system), each
  with two callers on one connection, one cancelled at each boundary in turn — before the first
  send; while `authorize()` waits on a renewal; after `authorize()`; during an RFC conversation's
  logon and its `open()` (kept and throwaway); while `rejected()` waits; before a resend: the
  endpoint log holds no mutation of the cancelled caller after its abort, the cancelled caller
  rejects `ADT_REQUEST_ABORTED` at the abort, the other caller succeeds, and no unhandled
  rejection is recorded. Each with the check removed as the break that turns it red.

**3. adt-clients: no change.** It builds `IAbapRequestOptions` at its call sites and hands the object
to the connection unchanged (`withRequestTrace`, `adt-clients src/utils/requestTrace.ts:84-121`);
the server adds the signal below it through a per-request view of the connection (D31). Checked on
adt-clients 25.0.1 (`342b8f1b`).

**Order:** `interfaces-adt-connection` 1.1.0 → `connection` 14.1.0 → this server's 18.0.0. Each is
published before the next is built against it; the server's lockfile resolves both from the
registry (H6).

## 4. The three credential sources

`BaseMcpServer` stops holding "a settings object and a credential" (`ConnectionContext`,
`src/embeddable/ConnectionContext.ts`) and holds one **credential source** per server instance —
the three of the goal, each with its owner:

```ts
type CredentialSource =
  | { kind: 'destination'; destination: string; destinations: IDestinations }
  | { kind: 'direct'; settings: SapConfig; credential: IAuthProvider } // x-sap-* headers, a SapConfig
  | { kind: 'injected'; connection: AbapConnection };                  // EmbeddableMcpServer
```

`ConnectionContext` (exported from `@mcp-abap-adt/lib/embeddable`) becomes this union plus
`sessionId` and `metadata` (D29: an API change of the major).

### 4.1 A destination: through the broker

- **(D2) One `AuthBroker` per destination stays.** Each destination has its own stores
  (`storesFor`, by mode — env file, named ABAP key, named XSUAA key), so one broker per destination
  is the natural owner of that destination's write queue and `flush()`. Reason: the broker's
  sharing and write queue are per destination already; one broker per destination adds nothing to
  re-implement.
- **(D3) A destination is read once per process, as documented today; editing its files while the
  server runs is unsupported (decided by the user: document, don't engineer).**
  - **The settings** stay read once per process (`settingsFor`'s cache, `brokerFactory.ts:114-125`,
    unchanged), from the stores as auth-stores 4 gives them; no wrapper of the server's.
  - **The provider:** every request calls `getProvider(destination, { signal })` (§5) — the
    signal is why — and the broker answers its cached provider while its stores answer what its
    build read. The server keeps no provider cache (`brokerFactory.ts:184-198` goes): one would
    bypass the signal (§5) and duplicate the broker's sharing (H5).
  - **What is documented instead of defended.** The destination's files belong to the user. The
    stores read them per projection and the broker reads means and client apart, so a change
    written while the server runs can be picked up in part: M4 hands one system's basic credential
    to another's URL, M5 freezes A's URL with B's OAuth client and presents B's token to A. The
    docs say plainly (`docs/user-guide/AUTHENTICATION.md`, *What is written back*, and the migration
    note): **editing a destination's files while the server runs is not supported and may combine
    old and new values until the next start — restart the server after any change.** Reason: the
    user's standing rule — a consumer's own misuse is documented, not defended with machinery.
  - **What stays live:** the session store (the secret and its binding), which the broker reads and
    writes as it must, checking a stored secret's `issuedFor` / `issuedBy` against the means.
- `systemContextFor` (responsible, login, master system) stays cached per process: it holds no
  credential and nothing is bound to it; changing it is outside this change's footprint.
- **The counted wrapper stays** (`countedProvider`), memoised per inner provider in a `WeakMap` so
  the same inner provider is always handed out as the same wrapper (the stdio and SSE connection
  caches key on it, §5.4). Its closed-gate answer becomes a minted refusal (D17).
- **Startup (D18).** The launcher's check of the default destination reads the settings and builds
  the provider — `getProvider(destination, { signal: startup })`, `startup` aborted when the check
  ends — so a destination the broker refuses (a `jwt` / `none` without its binding, a missing
  client) stops the start as today's settings check does. Building a provider sends nothing: no
  moment is called. Reason: today stdio already built the provider at start
  (`StdioServer.ts:34-35` → `setConnectionContext`); HTTP and SSE now refuse at start too
  instead of at the first request.
- **The broker options the server states** for every destination's broker (§6): `renewal`,
  `onWriteFailure`, `authDebug`, and — for `jwt` / `authorization_code` only — `authorization`
  (§5.6, §8). The handler table (`basic`, `snc`, `jwt/authorization_code`, `jwt/none`) is
  unchanged.

### 4.2 Credentials per request or per instance: providers built directly

`x-sap-*` headers (`credentialFromHeaders`) and a `SapConfig` (`credentialFromSapConfig`, behind
`setSapConfigOverride` / `getManagedConnection`) build providers of auth-providers 6 directly:
`BasicAuthProvider(user, password)`, `TokenAuthProvider.fixed(token)`, `SamlAuthProvider(cookies)`,
`CertificateAuthProvider(new FileCertificateMaterialLoader(), config)` — the constructors 6.0 kept
(connection `docs/MIGRATION-13.0.md`). They never reach the broker or a store, and serve only the
request (HTTP), the session (SSE) or the instance (`SapConfig`) that gave them (H3).

- **(D19) No guess.** `credentialFromSapConfig` refuses, naming the field, instead of defaulting:
  an `authType` outside `basic`, `jwt`, `saml`, `certificate` (an absent one included) is refused
  naming `authType`; `snc` is refused with "SNC is served through a destination (`--mcp`, `--env`)"
  — 4.x built a `BasicAuthProvider('', '')` for it; `kerberos` stays refused; a `basic` without user
  or password, a `jwt` without `jwtToken`, a `saml` without `sessionCookies` are refused naming the
  field. Reason: H1 — today's default builds a credential nobody stated.
- They follow §5 (the request's signal ends the server's waits; these providers have no login to
  cancel), §7 (their refusals are read the same way) and §9 (nothing of them is logged).

### 4.3 An injected connection: the consumer's, with the consumer's fresh-connection factory

`EmbeddableMcpServer` uses the injected connection as given (`EmbeddableMcpServer.ts:184-186`): the
server never calls `getProvider`, never builds a credential for it, never wraps it (the failure
observer of §7.2 is applied only to connections the server builds) and never connects it.

**A fresh connection (D20).** `openFreshConnection(connection, logger)` decides from a per-connection
registry, never from the connection's configuration:

| The connection | A fresh one comes from |
|---|---|
| built by the server (`createAbapConnection`: a destination, `x-sap-*`, a `SapConfig`) | the factory's record — the same settings and **the same credential object** (today's `siblingRecordOf`, `connectionFactory.ts:300-305`), connected under the current request's signal (§5.2) |
| injected, with `freshConnection` given | `await freshConnection({ signal })` — the consumer's factory; `signal` is the current request's |
| injected without it (also a connection set through `setAbapConnectionOverride`) | **refused**: "This operation needs an ABAP session of its own; the connection was given by the host, which supplied no fresh-connection factory (`freshConnection`)" |

```ts
interface EmbeddableMcpServerOptions {
  // …
  /**
   * A connection of its own for an operation that needs a new ABAP session:
   * RFC CreatePackage / LockPackage and DeletePackage with force_new_connection.
   * Its authentication, cancellation and persistence are yours; the server
   * calls `disconnect()` on it when the operation is done. Without it those
   * operations are refused.
   */
  freshConnection?: (options: { signal?: AbortSignal }) => Promise<IAbapConnection>;
}
```

- **The registry** is a `WeakMap` in `packageSessions.ts` that `EmbeddableMcpServer`'s constructor
  fills for its injected connection; the record path keeps the existing `records` map. The
  fallback through `getConfig()` / `config` and `credentialFromSapConfig`
  (`packageSessions.ts:45-47`, `:55`) is deleted. Reason: a registry keyed by the connection object
  needs no change to `HandlerContext` or to the four handlers' signatures, so the handlers keep
  calling `inOwnSessionOverRfc` / `connectionForPackageLock` / `openFreshConnection` as they do.
- **Every caller** — `CreatePackage` high and low over RFC, `LockPackage` over RFC,
  `DeletePackage` with `force_new_connection` (HTTP or RFC) — goes through `openFreshConnection`,
  so all four get the same three rows.
- **(D21) `DeletePackage`'s fallback is removed.** A fresh connection that cannot be had — refused,
  or failing — is the tool's answer, not a silent delete on the caller's session the caller asked
  to avoid. Reason: H1; a fallback is a guess, and on an injected connection without a factory it
  would hide exactly the refusal the goal requires. The warn line quoting the error's `message`
  goes with it.
- **Ownership.** The consumer's fresh connection is the consumer's to authenticate, cancel and
  persist; the server holds it for the operation only and closes it with `disconnect()` as it
  closes its own (`closeQuietly`), whose failure is logged in fixed words, never its `message`.
  **(D22)** That the server closes it is listed in §17.

## 5. Cancellation

### 5.1 The signals

| Signal | Created | Aborted | Given to |
|---|---|---|---|
| **request** | per MCP request, in the tool wrapper | the MCP request's `extra.signal` aborts (client cancel, transport close, session close), **or the request ends** (`finally`), or shutdown | `getProvider(destination, { signal })`; `openFreshConnection`; the consumer's `freshConnection` |
| **setup** | per HTTP request / SSE `GET` before any setup | the client's connection closes (listener installed first), **or setup ends** (`finally`), or shutdown | `getProvider` of the pre-dispatch connect |
| **startup** | per launcher check | the check ends | `getProvider` of the check |
| **shutdown** | once | a `SIGTERM` / `SIGINT` received after the shutdown started (never stdin's `end` / `close`), or `--shutdown-timeout` when the user stated one (§6.4) — never by a default | `flush({ signal })`; the drain |
| **login bound** | per `authorize` of the server's strategy wrapper, when configured | the bound elapses | the strategy, combined with the provider's `AuthorizationRequest.signal` (§5.7) |

**(D4) A request's signal is aborted when the request ends, whatever its outcome.** Reason: the
broker attaches `getProvider`'s signal to the provider as a party and releases a party only on its
abort; a party left live after its request ended would keep every later login on that provider
alive after its own waiter left (§2, *A provider's moment waits on all its parties*). Every signal
the server hands the broker is therefore one the server aborts when its holder is done. A live
set of request and setup controllers is kept per process so shutdown can abort them (§6.4).

The store reads (`settingsFor`, and the broker's own) take no signal — the store contract has none
(broker README, *Cancellation*); they are file reads that settle.

**Every request-owned wait the server makes is the request's own (D32).** The provider's moments
wait on the collective parties (M3), and the connection's establishment (`connect()`) is shared by
its callers and takes no signal. So wherever the server itself waits, for a request, on something
that may also serve another caller — `connect()` in a request, the HTTP and SSE pre-dispatch
connect, `getProvider`'s build — it races that wait against the request's own signal: the request settles `aborted` at once,
the shared work runs on for the others, and its late result is handled — a late rejection gets a
handler (never unhandled), a late success that belonged to this request alone (an HTTP request's
own connection) is cleaned up (`disconnect()`), one shared with others is left to them. This is
the per-caller wait the chain does not give a moment; no chain change is needed for it (M3). The
waits **inside** a request's send — the provider's `authorize()` and `rejected()`, an RFC
conversation's logon and open — are the connection's to race, under the prerequisite of §3.1
(D31).

### 5.2 In a request

`BaseMcpServer`'s tool wrapper takes the SDK's `extra` beside `args` and creates the request
controller linked to `extra.signal`.

- **Getting the connection** (`getConnection(signal)`): the source's settings and credential
  (§4), the connection (§5.4), `connect()` — **raced against the request's signal** (D32). The
  connection's establishment is shared by every caller of that connection (stdio, SSE); a
  cancelled caller leaves it, the others keep it.
- **(D31) Every request carries its signal into the connection — decided by the user: option
  (a), a per-request signal in connection, a prerequisite (§3.1).** The handler is given, as its
  `connection`, a **per-request view** of the connection the server built: an object whose
  `makeAdtRequest(options)` calls the connection's with `{ ...options, signal }` — this request's
  signal — and which forwards every other member to the connection (bound), its own
  `makeAdtRequest` assignable, since adt-clients' `withRequestTrace` assigns over it
  (`adt-clients src/utils/requestTrace.ts:84-121`). connection 14.1.0 then checks that signal at
  every send boundary and races its own waits for that request against it (§3.1): a cancelled
  request is never sent — not first, not after `authorize()`, not after an RFC conversation's
  logon and open, not as a resend after a renewal another caller completed — and it settles at
  the abort while the shared work runs on for the others.
  - **Why a view, not adt-clients.** adt-clients 25.0.1 builds `IAbapRequestOptions` itself at 460
    call sites in 293 files and passes the object it built straight to the connection
    (`withRequestTrace` calls `base(request)` unchanged); it carries no signal and has no place
    to take one. The view adds the signal below adt-clients, so **adt-clients needs no change**.
  - **The view also carries** the request's record of an auth failure (§7.2) and the request's
    signal for a fresh connection (§4.3); the server's registries (records, fresh-connection
    factories) are keyed by the connection and looked up through the view's target.
  - **Not for an injected connection**: it is the consumer's and is not wrapped (§4.3); its
    requests carry no signal from the server.
  - **Replaces** the request gate of `c9fb15e5`–`443eba0e` (an `AsyncLocalStorage` scope read in
    the provider's `authorize()`, the record-and-replay target, the `rejected()` race): M2 and M6
    showed the gate works on HTTP, but it cannot see a boundary that is not a provider call — an
    RFC call that opens its own conversation after the gate passed (`RfcTransport.ts:397-470`:
    `carryOnKept` / `carryOnThrowaway` → `openOwn` → `loggedOn` → `logon`, `conversation.open()`,
    then `carry`) — and a gate per boundary would re-implement in the server what the connection
    owns. No `AsyncLocalStorage` remains in the design.
- **(D5) A request whose signal aborted does not reach its tool.** After the connection is ready,
  an aborted signal answers the request `aborted` and the handler is not called. Reason: two
  requests share one login; the one whose client cancelled must not go on to create or delete
  something once the other's login completes. A renewal inside a running handler (a `401` →
  `rejected()`) is the connection's, under the request's signal (D31).
- **(D7) One retry after another caller's abort.** When `connect()` fails `interactive-login`
  `aborted` while this request's own signal is live, another caller's abort ended an attempt this
  request joined (a shared login, or the connection's shared establishment, whose parties had all
  aborted before this request attached). The server calls `connect()` once more, which starts a
  fresh attempt. Reason: "a later request after a cancellation starts afresh and succeeds" must
  hold also for a request arriving inside the window between the abort and the attempt's
  settlement. Read by `kind` and `facts.outcome` (§7.1), never by words; once, so no loop.

### 5.3 Before any MCP request: HTTP first connect and SSE `init`

**(D6)**

- **The disconnect listener comes first.** `StreamableHttpServer`'s POST handler and `SseServer`'s
  `GET` handler create the setup controller and install `res.on('close', abort)` before choosing
  the destination, before building the per-request server, before any read. The existing
  listeners (transport close; SSE session removal) stay where they are and also abort it.
- **The pre-dispatch connect** (`setConnectionContext` + `connect()` while the destination has not
  connected in this process) runs with the setup signal, and its wait is raced against it (D32): a client that leaves settles its setup at once — its response
  is not written, its per-request connection is disconnected when the late establishment settles,
  a late rejection is handled — while a login another client also waits on goes on. The setup
  controller is aborted in a `finally` when setup ends (D4).
- **`FirstConnectLock`'s queue is removed; its "connected" set stays** (`FirstConnect`). Reasons:
  its purpose — "two first logins must not race for the same callback port"
  (`destinationRequest.ts:62-67`) — is now held by the chain: concurrent first connects of one
  destination get the same provider (the broker's shared build) and join one login (the
  provider's shared attempt); first logins of two destinations are serialized by the strategy
  wrapper (§5.6). A queue of the server's own would be a second implementation (H5), and a client
  waiting in it is a wait the chain cannot cancel. With no queue, a second client that disconnects
  leaves nothing behind: its party aborts and the login goes on for the first. **(D23)** §17
  asks the user to confirm, since the goal names the queue.
- **After a disconnect** the login, when this client was its only party, ends `aborted`; the
  composed strategy settles only after its listener's sockets are closed (auth-providers *The
  callback listener*), so the callback port is free, and the next client's connect starts a fresh
  login.

### 5.4 The connection a request uses

**(D13)**

- **HTTP**: a connection per request, as today.
- **stdio and SSE**: the server instance keeps its connection while the source answers the same
  provider (the same counted wrapper) and the same settings; a different provider (the broker
  built a new one) → a new connection, the old one disconnected. Reason: today's cache
  (`BaseMcpServer.ts:205-227`) keyed on the destination name alone would present any provider it
  was first given, whatever the broker answers later.

### 5.5 A session's close

An MCP session's close aborts the SDK's in-flight `extra.signal`s (§2), which abort their request
signals, which are the parties of every wait those requests started — `getProvider`'s build, a
login a moment started, a queued login in the strategy wrapper, a fresh connection. No signal
outlives a request, so a closed session holds no party on any provider. For SSE, a session's
`GET` setup has the setup signal (§5.3); its POSTs are requests. For stdio, the end of stdin is
the shutdown (§6.4), which aborts every live request.

### 5.6 What `LoginLock` becomes: the server's strategy wrapper

The strategies own the port, and auth-providers 6 serializes logins **per strategy instance**
(composer `busy`) and **per provider** (shared attempt, `exclusive`). Two destinations' providers
each get their own strategy from `authorization()`, both bound to the one configured port; without
a rule of the server's, the second fails `port-in-use`.

**(D8)** The `authorization` option of a `jwt` / `authorization_code` destination answers
`serverLogin(browserCallbackStrategy({ browser, port }), context)` — one wrapper, which:

1. **queues** the login behind every earlier one of this process (today's `LoginLock`, kept
   process-wide). A queued login whose `AuthorizationRequest.signal` (combined with the bound,
   §5.7) aborts **leaves the queue at once**, rejecting with
   `new AuthProviderFailure(authError['interactive-login']({ outcome: 'aborted' }))`, and never
   starts the inner strategy; its turn passes on. A login that started runs until the inner
   strategy settles — after its port is released — whatever happens to its signal, so the next
   one binds a free port;
2. **passes the request on** with `signal` replaced by the combination of the provider's signal and
   the login bound, and `logger` replaced by the prompt logger (§9.2);
3. **forwards `dispose()`**, and is recorded by the factory, which disposes every strategy it
   composed at shutdown (§6.4) — the server constructs them, so the server disposes them
   (auth-providers *Lifecycle: whoever constructs, disposes*).

Reason: one login at a time keeps today's behaviour (users log in to one destination after
another instead of seeing `port-in-use`); making the queue cancellable is what the goal requires
of it. It is not a second implementation of a chain rule: the chain has no cross-provider rule.

### 5.7 The server's login bound

**(D10)**

- **Where:** `--login-timeout=<seconds>`, `MCP_LOGIN_TIMEOUT`, YAML `login-timeout` (a row of
  `AUTH_PARAMETERS`); `IAuthBrokerFactoryConfig.loginTimeoutMs?: number` for an embedder that builds
  the factory itself (with `StreamableHttpServer` / `SseServer` on its own app).
- **Default: none.** Reasons: H4 and the user's standing rule (no built-in timeouts; a wait ends on
  its result, an explicit error or the consumer's signal). Every client the server serves can end
  a login already — an MCP cancel, a disconnect, a session close — so a default bound would only
  cut a user who is still typing a password.
- **What it bounds:** each `authorize` of the server's strategy wrapper, from the moment it starts
  (not the queue wait, which ends with its own signal), through `AbortSignal.any([request.signal,
  AbortSignal.timeout(ms)])`. It bounds the login, not the request: a ten-minute activation is not
  cut by it.
- **Visible:** when the bound fired, the MCP answer and the stderr line add the server's own
  sentence: "The login was ended by the server's login timeout (`--login-timeout=<n>`)." The
  chain's words stay as they are (`the browser login was aborted`).
- **`EmbeddableMcpServer`** owns no login — its connection is the consumer's, and `x-sap-*`
  providers do not log in — so it has no bound to set.
- Validation: a whole number of seconds from 1 to 86 400, parsed by plain code; anything else
  refused at startup naming the form used (as the port is).

## 6. Renewal, session writes, shutdown

### 6.1 Renewal

**(D11)** `renewal: () => refreshThenLogin()` for every token destination by default — 4.x's steps,
which every `jwt` / `authorization_code` user of the server has today. The user changes it with
`--renewal=refresh-then-login|refresh-only` (`MCP_RENEWAL`, YAML `renewal`):
`refresh-only` (`refreshOnly()`) never logs in — the process runs on its stored session and
refresh token, and a destination that needs a login answers `renewal-declined`, to which the
server adds "Logins are off (`--renewal=refresh-only`): log in with `mcp-auth`, or start without
it." For an embedder the factory takes `renewal: AuthBrokerConfig['renewal']`, **required**, no
default (the library adds no default collaborator, `IAuthBrokerFactoryConfig.ts:1-5`). Reason: H1
— named in the server's configuration and documented; a headless deployment (a server nobody
watches) is the user's call, not the server's.

### 6.2 What a failed session write means

**(D12)** `onWriteFailure: 'fail'` by default; `--session-write-failure=fail|continue`
(`MCP_SESSION_WRITE_FAILURE`, YAML `session-write-failure`) changes it; the factory takes it
**required** for an embedder. Reasons:

- `'fail'` makes a write that did not land visible — the request fails `unknown`
  `persisting-tokens` ("persisting the tokens failed (unknown error, EACCES)") and the destination
  is refused until a write lands — where `'continue'` logs one `warn` line to a logger that is
  silent unless `DEBUG_AUTH_LOG` is set: the user would never know their `.env` is not being
  written.
- `'fail'` is what lets the server keep "a discarded refresh token does not come back" (§6.3).
- `'continue'` stays available for a read-only store (an `.env` mounted read-only), documented with
  its cost: a discarded refresh token can come back after a restart (broker README, *Across
  restarts*).

§17 asks the user to confirm the default.

### 6.3 Discarded refresh tokens

The broker writes `refreshToken: ''` for a discarded refresh token through the destination's
write queue. It does not come back after a restart when that write lands before the process ends:

- every shutdown path flushes (§6.4) — `SIGTERM`, `SIGINT`, the end of stdin;
- under `'fail'` a write that does not land fails the requests of that destination and makes the
  flush report it (exit `1`, one line naming the destination) — the case where it can come back is
  then a store that refuses every write, reported, never silent;
- a named destination without `--unsafe` keeps its session in memory (`SafeAbapSessionStore`):
  nothing persists, so nothing comes back.

A process killed without a shutdown (`SIGKILL`, a crash) is the limit: documented, with the
broker's own remaining limit (a process that dies between a discard and its report).

### 6.4 Shutdown

`installShutdown` (`server/src/shutdown.ts`) runs, in order:

1. stop the servers (as today);
2. close the provider gate (as today); its answer is minted (D17);
3. **abort every live request and setup controller** — nothing keeps waiting for clients that are
   being dropped;
4. **dispose every strategy the factory composed** — a login still running ends `disposed` and
   releases its port;
5. drain the counted provider calls, then **`flush({ signal })` each destination's broker** — with
   **no deadline of the server's choosing**;
6. exit `0`, or `1` with one stderr line per fact.

**(D33) No built-in shutdown deadline.** `SHUTDOWN_DEADLINE_MS` (30 s, `shutdown.ts:22-23`) and the
drain's timer (`ProviderGate.drained(deadlineMs)`, `countedProvider.ts:69-82`) go. Reasons: H4 and
the user's standing rule — a wait ends on its result, an explicit error or a signal someone
gave; and the 30 s was documented as the providers' login timeout, which 6.0 removed. Steps 3–4
end every login, so the drain waits only for calls that settle on their own, and the store
contract says `saveSession` settles (broker README, *The store's contract*). What ends a shutdown
early is always someone's statement:

- **a `SIGTERM` / `SIGINT` after the shutdown started** exits at once, code `1`, with one stderr line naming what was
  still pending (`N authorizations`, `session writes of "<destination>"`) — the person's own bound,
  as auth-broker-cli 3 does;
- **`--shutdown-timeout=<seconds>`** (`MCP_SHUTDOWN_TIMEOUT`, YAML `shutdown-timeout`;
  `IAuthBrokerFactory.settle({ signal })` for an embedder), **no default**: when stated, the drain
  and the flush end at that bound, and the exit is `1` with the same lines.

**What ending early costs** (documented beside the option): a session write still pending when the
process exits is lost. A renewed token is then obtained again on the next start (a refresh, or a
login); a **discarded refresh token can come back** after the restart — the write that would have
cleared it never landed. Under `--session-write-failure=fail` a write that kept failing had already
failed its requests and is named on stderr; a write that was merely slow is the case the bound
gives up on. Without the option and without a signal after the start, the shutdown waits for every write.

**What starts a shutdown and what forces it.** Starting is idempotent: the first trigger —
`SIGTERM`, `SIGINT`, or the end of stdin under stdio — starts the one sequence, and **every stdin
`end` / `close` is part of that one start, never a second trigger** (a piped EOF emits both, M7;
an ordinary client leaving must not lose its writes). Forcing is explicit: only a `SIGTERM` or
`SIGINT` received **after** the sequence started, or the configured `--shutdown-timeout`, ends it
early. A client that closes stdin therefore gets every pending session write flushed before the
process exits.

`notStored` lines become `"<destination>": <reason>` — the destination is the one whose broker
was flushed (one broker per destination, D2), the reason `classify(entry, 'persisting-tokens').reason`
for each entry of the rejection's `errors` (read as an own array, structurally): no regular
expression, no message. `settle(deadlineMs)` becomes `settle({ signal? })`; its report keeps its
shape.

## 7. Failures: how they are read and what an MCP client sees

### 7.1 One reader

**(D14)** `src/lib/auth/failures.ts` exports one function the whole server uses:

```ts
type ServerFailure =
  | { source: 'chain'; error: IAuthProviderError }                 // a provider's, the broker's, the connection's
  | { source: 'destination'; destination: string; fields: readonly string[]; error?: IAuthProviderError }
  | { source: 'server'; words: string };                           // the server's own refusals

function failureOf(thrown: unknown): ServerFailure | undefined;
```

In order, each check structural and total (own properties read guarded, no `instanceof` on a class
of the chain, no `message`, no `name`):

1. `isDestinationConfigError(thrown)` (auth-broker, structural) → `destination`, `missingFields`,
   and its `error` read with `classify(error, 'unfamiliar-error')` when present. First, because
   `readFailure` would answer the carried error and lose the fields.
2. `isAuthProviderFailure(thrown)` → `readFailure(thrown, 'unfamiliar-error')` (what a provider, a
   strategy, the broker throws).
3. an own `refusal` whose `kind` is a known kind (`isAuthProviderErrorKind`) →
   `classify(refusal, 'unfamiliar-error')` (connection's `AuthRefusedError`, §2).
3a. an own `code` equal to `ADT_REQUEST_ERROR.ABORTED` (connection 14.1.0, §3.1) → the request was
   cancelled: answered `request_aborted` in fixed words (its client has usually gone; the answer is
   for a log and a test);
4. the server's own error classes (`DestinationRefusal`, `UnsupportedAuthenticationError`, the
   fresh-connection refusal, the destination-changed refusal, the inspection-only refusal) — the
   server's classes, so `instanceof` on them is not on the chain.
5. anything else → `undefined`: not an authentication failure; the caller reports it as today.

Reason: H5 ("reading a failure") — auth-errors decides what a value is; the server only chooses
which carrier to hand it. `describeAuthError` and `notStoredOf` are deleted; `errorClassOf` stays
for non-auth values, without its regular expression (D26).

### 7.2 Where failures are caught

- **Outside a handler** — the tool wrapper's `catch` (`getConnection`, `connect()`), the HTTP and
  SSE setup, the launcher's check: `failureOf` first; an auth failure is answered as §7.3, anything
  else as today (`return_error`).
- **Inside a handler (D15).** adt-clients turns a thrown `AuthRefusedError` into `{ origin:
  'connection', message }` (§2): the words survive, the `kind` does not. So
  the per-request view of every connection the server builds (D31) observes its `makeAdtRequest()`
  (and the server observes its own `connect()`): on a throw it records `failureOf(thrown)` for the
  request and rethrows the same value. When a handler answers an error and its request
  recorded a chain failure, the tool wrapper answers that failure (§7.3) instead — nothing after a
  refused credential reached the system, so the failure is the cause. An injected connection is not
  wrapped (§4.3): there, an auth failure inside a handler reaches the client in connection's own
  words through adt-clients' `message`, without `kind` — the limit of not wrapping what the consumer
  owns (**D16**, §17).
- `return_error` and `answer()` call `failureOf` first, so a handler that catches a failure itself
  answers it the same way.

### 7.3 What the MCP client sees

An MCP tool result, `isError: true`, JSON in the shape the server's local failures already use
(`src/lib/answer.ts:41-67`):

```json
{
  "error": "authentication_failed",
  "kind": "credential-refused",
  "message": "the user or password was refused",
  "hint": "check the user and password",
  "server": "…the server's own sentence, when it has one…"
}
```

| Source | `error` | `kind` | `message` | `hint` | `server` |
|---|---|---|---|---|---|
| chain failure | `authentication_failed` | the error's `kind` | its `reason` | its `hint`, when present | §7.4 |
| `DestinationConfigError` | `destination_refused` | — (and `cause_kind` when it carries an error) | `Destination "<name>" cannot be used: <fields>` | the carried error's `hint`, then one fixed hint per field the server knows (`HINTS`, extended in D30) | — |
| the server's own refusal | `destination_refused` / `fresh_connection_unavailable` / `inspection_only` / `destination_changed` | — | its fixed words | — | — |

What stays out, always: `diagnostics` (an SNC library path, a SAML issuer, a configured URI — they
help the person at the server's console, so they go to the stderr line, never to a remote client),
`facts` beyond `kind`, any `message` of a thrown value, a token, a URL with a query, `state`. The
HTTP and SSE setup answer the same words as text (`500`; `400` for a refused header, as today).
The stderr line for every auth failure is `logFields(error)` — `{ error: reason, kind, status?,
diagnostics? }` — after the request's tool name.

### 7.4 The server's own sentences

**(D28)** Added in `server`, keyed on `kind` and the server's own state, never on words:

| When | Sentence |
|---|---|
| the login bound fired (§5.7) | The login was ended by the server's login timeout (`--login-timeout=<n>`). |
| `renewal-declined` under `--renewal=refresh-only` | Logins are off (`--renewal=refresh-only`): log in with `mcp-auth`, or start without it. |
| `interactive-login` `aborted` with the server shutting down | The server is shutting down. |
| `unknown` `persisting-tokens` | The session could not be written to the destination's store; see `--session-write-failure`. |

**(D17)** The closed provider gate answers `{ ok: false, refusal: authError['interactive-login']({
outcome: 'aborted' }) }`, with the shutdown sentence above; inspection-only mode is the server's own
refusal before any connection (`inspection_only`, today's words), not a fake provider. Reason:
connection 12+ turns an unminted refusal into "the credential provider failed".

## 8. The browser

**(D9)** `--browser` becomes an enum, mapped by `process.platform` in `src/lib/auth/browsers.ts` to
auth-providers' factories — auth-providers' own migration table (README, *Interactive login:
strategies by composition*), which auth-broker-cli 3 uses too:

| `--browser` | `linux` | `darwin` | `win32` | other platforms |
|---|---|---|---|---|
| `system` (default), `auto` | `linuxDefaultBrowser()` | `macDefaultBrowser()` | `windowsDefaultBrowser()` | refused at startup: "`--browser=<name>` has no launcher on this platform; use `--browser=none`" |
| `chrome` | `linuxBrowser('google-chrome')` | `macBrowser('Google Chrome')` | `windowsBrowser('chrome')` | refused, as above |
| `edge` | `linuxBrowser('microsoft-edge')` | `macBrowser('Microsoft Edge')` | `windowsBrowser('msedge')` | refused, as above |
| `firefox` | `linuxBrowser('firefox')` | `macBrowser('Firefox')` | `windowsBrowser('firefox')` | refused, as above |
| `none`, `headless` | no browser: the URL on stderr | the same | the same | the same |

- **`--browser-program=<program>`** (`MCP_BROWSER_PROGRAM`, YAML `browser-program`; excludes
  `--browser`): `linuxBrowser(p)` / `macBrowser(p)` / `windowsBrowser(p)`, as given — the
  replacement for 5.x's candidate lists (`chromium`, `google-chrome-stable`), as in the CLI.
- **A name outside the enum is refused at startup** naming the form used; 5.x opened the default
  browser for an unknown name. Reason: H1 — the server does not guess what a name means.
- **`none` now waits.** `IServerConfig`'s comment says `none` "rejects immediately"
  (`src/lib/config/IServerConfig.ts:58-62`); in 6.0 no browser means the URL on stderr and a
  login that waits (the user docs already say so). A deployment that must never log in uses
  `--renewal=refresh-only` (§6.1). Migration note.
- **The mapping is a pure function** returning `{ factory, argument }` before anything is
  constructed, so the table is tested without constructing a browser; the launcher constructs.
  `IAuthBrokerFactoryConfig.browser` becomes `IBrowser | undefined` and `browserStrategy`
  `(options: { browser?: IBrowser; port?: number }) => IAuthorizationStrategy<string>` — an embedder
  passes any `IBrowser` of its own.
- **The callback port** keeps `--browser-auth-port` (default 61001, the strategy's own default).

## 9. Debug output and logging

### 9.1 `authDebug`

**(D24)** `--auth-debug` (YAML `auth-debug`), a flag with **no environment form** (an
`AUTH_PARAMETERS` row without `env`); `IAuthBrokerFactoryConfig.authDebug?: boolean` for an
embedder, on only for `true`. It sets the broker's `authDebug: true` and, since the providers' debug
line is written to the broker's logger, makes that logger the stderr logger. At startup it writes
one stderr line: "`--auth-debug`: a refused token request's line names its secrets (first and
last four characters); do not share this output." No variable — `DEBUG_AUTH_LOG`,
`DEBUG_AUTH_BROKER`, `DEBUG_AUTH_PROVIDERS`, `DEBUG`, `MCP_AUTH_DEBUG` — turns it on. Reason: the
goal; the chain reads no environment for it either.

`DEBUG_AUTH_LOG` / `DEBUG_AUTH_BROKER` keep routing the broker's logger to stderr: under 6.0 /
5.0 none of its lines, nor the providers' lines without `authDebug`, carries a secret, server text,
a URL, a client id or `state` (broker README, *Logging*; auth-providers CLAUDE.md, *No token …
reaches a log line*).

### 9.2 What the server itself logs

- **Prompts.** The server's strategy wrapper hands the strategy a logger whose `info` writes to
  stderr (today's `promptsOnStderr`, folded in): the "waiting for the callback" line and the SSH
  hint (loopback address and port only) are seen; `warn`, `error`, `debug` stay the broker's
  logger. The authorization URL itself is written by auth-providers to stderr only, never to a
  logger, and only when no browser is configured or the launch failed — the one place it appears
  (H2, *the login itself*).
- **(D25) The startup summary shows presence only** — `Password: set`, `JWT Token: set`, `Refresh
  Token: (not set)` — never characters of a secret. `maskSensitiveValue`'s four-and-four is a
  secret's fragment in a log line without `authDebug`.
- **No `message` of a thrown value in a log line** on the auth paths: SSE POST failures log the
  class only (as HTTP does); `closeQuietly` and the `DeletePackage` warn use fixed words; an auth
  failure logs `logFields(error)`.
- **stdout**: nothing is added; every new line goes to stderr or the logger.

**"Server text" (D27).** The goal forbids server text in a tool result, a log line or an error.
The spec reads it as text an authorization server or identity provider sent — which the chain
already keeps out (`error_description` is read by nothing). An ADT answer (`raw_body`, SAP's
`messages`) is the tool's data and stays in tool results as today. §17 asks the user to confirm.

## 10. The configuration surface and every API change

### 10.1 New and changed parameters (`AUTH_PARAMETERS`)

| CLI | env | YAML | Kind | Default |
|---|---|---|---|---|
| `--browser` | `MCP_BROWSER` | `browser` | enum `system`, `auto`, `chrome`, `edge`, `firefox`, `headless`, `none` (was a free string) | `system` |
| `--browser-program` (new) | `MCP_BROWSER_PROGRAM` | `browser-program` | string; excludes `--browser` | — |
| `--login-timeout` (new) | `MCP_LOGIN_TIMEOUT` | `login-timeout` | seconds, 1–86 400 | none |
| `--renewal` (new) | `MCP_RENEWAL` | `renewal` | enum `refresh-then-login`, `refresh-only` | `refresh-then-login` |
| `--session-write-failure` (new) | `MCP_SESSION_WRITE_FAILURE` | `session-write-failure` | enum `fail`, `continue` | `fail` |
| `--auth-debug` (new) | — (none, by design) | `auth-debug` | flag | off |
| `--shutdown-timeout` (new) | `MCP_SHUTDOWN_TIMEOUT` | `shutdown-timeout` | seconds, 1–86 400 | none (§6.4, D33) |

Each row is read by plain code (D26 replaces the port's regular expression with the same plain
parser the seconds use). The help text, the YAML template and the validation come from the table,
as today.

### 10.2 Each current call site → its new form

| Site | Today | 18.0.0 |
|---|---|---|
| `brokerFactory.ts:251-258` | `new AuthBroker({ serviceKeyStore, sessionStore, ...handler.brokerOptions(ctx) }, logger)` | `new AuthBroker({ serviceKeyStore, sessionStore, renewal, onWriteFailure, authDebug, ...handler.brokerOptions(ctx) }, logger)` |
| `brokerFactory.ts:184-198` | `getProvider(d)` cached by the factory | `getProvider(d, { signal })` → `broker.getProvider(d, { signal })`, no factory cache, counted wrapper memoised per inner provider |
| `brokerFactory.ts:114-125` | `settingsFor` cached per process | unchanged (D3) |
| `brokerFactory.ts:217` | `broker.flush()` | `broker.flush({ signal })` (§6.4) |
| `brokerFactory.ts:58-68`, `:219` | `notStoredOf` with `ENTRY` | per destination, `classify(entry, 'persisting-tokens').reason` |
| `brokerFactory.ts:134`, `:152`; `vocabulary.ts` | `new DestinationConfigError(d, fields, reason)` | unchanged (the broker 5 constructor takes the same three, plus an optional error) |
| `errors.ts:97-118` | `describeAuthError` by `instanceof` and `message` | deleted; `failureOf` (§7.1) |
| `errors.ts:55-61` | `errorClassOf` with a regular expression | plain-code check of the constructor name (D26) |
| `handlers/jwtAuthorizationCode.ts:5-18` | `authorization: () => oneLoginAtATime(strategy({ browser: string, port }), lock)` | `authorization: (destination, grant) => serverLogin(strategy({ browser?: IBrowser, port }), context)` (§5.6) |
| `handlers/types.ts` `AuthHandlerContext` | `browser: string`, `loginLock`, `browserStrategy` | `browser?: IBrowser`, `logins` (the wrapper's queue and the composed-strategy registry), `loginTimeoutMs?`, `browserStrategy` |
| `countedProvider.ts:24-27` | unminted shutdown refusal | minted (D17) |
| `countedProvider.ts:69-82`, `shutdown.ts:22-23`, `:71` | `drained(deadlineMs)` with a timer; `settle(SHUTDOWN_DEADLINE_MS)` | `drained()` with no timer; `settle({ signal })`, the signal from a `SIGTERM` / `SIGINT` after the start or `--shutdown-timeout` (D33); stdin `end` and `close` one idempotent start (`shutdown.ts:94-97`) |
| `launcher.ts:257` | `browserStrategy: browserCallbackStrategy` (auth-providers 5) | the same name from auth-providers 6, re-exported by `@mcp-abap-adt/lib/auth` with the browser mapping |
| `launcher.ts:373-394` `promptsOnStderr` | a separate wrapper | folded into the server's strategy wrapper (§9.2) |
| `launcher.ts:404-421` `factoryConfigFrom` | `browser: config.browser ?? 'system'` | `browser` mapped (§8), `renewal`, `onWriteFailure`, `authDebug`, `loginTimeoutMs` from the parameters |
| `launcher.ts:441-480` `checkAndSummarise` | settings, masked secrets | settings, `getProvider` with the startup signal (D18), presence only (D25) |
| `StdioServer.ts:34-35` | `setConnectionContext` (reads settings and provider once) | sets the destination source; settings and provider per request |
| `StdioServer.ts:51-67` | fake refusing provider | `inspection_only` refusal of the server's own (D17) |
| `BaseMcpServer.ts:98-129`, `:136-176` | `setConnectionContext*` build a `ConnectionContext` | set the credential source (§4) |
| `BaseMcpServer.ts:193-230` | `getConnection()` | `getConnection(signal)` (§5.2, §5.4) |
| `BaseMcpServer.ts:257` | `async (args) => …` | `async (args, extra) => …` with the request controller, the per-request view (D31), D5, D7, §7.2 |
| `StreamableHttpServer.ts:145-261`, `SseServer.ts:269-393` | listener after setup; `FirstConnectLock.run` | listener first; setup signal; `FirstConnect` (connected set only) (§5.3) |
| `connectionFactory.ts:307-357` | builds and records | unchanged but for the view: `viewFor(connection, signal)` — `makeAdtRequest` with the request's signal and the failure observer, every other member forwarded (D31, §7.2) |
| `credentialSources.ts:33-59` | default branch → basic | refuses, naming the field (D19) |
| `packageSessions.ts:40-61` | record, else the connection's configuration | record, else the consumer's factory, else refused (§4.3) |
| `handleDeletePackage.ts:93-108` | fallback to the caller's connection | the failure is the answer (D21) |
| `utils.ts:229-371` `return_error` | regular expressions over `message` | `failureOf` first; `hostname` read from the DNS error's own property; the `McpError` prefix stripped by plain code (D26) |
| `destinationName.ts` | three regular expressions | plain code, the same rules and words (D26) |
| `src/__tests__/integration/globalSetup.ts`, `helpers/authHelpers.ts` | `browserCallbackStrategy({ browser: 'system' … })` | the 6.0 form, `browser` an `IBrowser` from the mapping |

### 10.3 The exported API, for embedders

- `@mcp-abap-adt/lib/auth`: `IAuthBrokerFactoryConfig` — `browser?: IBrowser`, `browserStrategy`
  with that option, **`renewal` and `onWriteFailure` required**, `loginTimeoutMs?`, `authDebug?`;
  `IDestinations.getProvider(destination, options?: { signal?: AbortSignal })`;
  `describeAuthError` removed, `failureOf` added; `browserCallbackStrategy` and the browser
  mapping re-exported; `settle({ signal? })` in place of `settle(deadlineMs)`, its report unchanged.
- `@mcp-abap-adt/lib/embeddable`: `ConnectionContext` is the source union (§4);
  `EmbeddableMcpServerOptions.freshConnection?` (§4.3).
- `@mcp-abap-adt/core`: `StreamableHttpServer` / `SseServer` constructors unchanged; behaviour as
  §5.3.

## 11. Documentation and migration notes

**`docs/MIGRATION-18.0.md`** (new), for users and for embedders, row by row ("what you had → what
to do"):

- **Users**
  - the first start after upgrading logs in once per `jwt` / `authorization_code` destination:
    every session written before broker 5 reads as unbound (broker README, *Migrating to 5.0.0*);
  - **a `jwt` / `none` destination (a token you hold)** is refused until its session states
    `SAP_ISSUED_FOR` and `SAP_ISSUED_BY` — the note gives the two lines in the broker's documented
    format for the server's `--env` and `sessions/<name>.env` cases, and the alternative of the
    `x-sap-jwt-token` header (a direct provider, not bound); the startup refusal points there
    (D30, §17);
  - editing a destination's files while the server runs is not supported and may combine old and
    new values until the next start: restart after any change (D3);
  - `--browser`: the platform table (§8), unknown names refused, `none` waits, `--browser-program`
    for an executable the table does not name, no `DISPLAY=:0`;
  - no login timeout by default (it was 30 s); `--login-timeout` to state one;
  - no shutdown deadline (it was 30 s): a shutdown waits for its session writes — closing stdin included; a signal after it started or
    `--shutdown-timeout` ends it early, and what that costs;
  - a session write that does not land fails the request (`--session-write-failure=continue` for a
    read-only store, with what it costs);
  - `--renewal=refresh-only` for a deployment that must never open a login;
  - `--auth-debug`, and that no variable turns it on;
  - the startup summary shows presence only;
  - `DeletePackage` with `force_new_connection` no longer falls back to the caller's session;
  - `npm run auth` is gone: install `@mcp-abap-adt/auth-broker-cli` and run `mcp-auth`;
  - what an authentication failure now looks like in a tool result (§7.3).
- **Embedders**
  - `EmbeddableMcpServer`: package creation and locking over RFC and `force_new_connection` need
    `freshConnection`; without it they are refused (they used to rebuild a credential from the
    connection's configuration);
  - `AuthBrokerFactory` / `IAuthBrokerFactoryConfig`: `renewal` and `onWriteFailure` required,
    `browser` an `IBrowser`, `browserStrategy`'s new option, `loginTimeoutMs`, `authDebug`;
  - `IDestinations.getProvider`'s options, and that a signal given to it must be aborted when its
    holder is done;
  - `ConnectionContext`'s new shape; `describeAuthError` → `failureOf`;
  - the chain's own migrations they inherit: auth-providers 6, broker 5, connection 12–14.

**Updated** (each describing the new contract, not the old): `README.md` (auth sections:
"read once per process", the login port line), `server/README.md`, `CHANGELOG.md` (18.0.0, with the
measurements of §14), `docs/user-guide/AUTHENTICATION.md` (browser login, what is written back,
startup errors, shutdown, the new options), `docs/user-guide/CLI_OPTIONS.md`,
`docs/configuration/YAML_CONFIG.md`, `docs/user-guide/CLIENT_CONFIGURATION.md`,
`docs/user-guide/TERMINOLOGY.md`, `docs/installation/INSTALLATION.md`,
`docs/installation/examples/SERVICE_KEY_SETUP.md`, `docs/deployment/DOCKER.md`,
`docs/architecture/ARCHITECTURE.md`, `docs/architecture/CONNECTION_ISOLATION.md`,
`docs/development/tests/TESTING_AUTH.md`, `docs/development/tests/DEBUGGING.md`,
`src/lib/auth/brokerFactory/UNIFIED_BROKER_LOGIC.md`, `src/lib/config/README.md`,
`src/embeddable/docs/ARCHITECTURE.md`, the launcher's help sections (`launcher.ts:89-192`), and
`IServerConfig`'s field comments. `docs/MIGRATION-16.0.md` keeps its history but gets a pointer to
18.0's browser and timeout changes.

## 12. Version and release

**(D29)** All five packages go to **18.0.0** (`lib`, `core`, `compact`, `compact-readonly`,
`compact-modify`): exported types change (`IAuthBrokerFactoryConfig`, `IDestinations`,
`ConnectionContext`, `EmbeddableMcpServerOptions`), the browser option narrows, and what a failure
looks like changes. Release per `docs/deployment/RELEASE.md`: manifests and sibling ranges, the
registry and Glama metadata (`releaseMetadata.test.ts`), CHANGELOG and docs, `npm ci`, build,
`test:check`, `npm test` (binSmoke included), `npm --prefix server test:check` and `test`,
`release:dry` ending `Published: 5  Skipped: 0`. **The server waits for its prerequisites** —
`interfaces-adt-connection` 1.1.0, then `connection` 14.1.0 (§3.1) — and is built and released only
against them as published; every other dependency is on the registry already (§3);
the lockfile is checked for `"link": true` and for anything not resolved from the registry. After
publishing, a clean install of `@mcp-abap-adt/core@18.0.0` outside the repository runs
`mcp-abap-adt --version` and `--help`. The `npm publish` is the user's.

## 13. Tests

**Shape.** Unit suites run in `npm test` (and `npm --prefix server test` for `server/src/__tests__`)
and need nothing outside the process: auth-stores 4 stores in temporary directories, the real
broker 5 and providers 6, a token endpoint the test starts on `127.0.0.1`, and an `IBrowser` fake
that records `open(url, signal)` and, when told, plays the user by requesting the callback URL with
the URL's `state` and a code. **No test launches a program**: the suites that compose strategies
mock `node:child_process` so any spawn fails the test. Every rule a test protects is shown
load-bearing: break it, watch the test fail, revert — the break named under each test below.

### 13.1 Failures reach the user as the chain made them

- One test per source of failure through a real request: a provider's `AuthProviderFailure`
  (token endpoint `400 invalid_grant`), connection's `AuthRefusedError` (system `401` twice →
  `refused-after-renewal`), the broker's `DestinationConfigError` (a `jwt` / `none` without its
  binding), a `credential-refused` inside a handler (observer, §7.2). Each asserts `error`, `kind`,
  `message`, `hint` exactly as `render(kind, facts)` gives them, and no `diagnostics`. *Break:* drop
  step 3 of `failureOf` → the `AuthRefusedError` case answers `unknown`.
- A second copy's failure (a JSON round-trip of an `AuthProviderFailure`) is read with the same
  kind and words.
- Source tests over `src` and `server/src`: no `instanceof` of `AuthRefusedError`,
  `DestinationConfigError`, `AuthProviderFailure`, `SessionWriteFailure`; no `.message` read in
  `src/lib/auth`, `server/src/destinationRequest.ts`, `server/src/shutdown.ts`; no regular
  expression in `src/lib/auth`, `authParameters.ts` and `return_error`. *Break:* reintroduce
  `describeAuthError`'s `instanceof` → red.
- Each §7.4 sentence appears exactly under its condition.

### 13.2 A connection derived from an injected one stays the consumer's

For each of `CreatePackage` (high), `CreatePackageLow`, `LockPackageLow` (RFC) and `DeletePackageLow`
with `force_new_connection` (HTTP and RFC), on an injected connection whose `getConfig()` answers a
`SapConfig` with no usable credential (`authType: 'basic'`, no password):

- **with** `freshConnection`: the factory is called once with the request's signal; the operation
  runs on its connection; that connection is disconnected afterwards; no `BasicAuthProvider` /
  `TokenAuthProvider` is constructed (spied). *Break:* restore the `getConfig()` fallback → a
  provider is constructed and the test fails.
- **without** it: the answer is `fresh_connection_unavailable`, naming `freshConnection`; nothing is
  sent on the injected connection for `DeletePackage`. *Break:* restore the `DeletePackage` fallback
  → the delete is sent on the injected connection.
- A connection the server built still opens its sibling with the same credential object.

### 13.3 A login ends when someone ends it — one case per test

1. **HTTP first connect, disconnect.** The client closes during the login → the login ends
   `aborted`; the port is free (the test binds it); a next client logs in. *Break:* install the
   listener after setup → the login keeps waiting.
2. **SSE `init`, disconnect.** The same for an SSE `GET`; no session is stored.
3. **Two first connects, the second leaves.** Both join one login; the second disconnects; the
   first gets its token; nothing of the second remains.
4. **MCP cancel.** `notifications/cancelled` for the request waiting on a login → the login ends
   `aborted` (only party); the port is free. *Break:* do not pass the signal to `getProvider` → the
   login keeps waiting.
5. **A concurrent request still gets its token.** R1 and R2 wait on one login; R1 is cancelled; R2
   gets its token; R1's tool is not called (D5). *Break:* remove the D5 gate → R1's tool runs.
6. **A later request starts afresh.** After (4) settled, R3 logs in and succeeds; and an R3 sent
   inside the abort window succeeds through the one retry (D7). *Break:* remove the retry → the
   window case fails `aborted`.
7. **Another destination is untouched.** A's login runs while B's waits in the queue; cancelling B
   leaves the queue at once and A completes; cancelling A ends A and B's login starts and receives
   its callback. *Break:* make the queue ignore the signal → B's cancellation waits for A.
8. **A finished request's party is released.** R1 completes normally; R2 starts a login and is
   cancelled → the login ends. *Break:* drop D4's `finally` abort → R2's login keeps waiting.
9. **A session close ends its waits only.** SSE session S1 waiting on a login closes → its wait
   ends; session S2 on the same destination, waiting too, gets its token.
10. **The bound.** `--login-timeout=1` ends a login with the chain's words and the server's
    sentence; without it the same login waits until the test's own abort. *Break:* apply the bound
    to the request instead of the login → a long tool after a login is cut.
11. **Shutdown.** A login in flight at `SIGTERM` ends (`disposed` or `aborted`); the port is free;
    the process exits after flushing.
12. **Every request's signal reaches the connection (D31).** Through the real adt-clients
    (`createAdtClient` over the per-request view), a tool's every `makeAdtRequest` reaches a
    recording connection with `options.signal` being that request's signal — for each of two
    concurrent requests on one stdio connection, its own; the view forwards every other member
    (`getSessionId`, `setSessionType`, the critical section, `getConfig`), survives adt-clients'
    `withRequestTrace` assigning over its `makeAdtRequest`, and the server's registries find the
    connection through it (`openFreshConnection`, `systemKindOf`). An injected connection receives
    no view. *Break:* hand the handler the connection instead of the view → `signal` absent.
13. **A cancelled mutation is never sent (M1, M6; needs connection 14.1.0).** A real
    `AdtOnPremConnector` built by the server, against a local HTTP stand-in: R1 and R2 each `POST`;
    R1 is cancelled while both wait in `rejected()` on one shared login, and — separately — while
    both wait in `authorize()` on a renewal. Asserted on the stand-in's log: no `POST` of R1 after
    its abort; R1 settles `ADT_REQUEST_ABORTED` at the abort and is answered `aborted` (§7.3); R2
    answers `200`. This pins the prerequisite end to end; the boundary-by-boundary tests, RFC
    included, are connection's (§3.1). *Break:* drop the signal from the view → R1's `POST`
    appears after the renewal.
14. **The cancelled caller settles first (M3).** R1 and R2 wait on one shared login in `connect()`
    (stdio, one connection) and in the HTTP pre-dispatch connect (two clients); R1 is cancelled
    while the token endpoint is held: R1's request settles `aborted` before the endpoint is
    released, R2 settles after it with its token; no unhandled rejection is recorded (an
    `unhandledRejection` listener), and R1's own HTTP connection is disconnected once the late
    establishment settles. *Break:* await `connect()` without the race → R1 settles only with R2.

### 13.4 Session writes and renewal

- `'fail'`: a store whose `saveSession` throws `EACCES` → the request answers `unknown`
  `persisting-tokens` with the server's sentence; the next request of the destination is refused
  until the store writes. `'continue'`: the request succeeds.
- Flush at shutdown: a write queued at `SIGTERM` lands before exit, however long the store takes
  (a store held for longer than the old 30 s deadline in fake time); a store that keeps failing gives
  exit `1` and `"<destination>": persisting the tokens failed (unknown error, EACCES)`. No timer is
  armed during a shutdown without `--shutdown-timeout` (fake timers: none pending). A `SIGTERM`
  after the shutdown started exits at once with the pending lines; `--shutdown-timeout=1` ends a held flush at the
  bound with the same lines. *Break:* restore `SHUTDOWN_DEADLINE_MS` → the held store's write is
  abandoned.
- **A client leaving through stdin loses nothing (M7).** stdio, a session write held by the store;
  the stand-in stdin emits `end`, then `close` (as a piped EOF does), then the store releases the
  write: the write lands, then the process exits `0`; `exit` is not called before the write
  settled. A `SIGTERM` after the `end` exits at once with the pending lines. *Break:* count stdin
  `close` as a second trigger → the process exits with the write pending.
- **A discarded refresh token does not come back**: a refresh refused `invalid_grant` discards it;
  shutdown; a new factory over the same files seeds no refresh token and the renewal strategy logs
  in (the token endpoint sees no `refresh_token` grant). *Break:* skip the flush → under a queued
  write the old token is presented.
- `--renewal=refresh-only`: no login is started; the answer is `renewal-declined` with the
  server's sentence. Default: a login.
- The factory refuses to build without `renewal` or `onWriteFailure` (TypeScript and run time).

- **A destination is read once per process.** `settingsFor` called by many requests reads its
  stores once (a counting store), as today; a failed read is not kept and the next request reads
  again.

### 13.5 Debug output

- `authDebug` reaches the broker only from `--auth-debug` / YAML; with `DEBUG_AUTH_LOG`,
  `DEBUG_AUTH_BROKER`, `DEBUG_AUTH_PROVIDERS`, `DEBUG`, `MCP_AUTH_DEBUG` set and the flag absent it
  is off (the broker's config inspected).
- **Nothing goes out:** a run with a token endpoint answering `400` with a secret marker in
  `error_description`, a client secret, and a successful login through the fake browser; stderr,
  the logger, every tool result and every HTTP answer are scanned: no marker, no client secret, no
  token, no `state=`, no authorization URL, no `code=`. With `--auth-debug` the client secret's
  prepared form appears, on stderr only.
- The startup summary prints no character of a secret.
- stdout stays empty under stdio across a login.

### 13.6 What works today

The browser mapping table (pure function, every row and platform, unknown names and platforms
refused); every parameter row (CLI, env, YAML, refusals); `basic` HTTP and RFC (mocked transport),
`snc` (broker builds `SncLogonProvider`), `jwt` / `authorization_code` (stand-in token endpoint),
`jwt` / `none` with and without its binding; `x-sap-*` headers; `SapConfig` refusals (D19);
`EmbeddableMcpServer` with an injected connection; the existing suites updated, not deleted
(`brokerFactory`, `loginLock`, `destinationRouting`, `packageSessions`, `credentialSources`,
`connectionFactory`, `returnError`, `shutdown`, `launcherDestination`).

## 14. Live measurements

Before the release, each recorded with its date and the platform (never a system id) in
`CHANGELOG.md` and `docs/development/tests/TESTING_AUTH.md`. Every browser login is started only
after the user says which browser and profile and is ready.

1. `basic` over HTTP and over RFC, on premise.
2. `jwt` / `authorization_code` on the BTP trial: the first start after the upgrade logs in once;
   a restart reuses the stored session (`--env-path`, and a named destination with `--unsafe`); a
   refresh; `--browser=system` and `--browser=none`.
3. SNC over RFC on Windows (Secure Login Client).
4. Cancellation on the real login: an MCP client cancels a waiting browser login (stdio) and an HTTP
   client disconnects during its first connect — port 61001 is free afterwards and the next login
   succeeds.
5. `--renewal=refresh-only` on the trial: runs on the stored session, refuses when a login would be
   needed.
6. A `jwt` / `none` destination with its binding written as the migration note says.

## 15. Overlap with the parallel debugger work

The debugger investigation (`research/adt-debugger-investigation`) touches `tools/` only so far.
Debugger tools would most likely add handlers and touch the files every tool shares. This change
keeps its footprint there small:

| Shared file | What this change does there |
|---|---|
| `src/embeddable/BaseMcpServer.ts` | the source union, `getConnection(signal)`, the wrapper's `extra`, the per-request view, the D5 check; no change to handler registration or `available_in` |
| `src/lib/connectionFactory.ts` | the per-request view (`viewFor`); transports untouched |
| `src/lib/utils.ts` | `return_error`'s first lines and its two regular expressions; `credentialFromSapConfig` callers unchanged |
| `src/lib/packageSessions.ts`, `handleDeletePackage.ts` | the fresh-connection registry; the fallback removed |
| `src/lib/handlers/interfaces.ts` (`HandlerContext`) | **untouched** — the registry and the view avoid it |
| `src/lib/requestContext.ts` | **untouched** |
| `tools/` | untouched |

A long-running debugger request (a listener waiting minutes for a breakpoint) is unaffected by the
login bound (§5.7 bounds the login, not the request) and is cancelled by its MCP request's signal
like any request.

## 16. Holds throughout: how each holds

| | How |
|---|---|
| H1 The consumer composes; nobody guesses | renewal, `onWriteFailure`, the bound, the browser and `authDebug` are stated in the server's parameters and the factory's required options (D9–D12, D24); the factory adds no default collaborator; `credentialFromSapConfig` and `--browser` refuse instead of guessing (D19, D9); `DeletePackage` no longer falls back (D21) |
| H2 Nothing goes out that should not | §7.3 (no diagnostics, facts, messages to clients), §9 (no secret fragment, no `message`, no environment-driven `authDebug`), the URL only on stderr from the providers, nothing on stdout; tested in §13.5 |
| H3 A credential stays bound | providers only from the broker, read once per process; editing a destination's files while the server runs is documented as unsupported, restart after any change (D3, measured reason M4, M5); direct providers never reach a store; per-request and per-session holders (§4.2); an injected connection never re-authenticated (§4.3) |
| H4 No built-in timeouts of the chain's making | no default bound anywhere: the login bound (D10) and the shutdown bound (D33) exist only when the user states them; the 30 s shutdown deadline and the drain timer are removed |
| H5 One implementation of each rule | failures read by auth-errors (§7.1); the build shared by the broker (no server provider cache, no `FirstConnectLock` queue); the refresh state the broker's `refreshStatePersistence`; cancellation at the send boundaries the connection's (§3.1), not a second gate in the server; the browsers auth-providers' factories (§8). The cross-destination login queue is the server's own because the chain has none (§5.6) |
| H6 Registry only | every range in §3 is published — the two prerequisites of §3.1 before the server is built against them; release checks in §12 |
| H7 No regular expressions over untrusted input | D26: `destinationName`, the port and seconds parsers, `errorClassOf`, `return_error`, `notStoredOf`'s removal; a source test (§13.1) |

## 17. Decisions for the user

The spec is written on each recommendation.

| # | Decision | Options | Recommendation and reason |
|---|---|---|---|
| D12 | `onWriteFailure` default | `fail` / `continue` | **`fail`**, with `--session-write-failure=continue` for a read-only store: the only mode in which a failed write is visible and a discarded refresh token is not silently brought back; `continue` would warn to a logger that is silent by default |
| D16 | an auth failure inside a handler on an **injected** connection | connection's words only, no `kind` / ask adt-clients to keep the failure / wrap the injected connection too | **words only**: the goal forbids wrapping the consumer's connection, and adt-clients dropped the thrown value deliberately (interfaces-adt 31). Server-built connections get the full failure (§7.2) |
| D22 | who closes the consumer's fresh connection | the server calls `disconnect()` / the consumer gets a `release(connection)` callback | **`disconnect()`**: the session's lifetime is the operation's (that is why it is fresh); the consumer keeps authentication, cancellation and persistence |
| D23 | `FirstConnectLock`'s queue | remove it (the chain shares the login) / keep it, made cancellable | **remove it**: two implementations of one rule otherwise (H5), and a queue is one more wait to cancel. The goal names the queue; with no queue its requirement holds trivially and §13.3 test 3 covers the case |
| D27 | "server text" | text of an authorization server or IdP / also ADT answers | **the former**: ADT answers are the tools' data, and removing them would break every tool's error reporting |
| D30 | `jwt` / `none` destinations under broker 5 need `SAP_ISSUED_FOR` / `SAP_ISSUED_BY` | the migration note gives the lines to write by hand / the server gains a command that writes them with `bindingOf` / auth-broker-cli gains `--token` for `jwt` / `none` (its own change, as it has `--cookie` for `saml` / `none`) | **the migration note now, and ask the CLI for `--token`** in its own repository: no tool writes the binding for a held token today, and the server writing it would bypass what the binding protects. Until then, `x-sap-jwt-token` is the unbound alternative over HTTP |
| D3 | a destination's files edited while the server runs | **decided by the user: (c) document, don't engineer** — the server reads a destination once per process as today, and the docs say editing while running is unsupported, may combine old and new values (M4, M5), restart after any change | — |
| D31 | stopping a cancelled request at the connection's send boundaries | **decided by the user: (a) a per-request signal in connection, a prerequisite (§3.1)**; the server passes each request's signal through a per-request view | — |
| D34 | what connection answers for an aborted request | a code of its own, `ADT_REQUEST_ERROR.ABORTED` in interfaces-adt-connection / auth-errors' `interactive-login` `aborted` (no contract change, but its words say "the authorization was aborted" for a request that was never about authorization, and an RFC open is not an authentication step) | **its own code**: the abort is the caller's, not an authentication outcome; the server reads `code` structurally, as it reads `ADT_SESSION_ERROR` |
| D33 | the shutdown bound | none by default; forced only by a `SIGTERM` / `SIGINT` after the start or `--shutdown-timeout` (stdin `end` / `close` never force) / keep 30 s | **none by default**: H4; the cost of ending early is documented with the option |
| D9 | `--browser` names outside the table | refuse / open the default browser, as 5.x did | **refuse**: H1; `--browser-program` names any other program |
| D21 | `DeletePackage`'s fallback when no fresh connection can be had | answer the failure / keep falling back to the caller's session | **answer the failure**: H1, and on an injected connection the fallback would hide the refusal the goal requires |

### Requests to other repositories

**Prerequisites (decided by the user: option a)** — the server waits for each, in this order:

| # | Repository | Release | Contract |
|---|---|---|---|
| 1 | `mcp-abap-adt-interfaces` | `@mcp-abap-adt/interfaces-adt-connection` 1.1.0 (and 2.1.0) | `IAbapRequestOptions.signal?: AbortSignal \| undefined`; `ADT_REQUEST_ERROR.ABORTED = 'ADT_REQUEST_ABORTED'` (§3.1) |
| 2 | `mcp-abap-connection` | `@mcp-abap-adt/connection` 14.1.0 | the signal checked at every send boundary on HTTP and RFC; its waits for a request raced for that caller only; an aborted request sends nothing more and rejects `ADT_REQUEST_ABORTED`; tests per boundary with two callers (§3.1) |
| — | `mcp-abap-adt-clients` | none | forwards the options object unchanged; the server adds the signal below it (D31) |

**Possible later improvements** — not prerequisites; each its own change in its repository:

| Repository | Request | Contract | What it would replace |
|---|---|---|---|
| `mcp-abap-adt-auth-stores` | stores over content read once | `EnvDestinationStore.fromContent(text, options)`, `AbapServiceKeyStore.fromKey(json, options)`, `XsuaaServiceKeyStore.fromKey(json, options)` — the same projections as the file-backed stores, computed from content the caller read once, reading no file | a possible later improvement: the server could read each file once and derive every projection from it, so an edit while running could no longer combine two states |
| `mcp-abap-adt-auth-broker` | which means a provider was built from | `getProvider(d, { signal })` also answers, or a sibling `getProviderWithMeans` answers, `{ provider, means }`: the `IConnectionConfig` snapshot the build read, the same object for the life of that provider | a possible later improvement: picking up file changes without a restart, the settings tied to the provider |
| `mcp-abap-adt-auth-broker` (auth-broker-cli) | write a held token with its binding | `mcp-auth --token <token>` (from a file or stdin, never an argument in history) for `jwt` / `none`, as `saml2-pure --cookie` does for `saml` / `none`: writes `SAP_JWT_TOKEN`, `SAP_REFRESH_TOKEN=` and `bindingOf(means)` | D30's hand-written lines in the migration note |

