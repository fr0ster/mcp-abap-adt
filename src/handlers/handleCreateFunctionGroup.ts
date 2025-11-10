/**
 * CreateFunctionGroup Handler - ABAP Function Group Creation via ADT API
 * 
 * Eclipse ADT workflow (simpler than classes - no LOCK/UNLOCK needed):
 * 1. POST /sap/bc/adt/functions/groups - Create function group with metadata
 * 2. POST /sap/bc/adt/activation - Activate function group (optional)
 * 
 * Note: Unlike classes, function groups don't require lock/unlock for initial creation.
 * The TOP include and function modules are added separately after creation.
 */

import { AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, logger } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import * as crypto from 'crypto';

export const TOOL_DEFINITION = {
  name: "CreateFunctionGroup",
  description: "Create a new ABAP function group in SAP system. Function groups serve as containers for function modules. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      function_group_name: { 
        type: "string", 
        description: "Function group name (e.g., ZTEST_FG_001). Must follow SAP naming conventions (start with Z or Y, max 26 chars)." 
      },
      description: {
        type: "string",
        description: "Function group description. If not provided, function_group_name will be used."
      },
      package_name: { 
        type: "string", 
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      },
      activate: {
        type: "boolean",
        description: "Activate function group after creation. Default: true. Set to false for batch operations."
      }
    },
    required: ["function_group_name", "package_name"]
  }
} as const;

interface CreateFunctionGroupArgs {
  function_group_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  activate?: boolean;
}

/**
 * Generate unique session ID - same for all requests in this operation
 */
function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Step 1: Create function group metadata via POST
 */
async function createFunctionGroupObject(
  functionGroupName: string,
  description: string,
  packageName: string,
  transportRequest?: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/functions/groups`;
  
  logger.info(`📝 Creating function group metadata: ${functionGroupName}`);
  
  // Get username and system (if available) or leave empty
  const username = process.env.SAP_USERNAME || '';
  const masterSystem = process.env.SAP_SYSTEM || 'E19';
  
  // Build XML payload for function group creation
  // Use Eclipse ADT format: group:abapFunctionGroup with v3 API
  const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<group:abapFunctionGroup xmlns:group="http://www.sap.com/adt/functions/groups" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="EN" adtcore:name="${functionGroupName}" adtcore:type="FUGR/F" adtcore:masterLanguage="EN" adtcore:masterSystem="${masterSystem}" adtcore:responsible="${username}">
  <adtcore:packageRef adtcore:name="${packageName}"/>
</group:abapFunctionGroup>`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/vnd.sap.adt.functions.groups.v3+xml',
    'Accept': 'application/vnd.sap.adt.functions.groups.v3+xml'
  };
  
  // Add transport request if provided
  const params: Record<string, string> = {};
  if (transportRequest) {
    params.corrNr = transportRequest;
  }
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'POST',
    'default',
    xmlPayload,
    params,
    headers
  );
  
  logger.info(`✅ Function group metadata created: ${functionGroupName}`);
  
  return response;
}

/**
 * Step 2: Activate function group
 */
async function activateFunctionGroup(functionGroupName: string): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const encodedName = encodeSapObjectName(functionGroupName).toLowerCase();
  const objectUri = `/sap/bc/adt/functions/groups/${encodedName}`;
  
  logger.info(`⚡ Activating function group: ${functionGroupName}`);
  
  const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${functionGroupName}"/>
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
  
  logger.info(`✅ Function group activated successfully`);
  
  return response;
}

/**
 * Main handler
 */
export async function handleCreateFunctionGroup(args: any) {
  const {
    function_group_name,
    description,
    package_name,
    transport_request,
    activate = true
  } = args as CreateFunctionGroupArgs;

  // Validation
  if (!function_group_name || !package_name) {
    return return_error('function_group_name and package_name are required');
  }
  
  // Validate transport_request: required for non-$TMP packages
  try {
    validateTransportRequest(package_name, transport_request);
  } catch (error) {
    return return_error(error as Error);
  }
  
  // Validate function group name (max 26 chars, SAP naming)
  if (function_group_name.length > 26) {
    return return_error('Function group name must not exceed 26 characters');
  }
  
  if (!/^[ZY]/i.test(function_group_name)) {
    return return_error('Function group name must start with Z or Y (customer namespace)');
  }
  
  logger.info(`🚀 Starting CreateFunctionGroup: ${function_group_name}`);
  
  try {
    // Step 1: Create function group metadata
    await createFunctionGroupObject(
      function_group_name,
      description || function_group_name,
      package_name,
      transport_request
    );
    
    // Step 2: Activate (if requested)
    if (activate) {
      await activateFunctionGroup(function_group_name);
    }
    
    logger.info(`✅ CreateFunctionGroup completed successfully: ${function_group_name}`);
    
    return return_response({
      data: {
        success: true,
        function_group_name,
        package_name,
        transport_request: transport_request || 'local',
        activated: activate,
        message: `Function group ${function_group_name} created successfully${activate ? ' and activated' : ''}`
      }
    } as AxiosResponse);
    
  } catch (error: any) {
    logger.error(`❌ CreateFunctionGroup failed: ${error}`);
    
    // Parse error message for better user feedback
    let errorMessage = `Failed to create function group: ${error}`;
    
    if (error.response?.status === 400) {
      errorMessage = `Bad request. Check if function group name is valid and package exists.`;
    } else if (error.response?.status === 409) {
      errorMessage = `Function group ${function_group_name} already exists.`;
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
