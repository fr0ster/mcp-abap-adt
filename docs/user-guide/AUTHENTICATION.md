# Authentication & Destinations

The server supports **four authentications**. Every one of them is a *destination*: a system
URL plus how to log on to it, kept in a service key, a `.env` file, or both. Anything else a
`.env` or a service key states is refused at startup: `Destination "X" uses <type> / <grant>, which this
server does not support` (for `certificate` and `kerberos`: `... uses certificate, which this server does
not support`).

| Authentication | `SAP_AUTH_TYPE` | `SAP_GRANT_TYPE` | Connection | What the destination holds |
|----------------|-----------------|------------------|------------|----------------------------|
| **Basic** | `basic` | — | HTTP or RFC | `SAP_USERNAME`, `SAP_PASSWORD` |
| **SNC** (passwordless) | `snc` | — | **RFC only** | `SAP_SNC_PARTNERNAME`; optional `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME`. **No user, no password** |
| **JWT, browser login** | `jwt` | `authorization_code` | HTTP | A service key (ABAP or XSUAA), or `SAP_UAA_URL`, `SAP_UAA_CLIENT_ID`, `SAP_UAA_CLIENT_SECRET`; the token is obtained and renewed by the server |
| **JWT, a token you hold** | `jwt` | `none` | HTTP | `SAP_JWT_TOKEN` (used as it is, never renewed), or the `x-sap-jwt-token` header |

A `.env` that is a destination by itself **must state `SAP_AUTH_TYPE`** (there is no default: a `.env` with a
user and a password but no type is refused with `Destination "X" lacks: authType`; an ABAP service key
states `jwt` / `authorization_code` itself). A `jwt` destination **must state `SAP_GRANT_TYPE`** too. A `.env` that states `jwt` without a grant
is refused with `Destination "X" lacks: grantType` and a hint to regenerate it with
`mcp-auth generate-env --grant <grant>` (see [Generate a `.env`](#generate-a-env)).

Other grants (`client_credentials`, `passcode`, the OIDC and SAML grants) and other types
(`saml`, `certificate`, `kerberos`) are **not supported** by this server, even though the
libraries know some of them. A destination that states one is refused, naming it; it is never
silently run as something else. (A `saml` destination that states no grant gets `lacks: grantType`,
like a `jwt` one.)

### SNC

SNC logs on over RFC with the credential of an installed SNC product (for example a Secure
Login Client). The `.env` carries no user and no password: the SAP system maps the client's
SNC name to an ABAP user.

```bash
SAP_URL=https://your-sap-system.example
SAP_AUTH_TYPE=snc
SAP_SNC_PARTNERNAME='p:CN=<system>, O=<org>, C=<country>'
# Optional:
SAP_SNC_QOP=9
SAP_SNC_LIB=/path/to/the/snc/library
SAP_SNC_MYNAME='p:CN=<client name>'
```

SNC needs RFC: `SAP_CONNECTION_TYPE=rfc` in the `--env` / `--env-path` `.env`, in the
process environment, `--connection-type=rfc`, or YAML `connection-type: rfc` (precedence: CLI, environment
including that `.env`, YAML).
With HTTP the destination is refused naming `connection-type`. RFC needs the SAP NW RFC SDK and the optional dependency
`@mcp-abap-adt/sap-rfc-lite` — see [RFC Setup](../installation/RFC_SETUP.md).

## Where a destination lives

A process serves **one default destination**, chosen in this order:

1. **`--mcp=<name>`** (or YAML `mcp`) — a *named destination*, below.
2. **`--env-path=<path|file>`** (or `MCP_ENV_PATH`), **`--env=<name>`** (resolved to
   `sessions/<name>.env`) — one `.env` file, used as it is.

Without those there is no default destination (stdio runs inspection-only; HTTP/SSE serve
`x-sap-*` headers and, with `--allow-destination-header`, `x-mcp-destination`). **Nothing is looked
up in the working directory**: a server started inside someone else's project must not take their
settings. A `.env` there is read only when you name it: `--env-path=./.env`.

A named destination `X` is read from two places, **field by field**: `sessions/X.env` wins,
and `service-keys/X.json` fills in what the file does not state.

- Linux/macOS: `~/.config/mcp-abap-adt/{service-keys,sessions}/`
- Windows: `%USERPROFILE%\Documents\mcp-abap-adt\{service-keys,sessions}\`
- `--auth-broker-path` / `AUTH_BROKER_PATH` change the base directory.

A destination name is a file name: only letters, digits, `_`, `.` and `-` are allowed, and a
name with a path separator, `..` or a leading dot is refused before any file is read.

**An XSUAA service key** (a key whose root has `url`, `clientid` and `clientsecret`, with no
`uaa` object) carries the UAA, not the ABAP system. The system's URL must be stated as
`XSUAA_MCP_URL` in `sessions/X.env`; stating `SAP_URL` there is refused naming
`XSUAA_MCP_URL`. An ABAP service key carries its own URL.

### What is written back

The session — the token and its refresh token — is the server's to keep current:

- **An `--env` / `--env-path` `.env` is read *and written back*** with a
  renewed token, whatever `--unsafe` says. Only the secret keys are rewritten; the rest of the
  file stays as it was.
- **A named destination's session** is written to `sessions/X.env` only with `--unsafe`.
  Without it the session is kept in memory: one browser login per process, lost on exit.
  The session is also *read* from `sessions/X.env` only with `--unsafe`: a `jwt` / `none`
  destination whose token (`SAP_JWT_TOKEN`) is in that file is refused without it, as
  `Destination "X" lacks: authorizationToken`. Start with `--unsafe`, or serve the file with
  `--env=X` or `--env-path`, which read it whatever `--unsafe` says.

A destination is **read once per process**. Nothing watches the files: a change you make to a
`.env` from outside (a new password, a token handed over again) takes effect on **restart**.

### Secrets live in `.env`, configuration in YAML

`.env` files and environment variables hold secrets and the session. A YAML config file holds
configuration only; the server **refuses a YAML key that looks like a secret** (it names the
key, never the value). See [YAML Configuration](../configuration/YAML_CONFIG.md).

## Browser login (JWT / `authorization_code`)

When there is no valid token, the server opens the system's login page and waits for the
redirect on a local callback port.

- `--browser=<name>` (or `MCP_BROWSER`, YAML `browser`): `chrome`, `edge`, `firefox`,
  `system` (the default), `headless`, `none`.
- `--browser-auth-port=<port>` (or `MCP_BROWSER_AUTH_PORT`, YAML `browser-auth-port`):
  the callback port, **default `61001`** for every transport. A value that is not an integer
  from 1 to 65535 is refused at startup.
- The login waits up to 30 s. Several destinations logging in at once take turns: one login
  at a time per process.

```bash
mcp-abap-adt --transport=http --mcp=TRIAL --browser-auth-port=61005
```

## Generate a `.env`

The `mcp-auth` and `mcp-sso` commands live in **`@mcp-abap-adt/auth-broker-cli`**, not in
`@mcp-abap-adt/auth-broker`:

```bash
npm install -g @mcp-abap-adt/auth-broker-cli
mcp-auth generate-env --grant authorization_code   # `mcp-auth --help` lists the other flags
```

The `.env` it writes states `SAP_AUTH_TYPE` and `SAP_GRANT_TYPE`. A `.env` written by an older
version states no grant: regenerate it, or add `SAP_GRANT_TYPE` by hand.

**.env comments rule:** only full-line comments are supported (lines that start with `#`).
Inline comments are not parsed, so keep comments on separate lines.

**On-premise:** add `SAP_SYSTEM_TYPE=onprem` (or `--system-type=onprem`) to enable the
on-premise-only tools (for example Programs); without it the tools offered are cloud's. The same
setting picks the connector; without it a `jwt` destination connects as cloud and any other as
on-premise.

**Responsible and master system.** A created object always carries its responsible person; its master
system only when one is known. For each request the server takes each from the first of:

| Order | Responsible | Master system |
|-------|-------------|---------------|
| 1 | the tool's own argument, where the tool has one (`CreateTransport`'s `owner`) | the tool's own argument, where a tool has one (none does today) |
| 2 | the request's `x-sap-responsible` header | the request's `x-sap-master-system` header |
| 3 | `SAP_RESPONSIBLE` in the destination's own `.env` | `SAP_MASTER_SYSTEM` in the destination's own `.env` |
| 4 | `SAP_RESPONSIBLE` in the process environment | `SAP_MASTER_SYSTEM` in the process environment |
| 5 | on-premise, the login: the destination's own `SAP_USERNAME` | on a cloud system, the system id (`systeminformation`) |
| 6 | on-premise, the login: `x-sap-login` of an `x-sap-url` connection | — left out of the request |
| 7 | on-premise, the login: the process `SAP_USERNAME` | |
| 8 | on a cloud system, the login is the system's user (`systeminformation`) alone | |

The headers are read per request over HTTP and from the session's opening request over SSE, for a
destination request and an `x-sap-*` connection request alike. The destination's own `.env` is the
`--env` / `--env-path` file, or `sessions/<destination>.env` for a named destination (`--mcp`,
`x-mcp-destination`) — read per destination, so one destination never gets another's. A cloud system is
asked once per connection, on the connected connection, and only for what is not stated; on-premise
nothing is asked of the system. Which kind a system is follows the rule above, never its URL. On a cloud
system steps 5–7 do not count: `SAP_USERNAME` and `x-sap-login` are not its login. `x-sap-login` is the
login only of an `x-sap-url` basic connection, which logs on with it; on a destination request it is not
read. The process environment (`SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM`, `SAP_USERNAME`) is read once: a
change made to it while the server runs is not picked up.

A create (or a transport without an `owner`) that finds no responsible person — on-premise over SNC or
with a token you hold, with no `SAP_RESPONSIBLE` anywhere — is refused by the server before any request
is made: the answer is `"error": "system_context_missing"` with words naming `SAP_RESPONSIBLE`, the
`x-sap-responsible` header and the login. When a cloud system could not be asked for its user (the
lookup failed), the same error carries other fixed words: retry, or state `SAP_RESPONSIBLE`. Nothing is
sent with an empty responsible. A missing master
system is never refused: the attribute is left out and the system applies itself, as in 15.x. A read is
never refused for either.

**The one exception: a message class.** adt-clients' message class create takes no responsible (15.x the
same), so a message class is created with the system's own default responsible, whatever is stated, and
is never refused for a missing one.

## HTTP/SSE headers

For HTTP and SSE transports a request may carry its own connection:

- A destination: `x-mcp-destination`, **only with `--allow-destination-header`** (off by
  default). A value that is not a plain destination name is refused naming the header.
- A token you hold: `x-sap-url`, `x-sap-client`, `x-sap-jwt-token`
- Basic: `x-sap-url`, `x-sap-client`, `x-sap-login`, `x-sap-password`

Precedence: `x-mcp-destination` (when allowed), then `x-sap-*` headers, then the default
destination. A request with none of them is answered `400`.

## Errors you may meet at startup

- `Destination "X" lacks: <fields>` — the destination states less than its authentication
  needs, followed by one hint where the server knows the remedy (`grantType`, `SAP_URL`,
  `XSUAA_MCP_URL`, `connection-type`).
- `Destination "X" uses <type> / <grant>, which this server does not support` — an
  authentication outside the four above (`certificate` and `kerberos` have no grant: `uses certificate`).
- `--env-path: the file does not exist: <path>` — an env file you named is missing; the server
  falls back to nothing.
- `--auth-broker was removed in 16.0.0 — remove it from the configuration` (likewise
  `MCP_USE_AUTH_BROKER` and `auth-broker (config file)`) — a parameter 16.0.0 removed is still
  set; the start stops, naming the form you used.

The server names fields and the words above only; it never prints a value read from a file.

## Shutdown

On `SIGTERM`, `SIGINT` (and, for stdio, the end of stdin) the server stops accepting
connections, waits up to **30 s** for logins and refreshes in flight, and flushes every
session. It exits `0` when everything is stored. It exits `1`, with one stderr line per fact
(never a secret, an error's message or anything read from a file), when:

- a secret could not be stored (`Session secrets not stored: "<destination>": <ErrorClass>`);
- a login or refresh was still running at the 30 s deadline (`N authorizations still running at
  shutdown, their results are lost`);
- a server did not close (`A server did not close at shutdown: <ErrorClass>`);
- settling itself failed (`Shutdown did not settle: <ErrorClass>`).

Nothing is written to stdout.

## Related Docs

- Client setup: [CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md)
- Every parameter: [CLI_OPTIONS.md](CLI_OPTIONS.md)
- Service key example: [SERVICE_KEY_SETUP.md](../installation/examples/SERVICE_KEY_SETUP.md)
- Coming from 15.x: [MIGRATION-16.0.md](../MIGRATION-16.0.md)
