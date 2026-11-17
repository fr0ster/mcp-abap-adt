# Code gates: what the compiler checks, and what keeps it so

Since 24.0.0 the server's code is checked by the compiler with nothing taken on the author's word.
This page says what each gate refuses, where it runs and how to read a refusal. Every gate runs
in `npm run lint:check`, `npm run build`, `npm run test:check` or `npm test`, so CI refuses what it
refuses.

**Production code** is every package's `src`, `bin` and `scripts`, and the root's `src`, `scripts`
and `tools`. **Test code** is every `__tests__` tree. **The test infrastructure** is every
`helpers` or `testers` directory inside a `__tests__` tree. Fixtures under `__fixtures__` are wrong
on purpose and are read only by the test that proves a scan refuses them.

## TypeScript

Every `tsconfig` is `strict` with `noImplicitAny` and `exactOptionalPropertyTypes`: an optional
property is `?: T` when a caller leaves it out and `?: T | undefined` when a caller may pass
`undefined`. A key that may be absent is left out of an object literal, never set to `undefined`
against a `?: T`.

## Production code: no assertion, no `any`, no regex

| Rule | Refused | Gate |
|---|---|---|
| Type assertion | `x as T`, `<T>x`, `as unknown as T`, `as never`, and in JavaScript `/** @type {T} */ (x)` (only `as const` and `@type {const}` stay) | `staticTypes.test.ts`; Biome `noUnsafeTypeAssertion` |
| `any` | the `any` type anywhere a type is written, JSDoc's `*` and `?` in JavaScript too | `staticTypes.test.ts`; Biome `noExplicitAny`, `noImplicitAnyLet`; `noImplicitAny` |
| `!` | a non-null assertion (`x!`) and a definite assignment (`let x!: T`, `field!: T`) | `staticTypes.test.ts` |
| Suppression | `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `biome-ignore` in any comment | `staticTypes.test.ts` |
| Regex | a regex literal, any reference to `RegExp`, `match` / `matchAll` / `search` on a string, called or taken off it (`call`, `bind`, `String.prototype`, destructuring) | `noRegexOverInput.test.ts` |
| `any` value | an expression the checker types `any` that is not handed on whole into a slot declared `unknown` or `any`, outside the boundaries (an error); `unknown` written in a type position is listed as a warning | `unknownSweep.test.ts` |

- **The scans read syntax trees, never text** (`src/__tests__/unit/sources/helpers/typeEscapeScan.ts`,
  `regexScan.ts`), over every git-tracked or new production source, `.ts`, `.mts`, `.cts`, `.js`,
  `.mjs` and `.cjs`. The type gate (`helpers/unknownSweep.ts`) reads types, so it reads the
  TypeScript sources: every package's `src` and the root's `scripts`; a JavaScript source carries
  no type for it to read.
- **A value from outside the type system** — a tool's arguments from the model, SAP's answers, a
  parsed document, the environment, a file, a caught value — is checked at run time, in plain
  code, once, at the boundary where it enters; it is typed after. A value that has a contract type
  is typed by that contract (the interface's declared type, the handler's argument type,
  `ReturnType<…>`), never held as `unknown` and narrowed by hand.
- **The type gate** (`unknownSweep.test.ts`, `helpers/unknownSweep.ts`) reads the checker's
  types over every production project, each program accepted by the compiler first: a
  configuration that does not parse, or a diagnostic before emit, fails it, naming the project
  and its first diagnostics. It makes no analysis of who brought a value in — the type and the
  written text say:
  - **`any` is an error**: the keyword written, and every expression the checker types `any`
    (`JSON.parse`'s answer, an element of `Array.isArray`'s `any[]`, `Reflect.get`'s, a third
    party's declaration), unless it is inside a listed boundary or a sink contract, or handed
    on whole into a slot declared `unknown` or `any`: an argument whose parameter is so
    declared, a return of a function so declared (one written without a return type returns
    into its contract's, as `ProxyHandler.get`'s), an initializer or an assignment into a
    declaration so written — through parentheses, a conditional's branch, the right operand of
    `??` or `||`, an `await`. Returned into `Promise<unknown>`, handed to a type parameter or
    into any narrower slot, it is laundered, and an error.
  - **Every `unknown` is reported where it enters, and fails nothing.** A site is the keyword
    written in a type position (an annotation, a parameter, a return, a field, an alias, an
    interface, a type argument, a constraint, a default, an `as` target), a call's or a `new`'s
    answer or a member read whose declaration brings the `unknown` (its declared type holds it,
    or a type parameter of it or its holder defaults to one with no type argument written), a
    callback's parameter its contract types, or a catch binding — once, where it enters; a
    value that only flows on within our code, or an `unknown` the caller's own type argument
    or value instantiated, is not reported again. Each site has its origin:
    - `OURS` — the keyword written here (its own `file:line`); our packages' built
      declarations count as the source that writes them;
    - `EXTERNAL` — declared in a package: its manifest's `name@version` and the member that
      brings it (`@mcp-abap-adt/interfaces-utils@1.1.1 ILogger.info(meta)`), found through the
      declaration of the symbol whose type brings it, our aliases of their types included;
    - `LANGUAGE` — the language's own (`lib.*.d.ts`): a catch binding, `Error.cause`, a
      callback a language method types;
    - `UNRESOLVED` — a declaration the report cannot place (a package with no manifest), said
      so with its path, never dropped.
    Each site names the list that covers it — `FORCED_BY_CONTRACT` (a site a third party's
    contract forces, with the member: `ILogger`'s meta, `IAbapRequestOptions.params`,
    `IAdtWireResponse.data`, `JSON.stringify`'s replacer value), `THROWN_READERS`,
    `PARSE_SITES`, `PROGRAM_INPUT_SITES`, `SINK_SITES`, `SINK_SLOTS`, `SINK_CONTRACTS`,
    `ToolArgs` — or `none`; a site inside a list is reported, not hidden. Its class
    (`UNKNOWN_CLASSES`, by `file#function`: `entry point`, `generic carry`, `missing own type`)
    says why it is still `unknown`, else `unclassified`. Reading or inspecting an `unknown` is
    the compiler's to refuse.
- **The boundaries**, each site by `file#owner(name)`; a site inside a function a list names is
  in it:
  - `THROWN_READERS` — the readers of thrown values and failure slots: a caught value is
    inspected only there (`thrownValue.ts`'s `thrownAs` and `asError`, `answer.ts`'s
    `messageOf`, …);
  - `PARSE_SITES` — **typed at the parse** (the owner's rule): `unknown` lives only inside a
    parse function, up to the code that checks it; JSON is `JsonValue` / `JsonObject`
    (`src/lib/json.ts`), XML is `XmlNode` (`src/lib/xml/node.ts`), a wire value is `WireValue`
    (`src/lib/wireValue.ts#wireValueOf`) from there on;
  - `PROGRAM_INPUT_SITES` — a value of `process.argv` / `process.env`;
  - `SINK_SITES` — functions of a sink's own; `SINK_CONTRACTS` — contracts whose members take a
    value of any type by design (`ILogger`, `RegisteredToolCallback`): the contract's
    declaration, a class implementing it, a declaration whose written type names it;
    `SINK_SLOTS` — none today, a tool result's content being typed.
- **Where the report shows.** `npm run sweep:unknown` runs the gate alone (no SAP system) and
  prints the report origin first — `OURS`, `EXTERNAL`, `LANGUAGE`, `UNRESOLVED`, each with its
  count split into covered by a list and not — then each origin's sites (what brought it, the
  site, how it enters, the list covering it, the text). In CI the gate appends the same to the
  job's summary (`GITHUB_STEP_SUMMARY`) as Markdown tables: the totals per origin, then a table
  per origin; a failed write fails nothing. The `EXTERNAL` table is the worklist of typing the
  third parties' contracts.
- **The lists name exact sites and stay short:** an entry, a forced site or a class no
  production site has is stale and refused. A finding is fixed in the code — typed by its
  contract, its wire or parse answer, or made generic — never by widening a list.
- **Text is read with plain string code** (`src/lib/plainText.ts`), never a regex.
- **Biome** (`biome.json`) turns the three rules on as errors for production, with no override.
  `lint:check`, `lint` and the build's check name the same directories, which
  `staticTypes.test.ts` checks against the production directories found on disk.

## The test infrastructure: no `any`

The helpers and testers hold no `any`: Biome's `noExplicitAny` and `noImplicitAnyLet` are errors
there, and `staticTypes.test.ts` refuses the `any` type in them
(`testInfrastructureSources`). Their conventions:

- **The test config is parsed once.** `tests/test-config.yaml` goes through
  `helpers/testConfigSchema.ts` (`parseTestConfig`); `loadTestConfig()` answers `TestConfig`. A
  handler's section is read with `handlerTestCases(config, name)`, a shared dependency list with
  `sharedDependenciesOf(shared, kind)`. A value the schema does not name stays as it was; one it
  names must have its type, else the load is refused naming the file and the key's path.
  `src/__tests__/unit/testConfigSchema.test.ts` proves the committed template parses.
- **A test reads its case's params through a schema of what it reads:**
  `readCaseParams(context.params, Schema, '<case>')`, a `z.looseObject` per file; a value the
  test needs and the case may leave out is taken with `stated(value, 'key')`, which refuses with
  the key's name.
- **A handler's JSON answer is read through a schema** of the fields the test reads:
  `handlerAnswer(response, z.looseObject({ … }))` (`helpers/testHelpers.ts`).
- **A caught value is read by shape:** `thrownWords(error)` and `thrownStatus(error)`
  (`helpers/thrownValue.ts`), never `catch (error: any)`.
- **`HighTester` drives tool entries,** `defineTool(TOOL_DEFINITION, handleX)`: the arguments it
  builds from the case go through the tool's schema, as a model's call does.

Test files themselves may still hold assertions, `any` and regular expressions: many build a
deliberately wrong value to prove a check at a boundary, or prove a refusal of the compiler.

## Reading a refusal

- `staticTypes.test.ts` "holds no escape" lists each finding as `{ rule, where: 'file:line',
  text }`; "holds no any" the same for the test infrastructure.
- `noRegexOverInput.test.ts` lists each site as `file:line` and its first line.
- `unknownSweep.test.ts` "has no any" lists each error as `file:line kind text` — `any-keyword`
  for the keyword written, `any` for an expression typed `any`; the `unknown` is the origin
  report it prints (`npm run sweep:unknown`).
- A fixture per refusal lives under `src/__tests__/unit/sources/__fixtures__/`; a new rule comes
  with a fixture its scan refuses and a clean one it accepts.
