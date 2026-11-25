import { functionGroupDocuments } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';

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
import { purpose, toolDescription } from '../../../lib/description';
import { listAnswerAt, wireAnswer } from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import {
  fetchFunctionGroupChildren,
  functionGroupListAnswers,
} from '../../../lib/strategies/functionGroupChildren';
import { nodeStructureOn } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ListFunctionGroupIncludes',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Lists the includes of an ABAP function group, its TOP include among them, at its active version.',
    ),
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
export async function handleListFunctionGroupIncludes(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'ListFunctionGroupIncludes',
        shape: 'assembled',
      },
      () =>
        answeredListFunctionGroupIncludes(context, { ...args, detail: 'full' }),
    );
  }
  return answeredListFunctionGroupIncludes(context, args);
}

async function answeredListFunctionGroupIncludes(
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
    { tool: 'ListFunctionGroupIncludes', detail: detailOf(args) },
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
            'FUGR/I',
          ),
        ),
      ),
    listAnswerAt(
      functionGroupListAnswers(functionGroupName, 'includes'),
      levelOf(args),
    ),
  );
}
