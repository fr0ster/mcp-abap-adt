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
 * Helper function to make ADT requests with session management
 */
async function makeAdtRequestWithSession(
  url: string,
  method: string,
  sessionId: string,
  data?: any,
  additionalHeaders?: Record<string, string>
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  
  const requestId = generateRequestId();
  const headers: Record<string, string> = {
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': requestId,
    'x-sap-adt-sessiontype': 'stateful',
    'X-sap-adt-profiling': 'server-time',
    ...additionalHeaders
  };
  
  return makeAdtRequestWithTimeout(fullUrl, method, 'default', data, undefined, headers);
}

/**
 * Step 1: Lock program for editing
 */
async function lockProgram(programName: string, sessionId: string): Promise<{ response: AxiosResponse; lockHandle: string; corrNr?: string }> {
  const url = `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };

  logger.info(`Locking program: ${programName}`);
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
  
  // Parse lock handle and transport number from XML response
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const result = parser.parse(response.data);
  const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  const corrNr = result?.['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];
  
  if (!lockHandle) {
    throw new Error('Failed to obtain lock handle from SAP. Program may be locked by another user.');
  }
  
  logger.info(`Lock acquired: ${lockHandle}${corrNr ? `, transport: ${corrNr}` : ''}`);
  return { response, lockHandle, corrNr };
}

/**
 * Step 2: Upload program source code
 */
async function uploadProgramSource(
  programName: string, 
  sourceCode: string, 
  lockHandle: string, 
  sessionId: string,
  corrNr?: string
): Promise<AxiosResponse> {
  // Lock handle and transport number are passed as URL parameters
  let url = `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}/source/main?lockHandle=${lockHandle}`;
  if (corrNr) {
    url += `&corrNr=${corrNr}`;
  }
  
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Accept': 'text/plain'
  };

  logger.info(`Uploading program source (${sourceCode.length} bytes)`);
  return await makeAdtRequestWithSession(url, 'PUT', sessionId, sourceCode, headers);
}

/**
 * Step 3: Unlock program after editing
 */
async function unlockProgram(programName: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  logger.info(`Unlocking program with handle: ${lockHandle}`);
  return await makeAdtRequestWithSession(url, 'POST', sessionId, null, {});
}

/**
 * Step 4: Activate program (optional)
 */
async function activateProgram(programName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/programs/programs/${encodeSapObjectName(programName).toLowerCase()}" adtcore:name="${programName}"/>
</adtcore:objectReferences>`;

  const headers = {
    'Content-Type': 'application/vnd.sap.adt.activation+xml'
  };

  logger.info(`Activating program: ${programName}`);
  return await makeAdtRequestWithSession(url, 'POST', sessionId, activationXml, headers);
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
    const corrNr = lockResult.corrNr;
    logger.info(`✓ Step 1: Program locked (handle: ${lockHandle}${corrNr ? `, transport: ${corrNr}` : ''})`);

    // Step 2: Upload new source code
    await uploadProgramSource(programName, args.source_code, lockHandle, sessionId, corrNr);
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
