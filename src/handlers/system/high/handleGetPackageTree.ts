/**
 * GetPackageTree Handler - High-level handler for package tree structure
 *
 * Builds a complete tree of package contents (subpackages + objects)
 * using AdtClient.getPackageHierarchy() from @mcp-abap-adt/adt-clients.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetPackageTree',
  description:
    '[high-level] Retrieve complete package tree structure including subpackages and objects. Returns hierarchical tree with object names, types, and descriptions.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (e.g., "ZMY_PACKAGE")',
      },
      include_subpackages: {
        type: 'boolean',
        description:
          'Include subpackages recursively in the tree. If false, subpackages are shown as first-level objects but not recursively expanded. Default: true',
        default: true,
      },
      max_depth: {
        type: 'integer',
        description:
          'Maximum depth for recursive package traversal. Default: 5',
        default: 5,
      },
      include_descriptions: {
        type: 'boolean',
        description: 'Include object descriptions in response. Default: true',
        default: true,
      },
      debug: {
        type: 'boolean',
        description:
          'Include diagnostic metadata in response (counts, types, hierarchy info). Default: false',
        default: false,
      },
    },
    required: ['package_name'],
  },
} as const;

interface GetPackageTreeArgs {
  package_name: string;
  include_subpackages?: boolean;
  max_depth?: number;
  include_descriptions?: boolean;
  debug?: boolean;
}

/**
 * Main handler for GetPackageTree MCP tool
 */
export async function handleGetPackageTree(
  context: HandlerContext,
  args: GetPackageTreeArgs,
) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.package_name) {
      return return_error(new Error('package_name is required'));
    }

    const packageName = args.package_name.toUpperCase();
    const includeSubpackages = args.include_subpackages !== false;
    const maxDepth = args.max_depth || 5;
    const includeDescriptions = args.include_descriptions !== false;

    logger?.info(
      `Fetching package tree for ${packageName} (include_subpackages: ${includeSubpackages}, max_depth: ${maxDepth}) using adt-clients`,
    );

    const client = createAdtClient(connection, logger);
    const utils = client.getUtils();

    // Use the optimized and fixed hierarchy builder from adt-clients
    const packageTree = await utils.getPackageHierarchy(packageName, {
      includeSubpackages,
      maxDepth,
      includeDescriptions,
    });

    if (!packageTree) {
      return return_error(
        new Error(`Failed to fetch package tree for ${packageName}`),
      );
    }

    logger?.debug(`Package tree fetched successfully for ${packageName}`);

    // Format response
    const response = {
      package_name: packageName,
      tree: packageTree,
      metadata: {
        include_subpackages: includeSubpackages,
        max_depth: maxDepth,
        include_descriptions: includeDescriptions,
      },
    };

    return return_response({
      data: JSON.stringify(response, null, 2),
    } as any);
  } catch (error: any) {
    logger?.error('Failed to fetch package tree', error);
    return return_error(error);
  }
}
