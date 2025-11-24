/**
 * DeleteObject Handler - Delete ABAP objects via ADT API
 *
 * Uses deleteObject function from @mcp-abap-adt/adt-clients for all operations.
 * Connection management handled internally.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

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
        description: "Object type: 'CLAS/OC' (class), 'PROG/P' (program), 'INTF/OI' (interface), 'FUGR/F' (function group), 'FUGR/FF' (function module), 'TABL/DT' (table), 'TTYP/ST' (structure), 'DDLS/DF' (view), 'DTEL/DE' (data element), 'DOMA/DM' (domain), 'BDEF/BD' (behavior definition), 'DDLX/EX' (metadata extension). Or simplified: 'class', 'program', 'interface', 'function_group', 'function_module', 'table', 'structure', 'view', 'domain', 'data_element', 'behavior_definition', 'metadata_extension'"
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
 * Main handler for DeleteObject MCP tool
 *
 * Uses deleteObject function from @mcp-abap-adt/adt-clients for all operations
 * Connection management handled internally
 */
export async function handleDeleteObject(args: any) {
  try {
    const {
      object_name,
      object_type,
      function_group_name,
      transport_request
    } = args as DeleteObjectArgs;

    // Validation
    if (!object_name || !object_type) {
      return return_error(new Error('object_name and object_type are required'));
    }

    const connection = getManagedConnection();
    const crudClient = new CrudClient(connection);
    const objectName = object_name.toUpperCase();

    logger.info(`Starting object deletion: ${objectName} (type: ${object_type})`);

    try {
      let response;

      // Call appropriate delete method based on object type
      switch (object_type.toLowerCase()) {
        case 'class':
        case 'clas/oc':
          await crudClient.deleteClass(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'program':
        case 'prog/p':
          await crudClient.deleteProgram(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'interface':
        case 'intf/oi':
          await crudClient.deleteInterface(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'function_group':
        case 'fugr/f':
          await crudClient.deleteFunctionGroup(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'function_module':
        case 'fugr/ff':
          if (!function_group_name) {
            return return_error(new Error('function_group_name is required for function_module deletion'));
          }
          await crudClient.deleteFunctionModule(objectName, function_group_name, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'table':
        case 'tabl/dt':
          await crudClient.deleteTable(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'structure':
        case 'ttyp/st':
          await crudClient.deleteStructure(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'view':
        case 'ddls/df':
          await crudClient.deleteView(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'domain':
        case 'doma/dm':
          await crudClient.deleteDomain(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'data_element':
        case 'dtel/de':
          await crudClient.deleteDataElement(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'package':
        case 'devc/k':
          await crudClient.deletePackage(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'behavior_definition':
        case 'bdef/bd':
          await crudClient.deleteBehaviorDefinition(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        case 'metadata_extension':
        case 'ddlx/ex':
          await crudClient.deleteMetadataExtension(objectName, transport_request);
          response = crudClient.getDeleteResult();
          break;
        default:
          return return_error(new Error(`Unsupported object_type: ${object_type}`));
      }

      if (!response) {
        throw new Error(`Delete did not return a response for object ${objectName}`);
      }

      logger.info(`✅ DeleteObject completed successfully: ${objectName}`);

      return return_response({
        data: JSON.stringify(response.data, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error deleting object ${objectName}:`, error);

      // Parse error message for better user feedback
      let errorMessage = `Failed to delete object: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Object ${objectName} not found. It may already be deleted.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Object ${objectName} is locked by another user. Cannot delete.`;
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

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
