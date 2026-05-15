import { resolvePackagePatterns, createPackagePatternResolver } from '../../../lib/search-source/packageResolver';

jest.mock('../../../lib/clients', () => ({
  createAdtClient: (_conn: unknown, _logger: unknown) => ({
    getUtils: () => ({
      searchObjects: async ({ query }: { query: string }) => ({
        data:
          query === 'EMPTY*'
            ? '<adtcore:objectReferences/>'
            : '<adtcore:objectReferences>' +
              '<adtcore:objectReference adtcore:name="ZFI" adtcore:type="DEVC"/>' +
              '<adtcore:objectReference adtcore:name="ZFI_BUDGET" adtcore:type="DEVC"/>' +
              '</adtcore:objectReferences>',
      }),
    }),
  }),
}));

function neverCalled(): never {
  throw new Error('searchObjects must not be called for exact entries');
}

describe('resolvePackagePatterns — wildcard detection', () => {
  it('passes exact dev-class names through without calling ADT', async () => {
    const out = await resolvePackagePatterns(
      { searchObjects: neverCalled },
      ['ZFI_OBSOLETE', '$TMP', '/NS/ZFI'],
    );
    expect(out).toEqual(['ZFI_OBSOLETE', '$TMP', '/NS/ZFI']);
  });

  it('treats entries containing * as patterns', async () => {
    const calls: string[] = [];
    const out = await resolvePackagePatterns(
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

describe('createPackagePatternResolver — XML parsing', () => {
  const fakeCtx = { connection: {} as any, logger: undefined } as any;

  it('extracts adtcore:name attributes from objectReference elements', async () => {
    const fn = createPackagePatternResolver(fakeCtx);
    const names = await fn({
      query: 'ZFI*',
      objectType: 'DEVC',
      maxResults: 1000,
    });
    expect(names).toEqual(['ZFI', 'ZFI_BUDGET']);
  });

  it('returns empty array when ADT XML has no objectReference elements', async () => {
    const fn = createPackagePatternResolver(fakeCtx);
    const names = await fn({
      query: 'EMPTY*',
      objectType: 'DEVC',
      maxResults: 1000,
    });
    expect(names).toEqual([]);
  });
});
