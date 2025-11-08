/**
 * UpdateViewSource Handler - Update Existing CDS/Classic View DDL Source
 * 
 * Eclipse ADT workflow (stateful session required):
 * 1. POST /sap/bc/adt/ddic/ddl/sources/{name}?_action=LOCK - Lock view
 * 2. PUT /sap/bc/adt/ddic/ddl/sources/{name}/source/main - Upload new DDL source
 * 3. POST /sap/bc/adt/ddic/ddl/sources/{name}?_action=UNLOCK - Unlock view
 * 4. POST /sap/bc/adt/activation - Activate view (optional)
 * 
 * CRITICAL REQUIREMENTS:
 * - Stateful session: sap-adt-connection-id must be same for LOCK/PUT/UNLOCK
 * - Cookie management: automatic via BaseAbapConnection
 * - Lock handle: must be maintained within session scope
 * - View must already exist (created via CreateView or manually)
 * - Works for both CDS Views and Classic Views
 * 
 * NOTE: This handler requires additional testing with different view types.
 * Some view types may require different URL patterns or additional parameters.
 * Tested successfully with UpdateClassSource and UpdateProgramSource patterns.
 */

import { AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, logger } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import * as crypto from 'crypto';

export const TOOL_DEFINITION = {
  name: "UpdateViewSource",
  description: "Update DDL source code of an existing CDS View or Classic View. Locks the view, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing views without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      view_name: { 
        type: "string", 
        description: "View name (e.g., ZOK_R_TEST_0002). View must already exist." 
      },
      ddl_source: {
        type: "string",
        description: "Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 'define view' statement."
      },
      activate: {
        type: "boolean",
        description: "Activate view after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation."
      }
    },
    required: ["view_name", "ddl_source"]
  }
} as const;

interface UpdateViewSourceArgs {
  view_name: string;
  ddl_source: string;
  activate?: boolean;
}

/**
 * Generate unique session ID - same for all requests in this operation
 */
function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Generate unique request ID - different for each request
 */
function generateRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

/**
 * Helper function to make ADT requests with session management
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
  
  const requestId = generateRequestId();
  const headers: Record<string, string> = {
    'sap-adt-connection-id': sessionId,
    'sap-adt-request-id': requestId,
    'x-sap-adt-sessiontype': 'stateful',
    'X-sap-adt-profiling': 'server-time',
    ...additionalHeaders
  };
  
  return makeAdtRequestWithTimeout(fullUrl, method, 'default', data, undefined, headers);
}

/**
 * Step 1: Lock view for editing
 */
async function lockView(viewName: string, sessionId: string): Promise<{ response: AxiosResponse; lockHandle: string; corrNr?: string }> {
  const url = `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };

  logger.info(`Locking view: ${viewName}`);
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
  
  // Parse lock handle and transport number from XML response
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const result = parser.parse(response.data);
  const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  const corrNr = result?.['asx:abap']?.['asx:values']?.['DATA']?.['CORRNR'];
  
  if (!lockHandle) {
    throw new Error('Failed to obtain lock handle from SAP. View may be locked by another user.');
  }
  
  logger.info(`Lock acquired: ${lockHandle}${corrNr ? `, transport: ${corrNr}` : ''}`);
  return { response, lockHandle, corrNr };
}

/**
 * Step 2: Upload view DDL source code
 */
async function uploadViewSource(
  viewName: string, 
  ddlSource: string, 
  lockHandle: string, 
  sessionId: string,
  corrNr?: string
): Promise<AxiosResponse> {
  // Lock handle and transport number are passed as URL parameters
  let url = `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}/source/main?lockHandle=${lockHandle}`;
  if (corrNr) {
    url += `&corrNr=${corrNr}`;
  }
  
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
    'Accept': 'text/plain'
  };

  logger.info(`Uploading view DDL source (${ddlSource.length} bytes)`);
  return await makeAdtRequestWithSession(url, 'PUT', sessionId, ddlSource, headers);
}

/**
 * Step 3: Unlock view after editing
 */
async function unlockView(viewName: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  logger.info(`Unlocking view with handle: ${lockHandle}`);
  return await makeAdtRequestWithSession(url, 'POST', sessionId, null, {});
}

/**
 * Step 4: Activate view (optional)
 */
async function activateView(viewName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}" adtcore:name="${viewName}"/>
</adtcore:objectReferences>`;

  const headers = {
    'Content-Type': 'application/vnd.sap.adt.activation+xml'
  };

  logger.info(`Activating view: ${viewName}`);
  return await makeAdtRequestWithSession(url, 'POST', sessionId, activationXml, headers);
}

/**
 * Main handler for UpdateViewSource
 */
export async function handleUpdateViewSource(params: any) {
  const args: UpdateViewSourceArgs = params;
  
  // Validate required parameters
  if (!args.view_name || !args.ddl_source) {
    return return_error(new Error("Missing required parameters: view_name and ddl_source"));
  }
  
  const viewName = args.view_name.toUpperCase();
  const sessionId = generateSessionId();
  let lockHandle: string | null = null;

  try {
    logger.info(`Starting UpdateViewSource for ${viewName}`);
    logger.info(`Session ID: ${sessionId}`);

    // Step 1: Lock the view
    const lockResult = await lockView(viewName, sessionId);
    lockHandle = lockResult.lockHandle;
    const corrNr = lockResult.corrNr;
    logger.info(`✓ Step 1: View locked (handle: ${lockHandle}${corrNr ? `, transport: ${corrNr}` : ''})`);

    // Step 2: Upload new DDL source code
    await uploadViewSource(viewName, args.ddl_source, lockHandle, sessionId, corrNr);
    logger.info(`✓ Step 2: DDL source uploaded (${args.ddl_source.length} bytes)`);

    // Step 3: Unlock the view
    await unlockView(viewName, lockHandle, sessionId);
    lockHandle = null; // Clear lock handle after successful unlock
    logger.info(`✓ Step 3: View unlocked`);

    // Step 4: Activate the view (optional)
    let activationWarnings: string[] = [];
    const shouldActivate = args.activate === true; // Default to false if not specified
    
    if (shouldActivate) {
      const activateResponse = await activateView(viewName, sessionId);
      logger.info(`✓ Step 4: Activation completed`);
      
      // Parse activation warnings/errors
      if (typeof activateResponse.data === 'string' && activateResponse.data.includes('<chkl:messages')) {
        const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
        const result = parser.parse(activateResponse.data);
        const messages = result?.['chkl:messages']?.['msg'];
        if (messages) {
          const msgArray = Array.isArray(messages) ? messages : [messages];
          activationWarnings = msgArray.map((msg: any) => 
            `${msg['@_type']}: ${msg['shortText']?.['txt'] || 'Unknown'}`
          );
        }
      }
    } else {
      logger.info(`✓ Step 4: Activation skipped (activate=false)`);
    }

    // Return success result
    const stepsCompleted = ['lock', 'upload_source', 'unlock'];
    if (shouldActivate) {
      stepsCompleted.push('activate');
    }
    
    const result = {
      success: true,
      view_name: viewName,
      type: 'DDLS/DF',
      message: shouldActivate 
        ? `View ${viewName} source updated and activated successfully`
        : `View ${viewName} source updated successfully (not activated)`,
      uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}`,
      steps_completed: stepsCompleted,
      activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
      source_size_bytes: args.ddl_source.length
    };

    return return_response({
      data: JSON.stringify(result, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });

  } catch (error: any) {
    // CRITICAL: Always try to unlock on error to prevent locked objects
    if (lockHandle) {
      try {
        await unlockView(viewName, lockHandle, sessionId);
        logger.info('Lock released after error');
      } catch (unlockError) {
        logger.error('Failed to unlock after error:', unlockError);
      }
    }

    logger.error(`Error updating view ${viewName}:`, error);
    const errorMessage = error.response?.data 
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message;

    return return_error(new Error(`Failed to update view ${viewName}: ${errorMessage}`));
  }
}
