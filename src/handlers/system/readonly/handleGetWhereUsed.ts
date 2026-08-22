/**
 * WhereUsed handler using AdtClient utilities
 * Endpoint: /sap/bc/adt/repository/informationsystem/usageReferences
 * Uses getWhereUsedList for parsed results
 */

import { createAdtClient } from '../../../lib/clients';
import { objectsListCache } from '../../../lib/getObjectsListCache';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetWhereUsed',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Search where-used references — find all objects that reference or depend on a given ABAP object. Answers: "where is X used", "who calls X", "what depends on X", "show usages of X". Returns referencing objects with types and packages. Supports a fixed set of object types (see object_type). Object types outside the supported list (e.g. RAP behavior definitions, service definitions/bindings, BAdI, search helps, message classes, classic DDIC views) are NOT supported and will fail.',
  inputSchema: {
    type: 'object',
    properties: {
      object_name: {
        type: 'string',
        description:
          "Name of the ABAP object. For function modules the name MUST be in the form 'GROUP|FM_NAME' (function group name, pipe, function module name).",
      },
      object_type: {
        type: 'string',
        description:
          "Type of the ABAP object. Case-insensitive. Accepts either a human alias or an ADT type code. Supported values: 'class' / 'clas/oc', 'interface' / 'intf/if', 'program' / 'prog/p', 'include', 'function' / 'functiongroup' / 'fugr' (function group), 'functionmodule' / 'function_module' / 'fugr/ff' (function module — see object_name format), 'package' / 'devc/k', 'table' / 'tabl/dt', 'structure' / 'stru/dt', 'domain' / 'doma/dd', 'dataelement' / 'dtel', 'view' / 'ddls/df' (CDS DDL source only — classic DDIC views are not supported). Any other value throws 'Unsupported object type'.",
      },
      enable_all_types: {
        type: 'boolean',
        description:
          "If true, expands the scope to all available object types (Eclipse 'select all' behavior) by flipping every isSelected flag in the scope XML. Default: false (SAP default scope). Note: on large systems this can make the search significantly slower.",
        default: false,
      },
      enable_only_types: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Restrict the search to ONLY these ADT object types (e.g. ['TABL/DS','TABL/DT'] for structures, ['DDLS/DF'] for CDS sources). SAP applies the selection server-side, so unwanted types (e.g. hundreds of CLAS/OC) are never searched nor returned — use this instead of enable_all_types to avoid huge result sets. Values must be object-type codes from THIS object's where-used scope (the searchable categories, e.g. 'CLAS/OC','INTF/OI','FUGR/FF','DDLS/DF', not result-row codes like 'FUGR/F'). If any value is not searchable for the object the call returns an error listing the supported types — it never falls back to the unfiltered default set. Takes precedence over enable_all_types.",
      },
      disable_types: {
        type: 'array',
        items: { type: 'string' },
        description:
          "Remove these ADT object types from the default scope, keeping the rest (e.g. ['CLAS/OC'] to drop class usages). Applied on top of the default scope or of enable_only_types/enable_all_types.",
      },
    },
    required: ['object_name', 'object_type'],
  },
} as const;

interface WhereUsedArgs {
  object_name: string;
  object_type: string;
  enable_all_types?: boolean;
  enable_only_types?: string[];
  disable_types?: string[];
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
      return return_error('Object name is required');
    }

    if (!args?.object_type) {
      return return_error('Object type is required');
    }

    const typedArgs = args as WhereUsedArgs;
    logger?.info(
      `Resolving where-used list for ${typedArgs.object_type}/${typedArgs.object_name}`,
    );

    // Create AdtClient and get utilities
    const client = createAdtClient(connection, logger);
    const utils = client.getUtils();

    // Validate enable_only_types against the object's where-used scope. The
    // scope lists exactly which object types are searchable for THIS object;
    // selecting a type that is absent would otherwise leave an all-deselected
    // scope, which SAP silently treats as "default" and returns the full,
    // unfiltered result set. We refuse that: only valid scope types are
    // searched, anything else is an explicit error — so we return only what
    // was asked for, never extra.
    if (typedArgs.enable_only_types && typedArgs.enable_only_types.length > 0) {
      const scopeResponse = await utils.getWhereUsedScope({
        object_name: typedArgs.object_name,
        object_type: typedArgs.object_type,
      });
      const available = new Set<string>(
        [
          ...String(scopeResponse.data).matchAll(
            /<usagereferences:type\b[^>]*\bname="([^"]+)"/g,
          ),
        ].map((m) => m[1]),
      );
      const unknown = typedArgs.enable_only_types.filter(
        (t) => !available.has(t),
      );
      if (unknown.length > 0) {
        return return_error(
          `enable_only_types contains object type(s) not searchable in the where-used scope of ${typedArgs.object_type}/${typedArgs.object_name}: ${unknown.join(', ')}. ` +
            `Supported types for this object: ${[...available].sort().join(', ')}.`,
        );
      }
    }

    // Use getWhereUsedList for parsed results
    const result = await utils.getWhereUsedList({
      object_name: typedArgs.object_name,
      object_type: typedArgs.object_type,
      enableAllTypes: typedArgs.enable_all_types,
      enableOnlyTypes: typedArgs.enable_only_types,
      disableTypes: typedArgs.disable_types,
    });

    logger?.debug(
      `Where-used search completed for ${typedArgs.object_type}/${typedArgs.object_name}: ${result.totalReferences} references`,
    );

    // Format response with parsed data
    const formattedResponse = {
      object_name: result.objectName,
      object_type: result.objectType,
      enable_all_types: typedArgs.enable_all_types || false,
      enable_only_types: typedArgs.enable_only_types,
      disable_types: typedArgs.disable_types,
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
    return return_error(error);
  }
}
