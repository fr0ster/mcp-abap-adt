/**
 * CreateView Handler - CDS/Classic View Creation via ADT API
 * 
 * Both CDS Views and Classic Views use the SAME API workflow (Eclipse ADT):
 * 1. POST /sap/bc/adt/ddic/ddl/sources?corrNr=XXX - Create DDLS with metadata XML
 * 2. POST /sap/bc/adt/ddic/ddl/sources/{name}?_action=LOCK - Lock object
 * 3. PUT /sap/bc/adt/ddic/ddl/sources/{name}/source/main - Upload DDL source
 * 4. POST /sap/bc/adt/ddic/ddl/sources/{name}?_action=UNLOCK - Unlock object  
 * 5. POST /sap/bc/adt/activation - Activate object
 * 
 * The ONLY difference between CDS and Classic views is the DDL source content:
 * - CDS View: @AbapCatalog.sqlViewName: 'ZV_SQL' + annotations + define view
 * - Classic View: Plain define view without annotations
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger } from '../lib/utils';
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "CreateView",
  description: "Create CDS View or Classic View in SAP using DDL syntax. Both types use the same API workflow, differing only in DDL content (CDS has @AbapCatalog annotations).",
  inputSchema: {
    type: "object",
    properties: {
      view_name: { 
        type: "string", 
        description: "View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW). Must follow SAP naming conventions." 
      },
      ddl_source: {
        type: "string",
        description: "Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 'define view' statement."
      },
      package_name: { 
        type: "string", 
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      },
      description: {
        type: "string",
        description: "Optional description. If not provided, view_name will be used."
      }
    },
    required: ["view_name", "ddl_source", "package_name"]
  }
} as const;

interface CreateViewArgs {
  view_name: string;
  ddl_source: string;
  package_name: string;
  transport_request?: string;
  description?: string;
}

async function createDDLSObject(args: CreateViewArgs, sessionId: string): Promise<AxiosResponse> {
  const description = args.description || args.view_name;
  const url = `/sap/bc/adt/ddic/ddl/sources${args.transport_request ? `?corrNr=${args.transport_request}` : ''}`;
  
  const metadataXml = `<?xml version="1.0" encoding="UTF-8"?><ddl:ddlSource xmlns:ddl="http://www.sap.com/adt/ddic/ddlsources" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="EN" adtcore:name="${args.view_name}" adtcore:type="DDLS/DF" adtcore:masterLanguage="EN">
  <adtcore:packageRef adtcore:name="${args.package_name}"/>
</ddl:ddlSource>`;

  const headers = {
    'Accept': 'application/vnd.sap.adt.ddlSource.v2+xml, application/vnd.sap.adt.ddlSource+xml',
    'Content-Type': 'application/vnd.sap.adt.ddlSource+xml'
  };

  logger.info(`Creating DDLS object: ${args.view_name}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, metadataXml, headers);
}

async function lockDDLS(viewName: string, sessionId: string): Promise<string> {
  const url = `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };

  logger.info(`Locking DDLS: ${viewName}`);
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
  
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const result = parser.parse(response.data);
  const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  
  if (!lockHandle) {
    throw new Error('Failed to obtain lock handle from SAP');
  }
  
  logger.info(`Lock acquired: ${lockHandle}`);
  return lockHandle;
}

async function uploadDDLSource(viewName: string, ddlSource: string, lockHandle: string, sessionId: string, transportRequest?: string): Promise<AxiosResponse> {
  const queryParams = `lockHandle=${lockHandle}${transportRequest ? `&corrNr=${transportRequest}` : ''}`;
  const url = `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}/source/main?${queryParams}`;
  
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8'
  };

  logger.info(`Uploading DDL source: ${viewName}, lockHandle: ${lockHandle}`);
  return makeAdtRequestWithSession(url, 'PUT', sessionId, ddlSource, headers);
}

async function unlockDDLS(viewName: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;

  logger.info(`Unlocking DDLS: ${viewName}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, null);
}

async function activateDDLS(viewName: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}" adtcore:name="${viewName}"/>
</adtcore:objectReferences>`;

  const headers = {
    'Accept': 'application/xml',
    'Content-Type': 'application/xml'
  };

  logger.info(`Activating DDLS: ${viewName}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, activationXml, headers);
}

export async function handleCreateView(params: any) {
  const args: CreateViewArgs = params;
  
  if (!args.view_name || !args.ddl_source || !args.package_name) {
    return return_error(new Error("Missing required parameters: view_name, ddl_source, and package_name"));
  }

  const viewName = args.view_name.toUpperCase();
  const sessionId = generateSessionId();
  let lockHandle: string | null = null;
  
  logger.info(`Starting view creation: ${viewName} (session: ${sessionId})`);

  try {
    const createResponse = await createDDLSObject(args, sessionId);
    if (createResponse.status < 200 || createResponse.status >= 300) {
      throw new Error(`Failed to create DDLS: ${createResponse.status} ${createResponse.statusText}`);
    }
    logger.info(`✓ Step 1: DDLS object created`);

    lockHandle = await lockDDLS(viewName, sessionId);
    logger.info(`✓ Step 2: Object locked`);

    const uploadResponse = await uploadDDLSource(viewName, args.ddl_source, lockHandle, sessionId, args.transport_request);
    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      throw new Error(`Failed to upload DDL: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
    logger.info(`✓ Step 3: DDL source uploaded`);

    await unlockDDLS(viewName, lockHandle, sessionId);
    lockHandle = null;
    logger.info(`✓ Step 4: Object unlocked`);

    const activateResponse = await activateDDLS(viewName, sessionId);
    logger.info(`✓ Step 5: Activation completed`);
    
    let activationWarnings: string[] = [];
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

    const result = {
      success: true,
      view_name: viewName,
      package_name: args.package_name,
      transport_request: args.transport_request || null,
      type: 'DDLS',
      message: `View ${viewName} created and activated successfully`,
      uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}`,
      steps_completed: ['create_object', 'lock', 'upload_source', 'unlock', 'activate'],
      activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined
    };

    return return_response({
      data: JSON.stringify(result, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });

  } catch (error: any) {
    if (lockHandle) {
      try {
        await unlockDDLS(viewName, lockHandle, sessionId);
        logger.info('Lock released after error');
      } catch (unlockError) {
        logger.error('Failed to unlock after error:', unlockError);
      }
    }

    logger.error(`Error creating view ${viewName}:`, error);
    const errorMessage = error.response?.data 
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message;

    return return_error(new Error(`Failed to create view ${viewName}: ${errorMessage}`));
  }
}
