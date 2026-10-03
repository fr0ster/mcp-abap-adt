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

**If you used another authentication, there is no replacement in this server.** A destination that
states `saml`, `certificate`, `kerberos`, or a `jwt` grant other than `authorization_code` and `none`
(`client_credentials`, `passcode`, the OIDC and SAML grants) is refused at startup:
`Destination "X" uses <type> / <grant>, which this server does not support`. The libraries know
some of them; the server does not serve them.

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
5. **An `--env` / `--env-path` / working-directory `.env` is now written back** with a renewed token,
   whatever `--unsafe` says (only the secret keys are rewritten). Keep that file somewhere the server
   may write, and out of version control. Named destinations behave as before: the session is on disk
   only with `--unsafe`, otherwise in memory.
6. **A changed `.env` takes effect on restart.** A destination is read once per process, and nothing
   watches the files: a new password, or a token you hand over again, needs a restart.
7. **`AUTH_BROKER_PATH` / `--auth-broker-path` is one base directory.** The server reads
   `<base>/service-keys` and `<base>/sessions` of the *first* path only; the colon-separated list and
   the fallback to the working directory are gone.

## If you pass parameters

8. **The browser callback port is `61001` unless set** (`--browser-auth-port`, `MCP_BROWSER_AUTH_PORT`,
   YAML `browser-auth-port`). It was `5000` (HTTP), `4000` (SSE) and `4001` (stdio). Update a firewall
   rule, or a redirect URI registered with the identity provider.
9. **An invalid port, enum or flag value is refused at startup**, naming the parameter in the form you
   used (`Invalid --browser-auth-port: "abc". Must be a port between 1 and 65535`). `--connection-type`
   takes `http` or `rfc`, `--system-type` `onprem`, `cloud` or `legacy`; a flag takes `true` or `false`.
   Before, a bad value was ignored.
10. **A YAML key that looks like a secret is refused.** A key containing `password`, `passphrase`,
    `secret`, `token`, `cookie`, `refresh` or `credential`, at any depth, stops the start with an error
    naming the key (never a value). YAML holds configuration only; secrets and the session live in `.env`
    files and the environment. Move such values out of the file.
11. **The parameter forms.** Every parameter has a CLI form and a YAML key, and eight have an
    environment variable (`MCP_ENV_PATH`, `MCP_USE_AUTH_BROKER`, `AUTH_BROKER_PATH`, `MCP_UNSAFE`,
    `MCP_BROWSER`, `MCP_BROWSER_AUTH_PORT`, `SAP_CONNECTION_TYPE`, `SAP_SYSTEM_TYPE`). Precedence is CLI,
    then environment, then YAML. The table is in [CLI_OPTIONS.md](user-guide/CLI_OPTIONS.md).
    `MCP_DESTINATION`, `MCP_ENV` and `MCP_ALLOW_DESTINATION_HEADER` do **not** exist — and never did.
12. **Destination names are vetted.** A destination name (`--mcp`, `x-mcp-destination`) may use only
    letters, digits, `_`, `.` and `-`; no path separator, no `..`, no leading dot, not empty. It is a
    file name, so anything else is refused before a file is read.

## If you use HTTP or SSE

13. **`x-mcp-destination` is honoured only with `--allow-destination-header`**, as before, and a value
    that is not a plain name is refused with `400` naming the header.
14. **`x-sap-destination`, `x-sap-auth-type` and `x-sap-refresh-token` are no longer read.** A direct
    connection is `x-sap-url` (and `x-sap-client`) with `x-sap-jwt-token`, or with `x-sap-login` and
    `x-sap-password`. A token in a header is used as it is: the server cannot renew it, because it holds
    no client and no refresh token for it.
15. **No `x-sap-*` headers, no destination, no default** is answered `400`, as before.

## If you run in Docker

16. **`MCP_DESTINATION` was never read by the server.** The compose files and the docker READMEs
    documented it; it chose nothing. The real ways are `--mcp=<name>` in the container command, `mcp:
    <name>` in a YAML file passed with `--config`, or `x-mcp-destination` with `--allow-destination-header`
    (the Dockerfile's default command). The compose files now set `AUTH_BROKER_PATH=/app` (so the server
    reads `/app/service-keys` and `/app/sessions`) and a `command`. A browser login needs a browser and a
    reachable callback port, which a container has not: obtain the session outside it and mount `sessions/`.

## Other behaviour that changed

17. **Shutdown settles first.** On `SIGTERM`, `SIGINT` (and, for stdio, the end of stdin) the server stops
    accepting connections, waits up to 30 s for logins and refreshes in flight, and flushes every
    session. If a secret could not be stored, it exits `1` with one line on stderr naming the destination
    and the error class; never the secret. Nothing is written to stdout.
18. **Errors name fields.** `Destination "X" lacks: <fields>` followed by one hint where the server
    knows the remedy; `Destination "X" uses <type> / <grant>, which this server does not support`; `<parameter>:
    the file does not exist: <path>` for an env file you named (the server does not fall back to the working
    directory's `.env`). No message carries a value read from a file.
19. **`DeletePackageLow` lost `connection_config`.** The argument let a caller hand over a connection
    config to build a fresh connection for the deletion; a connection now comes from the destination
    alone. `force_new_connection` stays.
20. **`@mcp-abap-adt/sap-rfc-lite` stays an optional dependency.** RFC (and so SNC) needs it and the SAP NW
    RFC SDK; see [RFC_SETUP.md](installation/RFC_SETUP.md).

## If you embed `@mcp-abap-adt/lib` or `@mcp-abap-adt/core`

Public API removed in 16.0.0:

| was | now |
|---|---|
| `registerAuthBroker`, `getAuthBroker` (`lib/utils`) | gone: there is no global registry; a factory owns its brokers |
| `removeConnectionForSession`, `getConnectionForSession` (`lib/utils`) | gone: a connection belongs to the server instance that built it |
| `ConfigLoader`, `buildRuntimeConfig` (`lib/config`) | `ServerConfigManager` (CLI, environment and YAML in one table) |
| `AuthBrokerConfig` (`@mcp-abap-adt/core`) | gone: the launcher builds an `IAuthBrokerFactoryConfig` |
| `AuthBrokerFactory.initializeDefaultBroker`, `getOrCreateAuthBroker`, `getDefaultBroker`, `getAuthBroker`, `clear`; `IAuthBrokerFactory` with those two methods | `defaultDestination`, `getBroker(destination)`, `settingsFor(destination)`, `getProvider(destination)`, `settle(deadlineMs)`; `IDestinations` is `settingsFor` and `getProvider` |
| `IAuthBrokerFactoryConfig` with `transportType`, `defaultMcpDestination`, `envFilePath`, `useAuthBroker` | `envFile: { path, source }`, `mcpDestination`, `authBrokerPath`, `unsafe`, `browser`, `browserAuthPort`, `connectionType`, and a required **`browserStrategy`** (the library has no default; pass `browserCallbackStrategy` from `@mcp-abap-adt/auth-providers`) |
| `BaseMcpServer.setConnectionContext(destination, authBroker)` | `setConnectionContext(destination, destinations: IDestinations)` |
| `StdioServer`, `SseServer`, `StreamableHttpServer` taking an `AuthBroker` or a factory | they take `IDestinations` |
| `ConnectionContext` with `connectionParams` per authentication type | `connectionParams` holds the settings (no secret) and **`credential: IAuthProvider`** holds the credential |

Also: `@mcp-abap-adt/core` no longer depends on `@mcp-abap-adt/auth-broker`; a consumer that reads a token
from a broker uses the broker's own token API with a provider of its own. The new dependency ranges are
`auth-broker` ^4, `auth-providers` ^5.2.1, `auth-stores` ^3.2.0, `connection` ^10.0.3, `interfaces-auth` ^3,
`interfaces-auth-broker` ^1.1, `interfaces-auth-sap` ^2. A custom session store must implement the
`@mcp-abap-adt/interfaces-auth-broker` contract (the secret alone, with `issuedFor` and `issuedBy`).

An embedder that has its own credential passes it as `ConnectionContext.credential`; the server builds
nothing from `settings.authType`. See [UNIFIED_BROKER_LOGIC.md](../src/lib/auth/brokerFactory/UNIFIED_BROKER_LOGIC.md)
and [CONNECTION_ISOLATION.md](architecture/CONNECTION_ISOLATION.md).
