# Server on auth-broker 4 — goal and path

**Status:** draft goal, for review in this PR. The spec and then the plan come
next, in this PR. This file is the anchor: it says what they are for, and what
neither may trade away. If the spec or the plan needs to depart from anything
under *Holds throughout*, this file changes first — explicitly, in review.

## Goal

The server (`@mcp-abap-adt/lib` and the `server` package) takes the credential
for a destination from `@mcp-abap-adt/auth-broker` 4 —
`await broker.getProvider(destination)`, an `IAuthProvider` — and hands it to a
`@mcp-abap-adt/connection` 10 connector as it is. Basic over HTTP, basic over
RFC, every token grant, and SNC over RFC all reach the system through **one
code path**; renewing a token is the provider's business inside the
connector, not the server's.

Dependencies after the change: `auth-broker` ^4, `auth-providers` ^5,
`auth-stores` ^3.2.0 (from ^1 — two majors), `connection` ^10,
`interfaces-auth` ^3 (from ^2.1 — `IAuthProvider`, which broker 4,
connection 10, auth-providers 5 and auth-stores 3 all speak),
`interfaces-auth-broker` ^1.1.0, `interfaces-auth-sap` ^2. The floors are
where the secret binding lives: `issuedFor` / `issuedBy` need
`interfaces-auth-broker` 1.1.0 and auth-stores 3.1.0 (broker 4's migration
contract); 3.2.0 answers a client whenever a non-empty `uaaClientId` is
stated, which the XSUAA fallback below relies on.

**Success:**

- live, through the one code path: basic over HTTP and over RFC (on-premise),
  a token destination (`authorization_code`, BTP ABAP environment) whose token
  is renewed on a `401` inside the connector and found in the session store
  afterwards, and SNC over RFC (Windows, Secure Login Client);
- a token a provider obtained or renewed reaches the session store before the
  process exits (`flush()` on shutdown), proven by a test;
- `cloud-llm-hub`, which embeds `EmbeddableMcpServer` and builds its own
  connection, needs no change to keep working.

## What changes

- **One path to a connector.** A connection is the connector the system kind
  selects, built from the connection settings (URL, client, connection type),
  the credential, and a transport. The credential is an `IAuthProvider`:
  `broker.getProvider(destination)` for a destination; for credentials that
  arrive in `x-sap-*` request headers, a provider the server builds itself
  (`BasicAuthProvider`, `TokenAuthProvider.fixed`) and hands to the same
  construction. Removed: the `getToken` before connecting, the
  `tokenRefresher` and `createTokenRefresher` calls (`BaseMcpServer.ts`,
  `utils.ts`), the per-auth-type `connectionParams` in
  `setConnectionContext`, and the `getManagedConnection` branch that reads a
  `sessionContext` nothing ever sets.
- **One broker per destination.** Today `--mcp=X` builds two brokers over the
  same stores (`'default'` and `'X'`); it builds one.
- **Grants (decided 2026-10-03).** Every grant broker 4 knows except
  `saml2_pure`: `basic`; `jwt` with `authorization_code`,
  `client_credentials`, `passcode`, `oidc_authorization_code`, `device_code`,
  `password`, `token_exchange`, `none`; `saml` with `saml2_bearer`, `none`;
  `snc`. `saml2_pure` needs the server to deliver a SAMLResponse to the
  system's ACS — unmeasured, and tied to cookie renewal (auth-broker PR #42,
  owed item 3); a `saml2_pure` destination is refused with words naming it.
- **Broker construction passes every collaborator** the grants above need:
  `authorization` → `browserCallbackStrategy({ browser, port })`;
  `oidcAuthorization` → `oidcCallbackStrategy`; `deviceCodePresenter` → one
  that writes to the logger, else stderr; `assertionReplayStore` → an
  in-memory store. No `samlCookies` (no `saml2_pure`), no `provider`.
- **`--grant` (decided 2026-10-03).** A service-key destination states no
  grant; the server states it to the key store
  (`AbapServiceKeyStore(dir, { grantType })`,
  `XsuaaServiceKeyStore(dir, { grantType })`). `--grant`, `MCP_GRANT`, and
  `grant` in YAML; default `authorization_code`, today's behaviour. It applies
  to service-key destinations only — an `--env` file states its own
  `SAP_GRANT_TYPE`. The broker judges the value: one it does not allow is a
  `DestinationConfigError` naming the field.
- **Stores move to auth-stores 3 constructors.**
  - ABAP service key (`uaa` nested): `AbapServiceKeyStore(dir, { grantType })`.
  - XSUAA service key (`url`, `clientid`, `clientsecret` at the root) — kept,
    it is in use (decided 2026-10-03), and made to work: today its session
    store is built with an empty system URL. The system URL is means, stated in
    `sessions/<dest>.env` (`XSUAA_MCP_URL` or `SAP_URL`) through an
    `EnvDestinationStore` whose `fallback` is the XSUAA key store, which
    supplies the client. Without a URL the destination is refused, naming the
    field.
  - `--env` / `--env-path` file, and the `.env` in the working directory:
    `EnvDestinationStore`. A `jwt` / `saml` file without `SAP_GRANT_TYPE` is
    refused, naming the field and the command that regenerates the file
    (`mcp-auth generate-env --grant …`). No support for files written for the
    old stores (decided 2026-10-02: a change of authorization regenerates the
    file).
  - No session seeding from service keys. The safe (in-memory) session stores
    stay the default; `--unsafe` keeps the file-backed ones.
- **SNC.** A destination stating `authType: snc` and its SNC fields gets
  `SncLogonProvider` from the broker. SNC protects RFC, not HTTP: an SNC
  destination on an HTTP connection is refused, naming `connection-type`.
- **Every auth and connection parameter in CLI, env and YAML.** Today YAML
  lacks `browser`, `browser-auth-port` and `connection-type`, and `--browser` /
  `MCP_BROWSER` is parsed but never reaches the broker. After the change each
  parameter — old and new — exists in all three forms with one precedence
  (CLI over env over YAML), the template `--config` generates lists them, and
  `--browser` reaches the strategy.
- **Shutdown flushes.** Nothing handles `SIGTERM`, `SIGINT` or stdin closing
  today. The server calls `flush()` on every broker it built on those, and
  before a stdio transport closes.
- **Imports.** The moved store types come from `interfaces-auth-broker`; the
  credentials from `auth-providers`, not `connection`.
- **Docs.** `README.md`, `docs/user-guide/AUTHENTICATION.md`,
  `CLI_OPTIONS.md`, `CLIENT_CONFIGURATION.md`, `docs/configuration/YAML_CONFIG.md`,
  `docs/installation/*` (install `@mcp-abap-adt/auth-broker-cli` for
  `mcp-auth`), `RFC_SETUP.md` (SNC; `sap-rfc-lite` is an optional dependency,
  not "undeclared"), the in-code help (`utils.ts`, `launcher.ts`), and a
  migration note for what a user on the old contract must now do.
- **Release.** One release carrying this and the merged #264, #266, #267,
  #268. `@mcp-abap-adt/lib` changes public types (`BaseMcpServer`,
  `AuthBrokerFactory`, `ConnectionContext`) — a major.

## Holds throughout

0. **One connector construction; enumerated provider sources.** Every
   connection is built the same way: the connection settings, an
   `IAuthProvider`, a transport, into the connector the system kind selects.
   Where the provider comes from is a separate choice, and only these sources
   exist:
   - the broker, `getProvider(destination)`, for a destination;
   - the server, for credentials arriving in `x-sap-*` headers
     (`BasicAuthProvider`, `TokenAuthProvider.fixed`);
   - the caller's `SapConfig`, for the exported `setSapConfigOverride` path —
     kept unchanged in this release, client certificates included (see *Not
     in this release*).

   A new source is a change to this list, in review. Nothing that builds the
   connector branches on the auth type.
1. **The destination states; the server infers nothing** — no auth type from
   whether a user name is present, no grant from the shape of a key. What is
   not stated is refused, naming the field, before any request.
2. **No implicit defaults.** The server passes the broker every collaborator
   the enabled grants need; nothing relies on a library's fallback.
3. **Nothing writes to stdout.** Under the stdio transport stdout is protocol
   traffic; prompts (device code, browser URL) go to the logger, else stderr.
4. **No secret in a log line or an error message** — tokens, passwords, client
   secrets, cookies, SNC names.
5. **What a provider obtains or renews reaches the session store**, and is
   flushed before the process exits.
6. **The embedding surface `cloud-llm-hub` uses does not change:**
   `EmbeddableMcpServer`, `@mcp-abap-adt/lib/handlers`,
   `setSystemContext` / `getSystemContext` / `return_error` from
   `@mcp-abap-adt/lib/utils`, `@mcp-abap-adt/lib/request-context`.
7. **Every auth and connection parameter has a CLI, an env and a YAML form**,
   with one precedence.
8. **Measured:** the four live cases under *Success*, on real systems.

## Not in this release

- **Client certificates** (decided 2026-10-02: the next release, from both
  sides at once). Today the server's `certificate` path is unreachable —
  `setConnectionContext` turns every non-basic type into `jwt` — and
  `cloud-llm-hub` does not use it. It stays as it is here: `createAbapConnection`
  keeps building `CertificateAuthProvider` for the exported
  `setSapConfigOverride` path, importing it from `auth-providers`. Next
  release: the fields in a contract, the stores, the broker and a Keycloak
  mTLS stand (auth-broker PR #42, owed item 4), and the server reaching it
  through `getProvider`. It is also the passwordless HTTP path: Secure Login
  Client issues X.509 certificates. `kerberos` stays as it is too.
- `saml2_pure` and renewing SAML cookies without the user (owed item 3).
- `mcp-abap-adt-proxy` and `mcp-calm-server` (owed item 2).
- `scripts/*.ts`, which import `createAbapConnection` from `connection` — gone
  since connection 6, broken before this change.

## Open, for the spec

- The shape of `AuthBrokerFactory` after the change: who owns the brokers,
  how HTTP and SSE (a server per request or session) reuse a destination's
  broker and provider, and where `flush()` is called from.
- Shutdown: what the process does when `flush()` reports a secret it could not
  store — exit code, message.
- Package versions of `lib`, `server`, and the `compact*` packages that depend
  on `lib`.
- Tests: nothing unit-tests `AuthBrokerFactory`, the store factory or
  `setConnectionContext` today; which tests protect each invariant above, and
  where the live checks run (a test states where it runs).

## Path

goal → user review → spec → user review → plan → user review →
implementation (TDD) → external review → live checks → merge → release.
The goal, spec and plan are deleted before the release.
