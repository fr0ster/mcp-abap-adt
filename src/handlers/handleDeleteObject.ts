/**
 * DeleteObject Handler - Delete ABAP objects via ADT API
 * 
 * Eclipse ADT workflow:
 * DELETE /sap/bc/adt/{object_path}?deleteOption=deleteFromDatabase&corrNr={transport}
 * 
 * Supported object types:
 * - Classes: /sap/bc/adt/oo/classes/{name}
 * - Programs: /sap/bc/adt/programs/programs/{name}
 * - Interfaces: /sap/bc/adt/oo/interfaces/{name}
 * - Function Groups: /sap/bc/adt/functions/groups/{name}
 * - Tables: /sap/bc/adt/ddic/tables/{name}
 * - Structures: /sap/bc/adt/ddic/structures/{name}
 * - Views: /sap/bc/adt/ddic/ddlsources/{name}
 * - Domains: /sap/bc/adt/ddic/domains/{name}
 * - Data Elements: /sap/bc/adt/ddic/dataelements/{name}
 * 
 * IMPORTANT:
 * - Object must not be locked by another user
 * - Transport request required for transportable objects
 * - Some deletions may require cascade (deleting dependent objects)
 */

import { AxiosResponse } from '../lib/utils';
import { makeAdtRequestWithTimeout, return_error, return_response, getBaseUrl, encodeSapObjectName, logger } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';

export const TOOL_DEFINITION = {
  name: "DeleteObject",
  description: "Delete an ABAP object from the SAP system. Requires transport request for transportable objects. Object must not be locked by another user.",
  inputSchema: {
    type: "object",
    properties: {
      object_name: { 
        type: "string", 
        description: "Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE)" 
      },
      object_type: {
        type: "string",
        description: "Object type: 'class', 'program', 'interface', 'function_group', 'table', 'structure', 'view', 'domain', 'data_element'",
        enum: ["class", "program", "interface", "function_group", "table", "structure", "view", "domain", "data_element"]
      },
      transport_request: { 
        type: "string", 
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)." 
      },
      delete_option: {
        type: "string",
        description: "Deletion option: 'deleteFromDatabase' (permanent) or 'moveToTransport' (for later deletion). Default: deleteFromDatabase",
        enum: ["deleteFromDatabase", "moveToTransport"]
      }
    },
    required: ["object_name", "object_type"]
  }
} as const;

interface DeleteObjectArgs {
  object_name: string;
  object_type: string;
  transport_request?: string;
  delete_option?: string;
}

/**
 * Get ADT path for object type
 */
function getObjectPath(objectType: string, objectName: string): string {
  const encodedName = encodeSapObjectName(objectName);
  
  switch (objectType.toLowerCase()) {
    case 'class':
      return `/sap/bc/adt/oo/classes/${encodedName}`;
    case 'program':
      return `/sap/bc/adt/programs/programs/${encodedName}`;
    case 'interface':
      return `/sap/bc/adt/oo/interfaces/${encodedName}`;
    case 'function_group':
      return `/sap/bc/adt/functions/groups/${encodedName}`;
    case 'table':
      return `/sap/bc/adt/ddic/tables/${encodedName}`;
    case 'structure':
      return `/sap/bc/adt/ddic/structures/${encodedName}`;
    case 'view':
      return `/sap/bc/adt/ddic/ddlsources/${encodedName}`;
    case 'domain':
      return `/sap/bc/adt/ddic/domains/${encodedName}`;
    case 'data_element':
      return `/sap/bc/adt/ddic/dataelements/${encodedName}`;
    default:
      throw new Error(`Unsupported object type: ${objectType}`);
  }
}

/**
 * Delete ABAP object
 */
async function deleteObject(
  objectName: string,
  objectType: string,
  transportRequest: string | undefined,
  deleteOption: string
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const objectPath = getObjectPath(objectType, objectName);
  
  // Build URL with delete option and optional transport
  let url = `${baseUrl}${objectPath}?deleteOption=${deleteOption}`;
  if (transportRequest) {
    url += `&corrNr=${transportRequest}`;
  }
  
  logger.info(`🗑️  Deleting ${objectType}: ${objectName}`);
  logger.info(`   URL: ${url}`);
  
  const response = await makeAdtRequestWithTimeout(
    url,
    'DELETE',
    'default',
    undefined,
    undefined,
    {
      'Accept': 'application/xml',
      'Content-Type': 'application/xml'
    }
  );
  
  logger.info(`✅ Object deleted successfully: ${objectName}`);
  
  return response;
}

/**
 * Main handler for DeleteObject
 */
export async function handleDeleteObject(args: any) {
  const {
    object_name,
    object_type,
    transport_request,
    delete_option = 'deleteFromDatabase'
  } = args as DeleteObjectArgs;

  // Validation
  if (!object_name || !object_type) {
    return return_error('object_name and object_type are required');
  }
  
  const validTypes = ['class', 'program', 'interface', 'function_group', 'table', 'structure', 'view', 'domain', 'data_element'];
  if (!validTypes.includes(object_type.toLowerCase())) {
    return return_error(`Invalid object_type. Must be one of: ${validTypes.join(', ')}`);
  }
  
  logger.info(`🚀 Starting DeleteObject: ${object_name} (type: ${object_type})`);
  
  try {
    // Delete object
    const response = await deleteObject(
      object_name,
      object_type,
      transport_request,
      delete_option
    );
    
    logger.info(`✅ DeleteObject completed successfully: ${object_name}`);
    
    return return_response({
      data: {
        success: true,
        object_name,
        object_type,
        transport_request: transport_request || 'local',
        delete_option,
        message: `Object ${object_name} deleted successfully`
      }
    } as AxiosResponse);
    
  } catch (error: any) {
    logger.error(`❌ DeleteObject failed: ${error}`);
    
    // Parse error message for better user feedback
    let errorMessage = `Failed to delete object: ${error}`;
    
    if (error.response?.status === 404) {
      errorMessage = `Object ${object_name} not found. It may already be deleted.`;
    } else if (error.response?.status === 423) {
      errorMessage = `Object ${object_name} is locked by another user. Cannot delete.`;
    } else if (error.response?.status === 400) {
      errorMessage = `Bad request. Check if transport request is required and valid.`;
    } else if (error.response?.data && typeof error.response.data === 'string') {
      // Try to parse XML error message
      try {
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_'
        });
        const errorData = parser.parse(error.response.data);
        const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
        if (errorMsg) {
          errorMessage = `SAP Error: ${errorMsg}`;
        }
      } catch (parseError) {
        // Ignore parse errors, use default message
      }
    }
    
    return return_error(errorMessage);
  }
}
