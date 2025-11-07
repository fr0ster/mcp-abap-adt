/**
 * CreateDomain Handler - ABAP Domain Creation via ADT API
 * 
 * CURRENT STATE (Simplified):
 * - Step 1: POST creates domain with all properties in one call
 * - Step 2: Activate domain
 * - Step 3: Verify activation
 * - SAP handles locking automatically on transport
 * - Domain created and activated successfully
 * 
 * DIFFERENCE FROM ECLIPSE:
 * - Eclipse: POST empty domain → GET → LOCK → PUT data → UNLOCK → Activate
 * - Our approach: POST with data → Activate (simpler, works!)
 * 
 * COMMENTED OUT (Full flow with manual LOCK/UNLOCK):
 * - The full implementation with explicit LOCK/UNLOCK is commented out
 * - Problem identified: LOCK and UNLOCK were using different SAP_SESSIONID
 *   (separate stateful connection created new session, breaking ENQUEUE)
 * - Need to fix: use SAME connection/session for entire LOCK → PUT → UNLOCK flow
 * - When fixed, uncomment the full flow code sections
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, getManagedConnection } from '../lib/utils';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import * as crypto from 'crypto';
import { createAbapConnection } from '../lib/connection/connectionFactory';
import type { AbapConnection } from '../lib/connection/AbapConnection';
import { getConfig } from '../index';

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
 * Make ADT request with session and request IDs (Eclipse pattern) - STATELESS
 * Uses sap-adt-connection-id and sap-adt-request-id for tracking
 * Used for read-only operations: validation, queries, syntax check
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
  
  // Create custom headers WITHOUT stateful type (stateless session)
  const requestId = generateRequestId();
  const headers: Record<string, string> = {
    'sap-adt-connection-id': sessionId,           // Session identifier
    'sap-adt-request-id': requestId,              // Request identifier
    'X-sap-adt-profiling': 'server-time',
    ...additionalHeaders
  };
  
  // Use makeAdtRequestWithTimeout with custom headers
  return makeAdtRequestWithTimeout(fullUrl, method, 'default', data, undefined, headers);
}

/**
 * Make ADT request with session and request IDs (Eclipse pattern) - STATEFUL
 * Uses sap-adt-connection-id, sap-adt-request-id, and X-sap-adt-sessiontype:stateful
 * Used ONLY for ENQUEUE operations: LOCK, PUT (with lockHandle), UNLOCK
 */
async function makeAdtRequestStateful(
  url: string,
  method: string,
  sessionId: string,
  data?: any,
  additionalHeaders?: Record<string, string>
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  
  // Create custom headers with stateful type for ENQUEUE operations
  const requestId = generateRequestId();
  const headers: Record<string, string> = {
    'sap-adt-connection-id': sessionId,           // Session identifier
    'sap-adt-request-id': requestId,              // Request identifier
    'X-sap-adt-sessiontype': 'stateful',          // CRITICAL: Required for LOCK/UNLOCK operations
    'X-sap-adt-profiling': 'server-time',
    ...additionalHeaders
  };
  
  // Use makeAdtRequestWithTimeout with custom headers
  return makeAdtRequestWithTimeout(fullUrl, method, 'default', data, undefined, headers);
}

// ========== COMMENTED OUT: Stateful connection (for manual LOCK/UNLOCK flow) ==========
/*
// Stateful connection instance (separate from main connection)
let statefulConnection: AbapConnection | undefined;

/**
 * Create separate stateful connection for ENQUEUE operations (Python pattern)
 * This connection will have its own SAP_SESSIONID, separate from main connection
 *\/
async function createStatefulConnection(): Promise<AbapConnection> {
  if (statefulConnection) {
    return statefulConnection;
  }
  
  console.log('[DEBUG] Creating separate stateful connection for LOCK/UNLOCK operations');
  
  // Get same config as main connection
  const config = getConfig();
  
  // Create new connection instance (will have its own axios instance and SAP_SESSIONID)
  statefulConnection = createAbapConnection(config);
  
  console.log('[DEBUG] Stateful connection created');
  
  return statefulConnection;
}

/**
 * Dispose stateful connection after use
 *\/
function disposeStatefulConnection() {
  if (statefulConnection) {
    console.log('[DEBUG] Disposing stateful connection');
    statefulConnection.reset();
    statefulConnection = undefined;
  }
}

/**
 * Make ADT request using SEPARATE stateful connection (Python pattern)
 * This connection has its own SAP_SESSIONID for ENQUEUE operations
 *\/
async function makeAdtRequestWithStatefulConnection(
  url: string,
  method: string,
  sessionId: string,
  data?: any,
  additionalHeaders?: Record<string, string>
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  
  // Get or create stateful connection
  const connection = await createStatefulConnection();
  
  // Create custom headers with stateful type for ENQUEUE operations
  const requestId = generateRequestId();
  const headers: Record<string, string> = {
    'sap-adt-connection-id': sessionId,           // Session identifier
    'sap-adt-request-id': requestId,              // Request identifier
    'X-sap-adt-sessiontype': 'stateful',          // CRITICAL: Required for LOCK/UNLOCK operations
    'X-sap-adt-profiling': 'server-time',
    ...additionalHeaders
  };
  
  // Use stateful connection for request
  return connection.makeAdtRequest({
    url: fullUrl,
    method: method,
    timeout: 30000, // default timeout
    data: data,
    headers: headers
  });
}
*/


/**
 * Step 0.0: Create domain with POST (SAP handles locking automatically)
 */
async function createEmptyDomain(
  args: DomainArgs,
  sessionId: string,
  username: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  
  // POST to /sap/bc/adt/ddic/domains (without domain name in URL)
  const url = `${baseUrl}/sap/bc/adt/ddic/domains?corrNr=${args.transport_request}`;
  
  // Build complete domain XML with all user parameters
  const description = args.description || args.domain_name;
  const datatype = args.datatype || 'CHAR';
  const length = args.length || 100;
  const decimals = args.decimals || 0;
  const lowercase = args.lowercase || false;
  const signExists = args.sign_exists || false;
  const conversionExit = args.conversion_exit || '';
  const valueTable = args.value_table || '';
  
  // Complete XML to create domain with all properties
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" 
             xmlns:adtcore="http://www.sap.com/adt/core" 
             adtcore:description="${description}" 
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
      <doma:style/>
      ${conversionExit ? `<doma:conversionExit>${conversionExit}</doma:conversionExit>` : '<doma:conversionExit/>'}
      <doma:signExists>${signExists}</doma:signExists>
      <doma:lowercase>${lowercase}</doma:lowercase>
      <doma:ampmFormat>false</doma:ampmFormat>
    </doma:outputInformation>
    <doma:valueInformation>
      ${valueTable ? `<doma:valueTableRef>${valueTable}</doma:valueTableRef>` : '<doma:valueTableRef/>'}
      <doma:appendExists>false</doma:appendExists>
      <doma:fixValues/>
    </doma:valueInformation>
  </doma:content>
</doma:domain>`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
    'Content-Type': 'application/vnd.sap.adt.domains.v2+xml'
  };
  
  console.log(`[DEBUG] createEmptyDomain - POST to create domain`);
  console.log(`[DEBUG] POST body:\n${xmlBody}`);
  
  // Use STATELESS for creating structure (SAP will handle lock automatically)
  const response = await makeAdtRequestStateless(url, 'POST', sessionId, xmlBody, headers); 
  console.log('[DEBUG] createEmptyDomain response status:', response.status);
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
    'X-sap-adt-profiling': 'server-time'
  };
  
  // Use STATELESS for GET query
  const response = await makeAdtRequestStateless(url, 'GET', sessionId, null, headers);
  
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

// ========== COMMENTED OUT: acquireLockHandle (for manual LOCK flow) ==========
/*
/**
 * Step 0: Acquire lock handle by attempting to lock the domain
 * This is required before creating a new domain
 *\/
async function acquireLockHandle(
  args: DomainArgs,
  sessionId: string
): Promise<string> {
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(args.domain_name.toLowerCase());
  
  // POST with _action=LOCK&accessMode=MODIFY to get the lock handle
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };
  
  try {
    // POST to lock the domain - uses STATEFUL session with SEPARATE connection (ENQUEUE operation)
    const response = await makeAdtRequestWithStatefulConnection(url, 'POST', sessionId, null, headers);
    
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
*/


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
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml'
  };
  
  // Add If-None-Match if we have ETag
  if (etag) {
    headers['If-None-Match'] = etag;
  }
  
  try {
    // Eclipse uses stateless session for GET version=inactive
    // Use STATELESS for GET query
    await makeAdtRequestStateless(url, 'GET', sessionId, undefined, headers);
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
    'X-sap-adt-profiling': 'server-time'
  };
  
  try {
    // Use STATELESS for GET query
    const response = await makeAdtRequestStateless(url, 'GET', sessionId, null, headers);
    
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

// ========== COMMENTED OUT: lockAndCreateDomain (for manual PUT with lockHandle) ==========
/*
/**
 * Step 1: Create domain with lock handle and ETag
 * Takes the domain XML from GET and updates only the content section
 *\/
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
  
  // Extract data for building XML
  const datatype = args.datatype || 'CHAR';
  const length = args.length || 100;
  const decimals = args.decimals || 0;
  const lowercase = args.lowercase || false;
  const signExists = args.sign_exists || false;
  const conversionExit = args.conversion_exit || '';
  const valueTable = args.value_table || '';
  
  // Extract metadata from parsed domain
  const domainName = domainXml['adtcore:name'];
  const description = domainXml['adtcore:description'] || args.description || args.domain_name;
  const packageName = domainXml['adtcore:packageRef']['adtcore:name'];
  const packageUri = domainXml['adtcore:packageRef']['adtcore:uri'];
  const packageDesc = domainXml['adtcore:packageRef']['adtcore:description'];
  const responsible = domainXml['adtcore:responsible'];
  const masterLanguage = domainXml['adtcore:masterLanguage'];
  const masterSystem = domainXml['adtcore:masterSystem'];
  const createdAt = domainXml['adtcore:createdAt'];
  const createdBy = domainXml['adtcore:createdBy'];
  const changedAt = domainXml['adtcore:changedAt'];
  const changedBy = domainXml['adtcore:changedBy'];
  
  // Build complete XML manually to ensure all empty tags are self-closing
  // Only fill tags if user provided non-empty values
  const xmlBody = `<?xml version="1.0" encoding="UTF-8"?>
<doma:domain xmlns:doma="http://www.sap.com/dictionary/domain" 
             xmlns:adtcore="http://www.sap.com/adt/core" 
             xmlns:atom="http://www.w3.org/2005/Atom" 
             adtcore:changedAt="${changedAt}" 
             adtcore:changedBy="${changedBy}" 
             adtcore:createdAt="${createdAt}" 
             adtcore:createdBy="${createdBy}" 
             adtcore:description="${description}" 
             adtcore:language="EN" 
             adtcore:name="${domainName}" 
             adtcore:type="DOMA/DD" 
             adtcore:version="new" 
             adtcore:abapLanguageVersion="standard" 
             adtcore:masterLanguage="${masterLanguage}" 
             adtcore:masterSystem="${masterSystem}" 
             adtcore:responsible="${responsible}">
  <atom:link href="versions" rel="http://www.sap.com/adt/relations/versions" title="Historic versions"/>
  <atom:link href="/sap/bc/adt/repository/informationsystem/abaplanguageversions?uri=%2Fsap%2Fbc%2Fadt%2Fddic%2Fdomains%2F${domainNameEncoded}" rel="http://www.sap.com/adt/relations/informationsystem/abaplanguageversions" title="Allowed ABAP language versions" type="application/vnd.sap.adt.nameditems.v1+xml"/>
  <atom:link href="/sap/bc/adt/vit/wb/object_type/domadd/object_name/${domainName}" rel="self" title="Representation in SAP Gui" type="application/vnd.sap.sapgui"/>
  <atom:link href="/sap/bc/adt/vit/docu/object_type/do/object_name/${domainNameEncoded}?masterLanguage=E&amp;mode=edit" rel="http://www.sap.com/adt/relations/documentation" title="Documentation" type="application/vnd.sap.sapgui"/>
  <adtcore:packageRef adtcore:description="${packageDesc}" adtcore:name="${packageName}" adtcore:type="DEVC/K" adtcore:uri="${packageUri}"/>
  <doma:content>
    <doma:typeInformation>
      <doma:datatype>${datatype}</doma:datatype>
      <doma:length>${length}</doma:length>
      <doma:decimals>${decimals}</doma:decimals>
    </doma:typeInformation>
    <doma:outputInformation>
      <doma:length>${length}</doma:length>
      <doma:style/>
      ${conversionExit ? `<doma:conversionExit>${conversionExit}</doma:conversionExit>` : '<doma:conversionExit/>'}
      <doma:signExists>${signExists}</doma:signExists>
      <doma:lowercase>${lowercase}</doma:lowercase>
      <doma:ampmFormat>false</doma:ampmFormat>
    </doma:outputInformation>
    <doma:valueInformation>
      ${valueTable ? `<doma:valueTableRef>${valueTable}</doma:valueTableRef>` : '<doma:valueTableRef/>'}
      <doma:appendExists>false</doma:appendExists>
      <doma:fixValues/>
    </doma:valueInformation>
  </doma:content>
</doma:domain>`;
  
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
    'Content-Type': 'application/vnd.sap.adt.domains.v2+xml; charset=utf-8'
  };
  
  console.log(`[DEBUG] PUT with lockHandle: ${lockHandle}, corrNr: ${args.transport_request}`);
  console.log(`[DEBUG] PUT headers:`, headers);
  console.log(`[DEBUG] PUT FULL BODY:\n${xmlBody}\n[END OF BODY]`);
  
  // PUT uses STATEFUL session with SEPARATE connection (ENQUEUE operation with lockHandle)
  const response = await makeAdtRequestWithStatefulConnection(url, 'PUT', sessionId, xmlBody, headers);
  
  console.log(`[DEBUG] PUT response status: ${response.status}`);
  
  return response;
}
*/


/**
 * Step 2: Check domain syntax with polling
 * Repeatedly checks until status is "processed" or timeout is reached
 */
async function checkDomainSyntax(
  domainName: string, 
  sessionId: string,
  maxAttempts: number = 10,
  pollIntervalMs: number = 500
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/checkruns`;
  const xmlBody = buildCheckRunXml(domainName);
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.checkmessages+xml',
    'Content-Type': 'application/vnd.sap.adt.checkobjects+xml'
  };
  
  console.log(`[DEBUG] checkDomainSyntax - starting polling loop (max ${maxAttempts} attempts, ${pollIntervalMs}ms interval)`);
  
  let lastResponse: AxiosResponse | null = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[DEBUG] checkDomainSyntax - attempt ${attempt}/${maxAttempts}`);
    
    // Use STATELESS for syntax check (Python pattern)
    const response = await makeAdtRequestStateless(url, 'POST', sessionId, xmlBody, headers);
    lastResponse = response;
    
    console.log(`[DEBUG] checkDomainSyntax - response status: ${response.status}`);
    
    const checkResult = parseCheckRunResponse(response);
    console.log(`[DEBUG] checkDomainSyntax - parsed result:`, checkResult);
    
    // Check if processing is complete
    if (checkResult.success && checkResult.message.includes('has been checked')) {
      console.log(`[DEBUG] checkDomainSyntax - check completed successfully after ${attempt} attempts`);
      return response;
    }
    
    // If there are errors (not just "still processing"), throw immediately
    if (!checkResult.success && !checkResult.message.includes('processing')) {
      throw new McpError(ErrorCode.InternalError, `Domain check failed: ${checkResult.message}`);
    }
    
    // Still processing, wait before next attempt
    if (attempt < maxAttempts) {
      console.log(`[DEBUG] checkDomainSyntax - still processing, waiting ${pollIntervalMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }
  
  // If we get here, we ran out of attempts
  throw new McpError(
    ErrorCode.InternalError, 
    `Domain check timed out after ${maxAttempts} attempts. Last status: ${lastResponse ? JSON.stringify(parseCheckRunResponse(lastResponse)) : 'unknown'}`
  );
}

// ========== COMMENTED OUT: unlockDomain (for manual UNLOCK flow) ==========
/*
/**
 * Step 3: Unlock domain
 * Uses stateful session to maintain consistency with lock operation
 *\/
async function unlockDomain(
  domainName: string, 
  lockHandle: string, 
  sessionId: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const domainNameEncoded = encodeSapObjectName(domainName.toLowerCase());
  const url = `${baseUrl}/sap/bc/adt/ddic/domains/${domainNameEncoded}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  console.log(`[DEBUG] Unlocking domain ${domainName} with lockHandle: ${lockHandle}`);
  console.log(`[DEBUG] UNLOCK with STATEFUL session using SEPARATE connection (ENQUEUE operation)`);
  
  // UNLOCK uses STATEFUL session with SEPARATE connection (ENQUEUE operation)
  const response = await makeAdtRequestWithStatefulConnection(url, 'POST', sessionId);
  console.log(`[DEBUG] Unlock response: ${response.status}, ${response.statusText}`);
  console.log(`[DEBUG] Unlock response headers:`, response.headers);
  console.log(`[DEBUG] Unlock response body:`, response.data);
  
  return response;
}
*/


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
  
  // Use STATELESS for activation (Python pattern - no ENQUEUE lock needed)
  const response = await makeAdtRequestStateless(url, 'POST', sessionId, xmlBody, headers);
  
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
    'Accept': 'application/vnd.sap.adt.domains.v1+xml, application/vnd.sap.adt.domains.v2+xml',
  };
  
  // Use STATELESS for GET query (Python pattern)
  const response = await makeAdtRequestStateless(url, 'GET', sessionId, null, headers);
  
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

    console.log(`[DEBUG] Session ID for all requests: ${sessionId}`);
    
    // ========== SIMPLIFIED VERSION: POST create + Activate ==========
    // Step 1: Create domain with POST (SAP will handle locking automatically)
    console.log(`[DEBUG] Step 1: Creating domain with POST`);
    await createEmptyDomain(typedArgs, sessionId, username);
    
    console.log(`[DEBUG] Domain ${typedArgs.domain_name} created successfully (inactive state)`);
    
    // Step 2: Activate domain
    console.log(`[DEBUG] Step 2: Activating domain`);
    await activateDomain(typedArgs.domain_name, sessionId);
    
    console.log(`[DEBUG] Domain ${typedArgs.domain_name} activated successfully`);
    
    // Step 3: Verify activation
    console.log(`[DEBUG] Step 3: Verifying domain activation`);
    const finalDomain = await getDomainForVerification(typedArgs.domain_name, sessionId);
    
    return return_response({
      data: JSON.stringify({
        success: true,
        domain_name: typedArgs.domain_name,
        package: typedArgs.package_name,
        transport_request: typedArgs.transport_request,
        status: 'active',
        version: finalDomain['adtcore:version'] || 'unknown',
        session_id: sessionId,
        message: `Domain ${typedArgs.domain_name} created and activated successfully`,
        domain_details: {
          datatype: finalDomain['doma:content']?.['doma:typeInformation']?.['doma:datatype'],
          length: finalDomain['doma:content']?.['doma:typeInformation']?.['doma:length'],
          decimals: finalDomain['doma:content']?.['doma:typeInformation']?.['doma:decimals']
        }
      }, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });
    
    // ========== COMMENTED OUT: Full flow with manual LOCK/UNLOCK (will restore later) ==========
    /*
    let lockHandle = '';

    try {
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
      } else {
        lockHandle = domainInfo.lockHandle;
      }
      
      // Step 2.7: GET domain with version=inactive (Eclipse ADT workflow)
      console.log(`[DEBUG] Step 2.7: GET domain with version=inactive, sessionId: ${sessionId}`);
      await getDomainInactive(typedArgs.domain_name, sessionId, domainInfo.etag);
      
      // Step 3: Update domain with full data (PUT with lock handle, using XML from GET)
      console.log(`[DEBUG] Step 3: PUT domain with sessionId: ${sessionId}, lockHandle: ${lockHandle}`);
      await lockAndCreateDomain(typedArgs, lockHandle, domainInfo.domainXml, sessionId, username);
      
      // Step 3.5: Syntax check (Eclipse does this before unlock)
      console.log(`[DEBUG] Step 3.5: Checking domain syntax`);
      await checkDomainSyntax(typedArgs.domain_name, sessionId);
      
      // Step 4: Unlock domain
      console.log(`[DEBUG] Step 4: Unlocking domain`);
      await unlockDomain(typedArgs.domain_name, lockHandle, sessionId);
      
      // Step 5: Activate domain
      console.log(`[DEBUG] Step 5: Activating domain`);
      await activateDomain(typedArgs.domain_name, sessionId);
      
      // Step 6: Verify creation
      console.log(`[DEBUG] Step 6: Verifying domain creation`);
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
      // CRITICAL: Try to unlock if we have a lock handle (use same sessionId!)
      if (lockHandle) {
        try {
          console.log(`[DEBUG] Error occurred, attempting to unlock domain with lockHandle: ${lockHandle}`);
          await unlockDomain(typedArgs.domain_name, lockHandle, sessionId);
          console.log(`[DEBUG] Successfully unlocked domain after error`);
        } catch (unlockError: any) {
          // Log but don't fail on unlock error
          console.error('[ERROR] Failed to unlock domain after error:', unlockError.message || unlockError);
          console.error('[ERROR] You may need to manually unlock using SM12 transaction');
        }
      }
      throw error;
    } finally {
      // Cleanup: Dispose stateful connection after all ENQUEUE operations complete
      disposeStatefulConnection();
    }
    */
    
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
