/**
 * CreateClass Handler - ABAP Class Creation via ADT API
 * 
 * Eclipse ADT workflow (stateful session required):
 * 1. POST /sap/bc/adt/oo/classes - Create class with metadata
 * 2. POST /sap/bc/adt/oo/classes/{name}?_action=LOCK - Lock class
 * 3. PUT /sap/bc/adt/oo/classes/{name}/source/main - Upload class source
 * 4. POST /sap/bc/adt/oo/classes/{name}?_action=UNLOCK - Unlock class
 * 5. POST /sap/bc/adt/activation - Activate class
 * 
 * CRITICAL REQUIREMENTS:
 * - Stateful session: sap-adt-connection-id must be same for all 5 steps
 * - Cookie management: automatic via BaseAbapConnection
 * - Lock handle: must be maintained within session scope
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger } from '../lib/utils';
import { generateSessionId, makeAdtRequestWithSession } from '../lib/sessionUtils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "CreateClass",
  description: "Create a new ABAP class in SAP system with source code. Supports public/protected/private sections, interfaces, and inheritance. Uses stateful session for proper lock management.",
  inputSchema: {
    type: "object",
    properties: {
      class_name: { 
        type: "string", 
        description: "Class name (e.g., ZCL_TEST_CLASS_001). Must follow SAP naming conventions (start with Z or Y)." 
      },
      description: {
        type: "string",
        description: "Class description. If not provided, class_name will be used."
      },
      package_name: { 
        type: "string", 
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)" 
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable packages." 
      },
      superclass: {
        type: "string",
        description: "Optional superclass name for inheritance (e.g., CL_OBJECT)"
      },
      final: {
        type: "boolean",
        description: "Mark class as final (cannot be inherited). Default: false"
      },
      abstract: {
        type: "boolean",
        description: "Mark class as abstract (cannot be instantiated). Default: false"
      },
      create_protected: {
        type: "boolean",
        description: "Constructor visibility is protected. Default: false (public)"
      },
      source_code: {
        type: "string",
        description: "Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections. If not provided, generates minimal template."
      },
      activate: {
        type: "boolean",
        description: "Activate class after creation. Default: true. Set to false for batch operations (activate multiple objects later)."
      }
    },
    required: ["class_name", "package_name"]
  }
} as const;

interface CreateClassArgs {
  class_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  superclass?: string;
  final?: boolean;
  abstract?: boolean;
  create_protected?: boolean;
  source_code?: string;
  activate?: boolean;
}

/**
 * Generate minimal class source code if not provided
 */
function generateClassTemplate(className: string, description: string): string {
  return `CLASS ${className} DEFINITION
  PUBLIC
  FINAL
  CREATE PUBLIC .

  PUBLIC SECTION.
    METHODS: constructor.
  PROTECTED SECTION.
  PRIVATE SECTION.
ENDCLASS.

CLASS ${className} IMPLEMENTATION.
  METHOD constructor.
    " ${description}
  ENDMETHOD.
ENDCLASS.`;
}

/**
 * Step 1: Create class object with metadata
 * Following Eclipse ADT approach: final and visibility are XML attributes, not elements
 */
async function createClassObject(args: CreateClassArgs, sessionId: string): Promise<AxiosResponse> {
  const description = args.description || args.class_name;
  const url = `/sap/bc/adt/oo/classes${args.transport_request ? `?corrNr=${args.transport_request}` : ''}`;
  
  // Get username (if available) or leave empty
  const username = process.env.SAP_USERNAME || '';
  const masterSystem = process.env.SAP_SYSTEM || 'E19';
  
  // Build class metadata XML following Eclipse ADT format
  // Key point: class:final and class:visibility are XML ATTRIBUTES, not elements
  const finalAttr = args.final ? 'true' : 'false';
  const visibilityAttr = args.create_protected ? 'protected' : 'public';
  
  const metadataXml = `<?xml version="1.0" encoding="UTF-8"?>
<class:abapClass xmlns:class="http://www.sap.com/adt/oo/classes" xmlns:adtcore="http://www.sap.com/adt/core" adtcore:description="${description}" adtcore:language="EN" adtcore:name="${args.class_name}" adtcore:type="CLAS/OC" adtcore:masterLanguage="EN" adtcore:masterSystem="${masterSystem}" adtcore:responsible="${username}" class:final="${finalAttr}" class:visibility="${visibilityAttr}">
  <adtcore:packageRef adtcore:name="${args.package_name}"/>
  <class:include adtcore:name="CLAS/OC" adtcore:type="CLAS/OC" class:includeType="testclasses"/>
  <class:superClassRef${args.superclass ? ` adtcore:name="${args.superclass}"` : ''}/>
</class:abapClass>`;

  const headers = {
    'Accept': 'application/vnd.sap.adt.oo.classes.v4+xml',
    'Content-Type': 'application/vnd.sap.adt.oo.classes.v4+xml'
  };

  logger.info(`Creating class object: ${args.class_name}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, metadataXml, headers);
}

/**
 * Step 2: Lock class for modification
 * Returns lock handle that must be used in subsequent requests
 */
async function lockClass(className: string, sessionId: string): Promise<string> {
  const url = `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}?_action=LOCK&accessMode=MODIFY`;
  
  const headers = {
    'Accept': 'application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result;q=0.8, application/vnd.sap.as+xml;charset=UTF-8;dataname=com.sap.adt.lock.result2;q=0.9'
  };

  logger.info(`Locking class: ${className}`);
  const response = await makeAdtRequestWithSession(url, 'POST', sessionId, null, headers);
  
  // Parse lock handle from XML response
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
  const result = parser.parse(response.data);
  const lockHandle = result?.['asx:abap']?.['asx:values']?.['DATA']?.['LOCK_HANDLE'];
  
  if (!lockHandle) {
    throw new Error('Failed to obtain lock handle from SAP. Class may be locked by another user.');
  }
  
  logger.info(`Lock acquired: ${lockHandle}`);
  return lockHandle;
}

/**
 * Step 3: Upload class source code
 * Lock handle must be passed in URL and maintained in same session
 */
async function uploadClassSource(
  className: string, 
  sourceCode: string, 
  lockHandle: string, 
  sessionId: string, 
  transportRequest?: string
): Promise<AxiosResponse> {
  const queryParams = `lockHandle=${lockHandle}${transportRequest ? `&corrNr=${transportRequest}` : ''}`;
  const url = `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}/source/main?${queryParams}`;
  
  const headers = {
    'Accept': 'text/plain',
    'Content-Type': 'text/plain; charset=utf-8'
  };

  logger.info(`Uploading class source: ${className}, lockHandle: ${lockHandle.substring(0, 10)}...`);
  return makeAdtRequestWithSession(url, 'PUT', sessionId, sourceCode, headers);
}

/**
 * Step 4: Unlock class
 * Must use same session and lock handle from step 2
 */
async function unlockClass(className: string, lockHandle: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}?_action=UNLOCK&lockHandle=${lockHandle}`;

  logger.info(`Unlocking class: ${className}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, null);
}

/**
 * Step 5: Activate class
 * Makes class active and usable in SAP system
 */
async function activateClass(className: string, sessionId: string): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=true`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}" adtcore:name="${className}"/>
</adtcore:objectReferences>`;

  const headers = {
    'Accept': 'application/xml',
    'Content-Type': 'application/xml'
  };

  logger.info(`Activating class: ${className}`);
  return makeAdtRequestWithSession(url, 'POST', sessionId, activationXml, headers);
}

/**
 * Main handler for creating ABAP classes
 * 
 * IMPORTANT: Uses stateful session for all 5 steps
 * IMPORTANT: Cookies are managed automatically by BaseAbapConnection
 * IMPORTANT: Lock handle is maintained within session scope
 */
export async function handleCreateClass(params: any) {
  const args: CreateClassArgs = params;
  
  // Validate required parameters
  if (!args.class_name || !args.package_name) {
    return return_error(new Error("Missing required parameters: class_name and package_name"));
  }
  
  // Validate transport_request: required for non-$TMP packages
  try {
    validateTransportRequest(args.package_name, args.transport_request);
  } catch (error) {
    return return_error(error as Error);
  }

  const className = args.class_name.toUpperCase();
  const sessionId = generateSessionId();
  let lockHandle: string | null = null;
  
  logger.info(`Starting class creation: ${className} (session: ${sessionId})`);

  try {
    // Step 1: Create class object with metadata
    // After POST, class is automatically locked and lock handle is returned in response headers
    const createResponse = await createClassObject(args, sessionId);
    if (createResponse.status < 200 || createResponse.status >= 300) {
      throw new Error(`Failed to create class object: ${createResponse.status} ${createResponse.statusText}`);
    }
    logger.info(`✓ Step 1: Class object created`);

    // Extract lock handle from response headers (Eclipse approach)
    lockHandle = createResponse.headers['sap-adt-lockhandle'] || 
                 createResponse.headers['lockhandle'] ||
                 createResponse.headers['x-sap-adt-lockhandle'];
    
    if (!lockHandle) {
      // Fallback: try to extract from response body or do explicit LOCK
      logger.warn('Lock handle not found in POST response headers, attempting explicit LOCK');
      lockHandle = await lockClass(className, sessionId);
    }
    
    logger.info(`✓ Step 2: Lock handle obtained: ${lockHandle.substring(0, 10)}...`);

    // Step 3: Upload source code (uses lock handle from step 1/2)
    const sourceCode = args.source_code || generateClassTemplate(className, args.description || className);
    const uploadResponse = await uploadClassSource(className, sourceCode, lockHandle, sessionId, args.transport_request);
    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      throw new Error(`Failed to upload source: ${uploadResponse.status} ${uploadResponse.statusText}`);
    }
    logger.info(`✓ Step 3: Source code uploaded`);

    // Step 4: Unlock the class
    await unlockClass(className, lockHandle, sessionId);
    lockHandle = null; // Clear lock handle after successful unlock
    logger.info(`✓ Step 4: Class unlocked`);

    // Step 5: Activate the class (optional)
    let activationWarnings: string[] = [];
    const shouldActivate = args.activate !== false; // Default to true if not specified
    
    if (shouldActivate) {
      const activateResponse = await activateClass(className, sessionId);
      logger.info(`✓ Step 5: Activation completed`);
      
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
      logger.info(`✓ Step 5: Activation skipped (activate=false)`);
    }

    // Return success result
    const stepsCompleted = ['create_object', 'lock', 'upload_source', 'unlock'];
    if (shouldActivate) {
      stepsCompleted.push('activate');
    }
    
    const result = {
      success: true,
      class_name: className,
      package_name: args.package_name,
      transport_request: args.transport_request || null,
      type: 'CLAS/OC',
      message: shouldActivate 
        ? `Class ${className} created and activated successfully`
        : `Class ${className} created successfully (not activated)`,
      uri: `/sap/bc/adt/oo/classes/${encodeSapObjectName(className).toLowerCase()}`,
      steps_completed: stepsCompleted,
      activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
      superclass: args.superclass || null,
      final: args.final || false,
      abstract: args.abstract || false
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
        await unlockClass(className, lockHandle, sessionId);
        logger.info('Lock released after error');
      } catch (unlockError) {
        logger.error('Failed to unlock after error:', unlockError);
      }
    }

    logger.error(`Error creating class ${className}:`, error);
    const errorMessage = error.response?.data 
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message;

    return return_error(new Error(`Failed to create class ${className}: ${errorMessage}`));
  }
}
