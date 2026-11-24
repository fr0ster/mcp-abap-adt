import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { readerParts, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
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
import {
  answerSourceRead,
  rangeFields,
  SOURCE_RANGE_SHAPE,
  type SourceRangeArgs,
  sourceRangeOf,
} from '../../../lib/handlers/sourceRange';
import { readStructureMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetStructure',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    readerParts({
      object: 'an ABAP structure',
      holding:
        'its definition source, or its package, person responsible and description',
    }),
  ),
  inputSchema: z.object({
    structure_name: requiredText('structure_name is required').describe(
      'Structure name.',
    ),
    part: READ_PART_FIELD,
    version: READ_VERSION_FIELD,
    ...SOURCE_RANGE_SHAPE,
  }),
} as const;

type GetStructureArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetStructure(
  context: HandlerContext,
  args: GetStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name, version = 'active' } = args;
  const part = readPartOf(args.part);
  const range = sourceRangeOf(args, part);
  if (range instanceof Error) return return_error(range);

  const structureName = structure_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getStructure(resultsFor(structureDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetStructure', detail: 'terse' },
      () => readStructureMetadata(client, { structureName }, version),
      (metadata: AdtReading<string>) => ({
        success: true,
        structure_name: structureName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answerSourceRead(
    { tool: 'GetStructure', detail: 'terse' },
    range,
    () => obj.read({ structureName }, version, { analyse: analyseException }),
    (source, cut) => ({
      success: true,
      structure_name: structureName,
      version,
      part,
      source,
      ...rangeFields(cut),
    }),
  );
}
