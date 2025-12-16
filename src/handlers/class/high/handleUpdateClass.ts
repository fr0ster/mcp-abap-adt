/**
 * UpdateClass Handler - Update existing ABAP class source code (optional activation)
 *
 * Workflow: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import {
  return_error,
  return_response,
  safeCheckOperation,
  AxiosResponse
} from '../../../lib/utils';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
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

export async function handleUpdateClass(context: HandlerContext, params: UpdateClassArgs) {
  const args: UpdateClassArgs = params;
  const { connection, logger } = context;

  if (!args.class_name || !args.source_code) {
    return return_error(new Error("Missing required parameters: class_name and source_code"));
  }

  const className = args.class_name.toUpperCase();
  logger?.info(`Starting UpdateClass for ${className} (activate=${args.activate === true})`);

  try {
    const client = new CrudClient(connection);
    const shouldActivate = args.activate === true;

    // Lock
    logger?.debug(`Locking class: ${className}`);
    await client.lockClass({ className: className });
    const lockHandle = client.getLockHandle();
    logger?.debug(`Class locked: ${className} (handle=${lockHandle ? lockHandle.substring(0, 8) + '...' : 'none'})`);

    try {
      // Check new code before update
      logger?.debug(`Checking new code before update: ${className}`);
      let checkNewCodePassed = false;
      try {
        await safeCheckOperation(
          () => client.checkClass({ className: className }, 'inactive', args.source_code),
          className,
          { debug: (message: string) => logger?.debug(message) }
        );
        checkNewCodePassed = true;
        logger?.debug(`New code check passed: ${className}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(`Class ${className} was already checked - continuing`);
          checkNewCodePassed = true;
        } else {
          logger?.error(`New code check failed: ${className} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
        }
      }

      // Update (if check passed)
      if (checkNewCodePassed) {
        logger?.debug(`Updating class source code: ${className}`);
        await client.updateClass({ className: className, sourceCode: args.source_code }, lockHandle);
        logger?.info(`Class source code updated: ${className}`);
      } else {
        logger?.warn(`Skipping update - new code check failed: ${className}`);
      }

      // Unlock
      logger?.debug(`Unlocking class: ${className}`);
      await client.unlockClass({ className: className }, lockHandle);
      logger?.info(`Class unlocked: ${className}`);

      // Check inactive after unlock
      logger?.debug(`Checking inactive version: ${className}`);
      try {
        await safeCheckOperation(
          () => client.checkClass({ className: className }, 'inactive'),
          className,
          { debug: (message: string) => logger?.debug(message) }
        );
        logger?.debug(`Inactive version check completed: ${className}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(`Class ${className} was already checked - continuing`);
        } else {
          logger?.warn(`Inactive version check had issues: ${className} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
        }
      }

      // Activate if requested
      if (shouldActivate) {
        logger?.debug(`Activating class: ${className}`);
        await client.activateClass({ className: className });
        logger?.info(`Class activated: ${className}`);
      } else {
        logger?.debug(`Skipping activation for: ${className}`);
      }

      logger?.info(`UpdateClass completed successfully: ${className}`);

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
          logger?.warn(`Attempting to unlock class after error: ${className}`);
          await client.unlockClass({ className: className }, lockHandle);
          logger?.warn(`Unlocked class after error: ${className}`);
        }
      } catch (unlockError: any) {
        logger?.error(`Failed to unlock class after error: ${className} - ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
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
  } catch (error: any) {
    // Generic outer catch for unexpected errors (e.g., connection issues)
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.error(`Unexpected error in UpdateClass handler: ${className} - ${errorMessage}`);
    return return_error(new Error(errorMessage));
  } finally {
    try {
      connection?.reset?.();
    } catch {
      // ignore
    }
  }
}
