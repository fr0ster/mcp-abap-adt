import convert from 'xml-js';
import * as z from 'zod';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  ErrorCode,
  McpError,
  makeAdtRequestWithTimeout,
} from '../../../lib/utils';
import { writeResultToFile } from '../../../lib/writeResultToFile';

// TODO: Migrate to infrastructure module
// This handler uses getPackageContents() from @mcp-abap-adt/adt-clients/src/core/package/read.ts
// AdtClient.getPackage().read() doesn't return package contents
// Need infrastructure module with method that returns parsed package contents

export const TOOL_DEFINITION = {
  name: 'GetPackageContents',
  description: '[read-only] Retrieve objects inside an ABAP package.',
  inputSchema: {
    package_name: z.string().describe('Name of the ABAP package'),
  },
} as const;

interface GetPackageContentsArgs {
  package_name: string;
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

    const nodeContentsUrl = `/sap/bc/adt/repository/nodestructure`;
    const nodeContentsParams = {
      parent_type: 'DEVC/K',
      parent_name: args.package_name,
      withShortDescriptions: true,
    };

    const package_structure_response = await makeAdtRequestWithTimeout(
      connection,
      nodeContentsUrl,
      'POST',
      'default',
      undefined,
      nodeContentsParams,
    );
    const result = convert.xml2js(package_structure_response.data, {
      compact: true,
    });

    const nodes =
      result['asx:abap']?.['asx:values']?.DATA?.TREE_CONTENT
        ?.SEU_ADT_REPOSITORY_OBJ_NODE || [];
    const extractedData = (Array.isArray(nodes) ? nodes : [nodes])
      .filter((node) => node.OBJECT_NAME?._text && node.OBJECT_URI?._text)
      .map((node) => ({
        OBJECT_TYPE: node.OBJECT_TYPE._text,
        OBJECT_NAME: node.OBJECT_NAME._text,
        OBJECT_DESCRIPTION: node.DESCRIPTION?._text,
        OBJECT_URI: node.OBJECT_URI._text,
      }));

    const finalResult = {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(extractedData, null, 2),
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
