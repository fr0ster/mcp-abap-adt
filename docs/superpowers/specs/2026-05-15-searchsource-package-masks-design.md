# SearchSource — package name masks

Date: 2026-05-15
Issue: [#87](https://github.com/fr0ster/mcp-abap-adt/issues/87)
Status: draft

## Goal

Let `SearchSource.packages` accept ABAP-style name masks (`Z*`, `ZFI_*`, `/NS/Z*`, `Z+OK`) in addition to exact dev-class names, so an LLM agent can scope a source search to a whole namespace in a single call instead of "list packages then search".

Exact name is treated as a degenerate mask (zero wildcard characters). No new field, no new tool — `packages: string[]` is reinterpreted.

## Non-goals

- Negative patterns (`!Z_OBSOLETE*`). The existing `exclude` is line-level; package-level exclusion can be a follow-up.
- Cross-system patterns. `SearchSource` is single-system by design.
- Cloud support. `SearchSource` remains `available_in: ['onprem', 'legacy']` (cloud lacks the indexed source-search endpoint).

## Schema

`packages` keeps its type (`z.array(z.string().min(1)).min(1)`); only the description changes:

```ts
packages: z.array(z.string().min(1)).min(1)
  .describe(
    "Packages to scan. Each entry is either an exact dev-class name " +
    "or an ABAP mask (* = any chars, + = exactly one char). " +
    'Examples: "ZFI_OBSOLETE", "Z*", "ZFI_*", "/NS/Z*", "Z+OK".'
  )
```

All other fields (`include_subpackages`, `object_filter`, `object_types`, `max_objects`, etc.) are unchanged and remain the way callers narrow the object set after package-pattern resolution:

```ts
// Only classes in packages resolved from ZFI_*
{ packages: ["ZFI_*"], object_types: ["CLAS"], query: "SELECT" }

// Only programs/reports in Z packages
{ packages: ["Z*"], object_types: ["PROG"], query: "CALL FUNCTION" }

// Only class-like names inside the resolved package set
{ packages: ["Z*"], object_filter: "ZCL_*", object_types: ["CLAS"], query: "SELECT" }
```

## Resolution pipeline

A new module `src/lib/search-source/packageResolver.ts` introduces:

```ts
export async function resolvePackagePatterns(
  ctx: HandlerContext,
  entries: string[],
): Promise<string[]>
```

The orchestrator (`src/lib/search-source/orchestrator.ts`) calls it once, before `enumerateScanTargets`:

```
input.packages → resolvePackagePatterns(ctx, …) → resolved: string[] → enumerateScanTargets(…)
```

### Algorithm

1. **Detect wildcards.** An entry is a pattern iff it contains `*` or `+`. Entries without wildcards are kept as-is — zero ADT round-trips for callers that already pass exact names.
2. **Resolve each pattern** via the same path `SearchObject` uses:
   `utils.searchObjects({ query: pattern, objectType: 'DEVC', maxResults: 1000 })`.
   Parse `<adtcore:objectReference adtcore:name="…"/>` from the returned XML (same regex as `handleSearchObject.ts`).
3. **Merge.** Concatenation order: exact entries first (in input order), then resolved patterns (in input order, each in the order ADT returned them).
4. **Dedup.** A `Set<string>` keyed by uppercased name. First occurrence wins for ordering.

The `maxResults: 1000` is intentional and follows the existing ADT/SearchObject behaviour. Package-pattern resolution scans exactly the package references returned by ADT for that request. If the ABAP/ADT repository search has more than 1000 matching packages, entries beyond that ADT result window are not scanned and no `SearchSource` truncation signal is added for package-resolution overflow. The workload cap remains `max_objects`, applied later at scan-target level to the resolved package list.

`maxResults: 1000` is a resolver-internal detail and is not exposed as a `SearchSource` input — keeping the surface narrow and the cap consistent with `SearchObject`.

### No-guarantees disclosure

Package masks are best-effort scoping, not exhaustive enumeration. The tool description for `SearchSource` is updated to say so plainly, so an LLM caller sees it without reading internals:

> `packages` accepts ABAP-style masks (`Z*`, `ZFI_*`, `/NS/Z*`, `Z+OK`) alongside exact names. Mask resolution is best-effort and scoped to the ADT repository-search result window; there is no guarantee that every matching package is scanned. If you need certainty, pass concrete package names. When using masks, narrow the package mask itself and treat `object_types`, `object_filter`, and `max_objects` as scan-target controls that apply only after package resolution.

`include_subpackages` is applied after package-pattern resolution, as it is for exact package names today. A package mask selects the starting dev classes; with `include_subpackages: true`, the scan may include objects whose `devclass` is a subpackage that does not itself match the original mask.

### `scanned.packages` semantics change

Today the orchestrator reports `scanned.packages = input.packages.length` (raw input count). With mask support that number is no longer meaningful — `['Z*']` is one input entry but can resolve to hundreds of dev classes, and `['ZZZ_NONEXISTENT*']` can resolve to zero.

The orchestrator changes to report **resolved** package count instead: `scanned.packages = resolved.length` (after `resolvePackagePatterns` and dedup). For purely-exact callers the new number equals the old one as long as they pass no duplicates — duplicates now collapse, which is the correct semantics for a count of what was scanned.

This is the only externally visible behaviour change beyond the new mask support.

## Behavioural contracts

| Input | Behaviour |
| --- | --- |
| All entries exact (no `*`/`+`) | No ADT call. Pass-through. Identical to v6.7.0 behaviour. |
| One pattern, resolves to N packages in the ADT result window | Scan those N resolved packages (subject to `max_objects`). |
| Pattern resolves to zero packages | Treated as "empty codebase". Orchestrator returns the normal empty result (`results: []`, `scanned.packages: 0`, `isError: false`). No diagnostic field, no error. |
| Mixed `["ZFI_OBSOLETE", "Z*"]` | Exact entries first; resolved package names from patterns appended; deduplicated (uppercase). |
| `include_subpackages: true` with a package mask | The mask filters only the starting packages. Subpackage objects may have a `devclass` that does not match the original mask. |
| `object_types` set | Existing object-family filter still applies after package resolution (`PROG`, `FUGR`, `CLAS`). |
| `object_filter` set | Existing object-name glob filter still applies after package resolution. |
| `searchObjects` (DEVC) errors (network, 5xx, 406) | Error propagates. `handleSearchSource` returns `isError: true` as today. |
| Resolved set > `max_objects` worth of scan targets | `enumerateScanTargets` produces the full target list; orchestrator caps to `max_objects` and sets `truncated.by_max_objects: true`. Order of truncation is the existing `enumerateScanTargets` order: alphabetical by `devclass`, then `object_type`, then `object_name`. Mask support does not change this. |

## Tests

### Unit — `src/__tests__/unit/search-source/packageResolver.test.ts` (new)

- Wildcard detection: `Z*`, `Z+`, `/NS/Z*` → resolve; `ZFI_OBSOLETE`, `$TMP` → pass-through.
- Mixed input: exact-then-pattern preserves input order; exact entries appear before resolved ones.
- Dedup uppercase: input `["zfi"]` plus pattern that returns `ZFI` → single entry.
- Empty resolve: `searchObjects` mock returns no references → empty array; no error.
- Propagation: `searchObjects` rejects → `resolvePackagePatterns` rejects with the same error.

### Integration — extend `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts`

- Mask derived from the configured shared package, with the existing known query: `results.length > 0`. Do not assert that every returned `devclass` matches the original mask when `include_subpackages` is true, because subpackages can expand beyond the starting package mask.
- Mask derived from the configured shared package, `include_subpackages: false`, and the existing known query: `results.length > 0` and every hit has `devclass` matching the derived mask. This is the only test that asserts mask correctness directly; with `include_subpackages: true` the assertion is unsound (see row above).
- Use a fixture-backed class query, `object_types: ['CLAS']`: `results.length > 0` and every hit has `object_type === 'CLAS'`. If the configured shared fixtures do not include a class hit for the query, discover a suitable class first or skip with a clear reason; do not allow a zero-hit pass.
- Use a fixture-backed program query, `object_types: ['PROG']`: `results.length > 0` and every hit has `object_type === 'PROG'`. If the configured shared fixtures do not include a program hit for the query, discover a suitable program first or skip with a clear reason; do not allow a zero-hit pass.
- Use a fixture-backed class-name glob, `object_filter: '<known class glob>'`, `object_types: ['CLAS']`: `results.length > 0`, every hit has `object_type === 'CLAS'`, and every hit has an object name matching the glob.
- `packages: ['ZZZ_NONEXISTENT_NAMESPACE*']`: returns empty result, `isError: false`, `scanned.packages: 0`.
- Mixed `[<shared.package>, 'Z*']`: hits include objects from the shared package and from other Z-packages.

The integration cases run under the existing SearchSource integration gating / `available_in` handling — no new env flags.

### Reality-check before merge

Before opening the PR, run a discovery probe against the live onprem SAP system:

```
SearchObject({ object_name: 'Z*', object_type: 'DEVC' })
SearchObject({ object_name: 'Z+*', object_type: 'DEVC' })
SearchObject({ object_name: '/NS/Z*', object_type: 'DEVC' })
```

Confirm the XML payload matches the parser's assumptions on this target system, and confirm that `+` and namespace masks are accepted with the intended ADT semantics. If the backend does not support `+` as expected, remove `+` from the public examples for this release. Issue #87 was filed against E19; behaviour on other onprem releases is not assumed.

## Out-of-scope follow-ups

- Negative package patterns (`!Z_OBSOLETE*`).
- Caching the resolved set across calls within a session.
- Surfacing the resolved package list back to the caller (e.g. `scanned.resolved_packages`). Not added now to keep the response shape unchanged.
