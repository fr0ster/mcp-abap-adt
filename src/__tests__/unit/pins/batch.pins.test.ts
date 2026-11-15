/**
 * The communication batch, pinned, on each variant, through the server's
 * dispatch (`pinServer`: its batch owner, its connection to the stand-in).
 *
 * - `BatchBegin` sends nothing: it opens the batch and answers
 *   `{ batch: 'on' }` with the instance's state handle.
 * - `BatchEnd`, after a `BatchBegin` and one recorded `GetPackage`: the
 *   connection's logon, then the one envelope
 *   (`POST /sap/bc/adt/communication/batch`) holding the read. The stand-in
 *   answers the envelope with one part, the package's document.
 *
 * The built connection's kind is what `SAP_SYSTEM_TYPE` states (the server
 * builds it from settings), so each variant's cases run with it stated as
 * that variant.
 */

import { envelopeResponse } from '../../helpers/batchEnvelope';
import type { McpResult } from '../../helpers/pinCases';
import { PIN_STAND_HOST, pinCases } from '../../helpers/pinCases';

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

/**
 * `SAP_SYSTEM_TYPE` stated as `variant` for the enclosing describe's
 * cases, and restored after them.
 */
function statedAs(variant: 'onprem' | 'cloud'): void {
  let previous: string | undefined;
  beforeAll(() => {
    previous = process.env.SAP_SYSTEM_TYPE;
    process.env.SAP_SYSTEM_TYPE = variant;
  });
  afterAll(() => {
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });
}

/** The package the recorded read names. */
const PACKAGE = 'ZMCP_PIN_PKG';

/** SAP's answer to the envelope: one part, the package's document. */
const ENVELOPE = envelopeResponse([
  {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/vnd.sap.adt.packages.v1+xml' },
    body: `<?xml version="1.0" encoding="utf-8"?><pak:package xmlns:pak="http://www.sap.com/adt/packages" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:name="${PACKAGE}" adtcore:type="DEVC/K" adtcore:description="pin"/>`,
  },
]);

/** BatchBegin answered the batch on. */
function expectBegun(answer: McpResult): void {
  expect(member(payloadOf(answer), 'batch')).toBe('on');
}

describe('onprem', () => {
  statedAs('onprem');
  pinCases([
    {
      tool: 'BatchBegin',
      variant: 'onprem',
      stand: 'server',
      args: {},
      expected: 'none',
      ran: expectBegun,
    },
    {
      tool: 'BatchEnd',
      variant: 'onprem',
      stand: 'server',
      before: [
        { tool: 'BatchBegin', args: {} },
        { tool: 'GetPackage', args: { package_name: PACKAGE } },
      ],
      args: {},
      answers: [undefined, undefined, ENVELOPE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_f8b88b65-f0cd-4699-a5b0-13b65bd1b19e',
            'sap-adt-saplb': 'fetch',
            'sap-adt-connection-id': 'aa4b6432-8434-457d-aba7-62c50ef3f0b2',
            'sap-adt-request-id': '3e278a74231f49afa20ffb8a570bbe31',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '322',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '--batch_f8b88b65-f0cd-4699-a5b0-13b65bd1b19e\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/packages/zmcp_pin_pkg?version=active HTTP/1.1\r\nAccept: application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml\r\n\r\n\r\n\r\n--batch_f8b88b65-f0cd-4699-a5b0-13b65bd1b19e--\r\n',
        },
      ],
    },
  ]);
});

describe('cloud', () => {
  statedAs('cloud');
  pinCases([
    {
      tool: 'BatchBegin',
      variant: 'cloud',
      stand: 'server',
      args: {},
      expected: 'none',
      ran: expectBegun,
    },
    {
      tool: 'BatchEnd',
      variant: 'cloud',
      stand: 'server',
      before: [
        { tool: 'BatchBegin', args: {} },
        { tool: 'GetPackage', args: { package_name: PACKAGE } },
      ],
      args: {},
      answers: [undefined, undefined, undefined, ENVELOPE],
      expected: [
        {
          method: 'POST',
          url: '/sap/bc/adt/communication/batch',
          headers: {
            accept: 'multipart/mixed',
            'content-type':
              'multipart/mixed; boundary=batch_8154b301-31e6-4066-a2cc-b92a25d32811',
            'sap-adt-saplb': 'fetch',
            'x-sap-security-session': 'use',
            'sap-adt-connection-id': 'a50f383c-6f6f-40c4-a3e0-e5997a9eb78e',
            'sap-adt-request-id': '312164a3e0a1460da0b11466dd0e3a7a',
            'x-sap-adt-profiling': 'server-time',
            authorization: 'Basic UElOX1VTRVI6cGluLXBhc3N3b3Jk',
            'x-csrf-token': 'csrf-placeholder',
            'sap-client': '100',
            cookie:
              'SAP_SESSIONID_X01_100=session-1; sap-usercontext=sap-client=100',
            'user-agent': 'axios/1.20.0',
            'content-length': '322',
            'accept-encoding': 'gzip, compress, deflate, br',
            host: PIN_STAND_HOST,
            connection: 'keep-alive',
          },
          body: '--batch_8154b301-31e6-4066-a2cc-b92a25d32811\r\nContent-Type: application/http\r\ncontent-transfer-encoding: binary\r\n\r\nGET /sap/bc/adt/packages/zmcp_pin_pkg?version=active HTTP/1.1\r\nAccept: application/vnd.sap.adt.packages.v2+xml, application/vnd.sap.adt.packages.v1+xml\r\n\r\n\r\n\r\n--batch_8154b301-31e6-4066-a2cc-b92a25d32811--\r\n',
        },
      ],
    },
  ]);
});
