/**
 * CreateClass Handler - ABAP Class Creation via ADT API
 *
 * Uses CrudClient from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally.
 *
 * Workflow: create -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection, safeCheckOperation } from '../../../lib/utils';
import { handlerLogger } from '../../../lib/logger';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

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
      },
      master_system: {
        type: "string",
        description: "Master system ID (e.g., 'TRL' for cloud trial). Optional - will be retrieved from system if not provided."
      },
      responsible: {
        type: "string",
        description: "User responsible for the object (e.g., 'CB9980002377'). Optional - will be retrieved from system if not provided."
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
  master_system?: string;
  responsible?: string;
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
  const connection = getManagedConnection();

  logger.info(`Starting class creation: ${className}`);
  handlerLogger.info('CreateClass', 'start', `Starting class creation: ${className}`, {
    className,
    packageName: args.package_name,
    transportRequest: args.transport_request,
    shouldActivate: args.activate !== false
  });

  try {
    // Generate source code if not provided
    const sourceCode = args.source_code || generateClassTemplate(className, args.description || className);

    const shouldActivate = args.activate !== false; // Default to true if not specified

    // Use CrudClient for all operations
    const client = new CrudClient(connection);

    try {
      // Create
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
      handlerLogger.debug('CreateClass', 'create', `Class created: ${className}`);

      // Lock
      handlerLogger.debug('CreateClass', 'lock', `Locking class: ${className}`);
      await client.lockClass({ className });
      const lockHandle = client.getLockHandle();
      handlerLogger.debug('CreateClass', 'lock', `Class locked: ${className}`, {
        lockHandle: lockHandle ? lockHandle.substring(0, 50) + '...' : null
      });

      // Update
      handlerLogger.debug('CreateClass', 'update', `Updating class source code: ${className}`, {
        className,
        sourceCodeLength: sourceCode.length
      });
      await client.updateClass({ className, sourceCode }, lockHandle);
      handlerLogger.debug('CreateClass', 'update', `Class source code updated: ${className}`);

      // Check
      handlerLogger.debug('CreateClass', 'check', `Checking class syntax: ${className}`);
      try {
        await safeCheckOperation(
          () => client.checkClass({ className }),
          className,
          {
            debug: (message: string) => handlerLogger.debug('CreateClass', 'check', message)
          }
        );
        handlerLogger.debug('CreateClass', 'check', `Class check completed: ${className}`);
      } catch (checkError: any) {
        // If error was marked as "already checked", continue silently
        if ((checkError as any).isAlreadyChecked) {
          handlerLogger.debug('CreateClass', 'check', `Class ${className} was already checked - this is OK, continuing`);
        } else {
          // Real check error - rethrow
          throw checkError;
        }
      }

      // Unlock
      handlerLogger.debug('CreateClass', 'unlock', `Unlocking class: ${className}`);
      await client.unlockClass({ className }, lockHandle);
      handlerLogger.debug('CreateClass', 'unlock', `Class unlocked: ${className}`);

      // Activate if requested
      if (shouldActivate) {
        handlerLogger.debug('CreateClass', 'activate', `Activating class: ${className}`);
        await client.activateClass({ className });
        handlerLogger.debug('CreateClass', 'activate', `Class activated: ${className}`);
      } else {
        handlerLogger.debug('CreateClass', 'activate', `Skipping activation for: ${className}`);
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
    const stepsCompleted = ['create', 'lock', 'update', 'check', 'unlock'];
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
  }
}
