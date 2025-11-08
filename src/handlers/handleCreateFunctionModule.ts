/**
 * Handler: CreateFunctionModule
 * 
 * Creates a new ABAP function module within an existing function group.
 * Workflow based on Eclipse ADT API:
 * 1. Create function module metadata (POST with XML)
 * 2. LOCK function module (POST with _action=LOCK)
 * 3. Upload source code (PUT)
 * 4. UNLOCK function module (POST with _action=UNLOCK)
 * 5. Activate (POST to activation endpoint)
 * 
 * @param function_group_name - Parent function group name (e.g., ZOK_FUNC_TEST_0001)
 * @param function_module_name - Function module name (e.g., Z_OK_TEST_0001)
 * @param source_code - ABAP source code for the function module
 * @param description - Optional description
 * @param transport_request - Transport request number (optional for local)
 * @param activate - Whether to activate after creation (default: true)
 */

import { AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, logger } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "CreateFunctionModule",
  description: "Create a new ABAP function module within an existing function group. Uses stateful session with LOCK/UNLOCK workflow for source code upload.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: { 
        type: "string", 
        description: "Parent function group name (e.g., ZTEST_FG_001)" 
      },
      function_module_name: { 
        type: "string", 
        description: "Function module name (e.g., Z_TEST_FUNCTION_001). Must follow SAP naming conventions (start with Z or Y, max 30 chars)." 
      },
      source_code: { 
        type: "string", 
        description: "ABAP source code for the function module including signature (FUNCTION name IMPORTING/EXPORTING ... ENDFUNCTION)." 
      },
      description: { 
        type: "string", 
        description: "Optional description for the function module" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      },
      activate: { 
        type: "boolean", 
        description: "Whether to activate the function module after creation (default: true)",
        default: true
      }
    },
    required: ["function_group_name", "function_module_name", "source_code"]
  }
};

interface CreateFunctionModuleArgs {
  function_group_name: string;
  function_module_name: string;
  source_code: string;  // Required: no default generation
  description?: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Step 1: Create function module metadata
 */
async function createFunctionModuleMetadata(
  functionGroupName: string,
  functionModuleName: string,
  description: string,
  corrNr: string | undefined
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const encodedGroupName = encodeSapObjectName(functionGroupName).toLowerCase();
  
  let url = `${baseUrl}/sap/bc/adt/functions/groups/${encodedGroupName}/fmodules`;
  if (corrNr) {
    url += `?corrNr=${corrNr}`;
  }
  
  logger.info(`📝 Creating function module metadata: ${functionModuleName}`);
  
  const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<fmodule:abapFunctionModule xmlns:fmodule="http://www.sap.com/adt/functions/fmodules" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:name="${functionModuleName}" adtcore:type="FUGR/FF">
  <adtcore:containerRef adtcore:name="${functionGroupName}" adtcore:type="FUGR/F" adtcore:uri="/sap/bc/adt/functions/groups/${encodedGroupName}"/>
</fmodule:abapFunctionModule>`;
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'POST',
    'default',
    xmlPayload,
    undefined,
    {
      'Content-Type': 'application/vnd.sap.adt.functions.fmodules+xml',
      'Accept': 'application/vnd.sap.adt.functions.fmodules+xml'
    }
  );
  
  logger.info(`✅ Function module metadata created: ${functionModuleName}`);
  
  return response;
}

/**
 * Step 2: Lock function module for editing
 */
async function lockFunctionModule(
  functionGroupName: string,
  functionModuleName: string
): Promise<string> {
  const baseUrl = await getBaseUrl();
  const encodedGroupName = encodeSapObjectName(functionGroupName).toLowerCase();
  const encodedModuleName = encodeSapObjectName(functionModuleName).toLowerCase();
  const url = `${baseUrl}/sap/bc/adt/functions/groups/${encodedGroupName}/fmodules/${encodedModuleName}?_action=LOCK&accessMode=MODIFY`;
  
  logger.info(`🔒 Locking function module: ${functionModuleName} in group ${functionGroupName}`);
  logger.info(`   Lock URL: ${url}`);
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'POST',
    'default',
    undefined,
    undefined,  // No params - everything in URL
    {
      'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
      'x-sap-adt-sessiontype': 'stateful'
    }
  );
  
  logger.info(`   Lock response status: ${response.status}`);
  logger.info(`   Lock response headers set-cookie: ${JSON.stringify(response.headers['set-cookie'])}`);
  logger.info(`   Lock response data (first 200 chars): ${typeof response.data === 'string' ? response.data.substring(0, 200) : JSON.stringify(response.data).substring(0, 200)}`);
  
  // Parse lock handle from XML response
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_'
  });
  
  const lockData = parser.parse(response.data);
  const lockHandle = lockData['asx:abap']?.['asx:values']?.DATA?.LOCK_HANDLE;
  
  if (!lockHandle) {
    logger.error(`Failed to parse lock handle from response. Full response data: ${JSON.stringify(response.data)}`);
    logger.error(`Parsed lock data: ${JSON.stringify(lockData)}`);
    throw new Error('Failed to acquire lock handle from response');
  }
  
  logger.info(`✅ Function module locked, handle: ${lockHandle}`);
  logger.info(`   Lock response status: ${response.status}`);
  logger.info(`   Lock response headers: ${JSON.stringify(response.headers)}`);
  
  return lockHandle;
}

/**
 * Step 3: Upload function module source code
 */
async function uploadFunctionModuleSource(
  functionGroupName: string,
  functionModuleName: string,
  lockHandle: string,
  corrNr: string | undefined,
  sourceCode: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const encodedGroupName = encodeSapObjectName(functionGroupName).toLowerCase();
  const encodedModuleName = encodeSapObjectName(functionModuleName).toLowerCase();
  
  // Build URL with lockHandle and corrNr as query parameters
  let url = `${baseUrl}/sap/bc/adt/functions/groups/${encodedGroupName}/fmodules/${encodedModuleName}/source/main?lockHandle=${lockHandle}`;
  if (corrNr) {
    url += `&corrNr=${corrNr}`;
  }
  
  logger.info(`📤 Uploading source code for function module: ${functionModuleName}`);
  logger.info(`   URL: ${url}`);
  logger.info(`   LockHandle: ${lockHandle}`);
  logger.info(`   Source code length: ${sourceCode.length} chars`);
  logger.info(`   Source preview: ${sourceCode.substring(0, 100)}...`);
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'PUT',
    'default',
    sourceCode,
    undefined,  // No params - everything in URL
    {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': String(Buffer.byteLength(sourceCode, 'utf8')),
      'Accept': 'text/plain',
      'x-sap-adt-sessiontype': 'stateful'
    }
  );  logger.info(`✅ Function module source uploaded successfully`);
  
  return response;
}

/**
 * Step 4: Unlock function module
 */
async function unlockFunctionModule(
  functionGroupName: string,
  functionModuleName: string,
  lockHandle: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const encodedGroupName = encodeSapObjectName(functionGroupName).toLowerCase();
  const encodedModuleName = encodeSapObjectName(functionModuleName).toLowerCase();
  const url = `${baseUrl}/sap/bc/adt/functions/groups/${encodedGroupName}/fmodules/${encodedModuleName}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  logger.info(`🔓 Unlocking function module: ${functionModuleName}`);
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'POST',
    'default',
    undefined,
    undefined,  // No params - everything in URL
    {
      'Accept': 'application/xml',
      'x-sap-adt-sessiontype': 'stateful'
    }
  );
  
  logger.info(`✅ Function module unlocked successfully`);
  
  return response;
}

/**
 * Step 5: Activate function module
 */
async function activateFunctionModule(
  functionGroupName: string,
  functionModuleName: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const encodedGroupName = encodeSapObjectName(functionGroupName).toLowerCase();
  const encodedModuleName = encodeSapObjectName(functionModuleName).toLowerCase();
  const objectUri = `/sap/bc/adt/functions/groups/${encodedGroupName}/fmodules/${encodedModuleName}`;
  
  logger.info(`⚡ Activating function module: ${functionModuleName}`);
  
  const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${functionModuleName}"/>
</adtcore:objectReferences>`;
  
  const response = await makeAdtRequestWithTimeout(
    `${baseUrl}/sap/bc/adt/activation`,
    'POST',
    'default',
    xmlPayload,
    { method: 'activate', preauditRequested: 'true' },
    {
      'Content-Type': 'application/xml',
      'Accept': 'application/xml'
    }
  );
  
  logger.info(`✅ Function module activated successfully`);
  
  return response;
}

/**
 * Main handler
 */
export async function handleCreateFunctionModule(args: any) {
  const {
    function_group_name,
    function_module_name,
    source_code,
    description,
    transport_request,
    activate = true
  } = args as CreateFunctionModuleArgs;

  // Validation
  if (!function_group_name || !function_module_name || !source_code) {
    return return_error('function_group_name, function_module_name, and source_code are required');
  }
  
  // Validate function module name (max 30 chars, SAP naming)
  if (function_module_name.length > 30) {
    return return_error('Function module name must not exceed 30 characters');
  }
  
  if (!/^[ZY]/i.test(function_module_name)) {
    return return_error('Function module name must start with Z or Y (customer namespace)');
  }
  
  logger.info(`🚀 Starting CreateFunctionModule: ${function_module_name} in ${function_group_name}`);
  
  let lockHandle: string | undefined;
  
  try {
    // Step 1: Create function module metadata
    await createFunctionModuleMetadata(
      function_group_name,
      function_module_name,
      description || function_module_name,
      transport_request
    );
    
    // Step 2: Lock function module
    lockHandle = await lockFunctionModule(function_group_name, function_module_name);
    
    // Step 3: Upload source code
    await uploadFunctionModuleSource(
      function_group_name,
      function_module_name,
      lockHandle,
      transport_request,
      source_code
    );
    
    // Step 4: Unlock function module
    await unlockFunctionModule(function_group_name, function_module_name, lockHandle);
    lockHandle = undefined; // Mark as unlocked
    
    // Step 5: Activate (if requested)
    if (activate) {
      await activateFunctionModule(function_group_name, function_module_name);
    }
    
    logger.info(`✅ CreateFunctionModule completed successfully: ${function_module_name}`);
    
    return return_response({
      data: {
        success: true,
        function_module_name,
        function_group_name,
        transport_request: transport_request || 'local',
        activated: activate,
        message: `Function module ${function_module_name} created successfully${activate ? ' and activated' : ''}`
      }
    } as AxiosResponse);
    
  } catch (error: any) {
    logger.error(`❌ CreateFunctionModule failed: ${error}`);
    
    // Try to unlock if we have a lock handle
    if (lockHandle) {
      try {
        logger.info(`🔓 Attempting to unlock function module after error...`);
        await unlockFunctionModule(function_group_name, function_module_name, lockHandle);
      } catch (unlockError) {
        logger.error(`❌ Failed to unlock after error: ${unlockError}`);
      }
    }
    
    // Parse error message for better user feedback
    let errorMessage = `Failed to create function module: ${error}`;
    
    if (error.response?.status === 400) {
      errorMessage = `Bad request. Check if function module name is valid and function group exists.`;
    } else if (error.response?.status === 404) {
      errorMessage = `Function group ${function_group_name} not found. Create the function group first.`;
    } else if (error.response?.status === 409) {
      errorMessage = `Function module ${function_module_name} already exists in group ${function_group_name}.`;
    } else if (error.response?.data && typeof error.response.data === 'string') {
      // Try to parse XML error message
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_'
        });
        const errorData = parser.parse(error.response.data);
        const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
        if (errorMsg) {
          errorMessage = `SAP Error: ${errorMsg}`;
        }
      } catch (parseError) {
        // Ignore parse errors, use default message
      }
    }
    
    return return_error(errorMessage);
  }
}
