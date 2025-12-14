import { McpError, ErrorCode, AxiosResponse } from '../../../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, encodeSapObjectName, logger as baseLogger } from '../../../lib/utils';
import { writeResultToFile } from '../../../lib/writeResultToFile';
import * as z from 'zod';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

import { getManagedConnection } from '../../../lib/utils';
export const TOOL_DEFINITION = {
  name: "GetInclude",
  description: "[read-only] Retrieve source code of a specific ABAP include file.",
  inputSchema: {
    include_name: z.string().describe("Name of the ABAP Include")
  }
} as const;

export async function handleGetInclude(args: any) {
    try {
        const handlerLogger = getHandlerLogger(
          'handleGetInclude',
          process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
        );

        if (!args?.include_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Include name is required');
        }
        const url = `/sap/bc/adt/programs/includes/${encodeSapObjectName(args.include_name)}/source/main`;
        handlerLogger.info(`Fetching include: ${args.include_name}`);
        const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
        const plainText = response.data;
        if (args.filePath) {
            writeResultToFile(plainText, args.filePath);
        }
        handlerLogger.info(`✅ GetInclude completed: ${args.include_name}`);
        return {
            isError: false,
            content: [
                {
                    type: "text",
                    text: plainText
                }
            ]
        };
    } catch (error) {
        const handlerLogger = getHandlerLogger(
          'handleGetInclude',
          process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
        );
        handlerLogger.error(`Error getting include ${args?.include_name ?? ''}: ${error instanceof Error ? error.message : String(error)}`);
        return {
            isError: true,
            content: [
                {
                    type: "text",
                    text: error instanceof Error ? error.message : String(error)
                }
            ]
        };
    }
}
