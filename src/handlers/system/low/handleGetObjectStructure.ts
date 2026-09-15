/**
 * GetObjectStructure Handler - Low-level handler for object structure
 *
 * Uses AdtClient.getUtils().getObjectStructure from @mcp-abap-adt/adt-clients
 * 19. `getObjectStructure(objectType, objectName)` takes no options object at
 * all — no `analyse` to pass. The tree-text projection is the same one
 * `GetObjectStructure` (read-only, `src/handlers/system/readonly/`) already
 * built and exports — both tools read the same `projectexplorer:
 * objectstructure` document through the same `ourUtils.objectStructure`
 * (`structured`) reading, and a second copy of the flattening logic would be
 * two things to keep in sync against one document shape.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';
import { treeText } from '../readonly/handleGetObjectStructure';

export const TOOL_DEFINITION = {
  name: 'GetObjectStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Retrieve ADT object structure as compact JSON tree. Returns XML response with object structure tree. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        description:
          'Object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K", "DDLS/DF")',
      },
      object_name: {
        type: 'string',
        description: 'Object name (e.g., "ZMY_CLASS", "ZMY_PROGRAM")',
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
    required: ['object_type', 'object_name'],
  },
} as const;

interface GetObjectStructureArgs {
  object_type: string;
  object_name: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleGetObjectStructure(
  context: HandlerContext,
  args: GetObjectStructureArgs,
) {
  const { connection, logger } = context;
  const { object_type, object_name, session_id, session_state } = args;

  if (!object_type) {
    return return_error(new Error('object_type is required'));
  }
  if (!object_name) {
    return return_error(new Error('object_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  const detail = detailOf(args);

  return answer(
    { tool: 'GetObjectStructureLow', detail },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getObjectStructure(object_type, object_name),
    project(detail, (value) => treeText(value)),
  );
}
