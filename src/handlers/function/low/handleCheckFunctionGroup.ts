/**
 * CheckFunctionGroupLow Handler - Syntax check for ABAP Function Group
 *
 * Uses AdtClient.getFunctionGroup().check from @mcp-abap-adt/adt-clients 19.
 *
 * The shipped `check(config, status, options)` reads `status === 'active' ?
 * 'active' : 'inactive'`, so the handler names the version itself: active
 * unless `version` is `inactive` (#181). Verified against
 * `AdtFunctionGroup.js`.
 */

import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'CheckFunctionGroupLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'FunctionGroup name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['function_group_name'],
  },
} as const;

interface CheckFunctionGroupArgs {
  function_group_name: string;
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckFunctionGroup(
  context: HandlerContext,
  args: CheckFunctionGroupArgs,
) {
  const { connection, logger } = context;
  const { function_group_name } = args;

  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  const functionGroupName = function_group_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckFunctionGroupLow', detail },
    () =>
      withAdtHeaders(context, 'functionGroup.check', (headers) =>
        createAdtClient(connection, logger)
          .getFunctionGroup(resultsFor(functionGroupDocuments))
          .check(
            { functionGroupName },
            args.version === 'inactive' ? 'inactive' : 'active',
            {
              headers,
              analyse: analyseException,
            },
          ),
      ),
    project(detail, terseCheck),
  );
}
