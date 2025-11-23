/**
 * UnlockObject Handler - Unlock ABAP object after modification via ADT API
 *
 * Uses unlock functions from @mcp-abap-adt/adt-clients/core for all operations.
 * Must use the same session_id and lock_handle from the LockObject operation.
 */

import { AxiosResponse } from '../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UnlockObject",
  description: "Unlock an ABAP object after modification. Must use the same session_id and lock_handle from the LockObject operation.",
  inputSchema: {
    type: "object",
    properties: {
      object_name: {
        type: "string",
        description: "Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME"
      },
      object_type: {
        type: "string",
        description: "Object type: 'class', 'program', 'interface', 'function_group', 'function_module', 'table', 'structure', 'view', 'domain', 'data_element', 'package', 'behavior_definition', 'metadata_extension'",
        enum: ["class", "program", "interface", "function_group", "function_module", "table", "structure", "view", "domain", "data_element", "package", "behavior_definition", "metadata_extension"]
      },
      lock_handle: {
        type: "string",
        description: "Lock handle from LockObject operation"
      },
      session_id: {
        type: "string",
        description: "Session ID from LockObject operation. Must be the same as used in LockObject."
      },
      session_state: {
        type: "object",
        description: "Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["object_name", "object_type", "lock_handle", "session_id"]
  }
} as const;

interface UnlockObjectArgs {
  object_name: string;
  object_type: string;
  lock_handle: string;
  session_id: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for UnlockObject MCP tool
 *
 * Uses unlock functions from @mcp-abap-adt/adt-clients/core for all operations
 */
export async function handleUnlockObject(args: any) {
  try {
    const {
      object_name,
      object_type,
      lock_handle,
      session_id,
      session_state
    } = args as UnlockObjectArgs;

    // Validation
    if (!object_name || !object_type || !lock_handle || !session_id) {
      return return_error(new Error('object_name, object_type, lock_handle, and session_id are required'));
    }

    const validTypes = ['class', 'program', 'interface', 'function_group', 'function_module', 'table', 'structure', 'view', 'domain', 'data_element', 'package', 'behavior_definition', 'metadata_extension'];
    if (!validTypes.includes(object_type.toLowerCase())) {
      return return_error(new Error(`Invalid object_type. Must be one of: ${validTypes.join(', ')}`));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    const objectName = object_name.toUpperCase();
    const objectType = object_type.toLowerCase();

    logger.info(`Starting object unlock: ${objectName} (type: ${objectType}, session: ${session_id.substring(0, 8)}...)`);

    try {
      // Call appropriate unlock method based on object type
      switch (objectType) {
        case 'class':
          await client.unlockClass(objectName, lock_handle);
          break;
        case 'program':
          await client.unlockProgram(objectName, lock_handle);
          break;
        case 'interface':
          await client.unlockInterface(objectName, lock_handle);
          break;
        case 'function_group':
          await client.unlockFunctionGroup(objectName, lock_handle);
          break;
        case 'function_module':
          // Function module requires function group name which is not provided in this generic handler
          return return_error(new Error('Function module unlocking via UnlockObject is not supported. Function modules require function group name.'));
        case 'table':
          await client.unlockTable(objectName, lock_handle);
          break;
        case 'structure':
          await client.unlockStructure(objectName, lock_handle);
          break;
        case 'view':
          await client.unlockView(objectName, lock_handle);
          break;
        case 'domain':
          await client.unlockDomain(objectName, lock_handle);
          break;
        case 'data_element':
          await client.unlockDataElement(objectName, lock_handle);
          break;
        case 'behavior_definition':
          await client.unlockBehaviorDefinition(objectName, lock_handle);
          break;
        case 'metadata_extension':
          await client.unlockMetadataExtension(objectName, lock_handle);
          break;
        case 'package':
          // Package requires superPackage parameter - need to fetch it or handle differently
          return return_error(new Error('Package unlocking via UnlockObject is not supported. Use specific package operations.'));
        default:
          return return_error(new Error(`Unsupported object_type: ${object_type}`));
      }

      // Get updated session state after unlock
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ UnlockObject completed: ${objectName}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          object_name: objectName,
          object_type: objectType,
          session_id: session_id,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Object ${objectName} unlocked successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error unlocking object ${objectName}:`, error);

      // Parse error message
      let errorMessage = `Failed to unlock object: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Object ${objectName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Make sure you're using the same session_id and lock_handle from LockObject.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
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
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}

