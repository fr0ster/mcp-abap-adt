/**
 * UpdateProgram Handler - Update Existing ABAP Program Source Code
 *
 * Workflow: lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import { return_error, return_response, encodeSapObjectName, safeCheckOperation, isCloudConnection, AxiosResponse } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "UpdateProgram",
  description: "Update source code of an existing ABAP program. Locks the program, checks new code, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing programs without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: {
        type: "string",
        description: "Program name (e.g., Z_TEST_PROGRAM_001). Program must already exist."
      },
      source_code: {
        type: "string",
        description: "Complete ABAP program source code."
      },
      activate: {
        type: "boolean",
        description: "Activate program after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation."
      }
    },
    required: ["program_name", "source_code"]
  }
} as const;

interface UpdateProgramArgs {
  program_name: string;
  source_code: string;
  activate?: boolean;
}

export async function handleUpdateProgram(context: HandlerContext, params: any) {
  const { connection, logger } = context;
  const args: UpdateProgramArgs = params;

  // Validate required parameters
  if (!args.program_name || !args.source_code) {
    return return_error(new Error("Missing required parameters: program_name and source_code"));
  }

  // Check if cloud - programs are not available on cloud systems
  if (isCloudConnection()) {
    return return_error(new Error('Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.'));
  }

  const programName = args.program_name.toUpperCase();
  logger?.info(`Starting program source update: ${programName} (activate=${args.activate === true})`);

  // Connection setup
    try {
            // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    logger?.debug(`Created separate connection for handler call: ${programName}`);
  } catch (connectionError: any) {
    const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
    logger?.error(`Failed to create connection: ${errorMessage}`);
    return return_error(new Error(`Failed to create connection: ${errorMessage}`));
  }

  try {
    const client = new CrudClient(connection);
    const shouldActivate = args.activate === true; // Default to false if not specified

    // Lock
    logger?.debug(`Locking program: ${programName}`);
    await client.lockProgram({ programName });
    const lockHandle = client.getLockHandle();
    logger?.debug(`Program locked: ${programName} (handle=${lockHandle ? lockHandle.substring(0, 8) + '...' : 'none'})`);

    try {
      // Check new code BEFORE update
      logger?.debug(`Checking new source code before update: ${programName}`);
      let checkNewCodePassed = false;
      try {
        await safeCheckOperation(
          () => client.checkProgram({ programName }, 'inactive', args.source_code),
          programName,
          {
            debug: (message: string) => logger?.debug(message)
          }
        );
        checkNewCodePassed = true;
        logger?.debug(`New code check passed: ${programName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(`Program ${programName} was already checked - continuing`);
          checkNewCodePassed = true;
        } else {
          logger?.error(`New code check failed: ${programName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
        }
      }

      // Update (only if check passed)
      if (checkNewCodePassed) {
        logger?.debug(`Updating program source code: ${programName}`);
        await client.updateProgram({ programName, sourceCode: args.source_code }, lockHandle);
        logger?.info(`Program source code updated: ${programName}`);
      } else {
        logger?.warn(`Skipping update - new code check failed: ${programName}`);
      }

      // Unlock (MANDATORY)
      logger?.debug(`Unlocking program: ${programName}`);
      await client.unlockProgram({ programName }, lockHandle);
      logger?.info(`Program unlocked: ${programName}`);

      // Check inactive version (after unlock)
      logger?.debug(`Checking inactive version: ${programName}`);
      try {
        await safeCheckOperation(
          () => client.checkProgram({ programName }, 'inactive'),
          programName,
          {
            debug: (message: string) => logger?.debug(message)
          }
        );
        logger?.debug(`Inactive version check completed: ${programName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(`Program ${programName} was already checked - continuing`);
        } else {
          logger?.warn(`Inactive version check had issues: ${programName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
        }
      }

      // Activate if requested
      if (shouldActivate) {
        logger?.debug(`Activating program: ${programName}`);
        try {
          await client.activateProgram({ programName });
          logger?.info(`Program activated: ${programName}`);
        } catch (activationError: any) {
          logger?.error(`Activation failed: ${programName} - ${activationError instanceof Error ? activationError.message : String(activationError)}`);
          throw new Error(`Activation failed: ${activationError instanceof Error ? activationError.message : String(activationError)}`);
        }
      } else {
        logger?.debug(`Skipping activation for: ${programName}`);
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

      logger?.info(`UpdateProgram completed successfully: ${programName}`);

      const result = {
        success: true,
        program_name: programName,
        type: 'PROG/P',
        activated: shouldActivate,
        message: shouldActivate
          ? `Program ${programName} source updated and activated successfully`
          : `Program ${programName} source updated successfully (not activated)`,
        uri: `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}`,
        steps_completed: ['lock', 'check_new_code', 'update', 'unlock', 'check_inactive', ...(shouldActivate ? ['activate'] : [])],
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

    } catch (workflowError: any) {
      // On error, ensure we attempt unlock
      try {
        const lockHandle = client.getLockHandle();
        if (lockHandle) {
          logger?.warn(`Attempting unlock after error for program ${programName}`);
          await client.unlockProgram({ programName }, lockHandle);
          logger?.warn(`Unlocked program after error: ${programName}`);
        }
      } catch (unlockError: any) {
        logger?.error(`Failed to unlock program after error: ${programName} - ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger?.error(`Error updating program source ${programName}: ${errorMessage}`);
    return return_error(new Error(`Failed to update program ${programName}: ${errorMessage}`));
  } finally {
    try {
      connection?.reset?.();
    } catch {
      // ignore
    }
  }
}
