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

All other fields (`include_subpackages`, `object_filter`, `object_types`, `max_objects`, etc.) are unchanged.

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

The `maxResults: 1000` is intentional: the DEVC search returns only names (cheap); the real workload cap is `max_objects`, applied later at scan-target level.

## Behavioural contracts

| Input | Behaviour |
| --- | --- |
| All entries exact (no `*`/`+`) | No ADT call. Pass-through. Identical to v6.7.0 behaviour. |
| One pattern, resolves to N packages | Scan all N (subject to `max_objects`). |
| Pattern resolves to zero packages | Treated as "empty codebase". Orchestrator returns the normal empty result (`hits: []`, `scanned.packages: 0`, `isError: false`). No diagnostic field, no error. |
| Mixed `["ZFI_OBSOLETE", "Z*"]` | Exact entries first; pattern hits appended; deduplicated (uppercase). |
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

- `packages: ['Z*']`, `query: 'CALL FUNCTION'`: hits present, every `devclass` matches `/^Z/i` (or namespace form `^/.*/Z`).
- `packages: ['ZZZ_NONEXISTENT_NAMESPACE*']`: returns empty result, `isError: false`, `scanned.packages: 0`.
- Mixed `[<shared.package>, 'Z*']`: hits include objects from the shared package and from other Z-packages.

Both blocks run under the existing `describeIntegration` / `available_in` gating — no new env flags.

### Reality-check before merge

Before opening the PR, run a discovery probe against the live onprem SAP system:

```
SearchObject({ object_name: 'Z*', object_type: 'DEVC' })
```

Confirm the XML payload matches the parser's assumptions on this target system (Issue #87 was filed against E19; behaviour on other onprem releases is not assumed).

## Out-of-scope follow-ups

- Negative package patterns (`!Z_OBSOLETE*`).
- Caching the resolved set across calls within a session.
- Surfacing the resolved package list back to the caller (e.g. `scanned.resolved_packages`). Not added now to keep the response shape unchanged.
