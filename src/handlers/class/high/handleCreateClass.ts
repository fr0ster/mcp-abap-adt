/**
 * CreateClass Handler - ABAP Class Creation via ADT API
 *
 * Uses CrudClient from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally.
 *
 * Workflow: create -> lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive version) -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, safeCheckOperation } from '../../../lib/utils';
import { handlerLogger } from '../../../lib/logger';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { createAbapConnection } from '@mcp-abap-adt/connection';
import { getConfig } from '../../../index';

export const TOOL_DEFINITION = {
  name: "CreateClass",
  description: "Create a new ABAP class in SAP system with source code. Supports public/protected/private sections, interfaces, and inheritance. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: {
        type: "string",
        description: "Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions (start with Z or Y)."
      },
      description: {
        type: "string",
        description: "Class description. If not provided, class_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      superclass: {
        type: "string",
        description: "Optional superclass name for inheritance (e.g., CL_OBJECT)"
      },
      final: {
        type: "boolean",
        description: "Mark class as final (cannot be inherited). Default: false"
      },
      abstract: {
        type: "boolean",
        description: "Mark class as abstract (cannot be instantiated). Default: false"
      },
      create_protected: {
        type: "boolean",
        description: "Constructor visibility is protected. Default: false (public)"
      },
      source_code: {
        type: "string",
        description: "Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections. If not provided, generates minimal template."
      },
      activate: {
        type: "boolean",
        description: "Activate class after creation. Default: true. Set to false for batch operations (activate multiple objects later)."
      }
    },
    required: ["class_name", "package_name"]
  }
} as const;

interface CreateClassArgs {
  class_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  superclass?: string;
  final?: boolean;
  abstract?: boolean;
  create_protected?: boolean;
  source_code?: string;
  activate?: boolean;
}

/**
 * Generate minimal class source code if not provided
 */
function generateClassTemplate(className: string, description: string): string {
  return `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS: constructor.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD constructor.
    " ${description}
  ENDMETHOD.
ENDCLASS.`;
}

/**
 * Main handler for creating ABAP classes
 *
 * Uses ClassBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateClass(params: CreateClassArgs) {
  const args = params;

  // Validate required parameters
  if (!args.class_name || !args.package_name) {
    return return_error(new Error("Missing required parameters: class_name and package_name"));
  }

  // Validate transport_request: required for non-$TMP packages
  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error as Error);
  }

  const className = args.class_name.toUpperCase();

  logger.info(`Starting class creation: ${className}`);
  handlerLogger.info('CreateClass', 'start', `Starting class creation: ${className}`, {
    className,
    packageName: args.package_name,
    transportRequest: args.transport_request,
    shouldActivate: args.activate !== false
  });

  // Create a separate connection for this handler call (not using getManagedConnection)
  let connection: any = null;
  try {
    // Get configuration from environment variables
    const config = getConfig();

    // Create logger for connection (only logs when DEBUG_CONNECTORS is enabled)
    const connectionLogger = {
      debug: process.env.DEBUG_CONNECTORS === 'true' ? logger.debug.bind(logger) : () => {},
      info: process.env.DEBUG_CONNECTORS === 'true' ? logger.info.bind(logger) : () => {},
      warn: process.env.DEBUG_CONNECTORS === 'true' ? logger.warn.bind(logger) : () => {},
      error: process.env.DEBUG_CONNECTORS === 'true' ? logger.error.bind(logger) : () => {},
      csrfToken: process.env.DEBUG_CONNECTORS === 'true' ? logger.debug.bind(logger) : () => {}
    };

    // Create connection directly for this handler call
    connection = createAbapConnection(config, connectionLogger);
    await connection.connect();

    handlerLogger.debug('CreateClass', 'connection', `Created separate connection for handler call: ${className}`);
  } catch (connectionError: any) {
    const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
    handlerLogger.error('CreateClass', 'connection_error', `Failed to create connection: ${errorMessage}`);
    return return_error(new Error(`Failed to create connection: ${errorMessage}`));
  }

  try {
    // Generate source code if not provided
    const sourceCode = args.source_code || generateClassTemplate(className, args.description || className);

    const shouldActivate = args.activate !== false; // Default to true if not specified

    // Use CrudClient for all operations
    const client = new CrudClient(connection);

    try {
      // Step 1: Validate
      handlerLogger.debug('CreateClass', 'validate', `Validating class: ${className}`, {
        className,
        packageName: args.package_name,
        description: args.description || className
      });
      try {
        await client.validateClass({
          className,
          packageName: args.package_name,
          description: args.description || className
        });
        handlerLogger.debug('CreateClass', 'validate', `Class validation passed: ${className}`);
      } catch (validateError: any) {
        const errorMessage = validateError instanceof Error ? validateError.message : String(validateError);
        handlerLogger.error('CreateClass', 'validate', `Class validation failed: ${className}`, {
          error: errorMessage
        });
        throw new Error(`Class validation failed: ${errorMessage}`);
      }

      // Step 2: Create
      handlerLogger.debug('CreateClass', 'create', `Creating class: ${className}`, {
        className,
        packageName: args.package_name,
        transportRequest: args.transport_request
      });
      await client.createClass({
        className,
        description: args.description || className,
        packageName: args.package_name,
        transportRequest: args.transport_request,
        superclass: args.superclass,
        final: args.final || false,
        abstract: args.abstract || false,
        createProtected: args.create_protected || false
      });

      // Verify creation was successful
      const createResult = client.getCreateResult();
      if (!createResult || (createResult.status !== 201 && createResult.status !== 200)) {
        const errorData = createResult?.data
          ? (typeof createResult.data === 'string' ? createResult.data.substring(0, 500) : JSON.stringify(createResult.data).substring(0, 500))
          : 'Unknown error';
        throw new Error(`Class creation failed with status ${createResult?.status || 'unknown'}: ${errorData}`);
      }

      handlerLogger.debug('CreateClass', 'create', `Class created: ${className}`, {
        status: createResult.status
      });

      // Small delay to ensure class is available for lock (SAP may need a moment to make it available)
      await new Promise(resolve => setTimeout(resolve, 500));

      // Step 3: Lock
      handlerLogger.debug('CreateClass', 'lock', `Locking class: ${className}`);
      await client.lockClass({ className });
      const lockHandle = client.getLockHandle();
      handlerLogger.debug('CreateClass', 'lock', `Class locked: ${className}`, {
        lockHandle: lockHandle ? lockHandle.substring(0, 50) + '...' : null
      });

      try {
        // Step 4: Check new code BEFORE update (with sourceCode and version='inactive')
        handlerLogger.debug('CreateClass', 'check_new_code', `Checking new code before update: ${className}`, {
          className,
          sourceCodeLength: sourceCode.length
        });
        let checkNewCodePassed = false;
        try {
          await safeCheckOperation(
            () => client.checkClass({ className }, 'inactive', sourceCode),
            className,
            {
              debug: (message: string) => handlerLogger.debug('CreateClass', 'check_new_code', message)
            }
          );
          checkNewCodePassed = true;
          handlerLogger.debug('CreateClass', 'check_new_code', `New code check passed: ${className}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            handlerLogger.debug('CreateClass', 'check_new_code', `Class ${className} was already checked - this is OK, continuing`);
            checkNewCodePassed = true;
          } else {
            // Real check error - don't update if check failed
            handlerLogger.error('CreateClass', 'check_new_code', `New code check failed: ${className}`, {
              error: checkError instanceof Error ? checkError.message : String(checkError)
            });
            throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          }
        }

        // Step 2: Update (only if check passed)
        if (checkNewCodePassed) {
          handlerLogger.debug('CreateClass', 'update', `Updating class source code: ${className}`, {
            className,
            sourceCodeLength: sourceCode.length
          });
          await client.updateClass({ className, sourceCode }, lockHandle);
          handlerLogger.debug('CreateClass', 'update', `Class source code updated: ${className}`);
        } else {
          handlerLogger.debug('CreateClass', 'update', `Skipping update - new code check failed: ${className}`);
        }

        // Step 3: Unlock (MANDATORY after lock)
        handlerLogger.debug('CreateClass', 'unlock', `Unlocking class: ${className}`);
        await client.unlockClass({ className }, lockHandle);
        handlerLogger.debug('CreateClass', 'unlock', `Class unlocked: ${className}`);

        // Step 4: Check inactive version (after unlock)
        handlerLogger.debug('CreateClass', 'check_inactive', `Checking inactive version: ${className}`);
        try {
          await safeCheckOperation(
            () => client.checkClass({ className }, 'inactive'),
            className,
            {
              debug: (message: string) => handlerLogger.debug('CreateClass', 'check_inactive', message)
            }
          );
          handlerLogger.debug('CreateClass', 'check_inactive', `Inactive version check completed: ${className}`);
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if ((checkError as any).isAlreadyChecked) {
            handlerLogger.debug('CreateClass', 'check_inactive', `Class ${className} was already checked - this is OK, continuing`);
          } else {
            // Log warning but don't fail - inactive check is informational
            handlerLogger.warn('CreateClass', 'check_inactive', `Inactive version check had issues: ${className}`, {
              error: checkError instanceof Error ? checkError.message : String(checkError)
            });
          }
        }

        // Step 5: Activate if requested
        if (shouldActivate) {
          handlerLogger.debug('CreateClass', 'activate', `Activating class: ${className}`);
          await client.activateClass({ className });
          handlerLogger.debug('CreateClass', 'activate', `Class activated: ${className}`);
        } else {
          handlerLogger.debug('CreateClass', 'activate', `Skipping activation for: ${className}`);
        }
      } catch (error) {
        // Unlock on error (principle 1: if lock was done, unlock is mandatory)
        try {
          handlerLogger.debug('CreateClass', 'cleanup', `Attempting to unlock class after error: ${className}`);
          await client.unlockClass({ className }, lockHandle);
          handlerLogger.debug('CreateClass', 'cleanup', `Successfully unlocked class after error: ${className}`);
        } catch (unlockError) {
          handlerLogger.error('CreateClass', 'cleanup_error', `Failed to unlock class after error: ${className}`, {
            unlockError: unlockError instanceof Error ? unlockError.message : String(unlockError)
          });
          logger.error('Failed to unlock class after error:', unlockError);
        }
        // Principle 2: first error and exit
        throw error;
      }
    } catch (error) {
      handlerLogger.error('CreateClass', 'error', `Error during class creation workflow: ${className}`, {
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown'
      });
      logger.error('Class creation chain failed:', error);
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

    handlerLogger.info('CreateClass', 'complete', `Class creation completed: ${className}`, {
      className,
      stepsCompleted,
      shouldActivate,
      hasActivationWarnings: activationWarnings.length > 0
    });

    const result = {
      success: true,
      class_name: className,
      package_name: args.package_name,
      transport_request: args.transport_request || null,
      type: 'CLAS/OC',
      message: shouldActivate
        ? `Class ${className} created and activated successfully`
        : `Class ${className} created successfully (not activated)`,
      uri: `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}`,
      steps_completed: stepsCompleted,
      activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
      superclass: args.superclass || null,
      final: args.final || false,
      abstract: args.abstract || false
    };

    return return_response({
      data: JSON.stringify(result, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });

  } catch (error: any) {
    logger.error(`Error creating class ${className}:`, error);
    const errorMessage = error.response?.data
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message || String(error);

    return return_error(new Error(`Failed to create class ${className}: ${errorMessage}`));
  } finally {
    // Cleanup: Reset connection created for this handler call
    if (connection) {
      try {
        connection.reset();
        handlerLogger.debug('CreateClass', 'cleanup', `Reset connection for handler call: ${className}`);
      } catch (resetError: any) {
        handlerLogger.error('CreateClass', 'cleanup_error', `Failed to reset connection: ${resetError.message || resetError}`);
      }
    }
  }
}
