# Plan: soft-mode tests keep their stateful SAP session through a network drop

Goal: `docs/superpowers/2026-11-28-soft-mode-stateful-goal.md`. Spec:
`docs/superpowers/specs/2026-11-28-soft-mode-stateful-spec.md` (#394).

Every step is test-first: a failing unit test, the change, the test green,
and the test proved load-bearing by breaking its rule once and watching it go
red. Each step is its own commit. Only `src/__tests__/` changes. After every
step the local gate runs: `npm run lint:check`, `npm run test:check`,
`npm test`.

## Steps

1. **Pin where the outcomes live (spec §1).** Unit tests on the ADT stand-in
   cover every path a soft-mode step can fail on: a direct throw, a strategy
   failure entry, the `client_threw` entry, and a `withLock` carrier. For a
   network error they establish which field carries the network code, and
   which carries a session verdict. A path that drops them goes to the owner
   as a finding. It reads as `refused` and is not patched in `src/lib`.

2. **`stepOutcome` (spec §1).** Add the shared helper with its five outcomes,
   one unit test per row. It reads typed fields only, never words, and reuses
   `isCredentialRefusal` / `refusalAnswered` for `credential`.

3. **The failed step names its outcome (spec §2).** `LambdaTester.run`,
   `HighTester` and each suite's `must` throw with the outcome as a fact. A
   unit test with a recording connection counts every request of a failing
   workflow and proves no step is sent twice. `retryOnConflict` stays
   unchanged, and a test proves a network error never matches it.

4. **`HeldLiveLocks` as the file's registry (spec §3).**
   - It gets the `unlock-sent` mark, and `released` follows the outcome: it is
     dropped on `ok` and `session-lost`, and kept on `network` and `refused`.
   - `releaseAll` sends only the unlocks that were never sent.
   - Taking in `left_locked` (top level and under `cleanup`).
   - One instance per test file, beside the tracked connection.
   - Unit tests for each rule.

5. **Move the suites onto the registry (spec §3).** Each file is its own
   commit:
   - `IncludeHighHandlers.test.ts` and `TableTypeHighHandlers.test.ts`: the
     `heldLock` variable is gone, and so is its clearing before the unlock;
   - `rapFixtures.ts` (`writeViewSource`);
   - the direct-call path of `NarrowedCompactTools.test.ts`;
   - `HighTester` / `LambdaTester`, which take in `left_locked` answers.

   A grep test proves that no soft-mode suite keeps a lock handle outside the
   registry.

6. **Lost responses (spec §5).** A create is listed `unconfirmed` before it is
   sent. Cleanup deletes such an entry, and a `404` on it counts as success. A
   lock whose answer was lost is reported as possibly held. Unit tests cover
   each case, in both suites and for the package entries.

7. **Cleanup order and policy (spec §4).** The order is `releaseAll` once,
   then the deletes the YAML policy orders, then the logoff. Unit tests cover:
   the policy kept for a `network` failure; no delete sent after `credential`;
   after `session-lost`, the deletes only on a connection that reports itself
   connected.

8. **Package delete on its sibling (spec §7).** `force_new_connection: true`
   stays. A unit test proves that the delete goes through `packageSessions`,
   runs after the object deletes, is sent once, and is never sent on the run's
   connection. A sibling that cannot be opened is reported.

9. **The file's logoff (spec §6).** The connection leaves `open` only after
   `disconnect()` returned. A throw fails the file and names the locks still
   held and the `unconfirmed` objects. A finished logoff is reported as
   "logoff written". Unit tests cover each case. The `@mcp-abap-adt/connection`
   follow-up (an answered logoff cannot be told from a lost one) goes into the
   PR description.

10. **The cut helper for a live run (spec §8).** The in-process network cut
    becomes a test-only helper that runs only when the run asks for it. Unit
    tests cover it against the stand-in. No live run happens without the
    owner.

11. **Docs.** `src/__tests__/integration/README.md`: how a soft-mode run
    behaves on a network drop, what the report says about held locks and the
    logoff, and the package sibling. Then a `CHANGELOG.md` entry under the
    unreleased 24.3.0, dated the day of the change.

12. **Live check (owner).** The owner runs one include suite on premise with
    a 5 s cut in the compact lock chain. Expected result: the test fails with
    `network`. If the network is back by cleanup, the lock is released with
    the original handle in the same session; otherwise the report names it as
    still held and the logoff as written. The result goes into the PR.

13. **Before merge.** The goal, spec and plan are deleted once everything is
    implemented. CI runs green, and Codex reviews.
