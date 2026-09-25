/**
 * CheckBehaviorDefinition Handler - Syntax check for ABAP Behavior Definition
 *
 * Uses AdtClient.getBehaviorDefinition().check from @mcp-abap-adt/adt-clients 19.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckBdefLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP behavior definition. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., Z_MY_PROGRAM).',
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
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check — it goes into the checkrun body as chkrun:version, as ADT sends it. Omitted, the inactive one is checked; an object that is only active has none, and SAP answers such a check with a finding against an empty source (e.g. G46 "REPORT/PROGRAM statement is missing") or "Inactive version … does not exist" — ask for active.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['name'],
  },
} as const;

interface CheckBehaviorDefinitionArgs {
  name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckBehaviorDefinition(
  context: HandlerContext,
  args: CheckBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const { name, session_id, session_state } = args;

  if (!name) {
    return return_error(new Error('name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const bdefName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckBdefLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, which is what a caller wants right after a write.
        .check({ name: bdefName }, args.version, { analyse: analyseException }),
    project(detail, terseCheck),
  );
}
