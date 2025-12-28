/**
 * GetVirtualFolders Handler - Low-level handler for virtual folders
 *
 * Uses getVirtualFoldersContents from @mcp-abap-adt/adt-clients AdtUtils.
 * Retrieves hierarchical virtual folder contents from ADT information system.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetVirtualFoldersLow',
  description:
    '[low-level] Retrieve hierarchical virtual folder contents from ADT information system. Used for browsing ABAP objects by package, group, type, etc.',
  inputSchema: {
    type: 'object',
    properties: {
      object_search_pattern: {
        type: 'string',
        description:
          'Object search pattern (e.g., "*", "Z*", "ZCL_*"). Default: "*"',
        default: '*',
      },
      preselection: {
        type: 'array',
        description:
          'Optional preselection filters (facet-value pairs for filtering)',
        items: {
          type: 'object',
          properties: {
            facet: {
              type: 'string',
              description: 'Facet name (e.g., "package", "group", "type")',
            },
            values: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of facet values to filter by',
            },
          },
          required: ['facet', 'values'],
        },
      },
      facet_order: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Order of facets in response (e.g., ["package", "group", "type"]). Default: ["package", "group", "type"]',
        default: ['package', 'group', 'type'],
      },
      with_versions: {
        type: 'boolean',
        description: 'Include version information in response',
        default: false,
      },
      ignore_short_descriptions: {
        type: 'boolean',
        description: 'Ignore short descriptions in response',
        default: false,
      },
    },
    required: [],
  },
} as const;

interface GetVirtualFoldersArgs {
  object_search_pattern?: string;
  preselection?: Array<{ facet: string; values: string[] }>;
  facet_order?: string[];
  with_versions?: boolean;
  ignore_short_descriptions?: boolean;
}

/**
 * Main handler for GetVirtualFoldersLow MCP tool
 *
 * Uses getVirtualFoldersContents from AdtUtils
 */
export async function handleGetVirtualFolders(
  context: HandlerContext,
  args: GetVirtualFoldersArgs,
) {
  const { connection, logger } = context;
  try {
    // Create AdtClient and get utilities
    const client = new AdtClient(connection, logger);
    const utils = client.getUtils();

    logger?.info('Fetching virtual folders contents');

    const params = {
      objectSearchPattern: args.object_search_pattern || '*',
      preselection: args.preselection,
      facetOrder: args.facet_order || ['package', 'group', 'type'],
      withVersions: args.with_versions,
      ignoreShortDescriptions: args.ignore_short_descriptions,
    };

    const result = await utils.getVirtualFoldersContents(params);

    logger?.debug('Virtual folders contents fetched successfully');

    return return_response(result);
  } catch (error: any) {
    logger?.error('Failed to fetch virtual folders contents', error);
    return return_error(error);
  }
}
