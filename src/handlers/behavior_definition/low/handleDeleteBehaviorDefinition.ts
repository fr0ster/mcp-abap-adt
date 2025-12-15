/**
 * DeleteBehaviorDefinition Handler - Delete ABAP Behavior Definition
 *
 * Uses CrudClient.deleteBehaviorDefinition from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse  } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { dClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorDefinitionBuilderConfig } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "DeleteBehaviorDefinitionLow",
  description: "[low-level] Delete an ABAP behavior definition from the SAP system via ADT deletion API. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "BehaviorDefinition name (e.g., ZI_MY_BDEF)."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["name"]
  }
} as const;

interface DeleteBehaviorDefinitionArgs {
  name: string;
  transport_request?: string;
}

/**
 * Main handler for DeleteBehaviorDefinition MCP tool
 *
 * Uses CrudClient.deleteBehaviorDefinition - low-level single method call
 */
export async function handleDeleteBehaviorDefinition(connection: AbapConnection, args: DeleteBehaviorDefinitionArgs) {
  try {
    const {
      name,
      transport_request
    } = args as DeleteBehaviorDefinitionArgs;

    // Validation
    if (!name) {
      return return_error(new Error('name is required'));
    }

    const handlerLogger = getHandlerLogger(
      'handleDeleteBehaviorDefinition',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

        const client = new CrudClient(connection);
    const bdefName = name.toUpperCase();

    handlerLogger.info(`Starting behavior definition deletion: ${bdefName}`);

    try {
      // Delete behavior definition - using types from adt-clients
      const deleteConfig: Pick<BehaviorDefinitionBuilderConfig, 'name'> & Partial<Pick<BehaviorDefinitionBuilderConfig, 'transportRequest'>> = {
        name: bdefName,
        ...(transport_request && { transportRequest: transport_request })
      };
      await client.deleteBehaviorDefinition(deleteConfig);
      const deleteResult = client.getDeleteResult();

      if (!deleteResult) {
        throw new Error(`Delete did not return a response for behavior definition ${bdefName}`);
      }

      handlerLogger.info(`✅ DeleteBehaviorDefinition completed successfully: ${bdefName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          name: bdefName,
          transport_request: transport_request || null,
          message: `BehaviorDefinition ${bdefName} deleted successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error deleting behavior definition ${bdefName}: ${error?.message || error}`);

      // Parse error message
      let errorMessage = `Failed to delete behavior definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `BehaviorDefinition ${bdefName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `BehaviorDefinition ${bdefName} is locked by another user. Cannot delete.`;
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
