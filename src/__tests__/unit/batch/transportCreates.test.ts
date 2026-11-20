/**
 * The transport creates in a communication batch: `CreateTransport`,
 * `HandlerTransportCreate` and `CreateTransportTask` type the created task
 * from the create's answer, and `HandlerCreate` with `object_type`
 * `TRANSPORT` is the same create. One envelope cannot hold a request built
 * from another's answer (`src/lib/batch/eligibility.ts`), so none of them is
 * an entry of `tools/batch-handlers.json`: each call is refused
 * `batch_not_recordable`, takes no number, and sends nothing — no connection
 * receives a request, no envelope is executed.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import { batchNotRecordableWords } from '../../../lib/auth/serverRefusal';
import * as connectionFactory from '../../../lib/connectionFactory';
import { batchStand, payloadOf } from '../../helpers/batchStand';

// lib/connectionFactory's names replaced on the module that defines them
// (mock.method; their callers read them at call time); the names not replaced stay real.
// Every case restores every mock after it: they are replaced before each.
beforeEach(() => {
  mock.method(connectionFactory, 'createAbapConnection', () => undefined);
});

// The process declares its system type, as every launcher requires.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const CALLS: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
  ['CreateTransport', { description: 'text' }],
  ['HandlerTransportCreate', { description: 'text' }],
  [
    'CreateTransportTask',
    { transport_number: 'XXXK900001', target_user: 'USER_A' },
  ],
  ['HandlerCreate', { object_type: 'TRANSPORT', description: 'text' }],
];

afterEach(() => mock.restoreAll());

describe('the transport creates in a batch', () => {
  for (const [tool, args] of CALLS) {
    it(
      format('%s is refused batch_not_recordable; nothing is sent', tool),
      async () => {
        const s = await batchStand({
          tools: [...new Set(CALLS.map(([name]) => name))],
          part: () => ({ status: 200, statusText: 'OK' }),
        });
        s.begin();
        const answer = await s.call(tool, args);
        assert.equal(answer.isError, true);
        assert.deepStrictEqual(payloadOf(answer), {
          error: 'batch_not_recordable',
          message: batchNotRecordableWords(tool),
        });
        assert.deepStrictEqual(s.owner.opened()?.recorded ?? [], []);
        assert.deepStrictEqual(
          s.built.map((b) => b.calls.makeAdtRequest.length),
          s.built.map(() => 0),
        );
        assert.equal(s.executes.mock.callCount(), 0);
        await s.close();
      },
    );
  }
});
