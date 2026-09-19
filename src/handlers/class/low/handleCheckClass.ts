/**
 * CheckClass Handler - Syntax check for ABAP Class
 *
 * Uses AdtClient.getClass().check from @mcp-abap-adt/adt-clients 19. Can check
 * an existing class (active/inactive) or hypothetical source code passed in
 * `source_code`, without creating the object.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseCheck } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckClassLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP class. Can check existing class (active/inactive) or hypothetical source code. Returns syntax errors, warnings, and messages. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS)',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active",
        enum: ['active', 'inactive'],
      },
      source_code: {
        type: 'string',
        description:
          'Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.',
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
    required: ['class_name'],
  },
} as const;

interface CheckClassArgs {
  class_name: string;
  version?: string;
  source_code?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCheckClass(
  context: HandlerContext,
  args: CheckClassArgs,
) {
  const { connection, logger } = context;
  const {
    class_name,
    version = 'active',
    source_code,
    session_id,
    session_state,
  } = args;

  if (!class_name) {
    return return_error(new Error('class_name is required'));
  }

  const checkVersion =
    version && ['active', 'inactive'].includes(version.toLowerCase())
      ? (version.toLowerCase() as 'active' | 'inactive')
      : 'active';

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckClassLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getClass(resultsFor(classDocuments))
        .check({ className, sourceCode: source_code }, checkVersion, {
          analyse: analyseCheck,
        }),
    project(detail, terseCheck),
  );
}
