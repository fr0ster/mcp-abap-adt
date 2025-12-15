/**
 * CreateClass Handler - ABAP Class Creation via ADT API
 *
 * Workflow: validate -> create -> lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import {
  return_error,
  return_response,
  logger as baseLogger,
  safeCheckOperation
} from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient  } from '@mcp-abap-adt/adt-clients';
import { AbapConnection } from '@mcp-abap-adt/connection';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CreateClass",
  description: "Create a new ABAP class with optional activation. Manages validation, lock, check, update, unlock, and optional activation.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: { type: "string", description: "Class name (e.g., ZCL_TEST_CLASS_001)." },
      description: { type: "string", description: "Class description (defaults to class_name)." },
      package_name: { type: "string", description: "Package name (e.g., ZOK_LAB, $TMP)." },
      transport_request: { type: "string", description: "Transport request number (required for transportable packages)." },
      superclass: { type: "string", description: "Optional superclass name." },
      final: { type: "boolean", description: "Mark class as final. Default: false" },
      abstract: { type: "boolean", description: "Mark class as abstract. Default: false" },
      create_protected: { type: "boolean", description: "Protected constructor. Default: false" },
      source_code: { type: "string", description: "Full ABAP class source code. If omitted, a minimal template is generated." },
      activate: { type: "boolean", description: "Activate after creation. Default: true." }
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

export async function handleCreateClass(connection: AbapConnection, params: CreateClassArgs) {
  const args = params;

  if (!args.class_name || !args.package_name) {
    return return_error(new Error("Missing required parameters: class_name and package_name"));
  }

  const className = args.class_name.toUpperCase();
  const handlerLogger = getHandlerLogger(
    'handleCreateClass',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  handlerLogger.info(`Starting class creation: ${className} (activate=${args.activate !== false})`);

  try {
    const sourceCode = args.source_code || generateClassTemplate(className, args.description || className);
    const shouldActivate = args.activate !== false; // default true
    const client = new CrudClient(connection);

    try {
      // Validate
      handlerLogger.debug(`Validating class: ${className}`);
      try {
        await client.validateClass({
          className,
          packageName: args.package_name,
          description: args.description || className
        });
        handlerLogger.debug(`Class validation passed: ${className}`);
      } catch (validateError: any) {
        const errorMessage = validateError instanceof Error ? validateError.message : String(validateError);
        handlerLogger.error(`Class validation failed: ${className} - ${errorMessage}`);
        throw new Error(`Class validation failed: ${errorMessage}`);
      }

      // Create
      handlerLogger.debug(`Creating class: ${className}`);
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

      const createResult = client.getCreateResult();
      if (!createResult || (createResult.status !== 201 && createResult.status !== 200)) {
        const errorData = createResult?.data
          ? (typeof createResult.data === 'string' ? createResult.data.substring(0, 500) : JSON.stringify(createResult.data).substring(0, 500))
          : 'Unknown error';
        throw new Error(`Class creation failed with status ${createResult?.status || 'unknown'}: ${errorData}`);
      }
      handlerLogger.info(`Class created: ${className}`);

      // Lock
      handlerLogger.debug(`Locking class: ${className}`);
      await client.lockClass({ className: className });
      const lockHandle = client.getLockHandle();
      handlerLogger.debug(`Class locked: ${className} (handle=${lockHandle ? lockHandle.substring(0, 8) + '...' : 'none'})`);

      try {
        // Check new code before update
        handlerLogger.debug(`Checking new code before update: ${className}`);
        let checkNewCodePassed = false;
        try {
          await safeCheckOperation(
            () => client.checkClass({ className: className }, 'inactive', sourceCode),
            className,
            {
              debug: (message: string) => handlerLogger.debug(message)
            }
          );
          checkNewCodePassed = true;
          handlerLogger.debug(`New code check passed: ${className}`);
        } catch (checkError: any) {
          if ((checkError as any).isAlreadyChecked) {
            handlerLogger.debug(`Class ${className} was already checked - continuing`);
            checkNewCodePassed = true;
          } else {
            handlerLogger.error(`New code check failed: ${className} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
            throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          }
        }

        // Update only if check passed
        if (checkNewCodePassed) {
          handlerLogger.debug(`Updating class source code: ${className}`);
          await client.updateClass({ className: className, sourceCode: sourceCode }, lockHandle);
          handlerLogger.info(`Class source code updated: ${className}`);
        } else {
          handlerLogger.warn(`Skipping update - new code check failed: ${className}`);
        }

        // Unlock (mandatory)
        handlerLogger.debug(`Unlocking class: ${className}`);
        await client.unlockClass({ className: className }, lockHandle);
        handlerLogger.info(`Class unlocked: ${className}`);

        // Check inactive version (after unlock)
        handlerLogger.debug(`Checking inactive version: ${className}`);
        try {
          await safeCheckOperation(
            () => client.checkClass({ className: className }, 'inactive'),
            className,
            {
              debug: (message: string) => handlerLogger.debug(message)
            }
          );
          handlerLogger.debug(`Inactive version check completed: ${className}`);
        } catch (checkError: any) {
          if ((checkError as any).isAlreadyChecked) {
            handlerLogger.debug(`Class ${className} was already checked - continuing`);
          } else {
            handlerLogger.warn(`Inactive version check had issues: ${className} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          }
        }

        // Activate if requested
        if (shouldActivate) {
          handlerLogger.debug(`Activating class: ${className}`);
          try {
            await client.activateClass({ className: className });
            handlerLogger.info(`Class activated: ${className}`);
          } catch (activationError: any) {
            handlerLogger.error(`Activation failed: ${className} - ${activationError instanceof Error ? activationError.message : String(activationError)}`);
            throw new Error(`Activation failed: ${activationError instanceof Error ? activationError.message : String(activationError)}`);
          }
        } else {
          handlerLogger.debug(`Skipping activation for: ${className}`);
        }

        handlerLogger.info(`CreateClass completed successfully: ${className}`);

        return return_response({
          data: JSON.stringify({
            success: true,
            class_name: className,
            package_name: args.package_name,
            transport_request: args.transport_request || null,
            activated: shouldActivate,
            message: `Class ${className} created${shouldActivate ? ' and activated' : ''} successfully`
          }, null, 2)
        } as AxiosResponse);

      } catch (workflowError: any) {
        // On error, ensure we attempt unlock
        try {
          const lockHandle = client.getLockHandle();
          if (lockHandle) {
            handlerLogger.warn(`Attempting unlock after error for class ${className}`);
            await client.unlockClass({ className: className }, lockHandle);
            handlerLogger.warn(`Unlocked class after error: ${className}`);
          }
        } catch (unlockError: any) {
          handlerLogger.error(`Failed to unlock class after error: ${className} - ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
        }

        // Parse error message
        let errorMessage = workflowError instanceof Error ? workflowError.message : String(workflowError);

        // Attempt to parse ADT XML error
        try {
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const errorData = workflowError?.response?.data ? parser.parse(workflowError.response.data) : null;
          const errorMsg = errorData?.['exc:exception']?.message?.['#text'] || errorData?.['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch {
          // ignore parse errors
        }

        return return_error(new Error(errorMessage));
      }
    } catch (error: any) {
      // Generic outer catch
      const errorMessage = error instanceof Error ? error.message : String(error);
      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    // Generic outer catch
    const errorMessage = error instanceof Error ? error.message : String(error);
    return return_error(new Error(errorMessage));
  }
}
