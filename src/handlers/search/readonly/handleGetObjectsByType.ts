import {
  analyseException,
  type IRepositoryNodeChild,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtAnsweredObject } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { notATableType, tableTypeOf } from '../../../lib/adtTypeCode';
export const TOOL_DEFINITION = {
  name: 'GetObjectsByType',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Lists the objects of one type (classes, tables, programs, interfaces, etc.), the type whose node in the object tree is named by node_id, under the package or composite object named by parent_name, parent_tech_name and parent_type. Answers TSV under `# parent`, `# node_id` and `# count` lines: a row per object, its type, name, the technical name where it differs from the name and, for an object listed by its uri alone, that uri — with with_short_descriptions, its description too; each node SAP marks as unloaded is a `#` line of its own, and each child node of the type node a `# child_node` line naming its type and node id.',
  inputSchema: z.object({
    parent_name: z.string().describe('[read-only] Parent object name'),
    parent_tech_name: z.string().describe('[read-only] Parent technical name'),
    parent_type: z.string().describe('[read-only] Parent object type'),
    node_id: z.string().describe('[read-only] Node ID'),
    format: z
      .string()
      .optional()
      .describe(
        "[read-only] Output format: 'parsed' (default). 'raw' is accepted for backward compatibility and answers the same TSV.",
      ),
    with_short_descriptions: z
      .boolean()
      .optional()
      .describe(
        '[read-only] Include short descriptions (default true): a description column on each row',
      ),
  }),
} as const;

import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';
import { type Column, marks, rows, writeListing } from '../../../lib/detail';
import {
  type CachedObject,
  objectsListCache,
} from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  NOT_LOADED_BY_SAP,
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
  descriptions: boolean,
): { text: string; cached: CachedObject[] } {
  const objects = nodeItemsOf(level);
  const cached = objects.map((o) => ({
    OBJECT_TYPE: o.type,
    OBJECT_NAME: o.name,
    ...(o.techName ? { TECH_NAME: o.techName } : {}),
    ...(o.uri ? { OBJECT_URI: o.uri } : {}),
    ...(o.description ? { DESCRIPTION: o.description } : {}),
  }));

  // Every entry SAP listed under the node — its objects, complete or not,
  // each node it could not load, each child node — written by the writer
  // from the level's own lists (`writeListing`): one row or line each, no
  // list left without a schema.
  const notLoaded = level.notLoaded ?? [];
  const text = writeListing({
    heads: [
      { head: 'parent', value: `${parentType} ${parentName}` },
      { head: 'node_id', value: nodeId },
      { head: 'count', value: String(objects.length + notLoaded.length) },
    ],
    reading: level,
    lists: {
      objects: rows('objects', {
        columns: columnsOf(descriptions),
        header: 'always',
      }),
      incompleteObjects: rows('incompleteObjects', {
        columns: columnsOf(descriptions),
        header: 'none',
      }),
      notLoaded: marks('notLoaded', NOT_LOADED_BY_SAP, () => []),
      childNodes: marks(
        'childNodes',
        'child_node',
        (node: IRepositoryNodeChild) => [
          node.type ?? node.unknownType,
          node.nodeId,
        ],
      ),
    },
  }).answer;
  return { text, cached };
}

/** An entry of a level, complete or not: what a row reads. */
type LevelEntry = IAdtAnsweredObject & {
  readonly objectName?: string | undefined;
  readonly techName?: string | undefined;
  readonly objectUri?: string | undefined;
  readonly description?: string | undefined;
};

/**
 * The columns of a row: the type, the name, the technical name where it is
 * not the name, the URI of a nameless object, the description where asked.
 */
function columnsOf(descriptions: boolean): Column<LevelEntry>[] {
  const name = (o: LevelEntry) => o.objectName ?? '';
  const columns: Column<LevelEntry>[] = [
    { name: 'type', cell: (o) => o.type ?? o.unknownType },
    { name: 'name', cell: name },
    {
      name: 'tech_name',
      cell: (o) => {
        const techName = o.techName || undefined;
        return techName !== undefined && techName !== name(o) ? techName : '';
      },
    },
    {
      name: 'uri',
      cell: (o) => (name(o) === '' ? (o.objectUri ?? '') : ''),
    },
  ];
  return descriptions
    ? [...columns, { name: 'description', cell: (o) => o.description ?? '' }]
    : columns;
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
        withDescriptions,
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
