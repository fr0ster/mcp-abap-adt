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

Releases already moving: interfaces-adt 27.3.0 is published. adt-clients 45.4.0
(verdict-session, mcp-abap-adt-clients#310) is being built in
`mcp-abap-adt-clients/.worktrees/verdict-session`. The typing minors below come after it.

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

### U3. adt-clients 45.5.0 and adt-strategies (minor) — repository mcp-abap-adt-clients

Branched after 45.4.0 is merged and published.

- **Change.**
  - The ranges move to interfaces-adt-connection `^5.0.0` and interfaces-adt `^27.4.0`; also
    in adt-clients-legacy, if it names them.
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

### U4. connection 23.1.0 (minor) — repository mcp-abap-connection

- **Change.** The range of interfaces-adt-connection moves to `^5.0.0`. The generic
  `makeAdtRequest` keeps its signature (spec §2).
- **Tests first,** typechecks:
  - the connector is assignable to v5's `IAbapConnection` (compatibility);
  - a call `makeAdtRequest<string>(…)` on a value typed as the installed `IAbapConnection` is
    refused, marked `@ts-expect-error`. That holds only against v5, so it distinguishes the
    dependency.
- **Deliberate break:** pin the range back to 4. The `@ts-expect-error` is then unused, and the
  typecheck goes red.
- **Docs:** CHANGELOG 23.1.0. **Publish order:** after U1; independent of U2 and U3.

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

- **S2a. Handler arguments from the schema.**
  - The 247 hand-declared `…Args` types that are a handler's `args` become `z.output<typeof …>`
    of their schema, by handler directory.
  - A key a handler reads that its schema does not declare is declared in the schema (spec §3,
    as in the earlier spec).
  - **Tests first:**
    - the listed-schema fixtures and surface fixtures, unchanged;
    - a positive pairing per converted directory in `__typechecks__/exact/`: the real
      `TOOL_DEFINITION` and handler, for example `defineTool(ActivateDomain.TOOL_DEFINITION,
      handleActivateDomain)`, compile under the option.
    - The existing negative test (`defineTool.test.ts`) stays.
  - **Deliberate break:** restore `ActivateDomainArgs` with `detail?: …`, and its pairing fails
    under `test:check:exact`.
  - **Acceptance:** the measurement shows the 223 TS2345 handler-group errors gone.
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
  - properties checked by their writers.

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
  - interfaces-adt-connection `^5.0.0`, interfaces-adt `^27.4.0`, adt-clients `^45.5.0` (or
    the version the owner published), adt-strategies its minor, connection `^23.1.0`;
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
  - handler `args` types;
  - the widened contracts;
  - `IAbapConnection` v5;
  - `SdkTransport`, if exported.
- **`MIGRATION-24.0.md`:** what an embedder holding a generic connection or calling
  `makeAdtRequest` with type arguments changes.
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
