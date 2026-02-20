/**
 * Handler for retrieving ADT object structure and returning compact JSON tree.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import { XMLParser } from 'fast-xml-parser';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
export const TOOL_DEFINITION = {
  name: 'GetObjectStructure',
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
    },
    required: ['objecttype', 'objectname'],
  },
} as const;

// Build nested tree from flat node list (nodeid/parentid)
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

function buildNestedTree(flatNodes: FlatObjectStructureNode[]) {
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

// Serialize tree to MCP-compatible text format ("tree:")
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

export async function handleGetObjectStructure(
  context: HandlerContext,
  args: {
    objecttype?: string;
    objectname?: string;
    object_type?: string;
    object_name?: string;
  },
) {
  const { connection, logger } = context;
  try {
    const objectType = args.objecttype ?? args.object_type;
    const objectName = args.objectname ?? args.object_name;
    if (!objectType || !objectName) {
      throw new Error(
        'objecttype/objectname (or object_type/object_name) are required',
      );
    }

    const client = new AdtClient(connection, logger);
    const response = await client
      .getUtils()
      .getObjectStructure(objectType, objectName);
    logger?.info(`Fetched object structure for ${objectType}/${objectName}`);

    // Parse XML response
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    const parsed = parser.parse(response.data);

    // Get flat node list
    let nodes = parsed['projectexplorer:objectstructure']?.[
      'projectexplorer:node'
    ] as FlatObjectStructureNode | FlatObjectStructureNode[] | undefined;
    if (!nodes) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: 'No nodes found in object structure response.',
          },
        ],
      };
    }
    // Ensure nodes is always an array
    if (!Array.isArray(nodes)) nodes = [nodes];

    // Build nested tree
    const tree = buildNestedTree(nodes);

    // Serialize to MCP-compatible text format
    const treeText = `tree:\n${serializeTree(tree)}`;

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: treeText,
        },
      ],
    };
  } catch (error) {
    logger?.error(
      `Failed to fetch object structure for ${args?.objecttype ?? args?.object_type}/${args?.objectname ?? args?.object_name}`,
      error,
    );
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: `ADT error: ${String(error)}`,
        },
      ],
    };
  }
}
