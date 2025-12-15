import { AbapConnection } from '@mcp-abap-adt/connection';
import { McpError, ErrorCode, return_error, return_response, makeAdtRequestWithTimeout, logger as baseLogger, AxiosResponse } from '../../../lib/utils';
import convert from 'xml-js';
import { handleSearchObject } from '../../search/readonly/handleSearchObject';
import { XMLParser } from 'fast-xml-parser';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
export const TOOL_DEFINITION = {
  name: "GetObjectInfo",
  description: "[read-only] Return ABAP object tree: root, group nodes, and terminal leaves up to maxDepth. Enrich each node via SearchObject if enrich=true. Group nodes are included for hierarchy. Each node has node_type: root, point, end.",
  inputSchema: {
    type: "object",
    properties: {
      parent_type: { type: "string", description: "[read-only] Parent object type (e.g. DEVC/K, CLAS/OC, PROG/P)" },
      parent_name: { type: "string", description: "[read-only] Parent object name" },
      maxDepth: { type: "integer", description: "[read-only] Maximum tree depth (default depends on type)", default: 1 },
      enrich: { type: "boolean", description: "[read-only] Whether to add description and package via SearchObject (default true)", default: true }
    },
    required: ["parent_type", "parent_name"]
  }
} as const;

// Determine default depth for various object types
function getDefaultDepth(parent_type: string): number {
  const type = parent_type?.toUpperCase() || '';
  if (type.startsWith('PROG/') || type.startsWith('FUGR/')) return 2;
  return 1;
}

async function fetchNodeStructureRaw(parent_type: string, parent_name: string, node_id?: string) {
  // Pass only the endpoint path; the connection prepends baseUrl internally.
  const url = `/sap/bc/adt/repository/nodestructure`;
  const params: any = {
    parent_type,
    parent_name,
    withShortDescriptions: true
  };
  if (node_id) params.node_id = node_id;
  const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', undefined, params);
  const result = convert.xml2js(response.data, { compact: true });
  let nodes = result["asx:abap"]?.["asx:values"]?.DATA?.TREE_CONTENT?.SEU_ADT_REPOSITORY_OBJ_NODE || [];
  if (!Array.isArray(nodes)) nodes = [nodes];
  return nodes;
}

async function enrichNodeWithSearchObject(connection: AbapConnection, objectType: string, objectName: string, fallbackDescription?: string) {
  let packageName = undefined;
  let description = fallbackDescription;
  let type = objectType;
  try {
    const searchResult = await handleSearchObject(connection, {
      query: objectName,
      object_type: objectType,
      maxResults: 1
    });
    if (!searchResult.isError && Array.isArray(searchResult.content)) {
      const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
      for (const entry of searchResult.content) {
        if ('text' in entry && typeof entry.text === "string" && !entry.text.trim().startsWith("Error: <?xml")) {
          const parsed = parser.parse(entry.text);
          const refs = parsed?.['adtcore:objectReferences']?.['adtcore:objectReference'];
          const objects = refs
            ? Array.isArray(refs)
              ? refs
              : [refs]
            : [];
          for (const obj of objects) {
            if (
              obj['adtcore:type'] &&
              obj['adtcore:name'] &&
              obj['adtcore:name'].toUpperCase() === objectName.toUpperCase()
            ) {
              packageName = obj['adtcore:packageName'];
              description = obj['adtcore:description'] || description;
              type = obj['adtcore:type'];
              return { packageName, description, type };
            }
          }
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return { packageName, description, type };
}

function getText(node: any, key: string) {
  if (!node) return undefined;
  if (node[key] && typeof node[key] === 'object' && '_text' in node[key]) return node[key]._text;
  if (typeof node[key] === 'string') return node[key];
  return undefined;
}

// Terminal leaf: has OBJECT_NAME and OBJECT_URI
function isTerminalLeaf(node: any): boolean {
  return !!getText(node, 'OBJECT_NAME') && !!getText(node, 'OBJECT_URI');
}

// Group node: has NODE_ID, OBJECT_TYPE, but no OBJECT_URI
function isGroupNode(node: any): boolean {
  return !!getText(node, 'NODE_ID') && !!getText(node, 'OBJECT_TYPE') && !getText(node, 'OBJECT_URI');
}

function getNodeType(node: any, depth: number): 'root' | 'point' | 'end' {
  if (depth === 0) return 'root';
  if (isTerminalLeaf(node)) return 'end';
  if (isGroupNode(node)) return 'point';
  return 'point';
}

async function buildTree(
  connection: AbapConnection,
  objectType: string,
  objectName: string,
  depth: number,
  maxDepth: number,
  enrich: boolean,
  node_id: string = ''
): Promise<any> {
  // 1. Enrich root node
  let enrichment: any = { packageName: undefined, description: undefined, type: objectType };
  if (enrich) {
    enrichment = await enrichNodeWithSearchObject(connection, objectType, objectName);
  }
  // 2. Get children if depth < maxDepth
  let children: any[] = [];
  if (depth < maxDepth) {
    // Use node_id "0000" for the root; for others keep the actual NODE_ID
    const nodes = await fetchNodeStructureRaw(objectType, objectName, depth === 0 ? "0000" : node_id);
    for (const node of nodes) {
      // When the next level hits the maximum depth, only include terminal leaves
      if (depth + 1 === maxDepth) {
        if (isTerminalLeaf(node)) {
          const terminalNode: any = {
            OBJECT_TYPE: getText(node, 'OBJECT_TYPE'),
            OBJECT_NAME: getText(node, 'OBJECT_NAME'),
            PARENT_NODE_ID: getText(node, 'PARENT_NODE_ID'),
          };
          children.push(terminalNode);
        }
        // Skip group nodes at the maximum level
      } else {
        if (isGroupNode(node)) {
          // Group node: recurse, attach its children
          const groupChildren = await buildTree(
            connection,
            getText(node, 'OBJECT_TYPE'),
            getText(node, 'OBJECT_NAME'),
            depth + 1,
            maxDepth,
            enrich,
            String(getText(node, 'NODE_ID') ?? '')
          );
          const groupNode: any = {
            OBJECT_TYPE: getText(node, 'OBJECT_TYPE'),
            OBJECT_NAME: getText(node, 'OBJECT_NAME'),
            PARENT_NODE_ID: getText(node, 'PARENT_NODE_ID'),
          };
          if (Array.isArray(groupChildren.CHILDREN) && groupChildren.CHILDREN.length > 0) {
            groupNode.CHILDREN = groupChildren.CHILDREN;
          }
          children.push(groupNode);
        } else if (isTerminalLeaf(node)) {
          // Terminal leaf: add as is
          const terminalNode: any = {
            OBJECT_TYPE: getText(node, 'OBJECT_TYPE'),
            OBJECT_NAME: getText(node, 'OBJECT_NAME'),
            PARENT_NODE_ID: getText(node, 'PARENT_NODE_ID'),
          };
          children.push(terminalNode);
        }
        // else: skip nodes that are neither group nor terminal leaf
      }
    }
  }
  const resultNode: any = {
    OBJECT_TYPE: enrichment.type || objectType,
    OBJECT_NAME: objectName,
    OBJECT_DESCRIPTION: enrichment.description,
    OBJECT_PACKAGE: enrichment.packageName,
  };
  if (children.length > 0) {
    resultNode.CHILDREN = children;
  }
  return resultNode;
}

export async function handleGetObjectInfo(connection: AbapConnection, args: { parent_type: string; parent_name: string; maxDepth?: number; enrich?: boolean }) {
  const handlerLogger = getHandlerLogger(
    'handleGetObjectInfo',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    if (!args?.parent_type || !args?.parent_name) {
      throw new McpError(ErrorCode.InvalidParams, 'parent_type and parent_name are required');
    }
    handlerLogger.info(`Building object info tree for ${args.parent_type}/${args.parent_name}`);
    // Determine the default depth if none is provided
    const maxDepth = Number.isInteger(args.maxDepth)
      ? args.maxDepth as number
      : getDefaultDepth(args.parent_type);
    const enrich = typeof args.enrich === 'boolean' ? args.enrich : true;
    const result = await buildTree(connection, args.parent_type, args.parent_name, 0, maxDepth ?? getDefaultDepth(args.parent_type), enrich);
    handlerLogger.debug(`Object tree built with depth ${maxDepth} (enrich=${enrich})`);
    return {
      isError: false,
      content: [
        {
          type: 'json',
          json: result
        }
      ]
    };
  } catch (error) {
    handlerLogger.error(`Failed to build object info for ${args?.parent_type}/${args?.parent_name}`, error as any);
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
}
