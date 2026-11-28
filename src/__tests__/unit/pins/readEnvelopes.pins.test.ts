/**
 * The read envelopes, pinned (#392): the four tools through the server's
 * dispatch (`pinServer`, its envelope owner), on each variant.
 *
 * - `CreateReadEnvelope`, `ListReadEnvelopes`, `DiscardReadEnvelope` send
 *   nothing: each case asserts what it answered.
 * - `ExecuteReadEnvelope` sends the one ADT batch envelope of the read a
 *   `before` step recorded (`GetClass` with the envelope's handle, which
 *   sent nothing), and answers the read under its number.
 */

import assert from 'node:assert/strict';
import { describe } from 'node:test';
import type { McpResult } from '../../helpers/pinCases';
import { pinCases } from '../../helpers/pinCases';

/** The JSON of an answer's first item. */
function payloadOf(answer: McpResult): unknown {
  return JSON.parse(answer.content[0]?.text ?? 'null');
}

/** A member of a JSON value, read by shape. */
function member(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;
}

const HANDLE = { envelope_handle: { from: 0, field: 'envelope_handle' } };

/** A new envelope's handle: 32 upper-case hex characters. */
function expectHandle(answer: McpResult): void {
  const handle = member(payloadOf(answer), 'envelope_handle');
  assert.equal(typeof handle, 'string');
  assert.match(String(handle), /^[0-9A-F]{32}$/);
}

/** The one envelope a `before` step created, listed with nothing recorded. */
function expectOneListed(answer: McpResult): void {
  const listed = payloadOf(answer);
  assert.ok(Array.isArray(listed));
  assert.equal(listed.length, 1);
  assert.equal(member(listed[0], 'recorded'), 0);
}

/** The envelope discarded, nothing recorded in it. */
function expectNoneDiscarded(answer: McpResult): void {
  assert.equal(member(payloadOf(answer), 'discarded'), 0);
}

describe('onprem', () => {
  pinCases([
    {
      tool: 'CreateReadEnvelope',
      variant: 'onprem',
      stand: 'server',
      args: {},
      expected: 'none',
      ran: expectHandle,
    },
    {
      tool: 'ListReadEnvelopes',
      variant: 'onprem',
      stand: 'server',
      before: [{ tool: 'CreateReadEnvelope', args: {} }],
      args: {},
      expected: 'none',
      ran: expectOneListed,
    },
    {
      tool: 'DiscardReadEnvelope',
      variant: 'onprem',
      stand: 'server',
      before: [{ tool: 'CreateReadEnvelope', args: {} }],
      bind: HANDLE,
      args: {},
      expected: 'none',
      ran: expectNoneDiscarded,
    },
    {
      tool: 'ExecuteReadEnvelope',
      variant: 'onprem',
      stand: 'server',
      before: [
        { tool: 'CreateReadEnvelope', args: {} },
        { tool: 'GetClass', args: { class_name: 'CLAS_A' }, bind: HANDLE },
      ],
      bind: HANDLE,
      args: {},
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_3ce7751f-90bc-4f3e-ac9b-826d32d60f11',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': 'b9888ce1-ca1b-4748-ac0c-dbd1a6162467',
            'sap-adt-request-id': '5f2a8b373d304cd2a0422beaf48ee94f',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '260',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: '127.0.0.1:<stand-in>',
            connection: 'keep-alive',
          },
          body: '--batch_3ce7751f-90bc-4f3e-ac9b-826d32d60f11\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/oo/classes/clas_a/source/main?version=active HTTP/1.1\r\nAccept: text/plain\r\n\r\n\r\n\r\n--batch_3ce7751f-90bc-4f3e-ac9b-826d32d60f11--\r\n',
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  pinCases([
    {
      tool: 'CreateReadEnvelope',
      variant: 'cloud',
      stand: 'server',
      args: {},
      expected: 'none',
      ran: expectHandle,
    },
    {
      tool: 'ListReadEnvelopes',
      variant: 'cloud',
      stand: 'server',
      before: [{ tool: 'CreateReadEnvelope', args: {} }],
      args: {},
      expected: 'none',
      ran: expectOneListed,
    },
    {
      tool: 'DiscardReadEnvelope',
      variant: 'cloud',
      stand: 'server',
      before: [{ tool: 'CreateReadEnvelope', args: {} }],
      bind: HANDLE,
      args: {},
      expected: 'none',
      ran: expectNoneDiscarded,
    },
    {
      tool: 'ExecuteReadEnvelope',
      variant: 'cloud',
      stand: 'server',
      before: [
        { tool: 'CreateReadEnvelope', args: {} },
        { tool: 'GetClass', args: { class_name: 'CLAS_A' }, bind: HANDLE },
      ],
      bind: HANDLE,
      args: {},
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_92fb6172-b611-499e-a07a-090cf41ff42d',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': 'b0e74d2b-58d6-4cae-add2-85e06375e63c',
            'sap-adt-request-id': 'b3d11ac127f64c84ae359a72aa177c4c',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '260',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: '127.0.0.1:<stand-in>',
            connection: 'keep-alive',
          },
          body: '--batch_92fb6172-b611-499e-a07a-090cf41ff42d\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/oo/classes/clas_a/source/main?version=active HTTP/1.1\r\nAccept: text/plain\r\n\r\n\r\n\r\n--batch_92fb6172-b611-499e-a07a-090cf41ff42d--\r\n',
        },
      ],
    },
  ]);
});
