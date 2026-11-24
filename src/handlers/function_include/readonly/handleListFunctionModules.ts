import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';

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
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import { listAnswerAt, shapesOf, wireAnswer } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import {
  fetchFunctionGroupChildren,
  functionGroupListAnswers,
  GROUP_CHILD_HEADS,
  groupChildLists,
} from '../../../lib/strategies/functionGroupChildren';
import { nodeStructureOn } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ListFunctionModules',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Lists the function modules of an ABAP function group, at its active version.',
    ),
    returns: returnsOf({
      heads: GROUP_CHILD_HEADS,
      shapes: [shapesOf(groupChildLists('function_modules'))],
    }),
  }),
  inputSchema: z.object({
    function_group_name: z.string().describe('Function group name.'),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

/**
 * The tool's answer; at `raw` what ADT sent — the documents the call's
 * reads answered, read with the tool at full (`wireAnswer`).
 */
export async function handleListFunctionModules(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'ListFunctionModules',
        shape: 'assembled',
      },
      () => answeredListFunctionModules(context, { ...args, detail: 'full' }),
    );
  }
  return answeredListFunctionModules(context, args);
}

async function answeredListFunctionModules(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
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
    { tool: 'ListFunctionModules', detail: detailOf(args) },
    () =>
      sequence(
        atStep('read metadata', () =>
          client
            .getFunctionGroup(functionGroupDocuments)
            .readMetadata(
              { functionGroupName },
              { version: 'active', analyse: analyseException },
            ),
        ),
        atStep('read node structure', () =>
          fetchFunctionGroupChildren(
            nodeStructureOn(context, utils),
            functionGroupName,
            'FUGR/FF',
          ),
        ),
      ),
    listAnswerAt(
      functionGroupListAnswers(functionGroupName, 'function_modules'),
      levelOf(args),
    ),
  );
}
