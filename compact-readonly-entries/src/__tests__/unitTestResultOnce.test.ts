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
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import { corpusBody } from '../../../src/lib/adtCorpus';
import {
  TOOL_DEFINITION as CDS_RESULT_TOOL,
  handleHandlerCdsUnitTestResult,
} from '../handlers/handleHandlerCdsUnitTestResult';
import {
  TOOL_DEFINITION as GET_TOOL,
  handleHandlerGet,
} from '../handlers/handleHandlerGet';
import {
  TOOL_DEFINITION as RESULT_TOOL,
  handleHandlerUnitTestResult,
} from '../handlers/handleHandlerUnitTestResult';

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
  ]
> = [
  [
    'HandlerUnitTestResult',
    handleHandlerUnitTestResult as never,
    { run_id: 'RUN_A' },
  ],
  [
    'HandlerCdsUnitTestResult',
    handleHandlerCdsUnitTestResult as never,
    { run_id: 'RUN_A' },
  ],
  [
    'HandlerGet UNIT_TEST',
    handleHandlerGet as never,
    { object_type: 'UNIT_TEST', run_id: 'RUN_A' },
  ],
  [
    'HandlerGet CDS_UNIT_TEST',
    handleHandlerGet as never,
    { object_type: 'CDS_UNIT_TEST', run_id: 'RUN_A' },
  ],
  [
    'HandlerGet UNIT_TEST part source',
    handleHandlerGet as never,
    { object_type: 'UNIT_TEST', part: 'source', run_id: 'RUN_A' },
  ],
];

const FINISHED_SENTENCE =
  "Valid once the status is FINISHED; a finished run's result carries executionTime.";

describe('compact unit-test results are read once', () => {
  describe.each(RESULT_CALLS)('%s', (_label, handler, args) => {
    it('exactly one request, getResult — no status poll', async () => {
      const timer = jest.spyOn(global, 'setTimeout');
      try {
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => runWith(handler, mode, args, FINISHED_RESULT)),
        );
        expect(held.sent).toEqual([RESULT_GET]);
        expect(documented.sent).toEqual(held.sent);
        expect(refused.sent).toEqual(held.sent);
        for (const run of [held, documented, refused]) {
          expect(run.sent.some((line) => line.includes('/abapunit/runs'))).toBe(
            false,
          );
        }
        expect(timer).not.toHaveBeenCalled();

        expect(documented.answer?.isError).not.toBe(true);
        const answered = jsonOf(documented.answer);
        expect(answered.run_id).toBe('RUN_A');
        expect(answered).not.toHaveProperty('finished');
        expect(JSON.stringify(answered.run_result)).toContain('executionTime');

        expect(refused.answer?.isError).toBe(true);
        expect(jsonOf(refused.answer).status).toBe(404);
      } finally {
        timer.mockRestore();
      }
    });

    it("an unfinished run's result is answered as it came", async () => {
      const { sent, answer } = await runWith(
        handler,
        'document',
        args,
        UNFINISHED_RESULT,
      );
      expect(sent).toEqual([RESULT_GET]);
      expect(answer?.isError).not.toBe(true);
      const answered = jsonOf(answer);
      expect(answered.run_id).toBe('RUN_A');
      expect(answered).toHaveProperty('run_result');
      expect(answered).not.toHaveProperty('finished');
      expect(answered).not.toHaveProperty('run_status');
      expect(JSON.stringify(answered.run_result)).not.toContain(
        'executionTime',
      );

      const raw = await runWith(
        handler,
        'document',
        { ...args, detail: 'raw' },
        UNFINISHED_RESULT,
      );
      expect(raw.sent).toEqual([RESULT_GET]);
      expect(jsonOf(raw.answer).run_result).toBe(UNFINISHED_RESULT);
    });
  });

  it('a missing run_id is refused before any request', async () => {
    for (const [, handler, args] of RESULT_CALLS) {
      const { run_id: _omitted, ...rest } = args;
      const { sent, answer } = await runWith(handler, 'document', rest);
      expect(sent).toEqual([]);
      expect(answer?.isError).toBe(true);
    }
  });

  it('the description carries the FINISHED sentence', () => {
    for (const tool of [RESULT_TOOL, CDS_RESULT_TOOL, GET_TOOL]) {
      expect(tool.description).toContain(FINISHED_SENTENCE);
    }
  });
});
