/**
 * GetNodeStructure Handler - Low-level handler for node structure
 *
 * Uses AdtClient.getUtils().fetchNodeStructure from @mcp-abap-adt/adt-clients
 * 19. `fetchNodeStructure(parentType, parentName, options)` takes no
 * `options.analyse` at all — nothing to inject beyond the result set.
 *
 * `ourUtils.node` is `nodeLevel` (`src/lib/strategies/packageWalk.ts`), not
 * the table's own `structured` default — the shipped reading answers
 * `objectType`/`objectName`/`techName`/`objectUri` with no description, and a
 * package listing wants one. Because the injected reading already collapses
 * the answer into `{ objects, childNodes }` rather than an `AdtReading`
 * (`{ value, raw, status }`), `project()` from `projections.ts` — which reads
 * that shape — cannot be used here: the level itself is the value, not
 * something to project `detail` over. `detail` is therefore not on this
 * tool's surface, the same reason `LockDomainLow` and its siblings leave it
 * off.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetNodeStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Fetch node structure from ADT repository. Used for object tree navigation and structure discovery. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      parent_type: {
        type: 'string',
        description: 'Parent object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K")',
      },
      parent_name: {
        type: 'string',
        description: 'Parent object name',
      },
      node_id: {
        type: 'string',
        description:
          'Optional node ID (default: "0000" for root). Use to fetch child nodes.',
        default: '0000',
      },
      with_short_descriptions: {
        type: 'boolean',
        description: 'Include short descriptions in response',
        default: true,
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
    },
    required: ['parent_type', 'parent_name'],
  },
} as const;

interface GetNodeStructureArgs {
  parent_type: string;
  parent_name: string;
  node_id?: string;
  with_short_descriptions?: boolean;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleGetNodeStructure(
  context: HandlerContext,
  args: GetNodeStructureArgs,
) {
  const { connection, logger } = context;
  const {
    parent_type,
    parent_name,
    node_id,
    with_short_descriptions,
    session_id,
    session_state,
  } = args;

  if (!parent_type) {
    return return_error(new Error('parent_type is required'));
  }
  if (!parent_name) {
    return return_error(new Error('parent_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  return answer(
    { tool: 'GetNodeStructureLow', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .fetchNodeStructure(parent_type, parent_name, {
          nodeId: node_id || '0000',
          withShortDescriptions: with_short_descriptions !== false,
        }),
    (value) => value,
  );
}
