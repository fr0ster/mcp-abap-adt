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
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckTableTypeLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform a check on an ABAP table type. Returns errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      table_type_name: {
        type: 'string',
        description: 'Table type name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['table_type_name'],
  },
} as const;

/** What the caller sent: arguments from outside the type system, so a
 * required one may be absent and is refused below. */
interface CheckTableTypeArgs {
  table_type_name?: string;
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

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
