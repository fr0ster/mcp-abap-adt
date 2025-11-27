import { McpError, ErrorCode, getManagedConnection } from '../../../lib/utils';
import { return_error, return_response } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { writeResultToFile } from '../../../lib/writeResultToFile';
import * as z from 'zod';

export const TOOL_DEFINITION = {
  name: "GetProgram",
  description: "[read-only] Retrieve ABAP program source code. Returns only the main program source code without includes or enhancements.",
  inputSchema: {
    program_name: z.string().describe("Name of the ABAP program")
  }
} as const;

interface GetProgramArgs {
  [key: string]: any;
}


export async function handleGetProgram(args: GetProgramArgs) {
    try {
        if (!args?.program_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Program name is required');
        }
        const connection = getManagedConnection();
        const client = new CrudClient(connection);
        await client.readProgram(args.program_name);
        const response = client.getReadResult();
        if (!response) {
            throw new McpError(ErrorCode.InternalError, 'Failed to read program');
        }
        const plainText = response.data;
        if (args.filePath) {
            writeResultToFile(plainText, args.filePath);
        }
        return return_response(response);
    }
    catch (error) {
        return return_error(error);
    }
}
