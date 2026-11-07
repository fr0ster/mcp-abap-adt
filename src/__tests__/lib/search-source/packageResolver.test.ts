import { authError } from '@mcp-abap-adt/auth-errors';
import { AuthRefusedError } from '@mcp-abap-adt/connection';
import {
  createPackagePatternResolver,
  resolvePackagePatterns,
  type SearchObjectsArgs,
} from '../../../lib/search-source/packageResolver';
import { okResponse } from '../../helpers/fakeClient';

/**
 * `searchObjects` is gone in adt-clients 19 — `createPackagePatternResolver`
 * now calls `search(criteria, { analyse })` on the bare `client.getUtils()`
 * (no result set injected), which keeps the shipped `utilDocuments.search`
 * reading — already-parsed `ISearchResult[]` hits, `name` included — so
 * this mock answers that shape directly instead of raw `objectReference`
 * XML for the resolver to walk by hand (see `packageResolver.ts`'s own
 * comment on the `getUtils()`-with-no-result-set asymmetry).
 */
jest.mock('../../../lib/clients', () => ({
  createAdtClient: (_conn: unknown, _logger: unknown) => ({
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
  }),
}));

function neverCalled(): never {
  throw new Error('searchObjects must not be called for exact entries');
}

describe('resolvePackagePatterns — wildcard detection', () => {
  it('passes exact dev-class names through without calling ADT', async () => {
    const { packages: out } = await resolvePackagePatterns(
      { searchObjects: neverCalled },
      ['ZFI_OBSOLETE', '$TMP', '/NS/ZFI'],
    );
    expect(out).toEqual(['ZFI_OBSOLETE', '$TMP', '/NS/ZFI']);
  });

  it('treats entries containing * as patterns', async () => {
    const calls: string[] = [];
    const { packages: out } = await resolvePackagePatterns(
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

  it('an entry with ? is a mask', async () => {
    const calls: string[] = [];
    await resolvePackagePatterns(
      {
        searchObjects: async ({ query }) => {
          calls.push(query);
          return [];
        },
      },
      ['Z?TEST'],
    );
    expect(calls).toEqual(['Z?TEST']);
  });

  it('an entry with * is a mask', async () => {
    const calls: string[] = [];
    await resolvePackagePatterns(
      {
        searchObjects: async ({ query }) => {
          calls.push(query);
          return [];
        },
      },
      ['Z*', '/NS/Z*', 'Z*A*B*'],
    );
    expect(calls).toEqual(['Z*', '/NS/Z*', 'Z*A*B*']);
  });

  it('+, _, % and # are literal', async () => {
    const { packages } = await resolvePackagePatterns(
      { searchObjects: neverCalled },
      ['Z_PKG', 'Z+PKG', 'Z%PKG', 'Z#PKG'],
    );
    expect(packages).toEqual(['Z_PKG', 'Z+PKG', 'Z%PKG', 'Z#PKG']);
  });

  it('an entry with neither * nor ? is an exact name', async () => {
    const { packages } = await resolvePackagePatterns(
      { searchObjects: neverCalled },
      ['ZEXACT', '/NS/ZEXACT'],
    );
    expect(packages).toEqual(['ZEXACT', '/NS/ZEXACT']);
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
    expect(names).toEqual(['ZFI', 'ZFI_BUDGET']);
  });

  it('returns empty array when search answers no hits', async () => {
    const fn = createPackagePatternResolver(fakeCtx);
    const names = await fn({
      query: 'EMPTY*',
      objectType: 'DEVC',
      maxResults: 1000,
    });
    expect(names).toEqual([]);
  });
});

describe('resolvePackagePatterns — merge semantics', () => {
  it('places exact entries before pattern-resolved names', async () => {
    const { packages: out } = await resolvePackagePatterns(
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
    const { packages: out } = await resolvePackagePatterns(
      {
        searchObjects: async () => ['ZFI', 'ZFI_BUDGET'],
      },
      ['zfi', 'ZFI_*'],
    );
    expect(out).toEqual(['zfi', 'ZFI_BUDGET']);
  });

  it('returns empty array when patterns resolve to no packages and no exact entries', async () => {
    const { packages: out } = await resolvePackagePatterns(
      { searchObjects: async () => [] },
      ['ZZZ_NONEXISTENT*'],
    );
    expect(out).toEqual([]);
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
      { searchObjects: sizedSearch(() => 3, asked) },
      ['Z*'],
    );
    expect(asked.map((a) => a.maxResults)).toEqual([1000]);
    expect(packages).toEqual(namesOf('Z', 3));
  });

  it('a mask whose answer fills maxResults is asked again with maxResults doubled, until the answer is shorter', async () => {
    const asked: SearchObjectsArgs[] = [];
    const { packages } = await resolvePackagePatterns(
      { searchObjects: sizedSearch(() => 5000, asked) },
      ['Z*'],
    );
    expect(asked.map((a) => [a.query, a.maxResults])).toEqual([
      ['Z*', 1000],
      ['Z*', 2000],
      ['Z*', 4000],
      ['Z*', 8000],
    ]);
    expect(packages).toEqual(namesOf('Z', 5000));
  });

  it('an answer of exactly maxResults packages is asked again', async () => {
    const asked: SearchObjectsArgs[] = [];
    const { packages } = await resolvePackagePatterns(
      { searchObjects: sizedSearch(() => 1000, asked) },
      ['Z*'],
    );
    expect(asked.map((a) => a.maxResults)).toEqual([1000, 2000]);
    expect(packages).toHaveLength(1000);
  });

  it('the packages of the last answer are walked, each once', async () => {
    const asked: SearchObjectsArgs[] = [];
    const { packages } = await resolvePackagePatterns(
      { searchObjects: sizedSearch(() => 1500, asked) },
      ['Z000001', 'Z*'],
    );
    expect(packages).toHaveLength(1500);
    expect(packages[0]).toBe('Z000001');
    expect(new Set(packages).size).toBe(1500);
  });

  it('a mask SAP refuses at any round is skipped with no entry, and the other entries are scanned', async () => {
    const asked: SearchObjectsArgs[] = [];
    const resolved = await resolvePackagePatterns(
      {
        searchObjects: async (args) => {
          asked.push(args);
          if (args.query === 'Y*' && args.maxResults === 2000) {
            throw new Error('ADT 502');
          }
          return namesOf(
            args.query.replace('*', ''),
            args.query === 'Y*' ? 1000 : 2,
          ).slice(0, args.maxResults);
        },
      },
      ['Y*', 'X*', 'ZEXACT'],
    );
    expect(resolved).toEqual({ packages: ['ZEXACT', ...namesOf('X', 2)] });
    expect(asked.map((a) => [a.query, a.maxResults])).toEqual([
      ['Y*', 1000],
      ['Y*', 2000],
      ['X*', 1000],
    ]);
  });

  it('a credential failure at any round ends the call', async () => {
    const refused = new AuthRefusedError(
      authError.connection({ problem: 'refused-after-renewal', at: 'request' }),
      'request',
    );
    const asked: SearchObjectsArgs[] = [];
    await expect(
      resolvePackagePatterns(
        {
          searchObjects: async (args) => {
            asked.push(args);
            if (args.maxResults === 2000) throw refused;
            return namesOf('Z', 1000);
          },
        },
        ['Z*', 'X*'],
      ),
    ).rejects.toBe(refused);
    expect(asked.map((a) => [a.query, a.maxResults])).toEqual([
      ['Z*', 1000],
      ['Z*', 2000],
    ]);
  });
});
