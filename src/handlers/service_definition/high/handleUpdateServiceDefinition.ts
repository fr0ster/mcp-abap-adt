/**
 * UpdateServiceDefinition Handler - Update Existing ABAP Service Definition Source
 *
 * Uses CrudClient from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by client.
 *
 * Workflow: lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection, safeCheckOperation, isAlreadyExistsError } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateServiceDefinition",
  description: "Update source code of an existing ABAP service definition. Uses stateful session with proper lock/unlock mechanism.",
  inputSchema: {
    type: "object",
    properties: {
      service_definition_name: {
        type: "string",
        description: "Service definition name (e.g., ZSD_MY_SERVICE). Must exist in the system."
      },
      source_code: {
        type: "string",
        description: "Complete service definition source code."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Optional if object is local or already in transport."
      },
      activate: {
        type: "boolean",
        description: "Activate service definition after update. Default: true."
      }
    },
    required: ["service_definition_name", "source_code"]
  }
} as const;

interface UpdateServiceDefinitionArgs {
  service_definition_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Main handler for UpdateServiceDefinition MCP tool
 *
 * Uses CrudClient for all operations
 * Session and lock management handled internally by client
 */
export async function handleUpdateServiceDefinition(args: UpdateServiceDefinitionArgs) {
  try {
    const {
      service_definition_name,
      source_code,
      transport_request,
      activate = true
    } = args as UpdateServiceDefinitionArgs;

    // Validation
    if (!service_definition_name || !source_code) {
      return return_error(new Error('service_definition_name and source_code are required'));
    }

    const connection = getManagedConnection();
    const serviceDefinitionName = service_definition_name.toUpperCase();

    logger.info(`Starting service definition source update: ${serviceDefinitionName}`);

    try {
      // Create client
      const client = new CrudClient(connection);

      // Build operation chain: lock -> update -> check -> unlock -> (activate)
      // Note: No validation needed for update - service definition must already exist
      const shouldActivate = activate !== false; // Default to true if not specified

      // Lock
      await client.lockServiceDefinition({ serviceDefinitionName });
      const lockHandle = client.getLockHandle();

      try {
        // Update source code
        await client.updateServiceDefinition(
          { serviceDefinitionName, sourceCode: source_code },
          lockHandle
        );

        // Check
        try {
          await safeCheckOperation(
            () => client.checkServiceDefinition({ serviceDefinitionName }),
            serviceDefinitionName,
            {
              debug: (message: string) => logger.info(`[UpdateServiceDefinition] ${message}`)
            }
          );
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if (!(checkError as any).isAlreadyChecked) {
            // Real check error - rethrow
            throw checkError;
          }
        }

        // Unlock
        await client.unlockServiceDefinition({ serviceDefinitionName }, lockHandle);

        // Activate if requested
        if (shouldActivate) {
          await client.activateServiceDefinition({ serviceDefinitionName });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockServiceDefinition({ serviceDefinitionName: serviceDefinitionName }, lockHandle);
        } catch (unlockError) {
          logger.error('Failed to unlock service definition after error:', unlockError);
        }
        throw error;
      }

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (shouldActivate && client.getActivateResult()) {
        const activateResponse = client.getActivateResult()!;
        if (typeof activateResponse.data === 'string' && activateResponse.data.includes('<chkl:messages')) {
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const result = parser.parse(activateResponse.data);
          const messages = result?.['chkl:messages']?.['msg'];
          if (messages) {
            const msgArray = Array.isArray(messages) ? messages : [messages];
            activationWarnings = msgArray.map((msg: any) =>
              `${msg['@_type']}: ${msg['shortText']?.['txt'] || 'Unknown'}`
            );
          }
        }
      }

      logger.info(`✅ UpdateServiceDefinition completed successfully: ${serviceDefinitionName}`);

      // Return success result
      const stepsCompleted = ['lock', 'update', 'check', 'unlock'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        service_definition_name: serviceDefinitionName,
        transport_request: transport_request || 'local',
        activated: shouldActivate,
        message: shouldActivate
          ? `Service Definition ${serviceDefinitionName} updated and activated successfully`
          : `Service Definition ${serviceDefinitionName} updated successfully (not activated)`,
        uri: `/sap/bc/adt/ddic/srvd/sources/${encodeSapObjectName(serviceDefinitionName)}`,
        steps_completed: stepsCompleted,
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
        source_size_bytes: source_code.length
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      logger.error(`Error updating service definition source ${serviceDefinitionName}:`, error);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update service definition: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}

