# Goal: soft-mode tests keep their stateful SAP session through a network drop

Issue #394, for the tests only.

## The goal

A soft-mode integration run calls the handlers directly on the connection of
`createTestConnectionAndSession`. Through a network drop it holds its SAP
session the way the server does. When the network is back, the run's work on
that SAP session ends in the **same** session. A lock the run took is still
its own, and the run's cleanup (unlock, delete, logoff) reaches SAP in that
session.

This covers every soft-mode workflow and the fixtures and cleanup they share,
not only `LambdaTester` and the include suite. Among them are the table-type
suite, `rapFixtures`, the direct-call path of the narrowed compact tools, and
`heldLiveLocks`.

## Decision: a step that fails on the network ends the test

A step that fails on the network ends its test, as it does in hard mode.
Its cleanup then unlocks with the original handle and logs off in the same
session, and the handle is never dropped. Nothing is resent: not the failed
step, and not a cleanup step.

## Invariants

- **One connection per test file, cleanup included.** No new connection, no
  sibling and no new logon replaces the session a network error interrupted.
  The one named exception is the package delete. It keeps its own lock-free
  sibling session (`force_new_connection: true`, `src/lib/packageSessions.ts`),
  as the server does, because a session that created a package cannot delete
  it (PAK/058, `handleDeletePackage.ts:87`). That sibling holds no lock of the
  run and replaces nothing.
- **Each outcome is read as `sessionLoss.ts` reads it** (`spentBy`):
  - a network error (no typed verdict) keeps the session, and the run
    keeps owning its locks;
  - a confirmed unlock, or a logoff SAP answered, releases that lock or that
    session;
  - a typed session-lost verdict (`sessionLost`, `ADT_SESSION_REPLACED`,
    `ADT_NOT_CONNECTED`) is reported, and the run drops what that ended
    session held. SAP released it, and nothing is sent for it again;
  - a credential refusal follows the existing refusal-marker policy: the
    whole run stops and nothing more is sent, a logoff included.
- **A lock is owned until its release has reached SAP.** Its handle is never
  dropped before the unlock was answered, the session's logoff was answered,
  or SAP declared the session lost. A lock still owned when the run ends is
  reported by name.
- **A lost response is not taken as nothing done.** When a mutating step's
  answer was lost, the object or lock it may have made is treated as possibly
  existing or held. It is never assumed absent, and cleanup does not abandon
  it.
- **A failed logoff is not a logoff.** A logoff counts as done only when SAP
  answered it. A logoff that failed on the network is reported as failed,
  with the locks still held named. A finished `disconnect()` / `flushGoodbye()`
  alone proves nothing, because `flushGoodbye()` also resolves on a transport
  failure. Whether the connection's contract lets the harness tell the two
  apart is for the spec to establish.
- **The cleanup policy is kept.** A test that fails keeps its objects as
  today, unless the YAML says otherwise (`cleanup_on_failure`, `skip_cleanup`,
  `cleanup_after`). A suite that deletes whatever the outcome still does. A
  network interruption neither triggers a delete the policy withholds nor
  withholds one it orders. Locks are always released.
- No session files and no state on disk, for the tests too.
- No server change, and no change to `@mcp-abap-adt/connection` or
  `adt-clients`. The server already keeps the session.
- Only LOCK and UNLOCK go stateful. Nothing else is made stateful to hold the
  session.
- No timer of the harness's own decides that the session is gone. A session
  SAP has ended, for example after its idle timeout of about 30 minutes,
  reaches the test as SAP's verdict. An outage past SAP's timeout gets no
  special handling: SAP releases the locks.
- Hard mode is unchanged.

## Out of scope

- The server's long session, HTTP/SSE state, and the idle bound.
- Resuming a session from another process, or after the test process is gone.
- A run stopped by the user (Ctrl-C) while the network is down.
- Shortening SAP's lock lifetime, or cleaning up a previous run's locks.
- Hard mode's leftover-session files.
