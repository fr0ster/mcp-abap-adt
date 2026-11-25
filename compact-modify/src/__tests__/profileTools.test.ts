/**
 * Compact profiling in two tools (spec §4.6, the owner's rule: compact is
 * one ADT request per tool call; the consumer chains and polls).
 *
 * - `HandlerProfileSchedule` is the one `POST
 *   /sap/bc/adt/runtime/traces/abaptraces/parameters`, answered
 *   `{ success, profiler_id }`: the id SAP gave in `Location`.
 * - `HandlerProfileRun` is the one run of a class or a program: under that
 *   `profiler_id` when given (optional), plain when absent. No feed snapshot,
 *   no schedule, no trace search, no timer.
 *
 * Real adt-clients code runs over the batch proof's counting connection, held
 * open, answered with a document and answered `404` alike.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { assertNoProperty } from '../../../src/__tests__/helpers/assertions';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import { declaredRequired } from '../../../src/__tests__/helpers/listedJson';
import { SCHEDULE_WITHOUT_ID } from '../../../src/handlers/system/high/handleRuntimeCreateProfilerTraceParameters';
import {
  handleHandlerProfileRun,
  TOOL_DEFINITION as runTool,
} from '../handlers/handleHandlerProfileRun';
import {
  handleHandlerProfileSchedule,
  TOOL_DEFINITION as scheduleTool,
} from '../handlers/handleHandlerProfileSchedule';

// The process declares its system type, as every launcher requires: the ADT
// client is the declared variant's (`variantOf`), never a default.
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
  headers?: Record<string, string>,
): Promise<Run> {
  const counting = countingConnection(mode, undefined, headers);
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

const PROFILER_ID =
  '/sap/bc/adt/runtime/traces/abaptraces/parameters/PROFILER_PLACEHOLDER';
const SCHEDULED = { location: PROFILER_ID };
const SCHEDULE_POST = 'POST /sap/bc/adt/runtime/traces/abaptraces/parameters';
const ENCODED = encodeURIComponent(PROFILER_ID);

const schedule = (
  mode: Mode,
  args: Record<string, unknown>,
  headers?: Record<string, string>,
) => runWith(handleHandlerProfileSchedule as never, mode, args, headers);
const run = (mode: Mode, args: Record<string, unknown>) =>
  runWith(handleHandlerProfileRun as never, mode, args);

/**
 * The runs: the arguments under a profiler, the one request each sends, its
 * answer's name key, the one request of the plain run and its step.
 */
const RUN_CALLS: Array<
  [string, Record<string, unknown>, string, string, string, string]
> = [
  [
    'CLASS',
    { target_type: 'CLASS', class_name: 'clas_a', profiler_id: PROFILER_ID },
    `POST /sap/bc/adt/oo/classrun/CLAS_A?profilerId=${ENCODED}`,
    'class_name',
    'POST /sap/bc/adt/oo/classrun/CLAS_A',
    'run class',
  ],
  [
    'PROGRAM',
    {
      target_type: 'PROGRAM',
      program_name: 'prog_a',
      profiler_id: PROFILER_ID,
    },
    `POST /sap/bc/adt/programs/programrun/PROG_A?profilerId=${ENCODED}`,
    'program_name',
    'POST /sap/bc/adt/programs/programrun/PROG_A',
    'run program',
  ],
];

describe('compact HandlerProfileSchedule', () => {
  it('HandlerProfileSchedule: exactly one request, answers profilerId', async () => {
    const args = { description: 'trace', sql_trace: true };
    const [held, documented, refused] = await Promise.all(
      MODES.map((mode) => schedule(mode, args, SCHEDULED)),
    );
    assert.deepStrictEqual(held.sent, [SCHEDULE_POST]);
    assert.deepStrictEqual(documented.sent, held.sent);
    assert.deepStrictEqual(refused.sent, held.sent);

    assert.notEqual(documented.answer?.isError, true);
    assert.deepStrictEqual(jsonOf(documented.answer), {
      success: true,
      profiler_id: PROFILER_ID,
    });

    assert.equal(refused.answer?.isError, true);
    assert.equal(jsonOf(refused.answer).status, 404);
    assert.equal(jsonOf(refused.answer).step, 'schedule trace');
  });

  it('takes no argument it needs: an empty call is the one request', async () => {
    const { sent, answer } = await schedule('document', {}, SCHEDULED);
    assert.deepStrictEqual(sent, [SCHEDULE_POST]);
    assert.equal(jsonOf(answer).profiler_id, PROFILER_ID);
  });

  it('a 2xx without Location is a failure with its step, one request', async () => {
    const { sent, answer } = await schedule('document', {});
    assert.deepStrictEqual(sent, [SCHEDULE_POST]);
    assert.equal(answer?.isError, true);
    const failed = jsonOf(answer);
    assert.equal(failed.message, SCHEDULE_WITHOUT_ID);
    assert.equal(failed.step, 'schedule trace');
    assertNoProperty(failed, 'profiler_id');
  });
});

describe('compact HandlerProfileRun', () => {
  for (const [
    _label,
    args,
    request,
    nameKey,
    plainRequest,
    plainStep,
  ] of RUN_CALLS) {
    describe(format('%s', _label), () => {
      it('HandlerProfileRun with profilerId: exactly one request', async () => {
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => run(mode, args)),
        );
        assert.deepStrictEqual(held.sent, [request]);
        assert.deepStrictEqual(documented.sent, held.sent);
        assert.deepStrictEqual(refused.sent, held.sent);

        assert.notEqual(documented.answer?.isError, true);
        const answered = jsonOf(documented.answer);
        assert.equal(answered.success, true);
        assert.equal(answered[nameKey], String(args[nameKey]).toUpperCase());
        assert.deepStrictEqual(answered.profile, { profiler_id: PROFILER_ID });

        assert.equal(refused.answer?.isError, true);
        assert.equal(jsonOf(refused.answer).status, 404);
        assert.equal(jsonOf(refused.answer).step, 'run with profiler');
      });

      it('HandlerProfileRun without profilerId: exactly one plain run request', async () => {
        const { profiler_id: _absent, ...plain } = args;
        const [held, documented, refused] = await Promise.all(
          MODES.map((mode) => run(mode, plain)),
        );
        assert.deepStrictEqual(held.sent, [plainRequest]);
        assert.deepStrictEqual(documented.sent, held.sent);
        assert.deepStrictEqual(refused.sent, held.sent);

        assert.notEqual(documented.answer?.isError, true);
        const answered = jsonOf(documented.answer);
        assert.equal(answered.success, true);
        assert.equal(answered[nameKey], String(args[nameKey]).toUpperCase());
        assertNoProperty(answered, 'profile');

        assert.equal(refused.answer?.isError, true);
        assert.equal(jsonOf(refused.answer).status, 404);
        assert.equal(jsonOf(refused.answer).step, plainStep);
      });

      it('HandlerProfileRun with an empty profilerId refused before any request', async () => {
        const { sent, answer } = await run('document', {
          ...args,
          profiler_id: '',
        });
        assert.deepStrictEqual(sent, []);
        assert.equal(answer?.isError, true);
        assert.ok(textOf(answer).includes('profiler_id'));
      });

      it('no trace-list poll', async (t) => {
        const timer = t.mock.method(global, 'setTimeout');
        try {
          const { sent } = await run('document', args);
          assert.deepStrictEqual(sent, [request]);
          assert.equal(
            sent.some((line) => line.includes('/runtime/traces/abaptraces')),
            false,
          );
          assert.equal(timer.mock.callCount(), 0);
        } finally {
          timer.mock.restore();
        }
      });
    });
  }

  it('declares profiler_id optional and the profiling flags on the schedule', () => {
    assert.deepStrictEqual(declaredRequired(runTool.inputSchema), [
      'target_type',
    ]);
    assert.ok(Object.keys(runTool.inputSchema.shape).includes('profiler_id'));
    assert.ok(!Object.keys(runTool.inputSchema.shape).includes('sql_trace'));
    assert.ok(
      Object.keys(scheduleTool.inputSchema.shape).includes('sql_trace'),
    );
  });
});
