/**
 * The searches the server sends on its own (#329, spec 3.6): each filters by
 * a search name typed from the tables — the main type the code's entry
 * states (`main`), as on adt-clients 37: `DEVC` for the package patterns of
 * the source search, `ENHO` and `ENHS` for an enhancement's subtype. A code
 * is no filter value, so none goes on the wire.
 *
 * Each case runs the real client over a recording connection declared the
 * variant — no SAP — and reads the quickSearch on the wire.
 */
import { enhancementTypeOf } from '../../handlers/enhancement/readonly/enhancementAvailability';
import type { ProjectionVariant } from '../../lib/adtProjections';
import {
  createPackagePatternResolver,
  PACKAGE_SEARCH_NAME,
  resolvePackagePatterns,
} from '../../lib/search-source/packageResolver';
import { declareSystemKind } from '../../lib/systemKind';
import {
  type RecordedRequest,
  recordingConnection,
} from '../helpers/recordingConnection';

const VARIANTS: readonly ProjectionVariant[] = ['onprem', 'cloud'];

/** The one quickSearch on the wire, its parameters read. */
function sentSearch(requests: readonly RecordedRequest[]) {
  expect(requests).toHaveLength(1);
  const [request] = requests;
  if (request === undefined) throw new Error('no request was sent');
  const url = new URL(request.url, 'https://system.invalid');
  return {
    path: url.pathname,
    operation: url.searchParams.get('operation'),
    query: url.searchParams.get('query'),
    objectType: url.searchParams.get('objectType'),
  };
}

function declared(variant: ProjectionVariant) {
  const connection = recordingConnection();
  declareSystemKind(connection, variant);
  return connection;
}

describe.each(VARIANTS)('the searches the server sends, on %s', (variant) => {
  it('a package pattern is searched by the package search name, DEVC', async () => {
    expect(PACKAGE_SEARCH_NAME).toBe('DEVC');
    const connection = declared(variant);
    await resolvePackagePatterns(
      { searchObjects: createPackagePatternResolver({ connection }) },
      ['ZPKG*'],
    );
    expect(sentSearch(connection.requests)).toEqual({
      path: '/sap/bc/adt/repository/informationsystem/search',
      operation: 'quickSearch',
      query: 'ZPKG*',
      objectType: 'DEVC',
    });
  });

  it.each([
    ['ENHO/XHH', 'ENHO'],
    ['ENHS/XSB', 'ENHS'],
  ] as const)(
    "an enhancement's subtype is searched by its main type: %s by %s",
    async (code, name) => {
      const connection = declared(variant);
      await enhancementTypeOf(connection, 'ZENH', code);
      expect(sentSearch(connection.requests)).toEqual({
        path: '/sap/bc/adt/repository/informationsystem/search',
        operation: 'quickSearch',
        query: 'ZENH',
        objectType: name,
      });
    },
  );
});
