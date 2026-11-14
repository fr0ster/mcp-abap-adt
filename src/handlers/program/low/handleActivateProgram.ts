import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
import { detailOf } from '../../../lib/strategies/detail';
import { projectActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateProgramLow',
  available_in: ['onprem'] as const,
  description:
    '[low-level] Activate an ABAP program. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    program_name: z.string().describe('Program name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type ActivateProgramArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleActivateProgram(
  context: HandlerContext,
  args: ActivateProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name } = args;

  if (!program_name) {
    return return_error(new Error('program_name is required'));
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
    projectActivation(detail),
  );
}
