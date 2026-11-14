import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_SHAPE, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { return_error } from '../../../lib/utils';
import type { XmlRead } from '../../../lib/xml/tree';
import { runIsFinished, runProgressStatus } from '../shared/pollRun';
import { testRunner } from '../shared/runTests';

export const TOOL_DEFINITION = {
  name: 'GetUnitTestStatus',
  available_in: ['onprem', 'cloud'] as const,
  description: '[read-only] Retrieve ABAP Unit test run status for a run_id.',
  inputSchema: z.object({
    run_id: z.string().describe('Run identifier returned by unit test run.'),
    with_long_polling: z
      .boolean()
      .default(true)
      .optional()
      .describe('Enable long polling while waiting for status.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type GetUnitTestStatusArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetUnitTestStatus(
  context: HandlerContext,
  args: GetUnitTestStatusArgs,
) {
  const { run_id, with_long_polling = true } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // The pre-migration handler called the v18 convenience `.read({runId})`,
  // which no longer exists on `AdtUnitTest` in v19 — that config shape is
  // `IUnitTestConfig` (`className`, not `runId`) and belongs to reading the
  // tests' source, not a run. Polling a run is `getStatus(runId,
  // withLongPolling?)`, which — confirmed against the shipped
  // `AdtUnitTest.d.ts` — takes NO options object at all, so there is no
  // `analyse` to hand it, unlike `read`/`readMetadata` on this same class.
  const unitTest = testRunner(context, 'class');
  const detail = detailOf(args);

  // Task 28 fix round 1: this member's result is `structured` in
  // `READING_BY_SLOT` — a real `AdtReading`, with `raw` (the
  // `aunit:run`/`aunit:progress` document ADT sent) genuinely distinct from
  // `value` (its parse). `detail` was missing entirely: the schema offered
  // no parameter and the projection always answered `status.value` — found
  // by enumerating every `answer()` call's own projection rather than only
  // calls to the shared `project()` helper, which this handler's own
  // hand-written, `AdtReading`-typed projection does not use.
  const terseRunStatus = (value: XmlRead) => ({
    run_id,
    finished: runIsFinished(value),
    run_status: runProgressStatus(value),
  });

  return answer(
    { tool: 'GetUnitTestStatus', detail },
    () =>
      unitTest.getStatus(run_id, with_long_polling, {
        analyse: analyseException,
      }),
    project(detail, terseRunStatus),
  );
}
