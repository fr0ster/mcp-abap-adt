# Authentication & Destinations

`mcp-abap-adt` (stdio) supports **three authentications**. Every one of them is a *destination*: a system
URL plus how to log on to it, kept in a service key, a `.env` file, or both. Anything else a
`.env` or a service key states is refused at startup: `Destination "X" uses <type> / <grant>, which this
server does not support` (for `certificate` and `kerberos`: `... uses certificate, which this server does
not support`).

| Authentication | `SAP_AUTH_TYPE` | `SAP_GRANT_TYPE` | Connection | What the destination holds |
|----------------|-----------------|------------------|------------|----------------------------|
| **Basic** | `basic` | — | HTTP or RFC | `SAP_USERNAME`, `SAP_PASSWORD` |
| **SNC** (passwordless) | `snc` | — | **RFC only** | `SAP_SNC_PARTNERNAME`; optional `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME`. **No user, no password** |
| **JWT, browser login** | `jwt` | `authorization_code` | HTTP | A service key (ABAP or XSUAA), or `SAP_UAA_URL`, `SAP_UAA_CLIENT_ID`, `SAP_UAA_CLIENT_SECRET`; the token is obtained and renewed by the server |

**A token you hold** (`jwt` / `none`) is not served over stdio: a `.env` stating it is refused at startup
with `Destination "X" uses jwt / none, which this server does not support` and the hint *a token you hold
is sent in the x-sap-jwt-token header to mcp-abap-adt-http or mcp-abap-adt-sse; for stdio, create the
session with mcp-auth*. Send it in `x-sap-jwt-token` to `mcp-abap-adt-http` / `mcp-abap-adt-sse`
([below](#http-and-sse-credentials-from-headers-only)), or let `mcp-auth` log in and write the session
of a `jwt` / `authorization_code` destination.

A `.env` that is a destination by itself **must state `SAP_AUTH_TYPE`** (there is no default: a `.env` with a
user and a password but no type is refused with `Destination "X" cannot be used: authType`; an ABAP service key
states `jwt` / `authorization_code` itself). A `jwt` destination **must state `SAP_GRANT_TYPE`** too. A `.env` that states `jwt` without a grant
is refused with `Destination "X" cannot be used: grantType` and a hint to write it again with
`mcp-auth` (see [Generate a `.env`](#generate-a-env)), or to add `SAP_GRANT_TYPE` by hand.

Other grants (`none`, `client_credentials`, `passcode`, the OIDC and SAML grants) and other types
(`saml`, `certificate`, `kerberos`) are **not supported** by this server, even though the
libraries know some of them. A destination that states one is refused, naming it; it is never
silently run as something else. (A `saml` destination that states no grant gets `cannot be used: grantType`,
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

Without those there is no default destination: stdio runs inspection-only. Destinations are served
only by `mcp-abap-adt` (`@mcp-abap-adt/core`, stdio); `mcp-abap-adt-http` and `mcp-abap-adt-sse`
take credentials only from `x-sap-*` headers (below). **Nothing is looked
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

### The session format

A session record — the token or cookies, the refresh token, the expiry and the binding
(`SAP_ISSUED_FOR` / `SAP_ISSUED_BY`, or `XSUAA_ISSUED_FOR` / `XSUAA_ISSUED_BY`) — is written by
`mcp-auth` (`@mcp-abap-adt/auth-broker-cli` 3.x) or by the server, and only such a record is read
(`@mcp-abap-adt/auth-stores` 5). The session store alone judges it: a record its writer would never
produce — a token without both binding keys beside it, a token and cookies both, an expiry that is
not epoch milliseconds — is refused as a whole (`record-format`), and the server answers
`Destination "X" cannot be used: its session record is not in the store's format` with the hint to
regenerate it with `mcp-auth` (below). Nothing of the record reaches an answer or a log line, no
login starts, and the file is left as it is. A file with the means and no token or cookies is no
session: the destination logs in. Whether a binding matches the destination is the broker's: a
session bound to another destination's means is not used, and the destination logs in afresh.

### What is written back

The session — the token and its refresh token — is the server's to keep current:

- **An `--env` / `--env-path` `.env` is read *and written back*** with a
  renewed token, whatever `--unsafe` says. Only the secret keys are rewritten; the rest of the
  file stays as it was.
- **A named destination's session** is written to `sessions/X.env` only with `--unsafe`.
  Without it the session is kept in memory: one browser login per process, lost on exit.
  The session is also *read* from `sessions/X.env` only with `--unsafe`: without it a token there
  is not used, and the destination logs in. Start with `--unsafe`, or serve the file with
  `--env=X` or `--env-path`, which read it whatever `--unsafe` says.

A destination is **read once per process**. Nothing watches the files: a change you make to a
`.env` from outside (a new password, a token handed over again) takes effect on **restart**.
**Editing a destination's files while the server runs is not supported and may combine old and
new values until the next start — restart after any change.** (The settings are read once; the
credential is asked of the broker on every request, and the broker rebuilds it when what it was
built from changed, so the two may disagree until the restart.)

### Renewal (`--renewal`)

An expired or refused token is renewed by the provider, the way `--renewal` says (or
`MCP_RENEWAL`, YAML `renewal`):

- `refresh-then-login` (the default): refresh with the refresh token; when there is none, or the
  refresh is refused, log in again in the browser.
- `refresh-only`: refresh only, never a login. A destination that would need a login is refused
  with `renewal-declined` and the server's sentence "Logins are off (`--renewal=refresh-only`):
  log in with `mcp-auth`, or start without it." Use it where nobody can answer a browser login:
  log in once with `mcp-auth` (from `@mcp-abap-adt/auth-broker-cli`), then serve the file.

### A session write that did not land

Where the renewed session is written decides what a failed write means (no option):

| Store | A failed write |
|---|---|
| the `--env` / `--env-path` file | **fails the request** (`unknown`, `persisting-tokens`), and the destination is refused until a write lands: it is your own file, and a write that did not land must be seen |
| a named destination, with `--unsafe` (`sessions/X.env`) or without (in memory) | is logged (on stderr only with `DEBUG_AUTH_LOG=true`), and the request goes on |

At shutdown a write still pending is reported on stderr as `"<destination>": <reason>` and the
exit is `1`; the reason is the classified failure, never the store's own message.

### Secrets live in `.env`, configuration in YAML

`.env` files and environment variables hold secrets and the session. A YAML config file holds
configuration only; the server **refuses a YAML key that looks like a secret** (it names the
key, never the value). See [YAML Configuration](../configuration/YAML_CONFIG.md).

## Browser login (JWT / `authorization_code`)

When there is no valid token, the server opens the system's login page and waits for the
redirect on a local callback port. A `jwt` / `authorization_code` destination with no session
logs in on its first tool call; the token is then renewed as `--renewal` says.

- `--browser=<name>` (or `MCP_BROWSER`, YAML `browser`) picks the browser, mapped by the
  platform to one of `@mcp-abap-adt/auth-providers`' browsers:

  | `--browser` | Linux | macOS | Windows | another platform |
  |---|---|---|---|---|
  | `system` (default), `auto` | `xdg-open` | `open` | the default browser | none: a `jwt` / `authorization_code` destination is refused at start (use `--browser=none` or `--browser-program`); other destinations start |
  | `chrome` | `google-chrome` | `Google Chrome` | `chrome` | none (as above) |
  | `edge` | `microsoft-edge` | `Microsoft Edge` | `msedge` | none (as above) |
  | `firefox` | `firefox` | `Firefox` | `firefox` | none (as above) |
  | `none`, `headless` | no browser: the URL is printed on stderr; the login waits | the same | the same | the same |

  A name outside the table is refused at start, on every platform. On a platform outside the
  table only a destination that logs in is refused for the missing browser, at the startup check;
  `basic`, `snc`, `jwt` / `none` and inspection-only mode start. The URL goes to stderr (never stdout) whatever
  `DEBUG_AUTH_LOG` says, also when a browser could not be started.
- `--browser-program=<program>` (or `MCP_BROWSER_PROGRAM`, YAML `browser-program`) runs the
  program you name instead: an executable on Linux, an application on macOS, a program on
  Windows; elsewhere it is run as on Linux, with the URL as its one argument. It excludes
  `--browser`: giving both is refused at start.
- `--browser-auth-port=<port>` (or `MCP_BROWSER_AUTH_PORT`, YAML `browser-auth-port`):
  the callback port, **default `61001`** for every transport. A value that is not an integer
  from 1 to 65535 is refused at startup.
- The login waits until the browser answers, the identity provider refuses, or the request is
  cancelled: there is no built-in timeout. The callback port is free again as soon as a login
  ends, cancelled or not.
- At startup the server reads the destination and builds its credential (nothing is sent): a
  destination the broker refuses stops the start, exit `1`, with the error's own words.

```bash
mcp-abap-adt --mcp=TRIAL --browser-auth-port=61005
```

## Generate a `.env`

The `mcp-auth` command lives in **`@mcp-abap-adt/auth-broker-cli`** (3.x), not in
`@mcp-abap-adt/auth-broker`. It logs in through the browser and writes the `.env`:

```bash
npm install -g @mcp-abap-adt/auth-broker-cli
# From a service key (--type xsuaa for an XSUAA key):
mcp-auth --service-key ./service-key.json --output ./mcp.env --type abap
# Or a destination of the destination folder (sessions/<name>.env, else service-keys/<name>.json):
mcp-auth --destination TRIAL --type abap
# `mcp-auth --help` lists the other options
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
| 3 | `SAP_RESPONSIBLE` in the destination's own `.env` (stdio) | `SAP_MASTER_SYSTEM` in the destination's own `.env` (stdio) |
| 4 | `SAP_RESPONSIBLE` in the process environment | `SAP_MASTER_SYSTEM` in the process environment |
| 5 | on-premise, the login: the destination's own `SAP_USERNAME` (stdio) | on a cloud system, the system id (`systeminformation`) |
| 6 | on-premise, the login: `x-sap-login` of an `x-sap-url` basic connection (HTTP, SSE) | — left out of the request |
| 7 | on-premise, the login: the process `SAP_USERNAME` | |
| 8 | on a cloud system, the login is the system's user (`systeminformation`) alone | |

The headers are read per request over HTTP and from the connection's opening request over SSE. The
destination's own `.env` (stdio) is the `--env` / `--env-path` file, or `sessions/<destination>.env`
for a named destination (`--mcp`). A cloud system is
asked once per connection, on the connected connection, and only for what is not stated; on-premise
nothing is asked of the system. Which kind a system is follows the rule above, never its URL. On a cloud
system steps 5–7 do not count: `SAP_USERNAME` and `x-sap-login` are not its login. `x-sap-login` is the
login only of an `x-sap-url` basic connection, which logs on with it; a token connection states no
login. The process environment (`SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM`, `SAP_USERNAME`) is read once: a
change made to it while the server runs is not picked up.

A create (or a transport without an `owner`) that finds no responsible person — on-premise over SNC or
with a token you hold, with no `SAP_RESPONSIBLE` anywhere — is refused by the server before any request
is made: the answer is `"error": "system_context_missing"` with words naming `SAP_RESPONSIBLE`, the
`x-sap-responsible` header and the login. When a cloud system could not be reached to name the user (the
lookup failed), the same error carries other fixed words: the system is unreachable, retry when it is
available. It does not advise `SAP_RESPONSIBLE` — the create would fail on an unreachable system anyway. Nothing is
sent with an empty responsible. A missing master
system is never refused: the attribute is left out and the system applies itself, as in 15.x. A read is
never refused for either.

**There is no exception.** Up to 16.0.x a message class was created with the system's own default
responsible and never refused, because adt-clients' message class create took none. From 17.0.0 it
sends the responsible like every other create (adt-clients 25.0.1), and is refused the same way when
none is found — and so is a program's test include (`CreateProgramUnitTest`), whose include create
now receives the same context.

## HTTP and SSE: credentials from headers only

`mcp-abap-adt-http` (`@mcp-abap-adt/http`) takes credentials **only** from each request's headers,
and `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`) only from the headers of the `GET` that opens each SSE
connection:

- A token you hold: `x-sap-url`, `x-sap-client`, `x-sap-jwt-token` — presented as a Bearer token,
  never renewed.
- Basic: `x-sap-url`, `x-sap-client`, `x-sap-login`, `x-sap-password`.

There is no destination, no service key, no session file and no login in either: a request (HTTP)
or an opening `GET` (SSE) without credentials is answered `400` — *this server takes credentials
only from the request's headers: send x-sap-url with x-sap-jwt-token, or with x-sap-login and
x-sap-password* — and one carrying `x-mcp-destination` (SSE: a `GET` or a `POST`) is answered `400`
— *destinations are served only by mcp-abap-adt (stdio); send x-sap-* headers*. `ping` answers
without credentials. Each request (HTTP) or connection (SSE) builds its own credential; nothing is
stored, shared or cached across them. Over SSE a `POST` is routed by its `sessionId` alone: its own
`x-sap-*` headers are not read.

## Errors you may meet at startup

- `Destination "X" cannot be used: <fields>` — the destination states less than its
  authentication needs, or a session it cannot use, followed by one hint where the server knows
  the remedy (`grantType`, `SAP_URL`, `XSUAA_MCP_URL`, `connection-type`, `authorizationToken`,
  `issuedFor` / `issuedBy`). A refusal naming `issuedFor` / `issuedBy` gets: "the session is
  bound to another destination's means: regenerate it with mcp-auth".
- `Destination "X" cannot be used: its session record is not in the store's format` — the
  session file holds a record no writer of the chain produces (auth-stores 5 refuses it as
  `record-format`): a token without `SAP_ISSUED_FOR` / `SAP_ISSUED_BY` beside it (an older
  `mcp-auth` or auth-broker, or written by hand), a token and cookies both, or an expiry that is
  not epoch milliseconds. The start stops and no login starts; a tool call answers the same,
  `destination_refused`. The hint: "regenerate the session with mcp-auth: `mcp-auth --destination
  <name> --type abap|xsuaa`, or `mcp-auth --service-key <file> --output <file> --type
  abap|xsuaa` (from @mcp-abap-adt/auth-broker-cli)". The file is left as it is.
- `Destination "X" logs in through a browser, and none is known on this platform (<platform>)`
  — a `jwt` / `authorization_code` destination on a platform outside the browser table, with
  the hint "Start with --browser=none and open the URL the login prints on stderr, or give
  --browser-program=<program>."
- `Destination "X" uses <type> / <grant>, which this server does not support` — an
  authentication outside the three above (`certificate` and `kerberos` have no grant: `uses certificate`).
- `--env-path: the file does not exist: <path>` — an env file you named is missing; the server
  falls back to nothing.
- `--auth-broker was removed in 16.0.0 — remove it from the configuration` (likewise
  `MCP_USE_AUTH_BROKER` and `auth-broker (config file)`) — a parameter 16.0.0 removed is still
  set; the start stops, naming the form you used.
- A refusal of the credential itself (a token endpoint or the system said no) is printed in the
  words of the authentication chain: its reason, then its hint.

The server names fields and the words above only; it never prints a value read from a file.

## What an MCP client sees when a tool call fails on authentication

A tool call that fails on the credential, on the destination or on one of the server's own
refusals is answered with `isError: true` and a JSON text:

```json
{ "error": "authentication_failed", "kind": "credential-refused",
  "message": "the token was refused", "hint": "obtain a new token",
  "server": "…the server's own sentence, when it has one…" }
```

| Source | `error` | `kind` | `message` | `hint` |
|---|---|---|---|---|
| a failure of the authentication chain (a provider, the connection's refusal) | `authentication_failed` | its `kind` | its reason | its hint |
| a destination the server cannot use | `destination_refused` | — (`cause_kind` when a chain error caused it) | `Destination "<name>" cannot be used: <fields>` | the chain error's hint, then one fixed hint per known field |
| a request that was cancelled | `request_aborted` | — | fixed words | — |
| the server's own refusal | `destination_refused`, `fresh_connection_unavailable`, `inspection_only`, `credentials_required` | — | fixed words | — |

`server` is added when the server has its own sentence for the failure — for example under
`--renewal=refresh-only`, when a renewal would need a login. Never in the answer: the chain
error's diagnostics and facts beyond its `kind`, an error's message, a token, a URL with a
query, the login's `state`. The diagnostics go to stderr only, as one line per failure:
`[MCP] <error>: <logFields>` (auth-errors' `logFields`: `error`, `kind`, `status`,
`diagnostics`).

A tool failure that is not one of these — an ADT error, a `403` with SAP's text included — is
answered as before.

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
