# @mcp-abap-adt/sse

The HTTP+SSE server of MCP ABAP ADT: the binary `mcp-abap-adt-sse`, and `SseServer`, which serves
the ADT tools of [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib) over MCP's
HTTP+SSE transport on an Express app — a `GET` on the SSE path opens a connection, and that
connection's `POST`s are routed to it by `sessionId` — with DNS rebinding protection and optional
TLS. Licensed AGPL-3.0-only.

HTTP+SSE is deprecated in MCP since 2025-03-26; it is served for the clients that still speak only
SSE. A client that speaks Streamable HTTP wants
[`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http).

**The binary fixes the tool set (19.0.0).** `mcp-abap-adt-sse` serves readonly (with system and search),
high, the debugger and background runs; the readonly
tools alone are [`@mcp-abap-adt/sse-ro`](https://www.npmjs.com/package/@mcp-abap-adt/sse-ro) (`mcp-abap-adt-sse-ro`). There is no
`--exposition`: passing it, or a config file's `exposition`, stops the start with a sentence naming
the binary to install instead.

**No leftover-session tools, no session files (19.0.0).** One server holds the sessions of many
users, so it writes no runtime session file and serves no leftover-session tool; those are the
stdio binaries' (`mcp-abap-adt`, `mcp-abap-adt-ro`). Resuming a SAP session here is yours to do if you hold what it takes;
otherwise SAP ends it on its own timeout, which releases its locks: [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#stdio-leftover-sap-sessions-of-a-killed-process).

**No low set (19.0.0).** `--exposition=…,low` stops the start with D56's sentence: *"the low set is gone from mcp-abap-adt / -http / -sse; use mcp-abap-adt-compact (or -compact-http / -compact-sse)"*. Its single-step operations are compact's — see [MIGRATION-19.0](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/MIGRATION-19.0.md#the-low-set-leaves-the-full-binaries).

```bash
npm install -g @mcp-abap-adt/sse
mcp-abap-adt-sse --sse-port=3001
```

## Credentials: the headers of the opening request

The `GET` that opens an SSE connection carries its credentials, and the server takes them from
nowhere else: no destination, no service key, no session file, no login, no auth broker.

| Header (on the `GET`) | |
|---|---|
| `x-sap-url` | the system's URL (required) |
| `x-sap-client` | the client (optional) |
| `x-sap-jwt-token` | a token you hold, presented as a Bearer token |
| `x-sap-login` + `x-sap-password` | a user and password (basic) |

- A `GET` without them is answered `400`: *this server takes credentials only from the request's
  headers: send x-sap-url with x-sap-jwt-token, or with x-sap-login and x-sap-password*.
- A `GET` or a `POST` carrying `x-mcp-destination` is answered `400`: *destinations are served only
  by mcp-abap-adt (stdio); send x-sap-* headers*. Destinations are
  [`@mcp-abap-adt/core`](https://www.npmjs.com/package/@mcp-abap-adt/core)'s, over stdio.
- A `POST` is routed by its `sessionId` alone: its own `x-sap-*` headers are not read, so a
  connection's credential is the one it opened with.
- Each connection has its own credential, instance and connection to the system; nothing is shared
  with another connection, and nothing outlives it. Held state (a debug session)
  lives in the connection's instance until the connection closes, its
  stop tool runs or the idle bound (`--state-idle-minutes`) ends it.
- The system kind follows `--system-type` / `SAP_SYSTEM_TYPE` and is required — no request header
  states it. Without it the binary does not start: exit `1` before anything listens, on stderr
  `[MCP] The SAP system type is required — set --system-type, SAP_SYSTEM_TYPE (the environment)
  or system-type (YAML) to onprem, cloud or legacy; the server did not start`. (An embedder's own host of the
  exported server class reads `SAP_SYSTEM_TYPE` at each call: a call without it is refused
  `system_type_required`, nothing sent.)

Beside the credential, the opening `GET` may state `x-sap-responsible`, `x-sap-master-system`,
`x-sap-language` and the debugger's `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` (then the
environment's `SAP_*`).

## Options

As before 19.0.0, under the same names: `--sse-host` / `MCP_SSE_HOST`, `--sse-port` /
`MCP_SSE_PORT` (default `3001`), `--sse-path` (default `/sse`), `--post-path` (default
`/messages`), `--sse-allowed-hosts` / `MCP_SSE_ALLOWED_HOSTS`, `--sse-allowed-origins` /
`MCP_SSE_ALLOWED_ORIGINS`, `--sse-enable-dns-protection` / `MCP_SSE_ENABLE_DNS_PROTECTION`,
`--tls-cert` / `--tls-key` / `--tls-ca` (`MCP_TLS_*`), `--system-type`, `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES`, `--conf`, `--help`, `--version`;
new in 19.0.0, `--shutdown-timeout` / `MCP_SHUTDOWN_TIMEOUT` (see [Shutdown](#shutdown)).

## A closed connection disposes its instance

An SSE connection closes as a stdio client's transport does: it is one long stream with the
credentials of its opening `GET`, one instance per stream. When it closes — or fails while it is
being set up — its session leaves the routing map at once (a later `POST` for it is an unknown
session) and its instance is closed: no call of it starts any more, **its ADT sessions are logged
off at once** — its connection, the debugger's, a long read's own; the logoff releases a lock a
tool holds — and its running tools are interrupted: **nothing waits for a running tool**, a queued
call never starts, and no state undo is sent (the logoff ends the held state). A running tool
whose next step would open an ADT session of its own (a debugger start, a package lock over RFC)
is refused before it logs on: a closed connection's instance opens no new session. Then its MCP
server and stream are closed. Another connection's tools and instance are not touched, and a
background run it started runs on (the process's end logs it off).

## Shutdown

On `SIGTERM` / `SIGINT` the server stops listening and takes no new call (a `POST` arriving after
it is answered "The server is shutting down." and reaches no tool), **logs off every ADT session
of the process at once** and interrupts the running tools — nothing waits for a running tool —,
then ends every stream. It exits `0`. There is no deadline. A second signal, or
`--shutdown-timeout=<seconds>` (no default), matters only while a logoff is still being written:
exit `1` naming the requests still running.

## Health

`GET /mcp/health` answers `{ status: 'ok', uptime, version, transport: 'sse', activeSessions }`.

## Embedding

`new SseServer(handlersRegistry, options)` — the same options, and `app` to register the routes on
your own Express (or CAP) application. `main({ program, version })` is the binary's launcher
(`@mcp-abap-adt/sse/launcher`). An embedder that stops the server itself calls `stop()`: the listener
closes and every open connection gets the close above — its ADT sessions logged off at once, its
running tools interrupted, no state undo sent —, joined where one is already closing; it never
rejects. The binary's own shutdown calls `stopListening()`, logs every session of the process off
at once (lib's `installTransportShutdown`), then `releaseConnections()`, which closes the client
connections left.
