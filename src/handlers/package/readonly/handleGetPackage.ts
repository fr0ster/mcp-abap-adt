import { McpError, ErrorCode } from '../../../lib/utils';
import { makeAdtRequestWithTimeout } from '../../../lib/utils';
import convert from 'xml-js';
import { writeResultToFile } from '../../../lib/writeResultToFile';
import * as z from 'zod';

import type { HandlerContext } from '../../../lib/handlers/interfaces';
export const TOOL_DEFINITION = {
  name: "GetPackage",
  description: "[read-only] Retrieve ABAP package details.",
  inputSchema: {
    package_name: z.string().describe("Name of the ABAP package")
  }
} as const;

interface GetPackageArgs {
  package_name: string;
  filePath?: string;
}

export async function handleGetPackage(context: HandlerContext, args: GetPackageArgs) {
  const { connection, logger } = context;
    try {
        if (!args?.package_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
        }

        const nodeContentsUrl = `/sap/bc/adt/repository/nodestructure`;
        const nodeContentsParams = {
            parent_type: "DEVC/K",
            parent_name: args.package_name,
            withShortDescriptions: true
        };

        const package_structure_response = await makeAdtRequestWithTimeout(connection, nodeContentsUrl, 'POST', 'default', undefined, nodeContentsParams);
        const result = convert.xml2js(package_structure_response.data, {compact: true});

        const nodes = result["asx:abap"]?.["asx:values"]?.DATA?.TREE_CONTENT?.SEU_ADT_REPOSITORY_OBJ_NODE || [];
        const extractedData = (Array.isArray(nodes) ? nodes : [nodes]).filter(node =>
            node.OBJECT_NAME?._text && node.OBJECT_URI?._text
        ).map(node => ({
            OBJECT_TYPE: node.OBJECT_TYPE._text,
            OBJECT_NAME: node.OBJECT_NAME._text,
            OBJECT_DESCRIPTION: node.DESCRIPTION?._text,
            OBJECT_URI: node.OBJECT_URI._text
        }));

        const finalResult = {
            isError: false,
            content: [{
                type: 'text',
                text: JSON.stringify(extractedData, null, 2)
            }]
        };
        if (args.filePath) {
            writeResultToFile(JSON.stringify(finalResult, null, 2), args.filePath);
        }
        return finalResult;

    } catch (error) {
        return {
            isError: true,
            content: [{
                type: 'text',
                text: error instanceof Error ? error.message : String(error)
            }]
        };
    }
}
