import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CheckTableTypeLow Handler - Check an ABAP Table Type
 *
 * As `CheckDomainLow`: one stateless check POST. The high tier delegates
 * here and normalises the answer.
 */

import { tableTypeDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { checkTool, purpose } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckTableTypeLow',
  available_in: ['onprem', 'cloud'] as const,
  description: checkTool({
    tag: 'low-level',
    purpose: purpose('Checks an ABAP table type for errors and warnings.'),
  }),
  inputSchema: z.object({
    table_type_name: z.string().describe('Table type name.'),
    version: z
      .enum(['active', 'inactive'])
      .optional()
      .describe(
        'Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
type CheckTableTypeArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCheckTableType(
  context: HandlerContext,
  args: CheckTableTypeArgs,
) {
  const { connection, logger } = context;

  if (!args.table_type_name) {
    return return_error(new Error('table_type_name is required'));
  }

  const tableTypeName = args.table_type_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckTableTypeLow', detail },
    () =>
      withAdtHeaders(context, 'tableType.check', (headers) =>
        createAdtClient(connection, logger)
          .getTableType(resultsFor(tableTypeDocuments))
          .check(
            { tableTypeName },
            args.version === 'inactive' ? 'inactive' : 'active',
            { headers, analyse: analyseException },
          ),
      ),
    project(detail, terseCheck),
  );
}
