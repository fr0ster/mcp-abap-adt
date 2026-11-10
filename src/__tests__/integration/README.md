# Integration Tests

The tests in this directory run the handlers against a real SAP system. They need
`tests/test-config.yaml` (copied from `tests/test-config.yaml.template`) and skip without it.

## Structure

```
integration/
├── high/        # the high tools, one directory per object type (create → update → activate → delete)
├── readOnly/    # the read-only tools (ATC, function, structure, system, transport)
├── debugger/    # the debugger tools
├── server/      # EmbeddableMcpServer against the system
└── helpers/     # configuration, sessions, shared objects, the testers
```

There is no `low/` directory: the low set left the full binaries in 19.0.0, and its suites
and `LowTester` were removed with it. The single-step operations it served — lock, a write under
the lock, unlock, check, validate, activate — are the compact binaries'. Their requests are tested
against an ADT stand-in in `src/__tests__/unit/lowToCompact.test.ts` and
`src/__tests__/unit/compactCoversLow.test.ts`, not here.

## Testers

- `HighTester` runs a high tool's workflow and its cleanup.
- `ReadOnlyTester` runs a read.
- `LambdaTester` runs workflow functions (lambdas) that receive the tester's context — see
  [`helpers/testers/README.md`](helpers/testers/README.md).

In soft mode (the default) a tester calls the handler functions directly. In hard mode
(`integration_hard_mode.enabled: true`) it spawns the server and calls its MCP tools by name, so a
test names the tool the full binary serves (`ActivateClass`, `DeleteClass`, …). An operation only
compact serves (a package delete, `HandlerDelete` PACKAGE) is not served by a full-binary hard
mode; such a call is reported as not found.

## Running

The live suites run on `node:test`, through the repository's runner (`tools/run-tests.mjs`), and
only under a live npm script: `npm test` never reaches them (it leaves these directories out, and
refuses a live file it is given). Each live script builds the tests first and runs **one file at
a time** (`--concurrency 1`): the live files share one system, one session written by the setup,
the run's refusal marker and call log, and objects one file's cleanup must not race with another's.
The unit run's concurrency is another matter (`docs/development/tests/TESTING_GUIDE.md`, "The
node:test run's concurrency").

```bash
# All integration tests — save the full log
npm run test:integration 2>&1 | tee /tmp/integration-test.log

# The high tools only
npm run test:high

# One file, by its source path
npm run test:integration -- src/__tests__/integration/high/class/ClassHighHandlers.test.ts

# A family of files, with the coverage ledger
npm run test:coverage-family -- src/__tests__/integration/high/class/ClassHighHandlers.test.ts

# With debug logs (--env works on every platform; a shell prefix does not on Windows)
npm run test:integration -- --env DEBUG_TESTS=true src/__tests__/integration/high/class/ClassHighHandlers.test.ts
```

A file is named by its source path; Jest's `--testPathPatterns` is not read. A suite is a
`liveSuite` (`helpers/live.ts`): it states where it runs and skips with the reason elsewhere (a
skipped `describe`, the reason its skip message); its cases call the system through `liveCall`,
which records each call for the coverage ledger under the running case's name path (`t.fullName`)
and refuses outside a case. No live test carries a bound, a delay or a poll limit: each step
goes on the answer of the one before it, and a wait that does not end is ended with Ctrl-C
(below).

## Notes

1. **Cleanup.** `HighTester` and `LambdaTester` clean up in `afterEach`, even on failure, unless the
   YAML disables it (`skip_cleanup=true` or `cleanup_after=false`). A test that creates several
   objects deletes each of them.
2. **Errors.** Check `result.isError` before parsing an answer.
3. **Locks.** A lock a test takes is released by the test, and a refused release fails it
   (`helpers/rapFixtures.ts` shows the pattern).
4. **Shared objects** are created once with `npm run shared:setup` and checked with
   `npm run shared:check`.

## Interrupting a run

The runner (`tools/run-tests.mjs`) starts every test file in a `node --test` of its own, in a
process group of its own (`detached`; on Windows a console process group of its own), so a
terminal's Ctrl-C reaches the runner alone.

- **The first interrupt:** no further file starts; every running file is told to stop through
  a file the runner owns (`MCP_ABAP_ADT_STOP_FILE`, no signal). A file finishes the case it is
  running, that case's cleanup included; a live suite (`liveDescribe`) skips its remaining
  cases with the reason ("the run was interrupted…"), and refuses their calls before they
  send (node:test runs a skipped case's body all the same). The runner says on stderr that it
  waits, waits for every running file to end by itself, and the run fails; under a live
  script the teardown still runs.
- **The second interrupt** ends the process tree of every file still running (the process
  group on POSIX; `taskkill /T /F` on Windows): a cleanup still running is cut there.

Tested on POSIX (`unit/runner/interrupt.test.ts`, which sends the interrupt to the runner's
group as a terminal does); on Windows the console Ctrl-C cannot be sent by a test, and the
mechanism is not measured there yet (step 6's findings below are what was measured before it).

**Why the runner holds the interrupt** (Measured 2026-11-08, before it did; Node 22, 24 and 26,
Linux, macOS and Windows). Run as `node --test` does it, a first Ctrl-C cut a running cleanup on
every platform: on Linux and macOS the file's process was killed by the SIGINT, or by the
SIGTERM `node --test` sends it, and neither the runner nor `node --test` waited for it; on
Windows the console Ctrl-C ended every process of the run, and no listener in the file could
keep its cleanup alive. `t.signal` and a hook's signal never aborted on an interrupt.
