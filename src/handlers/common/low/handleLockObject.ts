/**
 * LockObject Handler - Lock ABAP object for modification via ADT API
 *
 * Uses CrudClient lock methods for specific object types.
 * Returns lock handle that must be reused with the same session.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection  } from '../../../lib/utils';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';
import { generateSessionId } from '../../../lib/sessionUtils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { HandlerContext } from '../../../lib/handlers/interfaces';

export const TOOL_DEFINITION = {
  name: "LockObjectLow",
  description: "[low-level] Lock an ABAP object for modification. Returns lock handle that must be used in subsequent update/unlock operations with the same session_id.",
  inputSchema: {
    type: "object",
    properties: {
      object_name: { type: "string", description: "Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME" },
      object_type: { type: "string", description: "Object type", enum: ["class", "program", "interface", "function_group", "function_module", "table", "structure", "view", "domain", "data_element", "package", "behavior_definition", "metadata_extension"] },
      super_package: { type: "string", description: "Super package (required for package locking)" },
      session_id: { type: "string", description: "Session ID from GetSession. If not provided, a new session will be created." },
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
  super_package?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

export async function handleLockObject(context: HandlerContext, args: LockObjectArgs) {
  const { connection, logger } = context;
  try {
    const handlerLogger = getHandlerLogger(
      'handleLockObject',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    const { object_name, object_type, super_package, session_id, session_state } = args as LockObjectArgs;

    if (!object_name || !object_type) {
      return return_error(new Error('object_name and object_type are required'));
    }

    const validTypes = ['class', 'program', 'interface', 'function_group', 'function_module', 'table', 'structure', 'view', 'domain', 'data_element', 'package', 'behavior_definition', 'metadata_extension'];
    const objectType = object_type.toLowerCase();
    if (!validTypes.includes(objectType)) {
      return return_error(new Error(`Invalid object_type. Must be one of: ${validTypes.join(', ')}`));
    }

        const client = new CrudClient(connection);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
          }

    const desiredSessionId = session_id || generateSessionId();
    const objectName = object_name.toUpperCase();

    logger.info(`Starting object lock: ${objectName} (type: ${objectType}, session: ${desiredSessionId.substring(0, 8)}...)`);

    try {
      let lockHandle: string | undefined;

      switch (objectType) {
        case 'class':
          await client.lockClass({ className: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'program':
          await client.lockProgram({ programName: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'interface':
          await client.lockInterface({ interfaceName: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'function_group':
          await client.lockFunctionGroup({ functionGroupName: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'function_module':
          return return_error(new Error('Function module locking via LockObject is not supported. Use function-module-specific handler.'));
        case 'table':
          await client.lockTable({ tableName: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'structure':
          await client.lockStructure({ structureName: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'view':
          await client.lockView({ viewName: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'domain':
          await client.lockDomain({ domainName: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'data_element':
          await client.lockDataElement({ dataElementName: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'behavior_definition':
          await client.lockBehaviorDefinition({ name: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'metadata_extension':
          await client.lockMetadataExtension({ name: objectName });
          lockHandle = client.getLockHandle();
          break;
        case 'package':
          if (!super_package) {
            return return_error(new Error('super_package is required for package locking.'));
          }
          await client.lockPackage({ packageName: objectName, superPackage: super_package.toUpperCase() });
          lockHandle = client.getLockHandle();
          break;
        default:
          return return_error(new Error(`Unsupported object_type: ${object_type}`));
      }

      if (!lockHandle) {
        throw new Error(`Lock did not return a lock handle for object ${objectName}`);
      }

      logger.info(`✅ LockObject completed: ${objectName}`);
      logger.info(`   Lock handle: ${lockHandle.substring(0, 20)}...`);

      return return_response({
        data: JSON.stringify({
          success: true,
          object_name: objectName,
          object_type: objectType,
          session_id: desiredSessionId,
          lock_handle: lockHandle,
          session_state: null, // Session state management is now handled by auth-broker
          message: `Object ${objectName} locked successfully. Use this lock_handle and session_id for subsequent update/unlock operations.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error locking object ${objectName}:`, error);

      let errorMessage = `Failed to lock object: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Object ${objectName} not found.`;
      } else if (error.response?.status === 409) {
        errorMessage = `Object ${objectName} is already locked by another user.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const errorData = parser.parse(error.response.data);
          const errorMsg = errorData['exc:exception']?.message?.['#text'] || errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch {
          // ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
