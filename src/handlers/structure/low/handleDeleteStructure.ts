/**
 * DeleteStructureLow Handler - Delete ABAP Structure
 *
 * Uses AdtClient.getStructure().delete from @mcp-abap-adt/adt-clients 19.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Delete a structure from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name (e.g., Z_MY_PROGRAM).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['structure_name'],
  },
} as const;

interface DeleteStructureArgs {
  structure_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteStructure(
  context: HandlerContext,
  args: DeleteStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name, transport_request } = args;

  if (!structure_name) {
    return return_error(new Error('structure_name is required'));
  }

  const structureName = structure_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteStructureLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getStructure(resultsFor(structureDocuments))
        .delete(
          { structureName, transportRequest: transport_request },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
