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
- **Who breaks.** Only a caller that passes type arguments to `makeAdtRequest` on an
  `IAbapConnection` stops compiling.
  - An implementation that stays generic still conforms: a generic method is assignable to the
    non-generic signature.
  - A caller that hands a connection to a function taking `IAbapConnection` still compiles,
    since a generic one is assignable.
- **Releases, in dependency order, each published before the next takes it from the registry:**
  1. **interfaces-adt-connection 5.0.0** (major: the type parameters go).
  2. **interfaces-adt**: the dependency range moves to `^5.0.0`. Its own surface does not change,
     so it is a minor.
  3. **adt-clients and adt-strategies.** Their ranges move to `^5.0.0`.
     - `activationUtils.ts` and `tools/header-probe` drop the pass-through `<T, D>`.
     - `AdtBatchConnection.makeAdtRequest` stays generic: it still conforms, and a caller of it
       is not broken.
     - So this is a minor. It fits the adt-clients / interfaces-adt minor already coming into
       this release (verdict-session, mcp-abap-adt-clients#310). That PR is not merged yet, so
       the change goes into it or into the release cut from it.
  4. **connection.** Its range moves to `^5.0.0`. Its generic `makeAdtRequest`, and the
     assertion inside it, may stay or go; that is connection's own decision, outside this goal.
     - 23.0.0 is tagged and not published, and tags are immutable. So the range bump goes into
       the release after 23.0.0.
     - Both are released in this server's release; the server takes whichever of them carries
       the bump.
  5. **This server** takes all four from the registry. It then drops the `<T, D>` of its five
     pass-throughs, makes its three views non-generic (the three assertions go), and deletes
     `BLOCKED` and the Biome override for the two files.
- **No package of ours is linked locally.** Each consumer waits for its dependency's
  publication.

## 3. `exactOptionalPropertyTypes`

- **Where it turns on.**
  - The root `tsconfig.json`, which every package config extending it inherits.
  - The six configs that do not extend it: background-runs-memory, http, responsible-rules,
    server-runtime, server and sse.
  - Their `tsconfig.test.json` files, and `tsconfig.node-test.json`.
  - Production first, then tests (§7).
- **Handler arguments come from the schema.** Each hand-declared `…Args` type becomes
  `z.output<typeof TOOL_DEFINITION.inputSchema>`, or the zod schema it is built from. That
  leaves one source, so the 223 mismatches and the 102 overload errors cannot drift back.
  - The 9 exported `…Args` names stay, as aliases of their schema's output. Their optional
    properties then read `?: T | undefined`. That widens, for callers too, so these are
    exported types that change, noted in §8.
  - Where a handler reads a key its schema does not declare, the key is declared in the
    schema, as in the earlier spec §3.
- **The rest, by direction of the value.**
  - An option the server itself defines and receives as possibly absent is declared
    `?: T | undefined`. This holds for the embeddable options, debugger and compact inputs,
    and strategy configs.
  - A value handed to a type of another package that says `?: T` is passed with a conditional
    spread (`...(value !== undefined && { key: value })`). No cast, and nothing fakes the
    type's contract.
  - If such a type of ours (interfaces-*, adt-clients, connection) is too narrow, it is fixed
    there (§2's order) and is listed in the plan before its use.
- **The RFC `url?: never` hole closes.**
  - With the option on in the production compile, `{ …rfc, url: undefined }` no longer
    compiles against `ISapRfcLogon`.
  - The construction scan (`configConstructionScan.ts`) keeps its own program. Its known limit
    on a merged `never & undefined` is re-measured under the option, and is either removed with
    its fixture or kept and named.

## 4. The `unknown` audit

- **Method: the compiler decides, site by site.** A script on the compiler API classifies every
  production `unknown` it finds as a declared type (parameter, variable, property, return).
  1. **Boundary.** The value comes from outside the type system, by its own source: a `catch`
     binding; `JSON.parse`; the XML parser; `process.env`; a file read; a network answer's
     `data`; a tool argument before its schema; a value a contract itself types `unknown`.
     It stays `unknown`, and is read in plain code.
  2. **Typed source.** Every in-repository source of the value (each call site's argument, each
     assignment), as the type checker types it, is a contract type other than `unknown` or
     `any`. It is retyped by that contract, and its hand narrowing goes (rule "no cast replaces
     a cast").
  3. **Mixed.** Some sources are typed and some are boundaries. The function is split: a
     reader for the boundary, and a typed function for the rest. Or it takes a union of the
     contract types it really receives.
- **Deliverables.** The plan carries the script's list as it stands before the work. Each class 2
  and 3 site is fixed in the plan's steps. The list is rerun at the end, and every site left
  must be class 1.
- **Not gated mechanically.** Whether a value has a contract type depends on its callers, which
  a syntax scan cannot see, and a whole-program check would make every new helper's first
  caller a gate. The final list is committed as a test fixture of the audit script, so any new
  `unknown` site fails until it is classified. The gate is the review of that classification,
  not a heuristic.

## 5. The test infrastructure

- **Helpers and testers are typed.** Everything under `__tests__/**/helpers/`, `testers/` and
  `src/__tests__/helpers/` holds no `any`, no type assertion but `as const`, no `!`, no
  `@ts-ignore` / `@ts-expect-error`. These are the shared stand-ins every test builds on.
  - **Typed stand-ins** replace the casts:
    - a fake `IAbapConnection` implements the interface (with §2, a plain non-generic
      `makeAdtRequest`);
    - a fake client implements the contract it stands for, or a `Pick` of it that the code
      under test is typed to take;
    - a `HandlerContext` is built by one typed builder.
  - **Parsed YAML** in `configHelpers` is read through the server's `src/lib/xml/tree` readers or
    a zod schema of the test config, never as `any`.
  - `HighTester` and `LambdaTester` take their parameters typed by the handler they drive
    (`z.output` of its schema).
- **Test files follow, in this release.** `any`, `as any`, `as unknown as`, `as never`, other
  `as T`, `!` and suppression directives leave the test files too.
  - A test that hands a deliberately wrong value to a typed function does it through one typed
    seam: a `wrongValue<T>()` helper whose parameter is typed `unknown`, where the wrongness is
    the point. The seam is the single named exception, and it is gated: callable only from
    test files, never from helpers or production.
  - A `@ts-expect-error` that proves the compiler refuses a value moves to a `*.typecheck.ts`
    file, which the test tsconfig excludes and a type-check of its own runs. The scan does not
    read those files, as today.
- **Fixtures** under `__fixtures__` stay wrong. Every scan excludes them by path, and each has
  its own test that the scan refuses it.
- **Regex in tests is not gated.** The owner's rule covers production. New and touched test
  code prefers plain string code, and no regex reads a server's or SAP's answer in a new
  assertion.

## 6. The gate

- **TypeScript.** `exactOptionalPropertyTypes` is in every config listed in §3. The build and
  `test:check` fail on any error.
- **Biome.**
  - `noExplicitAny`, `noImplicitAnyLet` and `noUnsafeTypeAssertion` are errors for every
    production directory and every test file.
  - The test override that turns them off is removed. The BLOCKED override is removed once §2
    lands.
  - `lint:check` and the build's check name the same directories.
- **The source scan (`staticTypes.test.ts`).**
  - It covers every git-tracked source the regex scan covers: root `src`, `scripts`, `tools`,
    each package's `src` and `bin`, `.ts`, `.js`, `.mjs` and `.cjs`.
  - It adds the test trees, all files but `__fixtures__` and `*.typecheck.ts`. In test files
    the `wrongValue` helper is the single allowed seam, matched by its declaration, not by
    name.
  - It has no allow-list once §2 lands.
- **Fixtures prove each refusal,** as today: a refused file per rule, a clean file, and fixtures
  for `tools` (a `.mjs`) and a `bin`.
- **The unknown audit** (§4) runs as a test over its committed classification.

## 7. Order of work, each step green before the next

1. Upstream (§2), released in dependency order. The server's own steps 2 to 6 do not wait for
   it; only the BLOCKED removal does.
2. The scan's coverage widened to `tools` and `bin` (§6), with its fixtures. It must pass at
   once: Measured, 0 escapes there today.
3. `exactOptionalPropertyTypes` in production: handler arguments from the schema, then the rest
   by directory, then the RFC scan re-measured.
4. The `unknown` audit (§4).
5. The test infrastructure (§5): helpers and testers first, then the test files, by directory.
   Then the option on in the test configs.
6. The upstream releases taken from the registry. BLOCKED, the override and the pass-through
   type arguments go.
7. The gate last (§6). It must pass with no exception.

## 8. Semver

- **This server: 24.0.0 for every package,** as already planned. This work adds the following
  exported changes:
  - the 9 exported `…Args` types become schema outputs (`?: T | undefined`);
  - exported option types widen to `?: T | undefined` where §3 retypes them;
  - `IAbapConnection` from interfaces-adt-connection 5 in every exported signature that names
    a connection.

  Each one goes into the 24.0.0 CHANGELOG entry, and a breaking one also into
  `MIGRATION-24.0.md`.
- **Upstream:** interfaces-adt-connection 5.0.0 (major). interfaces-adt, adt-clients and
  adt-strategies take minors; adt-clients' fits #310's release. connection takes the release
  after 23.0.0 (§2).

## 9. Tests and acceptance

- **A defect the types reveal is fixed with a test that fails before the fix.** This holds in
  §3 and §4 above all: a `T | undefined` that reached a callee that assumed `T`. Every other
  answer stays as it is.
- **What stays as it is:** every existing test passes; the listed-schema and surface fixtures
  stay unchanged; the tool counts stay unchanged.
- **Acceptance:**
  - the goal's measurement, rerun with the compiler API, reports 0 for every production column and for
    every test column but regex;
  - every project compiles with `exactOptionalPropertyTypes`;
  - the unknown audit's list holds only class 1;
  - Biome and the scan have no override and no allow-list;
  - CI is green on every OS.
- **Live runs:** the read-only and CRUD suites on premise and cloud, once at the end, as in the
  earlier spec. The changed areas are the handler arguments, the debugger and the compact
  inputs.
