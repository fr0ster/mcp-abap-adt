/**
 * What UpdateServiceBinding answers for a publication SAP accepted
 * (`tersePublication`): on premise the change is done; on ABAP Cloud SAP
 * runs it as a background job, so the answer says it started, with SAP's
 * severity and short text, and what makes the service usable.
 */
import { tersePublication } from '../../lib/strategies/projections';
import { parseStructure } from '../../lib/strategies/reading';

/** SAP's status message, read as the publication slot reads it. */
const STATUS = parseStructure(
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>ZMCP_PIN_SRVB published locally</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>',
);

describe('tersePublication', () => {
  it('on premise: done, with SAP s words', () => {
    expect(tersePublication('onprem', 'published')(STATUS, 200)).toEqual({
      result: 'SUCCESS',
      completion: 'done',
      severity: 'OK',
      short_text: 'ZMCP_PIN_SRVB published locally',
    });
  });

  it('on ABAP Cloud: started as a background job, with SAP s words', () => {
    const answered = tersePublication('cloud', 'published')(STATUS, 200);
    expect(answered).toMatchObject({
      result: 'STARTED',
      completion: 'background',
      severity: 'OK',
      short_text: 'ZMCP_PIN_SRVB published locally',
    });
    expect(answered?.note).toContain('becomes usable once that job ends');
  });

  it('an unpublication on ABAP Cloud says the service stops being usable', () => {
    expect(
      tersePublication('cloud', 'unpublished')(STATUS, 200)?.note,
    ).toContain('stops being usable once that job ends');
  });

  it('an answer that is not a 2xx is no publication answer', () => {
    expect(
      tersePublication('onprem', 'published')(STATUS, 500),
    ).toBeUndefined();
  });
});
