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

## Open question for the owner: the step that failed on the network

The step that failed on the network is not resent by default: a failed
request is its own error. Neither form of hard mode resends a tool call that
failed during an outage either:

- The in-repo hard mode throws on the failed answer
  (`src/__tests__/integration/helpers/testers/hardMode.ts:1015-1017`).
  `HighTester.runInHardMode` then rethrows into cleanup
  (`HighTester.ts:333-343`); its `retryOnConflict` resends only `409`s and
  SAP's transient conflicts, never a network error (`HighTester.ts:365-371`).
- mcp-test's recovery bench records the call made during the outage as its
  own answer and moves on to the next call without resending it
  (`mcp-test/bench/session-recovery.mjs:77`, verdicts at `:84-89`). The
  server process, and with it the session, stays alive.

There are two options:

1. **The failed step ends the test** (recommended). Its cleanup then unlocks
   with the original handle and logs off in the same session. This needs no
   resend of the step, matches hard mode and the no-retries rule, and is
   what was measured.
2. **The failed step is resent once.** This is a named exception to the
   no-retries rule, which only the owner grants. It must handle a lost
   response: no mutation is applied twice, and no object it created is
   abandoned.

Either way, cleanup's own unlock and logoff must reach SAP after the network
is back. How they do so, without a timer of the harness's own, is for the
spec to settle. If that needs another send of an unlock or a logoff, that
send is also the owner's to grant.

## Invariants

- **One connection per test file, cleanup included.** No new connection, no
  sibling and no new logon replaces the session a network error interrupted.
  Today's package cleanup passes `force_new_connection: true`
  (`IncludeHighHandlers.test.ts:207`, `TableTypeHighHandlers.test.ts:308`),
  which opens a fresh one. That is in scope and changes.
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
- **A lock is owned until its release has reached SAP.** Its handle is not
  dropped before the unlock was answered, the session's logoff was answered,
  or SAP declared the session lost.
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
