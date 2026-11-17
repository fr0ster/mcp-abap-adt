import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateTableLow Handler - Activate ABAP Table
 *
 * Uses AdtClient.getTable().activate from @mcp-abap-adt/adt-clients 19.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'ActivateTableLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP table. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    table_name: z.string().describe('Table name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

type ActivateTableArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleActivateTable(
  context: HandlerContext,
  args: ActivateTableArgs,
) {
  const { connection, logger } = context;
  const { table_name } = args;

  if (!table_name) {
    return return_error(new Error('table_name is required'));
  }

  const tableName = table_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateTableLow', detail },
    () =>
      withAdtHeaders(context, 'table.activate', (headers) =>
        createAdtClient(connection, logger)
          .getTable(resultsFor(tableDocuments))
          .activate({ tableName }, { headers, analyse: analyseActivation }),
      ),
    projectActivation(detail),
  );
}
