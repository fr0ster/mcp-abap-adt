# Goal: no assertion, no regex, exact optional types

## Goal

The server's code is checked by the compiler with nothing taken on the author's word. No value
is forced into a type, no optional property hides an `undefined` its type does not declare, and
no input is read with a regular expression. A gate keeps it so: none of these can come back.
It holds for every package of this repository in its 24.0.0 release; the separately published
libraries it depends on (adt-clients, connection, the interfaces packages) are outside it.

Production code is every package's `src`, `bin` and `scripts`, and the root's `src`, `scripts`
and `tools`. Test code is every `__tests__` tree, its helpers and its testers. Fixtures that are
wrong on purpose, for a scan to refuse, stay wrong.

## Invariants

- **No type assertion in production code.** Not `as T` (only `as const` stays), not
  `as unknown as`, not `as never`, not `any`, not `!` (non-null or definite assignment), not
  `@ts-ignore` or `@ts-expect-error`.
- **No cast replaces a cast.** A value that has a contract type is typed by that contract: the
  interface's declared type, the handler's argument type, `ReturnType<…>`. Holding it as
  `unknown` and narrowing it by hand is not a fix.
- **Runtime checks only for data from outside the type system.** Tool arguments from the model,
  SAP's answers, parsed documents, the environment and files are checked at run time, in plain
  code. Nothing else is.
- **No regex in production code.**
- **`exactOptionalPropertyTypes` is on** in every TypeScript project of the repository. It also
  closes the hole of the RFC configuration's `url?: never`, which the runtime guard today only
  approximates.
- **The test infrastructure follows.** `any` leaves the test helpers and testers too.
- **A defect the types reveal is fixed in this change**, with a test that fails before the fix.
  Every other answer stays as it is today.
- **Contracts are fixed where they live.** A type too narrow or too wide in a package we publish
  is fixed in that package, which is released first; this server then takes it from the
  registry.
- **Exported types that change are listed**, for the semver of the server's release.
- **A gate keeps all of it**: the lint, a source test, or both, so none of it comes back.

## What there is today (Measured)

Counted on this branch with the TypeScript compiler API over the syntax tree of every
git-tracked source (`.ts`, `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`; `.d.ts` excluded). `as T`
excludes `as const`, `as never`, `as any` and `as unknown as`; `any` counts every `any` keyword,
`as any` included; `!` is non-null plus definite assignment.

### Production code

| Package | Files | `as T` | `as unknown as` | `as never` | `any` | `!` | ts-ignore / expect-error | regex |
|---|---|---|---|---|---|---|---|---|
| root `src` | 554 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| root `scripts`, `tools` | 31 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| server-runtime | 36 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| compact-readonly-entries, compact-modify | 38 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| every other package (`src`, `bin`) | 44 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

- The 3 `as T` are the gate's `BLOCKED` list (`src/__tests__/unit/sources/staticTypes.test.ts`):
  `src/lib/batch/phases.ts` (2) and
  `src/handlers/system/readonly/handleRuntimeListFeeds.ts` (1), each
  `… as Promise<IAdtWireResponse<T, D>>`. They come from
  `IAbapConnection.makeAdtRequest<T, D>` in `@mcp-abap-adt/interfaces-adt-connection`, which lets
  the caller choose `T`, so a connection that records or forwards a request must assert it.
  `biome.json` turns `noUnsafeTypeAssertion` off for exactly these two files.
- Regex: no literal, no `RegExp`; the 6 `.search(` / `.match(` calls are ADT client and
  line-matcher methods, not `String` methods (`noRegexOverInput.test.ts` finds none).
- `unknown` is written 835 times in the root `src` (895 in all production code: 453
  parameters, 106 variables, 82 property signatures, 74 function returns, the rest in other type
  positions), with 35 type predicates. How many of them hold a value that has a contract type
  is not measured.
- Gates in place: Biome `noExplicitAny`, `noImplicitAnyLet`, `noUnsafeTypeAssertion` (errors,
  production only); `staticTypes.test.ts` over `src`, `scripts` and each package's `src`
  (not `tools`, not `bin`); `noRegexOverInput.test.ts` over `src`, `scripts`, `tools` and every
  package.

### Test code

| Package | Files | `as T` | `as unknown as` | `as never` | `as any` | `any` | `!` | ts-expect-error | regex literals |
|---|---|---|---|---|---|---|---|---|---|
| root `src` tests | 544 | 599 | 204 | 310 | 944 | 1,744 | 80 | 92 | 356 |
| root `src` helpers and testers | 82 | 73 | 15 | 11 | 7 | 80 | 5 | 0 | 20 |
| server-runtime (tests and helpers) | 117 | 126 | 61 | 60 | 10 | 22 | 28 | 0 | 27 |
| responsible-rules | 11 | 14 | 18 | 43 | 0 | 0 | 0 | 0 | 0 |
| compact-modify | 8 | 33 | 5 | 18 | 0 | 0 | 0 | 0 | 13 |
| compact-readonly-entries | 9 | 16 | 5 | 25 | 0 | 8 | 0 | 0 | 9 |
| every other package | 19 | 20 | 2 | 9 | 0 | 0 | 0 | 6 | 9 |

- Largest groups by cause: `as any` and `as never` handing a stub or partial argument to a typed
  handler or connection (about 1,400); `as unknown as` building a fake connection, client or
  context; `as HandlerContext`, `as { isError?: boolean }`, `as IAbapConnection`,
  `as Record<string, unknown>` reading results (about 210 together); `jest.Mock` casts.
- By directory, the most: `src/__tests__/unit/batch` (268 assertions), `unit/debugger` (225),
  `unit/lowTierStrategies.test.ts` (95), `unit/readonlySingleCall.test.ts` (85).
- Test infrastructure `any` (syntax, not comments): `integration/helpers` and `testers`
  (`HighTester`, `LambdaTester`, `configHelpers`, `persistenceHelpers`, `sharedObjects`,
  `sessionHelpers`, `testHelpers`) and `src/__tests__/helpers` (`adtStandIn`, `fakeClient`,
  `recordingConnection`).
- Biome turns `noExplicitAny`, `noImplicitAnyLet` and `noUnsafeTypeAssertion` off for every
  test file.

### `exactOptionalPropertyTypes`

Errors per TypeScript project with the option set (compiler API, `getPreEmitDiagnostics`); every
project has 0 errors without it.

| Project | Errors | Of them in production files |
|---|---|---|
| `tsconfig.json` (root) | 579 | 579 |
| `tsconfig.test.json` | 935 | 688 |
| `tsconfig.node-test.json` | 692 | 682 |
| `server-runtime/tsconfig.json` | 37 | 37 |
| `server-runtime/tsconfig.test.json` | 616 | 606 |
| `compact-readonly-entries/tsconfig.json` | 56 | 56 |
| `compact-modify/tsconfig.json` | 14 | 14 |
| `responsible-rules/tsconfig.json` | 1 | 1 |
| `responsible-rules`, `http`, `sse`, `server`, `background-runs-memory` `tsconfig.test.json` | 476–610 | almost all (they compile the root `src`) |
| every other package's `tsconfig.json` | 0 | 0 |

- Root project by cause: 223 of 579 are one shape — a handler's argument interface declares
  `prop?: T` while the zod schema's output is `prop?: T | undefined`
  (`HighLevelHandlersGroup.ts` alone 148, `ReadOnlyHandlersGroup.ts` 29,
  `SystemHandlersGroup.ts` 19), with 102 more `No overload matches` from the same registrations;
  the rest are optional fields passed on as `T | undefined` (`transportRequest`, `state_handle`,
  `analyse`, `scope`, `description`, …), mostly in `src/lib/debugger`,
  `src/lib/compact/debug` and `src/handlers/common/low`.
- The RFC configuration (`ISapRfcLogon.url?: never`, `@mcp-abap-adt/interfaces-auth-sap`) is
  guarded today by `configConstructionScan.ts`, which runs its own program with the option on
  and lists its known limits (a merged `never & undefined` among them).

## Open for the spec

- The upstream change that removes the 3 blocked assertions: `makeAdtRequest` answering
  `data: unknown` (or another shape) in interfaces-adt-connection, then adt-clients and
  connection; its semver in each package, and its order of release.
- Whether any other contract of a package we publish must change for
  `exactOptionalPropertyTypes` (options typed `?: T` that callers pass as `T | undefined`).
- How handler argument types meet the zod output: derived from the schema, or declared
  `?: T | undefined`.
- Which `unknown` in production holds a value that has a contract type, and how each is typed
  instead.
- The test infrastructure: how its `any` is replaced (typed stand-ins for the connection, the
  client and the handler context, or another way); whether the other assertions in test code
  go too, and what stays for fixtures that are wrong on purpose.
- The gate: lint, a source test or both; how it covers `tools` and `bin`, which the type-escape scan skips today; the option in
  every `tsconfig`; the `BLOCKED` list emptied; how each refusal is proved.
- The semver of the server's release: which exported types change (handler argument types,
  options turning `?: T | undefined`).
