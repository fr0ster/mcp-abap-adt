# Plan: the business-data tools are opt-in

Goal: `2026-11-10-data-tools-opt-in-goal.md`. Spec: `2026-11-10-data-tools-opt-in-spec.md`.
The spec binds, and each step names the spec section it carries out. This plan lists the
steps, not the code. The code is written in each step, test first.

## Rules for the implementer

- **npm scripts only.** Never `npx`, `npm exec`, `node_modules/.bin`, `ts-node` or a
  `timeout` wrapper. A single test file runs through the repository's own test scripts.
- **Commit by path.** Use `git commit -- <path>…`, never `git add -A` or `git commit -a`.
- **Never `--no-verify`.** The pre-commit hook (lint-staged, then `npm run build`) runs on
  every commit.
- **Nothing is pushed** until the controller says so (step 11).
- **Waiting.** Start a long command with `~/.claude/scripts/start-detached <log> <cmd>` and
  wait for it with `~/.claude/scripts/wait-pid <pid> 30`. Never use `pgrep -f`, and never
  write a polling loop of your own.
- **Never print secrets.** No password, token, cookie, session file or `.env` value goes
  into a log, a commit, a test name, a report or a PR text.
- **No SAP system names, ids or users in a committed file.** This covers commit messages,
  test names, fixtures and docs.
- **Jest path flags.** Never pass `--testPathIgnorePatterns` together with a path. Run
  `--listTests` first to see what a selection runs.
- **Don't edit `CLAUDE.md` or `SCOPE.md`.** A needed change is proposed to the controller
  as text.
- **No SAP-facing command** except the live runs of step 12, and only once the live run is
  approved.
- **Static first.** No cast, no `any`, no `@ts-ignore`, and no regular expression in
  production code (goal, "Static first").
- **Where new tests go.** A new test file runs on node:test and is added to
  `tools/node-test-files.json`, as the repository places new files today. An existing test
  that a step changes stays on the runner it is on.

## Every code step ends green

Each code step runs these before its commit, in this order, and all of them pass:

- `npm run build`
- `npm run lint:check`
- `npm run test:check`
- `npm test` (the full unit suite)

**Every pinning test is shown to be load-bearing:**

1. Write the test first and see it fail against the code as it was.
2. Write the code that makes it pass.
3. Apply the step's mutation once, see the test fail, and revert the mutation.

A rule made of several conditions gets one mutation per condition, each with a case that
only that condition guards. The commit message names each mutation and the test that failed.

## Files the deferred-logon branch also touches

`feat/stdio-deferred-logon` is built from the same base. This plan's steps edit these
files too, so the second branch to merge resolves them by hand:

- **`src/lib/config/authParameters.ts`** (step 2). That branch adds
  `Parameter.unstatedInTemplate` and changes the template renderer. This plan adds a shared
  row beside `BATCH_KEEP_RAW_PARTS_ROW`. The hunks are separate; the merge keeps both.
- **`server-runtime/src/stdio/config/coreParameters.ts`** (step 2). That branch adds two
  rows to `CORE_ROWS` and two `CoreConfig` fields. This plan adds the shared row to the
  `coreParameters` rows list and `enableDataTools` to `readCoreConfig`'s answer. The two
  branches touch neighbouring lines.
- **`server-runtime/src/stdio/launcher.ts`** (steps 4 and 6). That branch changes the
  start path and `V2_HELP_SECTIONS`. This plan changes the `registryOf` call (`:860`) and
  adds the variable to `V2_HELP_SECTIONS`. Both add lines to the same help list.
- **`server-runtime/src/stdio/__tests__/config/coreTable.test.ts`** (step 2). Both branches
  add rows to its expected lists, and both add a field to its "sets nothing" template case.
- **`tools/node-test-files.json`** (every step that adds a test file). Both branches add
  entries; the merge keeps all of them, sorted.
- **`CHANGELOG.md`** (step 10) and **`docs/user-guide/CLI_OPTIONS.md`**,
  **`docs/configuration/YAML_CONFIG.md`** (step 9). Both branches add items under
  `## [24.0.0]` and rows to the option tables.

Whichever branch merges second rebases onto the first and reruns its own step's tests
before the merge.

## Open check (no production code)

1. **Which tests reach the data tools, and by which path** (spec §6). The spec lists the
   callers. One is marked Inference: `src/__tests__/helpers/batchEntryCases.ts:200-201,
   416-417`. Confirm it by reading the code. For every file the spec lists under "through a
   tool set" and "through the groups directly", record in appendix A:
   - the line that builds its set or group;
   - whether it needs the flag on (it reaches a data tool) or is indifferent.

   Also list, from the source, every caller of `ToolSet.groups`, `registryOf`,
   `streamableHttpSurface`, `compactToolSetOf`, `compactReadOnlyToolSetOf`, and every
   direct `new ReadOnlyHandlersGroup` / `new SystemHandlersGroup` /
   `compactReadOnlyEntries` outside `src/lib`. These are the sites step 3 must update. If a
   caller is found that the spec does not name, the step stops and reports it to the
   controller.

   Commit: the appendix, by path.

## The code

2. **The flag row, in every binary's table** (spec §2).
   - **Code:**
     - `src/lib/config/authParameters.ts` gains the three name constants and
       `ENABLE_DATA_TOOLS_ROW` (`kind: 'flag'`, `default: false`, section `DATA TOOLS`,
       the spec's help words), beside `BATCH_KEEP_RAW_PARTS_ROW`. They are exported
       through `src/lib/config/index.ts`.
     - `IServerConfig.enableDataTools?: boolean` is added beside `batchKeepRawParts`.
     - The row goes into `coreParameters`, `httpParameters` and `sseParameters`.
     - `readCoreConfig`, `readHttpConfig` and `readSseConfig` answer it as
       `values.enableDataTools === true`.
     - Nothing reads the field yet.
   - **Tests first**, in a new `src/__tests__/unit/config/enableDataTools.test.ts`, each
     case run through the three readers:
     - none given → `false`;
     - a bare `--enable-data-tools` → `true`;
     - the environment alone → `true`;
     - YAML alone → `true`;
     - CLI `--enable-data-tools=false` with `MCP_ENABLE_DATA_TOOLS=true` → `false`;
     - CLI `true` with the environment `false` → `true`;
     - the environment `false` with YAML `true` → `false`;
     - the environment `true` with YAML `false` → `true`;
     - an empty environment value falls through to YAML;
     - `yes` in each form, and a YAML list, are refused with a message naming the form;
     - each binary's `--help` lists the flag, the variable and the key, under
       `DATA TOOLS`;
     - each table's generated template states `enable-data-tools: false`.
   - **Tests first, stdio:** `readCoreConfig` with a destination `.env` stating
     `MCP_ENABLE_DATA_TOOLS=true` answers `false`.
   - `server-runtime/src/stdio/__tests__/config/coreTable.test.ts` gains the row in its
     expected lists and the field in its template case. See the shared-files section.
   - **Mutations, one per condition:**
     - the environment form removed from the row: the environment cases fail;
     - the YAML key removed: the YAML cases fail;
     - the default made `true`: the none case fails;
     - the row left out of `sseParameters`: only the SSE cases fail;
     - `readRow`'s environment and YAML sources swapped: the environment-over-YAML cases
       fail. Revert this one at once, since it is shared code.
   - **Commit:** the files above and `tools/node-test-files.json`, by path.
3. **The data groups and the typed choice** (spec §3).
   - **Groups:**
     - a new `src/lib/handlers/groups/DataHandlersGroup.ts` registers `GetSqlQuery` and
       `GetTableContents`, exported from `groups/index.ts`;
     - the two entries leave `SystemHandlersGroup` and `ReadOnlyHandlersGroup`.
   - **Compact:**
     - a new `compactDataEntries` in `compact-readonly-entries/src/group.ts` builds
       `HandlerGetData`, exported from that package's `index.ts`;
     - the entry leaves `compactReadOnlyEntries`.
   - **The typed choice:**
     - `ServedTools` in `src/lib/toolSet.ts`;
     - a required third argument for `ToolSet.groups`, `registryOf` and
       `streamableHttpSurface`;
     - each of the four sets adds its data group or builder only when `dataTools` is
       `true`, at the place the spec names;
     - `CompactHalves` gains `data`, and `compactReadOnlyToolSetOf` takes
       `{ readOnly, data }`;
     - the six compact launchers pass `compactDataEntries`.
   - **Callers** from appendix A:
     - the three runtime launchers pass `{ dataTools: false }` for now; step 4 wires the
       config;
     - `scripts/list-tools.ts` and `tools/generate-tools-docs.js` pass `{ dataTools: true }`,
       so the pages keep the tools until step 9 marks them;
     - every test helper and test the appendix found passes what it needs: `servedEntries`
       and the descriptions catalog pass `{ dataTools: true }`, and the group-direct tests
       add the new group.
   - **Fixtures.** The one fixture set stays the flag-on surface. It is regenerated where
     the order or the group of a tool changed, and the diff shows nothing else. That is
     checked in the commit by comparing sorted names and schemas before and after.
   - **Tests first**, in a new `src/__tests__/unit/toolSet/dataTools.test.ts`:
     - For each of the four sets × three transports, compare the names served with
       `{ dataTools: true }` against the names served with `{ dataTools: false }`. The
       difference must be exactly `GetSqlQuery` and `GetTableContents` (full sets) or
       exactly `HandlerGetData` (compact sets).
     - With `false`, none of the three names appears.
     - With `true`, the names equal the fixture's for that set and transport.
     - Each set's flag-off surface equals its fixture minus exactly the three names
       (spec §6, §8).
     - Through each of the three registration paths, for one set with the flag off,
       `tools/list` carries none of the three names, and `tools/call` of each is answered
       "Tool … not found". The paths are:
       - a `BaseMcpServer` instance;
       - a `CompositeHandlersRegistry` registered on an SDK server;
       - a group's own `registerHandlers`.
   - **Mutations, one per condition:**
     - the data group added whatever `dataTools` says: the off cases fail;
     - the data group never added: the on and fixture cases fail;
     - `GetTableContents` left in `ReadOnlyHandlersGroup`: the difference and the
       registration-path cases fail for the full sets;
     - `HandlerGetData` left in `compactReadOnlyEntries`: the compact cases fail;
     - the data builder left out of `compactReadOnlyToolSetOf` alone: only the
       compact read-only cases fail.
   - **Commit:** by path.
4. **The launchers read the flag** (spec §3, "The launchers pass the config").
   - **Code:** stdio (`launcher.ts:860`), Streamable HTTP (`http/launcher.ts:171`) and SSE
     (`sse/launcher.ts:169`) pass `{ dataTools: config.enableDataTools === true }`.
   - **Tests first**, in a new `server-runtime/src/__tests__/dataToolsAtStart.test.ts`,
     each launcher started in-process the way the existing start tests do
     (`http/__tests__/systemTypeAtStart.test.ts`):
     - `tools/list` carries the data tools with the flag and none without it;
     - for stdio, the same holds for the compact launcher's set through `main`.
   - **Mutations, one per launcher:** that launcher keeps `{ dataTools: false }`, and its
     with-flag case fails.
   - **Commit:** by path.
5. **The embeddable API** (spec §4).
   - **Code:**
     - `HandlerSet` gains `'data'`;
     - `expositionGroups` adds `DataHandlersGroup` for it;
     - `EmbeddableMcpServer`'s `exposition` type gains `'data'`, and `createDefaultRegistry`
       adds the group for it. The default stays `['readonly', 'high']`;
     - `HandlerExporter` gains `includeData?: boolean`, read as `=== true`, with a doc
       comment saying why it differs from its siblings.
   - **Tests first**, in a new `src/__tests__/unit/embeddable/dataTools.test.ts`:
     - `EmbeddableMcpServer` with the default exposition lists none of the data tools;
     - with `'data'`, it lists both;
     - `registryForExposition` with and without `'data'` behaves the same way;
     - `HandlerExporter` without `includeData`, and with `includeData: false`, hands out
       none;
     - with `includeData: true`, it hands out both, through `getHandlerEntries()` and
       `createRegistry()`.
   - **Mutations, one per condition:**
     - `includeData` read as `!== false`: the absent case fails;
     - `'data'` put into the default exposition: the default case fails;
     - `expositionGroups` ignoring `'data'`: the registry case fails.
   - **Commit:** by path.
6. **The words in the code and in the help** (spec §5, "The code's own words").
   - **Code:**
     - The comments that say the set is fixed "never by a flag" are rewritten:
       `toolSet.ts:10-44, 101`, `stdio/launcher.ts:291, 859`.
     - `toolsSection` gains the data-tools line in every set's help: the three names, the
       flag and FAQ Q33.
     - stdio's `V2_HELP_SECTIONS` lists `MCP_ENABLE_DATA_TOOLS`. See the shared-files
       section.
   - **Tests first**, in the step 2 test file:
     - every binary's `--help` carries the FAQ Q33 citation and the customer's-decision
       sentence exactly once;
     - the TOOLS section names the flag;
     - no help still says the set is chosen "not a flag" without the exception.
   - **Mutations:**
     - the line removed from `toolsSection`: the TOOLS case fails;
     - the help words without the customer's-decision sentence: the sentence case fails.
   - **Commit:** by path.
7. **The live harness launches with the flag** (spec §6, live cases).
   - **Code:**
     - `destinationArgs` (`src/__tests__/integration/helpers/testers/hardMode.ts:801-830`)
       adds `--enable-data-tools`;
     - `startHttp` (`:680-686`) adds it to its argument list;
     - the integration README says that a hard-mode run against an HTTP server already
       running at `http_url` serves the data tools only if that server was started with
       the flag.
   - **Tests first:** a unit case beside the existing hard-mode argument tests (located in
     step 1's appendix) asserts that both argument lists carry the flag.
   - **Mutation:** the flag dropped from `startHttp` alone, and only the HTTP case fails.
   - No live run in this step.
   - **Commit:** by path.

## Checks, docs, release, review

8. **CI's whole step list, run locally** (`.github/workflows/ci.yml`), in its order:
   - `npm ci --ignore-scripts`, with the lockfile unchanged;
   - `npm run lint:check -- --diagnostic-level=error`;
   - every package's `npm --prefix <package> run lint:check` that CI names;
   - `npm run build`;
   - `npm run test:check`;
   - `npm test`;
   - `npm run test:install`;
   - every package's `npm --prefix <package> run test:check` that CI names;
   - `npm audit --audit-level=moderate`;
   - the pack and install checks and the Docker image builds, as CI runs them.

   A step that cannot run here says why in the PR description.
9. **The docs** (spec §5):
   - **README:**
     - "Features" marks `GetTableContents` and `GetSqlQuery` opt-in;
     - "Command-Line Options" gets the paragraph: off by default in every binary and for
       embedders; the flag in its three forms; FAQ Q33 quoted with its URL; the decision
       is the customer's; the other tools that can reach business data are named, with the
       note that they are a separate, later task.
   - **`docs/MIGRATION-24.0.md`** gets the section the spec lists, embedders included. No
     released MIGRATION file is touched.
   - **User docs:**
     - `docs/user-guide/CLI_OPTIONS.md` (the row);
     - `docs/configuration/YAML_CONFIG.md` (the key);
     - `docs/user-guide/HANDLERS_MANAGEMENT.md:85`;
     - `docs/user-guide/BATCH_MODE.md:514, 520, 577` (the note);
     - `docs/deployment/DOCKER.md` (the variable).
   - **Tool pages:** `tools/generate-tools-docs.js` marks the three tools "opt-in:
     `--enable-data-tools`". The pages are regenerated with `npm run docs:tools` and
     committed.
   - **Registry manifests:** the twelve `server*.json` files gain `MCP_ENABLE_DATA_TOOLS`.
   - Every claim is checked against the code as built.
   - **Commit:** by path.
10. **The CHANGELOG** under `## [24.0.0]`, with today's date set on the heading. It gets the
    two items the spec names, each with its **Migrating:** line. Earlier entries are not
    touched. The date is checked again on the release day.
11. **The push.** This is the controller's job: the controller pushes the branch and
    watches the PR's CI to its end on every platform and Node version.
12. **The live runs of the data tools with the flag on, only when the live run is
    approved.**
    - **The realm check comes first.** An unauthenticated `GET` of the system's ADT
      discovery URL must answer `401` with the expected realm, and nothing logs on. The
      controller names the URL and the realm at the go, and neither goes into a committed
      file. Any other answer stops the run.
    - **Then the live files:**
      - `integration/readOnly/system/SqlQueryHandlers.test.ts`;
      - `integration/readOnly/system/TableContentsHandlers.test.ts`;
      - `integration/coverage/backgroundRuns.live.test.ts`.

      Each runs one file at a time through `npm run test:integration -- <path>`, in soft
      mode, then in hard mode on stdio and on Streamable HTTP.
    - Each log is saved in full. The results go into the PR description, with no system
      name.
13. **A Codex review** of the whole PR, with the goal and the spec quoted to it. Its
    findings go to the controller, checked against the goal and the spec. Only what those
    cover is fixed, in this PR.
14. **The goal, the spec and this plan are deleted** before the release that ships the
    work, by path, in this PR. Anything they still owe goes into the PR description first.

## Appendix A — the open check

Read at `dc1db054` with `git grep` over every tracked `.ts` and `.js` file, for
`.groups(`, `registryOf(`, `streamableHttpSurface(`, `compactToolSetOf(`,
`compactReadOnlyToolSetOf(`, `new ReadOnlyHandlersGroup`, `new SystemHandlersGroup`,
`compactReadOnlyEntries`, `new CompactReadOnlyHandlersGroup`, `expositionGroups(` and
`registryForExposition(` (Measured). "Data" means the file names one of the three tools
(Measured, `grep -c`).

### `batchEntryCases.ts`, the spec's one Inference

The file holds case data only and imports nothing but `adtCorpus` (Code,
`src/__tests__/helpers/batchEntryCases.ts:13`). It reaches its tools through
`batchHarness.servedTools` (Code, `src/__tests__/helpers/batchHarness.ts:208-220`). That
helper builds `ReadOnlyHandlersGroup`, `SystemHandlersGroup` and
`CompactReadOnlyHandlersGroup` directly, so it needs the data groups to keep the three
cases (`batchEntryCases.ts:200-201, 416-417`).

### Callers the spec names

- The three runtime launchers.
- The six compact launchers.
- `scripts/list-tools.ts` and `tools/generate-tools-docs.js`.
- `EmbeddableMcpServer.ts`, `HandlerExporter.ts` and `expositionRegistry.ts`.
- `servedEntries.ts`, `descriptions/catalog.ts` and `variantSearchMeta.test.ts`.
- `backgroundRuns/surface.test.ts` (data) and `toolSurface.test.ts`.
- `toolSet/compactSurface`, `transportSurface`, `variantSurface` and `listedSchemas`.
- The coverage keys.
- `longTools/harness.ts` (data), `backgroundRuns/longReads.test.ts` and
  `pins/backgroundRuns.pins.test.ts`.
- `backgroundRuns.live.test.ts` (data; the spec names it as a live case only).

### Callers the spec does not name: the step stops here

- **Production code and its tools:**
  - `compact/tools/generate-docs.js:259-306` builds the compact tool page from
    `compactReadOnlyEntries`, `compactToolSetOf`, `compactReadOnlyToolSetOf` and
    `streamableHttpSurface`. It would lose `HandlerGetData`, and its `streamableHttpSurface`
    call would lack the new argument.
  - `src/lib/handlers/examples/usage-example.ts:29-125` builds `ReadOnlyHandlersGroup` and
    `SystemHandlersGroup`. It is compiled with `src` (Code, `tsconfig.json:27-34`).
- **A class the spec does not name.** `CompactReadOnlyHandlersGroup`
  (`compact-readonly-entries/src/group.ts:131-137`) serves `compactReadOnlyEntries()`. With
  `HandlerGetData` moved out, the class loses it as well. The spec does not say whether
  embedders get a compact data group class beside `compactDataEntries`. Direct users of the
  class:
  - `batchHarness.ts:217`, `batchStand.ts:138`, `longTools/harness.ts:114`,
    `stateful/harness.ts:64`, `backgroundRuns/harness.ts:104`;
  - `noSessionParameters.test.ts:95`, `sources/longHandlers.test.ts:65, 97`,
    `sources/batchHandlers.test.ts:65` (data), `embeddable/exporterRegisterOnServer.test.ts:389, 421`,
    `backgroundRuns/surface.test.ts:345, 551`, `toolSet.test.ts:141, 174`.
- **Docs that describe the API:**
  - `src/embeddable/docs/ARCHITECTURE.md:323, 667-670` names `ToolSet.groups(context,
    transport)`, `compactReadOnlyToolSetOf(readOnly)` and `registryOf(toolSet, transport)`;
  - `src/lib/handlers/README.md:17-114` builds the groups.
- **Test helpers:** `batchHarness.ts`, `batchStand.ts`, `pinServer.ts:159-166`,
  `servedTools.ts:140-187`, `backgroundRuns/harness.ts:100`, `stateful/harness.ts:59-64`,
  and `integration/helpers/live.ts:253` (hard mode's set choice).
- **Tests** that call `groups`, `registryOf`, `streamableHttpSurface` or the compact set
  builders, so each needs the new argument at least. None names a data tool unless marked.
  Many compare whole name lists (Measured, `toEqual` counts):
  - the nine binary packages' `launcher.test.ts` (`compact`, `compact-http`, `compact-sse`,
    `compact-ro`, `compact-http-ro`, `compact-sse-ro`, `core-ro`, `http-ro`, `sse-ro`);
  - in `compact-readonly-entries`: `compactTransportRead.test.ts` and
    `deletionCheck.test.ts`;
  - `compact/src/__tests__/compactProgramIsOnprem.test.ts` and
    `server-runtime/src/sse/__tests__/backgroundRunCut.test.ts`;
  - `integration/high/include/IncludeHighHandlers.test.ts:667`;
  - under `src/__tests__/unit/`:
    - batch: `batch/recording`, `batch/surface`;
    - cancel: `cancel/startedToolRunsOn`, `cancel/substitutionSites`;
    - `compactCoversLow`;
    - debugger: `debugger/compactFourTools`, `debugger/debugBatch`,
      `debugger/exposition`;
    - embeddable: `embeddable/plainRegistration`;
    - `freshConnection`, `fullUpdatesLockThemselves`;
    - `leftoverSessions/expositions`;
    - `lowToCompact`, `packageHigh`;
    - `readonlyHighSameNameDedup`, `readOnlyToolsPage`, `readTools/getPart`;
    - state: `state/longSession`, `state/stateHandleWords`;
    - `toolDocsGenerator`;
    - toolSet: `toolSet/compactGroupContext`, `toolSet/httpToolDocs`, `toolSet.test`,
      `toolSet/variantDescriptions`, `toolSet/variantNeeds`,
      `toolSet/variantProperties`.

Most of these need a mechanical change only (Inference). The two production callers, the
unnamed class and the docs are decisions the spec leaves open.
