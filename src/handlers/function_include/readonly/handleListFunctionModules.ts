/**
 * ListFunctionModules Handler
 *
 * Uses AdtClient.getUtils(ourUtils).fetchNodeStructure from
 * @mcp-abap-adt/adt-clients 19 — `listFunctionModules`'s replacement, per
 * the guide's "Walks are yours" table: the function group's own node
 * structure, then the FUGR/FF child node's. Composed in
 * `src/lib/strategies/functionGroupChildren.ts`, which
 * `handleListFunctionGroupIncludes.ts` shares for its own FUGR/I lookup.
 *
 * **A nonexistent function group and an empty one are not told apart by the
 * walk alone.** The guide's "Walks are yours" section says so explicitly:
 * `/repository/nodestructure` "answers 200 with zero bytes for a package
 * that does not exist, and 200 with a tree for one that does... that
 * distinction is now yours to make, on the body." A function group with no
 * function modules answers the same zero-child-node body a function group
 * that does not exist at all would. Disambiguated here the same way
 * `handleGetPackageTree.ts` already disambiguates the identical package
 * case (`#38`): a cheap existence read (`getFunctionGroup().readMetadata`)
 * runs first, composed with the walk via `sequence` — a function group that
 * does not exist refuses here, before the walk ever answers an empty list
 * that would otherwise be indistinguishable from "no function modules".
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
  name: 'ListFunctionModules',
  available_in: ['onprem', 'cloud'] as const,
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
  const client = createAdtClient(connection, logger);
  const utils = client.getUtils(ourUtils);

  return answer(
    { tool: 'ListFunctionModules', detail: 'terse' },
    () =>
      sequence(
        () =>
          client
            .getFunctionGroup()
            .readMetadata({ functionGroupName }, { analyse: analyseException }),
        () => fetchFunctionGroupChildren(utils, functionGroupName, 'FUGR/FF'),
      ),
    (objects) => ({
      success: true,
      function_group_name: functionGroupName,
      total: objects.length,
      function_modules: objects.map((o) => o.name),
    }),
  );
}
