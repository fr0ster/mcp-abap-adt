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

- **Method: the compiler decides, site by site.** A script on the compiler's language service
  finds every in-repository call of each production function with an `unknown` parameter. For
  each call it reads the argument's type with the type checker.
- **Inventory** (Measured, root project, 342 `unknown` parameters):

  | Class | Count | Meaning | Decision |
  |---|---|---|---|
  | boundary only | 169 | every argument is itself `unknown` or `any` | stays `unknown`; read in plain code |
  | no in-repository call | 68 | callbacks a library calls (`catch`, a contract's hook), or entries called from outside | each is checked against the contract that calls it: `unknown` where that contract says so, else that contract's type |
  | typed only | 32 | every argument has a contract type | retyped by that contract, and the hand narrowing goes |
  | mixed | 73 | typed and `unknown` arguments | split: a reader for the boundary, a typed function for the rest; or a union of the contract types it really receives |

  - The typed-only sites sit mostly in `src/lib/strategies`, `leftoverSessions`,
    `handlers/transport` and `handlers/common`. The mixed ones sit mostly in `src/lib/strategies`
    (14), `src/lib/xml` (8), `debugger` (7), `batch` (6) and `backgroundRuns` (5).
  - A sink whose contract accepts any value stays `unknown` and is listed as such: the
    `ILogger` methods (`logger.ts:23`, `:39` among the typed-only sites) and a serializer of
    an arbitrary value.
- **The rest.** The other 111 `unknown` parameters (server-runtime and the package projects) and
  the 442 `unknown` variables, properties, returns and other positions follow the same classes,
  by the value's origin. The plan lists them per file before the work starts.
- **Contracts typed `unknown`.** A value that a contract of ours types `unknown`, while its
  producer has a concrete type, is a contract to fix where it lives (§2's order). A value a
  third party types `unknown` stays a boundary.
- **The gate is the same script, run as a source test.** It refuses a typed-only site that is
  not a listed sink. A mixed site is refused until it is split. It reads the code as it is, so
  no list of sites is committed.

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
  exported changes, each in the 24.0.0 CHANGELOG entry:
  - the `args` type of every handler that `/handlers`, `/read` and `/write` export, among them
    `ScheduleProfilerTraceArgs`, becomes its schema's output (`?: T | undefined`; widening);
  - the server's own exported option types widen to `?: T | undefined` where §3 retypes them;
  - every exported signature that names `IAbapConnection` names interfaces-adt-connection 5's.
    A caller holding a generic connection still compiles, and the change is noted in
    `MIGRATION-24.0.md`.
- **Upstream:**
  - interfaces-adt-connection 5.0.0 (major);
  - interfaces-adt and adt-strategies minors, adt-clients minor in #310's release
    (ranges, §3's widening);
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
  - the unknown audit's list holds only class 1;
  - Biome and the scan have no override and no allow-list;
  - CI is green on every OS.
- **Live runs:** the read-only and CRUD suites on premise and cloud, once at the end, as in the
  earlier spec. The changed areas are the handler arguments, the debugger and the compact
  inputs.
