/**
 * CreateBehaviorDefinition Handler - Create ABAP Behavior Definition
 *
 * Uses AdtClient.getBehaviorDefinition().create from @mcp-abap-adt/adt-clients 19.
 *
 * A create is one request, and its own answer: `resultSets.ts` maps the
 * `created` slot to `verbatim`, so `project(detail, terseWrite)` still reads
 * the status for `terse` while `full`/`raw` answer the document ADT sent
 * instead of discarding it.
 */

import { behaviorDefinitionDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { BehaviorDefinitionImplementationType } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateBehaviorDefinitionLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Create a new ABAP Behavior Definition. - use CreateBehaviorDefinition (high-level) for full workflow with validation, lock, update, check, unlock, and activate.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Behavior Definition name (e.g., ZI_MY_BDEF).',
      },
      description: {
        type: 'string',
        description: 'Behavior Definition description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description: 'Transport request number (e.g., E19K905635). Required.',
      },
      root_entity: {
        type: 'string',
        description: 'Root entity name (e.g., ZI_MY_ENTITY).',
      },
      implementation_type: {
        type: 'string',
        description:
          "Implementation type: 'Managed', 'Unmanaged', 'Abstract', or 'Projection'.",
        enum: ['Managed', 'Unmanaged', 'Abstract', 'Projection'],
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
      'description',
      'package_name',
      'root_entity',
      'implementation_type',
    ],
  },
} as const;

interface CreateBehaviorDefinitionArgs {
  name: string;
  description: string;
  package_name: string;
  transport_request?: string;
  root_entity: string;
  implementation_type: BehaviorDefinitionImplementationType;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateBehaviorDefinition(
  context: HandlerContext,
  args: CreateBehaviorDefinitionArgs,
) {
  const { connection, logger } = context;
  const {
    name,
    description,
    package_name,
    transport_request,
    root_entity,
    implementation_type,
    session_id,
    session_state,
  } = args;

  if (
    !name ||
    !description ||
    !package_name ||
    !root_entity ||
    !implementation_type
  ) {
    return return_error(
      new Error(
        'name, description, package_name, root_entity, and implementation_type are required',
      ),
    );
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const bdefName = name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateBehaviorDefinitionLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorDefinition(resultsFor(behaviorDefinitionDocuments))
        .create(
          {
            name: bdefName,
            description,
            packageName: package_name,
            transportRequest: transport_request,
            rootEntity: root_entity,
            implementationType: implementation_type,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
