/**
 * Activation Utilities - Centralized ABAP Object Activation Functions
 * 
 * Two types of activation endpoints:
 * 1. Individual activation: /sap/bc/adt/activation (for single object in session)
 * 2. Group activation: /sap/bc/adt/activation/runs (for multiple objects)
 */

import { AxiosResponse } from './utils';
import { makeAdtRequestWithSession } from './sessionUtils';
import { makeAdtRequestWithTimeout, getBaseUrl, encodeSapObjectName } from './utils';

/**
 * Build object URI from name and type
 * Used by both individual and group activation
 * 
 * @param name - Object name (e.g., 'ZCL_MY_CLASS', 'Z_MY_PROGRAM')
 * @param type - Object type code (e.g., 'CLAS/OC', 'PROG/P', 'DDLS/DF')
 * @returns ADT URI for the object
 */
export function buildObjectUri(name: string, type?: string): string {
  const lowerName = encodeSapObjectName(name).toLowerCase();
  
  if (!type) {
    // Try to guess type from name prefix
    if (name.startsWith('ZCL_') || name.startsWith('CL_')) {
      return `/sap/bc/adt/oo/classes/${lowerName}`;
    } else if (name.startsWith('Z') && name.includes('_PROGRAM')) {
      return `/sap/bc/adt/programs/programs/${lowerName}`;
    }
    // Default: assume program
    return `/sap/bc/adt/programs/programs/${lowerName}`;
  }
  
  // Map type to URI path
  switch (type.toUpperCase()) {
    case 'CLAS/OC':
    case 'CLAS':
      return `/sap/bc/adt/oo/classes/${lowerName}`;
    
    case 'PROG/P':
    case 'PROG':
      return `/sap/bc/adt/programs/programs/${lowerName}`;
    
    case 'FUGR':
    case 'FUNC':
      return `/sap/bc/adt/functions/groups/${lowerName}`;
    
    case 'TABL/DT':
    case 'TABL':
      return `/sap/bc/adt/ddic/tables/${lowerName}`;
    
    case 'TABL/DS':
    case 'STRU/DS':
    case 'STRU':
      return `/sap/bc/adt/ddic/structures/${lowerName}`;
    
    case 'DDLS/DF':
    case 'DDLS':
      return `/sap/bc/adt/ddic/ddl/sources/${lowerName}`;
    
    case 'VIEW/DV':
    case 'VIEW':
      return `/sap/bc/adt/ddic/views/${lowerName}`;
    
    case 'DTEL/DE':
    case 'DTEL':
      return `/sap/bc/adt/ddic/dataelements/${lowerName}`;
    
    case 'DOMA/DD':
    case 'DOMA':
      return `/sap/bc/adt/ddic/domains/${lowerName}`;
    
    case 'INTF/OI':
    case 'INTF':
      return `/sap/bc/adt/oo/interfaces/${lowerName}`;
    
    default:
      // Fallback: try to construct URI from type
      return `/sap/bc/adt/${type.toLowerCase()}/${lowerName}`;
  }
}

/**
 * Individual object activation (within a session)
 * Used by Update/Create handlers after lock/unlock operations
 * 
 * @param objectUri - ADT URI of the object (e.g., '/sap/bc/adt/oo/classes/zcl_test')
 * @param objectName - Object name in uppercase (e.g., 'ZCL_TEST')
 * @param sessionId - Session ID for stateful operations
 * @param preaudit - Request pre-audit before activation (default: true)
 * @returns Axios response with activation result
 */
export async function activateObjectInSession(
  objectUri: string,
  objectName: string,
  sessionId: string,
  preaudit: boolean = true
): Promise<AxiosResponse> {
  const url = `/sap/bc/adt/activation?method=activate&preauditRequested=${preaudit}`;
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?>
<adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
  <adtcore:objectReference adtcore:uri="${objectUri}" adtcore:name="${objectName}"/>
</adtcore:objectReferences>`;

  const headers = {
    'Content-Type': 'application/vnd.sap.adt.activation+xml',
    'Accept': 'application/xml'
  };

  return await makeAdtRequestWithSession(url, 'POST', sessionId, activationXml, headers);
}

/**
 * Group activation (multiple objects, stateless)
 * Used by ActivateObject tool for batch activation
 * 
 * @param objects - Array of objects to activate with uri and name
 * @param preaudit - Request pre-audit before activation (default: true)
 * @returns Axios response with activation result
 */
export async function activateObjectsGroup(
  objects: Array<{ uri: string; name: string }>,
  preaudit: boolean = true
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/sap/bc/adt/activation/runs?method=activate&preauditRequested=${preaudit}`;
  
  const objectReferences = objects.map(obj => 
    `  <adtcore:objectReference adtcore:uri="${obj.uri}" adtcore:name="${obj.name}"/>`
  ).join('\n');
  
  const activationXml = `<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
${objectReferences}
</adtcore:objectReferences>`;

  const headers = {
    'Accept': 'application/xml',
    'Content-Type': 'application/xml'
  };

  return await makeAdtRequestWithTimeout(url, 'POST', 'default', activationXml, undefined, headers);
}

/**
 * Parse activation response to extract status and messages
 * Common parsing logic for both individual and group activation
 * 
 * @param responseData - XML response data from activation endpoint
 * @returns Parsed activation result with status and messages
 */
export function parseActivationResponse(responseData: string): {
  activated: boolean;
  checked: boolean;
  generated: boolean;
  messages: Array<{ type: string; text: string; line?: number; column?: number }>;
} {
  const { XMLParser } = require('fast-xml-parser');
  const parser = new XMLParser({ 
    ignoreAttributes: false, 
    attributeNamePrefix: '@_',
    parseAttributeValue: true
  });
  
  try {
    const result = parser.parse(responseData);
    
    // Check for properties element
    const properties = result['chkl:messages']?.['chkl:properties'];
    
    const activated = properties?.['@_activationExecuted'] === 'true' || properties?.['@_activationExecuted'] === true;
    const checked = properties?.['@_checkExecuted'] === 'true' || properties?.['@_checkExecuted'] === true;
    const generated = properties?.['@_generationExecuted'] === 'true' || properties?.['@_generationExecuted'] === true;
    
    // Parse messages (warnings/errors)
    const messages: Array<{ type: string; text: string; line?: number; column?: number }> = [];
    const msgData = result['chkl:messages']?.['msg'];
    
    if (msgData) {
      const msgArray = Array.isArray(msgData) ? msgData : [msgData];
      msgArray.forEach((msg: any) => {
        messages.push({
          type: msg['@_type'] || 'info',
          text: msg['shortText']?.['txt'] || msg['shortText'] || 'Unknown message',
          line: msg['@_line'],
          column: msg['@_column']
        });
      });
    }
    
    return {
      activated,
      checked,
      generated,
      messages
    };
  } catch (error) {
    return {
      activated: false,
      checked: false,
      generated: false,
      messages: [{ type: 'error', text: 'Failed to parse activation response' }]
    };
  }
}
