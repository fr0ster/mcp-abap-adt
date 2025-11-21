/**
 * CheckObject Handler - Syntax check for ABAP objects via ADT API
 *
 * Uses runCheckRun and parseCheckRunResponse from @mcp-abap-adt/adt-clients/core for all operations.
 * Connection management handled internally.
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { parseCheckRunResponse } from '../lib/checkRunParser';

export const TOOL_DEFINITION = {
  name: "CheckObject",
  description: "Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages. Useful for validation during development. Can use session_id and session_state from GetSession to maintain the same session.",
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
      version: {
        type: "string",
        description: "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active",
        enum: ["active", "inactive"]
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

interface CheckObjectArgs {
  object_name: string;
  object_type: string;
  version?: string;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}


/**
 * Main handler for CheckObject MCP tool
 *
 * Uses runCheckRun and parseCheckRunResponse from @mcp-abap-adt/adt-clients/core for all operations
 * Connection management handled internally
 */
export async function handleCheckObject(args: any) {
  try {
    const {
      object_name,
      object_type,
      version = 'active',
      session_id,
      session_state
    } = args as CheckObjectArgs;

    // Validation
    if (!object_name || !object_type) {
      return return_error(new Error('object_name and object_type are required'));
    }

    const validTypes = ['class', 'program', 'interface', 'function_group', 'table', 'structure', 'view', 'domain', 'data_element'];
    if (!validTypes.includes(object_type.toLowerCase())) {
      return return_error(new Error(`Invalid object_type. Must be one of: ${validTypes.join(', ')}`));
    }

    const checkVersion = (version && ['active', 'inactive'].includes(version.toLowerCase()))
      ? version.toLowerCase() as 'active' | 'inactive'
      : 'active';

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

    const objectName = object_name.toUpperCase();

    logger.info(`Starting object check: ${objectName} (type: ${object_type}, version: ${checkVersion})`);

    try {
      const client = new CrudClient(connection);
      let response;

      // Call appropriate check method based on object type
      switch (object_type.toLowerCase()) {
        case 'class':
          await client.checkClass(objectName);
          response = client.getCheckResult();
          break;
        case 'program':
          await client.checkProgram(objectName);
          response = client.getCheckResult();
          break;
        case 'interface':
          await client.checkInterface(objectName);
          response = client.getCheckResult();
          break;
        case 'function_group':
          await client.checkFunctionGroup(objectName);
          response = client.getCheckResult();
          break;
        case 'table':
          await client.checkTable(objectName);
          response = client.getCheckResult();
          break;
        case 'structure':
          await client.checkStructure(objectName);
          response = client.getCheckResult();
          break;
        case 'view':
          await client.checkView(objectName);
          response = client.getCheckResult();
          break;
        case 'domain':
          await client.checkDomain(objectName);
          response = client.getCheckResult();
          break;
        case 'data_element':
          await client.checkDataElement(objectName);
          response = client.getCheckResult();
          break;
        default:
          return return_error(new Error(`Unsupported object_type: ${object_type}`));
      }

      if (!response) {
        throw new Error(`Check did not return a response for object ${objectName}`);
      }

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

      // Get updated session state after check
      const updatedSessionState = connection.getSessionState();

      logger.info(`✅ CheckObject completed: ${objectName}`);
      logger.info(`   Status: ${checkResult.status}`);
      logger.info(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          object_name: objectName,
          object_type,
          version: checkVersion,
          check_result: checkResult,
          session_id: session_id || null,
          session_state: updatedSessionState ? {
            cookies: updatedSessionState.cookies,
            csrf_token: updatedSessionState.csrfToken,
            cookie_store: updatedSessionState.cookieStore
          } : null,
          message: checkResult.success
            ? `Object ${objectName} has no syntax errors`
            : `Object ${objectName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error checking object ${objectName}:`, error);

      // Parse error message
      let errorMessage = `Failed to check object: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Object ${objectName} not found.`;
      } else if (error.response?.data && typeof error.response.data === 'string') {
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
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
