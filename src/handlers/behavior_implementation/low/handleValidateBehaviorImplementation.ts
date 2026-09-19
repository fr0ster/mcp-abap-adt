/**
 * ValidateBehaviorImplementation Handler - Validate ABAP Behavior Implementation Class Name
 *
 * Uses AdtClient.getBehaviorImplementation().validate from
 * @mcp-abap-adt/adt-clients 19. Declared over the class document set — see
 * `handleCreateBehaviorImplementation`'s doc comment.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseValidation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateBehaviorImplementationLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP behavior implementation class name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Behavior Implementation class name to validate (e.g., ZBP_MY_ENTITY).',
      },
      behavior_definition: {
        type: 'string',
        description:
          'Behavior Definition name (e.g., ZI_MY_ENTITY). Required for validation.',
      },
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.',
      },
      description: {
        type: 'string',
        description: 'Class description. Required for validation.',
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
    required: [
      'class_name',
      'behavior_definition',
      'package_name',
      'description',
    ],
  },
} as const;

interface ValidateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
  package_name: string;
  description: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleValidateBehaviorImplementation(
  context: HandlerContext,
  args: ValidateBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  const {
    class_name,
    behavior_definition,
    package_name,
    description,
    session_id,
    session_state,
  } = args;

  if (!class_name || !behavior_definition || !package_name || !description) {
    return return_error(
      new Error(
        'class_name, behavior_definition, package_name, and description are required',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const className = class_name.toUpperCase();
  const behaviorDefinition = behavior_definition.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ValidateBehaviorImplementationLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorImplementation(resultsFor(classDocuments))
        .validate(
          {
            className,
            behaviorDefinition,
            packageName: package_name.toUpperCase(),
            description,
          },
          { analyse: analyseValidation },
        ),
    project(detail, terseValidation),
  );
}
