import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP service definition definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      service_definition_name: {
        type: 'string',
        description: 'ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['service_definition_name'],
  },
} as const;

interface GetServiceDefinitionArgs {
  service_definition_name: string;
  version?: 'active' | 'inactive';
}

export async function handleGetServiceDefinition(
  context: HandlerContext,
  args: GetServiceDefinitionArgs,
) {
  const { connection, logger } = context;
  const { service_definition_name, version = 'active' } = args;
  if (!service_definition_name)
    return return_error(new Error('service_definition_name is required'));

  const serviceDefinitionName = service_definition_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getServiceDefinition(
    resultsFor(serviceDefinitionDocuments),
  );

  // GetServiceDefinition has only ever answered the source, not the
  // metadata — one call, unlike ReadServiceDefinition's pair.
  return answer(
    { tool: 'GetServiceDefinition', detail: 'terse' },
    () =>
      obj.read({ serviceDefinitionName }, version, {
        analyse: analyseException,
      }),
    (source: AdtReading<string>) => ({
      success: true,
      service_definition_name: serviceDefinitionName,
      version,
      service_definition_data: source.raw,
    }),
  );
}
