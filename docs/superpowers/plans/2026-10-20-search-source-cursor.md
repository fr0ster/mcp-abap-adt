# SearchSource: a cursor and envelopes of 300 reads (#89) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A large package is scanned over several `SearchSource` calls, each one of bounded time: the answer says where the next call starts, and the source-read phase goes out in envelopes of at most 300 reads, with `time_budget_ms` checked between them.

**Architecture:** The cursor holds no state. Every call walks the package again, orders the scan targets in a fixed order, scans the slice that starts at `start_at` and answers `next_start_at` when targets remain. The batched version's phase 3 reads its targets in chunks: a chunk of up to 300 targets is read through, round after round, in envelopes of at most 300 reads each, and the deadline is checked before every envelope. A deadline therefore answers whole targets only. The sequential fallback keeps the same cursor contract.

**Tech Stack:** TypeScript, the server's handlers and `src/lib/search-source/`, Jest unit tests on the batch stand-in, one live run on the test system.

**Spec:** none. The owner's decisions of 2026-10-20 (below) are the requirements; issue #89 is the problem statement.

## Global Constraints

- The owner's decisions: the cursor is an index with no state (`start_at` in, `next_start_at` out); every call re-walks the package (measured ~5 s on the test system); 300 reads per envelope, fixed, with no parameter.
- 300 has not been measured: the measurement reached 200 reads (~4.1 s, all answered). Task 3 measures it.
- No timer of the server's own. `time_budget_ms` is the caller's and stays as it is: checked before each envelope, never inside one.
- No retries. A credential refusal ends the call as it does today, and nothing is read after it.
- Tool descriptions are functional only (what the tool does, its parameters, its result), and each tool's `keywords` / `semantic` texts in `tools/tool-search.json` follow its description. The retrieval gate's tuning set must pass whole, and the held-out set must not get worse.
- CHANGELOG: only the `## [19.0.0]` entry, dated the day of the change; closes #89 there.
- Registry-only dependencies; npm scripts only; no SAP system or user names in committed files.

## Review Focus

- `start_at` beyond the last target: an empty result with no `next_start_at`, not an error.
- A deadline that passes before the first envelope of the slice: no hits, `next_start_at` = `start_at`, so the caller retries from the same place.
- A function group whose second round (includes, function modules) exceeds 300 reads: split into several envelopes, nothing dropped.
- The order must not depend on the order SAP answers in, nor on which transport is used: sorted on (package, type, name).
- `max_objects` and `start_at` together: the slice is `[start_at, start_at + max_objects)`, and `truncated.by_max_objects` stays true when targets remain after it.

---

### Task 1: The cursor — `start_at`, `next_start_at`, `total_targets`

**Files:**
- Modify: `src/lib/search-source/orchestrator.ts` (both versions: `runSearchSource` sequential and `runSearchSourceInPhases`)
- Modify: `src/lib/search-source/packageEnumerator.ts` (the target order)
- Modify: `src/handlers/system/readonly/handleSearchSource.ts` (schema and description)
- Modify: `tools/tool-search.json` (SearchSource's keywords and semantic text), regenerated tool docs (`npm run docs:tools`)
- Test: `src/__tests__/lib/search-source/cursor.test.ts` (new, sequential version, beside `orchestrator.test.ts`), `src/__tests__/unit/batch/searchSource.test.ts` (batched version)

**Interfaces:**
- Produces: `OrchestratorInput.start_at?: number` (a non-negative integer, default 0); `OrchestratorResult.total_targets: number` (the targets of the walk, before the slice); `OrchestratorResult.next_start_at?: number` (present only when targets remain).

- [ ] **Step 1: Failing tests** (`cursor.test.ts` on the orchestrator fakes, and the same cases in `unit/batch/searchSource.test.ts` on the batch stand-in):
  - The targets are ordered by (package, type, name), whatever order the node structures answer in.
  - `start_at: 0, max_objects: 2` over 5 targets scans the first 2 and answers `next_start_at: 2`, `total_targets: 5`, `truncated.by_max_objects: true`.
  - `start_at: 4` scans the last one; `next_start_at` is absent.
  - `start_at: 5` (= total) and `start_at: 9` answer no hits, no `next_start_at`, `total_targets: 5`.
  - The union of the hits of three calls (`start_at` 0, 2, 4, `max_objects: 2`) equals one call with `max_objects: 5`.
  - The schema refuses a negative or fractional `start_at`.
- [ ] **Step 2:** Run the tests and watch them fail.
- [ ] **Step 3:** Implement: sort the enumerated targets; slice `[start_at, start_at + max_objects)`; set `total_targets` and `next_start_at` on both versions.
  - Schema: `start_at` with its description: "Index of the first scan target to read, from `next_start_at` of the previous answer; 0 by default".
  - The tool description names the cursor in a sentence: "A scan that stops before its last target answers `next_start_at`; pass it as `start_at` to go on."
- [ ] **Step 4:** Run the tests and watch them pass. Break-it: drop the sort and the order test goes red; revert. Run the retrieval gate (`src/__tests__/unit/descriptions/`).
- [ ] **Step 5:** All gates (CI's step list), then commit `feat(search-source): a cursor — start_at in, next_start_at out (#89)`.

### Task 2: Phase 3 in envelopes of at most 300 reads; the deadline answers whole targets

**Files:**
- Modify: `src/lib/search-source/orchestrator.ts` (`runSearchSourceInPhases`, phase 3; the sequential version's deadline handling, for `next_start_at`)
- Test: `src/__tests__/unit/batch/searchSourceEnvelopes.test.ts` (new, on the batch stand-in of `searchSource.test.ts`)

**Interfaces:**
- Consumes: Task 1's `start_at` / `next_start_at` / `total_targets`.
- Produces: `READS_PER_ENVELOPE = 300` (module constant, not exported to the schema).

- [ ] **Step 1: Failing tests** (batched version, the stand-in counting envelopes and their parts):
  - 650 targets of one-read types are sent as 300 + 300 + 50 reads (three envelopes).
  - A function group's second round of 400 reads is sent as 300 + 100.
  - A deadline that passes after the first envelope:
    - answers only the targets whose every read was answered;
    - `truncated.by_timeout: true`;
    - `next_start_at` = the index of the first target not finished.
  - A deadline already passed before the first envelope: no hits, and `next_start_at` = `start_at`.
  - The hits over envelopes equal the hits of the same targets read in one envelope (scan output unchanged).
  - Sequential version: a deadline answers the targets finished, with `next_start_at` at the first one not finished.
- [ ] **Step 2:** Run the tests and watch them fail.
- [ ] **Step 3:** Implement:
  - Phase 3 takes the slice's targets in chunks of 300.
  - Each chunk runs its rounds to the end, and each round's unique reads go out in envelopes of at most 300.
  - The deadline is checked before every envelope. A chunk the deadline cut answers none of its targets, which keeps the cut at whole targets.
  - The description's phase sentence names "envelopes of at most 300 reads".
- [ ] **Step 4:** Run the tests and watch them pass. Break-it, two ways, each red and then reverted: send all reads in one envelope; let a cut chunk answer its read targets.
- [ ] **Step 5:** Then:
  - Update the docs: `docs/user-guide/` wherever SearchSource's phases or limits are described.
  - CHANGELOG 19.0.0: amend the `SearchSource` batch entry with the cursor and the 300-read envelopes, closing #89, and date it the day of the change.
  - Run all gates.
  - Commit `feat(search-source): source reads in envelopes of at most 300; a deadline answers whole targets (#89)`.

### Task 3 (live, on the owner's word): the cursor and 300 reads on the test system

- [ ] **Step 1:** Ping. Then a temporary single-file test (deleted after the run). It goes outside `__tests__/integration/` and `__tests__/admin/` so the default ignores leave it selected, and `--listTests` must show it alone. Run it over HTTP and RFC against a SAP standard package of more than 300 targets (the measurement's package had 397):
  - one call with `max_objects` above the total, against calls chained by `next_start_at` with `max_objects: 150`: the same hits;
  - the time of one 300-read envelope (median of 3);
  - a `time_budget_ms` shorter than one envelope: a partial answer with `next_start_at`.
- [ ] **Step 2:** Record the numbers in the PR description (not in committed docs). If a 300-read envelope fails or is markedly slower than its share, report it to the owner and change nothing on our own.
