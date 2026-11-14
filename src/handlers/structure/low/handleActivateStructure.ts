import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateStructureLow Handler - Activate ABAP Structure
 *
 * Uses AdtClient.getStructure().activate from @mcp-abap-adt/adt-clients 19.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'ActivateStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP structure. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    structure_name: z.string().describe('Structure name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type ActivateStructureArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleActivateStructure(
  context: HandlerContext,
  args: ActivateStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name } = args;

  if (!structure_name) {
    return return_error(new Error('structure_name is required'));
  }

  const structureName = structure_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateStructureLow', detail },
    () =>
      withAdtHeaders(context, 'structure.activate', (headers) =>
        createAdtClient(connection, logger)
          .getStructure(resultsFor(structureDocuments))
          .activate({ structureName }, { headers, analyse: analyseActivation }),
      ),
    projectActivation(detail),
  );
}
