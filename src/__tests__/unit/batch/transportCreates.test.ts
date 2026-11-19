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
jest.mock('../../../lib/connectionFactory', () => ({
  createAbapConnection: jest.fn(),
  systemKindOf: jest.fn(() => 'onprem'),
  // A view over a connection keeps its kind: the kind is mocked above.
  withSystemKindOf: jest.fn((view: object) => view),
}));

import { batchNotRecordableWords } from '../../../lib/auth/serverRefusal';
import { batchStand, payloadOf } from '../../helpers/batchStand';

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

afterEach(() => jest.restoreAllMocks());

describe('the transport creates in a batch', () => {
  it.each(CALLS)(
    '%s is refused batch_not_recordable; nothing is sent',
    async (tool, args) => {
      const s = await batchStand({
        tools: [...new Set(CALLS.map(([name]) => name))],
        part: () => ({ status: 200, statusText: 'OK' }),
      });
      s.begin();
      const answer = await s.call(tool, args);
      expect(answer.isError).toBe(true);
      expect(payloadOf(answer)).toEqual({
        error: 'batch_not_recordable',
        message: batchNotRecordableWords(tool),
      });
      expect(s.owner.opened()?.recorded ?? []).toEqual([]);
      expect(s.built.map((b) => b.requests.mock.calls.length)).toEqual(
        s.built.map(() => 0),
      );
      expect(s.executes).not.toHaveBeenCalled();
      await s.close();
    },
  );
});
