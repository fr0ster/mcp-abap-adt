/**
 * `SearchSource`'s source reads in envelopes of at most 300 reads (#89):
 * every target, in chunks of 300, each chunk read through all its rounds
 * (main sources and function group structures, then the function groups'
 * includes and function modules), each round's unique reads in envelopes of
 * at most 300; the call ends on its result, every target read in one run.
 *
 * On the batch stand-in (`helpers/searchSourceStand.ts`): real handler, real
 * clients, real `AdtBatchConnection`; only the connection is a fake.
 */
import { READS_PER_ENVELOPE } from '../../../lib/search-source/orchestrator';
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

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
process.env.SAP_SYSTEM_TYPE = 'onprem';

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
      includes.map((name) => [
        `FINCLUDE ZFG_BIG/${name}`,
        `* ${name}\nDATA marker.`,
      ]),
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
      'FINCLUDE ZFG_B/LZFG_BTOP': 'DATA marker.',
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
) => searchOn(fake, { query: 'marker', packages, ...args }, absent, TURNS);

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
    expect(p.scanned.objects).toBe(650);
    expect(p.truncated).toEqual({ by_object_cap: false });
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
    const batched = await search(on(programs(650)), ['ZBIG']);
    const sequential = await search(on(programs(650)), ['ZBIG'], {}, true);
    expect(textOf(batched)).toBe(textOf(sequential));
    const all = { max_hits_per_object: 1000 };
    const group = await search(on(bigGroup()), ['ZFGP'], all);
    const groupSequential = await search(on(bigGroup()), ['ZFGP'], all, true);
    expect(payloadOf(group).results).toHaveLength(400);
    expect(textOf(group)).toBe(textOf(groupSequential));
  });
});
