import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import { readStructureMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetStructure',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the ABAP structure named by structure_name in one request: its definition with its fields, as source code (part "source", the default; active or inactive version) or its ADT metadata document (part "metadata": package, responsible, description). Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name.',
      },
      part: READ_PART_PROPERTY,
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version of the source: "active" (default) for the deployed version, "inactive" for the modified version awaiting activation.',
        default: 'active',
      },
    },
    required: ['structure_name'],
  },
} as const;

interface GetStructureArgs {
  structure_name: string;
  part?: ReadPart;
  version?: 'active' | 'inactive';
}

export async function handleGetStructure(
  context: HandlerContext,
  args: GetStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name, version = 'active' } = args;
  if (!structure_name)
    return return_error(new Error('structure_name is required'));
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  const structureName = structure_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const obj = client.getStructure(resultsFor(structureDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetStructure', detail: 'terse' },
      () => readStructureMetadata(client, { structureName }),
      (metadata: AdtReading<string>) => ({
        success: true,
        structure_name: structureName,
        part,
        metadata: metadata.raw,
      }),
    );
  }
  return answer(
    { tool: 'GetStructure', detail: 'terse' },
    () => obj.read({ structureName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      structure_name: structureName,
      version,
      part,
      source: source.raw,
    }),
  );
}
