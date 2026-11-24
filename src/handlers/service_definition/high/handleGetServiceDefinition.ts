import { serviceDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { sourceReader, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { READ_PART_FIELD, readPartOf } from '../../../lib/handlers/readPart';
import { READ_VERSION_FIELD } from '../../../lib/handlers/readVersion';
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readServiceDefinitionMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    sourceReader({
      object: 'a service definition',
      metadata: true,
    }),
  ),
  inputSchema: z.object({
    service_definition_name: requiredText(
      'service_definition_name is required',
    ).describe('ServiceDefinition name.'),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetServiceDefinitionArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetServiceDefinition(
  context: HandlerContext,
  args: GetServiceDefinitionArgs,
) {
  const { connection, logger } = context;
  const { service_definition_name, version = 'active' } = args;
  const part = readPartOf(args.part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

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
  return answerSourceRead(
    { tool: 'GetServiceDefinition', detail: 'terse' },
    range,
    () =>
      obj.read({ serviceDefinitionName }, version, {
        analyse: analyseException,
      }),
    (source, cut) => ({
      success: true,
      service_definition_name: serviceDefinitionName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
