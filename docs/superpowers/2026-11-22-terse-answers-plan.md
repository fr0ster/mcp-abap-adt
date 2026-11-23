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

   9.7a **The abapGit tools** (merged from #374, which reached main first with the older `detail`
   module): `ListAbapGitRepos`, `CheckAbapGitExternalRepo`, `GetAbapGitBranchInfo`,
   `GetAbapGitModifiedObjects`, `GetAbapGitStaging` and `GetAbapGitErrorLog` write terse and medium
   by the listing writer through `ListAnswerTable` (`src/lib/abapGit/formats.ts`), and
   `LinkAbapGitRepo` / `PullAbapGitRepo`'s objects by the JSON writer. Each has its golden over the
   abapGit unit fixtures (`src/__tests__/helpers/abapGitSap.ts`), recorded with the formatters
   before the move; four answers change their layout only (heads before the header, a header per
   `# list`), named in the CHANGELOG.

   9.11 **Known limits of "by construction"** (owner, after Codex round 11). Each of these needs
   deliberate code a reviewer sees, and is accepted:
   - `writeWhole` takes any object, so a hand-filtered copy of a reading passes for it;
   - a nested listing can be built from a filtered copy of the same type;
   - a column's or head's callback chooses an item's fields (never which items are written);
   - the full and raw formatters are free functions;
   - a list whose items are themselves lists of objects is not looked into;
   - a record of JSON values is one value, written whole;
   - a member that may be any JSON value (string, number, boolean, null and arrays) is one value,
     written whole: the general type does not chase it (Codex round 12). Every reading that
     reaches a writer is checked instead: such a member holding an array of items that are not
     themselves any JSON value does not compile, naming the reading;
   - the schema types look 8 objects deep (Codex round 12): a reading nesting deeper does not
     compile rather than going unchecked; a type met again on the way down (a tree's node) is
     checked where it was first met.
   DescribeByList's terse still reads SearchObject's terse text back into cells, any cell past
   the four columns kept as an `# extra` line; it is named here for the owner's decision.

   9.10 **Gate and review.** The gate runs detached until `DONE fail=0`. Then push, then Codex,
   which gets this step's text as its scope.

10. **Descriptions by construction** (owner, after Codex round 11). A tool's description has
   drifted from what the tool returns whenever the code changed, and with `detail` any shape a
   description states is wrong at the other levels. As step 9 did for completeness, the
   description is assembled from parts the code already holds, and tests tie it to the output.
   A description describes the tool's function first, and never what the result looks like
   (owner): the purpose is its main part, the information facts follow it, then the notes. The
   one place that describes form is the `detail` parameter's shared text (10.3).

   10.1 **The builder** (`src/lib/description/`, exported through `src/lib/description/index.ts`).
   - `toolDescription({ purpose, returns, notes? })` is the only producer of a tool's
     `description`. It joins, in this order, the purpose sentence (the function, the main part),
     the Returns facts (one sentence per fact, in the order given) and the notes that apply to
     the tool, and nothing else. `TOOL_DEFINITION`
     takes its result; a plain string literal for `description` is refused by a source scan
     (10.6).
   - `purpose` is the only free text: one sentence of what the tool does, written by hand, typed
     as a branded `Purpose` made only by `purpose('…')`, which the purpose test checks (10.4).
   - `returns` is a list of `ReturnsFact` values made only by the factories of 10.2; no free text
     reaches it.
   - `notes` are the existing shared sentences, each a typed note rather than a string appended
     by hand: `withLongToolAdvice` (`src/lib/longTools.ts`) becomes the note `longRunning`,
     `withBatchSentence` (`src/lib/batch/sentence.ts`) the note `batchable(tool)`. Their words stay
     as they are; the two wrappers are removed once no caller remains, a source scan proving it.
     Helpers that compute variant words (`activationParentDescription`,
     `whereUsedTypeDescription`) stay, and are used by parameter descriptions only.
   - The parameters stay in the input schema, described by zod as today. The description names no
     parameter's shape; the generated docs list them from the schema.

   10.2 **Returns from the writers' schemas** (`src/lib/description/returns.ts`, reading
   `src/lib/detail/listing.ts`).
   - Every binding factory of `listing.ts` (`rows`, `node`, `marks`, `sections`, `kinds`,
     `within`, `bullets`, `parts`, `partsOf`, `headLines`, `wholeMarks`, `omitted`) and of the
     JSON side (`entries`, `member`, `values`, `writtenValues`, `wholeEntries`) records, beside
     its `write`, what it writes: the list's name, its kind (rows, mark lines, sections, a tree,
     entries, values), its columns' names, the kinds and their specs, the child lists, and the
     `omit` kinds with their reasons. A binding carries this as data, so the description and the
     writer read one value.
   - `returnsOf(schemas)` walks a tool's `RowSchemas` / `JsonSchemas` record and makes one fact
     per list naming only what information comes back, in domain words, never its form: "for each
     object: its type, name and description", "objects SAP could not load are named",
     "subpackages with their objects". The list names, column names and kinds become the domain
     nouns, each declared beside its schema as a noun phrase (`each object`, `its type`), so a
     fact is still generated from the schemas and cannot drift. An `omit` kind is a plain domain
     statement with its reason ("package and container nodes are not listed at terse"). No fact
     says row, line, entry, value, tree or indentation.
     A tool states its schemas once, as a value both the writer and the description read; a
     table whose schemas are built per call (from the reading's options: a description column,
     a source column) states the variants as named schema records, and the description lists
     each with the option that selects it.
   - The heads a listing writes are typed too: each head label is declared beside the schemas
     (`heads: ['package', 'count']`), and the description names them.
   - The levels are not described per tool. One shared sentence (10.3) says what each level is;
     a tool's Returns says only what its terse and medium lists hold.

   10.3 **One text for `detail`** (`src/lib/strategies/detail.ts`).
   - `DETAIL_WORDS` and `ASSEMBLED_DETAIL_WORDS` become one text, the same on every tool: terse
     the lists as TSV under their `#` lines, medium the same lists as JSON, full the answer of
     the tool before `detail`, raw what ADT sent. What raw is for a tool (one document, or every
     document of the call in read order) is a Returns fact generated from the tool's wire kind
     (`src/lib/detail/wire.ts`), not words on the parameter.
   - The tools without `detail` carry no level words at all.

   10.4 **The purpose sentence is checked** (`src/__tests__/unit/descriptions/purpose.test.ts`).
   - Every registered tool's purpose (full, read-only and compact sets) is one sentence: it ends
     with a single full stop and holds no other sentence end.
   - It is at most 160 characters long.
   - It holds none of the shape or mechanism markers, compared case-insensitively on word
     boundaries: `{`, `}`, `[`, `]`, `` ` ``, `json`, `tsv`, `xml`, `list of`, `flat`, `tree`,
     `array`, `row`, `column`, `entry`, `entries`, `batch`, `envelope`, `request`, `requests`,
     `node structure`, `nodestructure`, `endpoint`, `parse`, `document`, `field`, `fields`,
     `returns`, `answers`, `line`, `lines`, `indented`, `mark`, `#`, `tab`. The set lives in the
     test as one constant; adding a marker is a reviewed change.
   - The same marker set applies to every generated Returns fact of every tool (a fact naming a
     marker fails, naming the tool and the fact); `rows` and `row` are in it.
   - A purpose may name the domain: object kinds, SAP terms, what the user gets (`the source of a
     class`, `the objects of a package`, `where an object is used`).
   - The compact descriptions (`src/lib/compact/compactDescriptions.ts`,
     `handlerSystemDescription`) follow the same rule: each compact action's purpose is a
     `Purpose`, and its Returns comes from the full tool it maps to.
   - Mutation: a purpose holding `flat` or `{`, or of 161 characters, turns the test red.

   10.5 **Description and output are tied** (`src/__tests__/unit/descriptions/returnsMatch.test.ts`).
   - For every tool on the writers, the test runs its golden fixtures (`terse-goldens.json`,
     `shipped-readings.json`) at terse and medium and reads what was written: the header columns,
     the `#` heads and marks, the JSON member names. Each is declared in the schemas with its
     domain noun; the noun of every one written is in the tool's generated Returns, and the
     Returns names no noun whose column, head, mark or member no fixture of the tool writes.
   - A fixture set that does not reach a list or a kind the schemas declare fails the test,
     naming the list: the fixtures must cover every declared list.
   - Mutations: a column added to a writer and not to its schemas does not compile; a column
     removed from a schema leaves its description, and a fixture still writing it turns the test
     red; a description fact added by hand does not compile (no factory makes one).

   10.6 **Every tool assembled** (source scan in `src/__tests__/unit/sources/descriptions.test.ts`).
   - No `TOOL_DEFINITION.description` (and no compact action description) is a string literal or
     a template; each is a `toolDescription(…)` call.
   - The tools not on the writers get the assembled form with a Returns built as follows; each
     group's Returns factory lives in `src/lib/description/` and reads a typed value, never words:
     - **Source readers** (GetClass, GetProgram, GetInterface, GetInclude, GetFunctionModule,
       GetFunctionInclude, GetDdl, GetBehaviorDefinition, GetBehaviorImplementation,
       GetMetadataExtension, GetServiceDefinition, GetLocal* of a class, GetEnhancementImpl,
       GetObjectDraft, GetObjectVersionSource, GetTextElements): from the source-read result type
       (`sourceReturns`): the source text, and the version read.
     - **Metadata readers** (GetDomain, GetDataElement, GetStructure, GetTable, GetTableType,
       GetTableSettings, GetFunctionGroup, GetMessageClass, GetMessageClassMessage,
       GetServiceBinding, GetEnhancementSpot, GetTypeInfo, GetObjectInfo,
       GetObjectNodeFromCache, GetNodeStructureLow, GetVirtualFoldersLow,
       GetServiceBindingPreviewUrl, ListServiceBindingTypes, GetObjectVersionDiff): from each
       reader's result interface: its members' names, as the JSON writer's facts are named.
     - **Create, Update, Delete** (every `Create*`, `Update*`, `Delete*` and the `*Low` writes):
       from the CRUD result type of `src/lib/answer.ts` (`crudReturns`): the object named, its
       state after the write, the lock and transport facts it reports.
     - **Check, Validate, Activate** (every `Check*`, `Validate*`, `Activate*`, the `*Low`
       variants, ActivateObjects): from the check and activation result types: the verdict and
       each message.
     - **Runs and results** (RunUnitTest and the other unit-test runs, Get*UnitTestResult and
       Status, RunATC, GetATCRunStatus, ListATCResults, RuntimeRunClass, RuntimeRunProgram, the
       profiler tools, RuntimeGetDumpById): from each run's result type.
     - **Sessions and transports** (SessionOpen, SessionClose, ListLeftoverSessions,
       LogoffLeftoverSession, the background runs, AddTransportObject, CreateTransport,
       CreateTransportTask, MoveTransportObjects, RemoveTransportObject,
       SortAndCompressTransportTask): from their result types.
     - **Debugger** (every `Debug*`, `Amdp*`, `MemorySnapshot*`): from the debugger answer types.
     - **No typed result** (GetSqlQuery, GetTableContents, where the answer is SAP's data as it
       came): Returns is the fixed fact "SAP's data as it answers it", and the plan's follow-up
       types their results before their next change. Any other tool found without a typed result
       while 10.7 runs is listed in the PR and gets the same fixed fact until it is typed; none is
       given free words.
   - Mutation: a description written as a literal turns the scan red.

   10.7 **Migration, group by group.** One commit series per group, each with its tests first:
   (1) the builder, the shared `detail` text and the tests of 10.4–10.6 with an allowlist of the
   tools not yet moved, shrinking with each group; (2) the tools on the writers, in the order of
   9.3–9.7; (3) source readers; (4) metadata readers; (5) CRUD; (6) check, validate and activate;
   (7) runs and results; (8) sessions and transports; (9) debugger; (10) compact; (11) the
   allowlist removed. The abapGit tools join the groups by kind: the six reads on the writers
   (9.7a) in group (2), `GetAbapGitFile` with the source readers (3), `LinkAbapGitRepo`,
   `UnlinkAbapGitRepo`, `PullAbapGitRepo`, `PushAbapGitRepo` and `SwitchAbapGitBranch` with
   sessions and transports (8), `CheckAbapGitRepo` with check, validate and activate (6); the
   abapGit `detail` text (`ABAPGIT_DETAIL_SHAPE`, no `raw`) becomes the shared text of 10.3 with
   its levels. Each group regenerates the tool docs (`npm run docs:tools`:
   AVAILABLE_TOOLS and the compact docs), the listed-schemas fixtures
   (`tests/fixtures/tools/listed-schemas.json`, `rebuilt-descriptions.json`) and the goldens
   through their writers, and names the regenerated files in its commit.

   10.8 **Retrieval stays as good.** Tool selection does not read the description alone: the
   search texts (`tools/tool-search.json`: keywords and semantic sentences) are unchanged by this
   step. The purpose sentence keeps the domain words of the description it replaces (the object
   kinds, the SAP terms), which a reviewer checks per group against the old text. The BM25
   retrieval test and the held-out baseline (`src/__tests__/unit/descriptions/toolRetrieval.test.ts`)
   run in every group's gate; a held-out query getting worse fails it. The vector retrieval test
   (`toolRetrievalVectors.test.ts`, local Ollama) is run by the controller once after the last
   group, its result in the PR.

   10.8a **Vector checks of meaning** (owner; `src/__tests__/unit/descriptions/meaning.test.ts`,
   through the existing helper `src/__tests__/unit/descriptions/ollama.ts`: `MODELS`,
   `servedModels`, `embed`). A model the local Ollama does not serve skips with its reason, as
   `toolRetrievalVectors.test.ts` does. Both checks compare ranks among the tools, never an
   absolute similarity.
   - **The function text** of a tool is its purpose sentence and its generated information
     facts, joined; for a compact action, the action's purpose and facts. It is embedded as a
     document (the model's document prefix).
   - **Description against function.** Every tool's assembled description is embedded as a
     query and compared with every tool's function text by cosine. The tool's own function text
     must rank first. A tool that does not is named in the failure with the tool whose function
     text ranked above its own: a copied or generic description, or a pair of tools that cannot
     be told apart.
   - **Name against function.** A tool's name turned into words — split on case changes,
     underscores and digits, lower-cased (`GetPackageContents` → `get package contents`); for a
     compact action, the handler's words and the action's (`HandlerGet` with `class` → `handler
     get class`) — is embedded as a query; its own tool's function text must rank first among
     all tools. A failure names the tool and the one ranked above it: a name that says something
     other than what the tool does.
   - **Baseline.** The first run over the assembled tools records every failure, per model, in
     `src/__tests__/unit/descriptions/meaningBaseline.json` (tool, check, the tool it was
     confused with). The test fails on a failure not in the baseline, and on a baseline entry
     that no longer fails (the baseline only shrinks). Each baselined failure is resolved in the
     group that moves its tool, as the owner decides per entry: the tool renamed (a breaking
     change, named in the CHANGELOG with its migration), its purpose rewritten, or the pair
     accepted as close, which stays in the baseline with the owner's reason beside it. The list of
     entries and the decision for each goes into the PR body.
   - **Where they run.** On the controller's machine over all five `MODELS` after each group
     from (2) on, the result per model written into the PR. In CI, a new job `meaning-vectors` in
     `.github/workflows/ci.yml`: an `ollama/ollama` service container on port 11434; the model
     `bge-m3`, the owner's interim choice (a wider measurement of ten models may change it),
     with its prefixes from `MODELS` (none) and on the CPU (`num_gpu: 0`, as `MODELS` marks it).
     The held-out baseline beside it (`heldOutBaseline.json`, 36 queries, failures cosine /
     hybrid): bge-m3 4 / 1; mxbai-embed-large 0 / 0, bge-large 0 / 0, snowflake 2 / 0,
     nomic-embed-text 3 / 1. Pulled by a step (the container's `/api/pull`) before the tests,
     its files cached with `actions/cache` under the key `ollama-bge-m3-<the model's digest>` (the digest read from the registry manifest
     in the step before the cache, so a new model version is a new key); then the test build and
     `meaning.test.ts` alone, both checks. The job is required: added to the branch ruleset's
     required checks by its exact name. With one model in CI, the CI run compares against that
     model's baseline only.
   - Tests of the checks themselves, each with a mutation: the name-to-words split (a fixture of
     names and their words); the ranking (a fixture of vectors where the second tool is nearer
     fails, naming both); the baseline comparison (a new failure fails, a resolved entry left in
     the baseline fails).
   - Nothing in 10.8a changes the BM25 or vector retrieval tests of 10.8.

   10.9 **Review.** Each group's commits list the old and the new description of every tool they
   move, side by side, in the PR, so the owner can read the change in words. Codex reviews after
   group (1) (the builder, the tests and the marker set), after group (2) (the tools on the
   writers), and after group (11), each time with this step's text as its scope. The CHANGELOG
   entry states that descriptions are assembled from the writers' schemas and what a consumer
   reading a description's shape should read instead (`detail` and the Returns facts).

   10.10 **Gate.** The gate runs detached until `DONE fail=0` after each group, then push.

## Upstream items (adt-strategies, separate)

None left: every site reads with its shipped reading (adt-strategies 0.28.1).

## Follow-up (outside this PR)

Step 9 moves every list or tree formatter this PR changed onto `writeListing`, `GetObjectsByType`
included. Two tools this PR did not change, and which take no `detail`, keep their own formatters:
`GetObjectInfo` and `GetNodeStructureLow`. Moving them onto the writer is a task of its own. The same holds for `ListATCResults`, `GetTableContents` and
`GetSqlQuery`, which this PR did not change either.

## Order and review

One PR, `feat/terse-answers`. Steps 1–2 first, since they touch every answer and lower the risk of
the rest, then 3–5, then 6–8, then 9 once the owner approves it, then 10 once the owner approves it. Codex reviews after steps 2, 5, 8 and 9, and within step 10 as 10.9 states. The PR merges before 24.2.0 is
tagged.
