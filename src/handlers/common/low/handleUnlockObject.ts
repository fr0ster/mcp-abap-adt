/**
 * UnlockObject Handler - Unlock ABAP object after modification via ADT API
 *
 * Uses AdtClient unlock methods for specific object types.
 * Must reuse session_id and lock_handle from LockObject.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  restoreSessionInConnection,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockObjectLow',
  description:
    '[low-level] Unlock an ABAP object after modification. Must use the same session_id and lock_handle from the LockObject operation.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description:
          'Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM, ZIF_MY_INTERFACE). For function modules, use format GROUP|FM_NAME',
      },
      object_type: {
        type: 'string',
        description: 'Object type',
        enum: [
          'class',
          'program',
          'interface',
          'function_group',
          'function_module',
          'table',
          'structure',
          'view',
          'domain',
          'data_element',
          'package',
          'behavior_definition',
          'metadata_extension',
        ],
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockObject operation',
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from LockObject operation. Must be the same session.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from LockObject (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['object_name', 'object_type', 'lock_handle', 'session_id'],
  },
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

export async function handleUnlockObject(
  context: HandlerContext,
  args: UnlockObjectArgs,
) {
  const { connection, logger } = context;
  try {
    const { object_name, object_type, lock_handle, session_id, session_state } =
      args as UnlockObjectArgs;

    if (!object_name || !object_type || !lock_handle || !session_id) {
      return return_error(
        new Error(
          'object_name, object_type, lock_handle, and session_id are required',
        ),
      );
    }

    const validTypes = [
      'class',
      'program',
      'interface',
      'function_group',
      'function_module',
      'table',
      'structure',
      'view',
      'domain',
      'data_element',
      'package',
      'behavior_definition',
      'metadata_extension',
    ];
    const objectType = object_type.toLowerCase();
    if (!validTypes.includes(objectType)) {
      return return_error(
        new Error(
          `Invalid object_type. Must be one of: ${validTypes.join(', ')}`,
        ),
      );
    }

    const client = new AdtClient(connection);

    if (session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
    }

    const objectName = object_name.toUpperCase();

    logger?.info(
      `Starting object unlock: ${objectName} (session: ${session_id.substring(0, 8)}...)`,
    );

    try {
      switch (objectType) {
        case 'class':
          await client
            .getClass()
            .unlock({ className: objectName }, lock_handle);
          break;
        case 'program':
          await client
            .getProgram()
            .unlock({ programName: objectName }, lock_handle);
          break;
        case 'interface':
          await client
            .getInterface()
            .unlock({ interfaceName: objectName }, lock_handle);
          break;
        case 'function_group':
          await client
            .getFunctionGroup()
            .unlock({ functionGroupName: objectName }, lock_handle);
          break;
        case 'function_module':
          return return_error(
            new Error(
              'Function module unlocking via UnlockObject is not supported. Use function-module-specific handler.',
            ),
          );
        case 'table':
          await client
            .getTable()
            .unlock({ tableName: objectName }, lock_handle);
          break;
        case 'structure':
          await client
            .getStructure()
            .unlock({ structureName: objectName }, lock_handle);
          break;
        case 'view':
          await client.getView().unlock({ viewName: objectName }, lock_handle);
          break;
        case 'domain':
          await client
            .getDomain()
            .unlock({ domainName: objectName }, lock_handle);
          break;
        case 'data_element':
          await client
            .getDataElement()
            .unlock({ dataElementName: objectName }, lock_handle);
          break;
        case 'package':
          await client
            .getPackage()
            .unlock({ packageName: objectName }, lock_handle);
          break;
        case 'behavior_definition':
          await client
            .getBehaviorDefinition()
            .unlock({ name: objectName }, lock_handle);
          break;
        case 'metadata_extension':
          await client
            .getMetadataExtension()
            .unlock({ name: objectName }, lock_handle);
          break;
        default:
          return return_error(
            new Error(`Unsupported object_type: ${object_type}`),
          );
      }

      logger?.info(`✅ UnlockObject completed: ${objectName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            object_name: objectName,
            object_type: objectType,
            session_id,
            session_state: null, // Session state management is now handled by auth-broker,
            message: `Object ${objectName} unlocked successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(`Error unlocking object ${objectName}:`, error);

      let errorMessage = `Failed to unlock object: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Object ${objectName} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle or session. Use the same session_id and lock_handle from LockObject.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
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
