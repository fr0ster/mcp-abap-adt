/**
 * CreateProgram Handler - ABAP Program Creation via ADT API
 *
 * Uses ProgramBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { ProgramBuilder } from '@mcp-abap-adt/adt-clients';

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
    required: ["program_name", "package_name"]
  }
} as const;

interface CreateProgramArgs {
  program_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  master_system?: string;
  responsible?: string;
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

/**
 * Main handler for CreateProgram MCP tool
 *
 * Uses ProgramBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateProgram(params: any) {
  const args: CreateProgramArgs = params;

  // Validate required parameters
  if (!args.program_name || !args.package_name) {
    return return_error(new Error("Missing required parameters: program_name and package_name"));
  }

  // Validate transport_request: required for non-$TMP packages
  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error as Error);
  }

  const programName = args.program_name.toUpperCase();
  const connection = getManagedConnection();

  logger.info(`Starting program creation: ${programName}`);

  try {
    // Generate source code if not provided
    const programType = convertProgramType(args.program_type);
    const sourceCode = args.source_code || generateProgramTemplate(programName, programType, args.description || programName);

    // Create builder with configuration
    const builder = new ProgramBuilder(connection, logger, {
      programName: programName,
      packageName: args.package_name,
      transportRequest: args.transport_request,
      description: args.description || programName,
      programType: args.program_type,
      application: args.application,
      sourceCode: sourceCode
    });

    // Build operation chain: validate -> create -> lock -> update -> check -> unlock -> (activate)
    const shouldActivate = args.activate !== false; // Default to true if not specified

    await builder
      .validate()
      .then(b => b.create())
      .then(b => b.lock())
      .then(b => b.update())
      .then(b => b.check())
      .then(b => b.unlock())
      .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
      .catch(error => {
        logger.error('Program creation chain failed:', error);
        throw error;
      });

    // Parse activation warnings if activation was performed
    let activationWarnings: string[] = [];
    if (shouldActivate && builder.getActivateResult()) {
      const activateResponse = builder.getActivateResult()!;
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
    const stepsCompleted = ['validate', 'create', 'lock', 'update', 'check', 'unlock'];
    if (shouldActivate) {
      stepsCompleted.push('activate');
    }

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
    logger.error(`Error creating program ${programName}:`, error);
    const errorMessage = error.response?.data
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message || String(error);

    return return_error(new Error(`Failed to create program ${programName}: ${errorMessage}`));
  }
}
