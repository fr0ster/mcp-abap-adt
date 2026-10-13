/**
 * ActivateTableLow Handler - Activate ABAP Table
 *
 * Uses AdtClient.getTable().activate from @mcp-abap-adt/adt-clients 19.
 */

import { tableDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateTableLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP table. Returns activation status and any warnings/errors. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name.',
      },
      session_id: {
        type: 'string',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
      },
      session_state: {
        type: 'object',
        description:
          "Accepted and ignored: every call runs in the instance's own session.",
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
      ...DETAIL_PROPERTY,
    },
    required: ['table_name'],
  },
} as const;

interface ActivateTableArgs {
  table_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateTable(
  context: HandlerContext,
  args: ActivateTableArgs,
) {
  const { connection, logger } = context;
  const { table_name } = args;

  if (!table_name) {
    return return_error(new Error('table_name is required'));
  }

  const tableName = table_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateTableLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getTable(resultsFor(tableDocuments))
        .activate({ tableName }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
