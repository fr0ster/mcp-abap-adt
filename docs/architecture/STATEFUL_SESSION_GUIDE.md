# Stateful ADT Session Flow

This guide describes which ADT requests go in a **stateful** ABAP session, and
which do not. It is about protocol behaviour, not about session files.

## The window (D56)

**Only `LOCK` and `UNLOCK` are sent stateful; writes under a lock and activation go
stateless.** Everything else — reads, searches, runs, where-used, checks — runs
stateless too. It is decided by `@mcp-abap-adt/adt-clients` (31.1), not by the server:

| Request | Session | Context cookie (`sap-contextid`) |
|---|---|---|
| `POST …?_action=LOCK&accessMode=MODIFY` | stateful | opened by SAP's answer, kept in the jar |
| `PUT …?lockHandle=<handle>` (the write) | stateless | not sent: the lock handle carries the write |
| `POST …?_action=UNLOCK&lockHandle=<handle>` | stateful | sent: the `UNLOCK` reaches the context the `LOCK` opened |
| `POST /sap/bc/adt/activation` | stateless | not sent |
| every other request | stateless | not sent |

The write running outside the lock's context is what Eclipse does (an ADT capture of
2026-08-31: every lock and unlock in the stateful "enqueue" session, the `PUT` and the
reads around it stateless). An `UNLOCK` sent stateless releases nothing and still
answers `200` (inferred from adt-clients' own comment on the message-class unlock, "an
unlock sent that way does not reach the session holding the handles"; not measured here),
which is why it goes stateful.

## How a request is marked

adt-clients sets the connection's session type around the one request
(`inStatefulSession`, or `setSessionType('stateful')` with a `finally` that sets it
back to `'stateless'`), and `@mcp-abap-adt/connection` marks the request
`stateful` from it. Each wire says it its own way: HTTP sends
`x-sap-adt-sessiontype: stateful` and the context cookie, BASIS 7.40's legacy wire
drops the header, RFC routes the request to its stateful conversation. A
non-stateful request never carries the context cookie.

`sap-adt-connection-id` (the connection's) and `sap-adt-request-id` (fresh per
request) are written by the connection on every request; nothing in the server sets
them. The `session_id` and `session_state` arguments some tools still accept change
nothing on the wire: a tool cannot reach into the connection's session.

## Across tool calls

- **One main flow per instance**: the calls of one MCP session that work on its
  connection run one after another, whatever the client sends at once — the server
  enforces it, so no call is sent inside another call's window. A background run and
  a listed long read, each on a connection of its own, are outside the order.
- **Compact `HandlerLock` → `HandlerUpdate { lock_handle }` → `HandlerUnlock`**: on
  stdio and SSE, where the connection lives across calls, the lock stays in the
  session between the calls — the consumer's choice. Every call between them is
  stateless; the `UNLOCK` reaches the lock's context. At the latest the instance's
  logoff ends it (a logoff releases the session's locks). Over Streamable HTTP the
  next request's credential retires the lock's connection and its logoff releases the
  lock: lock, write and unlock in one call there (`HandlerUpdate` without a
  `lock_handle`).
- **A cancel does nothing to SAP**: no logoff, no new session.
- **A reopen only when SAP lost the session**: stdio keeps its connection for the
  instance's life.
- **The debugger's session is its own**: a debug session opens connections of its
  own, stateful for their life, and ends them with the debug session.

## Common pitfalls

- **Two calls at once on one connection**: the session type is the connection's while
  a `LOCK` or an `UNLOCK` is in flight; a read sent alongside would go stateful and an
  `UNLOCK` stateless (both seen against the stand-in without the main flow). The
  server's main flow keeps the calls of one instance apart; code that shares a
  connection outside it must do the same.
- **A missing `lockHandle` or `corrNr`** on the write.

Every site that changes a session type is listed in `tools/stateful-sites.json`
with the window it opens and where the connection returns to stateless.
