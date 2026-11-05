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

The stage runs after step 17 and before step 18. It is written as tasks C1, C2, C2a–C2e, then the defect stage D1–D22 (spec §9), then C3–C16, each with
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
- **DO9:** the prose guard recognises SAP-derived values by type and flow, with no allowlist;
  values that cross modules are left to review.

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
  routes before any type. The typeless run parts are C3's.
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
- Compact: `HandlerSearch`, `HandlerGetData`, `HandlerWhereUsed#<type>` (its listed schema has
  an `object_type` enum, so one key per type).

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
  `HandlerTransportSortAndCompress`.

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
      argument now refused, and the owner's decisions DO1–DO9 as decided);
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
    switch to `@xmldom/xmldom`), the best-effort limit of request-create reconciliation (C1's `live.ts`: an
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
