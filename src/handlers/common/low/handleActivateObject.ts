/**
 * ActivateObject Handler - Universal ABAP Object Activation via ADT API
 *
 * Uses activateObjectsGroup and parseActivationResponse from @mcp-abap-adt/adt-clients/core for all operations.
 * Connection management handled internally.
 *
 * Activates one or multiple ABAP repository objects using ADT activation endpoint.
 * This is a stateless operation - no session management or locking required.
 */

import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient, ObjectReference } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "ActivateObjectLow",
  description: "[low-level] Activate one or multiple ABAP repository objects. Works with any object type: classes, programs, tables, views, domains, data elements, etc. URI is auto-generated from name and type. Returns activation status and any warnings/errors.",
  inputSchema: {
    type: "object",
    properties: {
      objects: {
        type: "array",
        description: "Array of objects to activate. Each object must have 'name' and 'type'. URI is auto-generated.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Object name in uppercase (e.g., 'ZCL_MY_CLASS', 'Z_MY_PROGRAM', 'ZOK_I_MARKET_0001')"
            },
            type: {
              type: "string",
              description: "Object type code (e.g., 'CLAS/OC', 'PROG/P', 'DDLS/DF', 'TABL/DT'). URI will be auto-generated from this."
            },
            uri: {
              type: "string",
              description: "Optional: Object URI in ADT format. If not provided, will be auto-generated from name and type."
            }
          },
          required: ["name", "type"]
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

interface ActivationObject extends ObjectReference {
  uri?: string;
}

interface ActivateObjectArgs {
  objects: ActivationObject[];
  preaudit?: boolean;
}



/**
 * Main handler for ActivateObject MCP tool
 *
 * Uses activateObjectsGroup and parseActivationResponse from @mcp-abap-adt/adt-clients/core for all operations
 * Connection management handled internally
 *
 * This is a stateless operation - no session management needed.
 * Activation endpoint handles multiple objects in one request.
 */
export async function handleActivateObject(params: any) {
  try {
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

    const connection = getManagedConnection();
    const preaudit = args.preaudit !== false; // Default: true
    const client = new CrudClient(connection);

    logger.info(`Starting activation of ${args.objects.length} object(s)`);

    try {
      // Prepare objects for group activation
      const activationObjects = args.objects.map(obj => ({
        type: obj.type,
        name: obj.name.toUpperCase()
      }));

      logger.debug('Activating objects:', activationObjects);

      // Make group activation request using CrudClient
      const response = await client.activateObjectsGroup(activationObjects, preaudit);

      // Debug: log raw response
      logger.debug('Activation response status:', response.status);
      logger.debug('Activation response data:', typeof response.data === 'string' ? response.data.substring(0, 500) : response.data);

      // Parse response
      const activationResult = client.parseActivationResponse(response.data);
      const success = activationResult.activated && activationResult.checked;

      // Build result object
      const result = {
        success,
        objects_count: args.objects.length,
        objects: activationObjects.map((obj, idx) => ({
          name: obj.name,
          uri: args.objects[idx].uri,
          type: args.objects[idx].type
        })),
        activation: {
          activated: activationResult.activated,
          checked: activationResult.checked,
          generated: activationResult.generated
        },
        messages: activationResult.messages,
        warnings: activationResult.messages.filter(m => m.type === 'warning' || m.type === 'W'),
        errors: activationResult.messages.filter(m => m.type === 'error' || m.type === 'E'),
        message: success
          ? `Successfully activated ${args.objects.length} object(s)`
          : `Activation completed with issues: ${activationResult.messages.length} message(s)`
      };

      logger.info(`Activation completed: ${success ? 'SUCCESS' : 'WITH ISSUES'}`);

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
        : error.message || String(error);

      logger.error(`Activation failed:`, errorMessage);
      return return_error(new Error(`Failed to activate objects: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
