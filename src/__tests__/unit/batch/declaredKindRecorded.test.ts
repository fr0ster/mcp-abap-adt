/**
 * A call recorded in a communication batch reaches its handler through the
 * batch's recorder: the recorder keeps the system kind the server states
 * for the call's connection (`systemType`), with `SAP_SYSTEM_TYPE` unset —
 * as on an HTTP/SSE server or in an embedder. Only `createAbapConnection`
 * is a fake here; `systemKindOf` is the real one.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, it, mock } from 'node:test';
import * as connectionFactory from '../../../lib/connectionFactory';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { batchStand } from '../../helpers/batchStand';
import { withinTurns } from '../../helpers/withinTurns';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
mock.method(connectionFactory, 'createAbapConnection', () => undefined);

function sap(inner: InnerRequest): PartAnswer {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'text/plain' },
    body: `source of ${inner.url}`,
  };
}

let saved: string | undefined;

beforeEach(() => {
  saved = process.env.SAP_SYSTEM_TYPE;
  delete process.env.SAP_SYSTEM_TYPE;
});

afterEach(() => {
  if (saved === undefined) delete process.env.SAP_SYSTEM_TYPE;
  else process.env.SAP_SYSTEM_TYPE = saved;
});

it('a recorded read runs on the kind the server states, not SAP_SYSTEM_TYPE', async () => {
  const stand = await batchStand({ tools: ['HandlerGet'], part: sap });
  try {
    stand.begin();
    const recorded = await withinTurns(
      stand.call('HandlerGet', {
        object_type: 'PROGRAM',
        program_name: 'PROG_A',
      }),
    );
    assert.ok(!recorded.isError);
    const { summary } = await withinTurns(stand.end());
    assert.deepStrictEqual(summary, { received: 1, recorded: 1, sent: 1 });
    const [entry] = await withinTurns(stand.answers([1]));
    assert.ok(JSON.stringify(entry).includes('source of'));
    assert.ok(!JSON.stringify(entry).includes('system_type_required'));
  } finally {
    await stand.close();
  }
});
