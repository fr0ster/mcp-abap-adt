/**
 * `SearchSource`'s package masks (DO12): a mask is resolved by the quick
 * search, its `maxResults` doubled until the answer holds fewer packages than
 * `maxResults`. On the batched path every round of every unresolved mask is a
 * search phase of its own, repeated until every mask is resolved; a search not
 * answered yet never counts as a short answer. The sequential path answers
 * alike.
 *
 * Real handler, real clients, real `AdtBatchConnection`; only the connection
 * is a fake. The quick search answers the first `maxResults` packages, as SAP
 * does (measured: no cap, no "more" marker).
 */
import {
  type Fake,
  isError,
  type NodeDoc,
  nodeKey,
  payloadOf,
  type Repository,
  searchesOf,
  searchOn,
  standOn,
} from '../../helpers/searchSourceStand';

process.env.SAP_SYSTEM_TYPE = 'onprem';

/** `count` package names: `<prefix>000001`, … */
const names = (prefix: string, count: number): string[] =>
  Array.from(
    { length: count },
    (_, i) => `${prefix}${String(i + 1).padStart(6, '0')}`,
  );

/**
 * The repository: the masks' packages; the last package of each mask holds
 * one program with a hit, every other package is empty.
 */
function repositoryOf(masks: Record<string, string[]>): Repository {
  const nodes: Record<string, NodeDoc> = {};
  const sources: Record<string, string> = {};
  for (const packages of Object.values(masks)) {
    for (const name of packages) nodes[nodeKey(name)] = {};
    const last = packages[packages.length - 1];
    if (last === undefined) continue;
    const program = `P${last}`;
    nodes[nodeKey(last)] = { types: [{ type: 'PROG/P', nodeId: '000020' }] };
    nodes[nodeKey(last, '20')] = {
      objects: [{ type: 'PROG/P', name: program }],
    };
    sources[`PROGRAM ${program}`] = "WRITE 'marker'.";
  }
  return { nodes, sources, fugrChildren: {}, masks };
}

const run = (fake: Fake, packages: string[], sequential: boolean) =>
  searchOn(
    fake,
    { query: 'marker', packages, include_subpackages: false },
    sequential,
    100_000,
  );

/** The package roots a fake was asked for, in order. */
const walkedRoots = (fake: Fake, sequential = false): string[] =>
  (sequential
    ? fake.directs.map((r) => {
        const u = new URL(r.url, 'https://system.invalid');
        for (const [k, v] of Object.entries(r.params ?? {})) {
          u.searchParams.set(k, String(v));
        }
        return u;
      })
    : fake.envelopes.flatMap((e) =>
        e.parts.map((p) => new URL(p.url, 'https://system.invalid')),
      )
  )
    .filter(
      (u) =>
        u.pathname.endsWith('/repository/nodestructure') &&
        !u.searchParams.has('node_id'),
    )
    .map((u) => u.searchParams.get('parent_name') ?? '');

describe.each([
  ['batched', false],
  ['sequential', true],
])('SearchSource masks on the %s path', (_path, sequential) => {
  it('a mask whose first answer is full is resolved', async () => {
    const all = names('ZA', 1500);
    const fake = standOn(repositoryOf({ 'ZA*': all }));
    const result = await run(fake, ['ZA*'], sequential);
    expect(isError(result)).toBe(false);
    expect(searchesOf(fake)).toEqual([
      ['ZA*', 1000],
      ['ZA*', 2000],
    ]);
    const answer = payloadOf(result);
    expect(answer.scanned.packages).toBe(1500);
    expect(answer.results.map((h: { devclass: string }) => h.devclass)).toEqual(
      [all[1499]],
    );
    if (!sequential) {
      // Each round is a phase of its own: one envelope per round.
      expect(fake.envelopes[0]?.parts).toHaveLength(1);
      expect(fake.envelopes[1]?.parts).toHaveLength(1);
      expect(new Set(walkedRoots(fake)).size).toBe(1500);
    } else {
      expect(new Set(walkedRoots(fake, true)).size).toBe(1500);
    }
  });

  it('a mask that fills maxResults twice is resolved', async () => {
    const all = names('ZB', 3000);
    const fake = standOn(repositoryOf({ 'ZB*': all }));
    const result = await run(fake, ['ZB*'], sequential);
    expect(searchesOf(fake)).toEqual([
      ['ZB*', 1000],
      ['ZB*', 2000],
      ['ZB*', 4000],
    ]);
    const answer = payloadOf(result);
    expect(answer.scanned.packages).toBe(3000);
    expect(answer.results.map((h: { devclass: string }) => h.devclass)).toEqual(
      [all[2999]],
    );
  });

  it('a search not answered yet is not taken as a short answer: the mask is cut nowhere', async () => {
    const all = names('ZC', 1000);
    const fake = standOn(repositoryOf({ 'ZC*': all }));
    const result = await run(fake, ['ZC*'], sequential);
    // 1000 fills the first round; the second answers the same 1000, short.
    expect(searchesOf(fake)).toEqual([
      ['ZC*', 1000],
      ['ZC*', 2000],
    ]);
    expect(payloadOf(result).scanned.packages).toBe(1000);
  });

  it('masks of different depths resolve together, no search sent twice', async () => {
    const shallow = names('ZD', 5);
    const deep = names('ZE', 2500);
    const fake = standOn(repositoryOf({ 'ZD*': shallow, 'ZE*': deep }));
    const result = await run(fake, ['ZD*', 'ZE*'], sequential);
    const searches = searchesOf(fake);
    expect(searches).toHaveLength(new Set(searches.map(String)).size);
    if (sequential) {
      expect(searches).toEqual([
        ['ZD*', 1000],
        ['ZE*', 1000],
        ['ZE*', 2000],
        ['ZE*', 4000],
      ]);
    } else {
      // Round by round, every unresolved mask's search in one phase.
      expect(fake.envelopes.slice(0, 3).map((e) => e.parts.length)).toEqual([
        2, 1, 1,
      ]);
      expect(searches).toEqual([
        ['ZD*', 1000],
        ['ZE*', 1000],
        ['ZE*', 2000],
        ['ZE*', 4000],
      ]);
    }
    const answer = payloadOf(result);
    expect(answer.scanned.packages).toBe(2505);
    expect(
      answer.results.map((h: { devclass: string }) => h.devclass).sort(),
    ).toEqual([shallow[4], deep[2499]]);
  });

  it('a mask SAP refuses at a later round is skipped with no entry; the other entries are scanned', async () => {
    const fake = standOn(
      repositoryOf({ 'ZF*': names('ZF', 1000), 'ZG*': names('ZG', 1) }),
      { refuse: { 'SEARCH ZF*@2000': 500 } },
    );
    const result = await run(fake, ['ZF*', 'ZG*'], sequential);
    expect(isError(result)).toBe(false);
    expect(searchesOf(fake)).toEqual(
      sequential
        ? [
            ['ZF*', 1000],
            ['ZF*', 2000],
            ['ZG*', 1000],
          ]
        : [
            ['ZF*', 1000],
            ['ZG*', 1000],
            ['ZF*', 2000],
          ],
    );
    const answer = payloadOf(result);
    expect(answer.failures).toBeUndefined();
    expect(answer.scanned.packages).toBe(1);
    expect(walkedRoots(fake, sequential)).toEqual(['ZG000001']);
    expect(answer.results.map((h: { devclass: string }) => h.devclass)).toEqual(
      ['ZG000001'],
    );
  });

  it('a credential failure of a mask search ends the call', async () => {
    const fake = standOn(repositoryOf({ 'ZH*': names('ZH', 3) }), {
      refuse: { 'SEARCH ZH*': 401 },
    });
    const result = await run(fake, ['ZH*'], sequential);
    expect(isError(result)).toBe(true);
    expect(payloadOf(result).status).toBe(401);
    expect(walkedRoots(fake, sequential)).toEqual([]);
  });
});
