import { McpError, ErrorCode } from '../lib/utils';
import { return_error, return_response } from '../lib/utils';
import { getReadOnlyClient } from '../lib/clients';
import { writeResultToFile } from '../lib/writeResultToFile';

export const TOOL_DEFINITION = {
  name: "GetProgram",
  description: "Retrieve ABAP program source code. Returns only the main program source code without includes or enhancements.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: { type: "string", description: "Name of the ABAP program" }
    },
    required: ["program_name"]
  }
} as const;

export async function handleGetProgram(args: any) {
    try {
        if (!args?.program_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Program name is required');
        }
        const response = await getReadOnlyClient().getProgram(args.program_name);
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
