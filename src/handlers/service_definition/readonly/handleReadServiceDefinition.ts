import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: ServiceDefinition. Will be useful for reading, creating, or updating service definition. [read-only] Read ABAP service definition (SRVD) source code and metadata. Answers: "show service definition", "display SRVD source", "view service definition X", "get service exposure". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      service_definition_name: {
        type: 'string',
        description: 'Service definition name (e.g., Z_MY_SRVD).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['service_definition_name'],
  },
} as const;

export async function handleReadServiceDefinition(
  context: HandlerContext,
  args: {
    service_definition_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  const { service_definition_name, version = 'active' } = args;
  if (!service_definition_name)
    return return_error(new Error('service_definition_name is required'));

  const serviceDefinitionName = service_definition_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getServiceDefinition(
    resultsFor(serviceDefinitionDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadServiceDefinition', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.read({ serviceDefinitionName }, version, {
            analyse: analyseException,
          }),
        () =>
          obj.readMetadata(
            { serviceDefinitionName },
            { analyse: analyseException },
          ),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      service_definition_name: serviceDefinitionName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
