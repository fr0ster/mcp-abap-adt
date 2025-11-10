/**
 * CreateTable Handler - ABAP Table Creation via ADT API
 * 
 * APPROACH:
 * - Similar to CreateDomain pattern: POST with full XML body for table creation
 * - Table-specific XML structure with ddic:table namespace
 * - Support for table fields, key fields, technical settings
 * - Create → Activate → Verify workflow
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getBaseUrl } from '../lib/utils';
import { makeAdtRequestWithTimeout } from '../lib/utils';
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { activateObjectInSession } from '../lib/activationUtils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

function buildCheckRunPayload(tableName: string): string {
  const uriName = encodeSapObjectName(tableName).toLowerCase();
  return `<?xml version="1.0" encoding="UTF-8"?><chkrun:checkObjectList xmlns:chkrun="http://www.sap.com/adt/checkrun" xmlns:adtcore="http://www.sap.com/adt/core">
    <chkrun:checkObject adtcore:uri="/sap/bc/adt/ddic/tables/${uriName}" chkrun:version="new"/>
  </chkrun:checkObjectList>`;
}

async function runCheckRun(
  reporter: 'tableStatusCheck' | 'abapCheckRun',
  tableName: string,
  sessionId: string
): Promise<AxiosResponse> {
  const payload = buildCheckRunPayload(tableName);
  const headers = {
    'Accept': 'application/vnd.sap.adt.checkmessages+xml',
    'Content-Type': 'application/vnd.sap.adt.checkobjects+xml'
  };
  const url = `/sap/bc/adt/checkruns?reporters=${reporter}`;
  console.log(`[DEBUG] Running check-run ${reporter} for ${tableName}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, payload, headers);
}

async function deleteTableLock(tableName: string): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/ddic/ddlock/locks?lockAction=DELETE&name=${encodeSapObjectName(tableName)}`;
  console.log('[DEBUG] Attempting lock cleanup for table:', tableName);
  return makeAdtRequestWithTimeout(url, 'POST', 'default', '');
}

export const TOOL_DEFINITION = {
  name: "CreateTable",
  description: "Create a new ABAP table via the ADT API using provided DDL. Mirrors Eclipse ADT behaviour with status/check runs, lock handling, activation and verification.",
  inputSchema: {
    type: "object",
    properties: {
      table_name: { 
        type: "string", 
        description: "Table name (e.g., ZZ_TEST_TABLE_001). Must follow SAP naming conventions." 
      },
      ddl_code: {
        type: "string",
        description: "Complete DDL code for table creation. Example: '@EndUserText.label : \\'My Table\\' @AbapCatalog.tableCategory : #TRANSPARENT define table ztst_table { key client : abap.clnt not null; key id : abap.char(10); name : abap.char(255); }'"
      },
      package_name: { 
        type: "string", 
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      }
    },
    required: ["table_name", "ddl_code", "package_name"]
  }
} as const;

interface CreateTableArgs {
  table_name: string;
  ddl_code: string;
  package_name: string;
  transport_request?: string;
}

/**
 * Extract lockHandle from HTTP response headers
 */
function extractLockHandle(response: AxiosResponse): string | null {
  const lockHandle = response.headers['sap-adt-lockhandle'] || 
                     response.headers['lockhandle'] ||
                     response.headers['x-sap-adt-lockhandle'];
  return lockHandle || null;
}

/**
 * Get table details and extract lockHandle
 * After creating table, we need to GET it to obtain the lock handle
 */
async function getTableWithLockHandle(tableName: string): Promise<{ lockHandle: string; etag: string }> {
  const url = `${await getBaseUrl()}/sap/bc/adt/ddic/tables/${encodeSapObjectName(tableName)}`;
  
  const headers = {
    'Accept': 'application/vnd.sap.adt.tables.v1+xml, application/vnd.sap.adt.tables.v2+xml'
  };
  
  const response = await makeAdtRequestWithTimeout(url, 'GET', 'default', undefined, undefined, headers);
  
  const lockHandle = response.headers['sap-adt-lockhandle'] || 
                     response.headers['lockhandle'] ||
                     response.headers['x-sap-adt-lockhandle'];
  
  const etag = response.headers['etag'] || '';
  
  console.log('[DEBUG] getTableWithLockHandle - headers:', response.headers);
  console.log(`[DEBUG] lockHandle: "${lockHandle}", etag: "${etag}"`);
  
  if (!lockHandle) {
    throw new Error(`No lockHandle found in response headers. Available headers: ${Object.keys(response.headers).join(', ')}`);
  }
  
  return { lockHandle: lockHandle || '', etag };
}

/**
 * Acquire lock handle for the table by locking it for modification
 */
async function acquireTableLockHandle(tableName: string, sessionId: string): Promise<string> {
  const url = `/sap/bc/adt/ddic/tables/${encodeSapObjectName(tableName)}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };
  
  try {
    const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
    
    // Parse XML response to extract LOCK_HANDLE
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
    });
    
    const result = parser.parse(response.data);
    const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
    
    console.log('[DEBUG] acquireTableLockHandle - parsed result:', JSON.stringify(result, null, 2));
    console.log(`[DEBUG] acquireTableLockHandle - extracted lockHandle: "${lockHandle}"`);
    
    if (!lockHandle) {
      throw new Error('Failed to obtain lock handle from SAP response');
    }
    
    return lockHandle;
  } catch (error: any) {
    const errorDetails = error.response?.data ? `\nResponse: ${error.response.data}` : '';
    throw new Error(`Failed to acquire table lock handle: ${error.message}${errorDetails}`);
  }
}

/**
 * Unlock the table after DDL content is added
 */
async function unlockTable(tableName: string, lockHandle: string, sessionId?: string) {
  const url = `/sap/bc/adt/ddic/tables/${encodeSapObjectName(tableName)}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  console.log('[DEBUG] Unlocking table:', tableName);
  console.log('[DEBUG] Unlock URL:', url);
  console.log('[DEBUG] LockHandle:', lockHandle);

  // Eclipse ADT approach: simple POST without stateful session, CSRF, or Content-Type
  try {
    console.log('[DEBUG] ADT-style unlock: simple POST...');
    
    const baseUrl = await getBaseUrl();
    const fullUrl = `${baseUrl}${url}`;
    
    // Minimal headers like Eclipse ADT - no CSRF, no session, no Content-Type
    const headers: Record<string, string> = {
      'User-Agent': 'mcp-abap-adt/1.1.0',
      'X-sap-adt-profiling': 'server-time'
    };
    
    // Use makeAdtRequestWithTimeout with 'default' profile 
    const response = await makeAdtRequestWithTimeout(fullUrl, 'POST', 'default', headers, '');

    console.log('[DEBUG] ADT unlock - response status:', response.status);
    console.log('[DEBUG] ADT unlock - response data:', response.data || '(empty)');
    
    if (response.status === 200 || response.status === 204) {
      console.log('[DEBUG] Successfully unlocked with ADT approach');
      return response;
    } else {
      throw new Error(`Unlock failed with status ${response.status}`);
    }
  } catch (error: any) {
    console.log('[DEBUG] ADT unlock failed:', error.message);
    throw error;
  }
}

/**
 * Validate and return the DDL code as-is
 */
function getTableDDL(args: CreateTableArgs): string {
  // Simply return the provided DDL code
  // User is responsible for providing valid DDL
  return args.ddl_code;
}

/**
 * Parse XML response to extract table creation information
 */
function parseTableCreationResponse(xml: string) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    trimValues: true
  });
  
  try {
    const result = parser.parse(xml);
    
    // Check for error messages
    if (result.error || result['asx:abap']?.['asx:values']?.ERROR) {
      const errorMsg = result.error?.message || 
        result['asx:abap']?.['asx:values']?.ERROR?.MESSAGE || 
        'Unknown error during table creation';
      throw new Error(errorMsg);
    }
    
    // Look for successful creation indicators
    if (result['ddic:table']) {
      const table = result['ddic:table'];
      return {
        name: table['adtcore:name'],
        description: table['adtcore:description'],
        package: table['adtcore:packageRef']?.['adtcore:name'],
        status: 'created',
        objectType: 'table'
      };
    }
    
    // Fallback: return raw response
    return { raw: result, status: 'created' };
    
  } catch (parseError) {
    // If parsing fails, return raw XML
    return { 
      raw_xml: xml, 
      status: 'created',
      note: 'XML parsing failed, but table creation might have succeeded'
    };
  }
}

/**
 * Activate the table after creation
 */
async function activateTable(tableName: string, sessionId: string): Promise<AxiosResponse> {
  const objectUri = `/sap/bc/adt/ddic/tables/${encodeSapObjectName(tableName)}`;
  
  console.log('[DEBUG] Activating table:', tableName);
  console.log('[DEBUG] Session ID for activation:', sessionId);

  const response = await activateObjectInSession(objectUri, tableName, sessionId, true);

  console.log('[DEBUG] Activation response status:', response.status);
  console.log('[DEBUG] Activation response data:', response.data);
  return response;
}

/**
 * Verify table exists and get its details
 */
async function verifyTableCreation(tableName: string) {
  const url = `${await getBaseUrl()}/sap/bc/adt/ddic/tables/${encodeSapObjectName(tableName)}/source/main`;
  const response = await makeAdtRequestWithTimeout(url, 'GET', 'default');
  return response;
}

export async function handleCreateTable(args: any): Promise<any> {
  try {
    console.log('[DEBUG] handleCreateTable called with args type:', typeof args);
    console.log('[DEBUG] handleCreateTable args keys:', Object.keys(args));
    // Try to serialize each field separately to find the problematic one
    for (const [key, value] of Object.entries(args)) {
      try {
        JSON.stringify(value);
        console.log('[DEBUG] Field', key, 'serializes OK');
      } catch (e) {
        console.log('[ERROR] Field', key, 'fails to serialize:', e);
      }
    }
    console.log('[DEBUG] handleCreateTable called with args:', JSON.stringify(args, null, 2));
    const createTableArgs = args as CreateTableArgs;
    
    // Validate required parameters
    if (!createTableArgs?.table_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
    }
    if (!createTableArgs?.ddl_code) {
      throw new McpError(ErrorCode.InvalidParams, 'DDL code is required');
    }
    if (!createTableArgs?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    
    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(createTableArgs.package_name, createTableArgs.transport_request);

    const results: any[] = [];
    
    // Generate session ID for stateful operations
    const sessionId = generateSessionId();
    console.log('[DEBUG] Generated session ID:', sessionId);
    console.log('[DEBUG] Starting table creation process...');
    
    // Step 1: Create table
    try {
      console.log('[DEBUG] Step 1: Creating empty table (like domains)...');
      
      // First, create empty table with POST to /ddic/tables (without name in URL)
      const baseUrl = await getBaseUrl();
      const createUrl = `${baseUrl}/sap/bc/adt/ddic/tables?corrNr=${createTableArgs.transport_request}`;
      console.log('[DEBUG] Create URL:', createUrl);
      
      // Correct blueSource XML to create table (based on your example)
      const tableXml = `<?xml version="1.0" encoding="UTF-8"?><blue:blueSource xmlns:blue="http://www.sap.com/wbobj/blue" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${createTableArgs.table_name}" adtcore:language="EN" adtcore:name="${createTableArgs.table_name.toUpperCase()}" adtcore:type="TABL/DT" adtcore:masterLanguage="EN" adtcore:masterSystem="${process.env.SAP_SYSTEM || 'DEV'}" adtcore:responsible="${process.env.SAP_USER || 'DEVELOPER'}">
    
  <adtcore:packageRef adtcore:name="${createTableArgs.package_name.toUpperCase()}"/>
  
</blue:blueSource>`;
      console.log('[DEBUG] Table XML length:', tableXml.length);
      
      const headers = {
        'Accept': 'application/vnd.sap.adt.blues.v1+xml, application/vnd.sap.adt.tables.v2+xml',
        'Content-Type': 'application/vnd.sap.adt.tables.v2+xml'
      };
      
      results.push({
        step: 'create_empty_table',
        action: 'POST ' + createUrl,
        xml_payload: tableXml
      });

      const createResponse = await makeAdtRequestWithSession(`/sap/bc/adt/ddic/tables?corrNr=${createTableArgs.transport_request}`, 'POST', sessionId, tableXml, headers);
      console.log('[DEBUG] Empty table creation successful');
      
      results.push({
        step: 'create_empty_table',
        status: 'success',
        result: {
          name: createTableArgs.table_name,
          status: 'empty_created',
          objectType: 'table'
        }
      });

      // Step 1.1: Mirror Eclipse ADT by running table status check before locking
      try {
        results.push({
          step: 'check_table_status',
          action: 'POST /sap/bc/adt/checkruns?reporters=tableStatusCheck'
        });
        const statusCheckResponse = await runCheckRun('tableStatusCheck', createTableArgs.table_name, sessionId);
        results.push({
          step: 'check_table_status',
          status: 'success',
          http_status: statusCheckResponse.status
        });
      } catch (statusError) {
        console.log('[DEBUG] tableStatusCheck failed:', statusError);
        results.push({
          step: 'check_table_status',
          status: 'warning',
          error: statusError instanceof Error ? statusError.message : String(statusError),
          note: 'Table status check failed; proceeding but unlock/activation may fail'
        });
      }
      
      // Step 1.2: Get lockHandle for the created table
      console.log('[DEBUG] Step 1.2: Getting lockHandle for table...');
      const lockHandle = await acquireTableLockHandle(createTableArgs.table_name, sessionId);
      console.log('[DEBUG] Got lockHandle:', lockHandle);
      
      // Step 1.3: Now add DDL content to the table with lockHandle
      console.log('[DEBUG] Step 1.3: Adding DDL content with lockHandle...');
      
      const ddlUrl = `${baseUrl}/sap/bc/adt/ddic/tables/${encodeSapObjectName(createTableArgs.table_name)}/source/main?lockHandle=${lockHandle}&corrNr=${createTableArgs.transport_request}`;
      console.log('[DEBUG] DDL URL:', ddlUrl);
      
      const tableDDL = getTableDDL(createTableArgs);
      console.log('[DEBUG] Table DDL length:', tableDDL.length);
      
      const ddlHeaders = {
        'Accept': 'application/xml, application/json, text/plain, */*',
        'Content-Type': 'text/plain; charset=utf-8'
      };

      results.push({
        step: 'add_ddl_content',
        action: 'PUT ' + ddlUrl,
        ddl_payload: tableDDL,
        lockHandle: lockHandle
      });

      const ddlResponse = await makeAdtRequestWithSession(`/sap/bc/adt/ddic/tables/${encodeSapObjectName(createTableArgs.table_name)}/source/main?lockHandle=${lockHandle}&corrNr=${createTableArgs.transport_request}`, 'PUT', sessionId, tableDDL, ddlHeaders);
      console.log('[DEBUG] DDL content added successfully');

      console.log('[DEBUG] HTTP response received successfully');
      console.log('[DEBUG] HTTP response status:', ddlResponse.status);
      console.log('[DEBUG] HTTP response data type:', typeof ddlResponse.data);
      console.log('[DEBUG] HTTP response data length:', ddlResponse.data?.length);

      console.log('[DEBUG] About to parse response...');
      const createResult = parseTableCreationResponse(ddlResponse.data);
      console.log('[DEBUG] Parsed result:', createResult);
      console.log('[DEBUG] About to push to results...');
      results.push({
        step: 'add_ddl_content',
        status: 'success',
        result: {
          name: createResult?.name || createTableArgs.table_name,
          status: createResult?.status || 'created',
          description: createResult?.description || '',
          objectType: createResult?.objectType || 'table'
        }
      });

      // Step 1.3.1: Run ABAP check before unlock (same as Eclipse ADT)
      try {
        results.push({
          step: 'abap_check_run',
          action: 'POST /sap/bc/adt/checkruns?reporters=abapCheckRun'
        });
        const abapCheckResponse = await runCheckRun('abapCheckRun', createTableArgs.table_name, sessionId);
        results.push({
          step: 'abap_check_run',
          status: 'success',
          http_status: abapCheckResponse.status
        });
      } catch (checkError) {
        console.log('[DEBUG] abapCheckRun failed:', checkError);
        results.push({
          step: 'abap_check_run',
          status: 'warning',
          error: checkError instanceof Error ? checkError.message : String(checkError),
          note: 'ABAP check run failed; unlock/activation may fail'
        });
      }

      // Step 1.4: Unlock the table after DDL content is added
      console.log('[DEBUG] Step 1.4: Unlocking table after DDL content addition...');
      results.push({
        step: 'unlock_table',
        action: 'Unlocking table ' + createTableArgs.table_name + ' with lockHandle ' + lockHandle
      });

      try {
        const unlockResponse = await unlockTable(createTableArgs.table_name, lockHandle, sessionId);
        results.push({
          step: 'unlock_table',
          status: 'success',
          http_status: unlockResponse.status
        });
        console.log('[DEBUG] Table unlocked successfully');
      } catch (unlockError) {
        console.log('[DEBUG] Unlock error:', unlockError);
        results.push({
          step: 'unlock_table',
          status: 'error',
          error: unlockError instanceof Error ? unlockError.message : String(unlockError)
        });

        // Attempt to cleanup locks to avoid leaving object stuck
        try {
          const cleanupResponse = await deleteTableLock(createTableArgs.table_name);
          results.push({
            step: 'cleanup_lock',
            status: 'success',
            http_status: cleanupResponse.status,
            note: 'Lock cleanup executed after unlock failure'
          });
        } catch (cleanupError) {
          console.log('[DEBUG] Lock cleanup failed:', cleanupError);
          results.push({
            step: 'cleanup_lock',
            status: 'error',
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
            note: 'Manual cleanup (SE11 → Utilities → Locks) may be required'
          });
        }
        // Continue to activation even if unlock fails
      }

    } catch (createError) {
      results.push({
        step: 'create_table',
        status: 'error',
        error: createError instanceof Error ? createError.message : String(createError)
      });
      throw createError;
    }

    // Step 2: Activate table (optional - table may auto-activate after unlock)
    try {
      results.push({
        step: 'activate_table',
        action: 'Activating table ' + createTableArgs.table_name
      });

    let activateResponse;
    let activationAttempt = 0;
    const maxActivationAttempts = 2;

      while (activationAttempt < maxActivationAttempts) {
        activationAttempt++;
        
        try {
          console.log(`[DEBUG] Activation attempt ${activationAttempt}/${maxActivationAttempts}`);
          activateResponse = await activateTable(createTableArgs.table_name, sessionId);
          
          // If successful, break the loop
          console.log(`[DEBUG] Activation attempt ${activationAttempt} successful`);
          break;
          
        } catch (attemptError: any) {
          console.log(`[DEBUG] Activation attempt ${activationAttempt} failed:`, attemptError.message);
          
          // If this is the last attempt, don't rethrow - table may be auto-activated
          if (activationAttempt >= maxActivationAttempts) {
            console.log('[DEBUG] Activation via ADT API failed, but table may be auto-activated after unlock');
            results.push({
              step: 'activate_table',
              status: 'warning',
              error: 'ADT activation failed - table may be auto-activated',
              note: 'Table auto-activation after unlock is normal behavior'
            });
            break;
          }
          
          // If it's a "No active nametab" error, it's expected - table may be auto-active
          if (attemptError.response?.data?.includes('No active nametab')) {
            console.log('[DEBUG] Nametab issue detected - re-running ABAP check before retrying activation');
            try {
              await runCheckRun('abapCheckRun', createTableArgs.table_name, sessionId);
            } catch (retryCheckError) {
              console.log('[DEBUG] Retry abapCheckRun failed:', retryCheckError);
            }
            continue;
          } else {
            throw attemptError;
          }
        }
      }

      if (activateResponse) {
        results.push({
          step: 'activate_table',
          status: 'success',
          http_status: activateResponse.status,
          attempts: activationAttempt
        });
      }

    } catch (activateError) {
      console.log('[ERROR] Activation error:', activateError);
      results.push({
        step: 'activate_table',
        status: 'error',
        error: activateError instanceof Error ? activateError.message : String(activateError)
      });
      // Continue to verification even if activation fails
    }

    // Step 3: Verify table creation
    try {
      results.push({
        step: 'verify_table',
        action: 'Getting table details to verify creation'
      });

      const verifyResponse = await verifyTableCreation(createTableArgs.table_name);
      
      if (typeof verifyResponse.data === 'string' && verifyResponse.data.trim().startsWith('<?xml')) {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '',
          parseAttributeValue: true,
          trimValues: true
        });
        const verifyResult = parser.parse(verifyResponse.data);
        
        results.push({
          step: 'verify_table',
          status: 'success',
          table_details: {
            name: verifyResult?.['ddic:table']?.['adtcore:name'] || createTableArgs.table_name,
            status: 'verified',
            objectType: 'table'
          }
        });
      } else {
        results.push({
          step: 'verify_table',
          status: 'success',
          raw_response: verifyResponse.data
        });
      }

    } catch (verifyError) {
      results.push({
        step: 'verify_table',
        status: 'error',
        error: verifyError instanceof Error ? verifyError.message : String(verifyError)
      });
    }

    // Summary with debug logging
    const successSteps = results.filter(r => r.status === 'success').length;
    console.log('[DEBUG] Creating summary, successSteps:', successSteps);
    console.log('[DEBUG] Results length:', results.length);
    console.log('[DEBUG] Results structure:', results.map(r => ({ step: r.step, status: r.status, hasResponse: !!r.response })));
    
    const uniqueSteps = Array.from(new Set(results.map(r => r.step)));
    const summary = {
      table_name: createTableArgs.table_name,
      package: createTableArgs.package_name, // Fixed: was package_name
      total_steps: uniqueSteps.length,
      successful_steps: successSteps,
      overall_status: successSteps >= 3 ? 'success' : 'partial_success',
      steps: results.map(step => ({
        step: step.step,
        action: step.action,
        status: step.status,
        error: step.error,
        result: step.result,
        table_details: step.table_details,
        // Remove response objects to avoid circular references
        note: step.response ? 'Response data available but not serialized' : undefined
      }))
    };

    // Safe JSON serialization with detailed debugging
    let serializedSummary;
    try {
      console.log('[DEBUG] Summary object keys:', Object.keys(summary));
      console.log('[DEBUG] Summary steps keys:', summary.steps.map(s => Object.keys(s)));
      serializedSummary = JSON.stringify(summary, null, 2);
      console.log('[DEBUG] JSON serialization successful');
    } catch (jsonError) {
      console.log('[ERROR] JSON serialization failed:', jsonError);
      console.log('[ERROR] Summary object:', summary);
      serializedSummary = JSON.stringify({
        error: 'Failed to serialize table creation summary',
        table_name: createTableArgs.table_name,
        message: jsonError instanceof Error ? jsonError.message : String(jsonError),
        debug_info: {
          error_details: jsonError,
          steps_count: results.length,
          summary_keys: Object.keys(summary)
        }
      }, null, 2);
    }

    return {
      isError: false,
      content: [{
        type: "text",
        text: serializedSummary
      }]
    };

  } catch (error) {
    console.log('[ERROR] Main catch block:', error);
    console.log('[ERROR] Error type:', typeof error);
    console.log('[ERROR] Error constructor:', error?.constructor?.name);
    if (error instanceof Error) {
      console.log('[ERROR] Error message:', error.message);
      console.log('[ERROR] Error stack:', error.stack);
    }
    return {
      isError: true,
      content: [{
        type: "text",
        text: `CreateTable failed: ${error instanceof Error ? error.message : String(error)}`
      }]
    };
  }
}