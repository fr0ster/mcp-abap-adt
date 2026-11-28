/**
 * Every admitted core read answers under its number what it answers outside
 * an envelope for the same SAP answer (spec §6.3, goal invariant 16): its
 * handler's projection of its parts, with no further request. Each sample
 * call of every core entry (`BATCH_ENTRY_CASES`) runs once directly and once
 * recorded and executed, against SAP answering each part alike — a success,
 * a `404`, and a `500` with a body.
 */

import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { batchEntries } from '../../../lib/batch/eligibility';
import { InstanceEnvelopes } from '../../../lib/batch/InstanceEnvelopes';
import { BATCH_ENTRY_CASES } from '../../helpers/batchEntryCases';
import type { InnerRequest, PartAnswer } from '../../helpers/batchEnvelope';
import { batchStand, payloadOf } from '../../helpers/batchStand';

process.env.SAP_SYSTEM_TYPE = 'onprem';

afterEach(() => mock.restoreAll());

const CORE = new Set(
  batchEntries()
    .filter((entry) => entry.set === 'core')
    .map((entry) => entry.tool),
);
const CASES = [
  ...BATCH_ENTRY_CASES.filter(
    (c) => CORE.has(c.tool) && (c.connection ?? 'http') === 'http',
  ),
  // A source range: the one request, the lines cut from its answer locally.
  {
    tool: 'GetClass',
    args: { class_name: 'CLAS_A', start_line: 2, end_line: 3 },
    body: 'line one\nline two\nline three\nline four',
  },
];

/** How SAP answers every part, the same for a direct request and an envelope's part. */
const ANSWERS: ReadonlyArray<
  readonly [
    string,
    (body: string | undefined) => (inner: InnerRequest) => PartAnswer,
  ]
> = [
  [
    'a success',
    (body) => (inner) => ({
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/plain' },
      body: body ?? `answer of ${inner.url}`,
    }),
  ],
  [
    'a 404',
    () => () => ({ status: 404, statusText: 'Not Found', body: 'absent' }),
  ],
  [
    'a 500 with a body',
    () => () => ({
      status: 500,
      statusText: 'Internal Server Error',
      body: 'refused here',
    }),
  ],
];

describe('an admitted core read answers in an envelope as outside one', () => {
  it('there are core cases to run', () => {
    assert.ok(CASES.length >= CORE.size);
  });

  for (const c of CASES) {
    for (const [what, answer] of ANSWERS) {
      it(`${c.tool} ${JSON.stringify(c.args)}: ${what}`, async () => {
        const s = await batchStand({
          tools: [c.tool],
          part: answer(c.body),
          envelopes: new InstanceEnvelopes({ keepRawParts: false }),
          // A long read in the call reads on a connection of its own.
          freshConnections: true,
        });
        const outside = await s.call(c.tool, c.args);
        const handle = payloadOf(await s.call('CreateReadEnvelope'))
          .envelope_handle as string;
        const recorded = await s.call(c.tool, {
          ...c.args,
          envelope_handle: handle,
        });
        assert.equal(payloadOf(recorded).number, 1);
        const executed = payloadOf(
          await s.call('ExecuteReadEnvelope', { envelope_handle: handle }),
        ) as Array<{ number: number; content: unknown; isError?: boolean }>;
        assert.equal(executed.length, 1);
        assert.deepStrictEqual(
          {
            content: executed[0]?.content,
            isError: executed[0]?.isError === true,
          },
          { content: outside.content, isError: outside.isError === true },
        );
        await s.close();
      });
    }
  }
});
