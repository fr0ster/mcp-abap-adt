# Spec — `SearchSource` MCP tool

Status: draft.
Owner: fr0ster.
Issue: fr0ster/mcp-abap-adt#79.
Worktree: `.worktrees/feat-search-source` on branch `feat/search-source`.
Source analysis: `/tmp/afx-research/ANALYSIS.md` (AFX_CODE_SCANNER reverse-engineering, not committed).

## Goal

Provide MCP-level source-text search across ABAP repository objects without invoking `SUBMIT AFX_CODE_SCANNER`. The implementation is a coordination layer on top of package enumeration and source-read primitives that already exist in `@mcp-abap-adt/adt-clients` / current MCP handlers — no new SAP-side report or indexed search endpoint needed.

The tool must support the same scan semantics as `AFX_CODE_SCANNER` (package-scoped, object-type-filtered, AND/NOT substring matching, optional comment exclusion) and produce machine-readable provenance: each match carries the object, include, line number, and snippet text, plus an explicit `truncated` signal when limits cap the result.

## In scope

- Single MCP tool: `SearchSource`.
- Scans across the three object families that AFX covers: programs (`PROG`), function groups (`FUGR`), classes (`CLAS`). Behaviour parity with `p_prog` / `p_fugr` / `p_cinc` flags.
- Optional recursive subpackage expansion (parity with `p_conpck`).
- AND-pair substring query (`p_strg1` mandatory, `p_strg2` optional), up to three exclusion strings (parity with `p_excl1..3`).
- **Comments are searched by default.** Comments routinely carry load-bearing information — TODOs, FIXMEs, deprecated markers, ticket / spec references, business-rule explanations, disabled code under review. Excluding them silently hides legitimate hits. `exclude_comments` is an opt-in filter, default `false`.
- When `exclude_comments=true`: skip lines where `line[0] = '*'` (column 1 `*`, AFX-strict) **or** the first non-whitespace character is `"` (full-line `"` comment). Whitespace-prefixed `*` is **not** a comment in ABAP (only column 1) and must not be skipped — doing so would produce false negatives on real code. Inline comments after code, e.g. `WRITE lv_value. " ticket ABC-123`, remain searchable because the source line is code-bearing, not a comment line.
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
- Comment skip behaviour is described in the "In scope" section. Default: comments are included in the scan.
- Per-object cap counts matched lines, not scanned lines. After the cap, scanning the rest of the source is skipped to save work.
- `max_objects` is the total budget across all packages and object types. When exhausted, scanning stops and `truncated.by_max_objects = true`. Callers can narrow scope and re-invoke.
- `no_hits` is only populated when `emit_no_hits=true`. It is **not** mixed into `results` (unlike AFX which emitted a "Keine Treffer" pseudo-row).
- Empty `results` + empty `no_hits` (when `emit_no_hits=false`) is a valid response signalling "no matches found within scope."

## Source primitives used

| AFX primitive | Replacement on MCP/ADT side |
|---|---|
| `SELECT * FROM TADIR ... object='DEVC'/'PROG'/'FUGR'/'CLAS' AND devclass IN ...` | `getPackageContentsList()` / `GetPackageContents` with `includeSubpackages`, then client-side filter to `PROG/P`, `FUGR`, `CLAS/OC` and `object_filter`. Do **not** use `searchObjects()` for package enumeration: it is name-search only and has no package/devclass constraint. |
| `cl_pak_package_queries=>get_all_subpackages` | `getPackageContentsList(..., { includeSubpackages: true })` for the flat scan list. `GetPackageTree` is useful for diagnostics, but the implementation should consume the flat package contents list to avoid tree-walk ambiguity. |
| `READ REPORT <name> STATE 'I'` | Raw source reads per source unit. Programs use the direct program read only for the root `PROG/P`, not `GetProgFullCode`, because AFX `p_prog` does not recursively scan includes. Includes use `GetInclude` / include source endpoint. Classes use `GetClass` or class include source endpoints with explicit version handling. |
| `STOR_RESOLVE_FUGR` | ADT FUGR children — list FMs via `/sap/bc/adt/functions/groups/<fg>/fmodules` and/or package object structure, then read the generated function include sources. `GetProgFullCode` may be used only if it returns raw, unmodified code and complete include metadata; current code-normalizing behaviour is not acceptable for exact search provenance. |
| `SELECT * FROM TRDIR WHERE name IN { <class>* }` (class includes enumeration) | `GetIncludesList` for the class |

No new endpoint required.

### Source fidelity requirements

- Source text used for matching and snippets must be raw source text as returned by ADT. The search layer must not collapse spaces, trim before matching, reformat JSON payloads, or otherwise mutate source lines before line-number calculation and substring checks.
- `GetProgFullCode` is not the default scan primitive for this tool. It currently normalizes repeated spaces and aggregates includes, which conflicts with exact snippet provenance and AFX `PROG` scan scope.
- `include` in a result identifies the actual source unit that produced the hit. For a root program match it is the program name. For FUGR/class child source matches it is the generated include/source-unit name.
- Object-level `max_hits_per_object` applies to the root repository object (`PROG`, `FUGR`, or `CLAS`) across all source units scanned for that object.

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

- **Unit:** scan algorithm against in-memory source — query / query2 / exclude / comment-default / comment-skip / cap behaviours. Tests must assert that matches inside `* ...` and full-line `" ...` comments are returned when `exclude_comments` is omitted or `false`, and skipped only when `exclude_comments=true`. Tests must also assert that inline comments after code remain searchable even when `exclude_comments=true`.
- **Integration (soft mode):** create a small package with three controlled objects (one program, one FUGR with two FMs, one class with two includes) inside `shared:setup`, then call `SearchSource` with each AFX-equivalent option permutation and assert the expected line set.
- **Integration (hard mode):** same flow through MCP stdio.

The unit tests do not touch the network; the integration tests do, and live alongside the existing runtime/profiling tests.

## Open questions

1. Should `object_filter` accept a true ABAP range pattern (e.g. `Z*`, `Y*` with multiple lows) or just a single glob? AFX uses `s_rest` (full range); for MCP the simplest contract is a single pattern. Decided: **single glob** for now, range support can come later behind a separate input field.
2. Inactive-source preference. AFX does `STATE 'I'` first, falls back to active. ADT support is object-family dependent: `GetClass` already exposes `version: 'inactive'`, while some program/include reads may only expose the active source through the current handlers. V1 should prefer inactive where the source primitive supports it and fall back to active; when inactive cannot be requested, document that per object family in the implementation notes and tests.
