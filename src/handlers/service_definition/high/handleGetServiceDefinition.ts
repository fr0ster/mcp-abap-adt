import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read an ABAP service definition in one request: its source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      service_definition_name: {
        type: 'string',
        description: 'ServiceDefinition name.',
      },
      part: READ_PART_PROPERTY,
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version of the source: "active" (default) for the deployed version, "inactive" for the modified, not yet activated version.',
        default: 'active',
      },
    },
    required: ['service_definition_name'],
  },
} as const;

interface GetServiceDefinitionArgs {
  service_definition_name: string;
  part?: ReadPart;
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
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  const serviceDefinitionName = service_definition_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getServiceDefinition(
    resultsFor(serviceDefinitionDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetServiceDefinition', detail: 'terse' },
      () =>
        obj.readMetadata(
          { serviceDefinitionName },
          { analyse: analyseException },
        ),
      (metadata: AdtReading<string>) => ({
        success: true,
        service_definition_name: serviceDefinitionName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
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
