# Stateful ADT Session Flow

This guide describes which ADT requests go in a **stateful** ABAP session, and
which do not. It is about protocol behaviour, not about session files.

## The window (D56)

A tool's session is stateful only for **lock → write → unlock and activation**.
Everything else — reads, searches, runs, where-used, checks — runs stateless.

What is sent stateful today is narrower, and it is decided by
`@mcp-abap-adt/adt-clients` (31.1), not by the server:

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
answers `200`, which is why it goes stateful.

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

- **Compact `HandlerLock` → `HandlerUpdate { lock_handle }` → `HandlerUnlock`**: the
  lock stays in the session between the calls — the consumer's choice. Every call
  between them is stateless; the `UNLOCK` reaches the lock's context. At the latest
  the instance's logoff ends it (a logoff releases the session's locks).
- **A cancel does nothing to SAP**: no logoff, no new session.
- **A reopen only when SAP lost the session**: stdio keeps its connection for the
  instance's life.
- **The debugger's session is its own**: a debug session opens connections of its
  own, stateful for their life, and ends them with the debug session.

## Common pitfalls

- **Two calls at once on one connection**: the session type is the connection's
  while a `LOCK` or an `UNLOCK` is in flight, so a concurrent read goes stateful
  (seen against the stand-in), and an `UNLOCK` could go stateless. Call write tools one at a time.
- **A missing `lockHandle` or `corrNr`** on the write.

Every site that changes a session type is listed in `tools/stateful-sites.json`
with the window it opens and where the connection returns to stateless.
