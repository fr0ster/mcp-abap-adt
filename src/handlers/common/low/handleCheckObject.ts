/**
 * CheckObject Handler - Syntax check for ABAP objects via ADT API.
 * Uses CrudClient check methods per object type.
 */

import { AbapConnection } from '@mcp-abap-adt/connection';
import { CrudClient } from '@mcp-abap-adt/adt-clients';
import { return_error, return_response, logger as baseLogger, restoreSessionInConnection, AxiosResponse } from '../../../lib/utils';
import { parseCheckRunResponse } from '../../../lib/checkRunParser';
import { getHandlerLogger, noopLogger } from '../../../lib/handlerLogger';

export const TOOL_DEFINITION = {
  name: "CheckObjectLow",
  description: "[low-level] Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages.",
  inputSchema: {
    type: "object",
    properties: {
      object_name: { type: "string", description: "Object name (e.g., ZCL_MY_CLASS, Z_MY_PROGRAM)" },
      object_type: { type: "string", description: "Object type", enum: ["class", "program", "interface", "function_group", "table", "structure", "view", "domain", "data_element", "behavior_definition", "metadata_extension"] },
      version: { type: "string", description: "Version to check: 'active' or 'inactive' (default active)", enum: ["active", "inactive"] },
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

export async function handleCheckObject(connection: AbapConnection, args: CheckObjectArgs) {
  try {
    const handlerLogger = getHandlerLogger(
      'handleCheckObject',
      process.env.DEBUG_HANDLERS === 'true' ? baseLogger : noopLogger
    );

    const { object_name, object_type, version = 'active', session_id, session_state } = args as CheckObjectArgs;

    if (!object_name || !object_type) {
      return return_error(new Error('object_name and object_type are required'));
    }

    const validTypes = ['class', 'program', 'interface', 'function_group', 'table', 'structure', 'view', 'domain', 'data_element', 'behavior_definition', 'metadata_extension'];
    const objectType = object_type.toLowerCase();
    if (!validTypes.includes(objectType)) {
      return return_error(new Error(`Invalid object_type. Must be one of: ${validTypes.join(', ')}`));
    }

    const validVersions = ['active', 'inactive'];
    const checkVersion = validVersions.includes(version.toLowerCase()) ? version.toLowerCase() as 'active' | 'inactive' : 'active';

        const client = new CrudClient(connection);

    if (session_id && session_state) {
      await restoreSessionInConnection(connection, session_id, session_state);
    } else {
          }

    const objectName = object_name.toUpperCase();
    handlerLogger.info(`Starting object check: ${objectName} (type: ${objectType}, version: ${checkVersion})`);

    try {
      switch (objectType) {
        case 'class':
          await client.checkClass({ className: objectName }, undefined, checkVersion);
          break;
        case 'program':
          await client.checkProgram({ programName: objectName }, undefined, checkVersion);
          break;
        case 'interface':
          await client.checkInterface({ interfaceName: objectName }, undefined, checkVersion);
          break;
        case 'function_group':
          await client.checkFunctionGroup({ functionGroupName: objectName });
          break;
        case 'table':
          await client.checkTable({ tableName: objectName }, undefined, checkVersion);
          break;
        case 'structure':
          await client.checkStructure({ structureName: objectName }, undefined, checkVersion);
          break;
        case 'view':
          await client.checkView({ viewName: objectName }, undefined, checkVersion);
          break;
        case 'domain':
          await client.checkDomain({ domainName: objectName }, checkVersion);
          break;
        case 'data_element':
          await client.checkDataElement({ dataElementName: objectName }, checkVersion);
          break;
        case 'behavior_definition':
          await client.checkBehaviorDefinition({ name: objectName });
          break;
        case 'metadata_extension':
          await client.checkMetadataExtension({ name: objectName }, undefined, checkVersion);
          break;
        default:
          return return_error(new Error(`Unsupported object_type: ${object_type}`));
      }

      const response = client.getCheckResult();
      if (!response) {
        throw new Error('Check did not return a response');
      }

      const checkResult = parseCheckRunResponse(response);
      

      handlerLogger.info(`✅ CheckObject completed: ${objectName}`);
      handlerLogger.info(`   Status: ${checkResult.status}`);
      handlerLogger.info(`   Errors: ${checkResult.errors.length}, Warnings: ${checkResult.warnings.length}`);

      return return_response({
        data: JSON.stringify({
          success: checkResult.success,
          object_name: objectName,
          object_type: objectType,
          version: checkVersion,
          check_result: checkResult,
          session_id: session_id || null,
          session_state: null, // Session state management is now handled by auth-broker,
          message: checkResult.success
            ? `Object ${objectName} has no syntax errors`
            : `Object ${objectName} has ${checkResult.errors.length} error(s) and ${checkResult.warnings.length} warning(s)`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      handlerLogger.error(`Error checking object ${objectName}:`, error);

      let errorMessage = `Failed to check object: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Object ${objectName} not found.`;
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
