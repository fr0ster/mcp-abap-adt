import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, type Terse } from '../../../lib/strategies/projections';
import { ourUnitTest } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { runIsFinished, runProgressStatus } from '../shared/pollRun';

export const TOOL_DEFINITION = {
  name: 'GetCdsUnitTestStatus',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve CDS unit test run status for a run_id. ' +
    'Refused outright on legacy systems (BASIS < 7.50): AdtClientLegacy.getCdsUnitTest() throws — the CDS framework endpoints this needs are not present there (issue #207).',
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

interface GetCdsUnitTestStatusArgs {
  run_id: string;
  with_long_polling?: boolean;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetCdsUnitTestStatus(
  context: HandlerContext,
  args: GetCdsUnitTestStatusArgs,
) {
  const { connection, logger } = context;
  const { run_id, with_long_polling = true } = args;
  if (!run_id) return return_error(new Error('run_id is required'));

  // `AdtCdsUnitTest extends AdtUnitTest` and inherits `getStatus` unchanged
  // — same v18-convenience departure as `GetUnitTestStatus`, and the same
  // `analyseException` in its options since adt-clients 23.
  const cdsUnitTest = createAdtClient(connection, logger).getCdsUnitTest(
    ourUnitTest,
  );
  const detail = detailOf(args);

  // Task 28 fix round 1 — same finding, same fix as `GetUnitTestStatus`:
  // `getStatus`'s result is `structured` (a real `AdtReading`), and `detail`
  // was missing while the projection always answered the whole parse.
  const terseRunStatus: Terse<unknown> = (value) => ({
    run_id,
    finished: runIsFinished(value),
    run_status: runProgressStatus(value),
  });

  return answer(
    { tool: 'GetCdsUnitTestStatus', detail },
    () =>
      cdsUnitTest.getStatus(run_id, with_long_polling, {
        analyse: analyseException,
      }),
    project(detail, terseRunStatus),
  );
}
