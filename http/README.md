# @mcp-abap-adt/http

The Streamable HTTP server of MCP ABAP ADT: the binary `mcp-abap-adt-http`, and
`StreamableHttpServer`, which serves the ADT tools of
[`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib) over MCP Streamable HTTP on an
Express app, with DNS rebinding protection and optional TLS. Licensed AGPL-3.0-only.

```bash
npm install -g @mcp-abap-adt/http
mcp-abap-adt-http --port=3000 --system-type=onprem
```

**The binary fixes the tool set (19.0.0).** `mcp-abap-adt-http` serves readonly (with system and search),
high, the debugger and background runs; the readonly
tools alone are [`@mcp-abap-adt/http-ro`](https://www.npmjs.com/package/@mcp-abap-adt/http-ro) (`mcp-abap-adt-http-ro`). There is no
`--exposition`: passing it, or a config file's `exposition`, stops the start with a sentence naming
the binary to install instead.

**No leftover-session tools, no session files (19.0.0).** One server holds the sessions of many
users, so it writes no runtime session file and serves no leftover-session tool; those are the
stdio binaries' (`mcp-abap-adt`, `mcp-abap-adt-ro`). Resuming a SAP session here is yours to do if you hold what it takes;
otherwise SAP ends it on its own timeout, which releases its locks: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#stdio-leftover-sap-sessions-of-a-killed-process).

**No low set (19.0.0).** `--exposition=…,low` stops the start with this sentence: *"the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)"*. Its single-step operations are compact's — see [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries).

## Credentials: each request's headers, nothing else

Every request carries its own credentials, and the server takes them from nowhere else: no
destination, no service key, no session file, no login, no auth broker.

| Header | |
|---|---|
| `x-sap-url` | the system's URL (required) |
| `x-sap-client` | the client (optional) |
| `x-sap-jwt-token` | a token you hold, presented as a Bearer token |
| `x-sap-login` + `x-sap-password` | a user and password (basic) |

- A request without `x-sap-url` and either a token or a user and password is answered `400`:
  *this server takes credentials only from the request's headers: send x-sap-url with
  x-sap-jwt-token, or with x-sap-login and x-sap-password*. `ping` answers without them.
- A request carrying `x-mcp-destination` is answered `400`: *destinations are served only by
  mcp-abap-adt (stdio); send x-sap-* headers*. Destinations — service keys, sessions, the browser
  login — are [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core)'s, over stdio.
- Each request builds its own credential and its own connection; nothing is stored, shared or
  cached across requests. The one exception is held state (below): the connections it opened stay
  with it until it ends.
- The system kind follows `--system-type` / `SAP_SYSTEM_TYPE` (`cloud`, `onprem`, `legacy`) and is
  required — no request header states it: it decides the tools offered and how the system's
  `systeminformation` is read. Without it the binary does not start: exit `1` before anything
  listens, on stderr `[MCP] The SAP system type is required — set --system-type, SAP_SYSTEM_TYPE (the environment) or system-type
  (YAML) to onprem, cloud or legacy; the server did not start`. (An embedder's own host of the
  exported server class reads `SAP_SYSTEM_TYPE` at each call: a call without it is refused
  `system_type_required`, nothing sent.)

Per request, beside the credential: `x-sap-responsible`, `x-sap-master-system`, `x-sap-language`,
and the debugger's `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` (then `SAP_RESPONSIBLE`,
`SAP_MASTER_SYSTEM`, `SAP_DEBUG_TERMINAL_ID`, `SAP_DEBUG_IDE_ID` of the environment). With
`x-sap-login`, the login is the responsible when none is stated.

The system is asked first, when the instance's connection is created (`systeminformation`, by
`@mcp-abap-adt/responsible-rules`; each request's credential is its own destination): its user and system id win over
these headers. They count only where an on-premise system gives no information — the responsible
if stated, else the login, else the call is refused `system_user_unknown`; on ABAP Cloud no
information is an error (`cloud_without_systeminformation` for a `404`, else
`system_lookup_failed`). See [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#every-transport-only-lock-and-unlock-are-sent-stateful-and-an-instances-calls-run-one-at-a-time).

## Options

As before 19.0.0, under the same names: `--host` / `--http-host` / `MCP_HTTP_HOST`, `--port` /
`--http-port` / `MCP_HTTP_PORT` (default `3000`), `--path` / `--http-path` (default
`/mcp/stream/http`), `--http-json-response` / `MCP_HTTP_ENABLE_JSON_RESPONSE`,
`--http-allowed-hosts` / `MCP_HTTP_ALLOWED_HOSTS`, `--http-allowed-origins` /
`MCP_HTTP_ALLOWED_ORIGINS`, `--http-enable-dns-protection` / `MCP_HTTP_ENABLE_DNS_PROTECTION`,
`--tls-cert` / `--tls-key` / `--tls-ca` (`MCP_TLS_*`), `--system-type`, `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES`, `--conf`, `--help`, `--version`;
new in 19.0.0, `--shutdown-timeout` / `MCP_SHUTDOWN_TIMEOUT` (see [Shutdown](#shutdown)).
`mcp-abap-adt-http --help` lists them.

## Held state, and the long session

Every request is an MCP session of its own, served by a new instance unless it names an instance
that holds state. A tool that holds state — a long session, a lock, a batch, a debug session —
answers a `state_handle`. **Send it as the `state_handle` argument** of every call that must reach
that state: every tool of this binary declares that optional argument (the debugger tools keep
their own declaration, required where it is required). A client that sets request headers may
send it in the `x-mcp-state-handle` header instead; when both are sent, the header wins. Such a
call is routed to the instance that holds the state, one request at a time, and its own headers
give its credential. A tool call whose handle the pool does
not know — one that never existed, or whose state ended — is answered `state is not available`
by the pool itself, the same answer whatever the handle was, and no instance is made and nothing
logs on for it — a JSON-RPC array holding a tool call too, one such answer per request in it with
an `id` (an array whose tool call carries a `state_handle` argument is answered `400`); another request carrying such a handle (an `initialize`, a list) gets a new
instance, as a request without a handle does. The handle is a bearer secret: whoever holds it
reaches the state, and the server does not identify the caller. Held state ends
by its stop tool (a long session's: `SessionClose`), the idle bound (`--state-idle-minutes`, 30–35 791, default 30), or the server's
stop. See
[the debugger guide](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/DEBUGGER.md).

**The long session.** `SessionOpen` keeps an instance and its SAP connection for a run of calls
and answers `{ "state_handle": "…" }`. Every call carrying that `state_handle` runs on that
instance, on its held SAP session: no new connection, no `systeminformation` lookup, no logoff
between the calls. A call without it runs on a new instance, as before. Called with the handle of
an instance that already holds state (a lock, a batch, a debug session), or of an open session,
`SessionOpen` answers that same handle and keeps what the instance holds; called without a handle
it opens a new instance with a handle of its own — each long session is its own instance.
`SessionClose` with the handle answers `{ "closed": true, "held": { "locks": …, "batch": …,
"debug_session": … } }` — what the instance held — and once that answer is written the instance
leaves the pool and is closed: every SAP session it owns gets its logoff, which releases the locks
taken in it; an open batch and its recorded calls are dropped unsent; nothing is undone (the
logoff ends in SAP what the state held); the MCP server closes. From then on the handle answers
`state is not available` at once, whether or not SAP has answered the logoffs yet; the close
awaits each logoff's write and its answer with no timer of the server's, and the server's
shutdown awaits a close still running. `SessionClose` without a handle, or with an unknown one,
answers `state is not available`. A session never closed ends at the idle bound — no call on it for
`--state-idle-minutes`: its state ends, every SAP session of the instance is logged off, and the instance leaves the pool.
There is no list tool: the model keeps the handles it opened, and the handle is its only way back
to its session. Both tools change nothing in the system, so `mcp-abap-adt-http-ro` serves them too;
in batch mode they run at once and are never recorded — open leaves the batch open, close drops
it. No stdio or SSE binary serves them: there the instance lives as long as the connection.

**Locks (compact).** compact `HandlerLock` holds the lock as the pooled instance's state and answers its `state_handle`;
`HandlerUpdate`, `HandlerDelete` of a class include and `HandlerUnlock` under that lock send it as
the `state_handle` argument (or in the `x-mcp-state-handle` header) and reach the SAP session that
holds the lock — without it they reach another instance and are refused, sending nothing. A
request with another credential (a renewed token, a new user and password) works on the held
connection too: the instance keeps its SAP session and the lock, and the new credential is put in
force for its next sends; what SAP answers to that credential reaches the caller as it came. The
hold ends at the `UNLOCK`, or with the instance (`SessionClose` of a long session, the idle bound,
the server's stop), whose logoff releases the lock.

**Batch mode.** `BatchBegin` (compact: `HandlerBatch` with `action: 'begin'`) holds state and
answers the instance's `state_handle`: send it as the `state_handle` argument (or in
`x-mcp-state-handle`) on every call of the batch, `BatchEnd` and `BatchAnswers` included. A call
without it reaches an instance where no batch is open. See
[Batch Mode](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/BATCH_MODE.md#over-streamable-http).

## Every ADT session ends with a logoff

An instance logs off every ADT session it opened when it leaves the pool: a request's instance
after its request, when it holds nothing; a pooled instance when its state ends (its stop tool,
the idle bound); a long session's instance at its `SessionClose`, with no undo — the logoff ends
what it held. An instance whose state undo fails is kept for a retry — it has not left, and its
sessions stay open — until a later undo succeeds or the server shuts down, where its sessions are
logged off at once. (After the idle bound's stop a pooled instance's sessions are logged off even
when the undo failed.) The logoff is what releases a lock a tool left. A client that drops its
request closes nothing: the request's tool runs to its end, and its instance leaves the pool as
above — after its work when it holds nothing, at its state's end when it holds state.

## Shutdown

On `SIGTERM` / `SIGINT` / `SIGHUP` / `SIGQUIT` (`SIGBREAK` on Windows), or a crash outside a
tool (then exit `1`), the server stops taking requests (`503`, *the server is shutting down*;
a call already accepted whose body arrives later reaches no tool), stops listening, **logs off
every ADT session of every instance at once** — pooled instances and their held state's included;
no state undo is sent, the logoff ends the state — and interrupts the running tools: **nothing
waits for a running tool**, and a write whose `UNLOCK` was still to come never sends it (the
logoff releases its lock). Each logoff is let finish — until SAP answered it or its connection
failed. It exits `0`. There is no deadline. A killed process (`SIGKILL`, out of memory) sends no
logoff: SAP keeps its sessions until its own timeout. A second signal, or
`--shutdown-timeout=<seconds>` (no default), matters only while a logoff is still being written or
answered: exit `1` naming the requests still running. That forced close is the one end that does
not wait for SAP's answers, a deliberate exception: it exits once each logoff is written, so a
session whose logoff SAP had not received whole can stay until SAP's security-session timeout.
This server keeps no runtime session files, so nothing lists such a session
(`ListLeftoverSessions` is stdio's, where such a session keeps its file for the next process).

## Health

`GET /mcp/health` answers `{ status: 'ok', uptime, version, transport: 'http' }` without
credentials.

## Embedding

`new StreamableHttpServer(handlersRegistry, options)` — the same options, and `app` to register
the routes on your own Express (or CAP) application instead of listening itself. `main({ toolSet,
program, version, packageName })` is the binary's launcher (`@mcp-abap-adt/http/launcher`;
`packageName`, the package a second copy of lib asks to reinstall, is optional on this path and
defaults to `@mcp-abap-adt/http`, as 19.1.0's `{ toolSet, program, version }` still compiles). An embedder that stops the
server itself calls `stop()`: admission stops, the listener closes, the pool's instances are
disposed (their state undone) and logged off. The binary's own shutdown does not wait: it logs
every session off at once (lib's `installTransportShutdown`, with `releaseConnections()` after the
logoffs).

**Where the code lives (19.2.0).** The launcher and `StreamableHttpServer` live in
[`@mcp-abap-adt/server-runtime`](https://www.npmjs.com/package/@mcp-abap-adt/server-runtime),
which is installed with this package; this package holds the `mcp-abap-adt-http` binary and its
version. Its exports are unchanged, as re-exports: `@mcp-abap-adt/http` of
`server-runtime/http/server` (its `StreamableHttpServer` answers http's version when constructed
without one), `@mcp-abap-adt/http/launcher` of `server-runtime/http`. No other server package
depends on this one: `compact-http`, `http-ro` and `compact-http-ro` run the same launcher from
`server-runtime`. The runtime also carries the stdio destination layer, so `@mcp-abap-adt/auth-broker`
and `@mcp-abap-adt/auth-stores` are installed with this server; it never loads them.
