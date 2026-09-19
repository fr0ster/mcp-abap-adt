/**
 * DeleteProgramLow Handler - Delete ABAP Program
 *
 * Uses AdtClient.getProgram().delete from @mcp-abap-adt/adt-clients 19.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { isCloudConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteProgramLow',
  available_in: ['onprem'] as const,
  description:
    '[low-level] Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name (e.g., Z_MY_PROGRAM).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['program_name'],
  },
} as const;

interface DeleteProgramArgs {
  program_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteProgram(
  context: HandlerContext,
  args: DeleteProgramArgs,
) {
  const { connection, logger } = context;
  const { program_name, transport_request } = args;

  if (!program_name) {
    return return_error(new Error('program_name is required'));
  }

  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  const programName = program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteProgramLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getProgram(resultsFor(programDocuments))
        .delete(
          { programName, transportRequest: transport_request },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
