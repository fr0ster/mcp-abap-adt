/**
 * ActivateServiceDefinition Handler - Activate ABAP Service Definition
 *
 * Uses AdtClient.getServiceDefinition().activate from @mcp-abap-adt/adt-clients 19.
 */

import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateServiceDefinitionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP service definition. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Service definition name.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name'],
  },
} as const;

interface ActivateServiceDefinitionArgs {
  name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateServiceDefinition(
  context: HandlerContext,
  args: ActivateServiceDefinitionArgs,
) {
  const { connection, logger } = context;
  const { name } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  const serviceDefinitionName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateServiceDefinitionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getServiceDefinition(resultsFor(serviceDefinitionDocuments))
        .activate({ serviceDefinitionName }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
