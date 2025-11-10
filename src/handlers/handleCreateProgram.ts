/**
 * CreateProgram Handler - ABAP Program Creation via ADT API
 * 
 * Eclipse ADT workflow (stateful session required):
 * 1. POST /sap/bc/adt/programs/programs - Create program with metadata
 * 2. Extract lock handle from POST response headers
 * 3. PUT /sap/bc/adt/programs/programs/{name}/source/main - Upload program source
 * 4. POST /sap/bc/adt/programs/programs/{name}?_action=UNLOCK - Unlock program
 * 5. POST /sap/bc/adt/activation - Activate program
 * 
 * CRITICAL REQUIREMENTS:
 * - Stateful session: sap-adt-connection-id must be same for all steps
 * - Cookie management: automatic via BaseAbapConnection
 * - Lock handle: extracted from POST response headers (no separate LOCK needed)
 * - Program types: 1 (Executable), I (Include), M (Module Pool), F (Function Group), K (Class Pool), J (Interface Pool)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger } from '../lib/utils';
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { activateObjectInSession } from '../lib/activationUtils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';

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

/**
 * Step 1: Create program object with metadata
 * Following Eclipse ADT approach
 */
async function createProgramObject(args: CreateProgramArgs, sessionId: string): Promise<AxiosResponse> {
  const description = args.description || args.program_name;
  const programType = convertProgramType(args.program_type); // Convert to SAP code
  const application = args.application || '*'; // Default: cross-application
  const url = `/sap/bc/adt/programs/programs${args.transport_request ? `?corrNr=${args.transport_request}` : ''}`;
  
  // Get username and master system
  const username = process.env.SAP_USERNAME || '';
  const masterSystem = process.env.SAP_SYSTEM_ID || 'SAP';
  
  // Build program metadata XML following Eclipse ADT format
  const metadataXml = `<?xml version="1.0" encoding="UTF-8"?>
<program:abapProgram xmlns:program="http://www.sap.com/adt/programs/programs" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="EN" adtcore:name="${args.program_name}" adtcore:type="PROG/P" adtcore:masterLanguage="EN" adtcore:masterSystem="${masterSystem}" adtcore:responsible="${username}" program:programType="${programType}" program:application="${application}">
  <adtcore:packageRef adtcore:name="${args.package_name}"/>
</program:abapProgram>`;

  const headers = {
    'Accept': 'application/vnd.sap.adt.programs.programs.v2+xml',
    'Content-Type': 'application/vnd.sap.adt.programs.programs.v2+xml'
  };

  logger.info(`Creating program object: ${args.program_name}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, metadataXml, headers);
}

/**
 * Step 2: Lock program for modification (fallback if lock handle not in POST response)
 * Returns lock handle that must be used in subsequent requests
 */
async function lockProgram(programName: string, sessionId: string): Promise<string> {
  const url = `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };

  logger.info(`Locking program: ${programName}`);
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
  
  // Parse lock handle from XML response
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const result = parser.parse(response.data);
  const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  
  if (!lockHandle) {
    throw new Error('Failed to obtain lock handle from SAP. Program may be locked by another user.');
  }
  
  logger.info(`Lock acquired: ${lockHandle}`);
  return lockHandle;
}

/**
 * Step 3: Upload program source code
 * Lock handle must be passed in URL and maintained in same session
 */
async function uploadProgramSource(
  programName: string, 
  sourceCode: string, 
  lockHandle: string, 
  sessionId: string, 
  transportRequest?: string
): Promise<AxiosResponse> {
  const queryParams = `lockHandle=${lockHandle}${transportRequest ? `&corrNr=${transportRequest}` : ''}`;
  const url = `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}/source/main?${queryParams}`;
  
  const headers = {
    'Accept': 'text/plain',
    'Content-Type': 'text/plain; charset=utf-8'
  };

  logger.info(`Uploading program source: ${programName}, lockHandle: ${lockHandle.substring(0, 10)}...`);
  return makeAdtRequestWithSession(url, 'PUT', sessionId, sourceCode, headers);
}

/**
 * Step 4: Unlock program
 * Must use same session and lock handle from step 2
 */
async function unlockProgram(programName: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;

  logger.info(`Unlocking program: ${programName}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, null);
}

/**
 * Step 5: Activate program
 * Makes program active and usable in SAP system
 */
async function activateProgram(programName: string, sessionId: string): Promise<AxiosResponse> {
  const objectUri = `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}`;
  logger.info(`Activating program: ${programName}`);
  return await activateObjectInSession(objectUri, programName, sessionId, true);
}

/**
 * Main handler for CreateProgram tool
 * 
 * Workflow:
 * 1. Create program object with metadata
 * 2. Extract lock handle from response (or explicit LOCK)
 * 3. Upload source code
 * 4. Unlock program
 * 5. Activate program
 * 
 * IMPORTANT: Uses stateful session for all 5 steps
 * IMPORTANT: Cookies are managed automatically by BaseAbapConnection
 * IMPORTANT: Lock handle is maintained within session scope
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
  const sessionId = generateSessionId();
  let lockHandle: string | null = null;
  
  logger.info(`Starting program creation: ${programName} (session: ${sessionId})`);

  try {
    // Step 1: Create program object with metadata
    // After POST, program is automatically locked and lock handle is returned in response headers
    const createResponse = await createProgramObject(args, sessionId);
    if (createResponse.status < 200 || createResponse.status >= 300) {
      throw new Error(`Failed to create program object: ${createResponse.status} ${createResponse.statusText}`);
    }
    logger.info(`✓ Step 1: Program object created`);

    // Extract lock handle from response headers (Eclipse approach)
    lockHandle = createResponse.headers['sap-adt-lockhandle'] || 
                 createResponse.headers['lockhandle'] ||
                 createResponse.headers['x-sap-adt-lockhandle'];
    
    if (!lockHandle) {
      // Fallback: try to extract from response body or do explicit LOCK
      logger.warn('Lock handle not found in POST response headers, attempting explicit LOCK');
      lockHandle = await lockProgram(programName, sessionId);
    }
    
    logger.info(`✓ Step 2: Lock handle obtained: ${lockHandle.substring(0, 10)}...`);

    // Step 3: Upload source code (uses lock handle from step 1/2)
    const programType = convertProgramType(args.program_type);
    const sourceCode = args.source_code || generateProgramTemplate(programName, programType, args.description || programName);
    const uploadResponse = await uploadProgramSource(programName, sourceCode, lockHandle, sessionId, args.transport_request);
    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      throw new Error(`Failed to upload source: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
    logger.info(`✓ Step 3: Source code uploaded`);

    // Step 4: Unlock the program
    await unlockProgram(programName, lockHandle, sessionId);
    lockHandle = null; // Clear lock handle after successful unlock
    logger.info(`✓ Step 4: Program unlocked`);

    // Step 5: Activate the program (optional)
    let activationWarnings: string[] = [];
    const shouldActivate = args.activate !== false; // Default to true if not specified
    
    if (shouldActivate) {
      const activateResponse = await activateProgram(programName, sessionId);
      logger.info(`✓ Step 5: Activation completed`);
      
      // Parse activation warnings/errors
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
    } else {
      logger.info(`✓ Step 5: Activation skipped (activate=false)`);
    }

    // Return success result
    const stepsCompleted = ['create_object', 'lock', 'upload_source', 'unlock'];
    if (shouldActivate) {
      stepsCompleted.push('activate');
    }
    
    const result = {
      success: true,
      program_name: programName,
      package_name: args.package_name,
      transport_request: args.transport_request || null,
      program_type: args.program_type || '1',
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
    // Attempt to unlock if we have a lock handle
    if (lockHandle) {
      try {
        logger.warn(`Error occurred, attempting to unlock program: ${programName}`);
        await unlockProgram(programName, lockHandle, sessionId);
        logger.info(`Program unlocked after error`);
      } catch (unlockError: any) {
        logger.error(`Failed to unlock program after error: ${unlockError.message}`);
      }
    }

    const errorMessage = error.response?.data || error.message || 'Unknown error';
    logger.error(`Program creation failed: ${errorMessage}`);
    return return_error(new Error(`Failed to create program ${programName}: ${errorMessage}`));
  }
}
