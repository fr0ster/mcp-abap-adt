/**
 * `SearchSource`'s source reads in ADT batch envelopes (#89). With no bound
 * given, every target is one chunk and each round's reads one envelope. With
 * the consumer's `readsPerEnvelope` (300 below): every target, in chunks of
 * 300, each chunk read through all its rounds (main sources and function
 * group structures, then the function groups' includes and function
 * modules), each round's unique reads in envelopes of at most 300; the call
 * ends on its result, every target read in one run.
 *
 * On the batch stand-in (`helpers/searchSourceStand.ts`): real handler, real
 * clients, real `AdtBatchConnection`; only the connection is a fake.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { handleSearchSource } from '../../../handlers/system/readonly/handleSearchSource';
import { substringLineMatch } from '../../../lib/search-source/lineScanner';
import {
  contextOn,
  type Fake,
  hitNames,
  keyOf,
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
import { withinTurns } from '../../helpers/withinTurns';

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

/** `ZGS`: `count` function groups, ZG0 …, each with `includes` includes. */
function groups(count: number, includes: number): Repository {
  const names = Array.from({ length: count }, (_, i) => `ZG${i}`);
  const includesOf = (group: string) =>
    Array.from({ length: includes }, (_, i) => `L${group}${pad(i)}`);
  return {
    nodes: {
      [nodeKey('ZGS')]: { types: [{ type: 'FUGR/F', nodeId: '000030' }] },
      [nodeKey('ZGS', '30')]: {
        objects: names.map((name) => ({ type: 'FUGR/F', name })),
      },
    },
    sources: Object.fromEntries(
      names.flatMap((group) =>
        includesOf(group).map((name) => [
          `FINCLUDE ${group}/${name}`,
          `* ${name}\nDATA marker.`,
        ]),
      ),
    ),
    fugrChildren: Object.fromEntries(
      names.map((group) => [
        group,
        includesOf(group).map((name): [string, string] => ['FUGR/I', name]),
      ]),
    ),
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

/** The consumer's bound the tests below set, unless they say none. */
const BOUND = 300;

/** The search with the consumer's bound of `BOUND`. */
const search = (
  fake: Fake,
  packages: string[],
  args: Record<string, unknown> = {},
  absent = false,
) =>
  searchOn(fake, { query: 'marker', packages, ...args }, absent, TURNS, BOUND);

/** The search with no bound given. */
const unbounded = (fake: Fake, packages: string[]) =>
  searchOn(fake, { query: 'marker', packages }, false, TURNS);

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

describe('SearchSource: source reads in envelopes', () => {
  it('no bound given: 302 one-read targets go in one envelope', async () => {
    const fake = on(programs(302));
    const result = await unbounded(fake, ['ZBIG']);
    assert.deepStrictEqual(sourceSizes(fake, 0), [302]);
    assert.equal(payloadOf(result).results.length, 302);
  });

  it('no bound given: 650 one-read targets go in one envelope', async () => {
    const fake = on(programs(650));
    await unbounded(fake, ['ZBIG']);
    assert.deepStrictEqual(sourceSizes(fake, 0), [650]);
  });

  it('650 one-read targets at 300 go as balanced envelopes of 217 + 217 + 216 reads, in target order', async () => {
    const fake = on(programs(650));
    const result = await search(fake, ['ZBIG']);
    // The walk of one package: the root node, then its type node — one
    // read each, single requests.
    assert.deepStrictEqual(
      fake.directs.map((r) => keyOf(r.url, r.params)),
      [nodeKey('ZBIG'), nodeKey('ZBIG', '20')],
    );
    assert.deepStrictEqual(sourceSizes(fake, 0), [217, 217, 216]);
    assert.deepStrictEqual(
      fake.envelopes.flatMap(partKeys).map((k) => k.slice('PROGRAM '.length)),
      Array.from({ length: 650 }, (_, i) => `ZP${pad(i)}`),
    );
    const p = payloadOf(result);
    assert.equal(p.results.length, 650);
    assert.equal(p.scanned.objects, 650);
    assert.deepStrictEqual(p.truncated, { by_object_cap: false });
  });

  it("the consumer's bound reaches a round's envelopes: 3 groups' 6 includes at 3 go as 3 + 3", async () => {
    const fake = on(groups(3, 2));
    const result = await searchOn(
      fake,
      { query: 'marker', packages: ['ZGS'] },
      false,
      TURNS,
      3,
    );
    // The structures (3 reads), then the includes (6 reads) in two.
    assert.deepStrictEqual(sourceSizes(fake, 0), [3, 3, 3]);
    assert.equal(payloadOf(result).results.length, 6);
  });

  it("bound 2: a 401 on a group's include ends the reads — no later envelope", async () => {
    // Two groups of four includes; ZG0's first include is 401.
    const fake = on(
      groups(2, 4),
      {},
      {
        refuse: { 'FINCLUDE ZG0/LZG0000': 401 },
      },
    );
    await searchOn(
      fake,
      { query: 'marker', packages: ['ZGS'], background: false },
      false,
      TURNS,
      2,
    ).catch(() => undefined);
    const includeEnvelopes = fake.envelopes.filter((e) =>
      partKeys(e).some((k) => k.startsWith('FINCLUDE ')),
    );
    assert.equal(includeEnvelopes.length, 1);
  });

  it('max_hits given, bound 2: a 401 on an include ends the reads — no later envelope', async () => {
    const fake = on(
      groups(1, 4),
      {},
      { refuse: { 'FINCLUDE ZG0/LZG0000': 401 } },
    );
    await searchOn(
      fake,
      // A query no source holds: the hits never decide the stop.
      { query: 'nothing-here', packages: ['ZGS'], max_hits: 1 },
      false,
      TURNS,
      2,
    ).catch(() => undefined);
    const includeEnvelopes = fake.envelopes.filter((e) =>
      partKeys(e).some((k) => k.startsWith('FINCLUDE ')),
    );
    assert.equal(includeEnvelopes.length, 1);
  });

  it("max_hits 1, bound 2: a group's first envelope of includes holds the hit — the second is not sent", async () => {
    const fake = on(groups(1, 4));
    const result = await searchOn(
      fake,
      { query: 'marker', packages: ['ZGS'], max_hits: 1 },
      false,
      TURNS,
      2,
    );
    const includeEnvelopes = fake.envelopes.filter((e) =>
      partKeys(e).some((k) => k.startsWith('FINCLUDE ')),
    );
    assert.equal(includeEnvelopes.length, 1);
    assert.equal(payloadOf(result).results.length, 1);
  });

  it('max_hits with a line match whose hits hold the query: a step without the query is not scanned again', async () => {
    let calls = 0;
    const counting = {
      match: (
        lines: readonly string[],
        input: Parameters<typeof substringLineMatch.match>[1],
      ) => {
        calls += 1;
        return substringLineMatch.match(lines, input);
      },
      hitsHoldQuery: true,
    };
    const fake = on(programs(60));
    await withinTurns(
      handleSearchSource(
        { ...contextOn(fake, 'served'), lineMatchStrategy: counting },
        {
          query: 'nothing-here',
          packages: ['ZBIG'],
          max_hits: 1,
          background: false,
        },
      ),
      TURNS,
    );
    // The final scan's one match per source, and no rescan per target
    // (which would be 60 · 61 / 2 more).
    assert.ok(calls <= 60, `${calls} matches`);
  });

  it('exclude takes more than three substrings', async () => {
    const fake = on(programs(2));
    const result = await searchOn(
      fake,
      {
        query: 'marker',
        packages: ['ZBIG'],
        exclude: ['a1', 'a2', 'a3', 'MARKER'],
      },
      false,
      TURNS,
    );
    // Four entries are taken; the fourth drops every line.
    assert.equal(payloadOf(result).results.length, 0);
  });

  it("no bound given: 3 groups' 6 includes go in one envelope", async () => {
    const fake = on(groups(3, 2));
    await unbounded(fake, ['ZGS']);
    assert.deepStrictEqual(sourceSizes(fake, 0), [3, 6]);
  });

  it('a single target — one function group, 400 includes — is read as single requests, no envelope; nothing dropped', async () => {
    const fake = on(bigGroup());
    const result = await search(fake, ['ZFGP'], { max_hits_per_object: 1000 });
    assert.equal(fake.envelopes.length, 0);
    const keys = fake.directs.map((r) => keyOf(r.url, r.params));
    assert.ok(keys.includes('STRUCTURE ZFG_BIG'));
    assert.equal(keys.filter((k) => k.startsWith('FINCLUDE ')).length, 400);
    assert.equal(payloadOf(result).results.length, 400);
  });

  it('a round of one read among several targets is a single request', async () => {
    // ZB's chunk: ZFG_B and two programs; its second round is ZFG_B's one
    // include.
    const fake = on(twoChunks());
    await search(fake, ['ZA', 'ZB']);
    assert.ok(
      fake.directs
        .map((r) => keyOf(r.url, r.params))
        .includes('FINCLUDE ZFG_B/LZFG_BTOP'),
    );
    assert.equal(
      fake.envelopes.flatMap(partKeys).includes('FINCLUDE ZFG_B/LZFG_BTOP'),
      false,
    );
  });

  it('the hits over envelopes are the hits of the same targets read one by one', async () => {
    const batched = await search(on(programs(650)), ['ZBIG']);
    const sequential = await search(on(programs(650)), ['ZBIG'], {}, true);
    assert.equal(textOf(batched), textOf(sequential));
    const all = { max_hits_per_object: 1000 };
    const group = await search(on(bigGroup()), ['ZFGP'], all);
    const groupSequential = await search(on(bigGroup()), ['ZFGP'], all, true);
    assert.equal(payloadOf(group).results.length, 400);
    assert.equal(textOf(group), textOf(groupSequential));
  });
});
