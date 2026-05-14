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
    };
    const result = await runSearchSource(deps, baseInput);
    expect(
      result.results.map((r) => `${r.devclass}/${r.object_name}:${r.line}`),
    ).toEqual(['ZA/ZA_CLAS:3', 'ZA/ZA_PROG:1', 'ZB/ZB_PROG:2']);
    expect(result.scanned).toEqual({ packages: 1, objects: 3, sources: 3 });
    expect(result.truncated).toEqual({
      by_object_cap: false,
      by_max_objects: false,
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
