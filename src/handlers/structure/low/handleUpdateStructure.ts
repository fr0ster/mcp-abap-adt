/**
 * UpdateStructureLow Handler - Update ABAP Structure DDL Source
 *
 * Uses AdtClient.getStructure().update from @mcp-abap-adt/adt-clients 19.
 *
 * **The source goes through `options.sourceCode`.** `AdtStructure.update()`'s
 * shipped body does keep a fallback — `const source = options?.sourceCode ||
 * config.ddlCode` — but this handler writes through `options` only, the one
 * channel every sibling family in this cluster shares, and never puts a
 * source string on `config`. Verified against `AdtStructure.js`, not the
 * declaration file.
 */

import { structureDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Update DDL source code of an existing ABAP structure. Requires lock handle from LockObject. - use UpdateStructureSource for full workflow with lock/unlock.',
  inputSchema: {
    type: 'object',
    properties: {
      structure_name: {
        type: 'string',
        description:
          'Structure name (e.g., ZZ_S_TEST_001). Structure must already exist.',
      },
      ddl_code: {
        type: 'string',
        description: 'Complete DDL source code for the structure definition.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. Required for update operation.',
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
    required: ['structure_name', 'ddl_code', 'lock_handle'],
  },
} as const;

interface UpdateStructureArgs {
  structure_name: string;
  ddl_code: string;
  lock_handle: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateStructure(
  context: HandlerContext,
  args: UpdateStructureArgs,
) {
  const { connection, logger } = context;
  const { structure_name, ddl_code, lock_handle, session_id, session_state } =
    args;

  if (!structure_name || !ddl_code || !lock_handle) {
    return return_error(
      new Error('structure_name, ddl_code, and lock_handle are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const structureName = structure_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateStructureLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getStructure(resultsFor(structureDocuments))
        .update(
          { structureName },
          {
            sourceCode: ddl_code,
            lockHandle: lock_handle,
            analyse: analyseException,
          },
        ),
    project(detail, terseWrite),
  );
}
