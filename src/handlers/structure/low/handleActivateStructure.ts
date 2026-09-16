/**
 * ActivateStructureLow Handler - Activate ABAP Structure
 *
 * Uses AdtClient.getStructure().activate from @mcp-abap-adt/adt-clients 19.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Activate, Create, Update. Subject: Structure. Will be useful for activating, creating, or updating a structure. [low-level] Activate an ABAP structure. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description: 'Structure name (e.g., ZST_MY_STRUCT).',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['structure_name'],
  },
} as const;

interface ActivateStructureArgs {
  structure_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateStructure(
  context: HandlerContext,
  args: ActivateStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name, session_id, session_state } = args;

  if (!structure_name) {
    return return_error(new Error('structure_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const structureName = structure_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateStructureLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getStructure(resultsFor(structureDocuments))
        .activate({ structureName }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
