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

The stage runs after step 17 and before step 18. It is written as tasks C1, C2, C2a–C2e, then the defect stage D1–D25 (spec §9), then C3–C16, each with
its own steps. The owner's decisions are recorded at the end of this section ("Owner's decisions
and open items") and applied in the tasks; O1–O12 and the findings (a) and (b) are decided;
nothing is open.

**Global constraints.** Every task's requirements include these:
- **Commands.** npm scripts only. Never `npx`, `npm exec`, `node_modules/.bin` or `ts-node`.
- **Integration runs: two kinds, each by its npm script.**
  - **Targeted (a family, C3–C16):** `npm run test:coverage-family -- <live file> [<live file>…]`.
    - The new script carries `test:integration`'s flags **except** its
      `--testPathPatterns=integration` (Jest ORs that with the positional paths, so naming the
      activation file also selected `DebuggerHandlers.test.ts`) and its `--passWithNoTests`
      (a path that selects nothing must fail): `jest --testPathIgnorePatterns='__tests__/admin/'
      --runInBand --forceExit` plus the reporter (C2), the given paths its only selection.
    - **Allowed paths.** `globalSetup` reads the run's selection (`globalConfig.testPathPatterns`)
      and refuses to start unless each is the exact repository path of an existing file under
      `src/__tests__/integration/` ending `.test.ts`, compared as strings (no regex); a
      directory, a fragment or a pattern is refused before anything logs on.
    - Its `globalTeardown` checks only the keys of the files that ran (spec §8, acceptance 3);
      the rest of the ledger is not required.
  - **Full acceptance (step 18 only):** `npm run test:integration`. Its `globalTeardown`
    requires every key the ledger requires on that system.
  - The teardown tells them apart by the running script's name (`npm_lifecycle_event`), so no
    flag or variable chooses the scope.
  - Name the files with `--listTests` first, and check the list is exactly the requested files.
    Never add `--testPathPatterns` /
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
- **Every task ends green,** the guard test included: it is a ratchet over
  `src/__tests__/unit/coverage/coverage-debt.json`, the keys still missing (O1, decided). Each
  family is pushed as it lands. Green means:
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
- [ ] **Remove its covered keys from `coverage-debt.json`.** Delete the family's keys from the
  list. Run the guard again: PASS, the ratchet naming no key.
- [ ] **Run the family live.** With the owner's go, after the realm check (C2), run
  `npm run test:coverage-family -- <live file> > <log outside the repository> 2>&1` on the
  on-premise system, then on the cloud system. The exit status is 0, the family's keys are
  reported passed, and nothing the test did not create is touched.
- [ ] **Commit** the family as `test(coverage): <family> pinned and live`. Push it at once (O1): the
  guard is green with the shorter debt.

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
  - `package.json` and `package-lock.json`: unchanged (controller ruling): Jest's
    discovery is `runCLI` of `jest` itself, which re-exports it; no `jest-config` or
    `@jest/core` devDependency.

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
    - **Two-dimension tools have a declared table; no product is taken.** Only `HandlerGet` and
      `HandlerUpdate` declare two key dimensions (`object_type` and `part`); a third tool that
      does fails `requiredKeys` until its table is declared.
    - The typed `HandlerGet` pairs come from `compactReadRoutes` / `compactPartRoutes`.
    - `HandlerUpdate`'s legal keys (`handleUpdateUnderLock.ts`: `partRefusal` refuses a `part`
      on any type outside `PART_TYPES`, which is `INCLUDE`, and any part but `source` /
      `metadata`): `HandlerUpdate#<type>` with `part` omitted, for every type of the
      variant's enum (`INCLUDE` included: it writes the source), plus `HandlerUpdate#INCLUDE#source`
      and `HandlerUpdate#INCLUDE#metadata` where the variant lists `INCLUDE` (on premise).
      `coverageKeys.ts` imports `PART_TYPES` and declares the include parts beside it; a test,
      `'every HandlerUpdate combination outside the table is refused'`, calls the entry with
      each other type × part on `recordingConnection` and expects the `partRefusal` words and
      zero requests, so the table cannot drift from the handler.
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
  - `interface PinCase { tool: string; variant: SystemKind; stand: 'recording' | 'adtStandIn' | 'server'; setup?: PinSetup; args: ToolArgs; bind?: Readonly<Record<string, Binding>>; answers?: ReadonlyArray<Partial<IAdtWireResponse> | undefined>; before?: ReadonlyArray<{ tool: string; args: ToolArgs; bind?: Readonly<Record<string, Binding>> }>; refusal?: 'answer' | 'thrown'; expected: readonly PinnedRequest[] | 'none' | 'nothing-sent'; ran?: (answer: McpResult) => void }`.
    - The key is `keyOf(tool, args)`. There is no separate type or part field.
    - `before` holds the calls that make the state the tool needs, in the same server. Their
      requests are not part of `expected`.
    - **Response binding.** `interface Binding { from: number; field: string }`: the argument
      takes the named field of the answer of `before[from]` (a state handle, a run id, a
      debuggee id, a leftover id). `bind` may never name `object_type`, `part`, `operation` or
      `action`: key-bearing fields stay in the `args` literal (the guard refuses a fixture
      that binds one).
    - **Fixture setup.** `type PinSetup = 'leftover-session'`: a closed list, each made by the
      existing helper before the server starts (`leftoverSession.ts` writes the leftover file
      C16 needs). A background run's record is made by an earlier call of the same case
      (`before`), not by a setup. A new setup is a new member of the union, in this file.
    - `'none'` (a tool that sends nothing on success) requires `ran`: it asserts the tool's own
      result is in the answer, and is legal only for the tools C1 Step 1 lists.
    - `'nothing-sent'` is legal only with `refusal: 'thrown'`: the call throws with
      `invalidArgumentsWords`' text and nothing is recorded. It needs no `ran`, is exempt from
      the request-free list, and never counts for its key.
    - **Deterministic inputs.** Before a case sends, `pinCases` fixes every clock and random
      source the case can reach, and restores each after the case (`afterEach`, also on a
      failure), so the whole recorded request stays the literal. The fakes are installed
      **before** the stand, the connection and `pinServer` are built: `InstanceState` captures
      its random source at construction, so a server built first would keep the real one.
      - **Clock.** `jest.useFakeTimers({ now: PIN_EPOCH, doNotFake: [every timer API but
        'Date'] })` fixes `Date` (`Date.now()`, `new Date()`) and leaves timers, ticks and
        I/O real; `jest.useRealTimers()` restores it. `PIN_EPOCH` is one constant in
        `pinCases.ts`.
      - **Random ids and bytes.** `jest.spyOn` on the `node:crypto` module object replaces
        `randomUUID` and `randomBytes` with seeded sequences (`seededCrypto(caseKey)`), and
        on `Math` replaces `random`; `jest.restoreAllMocks()` restores them. Each replacement
        is typed against the function's own declared type (`typeof randomUUID`, the
        `randomBytes(size): Buffer` overload, `typeof Math.random`) with no cast; if an
        overload cannot be replaced without one, the case stops and is reported to the
        controller. The spies reach the call sites because each calls through the module
        object (`node_crypto_1.randomUUID(...)` in the compiled packages, `crypto_1.…` in the
        server compiled by ts-jest).
      - **Repeat recording.** Every case runs twice — a fresh stand, the same seeds — and the
        two recordings must be byte-equal (method, URL, every header, body bytes) before
        either is compared with `expected`. A pin whose two recordings differ fails, naming
        the first differing field.
      - **The sources found** (grep of `node_modules/@mcp-abap-adt/*/dist` and of every
        package's production `src`, at `755f2605`, for `Date.now(`, `new Date(`,
        `Math.random`, `randomBytes`, `randomUUID`, `getRandomValues`, `performance.now`,
        `process.hrtime`):
        - reaching the wire: `connection` — `AbstractAbapConnection.js` (`sap-adt-request-id`,
          session id), `HttpTransport.js` (`sap-adt-request-id`; a cookie-expiry `Date.now()`),
          `CloudHttpTransport.js:88` (`?_=Date.now()`), `RfcTransport.js` (conversation id);
          `adt-clients` — `core/shared/discovery.js` (request id), `batch/wire.js` (boundary,
          request ids), `utils/systemInfo.js:100` (`_: Date.now()`),
          `runtime/debugger/passport.js:43` (`randomBytes`), `clients/AdtClientsWS.js`
          (correlation id, timestamps); the server — `src/lib/systemInformation.ts:75`
          (`_: Date.now()`), `src/lib/debugger/ids.ts:23` (`randomBytes`),
          `src/lib/debugger/AmdpSession.ts` (`randomUUID` client ids),
          `src/lib/state/InstanceState.ts` (`randomBytes`, injectable),
          `background-runs-memory` (`randomBytes` handles),
          `src/lib/leftoverSessions/LeftoverSessions.ts` (`randomBytes` ids; `now` injectable),
          `src/lib/backgroundRuns/run.ts` (`now` injectable),
          `src/lib/search-source/orchestrator.ts` (a `Date.now()` time budget),
          `src/lib/utils.ts` (a fallback session id);
        - not reaching the wire, fixed all the same by the same fakes: log timestamps
          (`src/lib/logger.ts`, `src/lib/utils.ts`), `auth-providers` (token expiry, PKCE,
          SAML ids, replay store), `auth-stores` (file lock, temp file names), `auth-broker`
          (expiry), `feedPages.ts` (a date computed from its input).
        - `performance.now` and `process.hrtime`: no use found.
        A new source a later dependency adds shows as a failing repeat recording.
      - `adtStandIn` binds a port fixed per pin file (a constant in the file, one per file,
        from a range kept for pins), so the `Host` header is constant; a busy port fails the
        case — no retry, no fallback port;
      - a varying field found while writing a pin that neither covers is reported to the
        controller before the pin is committed; it is never removed from the recording.
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
        that nothing was recorded (`expected: 'nothing-sent'` is required with it). A refusal
        row is supplemental: the guard does not count it for its key.
    - It must be called in executable Jest scope (top level, or a `describe` callback); the
      guard refuses a call inside a function nothing calls.
- **`pinServer.ts`**
  - `pinServer(variant: SystemKind, stand: AdtStandIn): Promise<PinServer>`, where
    `interface PinServer { call(tool: string, args: ToolArgs): Promise<McpResult>; close(): Promise<void> }`.
  - It runs the full or compact tool set in process, through the server's own dispatch
    (`BaseMcpServer`'s, background branch included), on an in-memory MCP transport against the
    stand-in. The existing helpers are reused: `batchHarness.ts`, `batchStand.ts`,
    `leftoverSession.ts`, and the background-runs memory port.
  - Handles (the batch's state handle, a run id, a listener, a long-session handle) reach a
    later call only through `bind` from the answers of `before`; `setup` makes what must
    exist before the server starts.
- **`live.ts`**
  - `liveSuite(systems: readonly SystemKind[], title: string, body: () => void): void`.
    Without a config, or on a system it does not name, it skips and logs the reason.
  - `liveCall(tool: string, args: ToolArgs): Promise<LiveAnswer>`
    - soft mode: the entry's `call`; for the server-dispatched tools, an in-process server on
      the live connection; hard mode: the MCP tool;
    - it refuses before sending once the run's credential-refusal marker exists;
    - it records the key against the current test's full name
      (`expect.getState().currentTestName`) in the run's call log. Whether the key passed is
      not decided here: see `coverageReporter.ts`.
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
    the order C2a measured, then asserts each absent with `GetTransport`.
  - **Reconciliation of a refused create — prepare, call, reconcile.** adt-clients'
    `AdtRequest.create` is one `POST` carrying the request and its first task; when SAP
    refuses the task part it still keeps the request header — empty, with no task — and the
    call answers the refusal with no number (measured on premise, `AdtRequest.d.ts`), so the
    number never reaches the journal. The create itself stays a directly awaited `liveCall`
    in the test body (the guard's rule is unchanged); the helpers sit around it:
    - `prepareRequestCreate(): Promise<RequestCreatePlan>` — before a **request** create: a
      **unique run description** (the run id, random per run and written in the run report,
      and a per-create counter; no user, no system) and an **inventory** of the test user's
      modifiable requests through the served tool `ListTransports` (`user`,
      `modifiable_only: true`), whose answer carries each request's description.
    - `prepareTaskCreate(parent: string): Promise<TaskCreatePlan>` — before a **task**
      create, only under a test-owned, journalled parent request: the parent's task numbers
      through `GetTransport(parent)`. Tasks carry no description (`CreateTransportTask` has
      no description argument; the client's task `POST` sends the parent, the user and the
      action), so no description is matched for them.
    - the test body then awaits `liveCall('CreateTransport', { description: plan.description,
      … })` (or the task / compact create) directly.
    - `reconcileRequestCreate(plan, answer): Promise<void>` and
      `reconcileTaskCreate(plan, answer): Promise<void>` — on success, record the returned
      number at once (`recordCreatedRequest`). On a **non-credential** failure:
      - a request: list again and journal only requests that are **new against the
        inventory AND carry that exact description** (the description from the listing, or
        from `GetTransport` of a new number);
      - a task: `GetTransport(parent)` again and journal only the task numbers that are new
        against the parent's earlier list;
      - what is journalled is cleaned up in the standard order; the failure still fails the
        case.
      After a **credential** refusal: nothing more is sent, and the description (for a task,
      the parent's number) goes to the run report.
    - **Best effort, stated.** Reconciliation claims no completeness and adds no search
      machinery: it looks only at `ListTransports(user, modifiable_only)` and the parent's
      task delta. If a refused request create leaves nothing identifiable there, the case
      **fails** and the run report names the unique description so the owner can remove what
      is left. This limit goes into the PR description's debts list (step 20).
    Tests (`live.test.ts`, on `adtStandIn`):
    - `'a refused request create leaves an empty request that is found by its description
      and journalled'`;
    - `'a new request with another description is never journalled'`;
    - `'a pre-existing request whose description merely looks like the run's is never
      journalled'` (it is in the inventory);
    - `'a refused task create's leftover task is found by the parent's task delta and
      journalled'`;
    - `'an unidentifiable leftover fails the case and reports the description'`;
    - `'after a credential refusal nothing is listed and the description is reported'`.
  - `recordTransportEntry(entry: { request: string; task: string; object: TransportObjectRef }): void`
    — the **journal** of every transport entry the test made (an object added to a task, an
    entry moved), recorded at once when the call that made it succeeds. Deleting an object
    does not empty its task (`TransportObjectToolsCrud.test.ts`), so `deleteRecordedRequests`
    works in this order, because deleting the object may itself add a transport entry
    (`TransportObjectToolsCrud.test.ts`, around line 362):
    1. delete the recorded object first (`deleteRecorded`);
    2. then detach every entry of that object (`RemoveTransportObject`) from every task it is
       on — the journalled ones and any the delete added — across the configured request
       and the created ones;
    3. verify the final state (`ReadTransportObjects`): the configured request back as it
       was, the created ones empty;
    4. only then delete the recorded tasks and requests, asserting each absent.
    The refusal stop applies: after a credential refusal nothing is sent and what is left is
    named.
- **`ledgerScan.ts`**
  - `scanUnitFile(path: string): readonly PinRef[]`
  - `scanLiveFile(path: string): readonly LiveRef[]`
  - Both use the TypeScript compiler API only (`ts.createSourceFile`, a node walk), and both
    compute the key with `keyOf` from the `tool` and `args` literals.

**Steps:**
- [ ] **Step 1: Write `coverageLedger.test.ts`.**
  - `'the served list is the listed-schema fixture'`: `servedTools()` lists the onprem and
    cloud variants only, so it is compared with the **onprem/cloud projection** of each tool's
    `listedBy` in `fixture.schemas` (its `legacy …` entries dropped): per tool, the set of
    binary-and-variant pairs serving it equals that projection; 315 tools; no served tool
    outside `fixture.schemas`. The legacy listings stay checked where they are today
    (`toolSet/listedSchemas.test.ts`), not here.
  - `'every required key has a ledger row'` and `'every ledger row is a required key'`: two set
    differences, each expected `[]`, with the missing keys printed.
  - `'each row names exactly the systems its key requires'`.
  - `'each unit reference is a pinCases row of that key'`: `scanUnitFile(row.unit)` holds a ref
    whose `keyOf(tool, args)` equals the key, with a variant per required kind.
  - `'each unit reference is a test file the default unit command runs'`: the list of files
    `npm test` runs is taken from Jest's own discovery — `runCLI` of `jest` on the root
    configuration with `listTests` (written to a temporary `outputFile`): Jest reads the
    configuration and filters with its own `roots`, `testMatch` `**/__tests__/**/*.test.ts`
    and `testPathIgnorePatterns` `__tests__/admin/`, `__tests__/integration/` — and every
    `unit` path of the ledger must be in it. No pattern of our own is evaluated.
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
  - `'no registration is skipped'`: `ledgerScan` refuses a `pinCases`, `liveSuite` or
    `liveCall` under `describe.skip`, `xdescribe`, `it.skip`, `test.skip`, `xit`, `xtest`,
    `it.todo` / `test.todo`, or inside any enclosing suite that is skipped, and refuses any
    `.only` in a scanned file (it skips the rest).
- [ ] **Step 2: Write one fixture per refusal and a test that each is refused,** each by its
  own check alone. The refusals:
  - a missing row; an extra row; a missing system; an extra system;
  - a served list with a tool's binary set differing from its `listedBy`;
  - `expected: []`; a spread or computed request; a non-literal `url`; a request with a fifth
    key;
  - a relabelled pin: the ledger key differs from `keyOf(tool, args)`;
  - a dormant registration: `pinCases` (or `liveSuite`) inside a function nothing calls;
  - a skipped registration, one fixture each: `describe.skip`, `xdescribe`, `it.skip`,
    `test.skip`, `xit`, `xtest`, `.todo`, a `pinCases` / `liveSuite` nested in a skipped outer
    `describe`, and an `.only` beside it;
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
  - a unit file under `integration/`;
  - a helper file that is not a test (`*.ts`, not `*.test.ts`) holding a top-level `pinCases`;
  - a test file under an ignored path (`__tests__/admin/`).
- [ ] **Step 3: Write `pinCases`' own unit tests** (`src/__tests__/unit/coverage/pinCases.test.ts`).
  - `'refuses an empty expected'`.
  - `'refuses a tool the variant does not serve'`.
  - `'fails when one request more is recorded than expected'`.
  - `'a none case fails when the tool never ran'`: a stub tool that returns before doing
    anything; `ran` sees no result.
  - `'a none case fails when the tool sends a request'`.
  - `'a thrown refusal is asserted as thrown, with zero requests'`: a case that sends before
    throwing fails; `'nothing-sent'` without `refusal: 'thrown'` fails.
  - `'the fakes are installed before the server is built'`: `InstanceState` captures its random
    source at construction (`options.randomSource ?? randomBytes`), so `pinCases` installs the
    clock and random fakes before it builds the stand, the connection or `pinServer`; a case
    that builds one first fails its repeat recording.
  - `'two runs of one case record the same requests'`: the seeded ids and the fixed port make
    the recording identical.
  - `'a binding reads the earlier answer'` and `'a binding of a key-bearing field is refused'`.
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
  - Red baseline (Measured at C1): 620 required keys missing — 589 required on both
    systems, 31 on premise only; 324 keys of full tools, 296 of compact tools; 315 tools.
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
  - `src/lib/connectionFactory.ts` (`createAbapConnection`'s declared return type; and
    `withHttpWireLog` if it must become generic).
  - `src/__tests__/unit/embeddable/connectionSource.test.ts`,
    `src/__tests__/unit/embeddable/dispose.test.ts` (the two mocks).
  - `src/__tests__/integration/helpers/testers/hardMode.ts` (Step 4b).
  - The Jest configuration: add `globalTeardown` for the integration runs.
  - `package.json`: the script `test:coverage-family` (C1's global constraints), the
    reporter added to it and to `test:integration`, `build:test-reporter`,
    `check:test-reporter`, and the three `pre…` scripts that run the build (`pretest`,
    `pretest:integration`, `pretest:coverage-family`).
  - `tsconfig.reporter.json` (new) and `.gitignore` (`build/test-reporter/`).
- Create:
  - `src/__tests__/integration/helpers/realmCheck.ts`
  - `src/__tests__/integration/helpers/launchedServers.ts` (Step 4a)
  - `src/__tests__/integration/helpers/runReport.ts`
  - `src/__tests__/integration/globalTeardown.ts`
  - `src/__tests__/integration/coverageReport/coverageReporter.ts` and
    `src/__tests__/integration/coverageReport/reportFormat.ts` (the run report's shape, which
    `runReport.ts` imports): the reporter imports nothing else of the repository, so
    `tsconfig.reporter.json` has `rootDir` `src/__tests__/integration/coverageReport` and
    `outDir` `build/test-reporter` — the output is exactly
    `build/test-reporter/coverageReporter.js`, no nested path.

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
- **`src/__tests__/integration/coverageReport/coverageReporter.ts`** — a Jest reporter, named in
  `test:integration` and `test:coverage-family` (`--reporters=default
  --reporters=./build/test-reporter/coverageReporter.js`).
  - **Compiled before it is loaded.** Node loads a reporter itself, outside ts-jest, and
    `src/__tests__` is not in the build. So `npm run build:test-reporter`
    (`tsc -p tsconfig.reporter.json`: this one file and what it imports, out to the gitignored
    `build/test-reporter/`) runs first, as the `pretest:integration`,
    `pretest:coverage-family` and root `pretest` scripts — the last because `npm test` runs
    C2's reporter fixture tests, which load the compiled file. No ts-node, no npx.
  - `onTestCaseResult(test, result)` joins the test's full name with the call log and records
    each key's outcome from Jest's **completed** result (`result.status`) — after the test's
    `afterEach` hooks and after `expect.assertions` is checked, which a hook of the test
    itself cannot see.
  - `globalTeardown` reads what the reporter wrote.
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
  - `'a key whose test failed after the call is reported failed'`;
  - `'a key whose afterEach cleanup fails is reported failed'`;
  - `'a key whose test misses its expect.assertions count is reported failed'`.
  These run the **exact reporter command** of the scripts on fixture test files: the
  compiled `build/test-reporter/coverageReporter.js` (built by `npm run build:test-reporter`
  first), passed to `runCLI` in process as `reporters: ['default', '<that path>']`, no SAP.
  - `'globalSetup refuses a selection that is not an exact integration test file'`: a
    directory, a fragment, a non-test path — each refused before any logon.
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
  - `'within one tool call nothing follows a refused request'`: an update under a lock on
    `adtStandIn` with a credential that cannot renew (basic) — LOCK answered, the `PUT`
    answered `401` — records exactly LOCK and PUT: no UNLOCK (`withLock.ts` tries one after
    the body's failure), no activation, no logoff over the refused session; the call fails and
    the marker exists;
  - `'a terminal refusal on a sibling connection stops every connection'`: a guarded
    connection opens a sibling through `openFreshConnection` (as the debugger listener does);
    the stand answers the sibling's request `401` with a basic credential; the marker exists,
    and neither the sibling nor the first connection sends anything after it;
  - `'a sibling of a guarded connection is guarded'`: `openFreshConnection` on the wrapper
    succeeds (no `fresh_connection_unavailable`) and returns a guarded connection;
  - `'a renewed credential latches nothing'`: a credential that renews — the `PUT` answered
    `401`, the connection renews and resends, the stand answers `200` — the call succeeds, the
    UNLOCK follows, and no marker exists;
  - the same with the first refusal on a read and on a cleanup request.
- [ ] **Step 4: Implement.**
  - `globalSetup` calls `realmCheck` before it builds the factory, and rethrows a credential
    refusal after writing the marker. A setup without config still returns at once.
  - Every connection-creation helper checks the marker first, and writes it on a logon refusal
    (a `401` at logon, a broker refusal).
  - **The interception sits at the connection.** Every connection the test helpers create
    (`openConnections.ts`, the testers, `sessionHelpers.ts`, `debuggerCleanup.ts`, C2a's and
    C2b's measurement connections, the in-process live server `liveCall` uses) is wrapped
    once by `refusalGuardedConnection` (new, in
    `src/__tests__/integration/helpers/refusalGuard.ts`).
    - **Its type.** `IAbapConnection` has no `disconnect`, and `@mcp-abap-adt/connection`
      19.1.0 does not export `AbstractAbapConnection` from its root. The guard is based on
      the root's exported `CreatedConnection` (what `createConnection` returns):
      `type GuardedConnection = Pick<CreatedConnection, 'connect' | 'makeAdtRequest' | 'disconnect' | 'flushGoodbye' | <the accessors the helpers read>>`
      and `refusalGuardedConnection(connection: CreatedConnection, sibling: () => CreatedConnection): GuardedConnection`
      builds a plain object delegating each member — no cast, no subclass.
    - **A step first, so the type reaches the helpers without a cast.** `createAbapConnection`
      (`src/lib/connectionFactory.ts`) declares `IAbapConnection` as its return type although
      every branch returns `createConnection(…)` (or `withHttpWireLog(createConnection(…))`).
      Its declared return type becomes `CreatedConnection`, provided `withHttpWireLog` keeps
      the type (made generic over its argument if it does not); a test-type check
      (`__typechecks__`) proves the helpers receive `CreatedConnection`.
    - **Two typed mocks break and are migrated in the same step.**
      `src/__tests__/unit/embeddable/connectionSource.test.ts` (around line 69) and
      `src/__tests__/unit/embeddable/dispose.test.ts` (around line 106) mock
      `createAbapConnection` with an `IAbapConnection` double; with the narrower return they
      fail to compile (TS2345). Each is rewritten to return a concrete connection —
      `createConnection(…)` of `@mcp-abap-adt/connection` over a spec pointing at
      `adtStandIn` (or `recordingConnection`'s stand), never sending unless the test asks — so
      the double is a real `CreatedConnection`, with no cast. Their assertions stay as they
      are. C2's gate includes the full `npm run test:check`. It is a production type change, named in the CHANGELOG with the
      rest of 24.0.0's exported types if `createAbapConnection` is exported (it is checked at
      the step).
    - **Siblings are guarded too.** `openFreshConnection` (`src/lib/packageSessions.ts`) finds
      how to make a sibling by the connection object's identity — `siblingRecordOf` for one
      the factory built, `hostFactories` for an injected one — so a plain wrapper gets
      `fresh_connection_unavailable`, and the debugger, background runs and package locks open
      siblings. So `refusalGuardedConnection` registers, for the wrapper object, a fresh
      factory (`registerFreshConnectionFactory(guarded, factory)`, the exported registry) that
      builds the sibling through `sibling()` — `createAbapConnection` with the same settings
      and credential — and returns it wrapped the same way, registered in turn. Every
      connection a guarded one spawns is guarded.
    - **What it guards.** `connect`, `makeAdtRequest` and `disconnect` explicitly: each first
      checks the marker and refuses without sending once it exists.
    - **When it latches.** When a call **ends** in a credential refusal — after the
      connection's own recovery failed or was impossible. The connection's own renewal and
      resend inside `connect` / `makeAdtRequest` (a `401`, the credential renewed, the request
      resent, a `200`) is designed behaviour and latches nothing; a basic-auth connection does
      not resend, so its `401` ends the call refused. From the latch on, nothing is sent:
      within one tool call no further request (an UNLOCK, an activation, a logoff) leaves.
  - `liveCall`, `deleteRecorded`, `expectNameFree`, `expectAbsent`, `expectCleared` and the
    debugger and session helpers still check the marker before they start.
  - `globalTeardown` compares the run report with `coverage-ledger.json` for the configured
    system kind, in the scope of the running script.
- [ ] **Step 4a: Launched servers (no test hooks in production code).** A server the tests
  launch as a child (stdio, Streamable HTTP; `hardMode.ts`, the leftover and long-session
  cases) is not wrapped — its connections are its own. Instead, in
  `src/__tests__/integration/helpers/launchedServers.ts` (new):
  1. **Logged on first.** Immediately before launching a child, the parent's own guarded
     connection with the same credentials has logged on successfully in that run
     (`connect()` answered); a refusal there latches the marker and nothing is launched.
  2. **Every child answer is read.** The parent reads each answer the child returns; when it
     reports a credential refusal (the answer's refusal kind, as the server words it), the
     parent latches the marker, stops that child, and launches and sends nothing more.
  3. **The residual, stated openly.** Inside one child call, the child server's own follow-up
     (an UNLOCK after a failed write, its logoff) may still be sent once after the refusal:
     the parent cannot stop it without hooks in production code. It goes into the PR
     description as an accepted residual for the owner (step 20).
  Tests (`src/__tests__/unit/coverage/launchedServers.test.ts`, a real child process of the
  stdio binary against `adtStandIn`):
  - `'a terminal refusal answer stops every later launch and send'`: the stand answers `401`
    to a basic credential on the child's call; the parent latches, the next launch and the
    next call send nothing;
  - `'a renewing credential's success does not latch'`: `401`, renewed, `200`; the call
    answers success and no marker exists.
- [ ] **Step 4b: The hard-mode launcher without built-in limits** (a prerequisite of every
  hard-mode and launched-server case). `src/__tests__/integration/helpers/testers/hardMode.ts`
  waits for health with 120 attempts of 250 ms (around line 163) and kills with a 60 s timer
  (around line 182). Replace both:
  - **Readiness**, raced against the child's exit event; no polling, no timer, no hook in
    production code; Jest's test timeout is the only deadline:
    - **stdio:** the server writes no ready line (`StdioServer.start`,
      `server-runtime/src/stdio/StdioServer.ts`; the launcher), so readiness is the answer to
      the MCP `initialize` request the test sends over the child's stdin — the child is ready
      when that answer arrives on stdout;
    - **HTTP:** the listening line the server already writes, read from the child's captured
      stderr.
    An exit before readiness rejects at once with the exit code and the captured stderr.
  - **Termination** at the test's end by a signal (`SIGTERM`), then a wait for the exit
    event; no forced-kill timer.
  - Tests first, on fake children (small node scripts the test launches via
    `process.execPath`):
    - stdio: `'ready when the initialize answer arrives, without a timer'` (the fake answers
      the `initialize` it reads on stdin) and `'an exit before the initialize answer rejects
      at once'`;
    - HTTP: `'ready when the listening line arrives, without a timer'` and `'an exit before
      the listening line rejects at once'`;
    - `'stop waits for the exit event and sets no timer'`.
- [ ] **Step 4c: The hard-mode launcher starts the real binaries (a defect fixed here).**
  Today `hardMode.ts` (around line 84) runs `server/dist/launcher.js`, which only exports
  functions, and both of its branches pass the removed `--transport` flag; HTTP needs its own
  binary and header credentials. So hard mode cannot start a server at all — a defect of the
  test code, fixed in this step, with the failing real-binary checks below written first.
  - **Entrypoints, from the packages' `bin` fields** (read at the step, never guessed): stdio
    `mcp-abap-adt` → `server/bin/mcp-abap-adt.js` (`@mcp-abap-adt/core`); Streamable HTTP
    `mcp-abap-adt-http` → `http/bin/mcp-abap-adt-http.js` (`@mcp-abap-adt/http`); SSE
    `mcp-abap-adt-sse` → `sse/bin/mcp-abap-adt-sse.js`. Each runs from the build
    (`npm run build` first), started with `process.execPath` and the bin path.
  - **Full or compact, by the tools the case calls.** The full binaries do not serve the
    compact tools C16 and the compact families need (`HandlerSession`, the compact leftover
    and background-run tools, every `Handler*`). So `hardMode.ts` takes the set as a choice —
    `'full' | 'compact'` — and starts the compact binary for the compact set, from the
    compact packages' `bin` fields: stdio `mcp-abap-adt-compact` →
    `compact/bin/mcp-abap-adt-compact.js` (`@mcp-abap-adt/compact`); Streamable HTTP
    `mcp-abap-adt-compact-http` → `compact-http/bin/mcp-abap-adt-compact-http.js`
    (`@mcp-abap-adt/compact-http`); SSE `mcp-abap-adt-compact-sse` →
    `compact-sse/bin/mcp-abap-adt-compact-sse.js` (`@mcp-abap-adt/compact-sse`).
  - **Arguments:** only what each binary's own help (`--help`) and its launcher's option
    parser accept, read at the step and listed in `hardMode.ts`' doc comment; no
    `--transport`.
  - **The system kind, passed explicitly.** `hardMode.ts` (around line 117) drops
    `SAP_SYSTEM_TYPE` from the child's environment, and an HTTP server does not infer the
    kind: `server-runtime/src/http/launcher.ts` exits before listening without it ("the
    system kind is required, never guessed: stated by `--system-type`, `SAP_SYSTEM_TYPE` or
    YAML `system-type`"). Every child — stdio and HTTP, full and compact — gets
    `--system-type=<kind>` from `configuredSystemKind()`, never a default.
  - **The kind resolver has no default.** `getSystemType()` (`configHelpers.ts`, around line
    804) ends `return isCloudConnection() ? 'cloud' : 'onprem'` — a silent `onprem` when
    nothing states the kind, a test-code defect fixed in this step:
    - new `configuredSystemKind(): SystemKind | 'legacy' | undefined` in `configHelpers.ts`
      (named apart from production's `statedSystemKind(value)` in `src/lib/systemKind.ts`,
      which maps `legacy` to `onprem` and stays untouched; the test helper keeps `legacy`
      distinct)
      returns the kind only from explicit statements — `environment.system_type`, then
      `SAP_SYSTEM_TYPE` in the environment or the session file — and `undefined` otherwise. A
      credential type is not a statement of the kind: a JWT session states nothing (the
      owner's rule, configuration is never guessed);
    - the spawning path (`hardMode.ts`, `launchedServers.ts`) uses it and refuses before
      spawning when it answers `undefined`, naming what to set;
    - `getSystemType()` becomes `configuredSystemKind()` or a thrown refusal with the same words —
      no default for any caller. Its callers, which get the same no-default treatment and are
      checked in this step (each skips with its reason, or fails, where no kind is stated —
      never runs as onprem by default): `configHelpers.ts`' `isTestAvailableForSystem`;
      `helpers/sharedObjects.ts`; `helpers/testers/HighTester.ts`,
      `helpers/testers/LambdaTester.ts`; `batch/batchedReadsTiming.test.ts`;
      `debugger/DebuggerHandlers.test.ts`; `high/class/ClassCrudClientDirect.test.ts`,
      `high/class/ClassLocalIncludesHandlers.test.ts`;
      `high/function/FunctionHighHandlers.test.ts`,
      `high/function/FunctionIncludeHighHandlers.test.ts`;
      `high/include/IncludeHighHandlers.test.ts`;
      `high/table_type/TableTypeHighHandlers.test.ts`;
      `high/transport/TransportedObjectCrud.test.ts`;
      `readOnly/function/FunctionIncludeReadOnlyHandlers.test.ts`,
      `readOnly/function/GetFunctionModuleHandlers.test.ts`;
      `readOnly/structure/GetStructuresListHandler.test.ts`;
      `readOnly/system/AbapSystemSymbolsHandler.test.ts`; `admin/shared-deps/check.test.ts`,
      `admin/shared-deps/setup.test.ts`. `liveSuite` (C1) uses `configuredSystemKind()` too.
    - **No credential path remains in the test helpers (owner's decision):**
      `configHelpers.ts`' `isCloudConnection()` is retired (it read the library's function,
      `SAP_JWT_TOKEN` and the session file's `SAP_JWT_TOKEN=`); `LambdaTester.ts`'
      `isCloudSystem` (from `authType === 'jwt'`, around line 285, and hardcoded `false` in
      hard mode, around lines 251 and 362) becomes `configuredSystemKind() === 'cloud'`, the
      tester refusing to start without a stated kind; `ClassCrudClientDirect.test.ts`' `isCloud`
      (around line 162) the same; the readers of `context.isCloudSystem`
      (`RuntimeProfilingAndDumpsHandlers.test.ts`, `RuntimeFeedHandlers.test.ts`) get it from
      there. C2e lists every site checked.
    - Tests: `'configuredSystemKind answers nothing when nothing states the kind'`, `'a JWT
      session without SAP_SYSTEM_TYPE gives undefined'`, `'getSystemType refuses instead of
      defaulting to onprem'`, `'hard mode refuses to spawn without a stated kind'`,
      `'LambdaTester skips with its reason when no kind is stated'`, `'JWT credential with
      onprem stated: the tester's kind is onprem'`, `'basic credential with cloud stated: the
      tester's kind is cloud'`.
  - **Credentials, as the server's own code and docs define them:** stdio from its
    destination configuration — `--env=<name>` / `--env-path=<file>` / `--mcp=<destination>`
    with `--auth-broker-path`, as `hardMode.ts` already maps the test config; HTTP from each
    request's headers, by these exact names: `x-sap-url`, optional `x-sap-client`, and either
    `x-sap-login` with `x-sap-password` or `x-sap-jwt-token` — as `docs/` and the HTTP
    server's header-credential code state; the values read by the test from the session file
    at run time. No secret is written into a committed file or a command line
    the logs keep.
  - **Real-binary checks** (`src/__tests__/unit/coverage/hardModeBinaries.test.ts`, against
    `adtStandIn`, beside the fake-child tests):
    - stdio: `'the stdio binary answers initialize and a tool call reaches the stand'` — the
      `initialize` answer arrives on stdout, then a `GetAdtTypes` call's request is recorded
      by the stand with the destination's credential;
    - HTTP: `'the HTTP binary prints its listening line and an authenticated request reaches
      the stand'` — the `[StreamableHttpServer] Server started on <host>:<port>` line on
      stderr, then a tool call with the header credentials reaches the stand carrying them.
    - compact, on each transport hard mode uses: `'the compact stdio binary answers
      initialize and a HandlerGet call reaches the stand'` and `'the compact HTTP binary
      prints its listening line and a header-authenticated HandlerGet call reaches the
      stand'`;
    - the system kind: every check above runs once per kind — `--system-type=onprem` and
      `--system-type=cloud` — and asserts the child started with that kind by its **complete
      `tools/list`**: every tool's name and listed schema equal the projection of
      `listed-schemas.json` for that binary and kind (the tools whose `listedBy` names
      `<kind> <binary>`, with their schema there). One tool's schema is not proof:
      `GetAdtTypes`' is the same on both kinds; `'an HTTP child without a system kind is not
      started by hard mode'` — `hardMode.ts` refuses before launching when no kind is
      configured.
    - Each child is stopped by `SIGTERM` and its exit awaited (Step 4b).
  - A CHANGELOG line is not needed: the launcher is test code and changes no user-visible
    behaviour.
- [ ] **Step 5: Run the tests above:** PASS. Then check the reporter's clean build: delete
  `build/test-reporter/`, run `npm run build:test-reporter`, and confirm the one emitted file
  is `build/test-reporter/coverageReporter.js` (plus `reportFormat.js`), with nothing nested,
  and that Node loads it: `npm run check:test-reporter` exits 0 — a new script,
  `node --eval "require('./build/test-reporter/coverageReporter.js')"`, run only as that npm
  script. Then verify the family script's selection:
  `npm run test:coverage-family -- --listTests src/__tests__/integration/high/class/ClassHighHandlers.test.ts`
  lists exactly that one file (no `DebuggerHandlers.test.ts`, nothing else); repeat with two
  files and expect exactly two. Without a config, `npm run test:integration` still
  returns at once, logging nothing on.
- [ ] **Step 6: Gate:** the full `npm run test:check`, the root `npm test` and every package's
  `lint:check`.
- [ ] **Step 7: Commit** as `test(coverage): realm check, refusal stop, run report`.

### C2a. Measure transport request deletion and the move (live, before C6)

Runs after C2 and before C6's `HandlerCreate#TRANSPORT` live case; a prerequisite of C6's
transport case and of C13. The measurement runs as a temporary Jest case under
`src/__tests__/integration/coverage/` on C1–C2's helpers (`liveCall`, the refusal stop,
`recordCreated`), deleted after the record is written; nothing else of it is committed.

- [ ] **Step 1:** With the owner's go, after the realm check, on the on-premise system, then
  on the cloud (where the discovery offers the transport endpoints, O7 / O8): create one
  request and one task in it through `CreateTransport` / `CreateTransportTask` — each a
  directly awaited `liveCall` between `prepareRequestCreate` / `prepareTaskCreate` (the
  task under the journalled request just created) and `reconcileRequestCreate` /
  `reconcileTaskCreate` — so each returned number is recorded at once, before anything reads
  it, and a refused create's leftover is found and journalled.
- [ ] **Step 1a: Arm the failure cleanup before the move.** An `afterAll` of the measurement,
  whatever happened, deletes the recorded object first, then detaches every entry of it
  (journalled by `recordTransportEntry` when the add or move succeeded, and any the delete
  added) from both requests, verifies both requests' final entries, then deletes the
  recorded tasks and requests, asserting each absent, reporting what it did; the credential-refusal stop applies to it as to every helper — after a refusal
  it sends nothing and names what is left.
- [ ] **Step 2:** Move an object the measurement creates in the configured transportable
  package from the configured request's task to the created task, then back
  (`MoveTransportObjects`), journalling each move (`recordTransportEntry`); read both requests
  after each move.
- [ ] **Step 3: Clean up in the one order** (the same as `deleteRecordedRequests`):
  1. delete the object (`deleteRecorded`);
  2. detach every entry of it (`RemoveTransportObject`) from every task it is on — the
     journalled ones and any the delete added — across the configured request and the
     created one;
  3. verify the final entries (`ReadTransportObjects`): the configured request back as it
     was, the created one empty;
  4. then measure task and request deletion: through
     `createAdtClient(connection).getRequest().delete` on the measurement's own connection —
     first the task by its number, then the request; if the task delete is refused, the
     request alone — reading each number with `GetTransport` after and recording each
     outcome.
  The `afterAll` of Step 1a stays as the idempotent failure cleanup: it repeats only what
  the normal path did not finish, in the same order; the credential-refusal stop applies.
- [ ] **Step 4:** Record in C13 and in this task: which deletes ADT accepted, in which order,
  what `GetTransport` answers for a deleted number (the `expectAbsent` read), and whether the
  move between requests is accepted both ways. A refusal of the move or of every delete goes
  to the owner before C6.
- [ ] **Step 5:** Commit the record as `docs: the transport delete path, measured`.

**Record — on premise (measured 2026-11-04).**
- `CreateTransport` (owner the test user, the configured request's target) was accepted, and
  the system made one task with the request; `CreateTransportTask` under it was accepted.
- An object created in the configured package on the configured request landed on exactly one
  task of it (the test user's).
- `MoveTransportObjects` from that task to the created task was accepted: re-read, the configured
  request no longer held the object, the created request held it once. The move back was
  accepted too: the configured request held it once again, the created request nothing.
- Cleanup in the one order: the object's delete was accepted; it left one entry on the
  configured request, whose `RemoveTransportObject` was accepted; the configured request then
  read back exactly as it was (the counted list of its entries) and the created request empty.
- `getRequest().delete` by number, tasks first, the later created first: the created task's
  delete was accepted, then the task the system made with the request, then the request. The
  same `DELETE` removes a task by the task's number. Whether an empty task must go before its
  request was not tried: deleting the tasks first was accepted throughout.
- `GetTransport` of each deleted number (task or request) answers `404`
  `ExceptionResourceNotFound` (step "read transport request"), which `expectAbsent` reads as
  absent. A read-only check afterwards found no request of the run's description left and
  no entry of the object on the configured request.

**Record — cloud (measured 2026-11-04; no move, the owner's decision: `coverage_transport.request`
is empty there, the package `ZADT_BLD_PKG03`).**
- `CreateTransport` was accepted, and the system made one task with the request, as on premise;
  `CreateTransportTask` under it was accepted.
- `getRequest().delete` by number, in the same order — the created task, then the task the system
  made, then the request — each accepted.
- `GetTransport` of each deleted number answers `404` `ExceptionResourceNotFound`, as on premise.
  A read-only check afterwards found no request of the run's description left.

### C2b. Measure long polling of activation runs (live, before C2c and C2d)

The owner's condition for (a) and (b): "verify it really long-polls". A prerequisite of C2c
and C2d, which C3's activation relies on. Runs after C2a, with the owner's go, after the realm
check, on the on-premise system, then on the cloud. It runs as a temporary Jest case under
`src/__tests__/integration/coverage/` on C1–C2's helpers (the refusal guard, `recordCreated`),
deleted after the record is written.

- [ ] **Step 1:** Create the test's own objects for a run that takes measurable time — several
  objects the measurement creates and records at once (`recordCreated`), activated together —
  and arm their cleanup (`deleteRecorded` in `afterAll`) before anything else.
- [ ] **Step 2:** Start the run with one `POST` (`getUtils().activateObjectsGroup`), then on
  the same connection read its status:
  - **without** long polling (`getActivationRun(runId)`), recording each answer's time;
  - **with** it (`getActivationRun(runId, { withLongPolling: true })`), recording the time
    the request was sent, the time it was answered, and the status it answered.
  A second run measures the long-poll read first, so each order is seen once.
- [ ] **Step 3:** Record per system, in this task: whether the long-poll request is held until
  the run ends (its answer time against the run's end, read from the terminal status) and
  whether the plain read answers at once (with the status still running).
- [ ] **Step 4:** **If SAP does not hold the long-poll request on a system, stop:** report to
  the owner before C2c and C2d change anything (a re-read after each answer would then be a
  tight loop against SAP).
- [ ] **Step 5:** Commit the record as `docs: activation-run long polling, measured`.

**Record — on premise (measured 2026-11-04).**
- The run: ten classes of 200 methods each, created inactive in `$TMP` by the test and
  recorded, activated together by one `POST`; then their sources rewritten inactive and a
  second run started the same way. Each `POST` answered in under half a second.
- Run 1, the plain read first: sent right after the `POST`, answered in 0.13 s with status
  `running` (the document carries `progressMessage`, no percentage). The long-poll read sent
  next was held 37.2 s and answered `finished` (`progressPercentage` 100). A plain read sent
  right after answered in 0.13 s, `finished`.
- Run 2, the long-poll read first: sent right after the `POST`, held 36.2 s, answered
  `finished`; the plain read after it answered in 0.13 s, `finished`.
- Each run took one long-poll request: none answered a running status, so no re-read was
  needed. The run document states no end time; the run's end is read from the terminal status
  — the long poll answered `finished`, and the plain read right after confirms it.
- Both runs' results: `activationExecuted="true"`, no message.
- So on premise SAP holds the long-poll read until the run ends, and the plain read answers at
  once with the status as it stands. The ten classes were deleted and each read `404` after.

**Record — cloud (measured 2026-11-04; the package `ZADT_BLD_PKG03`, the cloud has no `$TMP`).**
- The same measurement: ten classes of 200 methods each, created inactive by the test and
  recorded, two runs, each started by one `POST` (answered in under half a second).
- Run 1, the plain read first: answered in 0.19 s, `running` (`progressMessage`, no
  percentage). The long-poll read sent next was held 157.6 s and answered `finished`
  (`progressPercentage` 100); a plain read right after answered in 0.19 s, `finished`.
- Run 2, the long-poll read first: held 158.0 s, answered `finished`; the plain read after it
  answered in 0.21 s, `finished`.
- One long-poll request per run, as on premise; no running answer, no re-read. Both runs'
  results: `activationExecuted="true"`, no message.
- So on the cloud too SAP holds the long-poll read and answers it with the terminal status, and
  the plain read answers at once. Inference, not measured: the two holds are nearly equal
  (157.6 s, 158.0 s), so these data do not tell whether a hold ends exactly at the run's end or
  at a hold limit of the server's that the run had already passed; either way no long poll
  answered a running status. The ten classes were deleted and each read `404` after.

### C2c. `awaitActivationRun` waits on long polling alone (owner's decision (b))

**Prerequisite:** C2b shows the long-poll read is held on both systems.

**Files:**
- Modify: `src/lib/strategies/activationRun.ts` (`awaitActivationRun`), its callers
  `src/handlers/common/low/handleActivateObject.ts` and
  `src/handlers/unit_test/shared/writeTests.ts` (drop the two arguments), and
  `src/__tests__/unit/failureStep.test.ts` (its two five-argument calls, around lines 790 and
  827, become three-argument calls; what they assert stays),
  `CHANGELOG.md`.
- Test: `src/__tests__/unit/activationRunWait.test.ts` (new), and the existing
  `activationCancelled.test.ts` unchanged.

**Interfaces:**
- `awaitActivationRun(utils: ActivationRunSource, runId: string, analyse: unknown): Promise<ActivationRunOutcome>`:
  no `attempts`, no `delayMs`, no `setTimeout`. It reads the run status with
  `withLongPolling: true`, and again after each answer, until the status is terminal
  (`finished`, `error`, `failed`); then reads the results as today. `settled: false` (a run
  still going after the last attempt) no longer arises; whether the outcome type keeps it is
  decided by what its readers need, without a cast.

- [ ] **Step 1: Write the failing tests** on `recordingConnection` with real adt-clients code:
  - `'every status read carries withLongPolling=true'`: the run answers "running" three times,
    then "finished"; the recorded status reads are exactly four, each URL
    `/sap/bc/adt/activation/runs/<id>?withLongPolling=true`, followed by the results read;
  - `'no timer runs between reads'`: under Jest fake timers no timer is pending at any read,
    and the wait completes without advancing them;
  - `'a run past six reads is still waited for'`: seven "running" answers, then "finished" —
    the outcome is the finished run's, not `settled: false`.
- [ ] **Step 2:** Run `npm test -- src/__tests__/unit/activationRunWait.test.ts`: FAIL (the six
  reads and the interval).
- [ ] **Step 3:** Change `awaitActivationRun` and its callers as above.
- [ ] **Step 4:** Run the new tests and every existing activation test
  (`activationCancelled`, `activationRun`, `activateObject*`, `unitTestTools`,
  `failureStep`): PASS; `npm run test:check`: clean.
- [ ] **Step 5: Literal pins and live.** Its request sequence is pinned through
  `ActivateObjects` in C3 (`pinCases`, the `withLongPolling=true` reads in the literal); the
  live case is C3's `ActivateObjects` case on both systems.
- [ ] **Step 6:** CHANGELOG line (24.0.0, Fixed): a group activation waits for its run until
  SAP ends it, re-reading with long polling and no attempt limit or interval.
- [ ] **Step 7: Commit** as `fix(activation): wait for a run on long polling alone`.

### C2d. `HandlerGet` `activation_status` gets `with_long_polling` (owner's decision (a))

**Prerequisite:** C2b. **Checked:** no full-set tool reads an activation run separately — the
listed schemas have none; `handleGetActivationStatus` is reached only through `HandlerGet`
(`part: 'activation_status'`).

**Files:**
- Modify: `src/handlers/common/readonly/handleGetActivationRun.ts`
  (`handleGetActivationStatus`); `HandlerGet`'s schema, which `compactGetSchemaFor` builds in
  `src/lib/compact/compactSchemas.ts` — the new key in `GET_PROPERTIES` (with its
  description) and in `COMPACT_READ_TAKES.every`, beside `run_id`, so every variant offers it
  (`toolSet/variantProperties.test.ts` checks the `every` list); the run-part forwarding in
  `compact-readonly-entries/src/handlers/handleHandlerGet.ts` (`RUN_PARTS`: today
  `read(context, { run_id: args.run_id })`), which passes `with_long_polling` to
  `handleGetActivationStatus` and nothing new to `handleGetActivationResults`;
  `tests/fixtures/tools/listed-schemas.json` and the surface fixtures (the added optional
  parameter — a schema change, fixed in the fixtures in this commit), `docs/` tool docs
  (`npm run docs:tools`), `CHANGELOG.md`.

**Interfaces:**
- `HandlerGet` gains an optional `with_long_polling: boolean`, read only with
  `part: 'activation_status'`. Description (functional): "With part activation_status: when
  true, the status read is held by SAP until the activation run ends, and answers its final
  status." Omitted means today's behaviour: one read answered at once.
- `handleGetActivationStatus` passes `{ analyse: analyseException, withLongPolling }` to
  `getActivationRun` only when the argument is given.

- [ ] **Step 1: Literal pins** (`src/__tests__/unit/pins/activate.pins.test.ts`, C3's file,
  added now): `HandlerGet` `part: 'activation_status'` without the argument — URL
  `/sap/bc/adt/activation/runs/<id>`; with `with_long_polling: true` — URL
  `…/runs/<id>?withLongPolling=true`; both whole-request literals. Run: FAIL (the argument is
  unknown).
- [ ] **Step 2:** Add `with_long_polling` to `GET_PROPERTIES` and `COMPACT_READ_TAKES.every`,
  forward it in `handleHandlerGet`'s run-part branch, and pass it in
  `handleGetActivationStatus`. Run the pins: PASS. Run `variantProperties.test.ts`: PASS. The
  listed-schema test fails until the fixtures carry the new optional key — update them in the
  same commit, the diff showing only that key on every compact binary's `HandlerGet`.
- [ ] **Step 3: Live cases** (in C3's `activate.live.test.ts`, both systems): a run the test
  starts is read with `with_long_polling: true` and answers a terminal status; read without,
  it answers at once.
- [ ] **Step 4:** CHANGELOG line (24.0.0, Added): `HandlerGet`'s `activation_status` part can
  wait for the run to end (`with_long_polling`). `npm run docs:tools`.
- [ ] **Step 5: Commit** as `feat(HandlerGet): activation_status can long-poll`.

### C2e. Nothing is derived from the authorization (owner's decision)

**The owner's rule.** Nothing is derived from the authorization — not from the credential
type, the token or its claims. Only the consumer's information counts: the connection
settings. One exception: the responsible user and the system id are read from the system
when a system-information function is available, otherwise from the settings.

**What the rule governs, and what it does not (controller ruling).** The rule governs what
the server and the libraries derive. The pre-run JWT `exp` check of the realm check (C2,
`realmCheck.ts`) is a test-run safety step the owner required — never send an expired token
to the trial — and is kept: it decodes the token's `exp` locally, in its own test helper,
and derives nothing about the system. So the guard's token-decoding ban covers production
code only (every package's production `src`, `scripts`, `tools`); the kind check covers the
test helpers too, the `exp` helper included.

**Why here.** It changes four program handlers (`ActivateProgram` is C3's, `CreateProgram` and
`UpdateProgram` C5's, the compact `PROGRAM` rows C6's), so their pins must be written on the
fixed code: it goes before C3. It needs C2's `configuredSystemKind()` for the test side, so it
comes after C2; it is independent of C2a–C2d.

**Inventory (grep at `d98becd9`, every package's production `src`, `scripts`, `tools`, and
`src/__tests__`, for `isCloudConnection`, `isCloud`, `authType`, `'jwt'`, `SAP_JWT_TOKEN`):**
- **Production, inferring the kind — removed here:** `src/lib/utils.ts` `isCloudConnection()`
  (`authType === 'jwt'` from its argument, the session context, `overrideConfig`, or the
  connection's config) and its only users, the four program refusals:
  `src/handlers/program/low/handleActivateProgram.ts` (around line 47),
  `low/handleUpdateProgram.ts` (76), `high/handleUpdateProgram.ts` (86),
  `high/handleCreateProgram.ts` (100). No other package uses it. `@mcp-abap-adt/lib`
  exports `./utils`, so its removal is a breaking change of the published API: MIGRATION.
- **Production, credential handling only — kept:** `src/lib/utils.ts` (around line 1164, the
  configuration summary prints which credential fields are present);
  `server-runtime/src/stdio/auth/vocabulary.ts` (a grant is read for `jwt` / `saml`);
  `server-runtime/src/stdio/auth/destinationFailure.ts` (the `jwt` + `none` hint).
- **Tests, inferring the kind — changed in C2's resolver step (below):**
  `integration/helpers/configHelpers.ts` `isCloudConnection()` (around line 722: the
  library's function, `SAP_JWT_TOKEN` in the environment, `SAP_JWT_TOKEN=` in the session
  file) — retired; `integration/helpers/testers/LambdaTester.ts` (around line 285
  `isCloudSystem = authType === 'jwt'`, around line 251 `isCloudSystem: false` in hard mode,
  and line 362 the same in its other branch); `integration/high/class/ClassCrudClientDirect.test.ts`
  (around line 162 `isCloud = config.authType === 'jwt'`); the readers of
  `context.isCloudSystem` — `readOnly/system/RuntimeProfilingAndDumpsHandlers.test.ts`
  (208), `readOnly/system/RuntimeFeedHandlers.test.ts` (260, 299); and
  `unit/lowTierStrategies.test.ts`' "cloud guard" rows (around line 713, which drive the
  program refusal through `sessionContext` with `authType: 'jwt'`).
- **Test helpers in other packages, inferring the kind — changed here:**
  `server-runtime/src/stdio/__tests__/helpers/loginStand.ts` (around line 345:
  `stateSystemKind(options.auth === 'jwt' ? 'cloud' : 'onprem')`). `StandOptions` gets a
  required `kind`, and `stand(options: StandOptions = {})` (around line 342) loses its `= {}`
  default, so no call can omit it. Its 24 calls in 14 files (under
  `server-runtime/src/stdio/__tests__/`, counted by `stand(` call) each state the kind
  independently of the credential: `batchStdio.test.ts` (1), `mainFlow.test.ts` (1),
  `sessionWrites.test.ts` (1), `debug/noSecretsOut.test.ts` (4),
  `cancel/cancelledCallerFirst.test.ts` (1), `cancel/lateConnect.test.ts` (1),
  `cancel/loginBound.test.ts` (3), `cancel/loginEndsWithRequest.test.ts` (1),
  `cancel/partyReleased.test.ts` (1), `shutdown/admissionLatch.test.ts` (1),
  `shutdown/afterStartBrowserLogin.test.ts` (3), `shutdown/crash.test.ts` (2),
  `shutdown/forcedClose.test.ts` (1), `shutdown/logoffAtOnce.test.ts` (3).
  (`startBrowserLogin.test.ts` and `discardedRefreshToken.test.ts` import other parts of the
  helper and call no `stand`.) Then `server-runtime`'s own `test:check` runs clean. A test:
  `'the login stand takes the kind it is given, whatever the credential'`.
- **Tests, credential handling only — kept:** `integration/helpers/sessionHelpers.ts`
  (passes `authType` through), `integration/helpers/configHelpers.ts`' test credential
  loader (around 458–520: `jwt` needs `SAP_JWT_TOKEN`), `integration/batch/refusalFollowUps.test.ts`
  (needs a basic user), `helpers/batchStand.ts`, `helpers/leftoverSession.ts`,
  `debugger/DebuggerHandlers.test.ts` (a basic second user), `testers/types.ts` (the field).
  The other 37 unit files that mention `authType` / `'jwt'` build credential fixtures; each
  is re-read at the step and any that reads a kind from them joins the list above.
- **Anything else derived from the authorization (the owner's broader rule) — none found in
  production.** Grep at `ab0c9ab8`, every package's production `src`, `scripts`, `tools` and
  the test helpers, for token decoding and claims (`jwt-decode`, `decodeJwt`, `decodeToken`,
  `split('.')` on a token, `base64url`, `atob(`, `Buffer.from(` of a token, `sub`,
  `user_name`, `zdn`, `preferred_username`, `ext_attr`, `claims`) and for credential reads
  (`jwtToken`, `SAP_JWT_TOKEN`, `authType`):
  - no production code decodes a token or reads a claim; the only `base64url` uses are in
    test stands that *mint* tokens (`loginStand.ts`, `auth/brokerFactory.test.ts`);
  - the responsible user and the system id come from the settings or the request headers
    (`systemContext.ts`: `SAP_RESPONSIBLE`, `SAP_MASTER_SYSTEM`, the basic login as the
    responsible; `requestContext.ts`: `x-sap-responsible`, `x-sap-master-system`) or from the
    system's own information (`requestSystemResolution.ts`) — the owner's exception;
  - `authType` / `jwtToken` reads in production choose how to authenticate, never what the
    system is: `credentialSources.ts` (the provider for the stated `authType`, the HTTP
    headers' credential), `httpTransport/headerSource.ts` (`x-sap-login` for a basic
    destination), `server-runtime/src/stdio/auth/*` (the broker's handler and grant for the
    stated `authType`), `server-runtime/src/stdio/launcher.ts` (the session's token handed to
    the connection), `utils.ts`' configuration summary.
  - **Reviewed and kept as credential plumbing** (each reads which credential the consumer
    supplied, or the settings, never a token's contents, and derives no kind):
    - `src/lib/httpTransport/headerSource.ts` (around 106): the session id `direct-jwt` /
      `direct-basic` names which credential header the request carried;
    - `src/lib/utils.ts` (around 575–587): the configuration's credential fields read for the
      connection;
    - `src/lib/auth/currentCredential.ts` (around 41–48): the provider for the credential the
      settings name;
    - `server-runtime/src/stdio/auth/countedProvider.ts` (around 108–110): counts the
      provider's renewals by its type;
    - `tools/runtime-profiling-dumps-explorer.js` (around 242, 273–287, 1065): the settings'
      username as the default dump user, for a basic destination only — a setting, not a
      claim;
    - `tools/debug-runtime-explorer.js` (around 46–57) and `tools/test-package-read.js`
      (around 15–18): build the credential the settings name;
    - `src/__tests__/integration/helpers/sessionHelpers.ts` (around 168–191): passes the
      session's `authType` through to the connection.
    The guard is not widened for these: it checks kind inference and production token
    decoding only, and says so.
  - Two comments still describe a credential-to-kind rule and are fixed in this task (and
    checked again in step 18a): `src/lib/config/IServerConfig.ts` (around line 38: "default
    to cloud for a jwt destination") and `src/lib/handlers/interfaces.ts` (around line 14:
    "'cloud' — BTP ABAP Environment (jwt auth)"). The step first checks the code behind the
    first comment: if any default by credential remains there, it is a production item of
    this task with its own failing test, removed like `isCloudConnection`.

**Files:**
- Modify: `src/lib/utils.ts` (delete `isCloudConnection`), the four program handlers,
  `src/__tests__/unit/lowTierStrategies.test.ts`, `src/lib/config/IServerConfig.ts` and
  `src/lib/handlers/interfaces.ts` (the two comments),
  `server-runtime/src/stdio/__tests__/helpers/loginStand.ts` and its 24 calls in 14 files,
  `CHANGELOG.md`, `MIGRATION-24.0.md`.
- Create: `src/__tests__/unit/systemKind/programOnJwtOnPremise.test.ts`,
  `src/__tests__/unit/sources/noKindFromCredential.test.ts` and its fixtures under
  `src/__tests__/unit/sources/__fixtures__/kindFromCredential/`.

**Steps:**
- [ ] **Step 1: Write the failing tests.**
  - `programOnJwtOnPremise.test.ts`, on `recordingConnection` with the declared kind `onprem`
    and a JWT credential: `'CreateProgram on premise with JWT auth sends its requests'`,
    `'UpdateProgram …'`, `'ActivateProgram …'`, and the compact `HandlerCreate` /
    `HandlerUpdate` / `HandlerActivate` `PROGRAM` rows — each a `pinCases` row with its
    literal requests (they fail today: the handler refuses before sending).
  - Mismatch cases: `'JWT credential with onprem stated: the program tools are listed and
    run'`; `'basic credential with cloud stated: the cloud surface keeps today's program
    reads and checks, and nothing more'` — today's cloud surface stays as it is
    (`listed-schemas.json`, the ruling):
    - **absent on the cloud, asserted:** `CreateProgram`, `UpdateProgram`, `ActivateProgram`,
      `DeleteProgram`, `CreateProgramUnitTest`, `UpdateProgramUnitTest`, `RuntimeRunProgram`,
      `GetMainPrograms`; `PROGRAM` absent from the cloud enums of `HandlerCreate`,
      `HandlerUpdate`, `HandlerActivate`, `HandlerLock`, `HandlerUnlock`, `HandlerValidate`,
      `HandlerDelete`; a compact `HandlerCreate` `object_type: 'PROGRAM'` on the cloud binary
      refused by its schema with nothing sent (`refusal: 'thrown'`, `'nothing-sent'`);
    - **present on the cloud, asserted to stay:** `GetProgram`, `GetProgramVersions`,
      `GetProgramVersionSource`, `GetProgramVersionDiff`, `CheckProgram`,
      `RunProgramUnitTest`; `PROGRAM` in the cloud enums of `HandlerGet`, `HandlerCheckRun`,
      `HandlerDeletionCheck`, `HandlerWhereUsed` (`adtProjections.ts`).
  - `lowTierStrategies.test.ts`: the "cloud guard" rows are replaced by the declared-kind
    rows above; the comment's claim that registration ignores `available_in` is checked at
    the step against today's registration (the variant projections) and corrected.
- [ ] **Step 2:** Run them: the on-premise JWT rows FAIL (refused, nothing sent); the cloud
  listing rows PASS already (they fix today's correct listing).
- [ ] **Step 3:** Remove the four `isCloudConnection()` checks and delete `isCloudConnection`
  from `src/lib/utils.ts`. What a variant offers is decided by registration and
  `available_in` on the declared kind, nothing else.
- [ ] **Step 4: The guard — `noKindFromCredential.test.ts`** (renamed
  `noDerivationFromAuthorization.test.ts`). Over the TypeScript program of every package's
  production `src` and of **every test-helper tree** — each `helpers` directory under a
  `__tests__` directory of any package, found by walking the packages (today
  `src/__tests__/helpers`, `src/__tests__/integration/helpers`,
  `server-runtime/src/stdio/__tests__/helpers`, and any other) — with the compiler API, as
  `staticTypes.test.ts`. No allowlist: a finding is fixed in the code.
  - **What a credential read is — by declaration symbol, not by type or name.** A read whose
    symbol the checker resolves to one of the declared credential properties: `SapConfig`'s
    `authType`, `jwtToken`, `refreshToken`, `password` and the other secret fields of its
    declaration (read from `SapConfig`'s declaration at the step, each named in the guard by
    its declaring interface and property; `username` is a setting, not one of them — the
    owner's exception reads the responsible user from the settings), the stdio vocabulary's `AuthType`-typed `authType`,
    the connection's `authorizationToken`, the members of `IAuthProvider`; the environment
    key `SAP_JWT_TOKEN` and the header key `x-sap-jwt-token` read by key; and any value
    declared with a union drawn only from the auth-type literals (`'basic' | 'jwt'`, as
    `loginStand`'s `options.auth`). A plain `string | undefined` is not a credential by its
    type — only by flowing from such a read.
  - **Credential-derived, by direct flow only:** within one function, and into same-file
    callees through their arguments, a value is credential-derived when it is such a read or
    is computed directly from one (a comparison, a conditional, a call taking it). No
    cross-module value-flow analysis: the stated limit covers the rest.
  - A token decode is a `split('.')`, `atob`, `Buffer.from(…, 'base64…')` or `JSON.parse`
    applied to a credential-derived value.
  - **What a kind value is,** recognised by the checker, not by name:
    1. an expression whose type is assignable to `'cloud' | 'onprem' | 'legacy'` (or the
       declared kind types `SapEnvironment`, `SystemKind`);
    2. a boolean **used as the kind**: converted into one (the condition of a conditional
       whose branches are kind values, e.g. `flag ? 'cloud' : 'onprem'`), compared with one,
       or passed or assigned where a kind or a declared kind-flag type is expected
       (`type CloudFlag = boolean`, read through the checker's alias symbol on the
       declaration);
    3. any boolean bound — variable, property, parameter default, or the return of a
       boolean function — to a comparison of a credential read with a literal: a boolean of
       the credential type has no use but as a disguised kind (credential choices are made
       by a `switch` or conditional on the field itself, which stays allowed).
  - **The rule:** no kind value is produced from a credential read — in an assignment, a
    property initialiser, a call argument, a return, or an inline call — looking through the
    expression and the same-file functions it calls (production and every test-helper tree);
    and no **production** code decodes a token at all (the realm check's `exp` helper is a
    test helper, outside that ban).
  - **Fixtures, each refused by its own form alone:** an assignment (`kind = authType ===
    'jwt' ? 'cloud' : 'onprem'`); a property (`{ isCloudSystem: authType === 'jwt' }`);
    an argument (`stateSystemKind(options.auth === 'jwt' ? 'cloud' : 'onprem')`); an inline
    call (`declare(isJwt(config))` with `isJwt` same-file); a return (the old
    `isCloudConnection`); a `CloudFlag` assigned from a credential comparison; a token decode
    reading a claim (production tree); **passing: the real explicit-kind resolver**
    `src/lib/systemKind.ts`' `statedSystemKind(value: string | undefined)`, unchanged — it
    maps a stated value to a kind from a plain string, not a credential read; **the real
    `loginStand` expression** —
    `stateSystemKind(options.auth === 'jwt' ? 'cloud' : 'onprem')` with `auth` declared
    `'basic' | 'jwt'` — recognised by its declared type. **Passing fixtures:** a
    `switch (authType)` choosing a provider; a conditional on `authType` choosing a login
    header; the configuration summary; **the realm check's `exp` helper** — it decodes a token
    in a test helper (outside the decoding ban) and produces no kind (inside the kind check,
    passing it).
  - **Its limit, stated:** a credential read reaching a kind through another module, or
    through an untyped value, is beyond this check; left to review, and the PR description
    says so.
- [ ] **Step 5:** Run the unit suite, `npm run test:check`, every package's `lint:check`:
  PASS. **Mutate per form:** put back, one at a time, an assignment, a property, an argument,
  an inline call and a return deriving the kind from `authType`, and a claim read; the guard
  goes red each time; revert each.
- [ ] **Step 6: CHANGELOG** (24.0.0, Fixed): "On-premise systems with JWT authentication were
  refused program create, update and activate: the server took the credential type for the
  system kind. The declared system kind decides what is offered." **MIGRATION-24.0.md**, a
  section of its own:
  - **Removed: `isCloudConnection` from `@mcp-abap-adt/lib/utils`.** It reported an
    on-premise system with JWT authentication as cloud: it read the credential type as the
    system kind. Keeping it would keep that wrong answer, so it is removed although that is
    breaking.
  - **What to use:** the system kind the embedder declared — `--system-type`,
    `SAP_SYSTEM_TYPE`, or its own configuration.
  - **The rule:** nothing is derived from the authorization — not from the credential type,
    the token or its claims; only the connection settings count. The one exception is the
    responsible user and the system id, read from the system when its information is
    available, otherwise from the settings.
- [ ] **Step 7: Commit** as `fix(program): the declared system kind, not the credential,
  decides what is offered`.

## Defect fixes (spec §9)

The stage runs after C2e and before C3, so C3–C16 pin the fixed behaviour. Every task ends
green, under the coverage stage's global constraints:
- npm scripts only;
- no casts, no regex in tests, no built-in timeouts or retries;
- every live run after the realm check, on objects the test creates, with the cleanup and
  refusal stop of C1–C2.

The owner gave his go for the live measurements in D1. Defect numbers are the campaign's
(`SUMMARY.md`). Where the code reading and the live measurement on premise differ, the live
measurement holds.

**Every D task:**
- writes its failing test first;
- pins changed requests by literal (`pinCases`);
- adds a live case where §8 requires one (or notes the family task that will);
- adds a CHANGELOG line (24.0.0, Fixed / Removed / Added) and a MIGRATION-24.0 line where a
  contract changes;
- commits as `fix(<area>): …`.

### D1. Measure the outline endpoints (live, on premise and on the trial)

The owner gave his go. It runs as a temporary Jest case under
`src/__tests__/integration/coverage/` on C1–C2's helpers (realm check, refusal guard,
`recordCreated`), and the case is deleted after the record is written.

- [ ] **Step 1: Create the test's own objects** and record them: a class with a local type, a
  public and a private method, an attribute and an event; an interface; on premise, a program
  with a FORM and a function group with one module. The cloud has no program; use what each
  system offers.
- [ ] **Step 2: Read each object's ADT object structure** — the structure Eclipse's Outline
  reads. This is Inference until measured:
  - `GET /sap/bc/adt/oo/classes/{name}/objectstructure`;
  - its analogues for interfaces (`/oo/interfaces/{name}/objectstructure`), programs and
    function groups, as the discovery document lists them.

  Record per system: the request (Accept, query, e.g. `version`, `withShortDescriptions`), the
  status, and the answer's elements. Then check which of these the answer carries:
  - components: types, attributes, methods, events, forms, modules;
  - signatures: parameters and their kinds;
  - visibility;
  - **source positions**: the links' `#start=l,c;end=l,c`, and which include each points
    into.
- [ ] **Step 3: Check the positions.** Read the main source (and each include a position
  points into) and confirm the lines the positions name.
- [ ] **Step 4: Record the measurement** in this task, as the D2 outline method's contract:
  endpoints per object type, Accept, the answer's shape, and what the trial lacks. The
  cleanup runs in the standard order.
- [ ] **Step 5: Commit** the record (`docs: the outline endpoints, measured`).

**Record — on premise and on the trial (measured 2026-11-04).** Objects the test created and
recorded: a class (public type, instance/static/constant attributes, an event, public,
protected and private methods with every parameter kind, an implemented interface); a second
class with a local type and a local class in its definitions include, implemented in its
implementations include; an interface (type, attribute, event, method); two structures, the
second including the first; a function group with one module; on premise also a program with a
local class, a type, a variable, START-OF-SELECTION, a FORM, and an `INCLUDE` of an include
program holding a second FORM. The cloud got the same objects but the program and its include
(it has none). Everything was deleted in reverse creation order and each read `404` after.
Every answer below was the same on both systems, byte for byte apart from the object names,
unless it says otherwise.

*Endpoints (Measured).* Each object's metadata answer links its outline as
`rel="http://www.sap.com/adt/relations/objectstructure"`,
`type="application/vnd.sap.adt.objectstructure.v2+xml"` — for the class, the interface, the
program and the function group; the function module's and the include's metadata carry no
such link. The discovery document lists no per-object `objectstructure` (only a bare
`/sap/bc/adt/repository/objectstructure` collection with no template).

| Object | `GET` | Accept answered `200` | Other Accepts |
| --- | --- | --- | --- |
| Class | `/sap/bc/adt/oo/classes/{name}/objectstructure` | `…objectstructure.v2+xml` | `…objectstructure+xml` and `application/xml` also `200`, the same body |
| Interface | `/sap/bc/adt/oo/interfaces/{name}/objectstructure` | `…objectstructure.v2+xml` | the same as the class |
| Program (on premise) | `/sap/bc/adt/programs/programs/{name}/objectstructure` | `…objectstructure.v2+xml` only | `406`, "Accepted content types: application/vnd.sap.adt.objectstructure.v2+xml" |
| Include (on premise) | `/sap/bc/adt/programs/includes/{name}/objectstructure` | `…objectstructure.v2+xml` only | `406`; the answer is its main program's whole outline, also with `?context=<program uri>` |
| Function group | `/sap/bc/adt/functions/groups/{name}/objectstructure` | `…objectstructure.v2+xml` only | `406` |
| Function module | `…/groups/{group}/fmodules/{name}/objectstructure` | — | `404` with every Accept |
| Structure, service definition | `…/ddic/structures/{name}/objectstructure`, `…/ddic/srvd/sources/{name}/objectstructure` | — | `404` |
| Class local includes | `…/classes/{name}/includes/definitions/objectstructure` and `…/includes/implementations/objectstructure` | — | `404` (their elements are in the class's own outline) |

`version=active` and `version=inactive` changed nothing in the elements (only `xml:base`; the
objects were active). `withShortDescriptions=true` adds `description="…"` to the elements that
have one: the class and interface outlines had none to add; the program's include element, the
function group's module and its `UXX` include got theirs. `/sap/bc/adt/repository/objectstructure`
answered `400` "Parameter objectname could not be found" with `?uri=`, and `500` "Object type
OU is not defined" with `?objectname=&objecttype=CLAS/OC` — not a usable outline endpoint.

*The answer's shape (Measured).* One root `abapsource:objectStructureElement`
(`xmlns:abapsource="http://www.sap.com/adt/abapsource"`) with `adtcore:name`, `adtcore:type`,
nested `abapsource:objectStructureElement` children, each with `atom:link`s whose `rel` ends
in `definitionIdentifier`, `implementationIdentifier`, `definitionBlock` or
`implementationBlock`.

- **Class / interface:** root `CLAS/OC` (`visibility`, `final`) / `INTF/OI`. Children:
  `CLAS/OT` / `INTF/IT` types (`visibility`); `CLAS/OA` / `INTF/IA` attributes (`level`
  `instance`|`static`, `visibility`, `constant="true"` and `readOnly="true"` on a constant);
  `CLAS/OE` / `INTF/IE` events (`level`, `visibility`, `clif_name`); `CLAS/OM` / `INTF/IO`
  methods (`level`, `visibility`, `clif_name`); `CLAS/OR` for an implemented interface, and its
  methods as `CLAS/OM` named `INTF~METHOD`; `CLAS/OCL` local class with `CLAS/OLD` local
  methods (`clif_name` the local class) and `CLAS/OLT` local types; `CLAS/OCX` text elements
  (`isExternalRef="true"`, its link the text-elements URI, no position).
- **Visibility:** on every class and interface component (`public`|`protected`|`private`).
- **Signatures: not carried.** No element states a parameter, its kind, its type or a
  `RAISING`; a method's signature is only the text its `definitionBlock` spans.
- **Positions (class and interface):** `href="./source/main#start=l,c;end=l,c"` relative to the
  object URI; for local components `./includes/definitions#…` and
  `./includes/implementations#…`. A method has all four links (definition and implementation
  identifier and block); a type, an attribute or an event the two definition links; an
  implemented interface method has no `definitionBlock`, its `definitionIdentifier` pointing at
  the `INTERFACES` statement.
- **Program (on premise):** root `PROG/P`; children `PROG/PL` local class with `PROG/PLM`
  methods, `PROG/PY` type, `PROG/PD` data, `PROG/PE` event block, `PROG/PU` FORM, `PROG/I`
  include, `PROG/PX` text elements. **No line positions:** each link names its target by
  fragment, `…/source/main#type=PROG%2FPU;name=MAIN_FORM` (a local method's name is the class
  name padded to 30 characters followed by the method name, URL-encoded). A FORM in an include
  points into that include: `/sap/bc/adt/programs/includes/{inc}/source/main?context=<program
  uri>#type=PROG%2FPU;name=…`. Only a local method carries `visibility`.
- **Function group:** root `FUGR/F`; children `FUGR/I` includes (top and `UXX`), `FUGR/FF`
  modules, `FUGR/PX` text elements; each link is the object's source URI, no fragment, no
  position. The module's parameters are not carried.

*Positions checked (Step 3, Measured).* Every `#start=l,c;end=l,c` of both classes and the
interface was cut from the source read at the include it names (`source/main`,
`includes/definitions`, `includes/implementations`): lines 1-based, columns 0-based, `end`
exclusive. Each identifier span is exactly the component's name as written (lower case in the
source); each block span runs from the statement's first keyword to the end of its last token,
without the period (`METHODS pub … TYPE i`, `CLASS … ENDCLASS`, `METHOD pub. … ENDMETHOD`).

*What the trial lacks (Measured).* Programs and includes only. Class, interface, local class
and function group answers are identical to the on-premise ones.

*Other readings, for D6 Step 3 (Measured unless marked).*
- **(a) A program's INCLUDEs — SAP states them.** The program's outline carries each include
  as a `PROG/I` element with its source URI; `POST
  /sap/bc/adt/repository/nodestructure?parent_type=PROG/P&parent_name={name}` lists it as
  well (`PROG/I`, with `TECH_NAME` and URI). The function group's outline lists its includes as
  `FUGR/I`. On premise only (the trial has no program). Where-used of the fresh include
  (`usageReferences`) answered `200` with no result; Inference: the where-used index did not
  yet hold the new include.
- **(b) A structure's `include` — SAP states it; `extend type` — not seen.** *(Superseded by D22's
  later measurement: element info lists an append as `.append`.)*
  `GET /sap/bc/adt/ddic/elementinfo?path={structure}` (Accept
  `application/vnd.sap.adt.elementinfo+xml`) answers the components in order: an element
  `adtcore:type="TABL/DS" adtcore:name=".include"` with property `ddicIncludeName` and the
  included structure's URI, and each included field with `ddicIsPartOfInclude` and
  `ddicIncludeHierarchyLevel`. Both systems. Where-used of the included structure lists the
  including one (both systems). For an append (`extend type`): creating one through
  `CreateStructure` + `UpdateStructure` was refused ("errors in source", the object being a
  plain structure), so a standard append of an industry-solution namespace was read instead:
  the base structure's element info lists no append and none of its fields, and the append's
  own element info is an empty `TABL/DT`; only the append's source states
  `extend type <base> with <append>` (on premise only). Inference: that append may belong to a
  switched-off business function, so the absence is one reading, not a rule.
- **(c) A service definition's exposed entities — SAP states them.**
  `GET /sap/bc/adt/ddic/srvd/elementinfo?path={srvd}` answers one `DDLS/STOB` element per
  `expose`, with the entity's name, its DDL source URI and an `alias` property. Read only, on a
  standard service definition on each system. The SRVD has no outline (`404`), and
  `nodestructure` with `parent_type=SRVD/SRV` answered an empty body.
- `nodestructure` with `parent_type=TABL/DS` does not answer the structure: it answers the
  package's object list.

### D2. adt-clients release (cross-repository cycle)

**Repository:** `~/prj/mcp-abap-adt-clients`. One issue, one branch, one PR there, through
that repository's own review and CI. The release itself is the owner's. **It is a major
release of adt-clients** (options are removed and defaults change). `@mcp-abap-adt/adt-strategies`,
which gains `readObjectOutline` (the structured reading of the outline), is published before
it or with it, and #346 bumps both from the registry.

**Contents (each with a failing test first, in adt-clients' own suites):**
- **#8 — escape every attribute value written into a create body:** `adtcore:description`,
  the class's superclass and every other value written as an attribute, for class, interface,
  program, function group, function module, domain, data element, DDL, structure, table,
  table type, BDEF, DDLX, service definition (`core/serviceDefinition/create.js`) and SRVB.
  The message class already escapes. The value is escaped **after** its truncation, so an
  entity is never cut. Tests, one per interpolated attribute category, each with `&`, `<`,
  `"` and `'`: descriptions (every create above); names and references (superclass, package,
  referenced definitions); responsible and master-system values; and a description long
  enough to be truncated, whose cut falls on a character that escapes — the body stays
  well-formed and the entity whole.
- **`CreateTransport` `customizing` (D2 addition, measured):** `core/transport/create.js` maps
  `customizing` to `tm:type="T"` (Transport of Copies), which SAP refuses without a real
  target; a customizing request is type `W`. Measured: `W` with `LOCAL` or an empty target
  answers `201`. Fix: `customizing` → `W`, `workbench` → `K`. Test: the type pinned per
  request kind.
- **The profiler's auto-drill-down threshold (D2 addition):** `runtime/traces/profiler.js`'
  `getTraceStatements` (the GET behind the statements view) sends
  `Math.trunc(autoDrillDownThreshold)`, so `0.1` goes out as `0`. Fix: send the value as
  given. Test on `getTraceStatements`: the query carries `autoDrillDownThreshold=0.1`.
- **The behaviour pool's implementations member (for D17):** `AdtBehaviorImplementation` has
  no member exposing `getBehaviorImplementationImplementations` (`read` is `source/main`,
  `readMetadata` the metadata). Add one member — `readImplementations(config, version?,
  options?)`, one endpoint (`/sap/bc/adt/oo/classes/<pool>/includes/implementations`), one
  method — with its tests: the request (URL, version query, Accept) and a structured
  reading of a captured CCIMP.
- **The `MoveTransportObjects` doc comment** (D18): SAP moves by name, not by position.
- **#3's run id (from D8):** `core/shared/abapUnit.js` interpolates the run id raw into the
  status URL (`/abapunit/runs/{id}`) and the result URL (`/abapunit/results/{id}`). It is
  percent-encoded in both. Tests: adversarial ids (`/`, `?`, `#`, `%`, `..`) give the encoded
  path in both URLs.
- **#14 and #15 are removed, not fixed (owner, measured on premise).** SAP ignores
  `class:abstract` and `program:programType` on create: an `abstract=true` create gives a
  non-abstract class, and `modulePool`, `subroutinePool`, `M` and `F` all give an executable
  program. adt-clients drops both options from its create configs (and `convertProgramType`).
- **#348, the create language (owner, measured on the trial).** SAP takes a new object's
  original language from the request's logon language and ignores the body's. Every create
  given a language writes the language attributes **and** sends the `sap-language` header
  with the same value; given none, it writes neither and sends no header. The `'EN'`
  defaults are removed (a body without the attributes was measured accepted). Tests, per
  create: with a language — attributes and header carry it; without — neither.
- **#22:** `validation.js` omits a parameter whose value is `undefined` (domain, data element,
  authorization field, …). The function-module validation contract takes the parameters SAP
  requires, as measured (g3: a 400 without `description`).
- **#9:** `AdtTable.check` sends the given source, as the structure check does.
- **The outline method,** `getObjectOutline(…)` per object kind (one endpoint, one method),
  from D1's measured contract — not `getObjectStructure`, which is the existing repository
  object-structure member; its structured reading is adt-strategies' `readObjectOutline`.

**Cycle:**
- [ ] Step 1: Open an issue and a branch in adt-clients; write the failing tests there.
- [ ] Step 2: Fix, then run adt-clients' CI list locally.
- [ ] Step 3: Open the PR, get its review and CI, and leave the merge to the owner.
- [ ] Step 4: The owner releases and publishes. Check the registry (`npm view
  @mcp-abap-adt/adt-clients version`).
- [ ] Step 5 (in #346): bump `@mcp-abap-adt/adt-clients` to the released version, as a
  registry range only. `npm install` regenerates the lockfile; check it for `"link": true`
  and for anything not resolved from the registry. Then run build, `test:check` and the root
  `npm test`.
- [ ] Step 6 (in #346): add server-side pins for each changed request:
  - the create bodies with an escaped description (`CreateClass`, `CreateDomain`, … and
    compact `HandlerCreate` per type);
  - **#348, per create tool** (every full `Create<Type>` and compact `HandlerCreate` type that
    takes `master_language`): `master_language` given → the body's language attributes and
    the `sap-language` header carry it; not given, and no `SAP_LANGUAGE` / `x-sap-language`
    stated → neither the attributes nor the header;
  - `HandlerValidate` without a description (no `description=undefined` in the URL) and for
    `FUNCTION_MODULE`;
  - `CheckTable` with `ddl_code` (the source in the body);
  - `CreateTransport` with `transport_type: 'customizing'` (`tm:type="W"`) and
    `'workbench'` (`K`);
  - `RuntimeGetProfilerTraceData` with `view: 'statements'` and the threshold `0.1`: the
    statements GET's query carries `autoDrillDownThreshold=0.1` unchanged.

  Each pin is red before the bump and green after. Add CHANGELOG lines.
- [ ] **Step 6a: Remove `abstract` and `program_type` from the server** (owner: SAP ignores
  both on create). Today `CreateClass` takes `abstract` (compact `HandlerCreate` has no
  `abstract`), and `CreateProgram` and compact `HandlerCreate` (`PROGRAM`) take
  `program_type`. Failing tests first: the listed-schema test expects both gone; a call with
  either is refused by the schema before any request, naming it — the create tools' schemas
  are strict (the owner, 2026-11-05: compact `HandlerCreate` and every full `Create*` tool
  refuse an argument they do not declare, "<argument> is not an argument of <tool>"; spec §3). Then remove them
  from the schemas and handlers, update the listed-schema and surface fixtures (these
  removals only), and add MIGRATION-24.0 ("`abstract` (CreateClass) and `program_type`
  (CreateProgram, HandlerCreate PROGRAM) are removed: SAP ignores both on create; set them
  afterwards") and a CHANGELOG entry (Removed). Neither is a coverage key dimension (keys
  are `object_type`, `part`, `operation`, `action`), so no ledger row goes.
- [ ] **Step 6b: The language descriptions.** Every `master_language` description says "Defaults
  to the session language (SAP_LANGUAGE) or EN" (or similar). It becomes what is now true —
  functional, e.g. "Original language of the created object (e.g. EN, DE). Absent, the
  session language (SAP_LANGUAGE or x-sap-language) is used; with none, SAP's logon
  language applies." A description test per create tool. CHANGELOG: "Fixed: #348 — a
  created object's original language is the one given (or the session's), sent as the
  logon language SAP takes it from."
- [ ] **Step 6c: Live check of #348** (owner's go, realm check on each system): create a class
  in a language the system offers for logon, read its metadata and assert that original
  language, then delete it and assert it absent — on the cloud system with `DE`, on premise
  with `RU`. Measured on premise: `RU` is taken and an object created with it reads back `RU`;
  `DE` and `ES` fall back to `EN` over HTTP without a refusal, and the object gets `EN`.
- [ ] Step 7: Commit (`fix(deps): adt-clients <major> — escaped create bodies, create
  language, validation, table check, outline; abstract and program type removed`).

### D3. SAP's answers by key, never by words

**Files:**
- Modify: `src/lib/strategies/deletionRefusal.ts` (delete `absentPerCheck`),
  `src/lib/strategies/checkedDeletion.ts`, `src/lib/utils.ts` (`isAlreadyCheckedError`,
  `isAlreadyExistsError`, `parseValidationResponse`, the `<message>` quote around line 842),
  `src/lib/logger.ts` (the expected-error test around lines 105–113),
  `src/handlers/function/high/handleCreateFunctionGroup.ts` (`isInterfaceNotCreated`),
  `src/handlers/system/readonly/handleRuntimeGetDumpById.ts` (the termination link).
- Test: `src/__tests__/unit/deletion/sendWhenPermitted.test.ts`,
  `src/__tests__/unit/answers/keyNotWords.test.ts`, and a guard
  `src/__tests__/unit/sources/noProseMatching.test.ts`.

**Steps:**
- [ ] **Step 1: Failing tests,** built from the measured on-premise answers (live file #1, #11)
  with the deletion check's documents as fixtures.
  - `'an existing function module whose check says "does not exist" (W) with isDeletable=true
    is deleted'`: the `deletion/delete` request is pinned and the delete's answer relayed.
    The same for a function include, an inactive service definition and an inactive service
    binding.
  - `'a check with isDeletable=false is refused with its messages and T100 keys, nothing
    sent'`.
  - `'a delete refused by SAP is named by its T100 key through the delete's analyse
    strategy'` (e.g. `SWB_TOOL 029`, the key read at the step from the corpus or a live
    capture).
- [ ] **Step 2: Key, not words, for the other sites:**
  - "already exists" and "already checked" are recognised by the error body's T100 key
    (message class, number) and type, read with the XML parser. The keys come from the corpus
    (`tests/fixtures/adt/`) or, where it lacks one, a live capture on premise, recorded here.
    Where SAP gives no key, the structured verdict decides (the status and the exception type
    the body names), and SAP's text is relayed.
  - `logger.ts` decides whether an error is expected by the exception type element, not by
    words.
  - `handleCreateFunctionGroup` recognises its "interface not created" case by its T100 key.
  - The dump reader finds the termination link by its exact relation value, compared as a
    whole string.
  - Tests, one per site: the keyed case recognised; the same words with another key not
    recognised; the same key in another logon language recognised.
- [ ] **Step 3: Guard `noProseMatching.test.ts`** (compiler API, every package's production
  `src`, `scripts`, `tools`, no allowlist). It refuses a string-search call — `includes`,
  `indexOf`, `startsWith`, `endsWith`, `match`, `search`, `split` — or an equality
  comparison applied to **text** from an SAP answer, **whatever its argument**: a literal
  with or without spaces, a single word, or a computed pattern. Text is a value typed or
  flowing from an `IAdtResponse` body, an error's message or body, or a parsed document's
  text node / message text — recognised by type and flow (DO9), no allowlist. Still allowed:
  comparisons on the **structured key and type fields** a reader extracted (message class,
  message number, message type, exception type, status codes), recognised by their declared
  fields. Fixtures: each of the old sites refused, including the single-word
  `msgLower.includes('exist')` (`utils.ts`); a computed pattern (`text.includes(word)`) refused;
  a message-number comparison passes; a message-type letter comparison passes; building our
  own message text passes. Its limit: a value reaching the call through another module is
  left to review (as C2e's).
- [ ] **Step 4: Remove `absentPerCheck`.** When the check permits, the delete is sent and its
  answer relayed. Run the deletion and answer suites: PASS. Mutate each site back: red.
- [ ] **Step 5: CHANGELOG** (Fixed): "DeleteFunctionModule, DeleteFunctionInclude,
  DeleteServiceDefinition and DeleteServiceBinding left an existing object in place and
  answered success when SAP's deletion check worded it 'does not exist'; the delete is now
  sent whenever the check permits it."
- [ ] **Step 6: Commit.**

**Owed live captures (open after D3; each needs a live run):**
- [ ] **The function group create's interface `400`:** capture SAP's answer and read which T100
  key it carries — `EC 304` or `EC 408` (the two keys T100 holds for "Interface & has not been
  created", read on premise 2026-11-05), or none. `CreateFunctionGroup` reads the group back on
  either key; without a key it answers the `400` as it came. Its trigger is not known yet.
- [ ] **The dump's termination relation on premise:** `RuntimeGetDumpById` takes the link whose
  relation is `http://www.sap.com/adt/relations/runtime/dump/termination`, measured on the BTP
  ABAP environment only (2026-10-01); read a dump's links on premise and confirm the relation
  (the `#start=` fallback over any link is gone).
- [ ] **Creating an object that exists, per type:** measured on premise (2026-11-05) for a class
  (`400`, `ExceptionResourceAlreadyExists`, `SADT_RESOURCE 001`) and a program (`500`,
  `ExceptionResourceCreationFailure`, `XI 001`). Owed for every other create type —
  interface, include, function group, function module, function include, domain, data element,
  table, structure, table type, DDL, metadata extension, behavior definition, behavior
  implementation, service definition, service binding, message class, package — on premise and
  on the cloud system (the class too): the status, the exception type and the T100 key each
  answers. A key measured to mean a taken name joins `NAME_TAKEN_KEYS` with its evidence.

### D4. XML through the parser (the 67 class-A sites)

**Files** (regex inventory, class A): `enhancementAvailability.ts`,
`handleGetEnhancementImpl.ts`, `handleGetEnhancementSpot.ts`, `handleGetEnhancements.ts`,
`handleGetIncludesList.ts` (the `class:includeType` sites), `handleGetWhereUsed.ts`,
`writeTests.ts` (`packageRef`), `debugger/amdpReadings.ts`, `strategies/activationRun.ts`,
`strategies/feedPages.ts`, `strategies/feedVariants.ts` (with its hand entity decode),
`strategies/lockAnswer.ts`, `strategies/serviceBindingFacts.ts` (the XML sites),
`strategies/xmlPatch.ts` (read-modify-write).

**Steps:**
- [ ] **Step 1: Failing tests first, per file,** over the corpus documents each reads. Each
  test feeds a document the regex reads wrongly (attributes in another order, a namespace
  prefix, an entity, CDATA, a self-closing element) and asserts the reading the parser
  gives.
- [ ] **Step 2: Move each reader onto `parseStructure`** (`src/lib/strategies/reading.ts`) and
  the `src/lib/xml/tree.ts` helpers, or onto adt-clients' structured readings where one
  exists. Requests do not change: the existing pins stay green.
- [ ] **Step 3: `xmlPatch.ts`** writes by reading the document with the parser, changing the
  value in the structure, and serialising with fast-xml-parser's builder, with the same
  options as the reader. If byte-exact output matters to SAP (a reviewed corpus round trip
  shows), keep the documents' order and declarations, and pin the written body by literal.
- [ ] **Step 4:** Run `npm test` and `npm run test:check`: PASS.
- [ ] **Step 5: Commit, one per file group** (enhancements, includes / where-used, debugger,
  activation, feeds, lock, service binding, xmlPatch).

### D5. Remove the regex ABAP parsers; add the SAP-backed outline tool

**Prerequisites:** D1 (measured), D2 (the outline method released and bumped).

**Files:**
- Delete: `src/handlers/system/readonly/handleGetAbapAST.ts`,
  `handleGetAbapSemanticAnalysis.ts`, `handleGetAbapSystemSymbols.ts`, and their
  registrations (`src/lib/handlers/groups/SystemHandlersGroup.ts`, `src/lib/variantToolSet.ts`,
  `src/lib/longTools.ts`, `tools/long-handlers.json`), their unit tests, and the integration
  suite `readOnly/system/AbapSystemSymbolsHandler.test.ts`. #13 and #27 go with them.
- Create: the outline tool, `GetObjectOutline` (DO8). Its handler
  is `src/handlers/system/readonly/handleGetObjectOutline.ts`, calling adt-clients'
  `getObjectOutline` and reading the answer with adt-strategies' `readObjectOutline`.
- Modify: `docs/user-guide/AVAILABLE_TOOLS*.md`, `README.md`, `tools/tool-search.json`
  (generated), the listed-schema and surface fixtures (the removals and the addition only),
  `MIGRATION-24.0.md`, `CHANGELOG.md`, the coverage ledger (C10 drops the three keys; the
  outline tool's keys go to C8).

**Interfaces:**
- `GetObjectOutline` takes `object_type` (the kinds D1 measured: class, interface, and on
  premise program and function group), `object_name`, and optional `version`.
- It answers the components: name, kind, visibility, signature (parameters and their kinds),
  and each one's **source position** (include, start and end line/column) as SAP gives them.
- Description (functional): "Lists the components of the ABAP object named by object_type and
  object_name — types, attributes, methods, events, forms or modules — with their
  visibility, signature and the source lines each occupies, as SAP's object structure
  states them."

**Steps:**
- [ ] **Step 1: Failing tests.**
  - The listed-schema test expects the three tools gone and `GetObjectOutline` listed on the
    variants D1 found.
  - A `pinCases` row for each object type, its literal request from D1's measurement.
  - An answer test over D1's captured documents.
- [ ] **Step 2:** Delete the three tools and add the outline tool. Run: PASS.
- [ ] **Step 3: How the model reads a range of source.** The positions name lines, but every
  source read today returns the whole source. **Owner decision (DO1): the cut is the
  server's.** The `Get<Type>` source reads take an optional line range (`start_line`,
  `end_line`); the server sends its one GET as today and answers only those lines.
  Measured on premise (2026-11-04): ADT serves no part of a source — `Range: bytes=…`,
  `Range: lines=…`, `?start/end`, `?startLine/endLine` and a `#start=…;end=…` fragment each
  answer `200` with the whole text and no `Accept-Ranges` / `Content-Range`, and no
  discovery template of a `source` resource has a range parameter (`/source/main` takes
  `corrNr`, `lockHandle`, `version`). Tests:
  - the pinned request is the unchanged source GET, and the answer holds exactly the asked
    lines;
  - **refused with zero requests** — only what is known before the GET: a non-positive or
    non-integer line (by the schema), and `end_line` before `start_line` (by the schema's
    refinement, else the handler before sending);
  - **refused after the one unchanged GET** — a range outside the source: its length is known
    only from the answer, so the case pins the GET, then asserts the refusal naming the
    source's line count;
  - for a function module, D7's metadata read comes first, then the one source GET: both
    pinned, in that order.
  The outline tool itself does not change.
- [ ] **Step 4: Live cases** (`coverage/system.live.test.ts` or C8's file, both systems): the
  outline of a class the test creates lists its methods with positions, and those lines in
  the source hold the method.
- [ ] **Step 5: MIGRATION-24.0.** The section names the three removed tools and their
  replacements:
  - `GetAbapAST` / `GetAbapSemanticAnalysis` → `GetObjectOutline` for structure, plus the
    source reads;
  - `GetAbapSystemSymbols` → `GetObjectOutline` and `GetWhereUsed`, for what an object
    defines and uses.

  The section states why: they parsed ABAP with regular expressions, and SAP gives the
  structure itself. CHANGELOG: Removed, and Added.
- [ ] **Step 6: Commit.**

### D6. No regular expression in production code (the rest)

**Scope:** every site of the regex inventory not removed by D3–D5:
- class C (36), class D (16) and class B (5): names, arguments, URIs, timestamps, literals;
- the class E sites outside the removed tools: `handleGetIncludesList.ts`'s INCLUDE line scan,
  `handleGetStructuresList.ts`' DDL include and `extend type` scan, `serviceBindingFacts.ts`'
  CDS `expose` / association / redirect scan, `writeTests.ts`' INCLUDE line and
  `escapeRegExp`, `connectionFactory.ts`' redaction test;
- `scripts/portable/*` and `tools/*.js`.

**Steps:**
- [ ] **Step 1: Failing tests per file,** for the inputs the regex mishandles (a CR-only line
  end, a lower-case keyword, a namespaced name `/NS/NAME`, an empty segment, a glob with
  `.`), each asserting the plain-code result.
- [ ] **Step 2: Replace with plain string code:** `indexOf`, `slice`, `split` on fixed
  literals, `URL` / `URLSearchParams`, a linear glob matcher for package patterns, character
  tests by char code, set membership for SAP's message-type letters, `trimEnd`, and a
  lower-cased set for the redaction names.
- [ ] **Step 3: The source scans in kept tools — owner decision (DO2: SAP-backed where D1
  shows SAP states it, otherwise a plain line scanner):**
  - `GetIncludesList` (the INCLUDE statements of a program's source);
  - `GetStructuresList` (DDL `include` / `extend type`);
  - service-binding facts (the CDS `expose` lines).

  Each reading comes from SAP (the outline of D1/D5, the where-used list, or the object
  structure) where D1 shows SAP states it; otherwise a plain line scanner without regex
  keeps today's reading.
- [ ] **Step 4: Widen the guard.** `src/__tests__/unit/sources/noRegexOverInput.test.ts`
  scans every git-tracked production file of every package (`src`, `scripts`, `tools`, as the
  inventory did: `.ts`, `.js`, `.mjs`, `.cjs` outside `__tests__`) for a regular-expression
  literal and any `RegExp` construction. There is no allowlist, and the per-file and
  per-function lists it holds today go. Fixtures: a literal, `new RegExp`, `RegExp(` and a
  regex in a `.cjs` script are each refused. The scan must find all 211 inventory sites on the
  code before this stage (red), and zero after.
- [ ] **Step 5:** Run `npm test`, `npm run test:check` and every package's `lint:check`:
  PASS. Mutate one regex back in each tree (`src`, `scripts`, `tools`): red.
- [ ] **Step 6: Commit, per area.**

### D7. Function modules: the group is checked (#2)

**Files (every served path that addresses an existing function module through a group —
swept over the listed schemas: every tool with `function_group_name` beside a module, and
every compact tool whose `object_type` enum has `FUNCTION_MODULE`):**
- **full tools:**
  - `UpdateFunctionModule` → `src/handlers/function/high/handleUpdateFunctionModule.ts`;
  - `GetFunctionModule` → `src/handlers/function_module/high/handleGetFunctionModule.ts`;
  - `DeleteFunctionModule` → `src/handlers/function_module/high/handleDeleteFunctionModule.ts`;
  - `ActivateFunctionModule` → its handler;
  - **`ActivateObjects`** → `src/handlers/common/low/handleActivateObject.ts`: every
    `objects[]` entry of type `FUGR/FF` carries its group in `parentName`;
  - **`CheckFunctionModule`** → `src/handlers/function/high/handleCheckFunctionModule.ts`,
    which delegates to `src/handlers/function/low/handleCheckFunctionModule.ts`, which sends
    `.check({ functionModuleName, functionGroupName }, …)` directly;
  - `GetFunctionModuleVersions` and `GetObjectVersions` with `object_type` `FUNCTION_MODULE`
    (the version list is read under the given group);
  - **`RunFunctionModuleUnitTest`, by runner:** the **sync** runner requires
    `function_group_name` and addresses the module under it — checked; the **async** runner
    forwards only the module name (the installed runner sends a `FUNC` target) and works
    without a group — when `function_group_name` is given there, it is checked and a
    mismatch refused; when it is absent, nothing extra is sent and the async call stays as
    it is;
  - **`GetWhereUsed`**, single form (`object_name` `GROUP|FM_NAME` with `object_type`) and
    list form (`objects[]`, each `GROUP|FM_NAME`): it shares its reader with the compact
    `HandlerWhereUsed`.
- **compact routes:**
  - `HandlerUpdate` → `src/handlers/common/low/handleUpdateUnderLock.ts` →
    `src/handlers/function/low/handleUpdateFunctionModule.ts`;
  - `HandlerActivate` → `compact-modify/src/handlers/handleHandlerActivate.ts` →
    `handleActivateObjectOnce` → `src/handlers/common/low/handleActivateObject.ts`, in each of
    its forms: the **single** form (`FUNCTION_MODULE` by `object_type`, `GROUP|MODULE` or
    `function_group_name`, turned into `{ name, parentName }`), the **code** form
    (`object_adt_type` `FUGR/FF` with `parentName`) and the **list** form (`objects[]`,
    `FUGR/FF` entries with `parentName`);
  - `HandlerGet` → the `GetFunctionModule` read;
  - `HandlerDelete` → `src/handlers/common/low/handleDeleteOnly.ts` → its `FUNCTION_MODULE`
    entry in `deletionTargets.ts`;
  - `HandlerDeletionCheck` → `src/handlers/common/low/handleDeletionCheck.ts` → the same
    `deletionTargets.ts` entry;
  - **`HandlerCheckRun`** `FUNCTION_MODULE` → `src/handlers/common/low/handleCheckObject.ts`
    (`GROUP|MODULE` in `object_name`);
  - **`HandlerLock` / `HandlerUnlock`** `FUNCTION_MODULE` →
    `src/handlers/common/low/handleLockObject.ts` / `handleUnlockObject.ts` (`GROUP|MODULE`);
  - **`HandlerWhereUsed`** `FUNCTION_MODULE` → the where-used reader `GetWhereUsed` shares
    (with `function_group_name`).
- **Swept and left out, with the reason:** `CreateFunctionModule` and `HandlerCreate`
  `FUNCTION_MODULE` (the module does not exist yet; the group is the container the create
  names, so there is no metadata to read); `HandlerValidate` `FUNCTION_MODULE` (validates a
  prospective name before a create; the same). The function-group tools
  (`…FunctionGroup…`, `…FunctionInclude…`, `ListFunctionModules`,
  `ListFunctionGroupIncludes`, `RunFunctionGroupUnitTest`) address the group itself, not a
  module through it. `HandlerUnitTestRun` addresses its targets by URI, not by group and
  module name.

- [ ] **Step 1: Failing tests** on `recordingConnection`, from the live measurement (SAP
  ignores the group segment):
  - `'UpdateFunctionModule with another group's name is refused after one metadata read,
    nothing written'`: requests pinned — exactly the metadata GET, with its
    `adtcore:containerRef` naming the real group, then nothing;
  - the same mismatch test, and a matching-group test, for each path above:
    `GetFunctionModule`, `ActivateFunctionModule`, `DeleteFunctionModule`,
    `CheckFunctionModule` (through its low handler's `.check`), `GetFunctionModuleVersions`,
    `GetObjectVersions` `FUNCTION_MODULE`, `RunFunctionModuleUnitTest` (sync; and async
    with a group given), `ActivateObjects` with a `FUGR/FF` entry, `GetWhereUsed` single and
    list, and
    the compact `HandlerGet`, `HandlerUpdate`, `HandlerActivate`, `HandlerDelete` (through
    `handleDeleteOnly`), `HandlerDeletionCheck` (through `handleDeletionCheck`),
    `HandlerCheckRun` (through `handleCheckObject`), `HandlerLock`, `HandlerUnlock` and
    `HandlerWhereUsed`;
  - in every matching-group test the metadata GET is pinned **first** — before any deletion
    check, syntax check, version read, run, lock, unlock, where-used scope or reference
    request (and before a batch envelope is dispatched, when the where-used read runs inside
    one), activation POST, or write — then the path's existing requests;
  - **activation, every module reference:** `ActivateObjects` and `HandlerActivate` (single,
    code and list forms) with two `FUGR/FF` references — one mismatched group refuses the
    whole activation with **no** POST (the metadata reads pinned, then nothing); all
    matching sends the POST after one metadata read per module reference;
  - **`GetWhereUsed` list:** one mismatched `GROUP|FM_NAME` entry refuses the call before any
    scope or reference request; all matching goes on after one metadata read per entry;
  - **`RunFunctionModuleUnitTest` async without a group:** no metadata read, the existing
    requests unchanged (pinned) — `'an async run without a group sends nothing extra'`.
- [ ] **Step 2:** One shared check, `checkFunctionModuleGroup(context, group, module)`, in
  `src/lib/strategies/functionModuleGroup.ts` (new), reads the module's metadata (one GET)
  and refuses when the given group differs from `adtcore:containerRef`'s name. Every path
  above calls it before anything else. The two check paths do not share a handler, so each
  calls it: `CheckFunctionModule` in its low handler
  (`src/handlers/function/low/handleCheckFunctionModule.ts`) before its `.check`, and
  `HandlerCheckRun` `FUNCTION_MODULE` in `src/handlers/common/low/handleCheckObject.ts`
  before its own `.check`; each keeps its own mismatch and match pins. For
  `GetFunctionModule`'s metadata part, that read is the answer itself.
- [ ] **Step 3: Compact.** The compact tools take the group (`function_group_name`, or
  `GROUP|MODULE` in `object_name`) and reach the paths above, so they check it the same way;
  their pins gain the metadata GET first.
- [ ] **Step 4:** CHANGELOG (Fixed): "the function-module tools refuse a function group that
  does not hold the module". Commit.

### D8. GetUnitTestResult waits only for a running run (#3)

**Files:** `src/handlers/unit_test/shared/pollRun.ts` (`readRunOnce`) and its callers:
`src/handlers/unit_test/high/handleGetUnitTestResult.ts`, `handleGetCdsUnitTestResult.ts`,
`handleGetUnitTest.ts`, `handleGetCdsUnitTest.ts`, and `src/handlers/unit_test/shared/runTests.ts`
(the run tools' wait).

**What is served, and what changes.**
- **Served tools that change:** `GetUnitTestResult` (the one full result reader registered,
  in `HighLevelHandlersGroup` and `ReadOnlyHandlersGroup`), and the run tools whose wait goes
  through `runTests.ts` (`RunAbapUnit`, `RunUnitTest`, `RunProgramUnitTest`,
  `RunFunctionGroupUnitTest`, `RunFunctionModuleUnitTest`, `RunCdsUnitTest`, as each uses
  it). They read the status first without long polling, then long-poll only a running run.
  Their pins, live cases and CHANGELOG line are about these tools only.
- **Exported handlers, not served tools:** `handleGetCdsUnitTestResult`, `handleGetUnitTest`
  and `handleGetCdsUnitTest` call `readRunOnce` too and change with it. They get unit tests
  of the exported handlers, kept apart from the served tools' pins, with no ledger key and no
  MIGRATION claim. No tool is added for them.
- **What stays:** the compact result tools (`HandlerUnitTestResult`,
  `HandlerCdsUnitTestResult`, `HandlerGet` `UNIT_TEST` / `CDS_UNIT_TEST`) call the `…Once`
  readers, `src/handlers/unit_test/shared/resultOnce.ts`' `readResultOnce`, which read only
  the result — no status, no wait — and keep that behaviour.
- C12's inventory (`GetUnitTestResult`, the run tools, the compact tools) is what is
  registered, and stays so.

- [ ] **Step 1: Failing tests** on `recordingConnection`. Served-tool pins
  (`src/__tests__/unit/pins/unitTests.pins.test.ts`): `GetUnitTestResult`, and one run tool per
  wait path through `runTests.ts`. Exported-handler tests, apart
  (`src/__tests__/unit/unitTest/exportedRunReaders.test.ts`): `handleGetCdsUnitTestResult`,
  `handleGetUnitTest`, `handleGetCdsUnitTest`. Each covers:
  - `'an unknown run answers NOT_STARTED at once'`: one status read **without**
    `withLongPolling`, its answer `NOT_STARTED`, no second read;
  - `'a running run is long-polled'`: the first read without long polling says running, the
    next carries `withLongPolling=true`;
  - `'a finished run is read without waiting'`;
  - `'the compact result tools still read only the result'`: one result GET, no status read.
- [ ] **Step 1a: The run id in the URL** is encoded by adt-clients (D2:
  `core/shared/abapUnit.js` interpolates it raw into the status and the result URL). After
  D2's bump, pins here assert both URLs with an id holding `/`, `?`, `#` and `%`
  percent-encoded.
- [ ] **Step 2:** `readRunOnce` reads the status first without long polling. It long-polls
  only a run whose status says it is running, re-reading after each answer with no limit and
  no timer (SAP holds about 300 s per read, measured).
- [ ] **Step 3:** CHANGELOG (Fixed), naming the served tools only. Commit.

### D9. Held locks on stdio and SSE (#4)

**What the code shows.** `HeldLocks` is created per instance only by the Streamable HTTP
server (`StreamableHttpServer.ts`); `BaseMcpServer` accepts an owner only when one is
supplied, and the stdio and SSE servers (`server-runtime/src/sse/SseServer.ts`, where each
instance is constructed) supply none. The served tools that take or give a lock handle are: `HandlerLock`
(registers through `heldLocks.hold`), `HandlerUnlock` (checks `lockHeldHere`, releases),
`HandlerUpdate` (`handleUpdateUnderLock`, checks) and `HandlerDelete` (`handleDeleteOnly`,
checks) — and the full `UpdateBehaviorDefinition` and `UpdateMetadataExtension`, which take
an optional `lock_handle` and write under it **without** `lockHeldHere`. `LockObjectLow` and
`UnlockObjectLow` exist as handlers but are no served tool; they are reached only through
`HandlerLock` / `HandlerUnlock`, whose wrappers register and release. On stdio every check
passes, because no `heldLocks` exists there — and the same on SSE.

**Files:** `src/lib/state/heldLocks.ts` (`lockHeldHere`), the stdio server's instance setup
(`server-runtime/src/stdio/…`) and the SSE server's (`server-runtime/src/sse/SseServer.ts`,
where it constructs each instance), each beside how `StreamableHttpServer.ts` creates its
`heldLocks`, `compact-modify/src/handlers/handleHandlerLock.ts`,
`compact-modify/src/handlers/handleHandlerUnlock.ts`,
`src/handlers/common/low/handleUpdateUnderLock.ts`, `handleDeleteOnly.ts`,
`src/handlers/behavior_definition/high/handleUpdateBehaviorDefinition.ts`,
`src/handlers/ddlx/high/handleUpdateMetadataExtension.ts`.

- [ ] **Step 1: Failing tests,** in process, on **each transport — stdio, Streamable HTTP and
  SSE** (each instance its own owner):
  - **registration:** `'HandlerLock registers its handle on stdio'`;
  - **enforcement, foreign handle refused with zero requests:** `HandlerUnlock`,
    `HandlerUpdate`, `HandlerDelete`, `UpdateBehaviorDefinition` and
    `UpdateMetadataExtension` each with a handle this instance did not issue;
  - **own handle succeeds:** each of the same with the handle `HandlerLock` gave — its
    request pinned;
  - **release:** `'HandlerUnlock releases the handle, and a second unlock with it is
    refused'`.

  SAP releases the session's lock on any handle (measured), so the refusal is ours to make.
- [ ] **Step 2:** The stdio instance and every SSE instance own a `HeldLocks`, created where
  the instance is constructed, as the Streamable HTTP server does; it is attached to the
  instance's state. Only then does `lockHeldHere` stop answering true for an absent owner —
  every transport has one, so a legitimate lock on SSE is not refused. A test,
  `'every transport's instance has its own held-lock owner'`, asserts it for the three. The
  two full updates check `lockHeldHere` before writing under a given `lock_handle`.
- [ ] **Step 3:** CHANGELOG (Fixed). Commit.

### D10. Compact debug end ends the batch answers (#5)

**Files:** `src/lib/compact/debug/shared.ts` (`endAnswer`).

- [ ] Step 1: Failing test, `'HandlerDebugSession end after HandlerDebugBatch ends the debug
  state and a new session can start'`, on `adtStandIn` through `pinServer`.
- [ ] Step 2: `endAnswer` calls `endDebugBatchAnswers`. Run: PASS.
- [ ] Step 3: CHANGELOG (Fixed). Commit.

### D11. Package walks (#6, GetPackageContents' unknown package)

**Files:** `src/lib/strategies/packageWalk.ts` (`walkPackages`, `walkPackage`),
`src/handlers/package/readonly/handleGetPackageContents.ts`.

- [ ] **Step 1: Failing tests** over the measured node-structure answers (the root and the
  `DEVC/K` node both list the subpackages):
  - `'each subpackage is listed once'` (5 entries, not 9);
  - `'GetPackageContents refuses an unknown package'`: an existence read like
    `GetPackageTree`'s, pinned, answering not found.
- [ ] **Step 2:** De-duplicate by object identity (type and name). Read the package's
  existence first.
- [ ] **Step 3:** CHANGELOG (Fixed). Commit.

### D12. Service definitions, bindings, message classes, transports (#10, #12, #16, #17, #18)

- [ ] **#10 `CreateServiceDefinition` without `source_code` — owner decision (DO3):** the
  description stops promising a template, and an empty definition is created as SAP does:
  the server invents no content. A test of the description, and CHANGELOG.
- [ ] **#12 message class.**
  - **Fixed now:** `DeleteMessageClass` and `DeleteMessageClassMessage` relay SAP's answer
    instead of a constant success. Failing tests over the corpus answers (an unknown class,
    an unknown number).
  - **Owner decision (DO4): add the reads.** SAP answers `201` to a duplicate class or a
    bad package and creates nothing, and a message create and update are one upsert:
    - a read after `CreateMessageClass` that refuses when the class is absent;
    - a read before `CreateMessageClassMessage` that refuses an existing number;
    - a read before `UpdateMessageClassMessage` that refuses an unknown number.

    Each is one pinned GET, with a failing test first.
- [ ] **#16 `GetTransport` counts:** `object_count` and `task_count` are read from the request
  document even when `include_objects` / `include_tasks` are false. Failing test over the
  corpus document, then the fix.
- [ ] **#17 `CreateFunctionGroup`:** the `activate` parameter's description states what
  happens (SAP creates a function group active). A test of the description, and CHANGELOG.
- [ ] **#18 `DeleteServiceBinding`:** the answer names the binding, not SAP's internal id.
  Failing test, then the fix. SAP's acceptance of an unknown service definition stays SAP's
  (measured); a pre-check is not added.
- [ ] Commit per item.

### D13. Version lists of an unknown object (#24)

**Owner decision (#25):** `content_uri` comes from the object's version list and is read as
given. The version source and diff tools keep their contracts (`content_uri`, and
`object_type` where they take it); nothing in the URI is checked.

**Files:** `src/handlers/common/readonly/resolveVersionedObject.ts`
(`analyseUnsupportedStatus([404, 406], …)`).

- [ ] **Step 1: Failing test** `'a version list of an unknown object answers not found'`: the
  404 body's exception type (`ExceptionResourceNotFound`, from the corpus or a live capture)
  is read with the parser and answers "not found"; a 406 stays "no version history"; a 404
  without that exception type is relayed as SAP answered it.
- [ ] **Step 2:** Read the exception type through the parser, not the status alone.
- [ ] **Step 3:** CHANGELOG (Fixed). Commit.

### D14. Remaining contract fixes (#26, the doubts)

- [ ] **#26 `GetAdtTypes`' `validate_type` — owner decision (DO5): removed,** since it does
  nothing. Listed-schema fixture, MIGRATION, CHANGELOG.
- [ ] **`HandlerGetData` with both `object_name` and `sql_query` — owner decision (DO6): the
  pair is refused,** with zero requests: the model is not silently ignored. Failing test,
  then the fix.
- [ ] **`GetObjectNodeFromCache` — owner decision (DO7):** its cache is a process-wide module
  global, shared by every session, against the owner's MCP rule, and the campaign found it
  always answers "not in cache": the tool is removed, with MIGRATION.
- [ ] **`GetServiceBinding` `response_format: json`:** answers the parsed document as JSON,
  not the raw XML string. Failing test, then the fix.
- [ ] **Profiler:** `RuntimeAnalyzeProfilerTrace`'s `top` of 0 or less, and a negative
  `max_size_for_trace_file`, are refused by the schema (`refusal: 'thrown'`), not clamped.
  Failing tests, then the fix. CHANGELOG and the listed-schema fixture.
- [ ] Commit per item.

### D15. GetIncludesList: an unknown root fails the call

**What the code and SAP show.** A program that does not exist answers `404`
`ExceptionResourceNotFound` for its source and its metadata (measured).
`handleGetIncludesList.ts`' `readSource()` maps that to `{ kind: 'absent' }` for every
read, the root included (the root's `readObjectSource('PROG/P', …)` and
`readInclude(parent.name)`). `sourceOf()` then answers `''`, and the call answers an empty
tree. `absent` is right only for a nested include that is not there.

- [ ] **Step 1: Failing tests** (corpus 404 document, read with the parser by exception type):
  - `'an unknown root program fails the call'`: the root read pinned, then a refusal naming
    the object, with no further requests;
  - `'an unknown nested include stays absent'`: the root read and the include read pinned;
    the tree lists the include as absent, as today.
- [ ] **Step 2:** The root read's `absent` becomes a failure of the call; nested reads keep
  `absent`.
- [ ] **Step 3:** CHANGELOG (Fixed). Commit.

### D16. MemorySnapshotList answers one shape

**What the code shows.** `handleMemorySnapshotList.ts` answers an array when the list has
entries and `{ snapshots: [], authorization: … }` when it is empty, for terse and full alike.

- [ ] **Step 1: Failing tests:** `'a non-empty list answers { snapshots: [...] } without
  authorization'`; `'an empty list answers { snapshots: [], authorization }'`. Both terse and
  full.
- [ ] **Step 2:** Always answer `{ snapshots }`; add `authorization` only when the list is
  empty.
- [ ] **Step 3:** CHANGELOG (Changed) and MIGRATION-24.0 (the answer is always an object with
  `snapshots`; a caller that read the array reads `snapshots`). C15's `MemorySnapshotList`
  live assertion reads the same shape. Commit.

### D17. GetBehaviorImplementation reads the implementations

**What the code shows.** `GetBehaviorImplementation` (and compact `HandlerGet`
`BEHAVIOR_IMPLEMENTATION`) reads the pool's main source and metadata only. The behaviour
itself — the handler and saver classes (`lhc_…`, `lsc_…`) — sits in the pool's
`includes/implementations` (CCIMP). adt-clients already has an unused reader for it:
`getBehaviorImplementationImplementations` (`core/behaviorImplementation/read.js`), reading
`/sap/bc/adt/oo/classes/<pool>/includes/implementations`.

**Contract:** the `part` enum of `GetBehaviorImplementation` and of `HandlerGet`
`BEHAVIOR_IMPLEMENTATION` gains `implementations`. Today's main-source read stays the default.

- [ ] **Step 1: Failing tests:** a `pinCases` row for `GetBehaviorImplementation#implementations`
  and for `HandlerGet#BEHAVIOR_IMPLEMENTATION#implementations`, each pinning the one GET of
  `…/includes/implementations`; an answer test over a corpus or captured CCIMP; the default
  part still pins `source/main`.
- [ ] **Step 2:** Add the part to both schemas and route it to the published
  `AdtBehaviorImplementation.readImplementations` member (added in the D2 release, which
  comes before this task's pins).
- [ ] **Step 3: Live case** (C8's file, both systems): the `implementations` part of the
  behavior pool C3 creates over its own root, or of a shared fixture pool, holds a
  `lhc_` class.
- [ ] **Step 4:** Listed-schema fixture (the added enum value only), C8's keys (below),
  CHANGELOG (Added). Commit.

### D18. Description fixes

Each with a description test (`src/__tests__/unit/descriptions/…`):
- [ ] **`MoveTransportObjects`:** SAP moves the entry by name and does not check `position`
  (measured by the campaign); the description stops saying the entry is named by its
  position, and says what SAP does. The adt-clients doc comment that says the same is
  corrected in the D2 release.
- [ ] **`RuntimeGetProfilerTraceData` `statements`:** the description says the view is SAP's
  aggregated call tree (procedure-like entries), as the request's Accept header selects it.
- [ ] CHANGELOG (Fixed: descriptions). Commit.

### D19. One XML module (owner)

**Why.** fast-xml-parser's lenient parse closes unclosed tags, so a truncated SAP answer reads
as a valid partial document. Today only `xmlPatch` validates first. Eighteen production files
under `src/` and two under `tools/` import fast-xml-parser directly, so changing the parser
would mean editing all of them. The owner wants one module of ours as the only importer.

**What the code shows (re-listed at Step 1).** The importers, by parse entry point (each
parser instance or call path, not each file), with the options each uses today:

| Entry point | Options today (every key set, as written at HEAD; unlisted keys are the parser's defaults) |
| --- | --- |
| `src/lib/strategies/reading.ts` `parseStructure` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `attributesGroupName: '@'`, `parseAttributeValue: false`, `parseTagValue: false`, `removeNSPrefix: false`, `htmlEntities: true`, `isArray`: true when the element name, with a leading `prefix:` removed, is one of `msg`, `entry`, `checkReport`, `checkMessage`, `alert`, `detail`, `stackEntry`, `objectReference`, `object`, `testClass`, `testMethod`, `program`, `link`, `request`, `task`, `node`, `SEU_ADT_OBJECT_TYPE_INFO`, `SEU_ADT_OBJECT_CATEGORY_INFO`, `SEU_ADT_REPOSITORY_OBJ_NODE` (the `REPEATABLE` set) |
| `src/lib/strategies/atcFindings.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `attributesGroupName: '@'`, `parseAttributeValue: false`, `parseTagValue: false`, `removeNSPrefix: true` |
| `src/lib/strategies/packageSummary.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `attributesGroupName: '@'`, `parseAttributeValue: false`, `parseTagValue: false`, `removeNSPrefix: true` |
| `src/lib/strategies/sqlPreview.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `attributesGroupName: '@'`, `parseAttributeValue: false`, `parseTagValue: false`, `isArray`: true when the element name, with a leading `prefix:` removed, is `columns` or `data`; `removeNSPrefix: true` |
| `src/lib/strategies/packageWalk.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `parseAttributeValue: false`, `parseTagValue: false`, `trimValues: true` |
| `src/lib/strategies/functionGroupStructure.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''` |
| `src/lib/checkRunParser.ts` | `ignoreAttributes: false`, `attributeNamePrefix: '@_'` |
| `src/lib/utils.ts` `parseValidationResponse` | `ignoreAttributes: false`, `attributeNamePrefix: '@_'` |
| `src/lib/utils.ts` `parseActivationResponse` | `ignoreAttributes: false`, `attributeNamePrefix: '@_'`, `parseAttributeValue: true` |
| `src/lib/debugger/readings.ts` `parser` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `removeNSPrefix: true`, `parseTagValue: false`, `parseAttributeValue: false`, `trimValues: false`, `isArray`: true when the name is one of `STPDA_DEBUGGEE`, `STPDA_ADT_VARIABLE`, `STPDA_ADT_VARIABLE_HIERARCHY`, `stackEntry`, `breakpoint` |
| `src/lib/debugger/readings.ts` `exceptionParser` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `removeNSPrefix: true`, `parseTagValue: false`, `parseAttributeValue: false`, `isArray`: true when the name is `entry` |
| `src/lib/debugger/amdpReadings.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `removeNSPrefix: true`, `parseTagValue: false`, `parseAttributeValue: false`, `trimValues: false`, `isArray`: true when the name is one of `mainResponse`, `variable`, `columns`, `data`, `breakpoint`, `callstackEntry`; no `htmlEntities` (recorded for D6) |
| `src/lib/debugger/memoryReadings.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `removeNSPrefix: true`, `parseTagValue: false`, `ignoreDeclaration: true`, `isArray`: true when the name is `snapshot` |
| `src/handlers/transport/readonly/handleGetTransport.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `textNodeName: '_text'`, `parseAttributeValue: true`, `isArray`: true when the name is one of `tm:object`, `tm:task`, `object`, `task` |
| `src/handlers/system/readonly/runtimePayloadParser.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''` |
| `src/handlers/system/readonly/handleRuntimeGetDumpById.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `removeNSPrefix: true` |
| `src/handlers/system/readonly/handleGetTypeInfo.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''`, `parseAttributeValue: false`, `parseTagValue: false`, `trimValues: false`, `isArray`: true when the name is `doma:fixValue` |
| `src/handlers/service_binding/high/serviceBindingPayloadUtils.ts` | `ignoreAttributes: false`, `attributeNamePrefix: ''` |
| `src/handlers/include/readonly/handleGetMainPrograms.ts` | `ignoreAttributes: false`, `attributeNamePrefix: '@_'` |
| `src/lib/xml/ordered.ts` parser (`isWellFormed`, `parseOrdered`) | `preserveOrder: true`, `ignoreAttributes: false`, `attributeNamePrefix: ''`, `parseTagValue: false`, `parseAttributeValue: false`, `trimValues: false`, **`processEntities: false`** (so `xmlPatch` keeps entities as written), `cdataPropName: '#cdata'`, `commentPropName: '#comment'` |
| `src/lib/xml/ordered.ts` builder (`buildOrdered`) | the parser's options plus `suppressEmptyNode: true` |
| `tools/runtime-profiling-dumps-explorer.js` | `ignoreAttributes: false`, `attributeNamePrefix: '@_'` |
| `tools/debug-runtime-explorer.js` | `ignoreAttributes: false`, `attributeNamePrefix: '@_'` |

Step 1 re-reads every `new XMLParser(` and `new XMLBuilder(` in production at HEAD and makes
that this table is still option-for-option exact before any profile is named. The `isArray`
conditions above are written out in full, and each profile keeps its condition exactly
(the two prefix-stripping conditions are re-expressed in plain string code under D6's
no-regex rule, with the same result).

These do not share one set of options, so no single profile can serve them, and decoding is
not identical everywhere: the ordered round trip keeps entities on purpose.

**Files:**
- Create in `src/lib/xml/` (beside `ordered.ts` and `tree.ts`): `src/lib/xml/profiles.ts`, the
  one importer of fast-xml-parser in production code, plus `ordered.ts` moving onto it.
  - **Named, fixed profiles.** Each option set in use is kept as a named profile, its options
    fixed inside the module. Callers choose a profile by name and pass no options. The names
    are decided at Step 1 from the inventory; similar sets are merged only where an answer pin
    proves the merge changes no answer. Each `isArray` rule stays with its caller's profile, as
    a fixed list of element names.
  - **`parseXmlStrict(text: string, profile: XmlProfile): unknown`.** It validates with
    `XMLValidator` first, then parses with the profile. A document that is not well-formed is
    refused with a typed `MalformedXmlError` carrying the validator's line and code, never the
    document's text.
  - **The ordered profile** (`parseOrdered`, `buildOrdered`, `isWellFormed`) keeps
    `processEntities: false` and the builder's `suppressEmptyNode`: a round trip writes back
    the entities it read.
  - **Entity decoding is per profile, by contract.** The structured readings decode entities
    (with `htmlEntities` where they read text a person reads, as `parseStructure` does; the AMDP
    reader joins that profile — its missing `htmlEntities`, recorded for D6, is folded in
    here). The ordered profile does not decode. No claim of identical decoding across
    profiles.
- Modify: every entry point listed above, to call the module with its profile.
- Test:
  - `src/__tests__/unit/sources/oneXmlModule.test.ts`, the guard;
  - `src/__tests__/unit/xml/profiles.test.ts`, one block per profile;
  - per entry point, a truncation test and a pre-move answer pin beside its existing tests;
  - `xmlPatch`'s two paths.

**Steps:**
- [ ] **Step 1: The guard, red, and the inventory.**
  - `oneXmlModule.test.ts` walks every git-tracked production file of every package (`src`, the
    sub-packages, `scripts`, `tools`; `.ts`, `.js`, `.mjs`, `.cjs` outside `__tests__`) with
    the compiler API. It refuses any `import … from 'fast-xml-parser'`,
    `import('fast-xml-parser')` or `require('fast-xml-parser')` outside the module, with no
    allowlist beyond the module.
  - Fixtures: a direct `import` is refused, a `require` in a `.cjs` script is refused, an import
    through the module passes.
  - Run it: it fails, naming the 18 + 2 importers.
  - Re-list every parse entry point with its options (the table above), and name the profiles.
- [ ] **Step 2: Each profile's own contract, tests first** (`profiles.test.ts`):
  - for each structured profile: its attribute naming (grouped `@`, or prefix `''` / `@_`),
    namespace handling, value coercion or not, trimming, and its `isArray` names, each shown
    on a corpus document; its entity decoding (`&lt;`, `&amp;`, a numeric reference, and an
    HTML entity where the profile decodes them);
  - for the ordered profile: entities are kept as written, and a corpus document round-trips
    byte for byte through `parseOrdered` / `buildOrdered`;
  - for every profile: a truncated document (cut mid-element) and an unclosed tag are refused
    with `MalformedXmlError`, carrying no document text.
- [ ] **Step 3: `xmlPatch`, both paths, validated once.** `src/lib/strategies/xmlPatch.ts` already
  validates before `parseOrdered`, in two places: the patched document (`membersOf`, where an
  empty body is accepted as no members) and `patchXmlBlock`'s replacement content (validated,
  else a `XmlPatchError`). Both move onto the module so the document is validated once (not by
  `isWellFormed` and again in the parse). `XmlPatchError` and the empty-body handling stay.
  Tests:
  - a malformed patched document is a `XmlPatchError`, as today;
  - a malformed replacement block is a `XmlPatchError`;
  - an empty body still gives no members;
  - a valid patch writes the same bytes as before.
- [ ] **Step 4: Move every entry point, one per commit or per area.** For each row of the
  table:
  - first a failing test: a **truncated** corpus document of the kind it reads is refused
    (the call answers a parse failure, not a partial reading);
  - then a **pre-move answer pin**: the answer to a normal corpus document, recorded before the
    move, must equal the answer after it. These pins cover the differences between profiles
    (grouped versus prefixed attributes, coerced versus string values, namespaces kept or
    removed, forced arrays);
  - then the move to the module with its profile.

  `tools/*.js` move the same way, with the truncation test **and a pre-move pin**: a tool's
  full answer needs SAP (each tool drives live reads), so its pin is on **what the parse
  yields** — a captured corpus document of the kind the tool reads, parsed with the tool's
  options before the move and with its profile after, the two results equal. Where the
  tool's parse is inline, the step lifts it into a function of the tool so the pin can call
  it.
- [ ] **Step 5:** The guard passes, with only the module importing fast-xml-parser. Run
  `npm test`, `npm run test:check` and every package's `lint:check`: PASS. Mutate: add one
  direct import back in a handler and one `require` back in a tool; the guard goes red each
  time; revert.
- [ ] **Step 6:** CHANGELOG (Fixed): "A malformed or truncated XML answer is refused instead of
  read as a partial document." Commit.

**Later work, out of scope (recorded in the PR description at step 20):**
- the same wrapper in adt-clients and adt-strategies, which use fast-xml-parser too;
- a possible switch to `@xmldom/xmldom` with a strict wrapper, as auth-providers does. After
  D19, that switch is a one-module change.

### D20. Compact HandlerGet: a source range and an outline part (owner)

**What changes.**
- **The source range.** `HandlerGet`'s `source` part takes the same optional `start_line` /
  `end_line` as the full source reads. It uses the same shared `sourceRangeOf` and
  `answerSourceRead` (`src/lib/handlers/sourceRange.ts`), the same refusal rules (a
  non-positive, non-integer or inverted range is refused before any request; a range outside
  the source is refused after the one unchanged GET), and the same exact cut over CRLF and LF
  line ends.
- **The outline part.** `HandlerGet` gains `part: "outline"` for the object types
  `GetObjectOutline` serves: `CLAS/OC`, `INTF/OI` and `FUGR/F` on both systems, and `PROG/P`
  on premise. It routes to the same handler as `GetObjectOutline`.
- **A range with any part but `source` is refused before any request (DO1a).** Today
  `sourceRangeOf` (`src/lib/handlers/sourceRange.ts`) rejects only `metadata`, and compact
  `HandlerGet` sends the address parts (`object_structure`, `node_structure`,
  `virtual_folders`) and the activation parts (`activation_status`, `activation_results`) to
  their handlers before the object parts are handled — so reusing it unchanged would not
  give DO1a. The fix:
  - `sourceRangeOf`'s rule becomes "a range is taken only with `source`": any other part
    with `start_line` or `end_line` is refused, in the full tools too;
  - in `handleHandlerGet`, the range check runs **first**, before every dispatch (address,
    activation, outline and the object parts).

**Files:** `src/lib/compact/compactSchemas.ts` (`GET_PROPERTIES`,
`COMPACT_READ_TAKES.every` or the per-type takes, and the `part` enum),
`compact-readonly-entries/src/handlers/handleHandlerGet.ts` and
`compactPartRoutes.ts` (the `outline` route per type and the range pass-through), the
listed-schema and surface fixtures, CHANGELOG, MIGRATION-24.0, the coverage ledger.

- [ ] **Step 1: Failing tests.**
  - Listed schema: `HandlerGet` lists `start_line`, `end_line` and the `outline` part value,
    on the variants and types named above.
  - Pins:
    - `HandlerGet#<type>#outline` for each type, its one request with the object-structure
      v2 Accept, as `GetObjectOutline`'s pin;
    - a ranged `HandlerGet#<type>#source` read: the one unchanged source GET, then exactly the
      asked lines, for an LF and a CRLF source;
    - for a function module, the D7 metadata read first, then the one source GET.
  - Refusals with zero requests: a range with each non-source part — `metadata`, `outline`,
    `urls`, `contents`, `main_programs`, `object_structure`, `node_structure`,
    `virtual_folders`, `activation_status`, `activation_results`; an inverted range; a
    non-positive line. After the GET: a range outside the source.
  - The full tools: a range with every non-source `part` their schema declares is refused
    with zero requests (`sourceRangeOf`'s widened rule).
- [ ] **Step 2:** Widen `sourceRangeOf` to "only with `source`", call it at the top of
  `handleHandlerGet` before any dispatch, add the properties and the outline route; reuse
  `answerSourceRead` unchanged. Run: PASS; the listed-schema test passes with the fixture updated for these keys
  alone.
- [ ] **Step 3: Coverage.** The ledger gains `HandlerGet#<type>#outline` keys (C8's list), and
  each compact source key's pins and live case add one ranged read (no new key: the range is
  not an enum). Live cases on both systems in C8's file: the outline of a class the test
  creates lists its methods with positions, and a ranged compact read answers those lines.
- [ ] **Step 4:** CHANGELOG (Added) and MIGRATION-24.0 (an addition: `HandlerGet` takes
  `start_line` / `end_line` on `source` and the part `outline`). Commit.

### D21. The profiling and dumps explorer on adt-clients 43

**What the code shows.** `tools/runtime-profiling-dumps-explorer.js` calls runtime-client
members that adt-clients 43 removed: `listProfilerTraceFiles`,
`createProfilerTraceParameters`, `extractProfilerIdFromResponse`, the
`getProfilerTrace…` readers (`HitList`, `Statements`, `DbAccesses`), and the dump members
`getRuntimeDumpById` / `listRuntimeDumpsByUser`. The map onto 43.0.1:
- **trace list and data:** `AdtRuntimeClient.getProfiler(…)` — `list`, the trace readers
  (hit list, statements, database accesses), `delete`, `getDefaultParameters`,
  `buildParametersXml`;
- **scheduling and the profiler id:** `ProfilerDomain` has no member that creates
  parameters or extracts an id. The server schedules through
  `AdtExecutor.getClassExecutor(…).scheduleTrace(…)`, which returns the id itself (taken
  from SAP's `Location`) — `src/handlers/system/high/handleRuntimeCreateProfilerTraceParameters.ts`.
  The tool does the same: `createProfilerTraceParameters` + `extractProfilerIdFromResponse`
  become one `scheduleTrace` call whose answer carries the id;
- **dumps:** `AdtRuntimeClient.getDumps(…)` — `list`, `listByUser`, `getById`;
- **answers:** the old members answered an axios-like response (`.data`, `.status`); the 43
  members answer `IAdtResponse` (`ok`, then the value or the error). Every `.data` read
  becomes the success value, every `.status` check becomes `ok` / the error's status.

- [ ] **Step 1: Red tests first** (`src/__tests__/unit/toolsReadings.test.ts` or a new
  `src/__tests__/unit/tools/profilingExplorer.test.ts`), against today's script on the 43 call
  and answer contract, on `recordingConnection` (no SAP): the trace list read through
  `getProfiler().list`; scheduling through `scheduleTrace` yielding the id; one trace's
  hit list, statements and database accesses; the dump list and one dump through
  `getDumps()`; each answer read from `IAdtResponse`. They fail today (the script calls
  removed members).
- [ ] **Step 2:** Rewrite the tool onto those members, with no regex, no prose matching and no
  polling limit, as D6 left it. The Step 1 tests go green; its D19 parse pin stays green.
  Record the map in the tool's header comment.
- [ ] **Step 3: Live run on the on-premise system** (after the realm check; read-only apart
  from what the script creates):
  - the profiler trace list;
  - one trace's data (hit list, statements, database accesses);
  - the dump list and one dump read.

  Whatever the script creates (trace parameters, a trace) is deleted at the end, and the
  run records it.
- [ ] **Step 4:** Commit (`fix(tools): the profiling and dumps explorer on adt-clients 43`).

### D22. DO2 through adt-clients: the element-info readings (owner)

**Measured (the adt-clients half of D22, on both systems), superseding D1's "extend type —
not seen":**
- A structure's element info lists an append (`extend type`) as `.append`, with its include
  name and fields.
- A named include (`_x : include s`) comes back as `.include` exactly like an anonymous one,
  with no group name.
- A service definition's exposed entities do not come back in source order.
- An unknown name answers `200` with an empty element info (no name).

**Released:** adt-clients 43.1.0, adt-strategies 0.20.0, adt-clients-legacy 0.7.2 — merged and
tagged; the owner publishes, and D22's server half starts after the publish (the registry
check of Step 3). The members
are `AdtUtils.getStructureElementInfo` / `getServiceDefinitionElementInfo`
(`GET /sap/bc/adt/ddic/elementinfo?path=<structure>`,
`GET /sap/bc/adt/ddic/srvd/elementinfo?path=<service definition>`). The readers are
`readStructureElementInfo` / `structureElementInfo` and `readServiceDefinitionElementInfo` /
`serviceDefinitionElementInfo`.

**Owner decisions (2026-11-05):**
1. **Service-binding facts' exposed entities** come from the service definition's element
   info; today's projection `{ entity, entitySet }` (and its no-alias fallback) stays.
2. **`GetStructuresList` takes every include SAP states** — anonymous, named and appends
   (`extend type`, read as `.append`) — from element info. It returns the structure and does
   not filter out named includes; the model narrows further if it needs to. The answer's
   shape stays; what changes (a named include's group name, the where-used flags, and the
   `version` argument, removed — element info answers only the active structure) is stated
   below and recorded in CHANGELOG / MIGRATION-24.0. The
   plain scanners for the DDL `include` and for `extend type` go away.
3. **Only `GetIncludesList`'s tree stays on the plain scanner**, for the measured reason (SAP
   does not state which include names which).
4. **Pins:** service-definition entities are compared as a set (SAP's order is not the
   source's). An unknown name (empty element info) is answered as absent — not found — and
   never read as an empty structure or an empty entity list.

**What the code shows today.**
- **`GetStructuresList`** (`src/handlers/structure/readonly/handleGetStructuresList.ts`) answers
  `{ success, structure_name, tree }` (plus `appends_unavailable` and
  `append_candidates_unread` when where-used fails). `tree` is a `StructureNode`:
  `structure`, `attribute` (the component a named include sits under, `null` for an
  anonymous one), `kind` (`root` / `include` / `append`), `children`, `cyclic?`, `error?`.
  - It reads named includes and anonymous ones from the DDL source (`parseEmbeddedStructures`),
    and finds appends by where-used plus a source check (`extendsBase`), in the sequential
    path and in the batched path (`structureReads`).
  - `include_extensions: false` skips the append lookup.
  - It takes `version` (`active` by default) and forwards it to every source read.
- **Service-binding facts** (`src/lib/strategies/serviceBindingFacts.ts`): `exposedEntitiesOf`
  answers `{ entity, entitySet }` per `expose` line, with no URI. `entitySet` is the alias,
  or the entity's name when no alias is given. Its one caller is
  `GetServiceBindingPreviewUrl` (`handleGetServiceBindingPreviewUrl.ts`).

**In #346 (red first):**
- [ ] **Step 1: `version` — measured, and the owner's decision (2026-11-05).** Measured on both
  systems: element info takes no version and always answers the active structure. Its
  discovery template is `{?path,uri}{&context}{&type*}`, and the answers with
  `version=inactive`, `active` and `workingArea` were byte-identical. **Decision:**
  `GetStructuresList` loses its `version` argument; the model reads an inactive structure
  through the source read with `version: inactive`. Red tests first:
  - `'GetStructuresList declares no version'`: the listed-schema test expects the property
    gone from `GetStructuresList` on every binary;
  - a call that still passes `version` is not forwarded anywhere: the pinned requests are
    the element-info GETs alone (the tools parse strictly only for creates, so an extra key
    on a read is dropped by the schema, not refused).
  Then remove `version` from the schema (`handleGetStructuresList.ts`, around line 69), the
  handler and its forwarding (the source reads around lines 288–297 and the batched reads
  around lines 1093–1113), and update the listed-schema and surface fixtures for that one
  property.
- [ ] **Step 2: Red tests.**
  - **Request pins:** `GetServiceBindingPreviewUrl`'s entity reading sends the
    service-definition element-info GET; `GetStructuresList` sends one structure element-info
    GET per structure, single (`structure_name`) and multi (`structure_names`), sequential
    and batched. Red today, because the readings scan the source.
  - **Service-binding facts:**
    - today's projection `{ entity, entitySet }` on a corpus document is pinned as a **set**,
      and stays equal after the move;
    - the new reader's name, URI and alias are each tested separately on a captured
      element-info answer;
    - **the no-alias fallback stays:** an entity without an alias answers `entitySet` = its
      name.
  - **`GetStructuresList`, the answer after the move.** The shape stays
    `{ success, structure_name, tree }`. The tree is built from element info's flat list by
    its `includeLevel` / `partOfInclude` fields (as the released reader exposes them, checked
    at the bump); `kind` is `include` for `.include` and `append` for `.append`.
    - **Information lost:** element info gives no group name for a named include, so
      `attribute` is `null` for named includes as for anonymous ones. A named include and an
      anonymous one become indistinguishable in the answer.
    - **`include_extensions`:** appends are told apart (`.append` versus `.include`), so
      `include_extensions: false` leaves the `append` nodes out, with no where-used lookup
      at all. `appends_unavailable` and `append_candidates_unread` go: nothing is looked up
      that can fail.
    - **If the flat list cannot build the tree** (a nesting it does not state), the step
      records which, and the tree is flattened to that depth. The changed answer is then
      stated in MIGRATION.
    - **Assertions, single name:** over captured answers, an anonymous include, a named
      include (`attribute: null`) and an append are each nodes of the tree with their kind;
      `include_extensions: false` drops the append node.
    - **Assertions, multi name:** `structure_names` answers one entry per name in the order
      given; an unknown name's entry is `{ structure_name, error }` (not found).
  - **Unknown names:** an empty element info is "not found" for `GetStructuresList` (single:
    the call fails; multi: that entry's error) and for the preview URL's entity reading —
    never an empty structure or list.
- [ ] **Step 3:** After the publish (check `npm view` for each version), bump adt-clients to 43.1.0 and adt-strategies to
  0.20.0 (adt-clients-legacy to 0.7.2 where the server uses it) from the registry, as
  registry ranges. `npm install` regenerates the lockfile; check it for `"link": true` and
  for non-registry entries. Run build, `test:check` and the root `npm test`.
- [ ] **Step 4:** Move the readings onto the members and readers above. Delete
  `parseEmbeddedStructures` and `extendsBase`, with their sequential callers (the source
  scan and the append check) and the batched path's (`structureReads`' source and
  where-used reads), and the D6 plain-code versions of both scanners. Step 2 goes green.
- [ ] **Step 5:** `GetStructuresList`'s description and its `include_extensions` description
  state what is now true, functionally: the tree of included and appended structures as
  SAP's element info states them; `include_extensions: false` leaves appends out. A
  description test for each. CHANGELOG (Changed: read from SAP's element info; Removed:
  `GetStructuresList`'s `version`). MIGRATION-24.0:
  - a named include's `attribute` is now `null`;
  - `appends_unavailable` and `append_candidates_unread` are gone;
  - `GetStructuresList` no longer takes `version` and answers the active structure; for an
    inactive one, read the source with `version: inactive`;
  - any flattening Step 2 found.
- [ ] **Step 6: Live cases on both systems:**
  - the exposed entities of a service definition the test creates (C14's fixtures), compared
    as a set, one entity without an alias;
  - a structure the test creates with an anonymous include, a named include and, where the
    system allows, an append: all are nodes of the tree, and `include_extensions: false`
    drops the append;
  - an unknown structure name answers not found.
- [ ] **Step 7:** Commit.

### D23. SearchSource rework (owner, 2026-11-07)

**The owner's rules for it:** never guess; no silent failure; SAP does what SAP can.
*Superseded for object reads by DO17 (2026-11-07):* a source or object that cannot be read is
skipped without an entry or a count; the search is about the objects that can be read.

**What the code does today** (`src/lib/search-source/`, `src/handlers/system/readonly/handleSearchSource.ts`):
- **`packageResolver.ts`:** a mask is resolved by one quick search over `DEVC`
  (`maxResults` 1000). Anything beyond that window, or anything the search misses, is dropped
  silently.
- **`packageEnumerator.ts`:** walks the package (node structure) with its subpackages and keeps
  only `PROG/P`, `FUGR/F` and `CLAS/OC`.
- **`sourceReader.ts`:**
  - a program is read by its main source only; program includes (`PROG/I`) are never
    scanned;
  - a class is read by `source/main` only; its local includes (definitions,
    implementations, macros, test classes) are never scanned;
  - a function group is read by its object structure, then its modules and includes; the
    includes always in the active version; modules named `VIEW*` are skipped by name;
  - `safe()` logs any non-SAP error at debug level and drops the object silently.
- **`lineScanner.ts`:** a case-insensitive substring match per line (`query`, `query2`,
  `exclude`, comment skipping).
- **`orchestrator.ts`:** `time_budget_ms` is checked before each envelope; the tool also takes
  `timeout`.
- **SAP's own text search** (`/sap/bc/adt/repository/informationsystem/textsearch`) is in the
  discovery document but answered `500` with the key `SRIS_SEARCH 006` ("Source Search is not
  supported") on both systems (measured, read-only).
- **adt-clients** (43.x): `AdtUtils.search(criteria)` sends one quick search with `maxResults`
  (default 100); it offers no paging.

**The task is in two parts.** **D23a** needs no SAP and starts now. **D23b** holds the masks, the
line-match strategy, the hits-only answer, the skipped unreadable objects and the function
module as its own object; the owner decided it on 2026-11-07 (DO12–DO20), its red-first steps
need no SAP, and its live cases wait for the owner's go.

#### D23a. Sources, versions, failures, dedup, description (no SAP; starts now)

*The D23a review's first item — `SearchSource` holding the instance's main-call queue for its
whole scan — is covered by D24 (`SearchSource` back on the long-tool list, on its own
session).*

- [ ] **Step 1: Every source-bearing object SAP lists is scanned, each in the asked version.**
  The reader per type (adt-clients 43, `AdtClient`), each taking the call's `version`:

  | Type | Reader |
  | --- | --- |
  | program `PROG/P` | `getProgram().read` |
  | program include `PROG/I` and function-group include | `getInclude().read` (the function-group include through `getFunctionInclude().read` where the server reads it so) |
  | class `CLAS/OC` | `getClass().read` (main), plus the four local includes: `getLocalDefinitions().read`, `getLocalTypes().read`, `getLocalMacros().read`, `getLocalTestClass().read` |
  | interface `INTF/OI` | `getInterface().read` |
  | function module (in a walked `FUGR/F`) | `getFunctionModule().read` |
  | CDS `DDLS/DF`, BDEF `BDEF/BDO`, DDLX `DDLX/EX`, SRVD `SRVD/SRV` | `getDdl().read`, `getBehaviorDefinition().read`, `getMetadataExtension().read`, `getServiceDefinition().read` |

  - **Version.** Today the function-group include and function-module reads are hardcoded to
    `active` (`sourceReader.ts`). Every source path, these included, passes the requested
    version. A type reported as "active only" is reported so only where a measurement shows
    its reader ignores the version — none is assumed.
  - **Red tests,** on `recordingConnection` over corpus node-structure answers:
    - every listed type above is read, through its reader;
    - every source GET carries the asked `version` (`inactive` in the test), the function
      module and the function-group include included;
    - `object_types` accepts the new types.
  - `object_types` widens to these types: listed-schema fixture; MIGRATION (the default scan
    now covers them).
- [ ] **Step 2: The `VIEW*` skip goes.** Red test: `'a function module named VIEW… is scanned'`.
  The name skip is removed. If such modules must not be scanned, that is decided from
  something SAP states — a measurement, *owed* live (D23b). Until then they are scanned.
*D23a Steps 3, 4 and 5's failure parts are superseded by DO17 (D23b Step 4a): the reads still
go on past a failed source, but the answer carries no failure entries. The text below is kept
as what D23a did.*
- [ ] **Step 3: No object is lost silently.** Today three paths lose sources:
  - `safe()` logs a non-SAP error at debug level and drops the object;
  - `refusedOrAbsent()` (`sourceReader.ts`) turns every `404` into `null`, even for a source
    SAP listed in the walk;
  - a child read that throws ends the function group's generator (`readSourceUnits`), so the
    group's later sources are never read.

  Red tests:
  - `'a 404 on a source the walk listed is reported, not taken as absent'`;
  - `'when the first child of a function group fails and a later one succeeds, the failure
    is recorded and the reads go on'`: both children's requests pinned, the second's hits in
    the answer, the first in `failures`;
  - `'a non-SAP error is reported, not logged and dropped'`.

  Then `safe()` goes; `refusedOrAbsent` answers absent only for what was not listed (a probe
  read), and a listed source's 404 is a failure; the generator records a child's failure and
  goes on.
- [ ] **Step 4: The failure contract.** The answer keeps the field name `failures` (today
  `failures?: FailedObject[]`, each an object identity and a nested `error: FailureEntry`).
  It holds two typed entry kinds:
  - **`SourceFailure`:** `kind: 'source'`, the object's identity (`object_type`,
    `object_name`), the source's identity (the include's or source's name and URI), the
    `step` (which read), and SAP's T100 key (message class and number) where SAP gave one,
    with the existing `error` entry;
  - **`OperationFailure`:** `kind: 'operation'`, no object identity, the `step` (package
    resolution, the text search, a walk level) and SAP's key where there is one.

  Red tests for each kind, and that a credential failure still ends the call as today.
  MIGRATION: the entries gain `kind`, the source identity and the key.
- [ ] **Step 5: One read per source, in both paths.** A call-scoped cache, keyed by the
  canonical source identity (the source URI) plus version, serves the sequential path and
  the batched path alike.
  - Red tests:
    - `'an include named by two objects is read once'`: one GET per source URI in both paths,
      and both owners' hits come from it;
    - `'a cache hit counts for both owners'` (each object's hit count and listing);
    - `'a shared failure is recorded for both owners'`: one failed read, a `SourceFailure` per
      owner, one request.
  - The batch envelopes stay; no timer is added.
- [ ] **Step 6: The description.** `SearchSource`'s description says what the tool does, its
  arguments and its answer — functionally. The advice lines go: "Run only ONE SearchSource
  per destination at a time…", "Prefer combining terms…", "For certainty, pass concrete
  package names", and the other recommendations. The mask sentence states today's behaviour
  plainly; D23b Step 5 rewrites it for DO12. A description
  test, under the functional-descriptions guard.
- [ ] **Step 7: Pins, CHANGELOG / MIGRATION.** Pins over corpus answers for each new type's read
  and version, the dedup and the failure kinds. CHANGELOG (Fixed: every source-bearing type
  scanned in the asked version; no object lost silently; one read per source; Changed: the
  description). MIGRATION-24.0: `object_types`' wider set and default, the failure entries'
  shape, and the `VIEW*` modules scanned.

#### D23b. Masks, the line-match strategy, hits only (owner, 2026-11-07)

**Measured (both systems, read-only), and decided by the owner:**
- **The quick search has no window to page around.** Up to `maxResults` 100 000 it answers
  every match, with no cap and no "more" marker; `*` alone answers every package in seconds.
  So a mask is resolved by **doubling** `maxResults` until the answer holds fewer packages
  than `maxResults` (DO12). The disjoint-partition scheme drafted here before is dropped:
  nothing needs splitting.
- **SAP's text search is not offered.** It answers `SRIS_SEARCH 006` on both systems; on
  premise its business function is off. It is **later work, not in 24.0.0** (DO13).
- **Package walks are quick enough uncapped** (DO16). Known limit, recorded in the spec, no
  change: on ABAP Cloud a walk of 12 packages took about 130 s, and walk envelopes of about
  1 000 parts and more failed with an outer `500` after about 600 s (Measured; the 600 s
  being a limit outside the server is an Inference).

**Files:** `src/lib/search-source/packageResolver.ts` (`isPattern`, the doubling),
`src/lib/search-source/lineScanner.ts` (the shipped strategy), `src/lib/search-source/orchestrator.ts`
(the strategy in `OrchestratorDeps`, both paths; `emit_no_hits`, `NoHitEntry`, `no_hits`
removed), `src/handlers/system/readonly/handleSearchSource.ts` (the schema, the wiring, the
description), the listed-schema and surface fixtures, `tools/tool-search.json` (generated),
the tool reference (`docs/user-guide/AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md` through
`npm run docs:tools`), `README.md` where it describes `SearchSource`, CHANGELOG, MIGRATION-24.0,
`runSearchSourceInPhases` and `answeredSearch` (the batched search phases), and the suites
Step 4 names.

**Steps (red first):**
- [ ] **Step 1: What a mask is (DO12).** Red tests on the resolver, over recorded quick-search
  answers:
  - `'an entry with ? is a mask'` (`Z?TEST` goes to the quick search, as given);
  - `'an entry with * is a mask'` (`Z*`, `/NS/Z*`, several `*`);
  - `'+, _, % and # are literal'`: `Z_PKG`, `Z+PKG`, `Z%PKG`, `Z#PKG` are exact names — no quick
    search is sent for them and each is walked as named;
  - `'an entry with neither * nor ? is an exact name'`.

  Then `isPattern` tests `*` and `?` only, and its comment says so.
- [ ] **Step 2: A mask is resolved completely (DO12).** Red tests, on `recordingConnection`
  (or the resolver's `searchObjects` double) with answers sized per request:
  - `'a mask whose answer is shorter than maxResults takes one request'`;
  - `'a mask whose answer fills maxResults is asked again with maxResults doubled, until the
    answer is shorter'`: the request sequence pinned (`maxResults` 1000, 2000, 4000, …) and
    the last answer's packages used;
  - `'the packages of the last answer are walked, each once'` (the dedup with exact entries
    stays);
  - `'a mask SAP refuses at any round is skipped with no entry, and the other entries are
    scanned'` (DO17, Step 4a);
  - `'a credential failure at any round ends the call'`.

  Then the resolver loops: send with `maxResults`, keep the answer when it holds fewer than
  `maxResults`, else double and send again. No cap of the server's on the doubling (the
  quick search has none, measured); no timer. A round depends on the previous answer, so the
  rounds of one mask are sequential.
- [ ] **Step 2a: The batched path repeats its search phase until every mask is resolved
  (DO12).** Today the batched orchestration (`runSearchSourceInPhases`,
  `src/lib/search-source/orchestrator.ts`) runs the resolver once to collect the searches
  (`answeredSearch`, `packageResolver.ts`, answers `[]` for a search not answered yet and
  records it in `asked`), sends one search phase, and runs the resolver again. With the
  doubling, that second run would find the next round unanswered, read the `[]` as a short
  answer and stop: the mask would be cut at the first window without a word. Red tests
  first, on the batched path (`ctx` with batch envelopes, recorded answers):
  - `'a mask whose first answer is full is resolved on the batched path'`: the first phase
    sends `maxResults` 1000, the answer fills it; a second phase is actually sent with 2000,
    its answer holds fewer than 2000, and its packages are the ones walked (the requests of
    both phases pinned);
  - `'a mask that fills maxResults twice is resolved on the batched path'`: answers full at
    1000 and at 2000; a third phase is actually sent with 4000, its answer holds fewer than
    4000, and only its packages are walked (the requests of all three phases pinned);
  - `'a search not answered yet is not taken as a short answer'`: the resolver never ends a
    mask on a round with no answer;
  - `'masks of different depths resolve together'`: a mask done in one round and a mask that
    needs three are both resolved, each round's searches of all unresolved masks sent in one
    phase, and no search sent twice;
  - the same multi-round cases on the sequential path, so both paths answer alike.

  Then the resolver tells an unanswered round apart from an answered one (the unanswered
  round is recorded and the mask stays unresolved, rather than resolved over `[]`), and the
  batched orchestration repeats discovery (run the resolver, collect `asked`) and execution
  (send that phase, record its answers) until a run asks nothing — every mask resolved or
  failed — and only then walks the packages. `endOnCredential` applies to every phase.
- [ ] **Step 3: The line match is a strategy (DO14).** Red tests:
  - `'the orchestrator matches lines through the strategy it is given'`: a recording strategy
    double receives each source's lines and the call's `query`, `query2`, `exclude`,
    `exclude_comments` and the per-object hit limit, and its hits are the answer's — on the
    sequential path and on the batched path alike;
  - `'the orchestrator has no line match of its own'`: its deps type requires the strategy (a
    type test: leaving it out does not compile), and the orchestrator module imports no
    matcher;
  - `'the shipped strategy keeps today's match'`: the existing `scanLines` cases (case
    folding, `query2` on the same line, `exclude`, the comment lines, the snippet cut at 255
    characters, the hit limit and `capped`) run against the shipped strategy unchanged;
  - `'the handler wires the shipped strategy'`.

  Then a typed strategy interface (lines and the scan input in, hits and `capped` out) in
  `src/lib/search-source/`, the shipped one built from today's `scanLines`, a required member
  of `OrchestratorDeps`, wired by `handleSearchSource.ts`. The cap probe past
  `max_hits_per_object` calls the same strategy.
- [ ] **Step 4: Only hits are answered (DO15, DO17).** A hit keeps `devclass`, `object_type`,
  `object_name`, `include`, `line` and `snippet` (up to 255 characters). Red tests:
  - `'an object without a hit is not in the answer'`: no `no_hits` field, on both paths;
  - `'SearchSource does not declare emit_no_hits'`: the listed-schema fixture;
  - `'a call that still sends emit_no_hits has it dropped'`: the call answers as without it
    (no `no_hits`), and nothing is refused — `SearchSource` is not a strict tool (only the
    create tools are, `createArguments`), the same rule MIGRATION-24.0 states for
    `lock_handle` on the non-strict update tools and D24 applies to the removed `timeout`;
  - the failure cases are Step 4a's.

  Then `emit_no_hits`, `NoHitEntry`, `no_hits` and the no-hit bookkeeping go from the
  orchestrator and the handler. The suites that pass `emit_no_hits` or assert `no_hits` or
  zero-hit objects are rewritten to the hits-only answer, each named here:
  `src/__tests__/unit/batch/searchSource.test.ts`,
  `src/__tests__/unit/batch/searchSourceEnvelopes.test.ts`,
  `src/__tests__/lib/search-source/orchestrator.test.ts`,
  `src/__tests__/lib/search-source/cursor.test.ts` (its assertions counting zero-hit
  objects), `src/__tests__/unit/searchSource/sourcesAndFailures.test.ts`, and the live
  assertion in `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts`.
- [ ] **Step 4a: What cannot be read is skipped; the answer is hits and counters (DO17).**
  Supersedes D23a Step 4 (the failure contract) and the failure parts of D23a Steps 3 and 5.
  The answer has **no `failures` list at all**: `results` plus counters. The counters count
  only what was done — `scanned.packages` the packages actually walked, `scanned.objects` the
  objects actually read (at least one source read), `scanned.sources` the sources read, and
  the new `scanned.objects_with_hits` (the objects with at least one hit in `results`).
  `truncated.by_object_cap` stays (the paging fields go in Step 4d, DO20). Red tests first,
  on both paths (sequential and batched):
  - **object reads:**
    - `'a source SAP refuses is skipped: no entry, no count'`: no `failures` field; the source
      is not in `scanned.sources`;
    - `'a listed source that answers 404 is skipped'`, and `'a read that throws without SAP's
      answer is skipped'` (superseded by Step 4e, DO22: only a system answer is skipped; a throw that is not one is thrown) (the two paths D23a Step 3 turned into entries);
    - `'an object none of whose sources can be read is not in the answer and not in
      scanned.objects'`;
    - `'a readable source of an object is searched and its hits kept when another source of
      the same object failed'`: a function group whose first child fails and a later one hits
      — both requests pinned, the later one's hits in `results`, no entry for the first; the
      same for a class whose local include fails beside a hitting main source; the object
      counts in `scanned.objects`;
    - `'a shared source that fails is skipped for both owners'`: one request (the D23a cache),
      no entry, the other sources of both owners still read;
  - **package-level outcomes (today `kind: 'operation'` entries):**
    - `'a mask whose quick search SAP refuses is skipped: no entry'`, the other entries
      scanned;
    - `'a named package that does not exist (its root answers 404) is skipped: no entry, not
      in scanned.packages'`;
    - `'a refused root is skipped: no entry, not in scanned.packages'`: the asked package's
      own root refused (or `404`) excludes that package, nothing under it is reachable; the
      other packages are walked;
    - the refused levels below the root are Step 4c's (DO19): only that branch is excluded;
    - `'a mask that matches no package answers no packages'` (unchanged);
  - **counters:** `'the counters count only what was done'`, on a page with hit, no-hit and
    unreadable objects and a skipped package: `scanned.packages`, `scanned.objects`,
    `scanned.sources` and `scanned.objects_with_hits` each pinned;
  - `'a credential refusal still ends the call'` (unchanged: it is no broken object), on a
    mask search, a walk and a source read, through `AuthRefusedError` as today.

  Then the `failures` field goes from `OrchestratorResult` and the handler's answer;
  `SourceFailure`, `OperationFailure`, `ScanFailure`, the per-object bookkeeping
  (`targetFailures`), `orderedFailures` and the resolver's and enumerator's `failures` go,
  and `src/lib/search-source/failures.ts` goes with them (its credential check moves to where
  the skip is decided, so a credential refusal still ends the call). `sourceReader.ts` skips a
  failed read and goes on to the object's next source; the resolver skips a refused mask; the
  enumerator skips a package whose root is refused or missing (a refused level below it is
  Step 4c's); the counters are taken from what was read.

  Affected suites (each rewritten to skip-and-count, red first):
  `src/__tests__/lib/search-source/sourceReader.test.ts` — its failure-contract cases move
  here, red first: today they expect failed outcomes and read `failure` (`kind: 'source'`,
  `object_name`, `step`, `error`), e.g. "a class main source SAP answers 404 is a failure"
  and "a unit whose read throws is a failure; the reads go on with the rest". They are
  rewritten to expect the failed source yielded as nothing — no failed outcome, no
  `failure` — and the object's other sources still yielded in order (`Z_FM_A`, `Z_FM_C`;
  the class's four local includes); its DO18 rewrites (a module as its own object) stay in
  Step 4b,
  `src/__tests__/unit/searchSource/sourcesAndFailures.test.ts`,
  `src/__tests__/lib/search-source/packageResolver.test.ts` (a refused mask),
  `src/__tests__/lib/search-source/packageEnumerator.test.ts` (a refused or missing walk),
  `src/__tests__/unit/failureStep.test.ts` (its `SearchSource` cases: a refused source read, a
  listed source not there, "a refused object is its own answer"),
  `src/__tests__/lib/search-source/orchestrator.test.ts`,
  `src/__tests__/lib/search-source/cursor.test.ts`, `src/__tests__/unit/batch/searchSource.test.ts`,
  `src/__tests__/unit/batch/searchSourceEnvelopes.test.ts`, the helper
  `src/__tests__/helpers/sourceReaderFake.ts`, the live assertion in
  `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts`, and the
  listed-schema and surface fixtures; `src/__tests__/unit/authRefusedRejection.test.ts` stays
  as the credential regression.
- [ ] **Step 4b: A function module is its own scan object (DO18).** Today a function group
  is one scan object: the walk (`packageEnumerator.ts`) lists `FUGR/F` under the family
  `FUGR`; `sourceReader.ts` reads the group's structure and then each child — modules
  (`FUGR/FF`, `reader: 'functionModule'`, `…/fmodules/<f>/source/main`) and includes
  (`functionInclude` or `include`) — all as sources of the group, so a hit in a module is
  answered as `object_type: 'FUGR'`, `object_name: <group>`, `include: <module>`, and
  `scanned.objects` counts the group once. What changes:
  - **A hit in a function module names the module:** `object_type` is the ADT code
    **`FUGR/FF`** (owner, DO18 — measured on premise, 2026-11-07: the repository quick search
    answers `adtcore:type="FUGR/FF"` for a function module, and the group's node structure
    lists its modules as `OBJECT_TYPE` `FUGR/FF`, beside `FUGR/I` and `FUGR/PX`), so the hit's
    type widens from `ScanObjectType` to it plus `'FUGR/FF'`; `object_name` the module's name,
    `devclass` the group's package, and **`function_group_name`**, the group — because
    `GetFunctionModule` requires `function_module_name` and `function_group_name`, and compact
    `HandlerGet` `FUNCTION_MODULE` takes the same two. The module's hit has no `include` (its
    source is the module's main source) and is not nested under the group.
  - **A hit in the group's own includes stays the group's:** `object_type` the group's,
    `object_name` the group, `include` the include's name — what `GetFunctionInclude` needs
    (`function_group_name`, `include_name`). A group include addressed under
    `/programs/includes/` is read through the include reader as today; its hit is still the
    group's, with `include` its name (`GetInclude` takes `include_name`).
  - **Every other hit already carries what its read tool needs** (checked in the red tests):
    a program and a program include by `object_name` / `include`, a class's local include by
    `object_name` and `include` (the include kind the compact `LOCAL_*` reads name by the
    class), an interface, CDS, BDEF, DDLX and SRVD by `object_name`.
  - **Counters count them apart:** `scanned.objects` and `scanned.objects_with_hits` count
    the group and each of its modules as separate objects. (The paging over the walk's
    targets goes in Step 4d, DO20: every target is read in one run, unless the caller gives `max_hits` and it is reached (DO23).)
  - **`object_types`:** `FUGR` keeps scanning the group and its modules (the modules come only
    from the group's structure); no new filter value.
  - **One read per source** (D23a's cache) and the skip rule (Step 4a) apply to a module as to
    any object: a module that cannot be read is skipped, the group and its other modules are
    still searched.

  Red tests first, on both paths:
  - `'a hit in a function module is the module's object, with function_group_name'`:
    `object_type: 'FUGR/FF'`, the module's name, the group's package and
    `function_group_name`; no `include`; not listed under the group;
  - `'a hit in a group include stays FUGR'`: `object_type: 'FUGR'`, the group's name,
    `include` the include's name;
  - `'a hit in a group include is the group's, with include'`;
  - `'a group and its modules are counted as separate objects'` (`scanned.objects`,
    `scanned.objects_with_hits` over a group with a hit in one module and in one include);
  - `'each hit carries the arguments its read tool requires'`: for every scan type, the hit's
    fields fill the read tool's required arguments (`GetFunctionModule`, `GetFunctionInclude`,
    `GetInclude`, `GetProgram`, `GetClass` and the local includes, `GetInterface`, the CDS,
    BDEF, DDLX and SRVD reads), checked against their schemas;
  - `'each object has its own max_hits_per_object'`: a group with two modules and an include
    of its own, the first module holding more hits than `max_hits_per_object` — the second
    module and the group's include still answer their hits, each up to the limit; only the
    first module is capped; `truncated.by_object_cap` is set by it; and a case where no object
    passes its own limit while their sum does — `truncated.by_object_cap` stays false;
    on both paths.

  Then the hit type gains the module's identity (`function_group_name`, present only on a
  module's hit; `include` absent there), the orchestrator emits module hits under the module
  and counts it, and `sourceReader.ts` yields each module's unit with its own object identity
  instead of as a group include. **The per-object hit limit follows the object.** Today the
  orchestrator (`orchestrator.ts`, the per-target loop: `totalForTarget`, `capHitForTarget`
  and the probe past the cap) shares one allowance and one capped flag across every source of
  a function group, so after DO18 one module could use up `max_hits_per_object` and suppress
  another module's or the group's own hits. From DO18 each separate object — every function
  module and the group itself — has its own allowance and its own capped flag, and
  `truncated.by_object_cap` is set when any object's flag is; the probe past the cap probes
  per object. Both paths (the sequential scan and the batched phases' final scan) go through
  the same per-object bookkeeping.

  Affected suites: `src/__tests__/lib/search-source/sourceReader.test.ts` (its DO18 cases:
  module units under their own object; its failure-contract cases are Step 4a's),
  `src/__tests__/lib/search-source/orchestrator.test.ts`,
  `src/__tests__/lib/search-source/cursor.test.ts`,
  `src/__tests__/lib/search-source/packageEnumerator.test.ts` (unchanged walk, kept green),
  `src/__tests__/unit/searchSource/sourcesAndFailures.test.ts`,
  `src/__tests__/unit/batch/searchSource.test.ts`,
  `src/__tests__/unit/batch/searchSourceEnvelopes.test.ts`, the helper
  `src/__tests__/helpers/sourceReaderFake.ts`, the live assertion in
  `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts`, and the
  listed-schema and surface fixtures (the answer's shape).
- [ ] **Step 4c: A refused level excludes only its branch (DO19).** Today a refused level of
  a walk ends the asked package's whole walk: `levelOf` (`src/lib/strategies/packageWalk.ts`)
  throws for a refused level — and, under `missingLevel: 'refused'`, which `SearchSource` passes
  (`packageEnumerator.ts`' fetcher and the batched orchestration), for a `404` too — and both
  walkers end the package on it: `walkPackage` (sequential, recursive) and `walkPackages`
  (batched, level by level, one settlement per package: "the first refused read of its
  walk"). From DO19, for `SearchSource`:
  - a refused **type node** (its `404` included) excludes that node and everything under it;
    the package's other type nodes, its subpackages and their objects are walked and searched;
  - a refused **subpackage** (its `404` included) excludes that subpackage and its
    descendants; its siblings and the parent's own objects are walked and searched;
  - a refused **root** of the asked package excludes that package (Step 4a);
  - no entry, and nothing excluded is counted; a credential refusal still ends the call.

  Red tests first, on both paths (the sequential `walkPackage` through
  `createPackageContentsFetcher`, and the batched `walkPackages` through
  `runSearchSourceInPhases`), on `recordingConnection` with node-structure answers:
  - `'a refused type node excludes only that node'`: a package with two type nodes, the first
    refused — the second node's objects are read and their hits answered; no request under the
    refused node; `scanned.packages` counts the package;
  - `'a type node answering 404 excludes only that node'` (the same, with `404`);
  - `'a refused subpackage excludes only its branch'`: a parent with its own objects and two
    subpackages, one refused (and a case with its `404`) — the parent's objects and the
    sibling's are searched; the refused subpackage's descendants are not requested; it is not
    in `scanned.packages`, its sibling and the parent are;
  - `'a refused root excludes the package'` (Step 4a's case, on both paths);
  - `'a credential refusal at any level ends the call'`;
  - `'the other walking tools are unchanged'`: `GetPackageContents`, `GetPackageTree` and the
    other `walkPackage` / `walkPackages` users keep today's answer for a refused level (their
    existing tests stay green, with one pinning case added in `packageWalk.test.ts`).

  Then the walkers take the branch rule as an explicit option (beside `missingLevel` in
  `WalkOptions`, typed; the other callers do not pass it and keep today's behaviour):
  with it, a refused or missing level below the root yields nothing for that branch and the
  walk goes on with the next node or subpackage; a refused root still settles the package as
  refused, which the enumerator skips; a credential refusal still ends the walk.
  `packageEnumerator.ts`' fetcher and the batched orchestration pass it; the enumerator counts
  a package in `scanned.packages` only when its own level was read. `failed_level` and the
  `walk package` failure go with Step 4a's `failures`.

  Affected suites: `src/__tests__/unit/packageWalk.test.ts`,
  `src/__tests__/unit/batch/packageWalks.test.ts`,
  `src/__tests__/lib/search-source/packageEnumerator.test.ts`,
  `src/__tests__/lib/search-source/orchestrator.test.ts`,
  `src/__tests__/unit/batch/searchSource.test.ts`,
  `src/__tests__/unit/batch/searchSourceEnvelopes.test.ts`,
  `src/__tests__/unit/searchSource/sourcesAndFailures.test.ts`,
  `src/__tests__/unit/failureStep.test.ts` (its walk cases); the other walkers' suites
  (`src/__tests__/unit/readonlySingleCall.test.ts`, `src/__tests__/unit/batch/metadataReads.test.ts`,
  `src/__tests__/unit/runtimeReadersFixRound1.test.ts`, `src/__tests__/unit/detailSurface.test.ts`)
  stay green unchanged.
- [ ] **Step 4d: No paging; one run reads every target (unless the caller gives `max_hits` and it is reached, DO23); the hit limit optional (DO20).**
  Today the schema takes `max_objects` (default 500) and `start_at` (default 0); the
  orchestrator slices the walk's sorted targets (`sliceTargets`, `[start_at, start_at +
  max_objects)`) on both paths, and the answer carries `total_targets`, `next_start_at` and
  `truncated.by_max_objects`. `max_hits_per_object` defaults to 100 (`DEFAULTS` in
  `orchestrator.ts`, and the schema's words). From DO20:
  - **No user-facing package or object limit.** The mask quick search's `maxResults` is
    internal (the doubling of DO12 answers every package); nothing else limits packages or
    objects.
  - **One run reads every target, unless the caller gives `max_hits` and it is reached (DO23).** `max_objects`, `start_at`, `next_start_at`,
    `total_targets` and `truncated.by_max_objects` go from the schema and the answer.
    `SearchSource` runs in the background by default (D24), so a long scan is a background
    run read with `GetBackgroundRun`, ended with `DiscardBackgroundRun`; it keeps only the
    hits.
  - **`max_hits_per_object` stays, optional, with no default:** absent, an object's hits are
    not limited; given, each object (every function module and the group apart, DO18) is
    limited to it. `truncated.by_object_cap` stays, set only when a given limit cut an object.
  - `scanned.*` (packages walked, objects read, sources read, objects with hits) stays.

  Red tests first, on both paths (sequential and batched):
  - `'every target is read in one call'`: a walk of more than 500 targets — every target's
    sources are requested and its hits answered, with no slicing;
  - `'the answer has no cursor fields'`: no `total_targets`, `next_start_at` or
    `truncated.by_max_objects`;
  - `'SearchSource does not declare max_objects or start_at'`: the listed-schema fixture;
  - `'a call that still sends max_objects or start_at has them dropped'`: it answers as without
    them (every target read, no slice), nothing refused — the non-strict rule of Step 4;
  - `'max_hits_per_object absent means no limit'`: an object with more than 100 hits answers
    all of them; `truncated.by_object_cap` false;
  - `'max_hits_per_object given limits each object'`: as DO18's per-object case, the flag set
    by the object that passed it;
  - `'the mask search's maxResults is not an argument'`: no schema field names a package or
    object limit.

  Then: `sliceTargets`, the slice in `runSearchSource` and `runSearchSourceInPhases` (the
  phases' "the same start and the same sorted targets" comment with it), `max_objects`,
  `start_at`, `next_start_at`, `total_targets` and `by_max_objects` go from
  `OrchestratorInput`, `OrchestratorResult`, `DEFAULTS` and the handler's schema;
  `max_hits_per_object`'s default goes from `DEFAULTS`, and the orchestrator treats an absent
  value as no limit (no probe past a cap that does not exist).

  Affected suites: `src/__tests__/lib/search-source/cursor.test.ts` goes (it tests only the
  slice and the cursor; any case that is not about paging moves to `orchestrator.test.ts`),
  `src/__tests__/lib/search-source/orchestrator.test.ts`,
  `src/__tests__/unit/batch/searchSource.test.ts`,
  `src/__tests__/unit/batch/searchSourceEnvelopes.test.ts`,
  `src/__tests__/unit/searchSource/sourcesAndFailures.test.ts`, the live assertion in
  `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts`, the listed-schema
  and surface fixtures, and any D24 background-run test that passes `max_objects` to
  `SearchSource`.
- [ ] **Step 4e: What a failed read leads to is a strategy (DO22).** Today each catch decides
  by itself and swallows anything that is not a credential failure:
  `packageEnumerator.ts`' walk catch (`if (isCredentialFailure(error)) throw error; continue;`),
  `packageResolver.ts`' mask catch, `sourceReader.ts`' read catches (one of them a bare
  `catch {}`), the walkers' level catch (`packageWalk.ts`, `endsTheCall` then the branch rule
  or the root's failure), and the batched path's settlements (`credentialOf`,
  `endOnCredential`). So a `TypeError` of our own is skipped like a SAP refusal. And a failure
  passes several layers: a walker's failure reaches the enumerator's catch, and a batched
  source answer is consumed twice — in discovery (`answeredReaderDeps` over the phases'
  answers, which rethrows a recorded `found.error`) and again in the final scan
  (`runSearchSource` over `answeredReaderDeps(sources, [])`). From DO22 a **read-failure
  strategy**, taken explicitly by the orchestrator like the line-match strategy (a required
  member of `OrchestratorDeps`, no default inside the orchestrator; the handler wires the
  shipped one), decides every failed read — **once**.
  - **Places (a closed discriminated union on `kind`, from fields the code already has; the
    `'envelope'` place is below):**
    - `'mask'` — the mask entry (`resolveMask`'s input);
    - `'package'` — the asked package (the walk's root, `walk.root`);
    - `'level'` — the asked package and the refused level: a subpackage name, or a type node
      `{ id, type }` (the walker's `node` and `walk.name`);
    - `'structure'` — a function group's structure read: the group (`StructureRead`
      `{ reader: 'functionGroupStructure', name }`) and its URI (`functionGroupUri`); it
      names no source;
    - `'source'` — a source read: the object whose read sent it (`devclass`, `object_type`,
      `object_name`) and the source (`name`, `uri` from `sourceUriOf`, and the read's
      `sourceReadKey`);
    - `'envelope'` — a failed batch envelope of a `SearchSource` phase: the phase (mask
      search, walk level, structure and source reads) and its items.
  - **Answers (closed):** a string-literal union `'skip' | 'end' | 'throw'`. `'skip'` drops what
    the place names (DO17, DO19); `'end'` ends the call with the failure as it came (the
    credential path today); `'throw'` passes the value through unchanged. Each consulting site
    handles the answer in a `switch` with a `never` default; a type test pins both unions.
  - **Asked once per failed read, where it arises; the decision travels unchanged.** The
    strategy is consulted only at the place the read failed — the resolver for a mask, the
    walker for a root or a level, the source reader for a structure or a source — and nowhere
    else. Its decision is carried outward as decided, never re-asked:
    - `'skip'` is applied at the place (the mask resolves to nothing, the branch or package
      yields nothing, the structure or source yields nothing); no outer layer sees a failure;
    - `'end'` and `'throw'` leave the place as a **decided** failure — the original value,
      marked as decided in a module-private registry keyed by the thrown object (as
      `carryingFailure` keeps a method failure in a `WeakMap`), and, for a primitive thrown
      value, wrapped in a module-private carrier holding it and the decision; the outer
      layers (the enumerator, `walkPackages`' settlements, the orchestrator, the handler)
      have no catch of their own for read failures and let a decided failure pass; at the
      handler a carried primitive is unwrapped and thrown as it was. A `'throw'` is never
      turned into an outer `'skip'`, an `'end'` always ends the call.
  - **Cached and replayed reads: once per read.** The batched path records the decision with
    the answer: `readSourcesInPhase` (and the search and walk phases) consult the strategy
    when a phase answer fails and store the decision beside the answer, keyed by
    `sourceReadKey` (by mask, by walk level); discovery and the final scan read the stored
    decision and act on it, never re-asking. D23a's one-read-per-source cache does the same
    on the sequential path: a source two objects name is decided once, at its first owner,
    and the second owner reuses the decision (a skipped shared source is skipped for both).
  - **Answered failures are normalised before the rule.** Every place turns an answered
    failure into a carried one before it consults the strategy, as the code does today:
    `thrownOf` in `sourceReader.ts` (structure and source reads), `levelOf`'s
    `carryingFailure` in `packageWalk.ts` (roots and levels), the resolver's
    `carryingFailure` (`packageResolver.ts`, the mask search). This normalisation stays when
    `credentialOf` and `endOnCredential` go: `isCredentialFailure` (`answer.ts`) recognises a
    `401` SAP answered only through `methodFailureOf`, so without it an answered `401` would
    fall to the skip.
  - **Envelope provenance is decided where `runPhase` sees it.** A failed envelope loses its
    identity on the way to the parts: `runPhase` knows the envelope failed (`batch.execute()`
    rejected, `failed`), but each part's answer is then built by adt-clients' conversion
    (`dist/utils/adtResponse.js`, `answering`: a rejection becomes a failed ADT answer with a
    new `IAdtError` from `recogniseFailure`, its `response` the rejection's), and our readers
    extract that new error (`answerOf` in `sourceReader.ts`) or wrap it (`carryingFailure` in
    `packageResolver.ts`). So the envelope's failure is decided **in the phase, before any
    part's answer is handed on**: `runPhase` reports a failed envelope as a typed outcome of
    the phase (beside today's outer-`404` path), the `SearchSource` phase callers
    (`searchPackagesInPhase`, the walk-level phases, `readSourcesInPhase`) consult the
    strategy once with the place `'envelope'` (the phase — mask search, walk level, structure
    and source reads — and its items), and the parts of a failed envelope never reach the
    per-read rule. The other `runPhase` users keep today's behaviour (the outcome is read only
    by the callers that ask for it). The outer `404` of `isNoBatchEndpoint` stays no failure:
    `withSequentialFallback` reads the same parts sequentially and the strategy is not
    consulted. The place union gains `'envelope'`.
  - **The shipped strategy's rule (owner, DO22 — closed), read by structure only, never by
    message words, in this precedence:**
    1. a credential refusal (`isCredentialFailure`, after the normalisation above — an
       answered `401` included) or the server's own refusal (`failureOf`) → `'end'`, whatever
       the place, the envelope included;
    2. an envelope failure (place `'envelope'`; the outer `404` never gets here) → `'throw'`:
       it is not one object's answer, and skipping it would answer a near-empty search as if
       nothing matched;
    3. a **SAP answer** → the strategy decides (shipped: `'skip'`). A failure is a SAP answer
       when either holds:
       - it carries a `response` with an integer HTTP status, **whatever its `origin`** —
         an answered failure (`ReadAnswer` `{ ok: false, error: IAdtError }`, an
         `IAdtResponse` not `ok`, normalised to a carried one), a carried ADT failure
         (`methodFailureOf(thrown) !== undefined`), or a raw transport failure (a thrown
         object that is not an `IAdtError` but carries `response.status`, read through the
         existing safe property reads);
       - or it is an `IAdtError` of `origin: 'refusal'`, with or without a `response` (an
         `AdtSAPError`: SAP's answer by construction);
    4. anything else → `'throw'`, never given to the strategy as a SAP answer: no `response`
       and not `origin: 'refusal'` (an unreachable host, a network or DNS failure), a
       library's defect, our own defect (a `TypeError`, a `RangeError`), a thrown primitive.

    **Why not by `origin` alone (owner, amending DO22; measured by the implementer on the
    stand probe and in the adt-clients 43 code):** adt-clients gives `origin: 'refusal'` only
    to `AdtSAPError`, which the HTTP path never throws; a SAP `4xx` / `5xx` with an exception
    document comes back `origin: 'connection'` with its `response` (`adtType` added by
    `analyseException`). So `origin: 'connection'` cannot tell "SAP answered" from "no
    answer"; the `response` with its status can. Rule 2 comes before rule 3 on purpose: an
    envelope's HTTP failure carries a status and must not be taken as one part's SAP answer.
  - **Wiring:** the resolver, the walkers (the level catch and the root), the source reader
    (structure and source reads) and the batched phases consult the strategy at the place; the
    bare `catch {}`, every `if (isCredentialFailure(error)) throw error; continue;`, the
    enumerator's walk catch, `credentialOf` and `endOnCredential` go (the shipped strategy's
    `'end'` replaces them); `thrownOf`, `levelOf`'s and the resolver's `carryingFailure` stay
    as the normalisation; `runPhase` gains the failed-envelope outcome for the callers that
    read it. Both paths use the same strategy instance.

  Red tests first, on both paths (sequential and batched):
  - **once per read:** `'a recording strategy sees exactly one call per failed read'` — a
    refused mask, a refused root, a refused level (subpackage and type node), a refused
    structure read and a refused source read in one scan, each recorded once with its place's
    fields; on the batched path the same counts although discovery and the final scan both
    replay the answers; a source two objects name, refused, recorded once;
  - **decisions travel unchanged:** `'a custom throw for a system failure at a level is thrown
    out of the call'` (a recording strategy answering `'throw'` for a SAP `500` on a
    subpackage: the call rejects with that value, not a skip from the enumerator); the same
    for a `'throw'` at a structure read and at a source read; `'a custom skip for a TypeError
    is skipped'`; `'an end ends the call'` from each place;
  - **the shipped strategy, per place** (mask, root, level — subpackage and type node —,
    structure, source), each case on both paths:
    - `'a TypeError is thrown'`, `'a RangeError is thrown'`, `'a thrown primitive is thrown as
      the same primitive'`;
    - `'a SAP 500 with origin connection and a response is skipped'` and the same for a `404`
      — the shape adt-clients 43 answers for a SAP exception document — answered and carried;
    - `'an origin refusal failure without a response is skipped'` (an `IAdtError` of `origin:
      'refusal'` with `adtType` and no `response`);
    - `'a carried ADT failure with a response is skipped'` (`carryingFailure`);
    - `'a raw transport failure with a response and a status is skipped'` (a thrown object
      carrying `response.status`, no `IAdtError`);
    - `'a failure with no response and origin connection is thrown'` (an unreachable host):
      the call fails with it, the strategy not asked;
    - `'a credential refusal ends the call'` (`AuthRefusedError`, a `401` SAP answered) and
      `'a failureOf refusal ends the call'`;
  - **an answered 401 ends the call** at each place (mask, root, level, structure, source),
    on both paths: `'an answered 401 ends the call'` — the reader's answer is a failed ADT
    answer with `response.status` `401`, never thrown by the client — so the normalisation
    is load-bearing (the test goes red when it is removed);
  - **envelopes (batched path), through the real client conversion:** the phases run the
    installed adt-clients readers (`@mcp-abap-adt/adt-clients`, whose `answering` turns a
    rejected request into a failed answer) over a connection stand-in whose envelope request
    rejects, so each part's answer is built as in production:
    - `'an envelope answered with the outer 404 is no failure: the sequential fallback reads
      the same parts'`, the strategy not consulted;
    - `'any other envelope failure is thrown'` — a mask-search phase, a walk-level phase and a
      structure-and-source phase, each envelope failing with an HTTP `500` (a status-bearing
      transport failure): the call rejects with the envelope's error, nothing is skipped, and
      a recording strategy sees one `'envelope'` call and no per-read call for its parts;
    - `'an envelope failure is not skipped as a raw transport failure'` (rule 2 before rule 3:
      the same `500` is skipped when it is one part's own failure inside an answered envelope);
    - `'a credential refusal as the envelope's error ends the call'`;
    - `'a part's own failure inside an answered envelope follows the per-read rule'`;
  - `'the orchestrator has no failure rule of its own'`: its deps type requires the strategy
    (leaving it out does not compile), and no module but the shipped strategy calls
    `isCredentialFailure` / `endsTheCall` for a read failure;
  - `'a structure read is its own place'`: its place carries the group and its URI, no source
    fields.

  Affected suites: `src/__tests__/lib/search-source/sourceReader.test.ts`,
  `src/__tests__/lib/search-source/packageResolver.test.ts`,
  `src/__tests__/lib/search-source/packageEnumerator.test.ts`,
  `src/__tests__/lib/search-source/orchestrator.test.ts`,
  `src/__tests__/unit/searchSource/sourcesAndFailures.test.ts`,
  `src/__tests__/unit/failureStep.test.ts` (its `SearchSource` cases),
  `src/__tests__/unit/authRefusedRejection.test.ts` (the credential end, through the shipped
  strategy), `src/__tests__/unit/batch/searchSource.test.ts`,
  `src/__tests__/unit/batch/searchSourceEnvelopes.test.ts`, `src/__tests__/unit/packageWalk.test.ts`,
  `src/__tests__/unit/batch/packageWalks.test.ts` and
  `src/__tests__/unit/packageWalkBranchRule.test.ts` (the walker's place), the helpers
  `src/__tests__/helpers/sourceReaderFake.ts` and `src/__tests__/helpers/searchSourceStand.ts`.
- [ ] **Step 4e2: The SAP-answer strategy is the consumer's (DO22, owner).** Amends Step 4e:
  the strategy decides only on **SAP answers**, and the consumer supplies it.
  - **What reaches the strategy.** The server applies Step 4e's fixed rules first, and none of
    them reaches the consumer: a credential or `failureOf` refusal always ends the call; an
    envelope failure (not the outer `404`, which falls back) is always thrown; anything that
    is not a SAP answer — no `response` and not `origin: 'refusal'` (no answer: host,
    network, DNS), a library defect, our defect, a primitive — is always thrown. Only a SAP
    answer (a `response` with an integer status, whatever its `origin`, or an `IAdtError` of
    `origin: 'refusal'`) goes to the strategy, with its place (`'mask'`, `'package'`,
    `'level'`, `'structure'`, `'source'`; `'envelope'` never reaches it), and the strategy
    answers `'skip' | 'end' | 'throw'`. The shipped strategy answers `'skip'` for every SAP
    answer.
  - **The contract is exported.** The strategy's interface, its place union and its answer
    union (typed, closed), and the shipped strategy, are exported from
    `@mcp-abap-adt/lib/embeddable` (`src/embeddable/index.ts`), where `IBackgroundRuns` is
    exported today. The line-match strategy is the consumer's too (Step 4e3, DO24).
  - **How it reaches `SearchSource`'s handler — the `backgroundRuns` path, followed:**
    - `EmbeddableMcpServer`'s options (`src/embeddable/EmbeddableMcpServer.ts`, beside
      `backgroundRuns?: IBackgroundRuns`) gain the strategy; the constructor hands it to
      `BaseMcpServer`'s options (as it hands `backgroundRuns`, `options.backgroundRuns` →
      `this.backgroundRuns`);
    - `BaseMcpServer` puts it into every `HandlerContext` it builds — the dispatch context
      (`registerHandlers`' call, around the `const context: HandlerContext = {` that builds
      `connection`, `batchAvailability`, `heldLocks`, …), the batch-mode recorded context
      (`recordedContext`) and the run tools' context — as a new `HandlerContext` field
      (`src/handlers/interfaces.ts`), kept in every context derived from those (a long call's
      own connection, a background run's), as `batchAvailability` is;
    - `handleSearchSource.ts` reads it from the context and passes it to the orchestrator.
    - **The binaries' launchers pass the shipped one**: `server-runtime/src/stdio/launcher.ts`,
      `server-runtime/src/http/launcher.ts` (through `StreamableHttpServer`'s options, as it
      passes `backgroundRuns` to each per-request server) and the SSE launcher
      (`SseServer`'s session servers).
    - **Where no host supplies one** — found in the code: `HandlerExporter`'s entries run with
      the context the embedder passes to `entry.call(context, args)` (`wrapEntry` passes it
      unchanged; the exporter states `systemType`, `systemContextResolver` and
      `systemContextRules` through `inStatedScope`, not the context, and its own context is a
      dummy for group construction); a group registered on a plain `McpServer`
      (`BaseHandlerGroup.registerHandlers`) runs with the group's constructor context. Neither
      carries the strategy unless its host puts it there. The plan: such a context gets the
      shipped one where the handler reads it (`context.<field> ?? shipped`, in
      `handleSearchSource.ts`, the one place the default lives — the orchestrator still takes
      it explicitly), and `HandlerExporter` takes it as an option and adds it to the context it
      passes (`wrapEntry`) when the embedder's context has none. This placement of the default is
      approved by the owner (DO24).
  - **`EmbeddableMcpServer` without the option:** the server supplies the shipped one in the
    context (absent = the shipped strategy, as above); an embedder that passes its own gets
    its own on every path.

  Red tests first:
  - `'a consumer strategy passed to EmbeddableMcpServer is asked for a SAP answer at each
    place, and its answer obeyed'`: an `EmbeddableMcpServer` with a recording strategy and a
    stand-in connection; a SAP `500` at a mask, a package root, a level, a structure and a
    source — each asked once with its place; `'skip'`, `'end'` and `'throw'` each obeyed (on
    both paths, sequential and batched);
  - `'the consumer strategy is never asked for'` a `TypeError` (thrown), a no-response failure
    (thrown), a credential refusal (the call ends) or an envelope failure (thrown) — the
    recording strategy records no call;
  - `'a launcher-built server uses the shipped one'`: a server the stdio launcher builds (and
    the HTTP launcher's per-request server) skips a SAP `500` at a source read;
  - `'a HandlerExporter entry and a plain-group registration use the shipped one'` when their
    context carries none, and the exporter's option when given;
  - `'the contract is exported'`: a type test importing the interface, the place and answer
    unions and the shipped strategy from `@mcp-abap-adt/lib/embeddable`.

  Docs: `docs/architecture/HANDLER_EXPORTER.md` and the embedding docs
  (`src/embeddable/docs/ARCHITECTURE.md`, the embedding section of `docs/architecture/`)
  describe the option and what reaches the strategy; MIGRATION-24.0 for embedders: the new
  optional strategy, the shipped default, and that only SAP answers reach it; CHANGELOG
  (24.0.0) Added — the `SearchSource` SAP-answer strategy option on `EmbeddableMcpServer` and
  `HandlerExporter`, its exported contract and the shipped strategy.

  Affected suites: Step 4e's, plus the embeddable suites that build an
  `EmbeddableMcpServer` or a launcher server for `SearchSource`, the `HandlerExporter`
  suites, and the type tests of `@mcp-abap-adt/lib/embeddable`'s exports.
- [ ] **Step 4e3: The line-match strategy is the consumer's too (DO24, owner).** Exactly like
  the SAP-answer strategy of Step 4e2. The contract is today's (`src/lib/search-source/lineMatch.ts`:
  `LineMatchStrategy`, one source's lines and the `ScanInput` — `query`, `query2`, `exclude`,
  `exclude_comments`, `max_hits` — in, `ScanResult` — the `ScanHit`s and `capped` — out);
  the shipped one is `substringLineMatch` (`lineScanner.ts`, today's match).
  - **Same option path:** `EmbeddableMcpServer`'s options → `BaseMcpServer` → the three
    `HandlerContext`s it builds (dispatch, `recordedContext`, the run tools'), kept in every
    derived context; `HandlerExporter` takes it as its own option and adds it in `wrapEntry`
    when the embedder's context has none; the binaries' launchers (stdio, HTTP per-request,
    SSE session) pass `substringLineMatch`; `handleSearchSource.ts` reads
    `context.<field> ?? substringLineMatch` (the one place the default lives) and hands it to
    the orchestrator, which takes it explicitly.
  - **Exported:** `LineMatchStrategy`, `ScanInput`, `ScanHit`, `ScanResult` and
    `substringLineMatch`, from `@mcp-abap-adt/lib/embeddable`.

  Red tests first:
  - `'an embedder's line match is used for every source on both paths'`: an
    `EmbeddableMcpServer` with a recording line match and a stand-in connection; every source
    read (program, include, class includes, a function module, a group include) is handed to
    it with all its lines and the call's terms, on the sequential and the batched path; its
    hits are the answer's, its `capped` sets `truncated.by_object_cap`;
  - `'without the option the line match is today's'`: the shipped `substringLineMatch` cases
    (case folding, `query2`, `exclude`, comment lines, the snippet cut, `max_hits` and
    `capped`) through an `EmbeddableMcpServer` with no option, and through a launcher-built
    server;
  - `'the HandlerExporter option is used, and the shipped one without it'`; a plain-group
    registration uses the shipped one;
  - `'the line-match contract is exported'`: a type test importing the types and
    `substringLineMatch` from `@mcp-abap-adt/lib/embeddable`.

  Docs: `docs/architecture/HANDLER_EXPORTER.md` and the embedding docs describe the option;
  MIGRATION-24.0 for embedders: the optional line-match strategy, `substringLineMatch` as the
  default; CHANGELOG (24.0.0) Added — the `SearchSource` line-match strategy option on
  `EmbeddableMcpServer` and `HandlerExporter`, its exported contract and `substringLineMatch`.

  Affected suites: Step 3's line-match suites, the embeddable, launcher and `HandlerExporter`
  suites that run `SearchSource`, and the type tests of `@mcp-abap-adt/lib/embeddable`'s
  exports.
- [ ] **Step 4f: The caller sets how much the answer holds (DO23).** Three optional controls;
  with none given the answer is exactly Steps 4–4e's (every hit with its line number and
  snippet).
  - **`answer`: `'objects' | 'lines' | 'snippets'`, default `'snippets'`.**
    - `'objects'`: one entry per object and include with hits — `devclass`, `object_type`,
      `object_name`, `include` where the hits are an include's, `function_group_name` for a
      `FUGR/FF` hit — and `hits`, the number of hits answered for it (after
      `max_hits_per_object` and `max_hits`; hits cut by either are not counted); no lines;
    - `'lines'`: each hit as today, with `line`, without `snippet`;
    - `'snippets'`: each hit with `line` and `snippet` (up to 255 characters) — today's.
    The scan and the limits are the same at every level; only the answer's shape differs.
  - **`max_hits_per_object`:** as Steps 4b and 4d plan it (per object, absent = no limit,
    `truncated.by_object_cap`).
  - **`max_hits`: a limit on the hits of the whole answer, absent = no limit.** What counts:
    the hits answered, in the scan's order (targets by package, type and name; an object's
    sources in reading order; lines in order), each after `max_hits_per_object` — a hit cut by
    the per-object limit does not count. When the answer holds `max_hits` hits the scan stops:
    the current source's further hits are cut, and no further source or target is read.
    `truncated.by_max_hits: true` is set when the scan stopped with anything left — a further
    hit of the current source, a source or a target not read; reaching exactly `max_hits` at
    the end of the scan leaves it false. `scanned.*` report what was done until the stop
    (packages walked, objects read, sources read, objects with hits).
    - **The batched path:** its sources are read in chunks (`TARGETS_PER_CHUNK`) before they
      are scanned, so the stop takes effect at a chunk boundary: each chunk is scanned once its
      reads are answered, and no envelope of a later chunk is sent once the limit is reached.
      The answer is the same as the sequential path's (the same hits, the same
      `truncated.by_max_hits`); `scanned.sources` counts the sources read, the stopped chunk's
      read but unscanned ones included — stated in the description.
  - **Types, no casts:** the schema's `answer` is a `z.enum` of the three levels; the answer
    type is a discriminated union keyed by the level (an `'objects'` entry type, a `'lines'`
    hit type, a `'snippets'` hit type), built from the scan's hits by a `switch` on the level
    with a `never` default; `max_hits` and `max_hits_per_object` are optional positive
    integers.

  Red tests first, on both paths (sequential and batched):
  - `'with no control the answer is the snippets level'` (the Steps 4–4e answer unchanged);
  - `'answer objects names each object and include with its hit count'`: no `line`, no
    `snippet`; a `FUGR/FF` entry carries `function_group_name`; a class's local include is its
    own entry with `include`; `hits` is the number answered;
  - `'answer lines carries line numbers and no snippets'`;
  - `'answer snippets carries line and snippet'`;
  - `'max_hits stops reading'`: a scan whose first targets reach the limit — the requests
    recorded stop after the target (sequential) or the chunk (batched) that reached it; fewer
    source requests than without the limit; `truncated.by_max_hits` true;
  - `'max_hits exactly at the end leaves by_max_hits false'`;
  - `'max_hits counts hits after max_hits_per_object'`: with both, an object's hits past its
    own limit do not count toward `max_hits`; `by_object_cap` and `by_max_hits` each set by
    its own cause;
  - `'objects counts only the hits answered'`: with `answer: 'objects'` and either limit, an
    entry's `hits` excludes cut hits;
  - `'the counters report what was done until the stop'`: `scanned.packages`,
    `scanned.objects`, `scanned.sources`, `scanned.objects_with_hits` pinned at a stop;
  - `'the schema offers answer, max_hits and max_hits_per_object'`: the listed-schema
    fixture; a wrong `answer` value is refused by the schema.

  Then: the schema fields in `handleSearchSource.ts`, `max_hits` and the level in
  `OrchestratorInput`, the stop in both paths (the sequential target loop; the batched chunk
  loop scanning each chunk before reading the next), the level-shaped answer, the
  description (functional: the three levels, the two limits, `truncated.by_max_hits`, what
  the counters report at a stop).

  Affected suites: `src/__tests__/lib/search-source/orchestrator.test.ts`,
  `src/__tests__/unit/batch/searchSource.test.ts`,
  `src/__tests__/unit/batch/searchSourceEnvelopes.test.ts`,
  `src/__tests__/unit/searchSource/sourcesAndFailures.test.ts`, the helper
  `src/__tests__/helpers/searchSourceStand.ts`, the listed-schema and surface fixtures, the
  description tests, `tools/tool-search.json` (generated) and the tool pages
  (`npm run docs:tools`).

  CHANGELOG (24.0.0): Added — `SearchSource`'s `answer` (`objects`, `lines`, `snippets`, the
  default), `max_hits` and `truncated.by_max_hits`. MIGRATION-24.0, in the `SearchSource`
  section: nothing to do — without the new arguments the answer is the hits with lines and
  snippets; to keep a large answer small, pass `answer: 'objects'` or `'lines'`, `max_hits`,
  or `max_hits_per_object`.
- [ ] **Step 5: Description.** The mask sentence states DO12 (`*` and `?` the wildcards; `+`,
  `_`, `%`, `#` literal; a mask resolved completely by the quick search) and loses "of up to
  1000 packages"; `emit_no_hits`, `no_hits` and `failures` leave it, and it states
  that an object that cannot be read is skipped, names the counters, and says a hit in a
  function module names the module and its group (DO18). It drops `start_at`, `max_objects`,
  `total_targets`, `next_start_at` and `truncated.by_max_objects`, says every target is read, unless the caller gives `max_hits` and it is reached (DO23),
  in one run, and says `max_hits_per_object` limits each object only when given (DO20); the
  argument's own words lose "default 100". Functional only; a description test
  under the functional-descriptions guard. `time_budget_ms` and `timeout` are not
  reintroduced (DO11; D24's regression check).
- [ ] **Step 6: Pins, docs, CHANGELOG, MIGRATION-24.0.**
  - Pins over corpus answers: the doubling sequence, the `?` mask, a literal `_` name.
  - The tool reference regenerated (`npm run docs:tools`), `README.md` and any `docs/` page
    that describes `SearchSource`'s masks or `no_hits`.
  - CHANGELOG (24.0.0): Fixed — a package mask is resolved completely (it was cut at 1000
    packages without a word); `?` is a wildcard and `+` a literal character. Removed —
    `SearchSource`'s `emit_no_hits`, its `no_hits` answer and its `failures` list (what cannot
    be read — a source, an object, a refused mask search, a missing or refused package walk —
    is skipped; the counters count only what was done; DO17). Fixed — a refused or missing
    type node or subpackage excludes only its branch; the rest of the package is walked and
    searched (it ended the package's whole walk; DO19). Added — `scanned.objects_with_hits`.
    Changed — a hit in a function module names the module (its type, its name and
    `function_group_name`), not the group with the module as `include` (DO18).
    Changed — a defect of the server while reading (a thrown value that is not a system
    answer) ends the call as an error instead of being skipped (DO22).
    Removed — `max_objects`, `start_at`, `next_start_at`, `total_targets` and
    `truncated.by_max_objects`: one run reads every target (DO20), unless the caller gives `max_hits` and it is reached (DO23); the 24.0.0 entry's
    "Migrating: page a large scan with `max_objects` and `start_at`" is rewritten (24.0.0 is
    unreleased). Changed — `max_hits_per_object` has no default: absent, no limit.
  - MIGRATION-24.0, in the `SearchSource` section: a mask is `*` / `?`, and an entry with `+`
    is an exact name now (write `*` where `+` was meant as a wildcard); a mask answers every
    matching package; drop `emit_no_hits` (a call that still sends it has it dropped) and read
    the objects with hits from `results` — an object without a hit is no longer listed;
    the `failures` list is gone, both kinds (24.0.0 is unreleased, so the section's D23a text
    about it is rewritten, not kept beside): a source or object that cannot be read, a mask
    search SAP refuses, a package that does not exist (its root refused or `404`) are
    skipped with no entry; a refused or missing type node or subpackage excludes only its
    branch — the package's other nodes, subpackages and objects are walked and searched
    (DO19); a readable source of an object is still searched when another failed; `scanned.packages`,
    `scanned.objects` and `scanned.sources` count only what was walked and read, and
    `scanned.objects_with_hits` counts the objects with hits; a credential refusal still ends
    the call; a hit in a function module is the
    module's own object — read it with `GetFunctionModule` (`function_module_name` =
    `object_name`, `function_group_name`) — where 23.x answered it as the group's hit with
    the module in `include`; the group and its modules are counted apart (DO18);
    no paging (DO20): drop `max_objects` and `start_at` (a call that still sends them has
    them dropped); `total_targets`, `next_start_at` and `truncated.by_max_objects` are gone;
    every target is read in one run, unless the caller gives `max_hits` and it is reached (DO23) — run it in the background (the default) and read the
    `run_handle` with `GetBackgroundRun`, or end it with `DiscardBackgroundRun`; the section's
    "page it with `max_objects` … `next_start_at`" text is rewritten (24.0.0 is unreleased);
    `max_hits_per_object` limits each object only when given (it was 100 by default);
    for embedders: the SAP-answer strategy (Step 4e2) and the line-match strategy (Step 4e3)
    are optional `EmbeddableMcpServer` and `HandlerExporter` options, their contracts and the
    shipped ones (skip; `substringLineMatch`) exported from `@mcp-abap-adt/lib/embeddable`;
    without them the search behaves as shipped; a caller of `SearchSource` sees that a server
    defect while reading is an error, not a skip (DO22).
- [ ] **Step 7: Live cases (owed; each runs only on the owner's go),** read-only, under C2's
  live-run safety:
  - on premise: a mask with `*` (several, and one matching zero characters), a mask with `?`,
    and an exact name with a literal `_` — each answers the packages the quick search names,
    the `*` mask past 1000 packages through the doubling;
  - a `SearchSource` on premise, and one on ABAP Cloud in the cloud's configured build
    package, each with a known hit: the hit's object, line and snippet; no `no_hits`, no
    `failures`; a named package that does not exist is skipped and not counted; `scanned.objects_with_hits` matches the objects in `results`; a hit
    in a function module names the module and its group, and `GetFunctionModule` reads it
    with exactly those fields;
  - the `VIEW*` measurement owed by D23a Step 2;
  - the shape of a real SAP refusal (DO22, owed): the `origin`, the `response` status and the
    `adtType` a SAP `404` refusal of a source read gets through adt-clients, on premise and on
    ABAP Cloud — the unit cases' `origin: 'connection'` with a `response` checked against it.
- [ ] **Step 8:** Commit.

**Later work (not 24.0.0, DO13):** SAP's text search
(`/sap/bc/adt/repository/informationsystem/textsearch`) first when a system offers it, decided
by its T100 key (`SRIS_SEARCH 006` = not offered, the scan runs), keeping package scope,
`version` and the filters; measured on a system that offers it before it is designed.
Goes into the PR description when this plan is deleted.

**DO11, settled:** `SearchSource`'s `time_budget_ms` and `timeout` were removed in D23a
(commit `91ee9d14`); D24 only runs the regression check that they stay gone, and removes
every other long tool's `timeout`. A running read is ended by `DiscardBackgroundRun`.

### D24. Long tools: no timeout, their own session, background by default, cancel by discard (owner, 2026-11-07)

**The owner's decisions.**
1. **No server-side deadline remains anywhere.** `timeout` is removed from every listed long
   tool — `LONG_TOOLS` in `src/lib/longTools.ts` and `tools/long-handlers.json`:
   - full: `GetWhereUsed`, `SearchObject`, `GetPackageContents`, `GetPackageTree`,
     `GetObjectsList`, `GetStructuresList`, `GetIncludesList`, `RuntimeListFeeds`,
     `ListTransports`, `GetSqlQuery`, `GetTableContents`, `GetObjectInfo`, `DescribeByList`,
     `GetATCFindings`, `ListATCResults`, `GetATCResult`, `RuntimeGetProfilerTraceData`,
     `RuntimeAnalyzeProfilerTrace`;
   - compact: `HandlerWhereUsed`, `HandlerSearch`, `HandlerDumpList`, `HandlerGetData`,
     `HandlerProfileView`, `HandlerGet`.

   `SearchSource`'s `time_budget_ms` and `timeout` are already gone: D23a's commit
   (`fix(search-source): D23a — …; no deadline`) removed them, which settles DO11. D24 keeps
   that with a regression check. `timeoutField`, `TIMEOUT_FIELD`, `withLongToolAdvice` and
   the timed-out answer are removed wherever nothing uses them any more. Their users today
   (grep at HEAD):
   - `src/lib/longTools.ts`;
   - the full long handlers: `handleGetPackageContents`, `handleGetTableContents`,
     `handleListATCResults`, `handleGetATCResult`, `handleGetATCFindings`,
     `handleSearchObject`, `handleGetObjectsList`, `handleGetIncludesList`,
     `handleGetStructuresList`, `handleListTransports`, `handleDescribeByList`,
     `handleRuntimeGetProfilerTraceData`, `handleGetSqlQuery`,
     `handleRuntimeAnalyzeProfilerTrace`, `handleGetWhereUsed`, `handleRuntimeListFeeds`,
     `handleGetObjectInfo`, `handleGetPackageTree`;
   - compact: `src/lib/compact/compactSchemas.ts`, `compactDescriptions.ts`,
     `src/lib/compact/index.ts`, and the `compact-readonly-entries` handlers
     `handleHandlerSearch`, `handleHandlerDumpList`, `handleHandlerGetData`,
     `handleHandlerProfileView`.
2. **Every listed long tool keeps its own ABAP session** (`runLongCall`,
   `src/lib/longCall.ts`: its own connection, logged off after the answer). **`SearchSource`
   goes back onto the list.** It left because the list required `timeout`, and so it holds
   the instance's main-call queue for its whole scan (the D23a review). The list is about the
   session, not a timeout.
3. **`background` on every listed long tool, defaulting to `true`.** The existing mechanism
   (`src/lib/backgroundRuns/*`, the `IBackgroundRuns` strategy; `GetBackgroundRun`,
   `ListBackgroundRuns`, `DiscardBackgroundRun`):
   - a call **without** the argument (or with `background: true`) answers at once with a
     `run_handle`, and the read runs on its own session;
   - `background: false` runs in the same call, synchronously, on its own session — today's
     behaviour minus `timeout`.

   **The code-running tools keep their own default:** `RuntimeRunClass`, `RuntimeRunProgram`
   and `HandlerProfileRun` take `background` with no default today (without it the call
   waits). That is unchanged.
4. **`DiscardBackgroundRun` cancels a running read.**
   - On a **running** read run (a long tool's), it cancels: the run's own session is logged
     off, SAP ends the read, and the run's kept answer becomes "cancelled". This is safe
     because long tools only read.
   - On a **finished** run, it removes the kept answer, as today.
   - On a **running code run** (`RuntimeRunClass`, `RuntimeRunProgram`, `HandlerProfileRun`),
     a started run still runs to its end: discard refuses it while it runs, as today.
   - The caller check stays: an unknown handle and someone else's handle answer alike, "not
     available".
   - The compact run tools, `HandlerBackgroundRunGet` and `HandlerBackgroundRunDiscard`, get
     the same treatment: schemas, descriptions and the cancel tests.

**How the cancel reaches the connection (decided here).**
- **Ownership, typed.** Today `src/lib/backgroundRuns/run.ts` holds the run's connection only
  in its closure, and `port.ts` sends a discard to the store, which cannot reach it. From
  D24 each run has **one execution connection**, held by the **instance's owner** (the
  `BaseMcpServer` instance, extending its `trackRun`), in a typed map keyed by
  `run_handle` — never a module global. A long tool in the background runs on that one
  connection: the background path does **not** nest `runLongCall` (which would open a
  second one); `runLongCall` is the synchronous path's.
- **The route.** `DiscardBackgroundRun(handle)`:
  1. runs the caller check first (`get` through the store for this caller; unknown or foreign
     → "not available", nothing sent);
  2. if the run is a running read, the owner logs off that run's connection;
  3. then cleans up: the map entry goes, and the run's end records `cancelled`.

  A running code run is refused at step 2, nothing sent; a finished run is removed by the
  store's `discard`, as today.
- **`cancelled` is final.** Today `run.ts` turns a rejection into an error answer and always
  calls `strategy.finish`, so a late finish could overwrite a cancel. From D24 the owner marks
  the run cancelled before the logoff; the run's end calls `finish` exactly once, with the
  cancelled answer when the mark is set. A rejection or a late answer after the mark changes
  nothing.
- **The store contract (`IBackgroundRuns`, `src/lib/backgroundRuns/contract.ts`),** decided
  statically:
  - **no new method:** the owner holds the connections and records `cancelled` through the
    existing `finish`;
  - **one typed change:** `BackgroundRunAnswer` gains an optional `cancelled?: true`, and
    `BackgroundRunListing['state']` / the read's state gain `'cancelled'`, derived by the
    store from a finished answer carrying `cancelled: true` (`InMemoryBackgroundRuns`
    does so);
  - **embedders (MIGRATION):** a custom strategy keeps the answer it is given in `finish` (as
    today) and answers `state: 'cancelled'` for a kept answer with `cancelled: true`; nothing
    else changes for it.
- **No strategy (owner, 2026-11-07).** Today, with no strategy, `background` is refused. From
  D24, with no strategy a long tool runs synchronously, as with `background: false`, so a
  host without a strategy keeps working; the code-running tools stay as today.
5. **State.** `GetBackgroundRun` answers `running`, `finished` with the answer, or `cancelled`.
   `ListBackgroundRuns` lists the caller's runs with that state. Both answers gain
   `cancelled`.
6. **Reading a finished read run consumes it (owner, 2026-11-07).** A finished background
   **read** run's kept answer is removed the moment `GetBackgroundRun` (or the compact
   `HandlerBackgroundRunGet`) answers it as `finished` or `cancelled`, so the per-caller limit
   does not fill up. Code runs (`RuntimeRunClass`, `RuntimeRunProgram`, `HandlerProfileRun`)
   keep today's retention until `DiscardBackgroundRun`. No timers. The store contract needs
   no new method: the owner calls the store's existing `discard` right after a read run's
   finished answer is handed to the caller (the run's kind is known to the owner from the
   tool that started it).
7. **`HandlerGet`'s run-reading parts are not background (owner, 2026-11-07).** The parts that
   read a run — `UNIT_TEST` / `CDS_UNIT_TEST` results, `activation_status`,
   `activation_results` — stay synchronous: they do not take `background`, and keep today's
   session policy (the instance's connection, long-polled reads). `HandlerGet`'s other parts
   take `background` like every long tool.

**Files:** the helper users listed under decision 1, `src/lib/longTools.ts`, `tools/long-handlers.json`,
`src/lib/longCall.ts` (`runLongCall`), `src/lib/backgroundRuns/{tools,run,answers,port,contract}.ts`,
`src/embeddable/BaseMcpServer.ts` (the background branch of the dispatch),
`src/lib/handlers/base/BaseHandlerGroup.ts`, `src/handlers/system/readonly/handleSearchSource.ts`
and `src/lib/search-source/orchestrator.ts` (`time_budget_ms`), each long tool's schema,
`background-runs-memory/src/InMemoryBackgroundRuns.ts` (the `cancelled` state), the
the compact run tools' schemas and descriptions (`HandlerBackgroundRunGet`,
`HandlerBackgroundRunDiscard`), the listed-schema and surface fixtures,
`tools/tool-search.json` (generated), `docs/` tool docs, `README.md` and the embedder guides
(`docs/` embedding and background-run pages), CHANGELOG, MIGRATION-24.0.

**Steps (red first):**
- [ ] **Step 1: Red tests.**
  - `'no long tool declares timeout'`: the listed-schema test, on every binary, for every
    `LONG_TOOLS` entry; a regression check that `SearchSource` still declares neither
    `time_budget_ms` nor `timeout` (removed in D23a).
  - `'SearchSource is a long tool and runs on its own connection'`: it is in `LONG_TOOLS`, and
    on `adtStandIn` its requests go on a session other than the instance's main one, which is
    logged off after the answer; the main-call queue is free while it runs.
  - `'a long tool called without background answers a run_handle'`, for each long tool (one
    test per tool, table-driven over `LONG_TOOLS`): the answer is the handle at once, and the
    read runs on its own session.
  - `'background: false answers the result in the call'`, for each long tool: today's answer,
    on its own session.
  - `'a code run's background default is unchanged'`: `RuntimeRunClass` without `background`
    waits for the run, as today.
  - `'Discard of a running read run cancels it'`: on `adtStandIn` with the read held, the
    discard sends that session's logoff; `ListBackgroundRuns` then lists it as `cancelled`;
    `GetBackgroundRun` answers `cancelled` and consumes it (the store's `discard` deletes
    the entry), after which `ListBackgroundRuns` no longer shows it and a second Get answers
    "not available".
  - `'Discard of a finished run removes its answer'` (as today).
  - `'Discard of a running code run is refused'`: `RuntimeRunClass` in the background, still
    running; the discard is refused and nothing is sent.
  - `'an unknown and a foreign handle answer alike'`: Get, List and Discard, for a handle that
    never existed and for another caller's.
  - **Which end wins** (on `adtStandIn`, the read held):
    - `'the logoff makes the in-flight request reject, and the kept state stays cancelled'`;
    - `'an answer arriving after the cancel does not overwrite it'`;
    - `'Discard racing the run's completion ends in one state'`: completion first answers
      `finished` and the discard removes it; discard first answers `cancelled`; `finish` is
      called once either way.
  - `'a background long run uses one connection'`: one fresh connection per run, no second
    from `runLongCall`.
  - **The contract:** with a custom strategy (a test double implementing `IBackgroundRuns`), the
    cancel arrives as `finish` with `cancelled: true` and its listing answers `cancelled`;
    with no strategy, a long tool answers its result in the call.
  - **Read consumes:**
    - `'a second Get after a finished read answers not available'` (full and compact);
    - `'seventeen sequential default-background reads, each read once, never hit the
      limit'`;
    - `'a code run is still kept after Get'` (until Discard).
  - **`HandlerGet`'s run parts:** `'background with a run-reading part is refused'` (or not
    declared for it — whichever the schema can state per part; the test asserts the one
    chosen), and `'a run-reading part answers in the call, on the instance's connection'`,
    for the unit-test and CDS-unit-test results and both activation parts.
  - **Compact:** the same cancel, get and list cases through `HandlerBackgroundRunGet` and
    `HandlerBackgroundRunDiscard`, and the compact long tools' `background` default.
- [ ] **Step 2:** Remove `timeout` from the schemas, handlers and `runLongCall` (full and
  compact, the users listed above); remove the timed-out answer and the helpers nothing
  uses. Put `SearchSource` back on the list.
- [ ] **Step 3:** Give every long tool `background`, default `true`, through the existing
  background-run port, keeping the code-running tools' own field and default. The
  background branch runs the long tool's handler **directly on the instance-held run
  connection** that `startBackgroundRun` opened (`backgroundRuns/run.ts`), with no
  `runLongCall`: `run.ts` and `longCall.ts` each open a fresh connection, so nesting them
  would give a run two. Only the synchronous path (`background: false`, or no strategy) uses
  `runLongCall`.
- [ ] **Step 4:** The owner's typed run-connection map (`trackRun` extended), the discard route
  (caller check, logoff, cleanup), the final `cancelled` mark, and the contract change above
  (`cancelled?: true` on the answer, `'cancelled'` in the state), implemented by
  `InMemoryBackgroundRuns`.
- [ ] **Step 5: Descriptions,** functional only:
  - each long tool: "Runs on an ABAP session of its own. By default the call answers at once
    with a run_handle, read with GetBackgroundRun; with background false it answers the
    result in the call.";
  - `DiscardBackgroundRun`: "Ends the run named by run_handle: a running read is cancelled
    and its session logged off; a finished run's answer is removed; a running code run is
    refused.";
  - `GetBackgroundRun` / `ListBackgroundRuns`: the states, `cancelled` included, and that a
    read run's finished or cancelled answer is answered once and then removed, while a code
    run's answer is kept until `DiscardBackgroundRun`. **Docs line (accepted by the
    owner):** once Get answers a finished or cancelled read, that read is gone — a Get
    response lost on the way cannot be recovered, `ListBackgroundRuns` no longer shows it,
    and the read must be started again. The same line goes into the user guide's
    background-run page and MIGRATION.

  Description tests under the functional-descriptions guard; the advice text that went with
  `timeout` goes.
- [ ] **Step 6: CHANGELOG and MIGRATION-24.0.**
  - CHANGELOG: Removed — `timeout` on every long tool, and `SearchSource`'s
    `time_budget_ms`; Added — `background` on every long tool, `cancelled` in the run
    answers; Changed — `DiscardBackgroundRun` cancels a running read; `SearchSource` runs on
    its own session.
  - MIGRATION-24.0 for embedders: the `IBackgroundRuns` change (`cancelled?: true`, the
    `'cancelled'` state) and what a custom strategy does with it; with no strategy a long tool
    runs synchronously; a finished read run's answer is removed once it is read (a second Get
    answers "not available"), while a code run's is kept until Discard; `HandlerGet`'s
    run-reading parts take no `background`.
  - **MIGRATION-24.0, breaking:** today a call to a long tool answers its result directly. From
    24.0.0 a call **without** `background` answers a `run_handle` at once, and the result is
    read with `GetBackgroundRun`. A caller that wants the result in the call passes
    `background: false`. `timeout` and `time_budget_ms` are gone. A running read is ended
    with `DiscardBackgroundRun`. The code-running tools' `background` is unchanged.
- [ ] **Step 7: Coverage.** The ledger's long-tool keys gain a background case and a
  `background: false` case in their pins; C16's background-run family gains the cancel case.
- [ ] **Step 8: Live cases (owed until the systems are restored),** on both systems: a
  background `GetSqlQuery` or `SearchSource`, cancelled by `DiscardBackgroundRun` mid-run;
  `GetBackgroundRun` answers `cancelled`; the run's session is gone afterwards (its logoff
  answered).
- [ ] **Step 9:** Commit.

### D25. Compact `HandlerSystem`: the system-wide reads in one tool (owner, 2026-11-07, DO21)

**Order.** D25 is implemented after D23b: its `search_source` action is `SearchSource` as
D23b leaves it (masks `*` / `?`, hits only, no paging, the counters). It also builds on D24
(the long-tool list, `background`, the run's own session, the cancel by discard).

**The owner's decisions (DO21).**
1. **A new compact tool `HandlerSystem` with a required `action`.** Each action calls exactly
   one full-set tool's entry (its `call`, so its schema parses the arguments):

   | `action` | Full-set tool |
   | --- | --- |
   | `search_source` | `SearchSource` (after D23b); compact has no source search today |
   | `search_object` | `SearchObject` (today `HandlerSearch`) |
   | `where_used` | `GetWhereUsed` (today `HandlerWhereUsed`) |
   | `package_tree` | `GetPackageTree` |
   | `transports` | `ListTransports` |
   | `atc_findings` | `GetATCFindings` |
   | `atc_results` | `ListATCResults` |
   | `atc_result` | `GetATCResult` |

   Eight actions, one full tool each: the `action` value alone picks the tool, as the other
   compact tools' constants (`object_type`, `operation`, `action`) pick theirs; nothing is
   inferred from which arguments a call carries (owner, D25-Q1).

2. **`HandlerSearch` and `HandlerWhereUsed` are removed**, with no duplicate left beside
   `HandlerSystem`. MIGRATION-24.0 and CHANGELOG map each of their calls to a `HandlerSystem`
   action.
3. **`HandlerSystem` is a long tool** (D24 for every long tool): on `LONG_TOOLS` and
   `tools/long-handlers.json`; `background` defaults to `true` (a call answers a `run_handle`
   at once; `background: false` answers the result in the call); its own ABAP session; its run
   read with `HandlerBackgroundRunGet` and cancelled with `HandlerBackgroundRunDiscard`.
   Without a background-run strategy it answers in the call and is listed without
   `background`. Every action is a read, so no action is a run mode (`isLongRead` holds for
   every call; no `NOT_A_READ` rule).
4. **Each action takes exactly its full-set tool's arguments**, named and typed as there;
   validation is per action, and a missing required argument is refused before anything is
   sent. An argument of another action is no argument of this one: it is dropped, like any
   undeclared key on a non-strict tool (owner, D25-Q2; D23b Step 4, MIGRATION-24.0). *What the
   flat schema lets hold of this is below ("Validation, as the code runs it").* **D25-Q3
   (owner, 2026-11-07, option A):** a well-typed argument of another action and an undeclared
   key are dropped; a wrong-typed argument of another action is refused before dispatch in
   `HandlerSystem`'s name, like any malformed argument; the listing keeps its types.
5. **Read-only:** `HandlerSystem` belongs to `compact-readonly-entries`, so it is served by
   every compact binary, the `-ro` ones included (`compact`, `compact-ro`, `compact-http`,
   `compact-http-ro`, `compact-sse`, `compact-sse-ro`). The exporter (`HandlerExporter`,
   `src/lib/handlers/HandlerExporter.ts`) builds only full-tool groups (`ReadOnlyHandlersGroup`,
   `HighLevelHandlersGroup`, `SystemHandlersGroup`, `SearchHandlersGroup`, its runtime-run
   group) and serves no compact tool (Measured by code), so D25 leaves it unaffected: it keeps
   serving the full counterparts. Adding compact tools to it is not part of D25. **Owner
   (2026-11-07):** `HandlerExporter` stays full-only; an embedder reaches compact through the
   groups the compact packages export — `CompactReadOnlyHandlersGroup`
   (`@mcp-abap-adt/compact-readonly-entries`) and `CompactModifyHandlersGroup`
   (`@mcp-abap-adt/compact-modify`; both names checked in the packages' `src/index.ts`) —
   registered on `EmbeddableMcpServer` (background runs, given a strategy) or on a plain
   `McpServer` (answered in the call). There is no second path to the compact groups.
6. **Not included, unchanged:** `HandlerDumpList`, `HandlerProfileView`, `HandlerGetData`.
7. **`HandlerGet` and five full reads: reported, not added.** See "Finding" below; adding them
   to `HandlerSystem` is the owner's later call.

**Finding — what `HandlerGet` covers of `GetObjectsList`, `GetStructuresList`,
`GetIncludesList`, `GetObjectInfo`, `DescribeByList` (Measured by code, 2026-11-07, the
worktree's `HEAD` plus the D23b work in progress, which touches none of these files).**
- No compact tool routes a call to any of the five. Their handlers
  (`handleGetObjectsList`, `handleGetStructuresList`, `handleGetIncludesList`,
  `handleGetObjectInfo`, `handleDescribeByList`) are imported only by the full groups
  (`SearchHandlersGroup`, `ReadOnlyHandlersGroup`, `SystemHandlersGroup`); nothing in
  `compact-readonly-entries/src`, `compact-modify/src` or `src/lib/compact` names them.
- What `HandlerGet` serves nearby (`compactReadRoutes.ts`, `compactPartRoutes.ts`,
  `handleHandlerGet.ts`), and how it differs:
  - part `node_structure` calls `GetNodeStructureLow` (`handleGetNodeStructureOnce`): **one**
    node level; `GetObjectsList` walks every child node recursively, by levels, in batch
    envelopes. Not equivalent;
  - part `object_structure` calls `GetObjectStructure`: one object's structure; none of the
    five;
  - part `contents` (`PACKAGE`) calls `GetPackageContents`: none of the five;
  - part `main_programs` (`INCLUDE`) calls `GetMainPrograms`: an include's main programs, the
    reverse direction of `GetIncludesList` (a program's include tree). Not equivalent;
  - `GetStructuresList` (a structure's include tree with element info), `GetObjectInfo` (a
    node tree with optional quick-search enrichment) and `DescribeByList` (a quick search per
    listed object): no part of `HandlerGet` reads anything like them.
- So compact serves none of the five today. They are not added to `HandlerSystem` in D25; the
  finding goes into the PR description for the owner's later decision.

**How the per-action arguments are declared** (the compact pattern, followed, not invented).

*Which pattern gives each action exactly its own arguments (Measured by code, 2026-11-07):*
- **A discriminated union on `action` cannot be registered.** `ToolDefinition<S extends
  z.ZodObject>` and `VariantToolDefinition.inputSchema: z.ZodObject`
  (`src/lib/handlers/interfaces.ts`) type every tool's schema as a `z.ZodObject`, and
  `defineTool`'s `call` parses with it; a `z.discriminatedUnion` is no `z.ZodObject`, so the
  definition does not compile. No compact tool uses one (`grep` over `src/lib`,
  `compact*/src`: none). The MCP tool listing also carries an object schema as a tool's
  `inputSchema`, where a union would serialise to `anyOf` (from the protocol's schema; not
  measured here).
- **The takes table plus the target's parse gives each action exactly its own arguments to
  its handler.** The listed schema is one flat object (the union of the actions' properties);
  the takes table states, at compile time, exactly which properties each action takes; and
  the target entry's own schema keeps exactly that tool's arguments and drops every other key
  (a `z.object` drops an undeclared key), so the target's handler receives exactly its tool's
  arguments. In the listing each property's words name the action(s) that take it. This is
  the pattern planned.

*Validation, as the code runs it (Measured by code, 2026-11-07):* a call is parsed three
times before the target's handler runs —
1. the MCP SDK validates the arguments against the listed schema before dispatch
   (`validateToolInput`, `node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js`),
   on every transport, refusing with its own "Invalid arguments for tool HandlerSystem" words;
2. `defineTool`'s `call` parses them with `HandlerSystem`'s own schema
   (`src/lib/handlers/interfaces.ts`, `invalidArgumentsWords('HandlerSystem', …)`);
3. the action's target entry parses them with the full tool's schema, in the target's words.

So with the flat schema every action's properties are declared and typed for every call:
- **a malformed argument of the action itself** (a wrong type, or a value rule the listed
  property states) is refused at 1 in `HandlerSystem`'s name, not the target's; only what
  the flat schema cannot state per action — a missing required argument — reaches 3 and is
  refused in the target's words, naming the target and the argument; nothing is sent either
  way;
- **a well-typed argument of another action, or a key no action declares,** passes 1 and 2
  and is dropped at 3: the target's handler never sees it, nothing is refused — DO21's
  "dropped" holds;
- **a wrong-typed argument of another action** (e.g. `search_object` with `worklist_id: 123`)
  is refused at 1, before dispatch, in `HandlerSystem`'s name, like any malformed argument —
  as the owner decided (D25-Q3, option A): within the `z.ZodObject` contract no listed schema
  both types each property and drops another action's wrong-typed property, and the listing
  keeps its types.

The compact tools with a mode argument declare one flat `z.object` whose properties are the
union of what the modes take, each property's words naming the modes that take it, and a
compile-time takes table (`takesOf<Property, Member>()({ every, members })`,
`compactSchemas.ts`) that names, per mode, the properties it reads — a property no list names
does not compile; per variant through `byVariant` where a full tool differs by variant
(`GetWhereUsed`'s `object_type`). The required properties of a mode are not `required` in the
listed schema (another mode does not take them); each mode's call goes to the target entry's
`call`, which parses with the target's own schema, so a missing required argument is refused
in the target's words, naming the target and the argument, before any request (the rule of
steps 8–9 and MIGRATION-24.0 "compact callers: refusals in the target tool's words"); a
wrong-typed one is refused earlier, by the listed schema (above).
`HandlerSystem` follows this:
- `action`: a required enum of the eight values; each value is its own coverage key (O11,
  `HandlerSystem#<action>`);
- the takes table keyed by action, with `every: ['background', 'action']`;
- a property two actions share is listed once, with words naming each action's meaning;
  measured overlaps: `object_name` and `object_type` (`search_object`: a name or mask and a
  search name; `where_used`: the object and its where-used code or name, per variant),
  `include_subpackages` (`search_source`, `package_tree`), `detail` (`search_object`,
  `transports`, `atc_findings`, `atc_result`: `SearchObject`, `ListTransports`,
  `GetATCFindings` and `GetATCResult` each spread the shared `DETAIL_SHAPE`). The listed type accepts what every
  action takes (all are strings or booleans today, so no widening is needed — the red test
  pins it); a full tool's `default` is applied by that tool's parse, not stated by the listed
  schema;
- `background` is `HandlerSystem`'s own (`COMPACT_LONG_BACKGROUND_FIELD`), decided at the
  dispatch; the action's call into the full entry runs inside that run or that synchronous
  call, never a second background run and never a second connection (D24 Step 3);
- the handler hands the target entry the call's arguments without `action`; the target's
  parse keeps its own and drops the rest (D25-Q2), and nothing reads a dropped key;
- the ATC and transport actions: `atc_findings` takes `GetATCFindings`' `worklist_id` and
  `detail`; `atc_results` `ListATCResults`' `created_by`, `central_only`, `age_min`,
  `age_max`; `atc_result` `GetATCResult`'s `display_id` and `detail`; `transports`
  `ListTransports`' `user`, `modifiable_only` and `detail`.

**What each action changes for a caller of the removed tools** (from the code, for
MIGRATION):
- `HandlerSearch(query, object_type, max_results)` → `HandlerSystem(action: "search_object",
  object_name: <query>, object_type, maxResults: <max_results>)`. Both default the count to
  100 (`HandlerSearch` `max_results`, `SearchObject` `maxResults`), so an absent count is
  unchanged; `search_object` also takes `SearchObject`'s `detail`.
- `HandlerWhereUsed(object_type: <compact type>, object_name, function_group_name,
  max_results)` → `HandlerSystem(action: "where_used", object_name, object_type, …)` with
  `GetWhereUsed`'s arguments: `object_type` a where-used code or name (not the compact
  member names), a function module named as `GetWhereUsed` takes it (`GROUP|MODULE` in
  `object_name`), `objects` for several, the type filters (`enable_all_types`,
  `enable_only_types`, `disable_types`). `HandlerWhereUsed` cut the list at `max_results`
  (default 100) and added `returned_references`; `GetWhereUsed` answers every reference. The
  compact where-used tables (`COMPACT_WHERE_USED`, `COMPACT_WHERE_USED_ROUTES`,
  `COMPACT_WHERE_USED_TAKES`, `compactWhereUsedSchemaFor`, `compactWhereUsedDescription`) go
  when nothing uses them.

**Files:** `compact-readonly-entries/src/handlers/handleHandlerSystem.ts` (new) and
`compact-readonly-entries/src/group.ts`; `handleHandlerSearch.ts` and `handleHandlerWhereUsed.ts`
(removed); `src/lib/compact/compactSchemas.ts`, `compactDescriptions.ts` and
`src/lib/compact/index.ts` (the new schema and takes table; the search and where-used ones
removed); `src/lib/adtProjections.ts` (the compact where-used projection, where nothing else
uses it); `src/lib/longTools.ts` and `tools/long-handlers.json`; `src/lib/backgroundRuns/tools.ts`
(`COMPACT_LONG_READS`); `tools/batch-handlers.json` and `docs/user-guide/BATCH_MODE.md`;
`src/lib/toolSet.ts` (the compact read-only set's words); `scripts/ci/check-images.mjs` (its
`HandlerSearch` probe); the listed-schema and surface fixtures (`tests/fixtures/tools/*.json`,
`compact/tests/fixtures/surface.json`); `tools/tool-search.json` (generated);
`compact/docs/AVAILABLE_TOOLS.md` and the other tool pages (`npm run docs:tools`); `README.md`,
the compact packages' READMEs (`compact-ro`, `compact-sse-ro`, `compact-http-ro`, …),
`docs/user-guide/HANDLERS_MANAGEMENT.md`; `src/__tests__/unit/coverage/coverage-debt.json`
and the coverage ledger; CHANGELOG, MIGRATION-24.0.

**Steps (red first):**
- [x] **Step 0: The owner's answers to D25-Q1 and D25-Q2** are recorded under DO21 (closed,
  2026-11-07): one action per full tool (the ATC entry split into three), and an argument of
  another action dropped.
- [x] **Step 0a: The owner's answer to D25-Q3** is recorded under DO21 (closed, 2026-11-07,
  option A): a wrong-typed argument of another action is refused before dispatch in
  `HandlerSystem`'s name, like any malformed argument; the listing keeps its types.
- [ ] **Step 1: Red tests per action** (`compact-readonly-entries/src/__tests__/handlerSystem.test.ts`
  and a new `src/__tests__/unit/handlerSystem/` suite, on `recordingConnection` /
  `adtStandIn` over corpus answers), table-driven over the eight actions:
  - `'each action calls exactly its full tool's path'`: for each action, the requests a
    `HandlerSystem` call sends equal, literal for literal, the requests the full tool sends for
    the same arguments (`SearchSource`, `SearchObject`, `GetWhereUsed`, `GetPackageTree`,
    `ListTransports`, `GetATCFindings`, `ListATCResults`, `GetATCResult`), and the answer is the full tool's answer — on both variants where the
    full tool differs by variant (`where_used`);
  - `'each action goes through its target's entry'`: a recording double of the target entry
    sees the call, and no other target is called;
  - **argument errors, nothing sent:**
    - `'action is required'`, and `'an action outside the eight is refused, naming the
      eight'`;
    - per action, each argument its full tool requires, missing, is refused in the target's
      words naming the target and the argument (`search_source` `query` and `packages`, `search_object`
      `object_name`, `where_used` `object_name` / `object_type` or `objects`, `package_tree`
      `package_name` or `package_names`, `atc_findings` `worklist_id`, `atc_result`
      `display_id`; `transports` and `atc_results` as their full tools state), with no request
      recorded;
    - `'a malformed argument of the action itself is refused before dispatch'`, per action:
      a wrong-typed argument (e.g. `search_object` `maxResults: "x"`, `package_tree`
      `include_subpackages: "yes"`, `atc_results` `age_min: "1"`) and a value the listed
      property's rule refuses (e.g. `search_source` `query: ""`) are refused by the SDK's
      validation of the listed schema in `HandlerSystem`'s name, on every registration path
      (stdio, HTTP, SSE; full and `-ro`), and again by `defineTool`'s parse when the entry is
      called directly; the words pinned as they come; no request recorded, the target entry
      not called;
  - `'a well-typed argument of another action is dropped'` (D25-Q2), per action: the call
    carries an argument only another action takes, with that action's type (e.g.
    `search_object` with `worklist_id: "W1"`, `atc_result` with `packages: ["Z*"]`,
    `where_used` with `display_id: "D1"`); its requests and answer equal those of the same
    call without it, nothing is refused, and the target's handler receives no such key — on
    every registration path; and `'a key no action declares is dropped'`, the same;
  - `'a wrong-typed argument of another action is refused before dispatch'` (D25-Q3, option
    A), per action (e.g. `search_object` with `worklist_id: 123`, `atc_result` with
    `packages: "Z*"`, `where_used` with `display_id: 1`): refused by the SDK's validation of
    the listed schema in `HandlerSystem`'s name, the words pinned as they come, on every
    registration path (stdio, HTTP, SSE; full and `-ro`), and by `defineTool`'s parse when the
    entry is called directly; no request recorded, the target entry not called;
  - `'detail is each detail-taking action's own'`: `search_object`, `transports`,
    `atc_findings` and `atc_result` pass `detail` (`terse`, `full`, `raw`) to their target
    and answer as the full tool does for it; the other four actions drop it;
  - `'the action alone picks the tool'` (D25-Q1): `atc_results` with a `worklist_id` still
    calls `ListATCResults` (the `worklist_id` dropped); `atc_findings` with a `display_id` and
    no `worklist_id` is refused for the missing `worklist_id`, nothing sent;
  - `'the listed schema declares each action's arguments once'`: the takes table names every
    listed property; each action's properties are exactly its full tool's (minus its
    `background`, which is `HandlerSystem`'s); a shared property's listed type accepts every
    action's values;
  - **the removed tools:** `'HandlerSearch and HandlerWhereUsed are in no compact set'`: on
    every compact binary (stdio, HTTP, SSE; full and `-ro`) and every system type,
    `tools/list` names neither (the exporter serves no compact tool and is unchanged: the
    full counterparts it serves stay as its existing tests pin them); `'a call to HandlerSearch or HandlerWhereUsed answers
    as an unknown tool'`, on each binary: the answer the server gives any unknown tool name
    (pinned as it is today, for a made-up name), and nothing sent.
- [ ] **Step 2: Red tests — the long tool and the background, on every registration path.**
  Extend the D24 table-driven suites (`src/__tests__/unit/longTools/harness.ts`,
  `background.test.ts`, `ownConnection.test.ts`) with `HandlerSystem` (removing `HandlerSearch` and `HandlerWhereUsed`), on each path
  that registers it: the compact stdio binary, `compact-ro`, `compact-http` / `compact-http-ro`,
  `compact-sse` / `compact-sse-ro`, with and without a background-run strategy (the exporter
  serves no compact tool, so it is no path of `HandlerSystem`'s):
  - `'HandlerSystem is a long tool'`: in `LONG_TOOLS` and `tools/long-handlers.json` (the
    source test keeping them equal), in `COMPACT_LONG_READS`, and its run tools are compact's;
  - per action: `'a call without background answers a run_handle'`, the read on a session
    other than the instance's main one, logged off after; `'background: false answers in the
    call'`, on its own session; `'HandlerBackgroundRunGet answers the result once'`;
    `'HandlerBackgroundRunDiscard cancels a running read'` (the session's logoff sent; the run
    `cancelled`);
  - `'one connection per background run'`: the action's call into the full entry opens no
    second connection and starts no second run;
  - `'without a strategy, HandlerSystem is listed without background and answers in the
    call'`; a plain registration of the compact read-only group lists it so;
  - `'no HandlerSystem call is a run mode'`: `isLongRead` holds for every action;
  - **batch mode:** each action's batch row matches its full tool's (`tools/batch-handlers.json`
    `when` rows on `action`): an action whose full tool is recorded is recorded with the same
    `sends`, an action whose full tool runs outside batch mode runs outside it, and
    `background: true` in batch mode is refused `batch_no_background` as for every long tool.
- [ ] **Step 3: Implement.** The schema and takes table (`compactSchemas.ts`, per variant via
  `byVariant`), the description (`compactDescriptions.ts`), `handleHandlerSystem.ts` routing
  each action to its target entry's `call` by the `action` value alone, the arguments without
  `action`, registered in
  `compact-readonly-entries/src/group.ts`; `HandlerSystem` added to `LONG_TOOLS`,
  `tools/long-handlers.json` (a row per action's `sends`, as `HandlerGet`'s row states its
  modes) and `COMPACT_LONG_READS`; the batch rows. Remove `HandlerSearch` and
  `HandlerWhereUsed`: their files, group entries, long-tool and batch rows, schemas,
  descriptions, and the where-used projections nothing else uses. No `as`, no `any`, no regex
  (the static-types gate).
- [ ] **Step 4: Tool-set parity and surface fixtures.** `src/__tests__/parity/toolSetParity.test.ts`
  (its `HandlerWhereUsed` row becomes `HandlerSystem`'s), `variantProperties.test.ts`,
  `searchObjectTypes.test.ts`, `functionModuleGroup.test.ts` and the other suites naming the
  removed tools (`grep` at the step's start, each named in the commit) move to `HandlerSystem`
  or drop the removed tool's case where the full tool's own case already covers it; the
  listed-schema fixture, `http-surface.json`, `stdio-sse-surface.json`, `variant-surface.json`
  and `compact/tests/fixtures/surface.json` change only by the two removals and the one
  addition, visible in the diff; `tools/tool-search.json` regenerated; `src/lib/toolSet.ts`'s
  compact read-only words name `HandlerSystem`; `scripts/ci/check-images.mjs`'s probe calls
  `HandlerSystem` `search_object` with `background: false`.
- [ ] **Step 5: The description, functional only,** under the functional-descriptions guard
  (`src/__tests__/unit/sources/descriptionsFunctional.test.ts`, every set, transport and
  system type): `[read-only]`; what each action reads and its required arguments, in the
  compact form (`search_source(query*, packages*, …)`); the answer per action; the long-tool words (`LONG_TOOL_ADVICE`, or the in-call words without a
  strategy). It names no other tool of its set and carries none of the guard's forbidden
  words. A description test pins its first sentence and each action's required arguments.
- [ ] **Step 6: Generated tool pages, README and docs.** `npm run docs:tools` (it builds,
  then writes `compact/docs/AVAILABLE_TOOLS.md` and the full pages; the compact count goes
  from 40 to 39); `README.md`, the compact packages' READMEs, `docs/user-guide/HANDLERS_MANAGEMENT.md`,
  `docs/user-guide/BATCH_MODE.md` (its table from `tools/batch-handlers.json`) and any `docs/`
  page naming `HandlerSearch` or `HandlerWhereUsed` (`grep` over `README.md`, `docs/` and the
  packages' READMEs; the released `MIGRATION-19.0`–`23.0` stay as released).
  `docs/architecture/HANDLER_EXPORTER.md` gets one sentence (owner, DO21): the exporter
  serves the full tools only; compact tools are registered from `CompactReadOnlyHandlersGroup`
  and `CompactModifyHandlersGroup` on `EmbeddableMcpServer` (background runs given a
  strategy) or on a plain `McpServer` (in the call).
- [ ] **Step 7: MIGRATION-24.0 and CHANGELOG.**
  - MIGRATION-24.0, a new section "compact callers: `HandlerSystem` replaces `HandlerSearch`
    and `HandlerWhereUsed`": the call mapping above, argument for argument (`query` →
    `object_name`, `max_results` → `maxResults`; the where-used `object_type` values and the
    function-module form; no `max_results` cut and no `returned_references` on `where_used`);
    the six new reads compact did not have (`search_source`, `package_tree`, `transports`,
    `atc_findings`, `atc_results`, `atc_result`); a well-typed argument of another action, or an undeclared key, is
    dropped, while a wrong-typed one, like a malformed argument of the action itself, is
    refused before dispatch in `HandlerSystem`'s name (D25-Q3); the listing keeps each
    argument's type; `HandlerSystem` is a long tool (a call without `background` answers a
    `run_handle`). The sections that list the compact long tools or the compact routes
    (`HandlerSearch`, `HandlerWhereUsed`; the long-tools section, "compact callers: refusals
    in the target tool's words", the function-module section) are rewritten to `HandlerSystem`
    (24.0.0 is unreleased).
  - CHANGELOG (24.0.0): Added — compact `HandlerSystem` (its eight actions and their full
    tools); Removed — `HandlerSearch` and `HandlerWhereUsed` (with the mapping, pointing at
    MIGRATION-24.0). The 24.0.0 entry's lines naming the two tools (the long-tool list, the
    compact routes, #2's tool list, the `object_type` search-names lines) name `HandlerSystem`
    (`search_object`, `where_used`) instead. Entries of released versions stay as they are.
- [ ] **Step 8: Coverage ledger.** The keys `HandlerSearch` and `HandlerWhereUsed#<type>`
  leave `coverage-debt.json` and the ledger (no longer served); the keys
  `HandlerSystem#search_source`, `#search_object`, `#where_used`, `#package_tree`,
  `#transports`, `#atc_findings`, `#atc_results`, `#atc_result` (O11, per `action` value) are added to `coverage-debt.json`
  and owed by their families: C10 (`search_source`, `search_object`, `where_used`), C8
  (`package_tree`, beside `GetPackageTree`), C11 (`atc_findings`, `atc_results`,
  `atc_result`, beside the ATC reads), C13
  (`transports`, beside `ListTransports`). Each key's pin carries a background case and a
  `background: false` case (D24 Step 7). `coverageLedger.test.ts` green, the ratchet naming
  exactly the new keys.
- [ ] **Step 9: Live cases (owed; each runs only on the owner's go),** read-only, under C2's
  live-run safety, with `background: false` and with the default background (read back with
  `HandlerBackgroundRunGet`), on premise and on ABAP Cloud, each action:
  - `search_source` in a configured package with a known hit (on the cloud, the configured
    build package): the hit as `SearchSource` answers it;
  - `search_object` for a shared object's name: it is listed;
  - `where_used` for a shared object: the references `GetWhereUsed` answers;
  - `package_tree` for the configured package: the tree holds a shared object;
  - `transports` for the test user's modifiable requests: the configured request is listed
    (C13's `coverage_transport.request`);
  - `atc_findings` on the worklist the C11 ATC run produced, `atc_result` on its stored
    result, `atc_results` listing the test user's results: each answer as its full tool's;
  - one background run cancelled by `HandlerBackgroundRunDiscard` mid-run (`search_source`):
    `cancelled`, its session logged off.
  An action whose endpoint the trial's discovery does not offer is reported to the owner
  before its cloud case is written (O7 / O8).
- [ ] **Step 10:** Commit as `feat(compact): D25 — HandlerSystem; HandlerSearch and
  HandlerWhereUsed removed`.

### Defect-stage owner decisions (decided 2026-11-04)

- **DO1:** a line range on the source reads, cut by the server after its one GET (ADT serves
  no part of a source, measured).
- **DO1a (2026-11-05):** a range together with `part: "metadata"` (or any part but
  `source`) is refused before any request — as `sourceRangeOf` does; D20 applies it to compact
  `HandlerGet`.
- **DO2:** the source scans in kept tools are SAP-backed where D1 shows SAP states it,
  otherwise a plain line scanner.
- **DO2a (2026-11-05):** through adt-clients 43.1.0 / adt-strategies 0.20.0 (D22), service-binding
  facts' exposed entities and every include of `GetStructuresList` — anonymous, named and
  appends (`extend type`) — read SAP's element info; `GetStructuresList` lists all of them
  (a changed answer, MIGRATION). Only `GetIncludesList`'s tree stays on a plain scanner (SAP
  does not state which include names which). Entities compare as a set; an unknown name is
  not found.
- **D20 (2026-11-05):** compact `HandlerGet` takes the source range and the `outline` part.
- **DO3:** the SRVD description stops promising a template.
- **DO4:** the message-class reads before and after writes are added.
- **DO5:** `validate_type` is removed.
- **DO6:** `HandlerGetData` refuses `object_name` together with `sql_query`.
- **DO7:** `GetObjectNodeFromCache` is removed.
- **DO8:** the outline tool is `GetObjectOutline`.
- **DO10 (#25):** `content_uri` comes from the object's version list and is read as given;
  the version tools' contracts do not change.
- **DO11 (settled):** `SearchSource`'s `time_budget_ms` and `timeout` were removed in D23a
  (`91ee9d14`); D24 checks they stay gone and removes every other long tool's `timeout`; a
  running read is ended by `DiscardBackgroundRun`.
- **DO9:** the prose guard recognises SAP-derived values by type and flow, with no allowlist;
  values that cross modules are left to review.
- **DO12 (2026-11-07, D23b):** a package mask is resolved by doubling the quick search's
  `maxResults` until the answer holds fewer than `maxResults` (measured: no cap up to 100 000,
  no "more" marker; `*` answers every package in seconds). `*` and `?` are the wildcards (`?`
  one character, `*` zero or more); `+`, `_`, `%` and `#` are literal.
- **DO13 (2026-11-07):** SAP's text search is deferred — later work, not in 24.0.0 (it answers
  `SRIS_SEARCH 006` on both systems; on premise the business function is off).
- **DO14 (2026-11-07, D23b):** the line match is a strategy the orchestrator takes explicitly,
  no default inside it; the shipped strategy keeps today's match; the handler wires it.
- **DO15 (2026-11-07, D23b):** a hit keeps the object (type, name, package, include), the line
  number and the line's text (snippet, up to 255 characters); an object without a hit is left
  out: `emit_no_hits` and `no_hits` are removed (a call that still sends `emit_no_hits` has it
  dropped — `SearchSource` is not strict).
- **DO16 (2026-11-07):** package walk envelopes are not capped; the ABAP Cloud limit (12
  packages about 130 s; envelopes of about 1 000 parts and more an outer `500` after about
  600 s) is a known limit, no change.
- **DO17 (2026-11-07, D23b Step 4a):** the answer is `results` (the hits) plus counters
  (packages walked, objects read, sources read, objects with hits). A source or
  object that cannot be read is skipped: no entry, no count; a readable source of the same
  object is still searched and its hits kept. A credential refusal still ends the call.
  Supersedes D23a's failure contract. **Closed (owner, 2026-11-07):** the package-level
  outcomes follow the same rule — a refused mask search, a package that does not exist
  (`404`), a refused walk of a package, type node or subpackage are skipped with no entry (a
  type node or subpackage excludes only its branch, DO19); the answer has no `failures` list. The counters count only what was done: `scanned.packages`
  the packages walked, `scanned.objects` the objects read (at least one source),
  `scanned.sources` the sources read, `scanned.objects_with_hits`; `truncated.by_object_cap`
  stays (the paging fields go, DO20).
- **DO18 (2026-11-07, D23b Step 4b):** a function group and each of its function modules are
  separate scan objects: a hit in a module names the module (`object_type` the ADT code
  `FUGR/FF` — measured on premise 2026-11-07 in the quick search's `adtcore:type` and the
  group's node structure —, name, package and
  `function_group_name`, what `GetFunctionModule` requires), not the group; a hit in the
  group's own includes is the group's (with `include`); the counters count them apart; every
  hit carries what its read tool needs, with no object nested under another.
- **DO19 (2026-11-07, D23b Step 4c):** a refused level of a walk (a type node or a
  subpackage, its `404` included) excludes only that branch — the node and everything under
  it; the rest of the asked package is walked and searched. A refused root of the asked
  package excludes that package. No entry, not counted. For `SearchSource` only; the other
  walking tools keep their answer.
- **DO20 (2026-11-07, D23b Step 4d):** no user-facing package or object limit: the mask quick
  search's `maxResults` is internal (the doubling answers every package). `max_objects` and
  the paging (`start_at`, `next_start_at`, `total_targets`, `truncated.by_max_objects`) go:
  one run reads every target, unless the caller gives `max_hits` and it is reached (DO23) (in the background by default, D24) and keeps only the hits.
  `max_hits_per_object` stays, optional, no default (absent = no limit; given = per object,
  DO18); `truncated.by_object_cap` stays.
- **DO21 (2026-11-07, D25):** a new compact tool `HandlerSystem` with a required `action`,
  each action calling exactly its full-set tool's entry: `search_source` = `SearchSource` (as
  D23b leaves it), `search_object` = `SearchObject`, `where_used` = `GetWhereUsed`,
  `package_tree` = `GetPackageTree`, `transports` = `ListTransports`, `atc_findings` =
  `GetATCFindings`, `atc_results` = `ListATCResults`, `atc_result` = `GetATCResult` — eight
  actions, one full tool each. `HandlerSearch` and `HandlerWhereUsed`
  are removed (no duplicates); MIGRATION-24.0 and CHANGELOG map their calls to the actions.
  `HandlerSystem` is a long tool (D24: `LONG_TOOLS`, `tools/long-handlers.json`, `background`
  default `true`, its own ABAP session, read with `HandlerBackgroundRunGet`, cancelled with
  `HandlerBackgroundRunDiscard`; without a strategy it answers in the call and lists no
  `background`). Each action takes exactly its full tool's arguments, validated per action, a
  missing required one refused before anything is sent. Read-only: in every compact set, the `-ro`
  ones included; the exporter serves no compact tool and is unaffected. **Exporter (owner,
  2026-11-07):** `HandlerExporter` stays full-only; compact is reached by embedders through
  `CompactReadOnlyHandlersGroup` and `CompactModifyHandlersGroup` on `EmbeddableMcpServer`
  (background runs, given a strategy) or on a plain `McpServer` (in the call), with no second
  path; `HANDLER_EXPORTER.md` says so (D25 Step 6). `HandlerDumpList`, `HandlerProfileView` and `HandlerGetData` stay as they
  are. `GetObjectsList`, `GetStructuresList`, `GetIncludesList`, `GetObjectInfo` and
  `DescribeByList` are not added (D25's finding: compact serves none of them today); that is
  the owner's later call. D25 is implemented after D23b. **D25-Q1 (owner, 2026-11-07):** the
  tool is picked by a constant, as the other compact operations are: one `action` per full
  tool, the ATC entry split into `atc_findings`, `atc_results` and `atc_result`; nothing is
  inferred from which arguments are present. **D25-Q2 (owner, 2026-11-07):** since the action
  names the tool, each action declares exactly its tool's arguments; an argument of another
  action is no part of it and is dropped like any undeclared key on a non-strict tool. The
  pattern that gives this (Measured by code): the flat schema with the per-action takes table,
  the target entry's parse keeping exactly its tool's arguments — a discriminated union on
  `action` is no `z.ZodObject`, which every tool definition's schema must be. **D25-Q3 (owner,
  2026-11-07, option A; DO21 amended):** a well-typed argument of another action and an
  undeclared key are dropped (by the target's parse); a wrong-typed argument of another action
  is refused before dispatch in `HandlerSystem`'s name (the SDK's validation of the listed
  schema), like any malformed argument of the action itself; the listing keeps its types;
  MIGRATION-24.0 says so.
- **DO22 (2026-11-07, D23b Step 4e):** what a failed read (a source read, a mask search, a
  package or level walk) leads to is decided by a read-failure strategy the orchestrator
  takes explicitly, with no default inside it; the handler wires the shipped one: a SAP
  refusal (a system answer: an HTTP status or ADT exception) is skipped as DO17 / DO19 say; a
  credential refusal ends the call; anything else (our own defect: a `TypeError`, a
  `RangeError`, any thrown value that is not a system answer) is thrown, never swallowed.
  The strategy is asked once per failed read, at the place it arises (mask, package root,
  level, function-group structure, source); its decision travels unchanged through every
  outer layer, and a cached or replayed read reuses it. **Closed (owner, 2026-11-07; amended the same
  day — "library defects are raised, SAP's answers are handled by the strategy"):** a failure
  is a SAP answer when it carries a `response` with an integer HTTP status, whatever its
  `origin` (answered, carried, or a raw transport failure), or when it is an `IAdtError` of
  `origin: 'refusal'` (with or without a `response`); a SAP answer goes to the strategy
  (shipped: skip). Everything else — no response (unreachable host, network, DNS), a library
  defect, our defect, a primitive — is thrown. `origin` alone does not decide: adt-clients 43
  answers a SAP `4xx` / `5xx` exception document as `origin: 'connection'` with its `response`
  (measured). Any batch envelope failure but the outer `404` of `isNoBatchEndpoint` (no
  failure: the sequential fallback runs) is thrown; the call ends on a credential or
  `failureOf` refusal, whatever its shape. Precedence: credential / `failureOf` end →
  envelope failure throws → a SAP answer goes to the strategy → anything else throws. A live
  check of a real SAP `404`'s shape is owed (Step 7). An envelope's failure is decided in the phase, where `runPhase` sees
  it, before adt-clients' conversion builds the parts' answers (place `'envelope'`); an
  answered failure is normalised to a carried one (`thrownOf`, `carryingFailure`) before the
  rule, so an answered `401` ends the call.
  **The strategy is the consumer's (owner, 2026-11-07, Step 4e2):** "SAP's error rule — the
  consumer's strategy decides". It sees only SAP answers with their place and answers skip |
  end | throw; defects, no-answer failures, credential / `failureOf` refusals and envelope
  failures never reach it. The embedder passes it in `EmbeddableMcpServer`'s options, carried
  to `SearchSource` in the handler context like `backgroundRuns`; the binaries' launchers pass
  the shipped one (skip); its contract and the shipped strategy are exported from
  `@mcp-abap-adt/lib/embeddable`. **Closed (DO24):** the line-match strategy is the
  consumer's too.
- **DO24 (2026-11-07, D23b Steps 4e2 and 4e3):** "a default strategy, and the means to change
  the search at will". The default's placement is approved: `SearchSource`'s handler uses
  `context.<field> ?? shipped` (the one place a default lives; the orchestrator takes it
  explicitly), `HandlerExporter` has its own option, the launchers pass the shipped one. The
  line-match strategy is the consumer's exactly like the SAP-answer strategy: the same option
  path, its contract and `substringLineMatch` exported from `@mcp-abap-adt/lib/embeddable`.
- **DO23 (2026-11-07, D23b Step 4f):** the caller sets how much the answer holds, with three
  optional controls; with none, the answer is every hit with line and snippet. `answer`:
  `'objects'` (each object and include with hits, `function_group_name` for `FUGR/FF`, and the
  number of hits answered), `'lines'` (plus line numbers), `'snippets'` (plus the line text;
  the default). `max_hits_per_object` as DO18 / DO20. `max_hits` limits the hits of the whole
  answer (counted after `max_hits_per_object`): when reached, the scan stops reading and
  `truncated.by_max_hits` is set when something remains; absent, no limit; `scanned.*` report what was done until the
  stop.

## Test coverage — the families

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
    `ZMCP_BLD_I_*` and creates the BDEF over it; the same holds for the behavior
    implementation's class.
  - **Registered at once.** The root view is recorded for cleanup immediately after its
    create succeeds — before its source is written and before it is activated
    (`rapFixtures.ts`' `createView` runs create, write, activate in one call, so the test calls
    the create, `recordCreated`, then the write and `activateAndConfirm`). A write or activation
    that fails still leaves the view to cleanup. The same for the BDEF and the class.
  - Cleanup deletes in reverse order of creation: behavior implementation, BDEF, then the
    root view (`deleteView`).
  - **Activation without built-in limits (a prerequisite step of C3).** `rapFixtures.ts`'
    `activateAndConfirm` polls `GetInactiveObjects` with `attempts = 8` and `waitMs = 2000`,
    and filters messages with a regex — against the no-built-in-timeouts, no-retries and
    no-regex rules; it is test code in this PR, so it is fixed in the same step, before C3's
    live cases:
    - **two flows, by how many objects:**
      - **single object** (`handleActivateObject`'s `activateSingle`; `createView` uses it):
        the answer carries an inline verdict and no run id — confirmed from that verdict
        alone: `activated` stated, and no message of type `E`, `A` or `X` (compared in plain
        code);
      - **asynchronous run** (several objects): the helper starts it with the one-request
        start path, `getUtils().activateObjectsGroup(objects, preaudit, { headers })` (one
        `POST`, `202`, the run id in `Location`), so the test's own wait does not depend on
        the tool under test (`handleActivateObject`'s group path, whose wait C2c changes);
        then it waits with the client's **long polling** — `getUtils().getActivationRun(runId,
        { withLongPolling: true })` on the test's own connection, which sends
        `GET /sap/bc/adt/activation/runs/<id>?withLongPolling=true` and is held open by the
        server — once per answer until `runs:status` is terminal; no attempt count, no
        interval, bounded only by the Jest test timeout. Then it reads the run's results
        (`getActivationResults`) and judges the **activation verdict**, not the run status: a
        `finished` run can still not activate — `activationExecuted="false"` with only a `W`
        message, "Activation was cancelled." (`activationCancelled.test.ts`). It confirms only
        when `activationExecuted` is true and no message is `E`/`A`/`X`; `error` / `failed`, a
        cancelled run, or an `E`/`A`/`X` message fails with the messages.
      - The single-object verdict is judged the same way: `activated` must be stated true
        (`activationExecuted` not false), whatever its messages.
      - `HandlerGet#-#activation_status` gets `with_long_polling` in C2d (decided); C3 depends
        on C2d. Omitted, the read answers at once as before; with it, SAP holds the read until
        the run ends. C3's keys pin and run both forms.
    - the prerequisite unit tests, written first, cover both flows on `adtStandIn` and
      replace the old poll's: `'single: an inline verdict with an error message fails,
      nothing more is sent'`, `'single: a cancelled inline verdict with no error message
      fails'`, `'single: an executed verdict confirms'`, `'run: started with one POST'`,
      `'run: every status read carries withLongPolling=true, one after another with no
      timer'` (request assertions on the recorded URLs, the stand answering "running" twice,
      then "finished"), `'run: finished and executed confirms'`, `'run: finished but
      cancelled with only a W message fails'`, `'run: error fails with the results'
      messages'`;
    - its callers (`BehaviorDefinitionAndImplementationHighHandlers.test.ts`,
      `admin/shared-deps/setup.test.ts`) drop the two arguments.
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

**Prerequisite:** C2a, for the `HandlerCreate#TRANSPORT` live case.

**Owner's decision applied:** O4 / O5 — `HandlerCreate#TRANSPORT`'s live case creates its own
request — `prepareRequestCreate`, the awaited `liveCall('HandlerCreate', { object_type:
'TRANSPORT', … })`, `reconcileRequestCreate` — and records it; `deleteRecordedRequests` deletes it, in C2a's measured order, and
asserts it absent.

**Unit:** `src/__tests__/unit/pins/compactWrites.pins.test.ts`. **Every operation × type key
gets its own literal pin, per variant** (O2): `HandlerCreate#<type>` (19 on premise, 17 on the
cloud), `HandlerLock#<type>` and `HandlerUnlock#<type>` (18 / 16), the legal `HandlerUpdate`
keys of C1's table (24 part-less on premise plus `INCLUDE#source` and `INCLUDE#metadata`;
22 on the cloud), each with a live case too — `HandlerLock#CLASS` included, though `lowToCompact.test.ts` already covers it by
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
- **`DeleteUnitTest` and `DeleteCdsUnitTest`** are implemented in C7, inside the existing
  unit-test suites (`unitTest/ClassUnitTestHighHandlers.test.ts`,
  `unitTest/CdsUnitTestHighHandlers.test.ts`), each at the end of the suite's test body:
  `DeleteUnitTest` with `expectCleared` (the test include empty, the class stays),
  `DeleteCdsUnitTest` with `expectAbsent` (its class is removed). C7's ledger rows point there,
  so C7's gate holds when C7 lands; C12 leaves them as they are.
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
  routes before any type. The typeless run parts are C3's. `HandlerSystem#package_tree` (D25),
  beside `GetPackageTree`, its live case on the same package.
- **The behaviour implementations (D17):** `GetBehaviorImplementation#implementations` and
  `HandlerGet#BEHAVIOR_IMPLEMENTATION#implementations`.
- **The outline tool (D5):** `GetObjectOutline#<object_type>`, one key per value of its
  `object_type` enum on each variant (as D1 measured: class, interface, and on premise
  program and function group).
- **The source range (DO1, D5):** `start_line` / `end_line` on the `Get<Type>` source reads are
  no key dimension (not enums); each source reader's pins and live case include one ranged
  read beside the whole read.

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
| `GetDomain`, `GetDataElement`, `GetFunctionGroup`, `GetPackage`, `GetTableType`, `GetMessageClass`, `GetEnhancementSpot` | the tool alone: no source part | the metadata document's name and type (domain: its data type; data element: its type; package: its super package or software component; message class: a message) |
| `GetEnhancementImpl` | the tool alone | its `source_code` (`handleGetEnhancementImpl.ts`) is non-empty, with `enhancement_spot` and `enhancement_name` the ones asked |
| `GetIncludesList` | `#<object_type>`, one per value of its enum (`PROG/P`, `PROG/I`, `FUGR/F`, `CLAS/OC`, `FUGR`, `CLAS`) | the list holds an include of the named shared object of that type |
| `GetLocalDefinitions`, `GetLocalMacros`, `GetLocalTestClass`, `GetLocalTypes` | the tool alone | the include's text is read (it may be empty) and the class still reads |
| `GetMessageClassMessage` | the tool alone | the message text of the number asked |
| `GetEnhancements`, `GetMainPrograms`, `ListFunctionGroupIncludes`, `ListFunctionModules`, `GetPackageContents`, `GetPackageTree`, `GetObjectsList`, `GetStructuresList`, `GetTypeInfo` | the tool alone | the list or tree holds the named shared object (or, `GetTypeInfo`, the type's kind) |
| `HandlerGet#<type>#source` | per type with a source (not `PACKAGE`, `DOMAIN`, `DATA_ELEMENT`, `FUNCTION_GROUP`, `TABLE_TYPE`) | as the full reader's source |
| `HandlerGet#<type>#metadata`, `#urls`, `#contents`, `#main_programs` | per type the routes serve | metadata as above; urls: the object's URI; contents: the package's entries; main programs: the include's main program |
| `HandlerGet#-#object_structure`, `#node_structure`, `#virtual_folders` | typeless | a node of the named object or package |
| `GetBehaviorImplementation#implementations`, `HandlerGet#BEHAVIOR_IMPLEMENTATION#implementations` | `implementations` | the pool's CCIMP holds a `lhc_` handler class |
| `GetObjectOutline#<object_type>` | per type of its enum | the components of an object the test creates (its methods, attributes, forms or modules, as the type has them), each with visibility and a source position; the source lines at a position hold that component |
| any `Get<Type>` source reader, ranged | the reader's own key | a read with `start_line` / `end_line` answers exactly those lines of the whole source; one out of range is refused after the one GET |

**Live:**
- **Existing read suites** move their calls to `liveCall`.
- **New: `coverage/reads.live.test.ts`,** section `coverage_reads`.
  - **Objects.** Shared objects only (`shared_dependencies`), read and never written; the
    outline cases read a class (and, on premise, a program and a function group) the test
    creates and deletes in the standard order. The enhancement spot and implementation are
    named in the section, after the discovery check.
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
- (`GetAbapAST`, `GetAbapSemanticAnalysis`, `GetAbapSystemSymbols` are removed in D5, and
  `GetObjectNodeFromCache` in D14 (DO7); the outline tool's keys are C8's.) `GetAdtTypes`
  (without `validate_type`, DO5),
  `GetInactiveObjects`, `GetObjectInfo`, `GetObjectStructure`,
  `GetObjectsByType`, `GetTransaction`, `SearchObject`, `SearchSource`, `GetWhereUsed`,
  `DescribeByList`, `GetSqlQuery`, `GetTableContents`.
- Compact: `HandlerGetData`, `HandlerSystem#search_source`, `HandlerSystem#search_object`,
  `HandlerSystem#where_used` (D25, O11: one key per `action` value; `HandlerSearch` and
  `HandlerWhereUsed#<type>` are removed in D25).

**Owner's decision applied:** O8 — the cloud cases of `GetSqlQuery` and `GetTableContents` are
written only after the trial's ADT discovery is read for their endpoints; an endpoint it does
not offer is reported to the owner.

**Unit:** `src/__tests__/unit/pins/system.pins.test.ts`.

**Live:**
- **Existing suites** move to `liveCall`: `SystemHighHandlers`, `SearchSourceHandler`,
  `WhereUsedHandlers`, `SqlQueryHandlers`, `TableContentsHandlers` (`AbapSystemSymbolsHandler`
  is deleted with its tool in D5).
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
  `HandlerProfileSchedule`, `HandlerProfileView`, `HandlerSystem#atc_findings`,
  `HandlerSystem#atc_results`, `HandlerSystem#atc_result` (D25; their live cases read the
  worklist and the stored result this family's ATC run produces, and the test user's result
  list).

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
- **`RunProgramUnitTest` on the cloud** (it is listed there): a case in
  `coverage/unitTests.live.test.ts`, section `coverage_unit_tests`, runs the unit tests of an
  owner-configured delivered report with tests (`coverage_unit_tests.cloud_program_with_tests`)
  and reads the result (test count, no failure); nothing is created, updated or deleted.
- **Their deletes** were added to these suites by C7 (`DeleteUnitTest` then `expectCleared`,
  `DeleteCdsUnitTest` then `expectAbsent`); C12's conversion keeps them at the end of the
  body.
- **Assertions.** The run's result is read: the test count and that no test failed.

**Steps:** the family steps. 7.

### C13. Transport

**Keys:**
- `CreateTransport`, `CreateTransportTask`, `AddTransportObject`, `RemoveTransportObject`,
  `MoveTransportObjects`, `SortAndCompressTransportTask`, `ReadTransportObjects`,
  `ReadTransportActionLog`, `GetTransport`, `ListTransports`.
- Compact: `HandlerTransportCreate`, `HandlerTransportMoveObjects`,
  `HandlerTransportSortAndCompress`, `HandlerSystem#transports` (D25; read-only, it lists the
  configured `coverage_transport.request`).

**Owner's decision applied:** O4 / O5.

**Prerequisite:** C2a (the measured delete path and move); the cleanup below follows its
recorded order.
Measured on premise (C2a's record): the move between two requests is accepted both ways; the
system makes a task with each request it creates, which the test records and deletes too;
the deletes go task by task (the later created first), then the request, each read `404`
after. The cloud answers the same for the creates and the deletes (no move was measured
there: no configured request).

**Unit:** `src/__tests__/unit/pins/transport.pins.test.ts`.

**Live:**
- **The existing `TransportObjectToolsCrud`** moves to `liveCall`, and its cleanup takes the
  same order (object deleted, its entries detached from both requests, final entries
  verified, created tasks and requests deleted and asserted absent).
- **New: `coverage/transport.live.test.ts`,** section `coverage_transport`.
  - **Creates.** `CreateTransport`, `CreateTransportTask`, `HandlerTransportCreate` each create
    their own request or task — prepare, the directly awaited `liveCall`, reconcile; a task
    only under a test-owned, journalled request — and **record the returned number at once**,
    before any read-back or assertion (a refused request create's empty request is found by
    its run description, a refused task create's leftover by the parent's task delta); then assert it reads back
    (`GetTransport`). Cleanup deletes only recorded numbers, in the measured order, then
    asserts each absent.
  - **Everything else** works on `coverage_transport.request`: an object the test creates in the
    section's transportable package is added (journalled, `recordTransportEntry`), read in the
    request's objects and action log, sorted and compressed in that request's task, then
    removed — `RemoveTransportObject` is itself a case here, asserted by a re-read. Cleanup
    then runs the one order: the object deleted, any entry the delete added detached, the
    configured request verified back as it was.
  - **Move** (`MoveTransportObjects`, `HandlerTransportMoveObjects`). A move between two tasks
    of one request is refused by the system (TR 717, "Object can be moved between different
    requests only"; `TransportObjectToolsCrud.test.ts`). So the case moves the object's entry
    from the configured request's task to a task of a request the test itself created (O5),
    reads both (gone from the first, on the second), moves it back and reads both again —
    success asserted both ways — each add and move journalled at once
    (`recordTransportEntry`) — then cleanup runs `deleteRecordedRequests`' order: the object
    deleted first, its entries detached from both requests, the final state verified, the
    created request and task deleted and asserted absent. If the measurement (C2a) shows this move
    refused too, the case asserts SAP's refusal and both requests' entries unchanged, and the
    finding goes to the owner.
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
- **State and handles, per set — each case seeds its state through tools its own server
  serves:**

  | State | Full set | Compact set |
  | --- | --- | --- |
  | an open batch, before `BatchEnd` / `BatchAnswers` / `HandlerBatch#end` / `#answers` | `BatchBegin` | `HandlerBatch` `action: 'begin'` |
  | a background run, before its get / list / discard | `RuntimeRunClass` `background: true` | `HandlerProfileRun` `background: true` |
  | a long session, before its close | `SessionOpen` | `HandlerSession` `action: 'open'` |
  | a leftover session, before its list / logoff | `setup: 'leftover-session'` (`leftoverSession.ts`) | the same setup |

  The state handle, run id, session handle and leftover id come from those answers (`bind`).
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
- **Background runs.** Full set: `RuntimeRunClass` with `background: true` on a probe class the
  test creates; compact set: `HandlerProfileRun` with `background: true` on the same class.
  The run is got, listed and discarded through the set's own tools, and the discarded run is
  absent from the list.
- **Batch and long sessions per set.** The compact cases open the batch with
  `HandlerBatch` `action: 'begin'` and the long session with `HandlerSession`
  `action: 'open'` on the compact binary; the full cases with `BatchBegin` and `SessionOpen`
  on the full binary.
- **Leftover sessions** (O10). By design a stdio start adopts the sole leftover of its
  destination (`claimTheOne`, the owner's rule), so the cases use an **isolated runtime
  store**: every process of the case runs with `AUTH_BROKER_PATH` set to a temporary
  directory the test makes, holding a copy of the destination's session file, so its
  runtime directory (`runtimeDirectory`) holds only what the test made; the directory is
  removed at the end.
  - **(a) One leftover is adopted.** The test starts the stdio binary, opens a session, ends
    the process without logoff; a new process on the same destination adopts it — asserted
    (the designed behaviour): the list shows no leftover, and the new process's session is
    the leftover's. The new process then logs off normally.
  - **(b) Two leftovers are left alone.** The test makes two leftovers the same way, recording
    both handles; a new process adopts neither, lists both, and logs off only the two
    recorded handles (`LogoffLeftoverSession` / `HandlerLeftoverSessionLogoff`), each
    answer asserted; the list is then empty.
  - The tests assert the tools' answers, not SM04. Everything the test made — sessions,
    processes, the temporary store — is ended or removed.

**Steps:** the family steps, then:
- [ ] End the ratchet: `coverage-debt.json` is now empty. Delete the file, `checkDebt` and its
  fixtures (`__fixtures__/coverage-debt/`), and assert `missing-row` empty again, so the guard
  requires every key: `npm test -- src/__tests__/unit/coverage/coverageLedger.test.ts` PASS with
  no key missing.
- [ ] Commit.

9 steps in all.

### Owner's decisions and open items

**Decided by the owner (binding), applied in the tasks named:**
- **O1 — the guard is a ratchet (owner 2026-11-04: red CI is a failure).** The keys without a
  ledger row must be exactly `coverage-debt.json`, a sorted list: a missing key not listed fails,
  and so does a listed key that is covered or no longer served. Every family task removes its
  keys; C16 empties the list and deletes it and the ratchet, so the guard requires full
  coverage. No `test.failing`, no skip, no switch. Each family is pushed as it lands (C1, every
  family task).
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
- **O10 — leftover sessions: yes.** The test makes its own leftovers, in an isolated runtime
  store (a stdio start adopts the sole leftover of its destination by design): one leftover
  is adopted by the next process, asserted; two are adopted by neither, listed, and only the
  recorded handles are logged off. The tests assert the tools' answers, not SM04 (C16).
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
  - Every other transport case (add and remove an object, read objects, action log, get, list,
    move, sort and compress) works with **one request named in the config**
    (`coverage_transport.request`); no request is created for it; nothing is released.
  - **The delete path.** No tool deletes a request (`HandlerDelete`'s enum has no
    `TRANSPORT`). adt-clients 42.1.0 has it: `AdtRequest.delete(config, { headers })` and
    `AdtRequest.checkDeletion(config, { headers })`, reached by
    `createAdtClient(connection).getRequest()` — `DELETE /sap/bc/adt/cts/transportrequests/<n>`
    (`core/transport/delete.js`), accepted by ADT only for an empty, unreleased request. The
    test calls it on its own connection. Whether the same `DELETE` removes a task by the task's
    number, and whether a request's empty task must go first, is **measured live in C2a**,
    after C2 and before C6's transport case, on the request and task that measurement creates.
  - The rule covers **every tool that creates a request**: `CreateTransport`,
    `CreateTransportTask`, `HandlerTransportCreate`, `HandlerCreate#TRANSPORT` (the
    controller's ruling on the owner's rule).
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
  | `coverage_unit_tests` | `cloud_program_with_tests`: a delivered report on the cloud system that has ABAP Unit tests (read and run only) |
  | `coverage_transport` | per system: a transportable package, and `request` — one modifiable request of the test user with a task, used by every transport case but the creates |
  | `coverage_sessions` | a free probe class name; `launch_http: true` for the long sessions |
  | `debugger_handlers` | `second_user_env` (a second user's session file) for the other-user case |

**Decided by the owner, on the two findings of the activation work:**
- **(a) `with_long_polling` for `HandlerGet` `activation_status`: yes.** An optional boolean
  passed to `getActivationRun({ withLongPolling })`; omitted, today's behaviour. On the owner's
  condition that it really long-polls: measured first (C2b), then C2d. No separate full-set
  activation-run tool exists.
- **(b) `awaitActivationRun` loses `attempts = 6`, `delayMs = 1000` and its `setTimeout`:
  yes.** It re-reads with `withLongPolling=true` after each answer until the run is terminal,
  with no limit and no timer; gated on the same measurement (C2b), then C2c.

**Nothing is still open.**

### Where each decision is needed first

O4 / O5 → C2a (the delete-path and move measurement), which is a prerequisite of C6's
`HandlerCreate#TRANSPORT` live case and of C13. The credential-is-not-the-kind decision → C2 (test helpers) and C2e (production), before
C3. (a), (b) → C2b (the long-polling
measurement), then C2c and C2d, before C3. The other decisions apply as named above.

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
    - every comment or doc that ties the system kind to the credential — at least
      `src/lib/config/IServerConfig.ts` (around line 38) and `src/lib/handlers/interfaces.ts`
      (around line 14), fixed in C2e and checked again here — and any README or `docs/`
      page saying JWT means cloud;
    - `tests/README.md` and `tests/test-config.yaml.template`'s header: `expected_realm`, the
      `coverage_*` sections, `$TMP` on premise and the configured package on the cloud;
    - guides and examples that show a test or a config;
    - `CHANGELOG.md` / `MIGRATION-24.0.md`: the defect stage's fixes and contract changes
      (spec §9: the three removed tools with their replacements, the outline tool, every
      argument now refused, and the owner's decisions DO1–DO23 as decided, D25's removal of `HandlerSearch` and
      `HandlerWhereUsed` with their `HandlerSystem` actions included);
    - `CHANGELOG.md` / `MIGRATION-24.0.md`: the defects fixed in the stage (spec §8,
      acceptance 4) and the two owner-approved changes — C2c's behaviour fix (a group
      activation waits on long polling with no attempt limit or interval) and C2d's added
      optional parameter (`HandlerGet` `with_long_polling`, in MIGRATION only as an addition
      an embedder need not act on); confirm nothing else changed.
    Commit as `docs: the test-coverage stage`.
19. Run CI's full step list locally, including the pack, the install check and the images.
    Then run Codex review and CI, and get the owner's review.
20. Delete the goal, spec and plan before the release commit. Put anything they owe into the
    PR description: the owner's decisions (O1–O12), the exceptions the owner granted (none so
    far), D19's later work (the XML wrapper in adt-clients and adt-strategies; a possible
    switch to `@xmldom/xmldom`), D23b's later work (SAP's text search, DO13), D25's finding for the owner's later call (compact serves none of `GetObjectsList`, `GetStructuresList`, `GetIncludesList`, `GetObjectInfo`, `DescribeByList`), the best-effort limit of request-create reconciliation (C1's `live.ts`: an
    unidentifiable leftover fails its case and is named by its description), the accepted
    residual of launched servers (C2 Step 4a: one follow-up request a child
    server may still send inside a refused call), the measured transport delete path, the per-system run counts and the config
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
