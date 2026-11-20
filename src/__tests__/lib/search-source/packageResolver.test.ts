import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import * as clients from '../../../lib/clients';
import {
  createPackagePatternResolver,
  resolvePackagePatterns,
  type SearchObjectsArgs,
} from '../../../lib/search-source/packageResolver';
import { skipSapAnswers } from '../../../lib/search-source/readFailure';
import { rejectionOf } from '../../helpers/assertions';
import { okResponse } from '../../helpers/fakeClient';

mock.method(clients, 'createAdtClient', (_conn: unknown, _logger: unknown) => ({
  getUtils: () => ({
    search: async ({ query }: { query: string }) =>
      okResponse(
        query === 'EMPTY*'
          ? []
          : [
              { name: 'ZFI', type: 'DEVC', description: '' },
              { name: 'ZFI_BUDGET', type: 'DEVC', description: '' },
            ],
      ),
  }),
}));

/**
 * `searchObjects` is gone in adt-clients 19 — `createPackagePatternResolver`
 * now calls `search(criteria, { analyse })` on the bare `client.getUtils()`
 * (no result set injected), which keeps the shipped `utilDocuments.search`
 * reading — already-parsed `ISearchResult[]` hits, `name` included — so
 * this mock answers that shape directly instead of raw `objectReference`
 * XML for the resolver to walk by hand (see `packageResolver.ts`'s own
 * comment on the `getUtils()`-with-no-result-set asymmetry).
 */

function neverCalled(): never {
  throw new Error('searchObjects must not be called for exact entries');
}

describe('resolvePackagePatterns — wildcard detection', () => {
  it('passes exact dev-class names through without calling ADT', async () => {
    const { packages: out } = await resolvePackagePatterns(
      { searchObjects: neverCalled, sapAnswers: skipSapAnswers },
      ['ZFI_OBSOLETE', '$TMP', '/NS/ZFI'],
    );
    assert.deepStrictEqual(out, ['ZFI_OBSOLETE', '$TMP', '/NS/ZFI']);
  });

  it('treats entries containing * as patterns', async () => {
    const calls: string[] = [];
    const { packages: out } = await resolvePackagePatterns(
      {
        sapAnswers: skipSapAnswers,
        searchObjects: async ({ query }) => {
          calls.push(query);
          return [];
        },
      },
      ['Z*'],
    );
    assert.deepStrictEqual(calls, ['Z*']);
    assert.deepStrictEqual(out, []);
  });

  it('an entry with ? is a mask', async () => {
    const calls: string[] = [];
    await resolvePackagePatterns(
      {
        sapAnswers: skipSapAnswers,
        searchObjects: async ({ query }) => {
          calls.push(query);
          return [];
        },
      },
      ['Z?TEST'],
    );
    assert.deepStrictEqual(calls, ['Z?TEST']);
  });

  it('an entry with * is a mask', async () => {
    const calls: string[] = [];
    await resolvePackagePatterns(
      {
        sapAnswers: skipSapAnswers,
        searchObjects: async ({ query }) => {
          calls.push(query);
          return [];
        },
      },
      ['Z*', '/NS/Z*', 'Z*A*B*'],
    );
    assert.deepStrictEqual(calls, ['Z*', '/NS/Z*', 'Z*A*B*']);
  });

  it('+, _, % and # are literal', async () => {
    const { packages } = await resolvePackagePatterns(
      { searchObjects: neverCalled, sapAnswers: skipSapAnswers },
      ['Z_PKG', 'Z+PKG', 'Z%PKG', 'Z#PKG'],
    );
    assert.deepStrictEqual(packages, ['Z_PKG', 'Z+PKG', 'Z%PKG', 'Z#PKG']);
  });

  it('an entry with neither * nor ? is an exact name', async () => {
    const { packages } = await resolvePackagePatterns(
      { searchObjects: neverCalled, sapAnswers: skipSapAnswers },
      ['ZEXACT', '/NS/ZEXACT'],
    );
    assert.deepStrictEqual(packages, ['ZEXACT', '/NS/ZEXACT']);
  });
});

describe('createPackagePatternResolver — hits from `search`', () => {
  const fakeCtx = { connection: {} as any, logger: undefined } as any;

  it('extracts names from the search hits', async () => {
    const fn = createPackagePatternResolver(fakeCtx);
    const names = await fn({
      query: 'ZFI*',
      objectType: 'DEVC',
      maxResults: 1000,
    });
    assert.deepStrictEqual(names, ['ZFI', 'ZFI_BUDGET']);
  });

  it('returns empty array when search answers no hits', async () => {
    const fn = createPackagePatternResolver(fakeCtx);
    const names = await fn({
      query: 'EMPTY*',
      objectType: 'DEVC',
      maxResults: 1000,
    });
    assert.deepStrictEqual(names, []);
  });
});

describe('resolvePackagePatterns — merge semantics', () => {
  it('places exact entries before pattern-resolved names', async () => {
    const { packages: out } = await resolvePackagePatterns(
      {
        sapAnswers: skipSapAnswers,
        searchObjects: async () => ['Z_FROM_PATTERN_A', 'Z_FROM_PATTERN_B'],
      },
      ['Z_EXACT_1', 'Z*', 'Z_EXACT_2'],
    );
    assert.deepStrictEqual(out, [
      'Z_EXACT_1',
      'Z_EXACT_2',
      'Z_FROM_PATTERN_A',
      'Z_FROM_PATTERN_B',
    ]);
  });

  it('deduplicates by uppercase, first occurrence wins for ordering', async () => {
    const { packages: out } = await resolvePackagePatterns(
      {
        sapAnswers: skipSapAnswers,
        searchObjects: async () => ['ZFI', 'ZFI_BUDGET'],
      },
      ['zfi', 'ZFI_*'],
    );
    assert.deepStrictEqual(out, ['zfi', 'ZFI_BUDGET']);
  });

  it('returns empty array when patterns resolve to no packages and no exact entries', async () => {
    const { packages: out } = await resolvePackagePatterns(
      { searchObjects: async () => [], sapAnswers: skipSapAnswers },
      ['ZZZ_NONEXISTENT*'],
    );
    assert.deepStrictEqual(out, []);
  });
});

/** `count` package names of a mask: `<prefix>0001`, … */
const namesOf = (prefix: string, count: number): string[] =>
  Array.from(
    { length: count },
    (_, i) => `${prefix}${String(i + 1).padStart(6, '0')}`,
  );

/**
 * A quick search answering `size(query)` packages, cut at `maxResults` as the
 * quick search cuts (the first N by name); every request recorded.
 */
function sizedSearch(
  size: (query: string) => number,
  asked: SearchObjectsArgs[],
) {
  return async (args: SearchObjectsArgs): Promise<string[]> => {
    asked.push(args);
    return namesOf(args.query.replace('*', ''), size(args.query)).slice(
      0,
      args.maxResults,
    );
  };
}

describe('resolvePackagePatterns — a mask is resolved completely (DO12)', () => {
  it('a mask whose answer is shorter than maxResults takes one request', async () => {
    const asked: SearchObjectsArgs[] = [];
    const { packages } = await resolvePackagePatterns(
      {
        searchObjects: sizedSearch(() => 3, asked),
        sapAnswers: skipSapAnswers,
      },
      ['Z*'],
    );
    assert.deepStrictEqual(
      asked.map((a) => a.maxResults),
      [1000],
    );
    assert.deepStrictEqual(packages, namesOf('Z', 3));
  });

  it('a mask whose answer fills maxResults is asked again with maxResults doubled, until the answer is shorter', async () => {
    const asked: SearchObjectsArgs[] = [];
    const { packages } = await resolvePackagePatterns(
      {
        searchObjects: sizedSearch(() => 5000, asked),
        sapAnswers: skipSapAnswers,
      },
      ['Z*'],
    );
    assert.deepStrictEqual(
      asked.map((a) => [a.query, a.maxResults]),
      [
        ['Z*', 1000],
        ['Z*', 2000],
        ['Z*', 4000],
        ['Z*', 8000],
      ],
    );
    assert.deepStrictEqual(packages, namesOf('Z', 5000));
  });

  it('an answer of exactly maxResults packages is asked again', async () => {
    const asked: SearchObjectsArgs[] = [];
    const { packages } = await resolvePackagePatterns(
      {
        searchObjects: sizedSearch(() => 1000, asked),
        sapAnswers: skipSapAnswers,
      },
      ['Z*'],
    );
    assert.deepStrictEqual(
      asked.map((a) => a.maxResults),
      [1000, 2000],
    );
    assert.equal(packages.length, 1000);
  });

  it('the packages of the last answer are walked, each once', async () => {
    const asked: SearchObjectsArgs[] = [];
    const { packages } = await resolvePackagePatterns(
      {
        searchObjects: sizedSearch(() => 1500, asked),
        sapAnswers: skipSapAnswers,
      },
      ['Z000001', 'Z*'],
    );
    assert.equal(packages.length, 1500);
    assert.equal(packages[0], 'Z000001');
    assert.equal(new Set(packages).size, 1500);
  });

  it('a mask SAP refuses at any round is skipped with no entry, and the other entries are scanned', async () => {
    const asked: SearchObjectsArgs[] = [];
    const resolved = await resolvePackagePatterns(
      {
        sapAnswers: skipSapAnswers,
        searchObjects: async (args) => {
          asked.push(args);
          if (args.query === 'Y*' && args.maxResults === 2000) {
            // SAP's answer: a response with an integer status.
            throw Object.assign(new Error('ADT 502'), {
              response: { status: 502 },
            });
          }
          return namesOf(
            args.query.replace('*', ''),
            args.query === 'Y*' ? 1000 : 2,
          ).slice(0, args.maxResults);
        },
      },
      ['Y*', 'X*', 'ZEXACT'],
    );
    assert.deepStrictEqual(resolved, {
      packages: ['ZEXACT', ...namesOf('X', 2)],
    });
    assert.deepStrictEqual(
      asked.map((a) => [a.query, a.maxResults]),
      [
        ['Y*', 1000],
        ['Y*', 2000],
        ['X*', 1000],
      ],
    );
  });

  it('a credential failure at any round ends the call', async () => {
    const refused = new AuthRefusedError(
      authError.connection({ problem: 'refused-after-renewal', at: 'request' }),
      'request',
    );
    const asked: SearchObjectsArgs[] = [];
    assert.equal(
      await rejectionOf(
        resolvePackagePatterns(
          {
            sapAnswers: skipSapAnswers,
            searchObjects: async (args) => {
              asked.push(args);
              if (args.maxResults === 2000) throw refused;
              return namesOf('Z', 1000);
            },
          },
          ['Z*', 'X*'],
        ),
      ),
      refused,
    );
    assert.deepStrictEqual(
      asked.map((a) => [a.query, a.maxResults]),
      [
        ['Z*', 1000],
        ['Z*', 2000],
      ],
    );
  });
});

describe('resolvePackagePatterns — a mask of any size', () => {
  it('a mask answering 300 000 packages resolves to all of them, none skipped', async () => {
    const all = namesOf('Z', 300_000);
    const { packages } = await resolvePackagePatterns(
      {
        sapAnswers: skipSapAnswers,
        searchObjects: async (args) => all.slice(0, args.maxResults),
      },
      ['Z*'],
    );
    assert.equal(packages.length, 300_000);
  });
});
