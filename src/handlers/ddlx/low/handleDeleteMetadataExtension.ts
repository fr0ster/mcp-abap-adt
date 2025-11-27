/**
 * DeleteMetadataExtension Handler - Delete ABAP MetadataExtension
 *
 * Uses CrudClient.deleteMetadataExtension from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "DeleteMetadataExtensionLow",
  description: "[low-level] Delete an ABAP metadata extension from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "MetadataExtension name (e.g., ZI_MY_DDLX)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["name"]
  }
} as const;

interface DeleteMetadataExtensionArgs {
  name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteMetadataExtension MCP tool
 *
 * Uses CrudClient.deleteMetadataExtension - low-level single method call
 */
export async function handleDeleteMetadataExtension(args: DeleteMetadataExtensionArgs) {
  try {
    const {
      name,
      transport_request
    } = args as DeleteMetadataExtensionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);
    const ddlxName = name.toUpperCase();

    logger.info(`Starting metadata extension deletion: ${ddlxName}`);

    try {
      // Delete metadata extension
      await client.deleteMetadataExtension({ name: ddlxName, transportRequest: transport_request });
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for metadata extension ${ddlxName}`);
      }

      logger.info(`✅ DeleteMetadataExtension completed successfully: ${ddlxName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          ddlxName: ddlxName,
          transport_request: transport_request || null,
          message: `MetadataExtension ${ddlxName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error deleting metadata extension ${ddlxName}:`, error);

      // Parse error message
      let errorMessage = `Failed to delete metadata extension: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `MetadataExtension ${ddlxName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `MetadataExtension ${ddlxName} is locked by another user. Cannot delete.`;
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

