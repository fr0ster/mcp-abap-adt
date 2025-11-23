/**
 * LockObject Handler - Lock ABAP object for modification via ADT API
 *
 * Uses lock functions from @mcp-abap-adt/adt-clients/core for all operations.
 * Returns lock handle that must be used in subsequent requests with the same session_id.
 */

import { AxiosResponse } from '../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../lib/utils';
import { generateSessionId } from '../../lib/sessionUtils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "LockObject",
  description: "Lock an ABAP object for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id. Use GetSession first to get a session_id, then use that session_id for lock, update, and unlock operations.",
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
      session_id: {
        type: "string",
        description: "Session ID from GetSession. If not provided, a new session will be created."
      },
      session_state: {
        type: "object",
        description: "Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.",
        properties: {
          cookies: { type: "string" },
          csrf_token: { type: "string" },
          cookie_store: { type: "object" }
        }
      }
    },
    required: ["object_name", "object_type"]
  }
} as const;

interface LockObjectArgs {
  object_name: string;
  object_type: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * Main handler for LockObject MCP tool
 *
 * Uses lock functions from @mcp-abap-adt/adt-clients/core for all operations
 */
export async function handleLockObject(args: any) {
  try {
    const {
      object_name,
      object_type,
      session_id,
      session_state
    } = args as LockObjectArgs;

    // Validation
    if (!object_name || !object_type) {
      return return_error(new Error('object_name and object_type are required'));
    }

    const validTypes = ['class', 'program', 'interface', 'function_group', 'function_module', 'table', 'structure', 'view', 'domain', 'data_element', 'package'];
    if (!validTypes.includes(object_type.toLowerCase())) {
      return return_error(new Error(`Invalid object_type. Must be one of: ${validTypes.join(', ')}`));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Restore session state if provided
    if (session_id && session_state) {
      connection.setSessionState({
        cookies: session_state.cookies || null,
        csrfToken: session_state.csrf_token || null,
        cookieStore: session_state.cookie_store || {}
      });
    } else {
      // Ensure connection is established
      await connection.connect();
    }

    // Use provided session_id or generate new one
    const desiredSessionId = session_id || generateSessionId();
    const objectName = object_name.toUpperCase();
    const objectType = object_type.toLowerCase();

    logger.info(`Starting object lock: ${objectName} (type: ${objectType}, session: ${desiredSessionId.substring(0, 8)}...)`);

    try {
      let lockHandle: string | undefined;

      // Call appropriate lock method based on object type
      switch (objectType) {
        case 'class':
          await client.lockClass(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'program':
          await client.lockProgram(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'interface':
          await client.lockInterface(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'function_group':
          await client.lockFunctionGroup(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'function_module':
          // Function module requires function group name which is not provided in this generic handler
          return return_error(new Error('Function module locking via LockObject is not supported. Function modules require function group name.'));
        case 'table':
          await client.lockTable(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'structure':
          await client.lockStructure(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'view':
          await client.lockView(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'domain':
          await client.lockDomain(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'data_element':
          await client.lockDataElement(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'behavior_definition':
          await client.lockBehaviorDefinition(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'metadata_extension':
          await client.lockMetadataExtension(objectName);
          lockHandle = client.getLockHandle();
          break;
        case 'package':
          // Package requires superPackage parameter - need to fetch it or handle differently
          return return_error(new Error('Package locking via LockObject is not supported. Use specific package operations.'));
        default:
          return return_error(new Error(`Unsupported object_type: ${object_type}`));
      }

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for object ${objectName}`);
      }

      // Get updated session state after lock
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ LockObject completed: ${objectName}`);
      logger.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          object_name: objectName,
          object_type: objectType,
          session_id: desiredSessionId,
          lock_handle: lockHandle,
          transport_request: null, // CrudClient doesn't expose transport request
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: `Object ${objectName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error locking object ${objectName}:`, error);

      // Parse error message
      let errorMessage = `Failed to lock object: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Object ${objectName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `Object ${objectName} is already locked by another user.`;
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

