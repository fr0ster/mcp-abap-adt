# Terse answers — plan

**Goal.** Every tool answer is compact by default and keeps what the model needs to act. The
model asks for details with a follow-up call or with `detail`. `full` and `raw` are for
debugging. (Owner, 2026-11-22: a general principle for the server.)

**Evidence.** Two measurements of origin/main 089f76c97, kept as working notes and summarised here:
- a live read-only measurement on onprem of the answer volume of every read tool;
- a code audit of every adt-clients call: which result reading the server passes, and where it
  re-parses XML that a shipped typed reading already reads.

Each number below is a measured answer size, followed by the size of the proposed shape run over
the same answer.

**Out of scope:** the data tools (GetTableContents, GetSqlQuery, off by default); abapGit tools
(#374 builds them terse from the start); readings missing upstream (see "Upstream items").

## Architecture (owner, 2026-11-22)

- **The reading decides the answer.** What a tool answers is decided by the result strategy
  (the reading) that the handler passes into the adt-clients method. The handler does not trim or
  reshape after it.
- **`detail` only selects the reading.** Each tool keeps one small table from level to reading,
  or to a reading plus a pure formatter of its typed value. There are four levels:
  - `terse`, the default: compact, carrying what the next call needs; TSV for lists.
  - `medium`: every field of the typed reading, without XML leftovers (uri, namespaces).
  - `full`: the whole parse.
  - `raw`: the document as ADT sent it, for debugging.

  `terse`, `full` and `raw` keep their present meaning, so existing calls stay valid.
- **A list at `terse` answers identifiers and a short description per row.** Details of one item
  come from that item's own tool: a request's tasks from GetTransport, a task's objects from
  GetTransport with the task number, an object's metadata from its Get tool. A list never carries
  an item's details at `terse`.
- **Never cut.** Every row is returned at every level. Examples:
  - a request list gives number, owner and description, even at `terse`;
  - a task's contents are its object list.

## Decisions (approved)

1. **Terse list format.** A terse list answers as TSV: one header line, one row per item, and a
   `# <field> <value>` group line when a value would repeat on every row (package, task, object).
   The repo already does this: compact `HandlerGet PACKAGE contents` and `SearchObject` terse
   answer TSV. A non-list answer stays JSON.
   *Recommended.* The alternative is minified JSON arrays everywhere: about 2–3× larger and the
   keys repeat per row, but one format.
2. **JSON is minified everywhere.** Every `JSON.stringify(x, null, 2)` that builds an answer
   (29 sites; the central one is `src/lib/answer.ts:94,103`) becomes `JSON.stringify(x)`. The
   indent alone is 23–30% of a JSON answer (GetPackageContents, SABP_UNIT: 135,322 → 104,259).
   Log lines and files on disk keep their indent.
3. **A list's default.** A terse list returns every row, with no cut-off and no paging of our
   choosing (no-guessing rule). The size problem is solved by the row shape, not by dropping rows.
   A tool that already takes `max_*` keeps it.

## Steps

Each step is one commit series with its own tests. A test is written first and seen to fail.
Every rule gets a mutation that turns its test red. Each step changes the CHANGELOG under
`## [Unreleased]` (Changed, with a migration note naming `detail: 'full'` as the old shape).

1. **Minified JSON** (decision 2): the 29 answer sites. A test scans `src` for an indented
   `JSON.stringify` in an answer builder, with an allowlist for log and file writers. The
   generated fixtures are regenerated through their writers.
2. **Shipped readings instead of re-parses** (strategy audit (a) and (b)). One commit per site.
   Answers stay the same at `detail: 'full'` unless a step below changes terse.
   - ReadTransportObjects and CreateTransport: `transportObjectEntries`.
   - ListTransports: `transportTree`.
   - CreateTransportTask: `transportCreated`.
   - GetWhereUsed: `utilWhereUsedReferences`.
   - SearchObject and enhancementAvailability: `utilSearchHits`.
   - GetInactiveObjects: `utilInactiveObjects`.
   - GetAllTypes: `utilNamedItems`.
   - `verbatim`/`statusOnly` where only `.raw` or the status is read: whereUsedScope, bindingTypes,
     both `getServiceGroup` calls.
   - Fix the stale `resultSets.ts` comment.
   - `detail: 'raw'` keeps the body through the existing `createdReading` pattern.
3. **`detail` on the heaviest reads, terse in the decision-1 format.** Measured now → proposed:
   - GetWhereUsed: 534,085 → 34,600. Usages grouped by package; package and container nodes leave
     terse; no uri per row.
   - SearchSource: 316,526 → objects with `include:line` only, about 7,000. Snippets at
     `answer: lines`/`full`.
   - GetPackageTree / compact `package_tree`: 253,781 → 31,700. Indented `name\ttype`; `kind`,
     `isPackage`, `codeFormat`, `restoreStatus` and empty `children` leave.
   - GetPackageContents: 135,322 → 27,060.
   - RuntimeListProfilerTraceFiles: 46,883 → 6,900.
   - RuntimeListFeeds `dumps`: 24,636 → 6,400. The id is decoded once; the duplicate uri goes.
   - GetIncludesList: 19,242 → 2,968.
   - GetObjectsList: 13,235 → 2,949.
   - GetEnhancements: source only at `full`.
   - DescribeByList: one TSV, one header.
   - ListFunctionModules, ListFunctionGroupIncludes, GetStructuresList, GetObjectVersions,
     GetMainPrograms: small already. They get `detail` only for consistency, terse = the same rows
     in TSV.
4. **Terse that is not compact today** (tools that already have `detail`):
   - ReadTransportObjects: 277,569 → 28,800. Group lines per task and pgmid; the row is
     `type\tname\tposition`, and position stays because a removal addresses it.
   - GetObjectOutline: 198,359 → 5,100. The 4 links per node, which repeat the source URI, leave
     terse; `full` keeps them.
   - GetAdtTypes: 41,102 → 10,400.
   - GetObjectStructure: 14,860 → 8,300. The include name leaves terse.
   - ReadTransportActionLog: separators and the repeated header go.
   - ListTransports: 4,259 → 1,340.
   - GetTransaction: 2,884 → 1,000.
5. **CRUD answers** (12 of about 150, code-read):
   - ActivateObjects / ActivateObjectLow group path: the input objects are no longer echoed, the
     fixed prose goes, and it honours `detail`.
   - LockObjectLow / HandlerLock: `{lock_handle, state_handle}`.
   - UpdateDataElementLow / UpdateDomainLow / UpdatePackageLow: through `terseWrite`.
   - CreateTransport: `{transport_number, task_number}` plus `note`.
   - CreateTransportTask: `{task_number, task_type}` plus `note`.
   - CreateTableType / UpdateTableType: `stored_definition` at `full` only.
   - HandlerUnlock edge paths: `{unlocked:false, reason}`.
6. **Compact parity.** Every compact action that maps to a changed full tool answers the same
   terse shape. Covered by the compact parity tests that already exist, extended.
7. **Prompts and docs.**
   - Prompt texts that quote an answer's fields are updated, and the prompt fixtures and
     PROMPTS.md regenerated by their writers.
   - Tool docs regenerated.
   - README: a short "Answers" section with the principle, `detail`, and the migration note.
8. **Live check (controller runs).** For each tool in steps 3–5, a read-only live case on onprem
   and cloud, on shared fixtures. It asserts the terse answer carries what the next call needs
   (ids, positions, numbers), and records its size against the measured baseline.

9. **Completeness by construction** (owner, after Codex round 9). The after-the-fact identity
   guard is replaced by writers that cannot omit an item. Each round of the guard found a column,
   a root or a section it did not compare; here a terse or medium answer can only be written from
   the reading's own lists, one row per item, every cell from that item. Sub-steps, in order:

   9.1 **The writer and its types** (`src/lib/detail/listing.ts`, `src/lib/detail/index.ts`).
   - `Column<I>`: a column name and a function from one item to one raw cell. `Schema<I>`: the
     ordered columns of one row kind. The header and every row of that kind are read from the
     same schema, so a row has every column and no cell can be left out or added.
   - `RowSchemas<R>`: a mapped type over the reading type `R`. It has one required key for every
     array-valued member of `R` (objects, incomplete objects, not-loaded nodes, unreadable
     includes, unread candidates, …), and its value is a `Schema` of that array's item type, or
     a mark schema for a kind written as a `#` line. A reading list without a schema is a missing
     key, a compile error. A list whose items are a discriminated union (a walk's item that is an
     object or a not-loaded node) takes one schema per discriminant: a record keyed by the
     discriminant's literal values, which is again exhaustive by type.
   - `Listing<R>`: the reading value itself, its heads (typed label and value pairs; a count head
     is computed by the writer from the lists' lengths, never passed in), an optional grouping
     key per item (the `# package` group lines), and for a tree the children member, which the
     writer walks in full, depth first.
   - `writeListing(listing, schemas)` is the only producer of terse text. It walks every
     array-valued member of the reading in the schema's order, writes one row or mark line per
     item, and escapes every cell (tab, every line terminator, a first cell's `#` at every depth).
     `writeListings(parts)` writes a list call: one section per object, its heads escaped, a
     failure as its one `# error` cell. Its result is the opaque `Written`, still the only type a
     terse formatter may return.
   - `jsonListing(listing, keySchemas)` does the same for medium: one entry per item, its keys from
     a key schema (`(item) => object`), the lists placed in the answer by the writer.
   - Pins: a `@ts-expect-error` case for a schema record that misses a reading's list, one for a
     union list missing a discriminant, and one for a formatter that returns a plain string. Unit
     tests: generated readings (every kind, nested trees, empty lists) give exactly one line per
     item, the header equal to the schema's names, and escaping as today. Mutation: the writer
     skipping one list, or one item, turns the counting test red.

   9.2 **Byte-identical goldens, before any tool moves** (`tests/fixtures/tools/terse-goldens.json`,
   its writer script under `scripts/`, run by the gate's regeneration).
   - For every tool below, the existing unit fixtures (shipped readings, the detail tests' recorded
     documents, the walk models) are run at `terse` and `medium` at the current head, and each
     answer is stored with its tool, level and fixture name.
   - One test runs every tool over the same fixtures and asserts each answer equals its golden.
     A tool whose answer was not complete before (it dropped a list the reading held) gets the new
     answer recorded by the same writer in the step that changes it, with the difference named in
     the commit and the CHANGELOG.

   9.3 **Walks and trees**: GetPackageContents, GetPackageTree, GetObjectsList, GetObjectsByType,
   ListFunctionModules and ListFunctionGroupIncludes (`functionGroupChildren.ts`), GetIncludesList,
   GetStructuresList, GetEnhancements, SearchSource. One commit per tool. Each tool's terse (and
   medium) formatter becomes a `Listing` built from its reading plus its schemas. The reading's
   not-loaded, incomplete and unreadable lists each get a schema, so each is written by type.

   9.4 **Searches**: SearchObject, DescribeByList, GetWhereUsed, GetMainPrograms, GetAllTypes.

   9.5 **Transports**: GetTransport, ReadTransportObjects, ListTransports, ReadTransportActionLog.

   9.6 **Feeds and lists**: RuntimeListFeeds (and compact `HandlerDumpList`),
   RuntimeListSystemMessages, RuntimeGetGatewayErrorLog, RuntimeListProfilerTraceFiles.

   9.7 **The rest**: GetATCFindings, GetATCResult, GetInactiveObjects, GetObjectVersions,
   GetObjectOutline, GetObjectStructure, GetTransaction, GetPackage.

   In 9.3–9.7, each tool's commit:
   - goes red first, on its golden test with the formatter switched to an empty listing;
   - comes with a pin for every list kind its reading holds, a fixture holding one item of each,
     with the line count per kind asserted;
   - has a mutation where removing one list's schema does not compile and dropping an item in the
     reading-to-listing mapping turns that pin red;
   - and keeps the answer table: only the terse and medium formatters change.

   9.8 **The guard leaves** (`src/lib/detail/complete.ts`, `src/lib/answer.ts`, `src/lib/utils.ts`,
   every handler above).
   - Removed: every `held` function; the identity columns (a `Line`'s `identity`, `Written.text`'s
     `identityColumns`); `identityOf`, `textIdentity` and `TextKey` where nothing else reads them;
     `Written.identities` and `rootsValid`; `completeAnswer` at terse and medium; and `listedText`'s
     per-section comparison, replaced by `writeListings`.
   - `IncompleteAnswerError` and the `incomplete_answer` mapping in `answer.ts`, `answerThrown` and
     `return_error` are removed once no caller remains. A source scan proves none does.
   - The free `Written.text` over hand-built `Line`s stays only for heads-only texts (a list call's
     `# asked` / `# error` lines). A source scan refuses any `Written.text` call with a row line
     outside `src/lib/detail`.
   - The guard's tests are replaced as follows. Root and section probes: the writer's tree and
     list-call pins of 9.1, where a tree writes exactly one root line per tree and a list call one
     section per object, by construction. Plain claim and assigned copy: the `@ts-expect-error` and
     brand pins, which stay. Escaping: unchanged. Per-tool completeness: the per-kind line-count
     pins of 9.3–9.7 together with the goldens.

   9.9 **Docs.** The README's completeness paragraph and the CHANGELOG's guard entry state the new
   rule: a terse or medium list is written from the reading's own lists, one row per item, every
   cell from it; a reading state the writer cannot show (a node SAP could not load, an unreadable
   include, a failed read) is a typed list of the reading and is written like any other. The all-or-
   error rule stays at the reading's edge: what a reading cannot read is its typed state, and raw's
   failed-read rule is unchanged. The tool docs are regenerated.

   9.10 **Gate and review.** The gate runs detached until `DONE fail=0`. Then push, then Codex,
   which gets this step's text as its scope.

## Upstream items (adt-strategies, separate)

None left: every site reads with its shipped reading (adt-strategies 0.28.1).

## Follow-up (outside this PR)

Step 9 moves every list or tree formatter this PR changed onto `writeListing`, `GetObjectsByType`
included. Two tools this PR did not change, and which take no `detail`, keep their own formatters:
`GetObjectInfo` and `GetNodeStructureLow`. Moving them onto the writer is a task of its own. The same holds for `ListATCResults`, `GetTableContents` and
`GetSqlQuery`, which this PR did not change either.

## Order and review

One PR, `feat/terse-answers`. Steps 1–2 first, since they touch every answer and lower the risk of
the rest, then 3–5, then 6–8, then 9 once the owner approves it. Codex reviews after steps 2, 5, 8 and 9. The PR merges before 24.2.0 is
tagged.
