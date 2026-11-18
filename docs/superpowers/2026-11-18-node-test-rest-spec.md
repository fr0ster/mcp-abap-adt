# Spec: the remaining waves onto node:test; Jest removed

Goal: `2026-11-18-node-test-rest-goal.md`. It binds this spec: its invariants are not weakened
anywhere below. This spec decides how the 601 test files still on Jest move to node:test,
in which order, by which rules, what each injection point in production code would be (for
the owner, before any is added), how a moved test is shown to prove what it proved, and the
end state with Jest gone. It is steps and decisions, not code; the plan breaks it into
commits.

Labels: **Measured** (counted or run, on `refactor/node-test-rest` at `90da705d`, its code
equal to `main` at `8a9ed531`), **Code** (read in the source), **Inference**. Where the
owner had to decide, the item names its decision of 2026-11-18, collected in §10.

## 0. Prior art

- The first wave (`#346`, spec deleted at the 24.0.0 release, read at `1d0e8fb3^`) built the
  runner (`tools/run-tests.mjs`), the list (`tools/node-test-files.json`), the build
  (`tools/build-node-tests.mjs`, `tsconfig.node-test.json`, `types: ["node"]`), the resolve
  hook, the runs of their own (`tools/separate-runs.json`), the ledger reporter, the global
  setup and teardown in the runner, and `npm test` running both runners
  (`tools/npm-test.mjs`). It moved every live suite and the live machinery. Its §5 and §6
  left this task: the plain and spy suites, the module-mock suites (by typed injection
  points, never `mock.module`), and the fake-timer suites (mechanism then undecided).
- The timers spike (`.worktrees/timers-spike`, not merged) settled the mechanism: node:test's
  `mock.timers` plus one shared helper. Its results are taken as the owner stated them (§3.7).
- The first wave's rule "no assertion or matcher library is added" stays: the helpers of
  §3.8 are test code of this repository, not a dependency.

## 1. What the code shows

- **The files** (Measured, `git ls-files '*.test.ts'`): 761 test files; 160 on the node:test
  list, 601 on Jest. No `*.test.ts` lies under a `__fixtures__` directory. Per root, the
  601: `src` 434, `server-runtime` 120, `compact-readonly-entries` 11, `responsible-rules`
  11, `compact-modify` 9, `compact` 4, and one each in the eleven other packages.
- **Every live file is already on node:test** (Measured): the 79 files under
  `src/__tests__/integration/` and `src/__tests__/admin/` are all on the list, and so are
  the live machinery's tests (`unit/coverage/{coverageLedger,live,liveDescribe,liveScripts,
  refusalStop,runReport}`) and the runner's (`unit/runner/*`).
- **The 601 by the hardest Jest API in the file itself** (Measured, grep per file, first
  category that applies):

  | Category | Files | Test |
  |---|---|---|
  | module mock | 90 | `jest.mock` / `doMock` / `requireMock` with a module path |
  | fake timers | 24 | `useFakeTimers` and the timer calls, no module mock (`DebugSession` included: its only `requireActual` is of `timers`, for a real `setImmediate`) |
  | spies | 125 | `jest.fn`, `jest.spyOn` (also split across lines), `mock…` members, `restoreAllMocks` |
  | plain | 362 | none of the above: `expect`, `describe`/`it`, hooks, `jest.setTimeout` (`handleGetEnhancements` included: its `requireActual` is a plain load) |

  Three module-mock suites also use fake timers: `server-runtime/…/auth/brokerFactory`,
  `unit/batch/closeWithBatch`, `unit/runtimeProfiling` — 27 fake-timer users in all.
  The plain files: 315 mention no `jest` at all, 42 only `jest.setTimeout`, one
  (`unit/runner/listAndTable`) names `jest.config` as text.
- **Shared helpers that use a Jest API** (Measured, the non-test `.ts` files under
  `__tests__`, outside `__fixtures__`), with the test files that reach them through
  imports, transitively:

  | Helper | Jest API | Test files reaching it |
  |---|---|---|
  | `src/__tests__/helpers/pinCases.ts` | `useFakeTimers({ now, doNotFake: every API but Date })`, `spyOn` of `crypto.randomUUID`, `crypto.randomBytes`, `Math.random`, `expect`, a global `it` | 32, all plain (28 under `unit/pins/`) |
  | `src/__tests__/unit/debugger/fakes.ts` | `advanceTimersByTimeAsync(0)` in `until` | 18: 13 fake-timer, 5 plain |
  | `src/__tests__/helpers/batchEnvelope.ts` | `jest.fn` on the fake connection's five methods | 30: 18 plain, 5 spies, 7 module-mock |
  | `src/__tests__/helpers/batchStand.ts` | `jest.fn`, `jest.Mock`, and it requires its importer to `jest.mock` `lib/connectionFactory` | 7, all module-mock |

  `helpers/nameTable.ts` and `unit/runner/toolRuns.ts` name `jest.config` only as text
  (Code). `helpers/plainNode.ts` uses a bare `describe`/`it` only in its doc comment
  (Code). The coverage fixtures under `unit/coverage/__fixtures__/` are data the ledger scan
  reads, not run (Code).
- **Module-mock targets** (Measured, each `jest.mock` path resolved against its file):
  `src/lib/clients` 40 suites, `src/lib/connectionFactory` 20, `@mcp-abap-adt/adt-clients`
  9, `@mcp-abap-adt/auth-broker` 5, `src/lib/systemInformation` 4,
  `src/handlers/system/readonly/handleSearchSource` 4, `src/lib/credentialSources` 3,
  `server-runtime/src/runtimeVersion` 3, `@mcp-abap-adt/connection` 3,
  `@mcp-abap-adt/auth-providers` 2, and one each: `@mcp-abap-adt/lib/handlers/write`,
  `@mcp-abap-adt/lib/handlers/read`, `src/lib/packageSessions`, `src/lib/answer`,
  `src/handlers/unit_test/shared/runTests`, `src/lib/search-source/orchestrator`,
  `node:sea`, and the test helper `integration/helpers/realmCheck`. 81 suites mock one
  module, 7 two, 2 three. The suites per target are in Appendix A.
- **What the `lib/clients` mocks replace** (Measured, names used in the 40 files):
  `createAdtClient` (all 40), `variantOf` (16), `createOnPremAdtClient` (8), `adtClientOf`
  (3), `createOnPremExecutor` (1). Production reaches these through 289 call sites in 217
  files (Measured, grep outside `__tests__`).
- **Third-party packages export through getters** (Code): `@mcp-abap-adt/auth-broker` and
  `@mcp-abap-adt/connection` `dist/index.js` re-export with
  `Object.defineProperty(exports, …, { enumerable: true, get })`, non-configurable, so no
  property of theirs can be replaced after load. This repository's own `export function`
  compiles to a plain assignment on `exports` under the tsc CommonJS build (Inference from
  tsc's emit; the node:test files already replace such exports, next item).
- **node:test files already spy on this repository's module exports** (Code, green on
  `main`): `mock.method(checkedArguments, 'accessCallOf')` (`unit/access/*`),
  `mock.method(idleBound, 'parseStateIdleMinutes')` (`unit/config/caughtRefusalWords`).
  And `mock.timers` is in use (`unit/atc/atcPoll`, `unit/draft/getObjectDraft`).
- **Spies on module exports in the spies category** (Measured): 8 suites call
  `jest.spyOn` on a namespace import of this repository's modules —
  `connectionFactory.createAbapConnection` (`stdio/…/auth/mintedRefusals`,
  `stdio/…/shutdown/logoffAtOnce`, `unit/embeddable/setupRefusal`),
  `packageSessions.openFreshConnection` and `longCall.runLongCall`
  (`unit/backgroundRuns/longReads`, `unit/batch/recording`, `unit/handlerSystem/longTool`,
  `unit/handlerSystem/argumentsBeforeConnection`, `unit/longTools/argumentsBeforeConnection`),
  `batch/eligibility.eligible` (`unit/batch/recording`).
- **The matchers in use** (Measured, the 601 files and the four helpers; counts of call
  forms): `toBe` 4843, `toEqual` 3409, `toContain` 1019, `toHaveLength` 821,
  `toBeUndefined` 426, `toMatchObject` 397, `not.toContain` 389, `toBeGreaterThan` 218,
  `rejects.toThrow` 200, `not.toHaveBeenCalled` 194, `toThrow` 189,
  `toHaveBeenCalledTimes` 166, `not.toBe` 162, `toBeDefined` 89, `toMatch` 86,
  `resolves.toEqual` 76, `not.toHaveProperty` 74, `toHaveBeenCalledWith` 57,
  `toBeInstanceOf` 55, `toBeFalsy` 44, `resolves.toBe` 42, `rejects.toMatchObject` 42,
  `not.toThrow` 37, `toBeGreaterThanOrEqual` 36, `toHaveProperty` 28, `toBeNull` 25,
  `rejects.toBe` 25, `resolves.toMatchObject` 20, `rejects.toBeDefined` 20,
  `resolves.toBeUndefined` 19, `toBeLessThan` 18, `not.toMatch` 16, `toHaveBeenCalled` 15,
  `not.toEqual` 15, `toContainEqual` 13, `rejects.toBeInstanceOf` 13, `toBeTruthy` 9,
  `toStrictEqual` 8, `resolves.toBeDefined` 8, `toHaveBeenNthCalledWith` 5,
  `not.toBeNull` 4, `rejects.not.toThrow` 3, `toBeLessThanOrEqual` 2, `toBeCloseTo` 2,
  `not.toContainEqual` 2, `not.toBeInstanceOf` 2, `not.toMatchObject` 1,
  `not.toBeUndefined` 1. Asymmetric matchers: `objectContaining` 56, `stringContaining` 40,
  `any` 36, `arrayContaining` 23, `stringMatching` 14, `anything` 2. About 13.3 k `expect(`
  calls in all.
- **Other Jest forms** (Measured): `it.each` 769, `describe.each` 97, `test.each` 2, four of
  them tagged-template tables; `it.skip` 4, each as `const t = cond ? it : it.skip`; hooks
  `beforeEach` 282, `afterEach` 268, `afterAll` 30, `beforeAll` 23; `expect.assertions` 1
  (`unit/withLock`); `jest.isolateModules` / `doMock` / `dontMock` in `unit/libInstance`
  only. **None** (Measured): snapshot matchers, `expect.extend`, custom matchers, `done`
  callbacks, Jest's `fail()`, `.only`, `.todo`, `.concurrent`.
- **Mock-function members** (Measured): `mockImplementation` 175, `mockResolvedValue` 84,
  `mockRestore` 83, `mock.calls` 70, `mockRejectedValue` 52, `mockReset` 31,
  `mockResolvedValueOnce` 25, `mockClear` 21, `mockReturnValue` 14, `mock.results` 7,
  `mockImplementationOnce` 6, `mock.contexts` 3, `mockRejectedValueOnce` 2,
  `mock.instances` 1; types `jest.SpyInstance` 44, `jest.Mock` 36, `jest.MockedFunction` 4,
  `jest.mocked` 11. `jest.config.js` sets no `restoreMocks`, `clearMocks` or `resetMocks`
  (Code); 7 files spy without restoring (Measured).
- **Jest's fake-timer defaults** (Code, `@jest/fake-timers` 30.5.2,
  `_toSinonFakeTimersConfig`): with no `doNotFake`, every API sinon offers is faked —
  `setTimeout`, `setInterval`, `setImmediate`, `Date`, `nextTick`, `queueMicrotask`,
  `hrtime`, `performance`; `advanceTimers: true` is sinon's `shouldAdvanceTime` (fake time
  follows real time); `runAllTimersAsync` stops at a loop limit of 100 000 timers.
  node:test's `mock.timers` fakes `setTimeout`, `setInterval`, `setImmediate`, `Date` and
  `scheduler.wait`, not `nextTick` or `queueMicrotask` (Inference from Node's
  documentation; the plan confirms on every CI Node version).
- **Fake-timer forms** (Measured): `useFakeTimers()` with Jest's defaults in 18 suites (13
  of them the debugger's, in `beforeEach`); `doNotFake: ['setImmediate', 'nextTick',
  'queueMicrotask']` in 8 suites; `advanceTimers: true` in `http/…/shutdown/pooledInstance`
  (2 cases), `unit/batch/closeWithBatch`, `unit/shutdown/undoFailsLogoff`;
  `runAllTimersAsync` in `unit/debugger/secondStopCredentialRefusal`; `now:` only in
  `pinCases.ts`; `clearAllTimers` 2. Of `setImmediate`, `nextTick`, `queueMicrotask`, `performance.now`
  and `hrtime`, production calls only `setImmediate` / `nextTick`, in
  `src/lib/batch/phases.ts` and `recorder.ts`, and it imports no `node:timers` (Measured).
- **Rejections** (Code, `expect` 30.5.2, `createMatcher`): `toThrow(x)` reads a thrown
  value's `message` when it is a string, else `String(value)`; a string `x` passes when the
  message *includes* it, a RegExp when `x.test(message)`, a class when the value is an
  instance, an error object when the messages (and causes) are equal. `.rejects.toThrow(x)`
  passes only when the reason is an `Error`. `node:assert`'s `throws` / `rejects` given a
  RegExp test it against `String(error)` — the error's name included — and given a string
  take it as the assertion's message, not as an expectation (Inference from Node's
  documentation; the owner's spike observed the first).
- **`toMatchObject`** (Code, `subsetEquality`): every expected key must be *present* in the
  received object (own or inherited) and match recursively; arrays match by equal length
  and element by element; primitives by `Object.is`-like equality. The spike's helper reads
  `actual[k]`, so an expected `{ k: undefined }` passes where Jest fails — the contract in
  §3.8 closes that.
- **Process output.** Seven Jest suites spy on `process.stdout.write`
  (`stdio/…/auth/jwtNoneLeavesStdio`, `stdio/…/debug/noSecretsOut`,
  `stdio/…/launcherDestination` (2), `stdio/…/shutdown`, `stdio/…/stateLogger`,
  `unit/rfcWireLogging`) (Measured). Under `--test-isolation=process` a file's process
  reports to the runner through its stdout (Inference from Node's runner; not measured
  here).
- **The runners today** (Code): `npm test` = `node tools/npm-test.mjs --concurrency 2`: Jest
  (its arguments read by `jest-cli`'s `buildArgv`), then the node:test build, then the
  runner over the listed files; both run even when the first fails. `jest.config.js` builds
  its `moduleNameMapper` from `tsconfig.paths.json` and its `testPathIgnorePatterns` from
  the list; 18 roots; 4 workers, `workerIdleMemoryLimit: 512MB`, `testTimeout: 600000`.
  The sub-packages' `test` scripts are `npm --prefix .. test -- --roots <package>/src`.
  CI and release run `npm test -- --concurrency <N>`, `npm run test:install`, the root
  `test:check` and six sub-packages' `test:check`.
- **Jest in the manifests** (Measured): root `package.json` devDependencies `jest`,
  `ts-jest`, `jest-util`, `@types/jest`; `@types/jest` also in `background-runs-memory`,
  `http`, `responsible-rules`, `server`, `server-runtime`, `sse`. Nothing imports
  `jest-util` (Measured). One lockfile, the root `package-lock.json`, with no
  `"link": true` (Measured). `tsconfig.test.json` and the six sub-packages'
  `tsconfig.test.json` name `jest` in `types` (Code).

## 2. Waves and their order

### 2.1 Which wave a file belongs to

A file moves in the wave of the hardest Jest API it reaches — in itself or through a helper
it imports, transitively — by the order **plain < spies < fake timers < module mocks**. A
shared helper that uses a Jest API moves in one commit with every file that reaches it,
unless §2.2 makes it runner-neutral first.

### 2.2 Step zero: make the cross-wave helpers runner-neutral

A runner-neutral module uses no API of either runner. `node:assert` is runner-neutral: Jest
fails a test on any thrown `AssertionError` (Inference: Jest reports any thrown error as the
test's failure).

- **`batchEnvelope.ts`** is made runner-neutral before any wave: its fake connection keeps
  a plain record of every call of its five methods (`connect`, `disconnect`,
  `getBaseUrl`, `setSessionType`, `makeAdtRequest`) instead of `jest.fn`. The files that
  assert on those members (on the call count or the calls) read the record instead, in the
  same commit, on whichever runner they are on; each assertion keeps its meaning. Reason: it
  is reached from all three of plain, spies and module-mock files (30 in all); moving it
  with its hardest importers would hold 23 non-mock files to the last wave, and it would join
  the debugger and pin groups into one group through `debugger/amdpDebugBatch` and four pin
  files.
- **`pinCases.ts`** and **`debugger/fakes.ts`** are not made neutral: each moves with its
  importers in the fake-timer wave (§2.3). `batchStand.ts` moves with its 7 module-mock
  importers.

With that, the waves are (Measured, by §2.1 after step zero): **plain 325, spies 125,
fake timers 61** (24 suites, the 32 that reach `pinCases.ts`, the 5 plain debugger files
that reach `fakes.ts`), **module mocks 90** (3 of them with fake timers). No helper is then
reached from two waves (Measured).

### 2.3 The order, and why

1. **Plain (325).** Only the assertion rules (§3.1–§3.5) and the rejection helper. It
   builds the conversion rules and the helpers on the largest, simplest set, so every later
   wave reuses settled rules; and it removes most of Jest's run early.
2. **Spies (125).** Adds `mock.fn` / `mock.method` (§3.6). Independent of timers and
   seams.
3. **Fake timers (61).** Adds `mock.timers` and the timer helper (§3.7). The groups move
   whole: the debugger directory with `fakes.ts` (18 files, the 13 fake-timer suites and the
   5 plain ones), and the pin group with `pinCases.ts` (32 files; it fakes `Date` alone, so
   it needs no advance). Before module mocks because three module-mock suites also fake
   timers, and their timer conversion should already be a settled rule.
4. **Module mocks (90).** Last: each needs a production injection point the owner has
   approved (§7), and seams are production changes reviewed on their own; everything else is
   on node:test by then, so a seam's commit touches only its own suites.
5. **End state (§5).** Jest removed in the commit after the last file moves.

Within each wave: small focused commits, one logical change each — a helper, then a
directory or a few related files at a time. Each commit moves its files onto the list, and
leaves `npm run build`, `npm run lint:check`, `npm run test:check` and `npm test` green. A
seam is its own commit, before the commit that moves the suites using it. The plan lists the
commits and the files in each.

## 3. The conversion rules

The file keeps its path, its `describe` / `it` titles and its test count (§8). It imports
`describe`, `it`, the hooks and `mock` from `node:test` under those names (the ledger scan
refuses another name, Code), and `assert` from `node:assert/strict`.

### 3.1 Matchers

`assert` below is `node:assert/strict`. "Equal" in Jest's sense is its recursive equality
(`toEqual`); `deepStrictEqual` is stricter (§3.2).

| Jest | node:test form |
|---|---|
| `expect(a).toBe(b)` / `.not.toBe(b)` | `assert.equal(a, b)` / `assert.notEqual(a, b)` (both `Object.is`) |
| `.toEqual(b)` | `assert.deepStrictEqual(a, b)` — see §3.2 |
| `.not.toEqual(b)` | `assert.notDeepStrictEqual(a, b)` — weaker than Jest's, see §3.2 |
| `.toStrictEqual(b)` | `assert.deepStrictEqual(a, b)` |
| `.toMatchObject(b)` / `.not.toMatchObject(b)` | `assertMatchObject(a, b)` / `assert.throws(() => assertMatchObject(a, b), AssertionError)` |
| `.toContain(x)` / `.not.toContain(x)` | `assert.ok(a.includes(x))` / `assert.ok(!a.includes(x))` (string: substring; array: `===`, as Jest's) |
| `.toContainEqual(x)` / `.not…` | `assert.ok(a.some((e) => isDeepStrictEqual(e, x)))` / its negation (`node:util`) |
| `.toHaveLength(n)` | `assert.equal(a.length, n)` |
| `.toBeUndefined()` / `.not.toBeUndefined()` / `.toBeDefined()` | `assert.equal(a, undefined)` / `assert.notEqual(a, undefined)` / `assert.notEqual(a, undefined)` |
| `.toBeNull()` / `.not.toBeNull()` | `assert.equal(a, null)` / `assert.notEqual(a, null)` |
| `.toBeTruthy()` / `.toBeFalsy()` | `assert.ok(a)` / `assert.ok(!a)` |
| `.toBeGreaterThan(n)` and the other three orderings | `assert.ok(a > n)` (`>=`, `<`, `<=`) |
| `.toBeCloseTo(x, d = 2)` | `assert.ok(Math.abs(a - x) < 10 ** -d / 2)` |
| `.toBeInstanceOf(C)` / `.not…` | `assert.ok(a instanceof C)` / `assert.ok(!(a instanceof C))` |
| `.toMatch(re)` / `.not.toMatch(re)` | `assert.match(a, re)` / `assert.doesNotMatch(a, re)` |
| `.toMatch('s')` / `.not.toMatch('s')` | `assert.ok(a.includes('s'))` / its negation (Jest's string form is a substring) |
| `.toHaveProperty('k')` / `.not.toHaveProperty('k')` | `assert.ok('k' in Object(a))` / `assert.ok(!('k' in Object(a)))` (Jest walks the prototype chain, Code `hasProperty`); a dotted path is written as its steps |
| `.toHaveProperty('k', v)` | the presence check, then `assert.deepStrictEqual(a.k, v)` |
| `.toThrow(x?)` / `.not.toThrow()` | `assertThrows(fn, x?)` (§3.8) / `fn()` called plainly (a throw fails the test) |
| `.resolves.<m>(…)` | the row of `<m>` over `await p` |
| `.rejects.toThrow(x?)` | `await assertRejects(p, x?)` (§3.8) |
| `.rejects.not.toThrow(re)` | `const r = await assertRejects(p); assert.doesNotMatch(messageOf(r), re)` — Jest's form requires a rejection with an `Error` |
| `.rejects.toBe(v)` / `.toMatchObject(o)` / `.toBeInstanceOf(C)` / `.toBeDefined()` | `const r = await rejectionOf(p)`, then that row over `r` |
| `toHaveBeenCalled()` / `not.toHaveBeenCalled()` / `toHaveBeenCalledTimes(n)` | `assert.ok(f.mock.callCount() > 0)` / `assert.equal(f.mock.callCount(), 0)` / `assert.equal(f.mock.callCount(), n)` |
| `toHaveBeenCalledWith(…args)` | `assert.ok(f.mock.calls.some((c) => isDeepStrictEqual(c.arguments, [...args])))`; where the test knows which call, the exact call: `assert.deepStrictEqual(f.mock.calls[i]?.arguments, [...args])` |
| `toHaveBeenNthCalledWith(n, …args)` | `assert.deepStrictEqual(f.mock.calls[n - 1]?.arguments, [...args])` |
| `expect.assertions(n)` | a counter incremented at each assertion, `assert.equal(count, n)` at the end |

- **Asymmetric matchers** become a plain check of the field they named, then the equality
  over the rest: `expect.any(C)` → `typeof` for a primitive wrapper (Jest's `Any` treats
  `String`, `Number`, `Boolean`, `Function` by `typeof`, Code), else `instanceof`;
  `stringContaining(s)` → `includes`; `stringMatching(re)` → `assert.match` (the same
  RegExp); `objectContaining(o)` → `assertMatchObject`; `arrayContaining(xs)` → each
  element of `xs` found by `isDeepStrictEqual`; `anything()` → `!== undefined && !== null`.
  Inside `toHaveBeenCalledWith`, the call's arguments are taken out and checked the same way.
- A check that needs a type the value does not have (a `.includes` on `unknown`) narrows by
  the value's declared contract, never by a cast (`static first`).

### 3.2 Equality is never loosened

- `toEqual` becomes `deepStrictEqual`, which also checks prototypes and keys whose value is
  `undefined`. Where a moved assertion then fails only for that reason, the expected value
  is corrected to state the exact shape (a key present as `undefined`, a class instance) —
  the assertion becomes stricter, never looser — and the commit names each such
  assertion. No loose-equality helper is added.
- `not.toEqual` becomes `notDeepStrictEqual`, which passes where the two values differ only
  in an `undefined` key or a prototype, where Jest's failed: the negation is weaker. Each of
  the 15 is checked by hand in its commit: where the operands could differ only that way,
  the assertion is rewritten to name the difference it proves (a field, a value).

### 3.3 `describe.each` / `it.each` / `test.each`

- A table becomes a `for … of` loop over the same rows, calling `describe` / `it` once per
  row, in the same order.
- The title is the string Jest rendered: a printf-form title is rendered with
  `node:util`'s `format(template, ...row)`; a `$name` title with the row's field
  interpolated. The plan confirms on each placeholder in use (`%s`, `%i`, `%j`, `%o`, `$…`)
  that the rendered titles equal Jest's, by listing both for the files of each commit.
- The four tagged-template tables become arrays of objects with the same fields.

### 3.4 Hooks, skips and focus

- `beforeAll` → `before`, `afterAll` → `after`; `beforeEach` / `afterEach` unchanged; each
  stays at the level (file or `describe`) where it was.
- `const t = cond ? it : it.skip` stays in that form (`it.skip` exists in node:test).
- A hook is never given `{ timeout }` (the first wave's scan refuses it, Code).

### 3.5 `jest.setTimeout`

Removed with no replacement. The runner imposes no timeout (goal: "A test ends on its
result"). A test that bounded its own work keeps doing so through an `AbortSignal`, as the
first wave's contract has it.

### 3.6 Spies and mock functions

- `jest.fn(impl)` → `mock.fn(impl)`, typed by the contract of the function it stands in for
  (`mock.fn<typeof real>()`); `jest.spyOn(o, 'm')` → `mock.method(o, 'm')` (it calls the
  original until told otherwise, as `spyOn` does).
- `.mockImplementation(f)` / `…Once(f)` → `f.mock.mockImplementation(f)` /
  `mockImplementationOnce(f)`; `mockReturnValue(v)` → an implementation returning `v`;
  `mockResolvedValue(v)` / `mockRejectedValue(e)` → an `async` implementation returning `v`
  / throwing `e`; their `Once` forms through `mockImplementationOnce`.
- `mockClear()` → `f.mock.resetCalls()`; `mockReset()` → `resetCalls()` and the
  implementation set back to what the test's own reset meant (the plan reads each of the
  31); `mockRestore()` → `f.mock.restore()`.
- `f.mock.calls[i]` (Jest: the arguments) → `f.mock.calls[i]?.arguments`; `mock.results[i]`
  → `calls[i]?.result` / `?.error`; `mock.contexts[i]` → `calls[i]?.this`;
  `mock.instances` → the `this` of a constructed call.
- **Restore keeps today's lifetimes.** Jest restores nothing by configuration (Code), so a
  spy lives until the test's own `mockRestore` / `restoreAllMocks`. A spy made in a test body
  uses the test context's `t.mock`, restored when the test ends; a spy that outlives one
  test (made in a hook or at file level) uses the top-level `mock`, and the file's
  `restoreAllMocks` becomes `mock.restoreAll()` in the same hook. No reset is added where the
  Jest file had none, and none is dropped.
- Types: `jest.Mock`, `jest.SpyInstance`, `jest.MockedFunction` → node:test's `Mock<F>`;
  `jest.mocked(x)` → the `Mock` held from where it was made. No cast is added for it.
- **A spy on an export of this repository's own module** (the 8 suites of §1) becomes
  `mock.method` on that module's namespace object, as node:test files already do (§1), and
  stays in the spies wave (owner, 2026-11-18, §10 decision 6). This holds for those 8
  suites only: the 90 module-mock suites go through the injection points of §7.

### 3.7 Fake timers (the spike's results, as decided)

- **Mechanism:** node:test's `mock.timers` with the shared helper of §3.8. Proven by the
  spike on `heldWrite`, `InstanceStateIdle` and `AmdpSession`: they pass, catch the same
  deliberate breakages and are stable across 10 runs (owner's measurement).
- **Faked APIs.** A Jest suite on Jest's defaults fakes `setTimeout`, `setInterval`,
  `setImmediate` and `Date` (the faithful mapping: Jest faked `setImmediate` too, Code). A
  suite with `doNotFake: ['setImmediate', …]` leaves `setImmediate` out of `apis`.
  `nextTick` and `queueMicrotask`, faked by Jest's defaults, cannot be faked by
  `mock.timers` (§1): they run for real; where that changes what a suite observes, the
  suite's commit names it and the assertion is fixed to state what is now proven. A
  deviation from the faithful mapping (a suite that needs `setImmediate` real, as
  `AmdpSession` passed in the spike) is named in its commit.
- **Calls:** `useFakeTimers(opts)` → `mock.timers.enable({ apis, now })`; `useRealTimers()`
  → `mock.timers.reset()`; `advanceTimersByTime(ms)` → `mock.timers.tick(ms)`;
  `advanceTimersByTimeAsync(ms)` and `getTimerCount()` → the helper; `clearAllTimers()` →
  `reset()` then `enable` again with the same options; `runAllTimersAsync()` → the helper's
  run-all (not measured; the plan's first step of the wave measures it on
  `secondStopCredentialRefusal`).
- **`pinCases.ts`** fakes `Date` alone (`apis: ['Date'], now: PIN_EPOCH`) and its three
  random sources with `mock.method`, restored by its returned function as today.
- **`advanceTimers: true`** (decision per suite):
  - `unit/batch/closeWithBatch` runs over an in-memory transport (Code): explicit
    advances — the helper's async advance where Jest's time would have moved.
  - `http/…/shutdown/pooledInstance` (2 cases) and `unit/shutdown/undoFailsLogoff` run a
    real HTTP stand under fake time (Code). They get the helper's **real-time advance**:
    while the awaited work runs, fake time follows real time in small steps, which is what
    sinon's `shouldAdvanceTime` does for Jest (Code). No injected clock is added: S16 is
    not added (owner, 2026-11-18, §10 decision 8).
- **A missed timer fails, it does not hang.** With no runner timeout, a test that awaits a
  promise waiting on a fake timer that never fires would hang. Rule: a promise whose
  settling depends on a fake timer is never awaited directly while the timer may still be
  pending. The test tracks it (`track(p)`, §3.8), advances, and then asserts
  `tracked.settled` before reading its value; an unsettled promise fails the assertion at
  once. The runner still imposes no timeout. The debugger fakes' `until` keeps its bound
  (100 advances, then it throws), so it fails rather than hangs (Code).
- **The debugger directory** moves together (13 suites share `fakes.ts`, owner); the cast
  the spike put in `fakes.ts` is not taken: `fakes.ts` imports the helper's advance, typed by
  its contract.

### 3.8 The shared test helpers and their contracts

Each lives under `src/__tests__/helpers/` (names open to the plan), imports only `node:test`,
`node:assert` and `node:util`, and has a test of its own that proves each clause below —
each clause by a case that fails when the clause is broken.

- **`assertMatchObject(actual, expected)`** — Jest's `toMatchObject`:
  - `expected` a plain object: `actual` is a non-null object, and every own enumerable key
    of `expected` is *present* in `actual` (`key in actual`, prototype chain included), its
    value matching recursively; keys of `actual` not in `expected` are ignored;
  - `expected` an array: `actual` is an array of the same length, matched element by
    element;
  - `expected` a `Date` or `RegExp`: equal by value; any other non-plain object: by
    `isDeepStrictEqual`;
  - a primitive: `Object.is`;
  - a failure is an `AssertionError` naming the path (`$.a[2].b`) and both values.
- **`assertThrows(fn, expected?)`** — Jest's `toThrow`; returns the thrown value. It calls
  `fn`; no throw fails. The value's message is its `message` when that is a string, else
  `String(value)`. `expected`: absent — any throw; a string — the message includes it; a
  RegExp — `expected.test(message)`, never `String(error)`; a class — `instanceof`; an
  `Error` object — equal messages. It never hands a RegExp or a string to `assert.throws`.
- **`assertRejects(promise, expected?)`** — Jest's `.rejects.toThrow`; returns the reason. A
  fulfilment fails; a reason that is not an `Error` fails (as Jest's, §1); `expected` as for
  `assertThrows`.
- **`rejectionOf(promise)`** — Jest's bare `.rejects`: the reason, whatever it is; a
  fulfilment fails.
- **`messageOf(value)`** — the message rule above, shared by the three.
- **The fake-timer helper** (from the spike, kept as measured, without its cast):
  - `useFakeTimers({ apis, now? })` / `useRealTimers()` over `mock.timers`;
  - `getTimerCount()` — timers scheduled through the faked globals and not yet fired or
    cleared, counted by wrapping those globals; blind to `node:timers` imports, which no
    production code uses (Measured, §1) — a guard test keeps it so (a production import of
    `node:timers` fails it);
  - `advanceTimersByTimeAsync(ms)` — one real macrotask turn, then time stepped to `ms`
    with a real turn after each step, then a turn; the turn uses the real `setImmediate`,
    held by the helper from before any `enable`, so it works with `setImmediate` faked;
  - `runAllTimersAsync()` — turns and `runAll()` until no timer is pending, failing after
    the loop limit Jest uses (100 000) instead of looping forever;
  - the real-time advance (if chosen, §3.7) — while `work` runs, fake time follows real
    time in fixed steps through a real, unreferenced interval, stopped when `work` settles;
  - `track(promise)` — `{ settled, value, error }` read without awaiting; reading `value`
    of an unsettled or rejected promise fails.
  The spike's 1 ms stepping makes a long advance cost one real turn per fake millisecond
  (Inference: an hour is 3.6 M turns); the plan measures the cost on the slowest suite and
  may step to the next due timer instead, provided the measured soundness holds.
- No other helper is added without the plan naming it and its contract.

## 4. The runner list and its guard

- **During the move.** The list stays the one partition (first wave, owner decision 1).
  Each commit that moves files adds them to the list; Jest's ignores follow from the list
  (`jest.config.js`, Code); the partition guard (`unit/runner/partition.test.ts`) keeps
  refusing a file on both runners, on neither, or a listed path with no file. `npm test`
  keeps running both runners (`tools/npm-test.mjs`). The coverage guard keeps reading the
  union of Jest's `listTests` and the list (Code), so a pin is found on either side while
  the pin group moves.
- **The test build** compiles every listed file and what it imports (Code); a moved file
  that still reaches a Jest global fails the build (`types: ["node"]`, Code). So a helper
  moved too early, or a missed `expect`, cannot pass.
- **At the end** every test file is on node:test, and the list and its guard go:
  - the runner selects every `….test.ts` under the `__tests__` directories of the 18 roots
    (Jest's `testMatch` and `roots`, Code), found by a directory walk, minus the live
    directories (selected only under a live script, as today) and the runs of their own
    (`tools/separate-runs.json`, as today);
  - one guard replaces the partition guard: the runner's selection (its `--list`) plus the
    live files plus the separate runs equals `git ls-files '*.test.ts'`, and no test file
    lies outside a root's `__tests__`;
  - every other tool that reads the list (the build, the coverage guard, `separateRuns`,
    the live-run selection) reads the runner's selection instead, never a pattern of its own
    (the first wave's rule).

## 5. The end state

- **Manifests:** `jest`, `ts-jest`, `jest-util` and `@types/jest` gone from the root
  `package.json`; `@types/jest` gone from the six sub-packages that have it. `jest` gone from
  every `tsconfig.test.json` `types`.
- **Configuration and tools:** `jest.config.js` gone, and with it the mapper copy of the
  name table (the resolve hook and `paths` keep `tsconfig.paths.json` as the one table);
  `tools/npm-test.mjs` gone; `tools/node-test-files.json` and its guard gone (§4); the
  runner's tests that test Jest (`unit/runner/jestWorkers`, the Jest half of
  `listAndTable`, `npmTest`, the Jest half of `separateRuns`, the coverage guard's `listTests`
  discovery) removed or reduced to the runner alone.
- **The ledger scan** (`unit/coverage/ledgerScan.ts`) drops its recognition of Jest's
  globals and the fixtures that exist only for Jest forms (`live-xit`, `live-xtest`,
  `pin-xdescribe`, and any other the plan finds), since a Jest global no longer compiles;
  its node:test forms and their fixtures stay (owner, 2026-11-18, §10 decision 14).
- **npm scripts:** `test` = the build, then the runner with `--concurrency 2`; the
  sub-packages' `test` = `npm --prefix .. test -- --root <package>/src` (the runner's
  option); `test:check` unchanged. No shell prefix (goal).
- **CI and release:** the same steps; their comments that name Jest (the roots, the
  workers, the macOS crash note) say what runs now. `npm test -- --concurrency <N>` per cell
  stays. The branch rulesets' required checks keep their job names (no job is renamed).
- **Lockfile:** regenerated by `npm install` after the manifest change, never edited by
  hand; afterwards no `"link": true`, no Jest package, everything resolved from the npm
  registry; `npm ci --ignore-scripts` and the audit gate pass.
- **Other files:** `.npmignore` / `.dockerignore` entries for `jest.config.js` and
  `jest.setup.js` go; `.vscode/launch.json`'s Jest configuration is replaced by one for the
  runner; comments in `src` that name Jest as the runner (e.g. `src/lib/utils.ts`) say
  node:test.
- **Docs:** `docs/development/tests/TESTING_GUIDE.md`, `src/__tests__/integration/README.md`,
  `README.md` and `docs/deployment/GITHUB_ACTIONS.md` describe the node:test run, the
  conversion rules a contributor needs (§3, by reference) and the helpers; a new CHANGELOG
  entry. Released documents (`docs/MIGRATION-24.0.md`, earlier CHANGELOG entries) are not
  rewritten. No consumer migration note: no published contract changes (goal, out of scope).
- **This spec and the goal** are deleted before the release that ships the work.

## 6. The live guarantees through the move

Every live file and the live machinery are on node:test already (Measured, §1), so no
guarantee has a Jest variant. For each:

- **`liveSuite`** (`integration/helpers/live.ts`): unchanged; no moved file is a live file.
  At the end, its selection comes from the runner's walk (§4), still only under a live
  script, still refused outside one (`liveScripts` and the runner's tests keep proving it).
- **The coverage ledger:** the guard reads every live file's `liveCall`s and the pins. The
  pins move (the pin group, fake-timer wave): after each pin commit the guard passes with
  the same key → pin and key → live case map as before the commit (§8); the plan compares
  the guard's computed maps, not only its pass. At the end the guard reads the runner's
  selection (§4).
- **The run report:** written only by the node:test ledger reporter; unchanged.
- **Required keys:** checked by the teardown the runner runs after a live script;
  unchanged. A Jest run never was a live run.
- **The credential-refusal stop:** the marker, `refuseAfterMarker` and the guarded
  connections are in the live helpers and the run directory; unchanged.
- **The unit run reaches no outside service:** each moved file stays in the unit run, which
  must reach nothing. A seam (§7) whose fake is bypassed must not silently reach a real host:
  every fake connection keeps answering for `.invalid` hosts, and the plan's mutation of a
  seam (§8) shows the bypass fails the test rather than leaving the machine.

## 7. The injection points, for the owner

**Nothing below is added before the owner approves it, item by item.** The owner's
decisions of 2026-11-18 (§10) approve S1 (option B), S2, S2b, S2c, S5 (both halves), S9,
S10, S11, S12 and S14; S15 is approved only if the plan's measurement shows it necessary;
S16 is not added. S3, S4, S6, S7, S8 and S13 were not part of those decisions and still
wait for the owner's approval before their commits. Each is typed by the
real module's contract, defaults to the real module, and adds no cast, `any`, `!` or
`ts-ignore` in production. The plan confirms, before a seam's commit, that each suite named
reaches the production site named (by a deliberate break of the seam, §8). Where a suite can
prove the same without a seam, that is offered as the alternative.

| # | Status | Production file / function | Parameter or option | Type | Default | Suites |
|---|---|---|---|---|---|---|
| S1 | approved | `src/lib/clients.ts` — `adtClientOf`, `createAdtClient`, `createOnPremAdtClient`, `createOnPremExecutor`, `variantOf` | **(B)**, chosen: clients supplied for one connection, read by `adtClientOf` before building (option (A), a `HandlerContext.adtClients?` field read at each call site, not taken) | `ServerAdtClient` (and the executor's type) keyed by the connection object | the real functions | the 40 of Appendix A, `lib/clients` |
| S2 | approved | `src/embeddable/BaseMcpServer.ts` — `connectedLogon`, `resumedSession`, `logoffLeftover` | option `connectionFactory?` of the server's options, passed through by the stdio, HTTP and SSE servers | `typeof createAbapConnection` | `createAbapConnection` | the 20 of Appendix A, `connectionFactory`, less those S2b/S2c serve alone |
| S2b | approved | `src/lib/packageSessions.ts` — `openFreshConnection` | the factory that built the original, carried in its `ConnectionRecord` (`siblingRecordOf`), so a sibling is built by the same factory | `typeof createAbapConnection` | `createAbapConnection` | `unit/packageSessions`, `unit/connectionEnds`, `unit/batch/*` that mock `siblingRecordOf` |
| S2c | approved | `src/lib/utils.ts` — `setConfigOverride`, the fallback of `getManagedConnection` | an optional last parameter of `setConfigOverride`, kept for the cache's rebuilds | `typeof createAbapConnection` | `createAbapConnection` | `unit/connectionEnds` |
| S3 | awaiting approval | `src/lib/clients.ts` — new `runtimeClientOf`, `executorOf`; the 13 handler files that do `new AdtRuntimeClient(…)` and the 7 that do `new AdtExecutor(…)` (`src/lib/debugger/ports.ts`, `handlers/unit_test/shared/*`, …) call them | served by S1 (B) | `(connection, logger?) => AdtRuntimeClient` / `AdtExecutor` | the real constructors | `atcTools`, `dumpFeedPagingAndFilters`, `runtimeReadersFixRound1`, `runtimeProfiling`, `staticSequences`, `readonlySingleCall` (its `runTests.testRunner` mock) |
| S4 | awaiting approval | `src/lib/clients.ts` — `adtClientOf` | an optional parameter: the client classes it builds from | `{ onprem: typeof AdtClientOnPrem; cloud: typeof AdtClientCloud }` | the shipped classes | `masterLanguageHeaderLeak`, `responsibleRequestScope`, `responsible-rules/…/requestSystemResolution` (all read the options a client was constructed with) |
| S5 | approved | `src/lib/requestSystemResolution.ts` (caller of `readSystemInformation`) and `src/handlers/system/readonly/handleGetServiceBindingPreviewUrl.ts` (caller of adt-clients' `getSystemInformation`) | an option of the resolution, and of the handler's context | `typeof readSystemInformation` / `typeof getSystemInformation` | the real functions | `systemContextRequired` (2), `requestSystemResolution`, `embeddable/connectionContext`, `serviceBindingPreviewUrl` |
| S6 | awaiting approval | `server-runtime/src/stdio/auth/brokerFactory.ts` — the `new AuthBroker(…)` site | `IAuthBrokerFactoryConfig.createBroker?` | `(...args: ConstructorParameters<typeof AuthBroker>) => AuthBroker` | `(...a) => new AuthBroker(...a)` | the 5 `auth-broker` suites |
| S7 | awaiting approval | `server-runtime/src/stdio/auth/browser.ts` — the browser factories it calls | an option of the browser choice, reached from the launcher's options | the factories' own types (`typeof linuxDefaultBrowser`, …) | auth-providers' factories | `stdio/…/launcherDestination` |
| S8 | awaiting approval | `src/lib/connectionFactory.ts` — `createAbapConnection` | none: the spec handed to `createConnection` is extracted into a pure exported function the tests call directly; the chain test uses S2 with a factory that records the settings | — | — | `config/rfcMessageServer`, `rfcWireLogging`, `stdio/…/rfcMessageServerChain` |
| S9 | approved | `src/lib/httpTransport/headerSource.ts` — its `credentialFromHeaders` call | an option of the header source | `typeof credentialFromHeaders` | the real function | `http/…/cancel/cancelBeforeTool`, `sse/…/cancel/cancelBeforeTool`, `embeddable/connectionContext` |
| S10 | approved | the handler entries of the compact routers and the read-only group (where `handleSearchSource`, `handleActivateObjectOnce` and the read handlers are bound) | an option of the group: the handler functions it binds | the handlers' own types | the real handlers | `searchStrategies` (3), `strategyRoutesServed`, `compactActivateTypes`, `compactSearchData` |
| S11 | approved | `src/handlers/system/readonly/handleSearchSource.ts` — its `runSearchSourceWithContext` call | an option of the handler's context | `typeof runSearchSourceWithContext` | the real function | `searchSourceRfc` |
| S12 | approved | `src/handlers/package/high/handleDeletePackage.ts` — its `openFreshConnection`, `closeQuietly` and `answer` calls | S2b for the connection; `answer` left real | — | — | `deletePackageSchema` |
| S13 | awaiting approval | `src/lib/instance.ts` — the label computed at load | the label as a pure exported function of an `isSea` | `() => boolean` | `node:sea`'s `isSea` | `libInstance` |
| S14 | approved | `server-runtime/src/{http,sse,stdio}` servers' fallback version | a constructor option of the runtime classes: the version answered when none is given; the http, sse and server classes pass their own (§10 decision 9) | `string` | the runtime's `RUNTIME_VERSION` | `http`, `server`, `sse` `exports` |
| S15 | approved if measured necessary | the stdio server's output stream | option `stdout?`, only if the plan measures that spying on `process.stdout.write` disturbs the runner (§9) | `NodeJS.WritableStream` | `process.stdout` | the 7 suites of §1, "Process output" |
| S16 | **not added** | `src/lib/state/InstanceState.ts` — the idle timer (`setTimeout` at line 269) | not added: the real-time advance helper serves these suites (§3.7, §10 decision 8) | `Pick<typeof globalThis, 'setTimeout' \| 'clearTimeout'>` | `globalThis` | `pooledInstance`, `undoFailsLogoff` |

- **No seam:** `unit/coverage/realmCheckUrl` mocks a test helper (`integration/helpers/
  realmCheck`), not production; its parameter is added there freely. `freshConnection`
  goes through S2: the factory records the credential it is handed, and the suite proves the
  same credential object is reused, instead of "no provider constructed" — a change of what
  is observed, named in its commit. No credential-construction seam (§10 decision 10).
- **S1 is option (B)** (§10 decision 7): no call site changes; one module, one lookup keyed
  by the connection object the test owns. Option (A) would have changed 289 call sites in
  217 files (Measured).
- **Own-module exports.** A `mock.method` on an export of this repository's own module is a
  spy only in the 8 spies suites (§3.6); the 90 module-mock suites use the seams above,
  S1, S2, S2b, S2c, S5, S9–S12 included, even where the function replaced is this
  repository's own (§10 decision 6).

## 8. Proving nothing is weakened

- **Counts.** For every moved file: its test count and its title list before (Jest's
  `--json` result at the parent commit) and after (the node:test reporter at the commit) are
  equal; a difference is named and explained in the commit. A wave's PR comment lists the
  totals.
- **Mutation sampling, per commit.** For each moved file, at least one assertion of each
  row of §3.1 it uses and each helper it calls is broken deliberately — by changing the
  production behaviour it pins, or its expected value — and the plan records that the Jest
  version (at the parent commit) and the node:test version both go red, then reverts. Each
  fake-timer suite also gets the spike's breakage: the timing it pins changed (a bound
  shortened, a timer left uncleared) — red on both. Each seam's suites: the seam bypassed
  (the default used) — red, and nothing reaches outside the machine (§6).
- **Each half separately.** A compound assertion (two fields, a presence and a value) is
  broken one half at a time, and a mutation asserts its own failure words, so a shared
  failure message cannot hide a deleted check.
- **Pins:** after each pin commit the coverage guard's computed key → pin map equals the
  map before (§6).
- **The equality changes of §3.2** are listed per commit: each `toEqual` that needed a
  stricter expected value, and each `not.toEqual` rewritten.
- **A test found to prove nothing** — it passes with the behaviour it names deleted, under
  Jest as well — is fixed in the commit that moves it, and named in the commit message and in
  the PR's list. It is not moved as it was.

## 9. Risks, and what is left to the plan

- **Scale.** About 13.3 k `expect` calls and 868 `.each` tables (Measured). Most of the cost
  is §3.1; mechanical errors are what §8 catches.
- **Real `nextTick` and `queueMicrotask`.** Jest's defaults faked them (Code); `mock.timers`
  cannot (Inference). A suite that observed "not yet" before an advance may now see "already".
  Found by §8, fixed per suite and named.
- **Unhandled rejections now seen.** Jest's sandbox hid them (Code: `helpers/plainNode.ts`
  says so, measured there); node:test reports them. A moved file may fail on a latent
  unhandled rejection: a defect found, fixed in that commit, named.
- **stdout under process isolation.** A file's process may report to the runner through
  stdout (Inference); a spy on `process.stdout.write` may then see or swallow the runner's
  writes. The plan measures on one of the 7 suites before their commit; S15 only if needed.
- **`advanceTimers: true` over real HTTP** (§3.7): the real-time advance is not measured
  yet; the plan measures it first. S16 is not added (§10 decision 8): if the helper falls
  short, that goes back to the owner.
- **`runAllTimersAsync`:** not measured (owner); the helper's loop is measured first.
- **The async advance's cost** (§3.8): measured on the slowest suite.
- **`deepStrictEqual` failures** where `toEqual` passed (§3.2): count unknown until the
  plain wave runs (Inference: many expected literals omit `undefined` keys).
- **Spies on own-module exports** depend on tsc's CommonJS emit (Inference), already relied
  on by node:test files (Code); if the build's module setting changed, they would stop
  replacing. Out of this task; named so a future ESM move knows.
- **`helpers/plainNode.ts` runs scenarios through `tsx`** (Code), not the test build. It is
  not a Jest dependency and is kept as is; whether node:test makes it unnecessary is not
  this task's (it would change what `closeWithBatch` and `plainNode.test` prove).
- **Left to the plan:** the commit list and the files in each; the measurements named above
  (`nextTick` effects, stdout, real-time advance, run-all, advance cost, the each-title
  rendering, `mock.timers` APIs on every CI Node version); which suites reach which seam
  site; the reading of each `mockReset` and each `not.toEqual`; the fixtures the ledger
  scan loses; the walk's exact selection and its guard; the docs' wording.

## 10. Decisions

**The owner's decisions** (binding, given for this task):

1. A module mock is replaced by a typed injection point — a parameter or an option
   defaulting to the real module — never `mock.module`; each is listed for the owner before
   it is added (§7).
2. Fake timers move to node:test's `mock.timers` with one shared helper for
   `getTimerCount` and the async advance (§3.7, §3.8), as the spike measured.
3. A missed timer must fail, not hang; the runner imposes no timeout (§3.7).
4. The debugger directory moves together (§3.7).
5. The spike's cast in `fakes.ts` is not taken (§3.7).

**The owner's decisions on the spec's questions** (2026-11-18, binding; each is the spec's
own proposal):

6. **Own-module exports.** A `mock.method` on an export of this repository's own module
   counts as a spy only in the 8 spies suites (§3.6). The 90 module-mock suites go through
   typed injection points: S1, S2, S2b, S2c, S9–S12, and S5's `readSystemInformation` (§7).
7. **S1 is option (B):** clients supplied per connection object, so only one module changes
   (§7).
8. **`advanceTimers: true` over real HTTP** (`pooledInstance`, `undoFailsLogoff`): a test
   helper that advances fake time with real time (§3.7, §3.8). `closeWithBatch` gets explicit
   advances. S16, the injected clock, is not added.
9. **The `exports` suites** get the seam S14: a constructor option for the version (§7).
10. **`freshConnection`** goes through S2: the test proves the same credential object is
    reused. No separate credential seam (§7).
11. **S5 and S10 are seams**, not answers on the wire (§7).
12. **Equality** (§3.2): `toEqual` becomes `deepStrictEqual`, with expected values tightened
    where needed; each `not.toEqual` is checked by hand. No loose-equality helper.
13. **S15** (stdout) is added only if the plan measures it necessary (§7, §9).
14. **The ledger scan's Jest forms** are removed at the end, with their Jest-only fixtures
    (§5).

**Still open:** the seams S3, S4, S6, S7, S8 and S13 (§7) were not part of these decisions;
each waits for the owner's approval before its commit.

**This spec's own decisions**, for the review to check:

- The wave order plain < spies < fake timers < module mocks, by the hardest API a file
  reaches (§2.1, §2.3).
- `batchEnvelope.ts` made runner-neutral first; `pinCases.ts`, `fakes.ts` and
  `batchStand.ts` move with their importers (§2.2).
- The matcher table, the asymmetric-matcher rule and the rejection rule (§3.1, §3.8): a
  RegExp is tested against the message only, as Jest did.
- Faithful fake-timer mapping, deviations named (§3.7).
- At the end, discovery by a walk of the 18 roots with one guard against `git ls-files`
  (§4).
- Mutation sampling per commit on both versions, and count parity per file (§8).

## Appendix A. Module-mock suites by target

Paths relative to `src/__tests__/` unless they start with a package directory; `…` is
`__tests__`.

- **`src/lib/clients` (40):** `lib/search-source/packageResolver`; `unit/`
  `activateObjectCarriesUri`, `activateObjectTypeCodes`, `authRefusedRejection`,
  `checkDefaultsToActive`, `commonLowOperations`, `ddlxCheckVersion`, `deletePackageSchema`,
  `detailSurface`, `documentPatchHandlers`, `domainHigh`, `domainLow`, `failureStep`,
  `functionGroupHigh`, `handleCreateServiceDefinition`, `handleGetIncludesList`,
  `handleGetStructuresListAppends`, `handleGetTransaction`, `handleGetWhereUsedFilters`,
  `handleMessageClass`, `handleObjectVersions`, `highTierDeletes`, `highTierLocking`,
  `highTierWaitOrder`, `highTierWriteChannel`, `highTierWrites`, `leftLocked`,
  `lowTierStrategies`, `objectVersionDiff`, `objectVersionToolsHigh`, `readToolFailures`,
  `readTools/getPartMapping`, `readonlySingleCall`, `runtimeReadersFixRound1`,
  `serviceBindingPreviewUrl`, `sqlPreview`, `staticSequences`, `transportObjectTools`,
  `transportSearch`, `unlockRefusal`.
- **`src/lib/connectionFactory` (20):** `server-runtime/src/http/…/systemContextOrder`,
  `server-runtime/src/sse/…/systemContextOrder`, `server-runtime/src/stdio/…/stdioSource`;
  `unit/batch/` `batchAnswers`, `batchEnd`, `closeWithBatch`, `declaredKindRecorded`,
  `noRetry`, `oneEnvelope`, `surface`, `transportCreates`; `unit/` `closedLogon`,
  `connectionEnds`, `embeddable/connectionContext`, `embeddable/connectionSource`,
  `embeddable/dispose`, `freshConnection`, `leftoverSessions/rfcKeepsNoFile`,
  `packageSessions`, `state/longSession`.
- **`@mcp-abap-adt/adt-clients` (9):** `responsible-rules/src/…/requestSystemResolution`;
  `unit/` `atcTools`, `dumpFeedPagingAndFilters`, `masterLanguageHeaderLeak`,
  `responsibleRequestScope`, `runtimeProfiling`, `runtimeReadersFixRound1`,
  `serviceBindingPreviewUrl`, `staticSequences`.
- **`@mcp-abap-adt/auth-broker` (5):** `server-runtime/src/stdio/…/` `auth/brokerFactory`,
  `auth/brokerOptions`, `auth/jwtNoneLeavesStdio`, `debug/authDebugSource`,
  `launcherDestination`.
- **`src/lib/systemInformation` (4):** `responsible-rules/src/…/requestSystemResolution`,
  `responsible-rules/src/…/systemContextRequired`, `unit/embeddable/connectionContext`,
  `unit/systemContextRequired`.
- **`src/handlers/system/readonly/handleSearchSource` (4):**
  `server-runtime/src/{http,sse,stdio}/…/searchStrategies`,
  `unit/searchSource/strategyRoutesServed`.
- **`server-runtime/src/runtimeVersion` (3):** `http/src/…/exports`, `server/src/…/exports`,
  `sse/src/…/exports`.
- **`src/lib/credentialSources` (3):** `server-runtime/src/{http,sse}/…/cancel/cancelBeforeTool`,
  `unit/embeddable/connectionContext`.
- **`@mcp-abap-adt/connection` (3):** `server-runtime/src/stdio/…/rfcMessageServerChain`,
  `unit/config/rfcMessageServer`, `unit/rfcWireLogging`.
- **`@mcp-abap-adt/auth-providers` (2):** `server-runtime/src/stdio/…/launcherDestination`,
  `unit/freshConnection`.
- **One each:** `@mcp-abap-adt/lib/handlers/write` — `compact-modify/src/…/compactActivateTypes`;
  `@mcp-abap-adt/lib/handlers/read` — `compact-readonly-entries/src/…/compactSearchData`;
  `src/lib/packageSessions` and `src/lib/answer` — `unit/deletePackageSchema`;
  `src/handlers/unit_test/shared/runTests` — `unit/readonlySingleCall`;
  `src/lib/search-source/orchestrator` — `unit/searchSourceRfc`; `node:sea` —
  `unit/libInstance`; `integration/helpers/realmCheck` (a test helper) —
  `unit/coverage/realmCheckUrl`.
