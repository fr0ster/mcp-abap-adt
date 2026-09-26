import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { kindOf, type NodeLevel } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import { handleSearchObject } from '../../search/readonly/handleSearchObject';

export const TOOL_DEFINITION = {
  name: 'GetObjectInfo',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Return ABAP object tree structure for packages (DEVC), classes (CLAS), programs (PROG), function groups (FUGR), and other objects. Shows root, group nodes, and terminal leaves up to maxDepth. Enrich each node with description and package via SearchObject if enrich=true.',
  inputSchema: {
    type: 'object',
    properties: {
      parent_type: {
        type: 'string',
        description:
          '[read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P)',
      },
      parent_name: {
        type: 'string',
        description: '[read-only] Parent object name',
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
    required: ['parent_type', 'parent_name'],
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

function ok(node: TreeNode): IAdtResponse<TreeNode, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value: node }),
    getError: () => {
      throw new Error('asked for the error of a success');
    },
  } as unknown as IAdtResponse<TreeNode, IAdtError>;
}

/**
 * Enrich the root node with description/package via `SearchObject` (best
 * effort — a search failure never fails the tree, matching the pre-migration
 * handler).
 *
 * `SearchObject`'s answer is now the tab-separated `name\ttype\tdescription\t
 * package` table this migration gives it (`handleSearchObject.ts`), not the
 * `<adtcore:objectReference>` XML the pre-migration handler parsed — both
 * files were migrated together in this task, so the contract between them is
 * updated on both ends rather than one side guessing at the other's old shape.
 */
async function enrichNodeWithSearchObject(
  context: HandlerContext,
  objectType: string,
  objectName: string,
  fallbackDescription?: string,
): Promise<{ packageName?: string; description?: string; type: string }> {
  let packageName: string | undefined;
  let description = fallbackDescription;
  let type = objectType;
  try {
    const searchResult = await handleSearchObject(context, {
      object_name: objectName,
      object_type: objectType,
      maxResults: 1,
    });
    if (!searchResult.isError && Array.isArray(searchResult.content)) {
      for (const entry of searchResult.content) {
        if (!('text' in entry) || typeof entry.text !== 'string') continue;
        const [, ...rows] = entry.text.split('\n'); // drop the header row
        for (const line of rows) {
          const [name, hitType, hitDescription, hitPackage] = line.split('\t');
          if (name && name.toUpperCase() === objectName.toUpperCase()) {
            packageName = hitPackage || undefined;
            description = hitDescription || description;
            type = hitType || type;
            return { packageName, description, type };
          }
        }
      }
    }
  } catch {
    // Enrichment is best-effort; the tree still answers without it.
  }
  return { packageName, description, type };
}

type NodeSource = ReturnType<ReturnType<typeof createAdtClient>['getUtils']>;

/**
 * One tree node: the object itself, enriched, plus its children.
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
  objectType: string,
  objectName: string,
  depth: number,
  maxDepth: number,
  enrich: boolean,
): Promise<IAdtResponse<TreeNode, IAdtError>> {
  const enrichment = enrich
    ? await enrichNodeWithSearchObject(context, objectType, objectName)
    : { type: objectType, description: undefined, packageName: undefined };

  const children: TreeNode[] = [];

  if (depth < maxDepth) {
    const rootResponse = await utils.fetchNodeStructure(
      objectType,
      objectName,
      { analyse: analyseException, withShortDescriptions: true },
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
      const childResponse = await utils.fetchNodeStructure(
        objectType,
        objectName,
        {
          analyse: analyseException,
          nodeId: child.nodeId,
          withShortDescriptions: true,
        },
      );
      if (!childResponse.ok) {
        return childResponse as IAdtResponse<TreeNode, IAdtError>;
      }
      const childLevel = childResponse.getResult().value as NodeLevel;
      for (const o of childLevel.objects) {
        if (kindOf(o.type) === 'package' && depth + 1 < maxDepth) {
          const subtree = await buildTree(
            context,
            utils,
            o.type,
            o.name,
            depth + 1,
            maxDepth,
            enrich,
          );
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

export async function handleGetObjectInfo(
  context: HandlerContext,
  args: {
    parent_type: string;
    parent_name: string;
    maxDepth?: number;
    enrich?: boolean;
  },
) {
  const { connection, logger } = context;
  if (!args?.parent_type || !args?.parent_name) {
    return return_error('parent_type and parent_name are required');
  }
  logger?.info(
    `Building object info tree for ${args.parent_type}/${args.parent_name}`,
  );
  const maxDepth = Number.isInteger(args.maxDepth)
    ? (args.maxDepth as number)
    : getDefaultDepth(args.parent_type);
  const enrich = typeof args.enrich === 'boolean' ? args.enrich : true;

  const utils = createAdtClient(connection, logger).getUtils(ourUtils);

  // Task 28: why this tool carries no `detail`. The node-level family's
  // shape (`ourUtils.node` / `nodeLevel`, `lib/strategies/packageWalk.ts`):
  // `nodeLevel` parses `answer.data` and returns only the reduced
  // `NodeLevel` it builds, never keeping the wire text beside it — there is
  // no `.raw` for `detail: 'raw'` to answer without changing that shared
  // strategy. This tool's own answer besides is a composite tree assembled
  // from several such calls (`buildTree`, recursive), not one reading.
  return answer(
    { tool: 'GetObjectInfo', detail: 'terse' },
    () =>
      buildTree(
        context,
        utils,
        args.parent_type,
        args.parent_name,
        0,
        maxDepth,
        enrich,
      ),
    (tree: TreeNode) => tree,
  );
}
