/**
 * UpdateClass Handler - Update Existing ABAP Class Source Code
 *
 * Uses ClassBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection, safeCheckOperation, isAlreadyExistsError } from '../../../lib/utils';
import { handlerLogger } from '../../../lib/logger';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateClass",
  description: "Update source code of an existing ABAP class. Locks the class, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing classes without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections."
      },
      activate: {
        type: "boolean",
        description: "Activate class after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation."
      }
    },
    required: ["class_name", "source_code"]
  }
} as const;

interface UpdateClassArgs {
  class_name: string;
  source_code: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateClass
 *
 * Uses ClassBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateClass(params: UpdateClassArgs) {
  const args: UpdateClassArgs = params;

  // Validate required parameters
  if (!args.class_name || !args.source_code) {
    return return_error(new Error("Missing required parameters: class_name and source_code"));
  }

  const className = args.class_name.toUpperCase();
  const connection = getManagedConnection();

  logger.info(`Starting UpdateClass for ${className}`);
  handlerLogger.info('UpdateClass', 'start', `Starting class update: ${className}`, {
    className,
    sourceCodeLength: args.source_code.length,
    shouldActivate: args.activate === true
  });

  try {
    // Create client
    const client = new CrudClient(connection);

    // Build operation chain: validate -> lock -> update -> check -> unlock -> (activate)
    const shouldActivate = args.activate === true; // Default to false if not specified

    // Validate (for update, "already exists" is expected - object must exist)
    handlerLogger.debug('UpdateClass', 'validate', `Validating class: ${className}`);
    try {
      await client.validateClass({ className: className, packageName: undefined, description: undefined });
      handlerLogger.debug('UpdateClass', 'validate', `Validation completed for: ${className}`);
    } catch (validateError: any) {
      // For update operations, "already exists" is expected - object must exist
      if (!isAlreadyExistsError(validateError)) {
        // Real validation error - rethrow
        handlerLogger.error('UpdateClass', 'validate', `Validation failed for: ${className}`, {
          error: validateError instanceof Error ? validateError.message : String(validateError)
        });
        throw validateError;
      }
      // "Already exists" is OK for update - continue
      handlerLogger.debug('UpdateClass', 'validate', `Class ${className} already exists - this is expected for update operation`);
    }

    // Lock
    handlerLogger.debug('UpdateClass', 'lock', `Locking class: ${className}`);
    await client.lockClass({ className: className });
    const lockHandle = client.getLockHandle();
    handlerLogger.debug('UpdateClass', 'lock', `Class locked: ${className}`, {
      lockHandle: lockHandle ? lockHandle.substring(0, 50) + '...' : null
    });

    try {
      // Update source code
      handlerLogger.debug('UpdateClass', 'update', `Updating class source code: ${className}`, {
        className,
        sourceCodeLength: args.source_code.length
      });
      await client.updateClass({ className: className, sourceCode: args.source_code }, lockHandle);
      handlerLogger.debug('UpdateClass', 'update', `Class source code updated: ${className}`);

      // Check
      handlerLogger.debug('UpdateClass', 'check', `Checking class syntax: ${className}`);
      try {
        await safeCheckOperation(
          () => client.checkClass({ className: className }),
          className,
          {
            debug: (message: string) => handlerLogger.debug('UpdateClass', 'check', message)
          }
        );
        handlerLogger.debug('UpdateClass', 'check', `Class check completed: ${className}`);
      } catch (checkError: any) {
        // If error was marked as "already checked", continue silently
        if ((checkError as any).isAlreadyChecked) {
          handlerLogger.debug('UpdateClass', 'check', `Class ${className} was already checked - this is OK, continuing`);
        } else {
          // Real check error - rethrow
          throw checkError;
        }
      }

      // Unlock
      handlerLogger.debug('UpdateClass', 'unlock', `Unlocking class: ${className}`);
      await client.unlockClass({ className: className }, lockHandle);
      handlerLogger.debug('UpdateClass', 'unlock', `Class unlocked: ${className}`);

      // Activate if requested
      if (shouldActivate) {
        handlerLogger.debug('UpdateClass', 'activate', `Activating class: ${className}`);
        await client.activateClass({ className: className });
        handlerLogger.debug('UpdateClass', 'activate', `Class activated: ${className}`);
      } else {
        handlerLogger.debug('UpdateClass', 'activate', `Skipping activation for: ${className}`);
      }
    } catch (error) {
      handlerLogger.error('UpdateClass', 'error', `Error during update workflow: ${className}`, {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      });
      // Try to unlock on error
      try {
        handlerLogger.debug('UpdateClass', 'cleanup', `Attempting to unlock class after error: ${className}`);
        await client.unlockClass({ className: className }, lockHandle);
        handlerLogger.debug('UpdateClass', 'cleanup', `Successfully unlocked class after error: ${className}`);
      } catch (unlockError) {
        handlerLogger.error('UpdateClass', 'cleanup_error', `Failed to unlock class after error: ${className}`, {
          unlockError: unlockError instanceof Error ? unlockError.message : String(unlockError)
        });
        logger.error('Failed to unlock class after error:', unlockError);
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

    // Return success result
    const stepsCompleted = ['lock', 'update', 'check', 'unlock'];
    if (shouldActivate) {
      stepsCompleted.push('activate');
    }

    handlerLogger.info('UpdateClass', 'complete', `Class update completed: ${className}`, {
      className,
      stepsCompleted,
      shouldActivate,
      hasActivationWarnings: activationWarnings.length > 0
    });

    const result = {
      success: true,
      class_name: className,
      type: 'CLAS/OC',
      message: shouldActivate
        ? `Class ${className} source updated and activated successfully`
        : `Class ${className} source updated successfully (not activated)`,
      uri: `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}`,
      steps_completed: stepsCompleted,
      activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
      source_size_bytes: args.source_code.length
    };

    return return_response({
      data: JSON.stringify(result, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });

  } catch (error: any) {
    logger.error(`Error updating class ${className}:`, error);
    const errorMessage = error.response?.data
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message || String(error);

    return return_error(new Error(`Failed to update class ${className}: ${errorMessage}`));
  }
}
