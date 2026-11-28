# Goal: soft-mode tests keep their stateful SAP session through a network drop

Issue #394, for the tests only.

## The goal

A soft-mode integration run (handlers called directly on the connection of
`createTestConnectionAndSession`) holds its SAP session through a network drop
the way the server does: once the network is back, the run goes on in the
**same** SAP session, so a lock it took is still its own, a write under the
original `lock_handle` is accepted, and its cleanup (unlock, delete, logoff)
reaches SAP.

## Invariants

- One connection per test file, as now. No new connection, no sibling and
  no new logon in place of the session a network error interrupted. A
  network error does not spend a session (`src/lib/sessionLoss.ts`).
- No session files and no state on disk, for the tests too.
- No server change, and no change to `@mcp-abap-adt/connection` or
  `adt-clients`. The server already keeps the session.
- Only LOCK and UNLOCK go stateful. Nothing else is made stateful to hold
  the session.
- No timer of the harness's own that decides the session is gone. A session
  SAP has ended, for example after its idle timeout of about 30 minutes,
  reaches the test as SAP's verdict (`sessionLost` / `ADT_SESSION_REPLACED`),
  and the test reports it. There is no special handling for an outage past
  SAP's timeout: SAP releases the locks.
- A failure that is not the network's (a SAP refusal, a 401, a session-lost
  verdict) ends the step as it does today. A 401 still stops the whole run
  (the refusal marker).
- A lock the run took is released by the same session that holds it, or it
  ends with that session's logoff. Its handle is not dropped before its
  release has reached SAP.
- Hard mode is unchanged.

## Out of scope

- The server's long session, HTTP/SSE state, and the idle bound.
- Resuming a session from another process, or after the test process is gone.
- A run stopped by the user (Ctrl-C) while the network is down.
- Shortening SAP's lock lifetime, or cleaning up a previous run's locks.
- Hard mode's leftover-session files.
