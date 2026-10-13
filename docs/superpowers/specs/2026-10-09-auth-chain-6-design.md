# The server on the 6.0.0 auth chain — design spec

Answers [`../2026-10-09-auth-chain-6-goal.md`](../2026-10-09-auth-chain-6-goal.md) (approved at
`f5c64bc8`). Every *Holds throughout* item of the goal (H1–H8 below, in its order) binds this
spec; §17 says how each holds. Every decision is marked **(D*n*)** where it is made, with its
reason; decisions the user has taken are recorded as such in §18, beside the questions still open
for the user. Numbers of decisions kept from earlier drafts of this spec are kept; numbers of
decisions that no longer exist are not reused.

File and line references are to this worktree's code at `d0fa6d5c` (the server's own `src/…`,
`server/src/…`, `compact/…`, `docker/…`) and to the published packages read from their
repositories at their release commits: auth-broker 5.0.1 (`5ec4e5f`), auth-providers 6.0.1
(`6ea3c5f`), auth-errors 2.2.0 (`40bd4a4`), connection 14.0.1 (`6f6bb41`), auth-stores 4.0.0
(`2dbced7`) and 5.0.0 (`9894674`), adt-clients 25.0.1 (`342b8f1b`), interfaces-adt-connection 2.0.0 / 1.0.1
(`5954a9f`). The debugger's held state, the instance pool and the idle bound (§2, §3.8) are read
from this branch after main (#288, the debugger #290–#292) was merged into it (`e53028f0`, A0).

## 0. Contents

1. Traceability: goal → sections
2. What the code and the chain do today, and what was measured
3. Packages and dependencies
4. Credentials, per package
5. Cancellation
6. Renewal, session writes, shutdown (stdio)
7. Failures: how they are read and what an MCP client sees
8. The browser (stdio)
9. Debug output and logging
10. Options per binary, and every API change
11. Docker images and release artifacts
12. Documentation and migration notes
13. Version, release and how the change is committed
14. Tests
15. Live measurements
16. The debugger, merged from main
17. Holds throughout: how each holds
18. Decisions taken by the user, and questions for the user

## 1. Traceability: goal → sections

| Goal item | Answered in |
|---|---|
| The server is split by transport into packages, one mode each; SSE stays in its own package; compact one package per transport | §3; D35, D36, D37, D48, D49, D50 |
| Success: each package has only its own options and its own credentials | §3, §4, §10; D35, D38, D39, D48 |
| Success: failures reach the user as the chain made them | §7; D14, D15, D17, D28, D56 (D45, D46 withdrawn) |
| Success: a connection derived from an injected one stays the consumer's | §4.3; D20–D22 |
| Success: a request ends when its client ends it, in every mode | §3.1, §5, §6.4; D4, D5, D7, D8, D10, D32, D55, D56 (D31, D34, D40 withdrawn) |
| No cancellation against ABAP; stateful only for lock, unlock and activation; listed long tools take a `timeout` on their own connection (D56) | §5.1, §5.7, §5.8, §6.4, §15; D56 |
| The low tool set leaves the full binaries; compact is its analogue (D56) | §3.9, §10.1, §12; D56 |
| Success: session writes are the server's stated choice | §6.2–§6.4; D12, D33 |
| Goal: an SSE connection's instance is disposed when it closes; SSE takes part in shutdown | §6.4; D33, D51 |
| Goal: state a tool holds keeps its holder; the pool moves into the HTTP package as it is | §2, §3.8; D33, D39, D51, D52 |
| Success: renewal is the server's stated choice | §6.1; D11 |
| Success: debug output is opt-in and safe | §9; D24–D27 |
| Success: what works today keeps working, or the migration note says what to do | §3.8, §8, §10, §12; D9, D19, D21, D39, D52, D53, D54 |
| Success: Docker images and release artifacts follow the split | §11; D41 |
| Success: one release | §13; D29, D42 |
| Success: measured on real systems before release | §15 |
| Open 1 — the HTTP and SSE packages, compact per transport: names, options, shared helpers | §3.2, §3.5, §3.6, §10.1, §10.2; D35, D37, D38, D48, D49, D50 |
| Open 2 — what lib exports after the move | §3.4; D36 |
| Open 3 — the login bound | §5.6; D10 |
| Open 4 — how cancellation reaches the broker, the providers and the connection; `LoginLock` | §3.1, §5; D4, D8, D32, D55, D56 (D31 withdrawn) |
| Open 5 — renewal and failed writes outside `--unsafe` | §6; D11, D12 |
| Open 6 — what an MCP client sees per `kind` | §7.3, §7.4 |
| Open 7 — the browser choice | §8; D9 |
| Open 8 — the release and the migration notes | §12, §13; D29, D42 |

## 2. What the code and the chain do today, and what was measured

The facts the design changes, each checked against the file:

- **One package serves every transport.** `@mcp-abap-adt/core` (`server/`, bin `mcp-abap-adt`)
  starts stdio, Streamable HTTP or SSE by `--transport` / `MCP_TRANSPORT`
  (`server/src/launcher.ts:591-677`), with `StdioServer.ts`, `StreamableHttpServer.ts`,
  `SseServer.ts`; `@mcp-abap-adt/lib` (the root) holds the tools, the embeddable server **and** the
  whole destination layer (`src/lib/auth/*`: the broker factory, stores, handlers, `LoginLock`,
  the counted provider), so every package depends on auth-broker and auth-stores through lib
  (`package.json`). `compact` calls core's `main` with its own groups (`compact/src/launcher.ts`)
  and so serves every transport too.
- **Dependencies.** lib declares `auth-broker ^4.1.0`, `auth-providers ^5.4.0`,
  `auth-stores ^3.3.0`, `connection ^11.0.0`, `interfaces-auth ^3.2.0`,
  `interfaces-auth-broker ^1.2.0`, `interfaces-auth-sap ^2.0.0`; no `auth-errors`. The script
  `"auth": "npx sap-abap-auth auth"` (`package.json:116`) names the command connection 14 removed.
- **HTTP and SSE serve destinations**: `x-mcp-destination` with `--allow-destination-header`, the
  default destination, a first connect serialized by `FirstConnectLock`
  (`server/src/destinationRequest.ts:68-96`; `StreamableHttpServer.ts:205-209`,
  `SseServer.ts:325-329`) — the browser login of one person's destination, for every client.
- **Failures are read by class and by text.** `describeAuthError` decides with `instanceof
  DestinationConfigError` and `instanceof AuthRefusedError` and returns the latter's `message`
  (`src/lib/auth/errors.ts:97-118`); `notStoredOf` matches `AggregateError` entries with the
  regular expression `ENTRY` (`brokerFactory.ts:51-68`); `errorClassOf` reads a constructor name
  through one (`errors.ts:55-61`).
- **No signal reaches any login or request.** `getProvider(destination)` takes no options
  (`brokerFactory.ts:189`), nor `flush()` (`:217`); the tool wrapper takes `args` only
  (`src/embeddable/BaseMcpServer.ts:257`); `createAdtClient` (`src/lib/clients.ts:34-51`) builds
  every client the handlers use — 264 calls in 259 files — with no signal.
- **Logins are serialized process-wide** by `LoginLock` (`src/lib/auth/loginLock.ts:16-44`); a
  queued login cannot leave the queue.
- **Unminted refusals.** The closed provider gate answers `{ reason: 'the server is shutting
  down' }` (`src/lib/auth/countedProvider.ts:24-27`); inspection-only mode answers `{ reason:
  INSPECTION_ONLY }` (`server/src/StdioServer.ts:51-67`). connection 12+ turns either into
  `connection` `provider-threw`, "the credential provider failed" (connection
  `docs/MIGRATION-12.0.md`).
- **A fresh connection is rebuilt from an injected connection's configuration.**
  `openFreshConnection` (`src/lib/packageSessions.ts:40-61`) uses the factory's record when the
  server built the connection, else `getConfig()` / `config` of the connection and
  `credentialFromSapConfig(settings)` (`:45-47`, `:55`). Callers: `CreatePackage` high
  (`src/handlers/package/high/handleCreatePackage.ts:134`) and low
  (`src/handlers/package/low/handleCreatePackage.ts:160`) through `inOwnSessionOverRfc`,
  `LockPackage` (`…/low/handleLockPackage.ts:91`) through `connectionForPackageLock`,
  `DeletePackage` with `force_new_connection` (`…/low/handleDeletePackage.ts:93-108`), which on
  any failure logs the error's `message` and falls back to the caller's connection.
- **`credentialFromSapConfig` guesses**: an `authType` outside its cases — `snc` included — gets a
  `BasicAuthProvider` with `''` (`src/lib/credentialSources.ts:53-58`); a `jwt` without a token
  `TokenAuthProvider.fixed('')` (`:43`).
- **Secrets in a log line**: the startup summary keeps the first and last four characters of the
  password, token and refresh token (`server/src/launcher.ts:451-466`,
  `src/lib/utils.ts:1764-1781`); SSE logs a failed POST's `message` and the whole error
  (`SseServer.ts:436-439`); `closeQuietly` (`packageSessions.ts:74-78`) and `DeletePackage`'s
  fallback (`handleDeletePackage.ts:101-105`) log a `message`.
- **Debug from the environment**: the broker's logger is stderr when `DEBUG_AUTH_LOG=true`
  (`launcher.ts:50-51`); nothing sets `authDebug`.
- **Bounds**: the shutdown deadline `SHUTDOWN_DEADLINE_MS = 30_000`, "the callback strategy's
  login timeout" (`server/src/shutdown.ts:22-23`), a timeout auth-providers 6 no longer has.
- **The browser is a string** (`src/lib/auth/IAuthBrokerFactoryConfig.ts:26`;
  `src/lib/config/authParameters.ts:75-82`).
- **Regular expressions over untrusted input** in files this change touches:
  `destinationName.ts:9`, `:21`, `:31`; `authParameters.ts:195`; `utils.ts:249-250`, `:320-321`,
  `:366`.
- **Held state (main's debugger, lib 17.2.x).** A tool may keep state between calls in its server
  instance (`InstanceState`, `src/lib/state/`): the debugger's session (`DebugHandlersGroup` with
  `--exposition=…,debug`; compact's four verbs, `compact/src/debug/`, with `debug` beside `ro` /
  `rw`) holds a listener and connections of its own, opened through `openFreshConnection` from the
  connection of the call that started it (`src/lib/debugger/ports.ts`, which builds `AbapDebugger`,
  `AmdpDebugger` and `AdtExecutor` directly, not through `createAdtClient`). `BaseMcpServer`
  exposes `stateHandle`, `holdsState()`, `dispose()` (undoes the held state; callable again — each
  call retries what was left), `shutdownState()` (dispose, settle, once more, settle; answers what
  is left) and `idle()` (every tool call of the instance settled). Held state ends by its stop
  tool, by the host, or by **the idle bound**: `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES` /
  YAML `state-idle-minutes`, whole minutes from 30 to 35 791, default 30, counted only while no
  tool call of the instance runs (`src/lib/state/idleBound.ts`, `src/lib/config/stateIdleMinutes.ts`)
  — the project owner's one exception to "no timeouts" (`docs/user-guide/DEBUGGER.md`, *What ends a
  session*). Every transport hands `stateIdleMinutes` and a `stateLogger` (stderr) to its
  instances (`server/src/launcher.ts`).
- **Who keeps the instance.** stdio: the process; its shutdown awaits `closeInstanceState(server)`
  (`server/src/stateClose.ts`: `shutdownState()`, leftovers thrown) before the factory's settle, so
  the provider gate is still open while the state is undone. SSE (`sse/src/SseServer.ts`): one
  instance per connection; a close removes the session from the map, calls `transport.close()` and
  `server.close()` unawaited, and tracks `server.shutdownState()` in `closingSessions`, its
  leftovers on the state logger; `stop()` shuts down the state of every open session and awaits the
  closing ones, with no timer, and rejects with what was left — it neither aborts nor awaits running
  tools, and ends no stream; the session enters the map before `await server.connect(transport)`,
  the `close` listener is installed after it, and a failed `connect` deletes the entry without
  shutting the state down. Streamable HTTP (`http/src/StreamableHttpServer.ts`,
  `http/src/InstancePool.ts`): **the instance pool** — a `tools/call` whose arguments carry
  `state_handle` is served by the instance that handle names (an unknown handle gets a new instance,
  which answers that the state is not available), any other request by a new instance; one request
  at a time per instance (a lease); every request sets its own connection context from its own
  headers, also on a kept instance, and awaits its instance's `idle()` before giving it back; after
  the request the instance is kept while it holds state, else disposed; a disposal that fails keeps
  the instance for a retry; the idle bound's stop empties the state and the pool evicts the instance
  (`onEmpty`); a JSON-RPC batch carrying `state_handle` is answered `400`; `stop()` closes the
  listener, stops admission (`503`), awaits running requests and disposals, disposes every held
  instance, settles, retries once and rejects with what was left, each instance named by an
  ordinal, never by its handle. The handle is a bearer secret: no owner, no check of the caller, no
  limit of the server's (`InstancePool.ts`; `DEBUGGER.md`: "treat the `state_handle` like a
  password").
- **The debugger's ids**: `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` (the request scope; SSE:
  the opening request), then `SAP_DEBUG_TERMINAL_ID` / `SAP_DEBUG_IDE_ID` of the destination's
  `.env`, then the environment (`src/lib/debugger/ids.ts`, `src/lib/requestContext.ts`,
  `server/src/auth/destinationStores.ts`).
- **Docker** (`docker/Dockerfile`): installs core and compact from npm, runs `mcp-abap-adt
  --allow-destination-header` over HTTP (`MCP_TRANSPORT=http`), mounts `service-keys/` and
  `sessions/` under `AUTH_BROKER_PATH=/app`, checks `/mcp/health`; `docker-compose.yml` mounts
  `./service-keys`; `docker-compose.headerless.yml` runs the same image with no destination;
  `Dockerfile.inspect` runs core over stdio behind `mcp-proxy` for Glama. CI builds the image from
  the registry and runs `--version` of both bins (`.github/workflows/ci.yml:178-187`).

What the chain does that matters here:

- **`AuthRefusedError` is not read by `readFailure`**: it carries the minted error in `refusal`
  (connection `src/connection/authErrors.ts:24-39`); `classify` reads a carrier's `error`, never
  `refusal` (auth-errors `src/classify.ts:113-127`).
- **adt-clients drops the thrown value**: a request that throws without a response becomes
  `IAdtError { origin: 'connection', message }` (`adt-clients dist/utils/adtResponse.js:84-96`).
- **adt-clients builds its requests' options and passes them to the connection unchanged**: 460
  `makeAdtRequest` calls in 293 files of `src`; `AdtClient`'s constructor wraps the connection once
  with `withRequestTrace`, which calls `base(request)` with the object it was given
  (`src/utils/requestTrace.ts:84-121`, `src/clients/AdtClient.ts:941-951`). No request carries a
  signal, and the client has no option to give one.
- **A provider's moment waits on all its parties** (auth-providers
  `src/providers/BaseTokenProvider.ts:415-440`); `getProvider(d, { signal })` attaches its signal
  as a party, released only by its abort (broker README, *Cancellation*).
- **The MCP SDK aborts every in-flight handler's signal** on `notifications/cancelled` and when its
  transport closes (`@modelcontextprotocol/sdk` 1.32.0 `dist/cjs/shared/protocol.js:182`,
  `:266-270`).
- **The connection reads no signal** in any moment or request (`IAbapRequestOptions` of
  interfaces-adt-connection 1: `url`, `method`, `timeout`, `data`, `params`, `headers`). An RFC
  call can open a conversation of its own and send only then (`RfcTransport.ts:397-470`:
  `carryOnKept` / `carryOnThrowaway` → `openOwn` → `loggedOn` → `logon`, `conversation.open()`,
  then `carry`). It mints nothing for an abort; its codes are `ADT_SESSION_ERROR`'s.

**Measured on the published packages** (2026-10-09, Linux, Node 26.7.0, a scratch install of
connection 14.0.1, auth-providers 6.0.1, auth-broker 5.0.1, auth-stores 4.0.0, auth-errors 2.2.0
outside the repository; each becomes a test in §14):

- **M1 — a cancelled request's mutation is resent after a renewal.** Two `POST`s on one
  `AdtOnPremConnector` against a local stand-in answering `401` to the old token; `rejected()`
  waits on one shared login; the first request is cancelled; the login completes: both are resent
  and answered `200` (`AbstractAbapConnection.ts:1489-1521` reads no signal).
- **M2 — a provider-side gate stops that resend over HTTP only**: the gate in `authorize()` keeps
  the cancelled request from being resent, but it sees only provider calls — not an RFC
  conversation's own logon and open. Superseded by the connection prerequisite (§3.1).
- **M3 — a cancelled party keeps waiting in a moment**: a `ClientCredentialsProvider` with two
  parties and a held token endpoint; the first party's `prepare()` stays pending until the endpoint
  answers (+700 ms); a race of it against the first party's signal settles at the abort (+200 ms).
- **M4 — two equal settings reads do not tie a provider to them**: the file says A, then B for
  `getProvider`, then A; both reads answer A; the provider presents `userB:pw-userB`.
- **M5 — means and client can come from two states of the file**: a `jwt` /
  `client_credentials` destination whose file changes after the first `getConnectionConfig`: the
  server connects to A's URL and presents B's token (`EnvDestinationStore.readFile` per
  projection; the broker reads `means` and `client` apart).
- **M6 — `authorize()` waits on a renewal, and its late Ok sends a cancelled mutation**: an
  entry-only check lets the cancelled request go at +505 ms; only a race and a second check stop it.
- **M7 — a piped stdin's EOF emits both `end` and `close`** (Node 26.7.0); `installShutdown`
  listens to both (`server/src/shutdown.ts:94-97`).
- **M8 — a `jwt` / `none` destination without `SAP_ISSUED_*` is refused** (2026-10-10): an
  `--env`-style file (`EnvDestinationStore.forFile` + `EnvFileSessionStore`) stating
  `SAP_AUTH_TYPE=jwt`, `SAP_GRANT_TYPE=none`, `SAP_JWT_TOKEN`, no binding: `getProvider` throws
  `DestinationConfigError` naming `issuedBy` ("the credential in the session is not bound to this
  destination's means", auth-broker `src/destinations.ts:338-379`, `handedOverProvider`). With the
  two lines `bindingOf(means)` answers added, the provider presents `Bearer <token>`. Nothing in the
  chain writes them for a held token: the CLI does so for `saml` / `none` only (`--cookie`).
  **What it led to** (decided by the user, §18): not a broker change (D30, auth-broker 5.1.0, is
  withdrawn) but **`jwt` / `none` leaves stdio** (D53) — a token you hold is sent in
  `x-sap-jwt-token` to the HTTP or SSE package — and **only the chain's own session format is
  read** (D54): auth-stores 5.0.0 refuses a record not of its format, a credential without both
  binding keys included, so a hand-written `SAP_JWT_TOKEN` file is refused by the store before
  the broker sees it.

## 3. Packages and dependencies

### 3.1 Prerequisites in other repositories

*(History — superseded by D56, below.)* **Decided by the user: option (a)** — the per-request signal is the connection's to honour, at
every boundary it owns; the server passes it and waits for the releases. The signal reaches a
consumer's connection only through adt-clients (the one code between the tools and a connection,
§2), and adt-clients' options and failures are contracts of interfaces-adt. No broker release is
a prerequisite (D30 withdrawn, §18). All of it targets **the current lines**: the
user's debugger work moved them — `@mcp-abap-adt/interfaces-adt` 13.1.0 is published ("debugger
contracts", tag `interfaces-adt-v13.1.0`, on `interfaces-adt-connection ^2.0.0`), and adt-clients'
open PR #207 (`feat/debugger`, "AbapDebugger", from a fork) is still on 25.0.1 with
`interfaces-adt ^12`. Nothing below needs the 1.x / 12.x lines, so nothing is mirrored there.

**Superseded by D56 (§18): the per-request signal is removed from the whole chain.** The releases
below (items 1–4) were specified, and items 1–3 published, on 2026-10-12; the signal is now removed
by majors, and **the server's prerequisites are the removal chain**, each published before C2
takes it (H7):

| Package | Version | What |
|---|---|---|
| `@mcp-abap-adt/interfaces-adt-connection` | 3.0.0 | no `IAbapRequestOptions.signal`, no `ADT_REQUEST_ERROR` |
| `@mcp-abap-adt/interfaces-adt` | 16.0.0 | no `IAdtClientOptions.signal`, no `IAdtError.refusal`; on interfaces-adt-connection 3 |
| `@mcp-abap-adt/connection` | 16.0.0 | no signal checks, no `IAdtEstablishContext.signal`, no `ADT_REQUEST_ABORTED`; `disconnect()` resolves once the logoff has been **written** to the socket, not answered |
| `@mcp-abap-adt/adt-clients` | 31.0.0 | moves to those contracts; B5 (30.1.0, the signal per request and `refusal`) is discarded |

So the server takes nothing of the signal: no `IAdtError.refusal` (an auth failure inside a tool
reaches the model with the connection's own message, §7.2), no `ADT_REQUEST_ABORTED` (D34
withdrawn), no signal on any request it sends — the shared system-context lookup's included
(D44, §5.2). adt-clients' "releases are never cancelled" is gone with the signal; a lock is
released by its session's logoff (§6.4). The text below (items 0–4, the order) is history: what
was specified and built before D56.

**The debugger releases land first; the prerequisites build on them:**

0. **The debugger releases (the user's, already in flight)**: interfaces-adt 13.1.0 (published);
   adt-clients with #207 merged and released on interfaces-adt 13 — **26.0.0** (a major: moving to
   interfaces-adt 13 / interfaces-adt-connection 2 changes the `makeAdtRequest` generic defaults
   from `any` to `unknown`, which interfaces-adt-connection 2.0.0's notes measured as 8 errors in
   adt-clients).
1. **`@mcp-abap-adt/interfaces-adt-connection` 2.1.0** (`mcp-abap-adt-interfaces`; a minor):

   ```ts
   export interface IAbapRequestOptions {
     // … unchanged …
     /** The caller no longer needs this request: nothing more of it is sent. */
     signal?: AbortSignal | undefined;
   }
   export const ADT_REQUEST_ERROR = {
     /** The request's signal aborted before it was sent, or before a resend. */
     ABORTED: 'ADT_REQUEST_ABORTED',
   } as const;
   ```
2. **`@mcp-abap-adt/interfaces-adt` 13.2.0** (`mcp-abap-adt-interfaces`; a minor;
   `interfaces-adt-connection ^2.1.0`). **(D43)** The options belong to the contract the client's
   constructor declares — `IAdtClientOptions` and `IAdtError` live here
   (`packages/interfaces-adt/src/adt/IAdtClientOptions.ts:18-27` at `interfaces-adt-v13.1.0`) — so
   they are added here, not as an adt-clients-local type: a consumer type-checks its options
   against the contract it already imports, and another implementation is held to the same fields.

   ```ts
   export interface IAdtClientOptions {
     // … unchanged …
     /** Read at each request: a signal, or a function answering the signal for the request being sent. */
     signal?: AbortSignal | (() => AbortSignal | undefined) | undefined;
   }
   export interface IAdtError {
     // … unchanged …
     /**
      * The authentication refusal the request failed with, as the connection threw it:
      * the thrown value's own `refusal` (AuthRefusedError) or `error` (AuthProviderFailure),
      * unchanged; read it with @mcp-abap-adt/auth-errors' classify. Never present for an
      * answer of SAP (a 403 with an ADT message is an ADT error, not a refusal).
      */
     refusal?: unknown;
   }
   ```
3. **`@mcp-abap-adt/connection` 15.0.0** (`mcp-abap-connection`; **a major**, on
   `interfaces-adt-connection ^2.1.0`). connection re-exports `AbapConnection = IAbapConnection`;
   on interfaces-adt-connection 2 the alias's `makeAdtRequest` answers `IAdtWireResponse<unknown,
   unknown>` by default instead of `any`, so a consumer reading `answer.data.field` through the
   alias stops compiling — a breaking change of connection's own exports, released as such, with
   no compatibility shim. connection's `docs/MIGRATION-15.0.md` (owed by that repository) says
   what a consumer does: name the type (`makeAdtRequest<T>(…)`, `IAdtWireResponse<T>`) or narrow
   `unknown`; and documents the signal below.
   - **the request's signal is checked at every send boundary, on HTTP and RFC**: before the first
     send; after `authorize()` answers; after the logon — `establish()` and, over RFC,
     `conversation.open()` in `openOwn` / `loggedOn`, kept and throwaway conversations alike;
     before calling `rejected()` and after it; before every resend, the CSRF recovery's included.
     Aborted → nothing more of the request is sent; it rejects with an error whose `code` is
     `ADT_REQUEST_ERROR.ABORTED`, in fixed words; a conversation opened for it alone is closed;
   - **its waits for a request race the request's signal, for that caller only** —
     `authorize()`, `rejected()`, the logon, `open()`; the shared work runs on for every other
     caller; a late answer to the aborted caller is handled and dropped;
   - **a request already sent is not recalled**; **without a signal**, 14.0.1's behaviour;
   - **tests**: HTTP and RFC (through its conversation seam), two callers on one connection, one
     cancelled at each boundary in turn: no mutation of the cancelled caller reaches the endpoint
     after its abort, it rejects `ADT_REQUEST_ABORTED` at the abort, the other succeeds, no
     unhandled rejection; each with the check removed as the break.
4. **`@mcp-abap-adt/adt-clients` 26.1.0** (`mcp-abap-adt-clients`; a minor on top of the debugger
   release 26.0.0; `interfaces-adt-connection ^2.1.0`, `interfaces-adt ^13.2.0`):
   - **the signal**: every request an `AdtClient` — every client, facade, runtime and debugger
     client it hands out — sends carries `signal` in its `IAbapRequestOptions`: the client's
     signal, or what its function answers **at the moment the request is sent**; held per client,
     never written onto the shared connection; `getSystemInformation(connection, { signal? })` and
     every standalone function that sends takes it too;
   - **releases are never cancelled**: a request adt-clients sends to undo what an operation
     acquired — `withLock`'s release, `LockRegistry.unlockAll`, an unlock after a failed step, a
     debugger session's detach — is sent **without** the signal;
   - **the structured failure is kept**: `recogniseFailure` copies the thrown value's own `refusal`
     or `error`, unchanged, to `IAdtError.refusal`, and an error adt-clients throws (`orThrow`, its
     own guards) carries the same as an own `refusal`; an `AdtSAPError` (SAP answered — a 403 with
     an ADT exception included) never gets one;
   - an aborted request is the connection's `ADT_REQUEST_ABORTED`, kept as the failure's `code`;
   - **tests**: two clients over one connection with distinct signals; a function signal read per
     request; a cancel between lock and update sends the unlock and not the update; an
     `AuthRefusedError` and an `AuthProviderFailure` reach `IAdtError.refusal` as the same objects;
     a 403 with an ADT body carries no `refusal`.
5. ~~**`@mcp-abap-adt/auth-broker` 5.1.0** — bind an unbound handed-over credential (D30)~~ —
   **withdrawn** (§18): a handed-over token leaves stdio (D53), and a session record without its
   binding is not of the chain's format (D54), so nothing is left for the broker to bind. The
   binding rule stays auth-broker 5.0.x's: a token to ABAP carries both `issuedFor` and
   `issuedBy`, an XSUAA token `issuedBy` only (XSUAA has no system URL), basic none.

**Already published, taken as they are** (no change of ours is a prerequisite):
`@mcp-abap-adt/auth-stores` **5.0.0** — a store validates the record it holds against its own
format and refuses one that is not of it with `StorageError` (`code` `STORAGE_ERROR`, `reason:
'record-format'`), in fixed words naming the store and the destination and ending "regenerate it
with mcp-auth"; it never composes a legacy binding; a record with no token and no cookies is no
session. auth-broker 5.0.1 passes that error unchanged to the caller of `getProvider` /
`getToken`. A broker / CLI change onto auth-stores 5 is in progress in those repositories; if
**the auth-broker / auth-broker-cli releases on auth-stores 5** are published before C2, the
server takes them there (checked with `npm view`), and waits for nothing if they are not.

**Order** (history; D56's order is interfaces-adt-connection 3.0.0 → interfaces-adt 16.0.0 and
connection 16.0.0 → adt-clients 31.0.0 → this server's 19.0.0): 0 (debugger releases) → 1 → 2 → 3
(on 1) and 4 (on 1, 2 and 26.0.0) → this server's 19.0.0. Each is published before the next is built against it (H7). **The
server's own move to interfaces-adt 15 / interfaces-adt-connection 2 comes with it** (main's
18.0.0 and the merge of main took interfaces-adt `^15.1.0`, adt-clients `^29.1.0`, connection
`^15.0.1`): lib's ranges become the removal chain's (D56: interfaces-adt `^16.0.0`, interfaces-adt-connection `^3.0.0`, connection `^16.0.0`, adt-clients `^31.0.0`). In the move the server fixes what that costs it:
the test helper's `makeAdtRequest` stub interfaces-adt-connection 2.0.0's notes measured, and every
read of an answer's `data` through `AbapConnection` in the 8 files of `src` that import the alias
(`BaseMcpServer.ts`, `EmbeddableMcpServer.ts`, `clients.ts`, …) — typed or narrowed, never cast to
`any`. The goal's *Out of scope* names these releases.

**Other consumers of connection's public types** (checked read-only; none is a prerequisite):

| Consumer | Uses | What it needs for connection 15 |
|---|---|---|
| auth-broker 5.0.1 | `devDependencies` `^14.0.0`; tests only (`src/__tests__/broker/connection14.test.ts`, `live/adtProbe.ts`, `live/getProvider.live.test.ts`); README examples name connection 14 | nothing to release; its tests and README move to 15 in its own next change |
| auth-providers 6.0.1, auth-stores 5.0.0, auth-errors 2.2.0 | no import of connection | nothing |
| adt-clients | `devDependencies` `^10.0.2`, test harness and scripts; its source types come from interfaces-adt-connection | its interfaces-adt-connection 2 move (26.0.0) already meets the `unknown` default; its dev range moves to `^15` with 26.1.0 |
| cloud-llm-hub | runtime `^10.0.3`, `lib ^16`, interfaces-adt-connection `^1.0.1`; `AbapConnection` and `SapConfig` types (`srv/mcp-manager.ts`), connectors and CSRF constants (`srv/connections/*`), its own `CloudSdkAbapConnection` with `makeAdtRequest<T = any>` | when it takes lib 19: connection `^16`, interfaces-adt-connection `^3`; reads through `AbapConnection` typed or narrowed; its own `makeAdtRequest<T = any>` still satisfies the interface; no signal reaches its connection or a `freshConnection` factory it gives (D56, §4.3) — its own change |
| mcp-abap-adt-proxy, calm server | proxy on connection `^9.4`; calm none | out of scope (goal); each migrates in its own change |
| this server's embedders | `EmbeddableMcpServerOptions.connection: AbapConnection` | the migration note (§12): the alias's `unknown` default |

### 3.2 The packages

**(D35) The packages, names and directories** — nine, all at 19.0.0 (amended by D48, D49):

| Package | Directory | Bin | Serves | Depends on (`@mcp-abap-adt/*`) |
|---|---|---|---|---|
| `@mcp-abap-adt/lib` | `.` | — | the tools, handlers, the embeddable server, providers from header credentials, failure reading, connection building | adt-clients, adt-strategies, connection, auth-providers, auth-errors, interfaces-* — **not** auth-broker, **not** auth-stores |
| `@mcp-abap-adt/core` | `server/` | `mcp-abap-adt` | **stdio only**: the default destination, service keys, `--unsafe`, the browser login | lib, auth-broker, auth-stores, auth-providers, auth-errors |
| `@mcp-abap-adt/http` **(new)** | `http/` | `mcp-abap-adt-http` | **Streamable HTTP only**, credentials only from each request's `x-sap-*` headers | lib, auth-providers (through lib), auth-errors — **not** auth-broker, **not** auth-stores, **not** sse |
| `@mcp-abap-adt/sse` **(new, D48)** | `sse/` | `mcp-abap-adt-sse` | **HTTP+SSE only**, credentials only from the `x-sap-*` headers of the request that opens each SSE connection | lib, auth-providers (through lib), auth-errors — **not** auth-broker, **not** auth-stores, **not** http |
| `@mcp-abap-adt/compact-readonly`, `compact-modify` | as today | — | the compact groups | lib |
| `@mcp-abap-adt/compact` | `compact/` | `mcp-abap-adt-compact` | the compact tool set over **stdio** (D37, D49) | lib, core, compact-readonly, compact-modify |
| `@mcp-abap-adt/compact-http` **(new, D49)** | `compact-http/` | `mcp-abap-adt-compact-http` | the compact tool set over **Streamable HTTP** | lib, http, compact-readonly, compact-modify — **not** core |
| `@mcp-abap-adt/compact-sse` **(new, D49)** | `compact-sse/` | `mcp-abap-adt-compact-sse` | the compact tool set over **SSE** | lib, sse, compact-readonly, compact-modify — **not** core |

Reasons: `@mcp-abap-adt/http` and `mcp-abap-adt-http` are free on npm (`npm view` answers `E404`,
2026-10-10) and say what the package is beside `core`; a directory of its own mirrors `server/`.
The same holds for `sse`, `compact-http` and `compact-sse` (each name is checked with `npm view`
before its manifest is written; taken → stop and report). Not workspaces, published by path, as
the five today (`docs/deployment/RELEASE.md`). `core`'s `mcpName` and registry entry stay
`io.github.fr0ster/mcp-abap-adt`, `compact`'s `io.github.fr0ster/mcp-abap-adt-compact`; each new
package gets its own (§11).

**The dependency rule is checked by a test (D38, amended by D48–D50)**: each package's
`package.json` is read, and the import graph of its built `dist` (and of `src`) is walked from its
entry points:

- **the published lib, http, sse, compact-http and compact-sse never reach
  `@mcp-abap-adt/auth-broker` or `@mcp-abap-adt/auth-stores`** (nor `interfaces-auth-broker`);
  core is the only package that declares them, and compact (stdio) reaches them only through core;
- **http and sse never reach each other**; compact-http and compact-sse never reach core (nor
  compact), and each of them reaches exactly its own transport package.

*Breaks:* import `AuthBrokerFactory` into lib → red; import `@mcp-abap-adt/http` from sse → red;
make compact-http depend on `@mcp-abap-adt/compact` → red (it reaches core).

### 3.3 Dependency ranges (D1)

| Dependency | 17.2.2 (lib, after A0) | 19.0.0 (never below main's 18.0.0) | Where |
|---|---|---|---|
| `@mcp-abap-adt/auth-broker` | `^4.1.0` | `^5.0.6` (on auth-stores 5 and connection 15), or a later release found at C2 (§3.1) | core only |
| `@mcp-abap-adt/auth-stores` | `^3.3.0` | `^5.0.1` (D54) | core only |
| `@mcp-abap-adt/auth-providers` | `^5.4.0` | `^6.0.2` | lib, core |
| `@mcp-abap-adt/connection` | `^11.0.0` | `^16.0.0` (the removal chain, D56) | lib, core |
| `@mcp-abap-adt/adt-clients` | `~27.0.0` (#288; main's 18.0.0: `^29.1.0`) | `^31.0.0` (the removal chain, D56) | lib |
| `@mcp-abap-adt/interfaces-adt-connection` | `^2.0.0` (#288) | `^3.0.0` (the removal chain, D56) | lib |
| `@mcp-abap-adt/interfaces-adt` | `^13.2.0` (#288; main's 18.0.0: `^15.1.0`) | `^16.0.0` (the removal chain, D56) | lib |
| `@mcp-abap-adt/interfaces-auth` | `^3.2.0` | `^7.5.0` | lib, core |
| `@mcp-abap-adt/auth-errors` | — | `^2.2.1` | lib, core, http, sse |
| `@mcp-abap-adt/interfaces-auth-broker` | `^1.2.0` | `^1.3.0` | core only |
| `@mcp-abap-adt/interfaces-auth-sap` | `^2.0.0` | `^3.3.0` | lib (`SapAuthType`) |
| `adt-strategies`, `interfaces-network`, `interfaces-utils` | unchanged | unchanged | as today |
| `express` | in core | in lib (already a dependency of lib: `IHttpApplication`, and the shared transport helpers of D50), http and sse (core serves no HTTP) | lib, http, sse |

One copy of `interfaces-auth` 7 and of `auth-errors` 2 resolves (`npm ls`). The `auth` script is
removed. Reason: each chain range is the release the goal names; the prerequisites of §3.1 are
published before the server. Type check for the server: `test:check` compiles a typecheck file
that states, with `@ts-expect-error`, that `IAbapRequestOptions.signal`, `IAdtClientOptions.signal`
and `IAdtError.refusal` do not exist — it fails against the 2.1 / 15.x / 15.1 / 30.x releases that
carried them (D56).

### 3.4 What moves, and what lib exports (D36)

**Moves from lib to core** (stdio, destinations): `src/lib/auth/brokerFactory.ts`,
`IAuthBrokerFactory.ts`, `IAuthBrokerFactoryConfig.ts`, `destinationStores.ts`,
`destinationName.ts`, `vocabulary.ts`, `countedProvider.ts`, `loginLock.ts` (rewritten, §5.5),
`handlers/*`, `brokerFactory/UNIFIED_BROKER_LOGIC.md`; `src/lib/stores/platformPaths.ts`;
`src/lib/config/envFileContext.ts`, `envResolver.ts` (they resolve `--env` names and hydrate the
env file); the destination rows of `authParameters.ts` (§10.1); the browser mapping (§8). **Moves
from core to http**: `StreamableHttpServer.ts` and an HTTP launcher. **Moves from core to sse**
(D48): `SseServer.ts` and an SSE launcher. **Moves to lib's shared transport helpers** (D50):
`dnsRebindingProtection.ts`, `tlsUtils.ts`. **Deleted**: `destinationRequest.ts`'s destination
part (`destinationFromHeader`, `FirstConnectLock`, `destinationFailureAnswer`'s destination part);
the failure answer that remains is lib's (§7.3, D50). Every SSE option stays, in sse's table
(§10.1).

**lib exports after the move**:

| Entry | Keeps | Loses (moved or deleted) |
|---|---|---|
| `@mcp-abap-adt/lib` / `handlers` / `handlers/read` / `handlers/write` / `utils` / `logger` / `request-context` / `compact-shared` / `debugger` / `state` | as today (`state`: `InstanceState`, the idle bound, `stateLoggerOf`, read by http and sse) | — |
| `@mcp-abap-adt/lib/embeddable` | `BaseMcpServer` (with the `ConnectionSource` contract, §4, main's held-state methods, and `dispose()` extended, D51), `EmbeddableMcpServer`, `ConnectionContext`, `IHttpApplication`, `MockAbapConnection`, `IServerConfig` | the transport, HTTP, SSE and destination fields of `IServerConfig` — each to the package that reads it |
| `@mcp-abap-adt/lib/auth` | `failureOf` (§7.1), `credentialFromHeaders`, `credentialFromSapConfig`, `errorClassOf`, the server's own refusal classes used by lib, `DestinationSystemContext` (read by `BaseMcpServer` and `withDestinationSystemContext` for the header path's login and main's debugger ids; core's destination reader fills it) | `AuthBrokerFactory`, `IAuthBrokerFactory(Config)`, `IDestinations`, `SettleReport`, `assertDestinationName`, `DestinationRefusal`, `UnsupportedAuthenticationError`, `describeAuthError`, the `DestinationConfigError` and `browserCallbackStrategy` re-exports — to core (`@mcp-abap-adt/core/auth`), or deleted |
| `@mcp-abap-adt/lib/config` | the parameter machinery (table-driven reading of CLI, environment and YAML forms, help and template generation), the shared rows (`--exposition`, `--system-type`, `--conf`, `--state-idle-minutes` (§3.8); the TLS rows `--tls-cert` / `--tls-key` / `--tls-ca`, read by http and sse, D50) | the destination, browser, `--unsafe` and transport rows — to core; the Streamable HTTP rows — to http; the SSE rows — to sse |
| `@mcp-abap-adt/lib/http-transport` **(new, D50)** | what http and sse share and neither may take from the other: `checkDnsRebinding` / `withDnsRebindingProtection`, `createServerListener` / `getProtocol`, the header connection source (`headerSource`: `credentialFromHeaders` per request or per SSE connection, the two `400` sentences of §4.2), the HTTP-transport shutdown sequence (§6.4) | — |

**lib also exports the tool-set contract** (`@mcp-abap-adt/lib/tool-set`, D37): `ToolSet` — the
groups a server serves, given the base context and the exposition; the exposition's words, default
and help — and `fullToolSet` (readonly, high, debug, search, system — **no low, D56, §3.9**: today's `launch`, the
group building of `server/src/launcher.ts` after A0, `debug` adding `DebugHandlersGroup`). **core exports** `./launcher` — `main({ toolSet, program, version })`, and
`./auth` (the moved destination layer, for an embedder that builds a stdio server of its own).
**http exports** `main({ toolSet, program, version })` and `StreamableHttpServer` (to mount on a
consumer's app, `app` option). **sse exports** `main({ toolSet, program, version })` and
`SseServer` (the same `app` option). **lib's `tool-set` also exports `compactToolSetOf`** (D49).

Reasons: lib depends on neither broker nor stores (goal), and what it keeps is what an embedder
and both binaries share; moving the destination layer to core puts every broker and store import
in one package (H4).

### 3.5 Compact on every transport (D37, D49)

**Decided by the user: compact over HTTP is wanted** — and, with D48, over SSE — with behaviour
identical between the full and the compact server on each transport: only the tool set, and the
principle its sets are formed by, differ. **The tool set is an input of each transport's
launcher**: core's, http's and sse's `main` take a `ToolSet` (§3.4) and nothing else of the tools;
everything a launcher does — options, credentials, cancellation, failures, shutdown — is the
transport's, the same for any set.

- **(D49) Decided by the user: one compact package per transport**, by the principle of D35 — a
  package carries only its transport's options and dependencies, so compact over HTTP or SSE never
  pulls in auth-broker or auth-stores through core:

  | Package | Bin | Calls |
  |---|---|---|
  | `@mcp-abap-adt/compact` (`compact/`) | `mcp-abap-adt-compact` | core's `main({ toolSet: compactToolSet })` |
  | `@mcp-abap-adt/compact-http` (`compact-http/`) | `mcp-abap-adt-compact-http` | http's `main({ toolSet: compactToolSet })` |
  | `@mcp-abap-adt/compact-sse` (`compact-sse/`) | `mcp-abap-adt-compact-sse` | sse's `main({ toolSet: compactToolSet })` |

  Each bin is flag-free about its transport. The full bins are the same with `fullToolSet`.
  `compact-readonly` and `compact-modify` stay as they are.
- **Where the compact tool set is built (D49).** It is composed of the two halves' entry builders
  (`compactReadOnlyEntries`, `compactModifyEntries`) with the exposition `ro` / `rw`, default `rw`,
  and `debug` beside either (never alone) for the four debugger verbs (`compact/src/launcher.ts`'s
  `parseCompactExposition` and `parseCompactDebug`, its help, `CompactHandlersGroup` of
  `compact/src/group.ts`, and `CompactDebugHandlersGroup` with its handlers in `compact/src/debug/`,
  which import lib only). None of the three compact packages may take it from another (two of them
  would reach core through `@mcp-abap-adt/compact`), and the halves stay as they are, so the
  composition moves to **lib's `tool-set`**: `compactToolSetOf({ readOnly, modify })` — the group
  that composes the two builders, the compact debugger verbs (`compact/src/debug/` moves with
  it), the exposition's words, parser, default and help — and each
  compact package's `compactToolSet` is that call with its two halves' builders. One
  implementation, no dependency of lib on the halves (they depend on lib).
- Reasons: the transport's behaviour exists once (core, http, sse), so full and compact cannot
  fork; a bin per transport mirrors the full server's (`mcp-abap-adt` / `mcp-abap-adt-http` /
  `mcp-abap-adt-sse`), so each binary still has only its own options and no flag picks a transport
  or a set. Rejected: a `--tool-set=compact` flag on core, http and sse (they would depend on the
  compact packages, and a binary's tools would depend on a flag); a compact HTTP or SSE launcher of
  its own (a second implementation of a transport); one compact package for every transport (it
  would carry every transport's options and pull broker and stores through core into compact over
  HTTP).
- `LauncherOptions` (`launcher.ts:215-239`: `extraGroups`, `exposition`, `program`,
  `helpExposition`, `includeSearch`, `version`) becomes the `ToolSet` plus `program` and `version`.

### 3.6 SSE in a package of its own (D48)

**(D48) Decided by the user: SSE stays**, in `@mcp-abap-adt/sse` (`sse/`, bin `mcp-abap-adt-sse`).
It serves HTTP+SSE only (`SseServer`: a `GET` on the SSE path opens a connection and builds one
`BaseMcpServer` for it; that connection's `POST`s are routed to it by `sessionId`), with **exactly
the rules of `@mcp-abap-adt/http`** (§4.2): credentials only from `x-sap-*` headers, no default
destination, no `x-mcp-destination`, no broker, no stores, no session file, no login. It depends on
`@mcp-abap-adt/lib` and auth-providers (through lib) only — never on http (D38).

- Reasons: HTTP+SSE is deprecated in MCP since 2025-03-26, but some clients still speak only SSE
  and there is no data on who uses it — removing it is a compatibility decision with no technical
  need behind it. A package of its own (rather than SSE beside Streamable HTTP in http) keeps each
  package to its own transport's options and dependencies, as D35 does for every mode.
- **Per connection, not per request.** SSE's unit is the connection: the instance built at the
  `GET` lives as long as its connection and serves its `POST`s, so state a tool keeps between calls
  (a debugger session) lives in the instance while the connection is open, as with stdio. Its
  close disposes that instance — main already shuts its state down; D51 completes it.
- Rejected: removing SSE (the earlier draft: a client that speaks only SSE would break, for no
  technical need); SSE inside `@mcp-abap-adt/http` (one package carrying two transports' options,
  and a second transport's code in every Streamable HTTP install).

### 3.7 What http and sse share (D50)

**(D50) The helpers both HTTP transports need live in lib**, under a new entry
`@mcp-abap-adt/lib/http-transport`, because http and sse must not depend on each other (D38) and
lib is the one package both already depend on that reaches no broker and no stores. Read from the
code at A1 (`http/src/`): `dnsRebindingProtection.ts` (Express types only; express is already a
dependency of lib) and `tlsUtils.ts` (`node:http` / `node:https` and lib's `TlsConfig`) import
nothing of either transport; `credentialFromHeaders` is already lib's (`lib/auth`). So lib holds:

- `checkDnsRebinding` / `withDnsRebindingProtection` and `createServerListener` / `getProtocol`,
  moved from `http/src/` with `git mv`;
- **the header connection source** (`headerSource`): `credentialFromHeaders` turned into a
  `ConnectionSource` (§4), with the two `400` sentences of §4.2 — http builds one per request,
  sse one per SSE connection;
- the TLS parameter rows (`--tls-cert`, `--tls-key`, `--tls-ca`, `MCP_TLS_*`), read by both;
- **the HTTP-transport shutdown sequence** (§6.4): latch, stop listening, await settlement (no tool
  aborted, D55), then the transport's own last step (http: the pool's shutdown, §3.8; sse: close its connections' instances, D51) — one
  implementation, each transport passing its listener and its last step.

What stays in each package is only its transport: `StreamableHttpServer`, its instance pool
(`InstancePool`, §3.8) and its options (http); `SseServer`, its session map and its options (sse). `destinationRequest.ts`'s destination part is
deleted (§3.4); nothing of it is shared. Rejected: a fourth package for the helpers (a package
with no mode of its own, published only to be shared); duplicating them in http and sse (two
implementations of one rule, H6); sse depending on http (a Streamable HTTP install in every SSE
one, and the rule the user set).

### 3.8 Held state, the instance pool and the idle bound (D52)

**(D52, amended) The instance pool is main's, and this change carries it into `@mcp-abap-adt/http`
as it is** (§2): routing by `state_handle`, the lease, kept while holding, disposed when empty, the
retry of a failed disposal, `onEmpty`, the batch refusal, `stop()`'s drain and report, the bearer
handle. SSE keeps one instance per connection, stdio its one instance, the embedder its own. The
idle bound stays lib's option, handed by every transport to its instances. This change does to them
only what its own rules require:

- **Credentials (D39).** A request routed to a kept instance sets that instance's connection source
  from its own `x-sap-*` headers (`headerSource`, D50, in place of today's
  `setConnectionContextFromHeaders`, which already runs on every request); its tool calls'
  connections are built from them. **Held state keeps the connections it opened** — a debug
  session's own, through `openFreshConnection` (D20, the factory's record: the credential of the
  call that opened them) — until the state ends: the one exception to "nothing across requests"
  (goal, H3). No destination, no broker and no store reaches a pooled instance (D38).
- **The request signal (§5).** A pooled instance's tool calls go through lib's one wrapper like any
  instance's: each request's signal ends its waits and keeps it from its tool until the tool
  starts (D5, D32); a started tool's requests to SAP carry no request signal and run to the end
  (D55). The held state's own work — the listener's polls and a background run, which go on after
  the call that started them returned, the idle bound's stop and the host's dispose — is not a
  request's and carries no signal either, so a request's end (D4) never cuts it. The debugger
  builds its clients directly (§2) and gives them no signal.
- **The registry and the latch (D33).** A pooled instance's tool calls register in the one registry
  of live tools; the process latch refuses a call routed to a pooled instance once shutdown began,
  as it refuses any; the pool's own admission refusal (`503`) stays in front of it.
- **Shutdown (D33, D55).** http's sequence awaits the pooled instances' tools with every other,
  aborting none; its last step is the pool's own shutdown (main's `InstancePool.shutdown()`), which
  disposes every instance — its ADT sessions closed with a logoff (D55), **also when its state
  undo failed** (the terminal close, §6.4) — and whose leftovers make the exit `1` (§6.4).
- **Eviction (D51).** Every way an instance leaves the pool — nothing held after its request, the
  idle bound's stop, a stop tool, shutdown — goes through the same awaited `BaseMcpServer.dispose()`
  (the retryable state undo) and then **the terminal close** (§6.4): every connection the instance
  owns closed with a logoff (`disconnect()`), which releases the SAP locks its sessions held
  (D55) — **whether or not the undo succeeded**; a failed undo is reported, never a reason to keep
  a session open. An instance the pool keeps for a retry of a failed undo has not left the pool;
  when it leaves (the retry done, the idle bound, shutdown), the terminal close runs. The pool
  disposes an instance only when no request works on it (its lease, after `idle()`) and never routes
  a request to an instance it is disposing (it revalidates), so pool eviction needs no instance
  latch; the instance latch is the SSE close's and shutdown's (D51).
- **The idle bound** stays the project owner's stated exception (H5): an option of every binary that
  serves tools (§10.1), from lib's shared row, unchanged.
- **Not changed here**: the handle's bearer semantics and the absence of a limit (the project
  owner's exception, §18, question 1),
  the debugger's tools.

Reasons: the pool is shipped behaviour users rely on (`docs/user-guide/DEBUGGER.md`); redesigning
it is no part of this change (goal, *Out of scope*); the rules this change sets for every instance
would not hold if pooled instances were exempt. Rejected: dropping the pool until a later change
(a regression of a published release); a second registry or shutdown for pooled instances (H6).

### 3.9 The low tool set leaves the full binaries (D56)

**(D56, decided by the user) Everyone who needs low has compact.** The low set
(`LowLevelHandlersGroup`, `src/lib/handlers/groups/LowLevelHandlersGroup.ts`, and its 117 handlers
under `src/handlers/*/low/`) is removed from the full binaries' tool set (`fullToolSet`:
`mcp-abap-adt`, `mcp-abap-adt-http`, `mcp-abap-adt-sse`); compact is its full analogue —
`HandlerLock` / `HandlerUnlock` / `HandlerUpdate`, `HandlerActivate`, `HandlerValidate`,
`HandlerCheckRun`, `HandlerDelete`, `HandlerGet`, `HandlerSearch`, … — on every transport.

- **No gap-filling in high or readonly.** Nothing is added to them for the removal.
- **The low → compact mapping table**: each low tool → the compact handler and action that does
  the same, built from the code (the low group's registrations, compact's entry builders) and
  checked against it by a test; **a low capability compact does not have is a finding for the
  user to decide** — listed, never silently added anywhere. The table is the migration note's
  (§12).
- **`--exposition=…,low` goes**: `low` is no longer a word of the full binaries' exposition; given,
  it stops the start naming where it went — "the low set is gone from mcp-abap-adt / -http / -sse;
  use mcp-abap-adt-compact (or -compact-http / -compact-sse)" (§10.1).
- **Compact keeps `HandlerLock` / `HandlerUnlock` / `HandlerUpdate`**: a lock held across calls is
  the consumer's choice there; keeping it short is the consumer's job — documented in compact's
  READMEs, not engineered. Its session ends with the instance (§6.4, D56).
- **Every tool of the full binaries is atomic**: it locks only its own object, lock → write →
  unlock inside one call (`withLock`); nothing more is needed. Standalone lock and unlock leave
  with the low set.
- Whether the handler files under `src/handlers/*/low/` stay (imported by compact or high) or are
  deleted is read from the code in the task: a file nothing registers any more is deleted.

Reasons: two tool sets offering the same operations is one too many; compact already serves every
transport with the same capabilities; a lock held between calls is exactly the state the server
cannot clean up while the instance lives (D56 (2)), so the full binaries hold none.

## 4. Credentials, per package

`BaseMcpServer` (lib) stops holding "settings and a credential" and holds one **connection
source** per instance — the contract each package fills:

```ts
interface ConnectionSource {
  /** The settings and the credential for one request; the request's signal bounds the waits. */
  resolve(signal: AbortSignal): Promise<{ settings: SapConfig; credential: IAuthProvider }>;
}
type Source =
  | { kind: 'built'; source: ConnectionSource }        // core: a destination; http, sse: the headers
  | { kind: 'injected'; connection: AbapConnection };  // embedded: the consumer's
```

`ConnectionContext` (lib/embeddable) becomes this union plus `sessionId` and `metadata` (an API
change of the major).

### 4.1 stdio (core): the default destination through the broker

- **(D2) One destination, one `AuthBroker` per process.** stdio serves its default destination
  (`--mcp` / `--env` / `--env-path`); the factory builds one broker over that destination's
  stores (`storesFor`, by mode). Reason: the goal gives stdio one user and one default destination.
- **(D3) Decided by the user: option (c), document, don't engineer.** The settings are read once
  per process (`settingsFor`'s cache, `brokerFactory.ts:114-125`, unchanged); every request still
  calls `getProvider(destination, { signal })` (§5) for the signal; the server keeps no provider
  cache. The docs say plainly: **editing a destination's files while the server runs is not
  supported and may combine old and new values until the next start — restart after any
  change** (the measured reason: M4, M5).
- **The counted wrapper stays** (core), memoised per inner provider in a `WeakMap`; its
  closed-gate answer is minted (D17).
- **(D18) Startup** reads the settings and builds the provider —
  `getProvider(destination, { signal: startup })`, aborted when the check ends — so a destination
  the broker refuses stops the start. Building sends nothing. Reading the settings of a `jwt` /
  `authorization_code` destination also checks its browser (§8): a `--browser` with no browser on
  this platform stops the start there, naming `browser`; a destination that never logs in is not
  refused for it.
- **The broker options the server states** (§6): `renewal`, `onWriteFailure` (by store mode, D12),
  `authDebug`, and for `jwt` / `authorization_code` `authorization` (§5.5, §8). The handler table
  is `basic`, `snc`, `jwt/authorization_code` — `jwt/none` is removed (D53).
- **Inspection-only mode** (stdio without a destination) is the server's own refusal before any
  connection (D17).
- ~~**(D30)** A `jwt` / `none` destination bound by the broker (auth-broker 5.1.0)~~ —
  **withdrawn** (§18), replaced by D53 and D54.
- **(D53) stdio serves no token you hold.** A `jwt` / `none` destination (`SAP_AUTH_TYPE=jwt`,
  `SAP_GRANT_TYPE=none`, `SAP_JWT_TOKEN` in an `--env` file) is refused by the handler table as
  any authentication the server does not serve (`UnsupportedAuthenticationError`,
  `destination_refused`, naming `jwt / none`), at the startup check (D18) and before any request;
  its hint says where it went: "a token you hold is sent in the x-sap-jwt-token header to
  mcp-abap-adt-http or mcp-abap-adt-sse; for stdio, create the session with mcp-auth". Reason
  (M8): the chain writes no binding for a held token, and a session record without one is not of
  the chain's format (D54); a token handed over per request is what HTTP and SSE already serve.
- **(D54) Only the chain's own session format.** core's session records are written by `mcp-auth`
  (auth-broker-cli 3.x) or by the broker itself; an older format or a hand-written record is not
  supported. auth-stores 5.0.0 refuses such a record with `StorageError` `reason:
  'record-format'`, and the broker passes it on unchanged; core answers it as §7.3 says (never a
  new login, never "no session"). The server checks no record itself: the store is the only one
  with access to the record, so it alone decides whether the record is its own (goal, *Holds
  throughout* 3). The binding rule is the broker's, unchanged (auth-broker 5.0.x): a token to ABAP
  needs both `issuedFor` and `issuedBy`, an XSUAA token `issuedBy` only, basic none. A token
  session bound to another destination's means is not refused: the broker does not use it (its
  warn line) and the provider logs in again (measured, A5).

### 4.2 HTTP (`@mcp-abap-adt/http`) and SSE (`@mcp-abap-adt/sse`): only the user's headers

- **(D39) Each request's credentials come from its `x-sap-*` headers alone**:
  `credentialFromHeaders` (lib) — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or
  `x-sap-login` + `x-sap-password` — builds `TokenAuthProvider.fixed(token)` or
  `new BasicAuthProvider(user, password)` (auth-providers 6 kept both constructors, connection
  `docs/MIGRATION-13.0.md`) and the request's connections over the HTTP wire, on a server instance
  that is new for the request or the pooled one its `state_handle` names (§3.8) — either way the
  request's own headers give its source. Nothing is stored, shared or cached across requests (H3),
  except the connections held state opened, until it ends (§3.8); no broker, no store, no login
  exists in the package (D38).
- **A request without them** is answered `400` in fixed words: "this server takes credentials only
  from the request's headers: send x-sap-url with x-sap-jwt-token, or with x-sap-login and
  x-sap-password". **A request carrying `x-mcp-destination`** is answered `400` too: "destinations
  are served only by mcp-abap-adt (stdio); send x-sap-* headers" — a header it no longer serves,
  refused rather than ignored (H1).
- The system kind follows `--system-type` / `SAP_SYSTEM_TYPE` (`resolveSystemKind`, as today).
- **`ping`** is answered without credentials, as today.
- **SSE (D48)** follows the same rules through the same `headerSource` (D50), with the connection
  as its unit: the `x-sap-*` headers of the `GET` that opens the SSE connection give that
  connection's credentials, and its instance and connection serve its `POST`s; nothing is shared
  with another connection, nothing outlives it (D51), nothing is stored; its held state (a debug
  session) lives as long as the connection or until its stop or the idle bound (§3.8). A `GET` without them is
  answered `400` with the first sentence above; a `GET` or a `POST` carrying `x-mcp-destination` is
  answered `400` with the second. A `POST` is routed by its `sessionId` alone: its own `x-sap-*`
  headers are not read, so a connection's credential is the one it opened with.

### 4.3 Embedded (`EmbeddableMcpServer`): the consumer's

The injected connection is used as given (`EmbeddableMcpServer.ts:184-186`): no `getProvider`, no
credential built, no wrap, no `connect()`. A consumer that gives credentials per request builds an
`EmbeddableMcpServer` per request with its connection, or mounts the HTTP package's
`StreamableHttpServer` (or the SSE package's `SseServer`) on its own app (`app` option), where §4.2
holds.

**A fresh connection (D20).** `openFreshConnection(connection, logger)` decides from a registry
keyed by the connection object, never from the connection's configuration:

| The connection | A fresh one comes from |
|---|---|
| built by the server (`createAbapConnection`: a destination, `x-sap-*`, a `SapConfig`) | the factory's record — the same settings and the same credential object |
| injected, with `freshConnection` given | `await freshConnection()` — the consumer's factory; it receives no signal (D56: a fresh connection is made inside a started tool, which runs to its end) |
| injected without it (or set through `setAbapConnectionOverride`) | **refused**: "This operation needs an ABAP session of its own; the connection was given by the host, which supplied no fresh-connection factory (`freshConnection`)" |

```ts
interface EmbeddableMcpServerOptions {
  // …
  /**
   * A connection of its own for an operation that needs a new ABAP session:
   * RFC CreatePackage / LockPackage, DeletePackage with force_new_connection,
   * and every listed long tool's own connection (§5.8). The connection is built by
   * you, with its credential. Once returned it is the server's: the server
   * closes it like its own, with disconnect() (a logoff). Without it those
   * operations are refused.
   */
  freshConnection?: () => Promise<IAbapConnection>;
}
```

- The `getConfig()` / `config` + `credentialFromSapConfig` fallback (`packageSessions.ts:45-47`,
  `:55`) is deleted. Every caller — `CreatePackage` high and low over RFC, `LockPackage` over RFC,
  `DeletePackage` with `force_new_connection` — gets the same three rows.
- **(D21) `DeletePackage`'s fallback is removed**: a fresh connection that cannot be had is the
  answer, not a silent delete on the session the caller asked to avoid.
- **(D22) Ownership passes to the server — decided by the user.** Once the consumer's factory hands
  a fresh connection over, the server treats it exactly like a connection it built: it holds it for
  the operation (or under a package lock's handle, `lockSessions`), its requests carry no request
  signal (D55), and it is closed with `disconnect()` when the operation or the lock ends, on every
  path, failures included (D55's rule), a failure of the close logged in fixed words. What the
  consumer keeps is what it built in: the connection's credential. *(D56: the factory receives no
  signal; A9 built it with `{ signal }`, and C2 removes that.)*
- **A connection the consumer injects** (not one its factory returned) stays the consumer's: the
  server never closes it; logging it off is the consumer's (D55).
- **(D19) `credentialFromSapConfig` refuses instead of guessing**: an `authType` outside `basic`,
  `jwt`, `saml`, `certificate` refused naming `authType`; `snc` "is served through a destination
  of mcp-abap-adt (stdio)"; `kerberos` refused; a missing user, password, token or cookies refused
  naming the field. It stays in lib for the `SapConfig` path (`setSapConfigOverride`,
  `getManagedConnection`), which an embedder uses for its own instance.

## 5. Cancellation

### 5.1 The signals

| Signal | Created | Aborted | Given to |
|---|---|---|---|
| **request** | per MCP request, in the tool wrapper (every package) | the request's `extra.signal` aborts (client cancel, transport close), or the request ends (`finally`) | the request signal scope (§5.2), read by D5's check before the tool and by the server's own waits (D32): `connect()`, `getProvider` (core) and its login, a caller's wait on the shared system-context lookup (D44). **Nothing that is sent to SAP** — no `AdtClient`, direct request, debugger client, connection or connector gets it, and no `freshConnection` factory (D55, D56); connection 16 has no signal to take |
| **startup** | the core launcher's check | the check ends | `getProvider` of the check |
| **shutdown** | once | a `SIGTERM` / `SIGINT` after the shutdown started, or `--shutdown-timeout` (§6.4) — never by default | `flush({ signal })`, the drain |
| **login bound** | per `authorize` of core's strategy wrapper, when configured | the bound elapses | the strategy, combined with `AuthorizationRequest.signal` (§5.6) |

**(D4) A request's signal is aborted when the request ends, whatever its outcome**: the broker
releases `getProvider`'s party only on its abort, so a live party left behind would keep a later
login alive after its own waiter left. Shutdown aborts no request: it latches and awaits them
(§6.4, D55).

**(D55, D56) A signal is the consumer's message "I no longer need this — close".** There is no
real cancellation against ABAP: the most the server can do is a logoff and closing a connector
(D56). The MCP SDK's `extra.signal` has **one remaining use**: the server's own waits that send
nothing to SAP — the browser login, `connect()`, the provider build — and the rule that a
request cancelled before its tool starts never reaches it (D5, A8); it is not a connector or
contract feature. What a signal closes depends on what the consumer let go of:

| The consumer | What ends | What runs on |
|---|---|---|
| **cancels a call** (`notifications/cancelled`, or the request's `extra.signal` otherwise) | its waits — the login, `connect()`, `getProvider`'s build, its wait on the system-context lookup (D32, D44); a request whose tool has not started never reaches it (D5) | a tool already running runs to the end and answers (§5.2); **nothing is done to SAP** — no logoff, no reopen while the instance lives (D56): a reopen would drop locks under the LLM or leave them in the old session the new one collides with; the session and its connection live on |
| **closes its transport** — an SSE connection (D51), stdio's stdin (its `end` / `close` starts the shutdown, M7, §6.4), an HTTP instance the pool releases (§3.8) | the instance stops admitting calls (its latch), awaits the running ones, then closes every connection it owns with `disconnect()` — the logoff (§6.4) | nothing of that instance |
| **shuts the process down** (`SIGTERM` / `SIGINT`) | the same for every instance (§6.4); `--shutdown-timeout` or a second signal ends the waiting, and the logoff is still sent | nothing |
| **gives a listed long tool a `timeout`** (§5.8) | that tool's wait only — the request runs on to SAP's answer on its own connection, which is then closed with a logoff (measured: a logoff or a closed socket would kill a running request) | the instance, its connections and every other call |

**Logoff happens only at an instance's end** — pool eviction, the idle bound, a stop tool, an SSE
close, stdin's end, shutdown — and at the end of a connection made for one operation (a fresh
connection, a listed long tool's own, §5.8); **a reopen only when SAP already lost the session** (D56).

### 5.2 Where a request's signal goes, and where it does not

**(D31) Decided by the user: option (a)** — the connection honours the signal (§3.1); ~~the server
passes it~~ — **the server side is withdrawn by D55**: the server passes no request signal to the
requests a tool sends to SAP; and **D56 removes the signal from the whole chain** (§3.1): no
connection, connector or client of the chain takes one any more.

- **The request signal scope** (`src/lib/requestSignal.ts`, an `AsyncLocalStorage` of its own —
  not the system-context request scope, which stdio does not enter and whose presence changes
  what `getEffectiveSystemContext` answers): the tool wrapper runs the handler inside
  `runWithRequestSignal(signal, …)`; `currentRequestSignal()` reads it — for the server's own
  waits (D32) and D5's check, nothing else (D56: not the consumer's `freshConnection` factory).
- **(D55) A started tool runs to the end.** SAP ABAP has no request cancel and no rollback across
  ADT requests: a request that reached ADT runs to its end, and SAP's transactionality is its own,
  inside one request. A tool cut between its requests — a lock, a write, an activation, an
  unlock — would leave a half-made object with nothing to roll it back. So **`createAdtClient`**
  (`src/lib/clients.ts:34-51`, the one place every handler builds a client) passes no signal to
  `AdtClient`; the debugger's clients (`src/lib/debugger/ports.ts`), the server's own requests
  (`handleGetServiceBindingPreviewUrl.ts:225`, `utils.ts:717`) and the preview's
  `getSystemInformation` (`handleGetServiceBindingPreviewUrl.ts:145`) carry none. A started tool's
  answer is produced; a client that left by then receives nothing. No request of the server's
  carries a signal (D56) — the shared system-context lookup's included (D44: a caller's wait ends
  with its signal, the lookup runs to its end).
- **What each connection the server hands on carries** — checked site by site (`grep` over every
  package's `src` for `createAbapConnection`, `openFreshConnection`, `inOwnSessionOverRfc`,
  `connectionForPackageLock`, `connectionHoldingPackageLock`, `releasePackageLockSession`,
  `getManagedConnection`, retained `Map`s and `WeakMap`s of connections, direct `makeAdtRequest`);
  each one's end is D55's rule (§6.4):

| Site | Its requests (D55) |
|---|---|
| `BaseMcpServer.getConnection` (`BaseMcpServer.ts:193-230`): stdio's kept connection | no request signal; `connect()` itself races the caller's (D32) |
| `inOwnSessionOverRfc` (`packageSessions.ts:86-100`) — `CreatePackage` high and low over RFC | no request signal |
| `openFreshConnection` (`:40-61`) — `DeletePackage` with `force_new_connection` | no request signal on the sibling's requests |
| `connectionForPackageLock` (`:110-135`) — `LockPackage` over RFC | no request signal; `lockSessions` keeps the raw connection |
| `connectionHoldingPackageLock` (`:138-143`) — `UpdatePackage` (`handleUpdatePackage.ts:151`), `UnlockPackage` (`handleUnlockPackage.ts:112`) | no request signal |
| `releasePackageLockSession` (`:149-157`) | none: a close carries no request; its `disconnect()` is the logoff |
| `resolveOnce` (`requestSystemResolution.ts:104-125`): the cloud system-context lookup shared by concurrent requests | **its own attempt (D44, amended by D56)**: one shared lookup per resolver and connection — each caller races its own signal and is released at once when it leaves; the lookup itself carries no signal and runs to its end even when every caller left (D56: nothing sent to SAP is cancelled); a failed lookup is never memoised (the next caller starts afresh); a completed answer is kept, as today |
| the consumer's `freshConnection` (§4.3) | the factory receives no signal (D56); its connection's requests carry none |
| `getManagedConnection` / `getAdtClient` (`utils.ts:386-536`, `clients.ts:53-61`) — the legacy `SapConfig` path | no request scope there: no signal |
| the debugger's clients (`src/lib/debugger/ports.ts`: `AbapDebugger`, `AmdpDebugger`, `AdtExecutor`, built directly on the session's own connections, §2) | no signal: a debugger tool call's own sends and the held state's own work (the listener's polls, a background run, the idle bound's and the host's stop) alike |

- ~~**Releases are never cancelled (D40).**~~ — **withdrawn by D55.** With no request signal on a
  tool's requests there is nothing to keep a release out of: `runWithoutRequestSignal`, the
  release-site list and its source test are not built. A lock a tool leaves held — a failed step,
  an unlock SAP refused, a lock tool's own lock — is released by its session's logoff
  (§6.4, D55); an unlock tool is its own request, like any.
- **Injected connections are not wrapped** and receive no request signal in their requests'
  options (D55); the consumer's `freshConnection` factory receives none either (D56, §4.3).
- **No view, no gate**: the earlier drafts' per-request view and provider-side gate are gone.

### 5.3 In a request

- **(D32) The server's own waits for a request race its signal**: `connect()` (shared by stdio's
  callers), `getProvider`'s build, the system-context lookup. A cancelled caller settles at once;
  the shared work runs on; a late rejection is handled; **a late success is the instance's
  connection** — kept by the instance like any connection it built, used by the next call, and
  closed only by the instance's terminal close (§6.4), even when every caller that waited for it
  cancelled (D56: a cancel causes no logoff and no reopen; amended from "a late success that
  belonged to it alone is disconnected", which A8 built and C2 removes). A started tool's requests
  race nothing: they run to the end (D55), a renewal or a logon inside a send included.
- **A cancel causes no logoff anywhere** (D56): not of a late connection (D32), not of a fresh
  connection (it is made inside a started tool, which runs to its end; its end is the operation's,
  §4.3), not by a rebuild of the provider (D13: no reopen while the instance lives). D7's retry
  follows a `connect()` that failed before any session existed, so it closes nothing.
- **(D5) A cancelled request does not reach its tool**, in every package: after the connection is
  ready an aborted signal answers `aborted` and the handler is not called. Once the handler is
  called, the tool runs to the end and its answer is produced (D55).
- **(D7) One retry after another caller's abort** (stdio): `connect()` failing `interactive-login`
  `aborted` while this request's signal is live is retried once — a later request inside the abort
  window of another's starts afresh. Read by `kind`, once. Nothing is logged off: the failed
  `connect()` opened no session.
- **(D13) The connection a request uses**: HTTP builds one per request, on its new or pooled
  instance (§3.8); SSE one per SSE connection, kept by that connection's instance until it closes
  (D51); stdio keeps its connection for the instance's life — **no reopen while the instance
  lives, only when SAP already lost the session** (D56). *(Before D56: a new connection when the
  broker built a new provider. Whether `getProvider` can still answer a new provider in stdio,
  with the settings read once (D3), is read from the code in C15; if it can, the case is reported
  to the user, not handled by a reopen.)* Held state's own connections (a debug session's) are the state's, on every transport, and
  close with it (§3.8, D51).

### 5.4 The HTTP and SSE packages

A client that disconnects closes its transport, which aborts its in-flight requests'
`extra.signal` (§2): the request signal ends its waits and keeps a request whose tool has not
started from reaching it (D5); a started tool runs to the end (D55). There is no setup phase
before dispatch (no destination, no login): over Streamable HTTP the header provider and the
connection are built inside the request, on a new server instance or the pooled one its
`state_handle` names (§3.8). Over SSE they are built when the `GET`
opens the connection, and each `POST`'s tool call is a request of its own
with its own signal; a client that closes its SSE connection ends the waits of every request in
flight on it, its started tools run to the end, and then its instance is closed — its ADT sessions
with a logoff (D51, D55).

### 5.5 What `LoginLock` becomes (stdio)

**(D8)** With one destination per process, one provider serializes its own logins (its shared
attempt), so the cross-destination queue has nothing left to order: **`LoginLock` is deleted**.
The `authorization` option of a `jwt` / `authorization_code` destination answers
`serverLogin(browserCallbackStrategy({ browser, port }), context)` — a wrapper that passes the
request on with `signal` combined with the login bound (§5.6) and `logger` replaced by the prompt
logger (§9.2), forwards `dispose()`, and is recorded so the factory disposes it at shutdown
(§6.4). The composed strategy settles only after its listener's sockets are closed, so the callback
port is free when a cancelled login ends, and the next request can log in.

### 5.6 The login bound (stdio)

**(D10)** `--login-timeout=<seconds>` (`MCP_LOGIN_TIMEOUT`, YAML `login-timeout`), **no default**
(H5, the user's rule); it bounds each `authorize` of the wrapper through `AbortSignal.any([request
.signal, AbortSignal.timeout(ms)])` — the login, not the request; when it fired the answer adds
"The login was ended by the server's login timeout (`--login-timeout=<n>`)". A whole number from 1
to 86 400, parsed by plain code. The HTTP package and the embedded server have no login, so no
bound. *Implemented (A8)* as a timer of the login's own, started with each `authorize` and cleared
when the login settles, its controller combined with the request's signal through `AbortSignal.any`
— not `AbortSignal.timeout(ms)`, whose timer cannot be cleared: no timer stays pending after a
login. The sentence ends with a period like the other server sentences and names the bound in the
form it was set (`--login-timeout=<n>`, `MCP_LOGIN_TIMEOUT=<n>`, `login-timeout: <n>` in the
configuration file; an embedder's `loginTimeoutMs: <ms>`); a login the bound ended is recorded on
its failure, so another login starting before that failure is read changes neither the sentence nor
D7's reading.

### 5.7 Stateful only for lock, unlock and activation (D56)

**(D56, decided by the user)** The stateful window of a tool is exactly **lock → write → unlock**,
and **activation** — activation requires a stateful session (a measured result, recorded in
adt-clients' `activation.js`: "Requires stateful session mode"). **Everything else runs
stateless**, the listed long tools included (§5.8). Activation runs to its end, with no
`timeout` unless the user puts it on the list.

- **Where a session turns stateful today**, read from the code: the server's
  `restoreSessionInConnection` (`src/lib/utils.ts:605-631`, `setSessionType('stateful')`), the
  debugger's ports (`src/lib/debugger/ports.ts:48`) and adt-clients' own operations (63 files of its
  `dist` call `setSessionType('stateful')` — lock, update, activation, …). The task (C15) lists each
  site with the window it opens and where the connection returns to stateless; a site that opens a
  session outside lock → write → unlock or activation, or leaves the connection stateful after its
  window, is changed in the server, or — when it is adt-clients' — reported to the user as a
  finding of that repository, not worked around.
- **A shared connection** (stdio's kept one; an HTTP pooled instance's): how one tool's window
  meets another call on the same connection is read in C15 and reported with the site list; the
  rule is not bent to fit it.
- **Compact's `HandlerLock`** keeps its window open across calls until `HandlerUnlock` — the
  consumer's choice (§3.9); the window ends at the latest with the instance's logoff (§6.4).
- **The ADT debugger's stateful sessions** — attach and steps need a debuggee session — are the
  debugger's session (its held state, §3.8, §16), not a tool's stateful use; they end with its stop,
  the idle bound, the host or shutdown, as today.

### 5.8 Listed long tools take a `timeout` on their own connection (D56)

**(D56, decided by the user) Long tools named in the list take an optional `timeout`** — **no
default** (no value = wait until done) — **the one written exception to the no-timeouts rule**
(H5, §17); each runs on its own stateless connection; a timeout or the end closes that connection
with the logoff. The timeout is **not defined by a category** (GET, read-only, stateless — a
stateless `POST` may write) **but by an explicit, named list of tools, decided tool by tool by the
user** (e.g. where-used, `GetWhereUsed`, and the like).

- **The list.** The implementer drafts the candidates from the code (C16): the tools whose call
  can run long — where-used, object and source search, ATC, unit-test runs and their status, run
  class / program, the profiler, dumps, every poll loop (`pollRun.ts`, `startRun.ts`, …) — each
  with what it sends (method, path, body; stateful or not). **The user approves the list before
  any code**; no tool gets the timeout without being on the approved list. **Activation and the
  debugger are not on it unless the user puts them there.** The approved list is kept in a file a
  source test reads (a listed tool without the parameter, or a tool outside the list with it,
  fails).
- **Each listed long call runs stateless on its own connection** — the server's fresh-connection
  path (`openFreshConnection`, §4.3) — not the instance's, so nothing the instance holds is
  touched.
- **A timeout ends only the wait — never the request.** Measured on E19 (2026-10-13, a `$TMP`
  class run that waits 60 s and then writes and commits): logging the request's own stateless
  session off, or closing its socket, while the request runs **kills it — the write is lost**; a
  client that keeps waiting gets it written. So when the `timeout` fires, the call answers at once,
  in fixed words, that the wait was ended by its `timeout` and that the request is still running in
  SAP (with the `worklist_id` / `run_id` where the tool already holds one at that moment), and
  **the request goes on**: its socket and its own connection stay open until SAP answers. The
  answer that then arrives is not delivered to anyone; **only after it** is that connection closed
  with `disconnect()` — the logoff (connection 16: resolved once written). A call that finishes
  within its `timeout` closes its connection the same way, after its answer. The timer is the
  call's own, cleared when the call settles: **no timer is left pending** after a call that
  finished (as the login bound, §5.6).
- **Such a connection is owned** (§6.4's list, `tools/connection-ends.json`): the orderly
  shutdown waits for its request to be answered before its logoff (the request may write); the
  forced close logs it off at once — which cuts the request (the user's escape, as for a running
  tool).
- **The tool description** advises a `timeout` below the MCP client's own request limit (the
  TypeScript SDK's client cancels at 60 s by default), and says that a cancel does nothing to SAP.
- **No connection to make one from**: on an injected connection without `freshConnection`, a
  listed long tool is refused with D20's words, as every fresh-connection operation is (§4.3).

## 6. Renewal, session writes, shutdown (stdio)

### 6.1 Renewal

**(D11)** `renewal: () => refreshThenLogin()` by default; `--renewal=refresh-then-login|refresh-only`
(`MCP_RENEWAL`, YAML `renewal`). Under `refresh-only` a destination that needs a login answers
`renewal-declined` with the server's sentence "Logins are off (`--renewal=refresh-only`): log in
with `mcp-auth`, or start without it."

### 6.2 What a failed session write means

**(D12)** By the destination's store, fixed, no option:

| Store (stdio) | `onWriteFailure` | Reason |
|---|---|---|
| a named destination with `--unsafe` (`sessions/<name>.env`) | `'continue'` — **decided by the user**: a development mode; the failed write warns and the request goes on | |
| a named destination without `--unsafe` (in memory) | `'continue'` | an in-memory store does not fail; stated for completeness |
| the `--env` / `--env-path` file the server writes back | **`'fail'`** (recommended; §18 asks the user) | it is the user's own file and their production stdio setup: a write that does not land must be seen — the request fails `unknown` `persisting-tokens` and the destination is refused until a write lands — and it is what lets "a discarded refresh token does not come back" hold, since under `'continue'` its only report is a `warn` to a logger silent by default |

**Where a session write happens at all**: only in stdio, and only for a **token destination** —
`jwt` / `authorization_code` (cloud, SSO: the session secret is the token the server obtains and
renews; the broker writes its binding beside it). `basic` and `snc`
destinations obtain no session secret and are never written; HTTP and embedded write nothing.
`--session-write-failure` does not exist. Under `'continue'` the broker's `warn` line for a failed
write goes to stderr whatever `DEBUG_AUTH_LOG` says, so the goal's "unless a write that failed was
reported" holds there too.

### 6.3 Discarded refresh tokens

The broker's `refreshToken: ''` write lands before exit on every shutdown path (§6.4). Under
`'fail'` a write that does not land fails the destination's requests and the flush reports it
(exit `1`); under `'continue'` it is reported on stderr. A process killed without a shutdown is the
documented limit.

### 6.4 Shutdown

**(D33, amended by D55)**

- **(D55) A connection the server owns ends with a logoff — the rule.** A connector that is
  destroyed is closed: a connection dropped without `disconnect()` is a resource leak, because
  its SAP session — and every lock the session holds — stays open until SAP's own timeout ends it.
  `disconnect()` is the logoff, and a logoff releases the session's locks (measured, §15); nothing
  else is relied on to release a lock. On connection 16 `disconnect()` resolves once the logoff
  has been **written** to the socket, not answered (D56): SAP queues it behind a request still
  running in the session and releases the locks afterwards, even with the client gone (§15). So every place the server creates a connection, or takes
  ownership of one, has a defined end that calls `disconnect()`, each once, on every path —
  failures included — a failure of the close logged in fixed words:
  - stdio's kept connection (`BaseMcpServer.getConnection`), at exit (the instance's `dispose()`);
  - a connection replaced — only when SAP already lost its session (D56; D13) — when it is
    replaced;
  - the fresh connections — `openFreshConnection`, `inOwnSessionOverRfc`, and the consumer's
    `freshConnection` ones once returned (the server owns them, D22) — when the operation ends;
  - package lock sessions (`connectionForPackageLock`), at `releasePackageLockSession` — the
    unlock, or the instance's close;
  - the debugger session's own connections, at its stop, the idle bound's stop, the host's stop
    and `dispose()`;
  - a listed long tool's own connection (§5.8, D56), when its call ends or its `timeout` fires;
  - an instance's connections when the pool disposes it (§3.8), when an SSE connection closes
    (D51) and at shutdown.

  A connection the consumer injects (not one its factory returned) is the consumer's to close; the
  server never closes it (§4.3).
- **The state undo is retryable; the terminal close is not conditional (D55's rule).** Ending an
  instance has two parts, kept apart: **the state undo** — `BaseMcpServer.dispose()`'s and
  `shutdownState()`'s undo of held state (a debugger stop, …), callable again, each call retrying
  what was left (main's contract, which the pool's retry relies on) — and **the terminal close** —
  `disconnect()` of every connection the instance owns (those it built, held state's own, package
  lock sessions, fresh connections still open), each once, a failure of the close logged in fixed
  words. The terminal close runs at every **terminal disposal** — shutdown (core, http, sse), an SSE
  close, the pool's eviction (§3.8), the idle bound's stop, an instance's stop — **after the undo
  was tried, whatever its outcome**: an undo that failed (once, or after its retry) is reported (a
  stderr / state-logger line in fixed words, exit `1` at shutdown) and the logoffs are still
  written. A failed undo never keeps a session, or a lock, open. Only a disposal that is not
  terminal (the pool keeping an instance for a retry) leaves the connections open, until the
  instance's terminal close.
- **The forced close (the escapes).** A `SIGTERM` / `SIGINT` after the shutdown started, or
  `--shutdown-timeout`, switches to **the forced close**, one lib implementation used by core, http
  and sse: it **awaits nothing that waits on a tool or a request** — not `settled()`, not
  `settled(instance)`, not an instance close already running, not the pool's drain of running
  requests and disposals, not a state undo — and writes the logoff of **every connection the
  server owns** (a process-wide view of the owned connections, kept by the connection-ends
  registry, §14.5), each `disconnect()` joined if one is already under way; on connection 16
  `disconnect()` resolves once the logoff is **written** to the socket, so nothing it awaits
  depends on SAP answering. No SAP request is aborted: SAP finishes what runs and then runs the
  queued logoff (§15). Then exit `1`, naming what was pending (tools still running, a state undo
  not done, a write not flushed). A tool that never settles cannot hold the forced close.
- **One registry of live tools, every transport.** lib's tool wrapper (`BaseMcpServer`, the one
  wrapper every package uses) registers each tool call — its settlement and the server instance it
  runs in — in one process-wide registry in lib (`src/lib/activeTools.ts`),
  across every server instance — stdio's, an SSE connection's, a new or pooled Streamable HTTP one
  (§3.8); core's, http's and sse's shutdowns and sse's connection close (D51) use it, and none has
  a second implementation. It answers for the whole process and for one
  instance (`settled(instance?)`, `latch(instance?)`, `pending()`). A tool **settles** when its
  handler's promise settles — after every request it sent was answered: a started tool runs to the
  end (D55). The registry aborts nothing; a request's controller is aborted only by its own
  `extra.signal` and its end (D4).
- **The admission latch.** The registry holds a synchronous shutdown latch, set **first**, in the
  same tick the shutdown starts (every transport). The wrapper
  registers a call **at its entry, before any connection is acquired or any handler runs**; once
  the latch is set, registration refuses, and that request is answered with the shutdown refusal
  (`interactive-login` `aborted` with the shutdown sentence, §7.4) — no connection, no handler, no
  request to SAP. So a request accepted before the shutdown whose body is still arriving (HTTP and
  SSE, `express.json()`), or a message read after stdin's end (stdio), reaches no tool. `settled()`
  waits for every entry registered before the latch; none can be added after it, so the set it
  waits for is complete, not a snapshot that misses a late one. **An instance has a latch of its
  own** (set first when the instance's close begins, D51), checked at the same registration: a tool call routed
  to an instance that is closing is refused the same way.
- **core**, in this order: set the latch; stop taking input; **await the settlement of every
  registered tool** — none is aborted (D55): a started tool runs to the end; the provider gate is
  still open, so its requests are still authorized with the credential held (a refresh included),
  but no interactive login starts once the shutdown began (the login wrapper answers
  `interactive-login` `aborted` with the shutdown sentence); then **close the instance** (D51's
  close: its held state shut down — today's `closeInstanceState`, kept in this place, before the
  gate, so a debugger stop's requests are still authorized; a leftover is a stderr line in fixed
  words and exit `1` — then every connection it owns closed with a logoff, D55, still before the
  gate, so the logoff is authorized); then close the provider gate (minted answer, D17); dispose every strategy the factory composed; drain the
  counted calls; `flush({ signal })` the broker — **no deadline of the server's choosing** (`SHUTDOWN_DEADLINE_MS` and the drain's
  timer, `countedProvider.ts:69-82`, are removed); exit `0`, or `1` with one stderr line per fact
  (`"<destination>": <reason>`, the reason `classify(entry, 'persisting-tokens').reason`).
- **What starts and what forces it**: the first trigger — `SIGTERM`, `SIGINT`, the end of stdin —
  starts the one sequence; **every stdin `end` / `close` is part of that start** (M7). Only a
  `SIGTERM` / `SIGINT` after the start, or `--shutdown-timeout=<seconds>` (`MCP_SHUTDOWN_TIMEOUT`,
  YAML `shutdown-timeout`, **no default**), ends the waiting early — **the forced close** (above):
  no further wait on a tool, an instance close or a state undo; every owned connection's logoff
  written; exit `1`, naming what was pending (D55).
  What that costs is documented with the option: a pending write is lost, and a discarded refresh
  token can come back.
- **http**: set the latch, and stop the pool's admission in the same tick (main's `503`); stop
  listening; **await the settlement of every registered tool** (the same registry, across the new
  and the pooled server instances, §3.8) — none is aborted (D55); then the transport's last step,
  **the pool's shutdown** (main's `InstancePool.shutdown()`: await the requests and disposals still
  running, dispose every held or retained instance through `dispose()` (D51) — each closing the
  connections it owns with a logoff (D55), so a shutdown leaves no SAP session, and no lock, open —,
  settle, retry once, report what is left — each instance by its ordinal, never
  its handle); exit `0`, or `1` with one stderr line per leftover. Main's `stop()` already closes the
  listener and runs that pool shutdown, and its running requests await their instance's `idle()`;
  what this change adds is the latch, the escapes, the logoffs and the exit lines. The same escapes
  as core and no others: a `SIGTERM` / `SIGINT` after the start, or `--shutdown-timeout`, ends the
  wait early — **the forced close**: the pool's drain is not awaited, every owned connection's
  logoff is written, exit `1` naming the requests still running (D55); **no deadline by default**. Nothing is
  persisted, so nothing is flushed.
- **sse**, exactly as http (the one sequence of lib's `http-transport`, D50): set the latch; stop
  listening — no new SSE connection, no `POST` admitted —; **await the settlement of every
  registered tool**, across the open connections' instances, none aborted (D55); then close every
  open connection's instance (D51's close, its connections closed with a logoff; joined when the
  connection is already closing) and end its stream; exit `0`, or `1` with one stderr line per
  leftover. Main's `stop()` already shuts down every open session's state and awaits the closing
  ones; it awaits no tool, sends no logoff and ends no stream — this change adds those. The same
  escapes and no others: a `SIGTERM` / `SIGINT` after the start, or `--shutdown-timeout`, ends the
  wait early — **the forced close**: no instance close is awaited, every owned connection's logoff
  is written, exit `1` naming the requests still running (D55); no deadline by default. Nothing is
  flushed.
- **(D51) An SSE connection that closes disposes its instance — decided by the user; this change
  completes what main already does.** By the ownership rule (the server owns the instances and the
  connections it builds) and D33's order (drain, then dispose).
  - **What main does, and what is kept** (§2): the session leaves the routing map first, so a later
    `POST` for its `sessionId` is answered as an unknown session; the state is shut down
    (`shutdownState()`); one tracked promise per closing session, which `stop()` awaits; no timer;
    leftovers reported on the state logger.
  - **What this change adds**, for that connection only, in this order: **the instance latch**, set
    in the same tick the close begins, so a `POST` already admitted whose body completes after it
    reaches no tool (RF6; today it would run on the closing instance); **await its registered
    tools' settlement** (`settled(instance)`; the server aborts none — the SDK's transport close
    aborts their `extra.signal`, which ends only their waits and keeps a tool not yet started from
    starting, D5, D55; today nothing awaits them, so the state's stop can race a running tool); then
    `shutdownState()` (main's, the state undo); then **the terminal close** — every connection the
    instance owns closed with a logoff, whatever the undo answered (its leftovers reported); then close the instance's MCP server and transport, awaited (today
    unawaited). This sequence is **the instance close**, one lib implementation, one promise per
    instance (a second caller joins it): the SSE close, SSE's and core's shutdowns use it.
  - **`BaseMcpServer.dispose()` is main's, extended — not new.** It stays awaited and callable again
    (each call retries what the state could not undo — the pool's retry and `shutdownState()` rely
    on it); it stays the **state undo** only. The connections are closed by **the terminal close**
    beside it (one lib function, `closeOwnedConnections(instance)`: `disconnect()` — the logoff that
    releases the session's locks, D55 —, each once, a failure logged in fixed words), which every
    terminal disposal runs after the undo whatever the undo answered; an injected connection is the
    consumer's and is never closed. The pool's eviction runs both (§3.8).
  - **The setup window** (missing on main): the session enters the map before `await
    server.connect(transport)`, the response's `close` listener is installed only after it, and a
    failed `connect` deletes the entry without shutting the state down. So the close tracking is
    installed **before the first setup await**: one cleanup promise per connection, reached by the
    response's `close`, by the stream's failure and by a rejected `connect` alike; an instance whose
    connection closed during setup is never published to the routing map (or is removed by that
    same cleanup), and the instance close runs once. A shutdown during setup awaits that same
    promise (RF8).
  - A process shutdown that meets a closing connection joins its close, never a second one (RF7); no
    connection's close waits for another's. Nothing is bounded by a timer of the server's (H5).

## 7. Failures: how they are read and what an MCP client sees

### 7.1 One reader

**(D14)** lib's `failureOf(thrown)` (`src/lib/auth/failures.ts`) — structural, total, no
`instanceof` on a chain class, no `message`, no `name`:

1. `isAuthProviderFailure(thrown)` → `readFailure(thrown, 'unfamiliar-error')`;
2. an own `refusal` with a known `kind` → `classify(refusal, 'unfamiliar-error')` (connection's
   `AuthRefusedError`);
3. ~~an own `code` equal to `ADT_REQUEST_ERROR.ABORTED` → `request_aborted`~~ and
3b. ~~an `IAdtError` with an own `refusal`~~ — **removed by D56**: connection 16 has no such code,
   interfaces-adt 16 no `refusal`; what A4 built for them is removed in C2;
4. the server's own refusal classes;
5. else `undefined` — not an authentication failure, answered as today.

**core** reads first `isDestinationConfigError(thrown)` (auth-broker, structural) → its
`destination`, `missingFields` and carried `error` (classified); then a store's refused record
(D54): an own `code` equal to `STORE_ERROR_CODES.STORAGE_ERROR` and an own `reason` equal to
`'record-format'`, each read guarded (`readOwn`), never the error's `message` and never
`instanceof StorageError`; then lib's `failureOf`. Reason:
lib depends on no broker (D38), and auth-errors decides what a value is (H6).

### 7.2 Where failures are caught

- **Outside a handler** — the tool wrapper's `catch`, the core launcher's check: the reader first.
- **Inside a handler (D56)**: there is no `IAdtError.refusal` — an auth failure inside a tool
  reaches the model **with the connection's own message** (fixed words, with the hint, as
  connection mints them), as it is: adt-clients carries it as `IAdtError { origin: 'connection',
  message }` (§2), and the handler's answer passes it on. The server neither recognises nor
  re-renders it there; it wraps no connection to learn more. The earlier drafts' failure observer
  on server-built connections and D16's "words only for an injected connection" are gone.
- `return_error` and `answer()` call the reader first.
- ~~**(D45)**~~ and ~~**(D46)**~~ below are **withdrawn by D56** (C7 and C8 are not built): both
  read the structured refusal adt-clients no longer carries. What remains true without them: a
  handler's text holds the connection's own fixed words for an auth failure, never a secret
  (connection mints them); a release that fails is reported in `cleanup` as today, and a lock it
  left is released by the session's logoff at the instance's end (§6.4). The text is kept as
  history.
- *(History, withdrawn by D56.)* **(D45) An auth failure ends the tool call before any conversion.** A failure that carries a
  refusal — readable by `failureOf` — is recognised **before** a handler or wrapper turns an error
  into text, a partial result or a new `Error`, and ends the tool call as that failure (§7.3); a
  rethrow keeps the original as `cause` and carries its `refusal`. lib gives the sites one helper:
  `endIfAuthFailure(errorOrAnswer)` throws a `ToolAuthFailure` holding the read failure (the
  boundary answers it), else returns. **The audit** (`grep` over `src`, `compact*/src` for
  `getError()`, `.message`, `new Error(`, `String(error)`, and `catch` blocks over adt-clients
  calls), by pattern:

  | Pattern | Sites |
  |---|---|
  | **P1 — a refusal rethrown as a new `Error` of its message** | `handleGetIncludesList.ts:284` (the function-group list), `handleGetStructuresList.ts:248`, `src/lib/search-source/packageResolver.ts:88` |
  | **P2 — a refusal's message folded into the tool's own text or a returned string** | `handleGetWhereUsed.ts:120` (`return_error(message)`), `handleGetPackageTree.ts:112`, `handleCreateTransportTask.ts:167`, `src/lib/strategies/activationRun.ts:218`, `:239`; a log line only: `handleUpdatePackage.ts:195` |
  | **P3 — a refusal collected into a partial result answered `isError: false`** | `handleGetIncludesList.ts:143-152` (`readSource` → `unreadable`, answered at `:319-338`), `handleGetEnhancements.ts:238-241` (`unreadable`) |
  | **P4 — the `IAdtError` passed on whole** (kept: its `refusal` travels; checked) | `handleUpdateDomain.ts:159`, `handleUpdateDataElement.ts:203`, `handleCreateTransportTask.ts:179`, `handleGetObjectVersionDiff.ts:91`, `resolveVersionedObject.ts:173`, `:185` (`thrown(…)` must keep `refusal`), `handleCreateFunctionGroup.ts:152`, `withLock.ts:117`, `:246` (a spread keeps the own `refusal`) |
  | **P5 — a caught value normalised as `error instanceof Error ? error : new Error(String(error))`** | `handleGetIncludesList.ts:344`, `handleGetObjectVersionSource.ts:97`, `handleGetObjectVersions.ts:88`, `:119`, `handleSearchSource.ts:140`, `objectVersionTools.ts:185`, `:216`, `:281`, `:369` — an `Error` passes as itself, so `return_error` reads its `refusal`; a non-`Error` is wrapped with the value as `cause` |
  | **P6 — `answer()`'s failure payload** | `src/lib/answer.ts:103` (`failurePayload` builds `message` from the `IAdtError`): `return_answer` checks `refusal` first |
  | **P7 — every other `catch` over an adt-clients call** | 111 `catch` blocks in `src/handlers` and `compact*/src`, and 73 in the library and server paths (`src/lib` — `utils.ts` 20, `strategies/`, `search-source/`, `compact/` —, `src/embeddable`, `server/src`, then `http/src` and `sse/src`): the plan audits each and records it as one of P1–P8 or "rethrows the original" |
  | **P8 — library conversions of a release or a read** | `withLock.ts:33-43` (`runRelease`, a thrown release → `{ error: 'client_threw', message }`), `:46-58` (a refused release → `{ message, origin, request }`), `:136-141` (a body that succeeded + a failed release → `ok: true` with that carrier), `:169` (`messageOf`), `:181-190` (`LockNotReleased`'s message); `safeFields.ts:56` (`safeCleanup` keeps `message` only); `answer.ts:57-60` (`local()` renders the carrier); `search-source/sourceReader.ts:39-50` (`safe()`: a failed read → `null`, a debug line, a shorter result) |

  That is 38 sites in 23 files (P1 3, P2 6, P3 2, P4 9, P5 9, P6 1, P8 8), and the 184 `catch`
  blocks of P7. At P1–P3 and P7 the
  helper runs first; P4–P6 are kept and pinned. **A source test keeps the list honest**: it scans
  for the patterns and fails on any occurrence not in the list (`tools/auth-failure-sites.json`,
  file, line pattern, kind), and on any listed P1–P3 / P7 site whose block does not call
  `endIfAuthFailure` before converting. Reason: the goal's *Failures reach the user as the chain
  made them* holds in every mode only if no handler turns a refusal into text or a partial
  success first; a new handler meets the test.
- *(History, withdrawn by D56.)* **(D46) A release that fails on the credential** (`withLock`, P8). The cleanup carrier keeps the
  structured failure (`refusal`, rendered as `kind`, `message`, `hint` by `safeCleanup` and
  `answer()`), and:
  - **after a body that succeeded**: the tool call ends as that auth failure —
    `error: authentication_failed` with `kind`, `message`, `hint`, `operation: 'succeeded'` (the
    write landed) and `cleanup: { lock: "<object type> <name>", held: "may be held" }` — and
    **nothing after it runs** (no activation, no check): `withLock` throws a `ToolAuthFailure`
    carrying the body's result, so the handler's next step is never reached. A release refused by
    SAP for any other reason keeps today's answer (success with `cleanup`,
    `withLock.ts:120-141`);
  - **after a body that failed**: both are reported — the body's failure as the error (an auth
    failure as §7.3, any other as today) and the release's in `cleanup` with its `kind`, `message`,
    `hint` and the held lock;
  - a thrown release (`runRelease`'s `catch`) is read by `failureOf` first; only a value with no
    refusal becomes `client_threw`.

  Reason: an auth failure during the unlock means the lock may still be held and the next step
  would run with a refused credential; the user must learn both, in the chain's words.

### 7.3 What the MCP client sees

An `isError` result, JSON in the shape of the server's local failures (`src/lib/answer.ts:41-67`):

```json
{ "error": "authentication_failed", "kind": "credential-refused",
  "message": "the user or password was refused", "hint": "check the user and password",
  "server": "…the server's own sentence, when it has one…" }
```

| Source | `error` | `kind` | `message` | `hint` |
|---|---|---|---|---|
| a chain failure | `authentication_failed` | its `kind` | its `reason` | its `hint` |
| `DestinationConfigError` (core) | `destination_refused` | — (`cause_kind` when it carries an error) | `Destination "<name>" cannot be used: <fields>` | the carried hint, then one fixed hint per known field (`HINTS`: `grantType`, `SAP_URL`, `XSUAA_MCP_URL`, `connection-type`, `browser`). No hint for `issuedFor` / `issuedBy` / `authorizationToken`: broker 5.0.1 names them only on the `none` path (a handed-over credential), which stdio refuses after D53 (measured, A5). A token session bound to another destination's means is not refused: the broker discards it with its warn line and the provider logs in again |
| a store's refused record (`StorageError`, `reason: 'record-format'`, core, D54) | `destination_refused` | — | `Destination "<name>" cannot be used: its session record is not in the store's format` (the server's own fixed words with the destination it serves, never the store's `message`) | "regenerate the session with mcp-auth: `mcp-auth --destination <name> --type abap\|xsuaa`, or `mcp-auth --service-key <file> --output <file> --type abap\|xsuaa` (from @mcp-abap-adt/auth-broker-cli)" |
| ~~`ADT_REQUEST_ABORTED`~~ — removed by D56 | — | — | — | — |
| an auth failure inside a tool (D56) | as the handler answers today (`IAdtError` `origin: 'connection'`) | — | the connection's own fixed words, with its hint | in the message |
| `UnsupportedAuthenticationError` for `jwt` / `none` (core, D53) | `destination_refused` | — | `Destination "<name>" uses jwt / none, which this server does not support` | "a token you hold is sent in the x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse; for stdio, create the session with mcp-auth" |
| the server's own refusal | `destination_refused` / `fresh_connection_unavailable` / `inspection_only` / `credentials_required` (HTTP, SSE) | — | fixed words | — |

Out, always: `diagnostics` (to stderr only), `facts` beyond `kind`, any thrown value's `message`, a
token, a URL with a query, `state`. The stderr line is `logFields(error)`.

### 7.3a An ADT authorization error is not a credential refusal (D47)

A user who logged on but may not work with an object gets, typically, a `403` with an ADT
exception body (`<exc:exception>` with SAP's message). That is **the system's answer, not a
refusal of the credential**, and it reaches the client as an ADT error with its ADT text, exactly
as today:

- connection does not ask the credential about a `403` (`credentialRejection` answers only a
  wire's refused logon or a `401`, `AbstractAbapConnection.ts:1626-1640`), so no `rejected()`, no
  renewal, no `AuthRefusedError`; adt-clients reads the answer as `AdtSAPError` →
  `IAdtError { origin: 'refusal', message: <SAP's text>, adtType, … }` (interfaces-adt 16 has no
  `refusal` field at all, D56); `answer()` renders it as today (`failurePayload`, `message` and
  `raw_body`);
- `failureOf` never reads a status or `origin` (and, D56, a handler's `IAdtError` not at all) — so a `403` is never
  relabelled `authentication_failed`. A `system-refused` failure (`not-authorized`, `403`) exists in
  the chain only as a provider's verdict inside `rejected()`, which the connection does not call for
  a `403`;
- over RFC, only `RFC_LOGON_FAILURE` (and SNC's GSS codes) is the credential's; an authority check
  failing inside ADT answers its ADT exception like HTTP.

Test (§14.2): a `403` with an ADT exception body on a server-built and on an injected connection —
the tool result carries SAP's text and `origin: 'refusal'`, its `error` is not
`authentication_failed`, and no renewal was asked.

### 7.4 The server's own sentences (D28)

Keyed on `kind` and the server's own state, never on words: the login bound fired (D10);
`renewal-declined` under `refresh-only` (D11); `aborted` while shutting down; `unknown`
`persisting-tokens` ("the session could not be written to the destination's file"). **(D17)** The
closed gate answers `authError['interactive-login']({ outcome: 'aborted' })` with the shutdown
sentence; inspection-only mode is the server's own `inspection_only` refusal.

## 8. The browser (stdio)

**(D9)** `--browser` is an enum mapped by `process.platform` to auth-providers' factories
(auth-providers README, *Interactive login*; the same table as auth-broker-cli 3):

| `--browser` | `linux` | `darwin` | `win32` | other |
|---|---|---|---|---|
| `system` (default), `auto` | `linuxDefaultBrowser()` | `macDefaultBrowser()` | `windowsDefaultBrowser()` | unavailable: a `jwt` / `authorization_code` destination is refused at start (D18): "use `--browser=none`" |
| `chrome` | `linuxBrowser('google-chrome')` | `macBrowser('Google Chrome')` | `windowsBrowser('chrome')` | unavailable |
| `edge` | `linuxBrowser('microsoft-edge')` | `macBrowser('Microsoft Edge')` | `windowsBrowser('msedge')` | unavailable |
| `firefox` | `linuxBrowser('firefox')` | `macBrowser('Firefox')` | `windowsBrowser('firefox')` | unavailable |
| `none`, `headless` | no browser: the URL on stderr; the login waits | the same | the same | the same |

`--browser-program=<program>` (`MCP_BROWSER_PROGRAM`, YAML `browser-program`, excludes
`--browser`) runs the named program — `linuxBrowser(program)` on a platform outside the table, a
plain spawn of the program; a name outside the enum, or `--browser-program` beside `--browser`, is
refused at start on every platform. "Unavailable" refuses only where a login can happen: a `jwt` /
`authorization_code` destination, at the startup check (D18); `basic`, `snc` and
inspection-only mode start on any platform. The mapping is a pure function returning
`{ factory, argument }` or `{ unavailable }`, tested without constructing a browser. The
callback port keeps `--browser-auth-port` (default 61001). All of it lives in core.

## 9. Debug output and logging

- **(D24) `--auth-debug`** (YAML `auth-debug`, **no environment form**), core only — the HTTP and
  SSE packages build no token provider, so they have no providers' debug line. It sets the broker's
  `authDebug: true` and routes the broker's logger to stderr, with one start line warning that a
  refused token request's line names its secrets' first and last four characters. No variable
  turns it on. `DEBUG_AUTH_LOG` keeps routing the broker's logger to stderr; its lines carry no
  secret without `authDebug`.
- **Prompts** (core): the strategy wrapper's logger writes `info` to stderr; the authorization URL
  is written by auth-providers to stderr only, and only when no browser is set or the launch failed.
- **(D25)** The startup summary shows presence only (`Password: set`).
- **No `message` of a thrown value in a log line** on the auth paths; an auth failure logs
  `logFields(error)`. SSE's failed-`POST` line (`SseServer.ts:436-439`: the error's `message` and
  the whole error) and its failed-connect line (`:376-378`) log fixed words and `logFields` of the
  read failure instead.
- **(D26) No regular expression over untrusted input** in the touched files: `destinationName`
  (core), the parameter parsers, `errorClassOf`, `return_error`, `notStoredOf`'s removal — plain
  code, and a source test.
- **(D27) "Server text" — decided by the user** — means text an authorization server or identity
  provider sent; ADT answers, ADT's own authorization errors included (D47), stay in tool results
  as the tools' data.
- **stdout**: nothing is added. core is a stdio server; the HTTP and SSE packages write their lines
  to stderr as today.

## 10. Options per binary, and every API change

### 10.1 The parameter tables (D38)

Each binary reads its own table through lib's machinery; **an option of another binary is not in
its table**. The help, the YAML template and the validation come from it.

| Binary | Options |
|---|---|
| `mcp-abap-adt` (core) | `--mcp`, `--env`, `--env-path` / `MCP_ENV_PATH`, `--auth-broker-path` / `AUTH_BROKER_PATH`, `--unsafe` / `MCP_UNSAFE`, `--browser` / `MCP_BROWSER`, `--browser-program`, `--browser-auth-port` / `MCP_BROWSER_AUTH_PORT`, `--connection-type` / `SAP_CONNECTION_TYPE`, `--system-type` / `SAP_SYSTEM_TYPE`, `--login-timeout`, `--renewal`, `--shutdown-timeout`, `--auth-debug` (no env), `--exposition` (with `debug`), `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES`, `--conf`, `--help`, `--version`; the debugger's ids `SAP_DEBUG_TERMINAL_ID` / `SAP_DEBUG_IDE_ID` (the destination's `.env`, then the environment) |
| `mcp-abap-adt-http` | today's HTTP options, same names: `--host` / `--http-host` / `MCP_HTTP_HOST`, `--port` / `--http-port` / `MCP_HTTP_PORT`, `--path` / `--http-path`, `--http-json-response` / `MCP_HTTP_ENABLE_JSON_RESPONSE`, `--http-allowed-hosts` / `MCP_HTTP_ALLOWED_HOSTS`, `--http-allowed-origins` / `MCP_HTTP_ALLOWED_ORIGINS`, `--http-enable-dns-protection` / `MCP_HTTP_ENABLE_DNS_PROTECTION`, `--tls-cert` / `--tls-key` / `--tls-ca` (`MCP_TLS_*`); `--system-type` / `SAP_SYSTEM_TYPE`, `--shutdown-timeout`, `--exposition` (with `debug`), `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES` (the pool's held state, §3.8), `--conf`, `--help`, `--version`; per request the headers `x-sap-debug-terminal-id` / `x-sap-debug-ide-id`, then `SAP_DEBUG_TERMINAL_ID` / `SAP_DEBUG_IDE_ID` of the environment |
| `mcp-abap-adt-sse` (D48) | today's SSE options, same names: `--sse-host` / `MCP_SSE_HOST`, `--sse-port` / `MCP_SSE_PORT`, the SSE and `POST` paths, `--sse-allowed-hosts` / `MCP_SSE_ALLOWED_HOSTS`, `--sse-allowed-origins` / `MCP_SSE_ALLOWED_ORIGINS`, `--sse-enable-dns-protection` / `MCP_SSE_ENABLE_DNS_PROTECTION`, `--tls-cert` / `--tls-key` / `--tls-ca` (`MCP_TLS_*`, lib's shared rows, D50); `--system-type` / `SAP_SYSTEM_TYPE`, `--shutdown-timeout`, `--exposition` (with `debug`), `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES`, `--conf`, `--help`, `--version`; the opening request's `x-sap-debug-terminal-id` / `x-sap-debug-ide-id`, then `SAP_DEBUG_*` of the environment |
| `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse` (D49) | core's, respectively http's and sse's, table with compact's `--exposition` (`ro` / `rw`, `debug` beside either) — the tool set's, nothing else |

`--state-idle-minutes` is one shared row of lib (CLI beats environment beats YAML, `--state-idle-minutes=<minutes>`, refused at start outside 30–35 791 or when not a whole number, as main reads it), in every binary's table; `--exposition`'s `debug` and the debugger ids keep main's meaning on every transport.

**Removed parameters stop the start, naming where they went (D39)** — the mechanism 16.0.0 used
(`REMOVED_PARAMETERS`, `authParameters.ts:118-158`), not a cross-mode check:

- **`--transport` / `MCP_TRANSPORT` / YAML `transport` is removed entirely — decided by the user**:
  a binary is its transport. Passing it with any value stops the start: in core and
  `mcp-abap-adt-compact`, "`--transport` is gone: `mcp-abap-adt` serves stdio; for Streamable HTTP
  run `mcp-abap-adt-http`, for SSE `mcp-abap-adt-sse` (compact: `mcp-abap-adt-compact-http`,
  `mcp-abap-adt-compact-sse`)"; in `mcp-abap-adt-http` and `mcp-abap-adt-compact-http`,
  "`--transport` is gone: `mcp-abap-adt-http` serves Streamable HTTP; for stdio run `mcp-abap-adt`,
  for SSE `mcp-abap-adt-sse`"; in `mcp-abap-adt-sse` and `mcp-abap-adt-compact-sse`, "`--transport`
  is gone: `mcp-abap-adt-sse` serves SSE; for stdio run `mcp-abap-adt`, for Streamable HTTP
  `mcp-abap-adt-http`".
- **`low` in `--exposition`** of `mcp-abap-adt`, `mcp-abap-adt-http` and `mcp-abap-adt-sse` (CLI
  and YAML alike — `EXPOSITION_ROW` has no environment form; D56, §3.9): "the low
  set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http /
  -compact-sse)";
- in the stdio binaries, `--allow-destination-header`; the SSE options (`--sse-host`,
  `--sse-port`, `--sse-path`, `--post-path`, `--sse-allowed-*`, `--sse-enable-dns-protection`,
  `MCP_SSE_*`: "SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)"); the HTTP ones
  (`--http-*`, `--host`, `--port`, `--path`, `MCP_HTTP_*`: "Streamable HTTP is served by
  `mcp-abap-adt-http` (`@mcp-abap-adt/http`)"); `MCP_TLS_*` / `--tls-*` ("TLS is an option of
  `mcp-abap-adt-http` and `mcp-abap-adt-sse`");
- in the HTTP and SSE binaries, `--mcp`, `--env`, `--env-path`, `--allow-destination-header`,
  `--unsafe`, `--browser*`, `--login-timeout`, `--renewal`, `--auth-debug`, `--auth-broker-path`,
  `--connection-type` ("destinations and
  logins are served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers"); in the HTTP binaries
  the SSE options, and in the SSE binaries the Streamable HTTP ones, each with the sentence above
  naming the binary that serves it.

**Which forms are refused — decided by the user.** Another binary's option stops the start in its
CLI and YAML forms, which are stated for this run. Its environment variable is not read: an
environment is inherited (a shell profile, one `EnvironmentFile` for several binaries), and 17.x
ignored these variables in a working configuration. So `MCP_SSE_*`, `MCP_HTTP_*` and `MCP_TLS_*`
are ignored by core and compact, `MCP_SSE_*` by the HTTP binaries, `MCP_HTTP_*` by the SSE ones, and
`MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_BROWSER*`, `MCP_LOGIN_TIMEOUT`, `MCP_RENEWAL`, `AUTH_BROKER_PATH`
and `SAP_CONNECTION_TYPE` by the HTTP and SSE binaries. The one environment variable refused
everywhere is `MCP_TRANSPORT`: it stated the transport, and a binary now is one.

### 10.2 Each current call site → its new form

| Site | Today | 19.0.0 |
|---|---|---|
| `brokerFactory.ts:251-258` (→ core) | `new AuthBroker({ serviceKeyStore, sessionStore, ...handler.brokerOptions(ctx) }, logger)` | `+ renewal, onWriteFailure (by store, D12), authDebug` |
| `brokerFactory.ts:184-198` | provider cached by the factory | `getProvider(d, { signal })` per request, counted wrapper memoised |
| `brokerFactory.ts:217`, `:58-68` | `flush()`; `notStoredOf` with `ENTRY` | `flush({ signal })`; `classify(entry, 'persisting-tokens')` |
| `errors.ts:97-118`, `:55-61` | `describeAuthError`; `errorClassOf` with a regex | `failureOf` (lib) + core's destination reader; plain-code `errorClassOf` |
| `handlers/jwtAuthorizationCode.ts:5-18` | `oneLoginAtATime(strategy({ browser: string, port }), lock)` | `serverLogin(browserCallbackStrategy({ browser?: IBrowser, port }), context)` (D8) |
| `countedProvider.ts:24-27`, `:69-82` | unminted refusal; drain timer | minted; no timer |
| `shutdown.ts:22-23`, `:71`, `:94-97` | 30 s; `settle(30_000)`; end and close two triggers | D33 |
| `launcher.ts` (core) | every transport; `promptsOnStderr`; `factoryConfigFrom`; `checkAndSummarise`; `stateIdleMinutes` / `stateLogger` to every transport | stdio only; folded into the wrapper; D9–D12, D24; D18, D25; http's and sse's launchers hand `stateIdleMinutes` / `stateLogger` on as core's does (§3.8) |
| `stateClose.ts` (core, main's `closeInstanceState`) | the stdio instance's held state shut down before the factory's settle | D51's instance close, in D33's core order |
| `StdioServer.ts:34-35`, `:51-67` | context set once; fake refusing provider | destination source; `inspection_only` |
| `StreamableHttpServer.ts` (→ http) | destinations, `FirstConnectLock`, headers; the instance pool by `state_handle` (`InstancePool.ts`), `stop()` draining it | headers only (D39), through lib's `headerSource` (D50), on new and pooled instances alike; no `IDestinations` in its constructor; the pool carried as it is (§3.8, D52); `stop()` in D33's http order |
| `SseServer.ts` (→ sse) | destinations, `FirstConnectLock`, headers; a close removes the session, closes unawaited and shuts the state down (`shutdownState()`); `stop()` shuts down every session's state | headers of the opening `GET` only (D48), through `headerSource`; no `IDestinations`; a close runs D51's instance close (latch, settle — no tool aborted —, state undo, the terminal close with its logoffs, MCP server), the setup window included; `stop()` in D33's sse order |
| `dnsRebindingProtection.ts`, `tlsUtils.ts` (→ lib) | in core, then http | `@mcp-abap-adt/lib/http-transport` (D50) |
| `destinationRequest.ts` | destination header, first-connect lock, failure answer | the destination part deleted; the failure answer is lib's §7.3 |
| `BaseMcpServer.ts` (context setters, `getConnection()`, the tool wrapper) | context setters; `getConnection()`; `(args)`; held state: `dispose()`, `shutdownState()`, `idle()` (main) | the source (§4); `getConnection(signal)`; `(args, extra)`, the signal scope, D5, D7, §7.2; `dispose()` extended and the instance close with its latch (D51) |
| `clients.ts:34-51` | `new GuardedAdtClient(connection, logger, options)` | unchanged: no signal (D55; D31's server side withdrawn) |
| `withLock.ts:26-40`, `:107` | `runRelease(release, handle)` | unchanged: a failed release is reported in `cleanup` as today; a lock it left is released by the session's logoff at the instance's end (§6.4). (D46's reading withdrawn by D56; D40's `runWithoutRequestSignal` withdrawn by D55) |
| `credentialSources.ts:33-59` | default branch → basic | D19 |
| `packageSessions.ts:40-61`, `handleDeletePackage.ts:93-108` | record, else configuration; fallback | D20, D21 |
| `requestSystemResolution.ts:104-125` | memo; lookup on the caller's connection | unsignalled shared lookup, raced per caller |
| `utils.ts:229-371` `return_error` | regexes over `message` | `failureOf` first; plain code |
| `src/__tests__/integration/globalSetup.ts`, `helpers/authHelpers.ts` | auth-providers 5's `browserCallbackStrategy` | 6.0's, from core |

### 10.3 The exported API, for embedders

- `@mcp-abap-adt/lib/embeddable`: `ConnectionContext` (§4), `EmbeddableMcpServerOptions.freshConnection`
  (§4.3; no signal, D56), `BaseMcpServer`'s `ConnectionSource`.
- `@mcp-abap-adt/lib/tool-set`: `fullToolSet` without the low set (D56, §3.9).
- `@mcp-abap-adt/lib/auth`: §3.4; `describeAuthError` → `failureOf`.
- `@mcp-abap-adt/core/auth`: the destination layer — `AuthBrokerFactory` with
  `IAuthBrokerFactoryConfig` (`browser?: IBrowser`, `browserStrategy` with that option, `renewal`
  required, `onWriteFailure` by store, `loginTimeoutMs?`, `authDebug?`), `IDestinations.getProvider(d,
  { signal? })`, `settle({ signal? })`.
- `@mcp-abap-adt/http`: `StreamableHttpServer(handlersRegistry, options)` — no destinations argument.
- `@mcp-abap-adt/sse`: `SseServer(handlersRegistry, options)` — no destinations argument.
- `@mcp-abap-adt/lib/http-transport` (D50): the shared helpers; `@mcp-abap-adt/lib/tool-set`:
  `ToolSet`, `fullToolSet`, `compactToolSetOf` (D49); `BaseMcpServer.dispose()` extended (D51).

## 11. Docker images and release artifacts

**(D41)**

- **`docker/Dockerfile`** installs `@mcp-abap-adt/http` and runs `mcp-abap-adt-http`
  (`MCP_HTTP_HOST=0.0.0.0`, `MCP_HTTP_PORT=3000`): no `AUTH_BROKER_PATH`, no `service-keys/` or
  `sessions/`, no `--allow-destination-header`; it also installs `@mcp-abap-adt/compact-http`, whose
  `mcp-abap-adt-compact-http` is the documented alternative command (D37, D49) — never
  `@mcp-abap-adt/compact`, which would bring core, the broker and the stores into the image. The
  image serves Streamable HTTP only: SSE has no image of its own in this change (`mcp-abap-adt-sse`
  from npm); `HEALTHCHECK` on
  `/mcp/health` unconditionally. The package source is a build argument: the registry by default,
  the packed tarballs of the checkout in CI — so the image is verified before the package exists on
  npm. Verified on the built image: the health endpoint answers `200`, and a `tools/call` with only
  `x-sap-*` headers against a local ADT stand-in answers.
- **`docker/Dockerfile.inspect`** (Glama) keeps running core over stdio behind `mcp-proxy` —
  inspection-only without a destination, as today; only its `CORE_VERSION` moves.
- **Compose**: `docker-compose.yml` becomes the headers-only service (the former
  `docker-compose.headerless.yml`, which is deleted), with no volume; `docker-compose.inspect.yml`
  unchanged.
- **Workflows**: `ci.yml` and `release.yml` lint, build, type-check and test every new package —
  `http/` and `sse/` with their own suites, `compact-http/` and `compact-sse/` through the root
  suite as the compact packages are today (§14) — beside the others, pack them all, install the
  tarballs and run `--version` / `--help` of all six bins (`mcp-abap-adt`, `mcp-abap-adt-http`,
  `mcp-abap-adt-sse`, `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`,
  `mcp-abap-adt-compact-sse`), and build the image from the tarballs; `scripts/publish-all.sh`
  publishes in dependency order (§13): `.`, `./compact-readonly`, `./compact-modify`, `./server`,
  `./http`, `./sse`, `./compact`, `./compact-http`, `./compact-sse`; `binSmoke.test.ts` installs
  and starts the six bins.
- **Metadata**: `docs/deployment/RELEASE.md` names nine packages and the order; `server.json`
  keeps core as `stdio` and its environment variables less the HTTP and SSE ones; one registry
  entry per new package, each with its own `mcpName`: `server-http.json`
  (`io.github.fr0ster/mcp-abap-adt-http`, `streamable-http`), `server-sse.json`
  (`io.github.fr0ster/mcp-abap-adt-sse`, `sse`), `server-compact-http.json`
  (`io.github.fr0ster/mcp-abap-adt-compact-http`, `streamable-http`), `server-compact-sse.json`
  (`io.github.fr0ster/mcp-abap-adt-compact-sse`, `sse`); `server-compact.json` stays compact over
  `stdio`; `glama.json`'s description names the transports per package; `releaseMetadata.test.ts`
  covers every entry.

## 12. Documentation and migration notes

**`docs/MIGRATION-19.0.md`**, row by row:

- **HTTP users**: install `@mcp-abap-adt/http`, run `mcp-abap-adt-http`; credentials only from
  `x-sap-*` headers per request; the default destination, `x-mcp-destination`,
  `--allow-destination-header`, service-key and session mounts are gone; the Docker image changed
  accordingly. The debugger keeps working as in 17.2: the pool
  by `state_handle`, `--state-idle-minutes`, `x-sap-debug-*`; `SAP_DEBUG_*` of a destination's
  `.env` no longer applies (no destinations) — send the headers or set the environment.
- **SSE users**: SSE keeps working, from its own package: install `@mcp-abap-adt/sse`, run
  `mcp-abap-adt-sse` (`--transport=sse` is gone); the SSE options keep their names; credentials
  only from the `x-sap-*` headers of the request that opens the SSE connection; the default
  destination, `x-mcp-destination`, `--allow-destination-header`, service-key and session mounts
  are gone; when a connection closes, its running tools run to the end and are awaited, then its
  instance is disposed and its ADT sessions closed with a logoff, which releases their SAP locks
  (D55); the debugger and `--state-idle-minutes` as in 17.2, with
  the same `.env` note as HTTP.
- **low users (D56)**: **the low set is gone from mcp-abap-adt / -http / -sse; use
  mcp-abap-adt-compact (or -compact-http / -compact-sse)** — with the low → compact mapping table
  (each low tool → the compact handler and action that does the same, §3.9); `--exposition=…,low`
  stops the start with that sentence; standalone lock / unlock are compact's `HandlerLock` /
  `HandlerUnlock` (keep a lock short — yours to manage); every full-binary tool locks, writes and
  unlocks its own object inside one call.
- **every transport (D56)**: **the long tools named in the note's list** (approved by the user
  tool by tool — where-used and the like) **take an optional `timeout`** (seconds, no default —
  no value waits until done); each runs stateless on its own
  connection, closed with a logoff when it ends or its timeout fires; set it below your MCP
  client's request limit (the TypeScript SDK's client cancels at 60 s), because **a cancel does
  nothing to SAP**: no request is recalled, no session is logged off or reopened while the instance
  lives; a tool not on the list — activation and the debugger, unless the user put them there —
  takes no `timeout` and runs to its end; a tool's
  session is stateful only for lock → write → unlock and activation.
- **compact users**: one package per transport — over stdio `mcp-abap-adt-compact`
  (`@mcp-abap-adt/compact`) as today; over Streamable HTTP `mcp-abap-adt-compact-http`
  (`@mcp-abap-adt/compact-http`); over SSE `mcp-abap-adt-compact-sse` (`@mcp-abap-adt/compact-sse`);
  each identical to its full transport's bin but for the tool set; `debug` beside `ro` / `rw` on
  each.
- **stdio users**: `--transport` is gone — remove it (D39); a destination with **no** session record
  logs in on first use, as before, but an **existing** record of an older format is not read as
  unbound and no login starts — the start stops with the refusal below (an absent session permits
  a login, an invalid one stops);
  **a token you hold (`jwt` / `none`, `SAP_JWT_TOKEN` in an `--env` file) is no longer served
  over stdio** — send it in `x-sap-jwt-token` to `mcp-abap-adt-http` or `mcp-abap-adt-sse`, or
  create a stdio session with `mcp-auth` (D53); **only session records written by `mcp-auth` or
  by the server are read** — a record of an older format or written by hand is refused naming the
  destination: regenerate it with `mcp-auth --destination <name> --type abap|xsuaa` or `mcp-auth
  --service-key <file> --output <file> --type abap|xsuaa`; removing `SAP_ISSUED_FOR` /
  `SAP_ISSUED_BY` is no longer a remedy (D54); editing a destination's files while the server runs is
  unsupported — restart after any change (D3); `--browser` table, unknown names refused, `none`
  waits, `--browser-program`; no login timeout (it was 30 s) and `--login-timeout`; no shutdown
  deadline (it was 30 s), `--shutdown-timeout` and the second signal; a cancelled call ends its
  waits but a tool already running runs to the end, and shutdown lets running tools finish, then
  logs off every ADT session (D55); `--renewal`; a failed write
  to the `--env` file fails the request, under `--unsafe` it warns; `--auth-debug`; the summary
  shows presence only; `DeletePackage` no longer falls back; `npm run auth` → `mcp-auth` of
  `@mcp-abap-adt/auth-broker-cli`; failures as §7.3.
- **Embedders**: `freshConnection` — called with no signal (D56), also for a listed long
  tool's own connection (§5.8); nothing in the chain takes a request signal any more (connection 16,
  interfaces-adt-connection 3, interfaces-adt 16, adt-clients 31: no `signal`, no
  `ADT_REQUEST_ABORTED`, no `IAdtError.refusal`); connection 16's `disconnect()` resolves once the
  logoff is written; a connection the factory returned is the server's and is closed with
  `disconnect()`, an injected one stays yours to close;
  `ConnectionContext`; `lib/auth` lost the destination layer (now `core/auth`); `IAuthBrokerFactoryConfig`'s
  required options; `StreamableHttpServer` moved to `@mcp-abap-adt/http` and `SseServer` to
  `@mcp-abap-adt/sse`, each without its destinations argument; the shared transport helpers are
  `@mcp-abap-adt/lib/http-transport`; `BaseMcpServer.dispose()` also closes the connections the
  instance built once its state is empty; `AbapConnection` (connection 16 on interfaces-adt-connection 3) answers `unknown` by
  default — name the type or narrow it; `fullToolSet` has no low set; the chain's own migrations (auth-providers 6, broker 5,
  connection 12–16, auth-stores 5).

**Updated**: `README.md`, `server/README.md`, a new `http/README.md`, `sse/README.md`,
`compact-http/README.md` and `compact-sse/README.md`, `compact/README.md`, `CHANGELOG.md` (19.0.0, with
§15's measurements), `docs/user-guide/AUTHENTICATION.md` (stdio only; HTTP headers; the
read-once sentence), `CLI_OPTIONS.md` (per binary), `CLIENT_CONFIGURATION.md`, `TERMINOLOGY.md`,
`docs/configuration/YAML_CONFIG.md` (per binary), `docs/installation/INSTALLATION.md` and
`examples/SERVICE_KEY_SETUP.md`, `docs/deployment/DOCKER.md`, `RELEASE.md`, `MCP_REGISTRY.md`,
`docs/architecture/ARCHITECTURE.md`, `CONNECTION_ISOLATION.md`,
`docs/development/tests/TESTING_AUTH.md`, `DEBUGGING.md`, `docs/user-guide/DEBUGGER.md` (the
packages that keep the instance, §3.8), `src/embeddable/docs/ARCHITECTURE.md`
(no signal in the chain, D56; the terminal and forced close), `src/lib/config/README.md`, the moved `UNIFIED_BROKER_LOGIC.md`, each
launcher's help.

## 13. Version, release and how the change is committed

- **(D29) Nine packages at 19.0.0**, the four new ones (http, sse, compact-http, compact-sse)
  included, from PR #287 — **decided by the user: one PR, one major release**; D56's changes (the
  low set gone, stateful only for lock, unlock and activation, listed long tools' `timeout`, no signal)
  ship in it too, not in a release of their own — the low set gone, the logoff on every connector
  close, the `timeout` of listed long calls, the auth stack update and the package split are its
  scope.
- **The server waits for its prerequisites** (§3.1) — the user's debugger releases first
  (main's 18.0.0: interfaces-adt 15.1.0, adt-clients 29.1.0), then the removal chain (D56):
  interfaces-adt-connection 3.0.0, interfaces-adt 16.0.0, connection 16.0.0, adt-clients 31.0.0 —
  then
  releases per `RELEASE.md`: manifests and
  sibling ranges, metadata, CHANGELOG and docs, `npm ci`, build, `test:check`, `npm test`
  (binSmoke), each package's own tests, `release:dry` ending `Published: 9  Skipped: 0`; the
  lockfile holds no `"link": true` and nothing not from the registry; the publish follows the
  dependency order `.`, `./compact-readonly`, `./compact-modify`, `./server`, `./http`, `./sse`,
  `./compact`, `./compact-http`, `./compact-sse` (each package after every sibling it depends on);
  after publishing, a clean install of `@mcp-abap-adt/core`, `http`, `sse`, `compact`,
  `compact-http` and `compact-sse` at 19.0.0 outside the repository runs each of the six bins'
  `--version` and `--help`. The publish is the user's.
- **(D42) How the change is committed** — so the debugger branch rebases cheaply:
  1. **the move, alone**: one commit that moves files between packages (`git mv`) and fixes only
     imports and package manifests, behaviour unchanged, the suite green — including the HTTP
     package created from core's HTTP files, SSE still inside it;
  2. **SSE to its own package, a pure move too** (D48, D50): `SseServer.ts` from `http/` to the new
     `sse/`, and the helpers both transports share (`dnsRebindingProtection.ts`, `tlsUtils.ts`,
     and, until its destination part is deleted, `destinationRequest.ts`) to lib's
     `http-transport`, so neither transport imports the other; imports and manifests only,
     behaviour unchanged, the suite green;
  3. then the behaviour changes, each in its own commits (dependencies, sources and modes,
     cancellation, failures, stdio auth, Docker and release, docs).

  A branch that touched moved files rebases over commit 1 with `git rebase` following the renames;
  every later commit touches the moved files in place.

## 14. Tests

**Shape**: unit suites need nothing outside the process — auth-stores 5 in temporary directories,
the real broker 5 and providers 6, a token endpoint and an ADT stand-in on `127.0.0.1`, an `IBrowser`
fake that plays the user. No test launches a program (`node:child_process` mocked where strategies
are composed). Every rule a test protects is shown load-bearing: break it, watch it fail, revert.
Each package runs its own suite (`npm --prefix http test`, `npm --prefix sse test` beside
`server/`); the compact packages' suites — `compact`, `compact-readonly`, `compact-modify`, and the
new `compact-http`, `compact-sse` — run in the root `npm test`, whose Jest `roots` name them, as on
main (they have no Jest configuration of their own).

### 14.1 Packages and options

- **The dependency rule (D38)**: `package.json` and the import graphs of the published lib, http,
  sse, compact-http and compact-sse hold no auth-broker / auth-stores / interfaces-auth-broker;
  core's does, and compact's only through core; http's graph holds no sse and sse's no http;
  compact-http's and compact-sse's hold no core. *Breaks:* a lib import of `AuthBrokerFactory`; an
  sse import of `@mcp-abap-adt/http`; compact-http depending on `@mcp-abap-adt/compact`.
- **Each binary's options**: core's help lists no HTTP or SSE option, http's no destination or SSE
  option, sse's no destination or Streamable HTTP option; each removed parameter stops its binary
  with its words; `--transport`, with any value, stops every binary naming the binary to use.
- **HTTP credentials**: a request with `x-sap-*` basic and with a token reaches the stand-in with
  that credential; none, or `x-mcp-destination`, answers `400` with its words; two concurrent
  requests with different users never see each other's credential; a request routed by
  `state_handle` to a kept instance (§3.8) builds its own connections from its own headers, not
  from the request that created the instance.
- **Held state on every transport (§3.8)**: `--state-idle-minutes` is in every binary's table and
  reaches the instances (a value under 30 stops the start, as main); the pool's existing suites
  (`InstancePool.test.ts`, `streamableHttpPool.test.ts`) pass unchanged in `http/`; `debug` in
  `--exposition` serves the debugger tools on the full and the compact sets of each transport.
- **SSE credentials (D48)**: an SSE connection opened with `x-sap-*` basic and with a token serves
  its `POST`s with that credential; a `GET` without them, or a `GET` / `POST` with
  `x-mcp-destination`, answers `400` with its words; two concurrent connections with different
  users never see each other's credential; a `POST`'s own `x-sap-*` headers change nothing.
- **Full and compact behave alike (D37, D49)**: one parametrised suite runs each transport test —
  credentials, cancellation, failures, shutdown — on each of the three transports (stdio, Streamable
  HTTP, SSE) with `fullToolSet` and with `compactToolSet`, through the six launchers; the only
  difference asserted is the tool list. *Break:* give one compact package's launcher an option of
  its own → the parity test fails.
- binSmoke installs and starts all six bins; `releaseMetadata` covers the new entries.

### 14.2 Failures (§7)

One test per source through a real request — a provider's `AuthProviderFailure`, connection's
`AuthRefusedError` (`refused-after-renewal`), core's `DestinationConfigError` (a destination
missing a field its authentication needs), core's refused record (an
`--env` file whose token has no `SAP_ISSUED_*` beside it, on auth-stores 5: `destination_refused`
with D54's words and hint, no login started, no request sent), a failure inside a handler on a server-built **and on an injected** connection (D56: the connection's own message reaches the tool result as it is; no `IAdtError.refusal`, no `ADT_REQUEST_ABORTED`); each asserts
`error`, `kind`, `message`, `hint` as `render` gives them and no diagnostics. Source tests: no
`instanceof` of a chain class, no `.message` read in the auth modules, no regex in the touched
files. Each §7.4 sentence under its condition.

*The two blocks below are withdrawn with D45 and D46 (D56; C7, C8 not built), kept as history.*

**Conversion sites (D45)**, each through real adt-clients against a stand-in that answers `401`
twice (a credential refused): **GetIncludesList** — a source read (P3: answered as the auth
failure, not `isError: false` with `unreadable`) and a function-group list (P1: the auth failure
with `kind` and `hint`, not a generic error); **GetEnhancements** (P3); **GetStructuresList** (P1);
**GetWhereUsed** (P2); **GetObjectVersions** (P5); **UpdateDomain** (P4); a high-level update
(P6, `answer()`). Each asserts `error: authentication_failed`, `kind`, `message`, `hint`.
*Breaks:* remove `endIfAuthFailure` from `readSource` → `isError: false`; drop `cause` from a P1
rethrow → `unknown`. The source test of §7.2 runs with them.

**A release refused on the credential (D46)**, through `UpdateServiceDefinition` with
`activate: true` against the stand-in: (a) the write is answered `200`, the unlock `401` twice —
the result is `authentication_failed` with `kind`, `message`, `hint`, `operation: 'succeeded'` and
the held lock naming the service definition; the stand-in's log holds no activation; (b) the update
is refused by SAP (`400`) and the unlock `401` twice — the body's failure is the error and
`cleanup` carries the release's `kind`, `message`, `hint` and the held lock. And a search-source
read refused on the credential ends the search as the auth failure, not a shorter result (P8).
*Breaks:* keep `runRelease`'s `{ message, origin, request }` carrier → no `kind`; return `ok: true`
after an auth-failed release → the activation is sent.

### 14.3 Injected connections and fresh connections

**An auth failure inside a handler on an injected connection** (a consumer connection that throws
`AuthRefusedError` from `makeAdtRequest`): the tool result carries the connection's own message
— its fixed words and hint — as it is (D56); the connection was not wrapped (its `makeAdtRequest`
is the consumer's own function, identity checked).


For `CreatePackage` (high, low), `LockPackage` over RFC and `DeletePackage` with
`force_new_connection`, on an injected connection whose configuration holds no usable credential:
with `freshConnection` the factory is called with no signal (D56), the operation runs on its
connection, which is disconnected, and no provider is constructed; without it,
`fresh_connection_unavailable`, nothing sent. *Breaks:* restore the configuration fallback; restore
`DeletePackage`'s fallback.

### 14.4 Cancellation

1. ~~**The signal reaches every request (D31)**~~ — withdrawn by D55; in its place **a started tool
   runs to the end (D55)**: through the real adt-clients against the stand-in,
   `UpdateServiceDefinition` with `activate: true` cancelled after its `LOCK` answered — the
   stand-in's log holds the `LOCK`, the update, the activation and the `UNLOCK`, and the tool's
   answer is produced; no `makeAdtRequest` of a tool carries a signal (stdio's kept connection,
   two concurrent requests on it, an injected connection, a factory's connection); the consumer's
   factory receives no signal (D56). *Break:* end the handler on the request's `extra.signal` →
   the update is missing from the log.
2. **The substitution sites (§5.2)**: (a) `CreatePackage` high and low over RFC and (b)
   `DeletePackage` with `force_new_connection` — the fresh connection's requests carry no signal,
   and the connection is disconnected when the operation ends, on success and on failure;
   (c) `LockPackage` (L) → `UpdatePackage` (U) → `UnlockPackage` (X) over RFC — no step carries a
   signal; U cancelled after its tool started runs to the end and keeps the session; X unlocks and
   closes the lock session with a logoff. *Break:* skip `releasePackageLockSession`'s
   `disconnect()` → no logoff in the log.
2a. **The shared system-context lookup (D44, amended by D56)**: two cloud requests share one
   lookup held at the stand-in; **one waiter cancels** → it is released at once, the lookup goes
   on, the other gets its context, and the answer is memoised; **every waiter cancels** → each is
   released at once, the lookup's request still runs to its end (no signal, D56), and its
   completed answer is memoised — a later request uses it without a new lookup; a failed lookup is
   not memoised. *Breaks:* tie the lookup to the first caller (the second is refused when the first
   leaves); memoise a failed lookup (the later request inherits the failure).
3. ~~**A cancelled mutation is never sent**~~ — withdrawn by D55; in its place **a request
   cancelled before its tool starts never reaches it, and one cancelled after changes nothing it
   sends**: a server-built connection against the stand-in; R1 and R2 tool calls that `POST`; R1
   cancelled while it waits in `connect()` (stdio) or before its handler is called — nothing of R1
   reaches the stand-in, R1 is answered `aborted`; R1 cancelled after its tool started, while both
   wait in `rejected()` and separately in `authorize()` — R1's `POST` is sent after the renewal and
   its tool answers; R2 `200` throughout. Over HTTP in core, in the HTTP package and in the SSE
   package (two `POST`s on one SSE connection).
4. ~~**Releases are not cancelled (D40)**~~ — withdrawn by D55; in its place **a session holding a
   lock is closed with a logoff**: a tool takes a `LOCK` and ends with it held (a lock tool, and an
   update whose `UNLOCK` the stand-in refuses); at shutdown (core, http with a per-request and a
   pooled instance, sse), at an SSE close and at the pool's eviction, the stand-in's log holds that
   session's logoff after the `LOCK`, before the process exits or the instance is gone. *Break:*
   skip `disconnect()` in `dispose()` → no logoff.
5. **A cancelled request does not reach its tool (D5)**, in each package and embedded.
6. **The cancelled caller settles first (D32, M3)**: R1 and R2 wait in stdio's shared `connect()`;
   R1 settles `aborted` before the token endpoint answers, R2 after with its token; no unhandled
   rejection. *Break:* await `connect()` without the race.
7. **A later request starts afresh (D7)**, also inside the abort window.
8. **A finished request's party is released (D4)**: after R1 completes, R2's cancelled login ends.
   *Break:* drop the `finally` abort.
9. **stdio's login ends with its request**: an MCP cancel during a browser login (fake browser,
   real loopback strategy on port `0`) ends it `aborted`; the port binds afterwards; the next request
   logs in.
10. **The login bound (D10)**: `--login-timeout=1` ends a login with the chain's words and the
    server's sentence; without it the login waits until the test aborts.
11. **HTTP and SSE disconnect**: a client that closes its connection mid-request — its waits end,
    and a request whose tool has not started never reaches it; a started tool runs to the end
    (D55); over SSE, closing the SSE stream does the same for every request in flight on it, and
    then its instance's connections are closed with a logoff.

### 14.5 Session writes, renewal, shutdown (stdio)

- `--env` file under `'fail'`: a store throwing `EACCES` fails the request with
  `persisting-tokens` and refuses the destination until a write lands; named + `--unsafe` under
  `'continue'`: the request succeeds and a stderr line reports the write.
- **A discarded refresh token does not come back**: refused `invalid_grant`, shutdown, a new
  factory over the same files seeds none and logs in. *Break:* skip the flush.
- **Shutdown**: a write held by the store lands before exit however long it takes (fake time; no
  timer pending without `--shutdown-timeout`); stdin `end` then `close` (M7) is one start and the
  held write lands; a `SIGTERM` after the start exits at once naming what was pending;
  `--shutdown-timeout=1` ends a held flush. **HTTP**, for the full and the compact tool set: a tool
  holding a lock (the lock answered, the update held at the stand-in) when `SIGTERM` arrives — the
  tool is not aborted: the stand-in's log holds the update, the `UNLOCK` and then the session's
  logoff before the process exits, exit `0`; a second `SIGTERM` while the `UNLOCK` is held exits
  `1` at once naming the request, and the logoff is still sent (D55). *Breaks:* restore the 30 s
  deadline; count `close` as a second trigger; exit http without awaiting the registered tools (the
  `UNLOCK` is missing). **stdio**, for the full and the compact tool set: a tool awaiting its `UNLOCK` (held at
  the stand-in) with **no provider call in flight**, and a store whose flush completes at once —
  the `UNLOCK` lands before exit; *break:* drain and flush without awaiting the tools' settlement
  (the `UNLOCK` is missing); close the gate before the tools settle (the `UNLOCK` is refused).
  **The latch**: (http) a `POST` accepted before `SIGTERM` whose body completes while another
  tool's `UNLOCK` is held — no mutation of it is sent, it gets the shutdown answer, and the held
  `UNLOCK` still lands before exit; (stdio) a tool call read after stdin's end gets the shutdown
  answer and nothing of it is sent, while a held `UNLOCK` lands before exit. *Breaks:* set the
  latch after the await began (the late mutation is sent); register after acquiring the connection
  (a connection is acquired for the late request). **SSE**, for the full and the compact tool set,
  the same cases as HTTP: a tool holding a lock when `SIGTERM` arrives — its `UNLOCK` lands before
  exit, exit `0`, and every open connection's instance is disposed after the tools settled, its
  sessions closed with a logoff; a
  second `SIGTERM` exits `1` at once naming the request; a `POST` admitted before the latch whose
  body completes after it reaches no tool. *Breaks:* dispose the instances before `settled()` (the
  `UNLOCK` is cut off); exit without awaiting the tools.
- **An SSE connection that closes disposes its instance (D51)**: a connection with no tool in
  flight closes → its instance close ran once (its state shut down once, its connections
  disconnected, its MCP server closed), the session left the map, and a later `POST` for its
  `sessionId` is answered as an unknown session (main's, kept); a connection closed while a tool
  holds a lock (the update held at the stand-in) → the tool runs to the end (the update and the
  `UNLOCK` are sent), then the state is shut down and the session closed with a logoff (D55); a
  tool call routed to the closing instance is refused before any connection; another open
  connection's tools and instance are untouched. *Breaks:* restore main's close (state shut down
  with no latch or settle) → the `UNLOCK` is cut off and the late call runs; await the process-wide
  `settled()` → the close waits for the other connection's tool.
- **`BaseMcpServer.dispose()` (D51)**: callable again — a second call after a failed state undo
  retries it (main's contract, which the pool relies on); the terminal close disconnects every
  connection the instance owns, each once; an injected connection is never disconnected.
  *Break:* make `dispose()` a no-op after its first call → the pool's retry test red.
- **A failed undo does not keep a session open (§6.4)**: a state whose undo fails every time (a
  debugger stop the stand-in refuses) — at shutdown (core, http, sse), at an SSE close, at the
  pool's eviction and at the idle bound's stop: the undo's failure is reported (exit `1` at
  shutdown, a state-logger line otherwise) **and** the stand-in received the logoff of every
  connection the instance owned, the state's own included. *Break:* close the connections only
  once nothing is held → no logoff, red.
- **The forced close (§6.4)**: a tool that never settles (its request held at the stand-in for
  ever) when `SIGTERM` arrives; a second `SIGTERM`, and separately `--shutdown-timeout=1`: the
  process writes the logoff of every owned connection (the stand-in received them) and exits `1`
  naming the request — core, http (a per-request and a pooled instance, the pool's drain still
  waiting) and sse (an instance close already running for a closed connection). *Breaks:* run the
  instance close (awaiting `settled(instance)`) in the forced path → the process never exits, red
  (bounded by the test's own timer); await the pool's drain → the same.
- **The pool at shutdown and eviction (§3.8)**: a pooled instance's tool holding a lock when
  `SIGTERM` arrives runs to the end with every other, its `UNLOCK` lands, then the pool's shutdown
  disposes the held instance and its sessions are closed with a logoff; a state that cannot be undone makes the exit `1` with a line naming
  the instance by its ordinal and never the handle; an instance evicted by the idle bound (fake
  time) or by its stop tool has its connections disconnected. *Breaks:* run the pool's shutdown
  before `settled()` → the `UNLOCK` cut off; skip the connection close in `dispose()` → the evicted
  instance's connections left open.
- **Every connection the server owns ends with a logoff (D55's rule, §6.4)**: one test per listed
  end, on a recording connection, asserting its `disconnect()` was called once — stdio's kept
  connection at exit — also one whose `connect()` completed after every waiting caller cancelled
  (D32, RF1: kept, used by the next call, closed only then); a connection replaced because SAP lost
  its session; each fresh connection (`openFreshConnection`,
  `inOwnSessionOverRfc`, a consumer's `freshConnection` one) on success and on failure; a package
  lock session at its release and at the instance's close; the debugger's own connections at its
  stop, the idle bound's stop, the host's stop and `dispose()`; an instance's connections at the
  pool's disposal, an SSE close and shutdown; and an injected connection never. A source test keeps
  the list of creation sites (`createAbapConnection`, `new AdtOnPremConnector`, `new
  AdtCloudConnector`, `openFreshConnection`, `freshConnection`, `connectionForPackageLock`, the
  debugger ports, `getManagedConnection`, retained `Map`s / `WeakMap`s of connections) with each
  one's end: a new creation site without a listed end fails. *Break:* drop the `disconnect()` of
  one end → its test red.
- `--renewal=refresh-only`: no login; `renewal-declined` with the server's sentence.
- **Read once per process (D3)**: the settings are read once; a failed read is not kept.

### 14.6 Debug and secrets

`authDebug` only from `--auth-debug` / YAML, never from `DEBUG_*` or `MCP_AUTH_DEBUG`. A scan of
stderr, the logger, every tool result and every HTTP answer across a refused token request (a
secret marker in `error_description`) and a successful login: no marker, client secret, token,
`state=`, authorization URL or `code=`; with `--auth-debug` the secret's prepared form on stderr
only. The summary prints no character of a secret. stdout stays empty under stdio across a login.

### 14.7 What works today

The browser table (pure function); every parameter row per binary; stdio `basic` (HTTP and RFC,
mocked transport), `snc`, `jwt` / `authorization_code` — with its own binding (served) and with
another destination's (not used: the broker's warn line, a new login — measured on broker 5.0.1);
`jwt` / `none` refused at start naming where it
went (D53); a malformed session record refused with the store's `record-format` (D54);
HTTP headers; `SapConfig` refusals (D19); embedded with an injected connection. The existing suites
are moved and updated, not deleted (`brokerFactory`, `destinationRouting` → HTTP headers,
`packageSessions`, `credentialSources`, `connectionFactory`, `returnError`, `shutdown`,
`launcherDestination`).

### 14.8 Docker

CI builds `docker/Dockerfile` from the tarballs and, on the image: `mcp-abap-adt-http --version`,
`/mcp/health` `200`, a `tools/call` with `x-sap-*` headers against a stand-in;
`Dockerfile.inspect` builds and `mcp-abap-adt --version` answers.

### 14.9 No cancellation, the low set, the stateful window, listed long tools (D56)

- **The low set is gone (§3.9)**: `fullToolSet`'s tool list on each of the three full binaries
  holds no low tool; `--exposition=readonly,low` stops each with D56's sentence; the compact sets
  are unchanged. **The mapping table** (`tools/low-to-compact.json`): every low tool registered on
  the branch before the removal has a row naming the compact handler and action, or is listed as a
  finding; a test drives each mapped row's compact call against the stand-in and compares the ADT
  requests it sends with the low tool's (method, path, body shape). *Breaks:* leave one low tool in
  `fullToolSet` → the tool-list test red; map a low tool to a compact action that sends another
  request → its row red.
- **The stateful window (§5.7)**: against the stand-in, which records each request's
  `x-sap-adt-sessiontype`, a full-binary update sends lock, write and unlock stateful and every
  other request of the tool stateless; an activation is stateful; a read, a search and a long run
  are stateless, also right after a lock tool's call on the same connection ended. *Break:* leave
  the connection stateful after the unlock → the next read red.
- **A cancel does nothing to SAP (D56 (2))**: a call cancelled after its tool started — the
  stand-in sees no logoff and no new session for the instance, and the next call runs in the same
  session. *Break:* disconnect on the request's abort → red.
- **Listed long tools (§5.8)**, one case per handler in the long-handler list: with `timeout`
  and a request held at the stand-in, the timeout fires → the answer is the timed-out answer,
  **the handler's own connection gets `disconnect()`**,
  the instance's connection does not, and the instance's next call works; without `timeout` the
  call waits until the stand-in answers; **no timer is pending** after a call that finished, timed
  out or not (fake time); the own connection is stateless and is disconnected when the call ends
  normally too. A source test: every tool on the approved list declares `timeout`, and no tool
  outside it does. *Breaks:* run a long call
  on the instance's connection → the instance's connection disconnected, red; skip the timer's
  clear → a pending timer, red; drop `timeout` from one listed handler → the source test red.

## 15. Live measurements

Before release, each recorded with its date and platform (never a system id) in `CHANGELOG.md`
and `docs/development/tests/TESTING_AUTH.md`; a browser login only after the user says which
browser and profile and that they are ready:

1. stdio, `jwt` / `authorization_code` on the BTP trial: the first start after the upgrade logs in
   once, a restart reuses the session (`--env-path`; a named destination with `--unsafe`), a
   refresh, `--browser=system` and `--browser=none`, and an MCP cancel during the login frees port
   61001.
2. HTTP (`mcp-abap-adt-http`) with `x-sap-*` headers: basic on premise, and a token on the trial;
   the same through `mcp-abap-adt-compact-http`.
2a. SSE (`mcp-abap-adt-sse`) with `x-sap-*` headers: basic on premise, and a token on the trial;
   the same through `mcp-abap-adt-compact-sse`.
3. basic over HTTP and over RFC (stdio).
4. SNC over RFC on Windows, over stdio.

**Measured (2026-10-12, an on-premise system through a tunnel, client 100, connection 15.0.1) — a
logoff releases the session's locks (D55):** a stateful ADT session took a `LOCK` on a class (`200`,
a lock handle), sent no `UNLOCK`, and was closed with `disconnect()` (the session's logoff,
answered); SM12 then showed no lock for it. Before the release this is repeated through the server
(a lock tool, then shutdown and an SSE close) and recorded as above.

**Measured (2026-10-12, on premise; the user's runs) — what a logoff does while a request runs
(D56):** with a long request running in the same stateful session, SAP queues the logoff behind it;
when the request ends, the session closes and its lock is gone — also when the client is gone. A
connection dropped without a logoff keeps its lock until SAP's own timeout (the user's experience,
many times). Activation requires a stateful session (measured; recorded in adt-clients'
`activation.js`). Before the release, a listed long tool's `timeout` through the server is
measured: the timed-out call's own session is logged off, SAP finishes the request, and the
instance's session and its locks are untouched (C12).

## 16. The debugger, merged from main

The debugger landed on main (#290–#292, lib 17.2.x) and is merged into this branch (A0); the move
commits (D42) came first, and the merge followed the renames. What it brought, and where this change
meets it:

| Debugger part | Where after the split | What this change does there |
|---|---|---|
| `src/lib/debugger/`, `src/lib/state/`, `DebugHandlersGroup` (lib) | lib, as today | nothing, beyond §3.8's rule (no request signal on its clients, D55), D55's rule for its own connections (closed with a logoff at its stop, the idle bound's stop, the host's stop and `dispose()`), and D56: its stateful debuggee sessions are the debugger's session, not a tool's stateful use (§5.7); its tools take no `timeout` unless the user puts them on the list (§5.8) |
| `compact/src/debug/` (the four compact verbs, lib imports only) | lib's `tool-set`, with `compactToolSetOf` (D49) | moved so compact-http and compact-sse serve them |
| `InstancePool.ts`, the pool in `StreamableHttpServer.ts` | http (moved at A0) | carried as it is (§3.8, D52); header sources per request, the registry, D33's order |
| `SseServer.ts`'s state close and `stop()` drain | sse | completed by D51 and D33 |
| `stateClose.ts`, the stdio shutdown's state close | core | kept in D33's core order |
| `--state-idle-minutes` (`src/lib/config/stateIdleMinutes.ts`) | lib's shared row | in every binary's table (§10.1) |
| `x-sap-debug-*`, `SAP_DEBUG_*` (`requestContext.ts`, `ids.ts`, core's `destinationStores.ts`) | lib; the `.env` reader in core | unchanged; over http and sse no destination `.env` exists (§12) |
| `src/embeddable/BaseMcpServer.ts` held-state methods | lib | `dispose()` extended (D51); the source, `getConnection(signal)`, the wrapper's `extra`, the signal scope, D5 |

The other shared files this change touches: `src/lib/utils.ts` (`return_error`'s first lines, two regexes),
`src/lib/packageSessions.ts`, `handleDeletePackage.ts`, `requestSystemResolution.ts` (D20, D21,
D44); `src/lib/handlers/interfaces.ts`, handler signatures and `tools/` stay untouched.

A debugger tool call is a request like any: its own waits end with its signal, and once its tool
started its sends run to the end (D55). The
listener that polls on after its starting call returned is the held state's, bounded by the idle
bound and ended by its stop, the host or the system — never by a request's end (§3.8).

## 17. Holds throughout: how each holds

| | How |
|---|---|
| H1 The consumer composes; nobody guesses | renewal, write failures, bounds, the browser, `authDebug` stated (D9–D12, D24); no default collaborator in the factory; refusals instead of guesses (D9, D19, D21, D39) |
| H2 Nothing goes out that should not | §7.3, §9; the URL only on stderr from the providers; nothing on stdout; §14.6 |
| H3 A credential stays bound | providers only from the broker in core, the destination read once per process and its edit documented (D3); header credentials per request (http, on new and pooled instances alike) or per SSE connection (sse), never stored or shared, an SSE connection's disposed with it (D39, D48, D51); the one exception the goal states — held state keeps the connections it opened until it ends (§3.8, D52); injected connections never re-authenticated (§4.3); each party keeps its role — the store judges its record, the broker the binding, the system the credential; the server judges none (D54) |
| H4 The modes are separated by package | D35, D36, D38, D48, D49: broker, stores, destinations, session files and logins only in core (and compact over stdio, through core); http and sse work only with header credentials, no server-held credential, and never depend on each other — what they share is lib's (D50); compact over HTTP and SSE never reaches core; embedded keeps none, consumer connections unwrapped, the consumer's factory called with no argument — `freshConnection()`, no signal (§4.3, §5.2, D56) |
| H5 No built-in timeouts | no login bound and no shutdown deadline by default (D10, D33); an SSE connection's dispose waits on no timer (D51); the 30 s deadline and the drain timer removed; the idle bound on held state (`--state-idle-minutes`) is the project owner's stated exception, main's, carried (§3.8); **the listed long tools' optional `timeout` parameter, no default, is the one written exception to the no-timeouts rule** (D56, §5.8) |
| H6 One implementation of each rule | the shared transport helpers and the HTTP-transport shutdown once, in lib (D50); the compact tool set once, `compactToolSetOf` (D49); one registry of live tools for every shutdown and every SSE close, pooled instances included (D33, D51, §3.8); one instance close (D51); main's pool, not a second one (D52); failures read by auth-errors (§7.1); the broker's shared build; the broker's refresh state; auth-providers' browsers (D9); the server cancels no request a tool sent (D55), and nothing in the chain can (D56); a lock released by the session's logoff, `disconnect()`, not by a release machinery of the server's (D55); one shared system-context lookup, unsignalled, each caller's wait raced (D44 as amended by D56); one terminal close and one forced close for every transport (§6.4) |
| H7 Registry only | every range published; the removal chain of §3.1 (D56) first; §13 |
| H8 No regular expressions over untrusted input | D26; a source test |

## 18. Decisions taken by the user, and questions for the user

**Taken by the user** (recorded):

| # | Decision |
|---|---|
| D3 | (c) document, don't engineer: a destination is read once per process; editing its files while the server runs is unsupported, restart after any change |
| D31 | (a) a per-request signal in connection, a prerequisite; ~~the server passes it~~ — **its server side withdrawn by D55** (2026-10-12); **the signal itself removed from the whole chain by D56** (2026-10-12) |
| D12 (`--unsafe`) | `onWriteFailure: 'continue'`; no `--session-write-failure` |
| — | HTTP serves only per-request header credentials; the default destination exists only for stdio |
| — | the package split (core stdio, a new HTTP package, lib without broker and stores) |
| — | ~~SSE removed~~ — **cancelled**: SSE stays (D48) |
| D29 | one PR (#287), one major for every package — 19 (the 2026-10-12 registry note below) |
| D12 (`--env` file) | `'fail'`, fixed; a session write happens only in stdio and only for token destinations |
| D35 | `@mcp-abap-adt/http`, bin `mcp-abap-adt-http`, directory `http/` |
| D37 | compact over HTTP wanted; behaviour identical, only the tool set differs |
| D34 | ~~the abort's code is the connection's own, `ADT_REQUEST_ABORTED`~~ — **withdrawn by D56**: connection 16 has no such code, and the server answers no `request_aborted` |
| D30 | ~~the broker binds a handed-over token itself — a prerequisite (auth-broker 5.1.0)~~ — **withdrawn**, 2026-10-11 (below) |
| D22 | ownership of a handed-over fresh connection passes to the server |
| D27, D47 | "server text" is an authorization server's or IdP's; ADT's own authorization errors reach the client as ADT errors |
| D39 | `--transport` removed entirely, refused naming the binary to use |
| §3.1 | the prerequisites on the current lines, after the debugger releases; the goal's *Out of scope* names them; connection is 15.0.0, a major, no compatibility shim |
| D30 (contract), 2026-10-10 | ~~auth-broker 5.1.0 binds a handed-over credential only when its session holds no binding at all~~ — **withdrawn** with D30, 2026-10-11 |
| — , 2026-10-10 | **this spec is approved**; the plan is written against it |
| D48 | **SSE stays — the removal is cancelled**: some clients still speak only SSE, there is no data on who uses it, and removing it has no technical need; it lives in `@mcp-abap-adt/sse` (`sse/`, bin `mcp-abap-adt-sse`), HTTP+SSE only, credentials from the user's headers per connection, exactly the rules of `@mcp-abap-adt/http`; depends on lib and auth-providers only |
| D49 | **compact is one package per transport**, by the principle of D35: `@mcp-abap-adt/compact` (stdio, on core, bin `mcp-abap-adt-compact`), `@mcp-abap-adt/compact-http` (on http, bin `mcp-abap-adt-compact-http`), `@mcp-abap-adt/compact-sse` (on sse, bin `mcp-abap-adt-compact-sse`); compact over HTTP or SSE pulls no broker or stores through core; behaviour identical to the full server on each transport, only the tool set and how its sets are formed differ; `compact-readonly` / `compact-modify` unchanged |
| D50 | http and sse never depend on each other; the helpers both need go where both can use them without a broker or stores path — lib, unless the code shows a better place (read: lib, §3.7) |
| D51 | an SSE connection's close disposes its instance, by the ownership rule and D33's order; SSE connections take part in shutdown exactly as Streamable HTTP requests do; in this PR (amended after main's debugger: built on main's close and `dispose()`, which already shut the state down) |
| D52 | ~~the pool of MCP instances for the HTTP package is not in this PR~~ — **superseded by main**: the pool shipped with the debugger (#290–#292); this PR carries it into `@mcp-abap-adt/http` as it is, its rules applied to pooled instances (§3.8) |
| — | the idle bound on held state (`--state-idle-minutes`, default 30) is the project owner's one exception to "no timeouts" (`DEBUGGER.md`) |
| D39 (amended) | `--transport` stays removed; each of the six bins is flag-free about its transport |
| D29 (amended) | one PR, one major 19 for all nine packages |
| — , 2026-10-11 | **roles**: a session store encapsulates storing a secret (a file, a database, anything) and is the only one with access to the stored record, so it validates the record against its own format; a provider obtains, renews and presents; the broker composes; only the target system or the identity provider decides whether a credential is valid |
| D54, 2026-10-11 | **only the chain's own session format**: records come from `mcp-auth` (auth-broker-cli 3.x) or the broker; older formats and hand-written records are not supported; auth-stores **5.0.0** (published) refuses a record not of its format with `StorageError` `reason: 'record-format'` and composes no legacy binding, a record with no token or cookies is no session; auth-broker 5.0.1 passes that error to the caller; the server answers it with fixed words and the hint to regenerate with `mcp-auth` (§7.3) |
| — , 2026-10-11 | the binding fields per row are auth-broker 5.0.x's, unchanged: a token to ABAP needs both `issuedFor` and `issuedBy`; XSUAA has no system URL, so `issuedBy` only; basic none |
| B1 / D30, 2026-10-11 | **withdrawn**: auth-broker 5.1.0 ("bind an unbound handed-over credential") is cancelled; no broker release is a prerequisite of the server for binding; a broker / CLI change onto auth-stores 5 is separate, and C2 takes its releases if they are published by then (§3.1) |
| D53, 2026-10-11 | **`jwt` / `none` leaves stdio**: a token you hold (`SAP_JWT_TOKEN` with `SAP_GRANT_TYPE=none` in an `--env` file) is no longer served over stdio; a handed-over token stays only in the HTTP and SSE headers (`x-sap-jwt-token`); the migration note says so and points to `mcp-auth` for stdio sessions; M8 (§2) is the measurement that led here |
| D55, 2026-10-12 | **a started tool runs to the end; a logoff releases the locks.** Facts: SAP ABAP has no request-cancel mechanism and no rollback across ADT requests — a request that reached ADT runs to its end, transactionality is SAP's own inside one request; a session closed with a logoff releases its locks (measured, §15). Decided: (1) **a correct logoff** — every ADT session the server owns is closed with `disconnect()`: at shutdown (core, http with its pool, sse), when an SSE connection closes its instance, when a pooled instance is disposed, at stdio's exit; **a connector that is destroyed is closed** — a connection dropped without `disconnect()` is a resource leak (its session and locks stay open until SAP's own timeout), so every connection the server creates or takes over has a defined end that calls it, on every path (§6.4); an injected connection is the consumer's to close; nothing else is relied on to release a lock; (2) **no lock control** — no machinery keeps unlocks or releases out of the signal: D40 and `runWithoutRequestSignal` are dropped, C4 is withdrawn; (3) **the controller's ruling, as the consequence**: a request's signal no longer reaches the requests a tool sends to SAP — a started tool runs to the end and answers; the signal still ends the request before its tool starts (D5), the server's own waits (D32: `connect()`, `getProvider`'s build, the login and its bound D10, the lookup D44) and shutdown's drain; C3 (D31's server side) is withdrawn, `createAdtClient` and the debugger's clients pass no signal; shutdown latches, awaits running tools, then closes every session with a logoff, and the shutdown signal (`--shutdown-timeout`, a second `SIGTERM` / `SIGINT`, never by default) ends the wait while the logoff is still sent; a signal is the consumer's message "I no longer need this — close" (§5.1); (4) **superseded by D56**: the per-request signal is removed from the whole chain (interfaces-adt-connection 3.0.0, interfaces-adt 16.0.0, connection 16.0.0, adt-clients 31.0.0); B5 (adt-clients 30.1.0) is discarded, and the server takes neither `IAdtError.refusal` nor `ADT_REQUEST_ABORTED`; where a session ends and what a cancel does to SAP are D56's |
| D40, D31 (server side), C3, C4, 2026-10-12 | **withdrawn by D55**: "releases are never cancelled" (D40) and its `runWithoutRequestSignal`, the signal through `createAdtClient` (C3), the release-site list (C4); the IDs stay so references keep their meaning |
| D56, 2026-10-12 | **No signal, no cancellation; low leaves the full binaries; listed long tools take a timeout on their own connection** — the user's decisions, recorded as given (decision 3 as corrected by the user the same day, decision 4 as corrected for activation, decision 5 as finally given: an explicit list of tools the user approves): (1) **The per-request signal is removed from the whole chain as a mistake.** Published 2026-10-12 and now being removed by majors: `@mcp-abap-adt/interfaces-adt-connection` 3.0.0 (no `IAbapRequestOptions.signal`, `ADT_REQUEST_ERROR`), `@mcp-abap-adt/interfaces-adt` 16.0.0 (no `IAdtClientOptions.signal`, no `IAdtError.refusal`), `@mcp-abap-adt/connection` 16.0.0 (no signal checks, no `IAdtEstablishContext.signal`, no `ADT_REQUEST_ABORTED`; and `disconnect()` resolves once the logoff has been WRITTEN to the socket, not answered), `@mcp-abap-adt/adt-clients` 31.0.0 (moves to those contracts). B5 (adt-clients 30.1.0) is discarded. The server takes these in C2. C3, C4 stay withdrawn; C6/C7: no `IAdtError.refusal` — an auth failure inside a tool reaches the model with the connection's own message (fixed words, with the hint), as it is. (2) **There is no real cancellation against ABAP; the most the server can do is a logoff and closing a connector.** A lock without UNLOCK is released by the session's logoff; with a long request running in the same stateful session SAP queues the logoff behind it and the lock is gone afterwards, even when the client is gone; a connection dropped without a logoff keeps the lock (§15). A cancelled MCP call does nothing to SAP: no logoff, no reopen while the instance lives (a reopen either drops locks under the LLM or leaves them in the old session the new one collides with). Logoff happens only at an instance's end (pool eviction, idle bound, stop tool, SSE close, stdin end, shutdown); a reopen only when SAP already lost the session. Every connector the server owns is closed with `disconnect()` (logoff) — a connector dropped without it is a resource leak. The MCP SDK's `extra.signal` stays only for the server's own waits that send nothing to SAP (browser login, `connect()`, the provider build) and the "a cancelled request before its tool starts never reaches it" rule — the one remaining use; it is not a connector or contract feature. (3) **The low tool set leaves the full binaries** (`mcp-abap-adt`, `-http`, `-sse`): everyone who needs low has compact — compact is its full analogue (`HandlerLock` / `HandlerUnlock` / `HandlerUpdate`, `HandlerActivate`, `HandlerValidate`, `HandlerCheckRun`, `HandlerDelete`, `HandlerGet`, `HandlerSearch`, …); no gap-filling in high / readonly; a low → compact mapping table (each low tool → the compact handler and action that does the same) is built and checked against the code, and any low capability compact does not have is a finding for the user to decide, not silently added anywhere; `--exposition=…,low` goes; the migration note: "the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)", with that table. Compact keeps `HandlerLock` / `HandlerUnlock` / `HandlerUpdate`; keeping a lock short is the consumer's job (documented, not engineered). Every tool of the full binaries is atomic: it locks only its own object, lock → write → unlock inside one call; nothing more is needed. (4) **Stateful only for lock, unlock and activation.** The stateful window is lock → write → unlock, and activation (activation requires a stateful session — a measured result, recorded in adt-clients' `activation.js`); everything else — listed long calls included — runs stateless. The ADT debugger's own stateful sessions (attach and steps need a debuggee session) are the debugger's session, not a tool's stateful use. (5) **Long tools named in the list take an optional `timeout`** (no default; the one written exception to the no-timeouts rule); each runs on its own stateless connection; a timeout or the end closes that connection with the logoff (as finally given by the user the same day, replacing the earlier wordings: the timeout is defined not by a category — GET, read-only, stateless; a stateless `POST` may write — but by an explicit, named list of tools, decided tool by tool by the user, e.g. where-used, `GetWhereUsed`, and the like). The implementer drafts the candidate list from the code (the tools whose call can run long, with what each sends), and **the user approves the list before any code**; no tool gets the timeout without being on the approved list. Activation and the debugger are not on it unless the user puts them there. SAP finishes a timed-out request and closes the session; nothing else is affected. The tool description advises a timeout below the MCP client's own request limit (the TS SDK client cancels at 60 s by default; a cancel does nothing to SAP). (6) **All of this ships in 19.0.0** (no release per small change). The scope of 19.0.0 as the user states it: the major; the low set removed (compact is its analogue); a guaranteed logoff on every connector close; the timeout for listed long tools; the auth stack update; the per-transport package split (A0–A7). Where this spec is read: §3.1 (the removal chain), §3.3, §3.9 (low), §4.3, §5 (§5.7 stateful, §5.8 long tools), §6.4, §7, §10, §12, §14.9, §15 |

**Settled by the registry, not a decision** (2026-10-10, `npm view`): the version numbers §3.1, §3.3
and §13 assumed for two prerequisites were taken by other releases the same day —
`@mcp-abap-adt/interfaces-adt` 13.2.0 (the service binding's atoms), and `@mcp-abap-adt/adt-clients`
26.0.0, 26.1.0 and 27.0.0 (the debugger line, then a major). The prerequisites keep their contracts
and take **the next free minor on the current line** when each is released — today
interfaces-adt 13.3.0 and adt-clients 27.1.0; interfaces-adt-connection 2.1.0 and connection 15.0.0
are still free. *(Superseded by the 2026-10-12 note below.)* Wherever this spec names interfaces-adt 13.2.0, adt-clients 25.1.0, 26.0.0 or 26.1.0
as a prerequisite, read that release; the plan checks each number with `npm view` before it is
used.

**Settled by the registry, again** (2026-10-12, `npm view`, `git tag`): **18.0.0 is the debugger
release** (main's `v18.0.0`: lib, core and the compact packages, on adt-clients 29.1.0,
interfaces-adt 15.1.0, adt-strategies 0.10.1; its auth-stack move was reverted and left to this
PR). This work releases as **19.0.0**: wherever this spec says 18.0.0 for this release, read
19.0.0, and its migration note is `docs/MIGRATION-19.0.md` (`docs/MIGRATION-18.0.md` is the
debugger's). connection 15.0.0 / 15.0.1 were released the same way (on interfaces-adt-connection
2, so the `AbapConnection` alias's `unknown` default and its MIGRATION-15.0 are done), and carry
no request signal. So the prerequisites become: interfaces-adt-connection **2.1.0** (unchanged);
interfaces-adt **the next free minor on the 15 line** (today 15.2.0); connection **the next free
minor on the 15 line** (today 15.1.0) — §3.1 item 3's signal requirements unchanged, the major and
the alias change already shipped; adt-clients **the next free minor on the 29 line** (today
29.2.0). The server takes connection `^15.0.1` at the merge of main (adt-clients 29 is on
interfaces-adt-connection 2, connection 14 on 1) and the signal releases in C2.

**Questions for the user**:

1. ~~The `state_handle` is a bearer secret~~ — **decided by the user: it stays a bearer secret.**
   The handle is the secret that names an LLM session, like a login and password sent with a
   request; no check of the caller and no limit per owner are added. Whoever needs more security
   runs the server in Docker or connects to it over HTTPS. This is the project owner's exception to
   the "possession of a handle is not authorization" rule, as the idle bound is to "no timeouts"
   (H5).

**Possible later improvements**, each its own change in its repository: auth-stores
`EnvDestinationStore.fromContent` / key stores `fromKey` (projections from content read once); the
broker's `getProvider` answering the means it was built from.
