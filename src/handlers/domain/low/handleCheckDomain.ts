/**
 * CheckDomain Handler - Syntax check for ABAP Domain
 *
 * Uses AdtClient.getDomain().check from @mcp-abap-adt/adt-clients 19.
 */

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckDomainLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name (e.g., Z_MY_PROGRAM).',
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
    required: ['domain_name'],
  },
} as const;

interface CheckDomainArgs {
  domain_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckDomain(
  context: HandlerContext,
  args: CheckDomainArgs,
) {
  const { connection, logger } = context;
  const { domain_name, session_id, session_state } = args;

  if (!domain_name) {
    return return_error(new Error('domain_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const domainName = domain_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckDomainLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDomain(resultsFor(domainDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, which is what a caller wants right after a write.
        .check({ domainName }, undefined, { analyse: analyseException }),
    project(detail, terseCheck),
  );
}
