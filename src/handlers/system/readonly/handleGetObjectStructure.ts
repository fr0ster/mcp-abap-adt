import * as z from 'zod';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';
import {
  about,
  bullets,
  listAnswerAt,
  type RowSchemas,
  shapesOf,
  type Written,
  writeListing,
} from '../../../lib/detail';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * Handler for retrieving ADT object structure and returning a compact tree.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { notATableType, tableTypeOf } from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';

import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
import type { AdtReading } from '../../../lib/strategies/reading';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import {
  attr,
  child,
  childAt,
  isList,
  type XmlRead,
} from '../../../lib/xml/tree';

export const TOOL_DEFINITION = {
  name: 'GetObjectStructure',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'read-only',
    purpose: purpose(
      'Reads the structure of an ABAP repository object, such as a CDS view: its parts and their parts, down to the last level.',
    ),
    returns: returnsOf({ shapes: [shapesOf(objectStructureLists(false))] }),
  }),
  inputSchema: z.object({
    objecttype: z.string().describe('ADT object type (e.g. DDLS/DF)'),
    objectname: z.string().describe('ADT object name (e.g. /CBY/ACQ_DDL)'),
    ...DETAIL_SHAPE,
  }),
} as const;

/** A node as the document lists it: each attribute as given, or absent. */
interface FlatObjectStructureNode {
  nodeid?: string | undefined;
  parentid?: string | undefined;
  objecttype?: string | undefined;
  objectname?: string | undefined;
  description?: string | undefined;
  isfolder: boolean;
}

interface ObjectStructureTreeNode {
  objecttype?: string | undefined;
  objectname?: string | undefined;
  description?: string | undefined;
  isfolder: boolean;
  children: ObjectStructureTreeNode[];
  /** The object asked for, which SAP does not send: no node of the document. */
  synthetic?: true;
}

/**
 * `projectexplorer:objectstructure/projectexplorer:node`, attributes
 * `nodeid`/`parentid`/`objecttype`/`objectname` — the same field set this
 * tool has always read, off the generic `structured` parse that now supplies
 * `objectStructure` (`resultSets.ts`'s `READING_BY_SLOT` overrides the
 * shipped `rawDocument` default). `node`'s local name is one of `structured`'s
 * forced-array elements, so this holds for a single node too.
 */
function flatNodesOf(value: XmlRead): FlatObjectStructureNode[] {
  const nodesRaw = childAt(
    value,
    'projectexplorer:objectstructure',
    'projectexplorer:node',
  );
  const nodes = isList(nodesRaw) ? nodesRaw : nodesRaw ? [nodesRaw] : [];
  return nodes.map((n) => {
    const a = child(n, '@');
    return {
      nodeid: attr(a, 'nodeid'),
      parentid: attr(a, 'parentid'),
      objecttype: attr(a, 'objecttype'),
      objectname: attr(a, 'objectname'),
      description: attr(a, 'description'),
      isfolder: attr(a, 'isfolder') === 'true',
    };
  });
}

/**
 * **SAP does not send the object itself.** For a class on premise
 * (2026-09-25) the folders carry `parentid="000001"` and no node `000001`
 * arrives, so without the object asked for they each came out as a root of
 * their own. A node whose parent was named but not sent hangs under `root`
 * when one is given; a node naming no parent is a root as before.
 */
function buildNestedTree(
  flatNodes: FlatObjectStructureNode[],
  root?: { objecttype: string; objectname: string },
): ObjectStructureTreeNode[] {
  // Every node of the document is one node of the tree: by its place in the
  // document, so two sharing an id stay two; a parent is the first node of
  // its id, taken only when that makes no cycle — a node whose parents loop
  // back to it is a root — so every node is reached from a root (plan 9.7).
  const nodes = flatNodes.map(
    (node): ObjectStructureTreeNode => ({
      objecttype: node.objecttype,
      objectname: node.objectname,
      description: node.description,
      isfolder: node.isfolder,
      children: [],
    }),
  );
  const byId = new Map<string, number>();
  flatNodes.forEach((node, index) => {
    const id = String(node.nodeid);
    if (!byId.has(id)) byId.set(id, index);
  });
  const parentOf = new Map<number, number>();
  const ancestors = (index: number): Set<number> => {
    const seen = new Set<number>();
    for (
      let at = parentOf.get(index);
      at !== undefined;
      at = parentOf.get(at)
    ) {
      if (seen.has(at)) break;
      seen.add(at);
    }
    return seen;
  };
  const roots: ObjectStructureTreeNode[] = [];
  const synthetic: ObjectStructureTreeNode | undefined = root
    ? { ...root, isfolder: false, children: [], synthetic: true }
    : undefined;
  flatNodes.forEach((node, index) => {
    const own = nodes[index];
    if (own === undefined) return;
    const parent =
      node.parentid === undefined || node.parentid === ''
        ? undefined
        : byId.get(node.parentid);
    const parentNode = parent === undefined ? undefined : nodes[parent];
    if (
      parent !== undefined &&
      parentNode !== undefined &&
      parent !== index &&
      !ancestors(parent).has(index)
    ) {
      parentOf.set(index, parent);
      parentNode.children.push(own);
    } else if (node.parentid && parent === undefined && synthetic) {
      synthetic.children.push(own);
    } else {
      roots.push(own);
    }
  });
  if (synthetic && synthetic.children.length > 0) roots.unshift(synthetic);
  return roots;
}

/**
 * What a node is called. `objectname` names the ADT object that OWNS the
 * node — the class itself for an attribute, the method include
 * (`CL_X========CM001`) for a method — so it is the label only when there is
 * nothing better. The component's own name is `description`, and a folder
 * has only that. An include owner is kept in parentheses, since it is where
 * the code lives; the class as owner of its own attribute says nothing.
 */
function labelOf(node: ObjectStructureTreeNode, withOwner: boolean): string {
  if (node.isfolder) return `${node.objecttype} [${node.description ?? ''}]`;
  const name = node.description || node.objectname || '';
  const owner =
    withOwner &&
    node.objectname &&
    node.description &&
    node.objectname !== node.description &&
    node.objectname.includes('=')
      ? ` (${node.objectname})`
      : '';
  return `${node.objecttype}: ${name}${owner}`;
}

/**
 * The same masking `GetNodeStructureLow` guards against, over a different
 * document. `getObjectStructure` takes `analyseException`, which reads an
 * `exc:exception` and nothing else — so nothing downstream of this reading
 * turns a content-free answer into a refusal. An **absent root**
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
export function assertObjectStructurePresent(value: XmlRead): void {
  const root = child(value, 'projectexplorer:objectstructure');
  if (root === undefined || root === null) {
    throw new Error(
      'No object structure document was returned for this object — the answer carries no exception to read, so an absent projectexplorer:objectstructure root cannot be told apart from "this object has no substructure" here. Verify the object exists before trusting an empty answer.',
    );
  }
}

/** The tree's nodes below a node, as bullets one level deeper. */
function bulletSchemas(
  withOwner: boolean,
): RowSchemas<ObjectStructureTreeNode> {
  const schemas: RowSchemas<ObjectStructureTreeNode> = {
    children: bullets(
      'children',
      (node: ObjectStructureTreeNode) => labelOf(node, withOwner),
      {
        get lists() {
          return schemas;
        },
      },
    ),
  };
  return schemas;
}

/**
 * The lists an object structure's listing writes: what its description
 * states — each node by its type and its name or description.
 */
export function objectStructureLists(
  withOwner: boolean,
): RowSchemas<{ tree: ObjectStructureTreeNode[] }> {
  return {
    tree: about(
      'each part of the object, such as an element, an association or an annotation, is named by its type and its name or description, at its depth',
      bullets(
        'tree',
        (node: ObjectStructureTreeNode) => labelOf(node, withOwner),
        {
          synthetic: (node: ObjectStructureTreeNode) => node.synthetic === true,
          lists: bulletSchemas(withOwner),
        },
      ),
    ),
  };
}

/**
 * {@link treeText}, written by the listing writer: every node of the
 * document a bullet, depth first; the object asked, which SAP did not
 * send, the root and no item.
 */
function completeTreeText(
  value: XmlRead,
  root: { objecttype: string; objectname: string },
  withOwner: boolean,
): Written<string> {
  assertObjectStructurePresent(value);
  const nodes = flatNodesOf(value);
  if (nodes.length === 0) {
    return writeListing({
      heads: [],
      reading: {},
      lists: {},
      title: 'No nodes found in object structure response.',
    });
  }
  return writeListing({
    heads: [],
    reading: { tree: buildNestedTree(nodes, root) },
    lists: objectStructureLists(withOwner),
    title: 'tree:',
    end: '',
  });
}

export async function handleGetObjectStructure(
  context: HandlerContext,
  args: z.output<typeof TOOL_DEFINITION.inputSchema>,
) {
  const { connection, logger } = context;
  const objectType = args.objecttype;
  const objectName = args.objectname;
  if (!objectType || !objectName) {
    return return_error(
      new Error(
        'objecttype/objectname (or object_type/object_name) are required',
      ),
    );
  }

  const variant = variantOf(connection);
  const code = tableTypeOf(objectType, variant);
  if (code === undefined) {
    return return_error(
      new Error(notATableType('objecttype/object_type', objectType, variant)),
    );
  }

  logger?.info(`Fetching object structure for ${objectType}/${objectName}`);
  const detail = detailOf(args);
  const level = levelOf(args);
  const root = { objecttype: objectType, objectname: objectName };
  // What GetObjectStructure answers at each level, selected before the call
  // (`src/lib/detail`): terse the tree without the include each component's
  // code lives in; medium the tree with it (the former terse); full the
  // parse; raw the document.
  const shown = listAnswerAt<AdtReading<XmlRead>, XmlRead | string>(
    {
      terse: (reading) => completeTreeText(reading.value, root, false),
      medium: (reading) => completeTreeText(reading.value, root, true),
      full: (reading) => reading.value ?? reading.raw,
      raw: (reading) => reading.raw,
    },
    levelOf(args),
  );

  // `getObjectStructure` takes `analyseException` (adt-clients 23), which
  // reads only an exception document. The presence check runs
  // here, inside the call, only for `terse` — `raw`/`full` always answer the
  // document exactly as it arrived, indeterminate or not, the same invariant
  // every other `detail: 'raw'` in this migration keeps.
  return answer(
    { tool: 'GetObjectStructure', detail },
    async () => {
      const response = await createAdtClient(connection, logger)
        .getUtils(ourUtils)
        .getObjectStructure(code, objectName, {
          analyse: analyseException,
        });
      if ((level === 'terse' || level === 'medium') && response.ok) {
        assertObjectStructurePresent(response.getResult().value.value);
      }
      return response;
    },
    shown,
  );
}
