/**
 * UpdateFunctionGroup Handler - Update Existing ABAP Function Group Metadata
 *
 * Function groups are containers for function modules and don't have source code to update.
 * This handler updates function group metadata (description).
 *
 * Uses low-level updateFunctionGroup function from @mcp-abap-adt/adt-clients.
 * Session and lock management handled internally
import { AbapConnection } from '@mcp-abap-adt/connection';.
 *
 * Workflow: lock -> get current -> update metadata -> unlock
 */

import { AxiosResponse, return_error, return_response, encodeSapObjectName } from '../../../lib/utils';
import { CrudClient, ReadOnlyClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "UpdateFunctionGroup",
  description: "Update metadata (description) of an existing ABAP function group. Function groups are containers for function modules and don't have source code to update directly. Uses stateful session with proper lock/unlock mechanism.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: {
        type: "string",
        description: "Function group name (e.g., ZTEST_FG_001). Must exist in the system."
      },
      description: {
        type: "string",
        description: "New description for the function group."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Optional if object is local or already in transport."
      }
    },
    required: ["function_group_name", "description"]
  }
} as const;

interface UpdateFunctionGroupArgs {
  function_group_name: string;
  description: string;
  transport_request?: string;
}

/**
 * Main handler for UpdateFunctionGroup MCP tool
 *
 * Uses low-level updateFunctionGroup function
 * Session and lock management handled internally
 */
export async function handleUpdateFunctionGroup(context: HandlerContext, args: UpdateFunctionGroupArgs) {
  const { connection, logger } = context;
    try {
    const {
      function_group_name,
      description,
      transport_request
    } = args as UpdateFunctionGroupArgs;

    // Validation
    if (!function_group_name || !description) {
      return return_error(new Error('function_group_name and description are required'));
    }

            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    const functionGroupName = function_group_name.toUpperCase();
    logger?.info(`Starting function group metadata update: ${functionGroupName}`);

    try {
      // Use CrudClient for lock/unlock
      const crudClient = new CrudClient(connection);

      let lockHandle: string | undefined = undefined;
      try {
        // Lock function group
        await crudClient.lockFunctionGroup({ functionGroupName });
        lockHandle = crudClient.getLockHandle();
        if (!lockHandle) {
          throw new Error('Failed to acquire lock handle');
        }

        // Small delay to ensure lock is fully established
        await new Promise(resolve => setTimeout(resolve, 200));

        // Get current XML using CrudClient (same connection, same session as lock)
        // This ensures we use the same session that was used for locking
        await crudClient.readFunctionGroup(functionGroupName);
        const currentResponse = crudClient.getReadResult();
        if (!currentResponse) {
          throw new Error('Failed to get current function group data');
        }
        const currentXml = typeof currentResponse.data === 'string'
          ? currentResponse.data
          : JSON.stringify(currentResponse.data);

        // Update description in XML (limit to 40 characters - SAP requirement)
        const limitedDescription = description.length > 40 ? description.substring(0, 40) : description;
        const updatedXml = currentXml.replace(
          /adtcore:description="[^"]*"/,
          `adtcore:description="${limitedDescription.replace(/"/g, '&quot;')}"`
        );

        // Update metadata via PUT
        const encodedName = encodeSapObjectName(functionGroupName);
        const url = `/sap/bc/adt/functions/groups/${encodedName}?lockHandle=${lockHandle}${transport_request ? `&corrNr=${transport_request}` : ''}`;

        const updateResponse = await connection.makeAdtRequest({
          url,
          method: 'PUT',
          timeout: 30000, // 30 seconds default timeout
          data: updatedXml,
          headers: {
            'Content-Type': 'application/vnd.sap.adt.functions.groups.v3+xml; charset=utf-8',
            'Accept': 'application/vnd.sap.adt.functions.groups.v3+xml'
          }
        });
      } finally {
        // Always unlock if we got a lock handle
        if (lockHandle) {
          try {
            await crudClient.unlockFunctionGroup({ functionGroupName }, lockHandle);
          } catch (unlockError: any) {
            logger?.warn(`Failed to unlock function group ${functionGroupName}: ${unlockError?.message || unlockError}`);
          }
        }
      }

      logger?.info(`✅ UpdateFunctionGroup completed successfully: ${functionGroupName}`);

      // Return success result
      const result = {
        success: true,
        function_group_name: functionGroupName,
        description: description,
        transport_request: transport_request || 'local',
        message: `Function group ${functionGroupName} metadata updated successfully`,
        uri: `/sap/bc/adt/functions/groups/${encodeSapObjectName(functionGroupName)}`,
        steps_completed: ['lock', 'get_current', 'update_metadata', 'unlock']
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      logger?.error(`Error updating function group metadata ${functionGroupName}: ${error?.message || error}`);

      // Check if function group not found
      if (error.message?.includes('not found') || error.response?.status === 404) {
        return return_error(new Error(`Function group ${functionGroupName} not found.`));
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update function group: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  } finally {
    try {
      if (connection) {
        connection.reset();
        logger?.debug('Reset function group connection after use');
      }
    } catch (resetError: any) {
      logger?.error(`Failed to reset function group connection: ${resetError?.message || resetError}`);
    }
  }
}
