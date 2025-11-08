/**
 * UpdateProgramSource Handler - Update Existing ABAP Program Source Code
 * 
 * Eclipse ADT workflow (stateful session required):
 * 1. POST /sap/bc/adt/programs/programs/{name}?_action=LOCK - Lock program
 * 2. PUT /sap/bc/adt/programs/programs/{name}/source/main - Upload new source
 * 3. POST /sap/bc/adt/programs/programs/{name}?_action=UNLOCK - Unlock program
 * 4. POST /sap/bc/adt/activation - Activate program (optional)
 * 
 * CRITICAL REQUIREMENTS:
 * - Stateful session: sap-adt-connection-id must be same for LOCK/PUT/UNLOCK
 * - Cookie management: automatic via BaseAbapConnection
 * - Lock handle: must be maintained within session scope
 * - Program must already exist (created via CreateProgram or manually)
 */

import { AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, logger } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import * as crypto from 'crypto';

export const TOOL_DEFINITION = {
  name: "UpdateProgramSource",
  description: "Update source code of an existing ABAP program. Locks the program, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing programs without re-creating metadata.",
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

interface UpdateProgramSourceArgs {
  program_name: string;
  source_code: string;
  activate?: boolean;
}

/**
 * Generate unique session ID - same for all requests in this operation
 */
function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Generate unique request ID - different for each request
 */
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Step 1: Lock program for editing
 */
async function lockProgram(programName: string, sessionId: string): Promise<{ response: AxiosResponse; lockHandle: string }> {
  const url = `${getBaseUrl()}/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}?_action=LOCK`;
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'POST',
    30000,
    '_action=LOCK',
    undefined,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'sap-adt-sessiontype': 'stateful',
      'sap-adt-connection-id': sessionId,
      'X-sap-adt-sessiontype': 'stateful',
      'sap-adt-xcsrf-token': 'fetch',
      'X-csrf-token': 'fetch',
      'x-sap-request-id': generateRequestId()
    }
  );

  const lockHandle = response.headers['sap-adt-lockhandle'] || response.headers['SAP-ADT-LOCKHANDLE'];
  if (!lockHandle) {
    throw new Error('Failed to obtain lock handle from response');
  }

  return { response, lockHandle };
}

/**
 * Step 2: Upload program source code
 */
async function uploadProgramSource(
  programName: string, 
  sourceCode: string, 
  lockHandle: string, 
  sessionId: string
): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}/source/main`;
  
  return await makeAdtRequestWithTimeout(
    url,
    'PUT',
    30000,
    sourceCode,
    undefined,
    {
      'Content-Type': 'text/plain; charset=utf-8',
      'sap-adt-sessiontype': 'stateful',
      'sap-adt-connection-id': sessionId,
      'X-sap-adt-sessiontype': 'stateful',
      'sap-adt-lockhandle': lockHandle,
      'x-sap-request-id': generateRequestId()
    }
  );
}

/**
 * Step 3: Unlock program after editing
 */
async function unlockProgram(programName: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  return await makeAdtRequestWithTimeout(
    url,
    'POST',
    30000,
    '_action=UNLOCK',
    undefined,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'sap-adt-sessiontype': 'stateful',
      'sap-adt-connection-id': sessionId,
      'X-sap-adt-sessiontype': 'stateful',
      'x-sap-request-id': generateRequestId()
    }
  );
}

/**
 * Step 4: Activate program (optional)
 */
async function activateProgram(programName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}" adtcore:name="${programName}"/>
</adtcore:objectReferences>`;

  return await makeAdtRequestWithTimeout(
    url,
    'POST',
    30000,
    activationXml,
    undefined,
    {
      'Content-Type': 'application/vnd.sap.adt.activation+xml',
      'sap-adt-connection-id': sessionId,
      'x-sap-request-id': generateRequestId()
    }
  );
}

/**
 * Main handler for UpdateProgramSource
 */
export async function handleUpdateProgramSource(params: any) {
  const args: UpdateProgramSourceArgs = params;
  
  // Validate required parameters
  if (!args.program_name || !args.source_code) {
    return return_error(new Error("Missing required parameters: program_name and source_code"));
  }
  
  const programName = args.program_name.toUpperCase();
  const sessionId = generateSessionId();
  let lockHandle: string | null = null;

  try {
    logger.info(`Starting UpdateProgramSource for ${programName}`);
    logger.info(`Session ID: ${sessionId}`);

    // Step 1: Lock the program
    const lockResult = await lockProgram(programName, sessionId);
    lockHandle = lockResult.lockHandle;
    logger.info(`✓ Step 1: Program locked (handle: ${lockHandle})`);

    // Step 2: Upload new source code
    await uploadProgramSource(programName, args.source_code, lockHandle, sessionId);
    logger.info(`✓ Step 2: Source code uploaded (${args.source_code.length} bytes)`);

    // Step 3: Unlock the program
    await unlockProgram(programName, lockHandle, sessionId);
    lockHandle = null; // Clear lock handle after successful unlock
    logger.info(`✓ Step 3: Program unlocked`);

    // Step 4: Activate the program (optional)
    let activationWarnings: string[] = [];
    const shouldActivate = args.activate === true; // Default to false if not specified
    
    if (shouldActivate) {
      const activateResponse = await activateProgram(programName, sessionId);
      logger.info(`✓ Step 4: Activation completed`);
      
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
      logger.info(`✓ Step 4: Activation skipped (activate=false)`);
    }

    // Return success result
    const stepsCompleted = ['lock', 'upload_source', 'unlock'];
    if (shouldActivate) {
      stepsCompleted.push('activate');
    }
    
    const result = {
      success: true,
      program_name: programName,
      type: 'PROG/P',
      message: shouldActivate 
        ? `Program ${programName} source updated and activated successfully`
        : `Program ${programName} source updated successfully (not activated)`,
      uri: `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}`,
      steps_completed: stepsCompleted,
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

  } catch (error: any) {
    // CRITICAL: Always try to unlock on error to prevent locked objects
    if (lockHandle) {
      try {
        await unlockProgram(programName, lockHandle, sessionId);
        logger.info('Lock released after error');
      } catch (unlockError) {
        logger.error('Failed to unlock after error:', unlockError);
      }
    }

    logger.error(`Error updating program ${programName}:`, error);
    const errorMessage = error.response?.data 
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message;

    return return_error(new Error(`Failed to update program ${programName}: ${errorMessage}`));
  }
}
