import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName } from '../lib/utils';
import { makeAdtRequestWithSession, generateSessionId } from '../lib/sessionUtils';
import { validateTransportRequest } from '../utils/transportValidation';
import { XMLParser } from 'fast-xml-parser';
import * as crypto from 'crypto';

export const TOOL_DEFINITION = {
  name: "CreateDomain",
  description: "Create a new ABAP domain in SAP system with all required steps: lock, create, check, unlock, activate, and verify.",
  inputSchema: {
    type: "object",
    properties: {
      domain_name: { 
        type: "string", 
        description: "Domain name (e.g., ZZ_TEST_0001). Must follow SAP naming conventions." 
      },
      description: { 
        type: "string", 
        description: "Domain description. If not provided, domain_name will be used." 
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
        description: "Data type: CHAR, NUMC, DATS, TIMS, DEC, INT1, INT2, INT4, INT8, CURR, QUAN, etc.",
        default: "CHAR" 
      },
      length: { 
        type: "number", 
        description: "Field length (max depends on datatype)",
        default: 100 
      },
      decimals: { 
        type: "number", 
        description: "Decimal places (for DEC, CURR, QUAN types)",
        default: 0 
      },
      conversion_exit: { 
        type: "string", 
        description: "Conversion exit routine name (without CONVERSION_EXIT_ prefix)" 
      },
      lowercase: { 
        type: "boolean", 
        description: "Allow lowercase input",
        default: false 
      },
      sign_exists: { 
        type: "boolean", 
        description: "Field has sign (+/-)",
        default: false 
      },
      value_table: {
        type: "string",
        description: "Value table name for foreign key relationship"
      },
      activate: {
        type: "boolean",
        description: "Activate domain after creation (default: true)",
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
 * Generate unique request ID for each ADT request
 */
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Build check run XML payload
 */
function buildCheckRunXml(domainName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">
  <chkrun:checkObject adtcore:uri="/sap/bc/adt/ddic/domains/${encodeSapObjectName(domainName.toLowerCase())}" chkrun:version="new"/>
</chkrun:checkObjectList>`;
}

/**
 * Build activation XML payload
 */
function buildActivationXml(domainName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/domains/${encodeSapObjectName(domainName.toLowerCase())}" adtcore:name="${domainName.toUpperCase()}"/>
</adtcore:objectReferences>`;
}


/**
 * Parse check run response to verify success
 */
function parseCheckRunResponse(response: AxiosResponse): { success: boolean; message: string } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });
  
  try {
    const result = parser.parse(response.data);
    const checkReport = result['chkrun:checkRunReports']?.['chkrun:checkReport'];
    
    if (checkReport) {
      const status = checkReport['chkrun:status'];
      const statusText = checkReport['chkrun:statusText'] || '';
      
      return {
        success: status === 'processed',
        message: statusText
      };
    }
    
    return { success: false, message: 'Unknown check run status' };
  } catch (error) {
    return { success: false, message: `Failed to parse check run response: ${error}` };
  }
}

/**
 * Parse activation response to verify success
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
        message: activated ? 'Domain activated successfully' : 'Activation failed'
      };
    }
    
    return { success: false, message: 'Unknown activation status' };
  } catch (error) {
    return { success: false, message: `Failed to parse activation response: ${error}` };
  }
}

/**
 * Step 0.0: Create empty domain (initial POST to register the name)
 */
async function createEmptyDomain(
  args: DomainArgs,
  sessionId: string,
  username: string
): Promise<AxiosResponse> {
  // POST to /sap/bc/adt/ddic/domains (without domain name in URL)
  // For $TMP package, don't include corrNr parameter
  const corrNrParam = args.transport_request ? `?corrNr=${args.transport_request}` : '';
  const url = `/sap/bc/adt/ddic/domains${corrNrParam}`;
  
  // Minimal XML to create empty domain
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
</doma:domain>`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
    'Content-Type': 'application/vnd.sap.adt.domains.v2+xml'
  };
  
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, xmlBody, headers);
  return response;
}

/**
 * Step 2: Acquire lock handle by attempting to lock the domain
 */
async function acquireLockHandle(
  args: DomainArgs,
  sessionId: string
): Promise<string> {
  const domainNameEncoded = encodeSapObjectName(args.domain_name.toLowerCase());
  
  // POST with _action=LOCK&accessMode=MODIFY to get the lock handle
  const url = `/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };
  
  try {
    // POST to lock the domain for creation with proper Accept header
    const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
    
    // Parse XML response to extract LOCK_HANDLE
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    
    const result = parser.parse(response.data);
    const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
    
    console.log('[DEBUG] acquireLockHandle - parsed result:', JSON.stringify(result, null, 2));
    console.log(`[DEBUG] acquireLockHandle - extracted lockHandle: "${lockHandle}"`);
    
    if (!lockHandle) {
      throw new McpError(ErrorCode.InternalError, 'Failed to obtain lock handle from SAP response');
    }
    
    return lockHandle;
  } catch (error: any) {
    const errorDetails = error.response?.data ? `\nResponse: ${error.response.data}` : '';
    
    // Check if domain already exists
    if (error.response?.data?.includes('ExceptionResourceAlreadyExists')) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Domain ${args.domain_name} already exists. Please delete it first or use a different name.`
      );
    }
    
    throw new McpError(
      ErrorCode.InternalError,
      `Failed to create empty domain ${args.domain_name}: ${error.message || error}${errorDetails}`
    );
  }
}

/**
 * Step 3: Create domain with lock handle
 * Build XML from scratch using parameters
 */
async function lockAndCreateDomain(
  args: DomainArgs, 
  lockHandle: string,
  sessionId: string,
  username: string
): Promise<AxiosResponse> {
  const domainNameEncoded = encodeSapObjectName(args.domain_name.toLowerCase());
  
  // For $TMP package, don't include corrNr parameter (but lockHandle is still required)
  const corrNrParam = args.transport_request ? `&corrNr=${args.transport_request}` : '';
  const url = `/sap/bc/adt/ddic/domains/${domainNameEncoded}?lockHandle=${lockHandle}${corrNrParam}`;
  
  // Build domain XML from parameters
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
  
  // Build complete XML manually to ensure correct structure
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
 * Step 2: Check domain syntax
 */
async function checkDomainSyntax(domainName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/checkruns`;
  const xmlBody = buildCheckRunXml(domainName);
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.checkmessages+xml',
    'Content-Type': 'application/vnd.sap.adt.checkobjects+xml'
  };
  
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, xmlBody, headers);
  
  const checkResult = parseCheckRunResponse(response);
  if (!checkResult.success) {
    throw new McpError(ErrorCode.InternalError, `Domain check failed: ${checkResult.message}`);
  }
  
  return response;
}

/**
 * Step 3: Unlock domain
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
 * Step 4: Activate domain
 */
async function activateDomain(domainName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  const xmlBody = buildActivationXml(domainName);
  
  const headers = {
    'Accept': 'application/xml',
    'Content-Type': 'application/xml'
  };
  
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, xmlBody, headers);
  
  const activationResult = parseActivationResponse(response);
  if (!activationResult.success) {
    throw new McpError(ErrorCode.InternalError, `Domain activation failed: ${activationResult.message}`);
  }
  
  return response;
}

/**
 * Step 5: Get domain to verify creation
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
    attributeNamePrefix: '',
  });
  
  const result = parser.parse(response.data);
  return result['doma:domain'];
}

/**
 * Main handler for CreateDomain MCP tool
 */
export async function handleCreateDomain(args: any) {
  try {
    // Validate required parameters
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    
    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(args.package_name, args.transport_request);

    // Generate session ID for this MCP call (all ADT requests will use this ID)
    const sessionId = generateSessionId();
    
    // Get username from environment or use default
    const username = process.env.SAP_USER || 'MPCUSER';
    
    const typedArgs = args as DomainArgs;
    let lockHandle = '';

    try {
      console.log(`[DEBUG] Session ID for all requests: ${sessionId}`);
      
      // Step 1: Create empty domain (POST registers name and locks on transport)
      console.log(`[DEBUG] Step 1: Creating empty domain with sessionId: ${sessionId}`);
      await createEmptyDomain(typedArgs, sessionId, username);
      
      // Step 2: Acquire lock handle
      console.log(`[DEBUG] Step 2: Acquiring lock handle with sessionId: ${sessionId}`);
      lockHandle = await acquireLockHandle(typedArgs, sessionId);
      
      // Wait a bit for SAP to process the lock
      console.log(`[DEBUG] Waiting 500ms for SAP to process lock...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Wait a bit before PUT to ensure lock is fully established
      console.log(`[DEBUG] Waiting 500ms before PUT...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 3: Create domain with full data (PUT with lock handle, build XML from parameters)
      console.log(`[DEBUG] Step 3: PUT domain with sessionId: ${sessionId}, lockHandle: ${lockHandle}`);
      await lockAndCreateDomain(typedArgs, lockHandle, sessionId, username);
      
      // Step 4: Check domain syntax
      await checkDomainSyntax(typedArgs.domain_name, sessionId);
      
      // Step 5: Unlock domain (important!)
      await unlockDomain(typedArgs.domain_name, lockHandle, sessionId);
      
      // Step 6: Activate domain (optional, default true)
      const shouldActivate = typedArgs.activate !== false;
      if (shouldActivate) {
        await activateDomain(typedArgs.domain_name, sessionId);
      }
      
      // Step 7: Verify creation
      const finalDomain = await getDomainForVerification(typedArgs.domain_name, sessionId);
      
      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: typedArgs.domain_name,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          status: shouldActivate ? 'active' : 'inactive',
          session_id: sessionId,
          message: `Domain ${typedArgs.domain_name} created${shouldActivate ? ' and activated' : ''} successfully`,
          domain_details: finalDomain
        })
      } as AxiosResponse);

    } catch (error) {
      // Try to unlock if we have a lock handle
      if (lockHandle) {
        try {
          await unlockDomain(typedArgs.domain_name, lockHandle, sessionId);
        } catch (unlockError) {
          // Log but don't fail on unlock error
          console.error('Failed to unlock domain after error:', unlockError);
        }
      }
      throw error;
    }
    
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
