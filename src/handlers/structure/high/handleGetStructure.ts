import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetStructure',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve ABAP structure definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name (e.g., Z_MY_STRUCTURE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['structure_name'],
  },
} as const;

interface GetStructureArgs {
  structure_name: string;
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

  const structureName = structure_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getStructure(
    resultsFor(structureDocuments),
  );

  // GetStructure has only ever answered the source, not the metadata — one
  // call, unlike ReadStructure's pair.
  return answer(
    { tool: 'GetStructure', detail: 'terse' },
    () => obj.read({ structureName }, version, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      structure_name: structureName,
      version,
      structure_data: source.raw,
    }),
  );
}
