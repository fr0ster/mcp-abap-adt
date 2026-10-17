/**
 * Compact profiling in two tools (spec §4.6, the owner's rule: compact is
 * one ADT request per tool call; the consumer chains and polls).
 *
 * - `HandlerProfileSchedule` is the one `POST
 *   /sap/bc/adt/runtime/traces/abaptraces/parameters`, answered
 *   `{ success, profiler_id }`: the id SAP gave in `Location`.
 * - `HandlerProfileRun` is the one run of a class or a program with that
 *   `profiler_id` (required). No feed snapshot, no schedule, no trace search,
 *   no timer.
 *
 * Real adt-clients code runs over the batch proof's counting connection, held
 * open, answered with a document and answered `404` alike.
 */
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  type Answer,
  countingConnection,
  type Mode,
} from '../../../src/__tests__/helpers/batchHarness';
import { SCHEDULE_WITHOUT_ID } from '../../../src/handlers/system/readonly/handleRuntimeCreateProfilerTraceParameters';
import {
  handleHandlerProfileRun,
  TOOL_DEFINITION as runTool,
} from '../handlers/handleHandlerProfileRun';
import {
  handleHandlerProfileSchedule,
  TOOL_DEFINITION as scheduleTool,
} from '../handlers/handleHandlerProfileSchedule';

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

/** The runs, with the one request each sends and its answer's name key. */
const RUN_CALLS: Array<[string, Record<string, unknown>, string, string]> = [
  [
    'CLASS',
    { target_type: 'CLASS', class_name: 'clas_a', profiler_id: PROFILER_ID },
    `POST /sap/bc/adt/oo/classrun/CLAS_A?profilerId=${ENCODED}`,
    'class_name',
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
  ],
];

describe('compact HandlerProfileSchedule', () => {
  it('HandlerProfileSchedule: exactly one request, answers profilerId', async () => {
    const args = { description: 'trace', sql_trace: true };
    const [held, documented, refused] = await Promise.all(
      MODES.map((mode) => schedule(mode, args, SCHEDULED)),
    );
    expect(held.sent).toEqual([SCHEDULE_POST]);
    expect(documented.sent).toEqual(held.sent);
    expect(refused.sent).toEqual(held.sent);

    expect(documented.answer?.isError).not.toBe(true);
    expect(jsonOf(documented.answer)).toEqual({
      success: true,
      profiler_id: PROFILER_ID,
    });

    expect(refused.answer?.isError).toBe(true);
    expect(jsonOf(refused.answer).status).toBe(404);
    expect(jsonOf(refused.answer).step).toBe('schedule trace');
  });

  it('takes no argument it needs: an empty call is the one request', async () => {
    const { sent, answer } = await schedule('document', {}, SCHEDULED);
    expect(sent).toEqual([SCHEDULE_POST]);
    expect(jsonOf(answer).profiler_id).toBe(PROFILER_ID);
  });

  it('a 2xx without Location is a failure with its step, one request', async () => {
    const { sent, answer } = await schedule('document', {});
    expect(sent).toEqual([SCHEDULE_POST]);
    expect(answer?.isError).toBe(true);
    const failed = jsonOf(answer);
    expect(failed.message).toBe(SCHEDULE_WITHOUT_ID);
    expect(failed.step).toBe('schedule trace');
    expect(failed).not.toHaveProperty('profiler_id');
  });
});

describe('compact HandlerProfileRun', () => {
  describe.each(RUN_CALLS)('%s', (_label, args, request, nameKey) => {
    it('HandlerProfileRun with profilerId: exactly one request', async () => {
      const [held, documented, refused] = await Promise.all(
        MODES.map((mode) => run(mode, args)),
      );
      expect(held.sent).toEqual([request]);
      expect(documented.sent).toEqual(held.sent);
      expect(refused.sent).toEqual(held.sent);

      expect(documented.answer?.isError).not.toBe(true);
      const answered = jsonOf(documented.answer);
      expect(answered.success).toBe(true);
      expect(answered[nameKey]).toBe(String(args[nameKey]).toUpperCase());
      expect(answered.profile).toEqual({ profiler_id: PROFILER_ID });

      expect(refused.answer?.isError).toBe(true);
      expect(jsonOf(refused.answer).status).toBe(404);
      expect(jsonOf(refused.answer).step).toBe('run with profiler');
    });

    it('HandlerProfileRun without profilerId refused before any request', async () => {
      for (const profiler_id of [undefined, '']) {
        const { sent, answer } = await run('document', {
          ...args,
          profiler_id,
        });
        expect(sent).toEqual([]);
        expect(answer?.isError).toBe(true);
        expect(textOf(answer)).toContain('profiler_id');
      }
    });

    it('no trace-list poll', async () => {
      const timer = jest.spyOn(global, 'setTimeout');
      try {
        const { sent } = await run('document', args);
        expect(sent).toEqual([request]);
        expect(
          sent.some((line) => line.includes('/runtime/traces/abaptraces')),
        ).toBe(false);
        expect(timer).not.toHaveBeenCalled();
      } finally {
        timer.mockRestore();
      }
    });
  });

  it('declares profiler_id required and the profiling flags on the schedule', () => {
    expect([...runTool.inputSchema.required]).toEqual(
      expect.arrayContaining(['target_type', 'profiler_id']),
    );
    expect(Object.keys(runTool.inputSchema.properties)).not.toContain(
      'sql_trace',
    );
    expect(Object.keys(scheduleTool.inputSchema.properties)).toContain(
      'sql_trace',
    );
  });
});
