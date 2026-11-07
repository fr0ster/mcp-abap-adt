import {
  createPackagePatternResolver,
  resolvePackagePatterns,
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

  it('treats entries containing + as patterns', async () => {
    const calls: string[] = [];
    await resolvePackagePatterns(
      {
        searchObjects: async ({ query }) => {
          calls.push(query);
          return [];
        },
      },
      ['Z+OK'],
    );
    expect(calls).toEqual(['Z+OK']);
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

  it('a mask whose search fails is an OperationFailure; the other entries resolve', async () => {
    const boom = new Error('ADT 502');
    const resolved = await resolvePackagePatterns(
      {
        searchObjects: async () => {
          throw boom;
        },
      },
      ['Z*', 'ZEXACT'],
    );
    expect(resolved.packages).toEqual(['ZEXACT']);
    expect(resolved.failures).toEqual([
      {
        kind: 'operation',
        step: 'resolve package mask',
        mask: 'Z*',
        error: {
          error: 'client_threw',
          message: 'ADT 502',
          step: 'resolve package mask',
        },
      },
    ]);
  });
});
