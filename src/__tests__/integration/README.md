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

```bash
# All integration tests — save the full log
npm run test:integration 2>&1 | tee /tmp/integration-test.log

# The high tools only
npm run test:high

# One object type
npm test -- --testPathPatterns=integration/high/class

# With debug logs
DEBUG_TESTS=true npm test -- --testPathPatterns=integration/high/class
```

## Notes

1. **Cleanup.** `HighTester` and `LambdaTester` clean up in `afterEach`, even on failure, unless the
   YAML disables it (`skip_cleanup=true` or `cleanup_after=false`). A test that creates several
   objects deletes each of them.
2. **Errors.** Check `result.isError` before parsing an answer.
3. **Locks.** A lock a test takes is released by the test, and a refused release fails it
   (`helpers/rapFixtures.ts` shows the pattern).
4. **Shared objects** are created once with `npm run shared:setup` and checked with
   `npm run shared:check`.

## Interrupts (draft — D27, plan step 6)

> **Draft.** Measured on 2026-11-08 for plan step 6 of D27; nothing here is a decision. Step 12
> builds the mechanism that lets a running cleanup finish at the first interrupt, and this
> section is rewritten then (step 18). Every claim is tagged **Measured** or **Inference**.

**What was run.** A node:test fixture file, run through `tools/run-tests.mjs` (`--repo` of a
fixture repository, `--concurrency 1`): its test body awaits 4 s of work, its `after` hook a
5 s cleanup; each step is appended to a file. The runner was started in a process group of its
own, as a shell starts a job, and SIGINT was sent either to the group — what a terminal's
Ctrl-C does — or to the runner's pid alone; once during the body, once during the cleanup, and
twice (1 s apart, starting in the body or in the cleanup). Each case was run with the file
having no signal listener, a `process.on('SIGINT')` listener that only records, and listeners
for both SIGINT and SIGTERM; and, as a reference, with `node --test` started directly, without
the runner. Linux only: Node 26.7.0 (host), 22.23.4 and 24.20.0 (the official `node:22` /
`node:24` images). The three versions behaved the same in every case (Measured).

**The processes.** The runner → `node --test` (started by `spawnSync`) → one process per
file. All three are in the runner's process group, so Ctrl-C reaches all three (Measured: the
file's recorded parent is the `node --test` pid; a group SIGINT reached the file's listener).

| Case | Measured |
|---|---|
| The runner, on SIGINT (group or pid) | Ends at once, killed by the signal (exit status: signal SIGINT, so a shell shows 130), within 2–7 ms, without waiting for `node --test`. It has no SIGINT handler. |
| `node --test`, on SIGINT (group) | Has its own handler: reports the running file as cancelled (Node 24/26 print "Interrupted while running" and `cancelled 1`; Node 22's TAP output in a pipe showed no summary), sends SIGTERM to the file's process (1–4 ms after the SIGINT), and exits with code 1 (started directly: within 4–11 ms; under the runner it was gone within 1 s), **without waiting for the file's process to end**. |
| The file's process, no listener (group) | Killed by the SIGINT at once: the body or the hook stops mid-way, no `exit` event, the hook never finishes. node:test installs no SIGINT or SIGTERM listener there (listener count 0). |
| The file's process, SIGINT listener only (group) | Survives the SIGINT, then is killed by `node --test`'s SIGTERM: the hook never finishes, no `exit` event. |
| The file's process, SIGINT and SIGTERM listeners (group) | Survives both. Interrupted in the cleanup: the hook runs to its end and the process exits with code 1 — about 4 s after the runner and `node --test` have already exited, as an orphan whose output nobody reads. Interrupted in the body: the body runs on to its end (it is not aborted), the hook starts, and the process ends during the hook without an `exit` event (the cause is not established; Inference: its report to the `node --test` that is gone). |
| `t.signal` and the hook's `signal` | Never aborted by an interrupt, in any case. `t.signal` aborts only when the test ends normally; the hook's signal never aborted. |
| SIGINT to the runner pid alone | Only the runner ends (as above). `node --test` and the file see no signal and run to their natural end — the hook finishes, the file exits 0 — as orphans, after the run has already ended with the signal; the second SIGINT finds no runner (ESRCH). |
| Second SIGINT (group) | With no listener, or a SIGINT listener only, nothing is left to receive it: the group is empty within 1 s of the first (ESRCH). With both listeners, only the orphaned file's process receives it, and it changes nothing. |
| `node --test` directly (reference) | The same as its row above: exit code 1 within 4–11 ms; the file's process is killed or orphaned exactly as in the group cases. |
| Leftovers | None: in every case every process had ended by itself within 20 s of the interrupt (the longest, an orphan running its body and hook to their end, about 9 s). |

**What follows for step 12** (Inference, not a decision). As things stand, the first Ctrl-C cuts
a running cleanup on Linux: the file's process is killed by the SIGINT or by `node --test`'s
SIGTERM, and neither the runner nor `node --test` waits for it. A cleanup did finish only when
its own process survived both signals — and then after the run had ended, so a terminal
returns the prompt while it still runs and its result is reported nowhere. A mechanism has to
keep the run alive until the file's process has ended and keep that process from being killed
by the first interrupt; whether `node --test` itself can be made to wait is not measured.

**macOS and Windows** (GitHub Actions, 2026-11-08: macos-latest arm64 and windows-latest x64, Node 22.23.4 and 24.22.2; ubuntu-latest Node 22.23.4 as the control; two runs, the same in every case; a throwaway probe whose job and branch were removed afterwards). The fixture, the variants and the timings are the ones above. On POSIX the runner was started in a process group of its own, as on Linux. On Windows a small helper (C#, compiled with the .NET Framework's `csc`, called by argument array) gave the runner a console of its own, and `GenerateConsoleCtrlEvent` sent a real CTRL_C_EVENT (and, as its own case, CTRL_BREAK_EVENT) to every process on that console, which is what a terminal does. `process.kill(pid, 'SIGINT')`, which on Windows terminates the process, was recorded as its own case. Every claim is **Measured** unless tagged **Inference**.

- **Linux control:** CI's ubuntu-latest matched the local Linux findings in every case.
- **macOS:** the same as Linux in every case, on both Node versions. The runner is killed by SIGINT within 1–7 ms. `node --test` sends SIGTERM to the file and exits without waiting. With no listener, or a SIGINT listener only, the file is killed and the hook never finishes. With SIGINT and SIGTERM listeners, a cleanup in progress runs to its end as an orphan (ppid 1) and exits 1 about 3.5 s after the run has ended; interrupted in the body, the body runs on, the hook starts, and the process ends during it with no `exit` event. A SIGINT to the runner's pid alone leaves `node --test` and the file to finish as orphans (hook done, exit 0). A second group SIGINT finds an empty group (ESRCH), or only the orphan. `t.signal` and the hook's signal never abort.
- **Windows:** the first console Ctrl-C ends every process of the run. The runner exits with 0xC000013A (STATUS_CONTROL_C_EXIT) within 24–33 ms, and `node --test` and the file are gone by the first check, about 230 ms (bounded by the helper's 200 ms sleep, not measured more finely). A file with a SIGINT listener records the event and nothing after it. A SIGTERM listener never fires, and the hook never finishes in any variant. No process is left over. Ctrl-Break does the same (a file listening for SIGINT and SIGTERM records SIGBREAK and dies anyway). `process.kill(runner, 'SIGINT')` terminates the runner (exit 1), and `node --test` and the file end within about 50 ms without seeing any signal: unlike POSIX, no orphan is left. Started directly, `node --test` exits 1 within 28–36 ms and the file is killed the same way (Node 24 reports `cancelled 1`). `t.signal` and the hook's signal never abort.
- **Why Windows differs (Inference):** libuv places every child process that is not detached in a job object that kills its members when the parent's handle closes, so a parent's death takes its descendants with it. And `node --test`'s SIGTERM to the file is a TerminateProcess on Windows, which no listener can catch.
- **What follows for step 12 (Inference, not a decision):** on Windows a listener in the file's process cannot keep a cleanup alive. Both the runner and `node --test` would have to survive the first Ctrl-C and not end the file's process. Whether a `node --test` started in a process group of its own (`detached`) can be made to do that was not measured.

**Not measured:** a TTY (the probe's output went to a pipe).
