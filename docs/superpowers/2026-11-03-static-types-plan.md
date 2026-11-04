# Plan: static types in the server's production code

Goal: `2026-11-03-static-types-goal.md`. Spec: `2026-11-03-static-types-spec.md`. The spec
binds, and each step names the spec section it carries out. Every step ends green:
- build, test:check and the root `npm test`;
- every package's `lint:check` and `test:check`.

## Baseline

1. **Capture fixtures before any change** (spec §2, §7). Commit them before anything else:
   - every tool's listed JSON schema, per binary variant (`tools/list` of each of the twelve
     bins);
   - `tool-search.json`.
2. **Count the implicit `any`.**
   - Switch `noImplicitAny` on locally, record the error count per package and file, then
     switch it back.
   - The list goes into this plan as an appendix. It is the scope of step 12.
3. **List the undeclared keys.** Find every target handler that reads a key its own schema
   does not declare (spec §3), and add each to the appendix.

## Tool arguments (spec §2)

4. **Prove the typing in a typecheck** (`__typechecks__`), in this order:
   1. a zod `inputSchema`;
   2. `defineTool` answering an entry whose `call` takes `ToolArgs`;
   3. the entry registering on the SDK, the callback's arguments typed `z.output`;
   4. that output after `.extend` (state handle) and `.omit` (`background`, `timeout`).

   **Decision point:**
   - If item 4 holds, the SDK's parse is the only one.
   - If not, the closure parses with the entry's schema. Measure the batch timing test before
     and after.

   Record the outcome in this plan.

   **Outcome** (measured 2026-11-03 with zod 4.6.7, `@modelcontextprotocol/sdk` 1.32.1,
   TypeScript 6.0.3; `src/__tests__/typecheck/toolArgs.typecheck.ts`, compiled by `test:check`):
   - **1 holds.** `z.output` of a `z.object` is the argument type, not `any`.
   - **2 holds.** `defineTool<S extends z.ZodObject>(definition, handler)` answers an entry whose
     `call(context, args: Readonly<Record<string, unknown>>)` parses with
     `definition.inputSchema.safeParse(args)`: its `data` is typed `z.output<S>` inside the generic
     closure, so the handler is called with no cast. Entries of different argument types share one
     `HandlerEntry[]`, and a handler of another schema, or of a wrong argument type, is refused.
   - **3 holds for a schema of a known type, not inside a generic `defineTool`.** With a concrete
     schema, `registerTool`'s callback gets `z.output` of it, typed. With the generic `S`, the
     callback is refused: `error TS2345: Argument of type '(args: z.output<S>) => Promise<…>' is
     not assignable to parameter of type 'BaseToolCallback<…>'` (the SDK's `ToolCallback<S>` is a
     conditional type left unresolved for a generic `S`); unannotated, `args` is
     `Record<string, unknown>` and `handler(context, args)` is refused: `Argument of type
     'Record<string, unknown>' is not assignable to parameter of type 'output<S>'`.
   - **4 holds for a schema of a known type, not for a generic one.** Concrete: the output after
     `.extend({ state_handle })`, `.omit({ background, timeout })` and both reaches the handler typed
     (`state_handle` taken out by destructuring). Generic: after `.extend` the rest is
     `{ [x: string]: unknown; }` and after `.omit` `Record<string, unknown>`, each refused as the
     handler's argument: `error TS2345: Argument of type '{ [x: string]: unknown; }' is not
     assignable to parameter of type 'output<S>'`. A generic `.omit` also takes a key the schema
     does not have, unchecked; a concrete one refuses it (`TS2353`).
   - **What compiles for the registry:** the entry's schema held as `z.ZodObject`, edited by
     `.extend` / `.omit` as `z.ZodObject`, registered with a callback whose `args` (a record of
     unknown values, not `any`) go to `entry.call`, which parses with the entry's own schema.

   **Decision (per the decision point above):** item 4 does not hold for the generic entry, so the
   closure parses with the entry's schema: the SDK parses with the listed schema, `call` parses
   again. The batch timing test is to be measured before and after (step 5).

   **Timing of the second parse** (steps 5–7):
   - The batch timing test (`src/__tests__/integration/batch/batchedReadsTiming.test.ts`) is an
     integration test on a SAP system; it was not run, before or after. It calls the handlers
     directly, not an entry's `call`, so it would not time the second parse either.
   - Measured instead (2026-11-03, the worktree's `dist` after step 7, node, mean of 20 000
     `safeParse` calls after 2 000 warm-up ones): `GetClass` 0.20 µs, `CreateTableType` 0.45 µs,
     compact `HandlerGet` 1.23 µs per call. Before step 7 a call had no second parse (0 µs).
5. **Change the contract.**
   - The new `ToolDefinition`, `HandlerEntry` and `defineTool`, and `registerTool` taking an
     entry.
   - Remove `ArgsOnlyHandler`, `isArgsOnly`, `callInItsForm` and the context swapping.
   - Rewrite the variant projections, `withStateHandle` / `withoutStateHandle`,
     `withoutBackground` / `withoutTimeout`, the docs generator and the tool-search generator
     over zod (`z.toJSONSchema`).
6. **Migrate the 325 definitions to zod, by handler directory.**
   - Each directory is one commit.
   - The listed-schema fixture of step 1 must match after each. A difference is fixed in the
     migration, not in the fixture.
7. **Register every group through `defineTool`.** ReadOnly, System, HighLevel and the low
   groups pass their context at the call. Delete `jsonSchemaToZod`, `shapeOf`, `typeOf` and
   `ArgsOf`.

## Compact (spec §3)

8. **Tests first, one per refused case.** For each compact read, part and write route, a
   wrong-typed argument that passes today is refused with the schema's words. An undeclared
   key from step 3 is declared in its schema first.
9. **Each compact read and part route becomes the target entry's `call`.** The write handlers
   take their typed arguments and call the target's `call`. Remove the `as never`.

## The rest (spec §4)

10. **`IAdtResponse`.**
    - Typed literals and narrowing everywhere.
    - The server's `StepError` as `TError`.
    - `IAnalyse<any>` becomes `IAnalyse`.
    - `CheckedDeletable` and `IAdtVersionable` take their bound types.
11. **XML reader module** `src/lib/xml/tree.ts`.
    - Tests first, over corpus documents, for each predicate.
    - Move every reader onto it, by strategy file.
12. **Implicit and explicit `any`**, by package, from step 2's list:
    - `catch (error)` as `unknown` through the failure readers;
    - the logger types;
    - `@types/express` and the express-typed exports;
    - index reads as tuples or checked reads;
    - the two `@ts-expect-error`;
    - `scripts/`.
13. **Delete the `canRefreshToken` and `__debugId` branches.**

## The gate (spec §5)

14. **The Jest source scan, with its fixtures.**
    - One fixture per refusal: assertion, `any`, `!`, `@ts-ignore`, `@ts-expect-error`,
      `biome-ignore`.
    - `as const` and test files stay allowed.
    - It must pass on the code as it is now.
15. **Switch the rest on.**
    - Remove `noImplicitAny: false` from every `tsconfig`.
    - Biome: pin it exactly, set the three rules as errors on every production directory and
      `scripts`, and widen `lint:check` and the build's check to the same directories.
16. **Prove the gate is load-bearing.** Put one `as unknown as`, one `any` and one
    `@ts-expect-error` back. Watch the scan, Biome and `tsc` go red, then revert.

## Release

17. **Version 24.0.0 for every package.**
    - `MIGRATION-24.0.md` (spec §6).
    - CHANGELOG with the fixes of §3 in their own lines.
    - README and `docs/` wherever a handler, a definition or `registerTool` is shown.
    - `npm run docs:tools`.
## Test coverage (spec §8)

The stage runs after step 17 and before step 18. It is written as tasks C1–C16, each with its
own steps. The owner's decisions are recorded at the end of this section ("Owner's decisions
and open items") and applied in the tasks; none is still open.

**Global constraints.** Every task's requirements include these:
- **Commands.** npm scripts only. Never `npx`, `npm exec`, `node_modules/.bin` or `ts-node`.
- **Integration runs: two kinds, each by its npm script.**
  - **Targeted (a family, C3–C16):** `npm run test:coverage-family -- <live file>`, a new
    script with `test:integration`'s flags. Its `globalTeardown` checks only the keys of the
    files that ran (spec §8, acceptance 3); the rest of the ledger is not required.
  - **Full acceptance (step 18 only):** `npm run test:integration`. Its `globalTeardown`
    requires every key the ledger requires on that system.
  - The teardown tells them apart by the running script's name (`npm_lifecycle_event`), so no
    flag or variable chooses the scope.
  - Name the files with `--listTests` first. Never add `--testPathPatterns` /
    `--testPathIgnorePatterns`: they replace the script's own.
  - Never pipe a run through `tee` or anything else that replaces Jest's exit status; redirect
    the output to a file instead (`> <log> 2>&1`).
  - Ask the owner before any run that reaches a SAP system.
  - Before a run that may log on through a browser, ask which browser and profile to use, and
    wait for "ready".
- **Test code.** No regex. No built-in timeout or retry. No cast: the static-types scan applies
  to the new helpers' production-style code, and tests add none.
- **Committed text.** Tool descriptions stay functional. No system name, system id, transport
  number or user name in a committed file.
- **Every task ends green,** except the guard test of C1. It is red from C1 until C16 lands and
  lists the keys still missing (O1, decided). Each family is pushed as it lands. Green means:
  - build, `npm run test:check` and the root `npm test`;
  - every package's `lint:check` and `test:check`.
- **Expected request literals** come from running the code on the stand-in. They are reviewed
  in the diff against the corpus (`tests/fixtures/adt/`) and the ADT contract. There is no
  freezing harness.
- **A defect a pin or a live case shows is fixed in this PR,** in this order: a failing test
  first, then the fix, then a CHANGELOG line (spec §8, acceptance 4).

**Review focus.**
1. A pin recorded from wrong code becomes the expected value. Read every literal in the diff
   against the corpus answer of the same endpoint, before accepting it.
2. Onprem and cloud take different code. A key that requires both systems needs one pin per
   variant, not one shared case. The guard checks the `variant` field against the key's
   required kinds.
3. A live case can pass while asserting nothing: a call that answers `isError: false` on a
   no-op. Each live case reads its effect back.
4. A config section missing from the owner's file makes its suites skip. The run report and
   `globalTeardown` (C2) turn such a skip into a failure.
5. Cleanup can touch objects a person owns.
   - Each name is read before its create; a name that already exists fails the case.
   - Cleanup deletes only recorded names.
   - C1's `live.ts` tests prove that a name which already existed is never deleted.

**Every family task (C3–C16) follows the same steps.** A task lists only its own files, keys
and live specifics.
- [ ] **Write the pin rows red.** Add the family's `pinCases` rows with `expected: []`. Run
  `npm test -- <unit file>`. It fails: `pinCases` refuses an empty `expected` and prints the
  recorded requests.
- [ ] **Fill the literals.** Fill each `expected` from that run, then review each request
  against the corpus. A request that is wrong is a defect: its own failing test, the fix, a
  CHANGELOG line.
- [ ] **Run green.** Run `npm test -- <unit file>`: PASS.
- [ ] **Write the live cases.** Use `liveSuite`, an awaited `liveCall` per step in the test
  body, and `expectAbsent` / `expectCleared` after a delete, plus the family's template section
  (`enabled: true`, `available_in` as the keys require). Every prerequisite the task names is
  created by the test and recorded (`recordCreated`) before the call under test. Run
  `npm run test:coverage-family -- <live file>` without a config: every case skips, naming its
  reason.
- [ ] **Add the ledger rows.** Add the family's rows to `coverage-ledger.json`. Run
  `npm test -- src/__tests__/unit/coverage/coverageLedger.test.ts`: none of the family's keys is
  reported missing or orphaned.
- [ ] **Run the family live.** With the owner's go, after the realm check (C2), run
  `npm run test:coverage-family -- <live file> > <log outside the repository> 2>&1` on the
  on-premise system, then on the cloud system. The exit status is 0, the family's keys are
  reported passed, and nothing the test did not create is touched.
- [ ] **Commit** the family as `test(coverage): <family> pinned and live`. Push it at once (O1): the
  guard stays red until C16.

### C1. The guard ledger (red)

**Files:**
- Create:
  - `src/__tests__/helpers/servedTools.ts`, extracted from `toolSet/listedSchemas.test.ts`.
    That test then imports it.
  - `src/__tests__/helpers/pinCases.ts`
  - `src/__tests__/helpers/pinServer.ts`: the in-process server for server-dispatched tools.
  - `src/__tests__/integration/helpers/live.ts`
  - `src/__tests__/unit/coverage/coverageKeys.ts`
  - `src/__tests__/unit/coverage/ledgerScan.ts`
  - `src/__tests__/unit/coverage/coverageLedger.test.ts`
  - `src/__tests__/unit/coverage/__fixtures__/coverage/*`
  - `tests/fixtures/tools/coverage-ledger.json`, starting as `{}`.
- Modify:
  - `src/__tests__/helpers/recordingConnection.ts`: the recorded request gains the pinned
    shape (below). Its existing fields stay, so no existing test changes.
  - `src/__tests__/helpers/adtStandIn.ts`: the recorded request gains the full header map and
    the query, beside its selected headers, which stay.

**Interfaces (produced):**
- **`servedTools.ts`**
  - `type SystemKind = 'onprem' | 'cloud'`
  - `interface ServedTool { name: string; variant: SystemKind; binary: string; schema: ListedSchema }`
  - `servedTools(): Promise<readonly ServedTool[]>`: `tools/list` of all twelve binaries for
    both variants.
- **`coverageKeys.ts`**
  - `type CoverageKey = string`: the tool, then one `#value` per enum dimension it declares, in
    the fixed order `object_type`, `part`, `operation`, `action` (`HandlerLock#CLASS`,
    `GetClass#source`, `HandlerDebugStep#stepInto`, `HandlerGet#CLASS#source`,
    `HandlerGet#-#object_structure`).
  - `keyOf(tool: string, args: ToolArgs): CoverageKey`: the one function that turns a call
    into its key, used by `requiredKeys`' callers, `pinCases`, `liveCall` and `ledgerScan`
    alike.
  - `requiredKeys(served: readonly ServedTool[]): ReadonlyMap<CoverageKey, ReadonlySet<SystemKind>>`.
    - The `object_type`, `part`, `operation` and `action` values come from each listed
      schema's enums (O11, decided).
    - The typed `HandlerGet` pairs come from `compactReadRoutes` / `compactPartRoutes`.
    - The typeless `HandlerGet` keys are the five parts `handleHandlerGet` routes before a type
      (`object_structure`, `node_structure`, `virtual_folders`, `activation_status`,
      `activation_results`), each where its variant's `part` enum lists it.
- **`pinCases.ts`**
  - `interface PinnedRequest { method: string; url: string; headers: Readonly<Record<string, string>>; body: string | undefined }`.
    `url` is the path with its query as sent; `headers` every header adt-clients put on the
    request; `body` the serialised body.
  - `toPinned(recorded: RecordedRequest | StandInRequest): PinnedRequest`: the one adapter.
    - From `recordingConnection`: `url` joined with `params` in their recorded order, `data`
      as the body.
    - From `adtStandIn`: its full header map and its raw target.
    - Lossless: every wire field of the record reaches the shape unchanged — method; path and
      query; every header (the stand's full map, not its selected ones); body.
    - Excluded by name, and only these: fields the stand adds about itself, never sent —
      `StandInRequest.session` (its ABAP session label). The derived copies
      (`authorization`, `sessionType`, `cookie`, `contentType`, `accept`) are already in the
      full header map.
    - Any other field the shape has no place for fails the case.
  - `interface PinCase { tool: string; variant: SystemKind; stand: 'recording' | 'adtStandIn' | 'server'; args: ToolArgs; answers?: ReadonlyArray<Partial<IAdtWireResponse> | undefined>; before?: ReadonlyArray<{ tool: string; args: ToolArgs }>; refusal?: 'answer' | 'thrown'; expected: readonly PinnedRequest[] | 'none'; ran?: (answer: McpResult) => void }`.
    - The key is `keyOf(tool, args)`. There is no separate type or part field.
    - `before` holds the calls that make the state the tool needs, in the same server. Their
      requests are not part of `expected`; their answers give the handles the case passes on.
    - `ran` is required with `'none'`: it asserts the tool's own result is in the answer.
  - `pinCases(cases: readonly PinCase[]): void`
    - It defines one `it('<key> (<variant>) sends the pinned requests')` per case.
    - It finds the tool by name among the variant's served tools. An unserved tool fails.
    - It calls `entry.call(context, args)` over `recording` / `adtStandIn`. For `server`, it
      calls the tool by name through `pinServer`.
    - It asserts:
      - `expected` non-empty, or `'none'`;
      - the pinned list `toEqual(expected)`, or zero requests for `'none'`;
      - `ran(answer)` for `'none'`;
      - the answer's `isError`, `true` only with `refusal: 'answer'`;
      - with `refusal: 'thrown'`, that the call throws with `invalidArgumentsWords`' text **and**
        that nothing was recorded (`expected: 'none'` is required with it). A refusal row is
        supplemental: the guard does not count it for its key.
    - It must be called in executable Jest scope (top level, or a `describe` callback); the
      guard refuses a call inside a function nothing calls.
- **`pinServer.ts`**
  - `pinServer(variant: SystemKind, stand: AdtStandIn): Promise<PinServer>`, where
    `interface PinServer { call(tool: string, args: ToolArgs): Promise<McpResult>; close(): Promise<void> }`.
  - It runs the full or compact tool set in process, through the server's own dispatch
    (`BaseMcpServer`'s, background branch included), on an in-memory MCP transport against the
    stand-in. The existing helpers are reused: `batchHarness.ts`, `batchStand.ts`,
    `leftoverSession.ts`, and the background-runs memory port.
  - Handles (the batch's state handle, a run id, a listener, a long-session handle) are read
    from the answers of `before`.
- **`live.ts`**
  - `liveSuite(systems: readonly SystemKind[], title: string, body: () => void): void`.
    Without a config, or on a system it does not name, it skips and logs the reason.
  - `liveCall(tool: string, args: ToolArgs): Promise<LiveAnswer>`
    - soft mode: the entry's `call`; for the server-dispatched tools, an in-process server on
      the live connection; hard mode: the MCP tool;
    - it refuses before sending once the run's credential-refusal marker exists;
    - it marks the key as called in the current test. The key is reported covered by an
      `afterEach` reading the test's own result, only when the test passed.
  - `expectAbsent(read: { tool: string; args: ToolArgs }): Promise<void>`: the object reads
    "not found".
  - `expectCleared(read: { tool: string; args: ToolArgs }): Promise<void>`: the part reads
    empty and the object still reads.
  - `recordCreated(deleteTool: string, args: ToolArgs): void`
  - `deleteRecorded(): Promise<void>`, for `afterEach`, children before parents (reverse
    creation order).
  - `expectNameFree(read: { tool: string; args: ToolArgs }): Promise<void>`
  - `recordCreatedRequest(transportNumber: string): void` and
    `deleteRecordedRequests(): Promise<void>`: deletes only recorded request and task numbers
    through `createAdtClient(connection).getRequest().delete` on the test's own connection, in
    the order C13 measures, then asserts each absent with `GetTransport`.
- **`ledgerScan.ts`**
  - `scanUnitFile(path: string): readonly PinRef[]`
  - `scanLiveFile(path: string): readonly LiveRef[]`
  - Both use the TypeScript compiler API only (`ts.createSourceFile`, a node walk), and both
    compute the key with `keyOf` from the `tool` and `args` literals.

**Steps:**
- [ ] **Step 1: Write `coverageLedger.test.ts`.**
  - `'the served list is the listed-schema fixture'`: per tool of `fixture.schemas`, the set of
    binary-and-variant pairs serving it equals its `listedBy`; 315 tools; no served tool outside
    `fixture.schemas`.
  - `'every required key has a ledger row'` and `'every ledger row is a required key'`: two set
    differences, each expected `[]`, with the missing keys printed.
  - `'each row names exactly the systems its key requires'`.
  - `'each unit reference is a pinCases row of that key'`: `scanUnitFile(row.unit)` holds a ref
    whose `keyOf(tool, args)` equals the key, with a variant per required kind.
  - `'each live reference is an awaited liveCall of that key in an it, inside a liveSuite naming the system'`.
  - `'a delete key's live case awaits expectAbsent or expectCleared on the deleted object'`:
    the delete's contract (spec §8) chooses which, and the read's object and part literals
    equal the delete's.
  - `'a none row is a tool the spec names as sending nothing'`: `BatchBegin`, `BatchAnswers`,
    `GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun`,
    `HandlerBackgroundRunGet`, `HandlerBackgroundRunList`, `HandlerBackgroundRunDiscard`, and
    `HandlerBatch#begin`, `HandlerBatch#answers`. Any other key found sending nothing when it
    is pinned joins this list only with the reason read from its handler, in the same commit.
  - `'no pinCases row or liveCall in a scanned file lacks a ledger row'`.
- [ ] **Step 2: Write one fixture per refusal and a test that each is refused,** each by its
  own check alone. The refusals:
  - a missing row; an extra row; a missing system; an extra system;
  - a served list with a tool's binary set differing from its `listedBy`;
  - `expected: []`; a spread or computed request; a non-literal `url`; a request with a fifth
    key;
  - a relabelled pin: the ledger key differs from `keyOf(tool, args)`;
  - a dormant registration: `pinCases` (or `liveSuite`) inside a function nothing calls;
  - a key covered only by a `refusal` row;
  - a typeless `HandlerGet` part pinned under a typed key;
  - `'none'` on a tool not named as sending nothing;
  - a `liveCall` in `afterEach`; in a cleanup lambda; outside `liveSuite`;
  - a `liveCall` not awaited;
  - a `liveCall` inside a callback the test never invokes;
  - a delete without an absence check;
  - an absence check on another object than the one deleted;
  - `expectAbsent` on a delete that empties a part (and `expectCleared` on one that removes);
  - an orphan `liveCall`;
  - a unit file under `integration/`.
- [ ] **Step 3: Write `pinCases`' own unit tests** (`src/__tests__/unit/coverage/pinCases.test.ts`).
  - `'refuses an empty expected'`.
  - `'refuses a tool the variant does not serve'`.
  - `'fails when one request more is recorded than expected'`.
  - `'a none case fails when the tool never ran'`: a stub tool that returns before doing
    anything; `ran` sees no result.
  - `'a none case fails when the tool sends a request'`.
  - `'a thrown refusal is asserted as thrown, with zero requests'`: a case that sends before
    throwing fails.
  - `'toPinned excludes session and nothing else'`.
  - `'toPinned keeps the query, every header and the body'`: one request through each stand,
    with params, three headers and a body, each found in the pinned shape.
- [ ] **Step 4: Write `live.ts`' own unit tests** (`src/__tests__/unit/coverage/live.test.ts`), on
  `adtStandIn`, so nothing reaches SAP:
  - `'liveCall sends nothing after the refusal marker'`;
  - `'a key is reported covered only after its test passed'`: a test that calls and then fails
    an assertion reports the key failed;
  - `'deleteRecorded deletes only recorded names, children first'`;
  - `'expectNameFree fails on an existing name and deletes nothing'`.
- [ ] **Step 5: Implement the files** to the interfaces above, and the two stand adapters.
  Run the root `npm test`: every existing test that imports either stand passes unchanged.
- [ ] **Step 6: Run.** `npm test -- src/__tests__/unit/coverage`. The fixtures, `pinCases` and
  `live.ts` tests PASS. The ledger test FAILS, listing every required key as missing (the red
  baseline). Record the count in this plan.
- [ ] **Step 7: Mutate each check.** Delete it, see its fixture's test go red, then revert.
- [ ] **Step 8: Commit** as `test(coverage): the ledger guard, red`.

### C2. Live-run safety and the run report

**Files:**
- Modify:
  - `src/__tests__/integration/globalSetup.ts`
  - `src/__tests__/integration/helpers/openConnections.ts` and every helper that creates a
    test connection (the connection-creation path of the testers, `sessionHelpers.ts`,
    `debuggerCleanup.ts`).
  - `tests/test-config.yaml.template`: `environment.expected_realm: ""` with its comment.
  - The Jest configuration: add `globalTeardown` for the integration runs.
  - `package.json`: the script `test:coverage-family` (C1's global constraints).
- Create:
  - `src/__tests__/integration/helpers/realmCheck.ts`
  - `src/__tests__/integration/helpers/runReport.ts`
  - `src/__tests__/integration/globalTeardown.ts`

**Interfaces:**
- **`realmCheck.ts`**
  - `realmCheck(kind: SystemKind, baseUrl: string, expectedRealm: string, session: SessionFacts): Promise<void>`
  - It sends an unauthenticated `GET <baseUrl>/sap/bc/adt/discovery` and expects `401`.
    - On premise, the `WWW-Authenticate` realm must equal `expectedRealm`; empty refuses.
    - On the cloud, the session's JWT `exp` must lie in the future. It is decoded locally.
  - Any mismatch throws.
- **`runReport.ts`**
  - `reportPath(): string`, under the OS temp directory and named per run, never in the
    repository.
  - `recordOutcome(key: CoverageKey, kind: SystemKind, outcome: 'passed' | 'failed' | 'skipped'): void`
  - `markCredentialRefused(): void`
  - `credentialRefused(): boolean`

**Steps:**
- [ ] **Step 1: Write the unit tests** (`src/__tests__/unit/coverage/realmCheck.test.ts`, on a
  local HTTP stand-in):
  - `'a wrong realm throws before any credential is sent'`: the stand-in records no
    `Authorization` header;
  - `'an empty expected realm refuses'`;
  - `'an expired JWT refuses with no request'`.
- [ ] **Step 2: Write the teardown tests** (`src/__tests__/unit/coverage/runReport.test.ts`):
  - `'the full run fails when a required key of this system was skipped'`;
  - `'the full run passes when every required key passed'`;
  - `'a family run checks only the keys of its own files'`;
  - `'a key whose test failed after the call is reported failed'`.
- [ ] **Step 3: Write the refusal-stop tests** (`src/__tests__/unit/coverage/refusalStop.test.ts`,
  on `adtStandIn` answering `401`):
  - `'a credential refusal in globalSetup fails the setup'`: today it is logged and the run goes
    on (`globalSetup.ts`, the `catch` after `connection.connect()`); afterwards it throws and
    the marker exists;
  - `'no connection is created after the marker'`;
  - `'cleanup, name-free reads and the debugger and session helpers send nothing after the marker'`;
  - `'a refusal on a connected path latches before the next send'`: the connection is made,
    the stand-in then answers `401` to a tool call; the next `liveCall`, read-back, cleanup
    request and debugger-helper request each send nothing, and the marker exists;
  - the same with the first refusal on a read and on a cleanup request.
- [ ] **Step 4: Implement.**
  - `globalSetup` calls `realmCheck` before it builds the factory, and rethrows a credential
    refusal after writing the marker. A setup without config still returns at once.
  - Every connection-creation helper checks the marker first, and writes it on a logon refusal
    (a `401` at logon, a broker refusal).
  - `liveCall`, `deleteRecorded`, `expectNameFree`, `expectAbsent`, `expectCleared` and the
    debugger and session helpers check it before each request, and **latch** it when a request
    they sent on an established connection is refused for its credential (a `401`, a broker
    refusal) — not only at logon.
  - `globalTeardown` compares the run report with `coverage-ledger.json` for the configured
    system kind, in the scope of the running script.
- [ ] **Step 5: Run the tests above:** PASS. Without a config, `npm run test:integration` still
  returns at once, logging nothing on.
- [ ] **Step 6: Commit** as `test(coverage): realm check, refusal stop, run report`.

### C3. Activate

**Keys:**
- `ActivateBehaviorDefinition`, `ActivateClass`, `ActivateDataElement`, `ActivateDdl`,
  `ActivateDomain`, `ActivateFunctionGroup`, `ActivateFunctionModule`, `ActivateInclude`,
  `ActivateInterface`, `ActivateMetadataExtension`, `ActivateObjects`, `ActivateProgram`,
  `ActivateServiceBinding`, `ActivateServiceDefinition`, `ActivateStructure`, `ActivateTable`,
  `ActivateTableType`: 17.
- `HandlerActivate#<type>`: 18 types on premise, 16 on the cloud.
- `HandlerGet#-#activation_status` and `HandlerGet#-#activation_results`: they read an
  activation run by the `run_id` an activation of this task answers.

**Owner's decisions applied:** O2 (literal pins), O12 (the owner supplies `coverage_activate`
before the first live run).

**Unit:** `src/__tests__/unit/pins/activate.pins.test.ts`, on `recordingConnection`. Each
activation answer is a corpus activation result.

**Live:** `src/__tests__/integration/coverage/activate.live.test.ts`, section `coverage_activate`.
- **Objects.** One inactive object per type, created by the test without activation.
  - **Read-only dependencies** from `shared_dependencies`, never written: the tables under the
    views, the DDL behind a metadata extension, the service definition behind a binding, the
    function group behind a module.
  - **The BDEF's root is the test's own.** A BDEF carries its root entity's name, so it cannot
    sit on a shared view (`rapFixtures.ts`). The test creates its own root view under
    `ZMCP_BLD_I_*` (`assertNameAvailable`, `createView`, `activateAndConfirm`), records it,
    then creates the BDEF over it; the same holds for the behavior implementation's class.
  - Cleanup deletes in reverse order of creation: behavior implementation, BDEF, then the
    root view (`deleteView`).
- **Assertions.** After the activation, `GetInactiveObjects` no longer lists the object, and
  the activation result has no error.
- **Cleanup.** `deleteRecorded`.
- **Systems.** Include and program on premise only; the rest on both.

**Steps:** the family steps. 7.

### C4. Check and validate

**Keys:**
- `CheckBehaviorDefinition`, `CheckClass`, `CheckDataElement`, `CheckDdl`, `CheckDomain`,
  `CheckFunctionGroup`, `CheckFunctionModule`, `CheckInterface`, `CheckMetadataExtension`,
  `CheckPackage`, `CheckProgram`, `CheckStructure`, `CheckTable`, `CheckTableType`: 14.
- `HandlerCheckRun#<type>` (its enum has no `INCLUDE`, `SERVICE_*` or
  `BEHAVIOR_IMPLEMENTATION`) and `HandlerValidate#<type>` (no `SERVICE_DEFINITION`), as each
  variant's enum lists them.

**Unit:** `src/__tests__/unit/pins/check.pins.test.ts`.

**Live:**
- The existing `high/check/CheckHighHandlers.test.ts` moves its calls to `liveCall`, keeping
  its sections (`check_*_high`).
- New: `coverage/check.live.test.ts`, for the compact keys and `CheckTableType`, section
  `coverage_check`.
- **Objects.** Checks run on shared objects only: read, never written. Validations run on
  names.
- **Check assertions** (`Check<Type>`, `HandlerCheckRun#<type>`): the answer's `ran` is true,
  its `status_text` is read, and its `messages` list is present (empty or not) — "it ran" is
  asserted apart from "it found nothing".
- **Validation assertions** (`HandlerValidate#<type>`): `admissible` is read.
  - The positive case validates a prospective unused name (`expectNameFree` first; nothing is
    created) and expects `admissible: true`.
  - The negative case validates the name of an existing shared object and expects
    `admissible: false` — an answer, not an error.

**Steps:** the family steps. 7.

### C5. Create and update (full)

**Keys:**
- Every `Create*` and `Update*` full tool but the unit-test, transport and binding-update
  ones: 21 creates and 25 updates. The unit-test tools are C12's, `CreateTransport` /
  `CreateTransportTask` are C13's and `UpdateServiceBinding` is C14's.
- This includes the live gaps: `CreateDdl`, `UpdateDdl`, `CreateMessageClass`,
  `CreateMessageClassMessage`, `UpdateMessageClass`, `UpdateMessageClassMessage` and
  `UpdatePackage`.

**Unit:** `src/__tests__/unit/pins/write.pins.test.ts`.
- Each update is pinned on its whole locked chain: lock, write, unlock.
- The creates already pinned by parity are pinned again here, by literal (O2, decided).

**Live:**
- **The existing `high/<type>/*HighHandlers.test.ts`.** Create, update and read-back move into
  the test body through `liveCall`. `HighTester` keeps only the failure cleanup, through
  `deleteRecorded`.
- **New: `coverage/ddlAndMessageClass.live.test.ts`,** section `coverage_writes`: a DDL, a
  message class with one message, and an update of a package the test created.
- **Assertions.** Every update is read back and compared with what was written.

**Steps:** the family steps. 7.

### C6. Compact writes per object type

**Keys:** `HandlerCreate#<type>`, `HandlerLock#<type>`, `HandlerUpdate#<type>` and
`HandlerUnlock#<type>`, each over the types its variant's enum lists. The enums differ, so the
chains are built per operation, not from one type list:
- **`TRANSPORT`** is in `HandlerCreate`'s enum only: a create, then a read back
  (`HandlerGet#TRANSPORT#…`). No lock, update or unlock.
- **`LOCAL_TEST_CLASS`, `LOCAL_TYPES`, `LOCAL_DEFINITIONS`, `LOCAL_MACROS`, `UNIT_TEST`,
  `CDS_UNIT_TEST`** are in `HandlerUpdate`'s enum, not in `HandlerCreate`'s or `HandlerLock`'s:
  each is updated on a parent the test creates first — a class (`HandlerCreate#CLASS`) for the
  local parts and `UNIT_TEST`; for `CDS_UNIT_TEST`, `CreateCdsUnitTest` over a DDL the test
  creates. The update is read back.
- **`PROGRAM`, `INCLUDE`** are on premise only; an include needs its main program, created
  first.
- **The rest** (the types in `HandlerLock`'s enum): create, lock, update, unlock, read back.
- **Parents before children:** a function group before its module; a DDL before its metadata
  extension; a BDEF over the test's own root view (C3's rule); a service definition before its
  binding. Objects go into `$TMP` or the configured package, which the test does not create.

**Owner's decision applied:** O4 / O5 — `HandlerCreate#TRANSPORT`'s live case creates its own
request and records it; `deleteRecordedRequests` deletes it and asserts it absent (C13's
delete path).

**Unit:** `src/__tests__/unit/pins/compactWrites.pins.test.ts`. **Every operation × type key
gets its own literal pin, per variant** (O2): `HandlerCreate#<type>` (19 on premise, 17 on the
cloud), `HandlerLock#<type>` and `HandlerUnlock#<type>` (18 / 16), `HandlerUpdate#<type>`
(24 / 22) — `HandlerLock#CLASS` included, though `lowToCompact.test.ts` already covers it by
parity. The 112 parity rows of `lowToCompact.test.ts`, `createSingleCall`, `updateSingleCall`
stay unchanged beside them.

**Live:** `coverage/compactWrites.live.test.ts`, section `coverage_compact_writes`.
- It is enabled in the template and runs in soft mode. The hard-mode
  `batch/communicationBatch.test.ts` stays as it is.
- **Flow.** Per type, the chain above, each step an awaited `liveCall` in the body.
- **Failure-safe unlock and logoff.** A lock the test took is recorded with its handle and
  session. An `afterEach` unlocks a lock still held, on the same session, and then logs that
  session off (the logoff releases what the unlock could not). The test still fails: a lock
  left behind is a failure. Never SM12.

**Steps:** the family steps. 7.

### C7. Deletes

**Keys:**
- Every `Delete*` full tool: 27, `DeletePackage` included.
- `HandlerDelete#<type>` over its enum (it includes `LOCAL_*`, `UNIT_TEST` and
  `CDS_UNIT_TEST`) and `HandlerDeletionCheck#<type>` over its own (no `LOCAL_*`, no
  `UNIT_TEST`): a deletion check runs only where its enum lists the type.
- **Absence per contract (spec §8):** `DeleteLocalDefinitions`, `DeleteLocalMacros`,
  `DeleteLocalTypes`, `DeleteLocalTestClass`, `DeleteUnitTest` and `HandlerDelete` of
  `LOCAL_*` / `UNIT_TEST` empty a part and keep the class: `expectCleared`. Every other delete
  removes its object: `expectAbsent`.
- **Order:** children before parents — behavior implementation, BDEF, root view; metadata
  extension before its DDL; binding before its service definition; module before its group;
  include before its program; the package last.

**Unit:** `src/__tests__/unit/pins/delete.pins.test.ts`. The deletes already pinned by parity
are pinned again here by literal (O2, decided).

**Live:**
- **Full tools.** Each `<type>` suite of C5 ends its test body with `liveCall('Delete<Type>', …)`
  and then the assertion its contract names: `expectCleared` for `DeleteLocalDefinitions`,
  `DeleteLocalMacros`, `DeleteLocalTypes`, `DeleteLocalTestClass` (in the class suite, the class
  still reading); `expectAbsent` for every other delete.
- **`DeleteUnitTest` and `DeleteCdsUnitTest`** live in C12's unit-test suites, after their runs:
  `DeleteUnitTest` with `expectCleared` (the test include empty, the class stays),
  `DeleteCdsUnitTest` with `expectAbsent` (its class is removed). C7 owns their pins only.
- **`DeleteServiceDefinition`.** Its local wrapper in `ServiceDefinitionHighHandlers` goes; the
  test calls the tool.
- **Compact keys.** `coverage/compactDeletes.live.test.ts`, section `coverage_compact_writes`.
  Per type, on objects the test created (C6's chains): `HandlerDeletionCheck` where its enum
  lists the type, then `HandlerDelete`, then `expectAbsent` or `expectCleared` on the same
  object.

**Steps:** the family steps. 7.

### C8. Reads

**Keys:**
- **Object reads (20):** `GetBehaviorDefinition`, `GetBehaviorImplementation`, `GetClass`,
  `GetDataElement`, `GetDdl`, `GetDomain`, `GetFunctionGroup`, `GetFunctionModule`,
  `GetInterface`, `GetMessageClass`, `GetMetadataExtension`, `GetPackage`, `GetProgram`,
  `GetServiceBinding`, `GetServiceDefinition`, `GetStructure`, `GetTable`, `GetTableType`,
  `GetFunctionInclude`, `GetEnhancementSpot`.
  - `batch/metadataReads.test.ts` pins the metadata part of 18 of them by parity (its
    `HANDLERS`); it excludes `GetBehaviorImplementation` and `GetTableType` (its `EXCLUDED`),
    which the inventory still counted as PINNED through other files. All 20 are pinned here by
    literal, source part and metadata part.
  - **Live gaps among them** (inventory): `GetBehaviorDefinition`, `GetBehaviorImplementation`,
    `GetDataElement`, `GetDomain`, `GetFunctionGroup`, `GetInterface`, `GetMessageClass`,
    `GetMetadataExtension`, `GetPackage`, `GetProgram`, `GetServiceBinding`,
    `GetServiceDefinition`, `GetStructure`, `GetTable`, `GetEnhancementSpot`.
  - `GetBehaviorImplementation` reads the behavior pool's class: its live case reads the
    implementation C3 creates over the test's own root, inside C3's chain or a chain of its own
    with the same fixtures.
- **Other readers:** `GetEnhancementImpl`, `GetEnhancements`,
  `GetInclude`, `GetIncludesList`, `GetPackageContents`,
  `GetPackageTree`, `GetObjectsList`, `GetStructuresList`, `GetTypeInfo`, `GetLocalDefinitions`,
  `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes`, `GetMessageClassMessage`,
  `GetMainPrograms`, `ListFunctionGroupIncludes`, `ListFunctionModules`.
- **Compact:** `HandlerGet#<type>#<part>`, every pair the route tables serve, except the
  unit-test pairs (C12); and the typeless address parts `HandlerGet#-#object_structure`,
  `HandlerGet#-#node_structure`, `HandlerGet#-#virtual_folders`, which `handleHandlerGet`
  routes before any type. The typeless run parts are C3's.

**Owner's decision applied:** O7 — before a cloud case of `GetEnhancementImpl`,
`GetEnhancementSpot` or `GetEnhancements` is written, the trial's ADT discovery is read for
its endpoint; an endpoint it does not offer is reported to the owner.

**Unit:** `src/__tests__/unit/pins/read.pins.test.ts`, one literal pin per key — the tool and,
where its schema has a `part` enum, each part.

**Parts and assertions per reader** (parts from the listed schemas; source-less types from
`compactPartRoutes.ts`' `SOURCELESS`):

| Reader | Keys (parts) | Live assertion |
| --- | --- | --- |
| `GetClass`, `GetInterface`, `GetProgram`, `GetDdl`, `GetMetadataExtension`, `GetBehaviorDefinition`, `GetBehaviorImplementation`, `GetServiceDefinition`, `GetFunctionModule`, `GetFunctionInclude`, `GetInclude` | `#source`, `#metadata` | source: non-empty text naming the object; metadata: the object's name and ADT type |
| `GetTable`, `GetStructure` | `#source`, `#metadata` | source: the DDIC source naming the object; metadata: name and type |
| `GetServiceBinding` | `#source`, `#metadata` | source: the binding's service document; metadata: name and binding type |
| `GetDomain`, `GetDataElement`, `GetFunctionGroup`, `GetPackage`, `GetTableType`, `GetMessageClass`, `GetEnhancementSpot`, `GetEnhancementImpl` | the tool alone: no source part | the metadata document's name and type (domain: its data type; data element: its type; package: its super package or software component; message class: a message) |
| `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes` | the tool alone | the include's text is read (it may be empty) and the class still reads |
| `GetMessageClassMessage` | the tool alone | the message text of the number asked |
| `GetEnhancements`, `GetIncludesList`, `GetMainPrograms`, `ListFunctionGroupIncludes`, `ListFunctionModules`, `GetPackageContents`, `GetPackageTree`, `GetObjectsList`, `GetStructuresList`, `GetTypeInfo` | the tool alone | the list or tree holds the named shared object (or, `GetTypeInfo`, the type's kind) |
| `HandlerGet#<type>#source` | per type with a source (not `PACKAGE`, `DOMAIN`, `DATA_ELEMENT`, `FUNCTION_GROUP`, `TABLE_TYPE`) | as the full reader's source |
| `HandlerGet#<type>#metadata`, `#urls`, `#contents`, `#main_programs` | per type the routes serve | metadata as above; urls: the object's URI; contents: the package's entries; main programs: the include's main program |
| `HandlerGet#-#object_structure`, `#node_structure`, `#virtual_folders` | typeless | a node of the named object or package |

**Live:**
- **Existing read suites** move their calls to `liveCall`.
- **New: `coverage/reads.live.test.ts`,** section `coverage_reads`.
  - **Objects.** Shared objects only (`shared_dependencies`), read and never written. The
    enhancement spot and implementation are named in the section, after the discovery check.
  - **Assertions.** Per the table above; a source-less type is never asked for `source`.

**Steps:** the family steps. 7.

### C9. Version tools

**Keys:**
- The 28 generated `Get<Type>Versions` / `Get<Type>VersionSource` / `Get<Type>VersionDiff`.
- `GetObjectVersions`, `GetObjectVersionSource`, `GetObjectVersionDiff`.

**Owner's decision applied:** O3 — read-only objects that already have versions; on the cloud,
what exists is measured first.

**Unit:** `src/__tests__/unit/pins/versions.pins.test.ts`. The version feed and the source
answers are corpus documents.

**Live:** `coverage/versions.live.test.ts`, section `coverage_versions`.
- **Objects.** One object per type with at least two versions, named in the config and only
  read: on premise one per type named in `coverage_versions`; on the cloud, the objects found
  by measuring first (the version feed of candidate objects, read only), then named. A type
  with none on a system is reported to the owner.
- **Assertions.**
  - The version list has at least two entries.
  - The source of the newest is not empty.
  - The diff of the two newest names both.

**Steps:** the family steps. 7.

### C10. System, search and data readers

**Keys:**
- `GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols`, `GetAdtTypes`,
  `GetInactiveObjects`, `GetObjectInfo`, `GetObjectNodeFromCache`, `GetObjectStructure`,
  `GetObjectsByType`, `GetTransaction`, `SearchObject`, `SearchSource`, `GetWhereUsed`,
  `DescribeByList`, `GetSqlQuery`, `GetTableContents`.
- Compact: `HandlerSearch`, `HandlerGetData`, `HandlerWhereUsed#<type>` (its listed schema has
  an `object_type` enum, so one key per type).

**Owner's decision applied:** O8 — the cloud cases of `GetSqlQuery` and `GetTableContents` are
written only after the trial's ADT discovery is read for their endpoints; an endpoint it does
not offer is reported to the owner.

**Unit:** `src/__tests__/unit/pins/system.pins.test.ts`.

**Live:**
- **Existing suites** move to `liveCall`: `SystemHighHandlers`, `SearchSourceHandler`,
  `WhereUsedHandlers`, `SqlQueryHandlers`, `TableContentsHandlers`, `AbapSystemSymbolsHandler`.
- **New: `coverage/system.live.test.ts`,** section `coverage_system`, for the rest. It reads
  shared objects; `GetTransaction` reads a transaction named in the section.
- **Cloud.** `GetSqlQuery` and `GetTableContents` read a table of the test package on the
  cloud, once the discovery check passes.

**Steps:** the family steps. 7.

### C11. ATC and runtime

**Keys:**
- `RunATC`, `GetATCFindings`, `GetATCResult`, `GetATCRunStatus`, `ListATCResults`,
  `RuntimeRunClass`, `RuntimeRunProgram`, `RuntimeCreateProfilerTraceParameters`,
  `RuntimeListProfilerTraceFiles`, `RuntimeGetProfilerTraceData`,
  `RuntimeAnalyzeProfilerTrace`, `RuntimeListFeeds`, `RuntimeGetDumpById`,
  `RuntimeGetGatewayErrorLog`, `RuntimeListSystemMessages`.
- Compact: `HandlerDumpList`, `HandlerDumpView`, `HandlerProfileList`, `HandlerProfileRun`,
  `HandlerProfileSchedule`, `HandlerProfileView`.

**Owner's decision applied:** O6 — the trace files and parameters a run leaves are accepted
as the test user's own and listed in the run report.

**Unit:** `src/__tests__/unit/pins/runtime.pins.test.ts`. `RuntimeRunClass` and
`RuntimeRunProgram` without `background` go through the entry; with `background: true` they are
C16's (server-dispatched).

**Live:**
- **Existing suites** move to `liveCall`: `AtcHandlers`, `RuntimeFeedHandlers`,
  `RuntimeProfilingAndDumpsHandlers`.
- **New: `coverage/runtime.live.test.ts`,** section `coverage_runtime`.
  - **Objects.** A probe class the test creates and deletes, run through `RuntimeRunClass` and
    `HandlerProfileRun`. On premise, a probe program as well, run through `RuntimeRunProgram`.
  - **Assertions.** The run's output is read. The profile appears in `HandlerProfileList` and
    is read by `HandlerProfileView`.
  - **Profiler state.** What the run leaves is listed in the run report; another user's traces
    are never read.

**Steps:** the family steps. 7.

### C12. Unit tests

**Keys:**
- `RunAbapUnit`, `RunUnitTest`, `RunProgramUnitTest`, `RunFunctionGroupUnitTest`,
  `RunFunctionModuleUnitTest`, `RunCdsUnitTest`, `GetUnitTestResult`.
- `CreateUnitTest`, `UpdateUnitTest`, `CreateCdsUnitTest`, `UpdateCdsUnitTest`,
  `CreateProgramUnitTest`, `UpdateProgramUnitTest`, `CreateFunctionGroupUnitTest`,
  `UpdateFunctionGroupUnitTest`.
- Compact: `HandlerUnitTestRun`, `HandlerUnitTestStatus`, `HandlerUnitTestResult`,
  `HandlerCdsUnitTestStatus`, `HandlerCdsUnitTestResult`, `HandlerGet#UNIT_TEST#*`,
  `HandlerGet#CDS_UNIT_TEST#*`.

**Unit:** `src/__tests__/unit/pins/unitTests.pins.test.ts`.

**Live:**
- **The existing `unitTest/*` suites** move to `liveCall`. `RunAbapUnit` and the compact keys
  get cases there, on the class the suite creates.
- **Their deletes live here** (pins in C7): the class unit-test suite ends with
  `DeleteUnitTest` then `expectCleared` (test include empty, class reads); the CDS unit-test
  suite ends with `DeleteCdsUnitTest` then `expectAbsent`.
- **Assertions.** The run's result is read: the test count and that no test failed.

**Steps:** the family steps. 7.

### C13. Transport

**Keys:**
- `CreateTransport`, `CreateTransportTask`, `AddTransportObject`, `RemoveTransportObject`,
  `MoveTransportObjects`, `SortAndCompressTransportTask`, `ReadTransportObjects`,
  `ReadTransportActionLog`, `GetTransport`, `ListTransports`.
- Compact: `HandlerTransportCreate`, `HandlerTransportMoveObjects`,
  `HandlerTransportSortAndCompress`.

**Owner's decision applied:** O4 / O5.

**First, measure the delete path live** (owner's go, realm check, the on-premise system, then
the cloud): create one request with one task through `CreateTransport` / `CreateTransportTask`,
then delete through `getRequest().delete` — the task by its number, then the request — and read
each with `GetTransport`. Record here which order and which numbers ADT accepts; the cleanup
below follows it.

**Unit:** `src/__tests__/unit/pins/transport.pins.test.ts`.

**Live:**
- **The existing `TransportObjectToolsCrud`** moves to `liveCall`.
- **New: `coverage/transport.live.test.ts`,** section `coverage_transport`.
  - **Creates.** `CreateTransport`, `CreateTransportTask`, `HandlerTransportCreate` each create
    their own request or task, assert it reads back (`GetTransport`), and record the number
    (`recordCreatedRequest`). Cleanup deletes only recorded numbers, in the measured order,
    then asserts each absent.
  - **Everything else** works on `coverage_transport.request`: an object the test creates in the
    section's transportable package is added, read in the request's objects and action log,
    moved and sorted within that request's task, then removed — the request is left as it was.
    The object is deleted by `deleteRecorded`.
  - **Never** release a request. Cloud cases follow the discovery rule (O7 / O8).

**Steps:** the family steps. 7.

### C14. Service binding

**Keys:**
- `UpdateServiceBinding`, `ValidateServiceBinding`, `GetServiceBindingPreviewUrl`,
  `ListServiceBindingTypes`.
- Compact: `HandlerServiceBindingListTypes`, `HandlerServiceBindingValidate`.
- `Create`, `Activate`, `Get` and `Delete` of a binding are C5, C3, C8 and C7.

**Unit:** `src/__tests__/unit/pins/serviceBinding.pins.test.ts`.

**Live:**
- **The existing `ServiceBindingHighHandlers`** calls `UpdateServiceBinding` as its update step,
  with the publish state read back. It no longer uses `ActivateServiceBinding` for that.
- The remaining keys go in the same file.

**Steps:** the family steps. 7.

### C15. Debugger, AMDP and memory

**Keys:**
- **ABAP debugger:** `DebugStartListener`, `DebugStop`, `DebugWait`, `DebugTakeOverListener`,
  `DebugSetBreakpoints`, `DebugListBreakpoints`, `DebugDeleteBreakpoint`,
  `DebugCreateWatchpoint`, `DebugListWatchpoints`, `DebugDeleteWatchpoint`, `DebugSetSettings`,
  `DebugStep`, `DebugStepToLine`, `DebugGetStack`, `DebugSetStackPosition`, `DebugGetVariables`,
  `DebugSetVariable`, `DebugGetMemorySizes`, `DebugCreateMemorySnapshot`, `DebugTerminate`.
- **Memory snapshots:** `MemorySnapshotList`, `MemorySnapshotGet`, `MemorySnapshotDelta`.
- **AMDP:** `AmdpDebugStart`, `AmdpDebugSetBreakpoints`, `AmdpDebugWait`, `AmdpDebugStep`,
  `AmdpDebugGetTable`, `AmdpDebugCancel`, `AmdpDebugStop`.
- **Debug batch:** `DebugBatchBegin`, `DebugBatchEnd`.
- **Compact:** `HandlerDebugSession`, `HandlerDebugBreakpoints`, `HandlerDebugStep`,
  `HandlerDebugMaintain`, `HandlerDebugBatch`.

**Owner's decisions applied:** O9 (AMDP live on both systems, no exception; take-over on a
second connection of the same user), O11 (one key per `operation` / `action` value).

**Unit:** `src/__tests__/unit/pins/debugger.pins.test.ts`, `stand: 'server'` on `adtStandIn`:
the debugger is dispatched by the server, and the listener and the debuggee run on connections
of their own.
- Each case's state comes from its `before` calls in the same server: a listener started, a
  breakpoint set, a stop reached (the stand-in answers the debuggee's stop); the debuggee id,
  the stack frame and the snapshot ids are read from those answers, never written by hand.
- `DebugBatchBegin` / `DebugBatchEnd` and `HandlerDebugBatch` run at a stop made the same way.

**Live:** the existing `debugger/DebuggerHandlers.test.ts` moves to `liveCall` and gains
cases, section `debugger_handlers`.
- **New cases:**
  - watchpoints: create, list, delete;
  - breakpoint list and delete;
  - `DebugSetStackPosition`;
  - `DebugSetVariable`, read back;
  - `DebugTerminate`;
  - `MemorySnapshotGet` and `MemorySnapshotDelta`;
  - `AmdpDebugSetBreakpoints` and `AmdpDebugCancel`;
  - the compact debug tools.
- **Objects.** The probe class the suite creates and deletes, and the shared AMDP pair, read
  only.
- **Connections.**
  - The debuggee runs on its own connection.
  - The take-over case uses a second connection of the same user.
  - The other-user case uses `second_user_env` on its own connection.
- **`afterAll`** stops every listener and logs off every session (`debuggerCleanup.ts`).
- **AMDP** keys run on both systems (O9): both are HANA.

**Steps:** the family steps. 7.

### C16. Batch, sessions, background runs, leftover sessions

**Keys:**
- `BatchBegin`, `BatchEnd`, `BatchAnswers`, `HandlerBatch`.
- `SessionOpen`, `SessionClose`, `HandlerSession`.
- `GetBackgroundRun`, `ListBackgroundRuns`, `DiscardBackgroundRun`, `HandlerBackgroundRunGet`,
  `HandlerBackgroundRunList`, `HandlerBackgroundRunDiscard`.
- `ListLeftoverSessions`, `LogoffLeftoverSession`, `HandlerLeftoverSessionList`,
  `HandlerLeftoverSessionLogoff`.

**Owner's decisions applied:** O10 (the test makes its own leftover), O11 (one key per
`action` value).

**Unit:** `src/__tests__/unit/pins/sessions.pins.test.ts`, `stand: 'server'` on `adtStandIn`.
This covers the four compact handlers no test runs today.
- **Server-dispatched.** The background branch of the call dispatch (`BaseMcpServer.ts`), the
  batch, the long sessions and the leftover sessions are the server's, not the entry's, so
  each case runs through `pinServer`, on the transport the tool is served on: the long-session
  tools on Streamable HTTP, the leftover tools on stdio (an in-memory transport for the stdio
  server), the rest on stdio.
- **State and handles.** `before` makes the state: `BatchBegin` before `BatchEnd` /
  `BatchAnswers`; a `RuntimeRunClass` with `background: true` before the background-run get,
  list and discard; `SessionOpen` before `SessionClose`; a leftover session written by
  `leftoverSession.ts` before the leftover list and logoff. The state handle, run id, session
  handle and leftover id come from those answers.
- **Zero-request rows.** `BatchBegin`, `BatchAnswers`, and the background-run get, list and
  discard (full and compact) answer from server state: `expected: 'none'`, with `ran`
  asserting the tool's own result (the state handle; the run's record; the list holding the
  run; the discard's outcome). The C1 fixtures prove a `'none'` row fails when the tool never
  ran.

**Live:** `coverage/sessions.live.test.ts`, section `coverage_sessions`.
- **Mode.** Every case runs through an in-process server on the live connection (`liveCall`'s
  server path) or, for the long sessions, the HTTP launcher; never the entry alone.
- **Batch.** Two reads in one envelope, both answered.
- **Long sessions.** The HTTP launcher (`launch_http`). The session is opened, used for one
  read and closed, then the closed handle is refused.
- **Background runs.** `RuntimeRunClass` with `background: true` on a probe class the test
  creates. The run is got, listed and discarded, and the discarded run is absent from the list.
- **Leftover sessions** (O10): the test starts the stdio binary on its destination and opens a
  session, ends the process without logoff, then lists through a new process and logs off only
  the session it made, by its id; a leftover it did not make is listed, never logged off. It
  asserts the tool's answer, not SM04.

**Steps:** the family steps, then:
- [ ] Turn the guard green: `npm test -- src/__tests__/unit/coverage/coverageLedger.test.ts`
  PASS with no key missing.
- [ ] Commit.

8 steps in all.

### Owner's decisions and open items

**Decided by the owner (binding), applied in the tasks named:**
- **O1 — the guard stays red.** It is red from C1 until C16 turns it green: no list of
  uncovered keys, no `test.failing`. Each family is pushed as it lands (C1, every family task).
- **O2 — re-pin by literal: yes.** Every key is pinned in `pinCases` by literal; the parity
  tests (`createSingleCall`, `metadataReads`, `lowToCompact`, …) stay. Applied from C3 on.
- **O3 — versions: yes.** Read-only objects that already have versions, named in
  `coverage_versions`. On the cloud, what exists is measured first (C9).
- **O6 — profiler leftovers: yes.** Trace files and parameters a run leaves are the test user's
  own, accepted, and listed in the run report (C11).
- **O7 / O8 — cloud availability by ADT discovery.** Before a cloud case of a tool is written,
  the trial's ADT discovery (`/sap/bc/adt/discovery`) is read for the tool's endpoint. If the
  discovery does not offer it, the tool is reported to the owner, who decides defect (its
  `available_in` is wrong, fixed here) or exception; no cloud case is written until then.
  Applied to `GetEnhancementImpl`, `GetEnhancementSpot`, `GetEnhancements` (C8),
  `GetSqlQuery`, `GetTableContents` (C10), and to every other tool listed on the cloud whose
  cloud case cannot be written on a test object.
- **O9 — AMDP and take-over.** None of our systems is non-HANA: the on-premise system is
  S/4HANA and the trial is HANA (a non-HANA 7.40 legacy system is a separate implementation,
  out of scope). The AMDP keys run live on both systems, with no exception.
  `DebugTakeOverListener` uses a second connection of the same user, opened and logged off by
  the test (C15).
- **O10 — leftover sessions: yes, as recommended.** The test makes its own leftover: it starts
  the stdio binary on its destination and opens a session, ends the process without logoff,
  then lists through a new process and logs off only the session it made, matched by its id.
  A leftover it did not make is listed, never logged off. The test asserts the tool's answer,
  not SM04 (C16).
- **O11 — per-value keys: yes.** Each value of a compact tool's `operation` or `action` enum is
  its own coverage key, read from the listed schema like `object_type`. Measured: the compact
  debugger tools use `operation` (`HandlerDebugSession` 13, `HandlerDebugBreakpoints` 6,
  `HandlerDebugStep` 7, `HandlerDebugMaintain` 7 values); `HandlerBatch`, `HandlerDebugBatch`
  (`begin`, `end`, `answers`) and `HandlerSession` (`open`, `close`) use `action`; the
  background-run and leftover tools have neither (C1, C15, C16).
- **O4 / O5 — transport requests.**
  - `CreateTransport` and `CreateTransportTask` get live cases: the test creates a new request
    (and a task in it), records the numbers from the answers, and its cleanup deletes only
    those, empty and never released, then asserts each absent. No exception list.
  - The compact `HandlerTransportCreate` and `HandlerCreate#TRANSPORT` create a request the same
    way and follow the same rule (applied by the controller from the owner's answer, to be
    confirmed by him in review).
  - Every other transport case (add and remove an object, read objects, action log, get, list,
    move, sort and compress) works with **one request named in the config**
    (`coverage_transport.request`); no request is created for it; nothing is released.
  - **The delete path.** No tool deletes a request (`HandlerDelete`'s enum has no
    `TRANSPORT`). adt-clients 42.1.0 has it: `AdtRequest.delete(config, { headers })` and
    `AdtRequest.checkDeletion(config, { headers })`, reached by
    `createAdtClient(connection).getRequest()` — `DELETE /sap/bc/adt/cts/transportrequests/<n>`
    (`core/transport/delete.js`), accepted by ADT only for an empty, unreleased request. The
    test calls it on its own connection. Whether the same `DELETE` removes a task by the task's
    number, and whether a request's empty task must go first, is **measured live before C13**
    (on the request and task one test run creates) and recorded in C13.
- **O12 — config sections: listed here, supplied by the owner.** The controller does not write
  the owner's `tests/test-config.yaml`. Before the first live run of each task (and before step
  18) the owner adds the sections below from the template, with the values named:

  | Section | Values the owner supplies |
  | --- | --- |
  | `environment` | `expected_realm` (the on-premise 401 realm); `default_package` `$TMP` on premise, the development package on the cloud |
  | `create_include`, `include_cloud_read` | an include name free on premise; a delivered include readable on the cloud |
  | `create_table_type` | a free table-type name |
  | `check_class_high` … `check_metadata_extension_high` (the 14 `check_*_high`) | as in the template: the shared objects of `shared_dependencies` |
  | `coverage_activate`, `coverage_check`, `coverage_writes`, `coverage_compact_writes` | free names per type in the `ZMCP_BLD_*` convention (the template proposes them) |
  | `coverage_reads` | an enhancement spot and an enhancement implementation readable on each system (after the discovery check, O7) |
  | `coverage_versions` | per type, one object with two or more versions, per system |
  | `coverage_system` | a transaction code to read |
  | `coverage_runtime` | free probe class and (on premise) probe program names |
  | `coverage_transport` | per system: a transportable package, and `request` — one modifiable request of the test user with a task, used by every transport case but the creates |
  | `coverage_sessions` | a free probe class name; `launch_http: true` for the long sessions |
  | `debugger_handlers` | `second_user_env` (a second user's session file) for the other-user case |

**Nothing is still open.**

### Where each decision is needed first

O4 / O5 → C6's `HandlerCreate#TRANSPORT` live case, then C13 (after the delete-path
measurement). The other decisions apply as named above.

## Live runs and release

18. **The full integration run on both systems,** after the realm check. Every
    integration suite, the coverage suites included, runs once on the on-premise system and
    once on the BTP trial system, each with the owner's go:
    - `npm run test:integration > <log outside the repository> 2>&1`, so the exit status is
      Jest's own; no pipe;
    - the log and the run report stay outside the repository.
    - This is the one run that requires the whole ledger (spec §8, acceptance 3).
    - **Pass:** exit status 0, and `globalTeardown` reports no required key skipped or failed on
      that system.
    - **After a failure:** fix it with a failing test first, then rerun that system whole.
    - The counts per system go into the PR description, with no system name.
18a. **Docs and migration audit after the coverage stage.** Read and fix what the stage made
    stale:
    - `README.md` and `docs/` wherever tests, live runs or the test config are described;
    - `src/__tests__/integration/README.md`: its "Running" section tells to run one integration
      file with `npm test -- --testPathPatterns=integration/...`, but `npm test` ignores
      `__tests__/integration/`; replace with the two scripts (`test:integration`,
      `test:coverage-family`) and `--listTests`; describe `liveSuite` / `liveCall` /
      `expectAbsent` / `expectCleared`, the realm check, the refusal stop and the run report;
      drop the "Cleanup" note that a delete runs as cleanup;
    - `src/__tests__/integration/helpers/testers/README.md` for `HighTester`'s changed role;
    - `tests/README.md` and `tests/test-config.yaml.template`'s header: `expected_realm`, the
      `coverage_*` sections, `$TMP` on premise and the configured package on the cloud;
    - guides and examples that show a test or a config;
    - `CHANGELOG.md` / `MIGRATION-24.0.md`: only for a defect fixed in the stage (spec §8,
      acceptance 4); confirm none else changed.
    Commit as `docs: the test-coverage stage`.
19. Run CI's full step list locally, including the pack, the install check and the images.
    Then run Codex review and CI, and get the owner's review.
20. Delete the goal, spec and plan before the release commit. Put anything they owe into the
    PR description: the owner's decisions (O1–O12), the exceptions the owner granted (none so
    far), the measured transport delete path, the per-system run counts and the config
    sections the owner's file needed. Then wait for the owner's merge and tag, the publish,
    and the registry check.

## Appendix A — implicit any

Measured (step 2): `"noImplicitAny": false` removed from the 13 tsconfigs that state it (the root
`tsconfig.json`, and `tsconfig.json` and `tsconfig.test.json` of `background-runs-memory`,
`responsible-rules`, `server-runtime`, `server`, `http` and `sse`), each package's `test:check` run
(the root's covers `src`, `scripts`, `server-runtime/src` and every `compact*` and `*-ro` package),
then switched back. With it off, every `test:check` is clean, so every error below comes from the
switch. An error a package's run reports in another package's file is counted once, at that file.

| Package | Production: errors (files) | Tests: errors (files) |
| --- | --- | --- |
| `@mcp-abap-adt/lib` (`src`, `scripts`) | 5 (3) | 34 (7) |
| `server-runtime` | 2 (2) | 6 (6) |
| `http` | 0 | 1 (1) |
| `sse` | 0 | 1 (1) |
| `background-runs-memory`, `responsible-rules`, `server` | 0 | 0 |
| every `compact*` and `*-ro` package | 0 | 0 |
| **Total** | **7 (5)** | **42 (15)** |

By code: TS7016 (module without types: `express`) 15, TS7053 (implicit `any` index) 5, TS7006
(implicit `any` parameter) 5, TS2339 24 (one site, below).

Production:

- `src/embeddable/IHttpApplication.ts:1` — TS7016 `express`.
- `src/lib/httpTransport/dnsRebindingProtection.ts:1` — TS7016 `express`.
- `src/lib/strategies/projections.ts:176, 202, 230` — TS7053: a key indexed on `{}` (the
  `Terse<any>` readers' XML values).
- `server-runtime/src/http/StreamableHttpServer.ts:43` — TS7016 `express`.
- `server-runtime/src/sse/SseServer.ts:42` — TS7016 `express`.

Tests:

- `src/__tests__/admin/shared-deps/setup.test.ts:1720` — TS2339, 24 errors at one site: a key read
  from a four-key literal, one error per member of the key's union.
- `src/__tests__/unit/httpTransport/tlsServer.test.ts:4, 29, 64` — TS7016 `express`, and four TS7006
  (`_req`, `res`).
- `src/__tests__/unit/cancel/cancelNothingToSap.test.ts:26`, `src/__tests__/unit/cancel/notToTool.test.ts:25`
  — TS7016 `express`.
- `src/__tests__/unit/connectionLoggerChannel.test.ts:31` — TS7053.
- `src/__tests__/unit/embeddable/plainRegistration.test.ts:546` — TS7006 `e`.
- `src/__tests__/unit/resultSets.test.ts:29` — TS7053.
- `server-runtime/src/http/__tests__/{headerCredentials,healthEndpoint,systemContextOrder}.test.ts`,
  `server-runtime/src/sse/__tests__/{headerCredentials,healthEndpoint,systemContextOrder}.test.ts` —
  TS7016 `express`, one each.
- `http/src/__tests__/exports.test.ts:26`, `sse/src/__tests__/exports.test.ts:26` — TS7016 `express`.

Inference, not measured: while `express` has no types, every value typed by it (`Request`,
`Response`, `NextFunction`, the `express()` app) is `any` without an error, so adding
`@types/express` (step 12) may show further errors in the files that use them.

## Appendix B — undeclared keys

Measured (step 3) by reading the code: every handler a compact route or a compact tool hands the
model's arguments to — the read and part routes (`compactReadRoutes`, `compactPartRoutes`), the
address and run parts of `handleHandlerGet`, the write handlers (`handleCreateOnly`,
`handleUpdateUnderLock`, `handleDeleteOnly`) and each per-type target they call, and every other
`Handler*` tool of `compact-readonly-entries` and `compact-modify` with the handler it calls. For
each, the keys it reads from its arguments (`args.x`, `args['x']`, destructuring, `detailOf(args)`
for `detail`, the dynamic reads of `CLASS_INCLUDES` and `DELETION_NAME_FIELDS`) against the
properties of the schema it is listed with (the step 1 fixture; a tool no binary lists, from its
`TOOL_DEFINITION`).

**A target reads a key its own schema does not declare:**

1. `handleGetObjectStructure` (`src/handlers/system/readonly/handleGetObjectStructure.ts:209-210`)
   reads `object_type` and `object_name` as the fallbacks of `objecttype` and `objectname`. Its
   schema (`GetObjectStructure`) declares `objecttype` (required), `objectname`, `detail`.
   `HandlerGet`'s `part: 'object_structure'` passes exactly `{ object_type, object_name }`
   (`handleHandlerGet.ts:81-84`). Validated against `GetObjectStructure`'s schema, both are
   dropped and `objecttype` is missing: the route must pass `objecttype` / `objectname`, or the
   schema declare the two.
2. `handleGetUnitTestResultOnce` and `handleGetCdsUnitTestResultOnce`
   (`src/handlers/unit_test/shared/resultOnce.ts:38-50`, `readResultOnce`) read `run_id`,
   `detail`, `with_navigation_uris` and `format`. They are reached from `HandlerGet` (`UNIT_TEST`,
   `CDS_UNIT_TEST`) and from `HandlerUnitTestResult` / `HandlerCdsUnitTestResult`.
   - The `TOOL_DEFINITION` of their module, `GetUnitTestResult`, declares `run_id` and `detail`
     only; `GetCdsUnitTestResult` declares all four.
   - `compactUnitTestResultSchema` (both compact result tools) declares `run_id`,
     `with_navigation_uris`, `format`, not `detail`.
   - `HandlerGet`'s schema declares `run_id` only of the four.
   - No tool's entry has the `…Once` function as its handler with a schema of these four, so the
     `UNIT_TEST` / `CDS_UNIT_TEST` routes cannot be "the target tool's entry" as they are (step 9).
   - The full `handleGetUnitTestResult` (same module, line 40) reads `with_navigation_uris` and
     `format` too, which `GetUnitTestResult` does not declare.
3. `handleCreateOnly` (`src/handlers/common/low/handleCreateOnly.ts`) reads `detail` (`ALWAYS`,
   `detailOf` in `createAlone` and the `INCLUDE` branch); `HandlerCreate` declares no `detail`, so
   over MCP it is always dropped and the answer always terse.
4. `handleUpdateUnderLock` reads `part` for every type (`partRefusal`, line 106). `HandlerUpdate`
   declares `part` on onprem, not on cloud.

**`detail` read by a target, not declared by the compact tool that hands it the arguments**
(declared by the target's own tool; over MCP the compact path is always terse):
`HandlerTransportCreate` → `handleCreateTransport`, `HandlerTransportMoveObjects` →
`handleMoveTransportObjects`, `HandlerTransportSortAndCompress` →
`handleSortAndCompressTransportTask`, `HandlerServiceBindingValidate` →
`handleValidateServiceBinding`, `HandlerUnitTestStatus` → `handleGetUnitTestStatus`,
`HandlerCdsUnitTestStatus` → `handleGetCdsUnitTestStatus`, and the two result tools of item 2.
`HandlerGet` declares no `detail` either; of the targets it reaches, `GetPackage`,
`ReadTransportObjects`, `GetVirtualFoldersLow`, `GetObjectStructure` and the two `…Once` result
reads read it, each declaring it in its own schema.

**Checked, every key declared by the target's own schema:** `GetPackage`, `GetDomain`,
`GetDataElement`, `ReadTransportObjects`, `GetTable`, `GetStructure`, `GetTableType`, `GetDdl`,
`GetServiceDefinition`, `GetServiceBinding`, `GetClass`, `GetLocalTestClass`, `GetLocalTypes`,
`GetLocalDefinitions`, `GetLocalMacros`, `GetProgram`, `GetInclude`, `GetInterface`,
`GetFunctionGroup`, `GetFunctionModule`, `GetBehaviorDefinition`, `GetBehaviorImplementation`,
`GetMetadataExtension`, `GetMainPrograms`, `GetPackageContents`, `GetServiceBindingPreviewUrl`,
`GetVirtualFoldersLow`, `GetNodeStructureLow`; `CreatePackage`, `CreateTransport`, `CreateTable`,
`CreateDdl`, `CreateClass`, `CreateProgram`, `CreateInclude`, `CreateInterface`,
`CreateFunctionModule`; `UpdateTableLow`, `UpdateStructureLow`, `UpdateDdlLow`, `UpdateClassLow`,
`UpdateProgramLow`, `UpdateInterfaceLow`, `UpdateFunctionModuleLow`,
`UpdateBehaviorDefinitionLow`, `UpdateMetadataExtensionLow`; `SearchObject`, `GetWhereUsed`,
`GetSqlQuery`, `GetTableContents`, `RuntimeCreateProfilerTraceParameters`,
`ListServiceBindingTypes`; `handleDeleteOnly` against `HandlerDelete`; every `Handler*` tool's
own reads against its own schema.

**No schema of their own:** `handleGetActivationStatus` / `handleGetActivationResults` (read
`run_id`, called with `{ run_id }` built by `HandlerGet`), `handleStartUnitTestRun` (reads what
`HandlerUnitTestRun` declares), `handleDeletionCheck` (reads `object_type`, `object_name`, both
declared by `HandlerDeletionCheck`).

**Values:** every target with a `part` lists `source` and `metadata`, the two values the compact
passes it; a target without `part` drops it.

How it was read, and its limit: the keys come from the handlers' source, by reading each
target and a scan of its module for `args.x`, `args['x']` and destructuring; a key a helper of
another module reads from a passed `args` was followed only for `detailOf`, `readPartOf`,
`readResultOnce` and the in-module helpers named above.
