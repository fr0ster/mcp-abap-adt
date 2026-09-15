/**
 * ListFunctionModules Handler
 *
 * Uses AdtClient.getUtils(ourUtils).fetchNodeStructure from
 * @mcp-abap-adt/adt-clients 19 — `listFunctionModules`'s replacement, per
 * the guide's "Walks are yours" table: the function group's own node
 * structure, then the FUGR/FF child node's. Composed in
 * `src/lib/strategies/functionGroupChildren.ts`, which
 * `handleListFunctionGroupIncludes.ts` shares for its own FUGR/I lookup.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { fetchFunctionGroupChildren } from '../../../lib/strategies/functionGroupChildren';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ListFunctionModules',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] List the function modules of an ABAP function group.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., Z_MY_FG).',
      },
    },
    required: ['function_group_name'],
  },
} as const;

export async function handleListFunctionModules(
  context: HandlerContext,
  args: { function_group_name: string },
) {
  const { connection, logger } = context;
  const { function_group_name } = args;
  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  const functionGroupName = function_group_name.toUpperCase();
  const utils = createAdtClient(connection, logger).getUtils(ourUtils);

  return answer(
    { tool: 'ListFunctionModules', detail: 'terse' },
    () => fetchFunctionGroupChildren(utils, functionGroupName, 'FUGR/FF'),
    (objects) => ({
      success: true,
      function_group_name: functionGroupName,
      total: objects.length,
      function_modules: objects.map((o) => o.name),
    }),
  );
}
