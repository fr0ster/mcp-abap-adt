# Unified AuthBroker Creation Logic

How `AuthBrokerFactory` (`src/lib/auth/brokerFactory.ts`) builds a destination's broker and
credential, and which destination a request is served from. The server's connections come from
`IDestinations`: `settingsFor(destination)` and `getProvider(destination)`. Nothing reads a token
before connecting: the provider is the credential, and it renews itself.

## Principles

1. **One broker per destination**, built on first use and cached (a failed build is dropped, so the
   next request tries again). Two requests to the same new destination at once build one broker.
2. **One provider per destination**, handed out *counted*: the factory knows how many provider
   calls are in flight, so shutdown can wait for them. A consumer that connects uses
   `factory.getProvider`, never the broker's own `getProvider`.
3. **The destination states its authentication.** The service key store answers the *means*
   (`authType`, `grantType`, URL, client); the session store holds the *secret* alone. The factory
   checks them against the vocabulary and picks one of the four handlers.
4. **Four authentications, exactly**: `basic` (HTTP or RFC), `snc` (RFC only), `jwt` /
   `authorization_code` (browser login), `jwt` / `none` (a token you hold). Anything else is
   refused with `Destination "X" uses <type> / <grant>, which this server does not support`.
5. **A destination is read once per process.** Nothing watches the files; a `.env` change from
   outside takes effect on restart.

## The default destination

`defaultDestination = --mcp ?? ('default' when an env file was chosen) ?? none`.

An env file is chosen by `--env-path` / `MCP_ENV_PATH` / `--env` (or their YAML keys) only: nothing
is looked up in the working directory. The factory is built once, in the launcher.

## Where a destination lives (`src/lib/auth/destinationStores.ts`)

| Mode | Means (service key store) | Secret (session store) |
|------|---------------------------|------------------------|
| **Env file** (`--env`, `--env-path`, `MCP_ENV_PATH`) | that file | that file, **written back** with a renewed token, whatever `--unsafe` says |
| **Named, ABAP key** (`--mcp=X`, `x-mcp-destination: X`) | `sessions/X.env` over `service-keys/X.json`, field by field | `sessions/X.env` with `--unsafe`, else in memory |
| **Named, XSUAA key** (root `url`, `clientid`, `clientsecret`, no `uaa`) | the same, with the system's URL from `XSUAA_MCP_URL` in `sessions/X.env` only | the same |

A named destination's name becomes a file name, so it is vetted first (`destinationName.ts`): only
letters, digits, `_`, `.`, `-`; no separator, no `..`, no leading dot, not empty. A refusal names
the source (`--mcp`, `x-mcp-destination`, `destination`) and never quotes the name.

## Broker usage by transport

### stdio
- The launcher builds the factory, checks and summarises the default destination at startup (a
  destination that cannot be served stops the start, exit 1, with the error's own vetted words).
- One server instance for the process; its connection is built on the first tool call and kept.
- With no default destination the server starts in inspection-only mode: the tool list answers, a
  tool call needs a connection.

### Streamable HTTP and SSE
- Per request (HTTP) or per session (SSE), the destination is chosen in this order:
  1. `x-mcp-destination`, **only with `--allow-destination-header`**; a value that is not a plain
     destination name is refused (`400`), naming the header;
  2. `x-sap-url` with `x-sap-jwt-token`, or with `x-sap-login` and `x-sap-password`: a direct
     connection with a credential built from the headers; no broker;
  3. the default destination;
  4. otherwise `400`.
- The first connect of a destination runs inside a per-destination lock, so two first logins do
  not race for the callback port.

## Handlers (`src/lib/auth/handlers/`)

| Handler | `authType` / `grantType` | Needs | Adds |
|---------|-------------------------|-------|------|
| `basicHandler` | `basic` | user, password | -- |
| `sncHandler` | `snc` | `SAP_SNC_PARTNERNAME` | refuses settings whose `connection-type` is not `rfc` |
| `jwtAuthorizationCodeHandler` | `jwt` / `authorization_code` | a service key or `SAP_UAA_*` | the browser login (`authorization`), one login at a time, on the callback port (default `61001`) |
| `jwtNoneHandler` | `jwt` / `none` | `SAP_JWT_TOKEN` | -- |

The browser strategy is passed in by the launcher (`browserCallbackStrategy` from
`@mcp-abap-adt/auth-providers`); the library defaults to none.

## Shutdown

`factory.settle(30_000)`: closes the provider gate (a call that arrives later gets the shutdown
refusal), waits for the calls in flight up to the deadline, then `flush()`es every broker built. A
secret that could not be stored is reported as `"<destination>": <ErrorClass>`; the program then
exits `1` with one stderr line, never the secret.

## Examples

### stdio with `--mcp=trial`
- Default destination `trial`: `service-keys/trial.json` and `sessions/trial.env`, field by field.
- First tool call: connect, browser login if there is no valid session.

### stdio with `--env-path=./my.env`
- Default destination `default`, read from and written back to `./my.env`.

### HTTP with `--mcp=trial`, client sends no destination
- Served from `trial`.

### HTTP with `--mcp=trial --allow-destination-header`, client sends `x-mcp-destination: production`
- `production` is built on first use, beside `trial`; the request is served from it.

### HTTP without `--mcp` and without `.env`, client sends `x-sap-url` and a credential
- No broker: the connection is built from the headers.

### stdio without parameters and without `.env`
- Inspection-only mode.
