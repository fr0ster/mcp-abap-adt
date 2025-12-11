/**
 * CreateProgram Handler - ABAP Program Creation via ADT API
 *
 * Workflow: validate -> create -> lock -> check (new code) -> update (if check OK) -> unlock -> check (inactive) -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger as baseLogger, parseValidationResponse, safeCheckOperation, isCloudConnection } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { createAbapConnection } from '@mcp-abap-adt/connection';
import { getConfig } from '../../../index';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CreateProgram",
  description: "Create a new ABAP program (report) in SAP system with source code. Supports executable programs, includes, module pools. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      program_name: {
        type: "string",
        description: "Program name (e.g., Z_TEST_PROGRAM_001). Must follow SAP naming conventions (start with Z or Y)."
      },
      description: {
        type: "string",
        description: "Program description. If not provided, program_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      program_type: {
        type: "string",
        description: "Program type: 'executable' (Report), 'include', 'module_pool', 'function_group', 'class_pool', 'interface_pool'. Default: 'executable'",
        enum: ["executable", "include", "module_pool", "function_group", "class_pool", "interface_pool"]
      },
      application: {
        type: "string",
        description: "Application area (e.g., 'S' for System, 'M' for Materials Management). Default: '*'"
      },
      source_code: {
        type: "string",
        description: "Complete ABAP program source code. If not provided, generates minimal template based on program_type."
      },
      activate: {
        type: "boolean",
        description: "Activate program after creation. Default: true. Set to false for batch operations (activate multiple objects later)."
      }
    },
    required: ["program_name", "package_name"]
  }
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
    'executable': '1',
    'include': 'I',
    'module_pool': 'M',
    'function_group': 'F',
    'class_pool': 'K',
    'interface_pool': 'J'
  };

  return typeMap[programType || 'executable'] || '1';
}

/**
 * Generate minimal program source code if not provided
 */
function generateProgramTemplate(programName: string, programType: string, description: string): string {
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

    case '1': // Executable (Report)
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

export async function handleCreateProgram(params: any) {
  const args: CreateProgramArgs = params;

  // Validate required parameters
  if (!args.program_name || !args.package_name) {
    return return_error(new Error("Missing required parameters: program_name and package_name"));
  }

  // Check if cloud - programs are not available on cloud systems
  if (isCloudConnection()) {
    return return_error(new Error('Programs are not available on cloud systems (ABAP Cloud). This operation is only supported on on-premise systems.'));
  }

  // Validate transport_request: required for non-$TMP packages
  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error as Error);
  }

  const programName = args.program_name.toUpperCase();
  const handlerLogger = getHandlerLogger(
    'handleCreateProgram',
    process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
  );
  handlerLogger.info(`Starting program creation: ${programName} (activate=${args.activate !== false})`);

  // Connection setup
  let connection: any = null;
  try {
    const config = getConfig();
    const connectionLogger = {
      debug: process.env.DEBUG_CONNECTORS === 'true' ? baseLogger.debug.bind(baseLogger) : () => {},
      info: process.env.DEBUG_CONNECTORS === 'true' ? baseLogger.info.bind(baseLogger) : () => {},
      warn: process.env.DEBUG_CONNECTORS === 'true' ? baseLogger.warn.bind(baseLogger) : () => {},
      error: process.env.DEBUG_CONNECTORS === 'true' ? baseLogger.error.bind(baseLogger) : () => {},
      csrfToken: process.env.DEBUG_CONNECTORS === 'true' ? baseLogger.debug.bind(baseLogger) : () => {}
    };
    connection = createAbapConnection(config, connectionLogger);
    await connection.connect();
    handlerLogger.debug(`Created separate connection for handler call: ${programName}`);
  } catch (connectionError: any) {
    const errorMessage = connectionError instanceof Error ? connectionError.message : String(connectionError);
    handlerLogger.error(`Failed to create connection: ${errorMessage}`);
    return return_error(new Error(`Failed to create connection: ${errorMessage}`));
  }

  try {
    // Generate source code if not provided
    const programType = convertProgramType(args.program_type);
    const sourceCode = args.source_code || generateProgramTemplate(programName, programType, args.description || programName);

    // Create client
    const client = new CrudClient(connection);
    const shouldActivate = args.activate !== false; // Default to true if not specified

    // Validate
    handlerLogger.debug(`Validating program: ${programName}`);
    await client.validateProgram({
      programName,
      description: args.description || programName,
      packageName: args.package_name
    });
    const validationResponse = client.getValidationResponse();
    if (!validationResponse) {
      throw new Error('Validation did not return a result');
    }
    const validationResult = parseValidationResponse(validationResponse);
    if (!validationResult || validationResult.valid === false) {
      throw new Error(`Program name validation failed: ${validationResult?.message || 'Invalid program name'}`);
    }
    handlerLogger.debug(`Program validation passed: ${programName}`);

    // Create
    handlerLogger.debug(`Creating program: ${programName}`);
    await client.createProgram({
      programName,
      description: args.description || programName,
      packageName: args.package_name,
      transportRequest: args.transport_request,
      programType: args.program_type,
      application: args.application
    });
    handlerLogger.info(`Program created: ${programName}`);

    // Lock
    handlerLogger.debug(`Locking program: ${programName}`);
    await client.lockProgram({ programName });
    const lockHandle = client.getLockHandle();
    handlerLogger.debug(`Program locked: ${programName} (handle=${lockHandle ? lockHandle.substring(0, 8) + '...' : 'none'})`);

    try {
      // Check new code BEFORE update
      handlerLogger.debug(`Checking new source code before update: ${programName}`);
      let checkNewCodePassed = false;
      try {
        await safeCheckOperation(
          () => client.checkProgram({ programName }, 'inactive', sourceCode),
          programName,
          {
            debug: (message: string) => handlerLogger.debug(message)
          }
        );
        checkNewCodePassed = true;
        handlerLogger.debug(`New code check passed: ${programName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          handlerLogger.debug(`Program ${programName} was already checked - continuing`);
          checkNewCodePassed = true;
        } else {
          handlerLogger.error(`New code check failed: ${programName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
          throw new Error(`New code check failed: ${checkError instanceof Error ? checkError.message : String(checkError)}`);
        }
      }

      // Update (only if check passed)
      if (checkNewCodePassed) {
        handlerLogger.debug(`Updating program source code: ${programName}`);
        await client.updateProgram({ programName, sourceCode }, lockHandle);
        handlerLogger.info(`Program source code updated: ${programName}`);
      } else {
        handlerLogger.warn(`Skipping update - new code check failed: ${programName}`);
      }

      // Unlock (MANDATORY)
      handlerLogger.debug(`Unlocking program: ${programName}`);
      await client.unlockProgram({ programName }, lockHandle);
      handlerLogger.info(`Program unlocked: ${programName}`);

      // Check inactive version (after unlock)
      handlerLogger.debug(`Checking inactive version: ${programName}`);
      try {
        await safeCheckOperation(
          () => client.checkProgram({ programName }, 'inactive'),
          programName,
          {
            debug: (message: string) => handlerLogger.debug(message)
          }
        );
        handlerLogger.debug(`Inactive version check completed: ${programName}`);
      } catch (checkError: any) {
        if ((checkError as any).isAlreadyChecked) {
          handlerLogger.debug(`Program ${programName} was already checked - continuing`);
        } else {
          handlerLogger.warn(`Inactive version check had issues: ${programName} - ${checkError instanceof Error ? checkError.message : String(checkError)}`);
        }
      }

      // Activate if requested
      if (shouldActivate) {
        handlerLogger.debug(`Activating program: ${programName}`);
        try {
          await client.activateProgram({ programName });
          handlerLogger.info(`Program activated: ${programName}`);
        } catch (activationError: any) {
          handlerLogger.error(`Activation failed: ${programName} - ${activationError instanceof Error ? activationError.message : String(activationError)}`);
          throw new Error(`Activation failed: ${activationError instanceof Error ? activationError.message : String(activationError)}`);
        }
      } else {
        handlerLogger.debug(`Skipping activation for: ${programName}`);
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

      handlerLogger.info(`CreateProgram completed successfully: ${programName}`);

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
        steps_completed: ['validate', 'create', 'lock', 'check_new_code', 'update', 'unlock', 'check_inactive', ...(shouldActivate ? ['activate'] : [])],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined
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
          handlerLogger.warn(`Attempting unlock after error for program ${programName}`);
          await client.unlockProgram({ programName }, lockHandle);
          handlerLogger.warn(`Unlocked program after error: ${programName}`);
        }
      } catch (unlockError: any) {
        handlerLogger.error(`Failed to unlock program after error: ${programName} - ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`);
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
    handlerLogger.error(`Error creating program ${programName}: ${errorMessage}`);
    return return_error(new Error(`Failed to create program ${programName}: ${errorMessage}`));
  } finally {
    try {
      connection?.reset?.();
    } catch {
      // ignore
    }
  }
}
