import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError, return_error } from '../../../lib/utils';
export const TOOL_DEFINITION = {
  name: 'GetIncludesList',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Recursively discover and list ALL include files within an ABAP program or include.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description: 'Name of the ABAP program or include',
      },
      object_type: {
        type: 'string',
        enum: ['PROG/P', 'PROG/I', 'FUGR', 'CLAS/OC'],
        description:
          "[read-only] ADT object type of the parent. Only these four values are supported: 'PROG/P' (program), 'PROG/I' (include), 'FUGR' (function group), 'CLAS/OC' (class). Any other value is rejected by the schema.",
      },
      detailed: {
        type: 'boolean',
        description:
          '[read-only] If true, returns structured JSON with metadata and raw XML.',
        default: false,
      },
      timeout: {
        type: 'number',
        description: '[read-only] Timeout in ms for each ADT request.',
      },
    },
    required: ['object_name', 'object_type'],
  },
} as const;

/**
 * Parses XML response to extract includes information
 * @param xmlData XML response data
 * @returns Array of include objects with name and node_id
 */
function parseIncludesFromXml(
  xmlData: string,
): Array<{ name: string; node_id: string; label: string }> {
  const includes: Array<{ name: string; node_id: string; label: string }> = [];

  try {
    // Simple regex-based parsing for XML
    // Look for OBJECT_TYPE entries that contain "PROG/I" (includes)
    const objectTypeRegex =
      /<SEU_ADT_OBJECT_TYPE_INFO>(.*?)<\/SEU_ADT_OBJECT_TYPE_INFO>/gs;
    const matches = xmlData.match(objectTypeRegex);

    if (matches) {
      for (const match of matches) {
        // Check if this is an include type
        if (match.includes('<OBJECT_TYPE>PROG/I</OBJECT_TYPE>')) {
          const nodeIdMatch = match.match(/<NODE_ID>(\d+)<\/NODE_ID>/);
          const labelMatch = match.match(
            /<OBJECT_TYPE_LABEL>(.*?)<\/OBJECT_TYPE_LABEL>/,
          );

          if (nodeIdMatch && labelMatch) {
            includes.push({
              name: 'PROG/I',
              node_id: nodeIdMatch[1],
              label: labelMatch[1],
            });
          }
        }
      }
    }
  } catch (_error) {
    // console.warn('Error parsing XML for includes:', error);
  }

  return includes;
}

/**
 * Parses XML response to extract actual include names from node structure
 * @param xmlData XML response data
 * @returns Array of include names
 */
function parseIncludeNamesFromXml(xmlData: string): string[] {
  const includeNames: string[] = [];

  try {
    // Look for SEU_ADT_REPOSITORY_OBJ_NODE entries with OBJECT_TYPE PROG/I
    const nodeRegex =
      /<SEU_ADT_REPOSITORY_OBJ_NODE>(.*?)<\/SEU_ADT_REPOSITORY_OBJ_NODE>/gs;
    const nodeMatches = xmlData.match(nodeRegex);

    if (nodeMatches) {
      for (const nodeMatch of nodeMatches) {
        // Check if this node is for includes (PROG/I)
        if (nodeMatch.includes('<OBJECT_TYPE>PROG/I</OBJECT_TYPE>')) {
          // Extract the object name
          const nameMatch = nodeMatch.match(
            /<OBJECT_NAME>([^<]+)<\/OBJECT_NAME>/,
          );
          if (nameMatch?.[1].trim()) {
            const includeName = nameMatch[1].trim();
            // Decode URL-encoded names if needed
            const decodedName = decodeURIComponent(includeName);
            includeNames.push(decodedName);
          }
        }
      }
    }

    // If no nodes found, try alternative parsing for OBJECT_NAME tags
    if (includeNames.length === 0) {
      const objectNameRegex = /<OBJECT_NAME>([^<]+)<\/OBJECT_NAME>/g;
      let match: RegExpExecArray | null = objectNameRegex.exec(xmlData);
      while (match !== null) {
        const name = match[1].trim();
        if (name && name.length > 0) {
          const decodedName = decodeURIComponent(name);
          includeNames.push(decodedName);
        }
        match = objectNameRegex.exec(xmlData);
      }
    }
  } catch (_error) {
    // console.warn('Error parsing XML for include names:', error);
  }

  return [...new Set(includeNames)]; // Remove duplicates
}

interface IncludeNode {
  name: string;
  children: IncludeNode[];
  cyclic?: boolean;
  truncated?: boolean;
}

const MAX_INCLUDE_DEPTH = 20;

/**
 * Discovers the direct child includes of a single object via its ADT node
 * structure. Returns an empty array when the object has no includes node.
 */
async function discoverIncludeNames(
  utils: any,
  parentType: string,
  parentName: string,
  requestTimeout: number,
): Promise<string[]> {
  const withTimeout = <T>(p: Promise<T>, what: string): Promise<T> =>
    Promise.race([
      p,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timeout after ${requestTimeout}ms while ${what} for ${parentName}`,
              ),
            ),
          requestTimeout,
        ),
      ),
    ]);

  // Step 1: root node structure to find the includes node id.
  const rootResponse = (await withTimeout(
    utils.fetchNodeStructure(parentType, parentName, '000000', true),
    'fetching root node structure',
  )) as { data: string };

  const includesInfo = parseIncludesFromXml(rootResponse.data);
  const includesNode = includesInfo.find((info) => info.name === 'PROG/I');
  if (!includesNode) return [];

  // Step 2: include list under that node.
  const includesResponse = (await withTimeout(
    utils.fetchNodeStructure(
      parentType,
      parentName,
      includesNode.node_id,
      true,
    ),
    'fetching includes list',
  )) as { data: string };

  return parseIncludeNamesFromXml(includesResponse.data);
}

export async function handleGetIncludesList(
  context: HandlerContext,
  args: any,
) {
  const { connection, logger } = context;
  try {
    const { object_name, object_type, timeout } = args;

    if (
      !object_name ||
      typeof object_name !== 'string' ||
      object_name.trim() === ''
    ) {
      return return_error(
        'Parameter "object_name" (string) is required and cannot be empty.',
      );
    }
    if (!object_type || typeof object_type !== 'string') {
      return return_error('Parameter "object_type" (string) is required.');
    }

    // Default timeout: 30 seconds
    const requestTimeout =
      timeout && typeof timeout === 'number' ? timeout : 30000;

    const parentName = object_name.toUpperCase();
    const parentType = object_type;

    logger?.info(
      `Starting includes tree discovery for ${parentName} (${parentType})`,
    );

    const client = createAdtClient(connection, logger);
    const utils = client.getUtils();

    const visited = new Set<string>([parentName]);

    const buildChildren = async (
      ownerType: string,
      ownerName: string,
      depth: number,
    ): Promise<IncludeNode[]> => {
      const names = await discoverIncludeNames(
        utils,
        ownerType,
        ownerName,
        requestTimeout,
      );
      const children: IncludeNode[] = [];
      for (const rawName of names) {
        const name = rawName.toUpperCase();
        const node: IncludeNode = { name, children: [] };

        if (visited.has(name)) {
          node.cyclic = true;
          children.push(node);
          continue;
        }
        if (depth >= MAX_INCLUDE_DEPTH) {
          node.truncated = true;
          children.push(node);
          continue;
        }
        visited.add(name);

        // Recurse into the include as a PROG/I.
        node.children = await buildChildren('PROG/I', name, depth + 1);
        children.push(node);
      }
      return children;
    };

    const tree: IncludeNode = {
      name: parentName,
      children: await buildChildren(parentType, parentName, 0),
    };

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              object_name: parentName,
              object_type: parentType,
              tree,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    logger?.error(
      `Error getting includes list: ${error instanceof Error ? error.message : String(error)}`,
    );
    return return_error(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
