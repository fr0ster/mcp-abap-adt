/**
 * CheckObject Handler - Syntax check for ABAP objects via ADT API
 *
 * Uses runCheckRun and parseCheckRunResponse from @mcp-abap-adt/adt-clients/core for all operations.
 * Connection management handled internally.
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { runCheckRun, parseCheckRunResponse } from '@mcp-abap-adt/adt-clients/dist/core';

export const TOOL_DEFINITION = {
  name: "CheckObject",
  description: "Perform syntax check on an ABAP object without activation. Returns syntax errors, warnings, and messages. Useful for validation during development.",
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
      }
    },
    required: ["object_name", "object_type"]
  }
} as const;

interface CheckObjectArgs {
  object_name: string;
  object_type: string;
  version?: string;
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
      version = 'active'
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
    const objectName = object_name.toUpperCase();

    logger.info(`Starting object check: ${objectName} (type: ${object_type}, version: ${checkVersion})`);

    try {
      // Check object using adt-clients function
      const response = await runCheckRun(
        connection,
        object_type.toLowerCase(),
        objectName,
        checkVersion,
        'abapCheckRun'
      );

      // Parse check results
      const checkResult = parseCheckRunResponse(response);

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
