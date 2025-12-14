/**
 * CreateInterface Handler - ABAP Interface Creation via ADT API
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by client.
 *
 * Workflow: validate -> create -> lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger as baseLogger, safeCheckOperation } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

import { getManagedConnection } from '../../../lib/utils.js';
export const TOOL_DEFINITION = {
  name: "CreateInterface",
  description: "Create a new ABAP interface in SAP system with source code. Interfaces define method signatures, events, and types for implementation by classes. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      interface_name: {
        type: "string",
        description: "Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y)."
      },
      description: {
        type: "string",
        description: "Interface description. If not provided, interface_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP interface source code with INTERFACE...ENDINTERFACE section. If not provided, generates minimal template."
      },
      activate: {
        type: "boolean",
        description: "Activate interface after creation. Default: true. Set to false for batch operations (activate multiple objects later)."
      }
    },
    required: ["interface_name", "package_name"]
  }
} as const;

interface CreateInterfaceArgs {
  interface_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  source_code?: string;
  activate?: boolean;
}

/**
 * Generate minimal interface source code if not provided
 */
function generateInterfaceTemplate(interfaceName: string, description: string): string {
  return `INTERFACE ${interfaceName}
  PUBLIC.

  " ${description}

  METHODS: get_value
    RETURNING VALUE(rv_result) TYPE string.

ENDINTERFACE.`;
}


/**
 * Main handler for CreateInterface MCP tool
 *
 * Uses InterfaceBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by client
 */
export async function handleCreateInterface(args: CreateInterfaceArgs) {
  const handlerLogger = getHandlerLogger(
    'handleCreateInterface',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  try {
    // Validate required parameters
    if (!args?.interface_name) {
      return return_error(new Error('interface_name is required'));
    }
    if (!args?.package_name) {
      return return_error(new Error('package_name is required'));
    }

    // Validate transport_request: required for non-$TMP packages
    try {
      validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
      return return_error(error as Error);
    }

    const typedArgs = args as CreateInterfaceArgs;
    const interfaceName = typedArgs.interface_name.toUpperCase();

    handlerLogger.info(`Starting interface creation: ${interfaceName}`);

    // Create a separate connection for this handler call (not using getManagedConnection)
    let connection: any = null;
    try {
      // Get configuration from environment variables
            // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
            // Create connection directly for this handler call
      // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    connection = getManagedConnection();

      handlerLogger.debug(`[CreateInterface] Created separate connection for handler call: ${interfaceName}`);
    } catch (connectionError: any) {
      const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
      handlerLogger.error(`[CreateInterface] Failed to create connection: ${errorMessage}`);
      return return_error(new Error(`Failed to create connection: ${errorMessage}`));
    }

    try {
      // Generate source code if not provided
      const sourceCode = typedArgs.source_code || generateInterfaceTemplate(interfaceName, typedArgs.description || interfaceName);

      // Create CrudClient
      const client = new CrudClient(connection);
      const description = typedArgs.description || interfaceName;
      const packageName = typedArgs.package_name;
      const transportRequest = typedArgs.transport_request || '';
      const shouldActivate = typedArgs.activate !== false;

      // Execute the workflow
      try {
        await client.createInterface({
          interfaceName,
          description,
          packageName,
          transportRequest
        });
        await client.lockInterface({ interfaceName });
        const lockHandle = client.getLockHandle();

        try {
          // Step 1: Check new code BEFORE update (with sourceCode and version='inactive')
          handlerLogger.info(`[CreateInterface] Checking new code before update: ${interfaceName}`);
          let checkNewCodePassed = false;
          try {
            await safeCheckOperation(
              () => client.checkInterface({ interfaceName }, sourceCode, 'inactive'),
              interfaceName,
              {
                debug: (message: string) => handlerLogger.debug(`[CreateInterface] ${message}`)
              }
            );
            checkNewCodePassed = true;
            handlerLogger.info(`[CreateInterface] New code check passed: ${interfaceName}`);
          } catch (checkError: any) {
            // If error was marked as "already checked", continue silently
            if ((checkError as any).isAlreadyChecked) {
              handlerLogger.info(`[CreateInterface] Interface ${interfaceName} was already checked - continuing`);
              checkNewCodePassed = true;
            } else {
              // Real check error - don't update if check failed
              handlerLogger.error(`[CreateInterface] New code check failed: ${interfaceName} | ${checkError instanceof Error ? checkError.message : String(checkError)}`);
              throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
            }
          }

          // Step 2: Update (only if check passed)
          if (checkNewCodePassed) {
            handlerLogger.info(`[CreateInterface] Updating interface source code: ${interfaceName}`);
            await client.updateInterface({ interfaceName, sourceCode }, lockHandle);
            handlerLogger.info(`[CreateInterface] Interface source code updated: ${interfaceName}`);
          } else {
            handlerLogger.info(`[CreateInterface] Skipping update - new code check failed: ${interfaceName}`);
          }

          // Step 3: Unlock (MANDATORY after lock)
          await client.unlockInterface({ interfaceName }, lockHandle);
          handlerLogger.info(`[CreateInterface] Interface unlocked: ${interfaceName}`);

          // Step 4: Check inactive version (after unlock)
          handlerLogger.info(`[CreateInterface] Checking inactive version: ${interfaceName}`);
          try {
            await safeCheckOperation(
              () => client.checkInterface({ interfaceName }, undefined, 'inactive'),
              interfaceName,
              {
                debug: (message: string) => handlerLogger.debug(`[CreateInterface] ${message}`)
              }
            );
            handlerLogger.info(`[CreateInterface] Inactive version check completed: ${interfaceName}`);
          } catch (checkError: any) {
            // If error was marked as "already checked", continue silently
            if ((checkError as any).isAlreadyChecked) {
              handlerLogger.info(`[CreateInterface] Interface ${interfaceName} was already checked - continuing`);
            } else {
              // Log warning but don't fail - inactive check is informational
              handlerLogger.warn(`[CreateInterface] Inactive version check had issues: ${interfaceName} | ${checkError instanceof Error ? checkError.message : String(checkError)}`);
            }
          }

          // Step 5: Activate
          if (shouldActivate) {
            await client.activateInterface({ interfaceName });
          }
        } catch (error) {
          // Unlock on error (principle 1: if lock was done, unlock is mandatory)
          try {
            await client.unlockInterface({ interfaceName }, lockHandle);
          } catch (unlockError) {
            handlerLogger.error(`Failed to unlock interface after error: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
          }
          // Principle 2: first error and exit
          throw error;
        }
      } catch (error) {
        handlerLogger.error(`Interface creation chain failed: ${error instanceof Error ? error.message : String(error)}`);
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

      // Return success result
      const stepsCompleted = ['validate', 'create', 'lock', 'check_new_code', 'update', 'unlock', 'check_inactive'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        interface_name: interfaceName,
        package_name: packageName,
        transport_request: transportRequest || null,
        type: 'INTF/OI',
        message: shouldActivate
          ? `Interface ${interfaceName} created and activated successfully`
          : `Interface ${interfaceName} created successfully (not activated)`,
        uri: `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName).toLowerCase()}`,
        steps_completed: stepsCompleted,
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      handlerLogger.error(`Interface creation failed: ${error instanceof Error ? error.message : String(error)}`);
      return return_error(error);
    } finally {
      // Cleanup: Reset connection created for this handler call
      if (connection) {
        try {
          connection.reset();
          handlerLogger.debug(`[CreateInterface] Reset connection`);
        } catch (resetError: any) {
          handlerLogger.error(`[CreateInterface] Failed to reset connection: ${resetError.message || resetError}`);
        }
      }
    }
  } catch (error: any) {
    handlerLogger.error(`CreateInterface handler error: ${error instanceof Error ? error.message : String(error)}`);
    return return_error(error);
  }
}
