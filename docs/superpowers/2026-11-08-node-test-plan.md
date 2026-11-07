# Plan: the tests on node:test — the first wave (D27)

Goal: `2026-11-08-node-test-goal.md`. Spec: `2026-11-08-node-test-spec.md`. The spec binds;
each step names the spec section it carries out. A plan of steps, not code: the code is
written in the step, test first.

**Every commit ends green,** on both runners:
- `npm run build`, `npm test` (Jest and the runner), `npm run test:check`,
  `npm run lint:check`;
- every package's `lint:check` and `test:check`;
- CI's step list on its whole matrix (ubuntu, macOS, Windows × Node 22, 24).

**Every step proves itself load-bearing:** it names the guard or fixture that turns red
when its rule is broken, the rule is broken once on purpose, the test is seen red, the
change is reverted. A moved file keeps its path and its test count (N1's appendix); a
difference is named in the commit.

**The owner's answers** to the plan's questions (P1–P5) are recorded at the end and bind
the steps that name them.

## Baseline

1. **Inventories, before any change** (spec §1, §4, §9). Written into this plan as
   appendices and committed with it:
   - **A — the first wave's files,** each with its test count under Jest (`--listTests` and
     the JSON result's per-file counts): the 58 live files, the six machinery tests, the seven
     TypeScript-program scans, the four slow suites, the two install suites, the Ollama suite
     and its helpers;
   - **B — the shared code they reach:** every module a listed file imports, directly or
     through others, that uses a Jest API or global (known now: `helpers/pinCases.ts` through
     `live.ts`'s `servedEntries`; `integration/helpers/testHelpers.ts`'s `expect`, and
     `sharedObjects.ts`, `HighTester.ts`, `LambdaTester.ts` through it);
   - **B2 — what the Jest hook closes:** every caller of `trackConnection` (the only
     registration; `endTestConnection` disconnects and registers nothing), and every test
     file that reaches one, directly or through imports, with the runner it stays on after
     step 11. Known now (Code, grep): `integration/helpers/live.ts` (the live runner),
     `integration/helpers/sessionHelpers.ts`, `integration/coverage/backgroundRuns.live`,
     `integration/coverage/searchSource.live`, `integration/high/class/ClassCrudClientDirect`
     — all live, all moving in step 11 — and the files reaching them outside `integration/`:
     `admin/shared-deps/{setup,check,teardown}` and `unit/coverage/{refusalStop,live,
     liveDescribe}`, all moving in step 11; `unit/harness/testLogoffs` registers fakes and
     drains them itself with `closeTrackedConnections`, so it needs no hook. So no file left
     on Jest relies on the hook, and step 11 removes it, as the spec says; if step 1 finds a
     file that does, it is listed here and step 11 makes it close its own connections;
   - **C — the bounds:** every reader of `getTimeout` (53 files today) and of each key under
     `test_settings` in `tests/test-config.yaml.template` (`timeout`, `timeouts.*`) and of
     every other time key a live suite reads (`timeouts.delay`, `poll_timeout_ms` in the ATC
     suite), with every reader — all of them go in step 13 (P3);
   - **D — the scripts:** every npm script that runs Jest, with its flags (`--forceExit`,
     `--runInBand`, `--testPathPatterns`, `--testPathIgnorePatterns`, `--roots`), and every
     CI step that runs one.
2. **A fresh Jest live run as the reference** (spec §9, the live acceptance; P4). The
   required keys, the run report and the leftovers of a full `test:integration` run on each
   system kind the ledger names, run on Jest before the live move (step 11), each with the
   owner's go. Logs and reports stay outside the
   repository; the counts per system go into the PR description, with no system name.

## The runner (spec §2)

3. **The list file, the name table, `jest.config.js` and the resolve hook** (spec §2,
   "The partition is a list in the runner", "Sibling packages by name"; P1). Neither the
   list nor the table exists yet; both are made here, each the single source of what it
   holds, with no copy.
   **Files:**
   - the list file (new; one file under `tools/`, its name given in the commit), empty in
     this step: the source paths of the files that run on node:test;
   - the name table: `tsconfig.paths.json` (new) at the repository root, plain JSON with
     `compilerOptions.paths` alone — each of the 46 package names and its source entry;
   - `tsconfig.test.json`: `extends` becomes `["./tsconfig.json", "./tsconfig.paths.json"]`
     and its own `paths` block goes, so the type checker takes the table as it is;
   - `jest.config.js` (new) replacing `package.json` `jest`: every setting moved as it is;
     `moduleNameMapper` built from `tsconfig.paths.json` (`./x` → `<rootDir>/x`, each name
     anchored) plus the relative-`.js` rule, which is Jest's own and lives only here;
     `testPathIgnorePatterns` the two directories of today plus every path of the list, each
     an exact path; `setupFilesAfterEnv` kept until step 11; `package.json` loses its `jest`
     block;
   - the readers of `package.json` `jest` today, each reading the new sources instead:
     `integration/helpers/packageSources.ts` (the table), `unit/coverage/live.test.ts` and
     `unit/coverage/runReport.test.ts` (Jest's configuration through `jest.config.js`);
   - the resolve hook (a preload, compiled with the node:test build of step 4, answering
     exactly the table's names with their compiled files).

   **Why the table is a tsconfig fragment** (measured with the repository's TypeScript
   6.0.3, on a probe outside the repository): a child configuration with
   `"extends": [base, fragment]` keeps every option of its own and of the base, and takes
   `paths` from the fragment, as long as the child defines no `paths` itself; `paths` resolve
   relative to the file that defines them, so the fragment sits at the root, where its
   `./…` targets are the repository's (a fragment under `tools/` fails to resolve the same
   targets; a child in a sub-directory extending the root fragment resolves them). So the
   type checker, Jest and the hook read one file, and no equality guard is needed.

   **Steps (red first):**
   - [ ] Red, under Jest (the runner comes in step 4):
     - `'Jest's mapper is the table'` — the loaded configuration's `moduleNameMapper` holds
       exactly the table's names, each to its target, and the `.js` rule;
     - `'Jest ignores every listed path'` — with a temporary list of one existing file, the
       loaded configuration ignores it and `--listTests` no longer finds it;
     - `'the type checker's paths are the table'` — `tsconfig.test.json` defines no `paths` of
       its own and extends `tsconfig.paths.json` (`tsc --showConfig` shows the table's
       names);
     - `'the hook answers only the table's names'` — a name not in the table goes to Node's
       own resolution, a table name to its compiled file;
     - `'nothing reads package.json jest'` — the manifest has no `jest` block.
   - [ ] The two files, `jest.config.js`, `tsconfig.test.json`, the readers; every Jest suite
     green, the same counts (`--listTests` before and after equal); `test:check` green.
   - [ ] Load-bearing, mutating the readers, not the data:
     - `jest.config.js` builds its ignores without the list — `'Jest ignores every listed
       path'` red;
     - `jest.config.js` drops one table entry while mapping — `'Jest's mapper is the table'`
       red, and every Jest suite importing that name fails to resolve;
     - `tsconfig.test.json` gets a `paths` block of its own — `'the type checker's paths are
       the table'` red;
     - the hook answers a name outside the table — its test red.
   - [ ] CHANGELOG / MIGRATION only if a consumer of the scripts sees the move (Jest's
     configuration is the repository's own: expected none; stated in the commit).
   **Commit:** `test: D27 — one list, one name table; Jest and the type checker read both`.

4. **The runner, the test build, the list and the partition guard** (spec §2, §5).
   **Files:** `tools/run-tests.mjs` (new), the `npm test` tool (new, `tools/`), every
   sub-package `package.json` only if its `test` script must change (the tool's translation
   is meant to make that unnecessary), the node:test build configuration
   (`tsconfig.node-test.json`: `extends` `["./tsconfig.json", "./tsconfig.paths.json"]`, no
   `paths` of its own, `types: ["node"]`, `outDir` `.test-build/`, `noEmitOnError`),
   `.gitignore` (`.test-build/`), step 3's list file (its
   first entries), which `jest.config.js` already ignores, the repository-root
   helper for moved tests, `package.json` scripts (`test`, a `test:build`, the Biome
   lists naming `tools/run-tests.mjs`), CI unchanged (it runs `npm test`).
   **Steps (red first):**
   - [ ] Red, as node:test files (the first on the list):
     - `'the runner refuses an empty run'`, `'a named file must exist'`, `'options go before
       files'`, `'--env sets a variable without a shell'` — on a temporary list;
     - `'a file belongs to exactly one runner'` — the partition guard: every `*.test.ts` of
       the 18 roots is on the runner's list or found by Jest's discovery, never both, never
       neither; every listed path names a file. Jest's discovery is read by running Jest's
       own `--listTests --json` in a child process, not by importing Jest (P5);
     - `'the node:test build refuses a Jest global'` — a fixture compiled with the node:test
       build configuration that uses `expect` fails to compile;
     - `'every test configuration takes its paths from the table'` — step 3's guard widened:
       `tsconfig.test.json` and `tsconfig.node-test.json` each extend `tsconfig.paths.json`
       and define no `paths` of their own, and the root `tsconfig.json` has none; a listed
       file importing a sibling by name compiles in the node:test build and runs through the
       hook;
     - `'the runner takes no default concurrency'` — a run without the setting is refused
       with words naming the setting;
     - `'the build starts clean'` — a stale `*.test.js` placed in `.test-build/` (a source
       that no longer exists) is gone after `test:build`, and the runner never runs it;
     - `'a failed compile runs nothing'` — a fixture with a type error: `test:build` exits
       non-zero (`noEmitOnError`), nothing is emitted, and the runner refuses to run;
     - `'every file runs in its own process'` — two fixture files each record `process.pid`
       and set a global; run together, the pids differ and neither sees the other's global;
     - `'a root filter selects that root on both runners'` — the `npm test` tool given
       `--roots server-runtime/src` (the form every sub-package script forwards today,
       e.g. `server-runtime/package.json` `test`) passes it to Jest as `--roots` and to the
       runner as `--root`, and each runs only that root's files (read through Jest's
       `--listTests` and the runner's list mode); for every sub-package `test` script;
     - `'a root with no node:test file yet runs Jest alone'` — the intermediate state (every
       sub-package root until its first file moves; `server-runtime` until step 14): the
       tool, given a valid root the runner's list has no file under, runs Jest over it, skips
       the runner with a line saying so, and exits 0 when Jest passes; a fixture root (a
       temporary root with one passing Jest file and no listed file) proves it by a real
       run; and `'a direct runner run with an empty selection fails'` — the runner itself,
       given that root, still refuses;
     - `'a filtered run succeeds on both runners'` — a fixture root with one passing Jest
       file and one listed passing node:test file: the tool's real run exits 0, both
       runners ran, each its one file; with either file failing, the run fails;
   - [ ] The runner (auth-errors' model: `process.execPath`, options before files, a run with
     no file refused, `--env NAME=VALUE`), with: the source path → compiled path mapping, the
     preload of step 3's hook, the concurrency setting (an option and one documented
     variable; none given is refused), a root filter (`--root <dir>`, spec §5), and a list
     mode that prints what it would run.
   - [ ] `npm test` runs Jest, then the runner, both even when the first fails; the script
     fails when either does (spec §5, decision). A small `tools/` script runs the two, since
     `&&` stops at the first. It translates the sub-packages' `--roots <dir>` for both
     runners, so `npm --prefix <package> test` keeps working, unchanged, from this commit on.
     Until step 8 measures it, `npm test` passes concurrency `1`, today's in-band behaviour,
     stated as such in the script's comment.
   - [ ] Load-bearing: put one file on both runners, then on neither, then list a missing
     path — each red; remove the `types: ["node"]` restriction — the build fixture green,
     so the test red; let `npm test`'s first runner fail — the second still runs and the
     script fails; drop the removal of `.test-build/` — `'the build starts clean'` red;
     drop `noEmitOnError` — `'a failed compile runs nothing'` red; pass
     `--test-isolation=none` — `'every file runs in its own process'` red; let the tool pass
     `--roots` to Jest only — `'a root filter selects that root on both runners'` red; make
     the tool call the runner for a root with no listed file — `'a root with no node:test
     file yet runs Jest alone'` red; make the runner accept an empty selection — `'a direct
     runner run with an empty selection fails'` red; drop `tsconfig.paths.json` from
     `tsconfig.node-test.json`'s `extends`, or give it a `paths` block — `'every test
     configuration takes its paths from the table'` red.
   - [ ] **Dependencies** (spec §9): `package.json`'s `dependencies` unchanged and no package
     added to `devDependencies`; after `npm install`, `package-lock.json` has no
     `"link": true` and no `resolved` outside `registry.npmjs.org` (counted by a one-line
     read of the lockfile; both counts 0), recorded in the commit. Repeated in step 20.
   **Commit:** `test: D27 — the node:test runner beside Jest; one list, one guard`.

5. **The no-timeout scan** (spec §2, "No runner timeout"; §3, "No force exit").
   **Files:** a new source scan beside `unit/sources/` (a node:test file on the list), its
   fixtures.
   **Steps (red first):**
   - [ ] Red: one fixture each — `--test-timeout` in a script, `{ timeout }` on a `test`, an
     `it`, a `describe`, a hook, `--test-force-exit` in a script, `--forceExit` in a script —
     each refused by its own check alone, and `clean` by none. The scan reads node:test
     files and every npm script. Until step 11 it allows exactly four script/flag pairs —
     `test:integration` `--forceExit`, `test:coverage-family` `--forceExit`, `test:high`
     `--forceExit`, `test:live-connection` `--forceExit` (Appendix D confirms them) — and
     refuses any other pair and any addition to the list; step 11 empties it.
   - [ ] Load-bearing: delete each check in turn — its fixture passes, so the test is red;
     add `--forceExit` to `shared:setup` — refused as a pair outside the list.
   **Commit:** `test: D27 — no runner timeout and no force exit; the scan`.

6. **The first interrupt: measure** (spec §3, "The first interrupt"). A measurement, no
   decision taken in it.
   **Files:** none committed but the findings; the probe is a hand-run script, deleted after
   the run, its results written into `src/__tests__/integration/README.md`'s draft section
   and into this plan.
   - [ ] On each OS of CI's matrix where it can be run, and on Node 22 and 24: a node:test
     fixture file whose test body awaits work and whose `after` hook runs a cleanup that takes
     long enough to be interrupted, run through the runner. Ctrl-C (SIGINT; on Windows the
     console's Ctrl-C) once during the body, once during the cleanup, and twice. Record which
     process gets the signal (runner, `node --test`, the file's process), what the running
     test and hook see (`t.signal`, `process` events), whether the hook finishes, and the
     exit code.
   - [ ] The findings decide the mechanism of step 12; if they show the first interrupt cannot
     be made to let a cleanup finish on some platform, that goes to the owner before step 12.

## The scans and the measurements (spec §4, §2)

7. **Move the TypeScript-program scans** (spec §4).
   **Files:** `unit/sources/noDerivationFromAuthorization`, `noProseMatching`,
   `noChainInstanceof`, `noRegexOverInput`, `typeCodeScan`, `typeCodeLiterals`,
   `staticTypes` (`.test.ts`), `unit/sources/helpers/*Scan.ts` where they read the repository
   by `__dirname`, the runner's list.
   **Steps (red first):**
   - [ ] Each file onto the list, converted (spec §4, "How a file moves"); `jest.setTimeout`
     goes. Its test count is Appendix A's.
   - [ ] Load-bearing: each scan's own refusal fixtures stay red under node:test — break one
     fixture's rule in the sources scanned (or point the scan at a refused fixture) and see it
     fail; and make `jest.config.js` drop the list from its ignores — the partition guard red
     (every moved scan then on both runners).
   **Commit:** `test: D27 — the TypeScript-program scans on node:test`.

8. **Measure the node:test unit run's concurrency** (spec §2, "Concurrency is a setting").
   - [ ] With the scans on the list, run the node:test unit set at concurrency 1, 2, 4 and the
     machine's available parallelism, on a developer machine and on each CI runner kind: peak
     RSS of each file's process and of the whole run, and wall time. Record the figures.
   - [ ] **Decision point:** the setting each run uses — `npm test` on CI (per runner kind)
     and locally — is written from the figures: the CI workflow passes it explicitly, the
     docs state the measured figures and which value they support, and the runner keeps no
     default. If the figures show no safe single value for a runner kind, CI passes `1`
     there and the docs say why.
   **Files:** `.github/workflows/ci.yml`, `release.yml` (the setting per cell),
   `package.json` (`npm test`'s comment), `src/__tests__/integration/README.md` or the
   contributor docs (the figures).
   **Load-bearing:** step 4's `'the runner takes no default concurrency'`.
   **Commit:** `test: D27 — the runner's concurrency, measured`.

9. **The shared code the live files need** (spec §2, "Runner-independent shared code").
   **Files:** a new runner-free module holding `servedEntries` and whatever else Appendix B
   names, `helpers/pinCases.ts` (imports it), `integration/helpers/live.ts` (imports it),
   and the Appendix B modules that move with the live files, left in place for step 11.
   **Steps (red first):**
   - [ ] Red: a node:test file on the list that imports the new module through the node:test
     build — it fails to compile while the module reaches `pinCases.ts`.
   - [ ] Extract; `pinCases.ts` imports from the module; every Jest pin suite passes unchanged
     (Appendix A's counts for them untouched).
   - [ ] Load-bearing: import `pinCases.ts` from the new module again — the build test red.
   **Commit:** `test: D27 — the live files' shared code needs no test runner`.

10. **The coverage guard reads node:test's forms** (spec §3, "The coverage guard sees
    node:test's forms").
    **Files:** `unit/coverage/ledgerScan.ts`, new fixtures under
    `unit/coverage/__fixtures__/coverage/` (one per form), `coverageLedger.test.ts`'s
    fixture table. The guard still runs on Jest in this step.
    **Steps (red first):**
    - [ ] Red fixtures, each refused by its own check alone: a live case with an options
      object carrying `skip`, one with `todo`, one with `only`, one with `concurrency`; a
      `t.skip()` and a `t.todo()` in a case body; a node:test function imported under another
      name; a pin file with each of the same; a `liveCall` in a node:test hook (`before`,
      `after`, `beforeEach`, `afterEach`), refused as `live-in-after-each` is for Jest. And
      accepted: a node:test `test` / `it` / `describe` / `suite` imported from `node:test`,
      its `.skip` / `.todo` counted as skipped and `.only` refused as Jest's are, its hooks
      recognised as hooks, and a node:test live case counted like a Jest one (a `clean`
      fixture in node:test form, with a `suite` and hooks).
    - [ ] The scanner recognises the node:test functions by their import from `node:test` and
      refuses the forms above.
    - [ ] Load-bearing: delete each new check in turn — its fixture accepted, the guard test
      red; `clean` (both forms) refused by none.
    **Commit:** `test: D27 — the coverage guard reads node:test's skip, focus and concurrency
    forms`.

## The live move (spec §3, §4, §5)

11. **The live machinery and every live suite, together** (spec §3; decision: no Jest variant
    of the live machinery). One step, one commit: the live files, their helpers and the
    machinery cannot run on two runners at once without a Jest variant the spec rules out,
    and the owner chose one atomic commit over a temporary dual path (P2). The sub-steps are
    not separate commits.
    **Files:**
    - the machinery: `integration/helpers/live.ts` (`liveSuite`, `liveDescribe`, `liveCall`
      through an `AsyncLocalStorage`, the shared join-key function), a new node:test ledger
      reporter (replacing `coverageReport/coverageReporter.ts`, writing through
      `reportFormat.ts`), the runner (setup before, teardown after, under a live script),
      `globalSetup.ts` / `globalTeardown.ts` (their logic called by the runner; the Jest
      entry points go), `helpers/liveScripts.ts` (`selectsLiveSuites` reads the runner's
      form), `helpers/closeConnectionsAfterAll.ts` (the per-file close, spec §2),
      `helpers/packageSources.ts` (removed: the hook of step 3 serves the setup);
    - the machinery's tests: `unit/coverage/liveDescribe`, `liveScripts`, `runReport`,
      `refusalStop`, `live`, `coverageLedger` (`.test.ts`), and their fixtures under
      `__fixtures__/report/` and `__fixtures__/live/`, rewritten as node:test files run through
      `node --test` with the reporter;
    - every live file (Appendix A: 55 under `integration/`, 3 under `admin/shared-deps/`) and
      the integration helpers of Appendix B;
    - `package.json`: the seven live scripts through the runner with concurrency `1` and the
      reporter where they carry it today, no `--forceExit`; `build:test-reporter`,
      `check:test-reporter` and `pretest*` removed; `tsconfig.reporter.json` removed;
    - `jest.config.js`: `globalSetup`, `globalTeardown` and `setupFilesAfterEnv`
      (`closeConnectionsAfterAll.ts`, removed with it) removed, as the spec says; the 58
      live files and the machinery's tests added to the list it reads. No file left on Jest
      registers a connection the hook would close (Appendix B2); a file step 1 finds that
      does is changed here to close its own;
    - the no-timeout scan's shrinking list (step 5) emptied.
    **Steps (red first):**
    - [ ] Red, as node:test files run through `node --test` with the new reporter:
      - the reporter: `passes` → `passed`; a failing body → `failed`; a failing `afterEach`
        → `failed`; a missed plan or assertion count, where node:test can state one, →
        `failed` (`assertionsMissed`'s counterpart; dropped and named if node:test has no
        such form); a cleanup that fails → `failed` (`cleanupFails`); a `todo` case after a
        recorded call → `skipped`; a cancelled case (its `before` hook fails, or its parent
        fails while it runs) after a recorded call → `failed`; a file whose process exits
        mid-test → its key `not run`;
      - the files that ran: a family run of two fixture files records both by their
        repository source paths (`….test.ts`), not their compiled paths, and the family
        scope requires exactly those files' keys;
      - the skips: a case skipped before any `liveCall` → no call recorded, the key `not
        run`; a case that calls `t.skip()` after a recorded `liveCall` → `skipped`; each
        fails the required-key check (`checkRunReport`);
      - `liveCall` outside a `liveSuite` case refused; inside one, the call log holds the
        case's file and name path, and the reporter joins it;
      - the join key: `liveCall` and the reporter build the same key for a case nested two
        `describe`s deep, by one function;
      - `liveSuite` without a config, and on a system it does not name, skips with the reason;
      - setup and teardown in the runner: a family selection that is not an exact
        integration test source path is refused before anything is read; teardown fails the
        run on a refusal marker, on a required key not passed, and runs when the run failed;
      - the refusal stop: after the marker, every helper refuses before it sends
        (`refusalStop`'s cases);
      - `liveScripts`: every live script runs through the runner with concurrency `1`, and a
        live script without it is refused;
      - the per-file close: a fixture file that opens a tracked connection ends with it
        closed, after its own hooks;
      - `'no Jest file leaves a tracked connection to a hook'` — over Jest's `--listTests`
        (child process) and the TypeScript import graph of those files: none reaches
        `trackConnection` unless it also calls `closeTrackedConnections` itself
        (`testLogoffs`);
      - the coverage guard (moved): the union of Jest's discovery and the runner's list
        (step 4's child-process read), a pin in a file of either runner found, a pin in a
        file of neither refused.
    - [ ] The machinery, then the live files: each converted (spec §4); `getTimeout`
      arguments dropped from every case (spec §3, "No bound"); the integration helpers of
      Appendix B on `node:assert/strict`; `DebuggerHandlers`' `expect.stringContaining`
      checks as string checks.
    - [ ] Every live file ends without a force exit: each file is run on its own through the
      runner without a test config (its cases skip) and with the stand-ins where it has them;
      a file that does not end has an open handle, found and fixed in the file or the helper,
      named in the commit.
    - [ ] Load-bearing, one mutation per guarantee, each turning the named assertion red:
      - map a failing body to `passed` — the failing-body fixture's `failed` red; likewise
        the failing `afterEach`, `cleanupFails` and cancelled fixtures, each by its own
        mutation;
      - map `skip` to `passed`, then `todo` to `passed` — the skip-after-call and todo
        fixtures' `skipped` red, and `checkRunReport` no longer fails them;
      - record a test the file's process never reported as `passed` at the file's end — the
        crash fixture's `not run` red;
      - record the compiled path of a file that ran — the family-run fixture red;
      - build the reporter's key without the outer `describe` — the join-key test red;
      - `liveCall` reads no current test (the ALS unset) — `'liveCall inside a case records
        its file and name path'` red, and outside a case it is no longer refused;
      - the runner ignores teardown's failure — `'teardown failing fails the run'` red; it
        skips teardown after a failed run — `'teardown runs when the run failed'` red;
      - setup accepts a directory as a family selection — its refusal test red;
      - `refuseAfterMarker` returns without refusing — `refusalStop`'s cases red;
      - `liveSuite` runs its cases without a config — its skip test red;
      - drop the per-file close — `'a tracked connection is closed after the file's hooks'`
        red;
      - import `sessionHelpers.ts` from a Jest unit fixture file that never closes — `'no
        Jest file leaves a tracked connection to a hook'` red;
      - give one live script concurrency 2 — `liveScripts`' test red; restore `--forceExit`
        in one script — the no-timeout scan red (its allowed list is empty now).
    **Commit:** `test: D27 — the live suites and their machinery on node:test`.

12. **The first interrupt lets a running cleanup finish** (spec §3), by step 6's findings.
    **Files:** the runner and the live helpers, per the findings; a node:test fixture.
    **Steps (red first):**
    - [ ] Red: the fixture of step 6, run through the runner by a test that sends one
      interrupt while its cleanup runs: the cleanup's end is recorded before the process
      exits. A second interrupt does what step 6 recorded, and the docs say so.
    - [ ] The mechanism step 6 shows works on every platform it was measured on.
    - [ ] Load-bearing: remove the mechanism — the fixture's cleanup is cut, the test red.
    **Commit:** `test: D27 — a cleanup running at the first interrupt finishes`.

13. **No bound, no delay, no poll limit in a live test** (spec §3, "No bound on a live
    test"; P3), by Appendix C.
    **Files:** `integration/helpers/configHelpers.ts` (`getTimeout`, the delay helper and
    their readers), every reader Appendix C lists, the ATC live suite
    (`readOnly/atc/AtcHandlers.test.ts`, `poll_timeout_ms`), `tests/test-config.yaml.template`
    (`test_settings.timeout`, `test_settings.timeouts.*` with `delay`, the ATC
    `poll_timeout_ms`), `tests/README.md`, the template's header; CHANGELOG and MIGRATION-24.0
    if a documented key changes.
    **Steps (red first):**
    - [ ] Red: `'the template names no bound, delay or poll limit'` — none of the keys of
      Appendix C is in the template, and nothing under `src/__tests__` reads one (a scan over
      the helpers' and suites' sources); `'the ATC case polls until the run's status'` — on
      the ADT stand-in, a run that reports done after more polls than any old
      `poll_timeout_ms` would allow is answered, and the poll ends on the status alone, as
      the product code does; where a delay stood between two operations, the next operation
      is shown to start on the previous one's result (a stand-in case per helper that used
      the delay, where a test can show it; where it cannot, named in the commit).
    - [ ] Remove `getTimeout`, the delay, the poll limit and the keys; each reader goes on
      the result it waits for.
    - [ ] Load-bearing: add a key back to the template, then a read of it to a helper — the
      scan red each time; give the ATC poll a limit again — its stand-in case red.
    **Commit:** `test: D27 — no configured bound, delay or poll limit in a live test`.

## The rest of the first wave (spec §4, §5)

14. **The slow unit suites** (spec §4): `unit/analyseOmissions`,
    `unit/adtHeaders/headerCallSites`, `unit/coverage/hardModeBinaries`,
    `server-runtime/src/stdio/__tests__/cancel/loginBound` (spies → `mock.method`).
    **Files:** the four files, the runner's list, `server-runtime`'s `tsconfig.test.json` if
    its types need `node:test`.
    **Steps:** each moved with its count; `server-runtime`'s `test:check` and
    `npm --prefix server-runtime test` (root filter) green.
    **Load-bearing,** one mutation each, each named assertion red:
    - `analyseOmissions`: make one verdict fixture's expected verdict the opposite — the
      fixture's assertion red;
    - `headerCallSites`: add a header call site in a source the scan reads that its rule
      refuses — the scan's refusal assertion red;
    - `hardModeBinaries`: point it at a built binary that answers a tool call wrongly — its
      answer assertion red;
    - `loginBound`: remove the login bound from the code under test — its bound assertion
      red;
    - and `jest.config.js` without the list in its ignores — the partition guard red.
    **Commit:** `test: D27 — the slow unit suites on node:test`.

15. **The install suites leave the unit run: `test:install`** (spec §4).
    **Files:** `unit/installMatrix`, `unit/binSmoke` (and their helpers, e.g.
    `tarballRegistry.ts`), `package.json` (`test:install` through the runner), the unit run's
    selection (the runner's unit set excludes them; Jest no longer finds them),
    `.github/workflows/ci.yml` and `release.yml` (a `test:install` step of its own, carrying
    `SKIP_INSTALL_MATRIX` as `npm test` carries it today), `README.md` / contributor docs.
    **Steps (red first):**
    - [ ] Red: `'the unit run reaches no outside service'` — a guard over the runner's unit
      set and Jest's discovery: neither holds a file of `test:install` (step 16 adds
      `test:retrieval`'s files to the same guard).
    - [ ] Move and convert; the CI step.
    - [ ] Load-bearing: put `installMatrix` back into the unit set — the guard red.
    **Commit:** `test: D27 — the install suites in a run of their own`.

16. **The Ollama suite leaves the unit run: `test:retrieval`** (spec §4).
    **Files:** `unit/descriptions/toolRetrievalVectors` and its helpers (`ollama.ts`,
    `harness.ts`, `retrieval.ts`, …, those only it uses), `package.json`
    (`test:retrieval`, not in CI), the docs (where it runs, how it skips).
    **Steps (red first):**
    - [ ] Red: step 15's guard extended to `test:retrieval`'s files — red while the suite is
      still in the unit run.
    - [ ] Move and convert; the suite's header drops "bounded by Jest's test timeout"; it
      states where it runs and skips per model with the reason, as today.
    **Load-bearing:** put the suite back into the unit set — the guard red; give it a
    `{ timeout }` — the no-timeout scan red.
    **Commit:** `test: D27 — the Ollama suite in a run of its own`.

17. **Measure, then set, the interim Jest workers** (spec §5).
    - [ ] Measure the remaining Jest unit run as it is after step 16 (`maxWorkers: 1`): peak
      memory and wall time, in the two orderings the report used (largest first, slowest
      first), on a developer machine and on each CI runner kind.
    - [ ] Measure it with workers (`maxWorkers` 2, 4 and the available parallelism) and a
      `workerIdleMemoryLimit` (two or three values), the same figures.
    - [ ] **Decision point:** the worker count and limit, explicit settings written from the
      figures (CI per runner kind, the docs stating the figures); no value the figures do not
      support.
    **Files:** `jest.config.js`, the CI workflows, the docs.
    **Load-bearing:** a test that the Jest configuration states both settings explicitly
    (none left to Jest's default).
    **Commit:** `test: D27 — the interim Jest run on measured workers`.

## Docs, live runs and the end

18. **Docs for what a consumer of the scripts sees** (spec §9, docs).
    - `README.md` (the two `npm test` mentions), `docs/development/` (the testing pages),
      `src/__tests__/integration/README.md` (its Running section: the live scripts through
      the runner, a file by its source path, no `--testPathPatterns`; `liveSuite` /
      `liveCall` on node:test; the interrupt behaviour of step 12; the concurrency figures of
      step 8), `tests/README.md` and the template's header (step 13), the helper READMEs
      under `integration/helpers/testers/`;
    - `CHANGELOG.md` (24.0.0): the scripts that changed (`test:install`, `test:retrieval`,
      the live scripts' flags, the concurrency setting), the removed test-config keys;
    - `MIGRATION-24.0.md`: only what an embedder or a contributor on 23.x must change
      (a test-config key removed, a script renamed or its flags changed);
    - the repository's `CLAUDE.md`: the text that describes the test run, proposed to the
      owner by the controller (never edited by an implementer).
    **Commit:** `docs: D27 — the tests on node:test, the first wave`.

19. **The live runs, with the owner's go** (spec §9). After the realm check, on each system
    kind the ledger names: `npm run test:integration > <log outside the repository> 2>&1`
    (the exit status is the runner's own; no pipe). **Pass:** exit status 0; the teardown
    reports no required key failed, skipped or not run; the required keys are step 2's;
    nothing left behind beyond what step 2's run left. After a failure: a failing test
    first, the fix, then that system rerun whole. Counts per system into the PR description,
    with no system name. The `shared:*` scripts run once each, with the owner's go.

20. **CI's whole step list locally**, every package's `lint:check` and `test:check`, the
    dependency check of step 4 again (no new runtime dependency, no `"link": true`, every
    `resolved` from `registry.npmjs.org`), then the
    PR's CI on the whole matrix, Codex review, and the owner's review.

21. **Delete the D27 goal, spec and plan** before the release commit. What they still owe
    goes into the PR description first:
    - the later task's scope: the 333 suites with no Jest API but `jest.setTimeout`, the 106
      with spies only, the 89 module-mock suites (`batch/closeWithBatch` among them) with the
      injection points to list for the owner, the 26 fake-timer suites, and the end state
      (Jest, ts-jest, jest-util, `@types/jest`, the Jest configuration, the runner's list and
      its guard, the mapper copy of the name table removed);
    - the measured figures: the concurrency (step 8), the interim Jest workers (step 17), the
      interrupt behaviour per platform (step 6);
    - the open handles found and fixed in step 11;
    - step 2's and step 19's per-system counts;
    - the sub-packages' own `tsconfig.test.json` path lists (copies of a part of the table,
      not touched by this wave) for the later task;
    - the owner's answers to P1–P5 (below).

## The owner's answers (P1–P5)

- **P1 — the list and Jest's configuration.** The list exists nowhere yet and is made here
  (step 3): one list file is the single source of which files run on node:test. Jest's
  configuration moves from `package.json` `jest` to a `jest.config.js` that reads that list
  (`testPathIgnorePatterns`) and the package-name table (`moduleNameMapper`). No JSON copy,
  and no equality guard beyond the partition guard. The table is `tsconfig.paths.json`,
  which `tsconfig.test.json` extends, so the type checker reads it too (step 3, measured). CHANGELOG / MIGRATION only if a
  consumer of the scripts sees it.
- **P2 — the live move.** The live machinery and all 58 live files move in one atomic commit
  (step 11); no temporary dual path.
- **P3 — the configured keys.** Every bound goes, and so do `timeouts.delay` (a pause
  between operations is a guess; an operation ends on its result) and the ATC suite's
  `poll_timeout_ms` (a poll ends on the run's status, as the product code already does):
  removed from the template, the helpers and their readers, red first where a test can show
  it (step 13).
- **P4 — the reference.** A fresh Jest live run on each system kind before the move, each
  with the owner's go (step 2).
- **P5 — Jest's discovery.** The partition and coverage guards read Jest's list by running
  `jest --listTests --json` in a child process; no node:test file imports Jest (steps 4,
  11).

## Appendix A — the first wave's files and their counts

Filled by step 1.

## Appendix B — shared code that reaches Jest

Filled by step 1.

## Appendix C — the bounds and their readers

Filled by step 1.

## Appendix D — the scripts that run Jest

Filled by step 1.
