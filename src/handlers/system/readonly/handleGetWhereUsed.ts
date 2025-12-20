/**
 * WhereUsed handler using AdtClient utilities
 * Endpoint: /sap/bc/adt/repository/informationsystem/usageReferences
 * Uses two-step workflow matching Eclipse ADT behavior
 */
import { McpError, ErrorCode } from '../../../lib/utils';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { AdtClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  "name": "GetWhereUsed",
  "description": "[read-only] Retrieve where-used references for ABAP objects via ADT usageReferences. Uses Eclipse ADT-compatible two-step workflow with optional scope customization.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "object_name": {
        "type": "string",
        "description": "Name of the ABAP object"
      },
      "object_type": {
        "type": "string",
        "description": "Type of the ABAP object (class, interface, program, table, etc.)"
      },
      "enable_all_types": {
        "type": "boolean",
        "description": "If true, searches in all available object types (Eclipse 'select all' behavior). Default: false (uses SAP default scope)",
        "default": false
      }
    },
    "required": [
      "object_name",
      "object_type"
    ]
  }
} as const;

interface WhereUsedArgs {
  object_name: string;
  object_type: string;
  enable_all_types?: boolean;
}

/**
 * Returns where-used references for ABAP objects using AdtClient utilities.
 *
 * Two-step workflow:
 * 1. Fetch scope configuration (if enable_all_types is true)
 * 2. Execute where-used search with scope
 */
export async function handleGetWhereUsed(context: HandlerContext, args: WhereUsedArgs) {
  const { connection, logger } = context;
  try {
    // Validate required parameters
    if (!args?.object_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Object name is required');
    }

    if (!args?.object_type) {
      throw new McpError(ErrorCode.InvalidParams, 'Object type is required');
    }

    const typedArgs = args as WhereUsedArgs;
    logger?.info(`Resolving where-used list for ${typedArgs.object_type}/${typedArgs.object_name}`);

    // Create AdtClient and get utilities
    const client = new AdtClient(connection, logger);
    const utils = client.getUtils();

    let scopeXml: string | undefined;

    // Step 1: If enable_all_types is true, fetch and modify scope
    if (typedArgs.enable_all_types === true) {
      logger?.info('Fetching scope with all types enabled (Eclipse "select all" behavior)');

      const scopeResponse = await utils.getWhereUsedScope({
        object_name: typedArgs.object_name,
        object_type: typedArgs.object_type
      });

      // Modify scope to enable all types
      scopeXml = utils.modifyWhereUsedScope(scopeResponse.data, {
        enableAll: true
      });
    }

    // Step 2: Execute where-used search
    // If scopeXml is undefined, getWhereUsed will auto-fetch default scope
    const result = await utils.getWhereUsed({
      object_name: typedArgs.object_name,
      object_type: typedArgs.object_type,
      scopeXml
    });

    logger?.debug(`Where-used search completed for ${typedArgs.object_type}/${typedArgs.object_name}`);

    // Parse numberOfResults from XML
    const numberOfResults = result.data?.match(/numberOfResults="(\d+)"/)?.[1] || '0';

    // Format response
    const formattedResponse = {
      object_name: typedArgs.object_name,
      object_type: typedArgs.object_type,
      enable_all_types: typedArgs.enable_all_types || false,
      total_references: parseInt(numberOfResults, 10),
      raw_xml: result.data
    };

    const mcpResult = {
      isError: false,
      content: [
        {
          type: "json",
          json: formattedResponse,
        },
      ],
    };
    objectsListCache.setCache(mcpResult);
    return mcpResult;

  } catch (error) {
    logger?.error('Failed to resolve where-used references', error as any);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `ADT error: ${String(error)}`
        }
      ]
    };
  }
}
