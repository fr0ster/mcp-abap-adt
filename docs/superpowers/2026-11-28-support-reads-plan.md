# Support reads over ADT — plan

The goal is `2026-11-28-support-reads-goal.md` and the spec is `2026-11-28-support-reads-spec.md`.
This plan breaks the spec into steps. Every behaviour is in the spec, not here; a step names
its spec section.

## How every step runs

- **TDD.** First the failing test the spec names, then the change that makes it pass, then
  the repository's own gates: build, `lint:check`, `test:check` and the unit tests. Every
  step ends green; no test is committed red.
- **Generated and pinned files with the change.** Every file a test compares against the
  tool set is regenerated in the same commit as the change it pins, so no check goes red
  between steps. The list was taken from a search of `src/__tests__` for every test that
  reads a generated file or asserts a count. Each file, with the tests that pin it:
  - `docs/user-guide/AVAILABLE_TOOLS.md`, `AVAILABLE_TOOLS_READONLY.md` and
    `AVAILABLE_TOOLS_HIGH.md`, written by `tools/generate-tools-docs.js`:
    `readOnlyToolsPage`, `httpToolDocs` and `toolDocsGenerator`;
  - `compact/docs/AVAILABLE_TOOLS.md`: `httpToolDocs`;
  - `tools/tool-search.json`: `toolSearchTable`, `variantSearchMeta`, `semanticItems` and
    `listedSchemas`;
  - under `tests/fixtures/tools/`:
    - `listed-schemas.json`: `fixtureBytes`, `listedSchemas`, `rebuiltDescriptions`,
      `hardModeBinaries` and `coverageKeys`;
    - `variant-surface.json`: `fixtureBytes` and `variantSurface`;
    - `http-surface.json` and `stdio-sse-surface.json`: `fixtureBytes`,
      `transportSurface` and `dataTools`;
    - `listed-prompts.json` and `prompt-texts.json`: `fixtureBytes`, `promptListing` and
      `toolDocsGenerator`;
    - `surface.json`: `compactSurface` and `toolSurface`;
    - `rebuilt-descriptions.json`: `rebuiltDescriptions`;
    - `changed-handler-requests.json`: `changedHandlerRequests` and `draft.pins`. A new
      `HandlerGet` type adds its cases (one per value of the dispatching argument per
      variant), each recorded from the parity stand-in and reviewed in the diff;
    - `coverage-ledger.json` and the served-tool count in `coverageLedger.test.ts` (329
      today): see **Coverage** below;
  - `tools/long-handlers.json`: `longHandlers`, `batchHandlers` and `toolSurface`, in
    step 12;
  - `tools/batch-handlers.json` with `docs/user-guide/BATCH_MODE.md` (`batchModePage`,
    `batchHandlers` and the `batch/` tests): unchanged, because the support reads are not
    admitted to batch mode (spec §4.1 "Batch"). Step 18 checks that they stay equal.

  Searched and not touched by this work, because none of them lists these tools or entries:
  `shipped-readings.json` (a fixed list of tools), `terse-goldens.json`,
  `stateful-sites.json`, `connection-ends.json`, `separate-runs.json`,
  `node-test-placed.json`, `low-to-compact.json`, `PROMPTS.md`, `CLIENT_CONFIGURATION.md`
  and `MIGRATION-24.0.md`. If a step's own run shows otherwise, the file is regenerated in
  that step.

  A step that adds or changes a tool, a compact type or an action regenerates every file in
  this list that the tool or entry appears in.
- **Lists an entry must join.** A search of `src/` and `src/__tests__` for the lists that
  name every long tool, every `HandlerSystem` action or every `HandlerGet` type found the
  ones below. Each is changed in the same step as the entry it lists. Lists that are only
  samples (some tools or actions, for one test's cases) are not listed here.
  - **A full tool that declares `detail`** (steps 8–11): `JSON_ANSWERING` in
    `detailSurface.test.ts`, which compares its exact set with the tools that declare
    `detail`.
  - **A long tool** (step 12):
    - `LONG_TOOLS` (`src/lib/longTools.ts`);
    - `tools/long-handlers.json`;
    - `LONG_BY_REQUESTS` in `sources/batchHandlers.test.ts` (exact set equality);
    - `LONG_TOOL_ARGS` in `longTools/harness.ts` (the arguments of the parameterised
      long-tool tests).
  - **A `HandlerGet` type** (step 13):
    - `CompactObjectType` and `COMPACT_OBJECT_TYPES` (`compactObjectTypes.ts`);
    - `compactMatrix.ts`;
    - `compactDescriptions.ts` (a `Record` over the types);
    - `COMPACT_READ_ROUTES` and `READ_ONPREM` (`adtProjections.ts`);
    - the name properties and the per-type takes map (`compactSchemas.ts`);
    - the route table of `compactReadRoutes.ts` and `SOURCE_REFUSALS` in
      `compactGetRefusals.ts`, with the metadata part's table in `compactPartRoutes.ts`.
      Their keys are kept equal by `compactGetRefusals.test.ts`.

    `projectionWalk.test.ts` walks every projected value and needs no entry, but its run
    must reach each new type's route.
  - **A `HandlerSystem` action** (step 14):
    - `SYSTEM_ACTIONS`, `SYSTEM_ACTION_TOOLS`, `ACTION_WORDS`, `SYSTEM_PAIRS` and
      `COMPACT_SYSTEM_TAKES` (`compactSchemas.ts`);
    - `ARGS` in `handlerSystem/longTool.test.ts` (a `Record` over the actions);
    - `MISSING` in `handlerSystem/argumentsBeforeConnection.test.ts` (each action's required
      arguments: here the missing `query` / `topic`).

    `listedSchema.test.ts` derives its cases from `SYSTEM_ACTIONS`.
  - **A batch-recordable entry:** none in this work. `tools/batch-handlers.json` and
    `BATCH_ENTRY_CASES` (`helpers/batchEntryCases.ts`) are left as they are (spec §4.1
    "Batch").
- **Coverage.** Each step that makes a coverage key served (`coverageKeys.ts`: for example
  `GetApplicationJobCatalog#source`, `HandlerGet#APPLICATION_JOB_CATALOG#metadata` or
  `HandlerSystem#keyword_documentation`) does all of this in the same commit:
  - adds the key's row to `coverage-ledger.json`: its unit file, whose `pinCases` pin it,
    and its live file per kind, `onprem` and `cloud`, whose `liveCall` calls it;
  - writes that live file in the step, since the ledger scans live files and does not run
    them;
  - moves the served-tool count in `coverageLedger.test.ts`: +1 for each new full tool,
    while the compact entries add keys but no tool.

  `coverage-debt.json` does not grow: it is the owner's ratchet and only shrinks. The live
  files written in steps 8–14 run in step 19.
- **Small commits.** One logical change per commit, in English, each message ending with the
  attribution lines.
- **Worktrees.** Work happens in a worktree under the repository's `.worktrees/`. A main
  checkout's branch is never switched.
- **Registry only.** Every dependency comes from the registry.
  - After every install, the lockfile is checked: no `"link": true` but a repository's own
    workspace siblings, and every third-party entry resolved from the registry.
  - A lockfile is only regenerated by npm.
- **No versions.** The plan changes no package's own version. A dependency range moves only
  to a version that is published.
- **Live runs.**
  - Read-only runs on cloud (trial) are allowed; they stop at any `401`.
  - An on-premise run starts only on the owner's go, and the controller says when a stage is
    ready for one.
  - Every live log is saved whole.
- **CI and review.**
  - CI's own step list runs locally before every push, and the PR's CI is checked after it.
  - Each stage ends with an external review on its PR, and every finding is fixed there.
- **Docs audit before each release.** Every guide, usage example and description the
  stage's change touches is found by search and updated, not only the files a step names.

## Stage 1 — `@mcp-abap-adt/interfaces-adt` (spec §1)

This stage is its own PR in `mcp-abap-adt-interfaces`. Its release happens once, together
with the other open tasks that need interfaces-adt, at the controller's call.

1. **`accept` on the application-log options.** In `src/runtime/IApplicationLog.ts`, add
   `accept?: string` to `IGetApplicationLogObjectOptions` and to
   `IGetApplicationLogSourceOptions`. The typecheck comes first: an option object carrying
   `accept` compiles for both.
2. **`src/runtime/IApplicationJob.ts`:** `IGetApplicationJobOptions`,
   `IApplicationJobCatalog` and `IApplicationJobTemplate`. The typechecks prove that each is
   implementable and that its `analyse` overloads narrow.
3. **`src/runtime/IAbapKeywordDocumentation.ts`:** the three `…Params` types,
   `IKeywordDocumentationOptions` and `IAbapKeywordDocumentation`, with the same
   typechecks.
4. **Exports.** Every new type is exported from `src/index.ts`, and a typecheck imports each
   one from the package entry.
5. **Table rows.** Add the three rows to `ADT_TYPES_ONPREM` and `ADT_TYPES_CLOUD` with their
   evidence cases (§1.2). The existing table typechecks pass.
6. **Docs.** `CHANGELOG.md` and `README.md` (§1.3), then the docs audit. Confirm that the
   package still holds types and constants only.
7. **PR.** Push and open the PR, with CI green, then the external review, then the merge.
8. **Release gate** (spec §4.9, for this package):
   - semver ranges only;
   - every range resolves on the registry;
   - the lockfile audit;
   - after the controller's release, a clean install from the registry into an empty
     directory.

## Stage 2 — `@mcp-abap-adt/adt-strategies` and `@mcp-abap-adt/adt-clients` (spec §2, §3)

This stage is its own PR in `mcp-abap-adt-clients`. It builds against the interfaces-adt of
Stage 1 only once that is published. The PR merges with the other open clients tasks, and
one adt-clients 49.0.0, with its adt-strategies, is cut after all of them at the controller's
call. Everything Stage 3 needs from these packages is settled in this stage.

1. **Take interfaces-adt.** Move the dependency range to the published interfaces-adt in
   both packages, regenerate the lockfile, and run the lockfile audit.
2. **Test configuration.** Add the keyword-documentation key, default `SELECT`, to the base
   template (`src/__tests__/helpers/test-config.yaml.template`) and its schema
   (`docs/development/TEST_CONFIG_SCHEMA.md`). The config tests come first: the key is read,
   with its default.
3. **Capture the corpus** (§3.4).
   - A hand-run, GET-only capture script under the job's temporary directory captures:
     - the object document and the source of one hit per type, per kind;
     - the hit-list, topic and "Not found" pages, per kind;
     - the `500` of a 21-character APLO name, for both reads;
     - the `500` of `version=1`.
   - The script writes each page's link sidecar by its own count of `a href`.
   - Cloud is run here; on premise, on the owner's go.
   - Sanitise as §3.4 requires (the user fields, the external host, `sap-client`), check
     every case for anything left, and check that every sidecar names its kind and release.
   - Commit the cases, then delete the script.
4. **`utilDiscoveryTemplates`** (§2.1). Tests first, on the three recorded discoveries and a
   malformed answer.
5. **`docuPage`.**
   - Tests first:
     - the element-by-element link comparison against the sidecars;
     - no `data:` in `text`;
     - the edge fixtures: empty, `#` and relative hrefs, a truncated page, a body with no
       `html`, a page with no `title`.
   - Then the tokenizer, in plain code with no regex.
6. **`jsonDocument`.** Tests first: one source per type per kind, plus a body that does not
   parse.
7. **`bluesMetadata`.** Tests first: one document per type per kind, a document with
   another root, and a document without `changedAt` and `packageRef`.
8. **Export** the readings and their types from adt-strategies.
9. **The failure path on an HTML `500`** (spec §4.4). A unit test on the two captured pages
   (the 21-character APLO name and `version=1`), run through `analyseException`, pins three
   things:
   - the verdict's status `500`;
   - its message;
   - its `response` carrying the body unchanged.

   This is the behaviour Stage 3 relies on. It was read in the code and needs no new
   reading; a change it turns out to need is made here, in this PR, before the release.
10. **The address records** `APPLICATION_LOG`, `APPLICATION_JOB_CATALOG`,
    `APPLICATION_JOB_TEMPLATE` and `KEYWORD_DOCUMENTATION`.
    - The `objects.test.ts` cases come first.
    - Adding the records makes `noHardcodedObjectAddresses.test.ts` refuse
      `applicationLog/read.ts`. So this step and step 11 land in one commit, which ends
      green.
11. **The application-log members**, with the tests written first. For `getObject` and
    `getSource`, the tests in `ApplicationLog.test.ts` assert:
    - the URL with `seg()` for every name case of §3.3;
    - the exact query parameter set, present and absent;
    - the relation header kept;
    - the default `Accept` and a given one;
    - `timeout: 0`;
    - exactly one request;
    - `404`, `406` and both captured HTML `500`s through `analyse`, with status and body.

    Then the members move onto `APPLICATION_LOG` with the `accept` option.
12. **The job members.**
    - Tests first: add `getApplicationJobCatalog`, `getApplicationJobTemplate` and
      `applicationJobDocuments` to `publicApiSurface.test.ts`, plus the unit tests of §3.3
      (the same list as step 11).
    - Then the members.
13. **The keyword-documentation members.**
    - Tests first: add `getKeywordDocumentation` and `keywordDocumentationDocuments` to
      `publicApiSurface.test.ts`, plus the unit tests of §3.3 for `query`, `topic` and
      `position`, `''` values sent as empty parameters included.
    - Then the members.
14. **Conformance.** The conformance check holds the three table rows to the recorded
    typestructure.
15. **Live tests** (§3.3):
    - definitions: positive, namespaced, absent, the 21-character APLO name;
    - keyword documentation: the configured query, the no-hit query, the topic proven by its
      own selector links, link fidelity, the version matrix, `406`, and the position
      measurement.

    Run them on cloud first with `npm run test:detached`. Then the controller reports the
    stage ready, and the on-premise run follows on the owner's go. Every failure is fixed
    before the stage goes on.
16. **ERRATA** (§3.3): each entry with its exact case and its evidence, naming the corpus
    cases.
17. **Docs.**
    - `README.md`, `CHANGELOG.md` and `scripts/address-matrix.ts` (§3.5), and the
      adt-strategies `README.md` and `CHANGELOG.md`.
    - The docs audit, then `check:docs`.
18. **PR.** Push and open the PR, with CI green, then the external review, then the merge.
19. **Release gate** (§4.9) for adt-strategies and adt-clients:
    - the ranges and the lockfile audit;
    - adt-strategies is published before adt-clients;
    - after the controller cuts 49.0.0, a clean install of each from the registry into an
      empty directory.

## Stage 3 — `mcp-abap-adt` 24.3.0 (spec §4)

This stage happens in PR #404, after the goal, the spec and this plan. It starts only once
the interfaces-adt, adt-strategies and adt-clients of Stages 1 and 2 are visible on the
registry.

1. **Take the dependencies.** Move the ranges to the published versions, regenerate the
   lockfile, and run the lockfile audit and `npm audit --audit-level=moderate`. The existing
   suite stays green.
2. **Take the corpus.**
   - Copy the cases of Stage 2 step 3 into `tests/fixtures/adt/`, taken from the clients
     repository at its release tag (`adt-clients-v49.0.0`) by `git show` of each file. The
     test build reads only this copy, never a sibling checkout.
   - List each case in `tests/fixtures/adt/README.md` with its provenance: the repository,
     the tag and the case name.
   - Check the sanitisation and the sidecars again.
3. **Test configuration.** Add `test-config.yaml.template` entries for the new live test
   files with `available_in: [onprem, cloud]`, and the keyword key with default `SELECT`.
   The config tests come first.
4. **The refusal codes** `support_read_not_eligible` and `support_read_not_served`, with
   their fixed words (§4.5, §4.6). Unit test first.
5. **The eligibility table** (`src/lib/supportReads/eligibility.ts`).
   - The table goes in with its own unit test, which passes now: the rows of §4.5, and the
     live test each eligible row names.
   - Its equality with `available_in` and the compact enums is asserted one entry at a
     time: each later step that registers an entry adds that entry's equality case. Step 17
     closes the assertion over every form.
6. **The no-limits source test**, before any support-read code: no timer or deadline in
   `src/lib/supportReads/` or in the four handler files. It is extended as each file lands.
7. **`served.ts`.** Tests first:
   - kept, shared, reset and fail-closed;
   - per-system-key isolation: two keys, two answers;
   - a failure is not kept, and the next call reads again;
   - the connection chosen: the instance's for an in-call read, the read's own session for a
     background long read;
   - the three recorded discoveries, basis-740 included;
   - the request counts of every row of the §4.5 table.
8. **`GetApplicationJobCatalog`**, end to end: the schema, the handler, the metadata read
   in `metadataReads.ts`, the `DetailTable` of both parts with the as-sent fallback, and
   registration in `ReadOnlyHandlersGroup` and `READ_DEFINITIONS`.

   Tests first (§4.7):
   - **Schema refusals:** a missing or empty name, an unknown `part`, an unknown `detail`,
     no position argument, `system_type_required` with no stated variant, and `background`
     refused because the tool is no long read. Each refusal sends zero requests.
   - **Wire tests:** the name cases, the parameter set, `Accept`, `timeout: 0`, the request
     counts, failures at every level, and the unreadable success.
   - **Equality:** the tool's eligibility case.
   - **Coverage:** the ledger rows of `#source` and `#metadata`, the unit pins, the live file
     (`…/readOnly/support/`) written with its `liveCall`s, and the count +1.
9. **`GetApplicationJobTemplate`**, the same way.
10. **`GetApplicationLogDefinition`**, the same way, plus the 21-character APLO `500` at
    every level for both parts: status, message and the whole `raw_body` (§4.4).
11. **`GetAbapKeywordDocumentation`**: the strict schema, the refinements by presence,
    `topic_version` and empty values followed as given, the `DetailTable` with every link at
    every level and the as-sent fallback, and registration in `SystemHandlersGroup` and
    `READ_DEFINITIONS`.

    Tests first:
    - **Schema refusals:**
      - both or neither of `query` and `topic`;
      - `topic_version` without `topic`;
      - an undeclared property;
      - an unknown `detail`;
      - no position argument;
      - `system_type_required`.

      Each refusal sends zero requests.
    - **Detail tables** on the copied corpus:
      - every level;
      - every link at `terse`, `medium` and `full` compared with the sidecar element by
        element;
      - the "Not found" page as a success;
      - an unreadable success answered as sent.
    - **Wire tests** for both forms.
    - **Equality:** the eligibility cases for the query and topic forms.
    - **Coverage:** the ledger row, the unit pins, the live file (`…/readOnly/system/`)
      written with its `liveCall`s, and the count +1.
12. **The long read.**
    - Add `GetAbapKeywordDocumentation` to `LONG_TOOLS`, `tools/long-handlers.json`,
      `LONG_BY_REQUESTS` (`sources/batchHandlers.test.ts`) and `LONG_TOOL_ARGS`
      (`longTools/harness.ts`), in one commit.
    - Tests: the equality test, a `run_handle`, the background answer equal to the in-call
      answer, and the no-limits tests on the 184 KB page at every level.
13. **Compact `HandlerGet`:** the three types in `CompactObjectType`,
    `COMPACT_OBJECT_TYPES`, `compactMatrix.ts` and `adtProjections.ts`; the name properties
    and the per-type takes map in `compactSchemas.ts`; the routes in `compactReadRoutes.ts`
    and the checks in `compactGetRefusals.ts`.

    Tests first:
    - **Routing:** both parts reach their tool; another part is refused by name; a missing
      or empty name is refused with zero requests; names arrive unchanged.
    - **Wire tests through `HandlerGet`**, the real adt-clients over a connection double:
      the name cases and their `seg()` segments, the parameter set, `Accept`, `timeout: 0`,
      the discovery and read request counts, and the answer at each level.
    - **Equality:** the compact enum cases of the three types.
    - **Coverage:** the six `HandlerGet#<TYPE>#<part>` rows, their pins and live calls; the
      count is unchanged.
    - **Pinned:** the new `changed-handler-requests.json` cases.
14. **Compact `HandlerSystem`:** `keyword_documentation` in `SYSTEM_ACTIONS`,
    `SYSTEM_ACTION_TOOLS`, `ACTION_WORDS`, `SYSTEM_PAIRS` and `COMPACT_SYSTEM_TAKES`, and
    the new properties through `said()`.

    Tests first:
    - **Routing:** a foreign property is refused; `topic_version` is kept apart from
      `search_source`'s `version`; the refinements apply.
    - **Wire tests through `HandlerSystem`:** the parameters present, absent and empty,
      `Accept`, `timeout: 0`, the request counts, and the answer at each level, in the call
      and in the background.
    - **Equality:** the action's enum case.
    - **Coverage:** the `HandlerSystem#keyword_documentation` row, its pins and live calls;
      the count is unchanged.
15. **Legacy.** The compact types and action are left out on `legacy` (`statedEnvironment`),
    and the call-time refusal guards them there. Tests first: they are absent from the
    `legacy` schemas, and a call there is refused with zero requests.
16. **Access restrictions.** The parameterised test over the eight deny entries: a denied
    entry sends no request, and the other seven stay served.
17. **Close the equality** over every form, kind and enum of the table. With every entry
    registered, it passes.
18. **Batch and tool sets.**
    - **Batch: not admitted.** The new `HandlerGet` types and the `keyword_documentation`
      action get no row in `tools/batch-handlers.json`.
      - On a cold discovery cache they wait for the discovery answer before their own
        request, which `oneRequestPerEntry` refuses, as #392 treats every read that waits
        on another answer (spec §4.1 "Batch").
      - A unit test proves that a call of each in batch mode runs outside it.
      - `tools/batch-handlers.json`, `BATCH_ENTRY_CASES`, `docs/user-guide/BATCH_MODE.md`
        and the batch sentences of `HandlerGet` and `HandlerSystem` stay unchanged, and
        the batch tests pass unchanged.
      - The long-read and background handling of step 12 stays as it is.
    - The full binaries still serve no batch mode.
    - The `-ro` sets carry every entry, and the tool counts match.
    - `toolDescriptionsCarryNoLiterals.test.ts` stays green.
19. **Live tests** (§4.7), in soft mode: the files written in steps 8–14, now run. The execution mode is set per tool:
    - **Long reads** (`GetAbapKeywordDocumentation`, and the compact `HandlerSystem` and
      `HandlerGet`, which are long reads already and run in the background by default):
      each case runs once with `background: false` and once in the background through
      `GetBackgroundRun`;
    - **The three full definition tools**, which are no long reads and take no
      `background`: in the call only.

    Run on cloud first. Then the controller reports the stage ready, and the on-premise run
    follows on the owner's go. Each file then gets one hard-mode run.
20. **Docs** (§4.8):
    - `README.md`;
    - the generated and pinned files: regenerated in the steps that changed what they pin
      (steps 8 to 18), so this step only checks that they are current;
    - `HANDLERS_MANAGEMENT.md` and `ACCESS_RESTRICTIONS.md`, which no test pins;
    - the 24.3.0 `CHANGELOG.md` entry, dated on each edit;
    - the docs audit.

    The controller proposes the `CLAUDE.md` line to the owner; this plan does not edit it.
21. **Push.** CI must be green, then the external review of the code. Every finding is fixed
    in this PR.
22. **Before the tag** (§4.9):
    - the full integration run on premise and on cloud, every failure fixed;
    - `npm run test:install`;
    - the release gate for every package of the release;
    - this goal, spec and plan deleted, and what they still owe moved into the PR
      description.
23. **After the owner publishes:** `npm run release:verify`, and the global wrapper-and-base
    install (`docs/deployment/RELEASE.md` step 9).
