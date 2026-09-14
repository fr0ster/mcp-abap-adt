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
 * **`implementation_code` cannot reach `create()` itself.** v19's `create()`
 * is typed `Omit<IBehaviorImplementationConfig, 'sourceCode'> & {sourceCode?:
 * never}` — the class is created plain, because the implementations
 * include's `FOR BEHAVIOR OF` clause cannot be written until the class shell
 * exists. But this repository's own invariant (`create()` = shell, `update()`
 * writes the body — see `project_create_shell_update_writes_body`, the fix for
 * the ServiceDefinition empty-body bug) still applies: a caller who passed a
 * body expects it written, not silently discarded. So when `implementation_code`
 * is given, this locks the class it just created, writes it through `update()`
 * (which writes both the main source's `FOR BEHAVIOR OF` clause and the
 * implementations include, per `AdtBehaviorImplementation.update()`'s own doc
 * comment), and unlocks on every path out via `withLock` — never a bare
 * `sequence`, because a refused or throwing `update()` must not leave the
 * object locked.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateBehaviorImplementationLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Create a new ABAP behavior implementation class. With implementation_code, also locks, writes it (main source plus the implementations include), and unlocks. - use CreateBehaviorImplementation (high-level) for additional validation.',
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
          'Implementation code for the implementations include (optional). When given, the class is locked, the code is written (with the FOR BEHAVIOR OF main source), and unlocked, right after creation.',
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
    implementation_code,
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
    async (): Promise<IAdtResponse<AdtReading<unknown>, IAdtError>> => {
      const client = createAdtClient(
        connection,
        logger,
      ).getBehaviorImplementation(resultsFor(classDocuments));

      const created = await client.create(
        {
          className,
          behaviorDefinition,
          description,
          packageName: package_name.toUpperCase(),
          transportRequest: transport_request,
        },
        { analyse: analyseException },
      );

      if (!created.ok || !implementation_code) {
        return created as IAdtResponse<AdtReading<unknown>, IAdtError>;
      }

      // The body was passed; write it under a lock this call also releases.
      return withLock(
        () => client.lock({ className }),
        (lockHandle) =>
          client.update(
            { className, behaviorDefinition, sourceCode: implementation_code },
            { lockHandle, analyse: analyseException },
          ),
        (lockHandle) => client.unlock({ className }, lockHandle),
      ) as Promise<IAdtResponse<AdtReading<unknown>, IAdtError>>;
    },
    project(detail, terseWrite),
  );
}
