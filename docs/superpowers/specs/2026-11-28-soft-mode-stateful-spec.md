# Spec: soft-mode tests keep their stateful SAP session through a network drop

Goal: `docs/superpowers/2026-11-28-soft-mode-stateful-goal.md` (#394). This spec
says what changes in the soft-mode harness and its suites. The code that
changes is test code under `src/__tests__/`, plus one change in `src/lib`
(section 0). The docs that change are `src/__tests__/integration/README.md` and
`CHANGELOG.md`. Nothing else changes in `src/lib` or `src/handlers`, nor in the
server packages or the dependencies.

## Decisions

- A step that fails on the network ends the test, and nothing is resent,
  cleanup included (goal).
- A high-level step whose own unlock failed on the network ends the test as a
  `network` failure, even though its answer is a success. Its lock counts as
  still held (`unlock-sent`, section 3).
- In soft mode, a run connection that still holds something at its logoff
  fails the test file, and the failure lists what is left (section 6). Hard
  mode keeps its warning.
- The package delete keeps its own lock-free sibling session (section 7).
- Tool answers keep the thrown connection error's code and the session-lost
  verdict as typed fields, on failure entries and on `client_threw`, so the
  model and the test can tell a network drop, a lost session and a SAP refusal
  apart (section 0).

## 0. Tool answers name the connection failure

A handler's failure answer drops what tells a network drop from a lost session
from a SAP refusal. `failurePayload` (`src/lib/answer.ts`) does not copy
`IAdtError.connectionCause`, `sessionError` or `sessionLost`. The
`client_threw` answer and entry (`answerThrown` → `local`, `thrownEntry`) copy
nothing of the thrown value's `code`. Only words remain ("The request failed:
ECONNREFUSED", "the connection is not connected").

Every failure answer and failure entry gains three optional fields. Each
appears only when its source holds it:

| Field | From an `IAdtError` | From a thrown value (`client_threw`) |
|---|---|---|
| `connection_cause` | `connectionCause` | `code` when it is one of `ADT_CONNECTION_CAUSES` (`@mcp-abap-adt/interfaces-adt`) |
| `session_error` | `sessionError` | `code` when it is one of `ADT_SESSION_ERROR` (`@mcp-abap-adt/interfaces-adt-connection`) |
| `session_lost` | `sessionLost` | `sessionLost` when it is one of `ADT_SESSION_ERROR` |

- A thrown value is read guarded (`child`), and only a listed code is kept:
  never its message, an address or a URL.
- The fields reach a `withLock` cleanup carrier through its failure entries
  unchanged.
- Nothing else in an answer changes.


## 1. What a step's outcome is

Soft-mode code reads each call's outcome through one shared helper,
`stepOutcome(answer | thrown, connection)`, in
`src/__tests__/integration/helpers/`. It reads typed fields only. Words are
never a verdict: not `LOCK_WENT_WITH_SESSION_WORDS`, not a message, not a
response body.

| Outcome | Read from | Locks the run owns | A create whose answer this is |
|---|---|---|---|
| `ok` | a non-error answer with no failed-release carrier | none changed | confirmed |
| `credential` | the existing `isCredentialRefusal` / `refusalAnswered` (`refusalGuard.ts`) | kept; the marker is latched and nothing more is sent | kept as `unconfirmed` |
| `session-lost` | a typed session verdict as `spentBy` reads it: `session_lost`, or `session_error` `ADT_SESSION_REPLACED` / `ADT_NOT_CONNECTED` (section 0), on the answer or one of its entries; on a thrown value its `code` / `sessionLost` | those of **the connection that answered** are dropped as released by SAP and reported | kept as `unconfirmed` |
| `network` | `connection_cause` on the answer or one of its entries (section 0); on a thrown value its `code` in `ADT_CONNECTION_CAUSES` | kept | kept as `unconfirmed` |
| `unclassified` | a failure whose fields cannot say whether SAP answered (the `client_threw` entry, a throw with no typed field) | kept | kept as `unconfirmed` |
| `refused` | a failure SAP answered (an integer `status` or a typed SAP message) | kept | removed: SAP refused it |

- **A successful answer can carry a failed step.** `withLock` answers success
  with a `cleanup` carrier when the body landed and the release failed
  (`src/lib/strategies/withLock.ts:219-233`). `stepOutcome` reads that carrier
  on success answers too. A release that failed on the network or
  `unclassified` makes the step's outcome `network` / `unclassified`. A
  release SAP refused gives `ok`, and its lock is still taken in (section 3).
- **Only the answering connection is affected by a verdict.** `stepOutcome`
  gets the connection the call ran on. A `session-lost` from the package
  delete's sibling (section 7) touches no lock of the run's connection.
- Which field carries what is pinned first (plan, step 1). Anything not
  pinned reads `unclassified`, the safe side for locks and creates.

## 2. The step that fails ends the test, and nothing is resent

Every outcome but `ok` ends the step, and so the test. That covers `must` in
the suites, `LambdaTester.run` (`LambdaTester.ts:622`) and `HighTester.run`.
The thrown error names its outcome as a fact.

No request is sent twice, cleanup included.

`HighTester.retryOnConflict` (`HighTester.ts:352-382`) changes. It reads
`stepOutcome` first and may resend only on `refused`, under its existing
conflict rule (a `409`, SAP's transient conflict). A `network`,
`unclassified`, `credential` or `session-lost` outcome is never resent,
whatever its message or body contains.

## 3. The lock registry: `HeldLiveLocks` per connection

One `HeldLiveLocks` (`helpers/heldLiveLocks.ts`) per soft-mode run
connection, attached to it when `LambdaTester` / a suite builds its soft
context. The connection is the key.

Each lock has one of three states:

- `held`: the handle is answered and no unlock has been sent;
- `unlock-sent`: an unlock was sent and not answered `ok`, a `withLock`
  release included;
- released: the lock is removed.

The rules:

- A suite records a handle as soon as `HandlerLock` / `LockObject` answers it.
- A `withLock` carrier with `left_locked: true` and `lock_handle` (top level or
  under `cleanup`, failure or success answer) is recorded as **`unlock-sent`**.
  `withLock` already sent its unlock (`withLock.ts:76-124`), so it is never
  sent again. A carrier without `left_locked` (the spent-session case) records
  nothing.
- A lock is removed on an unlock answered `ok`, or on `session-lost` from its
  own connection. Any other outcome of an unlock leaves it `unlock-sent`.
- `releaseAll` sends an unlock only for locks in `held` and marks each one
  `unlock-sent` before sending. It never sends for an `unlock-sent` lock.

Replaced by the registry:

- the `heldLock` variable cleared before its unlock is sent
  (`IncludeHighHandlers.test.ts:180-182`, `TableTypeHighHandlers.test.ts:278-280`);
- the inline unlock whose handle then goes out of scope (`rapFixtures.ts`,
  `writeViewSource`; the direct-call path of `NarrowedCompactTools.test.ts:245`).
  Each becomes `hold`, then an unlock recorded through the registry.

## 4. When locks are released and objects deleted

Per test, in `afterEach` (`LambdaTester.afterEach` → `cleanupAfter`), in this
order:

1. **Locks first, unconditionally.** `releaseAll` runs on the test's
   connection before the YAML policy is read. The early returns of
   `cleanupAfter` for a skipped test, a failed test that keeps its objects, or
   cleanup turned off (`LambdaTester.ts:416-440`) come after it. A skipped test
   holds no lock, so nothing is sent.
2. **Deletes as the policy says.** The policy is `getCleanupAfterRun`,
   `cleanup_on_failure`, `skip_cleanup` and `cleanup_after`, unchanged. A
   failed test keeps its objects unless the policy says otherwise, and a
   network failure is a failed test like any other. A suite that deletes
   whatever the outcome (`deleteEverything`) still does.

A suite's own `after` runs these two steps for what its tests left, in the
same order. The file's logoff (section 6) comes last.

Nothing is sent after `credential`. After `session-lost` of the run's
connection, deletes are sent only if that connection reports itself
connected. Otherwise they are reported as not sent.

## 5. Ambiguous mutations: creates and deletes

Each object a suite or helper creates is recorded with one of these states:

- `unconfirmed`: recorded before the create is sent;
- `exists`: the create was answered `ok`;
- `delete-sent`: a delete was sent and not answered `ok`;
- removed: a delete was answered `ok`, or the create was `refused`.

The rules:

- A create's `network`, `unclassified`, `credential` or `session-lost` outcome
  leaves it `unconfirmed`. Cleanup deletes an `unconfirmed` object like an
  `exists` one, and a `404` to that delete counts as removed.
- A delete, in the workflow or in cleanup, marks the object `delete-sent`
  before it is sent. An `ok` answer removes it. Any other answer leaves it
  `delete-sent`. Cleanup **never** sends a delete for a `delete-sent` object;
  it reports it as "deletion unconfirmed".
- A lock whose answer was lost has no handle to hold. Its object is reported
  as "a lock may be held in this session". The file's logoff, if SAP receives
  it, or else SAP's timeout ends that lock.

This covers every creator and deleter:

- `created` in `IncludeHighHandlers.test.ts`, including its in-workflow
  `DeleteInclude` at `:525`, and in `TableTypeHighHandlers.test.ts`, package
  entries included;
- `rapFixtures.ts` (`createView`, `deleteView`) and its callers;
- `HighTester`'s generic create and its auto-generated delete cleanup
  (`HighTester.ts:166-211, 250-260`).

## 6. The file's logoff

`endTestConnection` / `closeTrackedConnections` (`openConnections.ts`) get one
terminal state per connection. Each connection records one of:

- `logoff-attempted`, set before `disconnect()` is called;
- `logoff-threw`;
- `logoff-unconfirmed`;
- `logoff-withheld`, after a credential refusal (the refusal marker). No
  logoff is sent, as today (`openConnections.ts:41`).

A second call for a connection that already has a state sends nothing. That
holds whether the call comes from a hard-mode helper, a suite, or the root
`after` in `closeConnectionsPreload.ts:15-16`. The connection stays in the
tracked set until its state is terminal, so the root hook can see and report
it.

What each outcome is reported as:

- A credential refusal forbade the logoff: **"logoff not sent: a credential
  was refused"**. Nothing is sent.
- `disconnect()` threw: **"logoff failed"**.
- `disconnect()` and `flushGoodbye()` resolved: **"logoff not confirmed"**.
  The connection contract (connection 25) cannot tell an answered logoff from
  a lost one. `disconnect()` logs a failed write without throwing, and
  `flushGoodbye()` resolves on an answer and on a transport failure alike. The
  harness therefore never reports a logoff as written or as done.
  Distinguishing them is a follow-up for `@mcp-abap-adt/connection` (PR
  description), not worked around here.

All three reports name the locks still owned (`held` / `unlock-sent`) and the
`unconfirmed` / `delete-sent` objects. The locks end with this logoff if SAP
received it, otherwise with SAP's timeout. A withheld logoff leaves only SAP's
timeout.

- **A soft-mode run connection with something still owned fails the file** on
  any of the three reports, the withheld logoff included. The failure lists
  what is left: the locks by object and state, and the objects by name and
  state. A run connection with nothing
  owned reports and passes.
- **Hard mode is unchanged.** A connection without a registry, such as the
  hard-mode helpers' (`hardMode.ts:909-931`), keeps today's report: a warning,
  never a file failure. Only the exactly-once state applies to it, and that
  sends nothing it did not send before.

## 7. Package cleanup: the one sibling session

`DeletePackage` keeps `force_new_connection: true`
(`IncludeHighHandlers.test.ts:207`, `TableTypeHighHandlers.test.ts:308`).
A session that created a package cannot delete it: PAK/058, `CL_PACKAGE`'s
instance buffer (`handleDeletePackage.ts:85-94`, adt-clients `ERRATA.md`).
The delete therefore runs in its own lock-free sibling session, opened through
`src/lib/packageSessions.ts` as the server opens it. This is the one named
exception to the one-connection invariant. The sibling holds no lock of the
run and replaces nothing, and the run's session keeps its locks.

- The package delete comes after the run's locks are released and its
  objects deleted (section 4), as now.
- It follows section 5's `delete-sent` rule, and is sent once.
- Its outcome is read against the sibling (section 1), so its `session-lost`
  touches nothing of the run's connection.
- A sibling that cannot be opened is reported, and the run's connection is
  never used for the delete.

## 8. The network cut for a live run

A test-only helper, `networkCut`, in `src/__tests__/integration/helpers/`:

- **Activation.** It is active only when the run sets
  `MCP_TEST_NETWORK_CUT_MS` (a positive integer) and
  `MCP_TEST_NETWORK_CUT_AT=<test name>`. With neither set it patches nothing.
  A set value that is not valid is refused at file start.
- **Trigger.** In the named test, the cut starts the moment the registry
  records the first `held` lock of that test's connection. It ends after the
  given number of milliseconds.
- **The cut.** Every open socket of the process is destroyed, and every new
  one is pointed at `127.0.0.1:9`, which gives `ECONNREFUSED` (the deleted
  probe's in-process cut).
- **Report.** Each start and end is reported with its time, so a live log
  shows which steps ran inside the cut.

## 9. Tests that prove it

Each new rule gets a unit test that **fails on today's harness** and passes
after the change. Each is proved load-bearing by breaking its rule once.
Tests that pin today's behaviour (section 1's answer fields, the unchanged
conflict retry on `refused`) are characterization tests, marked as such, and
are not counted as regression tests.

**Session continuity**, on a recording connection (`helpers/recordingConnection.ts`)
over the ADT stand-in, for a workflow whose write fails on the network:

- every request, cleanup included, goes over the same connection instance;
- `connect()` is called once, so there is no second logon;
- the session identity and cookies are unchanged from the first request to
  the logoff;
- the cleanup unlock carries the original `lock_handle`;
- only LOCK and UNLOCK are sent stateful;
- no request is sent twice (the request ledger);
- the package delete is the only request on another connection, and it is
  stateless.

**Rules:**

- `stepOutcome` for each row, a success answer carrying a failed release, and
  attribution to the answering connection.
- The registry's three states:
  - `left_locked` is recorded as `unlock-sent` and never sent again;
  - `releaseAll` runs before the policy returns;
  - a verdict from the sibling clears nothing of the run's connection.
- Creates and deletes:
  - a lost create is deleted by cleanup, and its `404` counts as removed;
  - a `delete-sent` object is never deleted again;
  - all of this holds for the include and table-type suites, `rapFixtures`
    and `HighTester`.
- `retryOnConflict`: a `network` failure whose words contain "already exists"
  is not resent.
- Logoff:
  - the exactly-once state across an explicit call followed by the root hook;
  - "logoff failed" and "logoff not confirmed";
  - the file fails with something owned, and passes with nothing owned;
  - hard mode's connections only warn.
- `networkCut`: inactive by default, the trigger at the first `held` lock,
  and a value that is not valid refused.
