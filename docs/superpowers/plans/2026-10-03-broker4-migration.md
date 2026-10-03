# Server on auth-broker 4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan carries steps, not code** (the user's rule, which overrides the skill's code-block requirement). Each test is described by its behaviour and its assertion; the code — tests first — is written at implementation.

**Goal:** the server takes every destination's credential from `auth-broker` 4's `getProvider` and builds every connection one way, for basic (HTTP/RFC), SNC (RFC), `jwt` / `authorization_code` and `jwt` / `none`.

**Architecture:** one connector construction (`createAbapConnection(settings, credential, …)`) fed by three provider sources; an `AuthBrokerFactory` that composes each destination's stores, validates what it states, picks an authentication handler, builds one broker per destination and hands out a counted, gated provider; a launcher-installed shutdown that closes the gate, waits, and flushes.

**Tech Stack:** TypeScript, Jest (ts-jest), `@mcp-abap-adt/auth-broker` 4, `auth-providers` 5, `auth-stores` 3, `connection` 10, `interfaces-auth` 3, `interfaces-auth-broker` 1.1, `interfaces-auth-sap` 2.

**Goal document:** `docs/superpowers/2026-10-03-broker4-migration-goal.md` (invariants H0–H8).
**Spec:** `docs/superpowers/specs/2026-10-03-broker4-migration-design.md` (sections §1–§12). Executors read both.

**Where:** worktree `.worktrees/broker4`, branch `feat/broker4-migration`, PR #269. Every commit is pushed to the PR before an external review.

## Global Constraints

- Ranges (spec §1): `auth-broker` ^4.0.0, `auth-providers` ^5.2.1, `auth-stores` ^3.2.0, `connection` ^10.0.3, `interfaces-auth` ^3.0.0, `interfaces-auth-broker` ^1.1.0, `interfaces-auth-sap` ^2.0.0; `server/package.json` drops `auth-broker`; `sap-rfc-lite` stays optional.
- Dependencies come from the registry only: after every install, the lockfile has no `"link": true` outside the workspace and nothing resolved from a path.
- Supported authentications are exactly the four handlers (spec §3); no option, collaborator, doc or test for another grant.
- Nothing writes to stdout (H3); prompts and shutdown lines go to the logger, else stderr.
- No secret in a log line or an error message (H4) — tokens, passwords, client secrets, cookies, SNC names, and any unvetted string read from a file. The one exception is the startup summary's existing mask, unchanged.
- Errors name fields and vetted vocabulary only; `DestinationConfigError` is auth-broker's own class.
- Callback port default `61001`; login timeout and shutdown deadline `30_000` ms.
- Versions: all five packages (`lib`, `core`, `compact`, `compact-readonly`, `compact-modify`) to `16.0.0`, together.
- Descriptions and test data name nothing concrete (repository rule in `CLAUDE.md`): no system id, package, transport or object name; placeholders in fixtures.
- Tests run in the worktree only; it has no `tests/test-config.yaml`, so `npm test` touches no live system. Never run tests in the main checkout. Jest per file: `npm test -- <path>`; server package: `npm --prefix server test -- <path>`.
- **The build is red between Task 1 and Task 7.** The dependency bump breaks the old wiring all at once (connection 10 no longer exports credentials; auth-stores 3 changed every store). Tasks 1–6 build new units beside it; their gate is their own test files plus `npx tsc --noEmit -p tsconfig.json` showing no error in the files the task touched (filter the output by path). Task 7 makes `npm run build`, `npm run test:check` and `npm test` green again; from then on every task keeps them green.
- Every test that protects a rule is proven load-bearing: break the rule, watch the test fail, revert — and mention it in the commit message.

## Review Focus

Inputs the spec implies but no spec test exercises; each has its test in the owning task.

1. **A destination name that is a path** — `x-mcp-destination: ../../etc/x`, `a/b`, `.hidden`, empty: refused before any file is read, naming the header, never joined into `keysDir` / `sessionsDir` (Task 4).
2. **Two requests to the same new destination at once** — HTTP, both first: one broker and one provider built, both requests served (Task 5).
3. **`--browser-auth-port` that is not a port** — `abc`, `0`, `70000`, `-1`: refused at startup naming the parameter, in all three forms (Task 6).
4. **An `--env` / `--env-path` file that does not exist** — refused at startup naming the parameter and the path the user gave (it is their own input, not a secret), not a stack trace and not a silent fallback to the working directory's `.env` (Task 4).
5. **An XSUAA key whose `sessions/<dest>.env` sets `SAP_URL` instead of `XSUAA_MCP_URL`** — refused naming `XSUAA_MCP_URL`, so the user sees the key they must use (Task 4).

---

### Task 1: Dependencies, and the one connector construction

**Files:**
- Modify: `package.json`, `package-lock.json`, `server/package.json`
- Modify: `src/lib/connectionFactory.ts`
- Create: `src/lib/credentialSources.ts`
- Modify: `src/lib/packageSessions.ts`, `src/handlers/package/low/handleDeletePackage.ts`
- Test: `src/__tests__/unit/connectionFactory.test.ts` (new), `src/__tests__/unit/credentialSources.test.ts` (new), `src/__tests__/unit/packageSessions.test.ts` (extend), `src/__tests__/unit/deletePackageSchema.test.ts` (new)

**Interfaces:**
- Produces:
  - `createAbapConnection(settings: SapConfig, credential: IAuthProvider, logger?: ILogger | null, sessionId?: string): IAbapConnection` — the only connector construction.
  - `resolveSystemKind(settings, env?)` — unchanged behaviour.
  - `credentialFromHeaders(headers: Record<string, string | string[] | undefined>): { settings: SapConfig; credential: IAuthProvider }` — throws the existing "x-sap-url is required" / "x-sap-jwt-token or x-sap-login+x-sap-password" errors.
  - `credentialFromSapConfig(config: SapConfig): IAuthProvider` — today's `onPremCredential` switch, moved, providers from `auth-providers` 5 (`TokenAuthProvider.fixed`).
  - `openFreshConnection(connection, logger): Promise<IAbapConnection>` — signature without the `config` parameter; uses the sibling record, else the connection's `getConfig()` through `credentialFromSapConfig`.

- [ ] **Step 1:** Bump the ranges (Global Constraints) in `package.json` and `server/package.json`; `npm install`; check the lockfile for `"link": true` outside the workspace and for any non-registry `resolved`. Note in the commit which files fail `tsc` now (expected: brokerFactory, stores, BaseMcpServer, utils, connectionFactory).
- [ ] **Step 2: Write the failing tests for the construction.** For each of cloud / on-premise HTTP / on-premise RFC (`SAP_SYSTEM_TYPE` and `settings.connectionType` set by the test): the connector class is the expected one, the transport class is the expected one, and the credential the connector holds is **the same object** passed in (identity, not equality). A credential that is a `basic` provider passed with `settings.authType: 'jwt'` is still the one held — the factory reads no `authType` to choose a credential. `resolveSystemKind`: `SAP_SYSTEM_TYPE` wins; absent, `jwt` → cloud, anything else → on-premise.
- [ ] **Step 3:** Run them; they fail (old signature).
- [ ] **Step 4:** Implement the construction (spec §2): new signature, imports of credentials from `auth-providers`, the `transportMaterial` thunk removed (`OnPremHttpTransport(() => ({}), …)`), wire-log wrapper and RFC options unchanged, and a module-private `WeakMap` recording, per connection built, `{ settings, credential, logger }`.
- [ ] **Step 5: Tests for the sources.** `credentialFromHeaders`: a JWT header gives a token provider and settings `{ url, client, authType: 'jwt' }`; login + password give a basic provider and `authType: 'basic'`; neither → the existing error; settings carry no password or token field. `credentialFromSapConfig`: each of `basic`, `jwt`, `saml`, `certificate` gives its provider class; `kerberos` throws the existing refusal.
- [ ] **Step 6:** Implement `credentialSources.ts`; run the source tests green.
- [ ] **Step 7: Sibling tests** (extend `packageSessions.test.ts`): a connection built by the factory, passed to `openFreshConnection`, yields a new connection holding the same credential object and the same settings; a connection the factory did not build falls back to its `getConfig()` and gets a credential from `credentialFromSapConfig`.
- [ ] **Step 8:** Implement the sibling path in `packageSessions.ts`; tests green.
- [ ] **Step 9: Schema test** (`deletePackageSchema.test.ts`): `DeletePackage`'s input schema has no `connection_config`, still has `force_new_connection`; the handler, with `force_new_connection: true`, opens the fresh connection through `openFreshConnection(connection, logger)`.
- [ ] **Step 10:** Remove `connection_config` from `handleDeletePackage.ts` (schema, args type, call); tests green.
- [ ] **Step 11:** Prove load-bearing: make the factory build its own `BasicAuthProvider` from `settings` — the identity test fails; revert. Run all four test files; `tsc` filtered to the touched files shows no error.
- [ ] **Step 12:** Commit (`feat(connection): one connector construction, three credential sources`) and push.

### Task 2: The authentication vocabulary, handlers and the login lock

**Files:**
- Create: `src/lib/auth/vocabulary.ts`, `src/lib/auth/handlers/index.ts` (and one file per handler: `basic.ts`, `snc.ts`, `jwtAuthorizationCode.ts`, `jwtNone.ts`), `src/lib/auth/loginLock.ts`, `src/lib/auth/errors.ts`
- Test: `src/__tests__/unit/auth/vocabulary.test.ts`, `src/__tests__/unit/auth/handlers.test.ts`, `src/__tests__/unit/auth/loginLock.test.ts`

**Interfaces:**
- Produces:
  - `AUTH_TYPES` (`basic`, `jwt`, `saml`, `snc`) and `GRANTS` (`satisfies readonly DestinationGrant[]`, exhaustive at compile time).
  - `vetMeans(destination, means: IConnectionConfig | null): { authType: AuthType; grantType?: DestinationGrant }` — throws `DestinationConfigError(destination, ['authType'] | ['grantType'], fixedReason)`.
  - `interface AuthenticationHandler { authType; grantType?; brokerOptions(context: AuthHandlerContext): Partial<AuthBrokerConfig>; checkSettings?(settings: SapConfig): void }`; `AuthHandlerContext { browser: string; browserAuthPort?: number; loginLock: LoginLock; browserStrategy: (options: { browser: string; port?: number }) => IAuthorizationStrategy<string> }` — the launcher passes `browserCallbackStrategy` explicitly (H2: no default inside the handler); tests pass a recording one (named `AuthHandlerContext`, not the spec's `HandlerContext`: that name is already the tool handlers' context in `src/lib/handlers/interfaces.ts`).
  - `handlerFor(destination, vetted): AuthenticationHandler` — throws `UnsupportedAuthenticationError { destination; authType; grantType? }`.
  - `class LoginLock`; `oneLoginAtATime(strategy, lock): IAuthorizationStrategy<string>`.
  - `UnsupportedAuthenticationError`, `SettingsError` (for `checkSettings`: names `connection-type`) in `errors.ts`.

- [ ] **Step 1: Vocabulary tests.** `authType` absent, `''`, and a made-up string → `DestinationConfigError` naming `authType`; the made-up string is absent from `message` and from every own property. `jwt` without `grantType`, with `''`, with a made-up grant → naming `grantType`, string absent. `basic` and `snc` with a stray `grantType` → vetted without one (broker reads no grant for them). A type-level assertion in the test file: every `DestinationGrant` member is in `GRANTS` (fails `test:check` when the contract adds one).
- [ ] **Step 2:** Run; fail. Implement `vocabulary.ts`; green.
- [ ] **Step 3: Handler tests.** The four handlers are found by their keys; `saml` / `saml2_bearer`, `jwt` / `passcode`, `jwt` / `client_credentials` → `UnsupportedAuthenticationError` naming destination, type and grant. `brokerOptions`: `basic`, `snc`, `jwt` / `none` return `{}`; `jwt` / `authorization_code` returns exactly one key, `authorization`, whose strategy, when asked to authorize, runs under the context's lock with the context's `browser` and port (observe through an injected strategy factory, not by opening a browser). `snc.checkSettings` refuses a settings object without `connectionType: 'rfc'` with `SettingsError` naming `connection-type`, accepts `rfc`.
- [ ] **Step 4:** Implement the handlers and `handlerFor`; green.
- [ ] **Step 5: Lock tests.** Two strategies wrapped by `oneLoginAtATime` over one lock: the second `authorize()` starts only after the first settles (resolve and reject both release); a third waits behind the second; a strategy's `dispose`, if present, is passed through.
- [ ] **Step 6:** Implement the lock; green.
- [ ] **Step 7: The port, asserted on the socket** (spec §11; repository habit: assert on the port, not a log line): two real `browserCallbackStrategy` instances on one free port, each behind `oneLoginAtATime` over one lock, with an injected `openUrl` that completes the redirect by requesting the callback URL — both logins succeed, the second binds the port only after the first released it (bind the port yourself between them to prove it is free). Without the lock the same pair fails with a busy port — run it once to see it, then keep the locked version.
- [ ] **Step 8:** Prove load-bearing: drop the lock acquisition — the ordering test fails; revert. Drop `GRANTS` one member — `test:check` fails; revert.
- [ ] **Step 9:** Commit (`feat(auth): vocabulary, authentication handlers, one login at a time`) and push.

### Task 3: Store composition per destination

**Files:**
- Create: `src/lib/auth/destinationStores.ts`, `src/lib/auth/destinationName.ts`
- Modify: `src/lib/stores/index.ts` (keep only what the new composition uses; `detectStoreType` replaced by a key-shape reader)
- Test: `src/__tests__/unit/auth/destinationStores.test.ts`, `src/__tests__/unit/auth/destinationName.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `assertDestinationName(name: string, source: 'x-mcp-destination' | 'mcp'): void` — refuses `''`, separators, `..`, a leading dot, characters outside `[A-Za-z0-9_.-]`.
  - `storesFor(mode: DestinationMode, logger?): { serviceKeyStore: IServiceKeyStore; sessionStore: ISessionStore; urlKey: 'SAP_URL' | 'XSUAA_MCP_URL' }` where `DestinationMode = { kind: 'envFile'; path: string } | { kind: 'named'; name: string; keysDir: string; sessionsDir: string; unsafe: boolean }`.
  - `keyShapeOf(keysDir, name): 'abap' | 'xsuaa'`.

- [ ] **Step 1: Name tests** (Review Focus 1): each refused form throws naming its source; a valid name passes; no file system call happens for a refused name (spy on `fs`).
- [ ] **Step 2:** Implement; green.
- [ ] **Step 3: Composition tests, in temp directories**, observed through the stores' answers, never their fields:
  - an `--env` file stating `basic` → `getConnectionConfig('default')` answers its URL, user, password; `sessionStore` reads its `SAP_JWT_TOKEN` for a `jwt` / `none` file; a missing file → refused naming the parameter and the path (Review Focus 4).
  - named, ABAP key only → the key's URL and client, `authType: 'jwt'`, `grantType: 'authorization_code'`.
  - named, ABAP key plus `sessions/X.env` overriding `SAP_CLIENT` → the file's client, the key's URL (field by field).
  - named, no key, `sessions/X.env` stating `snc` with `SAP_SNC_PARTNERNAME` → answered as `snc`.
  - named, XSUAA key plus `XSUAA_MCP_URL` → the URL from the file, the client from the key, `urlKey` `XSUAA_MCP_URL`; with `SAP_URL` set instead, no URL is answered (Review Focus 5's input, its refusal is Task 4's).
  - `unsafe: true` → a secret saved for X lands in `sessions/X.env`; `unsafe: false` → no file written.
  - `keyShapeOf`: root `url` + `clientid` + `clientsecret` → `xsuaa`; nested `uaa` → `abap`; no key → `abap`.
- [ ] **Step 4:** Implement `destinationStores.ts` per spec §3's table; green.
- [ ] **Step 5: `--env` write-back test** (H5): a renewed secret saved through the `envFile` mode's session store rewrites `SAP_JWT_TOKEN`, `SAP_EXPIRES_AT`, `SAP_REFRESH_TOKEN` and leaves every other line byte-for-byte (comments, order, means keys).
- [ ] **Step 6:** Prove load-bearing: swap the fallback order (key before file) — the field-by-field test fails; revert. Commit (`feat(auth): destination stores per mode`) and push.

### Task 4: `AuthBrokerFactory`

**Files:**
- Rewrite: `src/lib/auth/brokerFactory.ts`, `src/lib/auth/IAuthBrokerFactoryConfig.ts`, `src/lib/auth/IAuthBrokerFactory.ts`
- Create: `src/lib/auth/countedProvider.ts`
- Modify: `src/lib/auth/index.ts` (exports: `AuthBrokerFactory`, `IAuthBrokerFactoryConfig`, `IDestinations`, `UnsupportedAuthenticationError`, `SettleReport`)
- Delete: `src/lib/auth/IBrokerSessionConfig.ts` (unused)
- Test: `src/__tests__/unit/auth/brokerFactory.test.ts`, `src/__tests__/unit/auth/countedProvider.test.ts`

**Interfaces:**
- Consumes: Task 2 (`vetMeans`, `handlerFor`, `LoginLock`, errors), Task 3 (`storesFor`, `assertDestinationName`, `keyShapeOf`).
- Produces:
  - `interface IDestinations { settingsFor(destination: string): Promise<SapConfig>; getProvider(destination: string): Promise<IAuthProvider> }`.
  - `class AuthBrokerFactory implements IDestinations { constructor(config: IAuthBrokerFactoryConfig); readonly defaultDestination: string | undefined; getBroker(d): Promise<AuthBroker>; settingsFor(d); getProvider(d); settle(deadlineMs: number): Promise<SettleReport> }`.
  - `IAuthBrokerFactoryConfig { envFilePath?; mcpDestination?; authBrokerPath?; unsafe: boolean; browser: string; browserAuthPort?: number; connectionType?: 'http' | 'rfc'; logger? }`.
  - `SettleReport { abandoned: number; notStored: string[] }` (`notStored`: the `AggregateError` entries, destination and class).
  - `describeAuthError(error: unknown): string | undefined` (spec §8) — `Destination "X" lacks: <fields>` for a `DestinationConfigError`, plus one fixed hint per field it knows (`grantType` → `mcp-auth generate-env --grant …` from `@mcp-abap-adt/auth-broker-cli`; `SAP_URL` / `XSUAA_MCP_URL` → set that key; `connection-type` → SNC needs `--connection-type=rfc`); `Destination "X" uses <type> / <grant>, which this server does not support` for `UnsupportedAuthenticationError`; `undefined` for anything else (the caller reports it as today).
  - `countedProvider(inner: IAuthProvider, gate: ProviderGate): IAuthProvider`; `class ProviderGate { close(): void; readonly closed: boolean; inFlight: number; drained(deadlineMs): Promise<number /* abandoned */> }`.

- [ ] **Step 1: Counted provider tests.** Each of the four calls is forwarded with its argument and its answer returned unchanged (Ok and Oops); a throw from the inner provider is not swallowed or altered (the wrapper adds nothing — the broker's provider already answers Oops); the in-flight count rises during a held call and falls when it answers; behind a closed gate each call answers `{ ok: false, refusal: { reason: 'the server is shutting down' } }` without calling the inner provider and without throwing; a call admitted before `close()` still completes and is counted down; `drained(deadline)` resolves when the count reaches zero, or at the deadline with the number still running.
- [ ] **Step 2:** Implement `countedProvider.ts`; green. Prove load-bearing: let a call pass a closed gate — the "never calls inner" test fails; revert.
- [ ] **Step 3: Factory tests, temp directories, with the broker observed through its public answers:**
  - `getBroker('X')` twice → one broker (constructor spy); two concurrent first calls → one broker (Review Focus 2: cache the promise).
  - three steps in order: a malformed `authType` / `grantType` → `DestinationConfigError`, no broker constructed; a well-formed unsupported one → `UnsupportedAuthenticationError`, no broker constructed; a supported one → a broker whose config has exactly `serviceKeyStore`, `sessionStore` and the handler's options.
  - `settingsFor`: `{ url, client, authType, connectionType }` with no `password`, token, cookies; no URL → `DestinationConfigError` naming `SAP_URL`, or `XSUAA_MCP_URL` for an XSUAA key (Review Focus 5); an SNC destination with `connectionType: 'http'` → refused naming `connection-type`.
  - `getProvider` returns the same counted object for every call on a destination.
  - `settle`: closes the gate before waiting (a `getProvider` call after `settle` starts gets a provider whose calls answer the shutdown refusal); waits for a held refresh, then calls `flush()` on every broker built, once each; reports `abandoned` at the deadline; reports `notStored` from a rejecting `flush()` with destination and class only.
  - `defaultDestination`: `--mcp=X` → `X`; an env file → `default`; neither → `undefined`.
- [ ] **Step 4:** Implement the factory (spec §3); green.
- [ ] **Step 5: Shutdown-refresh test at factory level** (spec §11): a provider refresh held open by the test while `settle(30_000)` runs → the refresh answers, `onTokens` reaches the session store, `settle` reports `abandoned: 0`; held past a short deadline → `abandoned: 1`. A request answered `401` after `settle` began → `rejected()` answers the shutdown refusal, the inner provider is never called, and nothing is written to the store after `flush()`.
- [ ] **Step 6: Message tests** for `describeAuthError`: each hint appears for its field and no other; a field without a known remedy gets the bare `lacks:` line; the output contains no value read from a store (feed a `DestinationConfigError` built by `vetMeans` from a made-up string and assert the string is absent).
- [ ] **Step 7:** Implement `describeAuthError` in `src/lib/auth/errors.ts`; green.
- [ ] **Step 8:** Prove load-bearing: wait before closing the gate — the `401`-after-shutdown test fails; revert. Commit (`feat(auth): AuthBrokerFactory on broker 4 — handlers, counted provider, settle`) and push.

### Task 5: Parameters in CLI, env and YAML

**Files:**
- Create: `src/lib/config/authParameters.ts`
- Modify: `src/lib/config/ArgumentsParser.ts`, `src/lib/config/yamlConfig.ts` (`YamlConfig`, mapping, `validateYamlConfig`, template), `src/lib/config/ServerConfigManager.ts` (help text; set `browser`), `src/lib/config/IServerConfig.ts`
- Delete: `buildRuntimeConfig` from `src/lib/config/runtimeConfig.ts` (and the file if nothing else remains), `server/src/AuthBrokerConfig.ts` (replaced by a direct `IServerConfig` → `IAuthBrokerFactoryConfig` mapping in the launcher, Task 7)
- Test: `src/__tests__/unit/config/authParameters.test.ts`

**Interfaces:**
- Produces: `AUTH_PARAMETERS: readonly { key: keyof IServerConfig; cli: string; env: string; yaml: string; kind: 'string' | 'flag' | 'port' | 'enum'; values?: readonly string[] }[]` — the eleven rows of spec §6; `readAuthParameters(argv, env, yaml): Partial<IServerConfig>`.

- [ ] **Step 1: Table tests.** For every row: the CLI form alone, the env form alone and the YAML form alone yield the same `IServerConfig` field; CLI beats env beats YAML when two or three are set; the generated `--config` template contains every row's YAML key; the help text names every row's CLI and env forms. `--browser` / `MCP_BROWSER` / `browser` reach `IServerConfig.browser` (today they reach nothing).
- [ ] **Step 2: Port tests** (Review Focus 3): `abc`, `0`, `70000`, `-1` in each form → refused at parse time naming the parameter in the form the user used; `61001` accepted; absent → `undefined` (the library default applies later).
- [ ] **Step 3: Enum tests:** `connection-type` accepts `http` / `rfc`, `system-type` `onprem` / `cloud` / `legacy`; anything else refused naming the parameter.
- [ ] **Step 4:** Run; fail. Implement `authParameters.ts` and make the parser, YAML loader, template and help read from it; remove `buildRuntimeConfig`; green.
- [ ] **Step 5:** Prove load-bearing: drop one row's YAML form — the parity test fails; revert. Commit (`feat(config): every auth and connection parameter in CLI, env and YAML`) and push.

### Task 6: `BaseMcpServer`, the transports, and the library surface

**Files:**
- Modify: `src/embeddable/BaseMcpServer.ts`, `src/embeddable/ConnectionContext.ts`, `src/embeddable/index.ts`
- Modify: `src/lib/utils.ts` (remove `registerAuthBroker`, `getAuthBroker`, `getConnectionForSession`, the `sessionContext` branch of `getManagedConnection`; keep the override paths and `getConfig()`; its `createAbapConnection` calls take `credentialFromSapConfig`)
- Modify: `server/src/StdioServer.ts`, `server/src/StreamableHttpServer.ts`, `server/src/SseServer.ts`
- Modify (move to the new API): `src/__tests__/lib/connectionAuthRouting.test.ts`, `src/__tests__/lib/certKerberosConfig.test.ts`, `src/__tests__/integration/helpers/sessionHelpers.ts`, `src/__tests__/integration/helpers/authHelpers.ts`, `src/__tests__/integration/globalSetup.ts`, `server/src/__tests__/healthEndpoint.test.ts`
- Test: `src/__tests__/unit/embeddable/connectionContext.test.ts` (new), `server/src/__tests__/destinationRouting.test.ts` (new)

**Interfaces:**
- Consumes: Task 1 (`createAbapConnection`, `credentialFromHeaders`, `credentialFromSapConfig`), Task 4 (`IDestinations`, `AuthBrokerFactory`, `describeAuthError` — the transports answer a failed destination with its text).
- Produces: `BaseMcpServer.setConnectionContext(destination: string, destinations: IDestinations): Promise<void>`; `ConnectionContext { connectionParams: SapConfig; credential: IAuthProvider; sessionId: string; metadata? }`.

- [ ] **Step 1: Context tests.** `setConnectionContext` with an `IDestinations` stub (no `getToken`, no `createTokenRefresher` anywhere) builds a context whose `credential` is the stub's provider and whose `connectionParams` holds no secret; `getConnection()` builds the connector with that credential and calls `connect()`; the master-system lookup's temporary connection uses the same credential. Headers: the context comes from `credentialFromHeaders`. Stdio reuses one connection; a second context (HTTP) builds a new connection with the same credential object.
- [ ] **Step 2:** Implement `BaseMcpServer` / `ConnectionContext`; green.
- [ ] **Step 3: Routing tests (server package)** with a stub factory: HTTP, a request whose destination fails with `UnsupportedAuthenticationError` answers an error carrying its words (destination, type, grant), and the next request, to a supported destination, succeeds (spec §11); a `DestinationConfigError` is answered with its fields, not "Auth broker not initialized"; `x-mcp-destination` is honoured only with `allowDestinationHeader`, and a path-like value is refused (Task 3's `assertDestinationName`); SSE the same per session.
- [ ] **Step 4:** Implement the transports against `AuthBrokerFactory` (no `getOrCreateAuthBroker`); keep the per-destination lock around the first connect; inspection-only stdio mode keeps its mock without the `getToken` stub.
- [ ] **Step 5:** Remove the `utils.ts` pieces; move the listed existing tests to the new API (their assertions keep their meaning: routing by system kind, certificate via `credentialFromSapConfig`). The integration helpers build a factory, not a hand-made `AuthorizationCodeProvider`.
- [ ] **Step 6: Provider-sources pin** (spec §11, H0): a test over the source tree — every call of `createAbapConnection` outside `connectionFactory.ts` passes a credential from `factory.getProvider`, `credentialFromHeaders` or `credentialFromSapConfig`. Prove load-bearing by adding a stray `new BasicAuthProvider` call site in a scratch edit; revert.
- [ ] **Step 7:** Commit (`feat(server): connections from getProvider through IDestinations`) and push. Build still red until Task 7.

### Task 6a: Configuration follow-up — secrets stay out of YAML

Added 2026-10-03 after the user's decision (goal: *Where things live*; spec §6). Runs after Task 6, before Task 7.

**Files:**
- Modify: `src/lib/config/authParameters.ts`, `src/lib/config/yamlConfig.ts`, `src/lib/config/ServerConfigManager.ts` (help)
- Test: `src/__tests__/unit/config/authParameters.test.ts`, `src/__tests__/unit/config/yamlSecrets.test.ts` (new)

- [ ] **Step 1: Tests.** The rows `--mcp`, `--env`, `--allow-destination-header` have no env form: setting `MCP_DESTINATION`, `MCP_ENV` or `MCP_ALLOW_DESTINATION_HEADER` changes nothing; the help names no such variable. YAML with a secret- or session-looking key at any depth (`password`, `sap-token`, nested `client_secret`, `Refresh_Token`, `cookie`, `passphrase`, `credential`) is refused naming the key; the value is absent from the message; an ordinary YAML file (the generated template) passes.
- [ ] **Step 2:** Run; fail. Remove the three env forms from the table; add the key check to YAML validation; green.
- [ ] **Step 3:** Prove load-bearing: drop the key check — the refusal test fails; revert. Commit (`fix(config): no new env forms; YAML refuses secret and session keys`) with `--no-verify` (red window), push.

### Task 7: The launcher, shutdown, and a green build

**Files:**
- Modify: `server/src/launcher.ts` (factory construction from `IServerConfig`; one destination for stdio; startup summary through `getConnectionConfig` / `getAuthorizationConfig`, mask unchanged; install shutdown)
- Delete: `server/src/AuthBrokerConfig.ts`; `src/lib/config/ConfigLoader.ts` and its export (spec §6), trimming `src/lib/config/README.md`
- Modify: `src/lib/auth/IAuthBrokerFactoryConfig.ts` — `envFilePath?` + `envFileSource?` become one `envFile?: { path: string; source: string }`, no default (controller ruling 6); the launcher passes the source as the user gave it
- Create: `server/src/shutdown.ts`
- Test: `server/src/__tests__/shutdown.test.ts`, `server/src/__tests__/launcherDestination.test.ts`

**Interfaces:**
- Consumes: Task 4 (`AuthBrokerFactory.settle`, `defaultDestination`), Task 5 (`IServerConfig` fields).
- Produces: `installShutdown({ factory, servers: Array<{ close(): Promise<void> | void }>, onStdinEnd?: boolean, exit: (code: number) => void, stderr: (line: string) => void, processLike: EventEmitter }): () => Promise<void>`.

- [ ] **Step 1: Shutdown tests** with a fake process emitter and a stub factory: `SIGTERM`, `SIGINT` and stdin end each run the sequence; two triggers run it once and the second waits; order is `close()` on every server, then `settle(30_000)`, then exit; `settle` clean → exit `0`, nothing on stderr; `notStored` → one stderr line per destination (`[MCP] Session secrets not stored: "X": StorageError`), exit `1`; `abandoned: 1` → its line, exit `1`; nothing is written to stdout in any case (spy on `process.stdout.write`).
- [ ] **Step 2:** Implement `shutdown.ts`; green. Prove load-bearing: drop the once-guard — the double-trigger test fails; revert.
- [ ] **Step 3: Launcher tests:** `--browser=<name>` (and `MCP_BROWSER`, and YAML `browser`) reaches the factory config and from there the `authorization_code` handler's strategy (observe the browser name the injected strategy factory receives); `--mcp=X` under stdio constructs one broker for `X` (no `'default'` broker beside it); an `--env` file → destination `default`; a factory error at startup (a malformed destination) prints its words to stderr and exits non-zero before any transport starts; the startup summary for a basic destination prints the masked password exactly as today.
- [ ] **Step 4:** Implement the launcher changes and install the shutdown for every transport.
- [ ] **Step 5: The server's tests join CI.** Today neither workflow runs them: the root Jest's `roots` are `src` and `compact*`, so `server/src/__tests__` (the existing `healthEndpoint.test.ts` included) never runs in CI. Add `server/tsconfig.test.json` (the server's sources plus its `__tests__`, `noEmit`, as the root's `tsconfig.test.json` does), a `test:check` script in `server/package.json`, and to both `.github/workflows/ci.yml` and `release.yml`, after the root test steps: `npm --prefix server run test:check` and `npm --prefix server test`. Prove they gate: a deliberately failing assertion in `shutdown.test.ts` turns the server test step red locally; revert.
- [ ] **Step 6: Green gate:** `npm run build`, `npm run test:check`, `npm run lint:check`, `npm test`, `npm --prefix server run test:check`, `npm --prefix server test` — all pass in the worktree. Fix what is left of the red window here, nowhere else.
- [ ] **Step 7:** Commit (`feat(server): one destination per process, shutdown settles and flushes; server tests in CI`) and push.

### Task 8: Documentation, versions, changelog

**Files:**
- Modify: `README.md`, `docs/user-guide/AUTHENTICATION.md`, `docs/user-guide/CLI_OPTIONS.md`, `docs/user-guide/CLIENT_CONFIGURATION.md`, `docs/user-guide/TERMINOLOGY.md`, `docs/configuration/YAML_CONFIG.md`, `docs/installation/INSTALLATION.md`, `docs/installation/README.md`, `docs/installation/CLINE_CONFIGURATION.md`, `docs/installation/examples/SERVICE_KEY_SETUP.md`, `docs/installation/RFC_SETUP.md`, `docs/architecture/ARCHITECTURE.md`, `docs/architecture/CONNECTION_ISOLATION.md`, `src/lib/auth/brokerFactory/UNIFIED_BROKER_LOGIC.md`, `src/embeddable/docs/*.md`, `CHANGELOG.md`
- Create: `docs/MIGRATION-16.0.md`
- Modify: the five `package.json` versions → `16.0.0`, and `lib` ranges in `server` / `compact*` → `^16.0.0`; `server.json` / `server-compact.json` if they carry the version

- [ ] **Step 1:** Each doc per spec §9: the four supported authentications with their `.env` keys (an SNC `.env` has no user or password), `mcp-auth` from `@mcp-abap-adt/auth-broker-cli`, the parameter table, port `61001`, `XSUAA_MCP_URL`, the `--env` write-back, `sap-rfc-lite` as an optional dependency. Remove the stale `npm install -g @mcp-abap-adt/auth-broker` and the 5000/4000/4001 defaults wherever they occur (grep the tree, in-code help included).
- [ ] **Step 2:** `docs/MIGRATION-16.0.md` with every item of spec §9's list; `CHANGELOG.md` 16.0.0 entry with *Breaking* first, linking the migration note.
- [ ] **Step 3:** Versions and ranges; `npm install`; lockfile check as in Task 1.
- [ ] **Step 4: Working documents never ship.** `package.json`'s `files` lists `docs/` whole, and a root `.npmignore` does not override `files`, so today's tarball carries every file under `docs/superpowers/` — this PR's three and an unrelated `plans/compact-package.md`. Add `"!docs/superpowers/"` to `files`; `npm pack --dry-run --json` lists no path containing `docs/superpowers` while the files are still in the tree. The same check for `server/`, `compact*` if their `files` reach `docs/`.
- [ ] **Step 5: Checks:** `grep -rn` for `getOrCreateAuthBroker`, `createTokenRefresher`, `initializeDefaultBroker`, `registerAuthBroker`, `connection_config`, `npm install -g @mcp-abap-adt/auth-broker` over `docs/`, `README.md`, `src/`, `server/src/`, excluding `docs/superpowers/` (the working documents name them on purpose) — none left outside the changelog, the migration note, and test files that assert their absence (a negative assertion such as "the schema has no `connection_config`" names it by necessity; each such hit is a `not`/absence assertion, checked by eye); `toolDescriptionsCarryNoLiterals.test.ts` green; full gate of Task 7 Step 6 green.
- [ ] **Step 6:** Commit (`docs: 16.0.0 — authentication on broker 4, migration note`) and push.

### Task 9: Release gate in the worktree

- [ ] **Step 1:** `npm run build`, `npm run test:check`, `npm run lint:check`, `npm test`, `npm --prefix server run test:check`, `npm --prefix server test`; record the counts in the PR.
- [ ] **Step 2:** Pack the five packages; `binSmoke.test.ts` against the packed tarballs (repository rule: a release is verified when an installed copy runs); `npm pack --dry-run --json` lists no `docs/superpowers` path (the exclusion of Task 8 Step 4, which holds whether or not the files are still in the tree). Repeated after Task 11's deletion, below.
- [ ] **Step 3:** Update the PR description: stages, the gate's results.

### Task 10: Live checks (H8)

Run with the built server from the worktree, after Task 9; each result recorded in the PR with platform and date, never a system id.

- [ ] **Step 1:** `basic` over HTTP, on premise — an `.env` file; a read tool answers.
- [ ] **Step 2:** `basic` over RFC, on premise — the same with `--connection-type=rfc` (RFC SDK: `SAPNWRFC_HOME`, `sap-rfc-lite` built in the worktree).
- [ ] **Step 3:** **Ask the user which browser and profile, and wait for "ready".** Then `jwt` / `authorization_code`, BTP ABAP environment — a service key, `--unsafe`; replace the stored token with an invalid one; a read tool answers after the `401` and the renewal; `sessions/<dest>.env` holds the new token with `SAP_ISSUED_FOR` / `SAP_ISSUED_BY`. Then `SIGTERM` the process: exit `0`.
- [ ] **Step 4:** `snc` over RFC — the user runs it on the Windows machine with the Secure Login Client; the PR records what they report.

### Task 11: Before merge

- [ ] **Step 1:** External review of the whole branch; fixes pushed to the PR.
- [ ] **Step 2:** Delete `docs/superpowers/2026-10-03-broker4-migration-goal.md`, `docs/superpowers/specs/2026-10-03-broker4-migration-design.md` and this plan; anything they still owe the future (certificates from both sides; proxy and calm decide their own scope) goes into the PR description first.
- [ ] **Step 3:** After the deletion, rerun Task 9 (build, tests, pack, bin smoke) on the final head; the packed file lists match Task 9's except for nothing under `docs/superpowers`.
- [ ] **Step 4:** Merge and tag only on the user's word; the user publishes.
