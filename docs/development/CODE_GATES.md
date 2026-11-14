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
| `unknown` | a declaration or an expression whose type holds `unknown` or `any` at any depth, outside the boundaries | `unknownSweep.test.ts` |

- **The scans read syntax trees, never text** (`src/__tests__/unit/sources/helpers/typeEscapeScan.ts`,
  `regexScan.ts`), over every git-tracked or new production source, `.ts`, `.mts`, `.cts`, `.js`,
  `.mjs` and `.cjs`. The unknown audit (`helpers/unknownSweep.ts`) reads types, so it reads the
  TypeScript sources: every package's `src` and the root's `scripts`; a JavaScript source carries
  no type for it to read.
- **A value from outside the type system** — a tool's arguments from the model, SAP's answers, a
  parsed document, the environment, a file, a caught value — is checked at run time, in plain
  code, once, at the boundary where it enters; it is typed after. A value that has a contract type
  is typed by that contract (the interface's declared type, the handler's argument type,
  `ReturnType<…>`), never held as `unknown` and narrowed by hand.
- **The unknown audit is a sweep of every node.** Every declaration and every expression of
  production code is visited; its type is taken from the checker and walked to any depth —
  array and tuple elements, type arguments, index signatures (own and inherited, as
  instantiated), union and intersection members, a function's parameters and return, an
  object's members; a recursive type is cut where it repeats. No flow is followed: a site
  holding `unknown` or `any` is refused unless it is one of the boundaries below, and a form the
  sweep does not know is refused, never passed. Each position is charged once, to the node that
  writes it: a declaration whose own written type holds it, an expression whose own written type
  holds it (`x satisfies T`, `x as T`, `<T>x`, the type arguments of a call, a `new`, a tagged
  template, an instantiation expression `f<T>` or a JSX element), an object literal's member, an
  instantiation no argument or receiver brought it into.
  - **A third party's type is its contract** and is not walked: what it types `unknown` is the
    boundary itself. **The type arguments we write for one are ours**
    (`IAdtResponse<unknown, IAdtError>`): they are walked where they are written, in a
    declaration or inside an expression, at any depth of the written type. The language's own structure (`Record`, `Readonly`, `Array`,
    `Promise`, `Map`) is walked; a member of a runtime object of the language (`Error.cause`)
    is not a position.
  - **Bound by the caller:** a type parameter's constraint and default are not sites; each
    instantiation is judged where it is written, a default that falls back to `unknown`
    included.
  - Three checks run beside it: an expression of type `any` (a library's answer) lands only
    where `unknown` or `any` is expected, is discarded or only inspected; a typed value put
    where `unknown` is expected — a container literal landing there whole included — is charged
    to that slot, refused in a parse site and in a third party's member read back by the
    repository (by name, by a key, by any destructuring; a read whose value only passes on,
    where `unknown` or `any` is expected, or is only inspected, reads nothing back); a sink slot
    is read only by its one reader.
- **The boundaries** (`BoundaryKind`), the one list a site may pass under:
  - **caught** — a `catch` binding, a promise's rejection handler's parameter;
  - **thrown** — a reader of thrown values or a failure slot (`THROWN_READERS`, by exact site
    `file#owner(name)`): a caught value reaches it untyped;
  - **parse** — **typed at the parse** (the owner's rule): `unknown` lives only inside a parse
    function, up to the code that checks it (`PARSE_SITES`); JSON is `JsonValue` / `JsonObject`
    (`src/lib/json.ts`), XML is `XmlNode` (`src/lib/xml/node.ts`) from there on;
  - **program-input** — a value of `process.argv` / `process.env` (`PROGRAM_INPUT_SITES`);
  - **tool-args** — **input until checked** (the owner's rule): a declaration written
    `ToolArgs` or `X & ToolArgs` with a typed `X`, a value read out of them (`ToolArgValue`: a
    member, a nested object's, a list's element), and a function returning them;
  - **sink-contract** — a member of a contract of `SINK_CONTRACTS` (`ILogger`,
    `IAnswerSerializer`, `RegisteredToolCallback`), a function implementing one, or a listed
    sink site (`SINK_SITES`);
  - **sink-slot** — **by reading** (the owner's rule): a slot of `SINK_SLOTS`
    (`ToolContentItem.json`, `ToolContentItem.text`), whose value only leaves the program, each
    with the one function that reads it to hand it out (`normalizeToolContent`); a read of the
    slot by any other function reads a typed value back and is refused — a slot of our own
    contract whose content is read back is typed;
  - **callback** — a parameter or a return a contract outside the repository (or a boundary of
    the repository's) types `unknown` at every place the function is handed to it.
- **The lists name exact sites and stay short:** an entry no site has is stale and refused. A
  finding is fixed in the code — typed by its contract, its wire or parse answer, or made
  generic — never by widening a list.
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
- `unknownSweep.test.ts` "refuses no site" lists each refused site as `file:line kind
  file#owner(name) at '<position>' <reason>: <typed values put there>`; the position is the path
  inside the site's type (`IAdtResponse<0>`, `[]`, `.member`, `()`).
- A fixture per refusal lives under `src/__tests__/unit/sources/__fixtures__/`; a new rule comes
  with a fixture its scan refuses and a clean one it accepts.
