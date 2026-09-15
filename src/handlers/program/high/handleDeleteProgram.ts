/**
 * DeleteProgram Handler - Delete ABAP Program via ADT deletion API
 *
 * Uses AdtClient.getProgram().delete from @mcp-abap-adt/adt-clients 19. See
 * `handleDeleteDomain.ts` for the shape and the masking this follows: a
 * refusal answers 200, `analyseDeletion` reads it rather than the status,
 * and no lock is taken because a held lock is what makes ADT refuse.
 */

import { programDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteProgram',
  available_in: ['onprem', 'legacy'] as const,
  description:
    'Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
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

  const programName = program_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteProgram', detail },
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
