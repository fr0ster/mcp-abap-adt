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
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, logger } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import * as crypto from 'crypto';

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
 * Step 1: Lock class for editing
 */
async function lockClass(className: string, sessionId: string): Promise<{ response: AxiosResponse; lockHandle: string }> {
  const url = `${getBaseUrl()}/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}?_action=LOCK`;
  
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
 * Step 2: Upload class source code
 */
async function uploadClassSource(
  className: string, 
  sourceCode: string, 
  lockHandle: string, 
  sessionId: string
): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}/source/main`;
  
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
 * Step 3: Unlock class after editing
 */
async function unlockClass(className: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
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
 * Step 4: Activate class (optional)
 */
async function activateClass(className: string, sessionId: string): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}" adtcore:name="${className}"/>
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
    const lockResult = await lockClass(className, sessionId);
    lockHandle = lockResult.lockHandle;
    logger.info(`✓ Step 1: Class locked (handle: ${lockHandle})`);

    // Step 2: Upload new source code
    await uploadClassSource(className, args.source_code, lockHandle, sessionId);
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
