# Spec: the tests on node:test — the first wave

Goal: `2026-11-08-node-test-goal.md`. This spec decides the first wave, how the two runners
live side by side until the last one, and what the later task keeps. The measurement
report this spec cites was taken on the PR's branch with Jest 30.5.2 (ts-jest preset) under
Node 26; its labels are kept: **Measured** (a run), **Code** (read in the source),
**Inference**.

## 0. The stage

The goal is reached in waves. This stage, the first wave, moves the tests that fail or
strain under Jest today: the live suites and the machinery under them, the suites that build
a TypeScript program over the sources, the slowest unit suites that need no module mock and
no fake timer, and the suites that reach an outside service, which also leave the unit run.
The rest stays on Jest, and both runners are green, until the later task moves it (§6).

## 1. What the code shows

- **The tests.** 608 `*.test.ts` files: 550 unit, 55 live under `src/__tests__/integration/`,
  3 live under `src/__tests__/admin/shared-deps/` (Measured, `find`).
- **One process for the whole unit run.** `maxWorkers: 1` with no `workerIdleMemoryLimit`
  makes Jest run every suite in its main process (Code, `@jest/core` `shouldRunInBand`). The
  heap grows about 5–13 MB per suite and is not returned; one ordering crashed at 3896 MB
  after 271 of 550 suites, another finished (Measured). What holds the memory is not
  identified (Inference: it needs a heap snapshot). Below the two scans of the next point no
  single suite stands out: the sum is the problem (Measured).
- **Two scans dominate memory.** `unit/sources/noDerivationFromAuthorization` (+788 MB) and
  `unit/sources/noProseMatching` (+503 MB) build a TypeScript program with its type checker
  (Measured). So do the other users of `sources/helpers/{authorizationDerivationScan,
  proseScan,failureScan,regexScan,typeCodeScan}.ts` and `noChainInstanceof`: `typeCodeScan`,
  `typeCodeLiterals`, `staticTypes`, `noRegexOverInput` (Code).
- **Time.** The run takes 732 s; the slowest 25 suites take 57 % of suite time (Measured).
  15 suites take over 5 s: `installMatrix` 88.8, `descriptions/toolRetrievalVectors` 40.1,
  `binSmoke` 37.7, `sources/noRegexOverInput` 14.0, `sources/noProseMatching` 9.4,
  `analyseOmissions` 9.1, `sources/noDerivationFromAuthorization` 8.8,
  `sources/noChainInstanceof` 7.4, `batch/closeWithBatch` 6.3, `adtHeaders/headerCallSites`
  6.0, `sources/typeCodeScan` 5.7, `coverage/hardModeBinaries` 5.6,
  `server-runtime/…/cancel/loginBound` 5.4, `coverage/runReport` 5.3, `coverage/live` 5.1
  (Measured).
- **An outside service in the unit run.** `descriptions/toolRetrievalVectors` asks the
  local Ollama for embeddings and is bounded only by `testTimeout` (Code). `installMatrix`
  and `binSmoke` pack the release and install it; the third-party dependencies of those
  installs come from a registry (Code), which may mean the npm registry over the network
  (Inference, not checked).
- **Timeouts cut tests, not work.** `testTimeout: 600000` applies to every test and hook. A
  live test's own bound is `getTimeout(…)` from the test config. When Jest cuts a test, its
  promise keeps running while `afterEach` / `afterAll` start (Code + Jest semantics). The
  riskiest suites: `integration/debugger/DebuggerHandlers` (18 `finally`, a debugger session
  left attached if cut), the `HighTester` CRUD suites under `integration/high/`, the
  `integration/batch/*` suites (cleanup in `finally` inside the body),
  `integration/coverage/*.live`, `admin/shared-deps/*` (Code). `test:integration`,
  `test:coverage-family`, `test:high` and `test:live-connection` pass `--forceExit`, so an
  open handle there is tolerated, not found; the three `shared:*` scripts do not (Code,
  `package.json`).
- **The live machinery is Jest's** (Code):
  - `globalSetup` / `globalTeardown` are `src/__tests__/integration/globalSetup.ts` and
    `globalTeardown.ts`, named in `package.json` `jest`. They decide by `npm_lifecycle_event` against
    `LIVE_SCRIPTS`; a unit run returns at once. Setup refuses a family selection that is
    not an exact integration test path, makes the run directory, runs the realm check and
    logs on once. Teardown checks the run report against the ledger.
  - `setupFilesAfterEnv` adds an `afterAll` to every file, unit included, that closes the
    connections the helpers tracked.
  - The ledger reporter (`coverageReport/coverageReporter.ts`, built to
    `build/test-reporter/`) joins Jest's completed result of each test — after its
    `afterEach` and `expect.assertions` — with the call log by file and `fullName`.
  - `liveCall` reads `expect.getState().currentTestName` and `.testPath`.
  - The coverage guard (`unit/coverage/coverageLedger.test.ts`) discovers the unit files
    through Jest's `runCLI` with `listTests`; `unit/coverage/runReport.test.ts` and
    `unit/coverage/live.test.ts` run Jest itself on fixtures; `liveScripts.ts` recognises a
    live script by its `jest` command and its path flags.
- **The machinery's own unit tests** use the live helpers: `unit/coverage/liveDescribe`,
  `liveScripts`, `runReport`, `refusalStop`, `live` (Code).
- **The coverage guard knows Jest's forms only.** `unit/coverage/ledgerScan.ts` recognises
  a test, a suite and a hook by the callee's name (`it`, `test`, `describe`, `liveSuite`, the
  hooks, their `x…` / `f…` forms) and a modifier by the member name (`.skip`, `.only`,
  `.todo`, `.concurrent`, `.failing`); a skipped or `todo` case's `liveCall` is not coverage,
  and an `.only` is refused (Code). node:test skips a case in forms the scanner does not
  see: an options object (`{ skip, todo, only, concurrency }`, `@types/node` `test.d.ts`)
  and a call on the test context (`t.skip()`, `t.todo()`) (Code). Read as they are today, a
  skipped node:test case would count as coverage (Inference from the scanner's code).
- **Live helpers reach Jest-only shared code.** `integration/helpers/live.ts` imports
  `servedEntries` from `src/__tests__/helpers/pinCases.ts`, the unit pin harness, which uses
  Jest's fake timers, `jest.spyOn`, `expect` and a global `it` (Code). Beside it, the
  integration helper `testHelpers.ts` uses Jest's global `expect` (Code), and
  `sharedObjects.ts`, `testers/HighTester.ts` and `testers/LambdaTester.ts` depend on it
  (their own lifecycle methods are plain methods, not Jest globals; Code); they move with the
  live files.
- **Live suites use no module mock and no fake timer** (Code, grep over `integration/` and
  `admin/`). `DebuggerHandlers` uses `expect.stringContaining` (7).
- **18 source roots resolve by name.** `package.json` `jest.roots` names 18: `src` and the
  17 sibling packages' `src` — `background-runs-memory`, `responsible-rules`,
  `server-runtime`, `server`, `http`, `sse`, `compact-readonly-entries`, `compact-modify`,
  `compact`, `compact-http`, `compact-sse`, `core-ro`, `http-ro`, `sse-ro`, `compact-ro`,
  `compact-http-ro`, `compact-sse-ro` (Code; the 17 directories with a `src` at the root,
  Measured, `ls`). `tsconfig.test.json` includes only some of them; the others' tests are
  type-checked by each package's own `test:check` in CI (Code).
  `moduleNameMapper` holds 46 package-name entries and
  `^(\.{1,2}/.*)\.js$ → $1`; `tsconfig.test.json` `paths` repeats the names for ts-jest;
  `src/__tests__/integration/helpers/packageSources.ts` reads `package.json`
  `jest.moduleNameMapper`, keeps its exact `^@mcp-abap-adt/…$` names whose target is under
  `<rootDir>`, and hooks `Module._resolveFilename` while Jest loads `globalSetup` (outside
  the Jest runtime, where the mapper does not apply); `globalSetup` restores Node's own
  resolution when it ends (Code). `tsc` does not rewrite `paths` in what it emits, so compiled tests
  need the names resolved at run time (Inference).
- **The unit suites' Jest API** (Measured, grep, per file, first category that applies):
  89 module-mock suites (31.4 k lines; `lib/clients` and `lib/connectionFactory` are 58 of
  about 99 `jest.mock` calls), 22 fake-timer suites plus 4 module-mock ones that also use
  fake timers (`advanceTimersByTimeAsync`, `getTimerCount`), 106 with spies only, 333 with no
  Jest API but `jest.setTimeout`. No custom matcher and no snapshot anywhere.
- **What auth-errors did** (Code, its merged move): `npm test` = a `tsc` build of the tests
  to `.test-build/` (`tsconfig.test.json`, `noEmitOnError`, CommonJS) and
  `tools/run-tests.mjs`, which runs one `node --test [options] files` through
  `spawnSync(process.execPath, …)`, fails when it finds no test file, passes options before
  files, and takes `--env NAME=VALUE` instead of a shell prefix. `node:assert/strict`,
  `mock.fn` / `mock.method`; `.each` tables became loops; no `mock.module`, no
  `mock.timers`. It had one source root, no live suite, no reporter and no global setup.

## 2. The runner and the build

- **The runner.** A `tools/run-tests.mjs` on auth-errors' model: it runs `node --test`
  through `process.execPath` with options before files, fails when it has no file to run,
  and takes `--env NAME=VALUE` instead of a shell prefix. A file named on the command line
  is run as named and must exist.
- **The partition is a list in the runner** (owner). The runner holds the list of the test
  files that run on node:test, by their repository source paths (`….test.ts`), which stay
  where they are, so every path, and with it every ledger key and live file of the
  coverage ledger, is unchanged. Jest's configuration ignores exactly those files, read
  from the same list. A guard test fails when a test file is on both runners or on
  neither, and when a listed path names no file. The coverage guard and the partition
  guard read the runner's list, never a pattern of their own.
- **One process per file.** `--test-isolation=process` (node:test's default) is kept and
  never overridden; no option shares a process between files.
- **Concurrency is a setting** (owner: configured by the resources). The number of files
  run at once is an explicit option of the runner, given by the npm script or by one
  documented variable, so CI and a local run each set it from their resources. This wave
  measures memory (peak RSS per file and of the whole run) and wall time of the node:test
  unit run at several settings, and the docs state the measured figures. The runner has no
  default of its own beyond what that measurement shows, and states it as measured.
  Live scripts are the exception: one file at a time (§3).
- **No runner timeout.** No `--test-timeout`, no `{ timeout }` on a `test`, `it`,
  `describe` or hook in a node:test file, no `--test-force-exit`. A source scan over the
  node:test files and the scripts refuses each of them, with a fixture per refusal.
- **The build.** A `tsconfig.node-test.json` (name open to the plan) extends the root
  configuration and emits the listed files and what they import to a test build directory
  (`.test-build/`, gitignored, removed before each build), CommonJS as today,
  `noEmitOnError`. Its `types` is `["node"]` alone, so a moved file that still uses a Jest
  global fails the build. `npm run test:check` keeps type-checking every test file, of
  both runners.
- **Runner-independent shared code.** A module a node:test file imports uses no runner
  API. What the live files need from the Jest pin harness — `servedEntries` today, and
  whatever else the build shows — is extracted into a shared module that imports no test
  runner, and `pinCases.ts` imports it from there, so the Jest pin harness stays as it is
  for the pin suites that stay on Jest. The build's `types: ["node"]` is what finds every
  such import: a node:test file that reaches a Jest global, directly or through an import,
  fails the build. The integration helpers that use Jest's globals move with the live
  files.
- **Paths a test reads.** A compiled test lives two directories deeper than its source (`.test-build/tree/`). A
  moved test finds the repository root and its fixtures through one helper, never through
  the depth of `__dirname`. Files a test reads as data (`__fixtures__`, JSON fixtures, the
  sources a scan reads) are read from the repository, not copied into the build.
- **Files production code reads beside itself.** Production code that reads a repository file by its own location (a package's `package.json`, a `tools/*.json` table, a fixture directory it serves) finds that file in the test build where it finds it in `dist/`: the node:test build places exactly those files beside the compiled code, from one list, and a guard test fails when production code reads a file by its location that the list does not place. This is not copying test data: a file a test reads as data is still read from the repository.
- **Sibling packages by name: a preloaded resolve hook** (owner; no `node_modules` links).
  One table maps each of the repository's package names to its source entry. The runner
  preloads a compiled hook in every file's process that answers exactly those names with
  their compiled files in the test build, and nothing else; Node's own resolution answers
  every other name. Jest's mapper (while Jest lives) and the type checker's `paths` derive
  from the same table, and a guard fails when either disagrees with it. `packageSources.ts`
  goes once no Jest file needs a sibling outside the Jest runtime.
- **Global setup and teardown run in the runner** (decision of this spec). Setup runs in
  the runner's process before `node --test`, teardown after it, only under a live script
  (`npm_lifecycle_event` against `LIVE_SCRIPTS`, as today). Teardown runs whatever the
  run's outcome, and the runner's exit fails when either the run or the teardown fails.
  Reason: it works on every Node the engines allow, with one mechanism; node:test's
  `--test-global-setup` is present in Node 26 (Measured) but not checked in Node 22
  (Inference), and the setup's family-selection refusal needs the selected paths, which
  the runner has before anything starts.
- **The family selection** keeps its contract: the person names exact repository paths of
  integration test sources (`….test.ts`); setup refuses anything else before anything is
  read or sent, and the runner maps each accepted source to its compiled file.
- **Connections closed per file.** Whatever connections a file opened through the helpers
  are closed before its process ends, after every hook of the file. The mechanism — a
  root-level `after` registered by a preload the runner passes, or the live helpers' own
  `after` — is the plan's to prove first on a real `node --test` run; the requirement does
  not change.

## 3. The live machinery without Jest

- **The ledger reporter** becomes a node:test reporter (`--test-reporter`), compiled with
  the test build, beside the default one. It reads each test's final event: `test:pass` is
  `passed` unless it carries `skip` or `todo`, which is `skipped`; `test:fail` is `failed`,
  a cancelled test included. It records the outcome only after the test's own hooks have
  run, which the plan proves with a fixture whose `afterEach` fails (the key is then
  `failed`). It records every file that ran, by its repository source path, for a family
  run.
- **The join key.** A test is named by its file and its name path — the titles from the file
  down to the test, in order, joined by one separator the package defines. `liveCall` and
  the reporter build the key with the same function; Jest's `fullName` is not used.
- **`liveCall` through an `AsyncLocalStorage`** (decision of this spec). `liveSuite`'s
  cases set the current test (file and name path) in an `AsyncLocalStorage` for the
  duration of the test's body; `liveCall` reads it and refuses outside a test, as it
  refuses today. Reason: node:test has no global `expect.getState()`; passing the test
  context `t` into every call would change every `liveCall` call site, and reading
  `t.fullName` would tie the key to a Node version not checked for it (Inference). With the
  storage no call site changes its arguments, and the key is the package's own (above).
- **The coverage guard sees node:test's forms.** `ledgerScan.ts` recognises the node:test
  functions (`test`, `it`, `describe`, `suite`, the hooks) imported from `node:test`, and
  their `.skip` / `.todo` / `.only` members as it does Jest's. In a live or pin file it
  refuses each form that can skip, focus or run a case concurrently without its member
  name: an options object carrying `skip`, `todo`, `only` or `concurrency`, a call of
  `skip` or `todo` on a test context, and a node:test function imported under another
  name. `liveSuite`'s own skip lives in the helper, not in a live file. One refusal fixture
  per form, each refused by its check alone, and `clean` by none, as the guard's fixtures
  are today.
- **A required key** keeps the teardown's rule: it passes only when every test that called
  it passed; failed, skipped or not run fails the run. A file whose process ended without
  reporting a test — a crash, a kill — leaves that test's keys `not run`, and the run fails.
- **`liveSuite`** keeps its contract: where its cases run, the reason when it skips, the
  runner opened before its cases and closed after the body's own hooks.
- **No bound on a live test** (owner: none replaces `getTimeout`, since leaving Jest is
  leaving its timeouts). The moved live suites pass no bound; `getTimeout` and its keys
  leave the helpers and `tests/test-config.yaml.template`. If anything public changes with
  them (a documented config key), CHANGELOG and MIGRATION say so.
- **Live scripts run one file at a time** (decision of this spec). `test:integration`,
  `test:coverage-family`, `test:high`, `test:live-connection` and `shared:setup` /
  `shared:teardown` / `shared:check` run through the runner with `--test-concurrency=1`,
  with the ledger reporter where they carry it today. Reason: today's live scripts run in
  band (`--runInBand`, required by `liveScripts.test.ts`); live files share one system, one
  session written by setup, the run's marker and call log, and objects on the system that
  one file's cleanup must not race with another's. `LIVE_SCRIPTS` keeps the names;
  `selectsLiveSuites` and `liveScripts.test.ts` recognise the runner's form instead of
  `jest` with path flags, and keep refusing a live script that runs files in parallel.
- **No force exit** (decision of this spec). No `--forceExit` and no `--test-force-exit`.
  Reason: a force exit ends a file's process with whatever is still pending, which is how a
  late `finally` or an unawaited cleanup gets cut — against the goal's cleanup invariant —
  and it hides open handles instead of finding them. A file that does not end once its
  tests and hooks have run has an open handle; that is a defect of the file or a helper,
  found and fixed in this wave.
- **The first interrupt lets a running cleanup finish** (owner). This wave measures what
  `node --test` does on Ctrl-C to a running live file (which process gets the signal, what
  the running test, its hooks and the file's process see), and records it in the docs. The
  runner and the live helpers make a cleanup that is running when the first interrupt comes
  run to its end before the process exits; what a second interrupt does is stated with the
  measurement.

## 4. Which suites move in the first wave

`#346` carries only this wave, the tests that made the problems (owner); the later waves
are a task of their own (§6).

- **Every live suite:** the 55 files under `src/__tests__/integration/` and the 3 under
  `src/__tests__/admin/shared-deps/`. So the live machinery runs on one runner only, and
  §3 has no Jest variant to keep.
- **The live machinery's own tests:** `unit/coverage/liveDescribe`, `liveScripts`,
  `runReport`, `refusalStop`, `live` and `coverageLedger`. `runReport` and `live` run
  `node --test` with the ledger reporter on their fixtures instead of Jest's `runCLI`.
- **The TypeScript-program scans:** `unit/sources/noDerivationFromAuthorization`,
  `noProseMatching`, `noChainInstanceof`, `noRegexOverInput`, `typeCodeScan`,
  `typeCodeLiterals`, `staticTypes`.
- **The slow unit suites over 5 s** that need neither a module mock nor a fake timer:
  `analyseOmissions`, `adtHeaders/headerCallSites`, `coverage/hardModeBinaries`,
  `server-runtime/…/cancel/loginBound` (spies only, so `mock.method`).
- **The install suites leave the unit run** (owner): `installMatrix` and `binSmoke` move to
  node:test under their own npm script, `test:install`, which reaches the network for the
  installs' third-party dependencies and runs in CI as a step of its own.
- **The Ollama suite leaves the unit run** (owner): `descriptions/toolRetrievalVectors` and
  its helpers move to node:test under their own npm script, `test:retrieval`, not run in
  CI, with no runner timeout. It states where it runs and skips with the reason where the
  local Ollama does not answer, as it does today.
- **`batch/closeWithBatch` stays on Jest** (owner): it uses a module mock and fake timers
  (Measured) and moves with that category.
- **How a file moves.** `expect` becomes `node:assert/strict`; an asymmetric matcher becomes
  a plain check of the field it named (string code, no regular expression over a value);
  `.each` tables become loops calling `test`; `jest.fn` / `jest.spyOn` become `mock.fn` /
  `mock.method` with their restore in the file's hooks; `jest.setTimeout` goes, with no
  replacement (§2). No assertion or matcher library is added. The file keeps its path.

## 5. Both runners until the end state

- **One partition:** the runner's list (§2), with its guard.
- **`npm test` runs both runners, even when the first fails** (decision of this spec).
  Jest over its files, then the runner over the listed unit files; the script fails when
  either fails. Reason: a failure in one runner must not hide the other's result, so one
  CI run shows every failing file, and neither runner's outcome depends on the other's.
  The Jest run no longer discovers the listed files; its `globalSetup`, `globalTeardown`,
  `setupFilesAfterEnv` and the Jest reporter go, since no Jest file is live any more.
- **The interim Jest run gets workers** (owner): `maxWorkers` above one with a
  `workerIdleMemoryLimit`, so the remaining Jest suites no longer share one heap, until
  their files move. This wave measures the effect (peak memory and wall time, before and
  after, in the orderings the report used) and states the figures. The worker count
  follows the same rule as the runner's concurrency: an explicit setting, from the
  measurement.
- **The coverage guard** reads the union of Jest's `listTests` and the runner's list for
  the unit files a pin may live in, so a pin in either runner's file is found and a pin in
  neither is refused.
- **How each live guarantee holds meanwhile.** Every live file runs on node:test from this
  wave on, so no guarantee has a Jest variant to keep in step:
  - *the ledger:* the coverage guard (itself moved) reads the ledger, every live file's
    `liveCall`s with the node:test forms above, and the pins in files of both runners;
  - *the run report:* written only by the node:test ledger reporter, from the live scripts,
    all of which run on the runner; the Jest reporter goes;
  - *required keys:* checked by the teardown the runner runs after a live script, with
    today's rule; a Jest run is never a live run, so it checks nothing, as `npm test` does
    today;
  - *the refusal stop:* the marker, `refuseAfterMarker` and the guarded connections are in
    the live helpers and the run directory, which only node:test files use; setup and
    teardown, in the runner, make and check the marker as `globalSetup` / `globalTeardown`
    do today;
  - *`liveSuite`'s skips:* the helper states where its cases run and skips with the reason
    under node:test; no Jest file calls it.
- **The sub-package scripts** (`npm --prefix server-runtime test`, `--roots …`) select by
  root on both runners; the runner takes a root filter for that.
- **CI** runs `npm test` as today on every Node of its matrix, and `test:install` as a step
  of its own; the test build is part of the scripts, not a separate step. `test:check`
  stays.
- **The end state** — the later task — removes Jest, ts-jest, jest-util and `@types/jest`,
  the Jest configuration, the runner's list and its guard (every file is then node:test),
  and the mapper copy of the name table.

## 6. Decided now, and left to the later task

- **Decided now:** the runner, its list and its concurrency setting, the build, the
  resolve hook, the global setup and teardown in the runner, the ledger reporter, the join
  key and `liveCall`'s storage; the partition guard and the no-timeout scan; no bound on a
  live test; the interrupt behaviour; every live suite, the machinery's tests, the scans
  and the slow suites of §4; the install and Ollama suites out of the unit run; workers for
  the interim Jest run.
- **The later task** (its own goal, spec and PR), by the measured categories:
  - the 333 suites with no Jest API but `jest.setTimeout`, and the 106 with spies only;
  - the 89 module-mock suites, `batch/closeWithBatch` among them. A module mock is replaced
    by a typed injection point — a parameter or an option defaulting to the real module —
    not by `mock.module`. Each injection point in production code is listed for the owner
    before it is added; most go through two seams, `lib/clients` and
    `lib/connectionFactory` (Inference from the counts);
  - the 26 fake-timer suites. node:test's `mock.timers` has no `getTimerCount` and its async
    advancing is unproven here (Inference); whether they move to `mock.timers`, to an
    injected clock, or to real time with a signal is decided in that task.

## 7. Contracts

- **A test's end.** A test ends when its work settles. A test that bounds its work passes an
  `AbortSignal` to that work and ends when the work ends on it; the runner bounds nothing.
  A live test has no bound (§3), and a live call is never aborted mid-request by the
  runner.
- **Cleanup.** Cleanup is in the test's own `finally` or in a hook; a hook runs only after
  the body it follows has settled (node:test runs hooks in order, with no timeout — §2). No
  process is ended while a hook or a `finally` runs: no force exit, an open handle is
  fixed, not cut, and the first interrupt lets a running cleanup finish (§3).
- **Required-key reporting.** §3: outcome from the final event after the test's hooks, the
  key from the shared name path, a file that ran recorded by its source path, the
  teardown's rule unchanged, and a crashed file's keys `not run`.
- **Where a test runs.** Every live suite, the install suites and the Ollama suite state
  where they run and skip with the reason elsewhere; the unit run reaches no outside
  service.

## 8. Risks the report names

- **Hangs on open handles.** Without a force exit, every handle a live file leaves open keeps
  its process alive (Code: four of the seven live scripts pass `--forceExit`; the three
  `shared:*` scripts do not). Each is found and fixed
  in this wave; a run that does not end is a failure of the wave.
- **Name resolution of 18 roots.** The compiled tests need the sibling names resolved at
  run time, which auth-errors never needed (Inference); three copies of the table exist
  today (Code). The resolve hook and its guard answer it.
- **The reporter's moment.** That node:test emits a test's final event after its
  `afterEach` is Inference until the fixture of §3 proves it.
- **The heap of the remaining Jest run.** Taking the scans and the live suites out shortens
  the run, but the per-suite growth stays (Measured); workers with `workerIdleMemoryLimit`
  are the interim answer, and their effect is measured in this wave.
- **Scale.** 550 unit suites and 138.8 k lines against auth-errors' 23 and 12.8 k
  (Measured); this wave moves the files that need no module mock and no fake timer.
- **Interrupts.** How `node --test` passes an operator's interrupt to a running file is not
  measured yet; this wave measures it (§3).
- **Parallel scans.** Several TypeScript-program scans at once may need several times the
  memory of one (Inference from 790 and 500 MB each); the concurrency measurement of §2
  shows it.

## 9. Acceptance

- `npm test` passes on every Node of CI's matrix with both runners, and each node:test file
  ran in its own process. `test:install` passes in CI.
- The moved files assert what they asserted, at the same paths: the plan lists, per moved
  file, its test count before and after; a difference is named and explained.
- The suites of §4 run under node:test; the Jest run discovers none of them; the partition
  guard passes, and fails on each of its fixtures (a file on both, on neither, a listed
  path naming no file).
- The no-timeout scan passes and refuses each of its fixtures (`--test-timeout`,
  `{ timeout }`, `--test-force-exit`, `--forceExit`).
- The ledger reporter is load-bearing: on fixtures run through `node --test`, a passing
  test records `passed`, a failing body or a failing `afterEach` `failed`, a crashed file
  `not run`; deleting any one of these mappings turns its fixture red.
- Skips, two cases, each failing the required-key check: a case skipped before any
  `liveCall` records no call, so its key is `not run` (as `skipped.fixture.ts` and
  `runReport.ts`'s `stateOf` have it today); a case that skips after a recorded `liveCall`
  records `skipped` (`t.skip()` in the body: refused in a live file by the coverage guard,
  §3, and still mapped by the reporter, which a fixture outside the ledger proves). Each has
  its fixture.
- The coverage guard refuses each node:test skip, focus and concurrency form of §3 by its
  fixture, and counts a node:test live case like a Jest one.
- No node:test file imports a module that uses a Jest API; `servedEntries` and whatever else
  the live files need come from the extracted shared module, and the Jest pin suites pass
  unchanged.
- `liveCall` outside a `liveSuite` case is refused; inside one it records the case's file
  and name path, which the reporter joins.
- The coverage guard passes with pins in files of both runners and refuses a pin in a file
  of neither.
- The unit run reaches no outside service: neither the install suites nor the Ollama suite
  is in it.
- `getTimeout` and its keys are gone from the helpers and the test-config template; any
  public change is in CHANGELOG and MIGRATION.
- The Ctrl-C behaviour is measured and documented, and a fixture shows a cleanup that is
  running at the first interrupt finishing before the process exits.
- The runner's concurrency and the interim Jest workers are explicit settings, their
  figures measured and documented; nothing in the runner is a default the measurement does
  not show.
- A full live run under node:test on each system kind the ledger names passes the
  teardown's check with the same required keys as the last Jest run, and its cleanup leaves
  nothing behind beyond what that Jest run left. Run only with the owner's go-ahead.
- No new runtime dependency; the lockfile resolves everything from the npm registry and has
  no `"link": true`.
- The docs that describe how tests run (the integration tests' README, the contributor
  docs, the CHANGELOG entry) say what the first wave changed.

## 10. Decisions

**The owner's answers** (binding):

1. The partition is a list in the runner; paths, and with them ledger keys, unchanged; a
   guard that every test file belongs to exactly one runner (§2).
2. Package names at run time through a preloaded resolve hook, no `node_modules` links (§2).
3. Nothing replaces `getTimeout`; its keys leave the test-config template, with CHANGELOG
   and MIGRATION lines if anything public changes (§3).
4. This wave measures Ctrl-C under `node --test`; a running cleanup finishes on the first
   interrupt (§3).
5. Unit-file concurrency is an explicit setting chosen by the resources, measured for memory
   and time in this wave; no guessed default (§2).
6. `installMatrix` and `binSmoke` leave the unit run for their own script, which reaches the
   network and runs in CI (§4).
7. `batch/closeWithBatch` moves later, with the module-mock and fake-timer category (§4).
8. The Ollama suite gets its own script, `test:retrieval`, not in CI, with no runner timeout
   (§4).
9. `#346` carries only the first wave; the later waves are a task of their own (§4, §6).
10. The interim Jest run gets workers with `workerIdleMemoryLimit` until its files move, its
    effect measured (§5).

**This spec's own decisions**, each with its reason where it is stated, for the review to
check:

- Global setup and teardown run in the runner, not through `--test-global-setup` (§2).
- Live files run one at a time (§3).
- `npm test` runs both runners, even when the first fails (§5).
- No `--forceExit` and no `--test-force-exit` (§3).
- `liveCall` reads the current test from an `AsyncLocalStorage` that `liveSuite`'s cases set
  (§3).
