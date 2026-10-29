/**
 * ActivateProgramLow Handler - Activate ABAP Program
 *
 * Uses AdtClient.getProgram().activate from @mcp-abap-adt/adt-clients 19.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createOnPremAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { isCloudConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateProgramLow',
  available_in: ['onprem'] as const,
  description:
    '[low-level] Activate an ABAP program. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['program_name'],
  },
} as const;

interface ActivateProgramArgs {
  program_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateProgram(
  context: HandlerContext,
  args: ActivateProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name } = args;

  if (!program_name) {
    return return_error(new Error('program_name is required'));
  }

  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  const programName = program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateProgramLow', detail },
    () =>
      withAdtHeaders(context, 'program.activate', (headers) =>
        createOnPremAdtClient(connection, logger)
          .getProgram(resultsFor(programDocuments))
          .activate({ programName }, { headers, analyse: analyseActivation }),
      ),
    project(detail, terseActivation),
  );
}
