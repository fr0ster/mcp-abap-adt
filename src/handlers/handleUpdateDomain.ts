import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, makeAdtRequestWithTimeout } from '../lib/utils';
import { makeAdtRequestWithSession, generateSessionId } from '../lib/sessionUtils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "UpdateDomain",
  description: `Update an existing ABAP domain in SAP system. 
  
Workflow:
1. Acquires lock on the domain
2. Updates domain with provided parameters (complete replacement)
3. Performs syntax check
4. Unlocks domain
5. Optionally activates domain (default: true)
6. Returns updated domain details

Note: All provided parameters completely replace existing values. Use GetDomain first to see current values if needed.`,
  inputSchema: {
    type: "object",
    properties: {
      domain_name: { 
        type: "string", 
        description: "Domain name to update (e.g., ZZ_TEST_0001)" 
      },
      description: { 
        type: "string", 
        description: "New domain description (optional)" 
      },
      package_name: { 
        type: "string", 
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      },
      datatype: { 
        type: "string", 
        description: "Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc." 
      },
      length: { 
        type: "number", 
        description: "Field length (max depends on datatype)" 
      },
      decimals: { 
        type: "number", 
        description: "Decimal places (for DEC, CURR, QUAN types)" 
      },
      conversion_exit: { 
        type: "string", 
        description: "Conversion exit routine name (without CONVERSION_EXIT_ prefix)" 
      },
      lowercase: { 
        type: "boolean", 
        description: "Allow lowercase input" 
      },
      sign_exists: { 
        type: "boolean", 
        description: "Field has sign (+/-)" 
      },
      value_table: {
        type: "string",
        description: "Value table name for foreign key relationship"
      },
      activate: {
        type: "boolean",
        description: "Activate domain after update (default: true)",
        default: true
      },
      fixed_values: {
        type: "array",
        description: "Array of fixed values for domain value range",
        items: {
          type: "object",
          properties: {
            low: {
              type: "string",
              description: "Fixed value (e.g., '001', 'A')"
            },
            text: {
              type: "string",
              description: "Description text for the fixed value"
            }
          },
          required: ["low", "text"]
        }
      }
    },
    required: ["domain_name", "package_name"]
  }
} as const;

interface FixedValue {
  low: string;
  text: string;
}

interface DomainArgs {
  domain_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  datatype?: string;
  length?: number;
  decimals?: number;
  conversion_exit?: string;
  lowercase?: boolean;
  sign_exists?: boolean;
  value_table?: string;
  activate?: boolean;
  fixed_values?: FixedValue[];
}

/**
 * Step 1: Acquire lock handle
 */
async function acquireLockHandle(
  domainName: string,
  sessionId: string
): Promise<string> {
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  const url = `/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };
  
  try {
    const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
    
    // Parse XML response to extract LOCK_HANDLE
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: ''
    });
    
    const result = parser.parse(response.data);
    const lockHandle = result['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
    
    if (!lockHandle) {
      throw new McpError(
        ErrorCode.InternalError,
        'Failed to extract lock handle from response'
      );
    }
    
    return lockHandle;
  } catch (error: any) {
    // Handle specific error cases
    if (error.response?.status === 403) {
      throw new McpError(
        ErrorCode.InternalError,
        `Domain ${domainName} is locked by another user or session. Please try again later.`
      );
    }
    
    if (error.response?.status === 404) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Domain ${domainName} not found.`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to lock domain ${domainName}: ${error.message || error}`
    );
  }
}

/**
 * Step 2: Update domain
 * Build complete XML from parameters (like CreateDomain)
 */
async function updateDomain(
  args: DomainArgs,
  lockHandle: string,
  sessionId: string,
  username: string
): Promise<AxiosResponse> {
  const domainNameEncoded = encodeSapObjectName(args.domain_name.toLowerCase());
  
  // For $TMP package, don't include corrNr parameter
  const corrNrParam = args.transport_request ? `&corrNr=${args.transport_request}` : '';
  const url = `/sap/bc/adt/ddic/domains/${domainNameEncoded}?lockHandle=${lockHandle}${corrNrParam}`;
  
  // Build domain XML from parameters (complete replacement)
  const datatype = args.datatype || 'CHAR';
  const length = args.length || 100;
  const decimals = args.decimals || 0;
  
  // Build fixValues structure
  let fixValuesXml = '';
  if (args.fixed_values && args.fixed_values.length > 0) {
    const fixValueItems = args.fixed_values.map(fv => 
      `      <doma:fixValue>\n        <doma:low>${fv.low}</doma:low>\n        <doma:text>${fv.text}</doma:text>\n      </doma:fixValue>`
    ).join('\n');
    fixValuesXml = `    <doma:fixValues>\n${fixValueItems}\n    </doma:fixValues>`;
  } else {
    fixValuesXml = '    <doma:fixValues/>';
  }
  
  // Build complete XML manually
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain"
             xmlns:adtcore="http://www.sap.com/adt/core"
             adtcore:description="${args.description || args.domain_name}"
             adtcore:language="EN"
             adtcore:name="${args.domain_name.toUpperCase()}"
             adtcore:type="DOMA/DD"
             adtcore:masterLanguage="EN"
             adtcore:responsible="${username}">
  <adtcore:packageRef adtcore:name="${args.package_name.toUpperCase()}"/>
  <doma:content>
    <doma:typeInformation>
      <doma:datatype>${datatype}</doma:datatype>
      <doma:length>${length}</doma:length>
      <doma:decimals>${decimals}</doma:decimals>
    </doma:typeInformation>
    <doma:outputInformation>
      <doma:length>${length}</doma:length>
      <doma:conversionExit>${args.conversion_exit || ''}</doma:conversionExit>
      <doma:signExists>${args.sign_exists || false}</doma:signExists>
      <doma:lowercase>${args.lowercase || false}</doma:lowercase>
    </doma:outputInformation>
    <doma:valueInformation>
      <doma:valueTableRef adtcore:name="${args.value_table || ''}"/>
      <doma:appendExists>false</doma:appendExists>
${fixValuesXml}
    </doma:valueInformation>
  </doma:content>
</doma:domain>`;
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
    'Content-Type': 'application/vnd.sap.adt.domains.v2+xml; charset=utf-8'
  };
  
  const response = await makeAdtRequestWithSession(url, 'PUT', sessionId, xmlBody, headers);
  return response;
}

/**
 * Step 4: Check domain syntax
 */
async function checkDomainSyntax(domainName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/checkruns`;
  
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">
  <chkrun:checkObject adtcore:uri="/sap/bc/adt/ddic/domains/${encodeSapObjectName(domainName.toLowerCase())}" 
                      adtcore:name="${domainName.toUpperCase()}" 
                      adtcore:type="DOMA/DD"/>
</chkrun:checkObjectList>`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.checkmessages+xml',
    'Content-Type': 'application/vnd.sap.adt.checkobjects+xml'
  };
  
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, xmlBody, headers);
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  });
  
  const result = parser.parse(response.data);
  const messages = result['chkrun:checkMessages']?.['msg:message'];
  
  if (messages) {
    const errors = Array.isArray(messages) ? messages : [messages];
    const errorMsgs = errors.filter((m: any) => m['msg:type'] === 'E');
    
    if (errorMsgs.length > 0) {
      throw new McpError(
        ErrorCode.InternalError,
        `Domain syntax check failed: ${errorMsgs.map((m: any) => m['msg:shortText']).join(', ')}`
      );
    }
  }
  
  return response;
}

/**
 * Step 5: Unlock domain
 */
async function unlockDomain(
  domainName: string,
  lockHandle: string,
  sessionId: string
): Promise<AxiosResponse> {
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  const url = `/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  return makeAdtRequestWithSession(url, 'POST', sessionId);
}

/**
 * Step 6: Activate domain
 */
async function activateDomain(domainName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/domains/${encodeSapObjectName(domainName.toLowerCase())}" 
                           adtcore:name="${domainName.toUpperCase()}"/>
</adtcore:objectReferences>`;
  
  const headers = {
    'Accept': 'application/xml',
    'Content-Type': 'application/xml'
  };
  
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, xmlBody, headers);
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  });
  
  const result = parser.parse(response.data);
  const inactive = result['adtcore:objectReferences']?.['adtcore:objectReference']?.['adtcore:inactive'];
  
  if (inactive === 'true' || inactive === true) {
    throw new McpError(ErrorCode.InternalError, 'Domain activation failed');
  }
  
  return response;
}

/**
 * Step 7: Get domain to verify update
 */
async function getDomainForVerification(domainName: string, sessionId: string): Promise<any> {
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  const url = `/sap/bc/adt/ddic/domains/${domainNameEncoded}?version=workingArea`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml'
  };
  
  const response = await makeAdtRequestWithSession(url, 'GET', sessionId, undefined, headers);
  
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: ''
  });
  
  const result = parser.parse(response.data);
  return result['doma:domain'];
}

/**
 * Main handler for UpdateDomain tool
 */
export async function handleUpdateDomain(args: any) {
  try {
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    
    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(args.package_name, args.transport_request);

    // Generate session ID for this MCP call
    const sessionId = generateSessionId();
    
    const typedArgs = args as DomainArgs;
    let lockHandle = '';

    try {
      // Get username from environment or use default
      const username = process.env.SAP_USER || 'MPCUSER';
      
      // Step 1: Acquire lock handle (creates stateful session)
      lockHandle = await acquireLockHandle(typedArgs.domain_name, sessionId);
      
      // Wait for lock to be processed
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 2: Update domain with new data
      await updateDomain(typedArgs, lockHandle, sessionId, username);
      
      // Step 4: Check domain syntax
      await checkDomainSyntax(typedArgs.domain_name, sessionId);
      
      // Step 5: Unlock domain
      await unlockDomain(typedArgs.domain_name, lockHandle, sessionId);
      
      // Step 6: Activate domain (optional, default true)
      const shouldActivate = typedArgs.activate !== false;
      if (shouldActivate) {
        await activateDomain(typedArgs.domain_name, sessionId);
      }
      
      // Step 7: Get updated domain for verification
      const updatedDomain = await getDomainForVerification(typedArgs.domain_name, sessionId);
      
      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: typedArgs.domain_name,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          status: shouldActivate ? 'active' : 'inactive',
          session_id: sessionId,
          message: `Domain ${typedArgs.domain_name} updated${shouldActivate ? ' and activated' : ''} successfully`,
          domain_details: updatedDomain
        })
      } as AxiosResponse);

    } catch (error: any) {
      // Try to unlock if we have a lock handle
      if (lockHandle) {
        try {
          await unlockDomain(typedArgs.domain_name, lockHandle, sessionId);
        } catch (unlockError) {
          console.error('Failed to unlock domain after error:', unlockError);
        }
      }
      throw error;
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
