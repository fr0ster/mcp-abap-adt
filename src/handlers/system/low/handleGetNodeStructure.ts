/**
 * GetNodeStructure Handler - Low-level handler for node structure
 *
 * Uses AdtClient.getUtils().fetchNodeStructure from @mcp-abap-adt/adt-clients
 * 19. `fetchNodeStructure(parentType, parentName, options)` takes no
 * `options.analyse` at all — nothing to inject beyond the result set.
 *
 * **The guard this file exists for.** `refusal-package-not-found-objectslist-
 * empty--01-nodestructure.body.txt` and `read-empty-package-contents--01-
 * nodestructure.body.txt` are byte-for-byte identical: zero bytes, HTTP 200,
 * one for a package that does not exist, the other for one that exists and
 * holds nothing. `isIndeterminateWalkAnswer`
 * (`@mcp-abap-adt/adt-strategies`) documents exactly this and says what a
 * caller without a separate existence check should do: treat it as
 * indeterminate rather than guess. `GetPackageTree`
 * (`src/handlers/system/high/handleGetPackageTree.ts`) pays a `getPackage()
 * .read()` round trip first and reports "not found" when that fails — but
 * this tool answers node structure for any object type, not only packages,
 * so it has no equivalent existence check to pay. `fetchNodeStructure` also
 * takes no `options.analyse`, so no strategy downstream of the reading can
 * ever turn the 200 into a refusal — the reading itself is the only place
 * left, so `readNodeLevel` checks the raw body before handing it to
 * `nodeLevel` and throws rather than answering an empty level it cannot
 * back up. `answering()` (adt-clients) runs the reading outside its own
 * failure classification and lets the reading's own exception surface as
 * itself; `answer()` (this repository) then turns that throw into
 * `client_threw`, an error a caller can see.
 */

import { isIndeterminateWalkAnswer } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type NodeLevel, nodeLevel } from '../../../lib/strategies/packageWalk';
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

/**
 * `ourUtils.node` (`nodeLevel`), guarded against the one document it cannot
 * read honestly. Exported so a test can drive the real captured fixture
 * through it directly, the same way `treeText` is exported for
 * `GetObjectStructureLow`.
 */
export function readNodeLevel(answer: unknown): NodeLevel {
  const xml = (answer as { data?: unknown } | undefined)?.data;
  if (isIndeterminateWalkAnswer(xml)) {
    throw new Error(
      'ADT answered an empty node structure (HTTP 200, zero bytes) for this parent — that answer means either the parent does not exist or it genuinely holds nothing, and this endpoint gives no way to tell the two apart. fetchNodeStructure carries no analyse, so nothing downstream of this reading can decide either.',
    );
  }
  return nodeLevel(answer);
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
        .getUtils({ ...ourUtils, node: readNodeLevel })
        .fetchNodeStructure(parent_type, parent_name, {
          nodeId: node_id || '0000',
          withShortDescriptions: with_short_descriptions !== false,
        }),
    (value) => value,
  );
}
