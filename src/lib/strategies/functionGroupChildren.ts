import type {
  AdtTypeCode,
  IAdtError,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';

import type { AdtCodes } from '../adtProjections';
import { type AnswerTable, tsv } from '../detail';
import {
  childNodesOf,
  type NodeItem,
  type NodeLevel,
  nodeItemsOf,
} from './packageWalk';
import { succeeded } from './stepResponse';

/**
 * `listFunctionModules`/`listFunctionGroupIncludes`'s replacement — the
 * guide's "Walks are yours" table entry: "the object's node structure, then
 * the child type's node", the same two-request shape `walkPackage` already
 * uses for a package (`fetchNodeStructure('DEVC/K', pkg)`, then per child
 * node id). Here the parent is the function group itself
 * (`fetchNodeStructure('FUGR/F', name)`), and the child type is
 * `FUGR/FF` (function modules) or `FUGR/I` (function-group includes) —
 * confirmed against the shipped package: `AdtFunctionModule.js`'s own create
 * XML sends `adtcore:type="FUGR/FF"`, `AdtFunctionInclude.js`'s sends
 * `FUGR/I`, and both classes' own headers name the same codes.
 */
export interface FunctionGroupNodeSource {
  fetchNodeStructure(
    parentType: AdtTypeCode,
    parentName: string,
    options?: { nodeId?: string; withShortDescriptions?: boolean },
  ): Promise<IAdtResponse<NodeLevel, IAdtError>>;
}

function okObjects(objects: NodeItem[]): IAdtResponse<NodeItem[], IAdtError> {
  return succeeded(objects, 'fetchFunctionGroupChildren');
}

/**
 * The function group's own node structure, then — only when that node
 * structure actually lists a child of the requested type — that child
 * node's contents. A function group with no function modules (or no
 * includes) carries no matching `childNodes` entry at all, which is a real
 * "none" and not a refusal: it answers an empty list rather than a second,
 * unnecessary request.
 */
export async function fetchFunctionGroupChildren(
  utils: FunctionGroupNodeSource,
  functionGroupName: string,
  childType: AdtCodes<'FUGR/FF' | 'FUGR/I'>,
): Promise<IAdtResponse<NodeItem[], IAdtError>> {
  const root = await utils.fetchNodeStructure('FUGR/F', functionGroupName, {
    withShortDescriptions: true,
  });
  if (!root.ok) {
    return root;
  }

  const child = childNodesOf(root.getResult().value).find(
    (c) => c.type === childType,
  );
  if (!child) {
    return okObjects([]);
  }

  const level = await utils.fetchNodeStructure('FUGR/F', functionGroupName, {
    nodeId: child.nodeId,
    withShortDescriptions: true,
  });
  if (!level.ok) {
    return level;
  }

  return okObjects(nodeItemsOf(level.getResult().value));
}

/**
 * What a function group's list (its modules, or its includes) answers at
 * each `detail`, selected before the reads (`src/lib/detail`): terse the
 * group and the total, then a `name\tdescription` row per child; medium
 * every field the node structure read but the uri; full the answer before
 * `detail` under `listKey`, with every field read under `objects`. The answer is built from two requests, so raw is
 * the full answer.
 */
export function functionGroupListAnswers(
  functionGroupName: string,
  listKey: 'function_modules' | 'includes',
): AnswerTable<NodeItem[], string | object> {
  // The answer before `detail`, and every field the node structure read
  // beside it: full carries no less than medium.
  const full = (objects: NodeItem[]) => ({
    success: true,
    function_group_name: functionGroupName,
    total: objects.length,
    [listKey]: objects.map((o) => o.name),
    objects,
  });
  return {
    terse: (objects) =>
      [
        `# function_group ${functionGroupName}`,
        `# total ${objects.length}`,
        tsv(
          ['name', 'description'],
          objects.map((o) => [o.name, o.description ?? '']),
        ),
      ].join('\n'),
    medium: (objects) => ({
      function_group_name: functionGroupName,
      total: objects.length,
      [listKey]: objects.map(({ uri: _uri, ...fields }) => fields),
    }),
    full,
    raw: full,
  };
}
