/**
 * CheckBehaviorDefinition Handler - Syntax check for ABAP Behavior Definition
 *
 * Uses AdtClient.getBehaviorDefinition().check from @mcp-abap-adt/adt-clients 19.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
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
  name: 'CheckBdefLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP behavior definition. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'BehaviorDefinition name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name'],
  },
} as const;

interface CheckBehaviorDefinitionArgs {
  name: string;
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckBehaviorDefinition(
  context: HandlerContext,
  args: CheckBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { name } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  const bdefName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckBdefLow', detail },
    () =>
      withAdtHeaders(context, 'behaviorDefinition.check', (headers) =>
        createAdtClient(connection, logger)
          .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
          .check(
            { name: bdefName },
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
