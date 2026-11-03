import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_FIELD,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import {
  READ_VERSION_FIELD,
  type ReadVersion,
} from '../../../lib/handlers/readVersion';
import { readServiceDefinitionMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the service definition named by service_definition_name in one request: its source code (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), at the version asked. Returns the part read.',
  inputSchema: z.object({
    service_definition_name: z.string().describe('ServiceDefinition name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
  }),
} as const;

interface GetServiceDefinitionArgs {
  service_definition_name: string;
  part?: ReadPart;
  version?: ReadVersion;
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
  const client = createAdtClient(connection, logger);
  const obj = client.getServiceDefinition(
    resultsFor(serviceDefinitionDocuments),
  );

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetServiceDefinition', detail: 'terse' },
      () =>
        readServiceDefinitionMetadata(
          client,
          { serviceDefinitionName },
          version,
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
      part,
      source: source.raw,
    }),
  );
}
