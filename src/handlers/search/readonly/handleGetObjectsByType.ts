import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { notATableType, tableTypeOf } from '../../../lib/adtTypeCode';
export const TOOL_DEFINITION = {
  name: 'GetObjectsByType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Lists the objects of one type (classes, tables, programs, interfaces, etc.), the type whose node in the object tree is named by node_id, under the package or composite object named by parent_name, parent_tech_name and parent_type. Answers TSV under `# parent`, `# node_id` and `# count` lines: a row per object, its type, name, the technical name where it differs from the name and the uri of an object listed without a name.',
  inputSchema: z.object({
    parent_name: z.string().describe('[read-only] Parent object name'),
    parent_tech_name: z.string().describe('[read-only] Parent technical name'),
    parent_type: z.string().describe('[read-only] Parent object type'),
    node_id: z.string().describe('[read-only] Node ID'),
    format: z
      .string()
      .optional()
      .describe(
        "[read-only] Output format: 'parsed' (default). 'raw' is accepted for backward compatibility but answers the same parsed text — see the note on the node reading below.",
      ),
    with_short_descriptions: z
      .boolean()
      .optional()
      .describe('[read-only] Include short descriptions'),
  }),
} as const;

import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';
import {
  completeAnswer,
  identityOf,
  type Line,
  Written,
} from '../../../lib/detail';
import {
  type CachedObject,
  objectsListCache,
} from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type NodeItem,
  type NodeLevel,
  nodeItemsOf,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

/**
 * TSV under `# parent`, `# node_id` and `# count` lines, built off `ourUtils.node` (adt-strategies' `utilNodeContents`,
 * 0.28.1: complete and incomplete objects, each listed) instead of a
 * hand-rolled regex over the raw node-structure XML. The cached rows carry
 * `TECH_NAME`/`OBJECT_URI` where the node does. `format: 'raw'` stays
 * unserved: the reading keeps no document.
 */
function formatObjects(
  level: NodeLevel,
  nodeId: string,
  parentType: string,
  parentName: string,
): { text: string; cached: CachedObject[] } {
  const objects = nodeItemsOf(level);
  const cached = objects.map((o) => ({
    OBJECT_TYPE: o.type,
    OBJECT_NAME: o.name,
    ...(o.techName ? { TECH_NAME: o.techName } : {}),
    ...(o.uri ? { OBJECT_URI: o.uri } : {}),
    ...(o.description ? { DESCRIPTION: o.description } : {}),
  }));

  // Every object SAP listed under the node, as TSV through `Written`:
  // names escaped, each row an item the guard counts.
  const text = completeAnswer(
    'GetObjectsByType',
    () => objects.map(itemIdentity),
    () =>
      Written.text(
        [
          { head: 'parent', value: `${parentType} ${parentName}` },
          { head: 'node_id', value: nodeId },
          { head: 'count', value: String(objects.length) },
          { header: ['type', 'name', 'tech_name', 'uri'] },
          ...objects.map((o): Line => ({ row: itemCells(o) })),
        ],
        [0, 1, 2, 3],
      ),
  )(undefined);
  return { text, cached };
}

/** A row's cells: the technical name where it is not the name, the URI of a nameless object. */
function itemCells(o: NodeItem): string[] {
  return [
    o.type,
    o.name,
    o.techName !== undefined && o.techName !== o.name ? o.techName : '',
    o.name === '' ? (o.uri ?? '') : '',
  ];
}

/** An object's identity, as its row writes it. */
function itemIdentity(o: NodeItem): string {
  return identityOf(itemCells(o));
}

export async function handleGetObjectsByType(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { connection, logger } = context;
  const {
    parent_name,
    parent_tech_name,
    parent_type,
    node_id,
    with_short_descriptions,
  } = args;

  if (
    !parent_name ||
    typeof parent_name !== 'string' ||
    parent_name.trim() === ''
  ) {
    return return_error(
      'Parameter "parent_name" (string) is required and cannot be empty.',
    );
  }
  if (
    !parent_tech_name ||
    typeof parent_tech_name !== 'string' ||
    parent_tech_name.trim() === ''
  ) {
    return return_error(
      'Parameter "parent_tech_name" (string) is required and cannot be empty.',
    );
  }
  if (
    !parent_type ||
    typeof parent_type !== 'string' ||
    parent_type.trim() === ''
  ) {
    return return_error(
      'Parameter "parent_type" (string) is required and cannot be empty.',
    );
  }
  if (!node_id || typeof node_id !== 'string' || node_id.trim() === '') {
    return return_error(
      'Parameter "node_id" (string) is required and cannot be empty.',
    );
  }

  const withDescriptions =
    with_short_descriptions !== undefined
      ? Boolean(with_short_descriptions)
      : true;
  const parentName = parent_name.toUpperCase();

  // `fetchNodeStructure(parentType, parentName, options?)` takes
  // `analyseException` in its options since adt-clients 23.
  //
  // Task 28: why this tool carries no `detail`. The node-level family's
  // shape (`ourUtils.node`, adt-strategies' `utilNodeContents`): the
  // reading keeps no wire text beside the level — there is no `.raw` for
  // `detail: 'raw'` to answer.
  const variant = variantOf(connection);
  const parentType = tableTypeOf(parent_type, variant);
  if (parentType === undefined) {
    return return_error(
      new Error(notATableType('parent_type', parent_type, variant)),
    );
  }
  return answer(
    { tool: 'GetObjectsByType', detail: 'terse' },
    () =>
      withAdtHeaders(context, 'utils.fetchNodeStructure', (headers) =>
        createAdtClient(connection, logger)
          .getUtils(ourUtils)
          .fetchNodeStructure(parentType, parentName, {
            headers,
            analyse: analyseException,
            nodeId: node_id,
            withShortDescriptions: withDescriptions,
          }),
      ),
    (level: NodeLevel) => {
      const { text, cached } = formatObjects(
        level,
        node_id,
        parent_type,
        parent_name,
      );
      const listing = {
        isError: false,
        content: [{ type: 'text', text }],
        objects: cached,
      };
      objectsListCache.setCache(listing);
      return text;
    },
  );
}
