import * as z from 'zod';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { assembleList, walkPackage } from '../../../lib/strategies/packageWalk';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetPackageContents',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Retrieve objects inside an ABAP package as a flat list. Supports recursive traversal of subpackages.',
  inputSchema: {
    package_name: z
      .string()
      .describe('Name of the ABAP package (e.g., "ZMY_PACKAGE")'),
    include_subpackages: z
      .boolean()
      .optional()
      .describe('Include contents of subpackages recursively (default: false)'),
    max_depth: z
      .number()
      .optional()
      .describe('Maximum depth for recursive package traversal (default: 5)'),
    include_descriptions: z
      .boolean()
      .optional()
      .describe('Include object descriptions in response (default: true)'),
  },
} as const;

interface GetPackageContentsArgs {
  package_name: string;
  include_subpackages?: boolean;
  max_depth?: number;
  include_descriptions?: boolean;
}

export async function handleGetPackageContents(
  context: HandlerContext,
  args: GetPackageContentsArgs,
) {
  const { connection, logger } = context;
  try {
    if (!args?.package_name) {
      return return_error('Package name is required');
    }

    const client = createAdtClient(connection, logger);
    const utils = client.getUtils();

    // Walked here rather than in the client, for the reason given in
    // handleGetPackageTree and in mcp-abap-adt-clients#141: a member that makes
    // many requests cannot take an IResultStrategy, and a flat list and a tree
    // are two conveniences over one walk. This is the same walk that handler
    // uses, assembled the other way.
    const packageName = args.package_name.toUpperCase();
    const items = assembleList(
      packageName,
      await walkPackage(utils as never, packageName, {
        includeSubpackages: args.include_subpackages,
        maxDepth: args.max_depth,
        includeDescriptions: args.include_descriptions,
      }),
    );

    const finalResult = {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(items, null, 2),
        },
      ],
    };

    return finalResult;
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
