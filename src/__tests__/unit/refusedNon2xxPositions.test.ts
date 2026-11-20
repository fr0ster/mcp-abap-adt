/**
 * A check or an activation SAP refuses with a non-2xx status says where each
 * message stands, as on a `200` (fr0ster/mcp-abap-adt#351, adt-strategies
 * 0.23.5): the recorded documents replayed as an HTTP `400` through the
 * handlers, real adt-clients code over `recordingConnection`. `CheckClassLow`
 * judges with `analyseException`, and so does a group activation's start
 * (`POST /activation/runs`, `ActivateObjectLow`). A check run's message
 * states no `objDescr`, so it carries no `object`; the checklist's does.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { handleCheckClass } from '../../handlers/class/low/handleCheckClass';
import { handleActivateObject } from '../../handlers/common/low/handleActivateObject';
import { resetSystemContextCache } from '../../lib/systemContext';
import { declareSystemKind } from '../../lib/systemKind';
import { corpusBody } from '../helpers/adtCorpus';
import { statusError } from '../helpers/batchEnvelope';
import { setSystemContext } from '../helpers/processSystemContext';
import { recordingConnection } from '../helpers/recordingConnection';

/**
 * A real connection's refusal: the ADT request (every one but the
 * discovery, which `recordingConnection` answers) thrown as the HTTP
 * client throws a `400`, `body` on its response.
 */
function refusingWith(body: string): IAbapConnection {
  const inner = recordingConnection();
  return {
    ...inner,
    makeAdtRequest: async (options) => {
      if (options.url === '/sap/bc/adt/discovery') {
        return inner.makeAdtRequest(options);
      }
      throw statusError(400, 'Bad Request', body, {
        'content-type': 'application/xml',
      });
    },
  };
}

/** An answer's JSON payload. */
function payloadOf(answered: { content?: Array<{ text?: string }> }) {
  const [first] = answered.content ?? [];
  return JSON.parse(first?.text ?? 'null');
}

describe('a non-2xx refusal names where each message stands', () => {
  const previous = process.env.SAP_SYSTEM_TYPE;
  beforeEach(() => {
    process.env.SAP_SYSTEM_TYPE = 'onprem';
    setSystemContext({
      masterSystem: 'SYSTEM_PLACEHOLDER',
      responsible: 'USER_PLACEHOLDER',
    });
  });
  afterEach(() => {
    resetSystemContextCache();
    if (previous === undefined) delete process.env.SAP_SYSTEM_TYPE;
    else process.env.SAP_SYSTEM_TYPE = previous;
  });

  it('CheckClassLow: the recorded syntax check as a 400', async () => {
    const connection = refusingWith(
      corpusBody('refusal-syntax-check--01-checkrun'),
    );
    declareSystemKind(connection, 'onprem');
    const answered = await handleCheckClass(
      { connection },
      { class_name: 'ZMCP_BLD_ANSCH01' },
    );
    assert.equal(answered.isError, true);
    assert.deepStrictEqual(payloadOf(answered).messages, [
      {
        type: 'E',
        text: 'Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.',
        uri: '/sap/bc/adt/oo/classes/zmcp_bld_ansch01/source/main',
        position: { line: 15, column: 24, end: { line: 15, column: 50 } },
        code: 'MESSAGE(GTH)',
        line: '15',
      },
    ]);
  });

  it("ActivateObjectLow: a group's start refused 400 with the recorded checklist", async () => {
    const connection = refusingWith(
      corpusBody('refusal-activation-fails--01-activation'),
    );
    declareSystemKind(connection, 'onprem');
    const answered = await handleActivateObject(
      { connection },
      {
        objects: [
          { name: 'ZMCP_BLD_ANSCH01', type: 'CLAS/OC' },
          { name: 'ZMCP_BLD_ANSCH02', type: 'CLAS/OC' },
        ],
      },
    );
    assert.equal(answered.isError, true);
    assert.deepStrictEqual(payloadOf(answered).messages, [
      {
        type: 'E',
        text: 'Type "STRONG_BUT_NOT_A_REAL_TYPE" is unknown.',
        object: 'Class ZMCP_BLD_ANSCH01, Method SAY_HELLO',
        uri: '/sap/bc/adt/oo/classes/zmcp_bld_ansch01/source/main',
        position: { line: 15, column: 24, end: { line: 15, column: 50 } },
        code: 'MESSAGE(GTH)',
        line: '15',
      },
    ]);
  });
});
