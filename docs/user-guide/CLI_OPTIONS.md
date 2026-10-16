# Command Line Interface (CLI) Reference

Complete reference for the MCP ABAP ADT Server's command line options, per binary.

## The binaries

A binary is its transport; there is no `--transport` option (19.0.0). Each binary reads
**only its own parameters**: an option of another binary, in its CLI or YAML form, stops the start,
naming the binary that serves it.

Another binary's **environment variables are not read** — ignored, with no refusal and no warning:
an environment is inherited, so one shell profile or one `EnvironmentFile` can serve several binaries.
`MCP_TRANSPORT` is the one variable every binary refuses.

| Binary | Package | Transport | Credentials |
|---|---|---|---|
| `mcp-abap-adt` | `@mcp-abap-adt/core` | stdio | one destination through the auth broker (`--mcp`, `--env`, `--env-path`) |
| `mcp-abap-adt-http` | `@mcp-abap-adt/http` | Streamable HTTP | each request's `x-sap-*` headers only |
| `mcp-abap-adt-sse` | `@mcp-abap-adt/sse` | HTTP + SSE | the `x-sap-*` headers of the `GET` that opens each SSE connection |
| `mcp-abap-adt-compact` | `@mcp-abap-adt/compact` | stdio | as `mcp-abap-adt`, with the compact tool set |
| `mcp-abap-adt-compact-http` | `@mcp-abap-adt/compact-http` | Streamable HTTP | as `mcp-abap-adt-http`, with the compact tool set |
| `mcp-abap-adt-compact-sse` | `@mcp-abap-adt/compact-sse` | HTTP + SSE | as `mcp-abap-adt-sse`, with the compact tool set |
| `mcp-abap-adt-ro` | `@mcp-abap-adt/core-ro` | stdio | as `mcp-abap-adt`, with the read-only tool set |
| `mcp-abap-adt-http-ro` | `@mcp-abap-adt/http-ro` | Streamable HTTP | as `mcp-abap-adt-http`, with the read-only tool set |
| `mcp-abap-adt-sse-ro` | `@mcp-abap-adt/sse-ro` | HTTP + SSE | as `mcp-abap-adt-sse`, with the read-only tool set |
| `mcp-abap-adt-compact-ro` | `@mcp-abap-adt/compact-ro` | stdio | as `mcp-abap-adt`, with the read-only compact tool set |
| `mcp-abap-adt-compact-http-ro` | `@mcp-abap-adt/compact-http-ro` | Streamable HTTP | as `mcp-abap-adt-http`, with the read-only compact tool set |
| `mcp-abap-adt-compact-sse-ro` | `@mcp-abap-adt/compact-sse-ro` | HTTP + SSE | as `mcp-abap-adt-sse`, with the read-only compact tool set |

**The binary fixes the tool set** (19.0.0): every binary's table is its transport's, the same for
the four tool sets — its help differs only in its name and its TOOLS section. There is no
`--exposition`; see [`--exposition` is gone](#handler-exposition).

Each binary's `--help` lists exactly its own table; `--version` prints its version.

```bash
mcp-abap-adt --help
mcp-abap-adt-http --help
mcp-abap-adt-sse --help
```

## Options of every binary

These rows are lib's shared rows: each binary's table holds them, with the same forms and meaning.

| CLI | Environment | YAML | Value | Meaning |
|-----|-------------|------|-------|---------|
| `--conf=<path>` (alias `--config`) | — | — | path | The YAML config file of this binary; a missing file gets the binary's template and the start ends |
| `--system-type=<type>` | `SAP_SYSTEM_TYPE` | `system-type` | `onprem`, `cloud`, `legacy` | SAP system type, **required** (no default, never guessed): the tools offered, the connector and how the system's answers are read. stdio: a destination without it does not start; http/sse: the binary does not start (exit `1`, nothing listens). Inspection-only stdio needs none and lists every tool |
| `--state-idle-minutes=<minutes>` | `MCP_STATE_IDLE_MINUTES` | `state-idle-minutes` | 30–35791 | The idle bound on held state; see [Held State](#held-state) |
| `--shutdown-timeout=<seconds>` | `MCP_SHUTDOWN_TIMEOUT` | `shutdown-timeout` | 1-86400 | Forces a shutdown not finished after this many seconds (default: none); see [Shutdown](#shutdown) |
| `--help`, `-h` | — | — | — | The binary's help |
| `--version`, `-v` | — | — | — | The binary's version |

**CLI wins over the environment, which wins over YAML.** `.env` files and environment variables
hold secrets and the session; YAML holds configuration only. An invalid port, enum value or flag
value is **refused at startup**, naming the parameter in the form you used
(`Invalid --browser-auth-port: "abc". Must be a port between 1 and 65535`), instead of being
ignored.

### `--transport` is gone

`--transport`, `MCP_TRANSPORT` and the YAML key `transport`, with any value, stop every binary with
its sentence:

- `mcp-abap-adt` (and `mcp-abap-adt-compact`): "`--transport` is gone: `mcp-abap-adt` serves
  stdio; for Streamable HTTP run `mcp-abap-adt-http`, for SSE `mcp-abap-adt-sse` (compact:
  `mcp-abap-adt-compact-http`, `mcp-abap-adt-compact-sse`)"
- `mcp-abap-adt-http` (and `mcp-abap-adt-compact-http`): "`--transport` is gone: `mcp-abap-adt-http` serves Streamable HTTP; for
  stdio run `mcp-abap-adt`, for SSE `mcp-abap-adt-sse`"
- `mcp-abap-adt-sse` (and `mcp-abap-adt-compact-sse`): "`--transport` is gone: `mcp-abap-adt-sse` serves SSE; for stdio run
  `mcp-abap-adt`, for Streamable HTTP `mcp-abap-adt-http`"

### YAML configuration file

```bash
mcp-abap-adt --conf=config.yaml --system-type=<onprem|cloud> # a template of mcp-abap-adt's table when missing
mcp-abap-adt-http --conf=http.yaml --system-type=<onprem|cloud> # a template of mcp-abap-adt-http's table
mcp-abap-adt --conf=config.yaml --mcp=TRIAL --system-type=cloud # the CLI overrides the file
```

Each binary writes and validates its own file: a key of another binary is refused naming the binary
that serves it. See [YAML Configuration](../configuration/YAML_CONFIG.md).

## `mcp-abap-adt` (stdio)

### Destination and login

| CLI | Environment | YAML | Value | Meaning |
|-----|-------------|------|-------|---------|
| `--mcp=<name>` | — | `mcp` | name | Default destination: `service-keys/<name>.json` and `sessions/<name>.env`, field by field |
| `--env=<name>` | — | `env` | name | One env file, `sessions/<name>.env` |
| `--env-path=<path>` | `MCP_ENV_PATH` | `env-path` | path | One env file by path or file name (relative to the working directory) |
| `--auth-broker-path=<dir>` | `AUTH_BROKER_PATH` | `auth-broker-path` | path | Base directory of `service-keys/` and `sessions/` (default: the platform paths) |
| `--unsafe` | `MCP_UNSAFE` | `unsafe` | flag | Write named destinations' sessions to disk instead of keeping them in memory |
| `--browser=<name>` | `MCP_BROWSER` | `browser` | `system`, `auto`, `chrome`, `edge`, `firefox`, `none`, `headless` | Browser for a login (default `system`), mapped by the platform; excludes `--browser-program` |
| `--browser-program=<program>` | `MCP_BROWSER_PROGRAM` | `browser-program` | a program | The program that opens the login URL; excludes `--browser` |
| `--renewal=<mode>` | `MCP_RENEWAL` | `renewal` | `refresh-then-login`, `refresh-only` | How an expired session is renewed (default `refresh-then-login`); `refresh-only` never logs in |
| `--browser-auth-port=<port>` | `MCP_BROWSER_AUTH_PORT` | `browser-auth-port` | 1-65535 | Login callback port (default `61001`) |
| `--login-timeout=<seconds>` | `MCP_LOGIN_TIMEOUT` | `login-timeout` | 1-86400 | Ends a browser login not finished after this many seconds (default: none) |
| `--auth-debug` | — | `auth-debug` | flag | Auth debugging: the token providers' debug lines go to stderr, and a refused token request's line names the first and last four characters of each secret it sent (default: off). **No environment variable** |
| `--connection-type=<type>` | `SAP_CONNECTION_TYPE` | `connection-type` | `http`, `rfc` | SAP connection type (default `http`) |
| `--mshost=<host>` | `SAP_MSHOST` | `mshost` | host | RFC: the message server host; needs `--msserv` or `--sysid` |
| `--msserv=<service>` | `SAP_MSSERV` | `msserv` | name or port | RFC: the message server service |
| `--sysid=<SID>` | `SAP_SYSID` | `sysid` | system id | RFC: the system id |
| `--group=<group>` | `SAP_GROUP` | `group` | logon group | RFC: the logon group (connection's default `PUBLIC`) |
| `--saprouter=<string>` | `SAP_SAPROUTER` | `saprouter` | SAProuter string | RFC: the SAProuter string, with either addressing |

The environment forms `MCP_DESTINATION` and `MCP_ENV` do **not** exist; use `--mcp` and `--env`
(or their YAML keys).

**What `mcp-abap-adt` refuses** (each stops the start, naming the form you used):

| Parameter | Words |
|---|---|
| `--transport`, `MCP_TRANSPORT`, YAML `transport` | the stdio sentence above |
| `--exposition`, YAML `exposition`, with any value | the sentence of its word, naming the binary of this transport that serves it (see [Handler Exposition](#handler-exposition)) |
| `--sse-host`, `--sse-port`, `--sse-path`, `--post-path`, `--sse-allowed-*`, `--sse-enable-dns-protection`, YAML `sse` | ``<form>: SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)`` |
| `--host`, `--port`, `--path`, `--http-*`, YAML `http` | ``<form>: Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)`` |
| `--tls-*` | ``<form>: TLS is an option of `mcp-abap-adt-http` and `mcp-abap-adt-sse` `` |
| `--allow-destination-header`, YAML `allow-destination-header` | ``<form> is gone: `mcp-abap-adt` serves the destination it is started with (--mcp, --env, --env-path); the HTTP and SSE binaries take credentials only from `x-sap-*` headers`` |

`MCP_SSE_*`, `MCP_HTTP_*` and `MCP_TLS_*` are not read by `mcp-abap-adt`.
| `--auth-broker`, `MCP_USE_AUTH_BROKER`, YAML `auth-broker` (16.0.0) | `<form> was removed in 16.0.0 — remove it from the configuration` |

### Environment file

**--env=\<destination\>** uses the platform sessions store; **--env-path=\<path|file\>** an
explicit `.env` file path (or relative file name).

```bash
mcp-abap-adt --env=trial --system-type=cloud # sessions/trial.env
mcp-abap-adt --env-path=/opt/config/sap-prod.env --system-type=<onprem|cloud> # explicit path
mcp-abap-adt --env-path=../configs/dev.env --system-type=<onprem|cloud> # relative to the current directory
```

The server resolves the env file in this order:
1. `--env-path=<path|file>` (or `MCP_ENV_PATH`)
2. `--env=<destination>` -> platform sessions path:
   - Unix: `~/.config/mcp-abap-adt/sessions/<destination>.env`
   - Windows: `%USERPROFILE%\\Documents\\mcp-abap-adt\\sessions\\<destination>.env`

**Nothing is looked up in the working directory.** A server started inside someone else's project
must not take their settings, so a `.env` there is read only when you name it
(`--env-path=./.env`). Without `--env`, `--env-path` or `--mcp` there is no default destination.

A file you name that does not exist is refused at startup, naming the parameter and the path.

The chosen file is read **and written back** with a renewed token, whatever `--unsafe` says.
It is read once per process: a change made from outside takes effect on restart.

### --mcp=\<destination\>

The destination the process serves.

```bash
mcp-abap-adt --mcp=TRIAL --system-type=cloud
```

- An XSUAA service key needs `XSUAA_MCP_URL` in `sessions/<name>.env` (the key carries the UAA,
  not the system).
- Without `--unsafe` the session is kept in memory: one browser login per process.

### --connection-type=\<type\>

How the server communicates with the SAP system: `http` (default, HTTP/HTTPS) or `rfc` (via the
SAP NW RFC SDK, any system it supports).

```bash
mcp-abap-adt --connection-type=rfc --env-path=my-system.env --system-type=<onprem|cloud>
```

RFC requires the SAP NW RFC SDK installed and configured. See
[RFC Setup Guide](../installation/RFC_SETUP.md). The same option can be set with
`SAP_CONNECTION_TYPE=rfc` in the process environment or in the `--env` / `--env-path` `.env`
(which joins the environment, never over a value already set), or YAML `connection-type: rfc`.
Precedence: the CLI flag, then the environment, then YAML.

### --mshost, --msserv, --sysid, --group, --saprouter

RFC through a message server and a logon group (load-balanced logon):

```bash
mcp-abap-adt --connection-type=rfc --env-path=my-system.env --system-type=onprem \
  --mshost=<message server host> --sysid=<SID> --group=<logon group>
```

- `--mshost` needs `--msserv` or `--sysid`. With neither, `@mcp-abap-adt/connection` refuses the
  connection naming both, and the refusal reaches you as it came.
- With `--mshost` the RFC wire takes no host and no system number from `SAP_URL`; `SAP_SYSNR` is
  not read.
- `--group` absent: connection uses `PUBLIC`. The server adds no default and checks nothing; it
  passes the five as configured.
- `--saprouter` works with either addressing.
- Each has an environment form (`SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP`,
  `SAP_SAPROUTER`), which the `--env` / `--env-path` `.env` may also state (it joins the
  environment, never over a value already set), and a YAML key of the option's name. Precedence,
  as for `--connection-type`: the CLI flag, then the environment, then YAML.

See [RFC Setup](../installation/RFC_SETUP.md#through-a-message-server-and-a-logon-group).

### --browser=\<name\>, --browser-program=\<program\>

The browser of a login (JWT / `authorization_code`), mapped by the platform:

| `--browser` | Linux | macOS | Windows | another platform |
|---|---|---|---|---|
| `system` (default), `auto` | `xdg-open` | `open` | the default browser | none: a `jwt` / `authorization_code` destination is refused at start (use `--browser=none` or `--browser-program`); other destinations start |
| `chrome` | `google-chrome` | `Google Chrome` | `chrome` | none (as above) |
| `edge` | `microsoft-edge` | `Microsoft Edge` | `msedge` | none (as above) |
| `firefox` | `firefox` | `Firefox` | `firefox` | none (as above) |
| `none`, `headless` | no browser: the URL on stderr; the login waits | the same | the same | the same |

A name outside the table is refused at start on every platform. On another platform only a
destination that logs in (`jwt` / `authorization_code`) is refused for the missing browser, at the
startup check; the others start. `--browser-program` runs the program you name (an executable on
Linux, an application on macOS, a program on Windows; elsewhere run as on Linux); it excludes
`--browser`.

```bash
mcp-abap-adt --mcp=TRIAL --browser=firefox --system-type=cloud
mcp-abap-adt --mcp=TRIAL --browser-program=/opt/browsers/my-browser --system-type=cloud
mcp-abap-adt --mcp=TRIAL --browser=none --system-type=cloud # open the URL from stderr yourself
```

### --renewal=\<mode\>

How the provider renews an expired or refused token: `refresh-then-login` (the default) refreshes,
then logs in when there is no refresh token or the refresh is refused; `refresh-only` never logs
in — a destination that would need a login answers `renewal-declined` with "Logins are off
(`--renewal=refresh-only`): log in with `mcp-auth`, or start without it."

### --browser-auth-port=\<port\>

Callback port of the browser login (JWT / `authorization_code`). The default is **`61001`**;
`0`, `70000`, `-1` or `abc` are refused at startup. Set it when the port is taken or the redirect
is registered elsewhere.

```bash
mcp-abap-adt --mcp=TRIAL --browser-auth-port=61005 --system-type=cloud
```

### Shutdown

On `SIGTERM`, `SIGINT` (and, for `mcp-abap-adt`, the end of stdin: your client closed the
transport) a binary stops taking calls — a call arriving from then on is answered "The server is
shutting down." and reaches no tool —, **logs off every ADT session it opened at once** — the
logoff is what releases any lock a tool holds — and interrupts the running tools: **nothing waits
for a running tool**, a queued call never starts, and a write whose `UNLOCK` was still to come
never sends it (its lock goes with the logoff). No state undo is sent: the logoff ends the held
state (a debug session included). Then — `mcp-abap-adt` only — it writes the pending session
secrets. It exits `0`, or `1` with one stderr line per fact not done. **There is no deadline**
(18.x gave up after 30 s). An SSE connection that closes is handled the same way for its own
sessions; over Streamable HTTP a client that drops its request closes nothing.

`--shutdown-timeout=<seconds>` (`MCP_SHUTDOWN_TIMEOUT`, YAML `shutdown-timeout`; a whole number
from 1 to 86400, **no default**) ends the waiting after that long, and so does a second `SIGTERM`
/ `SIGINT`: the forced close. Nothing more is waited for — not a session write, not a flush —
but each ADT session's logoff, which is still written (a logoff whose write never completes, a
system that never takes the bytes, keeps the process until it is killed), and the exit is `1`, naming each tool
still running (`Still running at the forced close: <tool>`) and the step cut short.
**What it costs**: a session write lost — a refresh token the token endpoint refused can come back
on the next start. Set it against the time your supervisor waits before it kills the process (a
container's stop grace, a service manager's `TimeoutStopSec`), a few seconds below it.

A crash outside a tool (an uncaught exception, an unhandled promise rejection) runs the same
forced close: every ADT session is logged off, one stderr line names the failure by its class,
exit `1`. A process that is killed (`SIGKILL`, out of memory) cannot log off: SAP's own idle
timeout ends its sessions and their locks — unless you act first. On stdio its HTTP sessions are
recorded in `<config dir>/runtime/` (`--auth-broker-path` moves it), and a later stdio server
process of the same destination starts on the one it finds (with several it logs on normally),
lists them (`ListLeftoverSessions`, compact `HandlerLeftoverSessionList`) and logs off the one you
choose: [Leftover SAP sessions](README.md#leftover-sap-sessions-of-a-killed-process).
An http or sse server records none: one such server holds the sessions of many users.

```bash
mcp-abap-adt-http --shutdown-timeout=25 --system-type=<onprem|cloud>
```

### --login-timeout=\<seconds\>

A bound on each browser login, opt-in: a login that has not finished after this many seconds is
ended `aborted`, and the tool call answers the chain's words with the server's sentence "The login
was ended by the server's login timeout (`--login-timeout=<n>`)." — naming the bound in the form
you set it (`MCP_LOGIN_TIMEOUT=<n>`, or `login-timeout: <n>` in the configuration file). A whole
number from 1 to
86400; `0`, `86401`, `1.5` or `abc` are refused at startup. **There is no default**: without it a
login ends when the browser answers, the identity provider refuses, or the session of the request
that waits for it ends — a client that closes its connection ends the login it started when no
other request waits for it. A tool call cannot be cancelled: a cancel ends no login.

```bash
mcp-abap-adt --mcp=TRIAL --login-timeout=300 --system-type=cloud
```

### --auth-debug

Off by default. With it, `mcp-abap-adt` builds every broker with `authDebug: true`, routes the
broker's and the token providers' log lines to **stderr** (never stdout), and prints one warning
line at start: a refused token request's debug line then names the first and last four characters
of each secret the request carried (a secret shorter than sixteen characters is shown by its
length only). It is read from the command line or the configuration file (`auth-debug: true`) and
**from no environment variable** — neither `DEBUG_*` nor `MCP_AUTH_DEBUG` turns it on. Without it a
secret reaches no line at all. The authorization server's `error_description` is read by nothing,
with or without it.

```bash
mcp-abap-adt --mcp=TRIAL --auth-debug --system-type=cloud
```

The startup summary shows a secret by its presence only (`Password: set`), whatever the flag says.

See [Authentication & Destinations](AUTHENTICATION.md) for the supported authentications.

### Held state

`--state-idle-minutes` bounds the stdio instance's held state (a debug session); see
[Held State](#held-state).

### The debugger's ids

`SAP_DEBUG_TERMINAL_ID` / `SAP_DEBUG_IDE_ID` (where the debugger is served): first found, the
destination's `.env`, then the process environment; else random per instance. See
[Debugger](DEBUGGER.md#the-sap-ids-and-when-to-share-one).

`SAP_DEBUG_BREAKPOINT_CONFLICT` (`replace`, the default, or `refuse-if-held`): whether a take-over
of the debugger, and every later change of its breakpoints, first asks if another debugger
listens for the same SAP user, and refuses if so. Same order. See
[Debugger](DEBUGGER.md#the-breakpoint-set-and-its-key).

## `mcp-abap-adt-http` (Streamable HTTP)

No destination, no login: each request's credentials come from its `x-sap-url`, `x-sap-client`,
and `x-sap-jwt-token` or `x-sap-login` + `x-sap-password` headers. A request without them is
answered `400`; a request with `x-mcp-destination` is answered `400` ("destinations are served
only by mcp-abap-adt (stdio); send x-sap-* headers").

| CLI | Environment | YAML | Value | Meaning |
|-----|-------------|------|-------|---------|
| `--host=<host>` (alias `--http-host`) | `MCP_HTTP_HOST` | `http.host` | host | Host to listen on (default `127.0.0.1`; `0.0.0.0` for every interface) |
| `--port=<port>` (alias `--http-port`) | `MCP_HTTP_PORT` | `http.port` | 1-65535 | Port to listen on (default `3000`) |
| `--path=<path>` (alias `--http-path`) | — | — | path | The MCP endpoint path (default `/mcp/stream/http`) |
| `--http-json-response` | `MCP_HTTP_ENABLE_JSON_RESPONSE` | `http.json-response` | flag | Answer with JSON responses rather than SSE streams |
| `--http-allowed-hosts=<list>` | `MCP_HTTP_ALLOWED_HOSTS` | `http.allowed-hosts` | list | Host header values accepted with DNS-rebinding protection (exact, with the port) |
| `--http-allowed-origins=<list>` | `MCP_HTTP_ALLOWED_ORIGINS` | `http.allowed-origins` | list | Origin header values accepted with DNS-rebinding protection (exact, with the scheme) |
| `--http-enable-dns-protection` | `MCP_HTTP_ENABLE_DNS_PROTECTION` | `http.enable-dns-protection` | flag | Enable DNS-rebinding protection |
| `--tls-cert=<path>` | `MCP_TLS_CERT` | `http.tls.cert` | path | TLS certificate (PEM); with `--tls-key`, HTTPS |
| `--tls-key=<path>` | `MCP_TLS_KEY` | `http.tls.key` | path | TLS private key (PEM); with `--tls-cert`, HTTPS |
| `--tls-ca=<path>` | `MCP_TLS_CA` | `http.tls.ca` | path | CA certificate (PEM), optional, beside cert and key |

Per request, the system context comes from the headers `x-sap-responsible`,
`x-sap-master-system`, `x-sap-language`, and the debugger's `x-sap-debug-terminal-id` /
`x-sap-debug-ide-id` / `x-sap-debug-breakpoint-conflict`; then `SAP_RESPONSIBLE`,
`SAP_MASTER_SYSTEM`, `SAP_DEBUG_TERMINAL_ID`, `SAP_DEBUG_IDE_ID`,
`SAP_DEBUG_BREAKPOINT_CONFLICT` of the environment. Held state is reached again with its `state_handle`, on
the instance that holds it.

**What `mcp-abap-adt-http` refuses** (each stops the start, naming the form you used):

| Parameter | Words |
|---|---|
| `--transport`, `MCP_TRANSPORT`, YAML `transport` | the http sentence above |
| `--exposition`, YAML `exposition`, with any value | the sentence of its word, naming the binary of this transport that serves it (see [Handler Exposition](#handler-exposition)) |
| `--mcp`, `--env`, `--env-path`, `--auth-broker-path`, `--allow-destination-header`, `--unsafe`, `--connection-type`, `--mshost`, `--msserv`, `--sysid`, `--group`, `--saprouter`, `--browser*`, `--login-timeout`, `--renewal`, `--auth-debug`, and their YAML keys | ``<form>: destinations and logins are served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers`` |
| `--sse-host`, `--sse-port`, `--sse-path`, `--post-path`, `--sse-allowed-*`, `--sse-enable-dns-protection`, YAML `sse` | ``<form>: SSE is served by `mcp-abap-adt-sse` (`@mcp-abap-adt/sse`)`` |

`MCP_SSE_*`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_BROWSER*`, `MCP_LOGIN_TIMEOUT`, `MCP_RENEWAL`,
`AUTH_BROKER_PATH`, `SAP_CONNECTION_TYPE`, `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP` and
`SAP_SAPROUTER` are not read by `mcp-abap-adt-http`.

TLS needs `--tls-cert` and `--tls-key` together; one without the other (or `--tls-ca` alone) is
refused at start.

### Held state

`--state-idle-minutes` bounds each pooled instance's held state, reached again by its
`state_handle`; see [Held State](#held-state).

### DNS-rebinding protection

A Host + Origin allowlist; NOT browser CORS — no Access-Control-Allow-Origin headers are emitted.
Only effective when `--http-enable-dns-protection` is set AND at least one allowlist is non-empty.
A non-allowlisted Host/Origin gets HTTP 403.

```bash
mcp-abap-adt-http --system-type=<onprem|cloud> \
  --http-enable-dns-protection \
  --http-allowed-hosts=localhost:3000 \
  --http-allowed-origins=https://app.example.com
```

### Example

```bash
mcp-abap-adt-http --host=0.0.0.0 --port=8080 --system-type=<onprem|cloud>
mcp-abap-adt-http-ro --host=0.0.0.0 --port=8080 --system-type=<onprem|cloud> # the readonly tools alone
```

## `mcp-abap-adt-sse` (HTTP + SSE)

No destination, no login: each SSE connection's credentials come from the `x-sap-*` headers of
the `GET` that opens it; a `POST` is routed by its `sessionId` alone. A `GET` without them is
answered `400`; a `GET` or `POST` with `x-mcp-destination` is answered `400`.

| CLI | Environment | YAML | Value | Meaning |
|-----|-------------|------|-------|---------|
| `--sse-host=<host>` | `MCP_SSE_HOST` | `sse.host` | host | Host to listen on (default `127.0.0.1`; `0.0.0.0` for every interface) |
| `--sse-port=<port>` | `MCP_SSE_PORT` | `sse.port` | 1-65535 | Port to listen on (default `3001`) |
| `--sse-path=<path>` | — | — | path | The path of the `GET` that opens an SSE connection (default `/sse`) |
| `--post-path=<path>` | — | — | path | The path of a connection's `POST` messages (default `/messages`) |
| `--sse-allowed-hosts=<list>` | `MCP_SSE_ALLOWED_HOSTS` | `sse.allowed-hosts` | list | Host header values accepted with DNS-rebinding protection (exact, with the port) |
| `--sse-allowed-origins=<list>` | `MCP_SSE_ALLOWED_ORIGINS` | `sse.allowed-origins` | list | Origin header values accepted with DNS-rebinding protection (exact, with the scheme) |
| `--sse-enable-dns-protection` | `MCP_SSE_ENABLE_DNS_PROTECTION` | `sse.enable-dns-protection` | flag | Enable DNS-rebinding protection |
| `--tls-cert=<path>` | `MCP_TLS_CERT` | `sse.tls.cert` | path | TLS certificate (PEM); with `--tls-key`, HTTPS |
| `--tls-key=<path>` | `MCP_TLS_KEY` | `sse.tls.key` | path | TLS private key (PEM); with `--tls-cert`, HTTPS |
| `--tls-ca=<path>` | `MCP_TLS_CA` | `sse.tls.ca` | path | CA certificate (PEM), optional, beside cert and key |

The opening `GET`'s `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` /
`x-sap-debug-breakpoint-conflict` (and the other system
context headers) come first, then `SAP_DEBUG_*` of the environment. Held state lives in the
connection's instance until the connection closes.

**Held state**: `--state-idle-minutes` bounds each SSE connection's instance, which holds its state
until the connection closes; see [Held State](#held-state).

**What `mcp-abap-adt-sse` refuses** (each stops the start, naming the form you used):

| Parameter | Words |
|---|---|
| `--transport`, `MCP_TRANSPORT`, YAML `transport` | the sse sentence above |
| `--exposition`, YAML `exposition`, with any value | the sentence of its word, naming the binary of this transport that serves it (see [Handler Exposition](#handler-exposition)) |
| the destination and login options, as for `mcp-abap-adt-http` (`--auth-broker-path`, `--connection-type` and the message-server options included), and their YAML keys | ``<form>: destinations and logins are served only by `mcp-abap-adt` (stdio); send `x-sap-*` headers`` |
| `--host`, `--port`, `--path`, `--http-*`, YAML `http` | ``<form>: Streamable HTTP is served by `mcp-abap-adt-http` (`@mcp-abap-adt/http`)`` |

`MCP_HTTP_*`, `MCP_ENV_PATH`, `MCP_UNSAFE`, `MCP_BROWSER*`, `MCP_LOGIN_TIMEOUT`, `MCP_RENEWAL`,
`AUTH_BROKER_PATH`, `SAP_CONNECTION_TYPE`, `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP` and
`SAP_SAPROUTER` are not read by `mcp-abap-adt-sse`.

`--host` and `--port` are Streamable HTTP's: the SSE binary listens on `--sse-host` /
`--sse-port`.

### Example

```bash
mcp-abap-adt-sse --sse-host=0.0.0.0 --sse-port=3001 --sse-path=/sse --post-path=/messages --system-type=<onprem|cloud>
mcp-abap-adt-sse --system-type=<onprem|cloud> \
  --sse-enable-dns-protection \
  --sse-allowed-hosts=localhost:3001 \
  --sse-allowed-origins=https://app.example.com
```

## Handler Exposition

**`--exposition` is gone (19.0.0): the binary fixes its tool set.** Install the package whose
binary serves the tools you want:

| Kind | Binaries | Tools |
|---|---|---|
| core | `mcp-abap-adt`, `mcp-abap-adt-http`, `mcp-abap-adt-sse` | readonly (with system and search), high, debug, background runs; on stdio the leftover-session list and logoff |
| core-ro | `mcp-abap-adt-ro`, `mcp-abap-adt-http-ro`, `mcp-abap-adt-sse-ro` | readonly (with system and search); on stdio the leftover-session list and logoff |
| compact | `mcp-abap-adt-compact`, `-compact-http`, `-compact-sse` | the 27 compact tools, the four debugger verbs, background runs; on stdio the leftover-session list and logoff |
| compact-ro | `mcp-abap-adt-compact-ro`, `-compact-http-ro`, `-compact-sse-ro` | the 16 compact tools that change nothing; on stdio the leftover-session list and logoff |

`--exposition` in either spelling, with any value or none, and the YAML key `exposition`, stop
every binary before anything is read, with one sentence per word naming the binary of the same
transport that serves what the word asked for — for example, on `mcp-abap-adt-http`:

```text
[MCP] --exposition is gone (19.0.0): the binary fixes its tool set, so remove it; the readonly tools alone (with system and search) are served by `mcp-abap-adt-http-ro` (`@mcp-abap-adt/http-ro`)
```

`low` keeps that sentence in the full binaries: *"the low set is gone from mcp-abap-adt / -http /
-sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)"*; a compact binary, which already
serves the low set's analogue, says to remove the flag. Every word and its sentence:
[Handlers Management](HANDLERS_MANAGEMENT.md#--exposition-is-gone).

The debugger is served by every write binary, always: in user mode a breakpoint or a listener
catches every request of the request user (the connected SAP user unless another is named). Where
that must not be possible, run a `-ro` binary. See [Debugger](DEBUGGER.md).

## Held State

**--state-idle-minutes=\<minutes\>** (env `MCP_STATE_IDLE_MINUTES`, YAML `state-idle-minutes`), on
every binary.

State an instance holds between tool calls — a debug session: breakpoints, the listener, a
stopped debuggee — ends after this many minutes without a tool call on that instance: a complete
stop, the same as `DebugStop`, and its `state_handle` is no longer available. Default **30**,
and never less; at most **35791** (about 24.8 days, the longest a timer can hold). A value
under 30 or over 35791, a fraction or a non-number is refused at startup
(`Invalid --state-idle-minutes: "29". Must be a whole number of minutes, at least 30`). CLI wins
over the environment, which wins over YAML.

What counts as activity: a tool call on the instance. The bound counts from the end of the last
call and is paused while any call is in flight, so a wait on the SAP system is never timed; the
listener's own background re-polls do not count. It exists because the listener re-polls by
itself, so SAP's own session timeout never ends an abandoned debug session.

- `mcp-abap-adt`: the stdio instance's held state.
- `mcp-abap-adt-http`: each pooled instance's held state, reached again with its `state_handle`.
- `mcp-abap-adt-sse`: each SSE connection's instance, until the connection closes.

```bash
mcp-abap-adt --mcp=TRIAL --state-idle-minutes=60 --system-type=cloud
mcp-abap-adt-http --state-idle-minutes=60 --system-type=<onprem|cloud>
```

## Environment Variables

### SAP Connection (`mcp-abap-adt`)

These are typically set in the destination's `.env` file:

**Basic Authentication:**
- `SAP_URL` - SAP system URL (required)
- `SAP_CLIENT` - SAP client number (required)
- `SAP_AUTH_TYPE` - Authentication type: `basic`, `snc` or `jwt` (**required**: a `.env` without it is refused with `Destination "X" cannot be used: authType`). `saml`, `certificate` and `kerberos` are not supported
- `SAP_SYSTEM_TYPE` - SAP system type: `cloud`, `onprem` or `legacy` (same as `--system-type`). **Required (19.0.0): there is no default** — not for the tools offered (e.g., Programs require `onprem`), not for the connector (a `jwt` destination is no longer taken for cloud), and the kind is never guessed from the URL. Without it a stdio destination does not start (exit `1`, naming the parameter), and neither do Streamable HTTP / SSE (exit `1` before anything listens). Inspection-only stdio (no destination) needs none: it filters nothing and lists every tool of its set. It may be set in the process environment or in the `--env` / `--env-path` `.env` (which joins the environment, never over a value already set), as `--system-type` or as YAML `system-type`. Precedence: the CLI flag, then the environment, then YAML. `legacy` is accepted as a value but no tool declares that environment: support for legacy systems (BASIS < 7.50) is parked on the `parked/legacy-support` branch until it can be tried against a live one.
- `SAP_USERNAME` - SAP username (for basic auth). On-premise, also the login the responsible of created objects falls back to when no `SAP_RESPONSIBLE` is stated (the destination's own first, then the process environment's); not on a cloud system, whose login is the system's user. The environment is read once: a change while the server runs is not picked up
- `SAP_PASSWORD` - SAP password (for basic auth)
- `SAP_CONNECTION_TYPE` - Connection transport: `http` (default) or `rfc` (process environment, or the `--env` / `--env-path` `.env`)
- `SAP_MSHOST`, `SAP_MSSERV`, `SAP_SYSID`, `SAP_GROUP`, `SAP_SAPROUTER` - RFC through a message server and a logon group: `SAP_MSHOST` with `SAP_MSSERV` or `SAP_SYSID`, the logon group (connection's default `PUBLIC`), a SAProuter string. Process environment, or the `--env` / `--env-path` `.env`; see [--mshost, …](#--mshost---msserv---sysid---group---saprouter)
- `SAP_LANGUAGE` - SAP language (optional, e.g., EN, DE)
- `SAP_MASTER_SYSTEM` - Master system of created objects (the system id), optional; no tool takes it as an argument. In the destination's own `.env` (the `--env` / `--env-path` file, or `sessions/<destination>.env`) or the process environment; the destination's `.env` wins over the environment. Used only where an on-premise system has no `systeminformation` (`404`): elsewhere the system id the system names wins; with neither, the attribute is left out of the request and the system applies itself. Never refused
- `SAP_RESPONSIBLE` - Responsible person of created objects, optional, and used only where an on-premise system has no `systeminformation` (it answers `404`): elsewhere the user the system names is the responsible, on every kind. Same order; when none is stated, the login (`SAP_USERNAME` of the destination, then of the environment). A create that finds none (SNC) is refused naming `SAP_RESPONSIBLE`, nothing sent. A message class is created with the system's own default responsible (the one exception)
- `SAP_DEBUG_TERMINAL_ID`, `SAP_DEBUG_IDE_ID` - The debugger's terminal id and IDE id, optional, each on its own. In the destination's own `.env` or the process environment, the `.env` first. Read when an instance's debugger is first used; when none is stated, each is random per instance. The system keys its listener conflict by the IDE id: a shared one means shared catches and no conflict — your choice, see [Debugger](DEBUGGER.md#the-sap-ids-and-when-to-share-one). Terminal mode catches the requests that carry both ids, and the runs the server starts carry them; it needs neither stated. Not validated by the server
- `SAP_DEBUG_BREAKPOINT_CONFLICT` - `replace` (default) or `refuse-if-held`: whether a take-over of the debugger, and every later change of its breakpoints, first asks if another debugger listens for the same SAP user, and refuses if so (a start without take-over always asks). Same order (on `mcp-abap-adt-http` / `mcp-abap-adt-sse`, the `x-sap-debug-breakpoint-conflict` header first). An unknown value is refused. See [Debugger](DEBUGGER.md#the-breakpoint-set-and-its-key)

On `mcp-abap-adt-http` and `mcp-abap-adt-sse` the system context comes from the request's headers
(`x-sap-responsible`, `x-sap-master-system`, `x-sap-language`, `x-sap-debug-terminal-id`,
`x-sap-debug-ide-id`, `x-sap-debug-breakpoint-conflict`), then `SAP_RESPONSIBLE`,
`SAP_MASTER_SYSTEM`, `SAP_DEBUG_TERMINAL_ID`, `SAP_DEBUG_IDE_ID`, `SAP_DEBUG_BREAKPOINT_CONFLICT`
of the environment; with `x-sap-login`, the login is the responsible when none
is stated.

**SNC (RFC only, no user, no password):**
- `SAP_AUTH_TYPE=snc`; start with `--connection-type=rfc`
- `SAP_SNC_PARTNERNAME` - The system's SNC name (required)
- `SAP_SNC_QOP`, `SAP_SNC_LIB`, `SAP_SNC_MYNAME` - Optional

**JWT/OAuth2 Authentication:**
- `SAP_GRANT_TYPE` - `authorization_code` (**required** with `SAP_AUTH_TYPE=jwt`). A token you hold is not served over stdio: send it in the `x-sap-jwt-token` header to `mcp-abap-adt-http` or `mcp-abap-adt-sse`, or create the session with `mcp-auth`.
- `SAP_JWT_TOKEN` - The session's token, written by `mcp-auth` or the server (never by hand)
- `SAP_REFRESH_TOKEN` - Refresh token for automatic token renewal
- `SAP_UAA_URL` - UAA URL for OAuth2 (alternative: `UAA_URL`)
- `SAP_UAA_CLIENT_ID` - UAA Client ID (alternative: `UAA_CLIENT_ID`)
- `SAP_UAA_CLIENT_SECRET` - UAA Client Secret (alternative: `UAA_CLIENT_SECRET`)

### Auth-Broker (`mcp-abap-adt`)

- `AUTH_BROKER_PATH` - Base directory of `service-keys/` and `sessions/` (see the table above)
- `DEBUG_AUTH_LOG` - Enable debug logging for auth-broker (true|false)
- `DEBUG_AUTH_BROKER` - Alias for `DEBUG_AUTH_LOG`

### Debug

- `DEBUG_HANDLERS` - Enable handler debug logging (true|false)
- `DEBUG_CONNECTORS` - Enable connector debug logging (true|false)
- `DEBUG_CONNECTION_MANAGER` - Enable connection manager debug logging (true|false)
- `HANDLER_LOG_SILENT` - Disable all handler logs (true|false)
- `DEBUG_RFC_WIRE` - Put the RFC request headers and both bodies on the debug
  channel (true|1). **RFC only**, off by default, and the only way to see a
  payload that was mis-serialised before it reached `SADT_REST_RFC_ENDPOINT`.
  Setting it is enough: where nothing else configured a logger, asking for the
  wire brings one at `debug`, **writing to stderr** — stdout carries JSON-RPC
  in stdio transport and must stay clean. A logger the caller already supplied
  is used as it is and never redirected, so a caller who supplies one that
  writes to stdout is responsible for that choice.
  Credential header values are replaced with `[redacted]` by
  `@mcp-abap-adt/connection`, so the output is safe to paste into an issue —
  but bodies are clipped, not redacted, so treat a body carrying a secret
  accordingly.
- `DEBUG_RFC_BODY_CHARS` - Ceiling on a logged body, in characters (default
  2000). `0` logs the size alone, `Infinity` the whole body.

## Priority Order

When the same option is specified multiple ways, this is the priority order (highest to lowest):

1. **Command line arguments** (`--port=8080`)
2. **Environment variables** (`MCP_HTTP_PORT=8080`)
3. **YAML config file** (configuration only; secrets are refused there)
4. **Default values**

```bash
# Port 9000 wins (command line)
export MCP_HTTP_PORT=8080
mcp-abap-adt-http --port=9000 --system-type=<onprem|cloud>
```

## Common Usage Patterns

### Development Setup

```bash
cd ~/dev/my-abap-project
cat > .env << EOF
SAP_URL=https://dev.sap.company.example
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_SYSTEM_TYPE=onprem
SAP_USERNAME=developer
SAP_PASSWORD=dev-password
EOF

# A .env in the current directory is read only when named
mcp-abap-adt --env-path=./.env --system-type=<onprem|cloud>
```

### RFC Connection Setup

```bash
cat > rfc-system.env << EOF
SAP_URL=https://sap.company.example
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_SYSTEM_TYPE=onprem
SAP_USERNAME=developer
SAP_PASSWORD=dev-password
EOF

mcp-abap-adt --connection-type=rfc --env-path=rfc-system.env --system-type=<onprem|cloud>
# Or from the process environment
SAP_CONNECTION_TYPE=rfc mcp-abap-adt --env-path=rfc-system.env --system-type=<onprem|cloud>
```

### A shared HTTP server

```bash
# Every client sends its own x-sap-* headers; the server holds no credential
mcp-abap-adt-http --host=0.0.0.0 --port=8080 --system-type=<onprem|cloud> \
  --tls-cert=/etc/mcp/server.crt --tls-key=/etc/mcp/server.key
```

### Multi-Environment

```bash
# Structure
~/sap-configs/
├── dev.env
├── test.env
└── prod.env

alias mcp-dev='mcp-abap-adt --env-path=~/sap-configs/dev.env --system-type=<onprem|cloud>'
alias mcp-test='mcp-abap-adt --env-path=~/sap-configs/test.env --system-type=<onprem|cloud>'
```

## Troubleshooting

### Server Won't Start

The start stops with one line on stderr naming the parameter: an invalid value, an option of
another binary (naming the binary that serves it), or `--transport`. A named file that does not
exist is refused, naming the parameter and the path:
```bash
ls -la ~/configs/sap.env
```

### Port Already in Use

```bash
lsof -i :3000
mcp-abap-adt-http --port=3002 --system-type=<onprem|cloud>
```

### No Destination, or the Wrong One

`mcp-abap-adt` reads only the file you name — never a `.env` it happens to find in the working
directory. Name it with `--env-path=<path>` (`--env-path=./.env` for the current directory),
`--env=<name>` (`sessions/<name>.env`), or use `--mcp=<name>`. The startup summary on stderr names
the destination and the file it serves.

## See Also

- [Installation Guide](../installation/INSTALLATION.md)
- [Client Configuration](CLIENT_CONFIGURATION.md)
- [YAML Configuration](../configuration/YAML_CONFIG.md)
- [Available Tools](AVAILABLE_TOOLS.md)
