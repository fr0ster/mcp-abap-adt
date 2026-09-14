/**
 * CreateBehaviorImplementation Handler - Create ABAP Behavior Implementation Class
 *
 * Uses AdtClient.getBehaviorImplementation().create from
 * @mcp-abap-adt/adt-clients 19.
 *
 * A behavior implementation *is* a class — its every request composes
 * `AdtClass` and is declared over the class document set (`classDocuments`,
 * not a set of its own; see `AdtBehaviorImplementation`'s own doc comment).
 * `getBehaviorImplementation` is still the factory to call, not `getClass`:
 * both answer identically-shaped readings, and only the factory name tells
 * the two families apart on the wire (see the low-tier strategy test).
 *
 * **`implementation_code` no longer reaches this call.** v19's `create()` is
 * typed `Omit<IBehaviorImplementationConfig, 'sourceCode'> & { sourceCode?:
 * never }` — the class is created plain, because the implementations
 * include's `FOR BEHAVIOR OF` clause cannot be written until the class shell
 * exists. This is a real removal, not an oversight this migration is
 * papering over: a caller who needs the include written now locks the class
 * (`LockBehaviorImplementationLow`) and writes both sources through the
 * high-level `UpdateBehaviorImplementation`, which is what already does the
 * two-source write `AdtBehaviorImplementation.update()` describes. The
 * parameter stays on this tool's surface (removing it would be a surface
 * change beyond the one this migration is allowed), but it is now inert here.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateBehaviorImplementationLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Create a new ABAP behavior implementation class (shell only — no source). - use CreateBehaviorImplementation (high-level) for the full workflow with validation, lock, update, unlock, and activate. implementation_code is ignored here: v19 cannot create a behavior implementation with a body in one call; use LockBehaviorImplementation and the high-level UpdateBehaviorImplementation to write it.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must follow SAP naming conventions.',
      },
      behavior_definition: {
        type: 'string',
        description: 'Behavior Definition name (e.g., ZI_MY_ENTITY). Required.',
      },
      description: {
        type: 'string',
        description: 'Class description.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      implementation_code: {
        type: 'string',
        description:
          'Ignored. v19 creates the class shell only — the implementations include cannot be written before the class exists. Use LockBehaviorImplementation, then the high-level UpdateBehaviorImplementation, to write it.',
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
      'description',
      'package_name',
    ],
  },
} as const;

interface CreateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
  description: string;
  package_name: string;
  transport_request?: string;
  implementation_code?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateBehaviorImplementation(
  context: HandlerContext,
  args: CreateBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  const {
    class_name,
    behavior_definition,
    description,
    package_name,
    transport_request,
    session_id,
    session_state,
  } = args;

  if (!class_name || !behavior_definition || !description || !package_name) {
    return return_error(
      new Error(
        'class_name, behavior_definition, description, and package_name are required',
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
    { tool: 'CreateBehaviorImplementationLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getBehaviorImplementation(resultsFor(classDocuments))
        .create(
          {
            className,
            behaviorDefinition,
            description,
            packageName: package_name.toUpperCase(),
            transportRequest: transport_request,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
