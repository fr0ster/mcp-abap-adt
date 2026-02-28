/**
 * WhereUsed handler using AdtClient utilities
 * Endpoint: /sap/bc/adt/repository/informationsystem/usageReferences
 * Uses getWhereUsedList for parsed results
 */

import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { ErrorCode, McpError } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetWhereUsed',
  description:
    '[read-only] Retrieve where-used references for ABAP objects via ADT usageReferences. Returns parsed list of referencing objects with their types and packages.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description: 'Name of the ABAP object',
      },
      object_type: {
        type: 'string',
        description:
          'Type of the ABAP object (class, interface, program, table, etc.)',
      },
      enable_all_types: {
        type: 'boolean',
        description:
          "If true, searches in all available object types (Eclipse 'select all' behavior). Default: false (uses SAP default scope)",
        default: false,
      },
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface WhereUsedArgs {
  object_name: string;
  object_type: string;
  enable_all_types?: boolean;
}

/**
 * Returns where-used references for ABAP objects using AdtClient utilities.
 * Uses getWhereUsedList for parsed structured results.
 */
export async function handleGetWhereUsed(
  context: HandlerContext,
  args: WhereUsedArgs,
) {
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
    logger?.info(
      `Resolving where-used list for ${typedArgs.object_type}/${typedArgs.object_name}`,
    );

    // Create AdtClient and get utilities
    const client = createAdtClient(connection, logger);
    const utils = client.getUtils();

    // Use getWhereUsedList for parsed results
    const result = await utils.getWhereUsedList({
      object_name: typedArgs.object_name,
      object_type: typedArgs.object_type,
      enableAllTypes: typedArgs.enable_all_types,
    });

    logger?.debug(
      `Where-used search completed for ${typedArgs.object_type}/${typedArgs.object_name}: ${result.totalReferences} references`,
    );

    // Format response with parsed data
    const formattedResponse = {
      object_name: result.objectName,
      object_type: result.objectType,
      enable_all_types: typedArgs.enable_all_types || false,
      total_references: result.totalReferences,
      result_description: result.resultDescription,
      references: result.references.map((ref) => ({
        name: ref.name,
        type: ref.type,
        uri: ref.uri,
        package_name: ref.packageName,
        responsible: ref.responsible,
        usage_information: ref.usageInformation,
      })),
    };

    const mcpResult = {
      isError: false,
      content: [
        {
          type: 'json',
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
          type: 'text',
          text: `ADT error: ${String(error)}`,
        },
      ],
    };
  }
}
