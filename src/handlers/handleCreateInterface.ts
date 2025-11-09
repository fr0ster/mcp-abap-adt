/**
 * CreateInterface Handler - ABAP Interface Creation via ADT API
 * 
 * Eclipse ADT workflow (stateful session required):
 * 1. POST /sap/bc/adt/oo/interfaces - Create interface with metadata
 * 2. POST /sap/bc/adt/oo/interfaces/{name}?_action=LOCK - Lock interface
 * 3. PUT /sap/bc/adt/oo/interfaces/{name}/source/main - Upload interface source
 * 4. POST /sap/bc/adt/oo/interfaces/{name}?_action=UNLOCK - Unlock interface
 * 5. POST /sap/bc/adt/activation - Activate interface
 * 
 * CRITICAL REQUIREMENTS:
 * - Stateful session: sap-adt-connection-id must be same for all 5 steps
 * - Cookie management: automatic via BaseAbapConnection
 * - Lock handle: must be maintained within session scope
 * - Interfaces only have PUBLIC section (no protected/private)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger } from '../lib/utils';
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "CreateInterface",
  description: "Create a new ABAP interface in SAP system with source code. Interfaces define method signatures, events, and types for implementation by classes. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      interface_name: { 
        type: "string", 
        description: "Interface name (e.g., ZIF_TEST_INTERFACE_001). Must follow SAP naming conventions (start with Z or Y)." 
      },
      description: {
        type: "string",
        description: "Interface description. If not provided, interface_name will be used."
      },
      package_name: { 
        type: "string", 
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      },
      source_code: {
        type: "string",
        description: "Complete ABAP interface source code with INTERFACE...ENDINTERFACE section. If not provided, generates minimal template."
      },
      activate: {
        type: "boolean",
        description: "Activate interface after creation. Default: true. Set to false for batch operations (activate multiple objects later)."
      }
    },
    required: ["interface_name", "package_name"]
  }
} as const;

interface CreateInterfaceArgs {
  interface_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  source_code?: string;
  activate?: boolean;
}

/**
 * Generate minimal interface source code if not provided
 */
function generateInterfaceTemplate(interfaceName: string, description: string): string {
  return `INTERFACE ${interfaceName}
  PUBLIC.

  " ${description}
  
  METHODS: get_value
    RETURNING VALUE(rv_result) TYPE string.

ENDINTERFACE.`;
}

/**
 * Step 1: Create interface object with metadata
 */
async function createInterfaceObject(
  interfaceName: string,
  description: string,
  packageName: string,
  transportRequest: string | undefined,
  sessionId: string
): Promise<void> {
  // Get username (if available) or leave empty
  const username = process.env.SAP_USERNAME || '';
  const masterSystem = process.env.SAP_SYSTEM || 'E19';
  
  const payload = `<?xml version="1.0" encoding="UTF-8"?>
<intf:abapInterface xmlns:intf="http://www.sap.com/adt/oo/interfaces" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="EN" adtcore:name="${interfaceName}" adtcore:type="INTF/OI" adtcore:masterLanguage="EN" adtcore:masterSystem="${masterSystem}" adtcore:responsible="${username}">
  <adtcore:packageRef adtcore:name="${packageName}"/>
</intf:abapInterface>`;

  const url = `/sap/bc/adt/oo/interfaces`;
  const params = transportRequest ? `?corrNr=${transportRequest}` : '';
  
  await makeAdtRequestWithSession(
    url + params,
    'POST',
    sessionId,
    payload,
    { 
      'Content-Type': 'application/vnd.sap.adt.oo.interfaces.v5+xml',
      'Accept': 'application/vnd.sap.adt.oo.interfaces.v5+xml'
    }
  );
  
  logger.info(`✅ Step 1: Interface object created - ${interfaceName}`);
}

/**
 * Step 2: Lock interface for modification
 */
async function lockInterface(
  interfaceName: string,
  sessionId: string
): Promise<{ lockHandle: string; corrNr?: string }> {
  const url = `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName).toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };
  
  const response = await makeAdtRequestWithSession(
    url,
    'POST',
    sessionId,
    null,
    headers
  );
  
  // Parse lock response XML
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  });
  const lockData = parser.parse(response.data);
  
  const lockHandle = lockData['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  const corrNr = lockData['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];
  
  if (!lockHandle) {
    throw new Error('Failed to acquire lock handle from response');
  }
  
  logger.info(`✅ Step 2: Interface locked - handle: ${lockHandle.substring(0, 20)}...`);
  
  return { lockHandle, corrNr };
}

/**
 * Step 3: Upload interface source code
 */
async function uploadInterfaceSource(
  interfaceName: string,
  sourceCode: string,
  lockHandle: string,
  corrNr: string | undefined,
  sessionId: string
): Promise<void> {
  let url = `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName)}/source/main?lockHandle=${lockHandle}`;
  if (corrNr) {
    url += `&corrNr=${corrNr}`;
  }
  
  await makeAdtRequestWithSession(
    url,
    'PUT',
    sessionId,
    sourceCode,
    { 'Content-Type': 'text/plain; charset=utf-8' }
  );
  
  logger.info(`✅ Step 3: Interface source uploaded`);
}

/**
 * Step 4: Unlock interface
 */
async function unlockInterface(
  interfaceName: string,
  lockHandle: string,
  sessionId: string
): Promise<void> {
  const url = `/sap/bc/adt/oo/interfaces/${encodeSapObjectName(interfaceName)}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  await makeAdtRequestWithSession(
    url,
    'POST',
    sessionId,
    '',
    { 'Content-Type': 'application/x-www-form-urlencoded' }
  );
  
  logger.info(`✅ Step 4: Interface unlocked`);
}

/**
 * Step 5: Activate interface (optional)
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
  
  logger.info(`✅ Step 5: Interface activated`);
  
  // Parse activation response
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });
  return parser.parse(response.data);
}

/**
 * Main handler for CreateInterface
 */
export async function handleCreateInterface(args: any) {
  const {
    interface_name,
    description,
    package_name,
    transport_request,
    source_code,
    activate = true
  } = args as CreateInterfaceArgs;

  // Validation
  if (!interface_name || !package_name) {
    return return_error('interface_name and package_name are required');
  }

  const finalDescription = description || interface_name;
  const finalSourceCode = source_code || generateInterfaceTemplate(interface_name, finalDescription);
  
  // Generate session ID for this operation
  const sessionId = generateSessionId();
  
  logger.info(`🚀 Starting CreateInterface: ${interface_name} (session: ${sessionId})`);
  
  let lockHandle: string | undefined;
  
  try {
    // Step 1: Create interface object with metadata
    await createInterfaceObject(
      interface_name,
      finalDescription,
      package_name,
      transport_request,
      sessionId
    );
    
    // Step 2: Lock interface
    const lockData = await lockInterface(interface_name, sessionId);
    lockHandle = lockData.lockHandle;
    const corrNr = lockData.corrNr;
    
    // Step 3: Upload source code
    await uploadInterfaceSource(
      interface_name,
      finalSourceCode,
      lockHandle,
      corrNr,
      sessionId
    );
    
    // Step 4: Unlock interface
    await unlockInterface(interface_name, lockHandle, sessionId);
    lockHandle = undefined; // Clear lock handle after successful unlock
    
    // Step 5: Activate interface (optional)
    let activationResult;
    if (activate) {
      activationResult = await activateInterface(interface_name, sessionId);
    }
    
    logger.info(`✅ CreateInterface completed successfully: ${interface_name}`);
    
    return return_response({
      data: {
        success: true,
        interface_name,
        package_name,
        transport_request: transport_request || 'local',
        activated: activate,
        activation_result: activationResult,
        message: `Interface ${interface_name} created successfully${activate ? ' and activated' : ''}`
      }
    } as AxiosResponse);
    
  } catch (error) {
    logger.error(`❌ CreateInterface failed: ${error}`);
    
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
    
    return return_error(`Failed to create interface: ${error}`);
  }
}
