/**
 * ActivateBehaviorDefinition Handler - Activate ABAP Behavior Definition
 *
 * Uses AdtClient.getBehaviorDefinition().activate from @mcp-abap-adt/adt-clients 19.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateBehaviorDefinitionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP behavior definition. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Behavior definition name (root entity).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name'],
  },
} as const;

interface ActivateBehaviorDefinitionArgs {
  name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateBehaviorDefinition(
  context: HandlerContext,
  args: ActivateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { name } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  const bdefName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateBehaviorDefinitionLow', detail },
    () =>
      withAdtHeaders(context, 'behaviorDefinition.activate', (headers) =>
        createAdtClient(connection, logger)
          .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
          .activate(
            { name: bdefName },
            { headers, analyse: analyseActivation },
          ),
      ),
    project(detail, terseActivation),
  );
}
