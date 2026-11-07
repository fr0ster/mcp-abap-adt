/**
 * Pins of the package masks on the wire (D23b Step 6): the quick searches the
 * real client sends for a mask — the doubling sequence of `maxResults`, a `?`
 * mask sent as given — and none for an exact name with a literal `_`.
 *
 * The corpus records no quick-search exchange, so the answers are documents
 * of the shape the quick search answers (`adtcore:objectReferences`); a live
 * capture is owed (D23b Step 7).
 */
import {
  createPackagePatternResolver,
  resolvePackagePatterns,
} from '../../../lib/search-source/packageResolver';
import { recordingConnection } from '../../helpers/recordingConnection';

process.env.SAP_SYSTEM_TYPE = 'onprem';

/** A quick-search answer naming `count` packages. */
const answerOf = (count: number) => ({
  status: 200,
  data: `<?xml version="1.0" encoding="utf-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">${Array.from(
    { length: count },
    (_, i) => {
      const name = `ZP${String(i + 1).padStart(6, '0')}`;
      return `<adtcore:objectReference adtcore:uri="/sap/bc/adt/packages/${name.toLowerCase()}" adtcore:type="DEVC/K" adtcore:name="${name}" adtcore:packageName="${name}"/>`;
    },
  ).join('')}</adtcore:objectReferences>`,
});

/** The query parameters of a recorded request: its URL's, then its params. */
function paramsOf(request: { url: string; params?: unknown }) {
  const url = new URL(request.url, 'https://system.invalid');
  const out: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    out[key] = value;
  });
  for (const [key, value] of Object.entries(
    (request.params ?? {}) as Record<string, unknown>,
  )) {
    out[key] = String(value);
  }
  return { path: url.pathname, query: out.query, maxResults: out.maxResults };
}

describe('the package masks on the wire', () => {
  it('a mask fills 1000, then 2000: three quick searches, maxResults doubled, the last answer used', async () => {
    const connection = recordingConnection([
      answerOf(1000),
      answerOf(2000),
      answerOf(2500),
    ]);
    const { packages } = await resolvePackagePatterns(
      {
        searchObjects: createPackagePatternResolver({
          connection,
          logger: undefined,
        }),
      },
      ['Z*'],
    );
    expect(connection.requests.map(paramsOf)).toEqual([
      {
        path: '/sap/bc/adt/repository/informationsystem/search',
        query: 'Z*',
        maxResults: '1000',
      },
      {
        path: '/sap/bc/adt/repository/informationsystem/search',
        query: 'Z*',
        maxResults: '2000',
      },
      {
        path: '/sap/bc/adt/repository/informationsystem/search',
        query: 'Z*',
        maxResults: '4000',
      },
    ]);
    expect(packages).toHaveLength(2500);
  });

  it('a ? mask is sent as given', async () => {
    const connection = recordingConnection([answerOf(3)]);
    await resolvePackagePatterns(
      {
        searchObjects: createPackagePatternResolver({
          connection,
          logger: undefined,
        }),
      },
      ['Z?TEST'],
    );
    expect(connection.requests.map(paramsOf)).toEqual([
      {
        path: '/sap/bc/adt/repository/informationsystem/search',
        query: 'Z?TEST',
        maxResults: '1000',
      },
    ]);
  });

  it('an exact name with a literal _ sends no quick search', async () => {
    const connection = recordingConnection([]);
    const { packages } = await resolvePackagePatterns(
      {
        searchObjects: createPackagePatternResolver({
          connection,
          logger: undefined,
        }),
      },
      ['Z_PKG'],
    );
    expect(connection.requests).toEqual([]);
    expect(packages).toEqual(['Z_PKG']);
  });
});
