/**
 * UpdateClassSource Handler - Update Existing ABAP Class Source Code
 * 
 * Eclipse ADT workflow (stateful session required):
 * 1. POST /sap/bc/adt/oo/classes/{name}?_action=LOCK - Lock class
 * 2. PUT /sap/bc/adt/oo/classes/{name}/source/main - Upload new source
 * 3. POST /sap/bc/adt/oo/classes/{name}?_action=UNLOCK - Unlock class
 * 4. POST /sap/bc/adt/activation - Activate class (optional)
 * 
 * CRITICAL REQUIREMENTS:
 * - Stateful session: sap-adt-connection-id must be same for LOCK/PUT/UNLOCK
 * - Cookie management: automatic via BaseAbapConnection
 * - Lock handle: must be maintained within session scope
 * - Class must already exist (created via CreateClass or manually)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger } from '../lib/utils';
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "UpdateClassSource",
  description: "Update source code of an existing ABAP class. Locks the class, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing classes without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: { 
        type: "string", 
        description: "Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist." 
      },
      source_code: {
        type: "string",
        description: "Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections."
      },
      activate: {
        type: "boolean",
        description: "Activate class after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation."
      }
    },
    required: ["class_name", "source_code"]
  }
} as const;

interface UpdateClassSourceArgs {
  class_name: string;
  source_code: string;
  activate?: boolean;
}

/**
 * Step 1: Lock class for editing
 */
async function lockClass(className: string, sessionId: string): Promise<{ response: AxiosResponse; lockHandle: string; corrNr?: string }> {
  const url = `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };

  logger.info(`Locking class: ${className}`);
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
  
  // Debug: log full response data
  logger.info(`Lock response status: ${response.status}`);
  logger.info(`Lock response headers: ${JSON.stringify(response.headers)}`);
  logger.info(`Lock response data (full): ${typeof response.data === 'string' ? response.data : JSON.stringify(response.data)}`);
  
  // Parse lock handle from XML response
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const result = parser.parse(response.data);
  
  // Debug: log full parsed result
  logger.info(`Parsed lock result (full): ${JSON.stringify(result, null, 2)}`);
  
  // Try different possible paths for lock handle
  let lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  if (!lockHandle) {
    lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['@_LOCK_HANDLE'];
  }
  if (!lockHandle) {
    lockHandle = result?.['lock:result']?.['@_LOCK_HANDLE'];
  }
  if (!lockHandle) {
    lockHandle = result?.['lock:result']?.['LOCK_HANDLE'];
  }
  
  // Extract transport number (corrNr)
  const corrNr = result?.['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];
  
  if (!lockHandle) {
    throw new Error(`Failed to obtain lock handle from SAP. Response: ${JSON.stringify(result, null, 2)}`);
  }
  
  logger.info(`Lock acquired: ${lockHandle}${corrNr ? `, transport: ${corrNr}` : ''}`);
  return { response, lockHandle, corrNr };
}

/**
 * Step 2: Upload class source code
 */
async function uploadClassSource(
  className: string, 
  sourceCode: string, 
  lockHandle: string, 
  sessionId: string,
  corrNr?: string
): Promise<AxiosResponse> {
  // Lock handle and transport number are passed as URL parameters
  let url = `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}/source/main?lockHandle=${lockHandle}`;
  if (corrNr) {
    url += `&corrNr=${corrNr}`;
  }
  
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Accept': 'text/plain'
  };

  logger.info(`Uploading class source (${sourceCode.length} bytes)`);
  return await makeAdtRequestWithSession(url, 'PUT', sessionId, sourceCode, headers);
}

/**
 * Step 3: Unlock class after editing
 */
async function unlockClass(className: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  logger.info(`Unlocking class with handle: ${lockHandle}`);
  return await makeAdtRequestWithSession(url, 'POST', sessionId, null, {});
}

/**
 * Step 4: Activate class (optional)
 */
async function activateClass(className: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}" adtcore:name="${className}"/>
</adtcore:objectReferences>`;

  const headers = {
    'Content-Type': 'application/vnd.sap.adt.activation+xml'
  };

  logger.info(`Activating class: ${className}`);
  return await makeAdtRequestWithSession(url, 'POST', sessionId, activationXml, headers);
}

/**
 * Main handler for UpdateClassSource
 */
export async function handleUpdateClassSource(params: any) {
  const args: UpdateClassSourceArgs = params;
  
  // Validate required parameters
  if (!args.class_name || !args.source_code) {
    return return_error(new Error("Missing required parameters: class_name and source_code"));
  }
  
  const className = args.class_name.toUpperCase();
  const sessionId = generateSessionId();
  let lockHandle: string | null = null;

  try {
    logger.info(`Starting UpdateClassSource for ${className}`);
    logger.info(`Session ID: ${sessionId}`);

    // Step 1: Lock the class
    logger.info(`About to call lockClass for ${className}`);
    const lockResult = await lockClass(className, sessionId);
    logger.info(`lockClass returned, lockHandle: ${lockResult.lockHandle || '(empty)'}`);
    lockHandle = lockResult.lockHandle;
    const corrNr = lockResult.corrNr;
    logger.info(`✓ Step 1: Class locked (handle: ${lockHandle}${corrNr ? `, transport: ${corrNr}` : ''})`);

    // Step 2: Upload new source code
    logger.info(`About to upload source, lockHandle: ${lockHandle}`);
    await uploadClassSource(className, args.source_code, lockHandle, sessionId, corrNr);
    logger.info(`✓ Step 2: Source code uploaded (${args.source_code.length} bytes)`);

    // Step 3: Unlock the class
    await unlockClass(className, lockHandle, sessionId);
    lockHandle = null; // Clear lock handle after successful unlock
    logger.info(`✓ Step 3: Class unlocked`);

    // Step 4: Activate the class (optional)
    let activationWarnings: string[] = [];
    const shouldActivate = args.activate === true; // Default to false if not specified
    
    if (shouldActivate) {
      const activateResponse = await activateClass(className, sessionId);
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
      class_name: className,
      type: 'CLAS/OC',
      message: shouldActivate 
        ? `Class ${className} source updated and activated successfully`
        : `Class ${className} source updated successfully (not activated)`,
      uri: `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}`,
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
        await unlockClass(className, lockHandle, sessionId);
        logger.info('Lock released after error');
      } catch (unlockError) {
        logger.error('Failed to unlock after error:', unlockError);
      }
    }

    logger.error(`Error updating class ${className}:`, error);
    const errorMessage = error.response?.data 
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message;

    return return_error(new Error(`Failed to update class ${className}: ${errorMessage}`));
  }
}
