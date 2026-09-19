/**
 * CheckDdlLow Handler - Syntax check for ABAP DDL Source
 *
 * Uses AdtClient.getDdl().check from @mcp-abap-adt/adt-clients 19.
 *
 * `ddl_source`, unlike most families in this migration, is not a dead
 * parameter: the shipped `AdtDdl.check()` passes `config.ddlSource` straight
 * into `checkDdl(connection, name, version, config.ddlSource)`, so a caller
 * validating unsaved code still reaches the server with it. Verified against
 * `AdtDdl.js`, not the declaration file.
 */

import { ddlDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckDdlLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP DDL source. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session. If ddl_source is provided, validates new/unsaved code (will be base64 encoded in request).',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_PROGRAM).',
      },
      ddl_source: {
        type: 'string',
        description:
          'Optional DDL source code to validate (for checking new/unsaved code). If provided, code will be base64 encoded and sent in check request body.',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: inactive",
        enum: ['active', 'inactive'],
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
    required: ['ddl_name'],
  },
} as const;

interface CheckDdlArgs {
  ddl_name: string;
  ddl_source?: string;
  version?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckDdl(
  context: HandlerContext,
  args: CheckDdlArgs,
) {
  const { connection, logger } = context;
  const { ddl_name, ddl_source, version, session_id, session_state } = args;

  if (!ddl_name) {
    return return_error(new Error('ddl_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const ddlName = ddl_name.toUpperCase();
  const checkVersion =
    version && version.toLowerCase() === 'active' ? 'active' : 'inactive';
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckDdlLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getDdl(resultsFor(ddlDocuments))
        .check({ ddlName, ddlSource: ddl_source }, checkVersion, {
          analyse: analyseException,
        }),
    project(detail, terseCheck),
  );
}
