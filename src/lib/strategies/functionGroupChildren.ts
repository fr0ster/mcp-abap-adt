import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import type { NodeLevel } from './packageWalk';

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
    parentType: string,
    parentName: string,
    options?: { nodeId?: string; withShortDescriptions?: boolean },
  ): Promise<IAdtResponse<NodeLevel, IAdtError>>;
}

function okObjects(
  objects: NodeLevel['objects'],
): IAdtResponse<NodeLevel['objects'], IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value: objects }),
    getError: () => {
      throw new Error(
        'fetchFunctionGroupChildren: asked for the error of a success',
      );
    },
  } as unknown as IAdtResponse<NodeLevel['objects'], IAdtError>;
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
  childType: 'FUGR/FF' | 'FUGR/I',
): Promise<IAdtResponse<NodeLevel['objects'], IAdtError>> {
  const root = await utils.fetchNodeStructure('FUGR/F', functionGroupName, {
    withShortDescriptions: true,
  });
  if (!root.ok) {
    return root as unknown as IAdtResponse<NodeLevel['objects'], IAdtError>;
  }

  const child = root
    .getResult()
    .value.childNodes.find((c) => c.type === childType);
  if (!child) {
    return okObjects([]);
  }

  const level = await utils.fetchNodeStructure('FUGR/F', functionGroupName, {
    nodeId: child.nodeId,
    withShortDescriptions: true,
  });
  if (!level.ok) {
    return level as unknown as IAdtResponse<NodeLevel['objects'], IAdtError>;
  }

  return okObjects(level.getResult().value.objects);
}
