import {
  analyseException,
  type IRepositoryNodeChild,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtAnsweredObject } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { notATableType, tableTypeOf } from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import {
  about,
  type Column,
  headShape,
  marks,
  type RowSchemas,
  rows,
  shapesOf,
  writeListing,
} from '../../../lib/detail';
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
    lists: OBJECTS_BY_TYPE_LISTS[descriptions ? 'described' : 'bare'],
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
    { name: 'type', means: 'its type', cell: (o) => o.type ?? o.unknownType },
    { name: 'name', means: 'its name', cell: name },
    {
      name: 'tech_name',
      means: 'its technical name where it differs',
      cell: (o) => {
        const techName = o.techName || undefined;
        return techName !== undefined && techName !== name(o) ? techName : '';
      },
    },
    {
      name: 'uri',
      means: 'its URI when SAP lists it nameless',
      cell: (o) => (name(o) === '' ? (o.objectUri ?? '') : ''),
    },
  ];
  return descriptions
    ? [
        ...columns,
        {
          name: 'description',
          means: 'its short description, by default',
          cell: (o) => o.description ?? '',
        },
      ]
    : columns;
}

/** What each listed object is, complete or not. */
const OBJECT_NOUN = 'for each object of the type';

/** The lists one type's listing writes, with its descriptions or without. */
function objectsByTypeLists(descriptions: boolean): RowSchemas<NodeLevel> {
  return {
    objects: about(
      OBJECT_NOUN,
      rows('objects', {
        columns: columnsOf(descriptions),
        header: 'always',
      }),
    ),
    incompleteObjects: about(
      OBJECT_NOUN,
      rows('incompleteObjects', {
        columns: columnsOf(descriptions),
        header: 'none',
      }),
    ),
    notLoaded: about(
      'the nodes SAP left unloaded are named',
      marks(
        'notLoaded',
        NOT_LOADED_BY_SAP,
        (_node: NonNullable<NodeLevel['notLoaded']>[number]) => [],
      ),
    ),
    childNodes: about(
      'the nodes below it are named by their type and node ID',
      marks('childNodes', 'child_node', (node: IRepositoryNodeChild) => [
        node.type ?? node.unknownType,
        node.nodeId,
      ]),
    ),
  };
}

/**
 * The lists of a type's listing: `described` with short descriptions (the
 * default), `bare` with `with_short_descriptions` false.
 */
export const OBJECTS_BY_TYPE_LISTS = {
  described: objectsByTypeLists(true),
  bare: objectsByTypeLists(false),
} as const;

/** The heads every type's listing opens with. */
export const OBJECTS_BY_TYPE_HEADS = [
  headShape('parent', "parent's type and name"),
  headShape('node_id', 'node ID'),
  headShape('count', 'number of objects'),
];

export const TOOL_DEFINITION = {
  name: 'GetObjectsByType',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Lists the objects of one type, such as classes, tables, programs or interfaces, in an ABAP package or other composite object.',
    ),
    returns: returnsOf({
      heads: OBJECTS_BY_TYPE_HEADS,
      of: 'the',
      shapes: Object.values(OBJECTS_BY_TYPE_LISTS).map(shapesOf),
    }),
    inline: true,
  }),
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
