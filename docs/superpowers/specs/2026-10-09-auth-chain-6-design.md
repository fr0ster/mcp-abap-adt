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
(`2dbced7`), adt-clients 25.0.1 (`342b8f1b`), interfaces-adt-connection 2.0.0 / 1.0.1
(`5954a9f`).

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
16. Overlap with the parallel debugger work
17. Holds throughout: how each holds
18. Decisions taken by the user, and questions for the user

## 1. Traceability: goal → sections

| Goal item | Answered in |
|---|---|
| The server is split by transport into packages, one mode each; compact on both transports | §3; D35, D36, D37 |
| Success: each package has only its own options and its own credentials | §3, §4, §10; D35, D38, D39 |
| Success: failures reach the user as the chain made them | §7; D14, D15, D17, D28, D45, D46 |
| Success: a connection derived from an injected one stays the consumer's | §4.3; D20–D22 |
| Success: a request ends when its client ends it, in every mode | §3.1, §5; D4, D5, D7, D8, D10, D31, D32, D34, D40 |
| Success: session writes are the server's stated choice | §6.2–§6.4; D12, D33 |
| Success: renewal is the server's stated choice | §6.1; D11 |
| Success: debug output is opt-in and safe | §9; D24–D27 |
| Success: what works today keeps working, or the migration note says what to do | §8, §10, §12; D9, D19, D21, D30, D39 |
| Success: Docker images and release artifacts follow the split | §11; D41 |
| Success: one release | §13; D29, D42 |
| Success: measured on real systems before release | §15 |
| Open 1 — the HTTP package's names and options | §3.2, §10.2; D35, D38 |
| Open 2 — what lib exports after the move | §3.4; D36 |
| Open 3 — the login bound | §5.6; D10 |
| Open 4 — how cancellation reaches the broker, the providers and the connection; `LoginLock` | §3.1, §5; D4, D8, D31, D32 |
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

## 3. Packages and dependencies

### 3.1 Prerequisites in other repositories

**Decided by the user: option (a)** — the per-request signal is the connection's to honour, at
every boundary it owns; the server passes it and waits for the releases. The signal reaches a
consumer's connection only through adt-clients (the one code between the tools and a connection,
§2), and adt-clients' options and failures are contracts of interfaces-adt; and the broker must
handle a handed-over token's binding itself (D30). All of it targets **the current lines**: the
user's debugger work moved them — `@mcp-abap-adt/interfaces-adt` 13.1.0 is published ("debugger
contracts", tag `interfaces-adt-v13.1.0`, on `interfaces-adt-connection ^2.0.0`), and adt-clients'
open PR #207 (`feat/debugger`, "AbapDebugger", from a fork) is still on 25.0.1 with
`interfaces-adt ^12`. Nothing below needs the 1.x / 12.x lines, so nothing is mirrored there.

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
5. **`@mcp-abap-adt/auth-broker` 5.1.0** (`mcp-abap-adt-auth-broker`; a minor) — **D30, a defect
   for the broker** (measured, §2 M8): a `jwt` / `none` (or `saml` / `none`) destination whose
   session holds the handed-over token or cookies **and no binding at all** (`issuedFor` and
   `issuedBy` both absent) is bound by the broker to the destination it is read for: the provider
   is built, and the broker writes `bindingOf(means)` beside the credential through the
   destination's write queue (under its `onWriteFailure`). A binding that is **present and
   different** stays refused as in 5.0.1 — that is what stops a credential copied into another
   destination. Tests: an unbound `jwt` / `none` file is served and written with its binding; a
   mismatched one is refused naming the field; the CLI and the token API unchanged.

**Order**: 0 (debugger releases) → 1 → 2 → 3 (on 1) and 4 (on 1, 2 and 26.0.0) → 5 (independent of
1–4) → this server's 18.0.0. Each is published before the next is built against it (H7). **The
server's own move to interfaces-adt 13 / interfaces-adt-connection 2 comes with it**: lib's ranges
become `^13.2.0` / `^2.1.0` and connection `^15.0.0`. In the move the server fixes what that costs it:
the test helper's `makeAdtRequest` stub interfaces-adt-connection 2.0.0's notes measured, and every
read of an answer's `data` through `AbapConnection` in the 8 files of `src` that import the alias
(`BaseMcpServer.ts`, `EmbeddableMcpServer.ts`, `clients.ts`, …) — typed or narrowed, never cast to
`any`. The goal's *Out of scope* names these releases.

**Other consumers of connection's public types** (checked read-only; none is a prerequisite):

| Consumer | Uses | What it needs for connection 15 |
|---|---|---|
| auth-broker 5.0.1 | `devDependencies` `^14.0.0`; tests only (`src/__tests__/broker/connection14.test.ts`, `live/adtProbe.ts`, `live/getProvider.live.test.ts`); README examples name connection 14 | nothing to release; its tests and README move to 15 in its own next change (or with 5.1.0) |
| auth-providers 6.0.1, auth-stores 4.0.0, auth-errors 2.2.0 | no import of connection | nothing |
| adt-clients | `devDependencies` `^10.0.2`, test harness and scripts; its source types come from interfaces-adt-connection | its interfaces-adt-connection 2 move (26.0.0) already meets the `unknown` default; its dev range moves to `^15` with 26.1.0 |
| cloud-llm-hub | runtime `^10.0.3`, `lib ^16`, interfaces-adt-connection `^1.0.1`; `AbapConnection` and `SapConfig` types (`srv/mcp-manager.ts`), connectors and CSRF constants (`srv/connections/*`), its own `CloudSdkAbapConnection` with `makeAdtRequest<T = any>` | when it takes lib 18: connection `^15`, interfaces-adt-connection `^2.1`; reads through `AbapConnection` typed or narrowed; its own `makeAdtRequest<T = any>` still satisfies the interface; honour the request signal (§5.2) — its own change |
| mcp-abap-adt-proxy, calm server | proxy on connection `^9.4`; calm none | out of scope (goal); each migrates in its own change |
| this server's embedders | `EmbeddableMcpServerOptions.connection: AbapConnection` | the migration note (§12): the alias's `unknown` default |

### 3.2 The packages

**(D35) The packages, names and directories** — six, all at 18.0.0:

| Package | Directory | Bin | Serves | Depends on (`@mcp-abap-adt/*`) |
|---|---|---|---|---|
| `@mcp-abap-adt/lib` | `.` | — | the tools, handlers, the embeddable server, providers from header credentials, failure reading, connection building | adt-clients, adt-strategies, connection, auth-providers, auth-errors, interfaces-* — **not** auth-broker, **not** auth-stores |
| `@mcp-abap-adt/core` | `server/` | `mcp-abap-adt` | **stdio only**: the default destination, service keys, `--unsafe`, the browser login | lib, auth-broker, auth-stores, auth-providers, auth-errors |
| `@mcp-abap-adt/http` **(new)** | `http/` | `mcp-abap-adt-http` | **Streamable HTTP only**, credentials only from each request's `x-sap-*` headers | lib, auth-providers (through lib), auth-errors — **not** auth-broker, **not** auth-stores |
| `@mcp-abap-adt/compact-readonly`, `compact-modify` | as today | — | the compact groups | lib |
| `@mcp-abap-adt/compact` | `compact/` | `mcp-abap-adt-compact` (stdio), `mcp-abap-adt-compact-http` (Streamable HTTP) | the compact tool set over both transports (D37) | lib, core, http, compact-readonly, compact-modify |

Reasons: `@mcp-abap-adt/http` and `mcp-abap-adt-http` are free on npm (`npm view` answers `E404`,
2026-10-10) and say what the package is beside `core`; a directory of its own mirrors `server/`.
Not workspaces, published by path, as the five today (`docs/deployment/RELEASE.md`). `core`'s
`mcpName` and registry entry stay `io.github.fr0ster/mcp-abap-adt`; the HTTP package gets its own
(§11).

**The dependency rule is checked by a test (D38)**: each package's `package.json` is read, and the
import graph of its built `dist` (and of `src`) is walked from its entry points: **lib and http
reach no `@mcp-abap-adt/auth-broker` or `@mcp-abap-adt/auth-stores`**, core is the only package
whose graph reaches them. *Break:* import `AuthBrokerFactory` into lib → red.

### 3.3 Dependency ranges (D1)

| Dependency | 17.1.0 (lib) | 18.0.0 | Where |
|---|---|---|---|
| `@mcp-abap-adt/auth-broker` | `^4.1.0` | `^5.1.0` (prerequisite, D30) | core only |
| `@mcp-abap-adt/auth-stores` | `^3.3.0` | `^4.0.0` | core only |
| `@mcp-abap-adt/auth-providers` | `^5.4.0` | `^6.0.1` | lib, core |
| `@mcp-abap-adt/connection` | `^11.0.0` | `^15.0.0` (prerequisite, a major) | lib |
| `@mcp-abap-adt/adt-clients` | `~25.0.1` | `^26.1.0` (prerequisite, on the debugger release) | lib |
| `@mcp-abap-adt/interfaces-adt-connection` | `^1.0.1` | `^2.1.0` (prerequisite) | lib |
| `@mcp-abap-adt/interfaces-adt` | `^12.0.1` | `^13.2.0` (prerequisite) | lib |
| `@mcp-abap-adt/interfaces-auth` | `^3.2.0` | `^7.5.0` | lib, core |
| `@mcp-abap-adt/auth-errors` | — | `^2.2.0` | lib, core, http |
| `@mcp-abap-adt/interfaces-auth-broker` | `^1.2.0` | `^1.3.0` | core only |
| `@mcp-abap-adt/interfaces-auth-sap` | `^2.0.0` | `^3.3.0` | lib (`SapAuthType`) |
| `adt-strategies`, `interfaces-network`, `interfaces-utils` | unchanged | unchanged | as today |
| `express` | in core | in http only (core serves no HTTP) | http |

One copy of `interfaces-auth` 7 and of `auth-errors` 2 resolves (`npm ls`). The `auth` script is
removed. Reason: each chain range is the release the goal names; the prerequisites of §3.1 are
published before the server. Type check for the server: `test:check` compiles a typecheck file
that passes `{ signal: () => currentRequestSignal() }` to `AdtClient` and reads
`IAdtError.refusal` — it fails against interfaces-adt 13.1.x.

### 3.4 What moves, and what lib exports (D36)

**Moves from lib to core** (stdio, destinations): `src/lib/auth/brokerFactory.ts`,
`IAuthBrokerFactory.ts`, `IAuthBrokerFactoryConfig.ts`, `destinationStores.ts`,
`destinationName.ts`, `vocabulary.ts`, `countedProvider.ts`, `loginLock.ts` (rewritten, §5.5),
`handlers/*`, `brokerFactory/UNIFIED_BROKER_LOGIC.md`; `src/lib/stores/platformPaths.ts`;
`src/lib/config/envFileContext.ts`, `envResolver.ts` (they resolve `--env` names and hydrate the
env file); the destination rows of `authParameters.ts` (§10.1); the browser mapping (§8). **Moves
from core to http**: `StreamableHttpServer.ts`, `dnsRebindingProtection.ts`, `tlsUtils.ts`, and an
HTTP launcher. **Deleted**: `SseServer.ts`, `destinationRequest.ts` (`destinationFromHeader`,
`FirstConnectLock`, `destinationFailureAnswer`'s destination part), every SSE option.

**lib exports after the move**:

| Entry | Keeps | Loses (moved or deleted) |
|---|---|---|
| `@mcp-abap-adt/lib` / `handlers` / `handlers/read` / `handlers/write` / `utils` / `logger` / `request-context` / `compact-shared` | as today | — |
| `@mcp-abap-adt/lib/embeddable` | `BaseMcpServer` (with the `ConnectionSource` contract, §4), `EmbeddableMcpServer`, `ConnectionContext`, `IHttpApplication`, `MockAbapConnection`, `IServerConfig` | the SSE and destination fields of `IServerConfig` |
| `@mcp-abap-adt/lib/auth` | `failureOf` (§7.1), `credentialFromHeaders`, `credentialFromSapConfig`, `errorClassOf`, the server's own refusal classes used by lib | `AuthBrokerFactory`, `IAuthBrokerFactory(Config)`, `IDestinations`, `DestinationSystemContext`, `SettleReport`, `assertDestinationName`, `DestinationRefusal`, `UnsupportedAuthenticationError`, `describeAuthError`, the `DestinationConfigError` and `browserCallbackStrategy` re-exports — to core (`@mcp-abap-adt/core/auth`), or deleted |
| `@mcp-abap-adt/lib/config` | the parameter machinery (table-driven reading of CLI, environment and YAML forms, help and template generation), the shared rows (`--exposition`, `--system-type`, `--conf`) | the destination, browser, `--unsafe` and transport rows — to core; the HTTP rows — to http |

**lib also exports the tool-set contract** (`@mcp-abap-adt/lib/tool-set`, D37): `ToolSet` — the
groups a server serves, given the base context and the exposition; the exposition's words, default
and help — and `fullToolSet` (readonly, high, low, search, system: today's `launch`,
`launcher.ts:514-563`). **core exports** `./launcher` — `main({ toolSet, program, version })`, and
`./auth` (the moved destination layer, for an embedder that builds a stdio server of its own).
**http exports** `main({ toolSet, program, version })` and `StreamableHttpServer` (to mount on a
consumer's app, `app` option).

Reasons: lib depends on neither broker nor stores (goal), and what it keeps is what an embedder
and both binaries share; moving the destination layer to core puts every broker and store import
in one package (H4).

### 3.5 Compact on both transports (D37)

**Decided by the user: compact over HTTP is wanted**, with behaviour identical between the full and
the compact server on both transports — only the tool set, and the principle its sets are formed
by, differ. **The tool set is an input of each transport's launcher**: core's `main` and http's
`main` take a `ToolSet` (§3.4) and nothing else of the tools; everything a launcher does — options,
credentials, cancellation, failures, shutdown — is the transport's, the same for any set.

- `@mcp-abap-adt/compact` exports `compactToolSet` (its groups from compact-readonly and
  compact-modify; exposition `ro` / `rw`, default `rw` — `compact/src/launcher.ts`'s
  `parseCompactExposition`) and has **one flag-free bin per transport**:
  `mcp-abap-adt-compact` → core's `main({ toolSet: compactToolSet })`, `mcp-abap-adt-compact-http`
  → http's `main({ toolSet: compactToolSet })`. The full bins are the same with `fullToolSet`.
- Reasons: the transport's behaviour exists once (core, http), so full and compact cannot fork; a
  bin per transport mirrors the full server's (`mcp-abap-adt` / `mcp-abap-adt-http`), so each binary
  still has only its own options and no flag picks a transport or a set. Rejected: a
  `--tool-set=compact` flag on core and http (they would depend on the compact packages, and a
  binary's tools would depend on a flag); a compact HTTP launcher of its own (a second
  implementation of the HTTP server).
- `LauncherOptions` (`launcher.ts:215-239`: `extraGroups`, `exposition`, `program`,
  `helpExposition`, `includeSearch`, `version`) becomes the `ToolSet` plus `program` and `version`.

## 4. Credentials, per package

`BaseMcpServer` (lib) stops holding "settings and a credential" and holds one **connection
source** per instance — the contract each package fills:

```ts
interface ConnectionSource {
  /** The settings and the credential for one request; the request's signal bounds the waits. */
  resolve(signal: AbortSignal): Promise<{ settings: SapConfig; credential: IAuthProvider }>;
}
type Source =
  | { kind: 'built'; source: ConnectionSource }        // core: a destination; http: the headers
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
  the broker refuses stops the start. Building sends nothing.
- **The broker options the server states** (§6): `renewal`, `onWriteFailure` (by store mode, D12),
  `authDebug`, and for `jwt` / `authorization_code` `authorization` (§5.5, §8). The handler table
  (`basic`, `snc`, `jwt/authorization_code`, `jwt/none`) is unchanged.
- **Inspection-only mode** (stdio without a destination) is the server's own refusal before any
  connection (D17).
- **(D30) A `jwt` / `none` destination** (a token you hold) is the broker's to bind (auth-broker
  5.1.0, §3.1): with no binding in its session the broker binds it to this destination and writes
  `bindingOf(means)` back; a different binding is refused naming the field. The server writes no
  binding and the migration note asks the user to write none.

### 4.2 HTTP (`@mcp-abap-adt/http`): only the request's headers

- **(D39) Each request's credentials come from its `x-sap-*` headers alone**:
  `credentialFromHeaders` (lib) — `x-sap-url`, `x-sap-client`, and `x-sap-jwt-token` or
  `x-sap-login` + `x-sap-password` — builds `TokenAuthProvider.fixed(token)` or
  `new BasicAuthProvider(user, password)` (auth-providers 6 kept both constructors, connection
  `docs/MIGRATION-13.0.md`), a per-request server instance and a per-request connection over the
  HTTP wire. Nothing is stored, shared or cached across requests (H3); no broker, no store, no
  login exists in the package (D38).
- **A request without them** is answered `400` in fixed words: "this server takes credentials only
  from the request's headers: send x-sap-url with x-sap-jwt-token, or with x-sap-login and
  x-sap-password". **A request carrying `x-mcp-destination`** is answered `400` too: "destinations
  are served only by mcp-abap-adt (stdio); send x-sap-* headers" — a header it no longer serves,
  refused rather than ignored (H1).
- The system kind follows `--system-type` / `SAP_SYSTEM_TYPE` (`resolveSystemKind`, as today).
- **`ping`** is answered without credentials, as today.

### 4.3 Embedded (`EmbeddableMcpServer`): the consumer's

The injected connection is used as given (`EmbeddableMcpServer.ts:184-186`): no `getProvider`, no
credential built, no wrap, no `connect()`. A consumer that gives credentials per request builds an
`EmbeddableMcpServer` per request with its connection, or mounts the HTTP package's
`StreamableHttpServer` on its own app (`app` option), where §4.2 holds.

**A fresh connection (D20).** `openFreshConnection(connection, logger)` decides from a registry
keyed by the connection object, never from the connection's configuration:

| The connection | A fresh one comes from |
|---|---|
| built by the server (`createAbapConnection`: a destination, `x-sap-*`, a `SapConfig`) | the factory's record — the same settings and the same credential object |
| injected, with `freshConnection` given | `await freshConnection({ signal })` — the consumer's factory, with the current request's signal |
| injected without it (or set through `setAbapConnectionOverride`) | **refused**: "This operation needs an ABAP session of its own; the connection was given by the host, which supplied no fresh-connection factory (`freshConnection`)" |

```ts
interface EmbeddableMcpServerOptions {
  // …
  /**
   * A connection of its own for an operation that needs a new ABAP session:
   * RFC CreatePackage / LockPackage, DeletePackage with force_new_connection.
   * The connection is built by you, with its credential; honour `signal` (and the
   * signal in each request's options). Once returned it is the server's: the server
   * releases and closes it like its own. Without it those operations are refused.
   */
  freshConnection?: (options: { signal?: AbortSignal }) => Promise<IAbapConnection>;
}
```

- The `getConfig()` / `config` + `credentialFromSapConfig` fallback (`packageSessions.ts:45-47`,
  `:55`) is deleted. Every caller — `CreatePackage` high and low over RFC, `LockPackage` over RFC,
  `DeletePackage` with `force_new_connection` — gets the same three rows.
- **(D21) `DeletePackage`'s fallback is removed**: a fresh connection that cannot be had is the
  answer, not a silent delete on the session the caller asked to avoid.
- **(D22) Ownership passes to the server — decided by the user.** Once the consumer's factory hands
  a fresh connection over, the server treats it exactly like a connection it built: it holds it for
  the operation (or under a package lock's handle, `lockSessions`), its release paths run outside
  the request's signal (D40), and it is closed with `disconnect()` when the operation or the lock
  ends, a failure logged in fixed words. What the consumer keeps is what it built in: the
  connection's credential and its honouring of the signal.
- **(D19) `credentialFromSapConfig` refuses instead of guessing**: an `authType` outside `basic`,
  `jwt`, `saml`, `certificate` refused naming `authType`; `snc` "is served through a destination
  of mcp-abap-adt (stdio)"; `kerberos` refused; a missing user, password, token or cookies refused
  naming the field. It stays in lib for the `SapConfig` path (`setSapConfigOverride`,
  `getManagedConnection`), which an embedder uses for its own instance.

## 5. Cancellation

### 5.1 The signals

| Signal | Created | Aborted | Given to |
|---|---|---|---|
| **request** | per MCP request, in the tool wrapper (every package) | the request's `extra.signal` aborts (client cancel, transport close), or the request ends (`finally`), or shutdown | the request signal scope (§5.2): every `AdtClient` the request creates (adt-clients 25.1.0 → every request's options), the two direct requests, `getProvider` (core), `openFreshConnection` and the consumer's `freshConnection` |
| **startup** | the core launcher's check | the check ends | `getProvider` of the check |
| **shutdown** | once | a `SIGTERM` / `SIGINT` after the shutdown started, or `--shutdown-timeout` (§6.4) — never by default | `flush({ signal })`, the drain |
| **login bound** | per `authorize` of core's strategy wrapper, when configured | the bound elapses | the strategy, combined with `AuthorizationRequest.signal` (§5.6) |

**(D4) A request's signal is aborted when the request ends, whatever its outcome**: the broker
releases `getProvider`'s party only on its abort, so a live party left behind would keep a later
login alive after its own waiter left. The process keeps the live controllers so shutdown can abort
them.

### 5.2 How a request's signal reaches its requests

**(D31) Decided by the user: option (a)** — the connection honours the signal (§3.1); the server
passes it.

- **The request signal scope** (`src/lib/requestSignal.ts`, an `AsyncLocalStorage` of its own —
  not the system-context request scope, which stdio does not enter and whose presence changes
  what `getEffectiveSystemContext` answers): the tool wrapper runs the handler inside
  `runWithRequestSignal(signal, …)`; `currentRequestSignal()` reads it.
- **`createAdtClient`** (`src/lib/clients.ts:34-51`, the one place every handler builds a client)
  passes `{ signal: () => currentRequestSignal() }` to `AdtClient` (adt-clients 25.1.0, §3.1) — a
  function, read when each request is sent: every request of that client carries the signal of
  the scope it is sent in, whatever connection the client was built on. The server's own requests
  (`handleGetServiceBindingPreviewUrl.ts:225`, `utils.ts:717`) add
  `signal: currentRequestSignal()` to their options; its `getSystemInformation` calls
  (`handleGetServiceBindingPreviewUrl.ts:145`, `requestSystemResolution.ts:80`) pass it.
- **This covers every connection the server hands on**, because a client is built per call inside
  the request — checked site by site (`grep` over every package's `src` for `createAbapConnection`,
  `openFreshConnection`, `inOwnSessionOverRfc`, `connectionForPackageLock`,
  `connectionHoldingPackageLock`, `releasePackageLockSession`, `getManagedConnection`, retained
  `Map`s and `WeakMap`s of connections, direct `makeAdtRequest`):

| Site | What carries the current request's signal |
|---|---|
| `BaseMcpServer.getConnection` (`BaseMcpServer.ts:193-230`): stdio's kept connection | each request's clients |
| `inOwnSessionOverRfc` (`packageSessions.ts:86-100`) — `CreatePackage` high and low over RFC | the client the work builds on the fresh connection |
| `openFreshConnection` (`:40-61`) — `DeletePackage` with `force_new_connection` | the client built on the sibling |
| `connectionForPackageLock` (`:110-135`) — `LockPackage` over RFC | the lock's client; `lockSessions` keeps the raw connection, which carries no signal of its own |
| `connectionHoldingPackageLock` (`:138-143`) — `UpdatePackage` (`handleUpdatePackage.ts:151`), `UnlockPackage` (`handleUnlockPackage.ts:112`) | the update's or the unlock's own client — never the lock request's signal, aborted when that request ended (D4) |
| `releasePackageLockSession` (`:149-157`) | none: a close carries no request |
| `resolveOnce` (`requestSystemResolution.ts:104-125`): the cloud system-context lookup shared by concurrent requests | **its own attempt (D44)**: auth-errors' `sharedAttempt` per resolver and connection — each caller joins with its own signal; the lookup runs with the attempt's signal (alive while any caller waits, aborted when the last leaves) passed to `getSystemInformation`; a caller that leaves is released at once; an aborted or failed lookup is never memoised (the attempt leaves its slot, the next caller starts afresh); only a completed answer is kept, as today |
| the consumer's `freshConnection` (§4.3) | the factory receives `{ signal }`; its connection's requests carry it through the client |
| `getManagedConnection` / `getAdtClient` (`utils.ts:386-536`, `clients.ts:53-61`) — the legacy `SapConfig` path | no request scope there: no signal |

- **Releases are never cancelled (D40).** Because the client reads the signal per request
  (`() => currentRequestSignal()`), a release is sent unsignalled by running it outside the
  request's signal — `runWithoutRequestSignal(release)` — whichever client it was captured from.
  Every release path:
  - **`withLock`'s `runRelease`** (`src/lib/strategies/withLock.ts:26-40`, called at `:107` after
    the body, success or failure): the release callback — `obj.unlock(…)` of the signalled client
    the handler built, e.g. `handleUpdateServiceDefinition`'s (`:121`) — runs inside
    `runWithoutRequestSignal`; this covers the 32 handlers that call `withLock`;
  - **every other unlock, release or close in a server path that cleans up after a step** — found
    by a `grep` for `unlock(`, `unlockAll(`, `release`, `disconnect(` and `closeQuietly(` in
    `src`, `compact*/src`, `server/src`, `http/src`, and listed in the plan site by site;
    `closeQuietly` and `releasePackageLockSession` carry no request already. An **unlock tool**
    (`UnlockClass`, `UnlockPackage`, …) is its own request and keeps its own signal: a cancel of
    it is the user's;
  - adt-clients' own releases (§3.1).

  A source test keeps the list: every `withLock` release and every listed site runs inside
  `runWithoutRequestSignal`. Reason: a cancel must never leave a SAP lock held.
- **Injected connections are not wrapped**: their requests carry the signal because adt-clients
  puts it in the options; honouring it is the consumer's contract (goal), stated in the embedding
  docs and the migration note. Nothing more is promised for a consumer's connection that ignores
  it.
- **No view, no gate**: the earlier drafts' per-request view and provider-side gate are gone; the
  signal reaches every request through the one place clients are built.

### 5.3 In a request

- **(D32) The server's own waits for a request race its signal**: `connect()` (shared by stdio's
  callers), `getProvider`'s build, the system-context lookup. A cancelled caller settles at once;
  the shared work runs on; a late rejection is handled; a late success that belonged to it alone is
  cleaned up. The waits inside a request's send are the connection's (§3.1).
- **(D5) A cancelled request does not reach its tool**, in every package: after the connection is
  ready an aborted signal answers `aborted` and the handler is not called.
- **(D7) One retry after another caller's abort** (stdio): `connect()` failing `interactive-login`
  `aborted` while this request's signal is live is retried once — a later request inside the abort
  window of another's starts afresh. Read by `kind`, once.
- **(D13) The connection a request uses**: HTTP builds one per request; stdio keeps its connection
  while `getProvider` answers the same provider, and builds a new one when the broker built a new
  provider.

### 5.4 The HTTP package

A client that disconnects closes its transport, which aborts its in-flight requests'
`extra.signal` (§2): the request signal ends its waits and stops its sends. There is no setup phase
before dispatch (no destination, no login): the per-request server, the header provider and the
connection are built inside the request.

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
bound.

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
renews) and, with D30, the binding of a handed-over `jwt` / `none` token. `basic` and `snc`
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

**(D33)**

- **One registry of live tools, both transports.** lib's tool wrapper (`BaseMcpServer`, the one
  wrapper every package uses) registers each tool call — its controller and its settlement — in
  one process-wide registry in lib (`src/lib/activeTools.ts`), across every server instance;
  core's and http's shutdowns use it, and neither has a second implementation. A tool **settles**
  when its handler's promise settles — after its releases (D40) were sent and answered.
- **core**, in this order: stop taking input; abort every registered tool; **await their
  settlement** — the provider gate is still open, so a release can still be authorized with the
  credential held (a refresh included), but no interactive login starts once the shutdown began
  (the login wrapper answers `interactive-login` `aborted` with the shutdown sentence); then close
  the provider gate (minted answer, D17); dispose every strategy the factory composed; drain the
  counted calls; `flush({ signal })` the broker — **no deadline of the server's choosing** (`SHUTDOWN_DEADLINE_MS` and the drain's
  timer, `countedProvider.ts:69-82`, are removed); exit `0`, or `1` with one stderr line per fact
  (`"<destination>": <reason>`, the reason `classify(entry, 'persisting-tokens').reason`).
- **What starts and what forces it**: the first trigger — `SIGTERM`, `SIGINT`, the end of stdin —
  starts the one sequence; **every stdin `end` / `close` is part of that start** (M7). Only a
  `SIGTERM` / `SIGINT` after the start, or `--shutdown-timeout=<seconds>` (`MCP_SHUTDOWN_TIMEOUT`,
  YAML `shutdown-timeout`, **no default**), ends it early — exit `1`, naming what was pending.
  What that costs is documented with the option: a pending write is lost, and a discarded refresh
  token can come back.
- **http**: stop listening; abort every registered tool (the same registry, across the
  per-request server instances); **await their settlement** — each aborted tool's releases
  (D40: an unlock, sent outside the request's signal) land before exit, so a shutdown never leaves
  a SAP lock held; then exit `0`. The same escapes as core and no others: a `SIGTERM` / `SIGINT`
  after the start, or `--shutdown-timeout`, ends the wait early — exit `1`, naming the requests
  still cleaning up; **no deadline by default**. Nothing is persisted, so nothing is flushed.

## 7. Failures: how they are read and what an MCP client sees

### 7.1 One reader

**(D14)** lib's `failureOf(thrown)` (`src/lib/auth/failures.ts`) — structural, total, no
`instanceof` on a chain class, no `message`, no `name`:

1. `isAuthProviderFailure(thrown)` → `readFailure(thrown, 'unfamiliar-error')`;
2. an own `refusal` with a known `kind` → `classify(refusal, 'unfamiliar-error')` (connection's
   `AuthRefusedError`);
3. an own `code` equal to `ADT_REQUEST_ERROR.ABORTED` → `request_aborted`, fixed words;
3b. an `IAdtError` (or adt-clients' thrown error) with an own `refusal` → step 1 or 2 on that value;
4. the server's own refusal classes;
5. else `undefined` — not an authentication failure, answered as today.

**core** reads first `isDestinationConfigError(thrown)` (auth-broker, structural) → its
`destination`, `missingFields` and carried `error` (classified), then lib's `failureOf`. Reason:
lib depends on no broker (D38), and auth-errors decides what a value is (H6).

### 7.2 Where failures are caught

- **Outside a handler** — the tool wrapper's `catch`, the core launcher's check: the reader first.
- **Inside a handler**: adt-clients 25.1.0 keeps the structured failure — `IAdtError.refusal`,
  or a thrown error's own `refusal` (§3.1) — so `failureOf` reads it through auth-errors
  (`classify(refusal, 'unfamiliar-error')`) for **every** connection, the consumer's included,
  without wrapping one. A handler's error result whose failure carries a `refusal` is answered as
  §7.3. The earlier drafts' failure observer on server-built connections and D16's "words only for
  an injected connection" are gone (H6: one place carries the failure).
- `return_error` and `answer()` call the reader first.
- **(D45) An auth failure ends the tool call before any conversion.** A failure that carries a
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
  | **P7 — every other `catch` over an adt-clients call** | 111 `catch` blocks in `src/handlers` and `compact*/src`, and 73 in the library and server paths (`src/lib` — `utils.ts` 20, `strategies/`, `search-source/`, `compact/` —, `src/embeddable`, `server/src`, then `http/src`): the plan audits each and records it as one of P1–P8 or "rethrows the original" |
  | **P8 — library conversions of a release or a read** | `withLock.ts:33-43` (`runRelease`, a thrown release → `{ error: 'client_threw', message }`), `:46-58` (a refused release → `{ message, origin, request }`), `:136-141` (a body that succeeded + a failed release → `ok: true` with that carrier), `:169` (`messageOf`), `:181-190` (`LockNotReleased`'s message); `safeFields.ts:56` (`safeCleanup` keeps `message` only); `answer.ts:57-60` (`local()` renders the carrier); `search-source/sourceReader.ts:39-50` (`safe()`: a failed read → `null`, a debug line, a shorter result) |

  That is 38 sites in 23 files (P1 3, P2 6, P3 2, P4 9, P5 9, P6 1, P8 8), and the 184 `catch`
  blocks of P7. At P1–P3 and P7 the
  helper runs first; P4–P6 are kept and pinned. **A source test keeps the list honest**: it scans
  for the patterns and fails on any occurrence not in the list (`tools/auth-failure-sites.json`,
  file, line pattern, kind), and on any listed P1–P3 / P7 site whose block does not call
  `endIfAuthFailure` before converting. Reason: the goal's *Failures reach the user as the chain
  made them* holds in every mode only if no handler turns a refusal into text or a partial
  success first; a new handler meets the test.
- **(D46) A release that fails on the credential** (`withLock`, P8). The cleanup carrier keeps the
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
| `DestinationConfigError` (core) | `destination_refused` | — (`cause_kind` when it carries an error) | `Destination "<name>" cannot be used: <fields>` | the carried hint, then one fixed hint per known field (`HINTS`; `issuedFor` / `issuedBy`: "the token in the session is bound to other means: write it again, or remove `SAP_ISSUED_FOR` / `SAP_ISSUED_BY`") |
| `ADT_REQUEST_ABORTED` | `request_aborted` | — | fixed words | — |
| the server's own refusal | `destination_refused` / `fresh_connection_unavailable` / `inspection_only` / `credentials_required` (HTTP) | — | fixed words | — |

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
  `IAdtError { origin: 'refusal', message: <SAP's text>, adtType, … }`, with **no `refusal`**
  (§3.1, adt-clients' contract); `answer()` renders it as today (`failurePayload`, `message` and
  `raw_body`);
- `failureOf` reads a `refusal` only — never a status, never `origin` — so a `403` is never
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
| `system` (default), `auto` | `linuxDefaultBrowser()` | `macDefaultBrowser()` | `windowsDefaultBrowser()` | refused at start: "use `--browser=none`" |
| `chrome` | `linuxBrowser('google-chrome')` | `macBrowser('Google Chrome')` | `windowsBrowser('chrome')` | refused |
| `edge` | `linuxBrowser('microsoft-edge')` | `macBrowser('Microsoft Edge')` | `windowsBrowser('msedge')` | refused |
| `firefox` | `linuxBrowser('firefox')` | `macBrowser('Firefox')` | `windowsBrowser('firefox')` | refused |
| `none`, `headless` | no browser: the URL on stderr; the login waits | the same | the same | the same |

`--browser-program=<program>` (`MCP_BROWSER_PROGRAM`, YAML `browser-program`, excludes
`--browser`) runs the named program; a name outside the enum is refused at start. The mapping is a
pure function returning `{ factory, argument }`, tested without constructing a browser. The
callback port keeps `--browser-auth-port` (default 61001). All of it lives in core.

## 9. Debug output and logging

- **(D24) `--auth-debug`** (YAML `auth-debug`, **no environment form**), core only — the HTTP
  package builds no token provider, so it has no providers' debug line. It sets the broker's
  `authDebug: true` and routes the broker's logger to stderr, with one start line warning that a
  refused token request's line names its secrets' first and last four characters. No variable
  turns it on. `DEBUG_AUTH_LOG` keeps routing the broker's logger to stderr; its lines carry no
  secret without `authDebug`.
- **Prompts** (core): the strategy wrapper's logger writes `info` to stderr; the authorization URL
  is written by auth-providers to stderr only, and only when no browser is set or the launch failed.
- **(D25)** The startup summary shows presence only (`Password: set`).
- **No `message` of a thrown value in a log line** on the auth paths; an auth failure logs
  `logFields(error)`.
- **(D26) No regular expression over untrusted input** in the touched files: `destinationName`
  (core), the parameter parsers, `errorClassOf`, `return_error`, `notStoredOf`'s removal — plain
  code, and a source test.
- **(D27) "Server text" — decided by the user** — means text an authorization server or identity
  provider sent; ADT answers, ADT's own authorization errors included (D47), stay in tool results
  as the tools' data.
- **stdout**: nothing is added. core is a stdio server; the HTTP package writes its lines to stderr
  as today.

## 10. Options per binary, and every API change

### 10.1 The parameter tables (D38)

Each binary reads its own table through lib's machinery; **an option of another binary is not in
its table**. The help, the YAML template and the validation come from it.

| Binary | Options |
|---|---|
| `mcp-abap-adt` (core) | `--mcp`, `--env`, `--env-path` / `MCP_ENV_PATH`, `--auth-broker-path` / `AUTH_BROKER_PATH`, `--unsafe` / `MCP_UNSAFE`, `--browser` / `MCP_BROWSER`, `--browser-program`, `--browser-auth-port` / `MCP_BROWSER_AUTH_PORT`, `--connection-type` / `SAP_CONNECTION_TYPE`, `--system-type` / `SAP_SYSTEM_TYPE`, `--login-timeout`, `--renewal`, `--shutdown-timeout`, `--auth-debug` (no env), `--exposition`, `--conf`, `--help`, `--version` |
| `mcp-abap-adt-http` | today's HTTP options, same names: `--host` / `--http-host` / `MCP_HTTP_HOST`, `--port` / `--http-port` / `MCP_HTTP_PORT`, `--path` / `--http-path`, `--http-json-response` / `MCP_HTTP_ENABLE_JSON_RESPONSE`, `--http-allowed-hosts` / `MCP_HTTP_ALLOWED_HOSTS`, `--http-allowed-origins` / `MCP_HTTP_ALLOWED_ORIGINS`, `--http-enable-dns-protection` / `MCP_HTTP_ENABLE_DNS_PROTECTION`, `--tls-cert` / `--tls-key` / `--tls-ca` (`MCP_TLS_*`); `--system-type` / `SAP_SYSTEM_TYPE`, `--shutdown-timeout`, `--exposition`, `--conf`, `--help`, `--version` |
| `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http` | core's, respectively http's, table with compact's `--exposition` (`ro` / `rw`) — the tool set's, nothing else |

**Removed parameters stop the start, naming where they went (D39)** — the mechanism 16.0.0 used
(`REMOVED_PARAMETERS`, `authParameters.ts:118-158`), not a cross-mode check:

- **`--transport` / `MCP_TRANSPORT` / YAML `transport` is removed entirely — decided by the user**:
  a binary is its transport. Passing it with any value stops the start: in core and
  `mcp-abap-adt-compact`, "`--transport` is gone: `mcp-abap-adt` serves stdio; for Streamable HTTP
  run `mcp-abap-adt-http` (compact: `mcp-abap-adt-compact-http`); SSE was removed"; in
  `mcp-abap-adt-http` and `mcp-abap-adt-compact-http`, "`--transport` is gone:
  `mcp-abap-adt-http` serves Streamable HTTP; for stdio run `mcp-abap-adt`".
- in the stdio binaries, `--allow-destination-header`, the SSE options (`--sse-host`,
  `--sse-port`, `--sse-path`, `--post-path`, `--sse-allowed-*`, `--sse-enable-dns-protection`,
  `MCP_SSE_*`) and the HTTP ones (`--http-*`, `--host`, `--port`, `--path`, `MCP_HTTP_*`,
  `MCP_TLS_*`);
- in the HTTP binaries, `--mcp`, `--env`, `--env-path`, `--allow-destination-header`, `--unsafe`,
  `--browser*`, `--login-timeout`, `--renewal`, `--auth-debug` ("destinations and logins are
  served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers").

### 10.2 Each current call site → its new form

| Site | Today | 18.0.0 |
|---|---|---|
| `brokerFactory.ts:251-258` (→ core) | `new AuthBroker({ serviceKeyStore, sessionStore, ...handler.brokerOptions(ctx) }, logger)` | `+ renewal, onWriteFailure (by store, D12), authDebug` |
| `brokerFactory.ts:184-198` | provider cached by the factory | `getProvider(d, { signal })` per request, counted wrapper memoised |
| `brokerFactory.ts:217`, `:58-68` | `flush()`; `notStoredOf` with `ENTRY` | `flush({ signal })`; `classify(entry, 'persisting-tokens')` |
| `errors.ts:97-118`, `:55-61` | `describeAuthError`; `errorClassOf` with a regex | `failureOf` (lib) + core's destination reader; plain-code `errorClassOf` |
| `handlers/jwtAuthorizationCode.ts:5-18` | `oneLoginAtATime(strategy({ browser: string, port }), lock)` | `serverLogin(browserCallbackStrategy({ browser?: IBrowser, port }), context)` (D8) |
| `countedProvider.ts:24-27`, `:69-82` | unminted refusal; drain timer | minted; no timer |
| `shutdown.ts:22-23`, `:71`, `:94-97` | 30 s; `settle(30_000)`; end and close two triggers | D33 |
| `launcher.ts` (core) | every transport; `promptsOnStderr`; `factoryConfigFrom`; `checkAndSummarise` | stdio only; folded into the wrapper; D9–D12, D24; D18, D25 |
| `StdioServer.ts:34-35`, `:51-67` | context set once; fake refusing provider | destination source; `inspection_only` |
| `StreamableHttpServer.ts` (→ http) | destinations, `FirstConnectLock`, headers | headers only (D39); no `IDestinations` in its constructor |
| `SseServer.ts`, `destinationRequest.ts` | SSE; destination header | deleted |
| `BaseMcpServer.ts:98-230`, `:257` | context setters; `getConnection()`; `(args)` | the source (§4); `getConnection(signal)`; `(args, extra)`, the signal scope, D5, D7, §7.2 |
| `clients.ts:34-51` | `new GuardedAdtClient(connection, logger, options)` | `+ signal: () => currentRequestSignal()` (read per request) |
| `withLock.ts:26-40`, `:107` | `runRelease(release, handle)` | the release inside `runWithoutRequestSignal` (D40) |
| `credentialSources.ts:33-59` | default branch → basic | D19 |
| `packageSessions.ts:40-61`, `handleDeletePackage.ts:93-108` | record, else configuration; fallback | D20, D21 |
| `requestSystemResolution.ts:104-125` | memo; lookup on the caller's connection | unsignalled shared lookup, raced per caller |
| `utils.ts:229-371` `return_error` | regexes over `message` | `failureOf` first; plain code |
| `src/__tests__/integration/globalSetup.ts`, `helpers/authHelpers.ts` | auth-providers 5's `browserCallbackStrategy` | 6.0's, from core |

### 10.3 The exported API, for embedders

- `@mcp-abap-adt/lib/embeddable`: `ConnectionContext` (§4), `EmbeddableMcpServerOptions.freshConnection`
  (§4.3), `BaseMcpServer`'s `ConnectionSource`.
- `@mcp-abap-adt/lib/auth`: §3.4; `describeAuthError` → `failureOf`.
- `@mcp-abap-adt/core/auth`: the destination layer — `AuthBrokerFactory` with
  `IAuthBrokerFactoryConfig` (`browser?: IBrowser`, `browserStrategy` with that option, `renewal`
  required, `onWriteFailure` by store, `loginTimeoutMs?`, `authDebug?`), `IDestinations.getProvider(d,
  { signal? })`, `settle({ signal? })`.
- `@mcp-abap-adt/http`: `StreamableHttpServer(handlersRegistry, options)` — no destinations argument.

## 11. Docker images and release artifacts

**(D41)**

- **`docker/Dockerfile`** installs `@mcp-abap-adt/http` and runs `mcp-abap-adt-http`
  (`MCP_HTTP_HOST=0.0.0.0`, `MCP_HTTP_PORT=3000`): no `AUTH_BROKER_PATH`, no `service-keys/` or
  `sessions/`, no `--allow-destination-header`; it also installs `@mcp-abap-adt/compact`, whose
  `mcp-abap-adt-compact-http` is the documented alternative command (D37); `HEALTHCHECK` on
  `/mcp/health` unconditionally. The package source is a build argument: the registry by default,
  the packed tarballs of the checkout in CI — so the image is verified before the package exists on
  npm. Verified on the built image: the health endpoint answers `200`, and a `tools/call` with only
  `x-sap-*` headers against a local ADT stand-in answers.
- **`docker/Dockerfile.inspect`** (Glama) keeps running core over stdio behind `mcp-proxy` —
  inspection-only without a destination, as today; only its `CORE_VERSION` moves.
- **Compose**: `docker-compose.yml` becomes the headers-only service (the former
  `docker-compose.headerless.yml`, which is deleted), with no volume; `docker-compose.inspect.yml`
  unchanged.
- **Workflows**: `ci.yml` and `release.yml` build, type-check and test `http/`, pack it beside the
  others, install the tarballs and run `--version` / `--help` of all four bins (`mcp-abap-adt`,
  `mcp-abap-adt-http`, `mcp-abap-adt-compact`, `mcp-abap-adt-compact-http`), and build the image
  from the tarballs; `scripts/publish-all.sh` publishes `./http` after `.` (lib) and `./server`,
  before `./compact`; `binSmoke.test.ts` installs and starts the four bins.
- **Metadata**: `docs/deployment/RELEASE.md` names six packages and the order; `server.json`
  keeps core as `stdio` and its environment variables less the HTTP ones; a new registry entry
  (`server-http.json`, `io.github.fr0ster/mcp-abap-adt-http`) with transport `streamable-http`;
  `server-compact.json` lists both compact transports (stdio, and `mcp-abap-adt-compact-http` as
  `streamable-http`); `glama.json`'s description names the transports per package;
  `releaseMetadata.test.ts` covers the new entry.

## 12. Documentation and migration notes

**`docs/MIGRATION-18.0.md`**, row by row:

- **HTTP users**: install `@mcp-abap-adt/http`, run `mcp-abap-adt-http`; credentials only from
  `x-sap-*` headers per request; the default destination, `x-mcp-destination`,
  `--allow-destination-header`, service-key and session mounts are gone; the Docker image changed
  accordingly.
- **SSE users**: SSE is removed; use Streamable HTTP (`mcp-abap-adt-http`).
- **compact over HTTP**: `mcp-abap-adt-compact-http` (in `@mcp-abap-adt/compact`), identical to
  `mcp-abap-adt-http` but for the tool set; over stdio `mcp-abap-adt-compact` as today.
- **stdio users**: `--transport` is gone — remove it (D39); the first start after upgrading logs in
  once per `jwt` / `authorization_code` destination (broker 5 reads earlier sessions as unbound);
  a `jwt` / `none` destination keeps working — the broker binds the token on first use and writes
  the binding back (D30); editing a destination's files while the server runs is
  unsupported — restart after any change (D3); `--browser` table, unknown names refused, `none`
  waits, `--browser-program`; no login timeout (it was 30 s) and `--login-timeout`; no shutdown
  deadline (it was 30 s), `--shutdown-timeout` and the second signal; `--renewal`; a failed write
  to the `--env` file fails the request, under `--unsafe` it warns; `--auth-debug`; the summary
  shows presence only; `DeletePackage` no longer falls back; `npm run auth` → `mcp-auth` of
  `@mcp-abap-adt/auth-broker-cli`; failures as §7.3.
- **Embedders**: `freshConnection`; **honour the signal** in each request's options and the
  factory's — the server passes it and promises nothing more for a connection that ignores it;
  `ConnectionContext`; `lib/auth` lost the destination layer (now `core/auth`); `IAuthBrokerFactoryConfig`'s
  required options; `StreamableHttpServer` moved to `@mcp-abap-adt/http` and lost its destinations
  argument; `AbapConnection` (connection 15 on interfaces-adt-connection 2) answers `unknown` by
  default — name the type or narrow it; the chain's own migrations (auth-providers 6, broker 5,
  connection 12–15).

**Updated**: `README.md`, `server/README.md`, a new `http/README.md`, `CHANGELOG.md` (18.0.0, with
§15's measurements), `docs/user-guide/AUTHENTICATION.md` (stdio only; HTTP headers; the
read-once sentence), `CLI_OPTIONS.md` (per binary), `CLIENT_CONFIGURATION.md`, `TERMINOLOGY.md`,
`docs/configuration/YAML_CONFIG.md` (per binary), `docs/installation/INSTALLATION.md` and
`examples/SERVICE_KEY_SETUP.md`, `docs/deployment/DOCKER.md`, `RELEASE.md`, `MCP_REGISTRY.md`,
`docs/architecture/ARCHITECTURE.md`, `CONNECTION_ISOLATION.md`,
`docs/development/tests/TESTING_AUTH.md`, `DEBUGGING.md`, `src/embeddable/docs/ARCHITECTURE.md`
(the signal contract), `src/lib/config/README.md`, the moved `UNIFIED_BROKER_LOGIC.md`, each
launcher's help.

## 13. Version, release and how the change is committed

- **(D29) Six packages at 18.0.0**, the new one included, from PR #287 — **decided by the user:
  one PR, one major release**.
- **The server waits for its prerequisites** (§3.1) — the user's debugger releases first
  (interfaces-adt 13.1.0, adt-clients 26.0.0), then interfaces-adt-connection 2.1.0,
  interfaces-adt 13.2.0, connection 15.0.0, adt-clients 26.1.0 and auth-broker 5.1.0 — then
  releases per `RELEASE.md`: manifests and
  sibling ranges, metadata, CHANGELOG and docs, `npm ci`, build, `test:check`, `npm test`
  (binSmoke), each package's own tests, `release:dry` ending `Published: 6  Skipped: 0`; the
  lockfile holds no `"link": true` and nothing not from the registry; after publishing, a clean
  install of `@mcp-abap-adt/core@18.0.0` and `@mcp-abap-adt/http@18.0.0` outside the repository
  runs each bin's `--version` and `--help`. The publish is the user's.
- **(D42) How the change is committed** — so the debugger branch rebases cheaply:
  1. **the move, alone**: one commit that moves files between packages (`git mv`) and fixes only
     imports and package manifests, behaviour unchanged, the suite green — including the HTTP
     package created from core's HTTP files, SSE still present;
  2. **SSE removal**, alone;
  3. then the behaviour changes, each in its own commits (dependencies, sources and modes,
     cancellation, failures, stdio auth, Docker and release, docs).

  A branch that touched moved files rebases over commit 1 with `git rebase` following the renames;
  every later commit touches the moved files in place.

## 14. Tests

**Shape**: unit suites need nothing outside the process — auth-stores 4 in temporary directories,
the real broker 5 and providers 6, a token endpoint and an ADT stand-in on `127.0.0.1`, an `IBrowser`
fake that plays the user. No test launches a program (`node:child_process` mocked where strategies
are composed). Every rule a test protects is shown load-bearing: break it, watch it fail, revert.
Each package runs its own suite (`npm --prefix http test` beside `server/`).

### 14.1 Packages and options

- **The dependency rule (D38)**: `package.json` and the import graphs of lib and http hold no
  auth-broker / auth-stores; core's does. *Break:* a lib import of `AuthBrokerFactory`.
- **Each binary's options**: core's help lists no HTTP option, http's no destination option; each
  removed parameter stops its binary with its words; `--transport`, with any value, stops every
  binary naming the binary to use.
- **HTTP credentials**: a request with `x-sap-*` basic and with a token reaches the stand-in with
  that credential; none, or `x-mcp-destination`, answers `400` with its words; two concurrent
  requests with different users never see each other's credential.
- **Full and compact behave alike (D37)**: one parametrised suite runs each transport test —
  credentials, cancellation, failures, shutdown — with `fullToolSet` and with `compactToolSet`;
  the only difference asserted is the tool list. *Break:* give compact's launcher an option of its
  own → the parity test fails.
- binSmoke installs and starts all four bins; `releaseMetadata` covers the new entries.

### 14.2 Failures (§7)

One test per source through a real request — a provider's `AuthProviderFailure`, connection's
`AuthRefusedError` (`refused-after-renewal`), core's `DestinationConfigError` (a `jwt` / `none`
without binding), a failure inside a handler on a server-built **and on an injected** connection (through `IAdtError.refusal`), `ADT_REQUEST_ABORTED`; each asserts
`error`, `kind`, `message`, `hint` as `render` gives them and no diagnostics. Source tests: no
`instanceof` of a chain class, no `.message` read in the auth modules, no regex in the touched
files. Each §7.4 sentence under its condition.

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
`AuthRefusedError` from `makeAdtRequest`): the tool result carries `error`, `kind`, `message` and
`hint` exactly as `render` gives them, read from `IAdtError.refusal`; the connection was not
wrapped (its `makeAdtRequest` is the consumer's own function, identity checked).


For `CreatePackage` (high, low), `LockPackage` over RFC and `DeletePackage` with
`force_new_connection`, on an injected connection whose configuration holds no usable credential:
with `freshConnection` the factory is called with the request's signal, the operation runs on its
connection, which is disconnected, and no provider is constructed; without it,
`fresh_connection_unavailable`, nothing sent. *Breaks:* restore the configuration fallback; restore
`DeletePackage`'s fallback.

### 14.4 Cancellation

1. **The signal reaches every request (D31)**: through the real adt-clients, every `makeAdtRequest`
   of a tool carries its request's signal — for two concurrent requests on stdio's one connection,
   each its own; for an injected connection, in its request options; and the consumer's factory
   receives it. *Break:* drop the signal from `createAdtClient`.
2. **The substitution sites (§5.2)**: (a) `CreatePackage` high and low over RFC — the fresh
   connection's requests carry the create's signal; (b) `DeletePackage` with
   `force_new_connection` — the sibling's carry the delete's; (c) `LockPackage` (L) →
   `UpdatePackage` (U) → `UnlockPackage` (X) over RFC — each step carries its own signal, never L
   after the lock request ended; cancelling U sends no update, keeps the session, and the unlock
   with X succeeds. *Break:* keep a signal on the lock session.
2a. **The shared system-context lookup (D44)**: two cloud requests share one lookup held at the
   stand-in; **one waiter cancels** → it is released at once, the lookup goes on, the other gets
   its context, and the answer is memoised; **every waiter cancels** → the lookup's request is
   aborted (nothing more of it is sent), nothing is memoised, and a later request starts a fresh
   lookup and succeeds; a failed lookup is not memoised either. *Breaks:* run the lookup under the
   first caller's signal (the second is refused); memoise the attempt before it settles (the later
   request inherits the abort).
3. **A cancelled mutation is never sent** (M1, M6; with connection 15.0.0 and adt-clients 26.1.0):
   a server-built connection against the stand-in; R1 and R2 `POST`; R1 cancelled while both wait in
   `rejected()`, and separately in `authorize()`: no `POST` of R1 after its abort, R1 answered
   `request_aborted`, R2 `200`. Over HTTP in core and in the HTTP package; RFC's boundaries are
   connection's tests (§3.1).
4. **Releases are not cancelled (D40)**, through real handlers against the stand-in (adt-clients
   26.1.0, connection 15.0.0): `UpdateServiceDefinition` (its `withLock` release is
   `obj.unlock` of the signalled client) cancelled after the lock answered and before the update —
   the stand-in's log holds the `LOCK`, then the `UNLOCK`, and no update; the same for one handler
   per listed release site and for an adt-clients-internal release (`withLock` of a high-level
   create). *Break:* run `runRelease` inside the request's signal → the log holds no `UNLOCK`.
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
11. **HTTP disconnect**: a client that closes its connection mid-request — its waits end, nothing
    more of it is sent.

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
  stand-in's log holds the `UNLOCK` before the process exits, exit `0`; a second `SIGTERM` while the
  `UNLOCK` is held exits `1` at once naming the request. *Breaks:* restore the 30 s deadline; count
  `close` as a second trigger; exit http without awaiting the aborted tools (the `UNLOCK` is
  missing). **stdio**, for the full and the compact tool set: a tool awaiting its `UNLOCK` (held at
  the stand-in) with **no provider call in flight**, and a store whose flush completes at once —
  the `UNLOCK` lands before exit; *break:* drain and flush without awaiting the tools' settlement
  (the `UNLOCK` is missing); close the gate before the tools settle (the `UNLOCK` is refused).
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
mocked transport), `snc`, `jwt` / `authorization_code`, `jwt` / `none` — with no binding (bound and
written back by auth-broker 5.1.0, M8), with its own, and with another destination's (refused);
HTTP headers; `SapConfig` refusals (D19); embedded with an injected connection. The existing suites
are moved and updated, not deleted (`brokerFactory`, `destinationRouting` → HTTP headers,
`packageSessions`, `credentialSources`, `connectionFactory`, `returnError`, `shutdown`,
`launcherDestination`).

### 14.8 Docker

CI builds `docker/Dockerfile` from the tarballs and, on the image: `mcp-abap-adt-http --version`,
`/mcp/health` `200`, a `tools/call` with `x-sap-*` headers against a stand-in;
`Dockerfile.inspect` builds and `mcp-abap-adt --version` answers.

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
3. basic over HTTP and over RFC (stdio).
4. SNC over RFC on Windows, over stdio.

## 16. Overlap with the parallel debugger work

The debugger investigation (`research/adt-debugger-investigation`) touches `tools/` only so far;
debugger tools would add handlers and touch shared files. The move is its own commit (D42), so a
rebase follows renames. Footprint in shared files:

| Shared file | What this change does there |
|---|---|
| `src/embeddable/BaseMcpServer.ts` | the source, `getConnection(signal)`, the wrapper's `extra`, the signal scope, D5 |
| `src/lib/clients.ts` | the `signal` function passed by `createAdtClient` |
| `src/lib/strategies/withLock.ts` | `runRelease` outside the request's signal |
| `src/lib/utils.ts` | `return_error`'s first lines and two regexes; one request's `signal` |
| `src/lib/packageSessions.ts`, `handleDeletePackage.ts`, `requestSystemResolution.ts` | D20, D21, the lookup's own attempt (D44) |
| `src/lib/handlers/interfaces.ts`, `src/lib/requestContext.ts`, handler signatures | untouched |
| `server/src/*`, `compact/src/*` | split between core and http, compact's two bins (D42, commit 1) |
| adt-clients and interfaces-adt | the debugger releases land first; this change's prerequisites build on them (§3.1) |
| `tools/` | untouched |

A debugger listener (a long request) is bounded by nothing of the server's and cancelled by its MCP
request like any request.

## 17. Holds throughout: how each holds

| | How |
|---|---|
| H1 The consumer composes; nobody guesses | renewal, write failures, bounds, the browser, `authDebug` stated (D9–D12, D24); no default collaborator in the factory; refusals instead of guesses (D9, D19, D21, D39) |
| H2 Nothing goes out that should not | §7.3, §9; the URL only on stderr from the providers; nothing on stdout; §14.6 |
| H3 A credential stays bound | providers only from the broker in core, the destination read once per process and its edit documented (D3); header credentials per request, never stored or shared (D39); injected connections never re-authenticated (§4.3) |
| H4 The modes are separated by package | D35, D36, D38: broker, stores, destinations, session files and logins only in core; http works only with header credentials, no server-held credential; embedded keeps none, consumer connections unwrapped, given the signal (§5.2) |
| H5 No built-in timeouts | no login bound and no shutdown deadline by default (D10, D33); the 30 s deadline and the drain timer removed |
| H6 One implementation of each rule | failures read by auth-errors (§7.1); the broker's shared build; the broker's refresh state; auth-providers' browsers (D9); cancellation at the send boundaries the connection's (§3.1), the signal and the structured failure carried by adt-clients; the shared lookup on auth-errors' `sharedAttempt` |
| H7 Registry only | every range published; the four prerequisites of §3.1 first; §13 |
| H8 No regular expressions over untrusted input | D26; a source test |

## 18. Decisions taken by the user, and questions for the user

**Taken by the user** (recorded):

| # | Decision |
|---|---|
| D3 | (c) document, don't engineer: a destination is read once per process; editing its files while the server runs is unsupported, restart after any change |
| D31 | (a) a per-request signal in connection, a prerequisite; the server passes it |
| D12 (`--unsafe`) | `onWriteFailure: 'continue'`; no `--session-write-failure` |
| — | HTTP serves only per-request header credentials; the default destination exists only for stdio |
| — | the package split (core stdio, a new HTTP package, lib without broker and stores) |
| — | SSE removed |
| D29 | one PR (#287), one major 18 for every package |
| D12 (`--env` file) | `'fail'`, fixed; a session write happens only in stdio and only for token destinations |
| D35 | `@mcp-abap-adt/http`, bin `mcp-abap-adt-http`, directory `http/` |
| D37 | compact over HTTP wanted; behaviour identical, only the tool set differs |
| D34 | the abort's code is the connection's own, `ADT_REQUEST_ABORTED` |
| D30 | the broker binds a handed-over token itself — a prerequisite (auth-broker 5.1.0) |
| D22 | ownership of a handed-over fresh connection passes to the server |
| D27, D47 | "server text" is an authorization server's or IdP's; ADT's own authorization errors reach the client as ADT errors |
| D39 | `--transport` removed entirely, refused naming the binary to use |
| §3.1 | the prerequisites on the current lines, after the debugger releases; the goal's *Out of scope* names them; connection is 15.0.0, a major, no compatibility shim |
| D30 (contract), 2026-10-10 | auth-broker 5.1.0 binds a handed-over credential **only when its session holds no binding at all** (`issuedFor` and `issuedBy` both absent); a present, different binding stays refused, as in 5.0.1 |
| — , 2026-10-10 | **this spec is approved**; the plan is written against it |

**Settled by the registry, not a decision** (2026-10-10, `npm view`): the version numbers §3.1, §3.3
and §13 assumed for two prerequisites were taken by other releases the same day —
`@mcp-abap-adt/interfaces-adt` 13.2.0 (the service binding's atoms), and `@mcp-abap-adt/adt-clients`
26.0.0, 26.1.0 and 27.0.0 (the debugger line, then a major). The prerequisites keep their contracts
and take **the next free minor on the current line** when each is released — today
interfaces-adt 13.3.0 and adt-clients 27.1.0; interfaces-adt-connection 2.1.0 and connection 15.0.0
are still free. Wherever this spec names interfaces-adt 13.2.0, adt-clients 25.1.0, 26.0.0 or 26.1.0
as a prerequisite, read that release; the plan checks each number with `npm view` before it is
used.

**Questions for the user**: none open.

**Possible later improvements**, each its own change in its repository: auth-stores
`EnvDestinationStore.fromContent` / key stores `fromKey` (projections from content read once); the
broker's `getProvider` answering the means it was built from.
