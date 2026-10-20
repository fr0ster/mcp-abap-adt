import * as z from 'zod';
import { TOOL_DEFINITION } from '../../../handlers/system/readonly/handleSearchSource';
import {
  type OrchestratorDeps,
  type OrchestratorInput,
  type OrchestratorResult,
  runSearchSource,
} from '../../../lib/search-source/orchestrator';
import type { PackageContentItem } from '../../../lib/search-source/packageEnumerator';

// Five targets, handed over in a scrambled order.
const ITEMS: PackageContentItem[] = [
  { name: 'ZPROG_B', type: 'PROG/P', packageName: 'ZROOT', isPackage: false },
  { name: 'ZCL_A', type: 'CLAS/OC', packageName: 'ZSUB', isPackage: false },
  { name: 'ZPROG_O', type: 'PROG/P', packageName: 'ZOTHER', isPackage: false },
  { name: 'ZPROG_A', type: 'PROG/P', packageName: 'ZROOT', isPackage: false },
  { name: 'ZFG_A', type: 'FUGR/F', packageName: 'ZROOT', isPackage: false },
];
// (package, type, name): ZOTHER/PROG/ZPROG_O, ZROOT/FUGR/ZFG_A,
// ZROOT/PROG/ZPROG_A, ZROOT/PROG/ZPROG_B, ZSUB/CLAS/ZCL_A.
const ORDER = ['ZPROG_O', 'ZFG_A', 'ZPROG_A', 'ZPROG_B', 'ZCL_A'];

const deps = (items: PackageContentItem[] = ITEMS): OrchestratorDeps => ({
  fetchPackageContents: async () => items,
  sourceReader: {
    async readProgram(name) {
      return `marker in ${name}`;
    },
    async readInclude() {
      return null;
    },
    async readClassMain(name) {
      return `marker in ${name}`;
    },
    async fetchFugrStructure() {
      return [];
    },
    async readFugrFm() {
      return null;
    },
  },
  resolvePackages: async (entries) => entries,
});

const input: OrchestratorInput = {
  query: 'marker',
  packages: ['ZROOT'],
  object_types: ['PROG', 'CLAS', 'FUGR'],
  emit_no_hits: true,
};

const scannedNames = (r: Awaited<ReturnType<typeof runSearchSource>>) =>
  [...r.results, ...(r.no_hits ?? [])].map((h) => h.object_name).sort();

describe('SearchSource cursor, sequential version', () => {
  it('orders the targets by (package, type, name), whatever order the structures answer in', async () => {
    const r = await runSearchSource(deps(), { ...input, concurrency: 1 });
    // One call over all five: the hits come back in the walk's order.
    expect(r.results.map((h) => h.object_name)).toEqual(
      ORDER.filter((n) => n !== 'ZFG_A'),
    );
    expect(r.no_hits?.map((h) => h.object_name)).toEqual(['ZFG_A']);
    const first = await runSearchSource(deps(), {
      ...input,
      max_objects: 2,
      concurrency: 1,
    });
    expect(scannedNames(first)).toEqual(['ZFG_A', 'ZPROG_O']);
  });

  it('start_at 0, max_objects 2 over 5 targets answers next_start_at 2', async () => {
    const r = await runSearchSource(deps(), { ...input, max_objects: 2 });
    expect(r.scanned.objects).toBe(2);
    expect(r.next_start_at).toBe(2);
    expect(r.total_targets).toBe(5);
    expect(r.truncated.by_max_objects).toBe(true);
  });

  it('start_at 4 scans the last target and answers no next_start_at', async () => {
    const r = await runSearchSource(deps(), {
      ...input,
      start_at: 4,
      max_objects: 2,
    });
    expect(scannedNames(r)).toEqual(['ZCL_A']);
    expect(r.next_start_at).toBeUndefined();
    expect('next_start_at' in r).toBe(false);
    expect(r.truncated.by_max_objects).toBe(false);
    expect(r.total_targets).toBe(5);
  });

  it.each([5, 9])('start_at %i answers no hits and no cursor', async (at) => {
    const r = await runSearchSource(deps(), {
      ...input,
      start_at: at,
      max_objects: 2,
    });
    expect(r.results).toEqual([]);
    expect(r.no_hits).toEqual([]);
    expect('next_start_at' in r).toBe(false);
    expect(r.total_targets).toBe(5);
    expect(r.scanned.objects).toBe(0);
    expect(r.truncated.by_max_objects).toBe(false);
  });

  it('three calls (0, 2, 4) hold the hits of one call over all five', async () => {
    const whole = await runSearchSource(deps(), { ...input, max_objects: 5 });
    const parts: OrchestratorResult[] = [];
    for (const at of [0, 2, 4]) {
      parts.push(
        await runSearchSource(deps(), {
          ...input,
          start_at: at,
          max_objects: 2,
        }),
      );
    }
    expect(parts.map((p) => p.next_start_at)).toEqual([2, 4, undefined]);
    const key = (h: { devclass: string; object_name: string; line: number }) =>
      `${h.devclass}/${h.object_name}:${h.line}`;
    expect(parts.flatMap((p) => p.results.map(key)).sort()).toEqual(
      whole.results.map(key).sort(),
    );
    expect(parts.flatMap((p) => scannedNames(p)).sort()).toEqual(
      scannedNames(whole),
    );
    expect(whole.next_start_at).toBeUndefined();
  });

  it('the schema refuses a negative or fractional start_at', () => {
    const schema = z.object(TOOL_DEFINITION.inputSchema);
    const ok = { query: 'x', packages: ['Z'] };
    expect(schema.safeParse({ ...ok, start_at: 0 }).success).toBe(true);
    expect(schema.safeParse({ ...ok, start_at: 7 }).success).toBe(true);
    expect(schema.safeParse({ ...ok, start_at: -1 }).success).toBe(false);
    expect(schema.safeParse({ ...ok, start_at: 1.5 }).success).toBe(false);
  });
});
