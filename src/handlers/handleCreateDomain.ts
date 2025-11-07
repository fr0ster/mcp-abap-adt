import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName } from '../lib/utils';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
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
      }
    },
    required: ["domain_name", "package_name", "transport_request"]
  }
} as const;

interface DomainArgs {
  domain_name: string;
  description?: string;
  package_name: string;
  transport_request: string;
  datatype?: string;
  length?: number;
  decimals?: number;
  conversion_exit?: string;
  lowercase?: boolean;
  sign_exists?: boolean;
  value_table?: string;
}

/**
 * Generate unique session ID for ADT connection
 * All requests within this MCP call will use the same session ID
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
 * Build domain XML payload for PUT request
 */
function buildDomainXml(args: DomainArgs, username: string): string {
  const now = new Date().toISOString();
  const description = args.description || args.domain_name;
  const datatype = args.datatype || 'CHAR';
  const length = args.length || 100;
  const decimals = args.decimals || 0;
  const lowercase = args.lowercase || false;
  const signExists = args.sign_exists || false;
  const conversionExit = args.conversion_exit || '';
  const valueTable = args.value_table || '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" 
             xmlns:adtcore="http://www.sap.com/adt/core" 
             xmlns:atom="http://www.w3.org/2005/Atom"
             adtcore:name="${args.domain_name.toUpperCase()}"
             adtcore:type="DOMA/DD"
             adtcore:description="${description}"
             adtcore:language="EN"
             adtcore:version="new"
             adtcore:abapLanguageVersion="standard"
             adtcore:masterLanguage="EN"
             adtcore:responsible="${username}"
             adtcore:createdAt="${now}"
             adtcore:createdBy="${username}"
             adtcore:changedAt="${now}"
             adtcore:changedBy="${username}">
  <atom:link href="versions" rel="http://www.sap.com/adt/relations/versions" title="Historic versions"/>
  <adtcore:packageRef adtcore:name="${args.package_name.toUpperCase()}" adtcore:type="DEVC/K"/>
  <doma:content>
    <doma:typeInformation>
      <doma:datatype>${datatype}</doma:datatype>
      <doma:length>${length}</doma:length>
      <doma:decimals>${decimals}</doma:decimals>
    </doma:typeInformation>
    <doma:outputInformation>
      <doma:length>${length}</doma:length>
      <doma:style/>
      <doma:conversionExit>${conversionExit}</doma:conversionExit>
      <doma:signExists>${signExists}</doma:signExists>
      <doma:lowercase>${lowercase}</doma:lowercase>
      <doma:ampmFormat>false</doma:ampmFormat>
    </doma:outputInformation>
    <doma:valueInformation>
      <doma:valueTableRef>${valueTable}</doma:valueTableRef>
      <doma:appendExists>false</doma:appendExists>
      <doma:fixValues/>
    </doma:valueInformation>
  </doma:content>
</doma:domain>`;
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
 * Extract lock handle from PUT response
 */
function extractLockHandle(response: AxiosResponse): string | null {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });
  
  try {
    const result = parser.parse(response.data);
    // Lock handle typically comes from response headers or needs to be extracted from initial GET
    // For now, return from headers if available
    const lockHandle = response.headers['sap-adt-lockhandle'] || response.headers['lockhandle'];
    return lockHandle || null;
  } catch (error) {
    return null;
  }
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
 * Make ADT request with session and request IDs
 */
async function makeAdtRequestWithSession(
  url: string,
  method: string,
  sessionId: string,
  data?: any,
  additionalHeaders?: Record<string, string>
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  
  // Create custom headers with session and request IDs
  const requestId = generateRequestId();
  const headers: Record<string, string> = {
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': requestId,
    'X-sap-adt-profiling': 'server-time',
    ...additionalHeaders
  };
  
  // Use makeAdtRequestWithTimeout with custom headers
  return makeAdtRequestWithTimeout(fullUrl, method, 'default', data, undefined, headers);
}

/**
 * Step 0.0: Create empty domain (initial POST to register the name)
 */
async function createEmptyDomain(
  args: DomainArgs,
  sessionId: string,
  username: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  
  // POST to /sap/bc/adt/ddic/domains (without domain name in URL)
  const url = `${baseUrl}/sap/bc/adt/ddic/domains?corrNr=${args.transport_request}`;
  
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
    'Content-Type': 'application/vnd.sap.adt.domains.v2+xml',
    'X-sap-adt-profiling': 'server-time',
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': generateRequestId()
  };
  
  const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', xmlBody, undefined, headers); 
  console.log('[DEBUG] createEmptyDomain response headers:', response.headers);
  
  return response;
}

/**
 * Step 0.1: Get domain details and extract lock handle
 * After creating domain with POST, it's automatically locked on the transport
 * We need to GET the domain to obtain the lock handle for subsequent operations
 */
async function getDomainWithLockHandle(
  domainName: string,
  sessionId: string
): Promise<{ lockHandle: string; etag: string; domainXml: any }> {
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
    'Cache-Control': 'no-cache',
    'X-sap-adt-profiling': 'server-time',
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': generateRequestId()
  };
  
  const response = await makeAdtRequestWithTimeout(url, 'GET', 'default', null, undefined, headers);
  
  // Extract lock handle from response headers (if present)
  const lockHandle = response.headers['sap-adt-lockhandle'] || 
                     response.headers['lockhandle'] ||
                     response.headers['x-sap-adt-lockhandle'];
  
  // Extract ETag
  const etag = response.headers['etag'] || response.headers['ETag'] || '';
  
  console.log('[DEBUG] getDomainWithLockHandle - headers:', response.headers);
  console.log(`[DEBUG] lockHandle: "${lockHandle}", etag: "${etag}"`);
  
  // Parse XML to get full domain structure
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
  });
  
  const result = parser.parse(response.data);
  console.log('[DEBUG] Response body parsed:', JSON.stringify(result, null, 2));
  
  const domainXml = result['doma:domain'];
  
  return { lockHandle: lockHandle || '', etag, domainXml };
}

/**
 * Step 0: Acquire lock handle by attempting to lock the domain
 * This is required before creating a new domain
 */
async function acquireLockHandle(
  args: DomainArgs,
  sessionId: string
): Promise<string> {
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(args.domain_name.toLowerCase());
  
  // POST with _action=LOCK&accessMode=MODIFY to get the lock handle
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9',
    'X-sap-adt-profiling': 'server-time',
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': generateRequestId()
  };
  
  try {
    // POST to lock the domain for creation with proper Accept header
    const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', null, undefined, headers);
    
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
 * Step 0.5: Get domain with version=inactive (Eclipse does this before PUT)
 */
async function getDomainInactive(
  domainName: string,
  sessionId: string,
  etag?: string
): Promise<void> {
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  
  // GET domain with version=inactive (Eclipse ADT step before PUT)
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?version=inactive`;
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
    'X-sap-adt-profiling': 'server-time',
  };
  
  // Add If-None-Match if we have ETag
  if (etag) {
    headers['If-None-Match'] = etag;
  }
  
  try {
    await makeAdtRequestWithSession(url, 'GET', sessionId, undefined, headers);
    console.log(`[DEBUG] getDomainInactive - GET version=inactive completed`);
  } catch (error: any) {
    console.log(`[DEBUG] getDomainInactive - failed or returned 304: ${error.message}`);
    // 304 Not Modified is OK - means domain hasn't changed since we got ETag
  }
}

/**
 * Step 0.5 (old): Get ETag for the domain (required for PUT)
 */
async function getDomainETag(
  domainName: string,
  sessionId: string
): Promise<string> {
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  
  // GET domain to get ETag (without version parameter for new domains)
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
    'Cache-Control': 'no-cache',
    'X-sap-adt-profiling': 'server-time',
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': generateRequestId()
  };
  
  try {
    const response = await makeAdtRequestWithTimeout(url, 'GET', 'default', null, undefined, headers);
    
    // Extract ETag from response headers
    const etag = response.headers['etag'] || response.headers['ETag'];
    
    console.log(`[DEBUG] ETag received: "${etag}"`);
    console.log(`[DEBUG] All headers:`, response.headers);
    
    if (!etag) {
      // For new domains, ETag might not exist, return empty string
      return '';
    }
    
    return etag;
  } catch (error: any) {
    // For new domains that don't exist yet, this is expected
    // Return empty ETag
    return '';
  }
}

/**
 * Step 1: Create domain with lock handle and ETag
 * Takes the domain XML from GET and updates only the content section
 */
async function lockAndCreateDomain(
  args: DomainArgs, 
  lockHandle: string,
  domainXml: any,  // Parsed domain XML from getDomainWithLockHandle
  sessionId: string,
  username: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(args.domain_name.toLowerCase());
  
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?lockHandle=${lockHandle}&corrNr=${args.transport_request}`;
  
  // Update domain XML with our data
  const datatype = args.datatype || 'CHAR';
  const length = String(args.length || 100);
  const decimals = String(args.decimals || 0);
  
  // Update typeInformation
  domainXml['doma:content']['doma:typeInformation']['doma:datatype'] = datatype;
  domainXml['doma:content']['doma:typeInformation']['doma:length'] = length;
  domainXml['doma:content']['doma:typeInformation']['doma:decimals'] = decimals;
  
  // Update outputInformation
  domainXml['doma:content']['doma:outputInformation']['doma:length'] = length;
  domainXml['doma:content']['doma:outputInformation']['doma:conversionExit'] = args.conversion_exit || '';
  domainXml['doma:content']['doma:outputInformation']['doma:signExists'] = args.sign_exists || false;
  domainXml['doma:content']['doma:outputInformation']['doma:lowercase'] = args.lowercase || false;
  
  // Update valueInformation
  domainXml['doma:content']['doma:valueInformation']['doma:valueTableRef'] = args.value_table || '';
  
  // Build XML back
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    format: true
  });
  const xmlBody = builder.build({ 'doma:domain': domainXml });
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
    'Content-Type': 'application/vnd.sap.adt.domains.v2+xml; charset=utf-8',
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': generateRequestId(),
    'X-sap-adt-profiling': 'server-time'
  };
  
  console.log(`[DEBUG] PUT with lockHandle: ${lockHandle}, corrNr: ${args.transport_request}`);
  console.log(`[DEBUG] PUT headers:`, headers);
  
  const response = await makeAdtRequestWithTimeout(url, 'PUT', 'default', xmlBody, undefined, headers);
  
  console.log(`[DEBUG] PUT response status: ${response.status}`);
  
  return response;
}

/**
 * Step 2: Check domain syntax
 */
async function checkDomainSyntax(domainName: string, sessionId: string): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/checkruns`;
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
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  return makeAdtRequestWithSession(url, 'POST', sessionId);
}

/**
 * Step 4: Activate domain
 */
async function activateDomain(domainName: string, sessionId: string): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/activation?method=activate&preauditRequested=true`;
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
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?version=workingArea`;
  
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
    if (!args?.transport_request) {
      throw new McpError(ErrorCode.InvalidParams, 'Transport request is required');
    }

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
      
      // Step 2: Get domain details and lock handle (domain is already locked from POST)
      console.log(`[DEBUG] Step 2: Getting domain info with sessionId: ${sessionId}`);
      const domainInfo = await getDomainWithLockHandle(typedArgs.domain_name, sessionId);
      
      // If no lock handle from GET, need to explicitly LOCK
      if (!domainInfo.lockHandle) {
        console.log(`[DEBUG] Step 2.5: Acquiring lock handle with sessionId: ${sessionId}`);
        lockHandle = await acquireLockHandle(typedArgs, sessionId);
        
        // Wait a bit for SAP to process the lock
        console.log(`[DEBUG] Waiting 500ms for SAP to process lock...`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } else {
        lockHandle = domainInfo.lockHandle;
      }
      
      // Step 2.7: GET domain with version=inactive (Eclipse ADT workflow)
      console.log(`[DEBUG] Step 2.7: GET domain with version=inactive, sessionId: ${sessionId}`);
      await getDomainInactive(typedArgs.domain_name, sessionId, domainInfo.etag);
      
      // Wait a bit before PUT to ensure lock is fully established
      console.log(`[DEBUG] Waiting 500ms before PUT...`);
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Step 3: Update domain with full data (PUT with lock handle, using XML from GET)
      console.log(`[DEBUG] Step 3: PUT domain with sessionId: ${sessionId}, lockHandle: ${lockHandle}`);
      await lockAndCreateDomain(typedArgs, lockHandle, domainInfo.domainXml, sessionId, username);
      
      // Step 4: Check domain syntax
      await checkDomainSyntax(typedArgs.domain_name, sessionId);
      
      // Step 5: Unlock domain (important!)
      await unlockDomain(typedArgs.domain_name, lockHandle, sessionId);
      
      // Step 6: Activate domain
      await activateDomain(typedArgs.domain_name, sessionId);
      
      // Step 7: Verify creation
      const finalDomain = await getDomainForVerification(typedArgs.domain_name, sessionId);
      
      return return_response({
        data: JSON.stringify({
          success: true,
          domain_name: typedArgs.domain_name,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          status: 'active',
          session_id: sessionId,
          message: `Domain ${typedArgs.domain_name} created and activated successfully`,
          domain_details: finalDomain
        }, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });
      
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
