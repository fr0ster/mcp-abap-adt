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

## Upstream items (adt-strategies, separate)

The sites that kept the server's parse switched to the 0.28.0 readings. What the shipped readings
still answer less than the tools do:

- `readTransportItem` reads a task's document that carries no `tm:object_type`, asked for by
  its parent's number, as the parent (from the parent's header alone). Site: GetTransport keeps
  a guard (a `tm:task` directly under `tm:root` is a task's document).
- `utilNodeContents` drops an object without `TECH_NAME` or `OBJECT_URI`, which the walks list,
  and says nothing of a node SAP could not load. Sites: every package walk reads
  `readNodeStructure` and keeps the not-loaded row (`nodeLevelOf`).

## Order and review

One PR, `feat/terse-answers`. Steps 1–2 first, since they touch every answer and lower the risk of
the rest, then 3–5, then 6–8. Codex reviews after steps 2, 5 and 8. The PR merges before 24.2.0 is
tagged.
