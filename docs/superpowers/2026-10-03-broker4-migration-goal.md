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
RFC, a token, and SNC over RFC all reach the system through **one code path**;
renewing a token is the provider's business inside the connector, not the
server's.

**Scope is what the server connects to, not what the broker can do**
(decided 2026-10-03). The systems this server serves authorize with basic, a
JWT, or SNC — nothing else is in view. So the server supports exactly four:

| Destination states | Comes from | The server supplies |
|---|---|---|
| `basic`, over HTTP or RFC | an `.env` file; `x-sap-login` / `x-sap-password` | nothing for a file — the broker builds it; for the headers, `BasicAuthProvider` |
| `snc`, over RFC | an `.env` file with `SAP_SNC_*` | nothing; an HTTP connection is refused |
| `jwt` / `authorization_code` | an ABAP or XSUAA service key, an `.env` file | the browser strategy (`--browser`, `--browser-auth-port`) |
| `jwt` / `none` | a token in an `.env` file; `x-sap-jwt-token` | nothing for a file; for the header, `TokenAuthProvider.fixed` |

**The table is checked when a destination's server is set up** (decided
2026-10-03). A destination is a name for a configuration, and its
authentication is a property of that configuration, known before anything
connects. MCP builds a server per session, one destination each: under stdio
once, at start; under SSE per session; under HTTP per request, the
destination named by `x-mcp-destination` or the default. Setting that server
up reads the destination and checks what it states against the table; a
destination stating anything else gets an error naming the type and grant it
states, before any connection or login. That request fails; no other session
is touched. Adding an authentication is a row here and its collaborator — not
a refusal at login.

This is **this server's** choice, not a rule for the family. When an ABAP
system the server must reach authorizes another way, that way is added here
— a row in the table and whatever collaborator it needs — in its own change.
The proxy and calm-server have requirements of their own and decide their
scope themselves; nothing here binds them.

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
- **Broker construction passes the one collaborator the four need:**
  `authorization` → `browserCallbackStrategy({ browser, port })`, for
  `authorization_code`. No `provider`, and none of the options of the grants
  out of scope.
- **A service key's grant is `authorization_code`.** A SAP service key states
  no grant; the server states it to the key store
  (`AbapServiceKeyStore(dir, { grantType: 'authorization_code' })`,
  likewise `XsuaaServiceKeyStore`) — today's behaviour, now said instead of
  assumed. No option changes it.
- **Stores move to auth-stores 3 constructors.**
  - ABAP service key (`uaa` nested): `AbapServiceKeyStore` as above.
  - XSUAA service key (`url`, `clientid`, `clientsecret` at the root) — kept,
    it is in use (decided 2026-10-03), and made to work: today its session
    store is built with an empty system URL. The system URL is means, stated in
    `sessions/<dest>.env` (`XSUAA_MCP_URL`) through an
    `EnvDestinationStore` whose `fallback` is the XSUAA key store, which
    supplies the client. Without a URL the destination is refused, naming the
    field.
  - `--env` / `--env-path` file, and the `.env` in the working directory:
    `EnvDestinationStore`. A `jwt` file without `SAP_GRANT_TYPE` is refused,
    naming the field and the command that regenerates the file
    (`mcp-auth generate-env --grant …`). No support for files written for the
    old stores (decided 2026-10-02: a change of authorization regenerates the
    file).
  - No session seeding from service keys. For named destinations the safe
    (in-memory) session stores stay the default and `--unsafe` keeps the
    file-backed ones. An `--env` file is the user's own store: its secret is
    read from it and a renewed one written back to it (auth-stores 3's
    `EnvFileSessionStore`), whatever `--unsafe` says — today the server never
    writes it.
- **SNC.** A destination stating `authType: snc` and its SNC fields gets
  `SncLogonProvider` from the broker. SNC protects RFC, not HTTP: an SNC
  destination on an HTTP connection is refused, naming `connection-type`.
- **Every existing auth and connection parameter in CLI, env and YAML.**
  Today YAML lacks `browser`, `browser-auth-port` and `connection-type`, and
  `--browser` / `MCP_BROWSER` is parsed but never reaches the broker. After
  the change each parameter exists in all three forms with one precedence
  (CLI over env over YAML), the template `--config` generates lists them, and
  `--browser` reaches the strategy. No new parameter is added.
- **`DeletePackage` loses `connection_config`.** The argument takes a whole
  `SapConfig` — URL and credentials — from the tool call: a provider source
  outside H0's list, aimed by the model. A fresh session opens from the
  current connection's settings and provider instead.
- **The login callback port** defaults to auth-providers' `61001` instead of
  a random port in 30000–39999, which no identity provider could have
  registered as a redirect URI.
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
2. **No implicit defaults.** The server passes the broker the collaborator
   the four need; nothing relies on a library's fallback.
3. **Nothing writes to stdout.** Under the stdio transport stdout is protocol
   traffic; a prompt (the browser URL) goes to the logger, else stderr.
4. **No secret in a log line or an error message** — tokens, passwords, client
   secrets, cookies, SNC names. One deliberate exception (decided
   2026-10-03): the auth summary printed at startup to stderr shows a value
   longer than 20 characters as its first and last 4 (`abcd***wxyz`), so a
   user can tell the right key was picked; a shorter value is masked whole.
   It stays as it is.
5. **What a provider obtains or renews reaches the session store**, and is
   flushed before the process exits.
6. **The embedding surface `cloud-llm-hub` uses does not change:**
   `EmbeddableMcpServer`, `@mcp-abap-adt/lib/handlers`,
   `setSystemContext` / `getSystemContext` / `return_error` from
   `@mcp-abap-adt/lib/utils`, `@mcp-abap-adt/lib/request-context`.
7. **Every existing auth and connection parameter has a CLI, an env and a
   YAML form**, with one precedence.
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
- Every grant but `authorization_code` and `none`, and `saml` destinations:
  OIDC, device code, password, token exchange, client credentials, passcode,
  `saml2_bearer`, `saml2_pure` — no system the server serves uses them. A
  `--grant` option for service keys goes with them (proposed, then dropped,
  2026-10-03).
- Renewing SAML cookies without the user (owed item 3).
- `mcp-abap-adt-proxy` and `mcp-calm-server` (owed item 2): out of scope,
  with requirements of their own — this goal's scope does not carry over to
  them.
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
