/**
 * A table's technical settings and the text elements, pinned on each variant
 * on `recordingConnection`: SAP's answers are the documents measured on
 * premise and on the cloud (2026-11-19), sanitised — a settings document
 * (with `ts:isWritableByAMDP` on the cloud) and its ETag, a class's text
 * symbols; a LOCK answers the recorded handle.
 */

import { describe } from 'node:test';
import { pinCases } from '../../helpers/pinCases';
import {
  SETTINGS_ETAG,
  settingsDocument,
} from '../tableSettings/settingsStandIn';

const SYMBOLS = '@MaxLength:20\r\n001=First symbol';

/** The settings read: SAP's document with its ETag. */
const settingsRead = (variant: 'onprem' | 'cloud') => ({
  status: 200,
  headers: { etag: SETTINGS_ETAG },
  data: settingsDocument(
    'ZMCP_PIN_TS',
    'inactive',
    variant === 'cloud' ? false : undefined,
  ),
});

describe('onprem', () => {
  pinCases([
    {
      tool: 'GetTableSettings',
      variant: 'onprem',
      stand: 'recording',
      args: { table_name: 'ZMCP_PIN_TS' },
      answers: [settingsRead('onprem')],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.table.settings.v2+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'UpdateTableSettings',
      variant: 'onprem',
      stand: 'recording',
      args: { table_name: 'ZMCP_PIN_TS', data_class: 'APPL1', activate: false },
      answers: [undefined, settingsRead('onprem'), { status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?version=inactive',
          headers: {
            Accept: 'application/vnd.sap.adt.table.settings.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'PUT',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.table.settings.v2+xml',
            'Content-Type': 'application/vnd.sap.adt.table.settings.v2+xml',
            'If-Match':
              '20261119095456000Aapplication/vnd.sap.adt.table.settings.v2+xmlETAGHASH=',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><ts:tableSettings xmlns:ts="http://www.sap.com/dictionary/table/settings" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZMCP_PIN_TS" adtcore:type="TABL/DTT" adtcore:description="Settings of a table"><ts:dataClassCategory>APPL1</ts:dataClassCategory><ts:sizeCategory>1</ts:sizeCategory><ts:buffering><ts:allowed>N</ts:allowed><ts:type/><ts:areaKeyFields>0</ts:areaKeyFields></ts:buffering><ts:storageType>C</ts:storageType><ts:sharingType/><ts:loadUnit/><ts:translation ts:value="" ts:isVisible="false" ts:isEditable="false" ts:granularity="2"/><ts:loggingEnabled>false</ts:loggingEnabled></ts:tableSettings>',
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTextElements',
      variant: 'onprem',
      stand: 'recording',
      args: { object_kind: 'class', object_name: 'ZCL_MCP_PIN_TE' },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_te/source/symbols?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'UpdateTextElements',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_kind: 'class',
        object_name: 'ZCL_MCP_PIN_TE',
        symbols: [{ key: '001', text: 'First symbol', max_length: 20 }],
        activate: false,
      },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_te?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
        {
          method: 'PUT',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_te/source/symbols?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
            'Content-Type':
              'application/vnd.sap.adt.textelements.symbols.v1; charset=utf-8',
          },
          body: '@MaxLength:20\r\n001=First symbol',
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_te?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'GetTableSettings',
      variant: 'cloud',
      stand: 'recording',
      args: { table_name: 'ZMCP_PIN_TS' },
      answers: [settingsRead('cloud')],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.table.settings.v2+xml',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'UpdateTableSettings',
      variant: 'cloud',
      stand: 'recording',
      args: { table_name: 'ZMCP_PIN_TS', data_class: 'APPL1', activate: false },
      answers: [undefined, settingsRead('cloud'), { status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?version=inactive',
          headers: {
            Accept: 'application/vnd.sap.adt.table.settings.v2+xml',
          },
          body: undefined,
        },
        {
          method: 'PUT',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.table.settings.v2+xml',
            'Content-Type': 'application/vnd.sap.adt.table.settings.v2+xml',
            'If-Match':
              '20261119095456000Aapplication/vnd.sap.adt.table.settings.v2+xmlETAGHASH=',
          },
          body: '<?xml version="1.0" encoding="UTF-8"?><ts:tableSettings xmlns:ts="http://www.sap.com/dictionary/table/settings" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="ZMCP_PIN_TS" adtcore:type="TABL/DTT" adtcore:description="Settings of a table"><ts:dataClassCategory>APPL1</ts:dataClassCategory><ts:sizeCategory>1</ts:sizeCategory><ts:buffering><ts:allowed>N</ts:allowed><ts:type/><ts:areaKeyFields>0</ts:areaKeyFields></ts:buffering><ts:storageType>C</ts:storageType><ts:sharingType/><ts:loadUnit/><ts:translation ts:value="" ts:isVisible="false" ts:isEditable="false" ts:granularity="2"/><ts:loggingEnabled>false</ts:loggingEnabled><ts:isWritableByAMDP>false</ts:isWritableByAMDP></ts:tableSettings>',
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'GetTextElements',
      variant: 'cloud',
      stand: 'recording',
      args: { object_kind: 'class', object_name: 'ZCL_MCP_PIN_TE' },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_te/source/symbols?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'UpdateTextElements',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_kind: 'class',
        object_name: 'ZCL_MCP_PIN_TE',
        symbols: [{ key: '001', text: 'First symbol', max_length: 20 }],
        activate: false,
      },
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_te?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
        {
          method: 'PUT',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_te/source/symbols?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
            'Content-Type':
              'application/vnd.sap.adt.textelements.symbols.v1; charset=utf-8',
          },
          body: '@MaxLength:20\r\n001=First symbol',
        },
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_te?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
  ]);
});
