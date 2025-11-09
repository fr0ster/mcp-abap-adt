/**
 * UpdateFunctionModuleSource Handler - Update Existing ABAP Function Module Source Code
 * 
 * Eclipse ADT workflow (stateful session required):
 * 1. POST /sap/bc/adt/functions/groups/{group}/fmodules/{name}?_action=LOCK - Lock function module
 * 2. PUT /sap/bc/adt/functions/groups/{group}/fmodules/{name}/source/main - Upload new source
 * 3. POST /sap/bc/adt/functions/groups/{group}/fmodules/{name}?_action=UNLOCK - Unlock function module
 * 4. POST /sap/bc/adt/activation - Activate function module (optional)
 * 
 * CRITICAL REQUIREMENTS:
 * - Stateful session: 'x-sap-adt-sessiontype': 'stateful' must be set for LOCK/PUT/UNLOCK
 * - Cookie management: automatic via BaseAbapConnection
 * - Lock handle: must be maintained within session scope
 * - Function module must already exist (created via CreateFunctionModule or manually)
 * - Function group must exist and be active
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getBaseUrl, makeAdtRequestWithTimeout } from '../lib/utils';
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "UpdateFunctionModuleSource",
  description: "Update source code of an existing ABAP function module. Locks the function module, uploads new source code, and unlocks. Optionally activates after update. Use this to modify existing function modules without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: { 
        type: "string", 
        description: "Function group name containing the function module (e.g., ZOK_FG_MCP01)." 
      },
      function_module_name: { 
        type: "string", 
        description: "Function module name (e.g., Z_TEST_FM_MCP01). Function module must already exist." 
      },
      source_code: {
        type: "string",
        description: "Complete ABAP function module source code. Must include FUNCTION statement with parameters and ENDFUNCTION. Example:\n\nFUNCTION Z_TEST_FM\n  IMPORTING\n    VALUE(iv_input) TYPE string\n  EXPORTING\n    VALUE(ev_output) TYPE string.\n  \n  ev_output = iv_input.\nENDFUNCTION."
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable function modules."
      },
      activate: {
        type: "boolean",
        description: "Activate function module after source update. Default: false. Set to true to activate immediately."
      }
    },
    required: ["function_group_name", "function_module_name", "source_code"]
  }
} as const;

interface UpdateFunctionModuleSourceArgs {
  function_group_name: string;
  function_module_name: string;
  source_code: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Step 1: Lock function module for editing
 */
async function lockFunctionModule(
  functionGroupName: string, 
  functionModuleName: string, 
  sessionId: string
): Promise<{ response: AxiosResponse; lockHandle: string; corrNr?: string }> {
  const groupLower = encodeSapObjectName(functionGroupName).toLowerCase();
  const moduleLower = encodeSapObjectName(functionModuleName).toLowerCase();
  const url = `/sap/bc/adt/functions/groups/${groupLower}/fmodules/${moduleLower}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };

  logger.info(`🔒 Locking function module: ${functionModuleName} in group ${functionGroupName}`);
  logger.info(`   Lock URL: ${await getBaseUrl()}${url}`);
  
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, undefined, headers);
  
  logger.info(`   Lock response status: ${response.status}`);
  logger.info(`   Lock response headers set-cookie: ${JSON.stringify(response.headers['set-cookie'])}`);
  logger.info(`   Lock response data (first 200 chars): ${JSON.stringify(response.data).substring(0, 200)}`);

  // Parse lock handle from XML response
  const parser = new XMLParser();
  const result = parser.parse(response.data);
  const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  const corrNr = result?.['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];

  if (!lockHandle) {
    throw new Error('Failed to obtain lock handle from SAP. Function module may be locked by another user.');
  }

  logger.info(`✅ Function module locked, handle: ${lockHandle}`);
  logger.info(`   Lock response status: ${response.status}`);
  logger.info(`   Lock response headers: ${JSON.stringify(response.headers)}`);
  
  return { response, lockHandle, corrNr };
}

/**
 * Step 2: Upload new source code
 */
async function uploadSource(
  functionGroupName: string,
  functionModuleName: string,
  sourceCode: string,
  lockHandle: string,
  sessionId: string,
  transportRequest?: string
): Promise<AxiosResponse> {
  const groupLower = encodeSapObjectName(functionGroupName).toLowerCase();
  const moduleLower = encodeSapObjectName(functionModuleName).toLowerCase();
  const queryParams = `lockHandle=${lockHandle}${transportRequest ? `&corrNr=${transportRequest}` : ''}`;
  const url = `/sap/bc/adt/functions/groups/${groupLower}/fmodules/${moduleLower}/source/main?${queryParams}`;
  
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(sourceCode, 'utf8').toString(),
    'Accept': 'text/plain'
  };

  logger.info(`📤 Uploading source code for function module: ${functionModuleName}`);
  logger.info(`   URL: ${await getBaseUrl()}${url}`);
  logger.info(`   LockHandle: ${lockHandle}`);
  logger.info(`   Source code length: ${sourceCode.length} chars`);
  logger.info(`   Source preview: ${sourceCode.substring(0, 100).replace(/\n/g, '\\n')}...`);

  return makeAdtRequestWithSession(url, 'PUT', sessionId, sourceCode, headers);
}

/**
 * Step 3: Unlock function module
 */
async function unlockFunctionModule(
  functionGroupName: string,
  functionModuleName: string,
  lockHandle: string,
  sessionId: string
): Promise<AxiosResponse> {
  const groupLower = encodeSapObjectName(functionGroupName).toLowerCase();
  const moduleLower = encodeSapObjectName(functionModuleName).toLowerCase();
  const url = `/sap/bc/adt/functions/groups/${groupLower}/fmodules/${moduleLower}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  const headers = {
    'Accept': 'application/xml'
  };

  logger.info(`🔓 Unlocking function module: ${functionModuleName}`);

  return makeAdtRequestWithSession(url, 'POST', sessionId, undefined, headers);
}

/**
 * Step 4: Activate function module (optional)
 */
async function activateFunctionModule(
  functionGroupName: string,
  functionModuleName: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const groupLower = encodeSapObjectName(functionGroupName).toLowerCase();
  const moduleLower = encodeSapObjectName(functionModuleName).toLowerCase();
  const objectUri = `/sap/bc/adt/functions/groups/${groupLower}/fmodules/${moduleLower}`;
  
  logger.info(`⚡ Activating function module: ${functionModuleName}`);
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${functionModuleName}"/>
</adtcore:objectReferences>`;

  const response = await makeAdtRequestWithTimeout(
    `${baseUrl}/sap/bc/adt/activation`,
    'POST',
    'default',
    activationXml,
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
 * Main handler function
 */
export async function handler(args: UpdateFunctionModuleSourceArgs): Promise<any> {
  try {
    logger.info(`🚀 Starting UpdateFunctionModuleSource: ${args.function_module_name} in ${args.function_group_name}`);

    // Validate inputs
    if (!args.function_module_name || args.function_module_name.length > 30) {
      return return_error("Function module name is required and must not exceed 30 characters");
    }
    if (!args.function_group_name || args.function_group_name.length > 30) {
      return return_error("Function group name is required and must not exceed 30 characters");
    }
    if (!args.source_code) {
      return return_error("Source code is required");
    }

    // Validate Z/Y prefix
    const modulePrefix = args.function_module_name.charAt(0).toUpperCase();
    const groupPrefix = args.function_group_name.charAt(0).toUpperCase();
    if (modulePrefix !== 'Z' && modulePrefix !== 'Y') {
      return return_error("Function module name must start with Z or Y");
    }
    if (groupPrefix !== 'Z' && groupPrefix !== 'Y') {
      return return_error("Function group name must start with Z or Y");
    }

    // Generate session ID for all requests
    const sessionId = generateSessionId();

    // Step 1: Lock function module
    const { lockHandle, corrNr } = await lockFunctionModule(
      args.function_group_name,
      args.function_module_name,
      sessionId
    );

    try {
      // Step 2: Upload source code
      const uploadResponse = await uploadSource(
        args.function_group_name,
        args.function_module_name,
        args.source_code,
        lockHandle,
        sessionId,
        args.transport_request || corrNr
      );

      if (uploadResponse.status !== 200) {
        throw new Error(`Source upload failed with status ${uploadResponse.status}`);
      }

      logger.info("✅ Function module source uploaded successfully");

      // Step 3: Unlock function module
      const unlockResponse = await unlockFunctionModule(
        args.function_group_name,
        args.function_module_name,
        lockHandle,
        sessionId
      );

      if (unlockResponse.status !== 200) {
        logger.warn(`Unlock returned status ${unlockResponse.status}, but continuing...`);
      } else {
        logger.info("✅ Function module unlocked successfully");
      }

      // Step 4: Activate if requested
      if (args.activate) {
        const activateResponse = await activateFunctionModule(
          args.function_group_name,
          args.function_module_name
        );

        if (activateResponse.status !== 200) {
          logger.warn(`Activation returned status ${activateResponse.status}`);
        } else {
          logger.info("✅ Function module activated successfully");
        }
      }

      logger.info(`✅ UpdateFunctionModuleSource completed successfully: ${args.function_module_name}`);

      const result = {
        success: true,
        function_module_name: args.function_module_name,
        function_group_name: args.function_group_name,
        activated: args.activate || false,
        message: `Function module ${args.function_module_name} source code updated successfully${args.activate ? ' and activated' : ''}`
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error) {
      // If upload or activation fails, try to unlock
      logger.warn(`Error during update, attempting to unlock...`);
      try {
        await unlockFunctionModule(
          args.function_group_name,
          args.function_module_name,
          lockHandle,
          sessionId
        );
        logger.info("✅ Function module unlocked after error");
      } catch (unlockError) {
        logger.error(`Failed to unlock after error: ${unlockError}`);
      }
      throw error;
    }

  } catch (error: any) {
    logger.error(`❌ UpdateFunctionModuleSource failed: ${error.message}`);
    return return_error(`Failed to update function module source: ${error.message}`);
  }
}

// Named export for consistency with other handlers
export async function handleUpdateFunctionModuleSource(args: UpdateFunctionModuleSourceArgs): Promise<any> {
  return handler(args);
}
