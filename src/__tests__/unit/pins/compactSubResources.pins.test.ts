/**
 * The compact sub-resource routes, pinned on each variant on
 * `recordingConnection`: HandlerGet reads TABLE_SETTINGS and the text
 * elements; HandlerLock and HandlerUnlock take the settings' TABT lock and
 * the text elements' TEXT lock; HandlerUpdate writes under the caller's
 * lock_handle (the settings' patch: its read and its PUT; one PUT per text
 * part). SAP's answers are the documents measured on premise and on the
 * cloud (2026-11-19), sanitised; a LOCK answers the recorded handle.
 */

import { describe } from 'node:test';
import { pinCases } from '../../helpers/pinCases';
import { LOCK_SUCCESS_XML } from '../../helpers/recordingConnection';
import {
  SETTINGS_ETAG,
  settingsDocument,
} from '../tableSettings/settingsStandIn';
import { HEADINGS, SELECTIONS, SYMBOLS } from '../textElements/textStandIn';

const HANDLE = 'B92E65858E83454C783181344F429D4BFD8E395D';
const SYMBOL = { key: '001', text: 'First symbol', max_length: 20 };

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

/** A program's or a function group's three parts, in the order read. */
const PARTS = [
  { status: 200, data: SYMBOLS },
  { status: 200, data: SELECTIONS },
  { status: 200, data: HEADINGS },
];

describe('onprem', () => {
  pinCases([
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'TABLE_SETTINGS',
        part: 'source',
        table_name: 'ZMCP_PIN_TS',
      },
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
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        part: 'source',
        program_name: 'ZMCP_PIN_TP',
      },
      answers: PARTS,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp/source/symbols?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp/source/selections?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.selections.v1',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp/source/headings?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.headings.v1',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        part: 'source',
        function_group_name: 'ZMCP_PIN_TG',
      },
      answers: PARTS,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg/source/symbols?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg/source/selections?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.selections.v1',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg/source/headings?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.headings.v1',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'CLASS_TEXT_ELEMENTS',
        part: 'source',
        class_name: 'ZCL_MCP_PIN_TC',
      },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc/source/symbols?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'onprem',
      stand: 'recording',
      args: { object_type: 'TABLE_SETTINGS', object_name: 'ZMCP_PIN_TS' },
      answers: [{ status: 200, data: LOCK_SUCCESS_XML }],
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
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TP',
      },
      answers: [{ status: 200, data: LOCK_SUCCESS_XML }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TG',
      },
      answers: [{ status: 200, data: LOCK_SUCCESS_XML }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'CLASS_TEXT_ELEMENTS',
        object_name: 'ZCL_MCP_PIN_TC',
      },
      answers: [{ status: 200, data: LOCK_SUCCESS_XML }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'onprem',
      stand: 'recording',
      args: {
        action: 'unlock',
        object_type: 'TABLE_SETTINGS',
        object_name: 'ZMCP_PIN_TS',
        lock_handle: HANDLE,
      },
      answers: [{ status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'onprem',
      stand: 'recording',
      args: {
        action: 'unlock',
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TP',
        lock_handle: HANDLE,
      },
      answers: [{ status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'onprem',
      stand: 'recording',
      args: {
        action: 'unlock',
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TG',
        lock_handle: HANDLE,
      },
      answers: [{ status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'onprem',
      stand: 'recording',
      args: {
        action: 'unlock',
        object_type: 'CLASS_TEXT_ELEMENTS',
        object_name: 'ZCL_MCP_PIN_TC',
        lock_handle: HANDLE,
      },
      answers: [{ status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerUpdate',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'TABLE_SETTINGS',
        table_name: 'ZMCP_PIN_TS',
        data_class: 'APPL1',
        lock_handle: HANDLE,
      },
      answers: [settingsRead('onprem'), { status: 200 }],
      expected: [
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
      ],
    },
    {
      tool: 'HandlerUpdate',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        function_group_name: 'ZMCP_PIN_TG',
        symbols: [SYMBOL],
        lock_handle: HANDLE,
      },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'PUT',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg/source/symbols?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
            'Content-Type':
              'application/vnd.sap.adt.textelements.symbols.v1; charset=utf-8',
          },
          body: '@MaxLength:20\r\n001=First symbol',
        },
      ],
    },
    {
      tool: 'HandlerUpdate',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'CLASS_TEXT_ELEMENTS',
        class_name: 'ZCL_MCP_PIN_TC',
        symbols: [SYMBOL],
        lock_handle: HANDLE,
      },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'PUT',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc/source/symbols?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
            'Content-Type':
              'application/vnd.sap.adt.textelements.symbols.v1; charset=utf-8',
          },
          body: '@MaxLength:20\r\n001=First symbol',
        },
      ],
    },
    {
      tool: 'HandlerUpdate',
      variant: 'onprem',
      stand: 'recording',
      args: {
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        program_name: 'ZMCP_PIN_TP',
        symbols: [SYMBOL],
        lock_handle: HANDLE,
      },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'PUT',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp/source/symbols?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
            'Content-Type':
              'application/vnd.sap.adt.textelements.symbols.v1; charset=utf-8',
          },
          body: '@MaxLength:20\r\n001=First symbol',
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'HandlerGet',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'TABLE_SETTINGS',
        part: 'source',
        table_name: 'ZMCP_PIN_TS',
      },
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
      tool: 'HandlerGet',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        part: 'source',
        program_name: 'ZMCP_PIN_TP',
      },
      answers: PARTS,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp/source/symbols?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp/source/selections?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.selections.v1',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/programs/zmcp_pin_tp/source/headings?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.headings.v1',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        part: 'source',
        function_group_name: 'ZMCP_PIN_TG',
      },
      answers: PARTS,
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg/source/symbols?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg/source/selections?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.selections.v1',
          },
          body: undefined,
        },
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg/source/headings?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.headings.v1',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerGet',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'CLASS_TEXT_ELEMENTS',
        part: 'source',
        class_name: 'ZCL_MCP_PIN_TC',
      },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'GET',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc/source/symbols?version=active',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'cloud',
      stand: 'recording',
      args: { object_type: 'TABLE_SETTINGS', object_name: 'ZMCP_PIN_TS' },
      answers: [{ status: 200, data: LOCK_SUCCESS_XML }],
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
      ],
    },
    {
      // The cloud offers no lock of a program's text elements (T11): the
      // member is refused at the boundary, nothing sent.
      tool: 'HandlerLock',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TP',
      },
      refusal: 'thrown',
      expected: 'nothing-sent',
    },
    {
      tool: 'HandlerLock',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TG',
      },
      answers: [{ status: 200, data: LOCK_SUCCESS_XML }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'CLASS_TEXT_ELEMENTS',
        object_name: 'ZCL_MCP_PIN_TC',
      },
      answers: [{ status: 200, data: LOCK_SUCCESS_XML }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc?_action=LOCK&accessMode=MODIFY',
          headers: {
            Accept:
              'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
          },
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'cloud',
      stand: 'recording',
      args: {
        action: 'unlock',
        object_type: 'TABLE_SETTINGS',
        object_name: 'ZMCP_PIN_TS',
        lock_handle: HANDLE,
      },
      answers: [{ status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/ddic/db/settings/zmcp_pin_ts?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      // The cloud offers no lock of a program's text elements (T11): the
      // member is refused at the boundary, nothing sent.
      tool: 'HandlerLock',
      variant: 'cloud',
      stand: 'recording',
      args: {
        action: 'unlock',
        object_type: 'PROGRAM_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TP',
        lock_handle: HANDLE,
      },
      refusal: 'thrown',
      expected: 'nothing-sent',
    },
    {
      tool: 'HandlerLock',
      variant: 'cloud',
      stand: 'recording',
      args: {
        action: 'unlock',
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        object_name: 'ZMCP_PIN_TG',
        lock_handle: HANDLE,
      },
      answers: [{ status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerLock',
      variant: 'cloud',
      stand: 'recording',
      args: {
        action: 'unlock',
        object_type: 'CLASS_TEXT_ELEMENTS',
        object_name: 'ZCL_MCP_PIN_TC',
        lock_handle: HANDLE,
      },
      answers: [{ status: 200 }],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc?_action=UNLOCK&lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {},
          body: undefined,
        },
      ],
    },
    {
      tool: 'HandlerUpdate',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'TABLE_SETTINGS',
        table_name: 'ZMCP_PIN_TS',
        data_class: 'APPL1',
        lock_handle: HANDLE,
      },
      answers: [settingsRead('cloud'), { status: 200 }],
      expected: [
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
      ],
    },
    {
      tool: 'HandlerUpdate',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'FUNCTION_GROUP_TEXT_ELEMENTS',
        function_group_name: 'ZMCP_PIN_TG',
        symbols: [SYMBOL],
        lock_handle: HANDLE,
      },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'PUT',
          url: '/sap/bc/adt/textelements/functiongroups/zmcp_pin_tg/source/symbols?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
            'Content-Type':
              'application/vnd.sap.adt.textelements.symbols.v1; charset=utf-8',
          },
          body: '@MaxLength:20\r\n001=First symbol',
        },
      ],
    },
    {
      tool: 'HandlerUpdate',
      variant: 'cloud',
      stand: 'recording',
      args: {
        object_type: 'CLASS_TEXT_ELEMENTS',
        class_name: 'ZCL_MCP_PIN_TC',
        symbols: [SYMBOL],
        lock_handle: HANDLE,
      },
      answers: [{ status: 200, data: SYMBOLS }],
      expected: [
        {
          method: 'PUT',
          url: '/sap/bc/adt/textelements/classes/zcl_mcp_pin_tc/source/symbols?lockHandle=B92E65858E83454C783181344F429D4BFD8E395D',
          headers: {
            Accept: 'application/vnd.sap.adt.textelements.symbols.v1',
            'Content-Type':
              'application/vnd.sap.adt.textelements.symbols.v1; charset=utf-8',
          },
          body: '@MaxLength:20\r\n001=First symbol',
        },
      ],
    },
  ]);
});
