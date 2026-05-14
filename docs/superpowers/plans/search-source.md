# Plan — `SearchSource` MCP tool

Spec: `docs/superpowers/specs/search-source.md`.
Worktree: `.worktrees/feat-search-source` on branch `feat/search-source`.

The plan is split into phases that each end with a green build, lint, and a runnable check. Commit at the end of each phase. Push to remote when phase 5 (tests) is green.

## Phase 0 — repository orientation (no code)

- Verify the assumed primitives behave as the spec claims:
  - Read `src/handlers/package/readonly/handleGetPackageContents.ts` to confirm it supports `includeSubpackages` and returns object-type + devclass per entry.
  - Read `src/handlers/include/readonly/handleGetIncludesList.ts` (or wherever it lives) to confirm the response shape for class includes.
  - Find the program / include source-read handlers and note the field that carries the raw source text.
  - Confirm `GetProgFullCode` whitespace normalization (already verified at line 299 — record the file:line in the plan so future implementers can re-verify).
- Identify whether class source reads expose an `inactive` flag and whether program / include reads do.
- No code changes in this phase. Output is a short "primitive inventory" note appended at the bottom of this plan.

End of phase: notes section filled. No commit needed.

## Phase 1 — pure scan algorithm

Create `src/lib/search-source/lineScanner.ts` (new file) implementing:

```ts
export interface ScanInput {
  query: string;
  query2?: string;
  exclude?: string[];           // already capped to ≤ 3 by caller
  exclude_comments?: boolean;
  max_hits: number;             // resolved default
}

export interface ScanHit {
  line: number;     // 1-based
  snippet: string;  // raw source line, trimmed to 255 chars
}

export interface ScanResult {
  hits: ScanHit[];
  capped: boolean;  // true if max_hits was reached
}

export function scanLines(lines: readonly string[], input: ScanInput): ScanResult;
```

Rules:

- Case-insensitive substring match — implement via `String.prototype.toLowerCase()` on both line and needles **once per scan**, not per comparison.
- AND across `query` and `query2`.
- OR across `exclude` (line dropped if any matches).
- Comment skip per spec — `line[0] === '*'` OR (first non-whitespace char `===` `"`). Whitespace-prefixed `*` is **not** a comment.
- Stop appending hits after `max_hits` is reached; set `capped = true`.
- No I/O, no fetches — this module is fully synchronous and pure.

Unit tests in `src/lib/search-source/__tests__/lineScanner.test.ts`:

1. Single-query match.
2. AND with `query2`.
3. Exclusion drops the only candidate match.
4. Comment skip — col-1 `*`, full-line `"`, whitespace-prefixed `*` (must NOT skip), inline `" comment` on code line (must NOT skip).
5. `max_hits = 1` caps and reports `capped: true`.
6. Case-insensitive matching.
7. Snippet truncated to 255 chars.

Verification: `npm run build` clean, `npx jest src/lib/search-source` green.

Commit: `feat(search): pure line-scan core for SearchSource`.

## Phase 2 — package enumeration adapter

Create `src/lib/search-source/packageEnumerator.ts` exposing:

```ts
export interface EnumeratedObject {
  devclass: string;
  object_type: 'PROG' | 'FUGR' | 'CLAS';
  object_name: string;
}

export interface EnumerateInput {
  packages: string[];
  include_subpackages: boolean;
  object_filter?: string;     // glob, applied to object_name
  object_types: readonly ('PROG' | 'FUGR' | 'CLAS')[];
}

export async function enumerateScanTargets(
  ctx: HandlerContext,
  input: EnumerateInput,
): Promise<EnumeratedObject[]>;
```

Implementation:

- Iterate `packages`. For each, call the in-process equivalent of `GetPackageContents` with `includeSubpackages = input.include_subpackages` (call the underlying client method, not the MCP tool — avoid self-MCP recursion).
- Filter response entries by `object_type ∈ input.object_types` (mapping ADT type codes to `'PROG' | 'FUGR' | 'CLAS'`).
- If `object_filter` is provided, compile it once to a `RegExp` (glob `*` → `.*`, `?` → `.`, anchored `^...$`, case-insensitive) and filter `object_name`.
- Deduplicate by `(devclass, object_type, object_name)`. Stable order: sort by `(devclass, object_type, object_name)` ascending.

Unit tests with the package-contents client stubbed:

1. Single package, no subpackages, mixed types → only requested types returned.
2. `include_subpackages = true` → response from multi-package mock collapsed and sorted.
3. `object_filter = "Z*"` matches and excludes the expected names.
4. Duplicate entries from overlapping subpackages → deduplicated.

Verification: `npm run build` clean, `npx jest src/lib/search-source/packageEnumerator` green.

Commit: `feat(search): package enumerator over GetPackageContents`.

## Phase 3 — source reader

Create `src/lib/search-source/sourceReader.ts` exposing:

```ts
export interface SourceUnit {
  include: string;          // source-unit name (== object_name for PROG)
  lines: string[];          // raw lines, no normalization
}

export async function readSourceUnits(
  ctx: HandlerContext,
  target: EnumeratedObject,
): Promise<SourceUnit[]>;
```

Per object type:

- **`PROG`**: read the root program source only (no include traversal). Use the program read client (whichever returns raw source — verified in Phase 0). Returns one `SourceUnit` with `include = object_name`.
- **`FUGR`**:
  - Enumerate child source units via `/sap/bc/adt/functions/groups/<fg>/fmodules` + the FUGR package object structure (to capture top includes and FMs).
  - Read each unit's source individually. Skip names matching `VIEW*` (AFX behaviour — generated dialog includes).
  - One `SourceUnit` per child read.
- **`CLAS`**: call `GetIncludesList` for the class, then read each include source individually. One `SourceUnit` per include.

Errors on individual reads are caught and logged at debug; the offending unit is dropped from the returned array. `readSourceUnits` never throws unless the **whole target** is unreadable (e.g. target name resolution fails).

Crucially: **do not call `GetProgFullCode`**. Spec rationale: it normalizes whitespace and aggregates includes.

Unit tests with each underlying client stubbed:

1. PROG → one SourceUnit with `include === object_name`.
2. FUGR with two FMs and one top-include → three SourceUnits in deterministic order; `VIEW*` dropped.
3. CLAS with two includes → two SourceUnits.
4. Read failure on one of three units → two returned, error logged.

Verification: `npm run build` clean, `npx jest src/lib/search-source/sourceReader` green.

Commit: `feat(search): source reader for PROG/FUGR/CLAS without normalization`.

## Phase 4 — orchestrator + handler

Create `src/lib/search-source/orchestrator.ts`:

```ts
export interface OrchestratorInput { /* mirrors tool args, post-validation */ }
export interface OrchestratorResult { /* mirrors tool response */ }

export async function runSearchSource(
  ctx: HandlerContext,
  input: OrchestratorInput,
): Promise<OrchestratorResult>;
```

Behaviour:

1. Validate caps (`max_objects ≥ 1`, `concurrency 1..16`, `exclude.length ≤ 3`, `query.length ≥ 1`). Treat post-validation; the schema in the tool definition catches most of this.
2. `enumerateScanTargets(...)` → list. Cap to `max_objects`. If capped, set `truncated.by_max_objects = true`.
3. Process targets in order with bounded parallelism (`concurrency`). For each target:
   - `readSourceUnits(...)` → array of `SourceUnit`.
   - For each unit, run `scanLines(...)` with remaining budget (per-object cap counts across units of the **same** target).
   - Aggregate hits; if cap reached, set `truncated.by_object_cap = true`.
   - If `emit_no_hits=true` and the target produced zero hits, append to `no_hits`.
4. Assemble final result; sort `results` by `(devclass, object_name, include, line)`.

Concurrency primitive: a small ad-hoc `pLimit` helper (~10 LOC) — do not add a new dependency.

Create handler `src/handlers/system/readonly/handleSearchSource.ts`:

- `TOOL_DEFINITION` with `name: 'SearchSource'`, `available_in: ['onprem', 'legacy'] as const`, the input schema matching the spec (incl. numeric `minimum`s, `maxItems: 3` on `exclude`, `minLength: 1` on `query`).
- Forward validated args into `runSearchSource`.
- Wrap result in `return_response({ data: JSON.stringify(result, null, 2), status: 200 })`.
- Errors go through `return_error`.

Register the handler in the appropriate group file (`ReadOnlyHandlersGroup` since the operation is read-only).

Unit tests of orchestrator with all three dependencies stubbed:

1. Two packages × two object types → results merged, sorted, scanned counts correct.
2. `max_hits_per_object = 2` with one target producing 5 candidate matches → 2 hits, `truncated.by_object_cap = true`.
3. `max_objects = 1` with enumerator returning 3 → only first processed, `truncated.by_max_objects = true`.
4. `emit_no_hits = true` and one target has zero hits → entry appears in `no_hits`, not in `results`.

Verification: `npm run build` clean, `npx jest src/lib/search-source` green, `npx jest src/handlers/system/readonly/handleSearchSource` green.

Commit: `feat(search): SearchSource handler over orchestrator (#79)`.

## Phase 5 — integration tests

Add to `tests/test-config.yaml.template`:

- A new section under `tests/integration/readOnly/system/` for `SearchSource` with `available_in: ["onprem", "legacy"]`.
- Params: a controlled package name and three pre-seeded objects (program, FUGR with two FMs, class with two includes), each containing a known marker string and a known exclusion string.

Add to `shared:setup` (only if missing): the three controlled objects with deterministic source that the test asserts against.

Create `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts`:

1. AND-query across two strings — assert exact lines hit.
2. Exclusion — same query plus `exclude = ["marker_A"]` — assert the line that contained `marker_A` is dropped.
3. `exclude_comments = true` — assert col-1-`*` and full-line-`"` lines are dropped, inline-comment-on-code line is kept.
4. `max_hits_per_object = 1` with a target that has 3 candidate matches → 1 hit + `truncated.by_object_cap = true`.
5. `emit_no_hits = true` for a target with zero matches → entry in `no_hits`.
6. `object_filter = "Z_FOO*"` — assert only the matching object is scanned.
7. Multi-object-type pass (`object_types: ['PROG', 'FUGR']`, excluding `CLAS`) — assert no `CLAS` hits in result.

Run on `trial` env only as a smoke check (the test will skip on cloud given `available_in`). Real verification requires an onprem environment with the seeded package; that test run happens on the user's onprem-capable machine.

Verification (locally on trial — for tests that the harness can exercise): `npm run test:integration -- --testPathPatterns=SearchSourceHandler 2>&1 | tee /tmp/search-source-int.log`.

Commit: `test(search): integration tests for SearchSource`.

## Phase 6 — release + cleanup

- Bump version: `package.json`, `package-lock.json`, `server.json` → `6.7.0` (new tool, minor).
- Update `CHANGELOG.md` with the `[6.7.0]` entry under `### Added`.
- Push the branch.
- Open PR; once merged, tag `v6.7.0` to trigger the release workflow.
- Delete `docs/superpowers/specs/search-source.md` and `docs/superpowers/plans/search-source.md` once the PR is merged (per CLAUDE.md rule — plans/specs live only while active).

## Open items the implementer should verify in Phase 0 and may move into Phase 0 notes

- Exact response shape of `GetPackageContents` and whether it returns raw devclass-per-row or only object names.
- Whether `GetIncludesList` distinguishes class CCDEF / CCMAC / CCAU / CCIMP / CCPUBLIC includes or returns them uniformly — affects the `SourceUnit.include` naming.
- Whether the FUGR fmodules endpoint exists on legacy systems or is onprem-only; if legacy-incompatible, narrow `available_in` to `['onprem']` and document.

## Phase 0 notes (filled during Phase 0 execution)

_(to be filled in)_
