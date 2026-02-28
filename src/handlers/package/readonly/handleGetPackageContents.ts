import * as z from 'zod';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError } from '../../../lib/utils';
import { writeResultToFile } from '../../../lib/writeResultToFile';

export const TOOL_DEFINITION = {
  name: 'GetPackageContents',
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
  filePath?: string;
}

export async function handleGetPackageContents(
  context: HandlerContext,
  args: GetPackageContentsArgs,
) {
  const { connection, logger } = context;
  try {
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    const client = createAdtClient(connection, logger);
    const utils = client.getUtils();

    // Use the optimized list method from adt-clients 0.3.13
    const items = await utils.getPackageContentsList(
      args.package_name.toUpperCase(),
      {
        includeSubpackages: args.include_subpackages,
        maxDepth: args.max_depth,
        includeDescriptions: args.include_descriptions,
      },
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

    if (args.filePath) {
      writeResultToFile(JSON.stringify(finalResult, null, 2), args.filePath);
    }

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
