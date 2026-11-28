# Spec: soft-mode tests keep their stateful SAP session through a network drop

Goal: `docs/superpowers/2026-11-28-soft-mode-stateful-goal.md` (#394). This spec
says what changes in the soft-mode harness and its suites. Everything here is
test code under `src/__tests__/`. Nothing changes in `src/lib`, `src/handlers`,
the server packages or the dependencies.

## 1. What a failed step is

Soft-mode code reads one outcome per call, through one shared helper,
`stepOutcome(answer | thrown)` in `src/__tests__/integration/helpers/`. It reads
typed fields only, never words:

| Outcome | Read from | Effect on what the run owns |
|---|---|---|
| `ok` | a non-error answer | none |
| `credential` | the existing `isCredentialRefusal` / `refusalAnswered` (`refusalGuard.ts`) | the marker is latched as today; nothing more is sent |
| `session-lost` | a typed session verdict as `spentBy` reads it (`sessionLost`, `ADT_SESSION_REPLACED`, `ADT_NOT_CONNECTED`), on the thrown value or the answer's failure entries | every lock of the session is dropped as released by SAP and reported; nothing is sent for them |
| `network` | a network error code (`NETWORK_ERROR_CODES` of `@mcp-abap-adt/interfaces-network`) on the thrown value or as an answer entry's `code` | nothing is released; the locks stay owned |
| `refused` | any other error answer or throw | as today |

`network` and `refused` both end the step, and so the test. They differ only in
what cleanup and the report may assume.

The plan's first step pins, with a unit test against the ADT stand-in
(`helpers/adtStandIn.ts`), which field of a handler's answer carries the
network code and the session verdict. That covers the direct throw, a
strategy's failure entry and the `client_threw` entry. A path that drops them
is reported to the owner and not patched in `src/lib`, because the goal allows
no server change. Until it is settled, such an answer reads as `refused`, which
keeps its locks owned, the safe side.

## 2. The step that fails ends the test, and nothing is resent

`must` in the suites and `LambdaTester.run` keep throwing on a failed step
(`IncludeHighHandlers.test.ts:278`, `LambdaTester.ts:622`). The thrown error
now names its outcome (`network`, `session-lost`, …) as a fact.
`HighTester.retryOnConflict` stays as it is: it resends a `409` or one of SAP's
transient conflicts, never a network error. No other step is ever sent twice.
That holds for cleanup steps too.

## 3. One lock registry per test file: `HeldLiveLocks`

Every soft-mode lock goes through one registry, the existing `HeldLiveLocks`
(`helpers/heldLiveLocks.ts`). One instance per test file sits beside the
tracked connection, so it is reachable from the root `after`.

- A suite records a handle as soon as `HandlerLock` / `LockObject` answers it
  (`hold`).
- `released` is called only on an unlock answered `ok`, or when the session is
  `session-lost`. A failed unlock (`network`, `refused`) keeps the lock.
- Locks a high-level handler left behind are taken in as well. A failed
  `withLock` release answers `left_locked: true` with `lock_handle` and
  `object` (`src/lib/strategies/withLock.ts`, `leftLocked`), at the top level
  or under `cleanup`. The harness reads every handler answer it gets
  (`HighTester`, `LambdaTester`, `must`) and `hold`s each such lock. An answer
  naming `LOCK_WENT_WITH_SESSION_WORDS` holds nothing.
- `releaseAll` is called **once**, from the suite's cleanup, before any delete,
  as `heldLiveLocks.ts` does today. It sends an unlock only for a lock whose
  unlock was never sent. The registry marks a lock `unlock-sent` when a suite
  sends its unlock inline. A lock whose unlock was sent and failed, whether on
  the network or refused, is not sent again: it stays owned and is reported.

Replaced by the registry:

- the `heldLock` variable that is cleared before its unlock is sent
  (`IncludeHighHandlers.test.ts:180-182`, `TableTypeHighHandlers.test.ts:278-280`);
- the unlock attempted once in `finally`, whose handle then goes out of scope
  (`rapFixtures.ts:writeViewSource`, the direct-call path of
  `NarrowedCompactTools.test.ts:245`): the handle is `hold`-ed before the write
  and `released` only on an `ok` unlock;
- the failed-lock path that ends the workflow
  (`TableTypeHighHandlers.test.ts:645`): unchanged, except that a lock answer
  lost to the network leaves nothing to `hold`, because there is no handle. A
  lost lock response is the lost-response case in section 5.

## 4. Cleanup order and policy

Cleanup runs as now (`afterEach` → `cleanupAfter`, a suite's `after`), with
the same YAML policy (`getCleanupAfterRun`, `cleanup_on_failure`,
`skip_cleanup`, `cleanup_after`). A failed test keeps its objects unless the
policy says otherwise. A suite that deletes whatever the outcome
(`deleteEverything`) still does.

The order is fixed:

1. `releaseAll` once. Locks are always released, whatever the delete policy.
2. The deletes the policy orders, each sent once.
3. The file's logoff (section 6).

After a `credential` outcome nothing is sent, as today. After `session-lost`
nothing is sent for the dropped locks, and the deletes still run on the same
connection only if the connection reports itself connected; otherwise they
are reported as not sent.

## 5. A lost response

A mutating step whose outcome is `network` may have been applied by SAP.

- **Create:** a suite's `created` list gets the name *before* the create is
  sent, marked `unconfirmed`. An `ok` answer confirms it. A `refused` answer
  removes it. A `network` answer keeps it. Cleanup deletes an `unconfirmed`
  entry like any other. An answer that it does not exist (`404`) is then
  success, not a failure. This touches `created.push` in
  `IncludeHighHandlers.test.ts`, `TableTypeHighHandlers.test.ts` and the
  package entries.
- **Lock:** a lock whose answer was lost has no handle the harness could hold.
  It is reported as "a lock may be held in this session" with the object
  named. The file's logoff (section 6) is what ends it. Without that logoff,
  SAP's timeout ends it.
- **Unlock:** a `network` unlock keeps the lock owned and reported. It is not
  sent again.

## 6. The file's logoff

`endTestConnection` (`openConnections.ts:32-44`) changes:

- The connection leaves the `open` set only after `disconnect()` returned,
  not before (`openConnections.ts:39`).
- It is sent once. A throw is reported as `logoff failed` with the locks
  still owned (`HeldLiveLocks.stillHeld`) and the `unconfirmed` objects
  named, and the root `after` fails the file. Today it only warns
  (`openConnections.ts:63-70`).
- **A finished `disconnect()` / `flushGoodbye()` is reported as "logoff
  written", never "logged off".** The connection contract (connection 25:
  `disconnect()` logs a failed write without throwing, and `flushGoodbye()`
  resolves on an answer and on a transport failure alike) gives the harness
  no way to tell an answered logoff from a lost one. Telling them apart needs
  a connection change, which the goal excludes. It is reported to the owner
  as a follow-up for `@mcp-abap-adt/connection`, not worked around here (no
  probe request before the logoff, which would be another send).
- When locks are still owned at that point, the report says that they end
  with this logoff if SAP received it, else with SAP's timeout.

## 7. Package cleanup on one connection

`force_new_connection: true` on `DeletePackage` (`IncludeHighHandlers.test.ts:207`,
`TableTypeHighHandlers.test.ts:308`) opens a sibling session. The goal's
invariant puts cleanup on the file's one connection. But a package that this
session created cannot be deleted by the same session: PAK/058, `CL_PACKAGE`'s
instance buffer (`handleDeletePackage.ts:85-94`, adt-clients `ERRATA.md`). So
dropping the flag makes the package delete fail on every run, network or not.

**For the owner, before the plan:** either the package delete keeps its own
short-lived sibling (it holds no lock of the run and replaces nothing; the
run's session keeps its locks), or the suites stop creating their own package
and work in a shared one (`shared_dependencies.package`). This spec does
neither until the owner chooses.

## 8. Tests that prove it

- Unit tests (node:test, ADT stand-in, no SAP):
  - `stepOutcome` for each row of section 1;
  - `HeldLiveLocks` keeps a lock on `network` / `refused` and drops it on
    `ok` / `session-lost`, and takes in a `left_locked` answer;
  - `endTestConnection` keeps the connection tracked until `disconnect()`
    returned, fails the file on a throw, and reports "logoff written";
  - a create lost to the network is deleted by cleanup, and its `404` counts
    as success;
  - no step is sent twice: a recording connection counts every request of a
    whole failing workflow.
  
  Each test is proved load-bearing by breaking its rule once.
- Live: the owner's onprem run of one include suite with a 5 s cut during the
  compact lock chain. The cut uses the in-process cut of the deleted probe,
  rebuilt as a test-only helper that runs only when the run asks for it. The
  expected result: the test fails `network`, and cleanup releases the lock
  with the original handle in the same session if the network is back by
  then. Otherwise the report names the lock as still owned and the logoff as
  written.
