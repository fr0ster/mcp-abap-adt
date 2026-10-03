# Migrating to 16.0.0

One change: **authentication moved to `@mcp-abap-adt/auth-broker` 4, `@mcp-abap-adt/connection` 10,
`@mcp-abap-adt/auth-providers` 5 and `@mcp-abap-adt/auth-stores` 3**. The server asks the broker
for a destination's *credential* (`getProvider`) and gives it to the connector; it no longer reads a
token first and branches on the authentication type.

**If you only use the tools — read, create, update, activate and the rest — nothing changed in a
tool name, a parameter or an answer**, with one exception: `DeletePackageLow` lost its
`connection_config` argument (below). What changed is how a destination is stated, where its session
lives and which authentications the server serves. Go through the list that fits you.

All five packages (`lib`, `core`, `compact`, `compact-readonly`, `compact-modify`) are **16.0.0**.

## What the server supports now

Exactly four authentications. Every `.env` or service key states one.

| Authentication | `SAP_AUTH_TYPE` | `SAP_GRANT_TYPE` | Connection | Keys |
|---|---|---|---|---|
| Basic | `basic` | — | HTTP or RFC | `SAP_USERNAME`, `SAP_PASSWORD` |
| SNC | `snc` | — | RFC only | `SAP_SNC_PARTNERNAME`; optional `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME`; **no user, no password** |
| JWT, browser login | `jwt` | `authorization_code` | HTTP | a service key (ABAP or XSUAA), or `SAP_UAA_*` |
| JWT you hold | `jwt` | `none` | HTTP | `SAP_JWT_TOKEN`, or the `x-sap-jwt-token` header |

**If you used another authentication, this server has no replacement for it.** A destination that
states `certificate` or `kerberos`, or `saml`/`jwt` with a grant other than the ones above
(`client_credentials`, `passcode`, the OIDC and SAML grants), is refused at startup:
`Destination "X" uses <type> / <grant>, which this server does not support` (for `certificate` and
`kerberos`, which carry no grant, `Destination "X" uses certificate, which this server does not support`).
A `saml` destination that states no grant is refused with `lacks: grantType`, as a `jwt` one is. The libraries
know some of these; the server does not serve them. What to do instead:

- stay on 15.x for as long as you need the certificate, Kerberos, SAML or another grant;
- for passwordless logon to an on-premise system, use **SNC over RFC** (`snc`) in place of certificate or
  Kerberos single sign-on;
- obtain a token elsewhere (your own login, `mcp-auth`) and hand it over as `jwt` / `none`
  (`SAP_JWT_TOKEN`, or `x-sap-jwt-token`), renewing it yourself.

## If you start the server from a `.env` or a service key

1. **A `.env` states `SAP_AUTH_TYPE`.** There is no default any more: a `.env` with a user and a
   password but no type is refused with `Destination "X" lacks: authType`, and `SAP_JWT_TOKEN` alone no
   longer means `jwt`. Add `SAP_AUTH_TYPE=basic` (or `jwt`, `snc`).
2. **A `jwt` `.env` states `SAP_GRANT_TYPE`** (`authorization_code` or `none`). Without it the
   destination is refused: `Destination "X" lacks: grantType`, with a hint. Regenerate the file with
   `mcp-auth generate-env --grant <grant>`, or add the line by hand. A token you hand over yourself
   is `SAP_GRANT_TYPE=none`.
3. **Install `mcp-auth` from `@mcp-abap-adt/auth-broker-cli`**, not from `@mcp-abap-adt/auth-broker`
   (which has no `bin` any more):
   ```bash
   npm uninstall -g @mcp-abap-adt/auth-broker     # if you installed it for the command
   npm install -g @mcp-abap-adt/auth-broker-cli
   ```
4. **An XSUAA service key needs `XSUAA_MCP_URL`** in `sessions/<destination>.env`. The key carries the
   UAA, not the ABAP system; without the variable the destination is refused naming `XSUAA_MCP_URL`.
   Stating `SAP_URL` there does not help.
5. **An `--env` / `--env-path` `.env` is now written back** with a renewed token,
   whatever `--unsafe` says (only the secret keys are rewritten). Keep that file somewhere the server
   may write, and out of version control. Named destinations behave as before: the session is on disk
   only with `--unsafe`, otherwise in memory. That holds for reading too: a named `jwt` / `none`
   destination whose token is in `sessions/X.env` is refused without `--unsafe`
   (`Destination "X" lacks: authorizationToken`, with a hint). Add `--unsafe`, or serve the file with
   `--env=X` or `--env-path`.
6. **A `.env` in the working directory is no longer read.** Finding configuration where the process
   happens to start is a vulnerability: a server started inside someone else's project took their
   settings and credentials. Name the file: `--env-path=./.env` (or `--env=<name>` for
   `sessions/<name>.env`, `--mcp=<name>`, or YAML `env` / `env-path` / `mcp`). Without any of them there
   is no default destination: stdio runs inspection-only, HTTP/SSE answer a request without
   `x-sap-*` headers (or, with `--allow-destination-header`, `x-mcp-destination`) with `400`. The working
   directory is also gone from the stores' search list: `service-keys/` and `sessions/` are read from
   `--auth-broker-path` / `AUTH_BROKER_PATH` or the platform default only.
7. **`--auth-broker`, `MCP_USE_AUTH_BROKER` and YAML `auth-broker` are removed** — drop them from client
   configs. Their only purpose was to switch the working-directory `.env` off, and there is nothing left
   to switch. A leftover form is not a parameter any more and is silently ignored: the CLI flag, the
   environment variable and the YAML key change nothing and are not refused.
8. **A changed `.env` takes effect on restart.** A destination is read once per process, and nothing
   watches the files: a new password, or a token you hand over again, needs a restart.
9. **`AUTH_BROKER_PATH` / `--auth-broker-path` is one base directory.** The server reads
   `<base>/service-keys` and `<base>/sessions`; the value is not split, so a colon- or
   semicolon-separated list no longer names several directories, and the fallback to the working
   directory is gone.

## If you pass parameters

10. **The browser callback port is `61001` unless set** (`--browser-auth-port`, `MCP_BROWSER_AUTH_PORT`,
   YAML `browser-auth-port`). It was `5000` (HTTP), `4000` (SSE) and `4001` (stdio). Update a firewall
   rule, or a redirect URI registered with the identity provider.
11. **An invalid port, enum or flag value is refused at startup**, naming the parameter in the form you
   used (`Invalid --browser-auth-port: "abc". Must be a port between 1 and 65535`). `--connection-type`
   takes `http` or `rfc`, `--system-type` `onprem`, `cloud` or `legacy`; a flag takes `true` or `false`.
   Before, a bad value was ignored.
12. **A YAML key that looks like a secret is refused.** A key containing `password`, `passphrase`,
    `secret`, `token`, `cookie`, `refresh` or `credential`, at any depth, stops the start with an error
    naming the key (never a value). YAML holds configuration only; secrets and the session live in `.env`
    files and the environment. Move such values out of the file.
13. **The parameter forms.** Every parameter has a CLI form and a YAML key, and seven have an
    environment variable (`MCP_ENV_PATH`, `AUTH_BROKER_PATH`, `MCP_UNSAFE`,
    `MCP_BROWSER`, `MCP_BROWSER_AUTH_PORT`, `SAP_CONNECTION_TYPE`, `SAP_SYSTEM_TYPE`). Precedence is CLI,
    then environment, then YAML. The table is in [CLI_OPTIONS.md](user-guide/CLI_OPTIONS.md).
    `MCP_DESTINATION`, `MCP_ENV` and `MCP_ALLOW_DESTINATION_HEADER` do **not** exist — and never did.
14. **Destination names are vetted.** A destination name (`--mcp`, `x-mcp-destination`) may use only
    letters, digits, `_`, `.` and `-`; no path separator, no `..`, no leading dot, not empty. It is a
    file name, so anything else is refused before a file is read.

## If you use HTTP or SSE

15. **`x-mcp-destination` is honoured only with `--allow-destination-header`**, as before, and a value
    that is not a plain name is refused with `400` naming the header.
16. **`x-sap-destination`, `x-sap-auth-type` and `x-sap-refresh-token` are no longer read.** A direct
    connection is `x-sap-url` (and `x-sap-client`) with `x-sap-jwt-token`, or with `x-sap-login` and
    `x-sap-password`. A token in a header is used as it is: the server cannot renew it, because it holds
    no client and no refresh token for it.
17. **No `x-sap-*` headers, no destination, no default** is answered `400`, as before.

## If you run in Docker

18. **`MCP_DESTINATION` was never read by the server.** The compose files and the docker READMEs
    documented it; it chose nothing. The real ways are `--mcp=<name>` in the container command, `mcp:
    <name>` in a YAML file passed with `--config`, or `x-mcp-destination` with `--allow-destination-header`
    (the Dockerfile's default command). The compose files now set `AUTH_BROKER_PATH=/app` (so the server
    reads `/app/service-keys` and `/app/sessions`) and a `command`. A browser login needs a browser and a
    reachable callback port, which a container has not: obtain the session outside it and mount `sessions/`.

## Other behaviour that changed

19. **Shutdown settles first.** On `SIGTERM`, `SIGINT` (and, for stdio, the end of stdin) the server stops
    accepting connections, waits up to 30 s for logins and refreshes in flight, and flushes every
    session. It exits `1`, with one stderr line per fact, when a secret could not be stored (the line names the
    destination and the error class), a login or refresh was still running at the 30 s deadline, a server did not
    close, or settling itself failed; never a secret or an error's message. Nothing is written to stdout.
20. **Errors name fields.** `Destination "X" lacks: <fields>` followed by one hint where the server
    knows the remedy; `Destination "X" uses <type> / <grant>, which this server does not support`; `<parameter>:
    the file does not exist: <path>` for an env file you named. No message carries a value read from a file.
    Under HTTP and SSE a refused credential is answered with the provider's own fixed words (status `500`)
    instead of `Internal Server Error`.
21. **`DeletePackageLow` lost `connection_config`.** The argument let a caller hand over a connection
    config to build a fresh connection for the deletion; a connection now comes from the destination
    alone. `force_new_connection` stays.
22. **`@mcp-abap-adt/sap-rfc-lite` stays an optional dependency.** RFC (and so SNC) needs it and the SAP NW
    RFC SDK; see [RFC_SETUP.md](installation/RFC_SETUP.md).

23. **The master system is determined from configuration, or by a request in the cloud — nothing else.**
    The setup-time master-system lookup is gone: setting a destination's context up builds no connection.
    `SAP_MASTER_SYSTEM`, `SAP_RESPONSIBLE` (else `SAP_USERNAME`) are read from the configuration; for a
    cloud system the missing ones are asked of the system per call, on the connected connection. Whether a
    system is cloud is the kind its connection was built for (`SAP_SYSTEM_TYPE` / `--system-type`, else a
    `jwt` destination is cloud and any other on-premise) — no longer guessed from the URL
    (`*.hana.ondemand.com`, `http` with a port, else asking the system). On-premise nothing is asked: set
    `SAP_MASTER_SYSTEM`. A cloud destination without `SAP_CLIENT` uses the system's default client (the
    lookup no longer fills it in).

## If you embed `@mcp-abap-adt/lib` or `@mcp-abap-adt/core`

Public API removed in 16.0.0:

| was | now |
|---|---|
| `registerAuthBroker`, `getAuthBroker` (`lib/utils`) | gone: there is no global registry; a factory owns its brokers |
| `removeConnectionForSession`, `getConnectionForSession` (`lib/utils`) | gone: a connection belongs to the server instance that built it |
| `ConfigLoader`, `buildRuntimeConfig` (`lib/config`) | `ServerConfigManager` (CLI, environment and YAML in one table) |
| `AuthBrokerConfig` (`@mcp-abap-adt/core`) | gone: the launcher builds an `IAuthBrokerFactoryConfig` |
| `AuthBrokerFactory.initializeDefaultBroker`, `getOrCreateAuthBroker`, `getDefaultBroker`, `getAuthBroker`, `clear`; `IAuthBrokerFactory` with those two methods | `defaultDestination`, `getBroker(destination)`, `settingsFor(destination)`, `getProvider(destination)`, `settle(deadlineMs)`; `IDestinations` is `settingsFor` and `getProvider` |
| `IAuthBrokerFactoryConfig` with `transportType`, `defaultMcpDestination`, `envFilePath`, `useAuthBroker`; `IServerConfig.useAuthBroker` | `envFile: { path, source }`, `mcpDestination`, `authBrokerPath`, `unsafe`, `browser`, `browserAuthPort`, `connectionType`, and a required **`browserStrategy`** (the library has no default; pass `browserCallbackStrategy` from `@mcp-abap-adt/auth-providers`) |
| `BaseMcpServer.setConnectionContext(destination, authBroker)` | `setConnectionContext(destination, destinations: IDestinations)` |
| `StdioServer`, `SseServer`, `StreamableHttpServer` taking an `AuthBroker` or a factory | they take `IDestinations` |
| `ConnectionContext` with `connectionParams` per authentication type | `connectionParams` holds the settings (no secret) and **`credential: IAuthProvider`** holds the credential |

Also: `@mcp-abap-adt/core` no longer depends on `@mcp-abap-adt/auth-broker`; a consumer that reads a token
from a broker uses the broker's own token API with a provider of its own. The new dependency ranges are
`auth-broker` ^4, `auth-providers` ^5.2.1, `auth-stores` ^3.2.0, `connection` ^10.0.3, `interfaces-auth` ^3,
`interfaces-auth-broker` ^1.1, `interfaces-auth-sap` ^2. A custom session store must implement the
`@mcp-abap-adt/interfaces-auth-broker` contract (the secret alone, with `issuedFor` and `issuedBy`).

An embedder that has its own credential passes it as `ConnectionContext.credential`; the server builds
nothing from `settings.authType`.

`getPlatformPaths` no longer returns the working directory. `BaseMcpServer.setConnectionContext` builds no
connection and calls no `getSystemInformation`; the per-call resolver (`defaultSystemContextResolver`,
`resolveSystemContext`) asks the system only for a cloud connection — the kind the server's factory built
it for, or, for a connection you built yourself, `SAP_SYSTEM_TYPE` alone (on-premise when unset). An
embedder with its own cloud connection sets `SAP_SYSTEM_TYPE=cloud`, or passes a `systemContextResolver`. See [UNIFIED_BROKER_LOGIC.md](../src/lib/auth/brokerFactory/UNIFIED_BROKER_LOGIC.md)
and [CONNECTION_ISOLATION.md](architecture/CONNECTION_ISOLATION.md).
