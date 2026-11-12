# Spec: no assertion, no regex, exact optional types

Goal: `2026-11-12-no-assertions-goal.md`. This spec decides what the goal left open.

## 1. What the code shows (Measured, this branch)

- **Production holds three assertions, all from one contract.**
  - `src/lib/batch/phases.ts` (2) and `src/handlers/system/readonly/handleRuntimeListFeeds.ts` (1)
    each assert `… as Promise<IAdtWireResponse<T, D>>`.
  - `IAbapConnection.makeAdtRequest<T = unknown, D = unknown>(options): Promise<IAdtWireResponse<T, D>>`
    (`@mcp-abap-adt/interfaces-adt-connection` 4.2.0, `src/IAbapConnection.ts`) lets the caller
    choose `T`. Every implementation that does not hold a `T` of its own must assert it: the
    server's recording and forwarding views (above), and `connection`'s own
    `AbstractAbapConnection` (`response as unknown as IAdtWireResponse<T, D>`, line 1602).
  - Callers that pass a type argument, outside tests: the server's five pass-throughs
    (`envelopeWatch.ts`, `lateBound.ts`, `phases.ts`, `recorder.ts`, each `<T, D>` handed on),
    adt-clients' `activationUtils.ts` (`<T, D>` handed on) and its `tools/header-probe`. None
    chooses a concrete `T`.
  - Packages that depend on interfaces-adt-connection: interfaces-adt, adt-clients,
    adt-strategies, connection, and this server (root and server-runtime).
- **`exactOptionalPropertyTypes`: 579 errors in the root project.**
  - 223 have one shape: a handler's hand-declared argument type says `prop?: T`, and the zod
    schema's output says `prop?: T | undefined`. Example: `ActivateDomainArgs.detail` against
    `DETAIL_SHAPE`.
  - 102 more `No overload matches` errors come from the same registrations.
  - The rest pass an optional value on as `T | undefined` to an option typed `?: T`.
  - There are 247 hand-declared `…Args` types in production, 9 of them exported; 69 sites
    already use `z.output<typeof …>`.
  - The package projects are smaller: server-runtime 37 errors, compact-readonly-entries 56,
    compact-modify 14, responsible-rules 1. Every package `tsconfig.json` but six extends the
    root one; the six (background-runs-memory, http, responsible-rules, server-runtime, server,
    sse) and the test projects set their own options.
- **`unknown` is written 895 times in production code.**
  - By position: 453 parameters, 106 variables, 82 property signatures, 74 function returns, the
    rest elsewhere.
  - There are 35 type predicates.
  - Not every `unknown` is wrong: values from outside the type system are `unknown` by rule.
- **Test code holds the rest.** Counts from the syntax tree; `any` includes the `any` of `as any`:

  | Area | `as T` | `as unknown as` | `as never` | `as any` | `any` | `!` | ts-expect-error | regex literals |
  |---|---|---|---|---|---|---|---|---|
  | root test files | 599 | 204 | 310 | 944 | 1,744 | 80 | 92 | 356 |
  | root helpers and testers | 73 | 15 | 11 | 7 | 80 | 5 | 0 | 20 |
  | server-runtime tests and helpers | 126 | 61 | 60 | 10 | 22 | 28 | 0 | 27 |
  | other packages' tests | 83 | 30 | 95 | 0 | 8 | 0 | 6 | 31 |

  - The testers are `HighTester` and `LambdaTester` (`src/__tests__/integration/helpers/testers/`).
    There is no `BaseTester`.
  - The `any` in the infrastructure sits in the testers, `configHelpers`, `persistenceHelpers`,
    `sharedObjects`, `sessionHelpers`, `testHelpers`, `adtStandIn`, `fakeClient` and
    `recordingConnection`.
  - The fixtures under `__fixtures__` are wrong on purpose: a scan reads them and must refuse
    them.
- **The gates today.**
  - Biome has `noExplicitAny`, `noImplicitAnyLet` and `noUnsafeTypeAssertion` as errors in
    production. They are off for every test file, and off for `noUnsafeTypeAssertion` in the
    two BLOCKED files.
  - `staticTypes.test.ts` (`typeEscapeScan.ts`) covers `src`, `scripts` and each package's
    `src`, but not `tools` and not any `bin`.
  - `noRegexOverInput.test.ts` covers every git-tracked production source, `tools` and `bin`
    included.

## 2. The upstream contract: `makeAdtRequest` stops taking the caller's `T`

- **The change.** interfaces-adt-connection's `IAbapConnection.makeAdtRequest` becomes
  `makeAdtRequest(options: IAbapRequestOptions): Promise<IAdtWireResponse>`.
  - `IAdtWireResponse<T = unknown, D = unknown>` itself stays generic, for a caller that types
    an answer it has read.
  - `data` arrives as `unknown`, and the caller reads it. This is already how every reader in
    this server treats an answer.
- **Who breaks, in each direction** (checked with the compiler).
  - A generic implementation is assignable to the new non-generic signature. So connection's
    `AbstractAbapConnection` and adt-clients' `AdtBatchConnection` conform as they are.
  - A non-generic connection is **not** assignable to the old generic `IAbapConnection`
    (`unknown` is not assignable to a caller's `T`). Every package whose public signatures
    take an `IAbapConnection`, so that this server can hand its non-generic views to them, must
    therefore name interfaces-adt-connection 5: adt-clients (`AdtClient`'s constructor,
    `createAdtClient`) and adt-strategies.
  - For their callers this is no break. Any connection their callers can hold today is generic,
    and a generic connection is assignable to the v5 parameter. So a range move to `^5.0.0`
    is a minor for each of them.
  - Only code that passes type arguments to `makeAdtRequest` on an `IAbapConnection` stops
    compiling, which makes interfaces-adt-connection's change a major.
- **Releases, in dependency order.** Each is published before the next takes it from the
  registry, and one copy of interfaces-adt-connection is left in each consumer's tree:
  1. **interfaces-adt-connection 5.0.0** (major: the type parameters go).
  2. **interfaces-adt** (minor): the range moves to `^5.0.0`. `IAdtError.response` names
     `IAdtWireResponse`, whose shape does not change.
  3. **adt-clients and adt-strategies** (minor): ranges to `^5.0.0`.
     - `activationUtils.ts` and `tools/header-probe` drop their pass-through `<T, D>`.
     - `AdtBatchConnection.makeAdtRequest` keeps its signature.
     - This fits the adt-clients / interfaces-adt minors already coming into this release
       (verdict-session, mcp-abap-adt-clients#310, not merged). The change goes into that PR's
       release.
  4. **connection 23.1.0** (minor), the release after 23.0.0, which is published: the range
     moves to `^5.0.0`.
     - Its generic `makeAdtRequest` keeps its signature, so no caller of connection breaks.
     - The `as unknown as` inside it is connection's own code, outside this goal (the server's).
  5. **This server** takes the four from the registry.
     - It drops the `<T, D>` of its five pass-throughs.
     - It makes its three views non-generic, so the three assertions go.
     - It deletes `BLOCKED` and the Biome override for the two files.
- **No package of ours is linked locally.** Each consumer waits for its dependency's
  publication.

## 3. `exactOptionalPropertyTypes`

- **Where it turns on.**
  - The root `tsconfig.json`, which every package config extending it inherits.
  - The six configs that do not extend it: background-runs-memory, http, responsible-rules,
    server-runtime, server and sse.
  - Their `tsconfig.test.json` files, and `tsconfig.node-test.json`.
  - Production first, then tests (§7).
- **Handler arguments come from the schema.** 247 hand-declared `…Args` types are a handler's
  `args` parameter (`(context: HandlerContext, args: X)`; Measured). Each becomes
  `z.output<typeof TOOL_DEFINITION.inputSchema>`, or the zod schema it is built from. That
  leaves one source, so the 223 mismatches and the 102 overload errors cannot drift back.
  - Where a handler reads a key its schema does not declare, the key is declared in the
    schema, as in the earlier spec §3.
  - The handlers that `@mcp-abap-adt/lib/handlers`, `/read` and `/write` export change their
    `args` type with it: optional properties read `?: T | undefined`. That widens what a caller
    may pass, so nothing breaks, but it is an exported change (§8).
- **The 8 other `…Args` types are helper contracts, not tool arguments**, and keep their
  declarations: `HandlerGetArgs`, `ResultOnceArgs`, `RunTargetArgs`, `UnitTestScopeArgs`,
  `StartArgs` (already a `z.output`), `ToolArgs`, `SourceRangeArgs` and `SearchObjectsArgs`.
  `ScheduleProfilerTraceArgs`, exported through `/write`, is a handler argument.
  - A helper contract's optional fields are declared `?: T | undefined` where a caller passes
    a possibly absent value.
- **The rest, by direction of the value.**
  - An option the server itself defines and receives as possibly absent is declared
    `?: T | undefined`. This holds for the embeddable options, debugger and compact inputs,
    and strategy configs.
  - A value handed to a type of another package that says `?: T` is passed with a conditional
    spread (`...(value !== undefined && { key: value })`). No cast, and nothing fakes the
    type's contract.
  - **Our published contracts widen instead** (Measured: of the 579 root errors, 104 meet a
    type declared in interfaces-adt and 22 one in adt-clients).
    - interfaces-adt: the configs of `create` (35), `update` (30), `validate` (15),
      `updateMetadata` (11) and `check` (7); `IDebuggerIdentity`, `IAdtError`, `IAnalyse`,
      `getActivationRun` and `getVirtualFoldersContents`.
    - adt-clients: the runtime readers' options (`read`, `gatewayErrors`, `systemMessages`,
      `run`, `dumps`), `IDomainChanges`, `IDataElementChanges`, `ITableTypeChanges`,
      `patchFunctionGroupDocument` and `patchPackageDocument`.
    - Each of their optional fields becomes `?: T | undefined`. A field that is absent and one
      that is `undefined` mean the same to them, and interfaces-auth already declares its
      fields so.
    - Widening breaks no caller: these are minors, and they ride in §2's interfaces-adt and
      adt-clients releases.
  - The 14 sites that meet TypeScript's own library types (`Array.push`, `Promise`, `Set`) or
    `@types/node` pass a defined value, narrowed in plain code first.
- **The RFC `url?: never` hole closes.**
  - With the option on in the production compile, `{ …rfc, url: undefined }` no longer
    compiles against `ISapRfcLogon`.
  - The construction scan (`configConstructionScan.ts`) keeps its own program. Its known limit
    on a merged `never & undefined` is re-measured under the option, and is either removed with
    its fixture or kept and named.

## 4. The `unknown` audit

- **Method: the compiler decides, site by site, by where the value comes from.**
  - A script on the compiler's language service finds every in-repository source of each
    production `unknown`: a parameter's call sites; a variable's initializer and assignments; a
    function's return expressions; a property's writers.
  - It types each source with the type checker.
  - It follows a source that is itself an `unknown` variable or parameter back to that one's
    sources, so an internal value laundered through an `unknown` is seen.
  - **A boundary** is a value from outside the type system, by its origin, not by its type: a
    `catch` binding; `JSON.parse`; the XML parser; `process.env`; a file read; a network
    answer's `data`; a tool argument before its schema; a value a third-party contract types
    `unknown`. A boundary value narrowed in plain code stays boundary data.
- **Classes and what each becomes:**

  | Class | Origin of every source | Becomes |
  |---|---|---|
  | boundary | a boundary | stays `unknown`; read in plain code |
  | typed | a contract-typed value of the repository, none a boundary | retyped by that contract; its hand narrowing goes |
  | mixed | both | split: a reader for the boundary and a typed function for the rest, or a union of the contract types it really receives |
  | sink | a value of any type, by the contract that names it (the `ILogger` methods, a serializer of an arbitrary value) | stays `unknown`, named in the gate's fixture of sinks by its contract |
  | callback | called only by a contract outside the repository (a library hook, `catch`) | that contract's parameter type |

- **Inventory** (Measured; the full lists are in the appendix).
  - Parameters, root project 342: 169 boundary by their immediate sources, 68 with no
    in-repository call (callbacks and entries), 32 typed, 73 mixed.
  - Parameters, server-runtime 27: 23 boundary, 3 callbacks, 1 typed.
  - Parameters, compact-readonly-entries 2 (1 typed); compact-modify 1.
  - Variables declared `unknown`: 7 with a typed initializer, 26 with a boundary one, 17
    without one.
  - Functions returning `unknown`: 4 whose every return is typed, 40 others.
  - Properties typed `unknown`: 64.
  - The remaining positions write `unknown` inside a type (`Record<string, unknown>`,
    `unknown[]`, a function type). They follow the site they type.
  - The 169 + 23 parameters that are boundary by their immediate sources are rechecked by the
    transitive rule above. Any that the rule finds typed join the typed class in the plan's
    first step, which commits the script and its output.
- **Contracts typed `unknown`.** A value a contract of ours types `unknown`, while its producer
  has a concrete type, is a contract to fix where it lives (§2's order). A value a third party
  types `unknown` stays a boundary.
- **The gate is the script, run as a source test over the code as it is.**
  - It refuses a site of the typed class, and a mixed site not yet split.
  - It refuses a sink not named in the fixture of sinks. Sinks are named by their contract
    (`ILogger`), not by site.
  - Boundaries and callbacks pass.

## 5. The test infrastructure

- **The owner's decision: the test infrastructure's `any` goes.** The infrastructure is
  everything under `src/__tests__/helpers/`, every `__tests__/**/helpers/` directory, and
  `testers/` (`HighTester`, `LambdaTester`). It holds 80 + 22 `any` today (Measured), in the
  testers, `configHelpers`, `persistenceHelpers`, `sharedObjects`, `sessionHelpers`,
  `testHelpers`, `adtStandIn`, `fakeClient` and `recordingConnection`.
- **How each is replaced** (no cast replaces a cast):
  - parsed YAML (`configHelpers`) is read through a zod schema of the test config;
  - a fake connection implements `IAbapConnection`, which with §2 is a plain non-generic
    `makeAdtRequest`;
  - a fake client implements the contract it stands for, or the `Pick` of it that the code
    under test is typed to take;
  - a `HandlerContext` is built by one typed builder;
  - the testers take their arguments typed by the handler they drive (`z.output` of its
    schema).
- **The other assertions in test code stay in this release.** These are `as T`,
  `as unknown as`, `as never`, `!` and `@ts-expect-error`, in test files and in the
  infrastructure.
  - Many of them build a deliberately wrong value, to prove a runtime check at a boundary, or
    prove a refusal of the compiler.
  - The goal binds `any` alone in tests, and this spec adds no rule beyond it. What remains is
    counted in the acceptance (§9).
- **Regex in test code is not gated:** the owner's rule covers production code.
- **Fixtures** under `__fixtures__` stay wrong. Every scan excludes them by path, and each has
  its own test that the scan refuses it.

## 6. The gate

- **TypeScript.** `exactOptionalPropertyTypes` is in every config listed in §3. The build and
  `test:check` fail on any error.
- **Biome.**
  - In production: `noExplicitAny`, `noImplicitAnyLet` and `noUnsafeTypeAssertion` are errors.
    The BLOCKED override is removed once §2 lands.
  - In the test infrastructure (§5): `noExplicitAny` and `noImplicitAnyLet` are errors. The
    test override no longer turns them off for those directories.
  - `lint:check` and the build's check name the same directories.
- **The source scan (`staticTypes.test.ts`).**
  - It reads the same files the regex scan reads (`regexScan.ts` `productionSources()`): every
    git-tracked `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs` of the root `src`, `scripts` and
    `tools`, and of each package's `src`, `bin`, `scripts` and `tools`, outside tests, fixtures
    and docs.
  - On those it refuses every rule of today.
  - On the test infrastructure it refuses `any`.
  - It has no allow-list once §2 lands.
- **Fixtures prove each refusal,** as today: a refused file per rule, a clean file, and a
  refused `.mjs` under `tools` and in a `bin`.
- **The unknown audit** (§4) runs as a source test.

## 7. Order of work, each step green before the next

1. **Upstream (§2, §3's widened contracts)**, released in dependency order. Steps 2 to 5 do not
   wait for it. Only steps 3's upstream sites and 6 do.
2. **The scan's coverage** widened (§6), with its fixtures. It passes at once: Measured, 0
   escapes in `tools` and `bin` today.
3. **`exactOptionalPropertyTypes`** in every config at once.
   - The test configs inherit it from the root config, so production and test errors are
     fixed in the same step, with no config overriding it in between.
   - Handler arguments come from the schema first; then the rest by directory. Sites that
     meet an upstream contract wait for its release, and until then the step's commits keep
     the option off.
   - Then the RFC scan is re-measured.
4. **The `unknown` audit (§4).**
5. **The test infrastructure's `any` (§5).**
6. **The upstream releases taken from the registry.** BLOCKED, the override and the
   pass-through type arguments go.
7. **The gate last (§6).** It must pass with no exception.

## 8. Semver

- **This server: 24.0.0 for every package,** as already planned. This work adds the following
  exported changes, each in the 24.0.0 CHANGELOG entry.
  - **Handler arguments.** The `args` type of every handler that `/handlers`, `/read` and
    `/write` export becomes its schema's output. Optional properties read `?: T | undefined`,
    which widens what a caller may pass. `ScheduleProfilerTraceArgs` (exported by `/write`) is
    one of them.
  - **Shared contracts** that are exported from a package entry and that §3's sites meet:
    `HandlerContext` (`/tool-set`), `IAdtSystemContext` and `ValidationReading` (`/utils`),
    `RequestContext` and `SystemContextResolver` (`/request-context`). Their optional fields
    become `?: T | undefined`, which widens: a caller still compiles, a reader already handled
    absence. The other local types §3 retypes are not exported from a package entry (Measured
    against the entries of `package.json` `exports`).
  - **The connection type.** Every exported signature that names `IAbapConnection` names
    interfaces-adt-connection 5's. A caller holding a generic connection still compiles.
    Noted in `MIGRATION-24.0.md`.
- **Upstream:**
  - interfaces-adt-connection 5.0.0 (major);
  - interfaces-adt and adt-strategies minors, adt-clients minor in #310's release (ranges and
    §3's widening);
  - connection 23.1.0 (minor).

## 9. Tests and acceptance

- **A defect the types reveal is fixed with a test that fails before the fix.** This holds in
  §3 and §4 above all: a `T | undefined` that reached a callee that assumed `T`. Every other
  answer stays as it is.
- **What stays as it is:** every existing test passes; the listed-schema and surface fixtures
  stay unchanged; the tool counts stay unchanged.
- **Acceptance:**
  - the goal's measurement, rerun with the compiler API, reports 0 for every production column,
    and 0 `any` in the test infrastructure. The test files' other columns are reported as they
    stand;
  - every project compiles with `exactOptionalPropertyTypes`;
  - the unknown audit refuses nothing: every site is boundary, callback or a named sink;
  - Biome and the scan have no override for production and no allow-list. The test override
    remains for the rules §5 leaves to tests; the infrastructure's `any` rules are on;
  - CI is green on every OS.
- **Live runs:** the read-only and CRUD suites on premise and cloud, once at the end, as in the
  earlier spec. The changed areas are the handler arguments, the debugger and the compact
  inputs.

## Appendix: the `unknown` inventory (Measured)

Each site is listed as `file:line`, together with the static types of the in-repository values that reach it (the language service's call sites and the type checker). §4 decides what each class becomes.

### Parameters, typed only: retyped by the types that reach them (unless a listed sink)

| Site | Types that reach it |
|---|---|
| `src/lib/logger.ts:23` | object |
| `src/lib/logger.ts:39` | { level: string; timestamp: string; message: string; } \| { level: string; timestamp: string; handler: string; step: s |
| `src/lib/state/InstanceState.ts:192` | string \| undefined |
| `src/lib/adtHeaders/withAdtHeaders.ts:101` | T |
| `src/lib/connectionFactory.ts:214` | {} \| null \| R & ({} \| null) |
| `src/lib/connectionFactory.ts:223` | Record<string, string> |
| `src/lib/debugger/readings.ts:274` | string \| undefined |
| `src/lib/strategies/projections.ts:215` | {} |
| `src/lib/wireResponse.ts:31` | Element |
| `src/lib/answer.ts:76` | { cleanup?: Record<string, unknown>; result: string; } \| { c \| {} \| null |
| `src/lib/answer.ts:81` | Record<string, unknown> |
| `src/lib/answer.ts:201` | { readonly method?: string; readonly url?: string; } \| undef |
| `src/lib/strategies/packageWalk.ts:309` | Element |
| `src/lib/strategies/packageWalk.ts:318` | Element |
| `src/lib/strategies/packageWalk.ts:339` | Element |
| `src/lib/leftoverSessions/LeftoverSessions.ts:486` | string |
| `src/lib/backgroundRuns/answers.ts:18` | { run_handle: string; state: string; tool: string; object: s \| { run_handle: string; state: "finished" \| "cancelled"; tool: \| { runs: BackgroundRunListing[]; } \| { run_handle: string; state: "cancelled" \| "discarded"; } |
| `src/lib/batch/eligibility.ts:70` | {} \| null |
| `src/lib/strategies/lockAnswer.ts:31` | IHttpHeaderValue |
| `src/lib/leftoverSessions/answers.ts:16` | { sessions: LeftoverListing[]; } \| LogoffOutcome |
| `src/handlers/enhancement/readonly/handleGetEnhancements.ts:1519` | { unreadable?: FailureEntry[]; object_name: string; object_t \| { detailed: boolean; total_objects_with_enhancements: number |
| `src/handlers/transport/readonly/handleGetTransport.ts:126` | {} |
| `src/handlers/transport/readonly/handleListTransports.ts:97` | Element |
| `src/lib/getObjectsListCache.ts:10` | { isError: boolean; content: { type: string; text: string; } \| { parent_name: string; parent_tech_name: string; parent_type \| { objects: unknown[]; } \| JsonAnswer \| { isError: boolean; content: { type: string; json: { object_ |
| `src/handlers/system/readonly/handleRuntimeGetDumpById.ts:76` | string |
| `src/embeddable/BaseMcpServer.ts:244` | Readonly<Record<string, unknown>> |
| `src/embeddable/BaseMcpServer.ts:2297` | Readonly<Record<string, unknown>> |
| `src/embeddable/BaseMcpServer.ts:2312` | Readonly<Record<string, unknown>> |
| `src/handlers/common/low/handleUpdateUnderLock.ts:195` | string \| undefined |
| `src/handlers/common/low/handleUpdateUnderLock.ts:286` | string \| undefined \| "published" \| "unpublished" \| undefined \| "ODATA_V2_UI" \| "ODATA_V2_WEB_API" \| "ODATA_V4_UI" \| "ODATA_ |
| `src/handlers/data_element/low/handleUpdateDataElement.ts:99` | {} |
| `src/handlers/domain/low/handleUpdateDomain.ts:85` | {} |
| `server-runtime/src/stdio/auth/serverLogin.ts:116` | string |
| `compact-readonly-entries/src/handlers/handleHandlerGet.ts:67` | {} |

### Parameters, mixed: split at the boundary

| Site | Types that reach it |
|---|---|
| `src/lib/xml/tree.ts:16` | unknown \| {} \| undefined \| {} \| null \| Element \| readonly unknown[] \| {} |
| `src/lib/xml/tree.ts:21` | unknown \| object \| {} \| undefined \| {} \| null \| {} |
| `src/lib/xml/tree.ts:26` | unknown \| {} |
| `src/lib/xml/tree.ts:33` | readonly unknown[] \| unknown |
| `src/lib/xml/tree.ts:38` | unknown \| any \| object \| {} \| (IBreakpointCommon & NoCondition & { kind: "exception"; exce \| Error \| {} \| undefined \| IAuthProvider \| IAdtWireResponse<unknown, unknown> \| undefined \| AdtReading<unknown> \| object \| null \| {} \| null \| Readonly<Record<string, unknown>> \| Record<"update", Method> \| Element |
| `src/lib/xml/tree.ts:43` | unknown \| {} \| object \| any |
| `src/lib/xml/tree.ts:71` | unknown \| Element |
| `src/lib/xml/tree.ts:81` | unknown \| object \| Element \| object \| undefined |
| `src/lib/auth/failures.ts:205` | unknown \| StepError & MessageCarrier \| IAdtError |
| `src/lib/longTools.ts:77` | Record<string, unknown> \| unknown \| Readonly<Record<string, unknown>> |
| `src/lib/longTools.ts:139` | Readonly<Record<string, unknown>> |
| `src/lib/state/idleBound.ts:53` | number \| unknown |
| `src/lib/capability.ts:17` | unknown \| Record<"pairFor", Method> \| object \| IAbapConnection \| {} \| undefined |
| `src/lib/batch/sessionOf.ts:12` | IAbapConnection \| IAbapConnection \| undefined |
| `src/lib/adtHeaders/withAdtHeaders.ts:189` | O \| undefined |
| `src/lib/systemContextGuard.ts:41` | string |
| `src/lib/strategies/safeFields.ts:58` | unknown \| { readonly method?: string; readonly url?: string; } \| undef |
| `src/lib/strategies/safeFields.ts:100` | unknown \| Cleanup \| LeftBehind \| undefined \| Cleanup \| undefined |
| `src/lib/strategies/step.ts:19` | StepError \| unknown \| StepError & MessageCarrier |
| `src/lib/strategies/step.ts:120` | Cleanup \| LeftBehind \| undefined \| unknown |
| `src/lib/strategies/step.ts:146` | unknown \| DebugRefusedError \| DebugListenerError |
| `src/lib/strategies/step.ts:180` | object \| unknown |
| `src/lib/callTransport.ts:22` | unknown \| Readonly<Record<string, unknown>> |
| `src/lib/strategies/reading.ts:99` | string \| unknown |
| `src/lib/strategies/projections.ts:53` | unknown \| {} |
| `src/lib/strategies/projections.ts:63` | unknown \| {} \| null |
| `src/lib/debugger/failures.ts:33` | unknown \| object |
| `src/lib/debugger/failures.ts:63` | unknown \| Error \| any |
| `src/lib/debugger/failures.ts:94` | Error |
| `src/lib/utils.ts:299` | Error \| ServerRefusal \| unknown \| "SQL query is required" \| "Table name is required" \| "Data element name is required" \| "Package name is required" \| "Domain name is required" \| "Structure name is required" \| "At least one field is required" \| string \| "transport_number is required" \| "Enhancement spot is required" \| "Enhancement name is required" \| "Object name is required" \| "Give exactly one of object_name and object_type, or objects \| "Include name is required" \| "Parameter \"object_name\" (string) is required and cannot b \| "Parameter \"object_type\" (string) is required." \| "Give exactly one of package_name or package_names" \| "Give exactly one of structure_name or structure_names (a no \| "Transport number is required" \| "Parameter \"parent_name\" (string) is required and cannot b \| "Parameter \"parent_tech_name\" (string) is required and can \| "Parameter \"parent_type\" (string) is required and cannot b \| "Parameter \"node_id\" (string) is required and cannot be em \| "Give exactly one of parent_name, parent_tech_name and paren \| "Each entry of objects needs parent_type and parent_name (no \| "object_name is required" \| "Give exactly one of parent_type and parent_name, or objects \| "Each entry of objects needs object_type and object_name" \| "parent_type and parent_name are required" \| "Type name is required" \| "Object type is required" |
| `src/lib/utils.ts:983` | unknown \| {} |
| `src/lib/connectionKind.ts:11` | IAbapConnection |
| `src/lib/batch/phases.ts:87` | IAdtWireResponse<T, D> \| unknown |
| `src/lib/leftoverSessions/LeftoverSessions.ts:186` | string \| unknown |
| `src/lib/search-source/readFailure.ts:47` | IAdtWireResponse<unknown, unknown> \| undefined \| unknown |
| `src/lib/backgroundRuns/tools.ts:178` | Record<string, unknown> \| unknown |
| `src/lib/backgroundRuns/tools.ts:212` | Readonly<Record<string, unknown>> |
| `src/lib/backgroundRuns/tools.ts:223` | Readonly<Record<string, unknown>> |
| `src/lib/backgroundRuns/answers.ts:55` | string |
| `src/lib/backgroundRuns/answers.ts:89` | string |
| `src/lib/batch/batchTools.ts:49` | unknown \| { action: "end" \| "answers" \| "begin"; number?: number \| und |
| `src/lib/batch/batchTools.ts:66` | unknown \| Readonly<Record<string, unknown>> |
| `src/lib/batch/eligibility.ts:250` | Readonly<Record<string, unknown>> |
| `src/lib/batch/recorder.ts:86` | IAdtWireResponse<T, D> \| unknown |
| `src/lib/handlers/utils/handlerCall.ts:33` | Record<string, unknown> \| Readonly<Record<string, unknown>> |
| `src/lib/strategies/detail.ts:33` | { sql_query: string; row_number?: number; detail?: AnswerDet \| { table_name: string; max_rows?: number; detail?: AnswerDeta \| unknown \| CheckBehaviorDefinitionArgs \| CreateBehaviorDefinitionArgs \| DeleteBehaviorDefinitionArgs \| UpdateBehaviorDefinitionArgs \| ActivateBehaviorDefinitionArgs \| CreateBehaviorImplementationArgs \| DeleteBehaviorImplementationArgs \| UpdateBehaviorImplementationArgs \| CheckClassArgs \| CreateClassArgs \| DeleteClassArgs \| DeleteLocalDefinitionsArgs \| DeleteLocalMacrosArgs \| DeleteLocalTestClassArgs \| DeleteLocalTypesArgs \| UpdateClassArgs \| UpdateLocalDefinitionsArgs \| UpdateLocalMacrosArgs \| UpdateLocalTestClassArgs \| UpdateLocalTypesArgs \| ActivateClassArgs \| ActivateObjectArgs \| CheckDataElementArgs \| DataElementArgs \| DeleteDataElementArgs \| ActivateDataElementArgs \| CheckDdlArgs \| CreateDdlArgs \| DeleteDdlArgs \| UpdateDdlArgs \| ActivateDdlArgs \| CheckMetadataExtensionArgs \| CreateMetadataExtensionArgs \| UpdateMetadataExtensionArgs \| ActivateMetadataExtensionArgs \| CheckDomainArgs \| DomainArgs \| DeleteDomainArgs \| ActivateDomainArgs \| CheckFunctionGroupArgs \| CheckFunctionModuleArgs \| CreateFunctionGroupArgs \| CreateFunctionModuleArgs \| UpdateFunctionGroupArgs \| UpdateFunctionModuleArgs \| ActivateFunctionGroupArgs \| ActivateFunctionModuleArgs \| DeleteFunctionGroupArgs \| CreateFunctionIncludeArgs \| DeleteFunctionIncludeArgs \| UpdateFunctionIncludeArgs \| DeleteFunctionModuleArgs \| CreateIncludeArgs \| DeleteIncludeArgs \| UpdateIncludeArgs \| UpdateIncludeMetadataArgs \| ActivateIncludeArgs \| CheckInterfaceArgs \| CreateInterfaceArgs \| DeleteInterfaceArgs \| UpdateInterfaceArgs \| ActivateInterfaceArgs \| CreateMessageClassArgs \| DeleteMessageClassArgs \| GetMessageClassMessageArgs \| UpdateMessageClassArgs \| DeleteMetadataExtensionArgs \| CheckPackageArgs \| CreatePackageArgs \| DeletePackageArgs \| GetPackageArgs \| UpdatePackageArgs \| CheckProgramArgs \| CreateProgramArgs \| DeleteProgramArgs \| UpdateProgramArgs \| ActivateProgramArgs \| CreateServiceBindingArgs \| DeleteServiceBindingArgs \| UpdateServiceBindingArgs \| ValidateServiceBindingArgs \| ActivateServiceBindingArgs \| CreateServiceDefinitionArgs \| DeleteServiceDefinitionArgs \| UpdateServiceDefinitionArgs \| ActivateServiceDefinitionArgs \| CheckStructureArgs \| CreateStructureArgs \| DeleteStructureArgs \| UpdateStructureArgs \| ActivateStructureArgs \| CheckTableArgs \| CreateTableArgs \| DeleteTableArgs \| UpdateTableArgs \| ActivateTableArgs \| CheckTableTypeArgs \| CreateTableTypeArgs \| DeleteTableTypeArgs \| UpdateTableTypeArgs \| ActivateTableTypeArgs \| AddTransportObjectArgs \| CreateTransportArgs \| CreateTransportTaskArgs \| MoveTransportObjectsArgs \| RemoveTransportObjectArgs \| SortAndCompressTransportTaskArgs \| CreateCdsUnitTestArgs \| CreateFunctionGroupUnitTestArgs \| CreateProgramUnitTestArgs \| CreateUnitTestArgs \| DeleteCdsUnitTestArgs \| DeleteUnitTestArgs \| ResultOnceArgs \| GetUnitTestResultArgs \| RunCdsUnitTestArgs \| RunFunctionGroupUnitTestArgs \| RunFunctionModuleUnitTestArgs \| RunProgramUnitTestArgs \| RunUnitTestArgs \| UpdateCdsUnitTestArgs \| UpdateFunctionGroupUnitTestArgs \| UpdateProgramUnitTestArgs \| UpdateUnitTestArgs \| ListTransportsArgs \| ReadTransportActionLogArgs \| ReadTransportObjectsArgs \| { object_name: string; object_type?: string; maxResults?: nu \| GetATCFindingsArgs \| GetATCResultArgs \| { detail?: "raw" \| "terse" \| "full"; } \| GetObjectOutlineArgs \| { objecttype?: string; objectname?: string; object_type?: st \| { transaction_name: string; detail?: AnswerDetail; } \| Omit<CheckObjectArgs, "object_type"> & { object_type: "class \| { object_type: "PACKAGE" \| "DOMAIN" \| "DATA_ELEMENT" \| "TRAN \| Omit<ValidateObjectArgs, "object_type"> & { object_type: "cl \| GetVirtualFoldersArgs \| GetCdsUnitTestArgs \| GetCdsUnitTestResultArgs \| GetCdsUnitTestStatusArgs \| GetUnitTestArgs \| GetUnitTestStatusArgs |
| `src/lib/debugger/answer.ts:7` | string \| Record<string, unknown> \| unknown |
| `src/lib/debugger/answer.ts:20` | unknown \| { state_handle: string; detail?: "raw" \| "terse" \| "full" \|  \| { variable: string; state_handle: string; detail?: "raw" \| " \| { breakpoints: { class_name: string; line: number; }[]; stat \| { breakpoints: { class_name: string; line: number; }[]; deta \| { action: "over" \| "continue"; state_handle: string; detail? \| { name: string; state_handle: string; detail?: "raw" \| "ters \| { breakpoint_id: string; state_handle: string; detail?: "raw \| { watchpoint_id: string; state_handle: string; detail?: "raw \| { breakpoints: { exception_class?: string \| undefined; state \| { position: number; state_handle: string; detail?: "raw" \| " \| { name: string; value: string; state_handle: string; detail? \| { action: "detach" \| "over" \| "continue" \| "into" \| "return" \| { mode: "run" \| "jump"; object_type: string; object_name: st \| { snapshot_id: string; detail?: "raw" \| "terse" \| "full" \| u \| { from_id: string; to_id: string; detail?: "raw" \| "terse" \| \| { detail?: "raw" \| "terse" \| "full" \| undefined; user?: stri \| { state_handle?: string; } |
| `src/lib/debugger/answer.ts:60` | { breakpoints: { exception_class?: string \| undefined; state \| { action: "detach" \| "over" \| "continue" \| "into" \| "return" \| { mode: "run" \| "jump"; object_type: string; object_name: st \| { state_handle: string; detail?: "raw" \| "terse" \| "full" \|  |
| `src/lib/handlers/readPart.ts:24` | ReadPart \| undefined |
| `src/lib/strategies/activationRun.ts:301` | IAnalyse<IAdtMessageFailure> |
| `src/lib/strategies/messageClassMessage.ts:26` | unknown \| {} \| null |
| `src/lib/strategies/messageClassMessage.ts:50` | unknown \| Element |
| `src/handlers/service_binding/high/serviceBindingPayloadUtils.ts:18` | string |
| `src/lib/strategies/tableTypeStored.ts:48` | unknown \| object |
| `src/handlers/unit_test/shared/runTarget.ts:83` | unknown \| RunTargetArgs |
| `src/handlers/unit_test/shared/runTarget.ts:166` | unknown \| StartUnitTestRunArgs |
| `src/handlers/unit_test/shared/runner.ts:26` | RunFunctionGroupUnitTestArgs \| RunFunctionModuleUnitTestArgs \| RunProgramUnitTestArgs \| RunUnitTestArgs \| StartUnitTestRunArgs |
| `src/handlers/unit_test/shared/runner.ts:54` | unknown \| RunCdsUnitTestArgs |
| `src/handlers/unit_test/shared/runner.ts:69` | RunFunctionGroupUnitTestArgs \| RunFunctionModuleUnitTestArgs \| RunProgramUnitTestArgs \| RunUnitTestArgs |
| `src/handlers/system/readonly/handleGetTransaction.ts:37` | {} \| null |
| `src/handlers/system/readonly/handleGetTypeInfo.ts:95` | unknown \| {} |
| `src/handlers/system/readonly/runtimePayloadParser.ts:12` | string |
| `src/handlers/system/readonly/handleRuntimeListFeeds.ts:606` | Error \| unknown |
| `src/lib/debugger/ownConnectionTools.ts:102` | Readonly<Record<string, unknown>> |
| `src/embeddable/BaseMcpServer.ts:1992` | ServerRefusal \| unknown |
| `src/handlers/common/low/handleCreateOnly.ts:206` | unknown \| string \| undefined |
| `src/handlers/common/low/handleUpdateUnderLock.ts:188` | unknown \| string \| string \| undefined |
| `src/handlers/common/low/handleUpdateUnderLock.ts:192` | string \| undefined \| unknown |
| `src/handlers/common/low/handleDeleteOnly.ts:58` | string \| undefined \| unknown |
| `src/lib/propertyBag.ts:18` | unknown \| {} \| undefined |
| `src/lib/propertyBag.ts:28` | unknown \| {} |
| `src/lib/config/authParameters.ts:442` | unknown \| Record<string, unknown> |

### Variables declared `unknown` with a typed initializer: retyped

| Site | Initializer type |
|---|---|
| `src/lib/requestSystemResolution.ts:156 user` | string \| undefined |
| `src/lib/credentialSources.ts:39 value` | string \| undefined |
| `src/lib/credentialSources.ts:56 authType` | SapAuthType |
| `src/embeddable/BaseMcpServer.ts:2836 register` | ("registerTool" extends keyof this ? this[keyof this & "regi |
| `src/lib/config/authParameters.ts:156 node` | Record<string, unknown> |
| `server-runtime/src/stdio/auth/vocabulary.ts:70 authType` | "basic" \| "jwt" \| "saml" \| "snc" \| undefined |
| `server-runtime/src/stdio/auth/vocabulary.ts:80 grantType` | DestinationGrant \| undefined |

### Functions returning `unknown` whose every return is typed: retyped

| Site | Returned types |
|---|---|
| `src/lib/search-source/readFailure.ts:121` | object \| DecidedPrimitive |
| `src/lib/batch/eligibility.ts:201` | {} \| null |
| `src/lib/propertyBag.ts:9` | {} \| undefined |
| `server-runtime/src/http/StreamableHttpServer.ts:152` | { jsonrpc: string; id: {} \| null; result: { conten |

### Properties typed `unknown`: each checked by its writers (§4)

- `src/lib/xml/tree.ts:93 Visit.node`
- `src/lib/batch/InstanceBatch.ts:64 (literal).value`
- `src/lib/batch/InstanceBatch.ts:65 (literal).error`
- `src/lib/adtHeaders/withAdtHeaders.ts:113 (literal).error`
- `src/lib/systemInformation.ts:69 (literal).status`
- `src/lib/systemInformation.ts:69 (literal).data`
- `src/lib/strategies/safeFields.ts:22 (literal).request`
- `src/lib/strategies/step.ts:33 StepThrew.cleanup`
- `src/lib/strategies/step.ts:34 StepThrew.operation`
- `src/lib/xml/ordered.ts:83 OrderedElement.member`
- `src/lib/debugger/readings.ts:447 (literal).data`
- `src/lib/debugger/amdpReadings.ts:242 (literal).data`
- `src/lib/strategies/projections.ts:103 (literal).checklist`
- `src/lib/answer.ts:69 (literal).json`
- `src/lib/answer.ts:453 (literal).content`
- `src/lib/answer.ts:476 (literal).content`
- `src/lib/answer.ts:478 (literal).content`
- `src/lib/debugger/AmdpSession.ts:151 (literal).data`
- `src/lib/utils.ts:703 (literal).data`
- `src/lib/utils.ts:733 (literal).data`
- `src/lib/batch/phases.ts:70 (literal).error`
- `src/lib/batch/phases.ts:192 (literal).error`
- `src/lib/batch/phases.ts:299 (literal).error`
- `src/lib/strategies/packageWalk.ts:158 (literal).error`
- `src/lib/strategies/packageWalk.ts:264 (literal).data`
- `src/lib/strategies/sqlPreview.ts:75 SqlPreview.document`
- `src/lib/batch/execute.ts:141 (literal).error`
- `src/lib/batch/execute.ts:142 (literal).error`
- `src/lib/batch/execute.ts:220 (literal).error`
- `src/lib/toolResult.ts:9 ToolContentItem.json`
- `src/lib/toolResult.ts:10 ToolContentItem.text`
- `src/lib/batch/answers.ts:30 (literal).number`
- `src/lib/batch/answers.ts:30 (literal).numbers`
- `src/handlers/system/readonly/handleGetSqlQuery.ts:39 SqlQueryResponse.document`
- `src/lib/strategies/withLock.ts:34 (literal).thrown`
- `src/lib/strategies/withLock.ts:150 (literal).thrown`
- `src/lib/strategies/activationRun.ts:89 (literal).analyse`
- `src/lib/strategies/activationRun.ts:93 (literal).analyse`
- `src/lib/strategies/activationRun.ts:97 (literal).analyse`
- `src/lib/strategies/activationRun.ts:142 (literal).parsed`
- `src/lib/strategies/messageClassMessage.ts:20 ClassMessage.element`
- `src/handlers/unit_test/shared/resultOnce.ts:22 ResultOnceArgs.run_id`
- `src/handlers/enhancement/readonly/handleGetEnhancements.ts:1318 (literal).error`
- `src/handlers/enhancement/readonly/handleGetEnhancements.ts:1534 (literal).thrown`
- `src/handlers/enhancement/readonly/handleGetEnhancements.ts:1665 (literal).thrown`
- `src/handlers/enhancement/readonly/handleGetEnhancements.ts:1758 (literal).object_name`
- `src/handlers/enhancement/readonly/handleGetEnhancements.ts:1758 (literal).object_type`
- `src/handlers/structure/readonly/handleGetStructuresList.ts:555 (literal).lastErr`
- `src/lib/getObjectsListCache.ts:8 ObjectsListCache.cache`
- `src/handlers/search/readonly/handleGetObjectsList.ts:192 Thrown.thrown`
- `src/lib/search-source/orchestrator.ts:258 (literal).error`
- `src/handlers/system/readonly/handleGetObjectInfo.ts:238 Thrown.thrown`
- `src/handlers/system/readonly/handleGetWhereUsed.ts:602 (literal).object_name`
- `src/handlers/system/readonly/handleGetWhereUsed.ts:602 (literal).object_type`
- `src/lib/strategies/feedVariants.ts:35 (literal).data`
- `src/handlers/common/low/handleDeletionCheck.ts:26 (literal).object_type`
- `src/handlers/common/low/handleDeletionCheck.ts:26 (literal).object_name`
- `src/handlers/common/readonly/handleGetActivationRun.ts:30 ActivationRunArgs.run_id`
- `src/handlers/common/readonly/handleGetActivationRun.ts:35 ActivationStatusArgs.with_long_polling`
- `src/lib/checkRunParser.ts:37 (literal).data`
- `src/lib/config/authParameters.ts:166 RemovedHit.value`
- `src/lib/httpTransport/dnsRebindingProtection.ts:17 (literal).body`
- `src/lib/httpTransport/dnsRebindingProtection.ts:28 (literal).body`
- `server-runtime/src/http/StreamableHttpServer.ts:338 (literal).error`
