/**
 * ValidateBehaviorDefinition Handler - Validate ABAP Behavior Definition Name
 *
 * Uses AdtClient.getBehaviorDefinition().validate from @mcp-abap-adt/adt-clients 19.
 *
 * ADT's validation endpoint requires `name` and `rootEntity` to carry the same
 * value — the root entity CDS view name — not the behavior definition's own
 * `name` argument. That quirk predates this migration; kept as-is.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseValidation } from '@mcp-abap-adt/adt-strategies';
import type { BehaviorDefinitionImplementationType } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseValidation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ValidateBehaviorDefinitionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Validate an ABAP behavior definition name before creation. Checks if the name is valid and available. Returns validation result with success status and message. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'BehaviorDefinition name to validate (e.g., ZI_MY_BDEF).',
      },
      root_entity: {
        type: 'string',
        description:
          'Root entity name (e.g., ZI_MY_ENTITY). Required for validation.',
      },
      implementation_type: {
        type: 'string',
        description:
          "Implementation type: 'Managed', 'Unmanaged', 'Abstract', or 'Projection'.",
        enum: ['Managed', 'Unmanaged', 'Abstract', 'Projection'],
      },
      package_name: {
        type: 'string',
        description:
          'Package name (e.g., ZOK_LOCAL, $TMP for local objects). Required for validation.',
      },
      description: {
        type: 'string',
        description: 'BehaviorDefinition description. Required for validation.',
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
      'name',
      'root_entity',
      'implementation_type',
      'package_name',
      'description',
    ],
  },
} as const;

interface ValidateBehaviorDefinitionArgs {
  name: string;
  root_entity: string;
  implementation_type: BehaviorDefinitionImplementationType;
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

export async function handleValidateBehaviorDefinition(
  context: HandlerContext,
  args: ValidateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const {
    root_entity,
    implementation_type,
    package_name,
    description,
    session_id,
    session_state,
  } = args;
  const name = args.name;

  if (
    !name ||
    !root_entity ||
    !implementation_type ||
    !package_name ||
    !description
  ) {
    return return_error(
      new Error(
        'name, root_entity, implementation_type, package_name, and description are required',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const detail = detailOf(args);

  return answer(
    { tool: 'ValidateBehaviorDefinitionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
        .validate(
          {
            // objname and rootEntity must carry the same value — the root
            // entity CDS view name — not the behavior definition's own name.
            name: root_entity,
            rootEntity: root_entity,
            description,
            packageName: package_name.toUpperCase(),
            implementationType: implementation_type,
          },
          { analyse: analyseValidation },
        ),
    project(detail, terseValidation),
  );
}
