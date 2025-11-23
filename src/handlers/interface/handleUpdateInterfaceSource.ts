/**
 * UpdateInterfaceSource Handler - Update existing ABAP Interface source code
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateInterfaceSource",
  description: "Update source code of an existing ABAP interface. Uses stateful session with proper lock/unlock mechanism. Lock handle and transport number are passed in URL parameters.",
  inputSchema: {
    type: "object",
    properties: {
      interface_name: {
        type: "string",
        description: "Interface name (e.g., ZIF_MY_INTERFACE). Must exist in the system."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP interface source code with INTERFACE...ENDINTERFACE section."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Optional if object is local or already in transport."
      },
      activate: {
        type: "boolean",
        description: "Activate interface after update. Default: true."
      }
    },
    required: ["interface_name", "source_code"]
  }
} as const;

interface UpdateInterfaceSourceArgs {
  interface_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateInterfaceSource MCP tool
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateInterfaceSource(args: any) {
  try {
    const {
      interface_name,
      source_code,
      transport_request,
      activate = true
    } = args as UpdateInterfaceSourceArgs;

    // Validation
    if (!interface_name || !source_code) {
      return return_error(new Error('interface_name and source_code are required'));
    }

    const connection = getManagedConnection();
    const interfaceName = interface_name.toUpperCase();

    logger.info(`Starting interface source update: ${interfaceName}`);

    try {
      // Create client
      const client = new CrudClient(connection);

      // Build operation chain: validate -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = activate !== false; // Default to true if not specified

      // Validate
      await client.validateInterface(interfaceName);

      // Lock
      await client.lockInterface(interfaceName);
      const lockHandle = client.getLockHandle();

      try {
        // Update source code
        await client.updateInterface(interfaceName, source_code, lockHandle);

        // Check
        await client.checkInterface(interfaceName);

        // Unlock
        await client.unlockInterface(interfaceName, lockHandle);

        // Activate if requested
        if (shouldActivate) {
          await client.activateInterface(interfaceName);
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockInterface(interfaceName, lockHandle);
        } catch (unlockError) {
          logger.error('Failed to unlock interface after error:', unlockError);
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

      logger.info(`✅ UpdateInterfaceSource completed successfully: ${interfaceName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          interface_name: interfaceName,
          transport_request: transport_request || 'local',
          activated: shouldActivate,
          message: `Interface ${interfaceName} updated successfully${shouldActivate ? ' and activated' : ''}`,
          activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error updating interface source ${interfaceName}:`, error);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update interface: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
