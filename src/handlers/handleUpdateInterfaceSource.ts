/**
 * UpdateInterfaceSource Handler - Update existing ABAP Interface source code
 * 
 * Eclipse ADT workflow (stateful session required):
 * 1. POST /sap/bc/adt/oo/interfaces/{name}?_action=LOCK - Lock interface
 * 2. PUT /sap/bc/adt/oo/interfaces/{name}/source/main - Upload new source
 * 3. POST /sap/bc/adt/oo/interfaces/{name}?_action=UNLOCK - Unlock interface
 * 4. POST /sap/bc/adt/activation - Activate interface (optional)
 * 
 * CRITICAL REQUIREMENTS:
 * - Stateful session: sap-adt-connection-id must be same for all steps
 * - Cookie management: automatic via BaseAbapConnection
 * - Lock handle + corrNr must be passed in URL parameters (not headers!)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger } from '../lib/utils';
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "UpdateInterfaceSource",
  description: "Update source code of an existing ABAP interface. Uses stateful session with proper lock/unlock mechanism. Lock handle and transport number are passed in URL parameters.",
  inputSchema: {
    type: "object",
    properties: {
      interface_name: { 
        type: "string", 
        description: "Interface name (e.g., ZIF_MY_INTERFACE). Must exist in the system." 
      },
      source_code: {
        type: "string",
        description: "Complete ABAP interface source code with INTERFACE...ENDINTERFACE section."
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Optional if object is local or already in transport." 
      },
      activate: {
        type: "boolean",
        description: "Activate interface after update. Default: true."
      }
    },
    required: ["interface_name", "source_code"]
  }
} as const;

interface UpdateInterfaceSourceArgs {
  interface_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Step 1: Lock interface for modification
 * Returns lock handle and corrNr that must be used in subsequent requests
 */
async function lockInterface(
  interfaceName: string,
  sessionId: string
): Promise<{ lockHandle: string; corrNr?: string }> {
  const url = `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName).toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };
  
  logger.info(`🔒 Locking interface: ${interfaceName}`);
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
  
  // Parse lock response XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  });
  const lockData = parser.parse(response.data);
  
  const lockHandle = lockData['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  const corrNr = lockData['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];
  
  if (!lockHandle) {
    throw new Error('Failed to acquire lock handle. Interface may be locked by another user.');
  }
  
  logger.info(`✅ Interface locked - handle: ${lockHandle.substring(0, 20)}...`);
  
  return { lockHandle, corrNr };
}

/**
 * Step 2: Upload new interface source code
 * CRITICAL: lockHandle and corrNr must be in URL parameters, not headers!
 */
async function uploadInterfaceSource(
  interfaceName: string,
  sourceCode: string,
  lockHandle: string,
  corrNr: string | undefined,
  sessionId: string
): Promise<void> {
  // Build URL with lock handle and optional corrNr
  let url = `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName)}/source/main?lockHandle=${lockHandle}`;
  if (corrNr) {
    url += `&corrNr=${corrNr}`;
  }
  
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Accept': 'text/plain'
  };
  
  logger.info(`📤 Uploading interface source...`);
  await makeAdtRequestWithSession(url, 'PUT', sessionId, sourceCode, headers);
  
  logger.info(`✅ Interface source uploaded successfully`);
}

/**
 * Step 3: Unlock interface
 * CRITICAL: lockHandle must be in URL parameters!
 */
async function unlockInterface(
  interfaceName: string,
  lockHandle: string,
  sessionId: string
): Promise<void> {
  const url = `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName)}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  logger.info(`🔓 Unlocking interface...`);
  await makeAdtRequestWithSession(url, 'POST', sessionId, '', {});
  
  logger.info(`✅ Interface unlocked`);
}

/**
 * Step 4: Activate interface (optional)
 */
async function activateInterface(
  interfaceName: string,
  sessionId: string
): Promise<any> {
  const objectUri = `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName).toLowerCase()}`;
  
  const payload = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${interfaceName}"/>
</adtcore:objectReferences>`;

  logger.info(`🔄 Activating interface...`);
  const response = await makeAdtRequestWithSession(
    '/sap/bc/adt/activation?method=activate&preauditRequested=true',
    'POST',
    sessionId,
    payload,
    { 
      'Content-Type': 'application/xml',
      'Accept': 'application/xml'
    }
  );
  
  logger.info(`✅ Interface activated`);
  
  // Parse activation response
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });
  return parser.parse(response.data);
}

/**
 * Main handler for UpdateInterfaceSource
 */
export async function handleUpdateInterfaceSource(args: any) {
  const {
    interface_name,
    source_code,
    transport_request,
    activate = true
  } = args as UpdateInterfaceSourceArgs;

  // Validation
  if (!interface_name || !source_code) {
    return return_error('interface_name and source_code are required');
  }
  
  // Generate session ID for this operation
  const sessionId = generateSessionId();
  
  logger.info(`🚀 Starting UpdateInterfaceSource: ${interface_name} (session: ${sessionId})`);
  
  let lockHandle: string | undefined;
  
  try {
    // Step 1: Lock interface
    const lockData = await lockInterface(interface_name, sessionId);
    lockHandle = lockData.lockHandle;
    const corrNr = transport_request || lockData.corrNr;
    
    // Step 2: Upload source code
    await uploadInterfaceSource(
      interface_name,
      source_code,
      lockHandle,
      corrNr,
      sessionId
    );
    
    // Step 3: Unlock interface
    await unlockInterface(interface_name, lockHandle, sessionId);
    lockHandle = undefined; // Clear lock handle after successful unlock
    
    // Step 4: Activate interface (optional)
    let activationResult;
    if (activate) {
      activationResult = await activateInterface(interface_name, sessionId);
    }
    
    logger.info(`✅ UpdateInterfaceSource completed successfully: ${interface_name}`);
    
    return return_response({
      data: {
        success: true,
        interface_name,
        transport_request: corrNr || 'local',
        activated: activate,
        activation_result: activationResult,
        message: `Interface ${interface_name} updated successfully${activate ? ' and activated' : ''}`
      }
    } as AxiosResponse);
    
  } catch (error) {
    logger.error(`❌ UpdateInterfaceSource failed: ${error}`);
    
    // Attempt to unlock if we have a lock handle
    if (lockHandle) {
      try {
        logger.info(`🔓 Attempting emergency unlock...`);
        await unlockInterface(interface_name, lockHandle, sessionId);
        logger.info(`✅ Emergency unlock successful`);
      } catch (unlockError) {
        logger.error(`❌ Emergency unlock failed: ${unlockError}`);
      }
    }
    
    return return_error(`Failed to update interface: ${error}`);
  }
}
