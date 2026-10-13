# @mcp-abap-adt/http

The Streamable HTTP server of MCP ABAP ADT: the binary `mcp-abap-adt-http`, and
`StreamableHttpServer`, which serves the ADT tools of
[`@mcp-abap-adt/lib`](https://www.npmjs.com/package/@mcp-abap-adt/lib) over MCP Streamable HTTP on an
Express app, with DNS rebinding protection and optional TLS. Licensed AGPL-3.0-only.

```bash
npm install -g @mcp-abap-adt/http
mcp-abap-adt-http --port=3000
```

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
- The system kind follows `--system-type` / `SAP_SYSTEM_TYPE` (`cloud`, `onprem`, `legacy`): it
  decides the tools offered and whether a cloud system is asked for the responsible and the master
  system.

Per request, beside the credential: `x-sap-responsible`, `x-sap-master-system`, `x-sap-language`,
and the debugger's `x-sap-debug-terminal-id` / `x-sap-debug-ide-id` (then `SAP_RESPONSIBLE`,
`SAP_MASTER_SYSTEM`, `SAP_DEBUG_TERMINAL_ID`, `SAP_DEBUG_IDE_ID` of the environment). With
`x-sap-login`, the login is the responsible when none is stated.

## Options

As before 19.0.0, under the same names: `--host` / `--http-host` / `MCP_HTTP_HOST`, `--port` /
`--http-port` / `MCP_HTTP_PORT` (default `3000`), `--path` / `--http-path` (default
`/mcp/stream/http`), `--http-json-response` / `MCP_HTTP_ENABLE_JSON_RESPONSE`,
`--http-allowed-hosts` / `MCP_HTTP_ALLOWED_HOSTS`, `--http-allowed-origins` /
`MCP_HTTP_ALLOWED_ORIGINS`, `--http-enable-dns-protection` / `MCP_HTTP_ENABLE_DNS_PROTECTION`,
`--tls-cert` / `--tls-key` / `--tls-ca` (`MCP_TLS_*`), `--system-type`, `--exposition` (with
`debug`), `--state-idle-minutes` / `MCP_STATE_IDLE_MINUTES`, `--conf`, `--help`, `--version`;
new in 19.0.0, `--shutdown-timeout` / `MCP_SHUTDOWN_TIMEOUT` (see [Shutdown](#shutdown)).
`mcp-abap-adt-http --help` lists them.

## Held state (the debugger)

Every request is an MCP session of its own. A tool that holds state (a debug session, with
`--exposition=...,debug`) answers a `state_handle`; a `tools/call` carrying it is routed to the
instance that holds the state, one request at a time, and its own headers give its credential. The
handle is a bearer secret: whoever holds it reaches the state. Held state ends by its stop tool,
the idle bound (`--state-idle-minutes`, 30–35 791, default 30), or the server's stop. See
[the debugger guide](https://github.com/fr0ster/mcp-abap-adt/blob/main/docs/user-guide/DEBUGGER.md).

## Every ADT session ends with a logoff

An instance logs off every ADT session it opened when it ends: a request's instance when the pool
lets it go (after the request, when it holds nothing), a pooled instance when its state ends (its
stop tool, the idle bound) or at shutdown — whatever the state's undo answered. The logoff is what
releases a lock a tool left in its session.

## Shutdown

On `SIGTERM` / `SIGINT` the server stops taking requests (`503`, *the server is shutting down*;
a call already accepted whose body arrives later reaches no tool), stops listening, **waits for
every running tool to finish** on every instance — none is aborted, so a write still sends its
`UNLOCK` —, then disposes the pool's instances and logs off their sessions. It exits `0`, or `1`
with one stderr line per instance whose state could not be undone (named by its ordinal, never its
handle). There is no deadline. A second signal, or `--shutdown-timeout=<seconds>` (no default),
forces it: nothing more is waited for, every session is still logged off, exit `1` naming the
requests still running.

## Health

`GET /mcp/health` answers `{ status: 'ok', uptime, version, transport: 'http' }` without
credentials.

## Embedding

`new StreamableHttpServer(handlersRegistry, options)` — the same options, and `app` to register
the routes on your own Express (or CAP) application instead of listening itself. `main({ program,
version })` is the binary's launcher (`@mcp-abap-adt/http/launcher`). An embedder that stops the
server itself calls `stop()`: admission stops, the listener closes, the pool's instances are
disposed and logged off; to wait for the running tools first, await lib's `settled()` between
`beginShutdown()` / `stopListening()` and `lastStep()`, as the binary does.
