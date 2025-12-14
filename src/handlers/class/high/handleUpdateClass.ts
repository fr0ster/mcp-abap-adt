/**
 * UpdateClass Handler - Update existing ABAP class source code (optional activation)
 *
 * Workflow: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import { AxiosResponse, getManagedConnection } from '../../../lib/utils';
import {
  return_error,
  return_response,
  logger as baseLogger,
  safeCheckOperation
} from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "UpdateClass",
  description: "Update source code of an existing ABAP class. Locks, checks, updates, unlocks, and optionally activates.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: { type: "string", description: "Class name (e.g., ZCL_TEST_CLASS_001)." },
      source_code: { type: "string", description: "Complete ABAP class source code." },
      activate: { type: "boolean", description: "Activate after update. Default: false." }
    },
    required: ["class_name", "source_code"]
  }
} as const;

interface UpdateClassArgs {
  class_name: string;
  source_code: string;
  activate?: boolean;
}

export async function handleUpdateClass(params: UpdateClassArgs) {
  const args: UpdateClassArgs = params;

  if (!args.class_name || !args.source_code) {
    return return_error(new Error("Missing required parameters: class_name and source_code"));
  }

  const className = args.class_name.toUpperCase();
  const handlerLogger = getHandlerLogger(
    'handleUpdateClass',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  handlerLogger.info(`Starting UpdateClass for ${className} (activate=${args.activate === true})`);

  // Connection setup
  let connection: any = null;
  try {
            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    connection = getManagedConnection();
    handlerLogger.debug(`Created separate connection for handler call: ${className}`);
  } catch (connectionError: any) {
    const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
    handlerLogger.error(`Failed to create connection: ${errorMessage}`);
    return return_error(new Error(`Failed to create connection: ${errorMessage}`));
  }

  try {
    const client = new CrudClient(connection);
    const shouldActivate = args.activate === true;

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
          () => client.checkClass({ className: className }, 'inactive', args.source_code),
          className,
          { debug: (message: string) => handlerLogger.debug(message) }
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

      // Update (if check passed)
      if (checkNewCodePassed) {
        handlerLogger.debug(`Updating class source code: ${className}`);
        await client.updateClass({ className: className, sourceCode: args.source_code }, lockHandle);
        handlerLogger.info(`Class source code updated: ${className}`);
      } else {
        handlerLogger.warn(`Skipping update - new code check failed: ${className}`);
      }

      // Unlock
      handlerLogger.debug(`Unlocking class: ${className}`);
      await client.unlockClass({ className: className }, lockHandle);
      handlerLogger.info(`Class unlocked: ${className}`);

      // Check inactive after unlock
      handlerLogger.debug(`Checking inactive version: ${className}`);
      try {
        await safeCheckOperation(
          () => client.checkClass({ className: className }, 'inactive'),
          className,
          { debug: (message: string) => handlerLogger.debug(message) }
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
        await client.activateClass({ className: className });
        handlerLogger.info(`Class activated: ${className}`);
      } else {
        handlerLogger.debug(`Skipping activation for: ${className}`);
      }

      handlerLogger.info(`UpdateClass completed successfully: ${className}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          class_name: className,
          activated: shouldActivate,
          message: `Class ${className} updated${shouldActivate ? ' and activated' : ''} successfully`
        }, null, 2)
      } as AxiosResponse);
    } catch (workflowError: any) {
      // Try to unlock on error
      try {
        const lockHandle = client.getLockHandle();
        if (lockHandle) {
          handlerLogger.warn(`Attempting to unlock class after error: ${className}`);
          await client.unlockClass({ className: className }, lockHandle);
          handlerLogger.warn(`Unlocked class after error: ${className}`);
        }
      } catch (unlockError: any) {
        handlerLogger.error(`Failed to unlock class after error: ${className} - ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
      }

      // Parse error message (XML)
      let errorMessage = workflowError instanceof Error ? workflowError.message : String(workflowError);
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
  } finally {
    try {
      connection?.reset?.();
    } catch {
      // ignore
    }
  }
}
