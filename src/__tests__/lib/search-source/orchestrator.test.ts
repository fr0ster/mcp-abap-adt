import {
  type OrchestratorDeps,
  type OrchestratorInput,
  runSearchSource,
} from '../../../lib/search-source/orchestrator';
import type {
  PackageContentItem,
  PackageContentsFetcher,
} from '../../../lib/search-source/packageEnumerator';
import type {
  FugrChild,
  ReadSourceUnitsDeps,
} from '../../../lib/search-source/sourceReader';

function pkg(
  items: Array<Partial<PackageContentItem>>,
): PackageContentsFetcher {
  return async () =>
    items.map((it) => ({
      name: it.name ?? '',
      adtType: it.adtType ?? 'PROG/P',
      packageName: it.packageName ?? 'ZPKG',
      isPackage: it.isPackage ?? false,
    }));
}

function sourceFor(map: Record<string, string>): ReadSourceUnitsDeps {
  return {
    async readProgram(name) {
      return map[`PROG:${name}`] ?? null;
    },
    async readInclude(name) {
      return map[`INC:${name}`] ?? null;
    },
    async readClassMain(name) {
      return map[`CLAS:${name}`] ?? null;
    },
    async fetchFugrStructure(name) {
      const raw = map[`FUGRSTR:${name}`];
      if (!raw) return [];
      return raw.split('\n').map((row) => {
        const [objecttype, objectname] = row.split('|');
        return { objecttype, objectname } as FugrChild;
      });
    },
    async readFugrFm(fg, fm) {
      return map[`FM:${fg}/${fm}`] ?? null;
    },
  };
}

const identityResolver = async (entries: string[]) => entries;

const baseInput: OrchestratorInput = {
  query: 'marker',
  packages: ['ZPKG'],
  object_types: ['PROG', 'CLAS', 'FUGR'],
  max_hits_per_object: 10,
};

describe('runSearchSource', () => {
  it('aggregates hits across packages and types, sorts by (devclass, object_name, include, line)', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'ZB_PROG', adtType: 'PROG/P', packageName: 'ZB' },
        { name: 'ZA_CLAS', adtType: 'CLAS/OC', packageName: 'ZA' },
        { name: 'ZA_PROG', adtType: 'PROG/P', packageName: 'ZA' },
      ]),
      sourceReader: sourceFor({
        'PROG:ZB_PROG': 'no\nmarker here\nmore',
        'PROG:ZA_PROG': 'marker top',
        'CLAS:ZA_CLAS': 'a\nb\nmarker mid',
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, baseInput);
    expect(
      result.results.map((r) => `${r.devclass}/${r.object_name}:${r.line}`),
    ).toEqual(['ZA/ZA_CLAS:3', 'ZA/ZA_PROG:1', 'ZB/ZB_PROG:2']);
    expect(result.scanned).toEqual({ packages: 1, objects: 3, sources: 3 });
    expect(result.truncated).toEqual({
      by_object_cap: false,
      by_max_objects: false,
      by_timeout: false,
    });
  });

  it('caps hits per object and flips truncated.by_object_cap', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_PROG', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_PROG': 'marker 1\nmarker 2\nmarker 3\nmarker 4\nmarker 5',
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      max_hits_per_object: 2,
    });
    expect(result.results).toHaveLength(2);
    expect(result.truncated.by_object_cap).toBe(true);
    expect(result.truncated.by_max_objects).toBe(false);
  });

  it('does not flip truncated.by_object_cap when an object has exactly max_hits_per_object matches', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_PROG', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_PROG': 'marker 1\nno match\nstill no match',
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      max_hits_per_object: 1,
    });
    expect(result.results).toHaveLength(1);
    expect(result.truncated.by_object_cap).toBe(false);
  });

  it('probes later source units and flips truncated.by_object_cap when matches are omitted after the per-object budget is filled', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_FG', adtType: 'FUGR/F', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'FUGRSTR:Z_FG': 'FUGR/FF|Z_FM_A\nFUGR/FF|Z_FM_B',
        'FM:Z_FG/Z_FM_A': 'marker 1',
        'FM:Z_FG/Z_FM_B': 'marker 2',
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      max_hits_per_object: 1,
    });
    expect(result.results).toHaveLength(1);
    expect(result.truncated.by_object_cap).toBe(true);
  });

  it('caps enumerated targets via max_objects and flips truncated.by_max_objects', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_P1', adtType: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_P2', adtType: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_P3', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_P1': 'marker',
        'PROG:Z_P2': 'marker',
        'PROG:Z_P3': 'marker',
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      max_objects: 1,
    });
    expect(result.scanned.objects).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.truncated.by_max_objects).toBe(true);
  });

  it('emit_no_hits=true emits a separate entry for zero-hit targets and never mixes them into results', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_HIT', adtType: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_MISS', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_HIT': 'marker line',
        'PROG:Z_MISS': 'nothing here',
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      emit_no_hits: true,
    });
    expect(result.results.map((r) => r.object_name)).toEqual(['Z_HIT']);
    expect(result.no_hits).toEqual([
      { devclass: 'ZPKG', object_type: 'PROG', object_name: 'Z_MISS' },
    ]);
  });
});

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
      fetchPackageContents: async () => {
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
      by_timeout: false,
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

describe('runSearchSource — time budget (Fix A)', () => {
  it('returns partial hits and sets truncated.by_timeout=true when deadline is exceeded mid-scan', async () => {
    // Two PROG targets both containing the query. concurrency:1 makes scanning strictly
    // sequential so the now() call order is deterministic.
    //
    // Exact now() call sequence with concurrency:1 and one source unit per PROG target:
    //   Call 1 — deadline computation: now() + 500 = 1500
    //   Call 2 — pump shouldStop() before Z_P1: must be < 1500 → enter worker
    //   Call 3 — deadlinePassed() at top of for-await body for Z_P1's unit: must be < 1500
    //             → unit processed, hit added to targetHits, worker completes, allHits.push
    //   Call 4 — pump shouldStop() before Z_P2: must be >= 1500 → onStop, pump exits
    //
    // Calls 1-3 return 1000 (below deadline); call 4+ returns 2000 (above deadline).
    // This guarantees Z_P1's hit survives in allHits while Z_P2/Z_P3 are never started.
    let callCount = 0;
    const fakeNow = () => {
      callCount++;
      return callCount <= 3 ? 1000 : 2000;
    };

    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_P1', adtType: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_P2', adtType: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_P3', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_P1': 'marker here',
        'PROG:Z_P2': 'marker here',
        'PROG:Z_P3': 'marker here',
      }),
      resolvePackages: identityResolver,
      now: fakeNow,
    };

    // concurrency:1 ensures the call sequence above is strictly serial.
    const result = await runSearchSource(deps, {
      ...baseInput,
      concurrency: 1,
      time_budget_ms: 500,
    });

    // Partial hits: Z_P1 was fully scanned and its hit must survive in results
    expect(result.results.length).toBeGreaterThanOrEqual(1);
    expect(result.truncated.by_timeout).toBe(true);
    // Strictly fewer sources scanned than the 3 available (Z_P2 and Z_P3 were skipped)
    expect(result.scanned.sources).toBeGreaterThanOrEqual(1);
    expect(result.scanned.sources).toBeLessThan(3);
  });

  it('returns truncated.by_timeout=false and full results when no time_budget_ms is set', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_P1', adtType: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_P2', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_P1': 'marker here',
        'PROG:Z_P2': 'marker here',
      }),
      resolvePackages: identityResolver,
    };

    const result = await runSearchSource(deps, baseInput);

    expect(result.truncated.by_timeout).toBe(false);
    expect(result.scanned.sources).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it('completes full scan when deadline is never reached, by_timeout=false', async () => {
    // fakeNow always returns 9999; deadline = 9999 + 1 = 10000.
    // Since 9999 < 10000 the deadline is never passed → full scan with by_timeout=false.
    const fakeNow = () => 9999;

    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_P1', adtType: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_P2', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: {
        async readProgram() {
          return 'marker';
        },
        async readInclude() {
          return null;
        },
        async readClassMain() {
          return null;
        },
        async fetchFugrStructure() {
          return [];
        },
        async readFugrFm() {
          return null;
        },
      },
      resolvePackages: identityResolver,
      now: fakeNow,
    };

    const result = await runSearchSource(deps, {
      ...baseInput,
      concurrency: 1,
      time_budget_ms: 1, // deadline = 9999 + 1 = 10000; fakeNow always returns 9999 so never passed
    });
    // Deadline is never reached → full scan
    expect(result.truncated.by_timeout).toBe(false);
    expect(result.scanned.sources).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it('stops inside the for-await loop when deadline passes after pump starts processing a target', async () => {
    // callCount=1: deadline computation → 1000, deadline=1500
    // callCount=2: pump shouldStop check → 1000 (not passed yet) → enters worker for Z_P1
    // callCount=3+: deadlinePassed inside for-await → 2000 >= 1500 → break + timedOut
    let callCount = 0;
    const fakeNow = () => {
      callCount++;
      if (callCount === 1) return 1000; // deadline = 1000 + 500 = 1500
      if (callCount === 2) return 1000; // pump check: not yet past
      return 2000; // all subsequent calls: past deadline
    };

    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_P1', adtType: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_P2', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_P1': 'marker here\nmarker again',
        'PROG:Z_P2': 'marker here',
      }),
      resolvePackages: identityResolver,
      now: fakeNow,
    };

    const result = await runSearchSource(deps, {
      ...baseInput,
      concurrency: 1,
      time_budget_ms: 500,
    });

    expect(result.truncated.by_timeout).toBe(true);
    // The for-await deadline check fires on the first unit of Z_P1 → 0 sources counted
    expect(result.scanned.sources).toBe(0);
    expect(result.results).toHaveLength(0);
  });
});

describe('runSearchSource — default max_hits_per_object=100 (Fix B)', () => {
  it('returns all hits when count is below default 100 cap, and by_object_cap stays false', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_PROG', adtType: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_PROG': 'marker 1\nmarker 2\nmarker 3',
      }),
      resolvePackages: identityResolver,
    };
    // Do NOT pass max_hits_per_object — rely on default (100)
    const result = await runSearchSource(deps, {
      query: 'marker',
      packages: ['ZPKG'],
      object_types: ['PROG'],
    });
    expect(result.results).toHaveLength(3);
    expect(result.truncated.by_object_cap).toBe(false);
  });
});
