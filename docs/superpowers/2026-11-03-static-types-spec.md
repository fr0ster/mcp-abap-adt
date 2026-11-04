# Spec: static types in the server's production code

Goal: `2026-11-03-static-types-goal.md`. This spec decides what the goal left open.

## 1. What the code shows (Measured, `main` at 23.1.0)

- **Implicit `any` is allowed.** `noImplicitAny: false` in the root `tsconfig.json` and in the
  server-runtime, server, http, sse, responsible-rules and background-runs-memory configs. Every
  unannotated parameter is an `any` that no grep counts.
- **Express has no types.** express 5 ships none, and `@types/express` is not installed, so the
  exported `RouteHandler` and `IHttpApplication` are `any`.
- **Tool arguments are untyped.**
  - Each `TOOL_DEFINITION.inputSchema` is a JSON Schema literal, 325 of them.
  - At registration `jsonSchemaToZod` turns each into a zod shape built at run time. The SDK
    validates with it, but it can type nothing.
  - `ContextHandler.args` is `any`.
  - A typed path exists (`defineTool` with `ArgsOf`), used by 6 of 13 groups. It compiles only
    because `args` is `any`.
  - The others write `(args: any) =>` or cast `args as TArgs`.
  - A handler's call form is chosen at run time by `handler.length`, with the group's context
    swapped around the call.
- **The compact routes skip validation.** The 45 `as unknown as CompactHandler` and the
  `as never` in `handleUpdateUnderLock` and `handleHandlerGet` hand the model's arguments to
  typed handlers. Nothing checks them against the target tool's own schema. This is a defect
  the casts hide.
- **No published package needs a change.**
  - `IAdtResponse` is `IAdtSuccess<T> | IAdtFailure<E>` with every part exported. The casts come
    from hand-built stubs and from `if (!a.ok) return a` written before narrowing worked.
  - `CheckedDeletable` is the server's own type.
  - `IAnalyse<any>` becomes `IAnalyse`.
  - `IAdtVersionable<any, …>` is fixed by a closure that binds its config.
  - `ILogger` already takes `unknown`; every logger `any` is the server's own.
  - `makeAdtRequest` is on `IAbapConnection`.
- **Dead code the types expose.** `canRefreshToken`, which exists in no connection version, and
  `__debugId`, which is never set, guard debug branches that cannot run.
- **XML is read through `any`.** fast-xml-parser's `parse()` answers `any`, and most readers
  navigate it so. The shared `parseStructure()` already answers `unknown`.
- **The lint covers little.** One `biome.json` warns on `noExplicitAny`. The build lints `src`
  only. Biome 2.5.15 has `nursery/noUnsafeTypeAssertion`: every assertion except `as const`.

## 2. Tool arguments: zod is the type and the check

- **Schema.** Each `TOOL_DEFINITION.inputSchema` becomes a zod object schema (zod 4 is already
  a dependency). The handler's arguments are `z.output<typeof inputSchema>`. The descriptions
  move into the schema (`.describe`).
- **Gone.** `ArgsOf`, `jsonSchemaToZod`, `shapeOf` and `typeOf` are removed. No second mapping
  of the same schema can drift.
- **One entry type.** `defineTool(definition, handler)` answers a `HandlerEntry` whose
  `call(context, args)` closure holds the handler's type. A registry is `HandlerEntry[]` with no
  cast.
  - Every entry is built so.
  - `ArgsOnlyHandler`, `isArgsOnly`, `callInItsForm` and the context swapping are removed.
  - A group passes its context at the call.
- **One validation.** The entry registers itself on the SDK with its zod schema, so the SDK
  validates once and its callback's arguments are typed `z.output`.
  - The state handle, `background` and `timeout` become zod edits (`.extend`, `.omit`) of the
    entry's schema.
  - The plan's first step proves in a typecheck that the edited schema's output still reaches
    the handler typed.
  - If TypeScript cannot prove it, the closure parses the arguments again with the entry's own
    schema instead. That doubles the parse, and the plan measures its cost on the batch
    timing test.
- **Lists and docs.** `tools/list`, the variant projections, the docs generator and
  `tool-search.json` read the JSON Schema from zod (`z.toJSONSchema`). A test checks that every
  tool's listed schema stays as it is today, compared with a fixture captured before the change.
  A difference is a defect of the migration, unless it is one of §4's fixes.

## 3. Compact routes

- **Each route is the target tool's entry.** A compact read or part route is
  `entry.call` of the tool it serves, so the arguments are validated against that tool's
  schema.
- **The compact write handlers** (`handleCreateOnly`, `handleUpdateUnderLock`,
  `handleDeleteOnly`) take the compact tool's own typed arguments, and each per-type branch calls
  the target's `call`.
- **This changes answers.** A wrong-typed argument that reaches a handler today is refused with
  the schema's words, and an undeclared key is dropped. Every such change is a fix, with a
  test of the refused case. Before the change, the plan lists every target handler that reads a
  key its own schema does not declare (`object_type` for example), and declares each one.

## 4. The rest of the code

- **`IAdtResponse` values.** Plain typed literals (`{ ok: true, value }`, `{ ok: false,
  error }`), and narrowing after `ok`. The cleanup side-channel is the server's own error type,
  `IAdtError & { step?, cleanup?, operation? }`, passed as `TError`.
- **XML and JSON.** One reader module (`src/lib/xml/tree.ts`) over `unknown`, with these
  helpers:
  - `isElement`, `elements`, `child`, `text`, `attr`.

  Every reader goes through it.
  - Its type predicates are the one allowed form of runtime check here: data from outside the
    type system, each predicate's body checking what it claims, and each tested on the
    documents in the corpus.
  - `Array.isArray` and `Object.entries` are read through it, never directly on `unknown`.
- **Errors.** `catch (error)` is `unknown`, read through the existing failure readers.
- **Logger.** The server's logger types take `unknown` as `ILogger` does.
- **Express.** `@types/express` 5 joins the dependencies of each package whose published `.d.ts`
  imports express types. `RouteHandler` and `IHttpApplication` take the real types.
- **Index reads.** An `arr[i] as T` becomes a typed tuple (`Promise.all` of a tuple) or a
  checked read. No-op assertions are dropped.
- **`@ts-expect-error`.** Both, in `handleDescribeByList.ts`, go with the typing of their
  values.
- **Dead code.** The `canRefreshToken` and `__debugId` branches are deleted.

## 5. The gate

- **TypeScript.** `noImplicitAny` comes back on (removed from every `tsconfig`, so `strict`
  governs).
- **Biome.** For every production directory of every package, and for `scripts`:
  - `noExplicitAny`, `noImplicitAnyLet` and `noUnsafeTypeAssertion` are errors;
  - Biome is pinned exactly, because the last rule is a nursery one;
  - `lint:check` and the build's check cover the same directories.
- **A Jest source scan,** modelled on `src/__tests__/unit/sources/` (`noChainInstanceof`). Over
  the TypeScript program of each package's production code, it refuses:
  - every type assertion but `as const`;
  - every `any`;
  - every non-null `!`;
  - every `@ts-ignore`, `@ts-expect-error` and `biome-ignore`.

  It has no allow-list. Fixtures prove each refusal. The scan is what makes `as unknown as`
  fail the build, since `tsc` cannot.
- Tests stay outside both, until their own task.

## 6. Semver and order

- **24.0.0 for every package.** They are versioned together. Exported types change:
  - `ToolDefinition.inputSchema`;
  - the handler and entry types and `defineTool`;
  - `IHandlersRegistry.registerTool`;
  - the removal of `callInItsForm`, `isArgsOnly` and `InGroupContext`;
  - typed `args` on the exported handlers;
  - `RouteHandler` and `IHttpApplication`.
- `MIGRATION-24.0.md` says what an embedder on 23.x changes:
  - a tool definition's schema is zod;
  - a handler takes `(context, args)`;
  - `registerTool` takes an entry.
- No other package of ours changes, so nothing is published before this.
- Order inside the PR, each step green before the next:
  1. the schema and entry types;
  2. the groups;
  3. compact;
  4. the rest by directory;
  5. the gate last. It must then pass with no exception.

## 7. Tests

- Every existing test passes unchanged, except a test of a §3 refusal, which is new, and the
  changes §8 names.
- **Before and after:**
  - the listed-schema fixture (§2);
  - the surface fixtures;
  - the tool counts.
- Live runs on premise and cloud: the existing read-only and CRUD integration suites, once, at
  the end. §8 widens this run to every handler.

## 8. Test coverage of every handler

**The owner's rule (binding):**
- Every handler, full and compact, is covered by unit tests that pin its requests and by
  permanent live integration tests.
- This change touched nearly every handler: static types, typed arguments, the new
  registration API. So the gaps are closed here, before 24.0.0.

**The scope is measured** (inventory at `77ada8e0`): 315 tools, 274 full and 41 compact.

| Set | Pinned | Member | Invoked only | Generic only | None |
| --- | --- | --- | --- | --- | --- |
| full | 141 | 97 | 6 | 30 | 0 |
| compact | 28 | 2 | 1 | 6 | 4 |

- The live suites reach 167 full tools and 12 compact ones.
- Further gaps:
  - a delete runs live only as a cleanup lambda;
  - `UpdateServiceBinding` and `DeleteServiceDefinition` are never called live as tools;
  - compact runs live only in hard mode, in cases the template disables;
  - the compact tools have gaps per `object_type`.

### What counts

- **Coverage key.** Each key needs a pin and a live case. A key is one of these:
  - a served tool's name;
  - for a compact tool whose listed schema has an `object_type` enum, the tool and one value of
    it (`HandlerLock#CLASS`);
  - for `HandlerGet`, the tool, an `object_type` and a `part`, as the handler's own route tables
    serve them (`compactReadRoutes`, `compactPartRoutes`; not the product of the two enums).

  A key requires a system kind when a binary of that variant lists it: `onprem` means the
  on-premise system, `cloud` the BTP trial system. A tool that declares no `available_in` is
  listed by both variants.
- **Pinned.** A pinned case does all of this:
  - It runs real adt-clients code on the parity stand-in: `recordingConnection`, or `adtStandIn`
    for a tool that opens connections of its own (the debugger listener, long sessions, leftover
    sessions, background runs, the batch envelope).
  - It calls the tool through its registered entry, found by name in the variant's entries
    (`entry.call(context, args)`), so the schema parse is part of the case.
  - It asserts the whole recorded request list: order, count, and per request the method, the
    URL with its query, the headers adt-clients set (as the connection records them) and the
    body (`undefined` when none).
  - It asserts the answer: not an error, except in a refusal case.
  - Where onprem and cloud take different code, it has one case per variant.
- **The expected requests.** The literals come from running the code on the stand-in. They are
  reviewed in the diff against the corpus and the ADT contract. There is no freezing harness.
- **Live.** A live case is a permanent Jest test under `src/__tests__/integration/` that calls
  the tool by name through `liveCall`:
  - in soft mode, the registered entry's `call` on the live connection;
  - in hard mode, the MCP tool.

  The call is in an `it`/`test` body, never in a hook or a cleanup lambda. The case asserts the
  operation itself:
  - a write is read back;
  - an activation is seen in the inactive-objects list or the activation result;
  - a run's result is read;
  - **a delete is asserted** by `expectAbsent`, which reads the object afterwards and expects
    "not found".

  Each case states where it runs (`liveSuite(systems, title, body)`). It runs on the on-premise
  system and the BTP trial system wherever the key requires them, and elsewhere skips naming
  its reason.

### Safety of every live run

- **Realm check before any logon.** An unauthenticated `GET` of the ADT discovery must answer
  `401`.
  - On premise, the `WWW-Authenticate` realm must equal `environment.expected_realm`. That key
    is empty in the template, and empty refuses the run.
  - On the cloud, the session's JWT `exp` must lie in the future. It is decoded locally, with no
    request.
  - A mismatch stops the run before `globalSetup` logs on.
- **Each SAP user on its own connection.** The debugger's second user comes from
  `second_user_env` and is never shared.
- **Delete only what the test created.**
  - Each name is read before its create. A name that exists fails the case, with nothing
    created or deleted.
  - Cleanup deletes only names recorded after a successful create.
- **Never:** SM12 (a lock left behind is a failure, and the session's logoff releases it), and
  never release a transport.
- **Debugger cases** stop their listener and log off their session in `afterAll`.
- **Any credential refusal stops everything.** The first one writes a run marker. Every later
  `liveCall` refuses before it sends, and the run fails.
- **Where objects go.**
  - On premise: `$TMP`.
  - On the cloud: the configured development package (`environment.default_package`). The
    cloud has no `$TMP`.
  - Names follow the template's `ZMCP_BLD_*` convention.
  - No committed file names a system, a system id, a transport number or a user.

### Acceptance

1. Every key is pinned, and live on every system kind it requires.
2. **The guard test** keeps it so: `src/__tests__/unit/coverage/coverageLedger.test.ts`, part of
   `npm test`.
   - **What it compares.** The committed ledger, `tests/fixtures/tools/coverage-ledger.json`,
     maps each key to `{ unit: <file>, live: { onprem?: <file>, cloud?: <file> } }`. It is
     checked against the tools the binaries serve: `tools/list` of every binary and variant,
     gathered as the listed-schema test gathers it.
   - **Why it cannot pass by accident:**
     - The served list is first asserted against `listed-schemas.json` (315 names), so an empty
       or partial list fails.
     - The ledger's keys equal the required keys exactly. A missing row fails, and so does a
       row of an unserved tool.
     - Each key's `live` systems equal its required kinds exactly.
     - Files are read with the TypeScript compiler API, never matched as text.
   - **The unit file** must hold a `pinCases([...])` call:
     - one element's `tool` (and `object_type` / `part`) is a string literal equal to the key;
     - its `expected` is a non-empty array literal;
     - each request in it is an object literal of exactly `method`, `url`, `headers` and `body`,
       with `url` a string literal.
   - **The live file** lies under `src/__tests__/integration/` and holds a
     `liveCall('<tool>', …)`:
     - its nearest enclosing Jest call is `it` or `test`;
     - it sits inside a `liveSuite` whose first argument is an array literal naming the system;
     - for a delete key, the same `it` calls `expectAbsent` after it.
   - **No orphans.** A `pinCases` row or `liveCall` in a scanned file whose key the ledger
     lacks fails.
   - **At run time** `pinCases` refuses a tool the variant does not serve, and an empty
     `expected`.
   - **Each check is load-bearing.** One fixture per refusal under `__fixtures__/coverage/`
     proves it.
3. **The live run proves the ledger.**
   - The integration run's `globalTeardown` compares the keys that ran and passed on that
     system with the keys the ledger requires there. The run report is written outside the
     repository.
   - A required key that was skipped or failed fails the run, so a missing config section
     cannot pass as a skip.
4. **A defect is fixed here.** A defect a pin or a live case shows is fixed in this PR, with a
   test that fails first (the goal's first invariant), and gets a CHANGELOG line. Tests alone
   change no user-visible behaviour and touch neither CHANGELOG nor MIGRATION.
