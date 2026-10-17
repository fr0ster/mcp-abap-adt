import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
export const TOOL_DEFINITION = {
  name: 'GetObjectsList',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Recursively retrieves all child ABAP repository objects for a given parent — programs (PROG), function groups (FUGR), classes (CLAS), packages (DEVC), and other composite objects — including nested includes and subcomponents. Takes parent_name, parent_tech_name and parent_type (one parent: its list) or objects (several parents: one entry per parent, in the order given, each { parent_name, parent_type, total_objects, objects } or { parent_name, parent_type, error }). Each level of the node tree is read in one ADT batch envelope.',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      parent_name: {
        type: 'string',
        description:
          '[read-only] Parent object name (with parent_tech_name and parent_type; or give objects)',
      },
      parent_tech_name: {
        type: 'string',
        description: '[read-only] Parent technical name',
      },
      parent_type: {
        type: 'string',
        description: '[read-only] Parent object type (e.g. PROG/P, FUGR)',
      },
      objects: {
        type: 'array',
        description:
          '[read-only] Several parents, read together (give this or parent_name)',
        items: {
          type: 'object',
          properties: {
            parent_type: {
              type: 'string',
              description: 'Parent object type (e.g. PROG/P, FUGR)',
            },
            parent_name: { type: 'string', description: 'Parent object name' },
          },
          required: ['parent_type', 'parent_name'],
        },
      },
      with_short_descriptions: {
        type: 'boolean',
        description: '[read-only] Include short descriptions (default: true)',
      },
    },
    required: [],
  },
} as const;

import type {
  IAdtError,
  IAdtFailure,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import {
  answer,
  type FailureEntry,
  failureEntry,
  thrownEntry,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  byLevels,
  levelReader,
  type NodeLevel,
  type NodeRequest,
  type ReadMode,
  readNode,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

/**
 * The cache row shape `handleGetObjectNodeFromCache.ts` (out of this task's
 * scope, untouched) matches on — `OBJECT_TYPE`/`OBJECT_NAME`/`TECH_NAME`,
 * uppercase, the same spelling `handleGetObjectsByType.ts` already writes,
 * `OBJECT_URI` included so that handler's own follow-up-request feature
 * keeps working. `ourUtils.node` (`nodeLevel`, `packageWalk.ts`) carries
 * both `techName` and `uri` — see that file's own doc for why they were
 * ever thought absent, and corrected.
 */
interface FlatObject {
  OBJECT_TYPE: string;
  OBJECT_NAME: string;
  TECH_NAME?: string;
  OBJECT_URI?: string;
}

function ok<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('asked for the error of a success');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

/** A parent whose node tree is walked. */
interface Parent {
  type: string;
  name: string;
}

/** A node of a parent's tree: what its read found, and the child nodes read under it. */
interface ListNode {
  root: number;
  nodeId: string;
  objects: FlatObject[];
  children: ListNode[];
}

/** A parent's walk failed: its first refused read (`response`) or throw. */
interface FailedWalk {
  ok: false;
  response?: IAdtFailure;
  thrown?: unknown;
}

/** A parent's walk: its objects, or its failure. */
type ParentWalk = { ok: true; objects: FlatObject[] } | FailedWalk;

function flatten(node: ListNode): FlatObject[] {
  return [...node.objects, ...node.children.flatMap(flatten)];
}

/**
 * Every parent's node tree, level by level (spec §11): per level, the node
 * structure of every node of the level, read together; every child node a
 * level lists is read in the next. Each parent's objects in the order the
 * recursion always gave them (a node's own, then each child node's subtree);
 * a parent's first refused read is its answer, and nothing more of it is
 * read.
 */
async function walkParents(
  context: HandlerContext,
  mode: ReadMode,
  parents: readonly Parent[],
  withShortDescriptions: boolean,
): Promise<ParentWalk[]> {
  const read = levelReader<NodeRequest, unknown>(
    context,
    mode,
    (request, connection) =>
      readNode(
        createAdtClient(connection, context.logger).getUtils(ourUtils),
        request,
      ),
  );
  const failures = new Map<number, FailedWalk>();
  const visited = parents.map(() => new Set<string>(['000000']));
  const roots: ListNode[] = parents.map((_, root) => ({
    root,
    nodeId: '000000',
    objects: [],
    children: [],
  }));

  let level = roots;
  while (level.length > 0) {
    const answers = await read(
      level.map((node) => ({
        parentType: parents[node.root]?.type ?? '',
        parentName: parents[node.root]?.name ?? '',
        nodeId: node.nodeId,
        withShortDescriptions,
        analysed: true,
      })),
    );
    const next: ListNode[] = [];
    level.forEach((node, i) => {
      if (failures.has(node.root)) return;
      const result = answers[i];
      if (result === undefined || !result.ok) {
        failures.set(node.root, { ok: false, thrown: result?.error });
        return;
      }
      const response = result.value as IAdtResponse<unknown, IAdtError>;
      if (!response.ok) {
        failures.set(node.root, { ok: false, response });
        return;
      }
      const found = response.getResult().value as NodeLevel;
      node.objects = found.objects.map((o) => ({
        OBJECT_TYPE: o.type,
        OBJECT_NAME: o.name,
        ...(o.techName ? { TECH_NAME: o.techName } : {}),
        ...(o.uri ? { OBJECT_URI: o.uri } : {}),
      }));
      const seen = visited[node.root];
      for (const child of found.childNodes) {
        if (seen === undefined || seen.has(child.nodeId)) continue;
        seen.add(child.nodeId);
        const sub: ListNode = {
          root: node.root,
          nodeId: child.nodeId,
          objects: [],
          children: [],
        };
        node.children.push(sub);
        next.push(sub);
      }
    });
    level = next.filter((node) => !failures.has(node.root));
  }

  return roots.map(
    (root) => failures.get(root.root) ?? { ok: true, objects: flatten(root) },
  );
}

/** A failed parent walk as an entry: the method's error as it is, with its step. */
function failureOfWalk(walk: FailedWalk): FailureEntry {
  return walk.response !== undefined
    ? failureEntry(walk.response.getError(), 'read node structure')
    : thrownEntry(walk.thrown, 'read node structure');
}

export async function handleGetObjectsList(
  context: HandlerContext,
  args: {
    parent_name?: string;
    parent_tech_name?: string;
    parent_type?: string;
    objects?: Array<{ parent_type?: string; parent_name?: string }>;
    with_short_descriptions?: boolean;
  },
) {
  const {
    parent_name,
    parent_tech_name,
    parent_type,
    objects: listed,
    with_short_descriptions,
  } = args;

  const withDescriptions =
    with_short_descriptions !== undefined
      ? Boolean(with_short_descriptions)
      : true;

  if (listed !== undefined) {
    if (
      parent_name !== undefined ||
      !Array.isArray(listed) ||
      listed.length === 0
    ) {
      return return_error(
        'Give exactly one of parent_name or objects (a non-empty list of { parent_type, parent_name })',
      );
    }
    for (const entry of listed) {
      if (
        typeof entry?.parent_type !== 'string' ||
        entry.parent_type.trim() === '' ||
        typeof entry?.parent_name !== 'string' ||
        entry.parent_name.trim() === ''
      ) {
        return return_error(
          'Each entry of objects needs parent_type and parent_name (non-empty strings).',
        );
      }
    }
    const parents = listed.map((entry) => ({
      type: String(entry.parent_type),
      name: String(entry.parent_name).toUpperCase(),
    }));
    return answer(
      { tool: 'GetObjectsList', detail: 'terse' },
      async () =>
        ok(
          await byLevels(context, (mode) =>
            walkParents(context, mode, parents, withDescriptions),
          ),
        ),
      (walks: ParentWalk[]) => {
        const entries = walks.map((walk, i) => {
          const asked = {
            parent_name: listed[i]?.parent_name,
            parent_type: listed[i]?.parent_type,
          };
          return walk.ok
            ? {
                ...asked,
                total_objects: walk.objects.length,
                objects: walk.objects,
              }
            : { ...asked, error: failureOfWalk(walk) };
        });
        // The node rows of every parent read, for the cache's reader.
        objectsListCache.setCache({
          objects: walks.flatMap((walk) => (walk.ok ? walk.objects : [])),
        });
        return entries;
      },
    );
  }

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

  const parentName = parent_name.toUpperCase();

  // Task 28: why this tool carries no `detail`. The node-level family's
  // shape (`ourUtils.node` / `nodeLevel`, `lib/strategies/packageWalk.ts`):
  // a real ADT document is fetched per node, but `nodeLevel` parses
  // `answer.data` and returns only the reduced `NodeLevel` it builds —
  // never keeping the wire text beside it. There is no `.raw` for
  // `detail: 'raw'` to answer without changing that shared strategy, and
  // this tool's own answer besides is a composite assembled from a
  // walk over many such calls, not one reading.
  return answer(
    { tool: 'GetObjectsList', detail: 'terse' },
    async () => {
      const [walk] = await byLevels(context, (mode) =>
        walkParents(
          context,
          mode,
          [{ type: parent_type, name: parentName }],
          withDescriptions,
        ),
      );
      if (walk?.ok) return ok(walk.objects);
      // The first refusal anywhere in the tree, as the method answered it.
      if (walk?.response !== undefined) {
        return walk.response as IAdtResponse<FlatObject[], IAdtError>;
      }
      throw walk?.thrown;
    },
    (objects: FlatObject[]) => {
      const result = {
        parent_name,
        parent_tech_name,
        parent_type,
        total_objects: objects.length,
        objects,
      };
      objectsListCache.setCache(result);
      return result;
    },
  );
}
