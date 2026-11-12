# Plan: no assertion, no regex, exact optional types

Goal: `2026-11-12-no-assertions-goal.md`. Spec: `2026-11-12-no-assertions-spec.md`. The spec
binds, and each step names the spec section it carries out. Steps follow the spec's order of
work (§7).

## Rules for every step

- **Tooling.** npm scripts only: no `npx`, `npm exec`, `node_modules/.bin`, `ts-node` or
  `timeout`.
- **Dependencies come from the registry only.**
  - A consumer takes a dependency once the owner has published it, and never a local link.
  - The one exception is siblings of the same repository during development, as that repo's
    rules allow.
  - After every install, the lockfile is checked: no `"link": true` but a same-repo sibling,
    everything resolved from registry.npmjs.org, one copy of each `@mcp-abap-adt` package.
- **Production code holds** no type assertion (only `as const`), no `any`, no `!`, no
  `@ts-ignore` / `@ts-expect-error` and no regex. No cast replaces a cast. A runtime check
  stays only for data from outside the type system, in plain code.
- **No timeout, delay, poll limit or retry** is added anywhere.
- **Tests first.** Every behaviour step starts with a test that fails before the change. Every
  rule a test protects is proved load-bearing: break the rule on purpose, see the test go red,
  revert. Each step below names its deliberate break.
- **A defect the types reveal** is fixed in the step that reveals it, with a failing-first
  test, and named in the commit.
- **Green before the next step:** each repository's CI step list, read from its own workflow
  and run locally, then the PR's checks after each push (`gh pr checks`).
  - **This server:**
    - `npm run lint:check`, `npm run build`, `npm run test:check`, `npm test`,
      `npm run test:install`;
    - `lint:check` of each of the 17 packages;
    - `test:check` of the six that have one (background-runs-memory, http, responsible-rules,
      server-runtime, server, sse);
    - `npm audit`.

    The worktree's `tests/test-config.yaml` is set aside for the run. The compact packages have
    no `test:check`: their types are checked by the root `test:check`.
  - **mcp-abap-adt-interfaces:** `npm run check` (lint, `test:check`, surface, graph) and
    `npm run build`.
  - **mcp-abap-adt-clients:** `npm run check`, `npm run build`, `npm test` (unit). adt-strategies
    has no `lint:check` / `test:check` of its own; it is covered by the root `check`.
  - **mcp-abap-connection:** `npm run lint:check`, `npm run build`, `npm test` and
    `npm run check:docs`.
- **Measurements made while a step runs** go through npm scripts, never `npx`:
  - `npm run measure:exact`: the option's remaining errors, per project;
  - `npm run measure:unknown`: the provenance script in report mode.

  Both are committed tools under `tools/`, and both are removed in S6 once their gates stand.
- **Commits** are made by path, ending with the two trailers:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_013FwzVzuPQdYVh3bHZmipzj`. No
  `--no-verify`, no force-push.
- **One PR per repository for this task.** It carries that repository's steps through every
  review. The server's PR is #346.
- **Before the release,** the goal, the spec and this plan are deleted. What they still owe
  (follow-ups in other repositories, open owner questions) goes into the PR description first.
- **No implementation code is written into this plan.**

## U. Upstream releases (spec §2, §3), in dependency order

The interfaces repository and mcp-abap-adt-clients each get a worktree, a branch and a PR of
their own; connection too. The owner publishes each release. A later step takes it from the
registry only after its publication, verified by a clean install outside the repositories.

Releases already moving when this plan was written: interfaces-adt 27.3.0 was published, and
adt-clients 45.4.0 (verdict-session, mcp-abap-adt-clients#310) was being built. The typing
releases below come after it. Where each stands now is recorded under its step ("As done").

### U1. interfaces-adt-connection 5.0.0 (major) — repository mcp-abap-adt-interfaces

- **Change.** `IAbapConnection.makeAdtRequest(options: IAbapRequestOptions): Promise<IAdtWireResponse>`.
  The type parameters go. `IAdtWireResponse<T = unknown, D = unknown>` stays.
- **Tests first,** as typechecks in the package's `__typechecks__`:
  - a generic implementation still conforms;
  - a non-generic one conforms;
  - a call with type arguments is refused.

  The existing `connectionCapabilities.ts` typecheck loses its `as unknown as`.
- **Deliberate break:** put the type parameters back, and the non-generic-conformance typecheck
  goes red.
- **Docs:**
  - the package's CHANGELOG 5.0.0 entry;
  - a MIGRATION-5.0 note saying what a caller that passed type arguments changes;
  - its README (line 14 recommends `makeAdtRequest<string>(…)`, which v5 removes).
  - Before each upstream PR is ready, every README, guide and example of the three repositories
    is searched for `makeAdtRequest<` and the widened fields, and updated. Known:
    connection's `README.md:928` and `docs/USAGE.md:279` / `:998`. Historical MIGRATION notes
    stay as they are.

### U2. interfaces-adt 27.4.0 (minor) — same repository, same PR as U1

- **Change.**
  - The range of interfaces-adt-connection moves to `^5.0.0` (a same-repo sibling, linked in
    development; published after U1).
  - These optional fields widen to `?: T | undefined` (spec §3):
    - the configs of `create`, `update`, `validate`, `updateMetadata` and `check`;
    - `IDebuggerIdentity`, `IAdtError` and `IAnalyse`;
    - the options of `getActivationRun` and `getVirtualFoldersContents`.

  The exact fields are those the spec's measurement names. A per-field list is made from the
  compiler's diagnostics at the start of the step, and kept in the PR description.
- **Tests first:** a typecheck under `exactOptionalPropertyTypes` that passes `{ field:
  undefined }` to each widened field.
- **Deliberate break:** take `| undefined` off one field, and its typecheck goes red.
- **Docs:** CHANGELOG 27.4.0. **Publish order:** U1, then U2.
- **As done (an owner-accepted deviation).** U2 widened 261 optional fields in
  interfaces-adt (mcp-abap-adt-interfaces#188, merged), more than the spec listed. The extra
  fields:
  - the runtime readers' options (`IFeedQueryOptions`, the profiler trace options,
    `IClassUnitTestRunOptions` / `IUnitTestScope`, `IUnitTestResultOptions`);
  - `IAdtClientOptions`;
  - `IAdtSystemContext`;
  - `IAdtOperationOptions.source`.

  **Release order as accepted:** interfaces-adt-connection 5.0.0 is tagged at the merge commit
  and published first; interfaces-adt 27.4.0 (`^5.0.0`) follows as a small release PR.

  **Released:** interfaces-adt-connection 5.0.0 and interfaces-adt 27.4.0 are both on the
  registry (Measured 2026-11-12, `npm view`).

### U3. adt-clients 45.5.0 and adt-strategies (minor) — repository mcp-abap-adt-clients

Branched after 45.4.0 is merged and published.

- **Change.**
  - The ranges move to interfaces-adt-connection `^5.0.0` and interfaces-adt `^27.4.0`; also
    in adt-clients-legacy, if it names them.
  - It widens only the optional fields adt-clients itself declares. The interfaces-adt types
    it uses were widened in U2.
  - `activationUtils.ts` and `tools/header-probe/capture.ts` drop their pass-through `<T, D>`.
  - `AdtBatchConnection.makeAdtRequest` keeps its signature.
  - These optional fields widen to `?: T | undefined` (spec §3):
    - the options of the runtime readers (`read`, `gatewayErrors`, `systemMessages`, `run`,
      `dumps`);
    - `IDomainChanges`, `IDataElementChanges` and `ITableTypeChanges`;
    - the inputs of `patchFunctionGroupDocument` and `patchPackageDocument`.
- **Tests first:**
  - a typecheck that `AdtClient` and `createAdtClient` take a non-generic v5 connection;
  - a typecheck per widened field that `undefined` is accepted;
  - the existing unit tests of the activation utilities, unchanged.
- **Deliberate break:** a widened field narrowed again goes red.
- **Docs:** each package's CHANGELOG. **Publish order:** after U2.
- **As done (owner-accepted deviations), mcp-abap-adt-clients#311:** adt-clients 45.5.0,
  adt-strategies 0.23.0 and adt-clients-legacy 0.9.4.
  - A third pass-through, `src/utils/requestTrace.ts`, drops its `<T, D>` too.
  - `IMessageClassChanges` is widened as well (the owner's decision).
  - Not yet on the registry when this plan was amended (Measured 2026-11-12 with `npm view`:
    45.4.0, 0.22.3, 0.9.3), so S5 still waits for it.

### U4. connection 24.0.0 (major) — repository mcp-abap-connection

**As done (an owner-accepted deviation):** released as **24.0.0**, a major, not the 23.1.0
minor planned below. The owner's reason: the exported `AbapConnection` alias changed
incompatibly. It is published (Measured 2026-11-12, `npm view`: 24.0.0). The planned change
below is what it carries besides.

- **Change.** The range of interfaces-adt-connection moves to `^5.0.0`. The generic
  `makeAdtRequest` keeps its signature (spec §2).
- **Tests first,** typechecks:
  - the connector is assignable to v5's `IAbapConnection` (compatibility);
  - a call `makeAdtRequest<string>(…)` on a value typed as the installed `IAbapConnection` is
    refused, marked `@ts-expect-error`. That holds only against v5, so it distinguishes the
    dependency.
- **Deliberate break:** pin the range back to 4. The `@ts-expect-error` is then unused, and the
  typecheck goes red.
- **Docs:** CHANGELOG 24.0.0. **Publish order:** after U1; independent of U2 and U3.

## S. The server (PR #346)

### S1. The scan's coverage (spec §6; order step 2)

- `typeEscapeScan.ts` reads the files the regex scan reads (`regexScan.ts`
  `productionSources()`):
  - the root `src`, `scripts` and `tools`;
  - each package's `src`, `bin`, `scripts` and `tools`;
  - `.ts`, `.mts`, `.cts`, `.js`, `.mjs` and `.cjs`;
  - outside tests, fixtures and docs.
- **Tests first:**
  - `productionSources()` takes a root, defaulting to the repository, so discovery can run over
    a fixture tree.
  - A fixture tree laid out as a repository, with:
    - a `@ts-expect-error` directive in a `.mjs` under `tools`;
    - a `biome-ignore` directive in a `.mjs` under a package `bin`;
    - an assertion in a `.ts` under a package `scripts`;
    - a clean file.
  - A test runs discovery and the scan over it: each refused file must be found by discovery
    and reported under its rule, and the clean one must not be.
- **Deliberate break:** drop `tools` (or `bin`) from discovery. The fixture is no longer found,
  and the test goes red, which a direct `scanFile` test could not show.
- **Acceptance:** the scan finds 0 escapes in the new places (Measured 0 today).

### S2. `exactOptionalPropertyTypes` (spec §3; order step 3)

- **The exact gate: a filter over each project's own diagnostics, not a config of its own.**
  - A `tsconfig.json` `include` cannot isolate a batch: TypeScript also checks what the
    included files import. For example, `handleActivateDomain.ts` imports `utils.ts`, whose
    line 663 fails under the option (Codex measured `npm run test:check --
    --exactOptionalPropertyTypes`, exit 2). Each package also has its own compiler settings
    (`rootDir` among them).
  - So `tools/exact-optional.mjs` compiles each project with its own config plus the option,
    on the compiler API. It reports the diagnostics whose file is listed in
    `tools/exact-optional-files.json` (per project: the files converted so far, and the
    `__typechecks__/exact/` typechecks), and fails on any.
  - `npm run test:check:exact` runs it, and the build's checks run it too.
  - `npm run measure:exact` runs the same tool unfiltered.
  - Each batch below adds its files to the list, so a converted file cannot regress while its
    imports wait for their own batch.
  - **A file that still meets an upstream contract is not enrolled until S5.** These are files
    with a diagnostic against an interfaces-adt or adt-clients type (S2e), such as
    `handleCreateDomain.ts:203` and `handleUpdateDomain.ts:183` / `:200`. `measure:exact` lists
    them by the declaring package (as the spec's measurement did).
    - Their handler/schema pairing is still checked in S2a, by its typecheck in
      `__typechecks__/exact/`. That typecheck imports only the definition and the handler's
      signature, and is itself enrolled.
    - They are enrolled in S5, once U2 and U3 are taken from the registry.
- The other configs keep the option off until S2f, so every commit stays green.

- **S2a. Handler arguments from the schema** (spec §3, "Handler arguments come from the
  schema"). The first version of this step ("the 247 types become `z.output` of their
  schema") did not hold against the code; this is the step as measured.
  - **What a handler receives (Code).** `defineTool` (`src/lib/handlers/interfaces.ts`) pairs a
    handler with a definition, and the entry's `call` parses the model's arguments with that
    definition's own `inputSchema` before the handler runs. The deny list keeps this: its
    narrowed call parses with the narrowed schema, then hands the result to the original call,
    which parses again (`src/lib/access/withoutDenied.ts`). So on every variant a handler
    receives `z.output` of the `inputSchema` of the definition it is paired with. That is the
    one source each `args` type is derived from.
  - **What was measured.** A codemod (reverted) converted the hand-declared `…Args` types, then
    `npm run test:check` ran on the result. The compiler API listed every `defineTool` pairing
    and the keys each handler reads from `args`.
    - 248 named `…Args` types are a handler's second parameter. 202 convert mechanically; 46 do
      not, because their file has no plain `inputSchema` property or the type `extends`
      another one.
    - Beside them, 27 registered handlers declare `args` as an inline type literal; one takes
      `unknown` (`handleRunAbapUnit`); one an `Omit` of a loose alias (`handleHandlerGet`).
    - The 202 alone break the normal build: 32 errors in `test:check`. With every handler
      converted, the production errors are those this step resolves below (undeclared keys,
      handler-to-handler calls); the rest are test sites (below).
  - **The 46, and how each is derived** (no cast anywhere):
    - **17 source readers** whose type `extends SourceRangeArgs` (GetClass, GetProgram,
      GetDdl, GetInterface, GetTable, GetStructure, GetServiceDefinition, GetFunctionModule,
      GetBehaviorDefinition, GetBehaviorImplementation, GetMetadataExtension, GetInclude,
      GetFunctionInclude, and the four class-include reads). Their schema spreads
      `SOURCE_RANGE_SHAPE`, so `SourceRangeArgs` itself becomes the output of an object of that
      shape (`src/lib/handlers/sourceRange.ts`). Each reader's type is then its own
      definition's output. `handleGetIncludePart` shares `GetIncludeArgs`.
    - **19 definitions built by a spread**, most by `byVariant` (Code: `src/lib/variantDefinition.ts`):
      HandlerCreate, Update, Delete, Activate, Lock, Unlock, ProfileRun (compact-modify);
      HandlerCheckRun, DeletionCheck, GetData, Validate, WhereUsed (compact-readonly-entries);
      RunATC, GetObjectDraft, GetObjectVersions, GetObjectVersionSource, GetObjectVersionDiff,
      GetObjectOutline, GetWhereUsed. Each type becomes its definition's
      `z.output<typeof TOOL_DEFINITION.inputSchema>`.
    - **The per-variant question.** `byVariant` takes one `state` callback, so both variants'
      `inputSchema` have one static type, and the definition's own `inputSchema` is the
      on-premise statement (Code). The SDK parses a call with the served variant's listed
      schema (`listedTool.ts`, `servedDefinition`); the entry's `call` then parses it with the
      definition's own. So the on-premise output is the handler's argument type on both
      variants; the cloud values are a subset of it (`projected` checks each list against its
      projection).
      - The handler's `acceptedOf(…, X[variantOf(connection)])` stays. It relates the value
        to the connection's variant, which the compiler does not see.
      - A typecheck pins that each variant's schema output is assignable to the handler's
        `args`, so a later `byVariant` with a type per variant cannot pass unnoticed.
    - **Three schema builders return a union.** `compactActivateSchemaFor` and
      `compactGetSchemaFor` return an object without `object_type` when the deny list denies
      every name. `handlerGetDataDefinition(sql)` returns one of two schemas, only one with
      `sql_query`. The union's output lacks the key on one member: 8 production errors at
      `handleHandlerActivate.ts:92/105/108`, `handleHandlerGet.ts:187/189/193`,
      `handleHandlerGetData.ts:34/36` (Measured).
      - The handlers' own definitions always build the branch with the key. Only the deny
        list's narrowing builds the other (`src/lib/access/narrowing.ts:143`, `:204`, `:312`),
        and its call passes through the original call's parse.
      - **Decision:** each builder is split in two, the one with the key and the one without.
        The handler's definition uses the first, so its schema type has one shape. The
        narrowing picks between the two in plain code, as it picks a branch today. The
        schemas built are the same ones, so no listed schema changes.
      - **Exported API.** All three are exported through `/compact-shared`
        (`src/lib/compact/index.ts:58`, `:73`, `:101`).
        - Each keeps its name and signature: it becomes the chooser between its two halves,
          so an embedder's call compiles and builds the same schema.
        - The two halves of each are added to `/compact-shared` as new exports, a compatible
          addition. They are listed in spec §8 and the CHANGELOG.
    - **The other 10.** Measured: each compiles as derived here.
      - Typed by the schema whose output their one caller hands them:
        - `StartUnitTestRunArgs`: the output of `compactUnitTestRunSchema`;
        - `handleDeletionCheck`'s `Args`: the output of `compactDeletionCheckSchema`;
        - `ActivationRunArgs` / `ActivationStatusArgs`: their two fields of HandlerGet's
          output.
      - `ActivateObjectArgs`: the output of its own (unregistered) `ActivateObjectLow`
        definition, which its callers build.
      - `IncludesListArgs`: its definition's output, without the `Omit` that widens
        `object_type`, under reading (a) of the direct-call decision below.
        - The widening serves a direct call past the schema. Lower-case main types and an
          ambiguous one (`PROG`) reach `parentOf`, and the schema refuses them (probed:
          `FUGR` and `CLAS` accepted; `fugr`, `clas`, `PROG` and `prog` refused).
        - Under reading (b) the `Omit` stays. A parameter wider than the parse output is
          sound.
      - Already derived, unchanged: `handleCreateOnly`'s, `handleDeleteOnly`'s and
        `handleUpdateUnderLock`'s `Args`, and `SessionArgs`.
    - **One of the 202 is not mechanical.** `ScheduleProfilerTraceArgs` (exported by
      `/write`) is the argument of `handleScheduleProfilerTraceOnce`, whose caller is compact
      HandlerProfileSchedule. The codemod derived it from the high tool's schema, where
      `description` is required, and broke `compact-modify/src/group.ts:109`. It becomes the
      output of `compactProfileScheduleSchema`, the caller's schema (measured: compiles).
    - **The other three:** the 27 inline literals become their definition's output;
      `handleRunAbapUnit` takes its definition's output in place of `unknown` (its readers
      that take `unknown` still accept it and are retyped in S3b); `handleHandlerGet` takes
      its definition's output.
    - **HandlerGet's local `args`** (`handleHandlerGet.ts:50`, `:185`) is `HandlerGetArgs`, a
      `Record<string, unknown>`, which loses the parameter's types. Once
      `ActivationRunArgs` / `ActivationStatusArgs` are derived, the calls at `:207`, `:208`
      and `:210` fail TS2322 (`unknown` for `string | undefined` / `boolean | undefined`;
      Codex measured, round 2).
      - `HandlerGetArgs` becomes the definition's output with `object_type` the accepted
        member, built after `acceptedOf` in plain code as today. No cast and no new check.
      - This goes in batch 1, before batch 4 derives the activation readers.
  - **Undeclared keys** (Measured: every key a handler reads from `args`, against its
    definition's schema output). None needs declaring, so **no listed schema changes** and
    tools/list stays byte for byte. No CHANGELOG fix entry follows from this step. The tool
    description guard, the pinned renderings (`fixtureRenderings.ts`, the `fixtureBytes` and
    `rebuiltDescriptions` pins) and `changedHandlerRequests.test.ts` then require nothing,
    and staying unchanged is their proof that no schema moved. None is a defect: no call
    through the schema can deliver the key to the handler.
  - **Open for the owner: direct calls of an exported handler past its schema** (goal-changing,
    Codex round 1).
    - The handlers that `/handlers`, `/read` and `/write` export can be called directly,
      without the schema. The code supports this in places: `unknownReadPart.test.ts` tests
      HandlerGet refusing a part "reaching the handler past its schema, as an embedder's call
      can", and GetObjectStructure reads fallbacks no schema passes.
    - Typing `args` by the schema already narrows what a direct caller may pass (spec §8). The
      dead reads and checks then remain reachable only by a JavaScript caller, or one that
      casts.
    - The goal says "every other answer stays as it is". Two readings:
      - **(a)** it binds the model's calls, which always pass the schema. S2a then drops the
        GetObjectStructure fallback; `unknownReadPart.test.ts` goes through HandlerGet's entry
        and asserts the schema's refusal; S3b removes the dead re-checks. A direct caller
        follows `MIGRATION-24.0.md`: it parses with the tool's schema or calls the entry.
      - **(b)** it binds direct calls too. Then the fallback, HandlerGet's own part check and
        every handler re-check stay, with their tests as they are. Exported handlers whose
        refusal a direct caller relies on keep a boundary of their own: a value from outside
        the type system, read in plain code.
    - The plan is written for **(a)**, the reading S2a's type change already implies. The
      items that depend on it wait for the owner's answer; nothing else in S2a does:
      - the GetObjectStructure fallback;
      - `unknownReadPart.test.ts`;
      - the `IncludesListArgs` widening and its main-type tables;
      - the schema-refused cases of `compactActivateTypes.test.ts`;
      - S3b's dead re-checks.

    | Key | Read at | The schema | Decision |
    |---|---|---|---|
    | `super_package` | `handleCreateDomain.ts:158`, handed to `validateTransportRequest`, which ignores that parameter (`_superPackage`) | CreateDomain is a strict object (`createArguments`): the key is refused by name | dead: stop reading it; `validateTransportRequest` (not exported) loses the unused parameter, which no other caller passes |
    | `object_type`, `object_name` | `handleGetObjectStructure.ts:197-198`, as fallbacks for `objecttype` / `objectname` | a plain object requiring `objecttype` and `objectname`; undeclared keys are stripped | unreachable through the schema, but the handler is exported (`/handlers/read`) and a direct call reaches the fallback: the owner's decision on direct calls (below). The refusal words, which name the fallback, stay as they are |
    | `object_type` | HandlerActivate, HandlerGet | declared; absent only in the deny list's every-name-denied branch | the builder split above |
    | `sql_query` | HandlerGetData | declared; absent only in the branch without SQL | the builder split above |

  - **Handler-to-handler calls** are typed by the callee's arguments; no callee widens.
    - The five high check wrappers (CheckClass, CheckDdl, CheckFunctionModule,
      CheckStructure, CheckTable) declare `version?: string` inline and pass it to the low
      handler, whose `version` is its schema's enum. Typing each wrapper by its own schema
      (the enum `active` / `inactive`) makes the value assignable. Measured: those five
      errors go with that alone.
    - HandlerProfileSchedule → `handleScheduleProfilerTraceOnce`: by
      `ScheduleProfilerTraceArgs` from the compact schema (above).
    - HandlerValidate → `handleValidateServiceBinding` (`handleHandlerValidate.ts:81`, `:83`
      today; `:70`, `:72` after the conversion) passes `service_definition_name` and
      `package_name` as `string | undefined`, and the callee's schema requires both.
      - The facade narrows them in plain code, **in the callee's own order**
        (`handleValidateServiceBinding.ts:104`, `:107`, `:112`-`:114`). Its words are exported
        from the callee, so they have one source, and nothing is sent on a refusal:
        1. an empty `object_name` (HandlerValidate's schema accepts `""`) gets
           "service_binding_name is required", whatever else is given;
        2. then an absent or empty `service_definition_name` gets "service_definition_name is
           required";
        3. then an absent `package_name` gets "package_name is required". An empty or blank
           one passes on as a `string`, and the callee refuses it with the same words, as
           now.
        Then it passes `string`.
      - The answer is the same as today in every case: the callee answers those words in
        that order now (Codex verified the first through the real entry). So these are
        characterization tests, not a fix. Written first in batch 1, through HandlerValidate's
        entry with `object_type` SERVICE_BINDING, they pass before and after:
        - `object_name` `""`, alone and with `service_definition_name` given;
        - `service_definition_name` absent, and `""`;
        - `package_name` absent, `""` and blank;
        - `service_definition_name` and `package_name` both absent: `service_definition_name`
          is named;
        - each case sends nothing.
      - `compactRequiredArguments.test.ts:312`-`:327` calls the callee directly, with
        `package_name` left out (`{}`), empty and blank. Once the callee is typed by its schema
        (batch 4):
        - the `{}` case goes through ValidateServiceBinding's entry and expects the schema's
          refusal naming `package_name`, which is what the model gets;
        - the empty and blank cases stay direct calls (a `string`) and keep "package_name is
          required".
  - **The test sites** (Measured with every handler converted; assertions in tests stay
    allowed by the goal, but none is added here).
    - **Values the tool's schema refuses, handed to the handler directly.** These test a
      path no model call reaches.
      - Sites: `'not_a_type'` (`commonLowOperations.test.ts:184`), `'prog/p'` and
        `'ZZZZ/ZZ'` (`compactUnitTestRunTarget.test.ts:52`, `:148`), `'clas/oc'` and a loose
        target table (`abapUnitRunTool.test.ts:58`, `:180`), `'nonsense'`
        (`handleObjectVersions.test.ts:152`, `objectVersionDiff.test.ts:101`), an empty
        `object_type` (`compactRequiredArguments.test.ts:136`, `:145`), string-typed
        `object_type` tables (`updateSingleCall.test.ts:652`, `:662`, `atcTools.test.ts:530`,
        `projectionBoundary.test.ts`), `'table_type'` (`tableTypeTools.test.ts:1198`,
        `TableTypeHighHandlers.test.ts:483`), `it.each` tables that leave out a required key
        (`includeWrites.test.ts:118`, `:278`, `:357`, `:464`, `:519`;
        `tableTypeTools.test.ts:142`, `:391`, `:528`, `:994`, `:1047`, `:1120`), and a part
        typed `string | number` (`unknownReadPart.test.ts:20`).
      - Probed on this branch's build: the schemas refuse `'prog/p'`, `'ZZZZ/ZZ'` and
        `'not_a_type'`.
      - Except where the owner's decision on direct calls (below) keeps them.
      - **They go through the boundary the model's arguments take:** the tool's entry
        (`defineTool(TOOL_DEFINITION, handler).call(context, raw)`). `raw` is `ToolArgs`, the
        type of the arguments before the schema, so a wrong value needs no cast.
      - Each test asserts what the model gets. Where the schema refuses, the entry's `call`
        throws the refusal naming the issue, and no request is recorded. The test makes its
        rejection expectation before it triggers the call. Where the schema accepts and
        the handler refuses (a member outside the connection's variant), it is the handler's
        refusal, as today.
      - A test whose assertion was a handler refusal that the schema now comes before is
        pointed at the schema's refusal. The model's answer does not change, since the
        schema already ran first. The handler check behind it is dead code, a runtime check
        of a value its type proves; the step lists it, and S3b removes it.
      - A lower-case code a test used for a valid call (`'prog/p'`, `'clas/oc'`) becomes the
        listed code (`PROG/P`, `CLAS/OC`).
    - **Valid arguments without the schema's defaults** (a defaulted field is present in the
      output). Sites: CreatePackage in `IncludeHighHandlers.test.ts:261`,
      `PackageHighHandlers.test.ts:147`, `TableTypeHighHandlers.test.ts:343`,
      `highTierWriteChannelReal.test.ts:323`; GetTableContents in
      `TableContentsHandlers.test.ts:70`, `:110` and `readonlySingleCall.test.ts:328`. Each
      parses its arguments with the tool's schema (`TOOL_DEFINITION.inputSchema.parse`), which
      yields the output type with the defaults the server applies.
    - **GetIncludesList's main-type tables** (`mainTypeBoundary.test.ts:207`, `:215`;
      batch 3). The tables pass `object_type` / `objects[].object_type` as strings.
      - The test expects a lower-case main type to send the same requests (`:285`), and an
        ambiguous one to get the handler's words (`:298`).
      - Under reading (a): the values the schema accepts (`FUGR`, `CLAS`) are typed by its
        members and keep their request assertions. The ones it refuses (lower case, `PROG`)
        go through the entry and assert the schema's refusal, with no request.
      - Under reading (b): the `Omit` stays and the tables stay as they are.
    - **`routesParseTargets.test.ts`** (batch 1). Its table types `object_type` as `string`
      (`:17`) and passes it to HandlerGet (`:110`): TS2322 after the split (Codex measured).
      The table's `object_type` column is typed by HandlerGet's members; its assertions on the
      target schema's refusals stay. Its `part` column follows in S3b, with the part union.
    - **The GetObjectStructure fallback** (reading (a) above). Sites: `caseRule.test.ts:105`,
      `dbviewName.test.ts:67`, `mainTypeBoundary.test.ts:65`,
      `projectionBoundary.test.ts:162` and `readonlySingleCall.test.ts:305`. Each passes the
      declared `objecttype` / `objectname`; its assertions stay.
    - **`compactActivateTypes.test.ts`** does not compile unchanged after the split (Codex
      measured, round 2): six TS2322 remain. The schema refuses both values (probed).
      - The positive table gives `object_type: string` (`:88`). It is parsed with
        HandlerActivate's schema, or typed by its members.
      - `UNIT_TEST` (`:146`) and `TRANSPORT` (`:158`, `:165`, `:172`, `:180`) are outside
        the schema's enum. Under reading (a) these cases go through the entry with `ToolArgs`
        and assert the schema's refusal, with no request.
        - Their assertions on the handler's words ("cannot turn object_type",
          `object_adt_type`, "Known without it") then cannot hold, and become the schema's
          refusal.
        - Under reading (b) they stay direct calls.
      - This goes in batch 1, with the split.
    - **The union branches.** These are TS2353 "`object_type` / `sql_query` does not exist"
      at `compactActivateTypes.test.ts` (its other 9 sites), `compactSearchData.test.ts:163`,
      `compactTransportRead.test.ts`,
      `batchedReadsTiming.test.ts:218`, `IncludeMainProgramsHandlers.test.ts:88`,
      `packageWalks.test.ts`, `projectionWalk.test.ts:423`, `projectionBoundary.test.ts`
      (`:337`, `:558`, `:649`–`:719`), `IncludeHighHandlers.test.ts:482` and
      `TableTypeHighHandlers.test.ts:647`. They compile unchanged once the builders are
      split (Inference: the key is then on the definition's one shape).
  - **Batches,** each green under `npm run test:check` and CI's step list before the next.
    Each batch carries its own call fixes and test sites, so no commit breaks the normal
    build.
    - **The ordering rule:** a caller converts in the same batch as its callee, or later.
      Each inline literal, spread definition and caller-typed contract goes in its
      directory's batch, so each high check wrapper goes with its low callee. Codex measured
      the break otherwise: low CheckClass and CheckDdl converted in batch 2 with their
      wrappers left behind fail at `handleCheckClass.ts:51` and `handleCheckDdl.ts:53`.
    - A compact facade may go before its callee: its own type is no looser than the callee's
      hand type today, and the full conversion compiles (Measured).
    1. **The splits and the compact handlers.**
       - The three builder splits.
       - The 12 compact spread definitions, the 20 mechanical compact types (compact-modify
         4, compact-readonly-entries 10, `src/lib/compact` 6) and `handleHandlerGet`.
       - HandlerGet's local `args` typed by its definition's output.
       - The HandlerValidate narrowing, with its characterization tests first.
       - The `compactActivateTypes.test.ts` and `routesParseTargets.test.ts` adaptations.
    2. **Write-side directories:** behavior_definition 6, behavior_implementation 3,
       class 14, data_element 7, ddl 6, ddlx 5, domain 7 (48 mechanical).
       - Their inline literals: the check wrappers of class, ddl, behavior_definition,
         data_element, ddlx and domain.
       - The CreateDomain `super_package` read removed.
    3. **function 9, function_group 2, function_include 3, function_module 1, include 6,
       interface 6, message_class 8, metadata_extension 1, package 7, program 6** (49
       mechanical).
       - Their inline literals: the check wrappers of function (CheckFunctionModule,
         CheckFunctionGroup), interface, package and program, and the two function_include
         lists.
       - `IncludesListArgs` and the `mainTypeBoundary.test.ts` GetIncludesList tables, as the
         owner decides.
    4. **service_binding 7, service_definition 4, structure 6, table 6, table_type 7,
       transport 10, enhancement 1, atc 4, common 4** (49 mechanical).
       - Their inline literals: CheckStructure, CheckTable, GetStructuresList and
         GetTableContents.
       - RunATC.
       - From common: GetObjectDraft and the three version reads; `handleDeletionCheck`'s
         `Args`, `ActivateObjectArgs` and `ActivationRunArgs` / `ActivationStatusArgs`.
       - The `compactRequiredArguments.test.ts:314` adaptation (below), with
         ValidateServiceBinding's conversion.
    5. **system 14, unit_test 21, and search** (35 mechanical).
       - `ScheduleProfilerTraceArgs` from the compact schema; `StartUnitTestRunArgs`.
       - The inline literals of system and search (GetSqlQuery, GetTransaction,
         GetObjectInfo, GetInactiveObjects, GetAdtTypes, GetObjectStructure,
         GetServiceBindingPreviewUrl, SearchObject, GetObjectsList, GetObjectsByType).
       - GetObjectOutline, GetWhereUsed and `handleRunAbapUnit`.
       - The GetObjectStructure fallback, as the owner decides (below).
    6. **The 17 source readers** and `SourceRangeArgs`. Batches 2 to 5 leave both as they are,
       and no other conversion depends on them.

    For each batch:
    - **Tests first:**
      - a positive pairing per converted directory in `__typechecks__/exact/`: the real
        definition and handler, for example `defineTool(ActivateDomain.TOOL_DEFINITION,
        handleActivateDomain)`, compile under the option;
      - for the spread definitions, a typecheck that each variant's schema output is
        assignable to the handler's `args`;
      - the batch's test sites adapted as above;
      - the listed-schema and surface fixtures and the pinned renderings, unchanged.
      - The existing negative test (`defineTool.test.ts`) stays.
    - **Gate enrolment.** The batch's pairing typechecks join
      `tools/exact-optional-files.json` at once.
      - A converted handler file joins when `measure:exact` reports none of its own
        diagnostics.
      - Otherwise it joins with the S2d batch that clears its sites, or in S5 for a site
        against an upstream contract.
    - **Deliberate breaks:**
      - restore one hand-declared type of the batch with `prop?: T` (batch 2:
        `ActivateDomainArgs` with `detail?: …`), and its pairing fails under
        `test:check:exact`;
      - batch 1: merge one split builder back into its union, and the handler's read of the
        key fails `test:check`;
      - batch 5: type `ScheduleProfilerTraceArgs` from the high tool's schema again, and
        `compact-modify/src/group.ts` fails `test:check`;
      - batches 2 to 4: leave one check wrapper on its inline `version?: string` while its
        low callee is converted, and the wrapper's call fails `test:check`;
      - for a spread definition: narrow its handler's `object_type` to the cloud members,
        and the on-premise variant's typecheck fails.
  - **Acceptance:**
    - every `defineTool` pairing's handler takes its definition's output, and each
      caller-typed contract takes its caller's;
    - the measurement shows the 223 TS2345 handler-group errors gone;
    - tools/list unchanged.
- **S2b. The MCP SDK transport adapter** (spec §3), `SdkTransport implements Transport`, in
  server-runtime.
  - **Tests first,** with the installed SDK:
    - `Server.connect` over the adapter chains its handlers without recursion;
    - an SDK `onclose`, `onerror` and `onmessage` each reach the protocol's handler;
    - `sessionId` is copied when the SDK has one, absent when it has none;
    - Streamable HTTP and SSE serve `tools/list` through it.
  - **Deliberate break:** a getter that reads the current field ends in `RangeError`, and the
    test goes red.
  - Both `server.connect(transport)` sites use it.
- **S2c. The server's own contracts.**
  - The exported contracts of spec §8 widen their optional fields that callers fill from a
    possibly absent value. Examples are `InstanceStateOptions.idleMinutes` and
    `BatchAnswer.raw`. The full list is in spec §8: `@mcp-abap-adt/lib`, `/debugger`,
    `/utils`, `/request-context`, `/state`, `/handlers/write`, and server-runtime's config and
    server options.
  - A value handed to a third party's `?: T` goes by conditional spread.
  - **Tests first:** a typecheck per widened exported contract, under the option, passing
    `undefined`.
  - **Deliberate break:** narrow one back, and it goes red.
- **S2d. The rest, in batches,** by the measured counts of the root project, then the packages.
  1. `src/lib/debugger` (50) and `src/lib/compact/debug` (30 + 9);
  2. `src/handlers/common` (50);
  3. `src/handlers/system` (31) and `src/handlers/unit_test` (27);
  4. `src/lib/strategies` (25);
  5. the remaining `src/handlers/*` directories;
  6. the rest of `src/lib` and `src/embeddable`;
  7. server-runtime (37);
  8. compact-readonly-entries (56), compact-modify (14) and responsible-rules (1).

  For each batch:
  - its files join `tools/exact-optional-files.json`;
  - each site is narrowed in plain code or typed by its contract;
  - a `T | undefined` that reached a callee assuming `T` is a revealed defect, with a
    failing-first test first.
  - **Deliberate break per batch:** pass one possibly absent value on again in the batch, and
    `test:check:exact` goes red.
- **S2e. Sites that meet upstream contracts** (the 126 sites against interfaces-adt and
  adt-clients, and the 102 TS2769 among them). These wait for U2 and U3's publication and are
  done in S5.
- **S2f. The option on.**
  - In the root `tsconfig.json`, and in the six configs that do not extend it:
    background-runs-memory, http, responsible-rules, server-runtime, server and sse.
  - In every `tsconfig.test.json` and in `tsconfig.node-test.json`. Test files' errors under
    the option (Measured: 247 in the root test project) are fixed in this step, with no
    config overriding the option.
  - **When.** S2f is completed together with S5, as soon as U2 to U4 are published: the
    upstream sites must compile. The spec lets step 3's upstream sites wait (spec §7). If the
    releases are out before S3, S2f and S5 come before S3; otherwise S3 and S4 go on, and S2f
    and S5 follow the publication.
  - `tools/exact-optional.mjs`, its list and `test:check:exact` go once every config carries
    the option.
  - **The RFC hole.** A typecheck in the production project assigns `{ …rfcLogon, url:
    undefined }` to `ISapRfcLogon`, marked `@ts-expect-error`.
    - **Deliberate break:** take the option out of the root config. The assignment then
      compiles, the directive is unused, and `test:check` goes red.
  - **The RFC construction scan** (`configConstructionScan.ts`) is re-measured under the
    production option: its "merged `never & undefined`" limit is either removed with its
    fixture, or kept and named.

### S3. The `unknown` audit (spec §4; order step 4)

- **S3a. The provenance script as a source test** (`unknownSources.test.ts`), written first
  with its fixtures. It runs over the
  code as it is, with the language service and the type checker, following sources through
  `unknown` variables and parameters. It recognises:
  - boundaries, by their origin: `catch`, `JSON.parse`, the XML parser, `process.env`, file
    reads, a network answer's `data`, tool arguments, third-party contracts typed `unknown`;
  - sinks named by their contract (`ILogger`, a serializer);
  - callbacks called only by an outside contract.
  - **Fixtures first,** each reported or not by its class:
    - a typed site;
    - a value laundered through an `unknown` variable;
    - a boundary narrowed in plain code;
    - a named sink (an `ILogger` method);
    - an unnamed sink: a function of the repository that accepts anything, named by no
      contract in the sinks' fixture. It must be refused;
    - a library callback;
    - a mixed site.
  - **Deliberate breaks:**
    - stop following sources through `unknown` variables: the laundered fixture is no longer
      refused;
    - accept every sink without checking its contract name: the unnamed-sink fixture is no
      longer refused.
- **S3b. The sites,** per the spec's appendix and the script's output:
  - typed parameters retyped;
  - mixed ones split at the boundary or given a union;
  - the decided variables and returns, among them `BaseMcpServer.ts:2836` (the registration
    wrapper, typed from the SDK's `registerTool` / `tool` signatures) and the `vocabulary.ts`
    reads;
  - properties checked by their writers;
  - the handler checks S2a lists as dead: a runtime check of a value the handler's `args`
    type now proves (a code the schema's enum already holds, case-folded again), each
    removed with the boundary test S2a points at it kept green. This item waits for the
    owner's answer on direct calls (S2a); under reading (b) the checks stay.
    - **HandlerGet's part check** (`handleHandlerGet.ts:212`) is not yet proved by the type.
      `compactGetSchemaFor` builds `extra` as `string[]` (`compactSchemas.ts:597`), and
      spreading it into `z.enum` (`:615`) widens `part`'s output to `string | undefined`.
      The check is what narrows `part` for `routeCompactPart` today. Codex measured: with it
      removed, the routing call fails TS2345.
    - So, before that check goes:
      - `readPartFor` keeps the literal union: `extra` typed as a list of read parts, not
        `string[]`;
      - the address-part and run-part dispatch narrows that union statically, a `switch` on
        the literal where `ADDRESS_PARTS.includes` / `RUN_PARTS.includes` are today;
      - a typecheck pins `part`'s output as the read-part union, written first;
      - the tests that pass `part` as a `string` are typed by the union or parse their
        arguments with HandlerGet's schema, in the same batch, with every request and answer
        assertion kept. Codex measured (round 5): `packageWalks.test.ts:591`'s `contents`
        helper (TS2345 at `:601`, `:607`, `:619`, `:633`, `:647`, `:669`, `:687`, `:699`)
        and the `part` column of `routesParseTargets.test.ts:17` (TS2322 at `:110`).
    - Neither needs a cast, and no listed schema changes (the enum's values stay).

  Each retyping that changes behaviour gets a failing-first test.
- **S3b in batches,** each verified by `npm run measure:unknown` (its list shrinks by the
  batch's sites):
  1. the 33 typed parameters (the appendix);
  2. the mixed parameters in `src/lib/strategies` (14);
  3. `src/lib/xml` (8) and `src/lib/debugger` (7);
  4. `src/lib/batch` (6) and `src/lib/backgroundRuns` (5);
  5. `src/handlers/unit_test` (5), `src/handlers/system` (4), `src/handlers/common` (4) and the
     rest;
  6. the variables and returns of the appendix (6 typed, 5 boundary);
  7. the 64 properties, by owner type;
  8. the other projects' sites.

  **Deliberate break per batch:** revert one retyped site of the batch to `unknown` with its
  hand narrowing; `measure:unknown` lists it again.
- **S3a's source test is added last in S3,** once nothing is refused. Its deliberate break (the
  laundered fixture) is checked then, and again with one site of S3b reverted in the real
  code.
- **Acceptance:** the source test refuses nothing.

### S4. The test infrastructure's `any` (spec §5; order step 5)

- **Files:** `src/__tests__/helpers/`, every `__tests__/**/helpers/` and `testers/`
  (`HighTester`, `LambdaTester`). Among them `configHelpers`, `persistenceHelpers`,
  `sharedObjects`, `sessionHelpers`, `testHelpers`, `adtStandIn`, `fakeClient` and
  `recordingConnection` (Measured: 80 + 22 `any`).
- **Replacements:**
  - parsed YAML through a zod schema of the test config;
  - a fake `IAbapConnection` that implements it. Until S5 it implements v4's generic
    `makeAdtRequest`, and the assertion that takes is allowed in tests (spec §5: only `any` goes
    there). In S5 it becomes the plain non-generic method and the assertion goes;
  - fake clients that implement their contract, or the `Pick` the code under test takes;
  - one typed `HandlerContext` builder;
  - testers taking `z.output` of the handler they drive.
- **Tests first:**
  - Biome's `noExplicitAny` and `noImplicitAnyLet` on for those directories;
  - the scan's `any` rule over the infrastructure, with a refused fixture under a `helpers`
    directory.
- **Deliberate break:** re-add one `any` in a helper, and both go red.
- The other assertions in tests stay (spec §5).

### S5. The upstream releases taken from the registry (spec §2; order step 6)

After U1 to U4 are published.

- **Ranges:**
  - interfaces-adt-connection `^5.0.0`, interfaces-adt `^27.4.0`, adt-clients `^45.5.0`,
    adt-strategies `^0.23.0`, adt-clients-legacy `^0.9.4` where it is named, connection
    `^24.0.0` (U4 as done: a major);
  - in the root `package.json` and in every package that declares them.

  Lockfile by npm only, then checked.
- **The server's own changes:**
  - the five pass-throughs drop `<T, D>`: `envelopeWatch.ts`, `lateBound.ts`, `phases.ts`,
    `recorder.ts`;
  - the three views become non-generic, so the BLOCKED assertions go;
  - `BLOCKED` is deleted from `staticTypes.test.ts`, with the Biome override for its two
    files;
  - S2e's upstream sites compile without a spread.
- **Tests first:** `staticTypes.test.ts` with an empty BLOCKED (the scan) goes red until the
  views change.
- **Deliberate break:** reintroduce one `as Promise<IAdtWireResponse<T, D>>`, and the scan and
  Biome go red.

### S6. The gate (spec §6; order step 7)

- **Biome.**
  - Production: the three rules as errors, with no override left.
  - Test infrastructure: `noExplicitAny` and `noImplicitAnyLet` as errors.
  - `lint:check` and the build's check name the same directories.
- **TypeScript:** `exactOptionalPropertyTypes` in every config (S2f).
- **The scan:**
  - every production rule over the S1 file set, and `any` over the test infrastructure;
  - no allow-list;
  - fixtures per refusal.
- **The unknown audit test** (S3a).
- **The measurement tools go:** `measure:exact` (with `exact-optional.mjs`, already gone in
  S2f) and `measure:unknown`. The source tests stand in their place.
- **The goal's measurement,** rerun with the compiler API:
  - 0 in every production column;
  - 0 `any` in the test infrastructure;
  - the test files' other columns reported as they stand (in the PR description).
- **Deliberate break of the whole gate:** one escape per rule, in a scratch commit not pushed;
  each must fail.

### S7. Docs

- **CHANGELOG 24.0.0** names the exported changes of spec §8, one line each:
  - handler `args` types, `ScheduleProfilerTraceArgs` and `StartUnitTestRunArgs` among them
    (now their compact caller's schema output);
  - the widened contracts;
  - `IAbapConnection` v5;
  - the new `/compact-shared` exports, the halves of the three split builders;
  - the connection range moving to 24.0.0 (U4 as done), named with what changed for an
    embedder if any exported signature of the server names connection's `AbapConnection`;
  - `SdkTransport`, if exported.
  - S2a changes no listed schema, so tools/list has no entry from it.
- **`MIGRATION-24.0.md`:** what an embedder holding a generic connection or calling
  `makeAdtRequest` with type arguments changes; an embedder that calls an exported handler
  with raw arguments (S2a: defaulted fields now present, enums where a string was taken)
  parses them with the tool's schema or calls the tool's entry; and connection 24.0.0's
  `AbapConnection` change, where an exported signature of the server names it.
- **`docs/`:** the developer docs that describe the scans and gates (the static-types and
  regex sections, the test infrastructure's conventions) are updated.
- **CLAUDE.md and SCOPE.md are not edited.**

### S8. Live runs (spec §9)

- After S6, with the owner's go: the read-only and CRUD suites on premise and cloud, once.
- Before every run: the realm check, the usual live rules, configs from the scratchpad copies.
- The changed areas are the handler arguments, the debugger, the compact inputs and the HTTP
  and SSE transports (the adapter).
- A failure is fixed before the release.

### S9. Before the release

- Delete the goal, the spec and this plan. What they owe goes into PR #346's description first:
  - the test files' remaining assertion counts;
  - connection's own generic method and its cast;
  - any follow-up in the other repositories.
- Verify every range resolves on the registry, and that a clean install of the release outside
  the repository installs.
