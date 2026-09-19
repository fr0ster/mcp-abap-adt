import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadStructure',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read, Create, Update. Subject: Structure. Will be useful for reading, creating, or updating structure. [read-only] Read ABAP structure definition and metadata. Answers: "show structure fields", "display structure X", "view structure definition", "get structure components". Returns field list, package, responsible, description.',
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
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['structure_name'],
  },
} as const;

export async function handleReadStructure(
  context: HandlerContext,
  args: { structure_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  const { structure_name, version = 'active' } = args;
  if (!structure_name)
    return return_error(new Error('structure_name is required'));

  const structureName = structure_name.toUpperCase();
  const obj = createAdtClient(connection, logger).getStructure(
    resultsFor(structureDocuments),
  );

  // Two calls, so the order is ours — 19 removed the members that made several.
  // Each carries its own `analyse`: a refused read and a refused metadata read
  // are different failures, and whichever comes back is the one the caller
  // sees, built by the strategy rather than summarised here.
  return answer(
    { tool: 'ReadStructure', detail: 'terse' },
    () =>
      pair(
        () =>
          obj.read({ structureName }, version, {
            analyse: analyseException,
          }),
        () =>
          obj.readMetadata({ structureName }, { analyse: analyseException }),
      ),
    ([source, metadata]: [AdtReading<string>, AdtReading<string>]) => ({
      success: true,
      structure_name: structureName,
      version,
      source_code: source.raw,
      metadata: metadata.raw,
    }),
  );
}
