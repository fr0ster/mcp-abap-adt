/**
 * CreateDataElement Handler - ABAP Data Element Creation via ADT API
 * 
 * CURRENT STATE (Simplified):
 * - Step 1: POST creates data element with all properties in one call
 * - Step 2: Activate data element
 * - Step 3: Verify activation
 * - SAP handles locking automatically on transport
 * 
 * APPROACH:
 * - Similar to CreateDomain: POST with full body (combining empty POST + filled PUT)
 * - Simpler than Eclipse (3 steps vs multiple LOCK/UNLOCK operations)
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import * as crypto from 'crypto';
import { getConfig } from '../index';

export const TOOL_DEFINITION = {
  name: "CreateDataElement",
  description: "Create a new ABAP data element in SAP system with all required steps: create, activate, and verify.",
  inputSchema: {
    type: "object",
    properties: {
      data_element_name: { 
        type: "string", 
        description: "Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions." 
      },
      description: { 
        type: "string", 
        description: "Data element description. If not provided, data_element_name will be used." 
      },
      package_name: { 
        type: "string", 
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      },
      domain_name: {
        type: "string",
        description: "Domain name to use as type reference (e.g., ZZ_TEST_0001)"
      },
      data_type: {
        type: "string",
        description: "Data type (e.g., CHAR, NUMC). Usually inherited from domain.",
        default: "CHAR"
      },
      length: {
        type: "number",
        description: "Data type length. Usually inherited from domain.",
        default: 100
      },
      decimals: {
        type: "number",
        description: "Decimal places. Usually inherited from domain.",
        default: 0
      },
      short_label: {
        type: "string",
        description: "Short field label (max 10 chars)"
      },
      medium_label: {
        type: "string",
        description: "Medium field label (max 20 chars)"
      },
      long_label: {
        type: "string",
        description: "Long field label (max 40 chars)"
      },
      heading_label: {
        type: "string",
        description: "Heading field label (max 55 chars)"
      }
    },
    required: ["data_element_name", "package_name", "transport_request", "domain_name"]
  }
} as const;

interface DataElementArgs {
  data_element_name: string;
  description?: string;
  package_name: string;
  transport_request: string;
  domain_name: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  short_label?: string;
  medium_label?: string;
  long_label?: string;
  heading_label?: string;
}

/**
 * Generate unique session ID for ADT connection
 */
function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Generate unique request ID for each ADT request
 */
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Make ADT request with session and request IDs - STATELESS
 */
async function makeAdtRequestStateless(
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
    'X-sap-adt-profiling': 'server-time',
    ...additionalHeaders
  };
  
  return makeAdtRequestWithTimeout(fullUrl, method, 'default', data, undefined, headers);
}

/**
 * Build activation XML payload
 */
function buildActivationXml(dataElementName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/dataelements/${encodeSapObjectName(dataElementName.toLowerCase())}" adtcore:name="${dataElementName.toUpperCase()}"/>
</adtcore:objectReferences>`;
}

/**
 * Parse activation response
 */
function parseActivationResponse(response: AxiosResponse): { success: boolean; message: string } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });
  
  try {
    const result = parser.parse(response.data);
    const properties = result['chkl:messages']?.['chkl:properties'];
    
    if (properties) {
      const activated = properties['activationExecuted'] === 'true' || properties['activationExecuted'] === true;
      const checked = properties['checkExecuted'] === 'true' || properties['checkExecuted'] === true;
      
      return {
        success: activated && checked,
        message: activated ? 'Data element activated successfully' : 'Activation failed'
      };
    }
    
    return { success: false, message: 'Unknown activation status' };
  } catch (error) {
    return { success: false, message: `Failed to parse activation response: ${error}` };
  }
}

/**
 * Create data element with POST (combining empty POST + filled PUT approach)
 */
async function createDataElement(
  args: DataElementArgs,
  sessionId: string,
  username: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/ddic/dataelements?corrNr=${args.transport_request}`;
  
  const description = args.description || args.data_element_name;
  const dataType = args.data_type || 'CHAR';
  const length = args.length || 100;
  const decimals = args.decimals || 0;
  const shortLabel = args.short_label || '';
  const mediumLabel = args.medium_label || '';
  const longLabel = args.long_label || '';
  const headingLabel = args.heading_label || '';
  
  // Build complete XML with all properties (based on Eclipse PUT body)
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<blue:wbobj xmlns:blue="http://www.sap.com/wbobj/dictionary/dtel" 
            xmlns:adtcore="http://www.sap.com/adt/core" 
            xmlns:atom="http://www.w3.org/2005/Atom" 
            xmlns:dtel="http://www.sap.com/adt/dictionary/dataelements" 
            adtcore:description="${description}" 
            adtcore:language="EN" 
            adtcore:name="${args.data_element_name.toUpperCase()}" 
            adtcore:type="DTEL/DE" 
            adtcore:masterLanguage="EN" 
            adtcore:responsible="${username}">
  <adtcore:packageRef adtcore:name="${args.package_name.toUpperCase()}"/>
  <dtel:dataElement>
    <dtel:typeKind>domain</dtel:typeKind>
    <dtel:typeName>${args.domain_name.toUpperCase()}</dtel:typeName>
    <dtel:dataType>${dataType}</dtel:dataType>
    <dtel:dataTypeLength>${length}</dtel:dataTypeLength>
    <dtel:dataTypeDecimals>${decimals}</dtel:dataTypeDecimals>
    <dtel:shortFieldLabel>${shortLabel}</dtel:shortFieldLabel>
    <dtel:shortFieldLength>10</dtel:shortFieldLength>
    <dtel:shortFieldMaxLength>10</dtel:shortFieldMaxLength>
    <dtel:mediumFieldLabel>${mediumLabel}</dtel:mediumFieldLabel>
    <dtel:mediumFieldLength>20</dtel:mediumFieldLength>
    <dtel:mediumFieldMaxLength>20</dtel:mediumFieldMaxLength>
    <dtel:longFieldLabel>${longLabel}</dtel:longFieldLabel>
    <dtel:longFieldLength>40</dtel:longFieldLength>
    <dtel:longFieldMaxLength>40</dtel:longFieldMaxLength>
    <dtel:headingFieldLabel>${headingLabel}</dtel:headingFieldLabel>
    <dtel:headingFieldLength>55</dtel:headingFieldLength>
    <dtel:headingFieldMaxLength>55</dtel:headingFieldMaxLength>
    <dtel:searchHelp/>
    <dtel:searchHelpParameter/>
    <dtel:setGetParameter/>
    <dtel:defaultComponentName/>
    <dtel:deactivateInputHistory>false</dtel:deactivateInputHistory>
    <dtel:changeDocument>false</dtel:changeDocument>
    <dtel:leftToRightDirection>false</dtel:leftToRightDirection>
    <dtel:deactivateBIDIFiltering>false</dtel:deactivateBIDIFiltering>
  </dtel:dataElement>
</blue:wbobj>`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
    'Content-Type': 'application/vnd.sap.adt.dataelements.v2+xml'
  };
  
  console.log(`[DEBUG] createDataElement - POST to create data element`);
  console.log(`[DEBUG] POST body:\n${xmlBody}`);
  
  const response = await makeAdtRequestStateless(url, 'POST', sessionId, xmlBody, headers);
  console.log('[DEBUG] createDataElement response status:', response.status);
  console.log('[DEBUG] createDataElement response headers:', response.headers);
  
  return response;
}

/**
 * Activate data element
 */
async function activateDataElement(dataElementName: string, sessionId: string): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  const xmlBody = buildActivationXml(dataElementName);
  
  const headers = {
    'Accept': 'application/xml',
    'Content-Type': 'application/xml'
  };
  
  const response = await makeAdtRequestStateless(url, 'POST', sessionId, xmlBody, headers);
  
  const activationResult = parseActivationResponse(response);
  if (!activationResult.success) {
    throw new McpError(ErrorCode.InternalError, `Data element activation failed: ${activationResult.message}`);
  }
  
  return response;
}

/**
 * Get data element to verify creation
 */
async function getDataElementForVerification(dataElementName: string, sessionId: string): Promise<any> {
  const baseUrl = await getBaseUrl();
  const dataElementNameEncoded = encodeSapObjectName(dataElementName.toLowerCase());
  const url = `${baseUrl}/sap/bc/adt/ddic/dataelements/${dataElementNameEncoded}`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.dataelements.v1+xml, application/vnd.sap.adt.dataelements.v2+xml',
  };
  
  const response = await makeAdtRequestStateless(url, 'GET', sessionId, null, headers);
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });
  
  const result = parser.parse(response.data);
  return result['blue:wbobj'];
}

/**
 * Main handler for CreateDataElement MCP tool
 */
export async function handleCreateDataElement(args: any) {
  try {
    // Validate required parameters
    if (!args?.data_element_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    if (!args?.transport_request) {
      throw new McpError(ErrorCode.InvalidParams, 'Transport request is required');
    }
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }

    const sessionId = generateSessionId();
    const username = process.env.SAP_USER || 'MPCUSER';
    const typedArgs = args as DataElementArgs;

    console.log(`[DEBUG] Session ID for all requests: ${sessionId}`);
    
    // Step 1: Create data element with POST (full body)
    console.log(`[DEBUG] Step 1: Creating data element with POST`);
    await createDataElement(typedArgs, sessionId, username);
    
    console.log(`[DEBUG] Data element ${typedArgs.data_element_name} created successfully (inactive state)`);
    
    // Step 2: Activate data element
    console.log(`[DEBUG] Step 2: Activating data element`);
    await activateDataElement(typedArgs.data_element_name, sessionId);
    
    console.log(`[DEBUG] Data element ${typedArgs.data_element_name} activated successfully`);
    
    // Step 3: Verify activation
    console.log(`[DEBUG] Step 3: Verifying data element activation`);
    const finalDataElement = await getDataElementForVerification(typedArgs.data_element_name, sessionId);
    
    return return_response({
      data: JSON.stringify({
        success: true,
        data_element_name: typedArgs.data_element_name,
        package: typedArgs.package_name,
        transport_request: typedArgs.transport_request,
        domain_name: typedArgs.domain_name,
        status: 'active',
        version: finalDataElement['adtcore:version'] || 'unknown',
        session_id: sessionId,
        message: `Data element ${typedArgs.data_element_name} created and activated successfully`,
        data_element_details: {
          type_kind: finalDataElement['dtel:dataElement']?.['dtel:typeKind'],
          type_name: finalDataElement['dtel:dataElement']?.['dtel:typeName'],
          data_type: finalDataElement['dtel:dataElement']?.['dtel:dataType'],
          length: finalDataElement['dtel:dataElement']?.['dtel:dataTypeLength'],
          decimals: finalDataElement['dtel:dataElement']?.['dtel:dataTypeDecimals']
        }
      }, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });
    
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
