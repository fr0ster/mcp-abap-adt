import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError, return_error } from '../../../lib/utils';
import { writeResultToFile } from '../../../lib/writeResultToFile';
export const TOOL_DEFINITION = {
  name: 'GetIncludesList',
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
          '[read-only] ADT object type (e.g. PROG/P, PROG/I, FUGR, CLAS/OC)',
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

export async function handleGetIncludesList(
  context: HandlerContext,
  args: any,
) {
  const { connection, logger } = context;
  try {
    const { object_name, object_type, timeout, detailed } = args;

    if (
      !object_name ||
      typeof object_name !== 'string' ||
      object_name.trim() === ''
    ) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "object_name" (string) is required and cannot be empty.',
      );
    }
    if (!object_type || typeof object_type !== 'string') {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Parameter "object_type" (string) is required.',
      );
    }

    // Default timeout: 30 seconds
    const requestTimeout =
      timeout && typeof timeout === 'number' ? timeout : 30000;
    const isDetailed = detailed === true;

    // Pass object_type straight through as parentType
    const parentName = object_name.toUpperCase();
    const parentType = object_type;

    logger?.info(
      `Starting includes discovery for ${parentName} (${parentType}), detailed=${isDetailed}`,
    );

    // Create AdtClient and get utilities
    const client = createAdtClient(connection, logger);
    const utils = client.getUtils();

    // Step 1: Get root node structure to find includes node (with timeout)
    const rootResponse = await Promise.race([
      utils.fetchNodeStructure(
        parentType,
        parentName,
        '000000', // Root node
        true, // with descriptions
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timeout after ${requestTimeout}ms while fetching root node structure for ${object_name}`,
              ),
            ),
          requestTimeout,
        ),
      ),
    ]);

    // Step 2: Parse response to find includes node ID
    const includesInfo = parseIncludesFromXml(rootResponse.data);
    const includesNode = includesInfo.find((info) => info.name === 'PROG/I');

    if (!includesNode) {
      logger?.info(`No includes found in ${object_type} '${object_name}'`);
      // Return empty result if no includes node found
      return {
        isError: false,
        content: [
          {
            type: 'text',
            text: `No includes found in ${object_type} '${object_name}'.`,
          },
        ],
      };
    }

    // Step 3: Get includes list using the found node ID (with timeout)
    const includesResponse = await Promise.race([
      utils.fetchNodeStructure(
        parentType,
        parentName,
        includesNode.node_id,
        true, // with descriptions
      ),
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timeout after ${requestTimeout}ms while fetching includes list for ${object_name}`,
              ),
            ),
          requestTimeout,
        ),
      ),
    ]);

    // Step 4: Parse the includes response to extract include names
    const includeNames = parseIncludeNamesFromXml(includesResponse.data);

    if (isDetailed) {
      // Return detailed JSON response as text (for compatibility)
      const detailedResponse = {
        object_name: object_name,
        object_type: object_type,
        detailed: true,
        total_includes: includeNames.length,
        includes: includeNames,
        includes_node_info: includesNode,
      };

      const result = {
        isError: false,
        content: [
          {
            type: 'text',
            text: JSON.stringify(detailedResponse, null, 2),
          },
        ],
      };
      if (args.filePath) {
        writeResultToFile(JSON.stringify(result, null, 2), args.filePath);
      }
      return result;
    } else {
      // Return minimal text response (original format)
      const responseData =
        includeNames.length > 0 ? includeNames.join('\n') : '';

      const plainResult = {
        isError: false,
        content: [
          {
            type: 'text',
            text: responseData,
          },
        ],
      };
      if (args.filePath) {
        writeResultToFile(responseData, args.filePath);
      }
      return plainResult;
    }
  } catch (error) {
    logger?.error(
      `Error getting includes list: ${error instanceof Error ? error.message : String(error)}`,
    );
    return return_error(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}
