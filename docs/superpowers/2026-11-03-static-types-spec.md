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

- Every existing test passes unchanged, except a test of a §3 refusal, which is new.
- **Before and after:**
  - the listed-schema fixture (§2);
  - the surface fixtures;
  - the tool counts.
- Live runs on premise and cloud: the existing read-only and CRUD integration suites, once, at
  the end.
