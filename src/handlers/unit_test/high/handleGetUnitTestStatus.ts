import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, type Terse } from '../../../lib/strategies/projections';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { runIsFinished, runProgressStatus } from '../shared/pollRun';

export const TOOL_DEFINITION = {
  name: 'GetUnitTestStatus',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Retrieve ABAP Unit test run status for a run_id. ' +
    'On legacy systems (BASIS < 7.50) this always refuses: a legacy run answers its result synchronously inside ' +
    'RunUnitTest/CreateUnitTest, but AdtClientLegacy.getUnitTest() returns a new instance every time it is ' +
    'called, even on the same client, so this tool always refuses (issue #208).',
  inputSchema: {
    type: 'object',
    properties: {
      run_id: {
        type: 'string',
        description: 'Run identifier returned by unit test run.',
      },
      with_long_polling: {
        type: 'boolean',
        description: 'Enable long polling while waiting for status.',
        default: true,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['run_id'],
  },
} as const;

interface GetUnitTestStatusArgs {
  run_id: string;
  with_long_polling?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetUnitTestStatus(
  context: HandlerContext,
  args: GetUnitTestStatusArgs,
) {
  const { connection, logger } = context;
  const { run_id, with_long_polling = true } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // The pre-migration handler called the v18 convenience `.read({runId})`,
  // which no longer exists on `AdtUnitTest` in v19 — that config shape is
  // `IUnitTestConfig` (`className`, not `runId`) and belongs to reading the
  // tests' source, not a run. Polling a run is `getStatus(runId,
  // withLongPolling?)`, which — confirmed against the shipped
  // `AdtUnitTest.d.ts` — takes NO options object at all, so there is no
  // `analyse` to hand it, unlike `read`/`readMetadata` on this same class.
  const unitTest = createAdtClient(connection, logger).getUnitTest(ourUnitTest);
  const detail = detailOf(args);

  // Task 28 fix round 1: this member's result is `structured` in
  // `READING_BY_SLOT` — a real `AdtReading`, with `raw` (the
  // `aunit:run`/`aunit:progress` document ADT sent) genuinely distinct from
  // `value` (its parse). `detail` was missing entirely: the schema offered
  // no parameter and the projection always answered `status.value` — found
  // by enumerating every `answer()` call's own projection rather than only
  // calls to the shared `project()` helper, which this handler's own
  // hand-written, `AdtReading`-typed projection does not use.
  const terseRunStatus: Terse<unknown> = (value) => ({
    run_id,
    finished: runIsFinished(value),
    run_status: runProgressStatus(value),
  });

  return answer(
    { tool: 'GetUnitTestStatus', detail },
    () => unitTest.getStatus(run_id, with_long_polling),
    project(detail, terseRunStatus),
  );
}
