# Plan: source code read whole or in parts

The steps that implement `docs/superpowers/2026-11-28-source-parts-spec.md` (spec §n) under
`docs/architecture/SOURCE_PARTS.md` (design §n). Steps only: each task names its files, the
interfaces it adds, the tests written first (red before the code, then green), and its commit. One
logical change per commit; every commit ends with the session's attribution lines.

**How the work runs**

- Work goes in a worktree under each repository's `.worktrees/` (the main checkouts are shared
  and never switched). PRs, by release:
  - mcp-abap-adt-interfaces: one PR (section 1);
  - mcp-abap-adt-clients, PR A: adt-clients and adt-strategies (sections 2 and 3). Section 3 starts
    once section 2 is ready to publish, since adt-strategies consumes no adt-clients; PR A merges
    after section 3, and both are then published from their tags, adt-clients first;
  - mcp-abap-adt-clients, PR B: adt-code-analyzer (section 4), opened only after both releases of
    PR A are on the registry and have passed the post-publication gate. Two PRs in sequence in
    this repository are decided for this task, an exception to one PR per task;
  - mcp-abap-adt: #401 (section 5).
- **The rule:** a package is published, visible on the registry and through the post-publication
  gate before any package that depends on it builds against it; the dependent's first task moves
  its dependency to that version. Each section ends with its package ready to publish: gate
  green, CHANGELOG written, the owner asked for the version. Sections 2 and 3 share PR A because
  adt-strategies does not depend on adt-clients; every other section waits for the publication
  of the packages it depends on.
- **The post-publication gate**, after every publish and before its consumer starts: in an empty
  directory outside every repository, `npm install <package>@<version> --ignore-scripts` from the
  registry, then load its entry (`node -e "require('<package>')"`); a failure stops the sequence.
- **The common release gate**, before every package's tag: every document the change touches is
  reviewed, not only the listed ones (README, everything under `docs/`, usage examples, guides);
  every fact the spec or a live run measured is in the design (`SOURCE_PARTS.md`) or the ERRATA.
- After every install: the lockfile has no `"link": true` but the repository's own workspace
  siblings, and every third-party entry resolves from the registry.
- **Live** marks a task that needs a live run; the run is announced to the owner when ready and
  started only on the owner's go. Onprem is the on-premise system through its tunnel, cloud the
  trial system.
- Each task's "proven load-bearing" step: break the rule the test protects, see it red, revert.

## 1. `@mcp-abap-adt/interfaces-adt` (repository mcp-abap-adt-interfaces, `packages/interfaces-adt`)

**Task 1.1 — the outline atom.**
- Files: `src/adt/IAdtUtilities.ts` (or a new `src/adt/IAdtObjectOutline.ts` beside it), `src/index.ts`.
- Adds: `AdtOutlineCode`, `IAdtObjectOutlineReadable<R>` (spec §1.1).
- Tests first: `src/__typechecks__/objectOutline.ts`: a hand-written conforming object accepted;
  one missing the member, one with another signature refused (`@ts-expect-error`).
- Commit: `feat(adt): IAdtObjectOutlineReadable, the atom of getObjectOutline`.

**Task 1.2 — the navigation atom.**
- Files: as 1.1, `src/adt/IAdtNavigation.ts`.
- Adds: `IAdtNavigationTargetOptions`, `IAdtNavigationTargetReadable<R>`.
- Tests first: `src/__typechecks__/navigationTarget.ts`, structural fixtures as in 1.1.
- Commit: `feat(adt): IAdtNavigationTargetReadable, the atom of getNavigationTarget`.

**Task 1.3 — the result slots.**
- Files: `src/adt/IAdtUtilities.ts` (`IUtilResults`).
- Adds: the slots `objectOutline`, `navigationTarget`.
- Tests first: a typecheck that a result set naming both slots is an `IUtilResults`, and that a
  wrong slot type is refused.
- Commit: `feat(adt): IUtilResults slots for the outline and navigation`.

**Task 1.4 — ready to publish.**
- The "types and constants only" check and the export surface green; `test:check`, `build`, lint.
- README atom list, CHANGELOG entry (version asked of the owner).
- The common release gate.
- Commit: `docs: the outline and navigation atoms; CHANGELOG`. Push, PR, review; the owner
  publishes; the post-publication gate.

## 2. `@mcp-abap-adt/adt-clients` (repository mcp-abap-adt-clients, `packages/adt-clients`)

**Task 2.1 — the dependency.**
- `packages/adt-clients/package.json`: interfaces-adt to the published range; root
  `npm install`; lockfile check.
- Commit: `chore(deps): interfaces-adt <version>`.

**Task 2.2 — the navigation address.**
- Files: `src/endpoints/objects.ts` (`NAVIGATION`).
- Tests first: the address record's unit test (path, query building); `noHardcodedObjectAddresses`
  stays green.
- Commit: `feat(endpoints): the navigation target address`.

**Task 2.3 — `getNavigationTarget` and both atoms on `AdtUtils`.**
- Files: `src/core/shared/navigationTarget.ts` (the low-level request), `src/core/shared/AdtUtils.ts`
  (the member, both overloads, `implements IAdtObjectOutlineReadable` and
  `IAdtNavigationTargetReadable`), the utils result set (`navigationTarget` slot, default
  `rawDocument`), `src/__tests__/unit/capabilities/factoryReturnsCoverClass.ts` (`getObjectOutline`
  leaves `AwaitingItsAtom`), the capability manifest.
- Tests first, all red before the code:
  - `src/__tests__/unit/shared/navigationTarget.test.ts`: method `POST`, URL, query for each
    option combination (`uri` alone, with `filter`, with `fullname`, both), the caller's `Accept`
    and the default, no body, `timeout: 0`, stateless, one request; the slot applied; the caller's
    `analyse` applied;
  - a typecheck that `AdtUtils` satisfies both interfaces-adt atoms;
  - the coverage test with `getObjectOutline` removed from `AwaitingItsAtom`.
- Commit: `feat(utils): getNavigationTarget; AdtUtils implements the outline and navigation atoms`.

**Task 2.4 — live navigation (Live: onprem and cloud).**
- Files: `src/__tests__/integration/core/shared/navigationTarget.test.ts`, the overlay keys for the
  probed objects in the template and `docs/development/TEST_CONFIG_SCHEMA.md`: objects that exist
  already and are only read (an onprem program and a cloud function group whose outlines carry a
  form, a module, a local class, a type and a local method).
- Cases (spec §3.2): a form fragment `200` with `#start=`; a local method's
  `implementationIdentifier` `200`; its `definitionIdentifier` as measured per system; three
  navigations through `AdtBatchConnection('communication')` equal to their answers alone.
- The answers recorded, sanitised, into `corpus/adt/answers/` (the corpus scrub rules), one per
  kind adt-strategies' tests read (spec §3.3): form, module, local class, type, local method
  (implementation and definition link) on both systems; the `400` exception from cloud only (on
  onprem the definition link answers `200`, the same as the implementation link).
- Commit: `test(utils): navigation target live, onprem and cloud; corpus answers`.

**Task 2.5 — ready to publish.**
- Root gate (`npm run check`), unit suites green; the live run of 2.4 green on both systems; the
  common release gate.
- Docs: `docs/usage/ERRATA.md` entries (spec §3.2), `README.md`, `docs/usage/CLIENT_API_REFERENCE.md`,
  `docs/architecture/ARCHITECTURE.md`; CHANGELOG (version asked); `npm install --package-lock-only`
  after the version change.
- Commit: `docs: navigation target, the ERRATA entries; CHANGELOG`. adt-clients is ready to
  publish; it is published with adt-strategies after PR A merges (task 3.3), not before.

## 3. `@mcp-abap-adt/adt-strategies` (same repository, `packages/adt-strategies`)

adt-strategies depends on interfaces-adt only (its `dependencies` and `devDependencies` name no
adt-clients): it reads adt-clients' recorded corpus as files of the repository, which is not a
package dependency. So it never builds against adt-clients at all, published or not, and its
section shares PR A; it is published after adt-clients. Its tests read the corpus answers of
task 2.4.

**Task 3.1 — the dependency.** interfaces-adt to the published range (if not done in 2.1).
Commit: `chore(deps): interfaces-adt <version>`.

**Task 3.2 — `readNavigationTarget`.**
- Files: `src/results/navigation.ts`, `src/index.ts`.
- Interfaces: `INavigationTarget`, `readNavigationTarget` (spec §1.2), through `sourcePosition`
  and the shared parse helpers; no regular expression.
- Tests first: `src/__tests__/navigationReadings.test.ts` over the corpus answers of task 2.4: form,
  module, local class, type, local method; the `400` exception and a reference without `start`
  read as `undefined`; `publicApi.test.ts` names the new export.
- Commit: `feat(results): readNavigationTarget`.

**Task 3.3 — ready to publish.** Gate green; the common release gate; README surface list;
CHANGELOG (version asked). Commit: `docs: readNavigationTarget; CHANGELOG`. PR A, holding both
sections, is reviewed and merged; then the owner publishes from the tags, adt-clients first and
adt-strategies second; the post-publication gate for both before PR B.

## 4. `@mcp-abap-adt/adt-code-analyzer` (same repository, new `packages/adt-code-analyzer`)

**Task 4.1 — the package.**
- Files: `packages/adt-code-analyzer/{package.json, tsconfig.json, README.md, CHANGELOG.md, src/index.ts}`;
  the root `package.json` workspaces and `publishOrder` (after adt-clients and adt-strategies);
  `release.yml` job; `allowScripts` unchanged.
- Dependencies: the published adt-clients, adt-strategies and interfaces-adt ranges. This PR (B)
  starts only after PR A's releases are on the registry, so the workspace siblings npm links are
  at exactly the published versions; the task verifies it: `npm ls` shows each sibling at the
  version `npm view` reports, and the sibling's tag is at the checkout's commit. The lockfile's
  `"link": true` is only for these siblings (the repository's standing rule); the
  post-publication gate after 4.14 proves the package installs from the registry alone.
- Tests first: the source scan (`src/__tests__/sources.test.ts`): no `makeAdtRequest`, no ADT path
  literal outside the shape constants, no regular expression literal or `RegExp`, no timer —
  green on the empty package, proven load-bearing by a planted violation.
- Commit: `feat(analyzer): the adt-code-analyzer package and its source rules`.

**Task 4.2 — the contracts.**
- Files: `src/types.ts`.
- Interfaces: everything of spec §1.3, the refusal union of spec §1.5 (the analyzer's codes),
  `InsertElement`, `ContainerBlock`, `InsertAnchors`.
- Tests first: typechecks for the discriminated unions (each refusal code with its payload; a
  wrong payload refused).
- Commit: `feat(analyzer): the contracts`.

**Task 4.3 — the lexer.**
- Files: `src/lexer/lexer.ts`.
- Interfaces: statements with their tokens, line and column spans; a block stack hook; the
  `unlexable` refusal.
- Tests first: `src/__tests__/lexer.test.ts`: every lexical form of spec §4.2, each `unlexable`
  case with its line.
- Commit: `feat(analyzer): the lexer`.

**Task 4.4 — the scanner: blocks and nesting.**
- Files: `src/scanner/blocks.ts`, `src/scanner/nesting.ts`.
- Interfaces: the closed table of design §5.2; the nesting table; `bad_nesting`, `unbalanced`,
  `no_end`, `inside_macro`, `crosses_include`.
- Tests first: `src/__tests__/scanner.test.ts`: each table row; each nesting row accepted and
  refused; each fail-closed rule; `DEFERRED`, `LOAD`, `LOCAL FRIENDS`; macro cases.
- Commit: `feat(analyzer): block ends and nesting`.

**Task 4.5 — the scanner: events.**
- Files: `src/scanner/events.ts`.
- Interfaces: spec §2.1's table, its identity and end rules, the refused statements.
- Tests first: `src/__tests__/events.test.ts`: every row as start and as end; `AT FIRST`, `AT NEW`,
  `GET TIME` inside an event; each refused statement.
- Commit: `feat(analyzer): event blocks`.

**Task 4.6 — identity, derived end, boundary.**
- Files: `src/scanner/locate.ts` (`BlockEndScanner.locate`).
- Interfaces: identity over the whole address with scope from the block stack; the end derived
  from the text; `end_mismatch` against SAP's end; `shares`.
- Tests first: `src/__tests__/locate.test.ts`: spec §4.2's identity, derived-end and boundary cases.
- Commit: `feat(analyzer): locate, the identity and boundary checks`.

**Task 4.7 — insert anchors.**
- Files: `src/scanner/anchors.ts` (`BlockEndScanner.anchors`).
- Tests first: each anchor kind; `section_missing`; a shared `ENDCLASS` / `ENDINTERFACE` line.
- Commit: `feat(analyzer): insert anchors`.

**Task 4.8 — include links and readers.**
- Files: `src/includes.ts`.
- Interfaces: spec §2.2's link shapes (plain string comparison), `IncludeReaders`,
  `include_unknown`.
- Tests first: every row's link parsed; a foreign shape refused.
- Commit: `feat(analyzer): include links`.

**Task 4.9 — the outline.**
- Files: `src/outline.ts`.
- Interfaces: `SourceOutline` from `readObjectOutline`; readable or informational per design §5.0;
  `scope`; addresses; `duplicateAddress`; the `GET`-event rule; the function group's two-outline
  path; `FUGR/FF` elements.
- Tests first: `src/__tests__/outline.test.ts` over the recorded outlines (class, interface,
  program, function group and its include).
- Commit: `feat(analyzer): the outline and its addresses`.

**Task 4.10 — `ref`.**
- Files: `src/ref.ts`.
- Tests first: round trip; `undecodable`; `foreign_include`.
- Commit: `feat(analyzer): ref`.

**Task 4.11 — `AdtCodeAnalyzer`: `outline`, `part`, `member`, `insertion`.**
- Files: `src/AdtCodeAnalyzer.ts`, `src/index.ts`.
- Interfaces: `AdtCodeAnalyzerOptions`; the members only through `client`; the envelope over
  `AdtBatchConnection` on onprem and cloud, single navigation elsewhere; `source` and `outline`
  given; the function module path; the etag from the wire answer.
- Tests first: `src/__tests__/traces.test.ts` (recording connection): every row of spec §2.3
  exactly, per variant; the no-limits cases; the `GET`-event `ref` trace;
  `src/__tests__/analyzer.test.ts`: addresses and short forms, stale `ref`s, `member`,
  `insertion`.
- Commit: `feat(analyzer): AdtCodeAnalyzer`.

**Task 4.12 — the analyzer's live objects (Live: onprem and cloud).**
- The analyzer only reads, so its live tests use objects that exist and are not changed (the
  shared read-only fixtures rule): delivered objects and the repository's shared objects. The
  overlay keys name them per system: a class with local classes and local test classes, an
  interface, a function group with forms, modules and a local class, onprem a program with
  events, forms, modules and local classes.
- An object kind no existing object provides on a system is added to adt-clients' shared setup
  (`npm run shared:setup`, its check) here, and created with the owner before task 4.13's run.
- Files: the overlay templates, `docs/development/TEST_CONFIG_SCHEMA.md`, the shared setup where
  needed.
- Commit: `test(analyzer): the live objects and their overlay keys`.

**Task 4.13 — live analyzer (Live: onprem and cloud).**
- Files: `src/__tests__/integration/*.test.ts`.
- Cases: spec §6's analyzer rows: every block of the test classes located and equal to the source
  read back; function group parts on both; program parts onprem.
- Commit: `test(analyzer): live parts, onprem and cloud`.

**Task 4.14 — ready to publish.**
- Gate green; the common release gate; the package README (spec §4.3, a custom `BlockEndScanner`
  example), CHANGELOG (0.1.0 asked of the owner); `npm pack` installed into an empty directory and
  its entry loads (before publishing).
- Commit: `docs(analyzer): README; CHANGELOG`. The owner publishes; the post-publication gate.

## 5. mcp-abap-adt 24.3.0 (this repository, #401)

**Task 5.1 — the dependencies.** adt-clients, adt-strategies, adt-code-analyzer and
interfaces-adt to their published ranges (`package.json` of lib and of every package that
declares them); `npm install`; lockfile check. Commit: `chore(deps): …`.

**Task 5.2 — lib's contracts.**
- Files: `src/lib/sourceParts/types.ts`, exported from lib's public entry where an embedder needs
  them.
- Interfaces: `CodeAnalyzer`, `CodeAnalyzerFactory`, `InsertContainer`, `Edit` (its four
  variants), `UpdateSourcePartArgs`, and lib's refusal union with every payload of spec §1.5's
  lib rows, discriminated on `code`.
- Tests first: typechecks: each `Edit` variant accepted, each wrong combination (a class method
  without `section`, an interface method with `implementation`) refused; each refusal code with
  its payload, a wrong payload refused; the shipped `AdtCodeAnalyzer` assignable to `CodeAnalyzer`.
- Commit: `feat(lib): the source-parts contracts`.

**Task 5.3 — the hash and the seam.**
- Files: `src/lib/sourceParts/sourceHash.ts`, `src/lib/sourceParts/codeAnalyzer.ts` (the members
  factory from `createAdtClient` with `rawDocument` and `wireItself`, and the default factory over
  the shipped `AdtCodeAnalyzer`; the contracts are task 5.2's), `src/lib/handlers/interfaces.ts` (the analyzer on the handler context),
  `src/lib/handlers/HandlerExporter.ts` and `src/embeddable/BaseMcpServer.ts` (the optional
  `codeAnalyzer`), the composition roots in `server-runtime/`.
- Tests first: hash known vectors; the seam test (an embedder's analyzer is called, the shipped
  one is not).
- Commit: `feat(lib): the source hash and the codeAnalyzer seam`.

**Task 5.4 — `part: "size"`.**
- Files: `src/lib/handlers/readPart.ts`, `src/lib/handlers/sourceRange.ts` (the size answer from
  the one GET, `range_with_size`), the 17 handlers of spec §5.2, lib's source reading keeping
  `etag`.
- Tests first: per tool: the size answer, empty / final line feed / CRLF / mixed, `etag` present
  and absent, `range_with_size` before any request; legacy schemas without `size`.
- Commit: `feat(read): part "size" on every source read`.

**Task 5.5 — `GetObjectOutline` views.**
- Files: `src/handlers/system/readonly/handleGetObjectOutline.ts`.
- Tests first: without `view` byte-identical to today on the recorded documents (written before
  any change, green, then kept green); `PROG/I`; `kinds`; `parts` with each filter;
  `filter_without_parts` before any request; no view chosen by size.
- Commit: `feat(outline): PROG/I, the kinds and parts views`.

**Task 5.6 — `GetSourcePart`.**
- Files: `src/handlers/source/readonly/handleGetSourcePart.ts`, the read-only and full group
  registrations.
- Tests first: schema shapes; `targets_empty`, `range_needs_one_target`, `range_outside`; the
  answer per element over a recording connection with the shipped analyzer.
- Commit: `feat(read): GetSourcePart`.

**Task 5.7 — the diff parser.**
- Files: `src/lib/sourceParts/diff.ts`.
- Tests first: the grammar of spec §5.6 and every `diff_malformed` reason; `new_start` for change,
  pure addition and pure deletion, after adding and removing hunks; `hunks_order`,
  `hunks_overlap`; the no-newline marker in valid and invalid places.
- Commit: `feat(update): the unified diff parser`.

**Task 5.8 — the merge.**
- Files: `src/lib/sourceParts/merge.ts`.
- Tests first: replace, insert at the analyzer's anchors, element- and include-relative diffs,
  confinement (pure additions at `0`, `n`, `1 ≤ k < n`), `shares_lines`, `edits_overlap`, line
  ends kept, the final line end kept, ABAP Doc lines untouched.
- Commit: `feat(update): the merge`.

**Task 5.9 — `UpdateSourcePart`.**
- Files: `src/handlers/source/high/handleUpdateSourcePart.ts`, `src/lib/sourceParts/writeSequence.ts`
  (spec §5.5 over `withLock`), the write group registrations.
- Tests first (recording connection, the shipped analyzer): both write traces of spec §5.8 exactly;
  the drift table; every safety case (zero `PUT`, `UNLOCK` sent); unlock after a failure past the
  lock; the lock and write target per row of spec §2.2; `insert_shape_mismatch`,
  `edits_span_includes`, `include_not_member`, `not_writable`.
- Commit: `feat(update): UpdateSourcePart`.

**Task 5.10 — compact.**
- Files: `src/lib/compact/compactSchemas.ts`, `compactRoutes.ts`, `compactDescriptions.ts`,
  `compact-readonly-entries/src/handlers`, `compact-modify/src/handlers`.
- Tests first: compact parity with the full tools on the same recordings; `edits_with_source`;
  legacy compact schemas without the new fields.
- Commit: `feat(compact): size, source_part, outline views and edits`.

**Task 5.11 — sets, batch, legacy, descriptions.**
- Files: the group definitions and `available_in`, `tools/batch-handlers.json`, the legacy sets,
  the descriptions.
- Tests first: the tool lists per binary and variant; the batch eligibility sentences; a legacy
  direct dispatch with the new fields sends zero requests; the literal-scan test; the prompts and
  listed-tool snapshots regenerated.
- Commit: `feat(sets): the new tools in their sets; outside batch mode; off on legacy`.

**Task 5.12 — shared objects (Live: onprem and cloud).**
- Files: `src/__tests__/admin/shared-deps/` (setup, check), the test-config template, the system
  configs' keys.
- Objects (spec §6): a test class with local classes, local test classes and ABAP Doc; a test
  interface; a test function group with forms, modules, a local class and a module; onprem, a
  test program with events, forms, modules, local classes and an include.
- Run `shared:setup` with the owner; activation checked in ADT with the owner.
- Commit: `test(shared): the source-parts shared objects`.

**Task 5.13 — live suites (Live: onprem and cloud).**
- Files: `src/__tests__/integration/high/sourceParts/*.test.ts`.
- Cases: every row of spec §6, each stating where it runs; the SAP storage measurement (text
  sent, `sent_hash`, text read back, its hash, every difference recorded).
- Then one hard-mode run of the new tools per system.
- Commit: `test(integration): source parts live, onprem and cloud`.

**Task 5.14 — docs and the measured facts.**
- Files: `docs/architecture/SOURCE_PARTS.md` (the storage measurement into §2),
  `docs/user-guide/SOURCE_PARTS.md` (new), the generated `AVAILABLE_TOOLS*.md`, `BATCH_MODE.md`,
  `README.md`, `HANDLER_EXPORTER.md`, `ARCHITECTURE.md` §5, `docs/development/tests/`, the
  adt-clients ERRATA entry for the storage result (a follow-up PR there if it is new).
- Commit: `docs: source parts for users and embedders; the measured storage`.

**Task 5.15 — release 24.3.0 (Live: onprem and cloud).**
- Full integration on onprem and cloud (the minor-release rule), every failure fixed first;
  `test:install`; the release gate; the common release gate.

- CHANGELOG 24.3.0 (dated on each edit, checked on release day); the goal, this plan and the spec
  deleted, what they owe the future moved into the PR description.
- Commit: `docs: CHANGELOG 24.3.0; the working documents leave`. Merge, tag and publish follow the
  release guide; `release:verify` after publishing.
