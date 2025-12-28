/**
 * CreateProgram Handler - ABAP Program Creation via ADT API
 *
 * Workflow: validate -> create -> lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { IAdtResponse } from '@mcp-abap-adt/interfaces';
import { XMLParser } from 'fast-xml-parser';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  encodeSapObjectName,
  isCloudConnection,
  parseValidationResponse,
  return_error,
  return_response,
  safeCheckOperation,
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'CreateProgram',
  description:
    'Create a new ABAP program (report) in SAP system with source code. Supports executable programs, includes, module pools. Uses stateful session for proper lock management.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description:
          'Program name (e.g., Z_TEST_PROGRAM_001). Must follow SAP naming conventions (start with Z or Y).',
      },
      description: {
        type: 'string',
        description:
          'Program description. If not provided, program_name will be used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LAB, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      program_type: {
        type: 'string',
        description:
          "Program type: 'executable' (Report), 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool'. Default: 'executable'",
        enum: [
          'executable',
          'include',
          'module_pool',
          'function_group',
          'class_pool',
          'interface_pool',
        ],
      },
      application: {
        type: 'string',
        description:
          "Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'",
      },
      source_code: {
        type: 'string',
        description:
          'Complete ABAP program source code. If not provided, generates minimal template based on program_type.',
      },
      activate: {
        type: 'boolean',
        description:
          'Activate program after creation. Default: true. Set to false for batch operations (activate multiple objects later).',
      },
    },
    required: ['program_name', 'package_name'],
  },
} as const;

interface CreateProgramArgs {
  program_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  program_type?: string;
  application?: string;
  source_code?: string;
  activate?: boolean;
}

/**
 * Convert readable program type to SAP internal code
 */
function convertProgramType(programType?: string): string {
  const typeMap: Record<string, string> = {
    executable: '1',
    include: 'I',
    module_pool: 'M',
    function_group: 'F',
    class_pool: 'K',
    interface_pool: 'J',
  };

  return typeMap[programType || 'executable'] || '1';
}

/**
 * Generate minimal program source code if not provided
 */
function generateProgramTemplate(
  programName: string,
  programType: string,
  description: string,
): string {
  const upperName = programName.toUpperCase();

  switch (programType) {
    case 'I': // Include
      return `*&---------------------------------------------------------------------*
*& Include ${upperName}
*& ${description}
*&---------------------------------------------------------------------*

" Include program logic here
`;

    case 'M': // Module Pool
      return `*&---------------------------------------------------------------------*
*& Module Pool ${upperName}
*& ${description}
*&---------------------------------------------------------------------*

PROGRAM ${upperName}.
`;
    default:
      return `*&---------------------------------------------------------------------*
*& Report ${upperName}
*& ${description}
*&---------------------------------------------------------------------*
REPORT ${upperName}.

START-OF-SELECTION.
  WRITE: / 'Program ${upperName} executed successfully.'.
`;
  }
}

export async function handleCreateProgram(
  context: HandlerContext,
  params: any,
) {
  const { connection, logger } = context;
  const args: CreateProgramArgs = params;

  // Validate required parameters
  if (!args.program_name || !args.package_name) {
    return return_error(
      new Error('Missing required parameters: program_name and package_name'),
    );
  }

  // Check if cloud - programs are not available on cloud systems
  if (isCloudConnection()) {
    return return_error(
      new Error(
        'Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.',
      ),
    );
  }

  // Validate transport_request: required for non-$TMP packages
  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error as Error);
  }

  const programName = args.program_name.toUpperCase();
  logger?.info(
    `Starting program creation: ${programName} (activate=${args.activate !== false})`,
  );

  // Connection setup
  try {
    // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    logger?.debug(
      `Created separate connection for handler call: ${programName}`,
    );
  } catch (connectionError: any) {
    const errorMessage =
      connectionError instanceof Error
        ? connectionError.message
        : String(connectionError);
    logger?.error(`Failed to create connection: ${errorMessage}`);
    return return_error(
      new Error(`Failed to create connection: ${errorMessage}`),
    );
  }

  try {
    // Generate source code if not provided
    const programType = convertProgramType(args.program_type);
    const sourceCode =
      args.source_code ||
      generateProgramTemplate(
        programName,
        programType,
        args.description || programName,
      );

    // Create client
    const client = new AdtClient(connection);
    const shouldActivate = args.activate !== false; // Default to true if not specified
    let lockHandle: string | undefined;
    let activateResponse: any | undefined;

    // Validate
    logger?.debug(`Validating program: ${programName}`);
    const validationState = await client.getProgram().validate({
      programName,
      description: args.description || programName,
      packageName: args.package_name,
    });
    const validationResponse = validationState.validationResponse;
    if (!validationResponse) {
      throw new Error('Validation did not return a result');
    }
    const validationResult = parseValidationResponse(
      validationResponse as IAdtResponse,
    );
    if (!validationResult || validationResult.valid === false) {
      throw new Error(
        `Program name validation failed: ${validationResult?.message || 'Invalid program name'}`,
      );
    }
    logger?.debug(`Program validation passed: ${programName}`);

    // Create
    logger?.debug(`Creating program: ${programName}`);
    await client.getProgram().create({
      programName,
      description: args.description || programName,
      packageName: args.package_name,
      transportRequest: args.transport_request,
      programType: args.program_type,
      application: args.application,
    });
    logger?.info(`Program created: ${programName}`);

    // Lock
    logger?.debug(`Locking program: ${programName}`);
    lockHandle = await client.getProgram().lock({ programName });
    logger?.debug(
      `Program locked: ${programName} (handle=${lockHandle ? `${lockHandle.substring(0, 8)}...` : 'none'})`,
    );

    try {
      // Check new code BEFORE update
      logger?.debug(`Checking new source code before update: ${programName}`);
      let checkNewCodePassed = false;
      try {
        await safeCheckOperation(
          () =>
            client.getProgram().check({ programName, sourceCode }, 'inactive'),
          programName,
          {
            debug: (message: string) => logger?.debug(message),
          },
        );
        checkNewCodePassed = true;
        logger?.debug(`New code check passed: ${programName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(
            `Program ${programName} was already checked - continuing`,
          );
          checkNewCodePassed = true;
        } else {
          logger?.error(
            `New code check failed: ${programName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`,
          );
          throw new Error(
            `New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`,
          );
        }
      }

      // Update (only if check passed)
      if (checkNewCodePassed) {
        logger?.debug(`Updating program source code: ${programName}`);
        await client
          .getProgram()
          .update({ programName, sourceCode }, { lockHandle: lockHandle });
        logger?.info(`Program source code updated: ${programName}`);
      } else {
        logger?.warn(`Skipping update - new code check failed: ${programName}`);
      }

      // Unlock (MANDATORY)
      logger?.debug(`Unlocking program: ${programName}`);
      await client.getProgram().unlock({ programName }, lockHandle);
      logger?.info(`Program unlocked: ${programName}`);

      // Check inactive version (after unlock)
      logger?.debug(`Checking inactive version: ${programName}`);
      try {
        await safeCheckOperation(
          () => client.getProgram().check({ programName }, 'inactive'),
          programName,
          {
            debug: (message: string) => logger?.debug(message),
          },
        );
        logger?.debug(`Inactive version check completed: ${programName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          logger?.debug(
            `Program ${programName} was already checked - continuing`,
          );
        } else {
          logger?.warn(
            `Inactive version check had issues: ${programName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`,
          );
        }
      }

      // Activate if requested
      if (shouldActivate) {
        logger?.debug(`Activating program: ${programName}`);
        try {
          const activateState = await client.getProgram().activate({
            programName,
          });
          activateResponse = activateState.activateResult;
          logger?.info(`Program activated: ${programName}`);
        } catch (activationError: any) {
          logger?.error(
            `Activation failed: ${programName} - ${activationError instanceof Error ? activationError.message : String(activationError)}`,
          );
          throw new Error(
            `Activation failed: ${activationError instanceof Error ? activationError.message : String(activationError)}`,
          );
        }
      } else {
        logger?.debug(`Skipping activation for: ${programName}`);
      }

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (
        shouldActivate &&
        activateResponse &&
        typeof activateResponse.data === 'string' &&
        activateResponse.data.includes('<chkl:messages')
      ) {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
        });
        const result = parser.parse(activateResponse.data);
        const messages = result?.['chkl:messages']?.msg;
        if (messages) {
          const msgArray = Array.isArray(messages) ? messages : [messages];
          activationWarnings = msgArray.map(
            (msg: any) =>
              `${msg['@_type']}: ${msg.shortText?.txt || 'Unknown'}`,
          );
        }
      }

      logger?.info(`CreateProgram completed successfully: ${programName}`);

      const result = {
        success: true,
        program_name: programName,
        package_name: args.package_name,
        transport_request: args.transport_request || null,
        program_type: args.program_type || 'executable',
        type: 'PROG/P',
        message: shouldActivate
          ? `Program ${programName} created and activated successfully`
          : `Program ${programName} created successfully (not activated)`,
        uri: `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}`,
        steps_completed: [
          'validate',
          'create',
          'lock',
          'check_new_code',
          'update',
          'unlock',
          'check_inactive',
          ...(shouldActivate ? ['activate'] : []),
        ],
        activation_warnings:
          activationWarnings.length > 0 ? activationWarnings : undefined,
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any,
      });
    } catch (workflowError: any) {
      // On error, ensure we attempt unlock
      try {
        if (lockHandle) {
          logger?.warn(
            `Attempting unlock after error for program ${programName}`,
          );
          await client.getProgram().unlock({ programName }, lockHandle);
          logger?.warn(`Unlocked program after error: ${programName}`);
        }
      } catch (unlockError: any) {
        logger?.error(
          `Failed to unlock program after error: ${programName} - ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`,
        );
      }

      // Parse error message
      let errorMessage =
        workflowError instanceof Error
          ? workflowError.message
          : String(workflowError);

      // Attempt to parse ADT XML error
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
        });
        const errorData = workflowError?.response?.data
          ? parser.parse(workflowError.response.data)
          : null;
        const errorMsg =
          errorData?.['exc:exception']?.message?.['#text'] ||
          errorData?.['exc:exception']?.message;
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
    logger?.error(`Error creating program ${programName}: ${errorMessage}`);
    return return_error(
      new Error(`Failed to create program ${programName}: ${errorMessage}`),
    );
  }
}
