/**
 * `SearchSource`'s source reads in envelopes of at most 300 reads (#89): the
 * slice's targets in chunks of 300, each chunk read through all its rounds
 * (main sources and function group structures, then the function groups'
 * includes and function modules), each round's unique reads in envelopes of
 * at most 300. `time_budget_ms` is checked before every envelope; a chunk the
 * deadline cut answers none of its targets, so the answer holds whole targets
 * and `next_start_at` names the first target not answered.
 *
 * On the batch stand-in (`helpers/searchSourceStand.ts`): real handler, real
 * clients, real `AdtBatchConnection`; only the connection is a fake.
 */
import {
  type OrchestratorDeps,
  READS_PER_ENVELOPE,
  runSearchSource,
} from '../../../lib/search-source/orchestrator';
import type { PackageContentItem } from '../../../lib/search-source/packageEnumerator';
import {
  type Fake,
  hitNames,
  type Model,
  nodeKey,
  partKeys,
  payloadOf,
  type Repository,
  type SystemOptions,
  searchOn,
  standOn,
  textOf,
} from '../../helpers/searchSourceStand';

const TURNS = 20_000;

const pad = (n: number) => String(n).padStart(3, '0');

/** `ZBIG`: 650 programs, ZP000 … ZP649, each holding the marker. */
function programs(count: number): Repository {
  const names = Array.from({ length: count }, (_, i) => `ZP${pad(i)}`);
  return {
    nodes: {
      [nodeKey('ZBIG')]: { types: [{ type: 'PROG/P', nodeId: '000020' }] },
      [nodeKey('ZBIG', '20')]: {
        objects: names.map((name) => ({ type: 'PROG/P', name })),
      },
    },
    sources: Object.fromEntries(
      names.map((name) => [
        `PROGRAM ${name}`,
        `REPORT ${name}.\nWRITE 1. " marker`,
      ]),
    ),
    fugrChildren: {},
    masks: {},
  };
}

/** `ZFGP`: one function group, `ZFG_BIG`, with 400 includes. */
function bigGroup(): Repository {
  const includes = Array.from({ length: 400 }, (_, i) => `LZFG_BIG${pad(i)}`);
  return {
    nodes: {
      [nodeKey('ZFGP')]: { types: [{ type: 'FUGR/F', nodeId: '000030' }] },
      [nodeKey('ZFGP', '30')]: {
        objects: [{ type: 'FUGR/F', name: 'ZFG_BIG' }],
      },
    },
    sources: Object.fromEntries(
      includes.map((name) => [`INCLUDE ${name}`, `* ${name}\nDATA marker.`]),
    ),
    fugrChildren: { ZFG_BIG: includes.map((name) => ['FUGR/I', name]) },
    masks: {},
  };
}

/**
 * `ZA`: 300 programs (the first chunk); `ZB`: a function group and two
 * programs (the second chunk, targets 300 … 302).
 */
function twoChunks(): Repository {
  const first = programs(300);
  return {
    nodes: {
      [nodeKey('ZA')]: { types: [{ type: 'PROG/P', nodeId: '000020' }] },
      [nodeKey('ZA', '20')]: first.nodes[nodeKey('ZBIG', '20')] ?? {},
      [nodeKey('ZB')]: {
        types: [
          { type: 'FUGR/F', nodeId: '000030' },
          { type: 'PROG/P', nodeId: '000020' },
        ],
      },
      [nodeKey('ZB', '30')]: { objects: [{ type: 'FUGR/F', name: 'ZFG_B' }] },
      [nodeKey('ZB', '20')]: {
        objects: [
          { type: 'PROG/P', name: 'ZB_P1' },
          { type: 'PROG/P', name: 'ZB_P2' },
        ],
      },
    },
    sources: {
      ...first.sources,
      'PROGRAM ZB_P1': 'REPORT zb_p1. " marker',
      'PROGRAM ZB_P2': 'REPORT zb_p2. " marker',
      'INCLUDE LZFG_BTOP': 'DATA marker.',
    },
    fugrChildren: { ZFG_B: [['FUGR/I', 'LZFG_BTOP']] },
    masks: {},
  };
}

const on = (repo: Repository, options: SystemOptions = {}, model: Model = {}) =>
  standOn(repo, model, options);

const search = (
  fake: Fake,
  packages: string[],
  args: Record<string, unknown> = {},
  absent = false,
) =>
  searchOn(
    fake,
    { query: 'marker', max_objects: 1000, packages, ...args },
    absent,
    TURNS,
  );

/** The envelopes after the walk's `walkEnvelopes`: their sizes. */
const sourceSizes = (fake: Fake, walkEnvelopes: number) =>
  fake.envelopes.slice(walkEnvelopes).map((e) => e.parts.length);

const answeredNames = (result: unknown) => [
  ...new Set<string>(
    payloadOf(result).results.map(
      (h: { object_name: string }) => h.object_name,
    ),
  ),
];

describe('SearchSource: source reads in envelopes of at most 300', () => {
  it('the envelope bound is 300', () => {
    expect(READS_PER_ENVELOPE).toBe(300);
  });

  it('650 one-read targets go as 300 + 300 + 50 reads, in target order', async () => {
    const fake = on(programs(650));
    const result = await search(fake, ['ZBIG']);
    // The walk: the root node, then its type node.
    expect(fake.envelopes.slice(0, 2).map(partKeys)).toEqual([
      [nodeKey('ZBIG')],
      [nodeKey('ZBIG', '20')],
    ]);
    expect(sourceSizes(fake, 2)).toEqual([300, 300, 50]);
    expect(
      fake.envelopes
        .slice(2)
        .flatMap(partKeys)
        .map((k) => k.slice('PROGRAM '.length)),
    ).toEqual(Array.from({ length: 650 }, (_, i) => `ZP${pad(i)}`));
    const p = payloadOf(result);
    expect(p.results).toHaveLength(650);
    expect(p.total_targets).toBe(650);
    expect('next_start_at' in p).toBe(false);
    expect(p.truncated.by_timeout).toBe(false);
  });

  it("a function group's second round of 400 reads goes as 300 + 100; nothing dropped", async () => {
    const fake = on(bigGroup());
    const result = await search(fake, ['ZFGP'], { max_hits_per_object: 1000 });
    expect(sourceSizes(fake, 2)).toEqual([1, 300, 100]);
    expect(partKeys(fake.envelopes[2])).toEqual(['STRUCTURE ZFG_BIG']);
    expect(new Set(fake.envelopes.slice(3).flatMap(partKeys)).size).toBe(400);
    expect(payloadOf(result).results).toHaveLength(400);
  });

  it('the hits over envelopes are the hits of the same targets read one by one', async () => {
    const batched = await search(on(programs(650)), ['ZBIG'], {
      emit_no_hits: true,
    });
    const sequential = await search(
      on(programs(650)),
      ['ZBIG'],
      { emit_no_hits: true },
      true,
    );
    expect(textOf(batched)).toBe(textOf(sequential));
    const all = { max_hits_per_object: 1000 };
    const group = await search(on(bigGroup()), ['ZFGP'], all);
    const groupSequential = await search(on(bigGroup()), ['ZFGP'], all, true);
    expect(payloadOf(group).results).toHaveLength(400);
    expect(textOf(group)).toBe(textOf(groupSequential));
  });

  describe('time_budget_ms, checked before every envelope', () => {
    let clock = 0;
    let spy: jest.SpyInstance<number, []>;
    beforeEach(() => {
      clock = 1_000_000;
      spy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    });
    afterEach(() => spy.mockRestore());

    /** The clock passes the budget once envelope `n` is answered. */
    const passingAfter = (n: number): SystemOptions => ({
      afterEnvelope: (count) => {
        if (count === n) clock += 10_000;
      },
    });

    it('after the first envelope: the finished chunk is answered, next_start_at at its end', async () => {
      const fake = on(programs(650), passingAfter(3));
      const result = await search(fake, ['ZBIG'], { time_budget_ms: 5_000 });
      expect(sourceSizes(fake, 2)).toEqual([300]);
      const p = payloadOf(result);
      expect(answeredNames(result)).toEqual(
        Array.from({ length: 300 }, (_, i) => `ZP${pad(i)}`),
      );
      expect(p.truncated.by_timeout).toBe(true);
      expect(p.truncated.by_max_objects).toBe(false);
      expect(p.next_start_at).toBe(300);
      expect(p.total_targets).toBe(650);
      expect(p.scanned).toEqual({ packages: 1, objects: 300, sources: 300 });
    });

    it('from start_at 10: next_start_at 310', async () => {
      const fake = on(programs(650), passingAfter(3));
      const result = await search(fake, ['ZBIG'], {
        time_budget_ms: 5_000,
        start_at: 10,
      });
      const p = payloadOf(result);
      expect(answeredNames(result)[0]).toBe('ZP010');
      expect(answeredNames(result)).toHaveLength(300);
      expect(p.next_start_at).toBe(310);
    });

    it('a chunk the deadline cut answers none of its targets, even those read whole', async () => {
      // Chunk 1: ZA's 300 programs, one envelope. Chunk 2: ZB's function
      // group and two programs — its first round is answered (the two
      // programs read whole), the deadline passes before its second round.
      const fake = on(twoChunks(), passingAfter(4));
      const result = await search(fake, ['ZA', 'ZB'], {
        time_budget_ms: 5_000,
      });
      // The walk: [ZA, ZB], their type nodes; then chunk 1, chunk 2's round 1.
      expect(sourceSizes(fake, 2)).toEqual([300, 3]);
      expect(partKeys(fake.envelopes[3])).toEqual([
        'STRUCTURE ZFG_B',
        'PROGRAM ZB_P1',
        'PROGRAM ZB_P2',
      ]);
      const names = answeredNames(result);
      expect(names).toHaveLength(300);
      expect(names).not.toContain('ZB_P1');
      expect(names).not.toContain('ZB_P2');
      const p = payloadOf(result);
      expect(p.next_start_at).toBe(300);
      expect(p.total_targets).toBe(303);
      expect(p.truncated.by_timeout).toBe(true);
      expect(p.scanned.objects).toBe(300);
    });

    it("a deadline between a round's envelopes cuts its chunk: no hit, next_start_at = start_at", async () => {
      const fake = on(bigGroup(), passingAfter(4));
      const result = await search(fake, ['ZFGP'], { time_budget_ms: 5_000 });
      // The structure, then the first 300 includes; the last 100 never sent.
      expect(sourceSizes(fake, 2)).toEqual([1, 300]);
      const p = payloadOf(result);
      expect(p.results).toEqual([]);
      expect(p.next_start_at).toBe(0);
      expect(p.truncated.by_timeout).toBe(true);
    });

    it('a deadline passed before the first envelope: no hits, next_start_at = start_at', async () => {
      const fake = on(programs(650), passingAfter(2));
      const result = await search(fake, ['ZBIG'], {
        time_budget_ms: 5_000,
        start_at: 7,
        emit_no_hits: true,
      });
      expect(fake.envelopes).toHaveLength(2);
      const p = payloadOf(result);
      expect(p.results).toEqual([]);
      expect(p.no_hits).toEqual([]);
      expect(p.next_start_at).toBe(7);
      expect(p.total_targets).toBe(650);
      expect(p.truncated).toEqual({
        by_object_cap: false,
        by_max_objects: false,
        by_timeout: true,
      });
      expect(p.scanned).toEqual({ packages: 1, objects: 0, sources: 0 });
    });

    it('a budget that holds: every envelope is sent, by_timeout false, no cursor', async () => {
      const fake = on(programs(650));
      const result = await search(fake, ['ZBIG'], { time_budget_ms: 5_000 });
      expect(sourceSizes(fake, 2)).toEqual([300, 300, 50]);
      expect(payloadOf(result).truncated.by_timeout).toBe(false);
      expect('next_start_at' in payloadOf(result)).toBe(false);
    });

    it('a deadline during the package walk: next_start_at = start_at, total_targets unknown (absent)', async () => {
      const fake = on(programs(650), passingAfter(1));
      const result = await search(fake, ['ZBIG'], {
        time_budget_ms: 5_000,
        start_at: 40,
      });
      expect(fake.envelopes).toHaveLength(1);
      const p = payloadOf(result);
      expect(p.results).toEqual([]);
      expect(p.next_start_at).toBe(40);
      expect('total_targets' in p).toBe(false);
      expect(p.truncated.by_timeout).toBe(true);
      expect(p.scanned).toEqual({ packages: 1, objects: 0, sources: 0 });
    });
  });
});

describe('SearchSource sequential version: a deadline answers whole targets', () => {
  const items: PackageContentItem[] = Array.from({ length: 6 }, (_, i) => ({
    name: `Z_P${i}`,
    type: 'PROG/P',
    packageName: 'ZPKG',
    isPackage: false,
  }));

  it('answers the targets finished before the first one not finished; next_start_at there', async () => {
    let clock = 1000;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps: OrchestratorDeps = {
      fetchPackageContents: async () => items,
      sourceReader: {
        async readProgram(name) {
          // Z_P1 waits; the others finish around it. The last one moves the
          // clock past the deadline and lets Z_P1 answer — after it.
          if (name === 'Z_P1') await gate;
          if (name === 'Z_P5') {
            clock = 9000;
            release();
          }
          return `marker in ${name}`;
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
      resolvePackages: async (entries) => entries,
      now: () => clock,
    };
    const r = await runSearchSource(deps, {
      query: 'marker',
      packages: ['ZPKG'],
      object_types: ['PROG'],
      concurrency: 3,
      time_budget_ms: 500,
      start_at: 0,
      emit_no_hits: true,
    });
    // Z_P0 finished; Z_P1 was cut; Z_P2 … Z_P5 finished after it but are
    // not answered, so the next call from next_start_at reads them once.
    expect(r.results.map((h) => h.object_name)).toEqual(['Z_P0']);
    expect(r.no_hits).toEqual([]);
    expect(r.next_start_at).toBe(1);
    expect(r.total_targets).toBe(6);
    expect(r.truncated.by_timeout).toBe(true);
    expect(r.scanned).toEqual({ packages: 1, objects: 1, sources: 1 });
  });

  it('a deadline that never passes answers every target, no cursor', async () => {
    const deps: OrchestratorDeps = {
      fetchPackageContents: async () => items,
      sourceReader: {
        readProgram: async (name) => `marker in ${name}`,
        readInclude: async () => null,
        readClassMain: async () => null,
        fetchFugrStructure: async () => [],
        readFugrFm: async () => null,
      },
      resolvePackages: async (entries) => entries,
      now: () => 1000,
    };
    const r = await runSearchSource(deps, {
      query: 'marker',
      packages: ['ZPKG'],
      object_types: ['PROG'],
      concurrency: 3,
      time_budget_ms: 500,
    });
    expect(r.results).toHaveLength(6);
    expect(r.next_start_at).toBeUndefined();
    expect(r.truncated.by_timeout).toBe(false);
  });
});
