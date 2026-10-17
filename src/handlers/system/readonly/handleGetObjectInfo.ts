import type {
  IAdtError,
  IAdtFailure,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import {
  answer,
  failedPayloadOf,
  failureEntry,
  isCredentialPayload,
  type McpResult,
  thrownEntry,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import {
  byLevels,
  kindOf,
  levelReader,
  type NodeLevel,
  type NodeRequest,
  type ReadMode,
  readNode,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { handleSearchObject } from '../../search/readonly/handleSearchObject';

export const TOOL_DEFINITION = {
  name: 'GetObjectInfo',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Return ABAP object tree structure for packages (DEVC), classes (CLAS), programs (PROG), function groups (FUGR), and other objects. Shows root, group nodes, and terminal leaves up to maxDepth. Enrich each node with description and package via SearchObject if enrich=true. Takes parent_type and parent_name (one object: its tree) or objects (several objects: one tree per object, in the order given; a failed one as { OBJECT_TYPE, OBJECT_NAME, error }). Read in ADT batch envelopes: per tier the root node structures of its nodes, then their type nodes; with enrich, the search of every node last.',
  ),
  inputSchema: {
    type: 'object',
    properties: {
      timeout: TIMEOUT_PROPERTY,
      parent_type: {
        type: 'string',
        description:
          '[read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P); with parent_name, or give objects',
      },
      parent_name: {
        type: 'string',
        description: '[read-only] Parent object name',
      },
      objects: {
        type: 'array',
        description:
          '[read-only] Several objects, read together (give this or parent_type and parent_name)',
        items: {
          type: 'object',
          properties: {
            object_type: {
              type: 'string',
              description: 'Object type (e.g. DEVC/K, CLAS/OC, PROG/P)',
            },
            object_name: { type: 'string', description: 'Object name' },
          },
          required: ['object_type', 'object_name'],
        },
      },
      maxDepth: {
        type: 'integer',
        description:
          "[read-only] Maximum tree depth (default depends on type). Every object's own type folders and their contents are always shown (one tier); a higher value only descends further for PACKAGES, expanding nested subpackages that many tiers deep — no captured node-structure document shows a non-package object usefully recursable beyond its own type folders, so other object types are capped at one tier regardless of a higher value here.",
        default: 1,
      },
      enrich: {
        type: 'boolean',
        description:
          '[read-only] Whether to add description and package via SearchObject (default true)',
        default: true,
      },
    },
    required: [],
  },
} as const;

function getDefaultDepth(parent_type: string): number {
  const type = parent_type?.toUpperCase() || '';
  if (type.startsWith('PROG/') || type.startsWith('FUGR/')) return 2;
  return 1;
}

interface TreeNode {
  OBJECT_TYPE: string;
  OBJECT_NAME: string;
  OBJECT_DESCRIPTION?: string;
  OBJECT_PACKAGE?: string;
  CHILDREN?: TreeNode[];
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

/**
 * Each tree node is enriched with description/package via `SearchObject`
 * (best effort — a search failure never fails the tree, matching the
 * pre-migration handler).
 *
 * `SearchObject`'s answer is now the tab-separated `name\ttype\tdescription\t
 * package` table this migration gives it (`handleSearchObject.ts`), not the
 * `<adtcore:objectReference>` XML the pre-migration handler parsed — both
 * files were migrated together in this task, so the contract between them is
 * updated on both ends rather than one side guessing at the other's old shape.
 *
 * `Ended`: where a credential failure the enrichment search answered is
 * kept: every further request would be refused again, so the call ends with
 * that answer as it came.
 */
interface Ended {
  answer?: McpResult;
}

/** What a node's enrichment search found: its package, description and type. */
interface Enrichment {
  packageName?: string;
  description?: string;
  type: string;
}

/**
 * A node's enrichment from its `SearchObject` answer. A credential failure
 * is kept in `ended`; any other failed search leaves the node as it was.
 */
function enrichmentOf(
  searchResult: McpResult | undefined,
  objectType: string,
  objectName: string,
  ended: Ended,
): Enrichment {
  const none: Enrichment = { type: objectType };
  if (searchResult === undefined) return none;
  const failure = failedPayloadOf(searchResult, 'search');
  if (failure !== undefined && isCredentialPayload(failure)) {
    ended.answer = searchResult;
    return none;
  }
  if (!searchResult.isError && Array.isArray(searchResult.content)) {
    for (const entry of searchResult.content) {
      if (!('text' in entry) || typeof entry.text !== 'string') continue;
      const [, ...rows] = entry.text.split('\n'); // drop the header row
      for (const line of rows) {
        const [name, hitType, hitDescription, hitPackage] = line.split('\t');
        if (name && name.toUpperCase() === objectName.toUpperCase()) {
          return {
            packageName: hitPackage || undefined,
            description: hitDescription || undefined,
            type: hitType || objectType,
          };
        }
      }
    }
  }
  return none;
}

/** A node of a tree: an object read with its own type folders. */
interface InfoNode {
  root: number;
  type: string;
  name: string;
  depth: number;
  children: Array<TreeNode | InfoNode>;
  enrichment?: Enrichment;
}

/** A root's walk failed: its first refused read (`response`) or throw. */
interface FailedTree {
  response?: IAdtFailure;
  thrown?: unknown;
}

function isInfoNode(node: TreeNode | InfoNode): node is InfoNode {
  return 'depth' in node;
}

function treeNodeOf(node: InfoNode): TreeNode {
  const children = node.children.map((c) =>
    isInfoNode(c) ? treeNodeOf(c) : c,
  );
  const enrichment = node.enrichment ?? { type: node.type };
  return {
    OBJECT_TYPE: enrichment.type || node.type,
    OBJECT_NAME: node.name,
    ...(enrichment.description
      ? { OBJECT_DESCRIPTION: enrichment.description }
      : {}),
    ...(enrichment.packageName
      ? { OBJECT_PACKAGE: enrichment.packageName }
      : {}),
    ...(children.length > 0 ? { CHILDREN: children } : {}),
  };
}

function leafOf(o: NodeLevel['objects'][number]): TreeNode {
  return {
    OBJECT_TYPE: o.type,
    OBJECT_NAME: o.name,
    ...(o.description ? { OBJECT_DESCRIPTION: o.description } : {}),
  };
}

/** The trees of a call: one per root; the roots whose walk failed, with the failure. */
interface Trees {
  roots: InfoNode[];
  failures: Map<number, FailedTree>;
}

/**
 * Every root's tree, tier by tier (spec §11): per tier, (a) the root node
 * structure of every node of the tier, read together; (b) every type folder
 * those roots list, read together; the next tier is the packages found that
 * are walked further. With `enrich`, a last phase: one search per node. Each
 * node is the object itself, enriched, plus its children.
 *
 * **Corpus-informed, not the pre-migration algorithm ported unchanged.** The
 * pre-migration handler read only `DATA.TREE_CONTENT.SEU_ADT_REPOSITORY_OBJ_NODE`
 * and recursed into an entry there when it looked like a "group node" (a
 * `NODE_ID` with no `OBJECT_URI`). Across all eight `read-object-tree-structure`
 * fixtures under `tests/fixtures/adt/` — BDEF, FUGR, service definition,
 * structure, table, across every depth captured — no entry ever carries a
 * `NODE_ID`: real content lives in `DATA.OBJECT_TYPES.SEU_ADT_OBJECT_TYPE_INFO`
 * (the type folders `nodeLevel`'s `childNodes` reads), which the pre-migration
 * handler never read at all. For a package root, `TREE_CONTENT` is empty in
 * fixture 01 — so at the tool's own default `maxDepth` of 1, the pre-migration
 * handler answered an empty `CHILDREN` for the single most common call
 * (`parent_type: 'DEVC/K'`). This version reads both halves of the one
 * document `ourUtils.node` (`nodeLevel`) already parses: direct objects at
 * this level, plus one fetch per type folder for the objects inside it —
 * matching `walkPackage`'s own two-tier walk in `packageWalk.ts`, which is
 * exercised by `handleGetPackageContents`/`handleGetPackageTree` today. Also
 * dropped: `PARENT_NODE_ID` — the pre-migration handler read that field name,
 * but the corpus shows the real field is `PARENT_NAME` (`PARENT_NODE_ID`
 * never appears at all); `PARENT_NODE_ID` was therefore always `undefined`
 * and `JSON.stringify` drops `undefined` values, so nothing observable
 * changes by not carrying it forward. Likewise the root call sends no
 * `nodeId` at all (`{withShortDescriptions:true}` only) — the corpus shows
 * ADT's own root request omits it too; the pre-migration handler's `'0000'`
 * was that handler's own invention, not something the wire ever needed.
 *
 * `maxDepth` is a real recursion limit, not a boolean gate. `depth < maxDepth`
 * still controls whether THIS node's own children are fetched at all — so
 * `maxDepth: 0` answers a leaf with no `CHILDREN`, matching the pre-migration
 * contract. Beyond that first tier, a child that is itself a PACKAGE
 * (`kindOf(o.type) === 'package'`, the same test `walkPackage` already uses
 * for exactly this) is recursed into as a fresh subtree when `depth + 1 <
 * maxDepth`, so `maxDepth: 2`/`3`/… genuinely walks further into nested
 * subpackages — the one case the corpus's `walkPackage` precedent actually
 * evidences. Every other object type's own children (a function group's
 * function modules, a program's includes, …) are added as leaves without a
 * further fetch: no captured document shows those usefully recursable this
 * same way, and inventing that behaviour blind is exactly what this task's
 * corpus-first rule forbids. Named in `maxDepth`'s own schema description
 * rather than left to silently do nothing past two tiers.
 *
 * A refusal at ANY fetch — the root's, a type folder's, or a recursed
 * subpackage's — is its root's answer as-is (for one object, it bubbles to
 * `answer()` unchanged), and nothing more of that root is read.
 */
async function buildTrees(
  context: HandlerContext,
  mode: ReadMode,
  objects: ReadonlyArray<{ type: string; name: string; maxDepth: number }>,
  enrich: boolean,
  ended: Ended,
): Promise<Trees> {
  const read = levelReader<NodeRequest, unknown>(
    context,
    mode,
    (request, connection) =>
      readNode(
        createAdtClient(connection, context.logger).getUtils(ourUtils),
        request,
      ),
  );
  const failures = new Map<number, FailedTree>();
  const roots: InfoNode[] = objects.map((o, root) => ({
    root,
    type: o.type,
    name: o.name,
    depth: 0,
    children: [],
  }));
  const nodes: InfoNode[] = [...roots];
  const limit = (node: InfoNode) => objects[node.root]?.maxDepth ?? 0;
  /** The level a read answered, or undefined once its root failed. */
  const settle = (
    node: InfoNode,
    result:
      | { ok: true; value: unknown }
      | { ok: false; error: unknown }
      | undefined,
  ): NodeLevel | undefined => {
    if (failures.has(node.root)) return undefined;
    if (result === undefined || !result.ok) {
      failures.set(node.root, { thrown: result?.error });
      return undefined;
    }
    const response = result.value as IAdtResponse<unknown, IAdtError>;
    if (!response.ok) {
      failures.set(node.root, { response });
      return undefined;
    }
    return response.getResult().value as NodeLevel;
  };

  let tier = roots.filter((node) => node.depth < limit(node));
  while (tier.length > 0) {
    // (a) The root node structure of every node of the tier.
    const rootAnswers = await read(
      tier.map((node) => ({
        parentType: node.type,
        parentName: node.name,
        withShortDescriptions: true,
        analysed: true,
      })),
    );
    const typeNodes: Array<{ node: InfoNode; nodeId: string }> = [];
    tier.forEach((node, i) => {
      const level = settle(node, rootAnswers[i]);
      if (level === undefined) return;
      node.children.push(...level.objects.map(leafOf));
      for (const child of level.childNodes) {
        typeNodes.push({ node, nodeId: child.nodeId });
      }
    });
    // (b) Every type folder those roots list.
    const typeAnswers =
      typeNodes.length > 0
        ? await read(
            typeNodes.map(({ node, nodeId }) => ({
              parentType: node.type,
              parentName: node.name,
              nodeId,
              withShortDescriptions: true,
              analysed: true,
            })),
          )
        : [];
    const next: InfoNode[] = [];
    typeNodes.forEach(({ node }, i) => {
      const level = settle(node, typeAnswers[i]);
      if (level === undefined) return;
      for (const o of level.objects) {
        if (kindOf(o.type) === 'package' && node.depth + 1 < limit(node)) {
          const sub: InfoNode = {
            root: node.root,
            type: o.type,
            name: o.name,
            depth: node.depth + 1,
            children: [],
          };
          node.children.push(sub);
          nodes.push(sub);
          next.push(sub);
        } else {
          node.children.push(leafOf(o));
        }
      }
    });
    tier = next.filter((node) => !failures.has(node.root));
  }

  if (enrich) {
    // The last phase: one search per node of every tree that answered.
    const searched = nodes.filter((node) => !failures.has(node.root));
    const searches = await levelReader<InfoNode, McpResult>(
      context,
      mode,
      async (node, connection) =>
        (await handleSearchObject(
          { ...context, connection },
          { object_name: node.name, object_type: node.type, maxResults: 1 },
        )) as McpResult,
    )(searched);
    searched.forEach((node, i) => {
      const search = searches[i];
      // Enrichment is best-effort; the tree still answers without it.
      node.enrichment = enrichmentOf(
        search?.ok ? search.value : undefined,
        node.type,
        node.name,
        ended,
      );
    });
  }

  return { roots, failures };
}

export async function handleGetObjectInfo(
  context: HandlerContext,
  args: {
    parent_type?: string;
    parent_name?: string;
    objects?: Array<{ object_type?: string; object_name?: string }>;
    maxDepth?: number;
    enrich?: boolean;
  },
) {
  const { logger } = context;
  const listed = args?.objects;
  let objects: Array<{ type: string; name: string }>;
  if (listed !== undefined) {
    if (
      args.parent_type !== undefined ||
      args.parent_name !== undefined ||
      !Array.isArray(listed) ||
      listed.length === 0
    ) {
      return return_error(
        'Give exactly one of parent_type and parent_name, or objects (a non-empty list of { object_type, object_name })',
      );
    }
    if (
      listed.some(
        (o) =>
          typeof o?.object_type !== 'string' ||
          !o.object_type ||
          typeof o?.object_name !== 'string' ||
          !o.object_name,
      )
    ) {
      return return_error(
        'Each entry of objects needs object_type and object_name',
      );
    }
    objects = listed.map((o) => ({
      type: String(o.object_type),
      name: String(o.object_name),
    }));
  } else {
    if (!args?.parent_type || !args?.parent_name) {
      return return_error('parent_type and parent_name are required');
    }
    objects = [{ type: args.parent_type, name: args.parent_name }];
  }
  logger?.info(
    `Building object info tree for ${objects.map((o) => `${o.type}/${o.name}`).join(', ')}`,
  );
  const depthOf = (type: string) =>
    Number.isInteger(args.maxDepth)
      ? (args.maxDepth as number)
      : getDefaultDepth(type);
  const enrich = typeof args.enrich === 'boolean' ? args.enrich : true;
  const asked = objects.map((o) => ({ ...o, maxDepth: depthOf(o.type) }));

  // Task 28: why this tool carries no `detail`. The node-level family's
  // shape (`ourUtils.node` / `nodeLevel`, `lib/strategies/packageWalk.ts`):
  // `nodeLevel` parses `answer.data` and returns only the reduced
  // `NodeLevel` it builds, never keeping the wire text beside it — there is
  // no `.raw` for `detail: 'raw'` to answer without changing that shared
  // strategy. This tool's own answer besides is a composite tree assembled
  // from several such calls (`buildTrees`), not one reading.
  let ended: Ended = {};
  const answered = await answer(
    { tool: 'GetObjectInfo', detail: 'terse' },
    async () => {
      const trees = await byLevels(context, (mode) => {
        ended = {};
        return buildTrees(context, mode, asked, enrich, ended);
      });
      if (listed === undefined) {
        const failed = trees.failures.get(0);
        if (failed?.response !== undefined) {
          return failed.response as IAdtResponse<TreeNode[], IAdtError>;
        }
        if (failed !== undefined) throw failed.thrown;
      }
      return ok(
        trees.roots.map((root) => {
          const failed = trees.failures.get(root.root);
          if (failed === undefined) return treeNodeOf(root);
          return {
            OBJECT_TYPE: root.type,
            OBJECT_NAME: root.name,
            error:
              failed.response !== undefined
                ? failureEntry(
                    failed.response.getError(),
                    'read node structure',
                  )
                : thrownEntry(failed.thrown, 'read node structure'),
          } as unknown as TreeNode;
        }),
      );
    },
    (trees: TreeNode[]) => (listed === undefined ? trees[0] : trees),
  );
  // A credential failure the enrichment search answered ends the call as it came.
  return ended.answer ?? answered;
}
