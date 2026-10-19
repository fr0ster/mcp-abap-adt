import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';

/**
 * The pairs adt-clients 36.0.2 corrected, measured on premise: the default
 * the server sends is the one SAP accepts, never the one it refused.
 */
describe('DEFAULT_ADT_HEADERS: the corrected pairs', () => {
  it("sends the enhancement's check as every other check: checkmessages / checkobjects", () => {
    expect(DEFAULT_ADT_HEADERS['enhancement.check']).toEqual({
      accept: 'application/vnd.sap.adt.checkmessages+xml',
      contentType: 'application/vnd.sap.adt.checkobjects+xml',
    });
  });

  it('names the checkrun.v1 type SAP refuses 415 in no pair', () => {
    const named = Object.entries(DEFAULT_ADT_HEADERS).filter(
      ([, { accept, contentType }]) =>
        accept.includes('checkrun.v1+xml') ||
        contentType.includes('checkrun.v1+xml'),
    );
    expect(named).toEqual([]);
  });

  it('has no entry for the members that take no pair: validate and the application log reads', () => {
    const keys = Object.keys(DEFAULT_ADT_HEADERS);
    expect(keys.filter((key) => key.endsWith('.validate'))).toEqual([]);
    expect(keys.filter((key) => key.startsWith('applicationLog.'))).toEqual([]);
  });
});
