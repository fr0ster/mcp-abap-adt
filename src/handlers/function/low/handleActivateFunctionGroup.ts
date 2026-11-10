import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateFunctionGroupLow Handler - Activate ABAP Function Group
 *
 * Uses AdtClient.getFunctionGroup().activate from @mcp-abap-adt/adt-clients 19.
 */

import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { projectActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateFunctionGroupLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP function group. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    function_group_name: z.string().describe('Function group name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

interface ActivateFunctionGroupArgs {
  function_group_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateFunctionGroup(
  context: HandlerContext,
  args: ActivateFunctionGroupArgs,
) {
  const { connection, logger } = context;
  const { function_group_name } = args;

  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateFunctionGroupLow', detail },
    () =>
      withAdtHeaders(context, 'functionGroup.activate', (headers) =>
        createAdtClient(connection, logger)
          .getFunctionGroup(resultsFor(functionGroupDocuments))
          .activate(
            { functionGroupName },
            { headers, analyse: analyseActivation },
          ),
      ),
    projectActivation(detail),
  );
}
