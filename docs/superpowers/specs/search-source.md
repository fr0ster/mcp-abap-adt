# Spec — `SearchSource` MCP tool

Status: draft.
Owner: fr0ster.
Issue: fr0ster/mcp-abap-adt#79.
Worktree: `.worktrees/feat-search-source` on branch `feat/search-source`.
Source analysis: `/tmp/afx-research/ANALYSIS.md` (AFX_CODE_SCANNER reverse-engineering, not committed).

## Goal

Provide MCP-level source-text search across ABAP repository objects without invoking `SUBMIT AFX_CODE_SCANNER`. The implementation is a coordination layer on top of ADT primitives that already exist in `@mcp-abap-adt/adt-clients` — no new wire endpoint needed.

The tool must support the same scan semantics as `AFX_CODE_SCANNER` (package-scoped, object-type-filtered, AND/NOT substring matching, optional comment exclusion) and produce machine-readable provenance: each match carries the object, include, line number, and snippet text, plus an explicit `truncated` signal when limits cap the result.

## In scope

- Single MCP tool: `SearchSource`.
- Scans across the three object families that AFX covers: programs (`PROG`), function groups (`FUGR`), classes (`CLAS`). Behaviour parity with `p_prog` / `p_fugr` / `p_cinc` flags.
- Optional recursive subpackage expansion (parity with `p_conpck`).
- AND-pair substring query (`p_strg1` mandatory, `p_strg2` optional), up to three exclusion strings (parity with `p_excl1..3`).
- Optional comment-line skip (parity with `p_excomm`).
- Per-object hit cap (parity with `p_lrng`).
- Optional emit-no-hits row (parity with `p_nohits`) — surfaced as a separate result type, not as a fake match.
- `available_in: ['onprem', 'legacy']` — cloud is explicitly out of scope (see fr0ster/mcp-abap-adt-clients#36 — `informationsystem/textsearch` on cloud requires active TREX/Enterprise Search infrastructure that we cannot rely on, and the read-side fallback is impractical at scale).

## Out of scope

- ALV display / drill-down (`RS_TOOL_ACCESS`) — irrelevant for MCP.
- Edit-mode toggle (`p_edit`) — irrelevant for MCP.
- Search outside `PROG / FUGR / CLAS` (e.g. CDS, behaviour definitions) — left as a follow-up.
- Regular expression matching — AFX uses `CS` (case-insensitive substring), we match that. Regex support can be added later behind a flag.
- Persistent indexing / caching — every call re-fetches; we live within the per-object HTTP cost.

## Tool shape

```ts
SearchSource({
  query: string,                       // required, p_strg1
  query2?: string,                     // optional, AND with query (p_strg2)
  exclude?: string[],                  // up to 3, lines containing any are skipped (p_excl1..3)
  packages: string[],                  // required, s_devc (range collapsed to list)
  include_subpackages?: boolean,       // default true (p_conpck)
  object_filter?: string,              // s_rest pattern (e.g. "Z*"); applied to obj_name
  object_types?: ('PROG' | 'FUGR' | 'CLAS')[], // default all three (p_prog/fugr/cinc)
  exclude_comments?: boolean,          // default false (p_excomm)
  max_hits_per_object?: number,        // default 1 (p_lrng) — integer ≥ 1
  emit_no_hits?: boolean,              // default false (p_nohits)
  max_objects?: number,                // safety cap on total objects examined, default 500
  concurrency?: number,                // parallel source fetches, default 8, max 16
}): {
  results: Array<{
    devclass: string;
    object_type: 'PROG' | 'FUGR' | 'CLAS';
    object_name: string;     // root object (program / FUGR / class name)
    include: string;         // include where the match was found (== object_name for PROG)
    line: number;
    snippet: string;         // matched source line, trimmed to 255 chars
  }>;
  no_hits?: Array<{ devclass: string; object_type: string; object_name: string }>; // only when emit_no_hits=true
  scanned: { packages: number; objects: number; sources: number };
  truncated: {
    by_object_cap: boolean;     // any object hit max_hits_per_object cap
    by_max_objects: boolean;    // scan stopped because max_objects reached
  };
}
```

### Behaviour notes

- All substring matches are case-insensitive (ABAP `CS` semantic).
- Exclusion logic: a line is **dropped** if it contains any `exclude` entry. (Matches AFX where `p_excl1..3` are independent negatives.)
- Comment skip: when `exclude_comments=true`, drop lines whose first non-whitespace character is `*` (classic ABAP) or whose trimmed start is `"` (modern comment). AFX only checked `*` at col 1; we extend to `"` since both are first-class.
- Per-object cap counts matched lines, not scanned lines. After the cap, scanning the rest of the source is skipped to save work.
- `max_objects` is the total budget across all packages and object types. When exhausted, scanning stops and `truncated.by_max_objects = true`. Callers can narrow scope and re-invoke.
- `no_hits` is only populated when `emit_no_hits=true`. It is **not** mixed into `results` (unlike AFX which emitted a "Keine Treffer" pseudo-row).
- Empty `results` + empty `no_hits` (when `emit_no_hits=false`) is a valid response signalling "no matches found within scope."

## Source primitives used

| AFX primitive | Replacement on MCP/ADT side |
|---|---|
| `SELECT * FROM TADIR ... object='DEVC'/'PROG'/'FUGR'/'CLAS'` | `searchObjects()` from `@mcp-abap-adt/adt-clients/core/shared/search.js` (`informationsystem/search?operation=quickSearch&objectType=...`) |
| `cl_pak_package_queries=>get_all_subpackages` | `GetPackageTree` handler (recursive) |
| `READ REPORT <name> STATE 'I'` | `GetProgFullCode` (programs) / `GetInclude` / `GetClass` source endpoints |
| `STOR_RESOLVE_FUGR` | ADT FUGR children — list FMs via `/sap/bc/adt/functions/groups/<fg>/fmodules`, list includes via package object structure (or `GetProgFullCode` for FUGR which returns the whole bundle) |
| `SELECT * FROM TRDIR WHERE name IN { <class>* }` (class includes enumeration) | `GetIncludesList` for the class |

No new endpoint required.

## Cloud compatibility

**Not supported.** The handler is gated to `['onprem', 'legacy']` via `available_in` and will not appear in cloud tool catalogues. Rationale recorded in fr0ster/mcp-abap-adt-clients#36 — TREX/Enterprise Search is not guaranteed on cloud tenants, and falling back to per-object source reads at full-package scope is impractical (latency, payload, rate limits).

A cloud-capable variant can be revisited later as a separate tool if SAP exposes an indexed source-search endpoint, but it is out of scope here.

## Non-functional requirements

- **Determinism:** within a single call, results are ordered by `(devclass, object_name, include, line)` ascending. Callers can rely on stable diffing across runs.
- **Concurrency:** source fetches run with a configurable concurrency cap (default 8). The cap is per-call, not per-process.
- **Logging:** debug log every object skipped due to read failure, every cap reached, every package expanded. No info-level chatter.
- **Type safety:** no `any` in handler — args, results, and intermediate shapes typed end-to-end.
- **Schema validation:** integer constraints on numeric inputs (`max_hits_per_object ≥ 1`, `max_objects ≥ 1`, `concurrency 1..16`), array length cap on `exclude` (≤ 3), string non-emptiness on `query`.

## Tests

- **Unit:** scan algorithm against in-memory source — query / query2 / exclude / comment-skip / cap behaviours.
- **Integration (soft mode):** create a small package with three controlled objects (one program, one FUGR with two FMs, one class with two includes) inside `shared:setup`, then call `SearchSource` with each AFX-equivalent option permutation and assert the expected line set.
- **Integration (hard mode):** same flow through MCP stdio.

The unit tests do not touch the network; the integration tests do, and live alongside the existing runtime/profiling tests.

## Open questions

1. Should `object_filter` accept a true ABAP range pattern (e.g. `Z*`, `Y*` with multiple lows) or just a single glob? AFX uses `s_rest` (full range); for MCP the simplest contract is a single pattern. Decided: **single glob** for now, range support can come later behind a separate input field.
2. Inactive-source preference. AFX does `STATE 'I'` first, falls back to active. Our ADT reads always return the active version (the only one ADT exposes via the documented endpoints). Document the divergence — MCP scans the *active* version, AFX scans whichever exists. A separate tool / flag for inactive scanning would require a different endpoint.
