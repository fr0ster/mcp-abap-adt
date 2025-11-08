/**
 * ActivateObject Handler - Universal ABAP Object Activation via ADT API
 * 
 * Activates one or multiple ABAP repository objects using ADT activation endpoint.
 * This is a stateless operation - no session management or locking required.
 * 
 * Supported object types:
 * - Classes (CLAS/OC)
 * - Programs (PROG/P)
 * - Function Groups (FUGR)
 * - Tables (TABL/DT)
 * - Structures (TABL/DS, STRU/DS)
 * - Views (DDLS/DF for CDS, VIEW/DV for Classic)
 * - Data Elements (DTEL/DE)
 * - Domains (DOMA/DD)
 * - Interfaces (INTF/OI)
 * - And many more...
 * 
 * ADT API endpoint: POST /sap/bc/adt/activation?method=activate&preauditRequested=true
 */

import { AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, logger } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "ActivateObject",
  description: "Activate one or multiple ABAP repository objects. Works with any object type: classes, programs, tables, views, domains, data elements, etc. Returns activation status and any warnings/errors.",
  inputSchema: {
    type: "object",
    properties: {
      objects: {
        type: "array",
        description: "Array of objects to activate. Each object must have 'uri' and 'name' properties.",
        items: {
          type: "object",
          properties: {
            uri: {
              type: "string",
              description: "Object URI in ADT format (e.g., '/sap/bc/adt/oo/classes/zcl_my_class', '/sap/bc/adt/programs/programs/z_my_program')"
            },
            name: {
              type: "string",
              description: "Object name in uppercase (e.g., 'ZCL_MY_CLASS', 'Z_MY_PROGRAM')"
            },
            type: {
              type: "string",
              description: "Optional object type for reference (e.g., 'CLAS/OC', 'PROG/P', 'TABL/DT')"
            }
          },
          required: ["uri", "name"]
        }
      },
      preaudit: {
        type: "boolean",
        description: "Request pre-audit before activation. Default: true"
      }
    },
    required: ["objects"]
  }
} as const;

interface ActivationObject {
  uri: string;
  name: string;
  type?: string;
}

interface ActivateObjectArgs {
  objects: ActivationObject[];
  preaudit?: boolean;
}

/**
 * Helper: Build object URI from name and type if URI is not provided
 */
function buildObjectUri(name: string, type?: string): string {
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
 * Build activation XML payload
 */
function buildActivationXml(objects: ActivationObject[]): string {
  const objectReferences = objects.map(obj => {
    const uri = obj.uri || buildObjectUri(obj.name, obj.type);
    return `  <adtcore:objectReference adtcore:uri="${uri}" adtcore:name="${obj.name.toUpperCase()}"/>`;
  }).join('\n');
  
  return `<?xml version="1.0" encoding="UTF-8"?><adtcore:objectReferences xmlns:adtcore="http://www.sap.com/adt/core">
${objectReferences}
</adtcore:objectReferences>`;
}

/**
 * Parse activation response to extract status, warnings, and errors
 */
function parseActivationResponse(response: AxiosResponse): {
  success: boolean;
  activated: boolean;
  checked: boolean;
  generated: boolean;
  messages: Array<{type: string; text: string; line?: number; column?: number}>;
} {
  const parser = new XMLParser({ 
    ignoreAttributes: false, 
    attributeNamePrefix: '@_',
    parseAttributeValue: true
  });
  
  try {
    const result = parser.parse(response.data);
    
    // Check for properties element
    const properties = result['chkl:messages']?.['chkl:properties'];
    
    const activated = properties?.['@_activationExecuted'] === 'true' || properties?.['@_activationExecuted'] === true;
    const checked = properties?.['@_checkExecuted'] === 'true' || properties?.['@_checkExecuted'] === true;
    const generated = properties?.['@_generationExecuted'] === 'true' || properties?.['@_generationExecuted'] === true;
    
    // Parse messages (warnings/errors)
    const messages: Array<{type: string; text: string; line?: number; column?: number}> = [];
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
      success: activated && checked,
      activated,
      checked,
      generated,
      messages
    };
  } catch (error) {
    logger.error('Failed to parse activation response:', error);
    return {
      success: false,
      activated: false,
      checked: false,
      generated: false,
      messages: [{type: 'error', text: 'Failed to parse activation response'}]
    };
  }
}

/**
 * Main handler for ActivateObject tool
 * 
 * This is a stateless operation - no session management needed.
 * Activation endpoint handles multiple objects in one request.
 */
export async function handleActivateObject(params: any) {
  const args: ActivateObjectArgs = params;
  
  // Validate required parameters
  if (!args.objects || !Array.isArray(args.objects) || args.objects.length === 0) {
    return return_error(new Error("Missing required parameter: objects (must be non-empty array)"));
  }
  
  // Validate each object has required properties
  for (const obj of args.objects) {
    if (!obj.name) {
      return return_error(new Error("Each object must have 'name' property"));
    }
    if (!obj.uri && !obj.type) {
      logger.warn(`Object ${obj.name} has no URI or type, will attempt to guess from name`);
    }
  }
  
  const preaudit = args.preaudit !== false; // Default: true
  
  logger.info(`Starting activation of ${args.objects.length} object(s)`);
  
  try {
    // Build activation XML
    const activationXml = buildActivationXml(args.objects);
    logger.debug('Activation XML:', activationXml);
    
    // Make activation request
    const baseUrl = await getBaseUrl();
    const url = `${baseUrl}/sap/bc/adt/activation?method=activate&preauditRequested=${preaudit}`;
    
    const headers = {
      'Accept': 'application/xml',
      'Content-Type': 'application/xml'
    };
    
    const response = await makeAdtRequestWithTimeout(url, 'POST', 'default', activationXml, undefined, headers);
    
    // Debug: log raw response
    logger.debug('Activation response status:', response.status);
    logger.debug('Activation response data:', typeof response.data === 'string' ? response.data.substring(0, 500) : response.data);
    
    // Parse response
    const activationResult = parseActivationResponse(response);
    
    // Build result object
    const result = {
      success: activationResult.success,
      objects_count: args.objects.length,
      objects: args.objects.map(obj => ({
        name: obj.name.toUpperCase(),
        uri: obj.uri || buildObjectUri(obj.name, obj.type),
        type: obj.type
      })),
      activation: {
        activated: activationResult.activated,
        checked: activationResult.checked,
        generated: activationResult.generated
      },
      messages: activationResult.messages,
      warnings: activationResult.messages.filter(m => m.type === 'warning' || m.type === 'W'),
      errors: activationResult.messages.filter(m => m.type === 'error' || m.type === 'E'),
      message: activationResult.success 
        ? `Successfully activated ${args.objects.length} object(s)`
        : `Activation completed with issues: ${activationResult.messages.length} message(s)`
    };
    
    logger.info(`Activation completed: ${activationResult.success ? 'SUCCESS' : 'WITH ISSUES'}`);
    
    return return_response({
      data: JSON.stringify(result, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any
    });
    
  } catch (error: any) {
    const errorMessage = error.response?.data 
      ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
      : error.message;
    
    logger.error(`Activation failed:`, errorMessage);
    return return_error(new Error(`Failed to activate objects: ${errorMessage}`));
  }
}
