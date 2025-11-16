/**
 * LockObject Handler - Lock ABAP object for modification via ADT API
 *
 * Uses lock functions from @mcp-abap-adt/adt-clients/core for all operations.
 * Returns lock handle that must be used in subsequent requests with the same session_id.
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { generateSessionId } from '../lib/sessionUtils';
import { lockClass, unlockClass } from '@mcp-abap-adt/adt-clients/dist/core/class';
import { lockProgram, unlockProgram } from '@mcp-abap-adt/adt-clients/dist/core/program';
import { lockInterface, unlockInterface } from '@mcp-abap-adt/adt-clients/dist/core/interface';
import { lockFunctionGroup, unlockFunctionGroup } from '@mcp-abap-adt/adt-clients/dist/core/functionGroup';
import { lockFunctionModule, unlockFunctionModule } from '@mcp-abap-adt/adt-clients/dist/core/functionModule';
import { lockStructure, unlockStructure } from '@mcp-abap-adt/adt-clients/dist/core/structure';
import { acquireTableLockHandle } from '@mcp-abap-adt/adt-clients/dist/core/table';
import { unlockTable } from '@mcp-abap-adt/adt-clients/dist/core/table';
import { lockDomain, unlockDomain } from '@mcp-abap-adt/adt-clients/dist/core/domain';
import { lockDataElement, unlockDataElement } from '@mcp-abap-adt/adt-clients/dist/core/dataElement';
import { lockDDLS, unlockDDLS } from '@mcp-abap-adt/adt-clients/dist/core/view';
import { lockPackage, unlockPackage } from '@mcp-abap-adt/adt-clients/dist/core/package';

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
        description: "Object type: 'class', 'program', 'interface', 'function_group', 'function_module', 'table', 'structure', 'view', 'domain', 'data_element', 'package'",
        enum: ["class", "program", "interface", "function_group", "function_module", "table", "structure", "view", "domain", "data_element", "package"]
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
    const sessionId = session_id || generateSessionId();
    const objectName = object_name.toUpperCase();
    const objectType = object_type.toLowerCase();

    logger.info(`Starting object lock: ${objectName} (type: ${objectType}, session: ${sessionId.substring(0, 8)}...)`);

    try {
      let lockHandle: string;
      let corrNr: string | undefined;

      // Call appropriate lock function based on object type
      switch (objectType) {
        case 'class': {
          lockHandle = await lockClass(connection, objectName, sessionId);
          break;
        }
        case 'program': {
          lockHandle = await lockProgram(connection, objectName, sessionId);
          break;
        }
        case 'interface': {
          const result = await lockInterface(connection, objectName, sessionId);
          lockHandle = result.lockHandle;
          corrNr = result.corrNr;
          break;
        }
        case 'function_group': {
          lockHandle = await lockFunctionGroup(connection, objectName, sessionId);
          break;
        }
        case 'function_module': {
          if (!objectName.includes('|')) {
            return return_error(new Error('Function module name must be in format GROUP|FM_NAME'));
          }
          const [groupName, fmName] = objectName.split('|');
          lockHandle = await lockFunctionModule(connection, groupName, fmName, sessionId);
          break;
        }
        case 'table': {
          lockHandle = await acquireTableLockHandle(connection, objectName, sessionId);
          break;
        }
        case 'structure': {
          lockHandle = await lockStructure(connection, objectName, sessionId);
          break;
        }
        case 'view': {
          lockHandle = await lockDDLS(connection, objectName, sessionId);
          break;
        }
        case 'domain': {
          lockHandle = await lockDomain(connection, objectName, sessionId);
          break;
        }
        case 'data_element': {
          lockHandle = await lockDataElement(connection, objectName, sessionId);
          break;
        }
        case 'package': {
          lockHandle = await lockPackage(connection, objectName, sessionId);
          break;
        }
        default:
          return return_error(new Error(`Unsupported object type for lock: ${objectType}`));
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
          session_id: sessionId,
          lock_handle: lockHandle,
          transport_request: corrNr,
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

