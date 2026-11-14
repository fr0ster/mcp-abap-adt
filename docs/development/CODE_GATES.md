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
| `unknown` | a value typed `unknown` whose origin has a contract type | `unknownSources.test.ts` |

- **The scans read syntax trees, never text** (`src/__tests__/unit/sources/helpers/typeEscapeScan.ts`,
  `regexScan.ts`, `unknownProvenanceScan.ts`), over every git-tracked or new production source,
  `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs`. The unknown audit follows types, so it reads
  the TypeScript sources: every package's `src` and the root's `scripts`; a JavaScript source
  carries no type for it to follow. There is no allow-list: a finding is fixed in the code.
- **A value from outside the type system** — a tool's arguments from the model, SAP's answers, a
  parsed document, the environment, a file, a caught value — is checked at run time, in plain
  code, once, at the boundary where it enters; it is typed after. A value that has a contract type
  is typed by that contract (the interface's declared type, the handler's argument type,
  `ReturnType<…>`), never held as `unknown` and narrowed by hand. The unknown audit follows each
  `unknown` back to where its value comes from and refuses one whose origin is typed. An
  `unknown` inside a written type is read the same way: an array's or a tuple's element, a
  `Record`'s or an index signature's value, a `Map`, `Set` or `Promise` argument, a function
  type's return, an alias of `unknown`, and the parameter of a function expression whose
  function type writes it `unknown`.
  The type read is the one the checker instantiates, walked to any depth: an `unknown` a generic
  is instantiated with (`Visit<unknown>`, `Bag<unknown>` of `[key: string]: T[]`), a member's
  member, a function type's parameter and return. A call's arguments reach parameters through
  spreads alike: a fixed tuple's members at their places, and every argument after an array
  spread to a rest parameter.
- **Three readings of the unknown audit are rules (the owner's decisions):**
  - a site declared `ToolArgs` (a tool's arguments before their schema, what an entry's `call`
    parses) is input, as `process.argv` and `process.env` are, whoever hands the value on;
  - a function written as a member of an object literal typed by a named sink contract
    (`SINK_CONTRACTS`: `ILogger`, `IAnswerSerializer`, and `RegisteredToolCallback`, a registered
    tool callback as the MCP SDK calls it, whose arguments go on to the SDK's callback) is that
    contract's member, so its `unknown` parameter is a sink;
  - **a sink by reading:** a slot of a contract whose value only leaves the program — handed to
    JSON serialization or the MCP SDK, never read back — is a sink, named by its contract and
    member (`SINK_SLOTS`: `ToolContentItem.json` and `ToolContentItem.text`, a tool answer's
    content), each with the one function that reads it to hand it out (`normalizeToolContent`).
    Every `unknown` under such a slot is a sink. A read of the slot by any other function — by
    name, by a computed key that may name it, destructured in a declaration or an assignment —
    reads a typed value back and is refused (`sinkSlotReads`); its contract is then typed
    instead — made generic, so callers keep their type, or exact. A slot whose content is read
    back is never a sink.
- **A reader of thrown values** (`THROWN_READERS`) takes `unknown` because a caught value reaches
  it untyped; it is named by `file#function(parameter)`, and a listed reader no site has is
  stale. A function that reads no caught value is typed by its sources instead. A caught value
  is one a `catch` binds, one a promise's rejection handler takes (`catch`'s, `then`'s second),
  wherever it is carried (by shorthand, destructured); a slot that holds `Error`s of ours beside
  values from outside (a rejection reached through a library's combinator) is a failure slot, a
  reader's too.
- **How the audit reads what it follows:**
  - a value followed back to where it was made is read there at the position the site asks
    for (a reading's `value`, not the reading as a whole);
  - a runtime object the language declares with no type parameter (`Error`, `AbortSignal`) is
    the language's contract, like a third party's: what it types `unknown` (`Error.cause`) is no
    position of the repository's, nor is a member a class of ours inherits from it;
  - a callback no code of the repository calls — a function expression, or a named function
    handed on by name — is typed by each contract it is handed to, at each position it writes
    `unknown`: one that takes its contract's instantiation (`AdtReading<unknown>` where the call
    instantiates `T` so) passes; one that writes `unknown` where the contract has a type is
    refused with that type;
  - a member is named as the checker names it (`'raw-value'`, `value` written `'value'`), and a
    type is walked to any depth, a recursive one cut where it repeats;
  - a site declared `ToolArgs` intersected with typed members (`{ object_type?: … } & ToolArgs`,
    what a compact route selects by) is the input still.
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
- `unknownSources.test.ts` lists each `unknown` whose origin is typed, with that origin.
- A fixture per refusal lives under `src/__tests__/unit/sources/__fixtures__/`; a new rule comes
  with a fixture its scan refuses and a clean one it accepts.
