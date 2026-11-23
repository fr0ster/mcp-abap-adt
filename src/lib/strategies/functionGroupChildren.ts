import type {
  AdtTypeCode,
  IAdtError,
  IAdtResponse,
} from '@mcp-abap-adt/interfaces-adt';

import type { AdtCodes } from '../adtProjections';
import {
  type AnswerTable,
  completeAnswer,
  identityOf,
  Written,
} from '../detail';
import {
  childNodesOf,
  isNotLoaded,
  NOT_LOADED_BY_SAP,
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

/** A child of a function group's list, or a node SAP could not load (its row). */
export interface GroupChild extends NodeItem {
  /** A node SAP could not load (`utilNodeContents`' `notLoaded`): its row, named {@link NOT_LOADED_BY_SAP}. */
  notLoaded?: true;
}

function okObjects(
  objects: GroupChild[],
): IAdtResponse<GroupChild[], IAdtError> {
  return succeeded(objects, 'fetchFunctionGroupChildren');
}

/** A level SAP could not load: its row, of the node's type — never an empty success. */
function notLoadedRows(level: NodeLevel, type: AdtTypeCode): GroupChild[] {
  return isNotLoaded(level)
    ? [{ type, name: NOT_LOADED_BY_SAP, notLoaded: true }]
    : [];
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
): Promise<IAdtResponse<GroupChild[], IAdtError>> {
  const root = await utils.fetchNodeStructure('FUGR/F', functionGroupName, {
    withShortDescriptions: true,
  });
  if (!root.ok) {
    return root;
  }

  const rootLevel = root.getResult().value;
  const child = childNodesOf(rootLevel).find((c) => c.type === childType);
  if (!child) {
    return okObjects(notLoadedRows(rootLevel, 'FUGR/F'));
  }

  const level = await utils.fetchNodeStructure('FUGR/F', functionGroupName, {
    nodeId: child.nodeId,
    withShortDescriptions: true,
  });
  if (!level.ok) {
    return level;
  }

  const found = level.getResult().value;
  return okObjects([
    ...notLoadedRows(rootLevel, 'FUGR/F'),
    ...nodeItemsOf(found),
    ...notLoadedRows(found, childType),
  ]);
}

/**
 * What a function group's list (its modules, or its includes) answers at
 * each `detail`, selected before the reads (`src/lib/detail`): terse the
 * group and the total, then a `name\tdescription` row per child; medium
 * every field the node structure read but the uri; full the answer before
 * `detail` under `listKey`, with every field read under `objects`. The answer is built from two requests, so
 * raw never reaches this table: the handler answers it as the wire documents (`wireAnswer`).
 */
export function functionGroupListAnswers(
  functionGroupName: string,
  listKey: 'function_modules' | 'includes',
): AnswerTable<GroupChild[], string | object> {
  // The answer before `detail`, and every field the node structure read
  // beside it: full carries no less than medium.
  const full = (objects: GroupChild[]) => ({
    success: true,
    function_group_name: functionGroupName,
    total: objects.length,
    [listKey]: objects.map((o) => o.name),
    objects,
  });
  const tool =
    listKey === 'includes'
      ? 'ListFunctionGroupIncludes'
      : 'ListFunctionModules';
  /** A nameless child's URI, what tells it apart; `''` for a named one. */
  const namelessUri = (o: GroupChild) => (o.name === '' ? (o.uri ?? '') : '');
  // Every child the node structure held, or nothing (`completeAnswer`);
  // each identified by the cells or fields written.
  return {
    terse: completeAnswer(
      tool,
      (objects: GroupChild[]) =>
        objects.map((o) => identityOf([o.name, namelessUri(o)])),
      (objects: GroupChild[]) =>
        Written.text(
          [
            { head: 'function_group', value: functionGroupName },
            { head: 'total', value: String(objects.length) },
            { header: ['name', 'uri', 'description'] },
            ...objects.map((o) => ({
              row: [o.name, namelessUri(o), o.description ?? ''],
            })),
          ],
          [0, 1],
        ),
    ),
    // Every field the node structure read but the uri — kept for a child
    // SAP listed without a name, what tells it apart.
    medium: completeAnswer(
      tool,
      (objects: GroupChild[]) =>
        objects.map((o) => identityOf([o.type, o.name, namelessUri(o)])),
      (objects: GroupChild[]) =>
        Written.json(
          { function_group_name: functionGroupName, total: objects.length },
          {
            [listKey]: objects.map(
              ({ uri, ...fields }): GroupChild =>
                fields.name === '' && uri !== undefined
                  ? { ...fields, uri }
                  : fields,
            ),
          },
          ['type', 'name', 'uri'],
        ),
    ),
    full: completeAnswer(
      tool,
      (objects: GroupChild[]) =>
        objects.map((o) => identityOf([o.type, o.name, o.uri ?? ''])),
      (objects: GroupChild[]) => {
        const { objects: rows, ...rest } = full(objects);
        return Written.json(rest, { objects: rows }, ['type', 'name', 'uri']);
      },
    ),
    raw: full,
  };
}
