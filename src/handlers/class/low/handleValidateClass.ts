/**
 * ValidateClass Handler - Validate ABAP Class Name
 *
 * Uses AdtClient.getClass().validate from @mcp-abap-adt/adt-clients 19.
 * Supports package, description, and superclass validation.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateClassLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP class name before creation. Checks if the name is valid, available, and validates package, description, and superclass if provided. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name to validate (e.g., ZCL_MY_CLASS)',
      },
      package_name: {
        type: 'string',
        description: 'Package name for validation (required).',
      },
      description: {
        type: 'string',
        description: 'Description for validation (required).',
      },
      superclass: {
        type: 'string',
        description:
          'Optional superclass name for validation (e.g., CL_OBJECT)',
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
    required: ['class_name', 'package_name', 'description'],
  },
} as const;

interface ValidateClassArgs {
  class_name: string;
  package_name: string;
  description: string;
  superclass?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleValidateClass(
  context: HandlerContext,
  args: ValidateClassArgs,
) {
  const { connection, logger } = context;
  const {
    class_name,
    package_name,
    description,
    superclass,
    session_id,
    session_state,
  } = args;

  if (!class_name || !package_name || !description) {
    return return_error(
      new Error('class_name, package_name, and description are required'),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const className = class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ValidateClassLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getClass(resultsFor(classDocuments))
        .validate(
          {
            className,
            packageName: package_name.toUpperCase(),
            description,
            superclass,
          },
          { analyse: analyseException },
        ),
    project(detail, terseValidation),
  );
}
