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
 * Step 1: Lock view for editing
 */
async function lockView(viewName: string, sessionId: string): Promise<{ response: AxiosResponse; lockHandle: string }> {
  const url = `${getBaseUrl()}/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}?_action=LOCK`;
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'POST',
    30000,
    '_action=LOCK',
    undefined,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'sap-adt-sessiontype': 'stateful',
      'sap-adt-connection-id': sessionId,
      'X-sap-adt-sessiontype': 'stateful',
      'sap-adt-xcsrf-token': 'fetch',
      'X-csrf-token': 'fetch',
      'x-sap-request-id': generateRequestId()
    }
  );

  const lockHandle = response.headers['sap-adt-lockhandle'] || response.headers['SAP-ADT-LOCKHANDLE'];
  if (!lockHandle) {
    throw new Error('Failed to obtain lock handle from response');
  }

  return { response, lockHandle };
}

/**
 * Step 2: Upload view DDL source code
 */
async function uploadViewSource(
  viewName: string, 
  ddlSource: string, 
  lockHandle: string, 
  sessionId: string
): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}/source/main`;
  
  return await makeAdtRequestWithTimeout(
    url,
    'PUT',
    30000,
    ddlSource,
    undefined,
    {
      'Content-Type': 'text/plain; charset=utf-8',
      'sap-adt-sessiontype': 'stateful',
      'sap-adt-connection-id': sessionId,
      'X-sap-adt-sessiontype': 'stateful',
      'sap-adt-lockhandle': lockHandle,
      'x-sap-request-id': generateRequestId()
    }
  );
}

/**
 * Step 3: Unlock view after editing
 */
async function unlockView(viewName: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}?_action=UNLOCK&lockHandle=${lockHandle}`;
  
  return await makeAdtRequestWithTimeout(
    url,
    'POST',
    30000,
    '_action=UNLOCK',
    undefined,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'sap-adt-sessiontype': 'stateful',
      'sap-adt-connection-id': sessionId,
      'X-sap-adt-sessiontype': 'stateful',
      'x-sap-request-id': generateRequestId()
    }
  );
}

/**
 * Step 4: Activate view (optional)
 */
async function activateView(viewName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `${getBaseUrl()}/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}" adtcore:name="${viewName}"/>
</adtcore:objectReferences>`;

  return await makeAdtRequestWithTimeout(
    url,
    'POST',
    30000,
    activationXml,
    undefined,
    {
      'Content-Type': 'application/vnd.sap.adt.activation+xml',
      'sap-adt-connection-id': sessionId,
      'x-sap-request-id': generateRequestId()
    }
  );
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
    logger.info(`✓ Step 1: View locked (handle: ${lockHandle})`);

    // Step 2: Upload new DDL source code
    await uploadViewSource(viewName, args.ddl_source, lockHandle, sessionId);
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
