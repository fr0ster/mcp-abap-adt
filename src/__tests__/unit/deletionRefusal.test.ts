/**
 * The deletion reading — adt-strategies' since 0.5.0 (#172), re-exported by
 * `deletionRefusal.ts` — against
 * answers an on-premise system sent on 2026-09-26
 * (integration run 8), trimmed to the elements the reading looks at.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADT_NO_FAILURE } from '@mcp-abap-adt/interfaces-adt';
import {
  analyseDeletion,
  readDeletionRefusal,
} from '../../lib/strategies/deletionRefusal';
import { assertMatchObject } from '../helpers/assertions';

const NS =
  'xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core"';

/** Check of a service binding that did not exist: a W and an E, siblings. */
const SRVB_CHECK_TWO_MESSAGES =
  `<?xml version="1.0" encoding="utf-8"?><del:checkResponse ${NS}>` +
  '<del:object del:externalStrongReferences="0" del:externalWeakReferences="0" del:isDeletable="false" adtcore:type="SRVB/SVB" adtcore:name="ZMCP_BLD_SRVB01">' +
  '<del:lockingTransport><del:recording>false</del:recording></del:lockingTransport>' +
  '<del:message del:priority="0" del:type="W"><del:text>ZMCP_BLD_SRVB01 does not exist</del:text></del:message>' +
  '<del:message del:priority="0" del:type="E"><del:text>The Service Binding does not exist</del:text>' +
  '<atom:link href="/sap/bc/adt/messageclass/SDDIC_ADT_SRVB/messages/006/longtext?language=E" rel="http://www.sap.com/adt/relations/longtext" type="text/html" xmlns:atom="http://www.w3.org/2005/Atom"/>' +
  '</del:message></del:object></del:checkResponse>';

/** Delete of a table whose directory entry waits for the release. */
const TABL_DELETE_TWO_OBJECTS =
  `<?xml version="1.0" encoding="utf-8"?><del:deletionResult ${NS}>` +
  '<del:object del:isDeleted="true" adtcore:type="TABT/DTT" adtcore:name="ZMCP_BLD_TAB_H1"><del:message del:priority="0" del:type="S"><del:text/></del:message></del:object>' +
  '<del:object del:isDeleted="false" adtcore:type="TABL/DT" adtcore:name="ZMCP_BLD_TAB_H1"><del:message del:priority="0" del:type="W"><del:text>Release transport SIDK905876 to remove the object directory entry</del:text></del:message></del:object>' +
  '</del:deletionResult>';

/** Delete of a behavior definition refused with SWB_TOOL 029. */
const BDEF_DELETE_T100 =
  `<?xml version="1.0" encoding="utf-8"?><del:deletionResult ${NS}>` +
  '<del:object del:isDeleted="false" adtcore:type="BDEF/BDO" adtcore:name="ZMCP_BLD_I_BDEF">' +
  '<del:message del:priority="0" del:type="E"><del:text>Error while deleting object ZMCP_BLD_I_BDEF from the database</del:text>' +
  '<atom:link href="/sap/bc/adt/messageclass/SWB_TOOL/messages/029/longtext?language=E&amp;msgv1=ZMCP_BLD_I_BDEF" rel="http://www.sap.com/adt/relations/longtext" type="text/html" xmlns:atom="http://www.w3.org/2005/Atom"/>' +
  '</del:message></del:object></del:deletionResult>';

const CHECK_DELETABLE = `<del:checkResponse ${NS}><del:object del:isDeletable="true" adtcore:name="ZX"/></del:checkResponse>`;

const CHECK_REFUSED_BY_REFERENCES = `<del:checkResponse ${NS}><del:object del:externalStrongReferences="5" del:externalWeakReferences="3" del:isDeletable="false" adtcore:name="ZMCP_SHR_RTABL"/></del:checkResponse>`;

/** Delete of a CDS view: deleted, with an untyped message pointing at its log. */
const DDLS_DELETED_UNTYPED_MESSAGE =
  `<?xml version="1.0" encoding="utf-8"?><del:deletionResult ${NS}>` +
  '<del:object del:isDeleted="true" adtcore:type="DDLS/DF" adtcore:name="ZMCP_BLD_VIEW_L1">' +
  '<del:message del:priority="0" del:type=""><del:text>S::000</del:text>' +
  '<atom:link href="/sap/bc/adt/messageclass//messages/000/longtext?language=E" rel="http://www.sap.com/adt/relations/longtext" type="text/html" xmlns:atom="http://www.w3.org/2005/Atom"/>' +
  '</del:message></del:object></del:deletionResult>';

describe('readDeletionRefusal (adt-strategies, re-exported)', () => {
  it('an untyped message on a deleted object is no refusal', () => {
    assert.equal(readDeletionRefusal(DDLS_DELETED_UNTYPED_MESSAGE), null);
  });

  it('keeps every message SAP sent, not the reference-count fallback', () => {
    assertMatchObject(readDeletionRefusal(SRVB_CHECK_TWO_MESSAGES), {
      message: 'ADT refuses to delete ZMCP_BLD_SRVB01',
      messages: [
        { type: 'W', text: 'ZMCP_BLD_SRVB01: ZMCP_BLD_SRVB01 does not exist' },
        {
          type: 'E',
          text: 'ZMCP_BLD_SRVB01: The Service Binding does not exist',
          t100: { id: 'SDDIC_ADT_SRVB', no: '006' },
        },
      ],
    });
  });

  it('refuses only the object not deleted, with its own message', () => {
    assertMatchObject(readDeletionRefusal(TABL_DELETE_TWO_OBJECTS), {
      message: 'ADT refuses to delete ZMCP_BLD_TAB_H1',
      messages: [
        {
          type: 'W',
          text: 'ZMCP_BLD_TAB_H1: Release transport SIDK905876 to remove the object directory entry',
        },
      ],
    });
  });

  it('carries the T100 key and its values from the long-text link', () => {
    assert.deepStrictEqual(readDeletionRefusal(BDEF_DELETE_T100)?.messages, [
      {
        type: 'E',
        text: 'ZMCP_BLD_I_BDEF: Error while deleting object ZMCP_BLD_I_BDEF from the database',
        t100: { id: 'SWB_TOOL', no: '029', values: ['ZMCP_BLD_I_BDEF'] },
      },
    ]);
  });

  it('falls back to the reference counts only when SAP gave no text', () => {
    assert.deepStrictEqual(
      readDeletionRefusal(CHECK_REFUSED_BY_REFERENCES)?.messages,
      [
        {
          type: 'E',
          text: 'ZMCP_SHR_RTABL: 5 strong and 3 weak external references',
        },
      ],
    );
  });

  it('a permitted object is no refusal; an E message on it is', () => {
    assert.equal(readDeletionRefusal(CHECK_DELETABLE), null);
    assert.deepStrictEqual(
      readDeletionRefusal(
        CHECK_DELETABLE.replace(
          '/>',
          '><del:message del:type="E"><del:text>locked</del:text></del:message></del:object>',
        ),
      )?.messages,
      [{ type: 'E', text: 'ZX: locked', t100: undefined }],
    );
  });

  it('no document, or no del:object, is no refusal', () => {
    assert.equal(readDeletionRefusal(''), null);
    assert.equal(readDeletionRefusal(undefined), null);
    assert.equal(readDeletionRefusal('<other/>'), null);
  });
});

describe('analyseDeletion (adt-strategies, re-exported)', () => {
  it('turns a 200 refusal into a failure that names the request', () => {
    const failure: any = analyseDeletion(ADT_NO_FAILURE, {
      data: SRVB_CHECK_TWO_MESSAGES,
      status: 200,
      request: { method: 'POST', url: '/sap/bc/adt/deletion/check' },
    } as any);
    assertMatchObject(failure, {
      origin: 'refusal',
      message: 'ADT refuses to delete ZMCP_BLD_SRVB01',
      request: { method: 'POST', url: '/sap/bc/adt/deletion/check' },
    });
    assert.equal(failure.messages.length, 2);
  });

  it('leaves a permitted answer a success', () => {
    assert.equal(
      analyseDeletion(ADT_NO_FAILURE, {
        data: CHECK_DELETABLE,
        status: 200,
      } as any),
      ADT_NO_FAILURE,
    );
  });
});
