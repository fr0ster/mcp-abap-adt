# Plan: soft-mode tests keep their stateful SAP session through a network drop

Goal: `docs/superpowers/2026-11-28-soft-mode-stateful-goal.md`. Spec:
`docs/superpowers/specs/2026-11-28-soft-mode-stateful-spec.md` (#394).

The code that changes is under `src/__tests__/`, plus the answer fields of
step 1 in `src/lib/answer.ts` (spec §0). The docs that change are
`src/__tests__/integration/README.md` and `CHANGELOG.md` (step 13).

How each step is done:

- Every behaviour change starts with a unit test that fails on today's
  harness, then the change, then the test green.
- The test is proved load-bearing by breaking its rule once and watching it
  go red.
- A characterization test pins today's behaviour without changing it. It is
  marked as such and does not count as a step's failing test.
- Each step is its own commit.
- After every step the local gate runs: `npm run lint:check`,
  `npm run test:check`, `npm test`.

## Steps

1. **Tool answers name the connection failure (spec §0).** Failing tests
   first:
   - `failurePayload` with `connectionCause`, `sessionError` and `sessionLost`;
   - `thrownEntry` and `answerThrown` for a thrown value with a network code,
     a session error code, an unlisted code and no code;
   - on the ADT stand-in with a socket cut, through a real handler:
     - a high read;
     - a compact update under a lock;
     - a high update whose write is cut;
     - a high update whose unlock is cut, which answers success with a
       `cleanup` carrier;
     - an unlock after the session ended.

     Each answer must carry the field.

   Then the change in `src/lib/answer.ts`, and a CHANGELOG line under
   `## [Unreleased]` for the new answer fields.

2. **`stepOutcome` (spec §1).** Failing tests first, then the helper:
   - one test per row;
   - a success answer carrying a release that failed on the network gives
     `network` and ends the test, its lock recorded `unlock-sent` (spec
     "Decisions");
   - a verdict is attributed to the connection that answered it.

3. **Network failures are never resent (spec §2).** A failing test: a
   `network` failure whose words contain "already exists" is resent by
   today's `retryOnConflict`. Then `retryOnConflict` reads `stepOutcome` first
   and resends only on `refused`. A characterization test keeps the `409`
   retry on `refused`. The failed step names its outcome in `must`,
   `LambdaTester.run` and `HighTester.run`.

4. **The registry's states (spec §3).** Failing tests, then the change to
   `HeldLiveLocks`:
   - `held`, `unlock-sent` and released;
   - `left_locked` is recorded as `unlock-sent` and never sent;
   - `releaseAll` marks each lock before it sends, and sends only for `held`
     locks;
   - removal only on `ok` or the connection's own `session-lost`;
   - one registry per connection, so a verdict from another connection
     changes nothing.

5. **Locks released before the policy (spec §4).** A failing test: a failed
   test with the delete withheld leaves a `held` lock unsent today. Then
   `cleanupAfter` runs `releaseAll` before its early returns
   (`LambdaTester.ts:416-440`). Further tests cover the policy unchanged for a
   `network` failure, nothing sent after `credential`, and deletes after
   `session-lost` only on a connection that reports itself connected.

6. **Creates and deletes (spec §5).** Failing tests, then the shared
   object-state record:
   - an object is `unconfirmed` before its create is sent;
   - a delete marks the object `delete-sent` before it is sent;
   - a lost create is deleted by cleanup, and its `404` counts as removed;
   - a `delete-sent` object is never deleted again;
   - a lost lock answer is reported as possibly held.

7. **Move the suites (spec §3, §5).** Each is its own commit, with a failing
   test for its path first:
   - `IncludeHighHandlers.test.ts`: the `heldLock` variable and its early
     clearing go, `created` uses the object states, and the in-workflow
     `DeleteInclude` marks `delete-sent`;
   - `TableTypeHighHandlers.test.ts`: the same;
   - `rapFixtures.ts`: `writeViewSource`'s lock goes through the registry, and
     `createView` / `deleteView` use the object states;
   - the direct-call path of `NarrowedCompactTools.test.ts`;
   - `HighTester`: the generic create, the auto-generated delete cleanup, and
     taking in `left_locked` answers.

   A grep test proves that no soft-mode suite keeps a lock handle or a created
   name outside the two records.

8. **Session continuity (spec §9).** On the recording connection over the
   stand-in, a workflow whose write fails on the network proves:
   - one connection instance and one `connect()`;
   - the same identity and cookies through to the logoff;
   - the cleanup unlock under the original handle;
   - only LOCK and UNLOCK sent stateful;
   - no request sent twice;
   - the package delete the only request on another connection, and
     stateless.

   It fails today at the cleared handle and at the delete that is sent again.

9. **Package delete on its sibling (spec §7).** Tests cover the following;
   `force_new_connection: true` stays:
   - the delete goes through `packageSessions`, after the object deletes;
   - it follows the `delete-sent` rule;
   - its outcome is read against the sibling;
   - a sibling that cannot be opened is reported, and the run's connection is
     never used for the delete.

10. **The file's logoff (spec §6).** Failing tests first, each failing on
    today's harness:
    - a soft-mode run connection that owns a lock and whose `disconnect()`
      throws: today the root hook only warns, and the file passes;
    - an explicit `endTestConnection` that throws, followed by the root hook:
      today the connection has already left the tracked set
      (`openConnections.ts:39`), so the root hook neither sees nor reports it;
    - a credential refusal (the marker) with a lock still owned: today the
      logoff is skipped in silence (`openConnections.ts:41`), and the file
      passes.

    A characterization test pins that `disconnect()` is sent once across an
    explicit call and the root hook. It already holds today, and the new state
    must keep it.

    Then:
    - the per-connection terminal state, with `logoff-attempted` set before
      `disconnect()`, so a second call sends nothing;
    - the reports "logoff failed", "logoff not confirmed" and "logoff not sent:
      a credential was refused", each naming the locks and objects still owned;
    - a soft-mode run connection with something owned fails the file and lists
      what is left (spec "Decisions");
    - a connection without a registry only warns, which keeps hard mode as it
      is. A test covers the hard-mode helpers' path (`hardMode.ts:909-931`).

    The `@mcp-abap-adt/connection` follow-up goes into the PR description.

11. **`networkCut` (spec §8).** Failing tests first, then the helper:
    - it is inactive with neither variable set;
    - a value that is not valid is refused at file start;
    - the cut starts at the first `held` lock of the named test;
    - it ends once the given number of connections were refused, with no timer;
    - the start and end are reported.

    The tests run against the stand-in.

12. **README.** `src/__tests__/integration/README.md`:
    - how a soft-mode run behaves on a network drop;
    - what the report says about held locks, unconfirmed objects and the
      logoff;
    - the package sibling;
    - how to run with `networkCut`.

13. **CHANGELOG.** The harness entry under `## [Unreleased]`, beside step 1's
    line.

14. **Live check (owner).** One include suite on premise, with
    `MCP_TEST_NETWORK_CUT_REQUESTS=1` and `MCP_TEST_NETWORK_CUT_AT` naming its
    test (the write after the lock is refused, then the network is back). Expected:
    - the test fails `network`;
    - the cleanup unlock is sent once, with the original handle, in the same
      session;
    - if the network is back by then, the lock is released;
    - otherwise the report names the lock as still owned and the logoff as
      not confirmed.

    The result goes into the PR.

15. **Before merge.** The goal, spec and plan are deleted once everything is
    implemented. CI runs green, and Codex reviews.
