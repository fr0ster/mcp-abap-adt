/**
 * UpdateBehaviorImplementation Handler - Update Existing ABAP Behavior Implementation
 *
 * Uses CrudClient from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by client.
 *
 * Workflow: lock -> update main source -> update implementations -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger as baseLogger, safeCheckOperation } from '../../../lib/utils';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { BehaviorImplementationBuilderConfig } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "UpdateBehaviorImplementation",
  description: "Update source code of an existing ABAP behavior implementation class. Updates both main source (with FOR BEHAVIOR OF clause) and implementations include. Uses stateful session with proper lock/unlock mechanism.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Behavior Implementation class name (e.g., ZBP_MY_ENTITY). Must exist in the system."
      },
      behavior_definition: {
        type: "string",
        description: "Behavior Definition name (e.g., ZI_MY_ENTITY). Must match the behavior definition used when creating the class."
      },
      implementation_code: {
        type: "string",
        description: "Implementation code for the implementations include. Contains the actual behavior implementation methods."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Optional if object is local or already in transport."
      },
      activate: {
        type: "boolean",
        description: "Activate behavior implementation after update. Default: true."
      }
    },
    required: ["class_name", "behavior_definition", "implementation_code"]
  }
} as const;

interface UpdateBehaviorImplementationArgs {
  class_name: string;
  behavior_definition: string;
  implementation_code: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Main handler for UpdateBehaviorImplementation MCP tool
 *
 * Uses CrudClient for all operations
 * Session and lock management handled internally by client
 */
export async function handleUpdateBehaviorImplementation(connection: AbapConnection, args: UpdateBehaviorImplementationArgs) {
  try {
    const {
      class_name,
      behavior_definition,
      implementation_code,
      transport_request,
      activate = true
    } = args as UpdateBehaviorImplementationArgs;
    const handlerLogger = getHandlerLogger(
      'handleUpdateBehaviorImplementation',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );
        // Validation
    if (!class_name || !behavior_definition || !implementation_code) {
      return return_error(new Error('class_name, behavior_definition, and implementation_code are required'));
    }

            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    const className = class_name.toUpperCase();
    const behaviorDefinition = behavior_definition.toUpperCase();

    handlerLogger.info(`Starting behavior implementation source update: ${className} for ${behaviorDefinition}`);

    try {
      // Create client
      const client = new CrudClient(connection);

      // Build operation chain: lock -> update main source -> update implementations -> check -> unlock -> (activate)
      // Note: No validation needed for update - behavior implementation must already exist
      const shouldActivate = activate !== false; // Default to true if not specified

      // Lock
      await client.lockClass({ className });
      const lockHandle = client.getLockHandle();

      try {
        // Update main source with "FOR BEHAVIOR OF" clause
        await client.updateBehaviorImplementationMainSource(
          { className, behaviorDefinition },
          lockHandle
        );

        // Update implementations include
        await client.updateBehaviorImplementation(
          { className, behaviorDefinition, implementationCode: implementation_code },
          lockHandle
        );

        // Check
        try {
          await safeCheckOperation(
            () => client.checkClass({ className }),
            className,
            {
              debug: (message: string) => handlerLogger.debug(message)
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
        await client.unlockClass({ className }, lockHandle);

        // Activate if requested
        if (shouldActivate) {
          await client.activateClass({ className });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockClass({ className: className }, lockHandle);
        } catch (unlockError) {
          handlerLogger.error(`Failed to unlock behavior implementation after error: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
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

      handlerLogger.info(`✅ UpdateBehaviorImplementation completed successfully: ${className}`);

      // Return success result
      const stepsCompleted = ['lock', 'update_main_source', 'update_implementations', 'check', 'unlock'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        class_name: className,
        behavior_definition: behaviorDefinition,
        transport_request: transport_request || 'local',
        activated: shouldActivate,
        message: shouldActivate
          ? `Behavior Implementation ${className} updated and activated successfully`
          : `Behavior Implementation ${className} updated successfully (not activated)`,
        uri: `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}`,
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
      handlerLogger.error(`Error updating behavior implementation source ${className}: ${error?.message || error}`);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update behavior implementation: ${errorMessage}`));
    } finally {
      try {
        if (connection) {
          connection.reset();
          handlerLogger.debug('Reset behavior implementation connection after use');
        }
      } catch (resetError: any) {
        handlerLogger.error(`Failed to reset behavior implementation connection: ${resetError?.message || resetError}`);
      }
    }

  } catch (error: any) {
    return return_error(error);
  }
}
