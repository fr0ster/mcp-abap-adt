/**
 * UpdateInterface Handler - Update existing ABAP Interface source code
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, safeCheckOperation, isAlreadyExistsError } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "UpdateInterface",
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

interface UpdateInterfaceArgs {
  interface_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateInterface MCP tool
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateInterface(context: HandlerContext, args: UpdateInterfaceArgs) {
  const { connection, logger } = context;
  try {
    const {
      interface_name,
      source_code,
      transport_request,
      activate = true
    } = args as UpdateInterfaceArgs;

    // Validation
    if (!interface_name || !source_code) {
      return return_error(new Error('interface_name and source_code are required'));
    }

    const interfaceName = interface_name.toUpperCase();
    logger?.info(`Starting interface source update: ${interfaceName}`);

            try {
      // Get configuration from environment variables
            // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
            // Create connection directly for this handler call
      // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
      logger?.debug(`[UpdateInterface] Created separate connection for handler call: ${interfaceName}`);
    } catch (connectionError: any) {
      const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
      logger?.error(`[UpdateInterface] Failed to create connection: ${errorMessage}`);
      return return_error(new Error(`Failed to create connection: ${errorMessage}`));
    }

    try {
      // Create client
      const client = new CrudClient(connection);

      // Build operation chain: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
      // Note: No validation needed for update - interface must already exist
      const shouldActivate = activate !== false; // Default to true if not specified

      // Lock
      await client.lockInterface({ interfaceName });
      const lockHandle = client.getLockHandle();

      try {
        // Step 1: Check new code BEFORE update (with sourceCode and version='inactive')
        logger?.info(`[UpdateInterface] Checking new code before update: ${interfaceName}`);
        let checkNewCodePassed = false;
        try {
          await safeCheckOperation(
            () => client.checkInterface({ interfaceName }, source_code, 'inactive'),
            interfaceName,
            {
              debug: (message: string) => logger?.debug(`[UpdateInterface] ${message}`)
            }
          );
          checkNewCodePassed = true;
          logger?.info(`[UpdateInterface] New code check passed: ${interfaceName}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            logger?.info(`[UpdateInterface] Interface ${interfaceName} was already checked - continuing`);
            checkNewCodePassed = true;
          } else {
            // Real check error - don't update if check failed
            logger?.error(`[UpdateInterface] New code check failed: ${interfaceName} | ${checkError instanceof Error ? checkError.message : String(checkError)}`);
            throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          }
        }

        // Step 2: Update (only if check passed)
        if (checkNewCodePassed) {
          logger?.info(`[UpdateInterface] Updating interface source code: ${interfaceName}`);
          await client.updateInterface({ interfaceName, sourceCode: source_code }, lockHandle);
          logger?.info(`[UpdateInterface] Interface source code updated: ${interfaceName}`);
        } else {
          logger?.info(`[UpdateInterface] Skipping update - new code check failed: ${interfaceName}`);
        }

        // Step 3: Unlock (MANDATORY after lock)
        await client.unlockInterface({ interfaceName }, lockHandle);
        logger?.info(`[UpdateInterface] Interface unlocked: ${interfaceName}`);

        // Step 4: Check inactive version (after unlock)
        logger?.info(`[UpdateInterface] Checking inactive version: ${interfaceName}`);
        try {
          await safeCheckOperation(
            () => client.checkInterface({ interfaceName }, undefined, 'inactive'),
            interfaceName,
            {
              debug: (message: string) => logger?.debug(`[UpdateInterface] ${message}`)
            }
          );
          logger?.info(`[UpdateInterface] Inactive version check completed: ${interfaceName}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            logger?.info(`[UpdateInterface] Interface ${interfaceName} was already checked - continuing`);
          } else {
            // Log warning but don't fail - inactive check is informational
            logger?.warn(`[UpdateInterface] Inactive version check had issues: ${interfaceName} | ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          }
        }

        // Activate if requested
        if (shouldActivate) {
          await client.activateInterface({ interfaceName });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockInterface({ interfaceName: interfaceName }, lockHandle);
        } catch (unlockError) {
          logger?.error(`Failed to unlock interface after error: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
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

      logger?.info(`✅ UpdateInterface completed successfully: ${interfaceName}`);

      // Return success result
      const stepsCompleted = ['lock', 'check_new_code', 'update', 'unlock', 'check_inactive'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      return return_response({
        data: JSON.stringify({
          success: true,
          interface_name: interfaceName,
          transport_request: transport_request || 'local',
          activated: shouldActivate,
          message: `Interface ${interfaceName} updated successfully${shouldActivate ? ' and activated' : ''}`,
          activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
          steps_completed: stepsCompleted
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger?.error(`Error updating interface source ${interfaceName}: ${error?.message || error}`);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update interface: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
