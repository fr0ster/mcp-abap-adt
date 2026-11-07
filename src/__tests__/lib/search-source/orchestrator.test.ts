import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import {
  type OrchestratorDeps,
  type OrchestratorInput,
  runSearchSource,
} from '../../../lib/search-source/orchestrator';
import type {
  PackageContentItem,
  PackageContentsFetcher,
} from '../../../lib/search-source/packageEnumerator';
import {
  exactPackages,
  listing,
  sourcesFrom as sourceFor,
} from '../../helpers/sourceReaderFake';

function pkg(
  items: Array<Partial<PackageContentItem>>,
): PackageContentsFetcher {
  return async (name) =>
    listing(
      name,
      items.map((it) => ({
        name: it.name ?? '',
        type: it.type ?? 'PROG/P',
        packageName: it.packageName ?? 'ZPKG',
        isPackage: it.isPackage ?? false,
      })),
    );
}

const identityResolver = exactPackages;

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
        { name: 'ZB_PROG', type: 'PROG/P', packageName: 'ZB' },
        { name: 'ZA_CLAS', type: 'CLAS/OC', packageName: 'ZA' },
        { name: 'ZA_PROG', type: 'PROG/P', packageName: 'ZA' },
      ]),
      sourceReader: sourceFor({
        'PROG:ZB_PROG': 'no\nmarker here\nmore',
        'PROG:ZA_PROG': 'marker top',
        'CLAS:ZA_CLAS': 'a\nb\nmarker mid',
      }),
      lineMatch: substringLineMatch,
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, baseInput);
    expect(
      result.results.map(
        (r) => `${r.devclass}/${r.object_name}:${'line' in r ? r.line : ''}`,
      ),
    ).toEqual(['ZA/ZA_CLAS:3', 'ZA/ZA_PROG:1', 'ZB/ZB_PROG:2']);
    expect(result.scanned).toEqual({
      packages: 1,
      objects: 3,
      sources: 3,
      objects_with_hits: 3,
    });
    expect(result.truncated).toEqual({ by_object_cap: false });
  });

  it('caps hits per object and flips truncated.by_object_cap', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_PROG', type: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_PROG': 'marker 1\nmarker 2\nmarker 3\nmarker 4\nmarker 5',
      }),
      lineMatch: substringLineMatch,
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      max_hits_per_object: 2,
    });
    expect(result.results).toHaveLength(2);
    expect(result.truncated.by_object_cap).toBe(true);
  });

  it('does not flip truncated.by_object_cap when an object has exactly max_hits_per_object matches', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'Z_PROG', type: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_PROG': 'marker 1\nno match\nstill no match',
      }),
      lineMatch: substringLineMatch,
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
    // Two includes of one function group: one object, one allowance.
    const deps: OrchestratorDeps = {
      lineMatch: substringLineMatch,
      fetchPackageContents: pkg([
        { name: 'Z_FG', type: 'FUGR/F', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'FUGRSTR:Z_FG': 'FUGR/I|LZ_A\nFUGR/I|LZ_B',
        'INC:LZ_A': 'marker 1',
        'INC:LZ_B': 'marker 2',
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

  it('two function modules of one group each have their own allowance (DO18)', async () => {
    const deps: OrchestratorDeps = {
      lineMatch: substringLineMatch,
      fetchPackageContents: pkg([
        { name: 'Z_FG', type: 'FUGR/F', packageName: 'ZPKG' },
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
    expect(result.results.map((h) => h.object_name)).toEqual([
      'Z_FM_A',
      'Z_FM_B',
    ]);
    expect(result.truncated.by_object_cap).toBe(false);
  });

  it('orders the hits by the walk, whatever order the package answers in', async () => {
    const deps: OrchestratorDeps = {
      lineMatch: substringLineMatch,
      fetchPackageContents: pkg([
        { name: 'ZPROG_B', type: 'PROG/P', packageName: 'ZROOT' },
        { name: 'ZCL_A', type: 'CLAS/OC', packageName: 'ZSUB' },
        { name: 'ZPROG_O', type: 'PROG/P', packageName: 'ZOTHER' },
        { name: 'ZPROG_A', type: 'PROG/P', packageName: 'ZROOT' },
      ]),
      sourceReader: sourceFor({
        'PROG:ZPROG_B': 'marker',
        'CLAS:ZCL_A': 'marker',
        'PROG:ZPROG_O': 'marker',
        'PROG:ZPROG_A': 'marker',
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      concurrency: 1,
    });
    expect(result.results.map((h) => h.object_name)).toEqual([
      'ZPROG_O',
      'ZPROG_A',
      'ZPROG_B',
      'ZCL_A',
    ]);
  });

  it('an object without a hit is not in the answer, and counts as read', async () => {
    const deps: OrchestratorDeps = {
      lineMatch: substringLineMatch,
      fetchPackageContents: pkg([
        { name: 'Z_HIT', type: 'PROG/P', packageName: 'ZPKG' },
        { name: 'Z_MISS', type: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_HIT': 'marker line',
        'PROG:Z_MISS': 'nothing here',
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, baseInput);
    expect(result.results.map((r) => r.object_name)).toEqual(['Z_HIT']);
    expect(Object.keys(result)).not.toContain('no_hits');
    expect(result.scanned).toEqual({
      packages: 1,
      objects: 2,
      sources: 2,
      objects_with_hits: 1,
    });
  });
});

describe('runSearchSource — scanned.packages reflects resolved count', () => {
  it('counts resolved packages, not raw input, when patterns expand', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: pkg([
        { name: 'ZA_PROG', type: 'PROG/P', packageName: 'ZA' },
        { name: 'ZB_PROG', type: 'PROG/P', packageName: 'ZB' },
      ]),
      sourceReader: sourceFor({
        'PROG:ZA_PROG': 'marker',
        'PROG:ZB_PROG': 'marker',
      }),
      lineMatch: substringLineMatch,
      resolvePackages: async () => ({ packages: ['ZA', 'ZB'] }),
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
      lineMatch: substringLineMatch,
      resolvePackages: async () => ({ packages: [] }),
    };
    const result = await runSearchSource(deps, {
      ...baseInput,
      packages: ['ZZZ_NONEXISTENT*'],
    });
    expect(result.results).toEqual([]);
    expect(result.scanned).toEqual({
      packages: 0,
      objects: 0,
      sources: 0,
      objects_with_hits: 0,
    });
    expect(result.truncated).toEqual({ by_object_cap: false });
  });

  it('collapses case-duplicate exact entries before enumeration', async () => {
    let fetchedFor: string | undefined;
    const deps: OrchestratorDeps = {
      fetchPackageContents: async (name) => {
        fetchedFor = name;
        return listing(name, []);
      },
      sourceReader: sourceFor({}),
      lineMatch: substringLineMatch,
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
        return { packages: out };
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

describe('runSearchSource — max_hits_per_object absent: no limit (DO20)', () => {
  it('answers every hit of an object, and by_object_cap stays false', async () => {
    const deps: OrchestratorDeps = {
      lineMatch: substringLineMatch,
      fetchPackageContents: pkg([
        { name: 'Z_PROG', type: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({
        'PROG:Z_PROG': Array.from({ length: 120 }, () => 'marker').join('\n'),
      }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      query: 'marker',
      packages: ['ZPKG'],
      object_types: ['PROG'],
    });
    expect(result.results).toHaveLength(120);
    expect(result.truncated.by_object_cap).toBe(false);
  });
});

describe('runSearchSource — an object of any number of hits', () => {
  it('answers 300 000 hits of one object', async () => {
    const hits = Array.from({ length: 300_000 }, (_, i) => ({
      line: i + 1,
      snippet: 'marker',
    }));
    const deps: OrchestratorDeps = {
      lineMatch: { match: () => ({ hits, capped: false }) },
      fetchPackageContents: pkg([
        { name: 'Z_PROG', type: 'PROG/P', packageName: 'ZPKG' },
      ]),
      sourceReader: sourceFor({ 'PROG:Z_PROG': 'marker' }),
      resolvePackages: identityResolver,
    };
    const result = await runSearchSource(deps, {
      query: 'marker',
      packages: ['ZPKG'],
      object_types: ['PROG'],
    });
    expect(result.results).toHaveLength(300_000);
  });
});
