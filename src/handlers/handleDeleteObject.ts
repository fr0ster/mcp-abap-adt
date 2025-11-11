/**
 * DeleteObject Handler - Delete ABAP objects via ADT API
 *
 * Eclipse ADT workflow:
 * POST /sap/bc/adt/deletion/delete
 * Content-Type: application/vnd.sap.adt.deletion.request.v1+xml
 * Accept: application/vnd.sap.adt.deletion.response.v1+xml
 *
 * Body:
 * <?xml version="1.0" encoding="UTF-8"?>
 * <del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">
 *   <del:object adtcore:uri="/sap/bc/adt/{object_path}">
 *     <del:transportNumber>{transport}</del:transportNumber>
 *   </del:object>
 * </del:deletionRequest>
 *
 * Supported object types:
 * - Classes: /sap/bc/adt/oo/classes/{name}
 * - Programs: /sap/bc/adt/programs/programs/{name}
 * - Interfaces: /sap/bc/adt/oo/interfaces/{name}
 * - Function Groups: /sap/bc/adt/functions/groups/{name}
 * - Function Modules: /sap/bc/adt/functions/groups/{group}/fmodules/{name}
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
  description: "Delete an ABAP object from the SAP system via ADT deletion API. Object URI is built automatically from object_name and object_type. Transport request optional for $TMP objects.",
  inputSchema: {
    type: "object",
    properties: {
      object_name: {
        type: "string",
        description: "Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, Z_TEST_FM_MCP01)"
      },
      object_type: {
        type: "string",
        description: "Object type: 'CLAS/OC' (class), 'PROG/P' (program), 'INTF/OI' (interface), 'FUGR/F' (function group), 'FUGR/FF' (function module), 'TABL/DT' (table), 'TTYP/ST' (structure), 'DDLS/DF' (view), 'DTEL/DE' (data element), 'DOMA/DM' (domain). Or simplified: 'class', 'program', 'interface', 'function_group', 'function_module', 'table', 'structure', 'view', 'domain', 'data_element'"
      },
      function_group_name: {
        type: "string",
        description: "Required only for function_module type - name of the function group containing the module"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP)."
      }
    },
    required: ["object_name", "object_type"]
  }
} as const;

interface DeleteObjectArgs {
  object_name: string;
  object_type: string;
  function_group_name?: string;
  transport_request?: string;
}

/**
 * Get ADT URI for object
 */
function getObjectUri(
  objectType: string,
  objectName: string,
  functionGroupName?: string
): string {
  const encodedName = encodeSapObjectName(objectName);

  // Normalize object type
  const type = objectType.toLowerCase()
    .replace('clas/oc', 'class')
    .replace('prog/p', 'program')
    .replace('intf/oi', 'interface')
    .replace('fugr/f', 'function_group')
    .replace('fugr/ff', 'function_module')
    .replace('tabl/dt', 'table')
    .replace('ttyp/st', 'structure')
    .replace('ddls/df', 'view')
    .replace('dtel/de', 'data_element')
    .replace('doma/dm', 'domain');

  switch (type) {
    case 'class':
      return `/sap/bc/adt/oo/classes/${encodedName}`;
    case 'program':
      return `/sap/bc/adt/programs/programs/${encodedName}`;
    case 'interface':
      return `/sap/bc/adt/oo/interfaces/${encodedName}`;
    case 'function_group':
      return `/sap/bc/adt/functions/groups/${encodedName}`;
    case 'function_module':
      if (!functionGroupName) {
        throw new Error('function_group_name is required for function_module deletion');
      }
      const encodedGroupName = encodeSapObjectName(functionGroupName);
      return `/sap/bc/adt/functions/groups/${encodedGroupName}/fmodules/${encodedName}`;
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
 * Delete ABAP object using ADT deletion API
 */
async function deleteObject(
  objectUri: string,
  transportRequest: string | undefined
): Promise<AxiosResponse> {
  const baseUrl = await getBaseUrl();
  const deletionUrl = `${baseUrl}/sap/bc/adt/deletion/delete`;

  // Build XML deletion request
  const xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>
<del:deletionRequest xmlns:del="http://www.sap.com/adt/deletion" xmlns:adtcore="http://www.sap.com/adt/core">
  <del:object adtcore:uri="${objectUri}">
    ${transportRequest ? `<del:transportNumber>${transportRequest}</del:transportNumber>` : ''}
  </del:object>
</del:deletionRequest>`;

  logger.info(`🗑️  Deleting object: ${objectUri}`);
  logger.info(`   Transport: ${transportRequest || 'local ($TMP)'}`);

  const response = await makeAdtRequestWithTimeout(
    deletionUrl,
    'POST',
    'default',
    xmlPayload,
    undefined,
    {
      'Accept': 'application/vnd.sap.adt.deletion.response.v1+xml',
      'Content-Type': 'application/vnd.sap.adt.deletion.request.v1+xml'
    }
  );

  logger.info(`✅ Object deleted successfully`);

  return response;
}

/**
 * Main handler for DeleteObject
 */
export async function handleDeleteObject(args: any) {
  const {
    object_name,
    object_type,
    function_group_name,
    transport_request
  } = args as DeleteObjectArgs;

  // Validation
  if (!object_name || !object_type) {
    return return_error('object_name and object_type are required');
  }

  logger.info(`🚀 Starting DeleteObject: ${object_name} (type: ${object_type})`);

  try {
    // Build object URI from object_name and object_type
    const uri = getObjectUri(object_type, object_name, function_group_name);

    // Delete object
    const response = await deleteObject(uri, transport_request);

    logger.info(`✅ DeleteObject completed successfully: ${object_name}`);

    return return_response({
      data: {
        success: true,
        object_name,
        object_type,
        object_uri: uri,
        transport_request: transport_request || 'local',
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
