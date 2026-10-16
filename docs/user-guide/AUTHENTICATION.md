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
| the `--env` / `--env-path` file | **fails the request** (`unknown`, `persisting-tokens`, with "The session could not be written to the destination's file."), and the destination is refused until a write lands: it is your own file, and a write that did not land must be seen |
| a named destination, with `--unsafe` (`sessions/X.env`) or without (in memory) | is reported on stderr — `[MCP] A session write did not land: <logFields>` — **whatever `DEBUG_AUTH_LOG` says**, and the request goes on |

Only a `jwt` / `authorization_code` destination writes a session; `basic` and `snc` obtain no
session secret and are never written, and HTTP and SSE write nothing.

At shutdown a write still pending is written once more before the exit (a refresh token the
token endpoint refused is cleared this way, so it does not come back on the next start). One
that still does not land is reported on stderr as `"<destination>": <reason>` and the exit is
`1`; the reason is the classified failure, never the store's own message.

### Secrets live in `.env`, configuration in YAML

`.env` files and environment variables hold secrets and the session. A YAML config file holds
configuration only; the server **refuses a YAML key that looks like a secret** (it names the
key, never the value). See [YAML Configuration](../configuration/YAML_CONFIG.md).

## Browser login (JWT / `authorization_code`)

When there is no valid token, the server opens the system's login page and waits for the
redirect on a local callback port. On stdio a `jwt` / `authorization_code` destination with no
session logs in **at the start**, before the MCP transport opens (the server connects then); a
login that fails ends the process with exit `1`. The token is then renewed as `--renewal` says.

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
- The login waits until the browser answers, the identity provider refuses, or the session ends:
  there is no built-in timeout. **A tool call cannot be cancelled**, so a cancel ends no login; a
  client that closes its connection ends the login it started, once no other request waits for
  it. The callback port is free again as soon as a login ends.
- `--login-timeout=<seconds>` (or `MCP_LOGIN_TIMEOUT`, YAML `login-timeout`; 1 to 86400) bounds
  each login, opt-in: a login still waiting then ends `aborted`, answered with "The login was
  ended by the server's login timeout (`--login-timeout=<n>`)." — the bound named in the form it
  was set. No default.
- At startup the server reads the destination and builds its credential (nothing is sent): a
  destination the broker refuses stops the start, exit `1`, with the error's own words.

```bash
mcp-abap-adt --mcp=TRIAL --browser-auth-port=61005 --system-type=cloud
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

**The system type is required:** add `SAP_SYSTEM_TYPE=onprem` (or `cloud`, `legacy`; or
`--system-type=…`). It enables the on-premise-only tools (for example Programs) and picks the
connector; without it the destination does not start (19.0.0: no default — a `jwt` destination is
no longer taken for cloud).

**Responsible and master system.** A created object always carries its responsible person; its master
system only when one is known. **The responsible is the user the system names**: the server asks the
system's `systeminformation` once per destination (its credentials and its target system: a new
session of the same ones is not asked again), on ABAP Cloud and on-premise alike, and its answer
wins over everything configured — with passwordless SSO, or a user provisioned into the system, the
user exists only inside the system. For each request the server takes each from the first of:

| Order | Responsible | Master system |
|-------|-------------|---------------|
| 1 | the tool's own argument, where the tool has one (`CreateTransport`'s `owner`) | the tool's own argument, where a tool has one (none does today) |
| 2 | the system's user (`systeminformation`), on any system that answers it | the system id (`systeminformation`) |
| | *Only on an on-premise system that gives no information (no `systeminformation`, an answer without the user, an error):* | |
| 3 | the request's `x-sap-responsible` header | the request's `x-sap-master-system` header |
| 4 | `SAP_RESPONSIBLE` in the destination's own `.env` (stdio) | `SAP_MASTER_SYSTEM` in the destination's own `.env` (stdio) |
| 5 | `SAP_RESPONSIBLE` in the process environment | `SAP_MASTER_SYSTEM` in the process environment |
| 6 | the login: the destination's own `SAP_USERNAME` (stdio) | — left out of the request |
| 7 | the login: `x-sap-login` of an `x-sap-url` basic connection (HTTP, SSE) | |
| 8 | the login: the process `SAP_USERNAME` | |

The headers are read per request over HTTP and from the connection's opening request over SSE. The
destination's own `.env` (stdio) is the `--env` / `--env-path` file, or `sessions/<destination>.env`
for a named destination (`--mcp`). The system is asked once per destination — its credentials and
its target system; over HTTP each request's headers are a destination of their own — on the connected
connection — one request (`GET /sap/bc/adt/core/http/systeminformation`). Its answer is read by the
system's kind (the rule above, never its URL): an answer naming a user is used on both kinds.
Anything else — a `404` (no endpoint), an answer without the user, an error — is no information:
on-premise steps 3–8 apply when the call states a responsible (`x-sap-responsible`, `SAP_RESPONSIBLE`) or, none, a login (the destination's or the environment's
`SAP_USERNAME`, or `x-sap-login` of an `x-sap-url` basic connection); with none the call is
refused `system_user_unknown` (the session user is unknown; the tool does not run; at a stdio
start the server does not start). An on-premise `404` is kept for the destination, so a later call
sends no lookup; nothing else but an answer naming the user is kept. A `401` on the lookup is the
credentials refused, not a `systeminformation` failure: the call's credential error as it came, on
both kinds, never the configuration in its place. Every ABAP Cloud system has it, so
on a cloud system it is one step to the error: a `404` is `cloud_without_systeminformation` (the
configuration or headers are inconsistent), anything else `system_lookup_failed` (a problem of the
ABAP system). On a cloud system steps 3–8 never count. `x-sap-login`
is the login only of an `x-sap-url` basic connection, which logs on with it; a token connection states
no login. The process environment (`SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM`, `SAP_USERNAME`) is read
once: a change made to it while the server runs is not picked up.

In the servers a call never reaches its tool without a responsible person: an on-premise system
without `systeminformation`, over SNC or with a token you hold, with no `SAP_RESPONSIBLE` anywhere,
is `system_user_unknown` above. An embedder that passes no rules has no such step: there a create
(or a transport without an `owner`) that finds no responsible person is refused before any request
is made: the answer is `"error": "system_context_missing"` with words naming `SAP_RESPONSIBLE`, the
`x-sap-responsible` header and the login. The servers ask the system for its user before a
tool runs: on ABAP Cloud, when the system gives no information, the call answers `"error":
"system_lookup_failed"` (the ABAP system answered without the user or with an error: its problem,
with a valid configuration) or, for a `404`, `"error": "cloud_without_systeminformation"` ("the
destination is stated as ABAP Cloud, but its system has no systeminformation endpoint, which every
ABAP Cloud system has: the configuration or the headers are inconsistent"), and its tool does not
run — on stdio the start fails instead, and the process ends. The next call asks again.
`HandlerExporter`'s handlers do the same: the failed lookup is thrown with the same code and words,
and the handler does not run. Nothing is
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
  authentication needs, followed by one hint where the server knows the remedy (`grantType`,
  `SAP_URL`, `XSUAA_MCP_URL`, `connection-type`). A session bound to another destination's means
  is not refused: it is not used, and the destination logs in afresh.
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
| the server's own refusal | `destination_refused`, `fresh_connection_unavailable`, `inspection_only`, `credentials_required` | — | fixed words | — |

`server` is added when the server has its own sentence for the failure — for example under
`--renewal=refresh-only`, when a renewal would need a login. Never in the answer: the chain
error's diagnostics and facts beyond its `kind`, an error's message, a token, a URL with a
query, the login's `state`. The diagnostics go to stderr only, as one line per failure:
`[MCP] <error>: <logFields>` (auth-errors' `logFields`: `error`, `kind`, `status`,
`diagnostics`).

### A tool failure: the method's error as it is, plus the step

A tool failure that is not one of these is the error the ADT method returned, as it is — its
words decided by the reading the tool gave the method — plus the step the tool was doing when
it arose. A tool never rewrites it:

```json
{ "message": "Request failed with status code 403", "origin": "connection",
  "step": "read", "status": 403, "adt_type": "ExceptionResourceNoAuthorization",
  "namespace": "com.sap.adt", "request": { "method": "GET", "url": "…" },
  "messages": [{ "type": "E", "text": "…SAP's text…" }], "raw_body": "<exc:exception …>" }
```

- **SAP refused** — SAP answered, with an error status or with a `2xx` the reading takes as a
  refusal: `origin` (`refusal` or `connection`, as the method gave it), `status` when SAP
  answered with one, `adt_type`, the T100 `messages` and SAP's document in `raw_body`. Never
  turned into an empty result, a `null`, a warning or "not found"; only a `404` where a tool
  defines what absence answers (a source or a package level that is not there) stays absence.
- **No answer from SAP** — the connection failed: `origin: "connection"` with no `status`
  and no `raw_body`.
- **The method failed** — a throw in the client, a reading or the tool itself (a document it
  could not parse, a defect): `error: "client_threw"` and the thrown message, with no `origin`
  — it is not presented as SAP's answer.
- **Our own wait ran out** — a tool that waits a bounded number of polls for SAP (a unit-test
  include's activation run: 6) and gives up says so in plain words, as the method's failure
  (`client_threw`), never as SAP's refusal.
- `step` — where it arose, in the tool's own words (`lock`, `update`, `update metadata`,
  `check`, `activate`, `read`, `delete check`, `delete`, …). A single-call tool adds none. What
  a failed step left behind (a lock not released, cleanup not done) rides beside it as
  `cleanup` — and when that is itself a failure, as an entry of `cleanup.failures` in the same
  shape. A credential failure is never such an entry: on a write, its unlock or its activation it
  is the answer itself, after the unlock was tried — a `401` SAP answered to the unlock
  included, answered as the unlock's error as it is with `step: "unlock"`.

**Several failures in one answer.** Each is an entry in the shape above, with its step — never
folded into one text:

- a tool that reads a list of items — `SearchSource`, `DescribeByList`, `GetAbapSystemSymbols`
  — does not end the call at the first refusal: each item that failed carries its failure
  (`failures[]` with the object for `SearchSource`, `{ name, error }` for `DescribeByList`,
  `error` on the symbol for `GetAbapSystemSymbols`) beside the other items' results, and the
  rest are read on — except a credential failure (an authentication failure, a `401`): the
  credentials are the same for every item, so it ends the whole call, as it came;
- a tool that tries two endpoints — `GetStructuresList` reads a name as a structure, then as a
  table — answers both failures in one array (`read structure`, `read table`) when neither
  has it; a `404` from both stays absence; an append candidate that where-used named and SAP
  refused to read is listed in `append_candidates_unread` (`{ candidate, step: 'read append
  candidate', failures }`), not skipped as "not an append";
- `GetEnhancements` with `include_nested`: a nested include whose enhancements request SAP refused
  is listed in `includes_unread` (`{ include, step: 'read enhancements', failures }`), beside the
  other includes' results, not swallowed; a credential failure ends the call, as it came;
- a probe that was refused rather than finding nothing (`GetEnhancements`' `unreadable`; its
  enhancements request itself is read the same way, step `read enhancements`), a
  refused typing of a new transport task (`CreateTransportTask`'s `task_type_error`), and
  what a debugger stop could not undo (see [DEBUGGER.md](DEBUGGER.md#what-ends-a-session)).
  A credential failure is none of these. A `401` on `CreateTransportTask`'s task type change is
  the call's failure with `step: "change task type"`, not a `task_type_error` beside the
  creation; the task was created all the same and the failure does not name it, so read the
  request (`GetTransport`) to find it. A credential refusal during a debugger stop ends the
  stop: no request follows it, the answer is the refusal as it came with its step, and
  `not_attempted` (`{ message, steps }`, fixed words) names the steps it did not send, which
  stay for the next stop.

**An ADT authorization error is not a credential refusal.** A user who logged on but may not
work with an object gets a `403` with SAP's exception document: it is answered as above, its
`error` is never `authentication_failed`, and the credential is not asked to renew. A `401`
reaches the client as it came — an authentication failure inside a running tool is answered in
the connection's own words, with its hint, never replaced.

## Shutdown

On `SIGTERM`, `SIGINT` or the end of stdin (its `end` and `close` are one trigger: your client
closed the transport) the server, in this order:

1. stops taking calls: a call read from now on is answered `interactive-login` `aborted` with
   "The server is shutting down.", and reaches no tool; no interactive login starts any more;
2. **logs off every ADT session it opened, at once** — the logoff is what releases a lock a tool
   holds — and interrupts the running tools: **nothing waits for a running tool**, a queued call
   never starts, and a started write's `UNLOCK` that was still to come never goes out (its lock
   goes with the logoff). No state undo is sent: the logoff ends the held state (a debug session);
3. closes the MCP server;
4. closes the credential gate, ends the logins, waits for the provider calls in flight and
   writes every pending session secret.

There is **no deadline** (18.x gave up after 30 s). It exits `0` when everything is done. It
exits `1`, with one stderr line per fact (never a secret, an error's message or anything read
from a file), when:

- a secret could not be stored (`Session secrets not stored: "<destination>": <reason>`);
- settling itself failed (`Shutdown did not settle: <ErrorClass>`).

**Ending the waiting early.** A second `SIGTERM` / `SIGINT`, or `--shutdown-timeout=<seconds>`
(`MCP_SHUTDOWN_TIMEOUT`, YAML `shutdown-timeout`; no default), is the forced close: nothing more
is waited for — not a session write, not a flush — but each ADT session's logoff, which is still
written (one whose write never completes keeps the process until it is killed), and the exit is `1` with `Still running at the forced close: <tool>` per tool and `Not
finished at the forced close: <step>`. What it costs: a session write lost (a discarded refresh
token can come back on the next start).

Nothing is written to stdout.

## Related Docs

- Client setup: [CLIENT_CONFIGURATION.md](CLIENT_CONFIGURATION.md)
- Every parameter: [CLI_OPTIONS.md](CLI_OPTIONS.md)
- Service key example: [SERVICE_KEY_SETUP.md](../installation/examples/SERVICE_KEY_SETUP.md)
- Coming from 15.x: [MIGRATION-16.0.md](../MIGRATION-16.0.md)
