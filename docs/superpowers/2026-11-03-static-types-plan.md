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
18. **Live runs**, after a realm check: the existing read-only and CRUD integration suites,
    once on premise and once on the cloud.
19. Run CI's full step list locally, including the pack, the install check and the images.
    Then run Codex review and CI, and get the owner's review.
20. Delete the goal, spec and plan before the release commit. Put anything they owe into the
    PR description. Then wait for the owner's merge and tag, the publish, and the registry
    check.

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
