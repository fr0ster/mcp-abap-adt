import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_ADT_HEADERS } from '../../../lib/adtHeaders/defaultPairs';

/**
 * The pairs adt-clients 36.0.2 corrected, measured on premise: the default
 * the server sends is the one SAP accepts, never the one it refused.
 */
describe('DEFAULT_ADT_HEADERS: the corrected pairs', () => {
  it("sends the enhancement's check as every other check: checkmessages / checkobjects", () => {
    assert.deepStrictEqual(DEFAULT_ADT_HEADERS['enhancement.check'], {
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
    assert.deepStrictEqual(named, []);
  });

  it('has no entry for the members that take no pair: validate and the application log reads', () => {
    const keys = Object.keys(DEFAULT_ADT_HEADERS);
    assert.deepStrictEqual(
      keys.filter((key) => key.endsWith('.validate')),
      [],
    );
    assert.deepStrictEqual(
      keys.filter((key) => key.startsWith('applicationLog.')),
      [],
    );
  });

  it("sends the include's metadata update as its create (measured on premise, 2026-11-01)", () => {
    assert.deepStrictEqual(
      DEFAULT_ADT_HEADERS['include.updateMetadata'],
      DEFAULT_ADT_HEADERS['include.create'],
    );
  });
});
