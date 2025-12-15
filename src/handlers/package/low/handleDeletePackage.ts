/**
 * DeletePackage Handler - Delete ABAP Package
 *
 * Uses CrudClient.deletePackage from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "DeletePackageLow",
  description: "[low-level] Delete an ABAP package from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      package_name: {
        type: "string",
        description: "Package name (e.g., Z_MY_PROGRAM)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      },
      force_new_connection: {
        type: "boolean",
        description: "Force creation of a new connection (bypass cache). Useful when package was locked/unlocked and needs to be deleted in a fresh session. Default: false."
      }
    },
    required: ["package_name"]
  }
} as const;

interface DeletePackageArgs {
  package_name: string;
  transport_request?: string;
  force_new_connection?: boolean;
}

/**
 * Main handler for DeletePackage MCP tool
 *
 * Uses CrudClient.deletePackage - low-level single method call
 */
export async function handleDeletePackage(connection: AbapConnection, args: DeletePackageArgs) {
  try {
    const {
      package_name,
      transport_request,
      force_new_connection = false
    } = args as DeletePackageArgs;

    // Validation
    if (!package_name) {
      return return_error(new Error('package_name is required'));
    }

    const packageName = package_name.toUpperCase();

    // Note: force_new_connection parameter is deprecated and ignored
    // All connections now use the same session management
    // To force a new session, restart the MCP server
        const client = new CrudClient(connection);
        const handlerLogger = getHandlerLogger(
      'handleDeletePackage',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    handlerLogger.info(`Starting package deletion: ${packageName}`);

    try {
      // Delete package
      await client.deletePackage({ packageName: packageName, transportRequest: transport_request });
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for package ${packageName}`);
      }

      handlerLogger.info(`✅ DeletePackage completed successfully: ${packageName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          package_name: packageName,
          transport_request: transport_request || null,
          message: `Package ${packageName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error deleting package ${packageName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to delete package: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Package ${packageName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Package ${packageName} is locked by another user. Cannot delete.`;
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
