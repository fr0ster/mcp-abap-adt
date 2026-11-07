# Goal: the tests run on node:test

## Goal

The repository's tests run on Node's own test runner, `node:test`, with `node:assert/strict`.
Jest is gone: no `jest`, `ts-jest`, `jest-util` or `@types/jest` in the manifest, no Jest
configuration, no Jest API in a test. A failure in a run is a failure of the server or of the
test, never of the runner holding them.

## Invariants

- **A file is its own process.** Every test file runs in a process of its own; no heap,
  module registry, global or open handle is shared between files.
- **A test ends on its result.** No runner-chosen timeout cuts a test or a hook. A test
  ends when its work settles, or when an `AbortSignal` it was given aborts and its work ends
  on that.
- **Cleanup runs to its end.** A cleanup starts only after the body it cleans up after has
  settled, and nothing ends a file's process while a cleanup runs.
- **The live guarantees stay whole.** `liveSuite` keeps stating where its cases run and
  skipping with the reason elsewhere. The coverage ledger keeps naming a pin and a live
  case for every key. The run report keeps recording each key from the test's completed
  result. A required key that failed, was skipped or never ran keeps failing the run. The
  credential-refusal stop keeps refusing every call after a refusal. None of these gains a
  gap in the move, and none is weaker while any test still runs on Jest.
- **A unit test needs no outside service.** The unit run (`npm test`) reaches no network
  service and no local daemon. A test that needs one runs in a run of its own, which states
  where it runs.
- **npm scripts only.** Every run is an npm script that works the same on every supported
  platform and Node version. No shell prefix, no global tool.
- **Dependencies from the registry, nothing new at run time.** No new runtime dependency.
  Nothing in the test tooling is linked or installed from anywhere but the npm registry.
- **Static first.** A moved test is type-checked as strictly as today, by the repository's
  own `tsc`. It is compiled by `tsc`, not by Node's type stripping.

## Out of scope

- Changing what any test proves. A moved test asserts what it asserted before, unless
  the move exposes a test that proves nothing, which is then fixed and named.
- Changing the server's behaviour, its packages or their published contracts. An
  injection point a test needs in production code goes to the owner before it is added.
- Code coverage measurement.
- The other repositories' moves.
