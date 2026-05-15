# SearchSource — Package Name Masks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `SearchSource.packages` accept ABAP-style name masks (`Z*`, `ZFI_*`, `/NS/Z*`, `Z+OK`) alongside exact dev-class names, resolved via the same ADT informationsystem search path that `SearchObject` uses for `objectType=DEVC`. Closes [#87](https://github.com/fr0ster/mcp-abap-adt/issues/87).

**Architecture:** Insert a new resolver step between `OrchestratorInput.packages` and `enumerateScanTargets`. The resolver is a pure function over an injected `searchObjects`-style dependency, making it unit-testable without a live SAP system. Orchestrator counts `scanned.packages = resolved.length` (after dedup) instead of raw input length — the only externally visible behavior change beyond mask support.

**Tech Stack:** TypeScript, Jest, Zod schemas, `@mcp-abap-adt/adt-clients` (`utils.searchObjects`).

**Spec:** `docs/superpowers/specs/2026-05-15-searchsource-package-masks-design.md`

---

## File Structure

**Create:**
- `src/lib/search-source/packageResolver.ts` — Wildcard detection, ADT lookup, dedup. Pure function plus a `HandlerContext`-backed factory. Mirrors the shape of `packageEnumerator.ts`.
- `src/__tests__/lib/search-source/packageResolver.test.ts` — Unit tests for the resolver with stub `searchObjects`. (Note: path matches the orchestrator-test convention `src/__tests__/lib/search-source/`, not `src/__tests__/unit/search-source/` mentioned in the spec — the latter would be a new directory; the former matches existing layout.)

**Modify:**
- `src/lib/search-source/orchestrator.ts` — Add `resolvePackages` to `OrchestratorDeps`, call it before `enumerateScanTargets`, set `scanned.packages = resolved.length`. Wire `createPackagePatternResolver(ctx)` in `runSearchSourceWithContext`.
- `src/handlers/system/readonly/handleSearchSource.ts` — Extend tool `description` with the no-guarantees disclosure; extend `packages` field description to document mask syntax.
- `src/__tests__/lib/search-source/orchestrator.test.ts` — Update existing tests to pass an identity stub resolver in `OrchestratorDeps`; add a new test asserting `scanned.packages == resolved.length` semantics including dedup.
- `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts` — Add the mask-correctness integration cases from the spec.

---

## Task 1: Resolver — wildcard detection (unit)

**Files:**
- Create: `src/__tests__/lib/search-source/packageResolver.test.ts`

- [ ] **Step 1: Write the failing test for wildcard detection**

The resolver decides per-entry whether to call ADT (wildcard present) or pass through (exact name). Test the predicate via the resolver's public behavior: with a stub that throws if called, exact entries must not trigger the stub.

Create `src/__tests__/lib/search-source/packageResolver.test.ts`:

```ts
import { resolvePackagePatterns } from '../../../lib/search-source/packageResolver';

function neverCalled(): never {
  throw new Error('searchObjects must not be called for exact entries');
}

describe('resolvePackagePatterns — wildcard detection', () => {
  it('passes exact dev-class names through without calling ADT', async () => {
    const out = await resolvePackagePatterns(
      { searchObjects: neverCalled },
      ['ZFI_OBSOLETE', '$TMP', '/NS/ZFI'],
    );
    expect(out).toEqual(['ZFI_OBSOLETE', '$TMP', '/NS/ZFI']);
  });

  it('treats entries containing * as patterns', async () => {
    const calls: string[] = [];
    const out = await resolvePackagePatterns(
      {
        searchObjects: async ({ query }) => {
          calls.push(query);
          return [];
        },
      },
      ['Z*'],
    );
    expect(calls).toEqual(['Z*']);
    expect(out).toEqual([]);
  });

  it('treats entries containing + as patterns', async () => {
    const calls: string[] = [];
    await resolvePackagePatterns(
      {
        searchObjects: async ({ query }) => {
          calls.push(query);
          return [];
        },
      },
      ['Z+OK'],
    );
    expect(calls).toEqual(['Z+OK']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPatterns=packageResolver`
Expected: FAIL with "Cannot find module '../../../lib/search-source/packageResolver'".

- [ ] **Step 3: Implement minimal resolver to make the predicate behavior pass**

Create `src/lib/search-source/packageResolver.ts`:

```ts
import { createAdtClient } from '../clients';
import type { HandlerContext } from '../handlers/interfaces';

export interface SearchObjectsArgs {
  query: string;
  objectType: 'DEVC';
  maxResults: number;
}

export type SearchObjectsFn = (args: SearchObjectsArgs) => Promise<string[]>;

export interface PackageResolverDeps {
  searchObjects: SearchObjectsFn;
}

const WILDCARD_RE = /[*+]/;

function isPattern(entry: string): boolean {
  return WILDCARD_RE.test(entry);
}

export async function resolvePackagePatterns(
  deps: PackageResolverDeps,
  entries: string[],
): Promise<string[]> {
  const exact: string[] = [];
  const resolved: string[] = [];
  for (const entry of entries) {
    if (isPattern(entry)) {
      const names = await deps.searchObjects({
        query: entry,
        objectType: 'DEVC',
        maxResults: 1000,
      });
      resolved.push(...names);
    } else {
      exact.push(entry);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...exact, ...resolved]) {
    const key = name.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

export function createPackagePatternResolver(
  ctx: HandlerContext,
): SearchObjectsFn {
  const client = createAdtClient(ctx.connection, ctx.logger);
  const utils = client.getUtils();
  return async ({ query, objectType, maxResults }) => {
    const response = await utils.searchObjects({
      query,
      objectType,
      maxResults,
    });
    const status = response?.status ?? response?.response?.status;
    if (status && status !== 200) {
      throw new Error(`ADT request failed (status ${status})`);
    }
    const xml: string =
      typeof response?.data === 'string'
        ? response.data
        : String(response?.data ?? '');
    const names: string[] = [];
    for (const m of xml.matchAll(
      /<adtcore:objectReference\s+([^>]*)\/>/g,
    )) {
      const attrs = m[1];
      const name = attrs.match(/adtcore:name="([^"]*)"/)?.[1];
      if (name) names.push(name);
    }
    return names;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=packageResolver`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/search-source/packageResolver.ts src/__tests__/lib/search-source/packageResolver.test.ts
git commit -m "feat(search-source): packageResolver with wildcard detection + ADT lookup"
```

---

## Task 2: Resolver — XML parsing via injected stub (unit)

**Files:**
- Modify: `src/__tests__/lib/search-source/packageResolver.test.ts`

Note: the resolver's public surface takes a stub `searchObjects` that already returns `string[]`. The XML-parsing branch is only exercised by `createPackagePatternResolver`, which builds the stub from the live ADT client. To keep this honest, add a test that exercises the factory against a fake `HandlerContext` whose `connection` produces a canned XML payload. This guards the regex from silent breakage.

- [ ] **Step 1: Write the failing test for XML name extraction**

Append to `src/__tests__/lib/search-source/packageResolver.test.ts`:

```ts
import { createPackagePatternResolver } from '../../../lib/search-source/packageResolver';

jest.mock('../../../lib/clients', () => ({
  createAdtClient: (_conn: unknown, _logger: unknown) => ({
    getUtils: () => ({
      searchObjects: async ({ query }: { query: string }) => ({
        data:
          query === 'EMPTY*'
            ? '<adtcore:objectReferences/>'
            : '<adtcore:objectReferences>' +
              '<adtcore:objectReference adtcore:name="ZFI" adtcore:type="DEVC"/>' +
              '<adtcore:objectReference adtcore:name="ZFI_BUDGET" adtcore:type="DEVC"/>' +
              '</adtcore:objectReferences>',
      }),
    }),
  }),
}));

describe('createPackagePatternResolver — XML parsing', () => {
  const fakeCtx = { connection: {} as any, logger: undefined } as any;

  it('extracts adtcore:name attributes from objectReference elements', async () => {
    const fn = createPackagePatternResolver(fakeCtx);
    const names = await fn({
      query: 'ZFI*',
      objectType: 'DEVC',
      maxResults: 1000,
    });
    expect(names).toEqual(['ZFI', 'ZFI_BUDGET']);
  });

  it('returns empty array when ADT XML has no objectReference elements', async () => {
    const fn = createPackagePatternResolver(fakeCtx);
    const names = await fn({
      query: 'EMPTY*',
      objectType: 'DEVC',
      maxResults: 1000,
    });
    expect(names).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npm test -- --testPathPatterns=packageResolver`
Expected: PASS (5 tests total — the factory was already implemented in Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/lib/search-source/packageResolver.test.ts
git commit -m "test(search-source): packageResolver XML parsing through factory"
```

---

## Task 3: Resolver — order, dedup, empty, error propagation (unit)

**Files:**
- Modify: `src/__tests__/lib/search-source/packageResolver.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/lib/search-source/packageResolver.test.ts`:

```ts
describe('resolvePackagePatterns — merge semantics', () => {
  it('places exact entries before pattern-resolved names', async () => {
    const out = await resolvePackagePatterns(
      {
        searchObjects: async () => ['Z_FROM_PATTERN_A', 'Z_FROM_PATTERN_B'],
      },
      ['Z_EXACT_1', 'Z*', 'Z_EXACT_2'],
    );
    expect(out).toEqual([
      'Z_EXACT_1',
      'Z_EXACT_2',
      'Z_FROM_PATTERN_A',
      'Z_FROM_PATTERN_B',
    ]);
  });

  it('deduplicates by uppercase, first occurrence wins for ordering', async () => {
    const out = await resolvePackagePatterns(
      {
        searchObjects: async () => ['ZFI', 'ZFI_BUDGET'],
      },
      ['zfi', 'ZFI_*'],
    );
    expect(out).toEqual(['zfi', 'ZFI_BUDGET']);
  });

  it('returns empty array when patterns resolve to no packages and no exact entries', async () => {
    const out = await resolvePackagePatterns(
      { searchObjects: async () => [] },
      ['ZZZ_NONEXISTENT*'],
    );
    expect(out).toEqual([]);
  });

  it('propagates errors from searchObjects', async () => {
    const boom = new Error('ADT 502');
    await expect(
      resolvePackagePatterns(
        {
          searchObjects: async () => {
            throw boom;
          },
        },
        ['Z*'],
      ),
    ).rejects.toBe(boom);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --testPathPatterns=packageResolver`
Expected: PASS (9 tests total). Implementation from Task 1 already covers these cases.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/lib/search-source/packageResolver.test.ts
git commit -m "test(search-source): packageResolver order/dedup/empty/error semantics"
```

---

## Task 4: Orchestrator — wire resolver into deps, add identity in existing tests

**Files:**
- Modify: `src/lib/search-source/orchestrator.ts`
- Modify: `src/__tests__/lib/search-source/orchestrator.test.ts`

- [ ] **Step 1: Update OrchestratorDeps to include resolvePackages**

Edit `src/lib/search-source/orchestrator.ts`. Add to imports:

```ts
import {
  createPackagePatternResolver,
  type PackageResolverDeps,
  resolvePackagePatterns,
} from './packageResolver';
```

Change `OrchestratorDeps`:

```ts
export interface OrchestratorDeps {
  fetchPackageContents: PackageContentsFetcher;
  sourceReader: ReadSourceUnitsDeps;
  resolvePackages: (entries: string[]) => Promise<string[]>;
}
```

In `runSearchSource`, replace the line that builds `enumerateInput`:

Before:
```ts
const enumerateInput: EnumerateInput = {
  packages: input.packages,
  include_subpackages:
    input.include_subpackages ?? DEFAULTS.include_subpackages,
  object_filter: input.object_filter,
  object_types: input.object_types ?? DEFAULTS.object_types,
};
const allTargets = await enumerateScanTargets(
  deps.fetchPackageContents,
  enumerateInput,
);
```

After:
```ts
const resolvedPackages = await deps.resolvePackages(input.packages);
const enumerateInput: EnumerateInput = {
  packages: resolvedPackages,
  include_subpackages:
    input.include_subpackages ?? DEFAULTS.include_subpackages,
  object_filter: input.object_filter,
  object_types: input.object_types ?? DEFAULTS.object_types,
};
const allTargets =
  resolvedPackages.length === 0
    ? []
    : await enumerateScanTargets(deps.fetchPackageContents, enumerateInput);
```

Change `scanned.packages`:

Before:
```ts
scanned: {
  packages: input.packages.length,
  objects: targets.length,
  sources: sourcesScanned,
},
```

After:
```ts
scanned: {
  packages: resolvedPackages.length,
  objects: targets.length,
  sources: sourcesScanned,
},
```

Wire `runSearchSourceWithContext`:

Before:
```ts
export function runSearchSourceWithContext(
  ctx: HandlerContext,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  return runSearchSource(
    {
      fetchPackageContents: createPackageContentsFetcher(ctx),
      sourceReader: createSourceReaderDeps(ctx),
    },
    input,
  );
}
```

After:
```ts
export function runSearchSourceWithContext(
  ctx: HandlerContext,
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const searchObjects = createPackagePatternResolver(ctx);
  const resolverDeps: PackageResolverDeps = { searchObjects };
  return runSearchSource(
    {
      fetchPackageContents: createPackageContentsFetcher(ctx),
      sourceReader: createSourceReaderDeps(ctx),
      resolvePackages: (entries) =>
        resolvePackagePatterns(resolverDeps, entries),
    },
    input,
  );
}
```

- [ ] **Step 2: Update existing orchestrator tests to pass an identity resolver**

Open `src/__tests__/lib/search-source/orchestrator.test.ts`. Every `OrchestratorDeps` literal needs `resolvePackages`. Add a helper near the top of the file (after the existing `pkg` and `sourceFor` helpers):

```ts
const identityResolver = async (entries: string[]) => entries;
```

Then in each `const deps: OrchestratorDeps = { … }` literal in the file, add the line:

```ts
resolvePackages: identityResolver,
```

There is no shortcut here — the type system requires it on every literal. Run a search to find them all:

```bash
rg -n "OrchestratorDeps = \\{" src/__tests__/lib/search-source/orchestrator.test.ts
```

Add `resolvePackages: identityResolver,` to each.

- [ ] **Step 3: Run orchestrator tests to verify they still pass**

Run: `npm test -- --testPathPatterns=orchestrator`
Expected: PASS — pre-existing behavior is unchanged because exact inputs without duplicates resolve to themselves.

- [ ] **Step 4: Commit**

```bash
git add src/lib/search-source/orchestrator.ts src/__tests__/lib/search-source/orchestrator.test.ts
git commit -m "feat(search-source): wire packageResolver into orchestrator deps"
```

---

## Task 5: Orchestrator — scanned.packages reflects resolved count (unit)

**Files:**
- Modify: `src/__tests__/lib/search-source/orchestrator.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/lib/search-source/orchestrator.test.ts`:

```ts
describe('runSearchSource — scanned.packages reflects resolved count', () => {
  it('counts resolved packages, not raw input, when patterns expand', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'ZA_PROG', adtType: 'PROG/P', packageName: 'ZA' },
        { name: 'ZB_PROG', adtType: 'PROG/P', packageName: 'ZB' },
      ]),
      sourceReader: sourceFor({
        'PROG:ZA_PROG': 'marker',
        'PROG:ZB_PROG': 'marker',
      }),
      resolvePackages: async () => ['ZA', 'ZB'],
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      packages: ['Z*'],
    });
    expect(result.scanned.packages).toBe(2);
  });

  it('returns empty result with scanned.packages: 0 when resolution is empty', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: () => {
        throw new Error('must not enumerate when resolved set is empty');
      },
      sourceReader: sourceFor({}),
      resolvePackages: async () => [],
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      packages: ['ZZZ_NONEXISTENT*'],
    });
    expect(result.results).toEqual([]);
    expect(result.scanned).toEqual({ packages: 0, objects: 0, sources: 0 });
    expect(result.truncated).toEqual({
      by_object_cap: false,
      by_max_objects: false,
    });
  });

  it('collapses case-duplicate exact entries before enumeration', async () => {
    let fetchedFor: string | undefined;
    const deps: OrchestratorDeps = {
      fetchPackageContents: async (name) => {
        fetchedFor = name;
        return [];
      },
      sourceReader: sourceFor({}),
      resolvePackages: async (entries) => {
        const seen = new Set<string>();
        const out: string[] = [];
        for (const e of entries) {
          const key = e.toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            out.push(e);
          }
        }
        return out;
      },
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      packages: ['ZPKG', 'zpkg'],
    });
    expect(result.scanned.packages).toBe(1);
    expect(fetchedFor).toBe('ZPKG');
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npm test -- --testPathPatterns=orchestrator`
Expected: PASS (all three new cases plus all pre-existing).

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/lib/search-source/orchestrator.test.ts
git commit -m "test(search-source): scanned.packages reflects resolved count and dedup"
```

---

## Task 6: Tool description — mask syntax and no-guarantees disclosure

**Files:**
- Modify: `src/handlers/system/readonly/handleSearchSource.ts`

- [ ] **Step 1: Update tool description**

Edit `src/handlers/system/readonly/handleSearchSource.ts`. Replace the `description` value:

Before:
```ts
description:
  '[read-only] Search ABAP source text inside one or more packages (programs, function groups, classes). Onprem-only (cloud lacks an indexed source-search endpoint). Comments are searched by default; set exclude_comments=true to drop col-1 `*` and full-line `"` comments. The `version` parameter affects PROG and CLAS main include reads only — FUGR subinclude reads always go against the active version (the include endpoint exposes no version selector).',
```

After:
```ts
description:
  '[read-only] Search ABAP source text inside one or more packages (programs, function groups, classes). Onprem-only (cloud lacks an indexed source-search endpoint). `packages` accepts ABAP-style masks (Z*, ZFI_*, /NS/Z*, Z+OK) alongside exact names; mask resolution is best-effort and scoped to the ADT repository-search result window — there is no guarantee that every matching package is scanned. If you need certainty, pass concrete package names. When using masks, narrow the mask itself and use `object_types`, `object_filter`, and `max_objects` as scan-target controls that apply after package resolution. Comments are searched by default; set exclude_comments=true to drop col-1 `*` and full-line `"` comments. The `version` parameter affects PROG and CLAS main include reads only — FUGR subinclude reads always go against the active version (the include endpoint exposes no version selector).',
```

Replace the `packages` field schema:

Before:
```ts
packages: z
  .array(z.string().min(1))
  .min(1)
  .describe('Packages to scan (one or more dev classes).'),
```

After:
```ts
packages: z
  .array(z.string().min(1))
  .min(1)
  .describe(
    'Packages to scan. Each entry is either an exact dev-class name or an ABAP mask (* = any chars, + = exactly one char). Examples: "ZFI_OBSOLETE", "Z*", "ZFI_*", "/NS/Z*", "Z+OK".',
  ),
```

- [ ] **Step 2: Verify type-check passes**

Run: `npm run test:check`
Expected: no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/handlers/system/readonly/handleSearchSource.ts
git commit -m "feat(search-source): document package masks in tool description"
```

---

## Task 7: Integration tests — mask correctness, filters, empty namespace, mixed input

**Files:**
- Modify: `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts`

- [ ] **Step 1: Add a helper to derive a mask from the configured shared package**

Open `src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts`. Below the existing `parseResult` function, add:

```ts
function deriveMaskFromPackage(pkg: string): string {
  // Keep the mask narrow so integration tests stay fixture-scoped:
  // ZADT_BLD_PKG03 -> ZADT_BLD_PKG0*; /NS/ZFOO -> /NS/ZFO*
  const slashTail = pkg.lastIndexOf('/');
  const prefixEnd = slashTail >= 0 ? slashTail + 1 : 0;
  const tail = pkg.slice(prefixEnd);
  const stem = tail.length > 4 ? tail.slice(0, tail.length - 1) : tail;
  return pkg.slice(0, prefixEnd) + stem + '*';
}

function maskToRegExp(mask: string): RegExp {
  let p = '';
  for (const ch of mask) {
    if (ch === '*') p += '.*';
    else if (ch === '+') p += '.';
    else p += ch.replace(/[\\.+^$()|[\]{}]/g, '\\$&');
  }
  return new RegExp(`^${p}$`, 'i');
}
```

- [ ] **Step 2: Add mask-with-subpackages test (existence only)**

Add a new `it(...)` to the existing `describe('SearchSource Handler Integration', ...)` block:

```ts
it(
  'mask derived from the shared package yields hits (include_subpackages: true)',
  async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
      const query = String(params?.known_query ?? 'Echo:');
      const mask = deriveMaskFromPackage(pkg);

      const args = {
        query,
        packages: [mask],
        include_subpackages: true,
        max_hits_per_object: 5,
        max_objects: 50,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      expect(result.isError).toBe(false);
      const data = parseResult(result);
      expect(data.results.length).toBeGreaterThan(0);
      // Devclass assertion intentionally omitted: subpackages can expand
      // beyond the original mask.
    });
  },
  getTimeout('long'),
);
```

- [ ] **Step 3: Add mask-correctness test (only test that asserts devclass matches mask)**

Add another `it(...)`:

```ts
it(
  'mask derived from the shared package matches devclass when include_subpackages: false',
  async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
      const query = String(params?.known_query ?? 'Echo:');
      const mask = deriveMaskFromPackage(pkg);
      const maskRe = maskToRegExp(mask);

      const args = {
        query,
        packages: [mask],
        include_subpackages: false,
        max_hits_per_object: 5,
        max_objects: 50,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      expect(result.isError).toBe(false);
      const data = parseResult(result);
      expect(data.results.length).toBeGreaterThan(0);
      for (const hit of data.results) {
        expect(hit.devclass).toMatch(maskRe);
      }
    });
  },
  getTimeout('long'),
);
```

- [ ] **Step 4: Add empty-namespace test**

```ts
it(
  'pattern that resolves to zero packages returns an empty result',
  async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const query = String(params?.known_query ?? 'Echo:');

      const args = {
        query,
        packages: ['ZZZ_NONEXISTENT_NAMESPACE_XYZ*'],
        max_objects: 50,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      expect(result.isError).toBe(false);
      const data = parseResult(result);
      expect(data.results).toEqual([]);
      expect(data.scanned.packages).toBe(0);
    });
  },
  getTimeout('medium'),
);
```

- [ ] **Step 5: Add mixed-input test**

```ts
it(
  'mixed [shared.package, mask] preserves hits from the shared package',
  async () => {
    await tester.run(async (context: LambdaTesterContext) => {
      const { connection, params } = context;
      const pkg = String(params?.scan_package ?? 'ZADT_BLD_PKG03');
      const query = String(params?.known_query ?? 'Echo:');
      const mask = deriveMaskFromPackage(pkg);

      const args = {
        query,
        packages: [pkg, mask],
        include_subpackages: true,
        max_hits_per_object: 5,
        max_objects: 50,
      };
      const result = await tester.invokeToolOrHandler(
        'SearchSource',
        args,
        async () => {
          const handlerContext = createHandlerContext({ connection, logger });
          return handleSearchSource(handlerContext, args);
        },
      );

      expect(result.isError).toBe(false);
      const data = parseResult(result);
      expect(data.results.length).toBeGreaterThan(0);
      const devclasses = new Set(data.results.map((h) => h.devclass));
      expect(devclasses.has(pkg)).toBe(true);
    });
  },
  getTimeout('long'),
);
```

- [ ] **Step 6: Run integration tests (soft mode)**

This requires SAP onprem connectivity. Ask the user before running (per project CLAUDE.md). The expected invocation:

```bash
npm run test:integration -- --testPathPatterns=integration/readOnly/system/SearchSource 2>&1 | tee /tmp/search-source-mask.log
```

Expected: all four new cases plus the three pre-existing pass; no zero-hit silent passes.

If `deriveMaskFromPackage` yields a too-narrow stem for the configured `scan_package`, the existence tests will report empty `results` — that means the helper needs adjustment for the actual package name; do not loosen the assertion to `>= 0`.

- [ ] **Step 7: Commit**

```bash
git add src/__tests__/integration/readOnly/system/SearchSourceHandler.test.ts
git commit -m "test(search-source): integration tests for package masks"
```

---

## Task 8: Reality-check probe and final build

**Files:**
- None (manual probe + final verification)

- [ ] **Step 1: Reality-check via the running MCP proxy**

Before opening a PR, hit the live onprem system through `mcp-abap-adt-proxy` (already running on 127.0.0.1:3001 per the dev session, or start with `mcp-abap-adt-proxy --config ~/.config/mcp-abap-adt/proxy/epam-sap-mcp.yaml`). Verify the resolver assumptions hold on the target backend:

```bash
curl -s -X POST http://127.0.0.1:3001/mcp/stream/http \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"SearchObject","arguments":{"object_name":"Z*","object_type":"DEVC","maxResults":50}}}' \
  | head -c 4000
```

Expected: a tab-separated list of package rows. Repeat with `Z+*` and `/NS/Z*` to confirm both wildcard chars and namespace masks are accepted by the ADT endpoint.

If `+` is not honored by this backend, remove it from the public examples (description string in `handleSearchSource.ts` and the example list in the spec) and ship `*` only for this release. Note this in the PR description.

- [ ] **Step 2: Full unit-test sweep**

Run: `npm test`
Expected: all suites pass.

- [ ] **Step 3: Lint and type-check**

Run: `npm run lint:check && npm run test:check`
Expected: clean.

- [ ] **Step 4: Bump tool-catalog docs if relevant**

Check whether `docs/development/tools/` contains a generated catalog that mentions `SearchSource.packages`. If yes, regenerate it (the repo has a regeneration step — look for `npm run docs` or a `scripts/` entry; if the repo has no such script, skip).

```bash
grep -rln "SearchSource" docs/ 2>/dev/null
```

For each catalog file that documents the old `packages` description, update it to match the new wording. Commit any changes separately:

```bash
git add docs/
git commit -m "docs: regenerate SearchSource catalog for package masks"
```

- [ ] **Step 5: Delete the spec (per project CLAUDE.md — specs live in the tree only while active)**

```bash
git rm docs/superpowers/specs/2026-05-15-searchsource-package-masks-design.md
git commit -m "docs: remove implemented SearchSource package-masks spec"
```

Plan stays in place until the PR merges, then gets deleted in the merge commit or a follow-up.

- [ ] **Step 6: Open PR**

```bash
gh pr create --title "feat(search-source): package name masks (#87)" --body "$(cat <<'EOF'
## Summary
- `SearchSource.packages` now accepts ABAP-style masks (`Z*`, `ZFI_*`, `/NS/Z*`, `Z+OK`) alongside exact dev-class names.
- Resolution reuses the same `SearchObject`/DEVC path; best-effort, capped to the ADT result window (documented in the tool description).
- `scanned.packages` now reports resolved-and-deduplicated count instead of raw input length.

Closes #87.

## Test plan
- [ ] `npm test -- --testPathPatterns="(packageResolver|orchestrator)"`
- [ ] `npm run test:integration -- --testPathPatterns=integration/readOnly/system/SearchSource` (onprem connectivity required)
- [ ] Live probe through `mcp-abap-adt-proxy`: `SearchObject({object_name:'Z*', object_type:'DEVC'})` returns expected XML

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Spec coverage:**
  - Schema delta (spec §Schema) — Task 6.
  - Resolution pipeline (spec §Resolution pipeline) — Tasks 1-4.
  - No-guarantees disclosure (spec §No-guarantees disclosure) — Task 6.
  - `scanned.packages` semantics change (spec §scanned.packages semantics change) — Tasks 4-5.
  - Behavioural contracts table rows — Tasks 1, 3, 5, 7.
  - Unit tests (spec §Tests/Unit) — Tasks 1-3, 5.
  - Integration tests (spec §Tests/Integration) — Task 7.
  - Reality-check before merge (spec §Reality-check) — Task 8.

- **Placeholder scan:** No `TBD`, no "add appropriate error handling", no "similar to Task N" stubs. Every code step shows the actual code.

- **Type consistency:** `OrchestratorDeps.resolvePackages: (entries: string[]) => Promise<string[]>` matches the call site in Task 4 and the identity stub in Tasks 4-5. `PackageResolverDeps.searchObjects: SearchObjectsFn` and `SearchObjectsFn = (args: SearchObjectsArgs) => Promise<string[]>` line up across Tasks 1, 2, and 4. The factory `createPackagePatternResolver(ctx): SearchObjectsFn` is used in Task 4's `runSearchSourceWithContext` rewrite — same return type.

- **Open follow-up flagged in plan:** Task 8 Step 4 (docs regeneration) is conditional — depends on whether a doc-generation script exists; instruction handles both branches without leaving a placeholder.
