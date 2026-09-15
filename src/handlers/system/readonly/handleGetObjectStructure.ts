/**
 * Handler for retrieving ADT object structure and returning a compact tree.
 */

import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetObjectStructure',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Retrieve ADT object structure as a compact JSON tree.',
  inputSchema: {
    type: 'object',
    properties: {
      objecttype: {
        type: 'string',
        description: 'ADT object type (e.g. DDLS/DF)',
      },
      objectname: {
        type: 'string',
        description: 'ADT object name (e.g. /CBY/ACQ_DDL)',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['objecttype', 'objectname'],
  },
} as const;

interface FlatObjectStructureNode {
  nodeid: string;
  parentid?: string;
  objecttype: string;
  objectname: string;
}

interface ObjectStructureTreeNode {
  objecttype: string;
  objectname: string;
  children: ObjectStructureTreeNode[];
}

/**
 * `projectexplorer:objectstructure/projectexplorer:node`, attributes
 * `nodeid`/`parentid`/`objecttype`/`objectname` — the same field set this
 * tool has always read, off the generic `structured` parse that now supplies
 * `objectStructure` (`resultSets.ts`'s `READING_BY_SLOT` overrides the
 * shipped `rawDocument` default). `node`'s local name is one of `structured`'s
 * forced-array elements, so this holds for a single node too.
 */
function flatNodesOf(value: unknown): FlatObjectStructureNode[] {
  const nodesRaw = (value as any)?.['projectexplorer:objectstructure']?.[
    'projectexplorer:node'
  ];
  const nodes = Array.isArray(nodesRaw) ? nodesRaw : nodesRaw ? [nodesRaw] : [];
  return nodes.map((n: any) => {
    const a = n?.['@'] ?? {};
    return {
      nodeid: a.nodeid,
      parentid: a.parentid,
      objecttype: a.objecttype,
      objectname: a.objectname,
    };
  });
}

function buildNestedTree(
  flatNodes: FlatObjectStructureNode[],
): ObjectStructureTreeNode[] {
  const nodeMap: Record<string, ObjectStructureTreeNode> = {};
  flatNodes.forEach((node) => {
    nodeMap[node.nodeid] = {
      objecttype: node.objecttype,
      objectname: node.objectname,
      children: [],
    };
  });
  const roots: ObjectStructureTreeNode[] = [];
  flatNodes.forEach((node) => {
    if (node.parentid && nodeMap[node.parentid]) {
      nodeMap[node.parentid].children.push(nodeMap[node.nodeid]);
    } else {
      roots.push(nodeMap[node.nodeid]);
    }
  });
  return roots;
}

function serializeTree(
  tree: ObjectStructureTreeNode[],
  indent: string = '',
): string {
  let result = '';
  for (const node of tree) {
    result += `${indent}- ${node.objecttype}: ${node.objectname}\n`;
    if (node.children && node.children.length > 0) {
      result += serializeTree(node.children, `${indent}  `);
    }
  }
  return result;
}

/**
 * The same masking `GetNodeStructureLow` guards against, over a different
 * document. `getObjectStructure(objectType, objectName)` takes no `options`
 * at all — no `analyse` — so nothing downstream of this reading can ever
 * turn a content-free answer into a refusal. An **absent root**
 * (`value['projectexplorer:objectstructure']` is `undefined` — what a
 * zero-byte body, or a document this reading does not recognise, both parse
 * to) is not the same claim as "this object has no substructure": the second
 * is a real, present, empty document. Exported (not only `treeText`) so both
 * `handleGetObjectStructure` (here) and `GetObjectStructureLow` can run this
 * check inside their own `call()` — the same place `GetNodeStructureLow`'s
 * guard runs — rather than inside the projection: a throw here and a throw
 * from `readNodeLevel` then both surface through `answer()`'s `client_threw`
 * path, not one `client_threw` and one `adapter_threw` for what is the same
 * class of defect. `treeText` below keeps its own copy of this same check as
 * a second line of defence for any caller that reaches it without going
 * through `call()` first — cheap, since the check is synchronous and idempotent.
 */
export function assertObjectStructurePresent(value: unknown): void {
  const root = (
    value as { 'projectexplorer:objectstructure'?: unknown } | null | undefined
  )?.['projectexplorer:objectstructure'];
  if (root === undefined || root === null) {
    throw new Error(
      'No object structure document was returned for this object — getObjectStructure carries no analyse, so an absent projectexplorer:objectstructure root cannot be told apart from "this object has no substructure" here. Verify the object exists before trusting an empty answer.',
    );
  }
}

/**
 * Exported so `GetObjectStructureLow` (`src/handlers/system/low/`) can answer
 * the same tree text without a second copy of `flatNodesOf`/`buildNestedTree`/
 * `serializeTree` — both tools read the same `projectexplorer:objectstructure`
 * document through the same `ourUtils.objectStructure` (`structured`) reading.
 */
export function treeText(value: unknown): string {
  assertObjectStructurePresent(value);
  const nodes = flatNodesOf(value);
  if (nodes.length === 0) return 'No nodes found in object structure response.';
  return `tree:\n${serializeTree(buildNestedTree(nodes))}`;
}

export async function handleGetObjectStructure(
  context: HandlerContext,
  args: {
    objecttype?: string;
    objectname?: string;
    object_type?: string;
    object_name?: string;
    detail?: 'terse' | 'full' | 'raw';
  },
) {
  const { connection, logger } = context;
  const objectType = args.objecttype ?? args.object_type;
  const objectName = args.objectname ?? args.object_name;
  if (!objectType || !objectName) {
    return return_error(
      new Error(
        'objecttype/objectname (or object_type/object_name) are required',
      ),
    );
  }

  logger?.info(`Fetching object structure for ${objectType}/${objectName}`);
  const detail = detailOf(args);

  // `getObjectStructure(objectType, objectName)` takes no options object at
  // all — no `analyse` to pass, matching the brief. The presence check runs
  // here, inside the call, only for `terse` — `raw`/`full` always answer the
  // document exactly as it arrived, indeterminate or not, the same invariant
  // every other `detail: 'raw'` in this migration keeps.
  return answer(
    { tool: 'GetObjectStructure', detail },
    async () => {
      const response = await createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getObjectStructure(objectType, objectName);
      if (detail === 'terse' && response.ok) {
        assertObjectStructurePresent(response.getResult().value.value);
      }
      return response;
    },
    project(detail, (value) => treeText(value)),
  );
}
