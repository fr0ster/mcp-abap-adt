/**
 * ListFunctionGroupIncludes Handler
 *
 * Uses AdtClient.getUtils(ourUtils).fetchNodeStructure from
 * @mcp-abap-adt/adt-clients 19 — `listFunctionGroupIncludes`'s replacement,
 * per the guide's "Walks are yours" table: the function group's own node
 * structure, then the FUGR/I child node's. Composed in
 * `src/lib/strategies/functionGroupChildren.ts`, shared with
 * `handleListFunctionModules.ts`'s own FUGR/FF lookup.
 *
 * **A nonexistent function group and an empty one are not told apart by the
 * walk alone** — see `handleListFunctionModules.ts`'s header for the full
 * reasoning (the guide's own words on the shared 200-with-zero-bytes
 * ambiguity) and why a cheap existence read composed ahead of the walk,
 * the same shape `handleGetPackageTree.ts` already uses for a package,
 * disambiguates it here too.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { fetchFunctionGroupChildren } from '../../../lib/strategies/functionGroupChildren';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ListFunctionGroupIncludes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] List the includes (TOP, custom) of an ABAP function group.',
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

export async function handleListFunctionGroupIncludes(
  context: HandlerContext,
  args: { function_group_name: string },
) {
  const { connection, logger } = context;
  const { function_group_name } = args;
  if (!function_group_name) {
    return return_error(new Error('function_group_name is required'));
  }

  const functionGroupName = function_group_name.toUpperCase();
  const client = createAdtClient(connection, logger);
  const utils = client.getUtils(ourUtils);

  return answer(
    { tool: 'ListFunctionGroupIncludes', detail: 'terse' },
    () =>
      sequence(
        () =>
          client
            .getFunctionGroup()
            .readMetadata({ functionGroupName }, { analyse: analyseException }),
        () => fetchFunctionGroupChildren(utils, functionGroupName, 'FUGR/I'),
      ),
    (objects) => ({
      success: true,
      function_group_name: functionGroupName,
      total: objects.length,
      includes: objects.map((o) => o.name),
    }),
  );
}
