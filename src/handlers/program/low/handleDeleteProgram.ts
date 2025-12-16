/**
 * DeleteProgram Handler - Delete ABAP Program
 *
 * Uses CrudClient.deleteProgram from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, isCloudConnection, AxiosResponse } from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "DeleteProgramLow",
  description: "[low-level] Delete an ABAP program from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: {
        type: "string",
        description: "Program name (e.g., Z_MY_PROGRAM)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["program_name"]
  }
} as const;

interface DeleteProgramArgs {
  program_name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteProgram MCP tool
 *
 * Uses CrudClient.deleteProgram - low-level single method call
 */
export async function handleDeleteProgram(context: HandlerContext, args: DeleteProgramArgs) {
  const { connection, logger } = context;
  try {
    const {
      program_name,
      transport_request
    } = args;

    // Validation
    if (!program_name) {
      return return_error(new Error('program_name is required'));
    }

    // Check if cloud - programs are not available on cloud systems
    if (isCloudConnection()) {
      return return_error(new Error('Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.'));
    }

    const client = new CrudClient(connection);
    const programName = program_name.toUpperCase();

    logger?.info(`Starting program deletion: ${programName}`);

    try {
      // Delete program
      await client.deleteProgram({ programName: programName, transportRequest: transport_request });
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for program ${programName}`);
      }

      logger?.info(`✅ DeleteProgram completed successfully: ${programName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          program_name: programName,
          transport_request: transport_request || null,
          message: `Program ${programName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger?.error(`Error deleting program ${programName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to delete program: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Program ${programName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Program ${programName} is locked by another user. Cannot delete.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Bad request. Check if transport request is required and valid.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_'
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
