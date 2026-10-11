# Unified AuthBroker Creation Logic

How `AuthBrokerFactory` (`server/src/auth/brokerFactory.ts`) builds a destination's broker and
credential, and which destination a request is served from. The server's connections come from
`IDestinations`: `settingsFor(destination)` and `getProvider(destination, { signal })`. Nothing
reads a token before connecting: the provider is the credential, and it renews itself, the way the
broker's `renewal` says.

## Principles

1. **One broker per destination**, built on first use and cached (a failed build is dropped, so the
   next request tries again). Two requests to the same new destination at once build one broker.
2. **The provider is asked of the broker on every call** — `getProvider(destination, { signal })`,
   the caller's signal releasing that caller alone — and handed out *counted*, one wrapper per
   inner provider (a `WeakMap`): the broker answers its cached provider while the destination is
   unchanged, so the same provider gets the same wrapper. The factory keeps no provider cache. The
   counted wrapper lets shutdown wait for the calls in flight. A consumer that connects uses
   `factory.getProvider`, never the broker's own `getProvider`.
3. **The destination states its authentication.** The service key store answers the *means*
   (`authType`, `grantType`, URL, client); the session store holds the *secret* alone. The factory
   checks them against the vocabulary and picks one of the four handlers.
4. **Four authentications, exactly**: `basic` (HTTP or RFC), `snc` (RFC only), `jwt` /
   `authorization_code` (browser login), `jwt` / `none` (a token you hold). Anything else is
   refused with `Destination "X" uses <type> / <grant>, which this server does not support`.
5. **A destination's settings are read once per process.** Nothing watches the files; a `.env`
   change from outside takes effect on restart. Editing a destination's files while the server
   runs is not supported and may combine old and new values until the next start.
6. **The options the server states for every broker**: `renewal` — `refreshThenLogin()`, or
   `refreshOnly()` under `--renewal=refresh-only`; `onWriteFailure` by the store — `'fail'` for the
   `--env` / `--env-path` file, `'continue'` for a named destination (in memory, or `sessions/`
   under `--unsafe`); `authDebug: false`. The handler adds its own (`authorization` for
   `jwt` / `authorization_code`).

## The default destination

`defaultDestination = --mcp ?? ('default' when an env file was chosen) ?? none`.

An env file is chosen by `--env-path` / `MCP_ENV_PATH` / `--env` (or their YAML keys) only: nothing
is looked up in the working directory. The factory is built once, in the launcher.

## Where a destination lives (`server/src/auth/destinationStores.ts`)

| Mode | Means (service key store) | Secret (session store) |
|------|---------------------------|------------------------|
| **Env file** (`--env`, `--env-path`, `MCP_ENV_PATH`) | that file | that file, **written back** with a renewed token, whatever `--unsafe` says |
| **Named, ABAP key** (`--mcp=X`, `x-mcp-destination: X`) | `sessions/X.env` over `service-keys/X.json`, field by field | `sessions/X.env` with `--unsafe`, else in memory |
| **Named, XSUAA key** (root `url`, `clientid`, `clientsecret`, no `uaa`) | the same, with the system's URL from `XSUAA_MCP_URL` in `sessions/X.env` only | the same |

A named destination's name becomes a file name, so it is vetted first (`src/lib/auth/destinationName.ts`): only
letters, digits, `_`, `.`, `-`; no separator, no `..`, no leading dot, not empty. A refusal names
the source (`--mcp`, `x-mcp-destination`, `destination`) and never quotes the name.

## Broker usage by transport

### stdio
- The launcher builds the factory, checks and summarises the default destination at startup: it
  reads the settings and builds the provider — `getProvider(destination, { signal })` with the
  start's own signal, aborted once the check ends; building sends nothing — so a destination
  the broker refuses stops the start, exit 1, with the error's own vetted words.
- One server instance for the process; its source is the destination (`destinationSource`). Its
  connection is built on the first tool call and kept while `getProvider` answers the same
  provider; a new provider builds a new connection (D13).
- With no default destination the server starts in inspection-only mode: the tool list answers, and
  a tool call answers the server's own `inspection_only` refusal before any connection is built.

### Streamable HTTP and SSE
- Not served here. `@mcp-abap-adt/http` and `@mcp-abap-adt/sse` take credentials only from the
  request's `x-sap-*` headers (lib's `headerSource`) and use no broker, no store and no
  destination; a request carrying `x-mcp-destination` is answered `400`.

## Handlers (`server/src/auth/handlers/`)

| Handler | `authType` / `grantType` | Needs | Adds |
|---------|-------------------------|-------|------|
| `basicHandler` | `basic` | user, password | -- |
| `sncHandler` | `snc` | `SAP_SNC_PARTNERNAME` | refuses settings whose `connection-type` is not `rfc` |
| `jwtAuthorizationCodeHandler` | `jwt` / `authorization_code` | a service key or `SAP_UAA_*` | the browser login (`authorization`): `serverLogin(browserCallbackStrategy({ browser, port }), …)`, on the callback port (default `61001`) |
| `jwtNoneHandler` | `jwt` / `none` | `SAP_JWT_TOKEN` | -- |

The browser strategy is passed in by the launcher (`browserCallbackStrategy` from
`@mcp-abap-adt/auth-providers`); the factory defaults to none. The browser is an `IBrowser`, mapped
from `--browser` / `--browser-program` by `browserFor` (`server/src/auth/browser.ts`); none means
the URL is shown on stderr. `serverLogin` (`server/src/auth/serverLogin.ts`) passes each login
request on with its own `signal` and the prompt logger (`info` on stderr), forwards `dispose()`,
and is recorded so `settle` disposes it. One destination per process: the provider serializes its
own logins, so there is no login lock; the composed strategy settles only after its listener is
closed, so the callback port is free when a login ends.

## Shutdown

`factory.settle(30_000, { signal })`: closes the provider gate (a call that arrives later gets the
shutdown refusal — auth-errors' `interactive-login` `aborted`, minted), disposes every login
strategy it composed, waits for the calls in flight up to the deadline, then
`flush({ signal })`es every broker built. A secret that could not be stored is reported as
`"<destination>": <reason>`, the reason `classify(entry, 'persisting-tokens').reason`; the program
then exits `1` with one stderr line, never the secret.

## Examples

### stdio with `--mcp=trial`
- Default destination `trial`: `service-keys/trial.json` and `sessions/trial.env`, field by field.
- First tool call: connect, browser login if there is no valid session.

### stdio with `--env-path=./my.env`
- Default destination `default`, read from and written back to `./my.env`.

### `mcp-abap-adt --transport=http` (or `sse`)
- Refused at start, naming `mcp-abap-adt-http` (`mcp-abap-adt-sse`): core serves stdio only.

### stdio without parameters and without `.env`
- Inspection-only mode: a tool call answers `inspection_only`.
