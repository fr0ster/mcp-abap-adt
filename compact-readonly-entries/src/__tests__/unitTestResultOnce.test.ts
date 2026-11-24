/**
 * Compact unit-test results are read once (spec §4.6, the owner's rule:
 * compact is one ADT request per tool call; the consumer chains and polls).
 *
 * `HandlerUnitTestResult`, `HandlerCdsUnitTestResult` and `HandlerGet` of a
 * `UNIT_TEST` / `CDS_UNIT_TEST` run each send the one `GET
 * /sap/bc/adt/abapunit/results/{run_id}` — no status read first, no timer —
 * held open, answered with a document and answered `404` alike, and answer
 * the result as SAP gave it, a run that has not finished included.
 *
 * Real adt-clients code runs over the batch proof's counting connection.
 */

import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { corpusBody } from '../../../src/__tests__/helpers/adtCorpus';
import { assertNoProperty } from '../../../src/__tests__/helpers/assertions';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import {
  TOOL_DEFINITION as CDS_RESULT_TOOL,
  handleHandlerCdsUnitTestResult,
} from '../handlers/handleHandlerCdsUnitTestResult';
import { handleHandlerGet } from '../handlers/handleHandlerGet';
import {
  handleHandlerUnitTestResult,
  TOOL_DEFINITION as RESULT_TOOL,
} from '../handlers/handleHandlerUnitTestResult';

// The process declares its system type, as every launcher requires: the
// type argument is checked against the declared variant's projection.
process.env.SAP_SYSTEM_TYPE = 'onprem';

const silent = { debug() {}, info() {}, warn() {}, error() {} };

async function settle(): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

type Run = { sent: string[]; answer?: Answer };

async function runWith(
  handler: (context: HandlerContext, args: never) => unknown,
  mode: Mode,
  args: Record<string, unknown>,
  body?: string,
): Promise<Run> {
  const counting = countingConnection(mode, body);
  const context = {
    connection: counting.connection,
    logger: silent,
  } as unknown as HandlerContext;
  const pending = Promise.resolve(
    handler(context, structuredClone(args) as never),
  ) as Promise<Answer>;
  if (mode === 'pending') {
    pending.catch(() => undefined);
    await settle();
    return { sent: [...counting.sent] };
  }
  const answer = await pending.catch((thrown: unknown) => ({
    isError: true,
    content: [{ text: String(thrown) }],
  }));
  return { sent: counting.sent, answer };
}

const textOf = (answer?: Answer) => answer?.content?.[0]?.text ?? '';
const jsonOf = (answer?: Answer) =>
  JSON.parse(textOf(answer)) as Record<string, unknown>;

const MODES: Mode[] = ['pending', 'document', 'not-found'];

const RESULT_GET = 'GET /sap/bc/adt/abapunit/results/RUN_A';
const FINISHED_RESULT = corpusBody(
  'unittest-run-passing--03-results-fa53c505dd7b1fd1abb8599833a05d44',
);
/** A run's result before it finished: no test method has an executionTime yet. */
const UNFINISHED_RESULT =
  '<?xml version="1.0" encoding="utf-8"?><aunit:runResult xmlns:aunit="http://www.sap.com/adt/aunit"/>';

/** Every compact call that reads a unit-test run's result. */
const RESULT_CALLS: Array<
  [
    string,
    (context: HandlerContext, args: never) => unknown,
    Record<string, unknown>,
    string,
  ]
> = [
  [
    'HandlerUnitTestResult',
    handleHandlerUnitTestResult as never,
    { run_id: 'RUN_A' },
    'read unit test result',
  ],
  [
    'HandlerCdsUnitTestResult',
    handleHandlerCdsUnitTestResult as never,
    { run_id: 'RUN_A' },
    'read CDS unit test result',
  ],
  [
    'HandlerGet UNIT_TEST',
    handleHandlerGet as never,
    { object_type: 'UNIT_TEST', run_id: 'RUN_A' },
    'read unit test result',
  ],
  [
    'HandlerGet CDS_UNIT_TEST',
    handleHandlerGet as never,
    { object_type: 'CDS_UNIT_TEST', run_id: 'RUN_A' },
    'read CDS unit test result',
  ],
  [
    'HandlerGet UNIT_TEST part source',
    handleHandlerGet as never,
    { object_type: 'UNIT_TEST', part: 'source', run_id: 'RUN_A' },
    'read unit test result',
  ],
];

describe('compact unit-test results are read once', () => {
  for (const [_label, handler, args, step] of RESULT_CALLS) {
    describe(format('%s', _label), () => {
      it('exactly one request, getResult — no status poll', async (t) => {
        const timer = t.mock.method(global, 'setTimeout');
        try {
          const [held, documented, refused] = await Promise.all(
            MODES.map((mode) => runWith(handler, mode, args, FINISHED_RESULT)),
          );
          assert.deepStrictEqual(held.sent, [RESULT_GET]);
          assert.deepStrictEqual(documented.sent, held.sent);
          assert.deepStrictEqual(refused.sent, held.sent);
          for (const run of [held, documented, refused]) {
            assert.equal(
              run.sent.some((line) => line.includes('/abapunit/runs')),
              false,
            );
          }
          assert.equal(timer.mock.callCount(), 0);

          assert.notEqual(documented.answer?.isError, true);
          const answered = jsonOf(documented.answer);
          assert.equal(answered.run_id, 'RUN_A');
          assertNoProperty(answered, 'finished');
          assert.ok(
            JSON.stringify(answered.run_result).includes('executionTime'),
          );

          assert.equal(refused.answer?.isError, true);
          assert.equal(jsonOf(refused.answer).status, 404);
          assert.equal(jsonOf(refused.answer).step, step);
        } finally {
          timer.mock.restore();
        }
      });

      it("an unfinished run's result is answered as it came", async () => {
        const { sent, answer } = await runWith(
          handler,
          'document',
          args,
          UNFINISHED_RESULT,
        );
        assert.deepStrictEqual(sent, [RESULT_GET]);
        assert.notEqual(answer?.isError, true);
        const answered = jsonOf(answer);
        assert.equal(answered.run_id, 'RUN_A');
        assert.ok('run_result' in Object(answered));
        assertNoProperty(answered, 'finished');
        assertNoProperty(answered, 'run_status');
        assert.ok(
          !JSON.stringify(answered.run_result).includes('executionTime'),
        );

        const raw = await runWith(
          handler,
          'document',
          { ...args, detail: 'raw' },
          UNFINISHED_RESULT,
        );
        assert.deepStrictEqual(raw.sent, [RESULT_GET]);
        // raw is what ADT sent: the one result document, nothing around it.
        assert.equal(raw.answer?.content?.[0]?.text, UNFINISHED_RESULT);
      });
    });
  }

  it('a missing run_id is refused before any request', async () => {
    for (const [, handler, args] of RESULT_CALLS) {
      const { run_id: _omitted, ...rest } = args;
      const { sent, answer } = await runWith(handler, 'document', rest);
      assert.deepStrictEqual(sent, []);
      assert.equal(answer?.isError, true);
    }
  });

  it('the description states the read of the result by its id', () => {
    for (const tool of [RESULT_TOOL, CDS_RESULT_TOOL]) {
      assert.ok(tool.description.includes('Reads the result of'));
      assert.ok(tool.description.includes('by its id'));
    }
  });
});
