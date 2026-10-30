import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  AdtTypeCode,
  IAdtError,
  IAdtFailure,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';
import type { IServerAdtClient } from '../../../lib/adtClientContract';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  notATableType,
  tableCodeOf,
  tableTypeOf,
} from '../../../lib/adtTypeCode';
import {
  answer,
  failedPayloadOf,
  failureEntry,
  isCredentialPayload,
  type McpResult,
  thrownEntry,
} from '../../../lib/answer';
import { withSequentialFallback } from '../../../lib/batch/phases';
import { createAdtClient, variantOf } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { TIMEOUT_PROPERTY, withLongToolAdvice } from '../../../lib/longTools';
import {
  type MetadataTarget,
  metadataKeyOf,
} from '../../../lib/strategies/metadataReads';
import {
  batchReader,
  endsTheCall,
  kindOf,
  metadataDescriptions,
  type NodeLevel,
  type NodeRequest,
  nodeStructureOn,
  readNode,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { handleSearchObject } from '../../search/readonly/handleSearchObject';

export const TOOL_DEFINITION = {
  name: 'GetObjectInfo',
  available_in: ['onprem', 'cloud'] as const,
  description: withLongToolAdvice(
    '[read-only] Returns the object tree of the package (DEVC), class (CLAS), program (PROG), function group (FUGR) or other object named by parent_type and parent_name. Shows root, group nodes, and terminal leaves up to maxDepth. With enrich=true each node also carries its description and package, from a repository search. Takes parent_type and parent_name (one object: its tree) or objects (several objects: one tree per object, in the order given; a failed one as { OBJECT_TYPE, OBJECT_NAME, error }). Read in ADT batch envelopes: per tier the root node structures of its nodes, then their type nodes; with enrich, the search of every node last.',
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
      include_descriptions: {
        type: 'boolean',
        description:
          "[read-only] Include each leaf's description. Where the system serves ADT batch, each description is read from the leaf's metadata: one more read per leaf, which on a large tree takes most of the call (default false)",
        default: false,
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

/**
 * The trees of a call: one per root; the roots whose walk failed, with their
 * first refused read; and the refusal that ended the call when SAP answered
 * a credential failure (a `401`).
 */
/** A root's read that threw: its throw, as it came. */
interface Thrown {
  ok: false;
  thrown: unknown;
}

interface Trees {
  roots: InfoNode[];
  failures: Map<number, IAdtFailure | Thrown>;
  ended?: IAdtFailure;
}

/** A refused read SAP answered with a credential failure. */
function credentialRefused(response: IAdtFailure): boolean {
  return isCredentialPayload(
    failureEntry(response.getError(), 'read node structure'),
  );
}

/**
 * A node's enrichment, searched on its own (the sequential version): best
 * effort — a search failure never fails the tree — and a credential failure
 * kept in `ended`.
 */
async function enrichNodeWithSearchObject(
  context: HandlerContext,
  objectType: string,
  objectName: string,
  ended: Ended,
): Promise<Enrichment> {
  try {
    const searchResult = (await handleSearchObject(context, {
      object_name: objectName,
      object_type: objectType,
      maxResults: 1,
    })) as McpResult;
    return enrichmentOf(searchResult, objectType, objectName, ended);
  } catch {
    // Enrichment is best-effort; the tree still answers without it.
    return { type: objectType };
  }
}

type NodeSource = ReturnType<IServerAdtClient['getUtils']>;

/**
 * One tree node: the object itself, enriched, plus its children — the
 * sequential version, where the destination has no communication batch.
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
 * subpackage's — is returned as-is and bubbles to `answer()` unchanged, the
 * same short-circuit `handleGetObjectsList.ts` uses.
 */
async function buildTree(
  context: HandlerContext,
  utils: NodeSource,
  objectType: AdtTypeCode,
  objectName: string,
  depth: number,
  maxDepth: number,
  enrich: boolean,
  describe: boolean,
  ended: Ended,
): Promise<IAdtResponse<TreeNode, IAdtError>> {
  const enrichment = enrich
    ? await enrichNodeWithSearchObject(context, objectType, objectName, ended)
    : { type: objectType, description: undefined, packageName: undefined };
  // The credential failure ends the walk; the handler answers it as it came.
  if (ended.answer !== undefined)
    return ok({ OBJECT_TYPE: objectType, OBJECT_NAME: objectName });

  const children: TreeNode[] = [];

  if (depth < maxDepth) {
    const rootResponse = await withAdtHeaders(
      context,
      'utils.fetchNodeStructure',
      (headers) =>
        utils.fetchNodeStructure(objectType, objectName, {
          headers,
          analyse: analyseException,
          withShortDescriptions: describe,
        }),
    );
    if (!rootResponse.ok) {
      return rootResponse as IAdtResponse<TreeNode, IAdtError>;
    }
    const root = rootResponse.getResult().value as NodeLevel;

    for (const o of root.objects) {
      children.push({
        OBJECT_TYPE: o.type,
        OBJECT_NAME: o.name,
        ...(o.description ? { OBJECT_DESCRIPTION: o.description } : {}),
      });
    }

    for (const child of root.childNodes) {
      const childResponse = await withAdtHeaders(
        context,
        'utils.fetchNodeStructure',
        (headers) =>
          utils.fetchNodeStructure(objectType, objectName, {
            headers,
            analyse: analyseException,
            nodeId: child.nodeId,
            withShortDescriptions: describe,
          }),
      );
      if (!childResponse.ok) {
        return childResponse as IAdtResponse<TreeNode, IAdtError>;
      }
      const childLevel = childResponse.getResult().value as NodeLevel;
      for (const o of childLevel.objects) {
        // A subpackage is walked further by its code; a type ADT sent that
        // is no code of the tables stays a leaf.
        const subType = tableCodeOf(o.type);
        if (
          subType !== undefined &&
          kindOf(o.type) === 'package' &&
          depth + 1 < maxDepth
        ) {
          const subtree = await buildTree(
            context,
            utils,
            subType,
            o.name,
            depth + 1,
            maxDepth,
            enrich,
            describe,
            ended,
          );
          if (ended.answer !== undefined) return subtree;
          if (!subtree.ok) {
            return subtree as IAdtResponse<TreeNode, IAdtError>;
          }
          children.push(subtree.getResult().value);
        } else {
          children.push({
            OBJECT_TYPE: o.type,
            OBJECT_NAME: o.name,
            ...(o.description ? { OBJECT_DESCRIPTION: o.description } : {}),
          });
        }
      }
    }
  }

  return ok({
    OBJECT_TYPE: enrichment.type || objectType,
    OBJECT_NAME: objectName,
    ...(enrichment.description
      ? { OBJECT_DESCRIPTION: enrichment.description }
      : {}),
    ...(enrichment.packageName
      ? { OBJECT_PACKAGE: enrichment.packageName }
      : {}),
    ...(children.length > 0 ? { CHILDREN: children } : {}),
  });
}

/**
 * Every root's tree in ADT batch envelopes, tier by tier (spec §11): per
 * tier, (a) the root node structure of every node of the tier, read
 * together; (b) every type folder those roots list, read together; the next
 * tier is the packages found that are walked further, as `buildTree` walks
 * them. Then one phase: the metadata of every leaf, whose
 * `adtcore:description` is the leaf's description. With `enrich`, a last
 * phase: one search per node. A root's first
 * refused read is its answer, and nothing more of it is read; a credential
 * failure SAP answered ends the reads.
 */
async function buildTrees(
  context: HandlerContext,
  objects: ReadonlyArray<{
    type: AdtTypeCode;
    name: string;
    maxDepth: number;
  }>,
  enrich: boolean,
  describe: boolean,
  ended: Ended,
): Promise<Trees> {
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
  const roots: InfoNode[] = objects.map((o, root) => ({
    root,
    type: o.type,
    name: o.name,
    depth: 0,
    children: [],
  }));
  const nodes: InfoNode[] = [...roots];
  /** Every leaf of every tree, with its root and the object it reads. */
  const leaves: Array<{
    root: number;
    leaf: TreeNode;
    target: MetadataTarget;
  }> = [];
  /**
   * A leaf without the description its part carried: a node structure part
   * after the first of an envelope can carry another part's `DESCRIPTION`
   * (measured, 2026-10-18); the leaf's description is its metadata's.
   */
  const bareLeaf = (node: InfoNode, o: NodeLevel['objects'][number]) => {
    const leaf: TreeNode = { OBJECT_TYPE: o.type, OBJECT_NAME: o.name };
    // A function module or include is read at its group: the node it was
    // found under.
    const functionGroup = node.type.toUpperCase().startsWith('FUGR')
      ? node.name
      : undefined;
    leaves.push({
      root: node.root,
      leaf,
      target: {
        type: o.type,
        name: o.name,
        ...(functionGroup !== undefined ? { functionGroup } : {}),
      },
    });
    return leaf;
  };
  const limit = (node: InfoNode) =>
    (objects[node.root] as (typeof objects)[number]).maxDepth;
  let ending: IAdtFailure | undefined;
  /** The level a read answered, or undefined once its root failed. */
  const settle = (
    node: InfoNode,
    result: Awaited<ReturnType<typeof read>>[number],
  ): NodeLevel | undefined => {
    if (failures.has(node.root) || ending !== undefined) return undefined;
    // A read that threw is its root's failure; one that ends the call (a
    // credential failure) is thrown as it came.
    if (!result.ok) {
      if (endsTheCall(result.error)) throw result.error;
      failures.set(node.root, { ok: false, thrown: result.error });
      return undefined;
    }
    const response = result.value as IAdtResponse<unknown, IAdtError>;
    if (!response.ok) {
      if (credentialRefused(response)) ending = response;
      else failures.set(node.root, response);
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
        withShortDescriptions: describe,
        analysed: true,
      })),
    );
    const typeNodes: Array<{ node: InfoNode; nodeId: string }> = [];
    tier.forEach((node, i) => {
      const level = settle(node, rootAnswers[i] as (typeof rootAnswers)[0]);
      if (level === undefined) return;
      node.children.push(...level.objects.map((o) => bareLeaf(node, o)));
      for (const child of level.childNodes) {
        typeNodes.push({ node, nodeId: child.nodeId });
      }
    });
    if (ending !== undefined) return { roots, failures, ended: ending };
    // (b) Every type folder those roots list.
    const typeAnswers =
      typeNodes.length > 0
        ? await read(
            typeNodes.map(({ node, nodeId }) => ({
              parentType: node.type,
              parentName: node.name,
              nodeId,
              withShortDescriptions: describe,
              analysed: true,
            })),
          )
        : [];
    const next: InfoNode[] = [];
    typeNodes.forEach(({ node }, i) => {
      const level = settle(node, typeAnswers[i] as (typeof typeAnswers)[0]);
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
          node.children.push(bareLeaf(node, o));
        }
      }
    });
    if (ending !== undefined) return { roots, failures, ended: ending };
    tier = next.filter((node) => !failures.has(node.root));
  }

  // Asked for: every leaf's description from its metadata, in one phase.
  if (describe) {
    const described = leaves.filter(({ root }) => !failures.has(root));
    const { descriptions, refused } = await metadataDescriptions(
      context,
      described.map(({ target }) => target),
    );
    // A metadata read SAP refused with a credential failure ends the call as
    // a refused node read does: the method's error, with its step.
    if (refused !== undefined) return { roots, failures, ended: refused };
    for (const { leaf, target } of described) {
      const key = metadataKeyOf(target);
      const description = key === undefined ? undefined : descriptions.get(key);
      if (description) leaf.OBJECT_DESCRIPTION = description;
    }
  }

  if (enrich) {
    // The last phase: one search per node of every tree that answered.
    const searched = nodes.filter((node) => !failures.has(node.root));
    const searches = await batchReader<InfoNode, McpResult>(
      context,
      async (node, c) =>
        (await handleSearchObject(
          { ...context, connection: c },
          { object_name: node.name, object_type: node.type, maxResults: 1 },
        )) as McpResult,
    )(searched);
    searched.forEach((node, i) => {
      const search = searches[i] as (typeof searches)[number];
      // Enrichment is best-effort; the tree still answers without it.
      node.enrichment = enrichmentOf(
        search.ok ? search.value : undefined,
        node.type,
        node.name,
        ended,
      );
    });
  }

  return { roots, failures };
}

/**
 * The sequential version of a call for several objects — the code path this
 * tool has always had — one object after another (`buildTree`). A credential
 * failure, from a search or a node read SAP answered, ends the reads, and
 * nothing after it is read.
 */
async function buildTreesSequential(
  context: HandlerContext,
  objects: ReadonlyArray<{
    type: AdtTypeCode;
    name: string;
    maxDepth: number;
  }>,
  enrich: boolean,
  describe: boolean,
  ended: Ended,
): Promise<{
  trees: Array<IAdtResponse<TreeNode, IAdtError> | Thrown>;
  ended?: IAdtFailure;
}> {
  const utils = createAdtClient(context.connection, context.logger).getUtils(
    ourUtils,
  );
  const trees: Array<IAdtResponse<TreeNode, IAdtError> | Thrown> = [];
  for (const o of objects) {
    let tree: IAdtResponse<TreeNode, IAdtError> | Thrown;
    try {
      tree = await buildTree(
        context,
        utils,
        o.type,
        o.name,
        0,
        o.maxDepth,
        enrich,
        describe,
        ended,
      );
    } catch (thrown) {
      if (endsTheCall(thrown)) throw thrown;
      tree = { ok: false, thrown };
    }
    if (ended.answer !== undefined) break;
    if (!tree.ok && !('thrown' in tree) && credentialRefused(tree)) {
      return { trees, ended: tree };
    }
    trees.push(tree);
  }
  return { trees };
}

export async function handleGetObjectInfo(
  context: HandlerContext,
  args: {
    parent_type?: string;
    parent_name?: string;
    objects?: Array<{ object_type?: string; object_name?: string }>;
    maxDepth?: number;
    enrich?: boolean;
    include_descriptions?: boolean;
  },
) {
  const { logger } = context;
  const listed = args?.objects;
  let objects: Array<{ type: AdtTypeCode; name: string }>;
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
    objects = [];
    for (const o of listed) {
      const text = String(o.object_type);
      const variant = variantOf(context.connection);
      const type = tableTypeOf(text, variant);
      if (type === undefined) {
        return return_error(
          notATableType('objects[].object_type', text, variant),
        );
      }
      objects.push({ type, name: String(o.object_name) });
    }
  } else {
    if (!args?.parent_type || !args?.parent_name) {
      return return_error('parent_type and parent_name are required');
    }
    const variant = variantOf(context.connection);
    const type = tableTypeOf(args.parent_type, variant);
    if (type === undefined) {
      return return_error(
        notATableType('parent_type', args.parent_type, variant),
      );
    }
    objects = [{ type, name: args.parent_name }];
  }
  logger?.info(
    `Building object info tree for ${objects.map((o) => `${o.type}/${o.name}`).join(', ')}`,
  );
  const depthOf = (type: string) =>
    Number.isInteger(args.maxDepth)
      ? (args.maxDepth as number)
      : getDefaultDepth(type);
  const enrich = typeof args.enrich === 'boolean' ? args.enrich : true;
  const describe = args.include_descriptions === true;
  const asked = objects.map((o) => ({ ...o, maxDepth: depthOf(o.type) }));

  // Task 28: why this tool carries no `detail`. The node-level family's
  // shape (`ourUtils.node` / `nodeLevel`, `lib/strategies/packageWalk.ts`):
  // `nodeLevel` parses `answer.data` and returns only the reduced
  // `NodeLevel` it builds, never keeping the wire text beside it — there is
  // no `.raw` for `detail: 'raw'` to answer without changing that shared
  // strategy. This tool's own answer besides is a composite tree assembled
  // from several such calls (`buildTrees`), not one reading.
  let ended: Ended = {};
  const entryOf = (
    o: { type: string; name: string },
    failed: IAdtFailure | Thrown,
  ) =>
    ({
      OBJECT_TYPE: o.type,
      OBJECT_NAME: o.name,
      error:
        'thrown' in failed
          ? thrownEntry(failed.thrown, 'read node structure')
          : failureEntry(failed.getError(), 'read node structure'),
    }) as unknown as TreeNode;
  const answered = await answer(
    { tool: 'GetObjectInfo', detail: 'terse' },
    () =>
      withSequentialFallback<IAdtResponse<TreeNode[], IAdtError>>(
        context,
        async () => {
          ended = {};
          const trees = await buildTrees(
            context,
            asked,
            enrich,
            describe,
            ended,
          );
          if (trees.ended !== undefined) return trees.ended;
          const single = listed === undefined && trees.failures.get(0);
          if (single) {
            if ('thrown' in single) throw single.thrown;
            return single;
          }
          return ok(
            trees.roots.map((root) => {
              const failed = trees.failures.get(root.root);
              return failed === undefined
                ? treeNodeOf(root)
                : entryOf(asked[root.root] as (typeof asked)[number], failed);
            }),
          );
        },
        async () => {
          ended = {};
          if (listed === undefined) {
            const only = asked[0] as (typeof asked)[number];
            const tree = await buildTree(
              context,
              createAdtClient(context.connection, logger).getUtils(ourUtils),
              only.type,
              only.name,
              0,
              only.maxDepth,
              enrich,
              describe,
              ended,
            );
            return tree.ok ? ok([tree.getResult().value]) : tree;
          }
          const read = await buildTreesSequential(
            context,
            asked,
            enrich,
            describe,
            ended,
          );
          if (read.ended !== undefined) return read.ended;
          return ok(
            read.trees.map((tree, i) =>
              tree.ok
                ? tree.getResult().value
                : entryOf(asked[i] as (typeof asked)[number], tree),
            ),
          );
        },
      ),
    (trees: TreeNode[]) => (listed === undefined ? trees[0] : trees),
  );
  // A credential failure the enrichment search answered ends the call as it came.
  return ended.answer ?? answered;
}
