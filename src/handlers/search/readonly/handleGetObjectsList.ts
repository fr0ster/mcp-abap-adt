import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
export const TOOL_DEFINITION = {
  name: 'GetObjectsList',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Recursively lists every child repository object of the program (PROG), function group (FUGR), class (CLAS), package (DEVC) or other composite object named by parent_name, parent_tech_name and parent_type, nested includes and subcomponents included. Takes parent_name, parent_tech_name and parent_type (one parent: its list) or objects (several parents: one entry per parent, in the order given, each { parent_name, parent_type, total_objects, objects } or { parent_name, parent_type, error }). Each level of the node tree is read in one ADT batch envelope.',
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

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtFailure,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import {
  type AdtHeadersContext,
  withAdtHeaders,
} from '../../../lib/adtHeaders/withAdtHeaders';
import {
  answer,
  type FailureEntry,
  failureEntry,
  isCredentialPayload,
  thrownEntry,
} from '../../../lib/answer';
import { withSequentialFallback } from '../../../lib/batch/phases';
import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  batchReader,
  endsTheCall,
  type NodeLevel,
  type NodeRequest,
  nodeStructureOn,
  readNode,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

function utilsOf(context: HandlerContext) {
  return createAdtClient(context.connection, context.logger).getUtils(ourUtils);
}

type NodeSource = ReturnType<typeof utilsOf>;

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

function ok(objects: FlatObject[]): IAdtResponse<FlatObject[], IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value: objects }),
    getError: () => {
      throw new Error('asked for the error of a success');
    },
  } as unknown as IAdtResponse<FlatObject[], IAdtError>;
}

function flatObjects(level: NodeLevel): FlatObject[] {
  return level.objects.map((o) => ({
    OBJECT_TYPE: o.type,
    OBJECT_NAME: o.name,
    ...(o.techName ? { TECH_NAME: o.techName } : {}),
    ...(o.uri ? { OBJECT_URI: o.uri } : {}),
  }));
}

/**
 * Walk the node structure recursively, one `fetchNodeStructure` call per
 * node — the same recursion this tool ran before the migration, over
 * `ourUtils.node` (`nodeLevel`) instead of a hand-rolled XML regex. Every
 * step keeps IAdtResponse's `ok`/`getResult`/`getError` shape rather than
 * throwing, so the FIRST refusal anywhere in the tree — not just at the
 * root — reaches `answer()` and is formatted the same way every other
 * handler in this migration formats one.
 */
async function collectValidObjects(
  context: AdtHeadersContext,
  utils: NodeSource,
  parentType: string,
  parentName: string,
  nodeId: string,
  withShortDescriptions: boolean,
  visited: Set<string>,
): Promise<IAdtResponse<FlatObject[], IAdtError>> {
  if (visited.has(nodeId)) return ok([]);
  visited.add(nodeId);

  const response = await withAdtHeaders(
    context,
    'utils.fetchNodeStructure',
    (headers) =>
      utils.fetchNodeStructure(parentType, parentName, {
        headers,
        analyse: analyseException,
        nodeId,
        withShortDescriptions,
      }),
  );
  if (!response.ok) return response as IAdtResponse<FlatObject[], IAdtError>;

  const level = response.getResult().value as NodeLevel;
  let objects: FlatObject[] = level.objects.map((o) => ({
    OBJECT_TYPE: o.type,
    OBJECT_NAME: o.name,
    ...(o.techName ? { TECH_NAME: o.techName } : {}),
    ...(o.uri ? { OBJECT_URI: o.uri } : {}),
  }));

  for (const child of level.childNodes) {
    const childResult = await collectValidObjects(
      context,
      utils,
      parentType,
      parentName,
      child.nodeId,
      withShortDescriptions,
      visited,
    );
    if (!childResult.ok) return childResult;
    objects = objects.concat(childResult.getResult().value);
  }

  return ok(objects);
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

/** A parent's read that threw: its throw, as it came. */
interface Thrown {
  ok: false;
  thrown: unknown;
}

/**
 * A parent's walk: its objects, its first refused read as the method
 * answered it, or its throw.
 */
type ParentWalk = IAdtResponse<FlatObject[], IAdtError> | Thrown;

/**
 * Every parent's walk, and the refusal that ended the call when one did: a
 * credential failure SAP answered (a `401`) ends it as it came.
 */
interface ParentWalks {
  walks: ParentWalk[];
  ended?: IAdtFailure;
}

/** A refused read SAP answered with a credential failure. */
function credentialRefused(response: IAdtFailure): boolean {
  return isCredentialPayload(
    failureEntry(response.getError(), 'read node structure'),
  );
}

function flatten(node: ListNode): FlatObject[] {
  return [...node.objects, ...node.children.flatMap(flatten)];
}

/**
 * Every parent's node tree in ADT batch envelopes, level by level (spec
 * §11): per level, the node structure of every node of the level, read
 * together; every child node a level lists is read in the next. Each
 * parent's objects in the order the recursion gives them (a node's own, then
 * each child node's subtree); a parent's first refused read is its answer,
 * and nothing more of it is read. A failure that ends the call is thrown as
 * it came; a credential failure SAP answered ends the reads.
 */
async function walkParentsBatched(
  context: HandlerContext,
  parents: readonly Parent[],
  withShortDescriptions: boolean,
): Promise<ParentWalks> {
  const read = batchReader<NodeRequest, unknown>(context, (request, c) =>
    readNode(
      nodeStructureOn(
        context,
        createAdtClient(c, context.logger).getUtils(ourUtils),
      ),
      request,
    ),
  );
  const failures = new Map<number, IAdtFailure | Thrown>();
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
        parentType: (parents[node.root] as Parent).type,
        parentName: (parents[node.root] as Parent).name,
        nodeId: node.nodeId,
        withShortDescriptions,
        analysed: true,
      })),
    );
    const next: ListNode[] = [];
    for (const [i, node] of level.entries()) {
      if (failures.has(node.root)) continue;
      const result = answers[i] as (typeof answers)[number];
      // A read that threw is its parent's failure; one that ends the call
      // (a credential failure) is thrown as it came.
      if (!result.ok) {
        if (endsTheCall(result.error)) throw result.error;
        failures.set(node.root, { ok: false, thrown: result.error });
        continue;
      }
      const response = result.value as IAdtResponse<unknown, IAdtError>;
      if (!response.ok) {
        if (credentialRefused(response)) {
          return { walks: [], ended: response };
        }
        failures.set(node.root, response);
        continue;
      }
      const found = response.getResult().value as NodeLevel;
      node.objects = flatObjects(found);
      const seen = visited[node.root] as Set<string>;
      for (const child of found.childNodes) {
        if (seen.has(child.nodeId)) continue;
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
    }
    level = next.filter((node) => !failures.has(node.root));
  }

  return {
    walks: roots.map(
      (root) =>
        (failures.get(root.root) as ParentWalk | undefined) ??
        ok(flatten(root)),
    ),
  };
}

/**
 * The sequential version — the code path this tool has always had — one
 * parent after another (`collectValidObjects`); a credential failure SAP
 * answered ends the reads, and nothing after it is read.
 */
async function walkParentsSequential(
  context: HandlerContext,
  parents: readonly Parent[],
  withShortDescriptions: boolean,
): Promise<ParentWalks> {
  const utils = utilsOf(context);
  const walks: ParentWalk[] = [];
  for (const parent of parents) {
    let walk: ParentWalk;
    try {
      walk = await collectValidObjects(
        context,
        utils,
        parent.type,
        parent.name,
        '000000',
        withShortDescriptions,
        new Set(),
      );
    } catch (thrown) {
      if (endsTheCall(thrown)) throw thrown;
      walk = { ok: false, thrown };
    }
    if (!walk.ok && !('thrown' in walk) && credentialRefused(walk)) {
      return { walks, ended: walk };
    }
    walks.push(walk);
  }
  return { walks };
}

/** A failed parent walk as an entry: the method's error as it is, with its step. */
function failureOfWalk(walk: IAdtFailure | Thrown): FailureEntry {
  return 'thrown' in walk
    ? thrownEntry(walk.thrown, 'read node structure')
    : failureEntry(walk.getError(), 'read node structure');
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

  if (Array.isArray(listed) && listed.length > 0) {
    if (
      parent_name !== undefined ||
      parent_tech_name !== undefined ||
      parent_type !== undefined
    ) {
      return return_error(
        'Give exactly one of parent_name, parent_tech_name and parent_type, or objects',
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
    let read: ParentWalks = { walks: [] };
    return answer(
      { tool: 'GetObjectsList', detail: 'terse' },
      async () => {
        read = await withSequentialFallback(
          context,
          () => walkParentsBatched(context, parents, withDescriptions),
          () => walkParentsSequential(context, parents, withDescriptions),
        );
        // A credential failure SAP answered ends the call as it came.
        if (read.ended !== undefined) {
          return read.ended as IAdtResponse<FlatObject[], IAdtError>;
        }
        return ok([]);
      },
      () =>
        read.walks.map((walk, i) => {
          const asked = {
            parent_name: listed[i]?.parent_name,
            parent_type: listed[i]?.parent_type,
          };
          return walk.ok
            ? {
                ...asked,
                total_objects: walk.getResult().value.length,
                objects: walk.getResult().value,
              }
            : { ...asked, error: failureOfWalk(walk) };
        }),
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
  // recursive walk over many such calls, not one reading.
  return answer(
    { tool: 'GetObjectsList', detail: 'terse' },
    () =>
      withSequentialFallback(
        context,
        async () => {
          const read = await walkParentsBatched(
            context,
            [{ type: parent_type, name: parentName }],
            withDescriptions,
          );
          const walk = (read.ended ?? read.walks[0]) as ParentWalk;
          if ('thrown' in walk) throw walk.thrown;
          return walk;
        },
        () =>
          collectValidObjects(
            context,
            utilsOf(context),
            parent_type,
            parentName,
            '000000',
            withDescriptions,
            new Set(),
          ),
      ),
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
