# @mcp-abap-adt/sse

The HTTP+SSE server of MCP ABAP ADT: the binary `mcp-abap-adt-sse`, and `SseServer`, which serves
the ADT tools of [`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib) over MCP's
HTTP+SSE transport on an Express app — a `GET` on the SSE path opens a connection, and that
connection's `POST`s are routed to it by `sessionId` — with DNS rebinding protection and optional
TLS. Licensed AGPL-3.0-only.

HTTP+SSE is deprecated in MCP since 2025-03-26; it is served for the clients that still speak only
SSE. A client that speaks Streamable HTTP wants
[`@mcp-abap-adt/http`](https://www.npmjs.com/package/@mcp-abap-adt/http).

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
  with another connection, and nothing outlives it. Held state (a debug session, with
  `--exposition=...,debug`) lives in the connection's instance until the connection closes, its
  stop tool runs or the idle bound (`--state-idle-minutes`) ends it.
- The system kind follows `--system-type` / `SAP_SYSTEM_TYPE`.

Beside the credential, the opening `GET` may state `x-sap-responsible`, `x-sap-master-system`,
`x-sap-language` and the debugger's `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` (then the
environment's `SAP_*`).

## Options

As before 19.0.0, under the same names: `--sse-host` / `MCP_SSE_HOST`, `--sse-port` /
`MCP_SSE_PORT` (default `3001`), `--sse-path` (default `/sse`), `--post-path` (default
`/messages`), `--sse-allowed-hosts` / `MCP_SSE_ALLOWED_HOSTS`, `--sse-allowed-origins` /
`MCP_SSE_ALLOWED_ORIGINS`, `--sse-enable-dns-protection` / `MCP_SSE_ENABLE_DNS_PROTECTION`,
`--tls-cert` / `--tls-key` / `--tls-ca` (`MCP_TLS_*`), `--system-type`, `--exposition` (with
`debug`), `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES`, `--conf`, `--help`, `--version`;
new in 19.0.0, `--shutdown-timeout` / `MCP_SHUTDOWN_TIMEOUT` (see [Shutdown](#shutdown)).

## A closed connection disposes its instance

When an SSE connection closes — or fails while it is being set up — its session leaves the
routing map at once (a later `POST` for it is an unknown session) and its instance is closed, in
order: no call of it starts any more, **its running tools run to their end and are awaited**, its
held state is undone, its ADT sessions are logged off — whatever the undo answered: the logoff
releases a lock a tool left —, then its MCP server and stream are closed. What the undo could not
undo is written on stderr. Another connection's tools and instance are not touched.

## Shutdown

On `SIGTERM` / `SIGINT` the server stops listening and takes no new call (a `POST` arriving after
it is answered "The server is shutting down." and reaches no tool), **waits for every running tool
to finish** on every connection — none is aborted —, then closes every connection's instance as
above (one already closing is joined) and ends its stream. It exits `0`, or `1` with one stderr
line per state that could not be undone. There is no deadline. A second signal, or
`--shutdown-timeout=<seconds>` (no default), forces it: nothing more is waited for, every ADT
session is still logged off, exit `1` naming the requests still running.

## Health

`GET /mcp/health` answers `{ status: 'ok', uptime, version, transport: 'sse', activeSessions }`.

## Embedding

`new SseServer(handlersRegistry, options)` — the same options, and `app` to register the routes on
your own Express (or CAP) application. `main({ program, version })` is the binary's launcher
(`@mcp-abap-adt/sse/launcher`).
