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

**The owner's answers** to the plan's questions (P1–P8) are recorded at the end and bind
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
   - [x] Red, under Jest (the runner comes in step 4):
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
   - [x] The two files, `jest.config.js`, `tsconfig.test.json`, the readers; every Jest suite
     green, the same counts (`--listTests` before and after equal); `test:check` green.
   - [x] Load-bearing, mutating the readers, not the data:
     - `jest.config.js` builds its ignores without the list — `'Jest ignores every listed
       path'` red;
     - `jest.config.js` drops one table entry while mapping — `'Jest's mapper is the table'`
       red, and every Jest suite importing that name fails to resolve;
     - `tsconfig.test.json` gets a `paths` block of its own — `'the type checker's paths are
       the table'` red;
     - the hook answers a name outside the table — its test red.
   - [x] CHANGELOG / MIGRATION only if a consumer of the scripts sees the move (Jest's
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
   - [x] Red, as node:test files (the first on the list):
     - `'the runner refuses an empty run'`, `'a named file must exist'`, `'options go before
       files'`, `'--env sets a variable without a shell'` — on a temporary list;
     - `'a file belongs to exactly one runner'` — the partition guard: every `*.test.ts` of
       the 18 roots is on the runner's list or found by Jest's discovery, never both, never
       neither; every listed path names a file. Jest's discovery is read by running Jest's
       own `--listTests --json` in a child process, not by importing Jest (P5);
       the guard's discovery is Jest's config without its live ignores until step 11
       (`jest.config.js` exports them as `liveIgnores`; the owner's decision);
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
   - [x] The runner (auth-errors' model: `process.execPath`, options before files, a run with
     no file refused, `--env NAME=VALUE`), with: the source path → compiled path mapping, the
     preload of step 3's hook, the concurrency setting (an option and one documented
     variable; none given is refused), a root filter (`--root <dir>`, spec §5), and a list
     mode that prints what it would run.
   - [x] `npm test` runs Jest, then the runner, both even when the first fails; the script
     fails when either does (spec §5, decision). A small `tools/` script runs the two, since
     `&&` stops at the first. It translates the sub-packages' `--roots <dir>` for both
     runners, so `npm --prefix <package> test` keeps working, unchanged, from this commit on.
     Until step 8 measures it, `npm test` passes concurrency `1`, today's in-band behaviour,
     stated as such in the script's comment.
   - [x] Load-bearing: put one file on both runners, then on neither, then list a missing
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
   - [x] **Dependencies** (spec §9): `package.json`'s `dependencies` unchanged and no package
     added to `devDependencies`; after `npm install`, `package-lock.json` has no
     `"link": true` and no `resolved` outside `registry.npmjs.org` (counted by a one-line
     read of the lockfile; both counts 0), recorded in the commit. Repeated in step 20.
   **Commit:** `test: D27 — the node:test runner beside Jest; one list, one guard`.

5. **The no-timeout scan** (spec §2, "No runner timeout"; §3, "No force exit").
   **Files:** a new source scan beside `unit/sources/` (a node:test file on the list), its
   fixtures.
   **Steps (red first):**
   - [x] Red: one fixture each — `--test-timeout` in a script, `{ timeout }` on a `test`, an
     `it`, a `describe`, a hook, `--test-force-exit` in a script, `--forceExit` in a script —
     each refused by its own check alone, and `clean` by none. The scan reads node:test
     files and every npm script. Until step 11 it allows exactly four script/flag pairs —
     `test:integration` `--forceExit`, `test:coverage-family` `--forceExit`, `test:high`
     `--forceExit`, `test:live-connection` `--forceExit` (Appendix D confirms them) — and
     refuses any other pair and any addition to the list; step 11 empties it.
   - [x] Load-bearing: delete each check in turn — its fixture passes, so the test is red;
     add `--forceExit` to `shared:setup` — refused as a pair outside the list.
   **Commit:** `test: D27 — no runner timeout and no force exit; the scan`.

6. **The first interrupt: measure** (spec §3, "The first interrupt"). A measurement, no
   decision taken in it.
   **Files:** none committed but the findings; the probe is a hand-run script, deleted after
   the run, its results written into `src/__tests__/integration/README.md`'s draft section
   and into this plan.
   - [x] On each OS of CI's matrix where it can be run, and on Node 22 and 24: a node:test
     fixture file whose test body awaits work and whose `after` hook runs a cleanup that takes
     long enough to be interrupted, run through the runner. Ctrl-C (SIGINT; on Windows the
     console's Ctrl-C) once during the body, once during the cleanup, and twice. Record which
     process gets the signal (runner, `node --test`, the file's process), what the running
     test and hook see (`t.signal`, `process` events), whether the hook finishes, and the
     exit code.
     **Run** (2026-11-08): Linux only — Node 26.7.0 on the host, 22.23.4 and 24.20.0 in the
     official `node:22` / `node:24` images on a copy of the tree; SIGINT to the runner's process
     group (a terminal's Ctrl-C) and to the runner's pid alone; the file with no listener, a
     SIGINT listener, and SIGINT + SIGTERM listeners; `node --test` directly as a reference.
     The three versions behaved the same (Measured). Findings (Measured unless tagged; the
     table is in `src/__tests__/integration/README.md`, "Interrupts (draft)"):
     - the runner (`spawnSync`, no handler) dies on the SIGINT at once (signal SIGINT, 130 in a
       shell), whether the signal comes to the group or to it alone, and waits for nothing;
     - `node --test` handles SIGINT: reports the file cancelled, sends SIGTERM to the file's
       process 1–4 ms later, and exits 1 without waiting for that process to end;
     - the file's process gets the group's SIGINT; node:test installs no SIGINT/SIGTERM
       listener there; with none, or a SIGINT listener only, it is killed (by the SIGINT or the
       SIGTERM) and the running hook never finishes; with both listeners it survives, and a
       hook interrupted mid-cleanup finishes — after the runner and `node --test` have exited,
       as an orphan whose output nobody reads; interrupted in the body, the body runs on, the
       hook starts and the process ends during it (cause not established);
     - `t.signal` and the hook's signal are never aborted by an interrupt;
     - SIGINT to the runner's pid alone: only the runner ends; `node --test` and the file run
       to their natural end as orphans (the hook finishes, exit 0);
     - a second group SIGINT finds the group empty (ESRCH) unless the file ignores both
       signals, and then changes nothing;
     - no process was left: every one had ended by itself within 20 s.
     **macOS and Windows** (Measured on GitHub Actions, Node 22.23.4 and 24.22.2, two runs, a
     throwaway job removed afterwards; full text in `src/__tests__/integration/README.md`): macOS
     is the same as Linux in every case; on Windows the first console Ctrl-C ends every process of
     the run at once — no listener variant lets the cleanup finish, and killing the runner alone
     takes `node --test` and the file with it. **Not measured:** a TTY.
   - [ ] The findings decide the mechanism of step 12; if they show the first interrupt cannot
     be made to let a cleanup finish on some platform, that goes to the owner before step 12.
     **Status:** on Linux (Node 22, 24, 26) the first interrupt as it stands cuts a running
     cleanup (Measured); a cleanup finished only when its process ignored both SIGINT and
     SIGTERM, and then after the run had ended (Measured). That a mechanism in the runner and
     the live helpers can make it finish before the run exits is an Inference, not measured;
     macOS behaves as Linux; on Windows no listener in the file can keep a cleanup alive
     (Measured), so the runner and `node --test` would both have to survive the first Ctrl-C and
     not end the file (Inference). This goes to the owner before step 12.

## The scans and the measurements (spec §4, §2)

7. **Move the TypeScript-program scans** (spec §4).
   **Files:** `unit/sources/noDerivationFromAuthorization`, `noProseMatching`,
   `noChainInstanceof`, `noRegexOverInput`, `typeCodeScan`, `typeCodeLiterals`,
   `staticTypes` (`.test.ts`), `unit/sources/helpers/*Scan.ts` where they read the repository
   by `__dirname`, the runner's list.
   **Steps (red first):**
   - [x] Each file onto the list, converted (spec §4, "How a file moves"); `jest.setTimeout`
     goes. Its test count is Appendix A's.
   - [x] Load-bearing: each scan's own refusal fixtures stay red under node:test — break one
     fixture's rule in the sources scanned (or point the scan at a refused fixture) and see it
     fail; and make `jest.config.js` drop the list from its ignores — the partition guard red
     (every moved scan then on both runners).
   **Commit:** `test: D27 — the TypeScript-program scans on node:test`.

8. **Measure the node:test unit run's concurrency** (spec §2, "Concurrency is a setting").
   - [x] With the scans on the list, run the node:test unit set at concurrency 1, 2, 4 and the
     machine's available parallelism, on a developer machine and on each CI runner kind: peak
     RSS of each file's process and of the whole run, and wall time. Record the figures.
     **Run** (2026-11-08, Measured): a hand-run probe, deleted after the run, on the developer
     machine (Linux, 16 CPUs, Node 26) and on GitHub Actions (ubuntu, macOS, Windows × Node 22,
     24; a throwaway branch and job, removed afterwards); the figures are in
     `docs/development/tests/TESTING_GUIDE.md`, "The node:test run's concurrency (measured)".
   - [x] **Decision point:** the owner chose `2` on every CI runner kind and locally (from 2 on
     `npmTest.test.ts` bounds the wall time; 4 costs 0.9–1.4 GB for at most 2 s; macOS slows
     above 2). `npm test` passes `2`; `ci.yml` passes it per cell from its matrix and
     `release.yml` explicitly (`npm test -- --concurrency <N>`, the last wins); the runner keeps
     no default.
     **Decision point (the step's text):** the setting each run uses — `npm test` on CI (per runner kind)
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
   - [x] Red: a node:test file on the list that imports the new module through the node:test
     build — it fails to compile while the module reaches `pinCases.ts`.
   - [x] Extract; `pinCases.ts` imports from the module; every Jest pin suite passes unchanged
     (Appendix A's counts for them untouched).
   - [x] Load-bearing: import `pinCases.ts` from the new module again — the build test red.
   - [x] **Files production code reads beside itself** (spec §2, the owner's amendment; found
     here: the module's run needs `server-runtime/package.json`, `compact/package.json` and
     `tools/tool-search.json` beside the compiled code, Measured). One list,
     `tools/node-test-placed.json`, placed by `tools/build-node-tests.mjs` after a successful
     compile; the guard `unit/runner/placedFiles.test.ts` reads production sources with the
     TypeScript parser and fails on a read the list does not place, an entry no read needs,
     and a `__dirname` use whose target it cannot state. Red first; load-bearing: drop an entry
     — the guard and the `servedEntries` test red; the build places nothing — the placement
     test red; `.json` counted as code — the guard red.
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
    - a test moved to node:test that reads the ADT corpus reads the repository's corpus
      through the repository-root helper, not `ADT_CORPUS_DIR` (in the node:test build that
      names the copy placed beside the compiled `adtCorpus.js`, step 9).
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
        (child process): no Jest file calls a function that registers a tracked connection
        (`trackConnection`, or a helper whose body calls it, such as `testConnectionLogOn`)
        unless it also calls `closeTrackedConnections` itself (`testLogoffs`) — calls, not
        reachability through imports (P6): the Jest files that import `sessionHelpers.ts`
        through `testers/hardMode.ts` and register nothing (Appendix B2) pass;
      - the coverage guard (moved): the union of Jest's discovery and the runner's list
        (step 4's child-process read), a pin in a file of either runner found, a pin in a
        file of neither refused.
    - [ ] The machinery, then the live files: each converted (spec §4); `getTimeout`
      arguments dropped from every case (spec §3, "No bound"); the integration helpers of
      Appendix B on `node:assert/strict` (`high/unitTest/unitTestSteps.ts` with the four
      `high/unitTest` live files; `testHelpers.ts` stays importable by the Jest files that
      reach it — Appendix B — and their run stays green); `DebuggerHandlers`' 7
      `expect.stringContaining` and 1 `expect.stringMatching`, and `coverage/backgroundRuns.live`'s
      `expect.arrayContaining`, as plain checks.
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
      - a Jest unit fixture file that calls a registering function (`testConnectionLogOn`)
        and never closes — `'no Jest file leaves a tracked connection to a hook'` red; a
        fixture that only imports `sessionHelpers.ts` stays green (P6);
      - give one live script concurrency 2 — `liveScripts`' test red; restore `--forceExit`
        in one script — the no-timeout scan red (its allowed list is empty now).
    **Commit:** `test: D27 — the live suites and their machinery on node:test`.

12. **The first interrupt lets a running cleanup finish** (spec §3), by step 6's findings and
    the owner's answer P8.
    **Files:** the runner (one process per file, each in a group of its own; the two-interrupt
    handling and the stop of P8); `liveSuite` (the stop checked before each case); node:test
    fixtures.
    **Steps (red first):**
    - [ ] Red: the fixture of step 6, run through the runner by a test that sends one
      interrupt while its cleanup runs: the cleanup's end is recorded before the process
      exits. A second interrupt ends every file's process tree, and the docs say so.
    - [ ] Red: a `liveSuite` fixture of three cases, interrupted once during the first: the
      first case and its cleanup finish, the other two are reported skipped with the reason,
      and no further file starts.
    - [ ] The mechanism step 6 shows works on every platform it was measured on.
    - [ ] Load-bearing: remove the process groups — the fixture's cleanup is cut, the test red;
      remove the stop check in `liveSuite` — the other two cases run, the skip test red.
    **Commit:** `test: D27 — a cleanup running at the first interrupt finishes`.

13. **No bound, no delay, no poll limit in a live test** (spec §3, "No bound on a live
    test"; P3, P7), by Appendix C.
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
    `server-runtime/src/stdio/__tests__/cancel/loginBound` (spies → `mock.method`). Its
    helper `loginStand.ts` spies with `jest.spyOn(process.stderr, 'write')` and 20 Jest files
    also use it (Appendix B): its stderr capture is made runner-independent (a plain
    replacement of `process.stderr.write` restored in the helper's own teardown), so both
    runners use the one helper; those 20 files stay green.
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
    **Files:** `unit/descriptions/toolRetrievalVectors` (its helpers `ollama.ts`,
    `harness.ts`, `retrieval.ts`, … stay where they are: each is also used by
    `toolRetrieval.test.ts`, which stays on Jest, and none uses a Jest API — Appendix A),
    `package.json`
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
    - the owner's answers to P1–P8 (below).

## The owner's answers (P1–P8)

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
  it (step 13). **Extended by P7.**
- **P4 — the reference.** A fresh Jest live run on each system kind before the move, each
  with the owner's go (step 2).
- **P5 — Jest's discovery.** The partition and coverage guards read Jest's list by running
  `jest --listTests --json` in a child process; no node:test file imports Jest (steps 4,
  11).
- **P6 — the hook guard counts calls.** `'no Jest file leaves a tracked connection to a
  hook'` refuses a Jest file that calls a registering function without closing, not one that
  only reaches `trackConnection` through imports (step 11).
- **P7 — every pause and retry in a test goes.** Beside P3's keys, every test-side pause or
  retry of Appendix C goes the same way in step 13: `test_settings.operation_delays.*` and
  each case's `params.operation_delays.*` (`getOperationDelay` and its callers), the ATC
  suite's `poll_interval_ms`, the runtime suite's `trace_feed_retry_delay_ms` and
  `dump_feed_retry_delay_ms`, and the keys read by nothing (`timeouts.delay`,
  `test_settings.timeout`, `timeouts.create`, `timeouts.test`, `trace_read_retry_delay_ms`,
  `trace_read_retries`). `RuntimeRunClass`'s own argument `trace_retry_delay_ms` is the
  product's and is not changed; the test key `profiled_run_trace_retry_delay_ms` that feeds
  it goes, and the case calls the tool without it (the schema makes it optional;
  likewise `profiled_run_max_trace_attempts`, which feeds the tool's `max_trace_attempts`).
  The runtime suite's feed loops go with their keys (`trace_feed_retries`,
  `dump_feed_retries`, the two `*_retry_delay_ms`, `dump_candidates_per_poll`): after the
  run, the trace feed and the dump feed are each read once, and the dump read checks every
  title-matched entry; the dump loop's fallback to "whatever the feed showed last" goes.
  Whether the trace and the dump are listed at once after the run is measured live first
  (step 19's runs, before the change lands); if either is not, the measurement goes to the
  owner before step 13 commits — no loop, delay or limit is put back on its own.
- **P8 — the first interrupt: the runner holds it** (step 12, by step 6's findings). The runner
  starts each test file in a process group of its own (`detached`; on Windows a console group of
  its own), so a terminal's Ctrl-C reaches the runner alone. On the first interrupt the runner
  starts no further file, tells every running file to stop, says on stderr that it waits for the
  running files and that a second interrupt stops the run, and waits for every running file to
  end by itself. A file told to stop finishes the case it is running, that case's cleanup
  included, and skips its remaining cases: `liveSuite` checks the stop before each case. On the
  second interrupt the runner ends the process tree of every file still running. How the stop
  reaches a file (a file or a channel the runner owns, no signal) is the step's to choose and
  name.

## Appendix A — the first wave's files and their counts

Taken by step 1 on the branch before any change of this wave (Jest 30.5.2, Node 26.7.0). Paths are
relative to `src/__tests__/` unless they start with a package directory. Labels: **Measured**
(a run), **Counted** (read from the source), **Code**.

**Discovery** (Measured, `npm test -- --listTests --json`, which returns before
`globalSetup`): the unit run discovers 550 files; with `--testPathIgnorePatterns=/node_modules/`
Jest finds 608. The 58 not in the unit run are exactly the 55 `*.test.ts` under
`integration/` and the 3 under `admin/shared-deps/` (Measured, `find` and the two lists
compared); no other file is outside the unit run.

**The 20 unit files of the wave** (Measured: `npm test -- --json --outputFile=… <the 20
paths>`, the JSON result's `assertionResults` per file; 20 suites, 326 tests, 307 passed,
19 skipped, run with `SKIP_INSTALL_MATRIX=true`):

| File | Tests | Outcome in that run |
|---|---|---|
| `unit/coverage/liveDescribe.test.ts` | 2 | 2 passed |
| `unit/coverage/liveScripts.test.ts` | 6 | 6 passed |
| `unit/coverage/runReport.test.ts` | 10 | 10 passed |
| `unit/coverage/refusalStop.test.ts` | 12 | 12 passed |
| `unit/coverage/live.test.ts` | 19 | 19 passed |
| `unit/coverage/coverageLedger.test.ts` | 73 | 73 passed |
| `unit/sources/noDerivationFromAuthorization.test.ts` | 27 | 27 passed |
| `unit/sources/noProseMatching.test.ts` | 19 | 19 passed |
| `unit/sources/noChainInstanceof.test.ts` | 40 | 40 passed |
| `unit/sources/noRegexOverInput.test.ts` | 14 | 14 passed |
| `unit/sources/typeCodeScan.test.ts` | 14 | 14 passed |
| `unit/sources/typeCodeLiterals.test.ts` | 3 | 3 passed |
| `unit/sources/staticTypes.test.ts` | 19 | 19 passed |
| `unit/analyseOmissions.test.ts` | 18 | 18 passed |
| `unit/adtHeaders/headerCallSites.test.ts` | 6 | 6 passed |
| `unit/coverage/hardModeBinaries.test.ts` | 9 | 9 passed |
| `server-runtime/src/stdio/__tests__/cancel/loginBound.test.ts` | 10 | 10 passed |
| `unit/installMatrix.test.ts` | 19 | 19 skipped (`it.skip`) |
| `unit/binSmoke.test.ts` | 1 | 1 passed |
| `unit/descriptions/toolRetrievalVectors.test.ts` | 5 | 5 passed |

- The six machinery tests are the first six rows, the seven TypeScript-program scans the
  next seven, the four slow suites the next four, the two install suites and the Ollama
  suite the last three.
- `installMatrix`: 19 tests, all skipped in that run by `SKIP_INSTALL_MATRIX=true`; the
  count does not depend on the skip (Code: `const skippable = SKIPPED ? it.skip : it`).
- `toolRetrievalVectors`: 5 tests, one per entry of `MODELS` (Code: `it` or `it.skip` per
  model); all five ran, the local Ollama serving every model.

**The 58 live files** (Counted, never run: the call sites of `it` / `test` and their
`.skip` / `.only` forms, read with the TypeScript parser, and each call site inside a loop
expanded by hand from the table it loops over; no file uses `.each`, and no helper under
`integration/helpers/` registers a test). 194 tests plus `liveConnection`'s 1 or N: 195
without `MCP_LIVE_ENV_PATHS`. Under `integration/`: 188 + `liveConnection`; under
`admin/shared-deps/`: 7.

| File | Tests | How counted |
|---|---|---|
| `integration/batch/amdpHttpHandle.test.ts` | 1 |  |
| `integration/batch/batchedReadsTiming.test.ts` | 19 | 2 call sites in loops: 6 `CASES` × 2 scopes + 7 `SHARED_CASES` |
| `integration/batch/communicationBatch.test.ts` | 3 | 1 call site over 3 kinds |
| `integration/batch/debuggerBatch.test.ts` | 6 | 2 call sites, each over 3 kinds |
| `integration/batch/noCommunicationBatch.test.ts` | 1 |  |
| `integration/batch/refusalFollowUps.test.ts` | 6 | 2 call sites, each over 3 kinds |
| `integration/coverage/activate.live.test.ts` | 1 |  |
| `integration/coverage/backgroundRuns.live.test.ts` | 7 |  |
| `integration/coverage/createLanguage.live.test.ts` | 1 |  |
| `integration/coverage/functionModuleGroup.live.test.ts` | 6 |  |
| `integration/coverage/heldLocks.live.test.ts` | 1 |  |
| `integration/coverage/outline.live.test.ts` | 4 |  |
| `integration/coverage/searchSource.live.test.ts` | 12 |  |
| `integration/coverage/unitTests.live.test.ts` | 5 |  |
| `integration/debugger/DebuggerHandlers.test.ts` | 17 |  |
| `integration/high/behaviorDefinitionAndImplementation/BehaviorDefinitionAndImplementationHighHandlers.test.ts` | 1 |  |
| `integration/high/check/CheckHighHandlers.test.ts` | 14 |  |
| `integration/high/class/ClassCrudClientDirect.test.ts` | 1 |  |
| `integration/high/class/ClassHighHandlers.test.ts` | 1 |  |
| `integration/high/class/ClassLocalIncludesHandlers.test.ts` | 1 |  |
| `integration/high/dataElement/DataElementHighHandlers.test.ts` | 1 |  |
| `integration/high/domain/DomainHighHandlers.test.ts` | 1 |  |
| `integration/high/function/FunctionHighHandlers.test.ts` | 1 |  |
| `integration/high/function/FunctionIncludeHighHandlers.test.ts` | 1 |  |
| `integration/high/include/IncludeHighHandlers.test.ts` | 3 |  |
| `integration/high/interface/InterfaceHighHandlers.test.ts` | 1 |  |
| `integration/high/metadataExtension/MetadataExtensionHighHandlers.test.ts` | 1 |  |
| `integration/high/package/PackageHighHandlers.test.ts` | 1 |  |
| `integration/high/program/ProgramHighHandlers.test.ts` | 1 |  |
| `integration/high/serviceBinding/ServiceBindingHighHandlers.test.ts` | 1 |  |
| `integration/high/serviceDefinition/ServiceDefinitionHighHandlers.test.ts` | 1 |  |
| `integration/high/structure/StructureHighHandlers.test.ts` | 1 |  |
| `integration/high/system/SystemHighHandlers.test.ts` | 5 |  |
| `integration/high/table/TableHighHandlers.test.ts` | 1 |  |
| `integration/high/table_type/TableTypeHighHandlers.test.ts` | 1 |  |
| `integration/high/transport/TransportedObjectCrud.test.ts` | 1 |  |
| `integration/high/transport/TransportObjectToolsCrud.test.ts` | 1 |  |
| `integration/high/unitTest/CdsUnitTestHighHandlers.test.ts` | 1 |  |
| `integration/high/unitTest/ClassUnitTestHighHandlers.test.ts` | 1 |  |
| `integration/high/unitTest/FunctionGroupUnitTestHighHandlers.test.ts` | 1 |  |
| `integration/high/unitTest/ProgramUnitTestHighHandlers.test.ts` | 1 |  |
| `integration/live/liveConnection.test.ts` | 1 or N | without `MCP_LIVE_ENV_PATHS`: one `it.skip`; with N paths: N cases (one per destination) |
| `integration/readOnly/atc/AtcHandlers.test.ts` | 4 |  |
| `integration/readOnly/function/FunctionIncludeReadOnlyHandlers.test.ts` | 3 |  |
| `integration/readOnly/function/GetFunctionModuleHandlers.test.ts` | 1 |  |
| `integration/readOnly/include/IncludeMainProgramsHandlers.test.ts` | 1 |  |
| `integration/readOnly/structure/GetStructuresListHandler.test.ts` | 1 |  |
| `integration/readOnly/system/RuntimeFeedHandlers.test.ts` | 7 |  |
| `integration/readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts` | 8 |  |
| `integration/readOnly/system/SearchSourceHandler.test.ts` | 11 |  |
| `integration/readOnly/system/SqlQueryHandlers.test.ts` | 2 |  |
| `integration/readOnly/system/TableContentsHandlers.test.ts` | 2 |  |
| `integration/readOnly/system/WhereUsedHandlers.test.ts` | 7 |  |
| `integration/readOnly/transport/ListTransportsHandlers.test.ts` | 2 |  |
| `integration/server/EmbeddableMcpServer.systemType.test.ts` | 3 |  |
| `admin/shared-deps/check.test.ts` | 5 |  |
| `admin/shared-deps/setup.test.ts` | 1 |  |
| `admin/shared-deps/teardown.test.ts` | 1 |  |

**The Ollama suite's helpers** (Code, imports read): `toolRetrievalVectors.test.ts` imports
`descriptions/catalog.ts`, `harness.ts`, `heldOut.ts`, `ollama.ts`, `queries.ts`,
`retrieval.ts` (and `heldOut.ts` reads `heldOutQueries.json` and `heldOutBaseline.json`).
**None is used by this suite alone:** every one is also reached by
`descriptions/toolRetrieval.test.ts` (the lexical suite, staying on Jest) — `ollama.ts`
through `harness.ts`, which imports `embed` from it; the lexical suite calls neither
`servedModels` nor `embed` (Code) — and `catalog.ts` also by `unit/abapUnitRunTool`,
`unit/sources/descriptionsFunctional` and `descriptions/toolSearchTable`. None of the six uses
a Jest API (Code, the type checker: no identifier bound to Jest's declarations). So step 16's
"those only it uses" is the empty set: the helpers stay in place, shared by both runners
(a discrepancy with step 16's file list, which names `ollama.ts`, `harness.ts`,
`retrieval.ts` as moving with it). **Resolved:** step 16 now keeps the helpers in place.

**Jest API in the wave's files** (Code, grep), for the conversion: `jest.setTimeout` in
`runReport`, `refusalStop`, `live`, `coverageLedger`, `noDerivationFromAuthorization`,
`noProseMatching`, `noRegexOverInput`, `hardModeBinaries`, `loginBound`, `installMatrix`,
`binSmoke`, `integration/live/liveConnection`; `jest.spyOn` / `jest.restoreAllMocks` in
`coverageLedger` (1 / 1) and `loginBound` (2 / 1, and the type `jest.SpyInstance`); `runCLI`
from `jest` in `runReport`, `live`, `coverageLedger`. Asymmetric matchers in live files:
`DebuggerHandlers` 7 `expect.stringContaining` **and 1 `expect.stringMatching`**,
`coverage/backgroundRuns.live` **1 `expect.arrayContaining`** — step 11 names only
`DebuggerHandlers`' `stringContaining` (a discrepancy: two more matchers to turn into plain
checks, the `stringMatching` one without a regular expression over the value).
**Resolved:** step 11 now names all three.

## Appendix B — shared code that reaches Jest

Taken by step 1 (Code): one TypeScript program over all 608 test files under
`tsconfig.test.json`; every import, export-from, `require`, dynamic `import()` and
`import()` type resolved to a repository file; a module "uses Jest" when an identifier in it
(`jest`, `expect`, `describe`, `it`, `test`, the hooks, their `f…` / `x…` forms) resolves to a
declaration of `@types/jest` / `@jest/*`, or it imports a Jest package. The closure of the 78
wave files (58 live, 20 unit) holds exactly five non-test modules that use Jest:

| Module | Jest API | Reached by (wave) | Also reached by files staying on Jest |
|---|---|---|---|
| `integration/helpers/live.ts` | `describe`, `beforeAll`, `afterAll`, `expect` (`getState`) | the 8 `coverage/*.live` files; `unit/coverage/{liveDescribe,refusalStop,live}` | none |
| `helpers/pinCases.ts` | `expect`, `it`, `jest` | the 8 `coverage/*.live` files and the same 3 machinery tests, all through `live.ts` (`import { servedEntries }`, its only import from `pinCases.ts`) | 41 files (the pin suites, `unit/coverage/pinCases`, …) |
| `integration/helpers/testHelpers.ts` | `expect` | all 58 live files; `unit/coverage/{liveDescribe,refusalStop,live,hardModeBinaries}` | 4: `unit/coverage/{launchedServers,hardModeLauncher,configuredSystemKind,closeEvery}`, each through `integration/helpers/testers/hardMode.ts` → `sessionHelpers.ts` → `testHelpers.ts` (`closeEvery` via `integration/helpers/launchedServers.ts`) |
| `integration/high/unitTest/unitTestSteps.ts` | `expect` (`expectTestsRan`) | the 4 `high/unitTest/*` live files | none |
| `server-runtime/src/stdio/__tests__/helpers/loginStand.ts` | `jest.spyOn(process.stderr, 'write')` | `server-runtime/…/cancel/loginBound` (step 14) | 20 files: 16 under `server-runtime/src/stdio/__tests__/`, `server-runtime/src/__tests__/heldLocksTransports`, `unit/coverage/launchedServers`, `unit/shutdown/{lockHeldLogoff,undoFailsLogoff}` |

- **Confirmed as known:** `pinCases.ts` through `live.ts`'s `servedEntries`; `testHelpers.ts`'s
  `expect`; `sharedObjects.ts`, `testers/HighTester.ts` and `testers/LambdaTester.ts` use no
  Jest API themselves and reach it through `testHelpers.ts` (Code, the checker).
- **Not in the plan's "known now" — `integration/high/unitTest/unitTestSteps.ts`:** a live
  helper using `expect`, reached only by the four `high/unitTest` live files; it moves with
  them in step 11 (Appendix B's integration helpers).
- **Not in the plan's "known now" — `server-runtime/…/helpers/loginStand.ts`:** it spies on
  `process.stderr.write` with `jest.spyOn`, is imported by `loginBound` and by 20 files that
  stay on Jest. Step 14 names only `loginBound`'s own spies; moving `loginBound` needs
  `loginStand.ts` in a runner-free form that its 20 Jest importers keep using (or a split),
  which step 14 does not state. **Resolved:** step 14 now makes its stderr capture
  runner-independent, one helper for both runners.
- **`testHelpers.ts` is shared with four files that stay on Jest** (and with
  `hardModeBinaries`, on Jest until step 14): when step 11 puts it on `node:assert/strict`,
  those keep importing it under Jest (Inference: `node:assert` runs under Jest unchanged).
- One type-only edge into a Jest module exists (`helpers/functionModuleMetadata.ts` →
  `pinCases.ts`, `import type`); no wave file reaches it through that edge alone.

### Appendix B2 — what the Jest hook closes

Taken by step 1 (Code, the same program; calls read as call expressions):

- **Callers of `trackConnection`** — exactly the five the plan names, plus the fake one:
  `integration/helpers/sessionHelpers.ts` (2, both inside `createTestConnectionAndSession`),
  `integration/helpers/live.ts` (1), `integration/coverage/backgroundRuns.live` (1),
  `integration/coverage/searchSource.live` (1), `integration/high/class/ClassCrudClientDirect`
  (1); `unit/harness/testLogoffs` (1, fakes, drained by its own `closeTrackedConnections`).
  `endTestConnection` registers nothing (Code, `openConnections.ts`).
- **Test files reaching a caller** through imports, and the runner each is on after step 11:

| Files | Reaches | Runner after step 11 |
|---|---|---|
| 57 of the 58 live files (all but `integration/batch/refusalFollowUps`, which reaches none) | `sessionHelpers.ts` and/or `live.ts`, or is a caller | node:test (step 11) |
| `unit/coverage/{refusalStop,live,liveDescribe}` | `sessionHelpers.ts`, `live.ts` | node:test (step 11) |
| `unit/coverage/hardModeBinaries` | `sessionHelpers.ts` (via `testers/hardMode.ts`) | **Jest until step 14** |
| `unit/coverage/{launchedServers,hardModeLauncher,configuredSystemKind,closeEvery}` | `sessionHelpers.ts` (via `testers/hardMode.ts`; `closeEvery` via `launchedServers.ts`) | **Jest** (later task) |
| `unit/harness/testLogoffs` | itself a caller; calls `closeTrackedConnections` | Jest |

- **Not in the plan's "known now":** five Jest unit files reach a `trackConnection` caller —
  `hardModeBinaries`, `launchedServers`, `hardModeLauncher`, `configuredSystemKind`,
  `closeEvery` — all through `testers/hardMode.ts`'s import of `createTestConnectionAndSession`.
  **None of them calls a registering function at run time** (Code, grep: the five name none of
  `createTestConnectionAndSession`, `testConnectionLogOn`, `trackConnection`, `liveRunner`;
  `hardMode.ts` calls `createTestConnectionAndSession` only in `testConnectionLogOn`, which
  only `integration/batch/{amdpHttpHandle,communicationBatch,debuggerBatch}` call). So the
  plan's conclusion holds: no file left on Jest relies on the hook at run time, and step 11
  can remove it.
- **But step 11's guard as written would be red on them:** `'no Jest file leaves a tracked
  connection to a hook'` is specified over "the TypeScript import graph": none reaches
  `trackConnection` unless it calls `closeTrackedConnections`. By import reach,
  `launchedServers`, `hardModeLauncher`, `configuredSystemKind` and `closeEvery` (and
  `hardModeBinaries` through steps 11–13) reach it and do not close. The guard needs either a
  reach that counts only calls of a registering function, or these files handled — for the
  controller and the owner; not changed here. **Resolved by P6:** the guard counts calls.

## Appendix C — the bounds and their readers

Taken by step 1 (Code, grep over `src`, `server-runtime/src`, `scripts`, `tools`, `tests`).

**`getTimeout`** (`integration/helpers/configHelpers.ts:457`: `timeouts[operationType] ||
timeouts.default || 60000` over `test_settings.timeouts`): 53 files name it (as the plan
says), of which 49 call it — every live file but the 8 `coverage/*.live` and
`live/liveConnection`, 171 calls — and 4 are not live test files: `configHelpers.ts` (the definition),
`testers/LambdaTester.ts` (imports it, never calls it), `high/class/ClassHighHandlers.example.ts`
(an example, not a test; `testers/README.md` points to it; 1 call), and
`unit/sources/noReadDeadlines.test.ts` (a scan of the product code that names `getTimeout`
as an identifier the *package* must not export; not a reader, and not touched by step 13).
Calls in the 49 live files by argument: `'long'` 144, `'medium'` 19, `'default'` 8. Per file (calls; arguments):

| File | Calls |
|---|---|
| `admin/shared-deps/{check,setup,teardown}` | 1 each; long |
| `integration/batch/amdpHttpHandle` | 1; long |
| `integration/batch/batchedReadsTiming` | 3; long |
| `integration/batch/communicationBatch` | 1; long |
| `integration/batch/{debuggerBatch,noCommunicationBatch,refusalFollowUps}` | 2 each; long |
| `integration/debugger/DebuggerHandlers` | 21; long |
| `integration/high/behaviorDefinitionAndImplementation/…HighHandlers` | 2; long |
| `integration/high/check/CheckHighHandlers` | 28; long 15, medium 13 |
| `integration/high/class/ClassCrudClientDirect` | 1; long |
| `integration/high/class/{ClassHighHandlers,ClassLocalIncludesHandlers}` | 2 each; long |
| `integration/high/{dataElement,domain,function/FunctionHigh,function/FunctionIncludeHigh,interface,program,structure,table,table_type}/…` | 1 each; long |
| `integration/high/include/IncludeHighHandlers` | 3; long |
| `integration/high/{metadataExtension,package,serviceBinding,serviceDefinition}/…` | 2 each; long |
| `integration/high/system/SystemHighHandlers` | 6; long 5, default 1 |
| `integration/high/transport/{TransportedObjectCrud,TransportObjectToolsCrud}` | 3 each; long |
| `integration/high/unitTest/{Cds,Class,FunctionGroup,Program}UnitTestHighHandlers` | 2 each; long |
| `integration/readOnly/atc/AtcHandlers` | 5; long |
| `integration/readOnly/function/FunctionIncludeReadOnlyHandlers` | 3; medium |
| `integration/readOnly/function/GetFunctionModuleHandlers` | 1; medium |
| `integration/readOnly/include/IncludeMainProgramsHandlers` | 2; long |
| `integration/readOnly/structure/GetStructuresListHandler` | 1; medium |
| `integration/readOnly/system/RuntimeFeedHandlers` | 8; long |
| `integration/readOnly/system/RuntimeProfilingAndDumpsHandlers` | 9; long |
| `integration/readOnly/system/SearchSourceHandler` | 12; long 11, medium 1 |
| `integration/readOnly/system/{SqlQueryHandlers,TableContentsHandlers}` | 3 each; long 2, default 1 |
| `integration/readOnly/system/WhereUsedHandlers` | 8; long 6, default 2 |
| `integration/readOnly/transport/ListTransportsHandlers` | 3; long |
| `integration/server/EmbeddableMcpServer.systemType` | 3; default |

**The keys under `test_settings` in `tests/test-config.yaml.template`** and their readers:

| Key | Reader |
|---|---|
| `timeout` (120000) | **none** |
| `timeouts.default`, `timeouts.long` | `getTimeout('default' / 'long')` |
| `timeouts.create`, `timeouts.test` | **none** (no `getTimeout('create' / 'test')`) |
| `timeouts.delay` (3000) | **none** — no `getTimeout('delay')` and no other read |
| (`timeouts.medium`) | not in the template; the 19 `getTimeout('medium')` calls get `timeouts.default` |
| `operation_delays.{lock,unlock,update,create,cleanup,default}` (3000 each) | `getOperationDelay(operation, testCase?)` (`configHelpers.ts:585`: the case's `params.operation_delays[operation]`, else `test_settings.operation_delays[operation]`, else its `default`, else 3000) |

**The other time keys a live suite reads** (all per test case, under `params`):

| Key | Reader |
|---|---|
| `params.operation_delays.*` (in the template under several cases: `create`, `lock`, `update`, `unlock`, `default`, `cleanup`, `delete`, `delete_retry`) | `getOperationDelay` — called as `'create'` 18, `'update'` 12, `'activate'` 1, `'create_verify'` 1, and with a computed name in `testers/LambdaTester.ts` (3); its callers: `testers/{HighTester,LambdaTester}.ts`, `testers/types.ts` (the context's type), and `integration/high/{behaviorDefinitionAndImplementation,class/ClassCrudClientDirect,class/ClassHighHandlers,class/ClassLocalIncludesHandlers,function/FunctionHighHandlers,function/FunctionIncludeHighHandlers,include,metadataExtension,table_type,transport/TransportedObjectCrud,transport/TransportObjectToolsCrud}/…` |
| `params.poll_timeout_ms` (120000) | `readOnly/atc/AtcHandlers` (a `Date.now()` deadline, default 120000) |
| `params.poll_interval_ms` (3000) | `readOnly/atc/AtcHandlers` (the pause between polls, default 3000) |
| `params.trace_feed_retry_delay_ms`, `params.dump_feed_retry_delay_ms` | `readOnly/system/RuntimeProfilingAndDumpsHandlers` (the pause between feed reads; with `trace_feed_retries` / `dump_feed_retries`) |
| `params.profiled_run_trace_retry_delay_ms` | `readOnly/system/RuntimeProfilingAndDumpsHandlers`, passed to the `RuntimeRunClass` tool as its `trace_retry_delay_ms` argument (a tool parameter of the product, with `profiled_run_max_trace_attempts` → `max_trace_attempts`) |
| `params.trace_read_retry_delay_ms`, `params.trace_read_retries` | **none** |

**The pause helpers** these keys feed: `integration/helpers/testHelpers.ts` `delay(ms)` —
imported by `testers/{HighTester,LambdaTester}.ts`, `helpers/rapFixtures.ts`,
`readOnly/atc/AtcHandlers` and `high/{behaviorDefinitionAndImplementation,class/ClassCrudClientDirect,function/FunctionHighHandlers,function/FunctionIncludeHighHandlers,include,table_type,transport/TransportedObjectCrud,transport/TransportObjectToolsCrud}/…`;
local `setTimeout` pauses fed by `getOperationDelay` in
`high/{class/ClassHighHandlers,class/ClassLocalIncludesHandlers,class/ClassCrudClientDirect,metadataExtension}/…`
and a local `delay` in `readOnly/system/RuntimeProfilingAndDumpsHandlers`. Fixed pauses that
read no key: `batch/refusalFollowUps` and `debugger/DebuggerHandlers` (`pause`),
`admin/shared-deps/setup` (2000 ms once).

**Discrepancies with the plan's "known now":**
- `timeouts.delay` is read by nothing (named as a key a live suite reads); likewise
  `test_settings.timeout`, `timeouts.create`, `timeouts.test`, and the runtime suite's
  `trace_read_retry_delay_ms` and `trace_read_retries`.
- Not named by the plan or P3: `test_settings.operation_delays.*` and every case's
  `params.operation_delays.*` (through `getOperationDelay`), the ATC suite's
  `poll_interval_ms` (beside `poll_timeout_ms`), and the runtime suite's
  `*_retry_delay_ms` keys — one of which is a product tool argument
  (`trace_retry_delay_ms`), not a test pause. **Resolved by P7.**

## Appendix D — the scripts that run Jest

Taken by step 1 (Code, `package.json` of the root and of each package, the two workflows).

**Root scripts that run Jest** (every one through `jest` with `package.json` `jest`; that
configuration ignores `__tests__/admin/` and `__tests__/integration/`, `maxWorkers: 1`,
`testTimeout: 600000`, `globalSetup`, `globalTeardown`, `setupFilesAfterEnv`):

| Script | Pre-script | Flags |
|---|---|---|
| `test` | `pretest`: `build:test-reporter` | `--passWithNoTests` |
| `test:integration` | `pretest:integration`: `build:test-reporter` | `--testPathPatterns=integration`, `--testPathIgnorePatterns='__tests__/admin/'`, `--runInBand`, `--passWithNoTests`, **`--forceExit`**, `--reporters=default`, `--reporters=./build/test-reporter/coverageReporter.js` |
| `test:coverage-family` | `pretest:coverage-family`: `build:test-reporter` | `--reporters=default`, `--reporters=./build/test-reporter/coverageReporter.js`, `--testPathIgnorePatterns='__tests__/admin/'`, `--runInBand`, **`--forceExit`** (the family's paths come after `--`) |
| `test:live-connection` | — | `--testPathIgnorePatterns='__tests__/admin/'`, `--runInBand`, **`--forceExit`**, the path `src/__tests__/integration/live/liveConnection.test.ts` |
| `test:high` | — | `--testPathPatterns='integration.*High'`, `--testPathIgnorePatterns='__tests__/admin/'`, `--runInBand`, `--passWithNoTests`, **`--forceExit`** |
| `shared:setup` | — | `--testPathPatterns='admin/shared-deps/setup'`, `--testPathIgnorePatterns='[]'`, `--runInBand`, `--passWithNoTests` |
| `shared:teardown` | — | `--testPathPatterns='admin/shared-deps/teardown'`, `--testPathIgnorePatterns='[]'`, `--runInBand`, `--passWithNoTests` |
| `shared:check` | — | `--testPathPatterns='admin/shared-deps/check'`, `--testPathIgnorePatterns='[]'`, `--runInBand`, `--passWithNoTests` |

- The four `--forceExit` pairs are exactly step 5's allowed list: `test:integration`,
  `test:coverage-family`, `test:high`, `test:live-connection` (confirmed). No script uses
  `--roots`; none uses `--testTimeout`.
- Beside them, the reporter scripts the live machinery needs: `build:test-reporter`
  (`tsc -p tsconfig.reporter.json`, run by the three `pre…` scripts) and
  `check:test-reporter` (loads the built reporter); `test:check` type-checks the tests
  (`tsc --noEmit -p tsconfig.test.json`), runs no Jest.
- **The 17 sub-package `test` scripts** forward to the root with `--roots`, each
  `npm --prefix .. test -- --roots <package>/src`: `background-runs-memory`,
  `responsible-rules`, `server-runtime`, `server`, `http`, `sse`, `compact-readonly-entries`,
  `compact-modify`, `compact`, `compact-http`, `compact-sse`, `core-ro`, `http-ro`, `sse-ro`,
  `compact-ro`, `compact-http-ro`, `compact-sse-ro`. No sub-package script calls `jest`
  itself.
- **Outside the scripts:** `tools/run-program-hard-test.js` runs `npm test --
  --testPathPattern=<pattern>` (a hand-run tool, not an npm script). Measured: Jest 30.5.2
  refuses that option ("Option "testPathPattern" was replaced by "--testPathPatterns""), and
  `npm test`'s ignores would exclude `integration/` anyway, so the tool cannot run today.
  Not in the plan; noted for the owner, not changed.

**CI steps that run one:**

| Workflow | Step | Script | Matrix | Env |
|---|---|---|---|---|
| `ci.yml` (`build-and-test`) | `Run tests` | `npm test` (with `pretest`) | ubuntu, macOS, Windows × Node 22, 24 | `SKIP_INSTALL_MATRIX` `false` only on ubuntu + Node 22, else `true` |
| `release.yml` (`test`) | `Run tests` | `npm test` (with `pretest`) | ubuntu × Node 22, 24 | `SKIP_INSTALL_MATRIX` `false` on Node 22, `true` on 24 |

No workflow runs a live script, a `shared:*` script or a sub-package `test`; the other CI
steps (`lint:check`, `build`, `test:check`, every package's `test:check`) run no Jest.
