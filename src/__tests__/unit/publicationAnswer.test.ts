/**
 * What UpdateServiceBinding answers for a publication SAP accepted
 * (`tersePublication`): on premise the change is done; on ABAP Cloud SAP
 * runs it as a background job, so the answer says it started, with SAP's
 * severity and short text, and what makes the service usable.
 */

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { handleUpdateServiceBinding } from '../../handlers/service_binding/high/handleUpdateServiceBinding';
import { tersePublication } from '../../lib/strategies/projections';
import { parseStructure } from '../../lib/strategies/reading';
import { assertMatchObject } from '../helpers/assertions';
import {
  LOCK_SUCCESS_XML,
  recordingConnection,
} from '../helpers/recordingConnection';

/** SAP's status message, read as the publication slot reads it. */
const STATUS = parseStructure(
  '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>ZMCP_PIN_SRVB published locally</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>',
);

describe('tersePublication', () => {
  it('on premise: done, with SAP s words', () => {
    assert.deepStrictEqual(
      tersePublication('onprem', 'published')(STATUS, 200),
      {
        result: 'SUCCESS',
        completion: 'done',
        severity: 'OK',
        short_text: 'ZMCP_PIN_SRVB published locally',
      },
    );
  });

  it('on ABAP Cloud: started as a background job, with SAP s words', () => {
    const answered = tersePublication('cloud', 'published')(STATUS, 200);
    assertMatchObject(answered, {
      result: 'STARTED',
      completion: 'background',
      severity: 'OK',
      short_text: 'ZMCP_PIN_SRVB published locally',
    });
    assert.ok(answered?.note?.includes('becomes usable once that job ends'));
  });

  it('an unpublication on ABAP Cloud says the service stops being usable', () => {
    assert.ok(
      tersePublication('cloud', 'unpublished')(STATUS, 200)?.note?.includes(
        'stops being usable once that job ends',
      ),
    );
  });

  it('an answer that is not a 2xx is no publication answer', () => {
    assert.equal(
      tersePublication('onprem', 'published')(STATUS, 500),
      undefined,
    );
  });
});

describe('UpdateServiceBinding reads SAP s status message', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  after(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  for (const [kind, result, completion] of [
    ['onprem', 'SUCCESS', 'done'],
    ['cloud', 'STARTED', 'background'],
  ] as const) {
    it(`answers ${result} / ${completion} on ${kind}, with SEVERITY and SHORT_TEXT`, async () => {
      process.env.SAP_SYSTEM_TYPE = kind;
      const connection = recordingConnection([
        { data: LOCK_SUCCESS_XML },
        {
          data: '<?xml version="1.0" encoding="utf-8"?><asx:abap version="1.0" xmlns:asx="http://www.sap.com/abapxml"><asx:values><DATA><SEVERITY>OK</SEVERITY><SHORT_TEXT>ZMCP_X published locally</SHORT_TEXT><LONG_TEXT/></DATA></asx:values></asx:abap>',
        },
      ]);
      const answered = await handleUpdateServiceBinding(
        { connection, logger: undefined } as never,
        {
          service_binding_name: 'zmcp_x',
          desired_publication_state: 'published',
          binding_variant: 'ODATA_V4_UI',
          service_name: 'zmcp_x',
        } as never,
      );
      const text = answered.content
        .map((item) => ('text' in item ? item.text : ''))
        .join('');
      assertMatchObject(JSON.parse(text), {
        result,
        completion,
        severity: 'OK',
        short_text: 'ZMCP_X published locally',
      });
    });
  }
});
