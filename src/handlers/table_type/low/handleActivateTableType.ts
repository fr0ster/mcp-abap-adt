import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateTableTypeLow Handler - Activate an ABAP Table Type
 *
 * As `ActivateDomainLow`: one stateless activation POST. Registered as
 * `ActivateTableType`.
 */

import { tableTypeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateTableTypeLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP table type. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    table_type_name: z.string().describe('Table type name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface ActivateTableTypeArgs {
  table_type_name?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateTableType(
  context: HandlerContext,
  args: ActivateTableTypeArgs,
) {
  const { connection, logger } = context;

  if (!args.table_type_name) {
    return return_error(new Error('table_type_name is required'));
  }

  const tableTypeName = args.table_type_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateTableTypeLow', detail },
    () =>
      withAdtHeaders(context, 'tableType.activate', (headers) =>
        createAdtClient(connection, logger)
          .getTableType(resultsFor(tableTypeDocuments))
          .activate({ tableTypeName }, { headers, analyse: analyseActivation }),
      ),
    project(detail, terseActivation),
  );
}
