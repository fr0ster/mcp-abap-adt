/**
 * UpdateDataElement Handler - Update Existing ABAP Data Element
 *
 * Uses DataElementBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> update -> check -> unlock -> (activate)
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  ErrorCode,
  isAlreadyExistsError,
  McpError,
  return_error,
  return_response,
  safeCheckOperation,
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';

export const TOOL_DEFINITION = {
  name: 'UpdateDataElement',
  description: `Update an existing ABAP data element in SAP system.

Workflow:
1. Gets domain info (if type_kind is 'domain') to extract dataType/length/decimals
2. Acquires lock on the data element
3. Updates data element with provided parameters (complete replacement)
4. Unlocks data element
5. Optionally activates data element (default: true)
6. Returns updated data element details

Supported type_kind values:
- domain: Based on ABAP domain (requires type_name = domain name)
- predefinedAbapType: Direct ABAP type (requires data_type, length, decimals)
- refToPredefinedAbapType: Reference to ABAP type (requires data_type, length, decimals)
- refToDictionaryType: Reference to another data element (requires type_name = data element name)
- refToClifType: Reference to class (requires type_name = class name)

Note: All provided parameters completely replace existing values. Field labels are truncated to max lengths (10/20/40/55).`,
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name to update (e.g., ZZ_TEST_DTEL_01)',
      },
      description: {
        type: 'string',
        description: 'New data element description',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZOK_LOCAL, $TMP for local objects)',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      type_kind: {
        type: 'string',
        description:
          'Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType',
        enum: [
          'domain',
          'predefinedAbapType',
          'refToPredefinedAbapType',
          'refToDictionaryType',
          'refToClifType',
        ],
        default: 'domain',
      },
      type_name: {
        type: 'string',
        description:
          'Type name: domain name, data element name, or class name (depending on type_kind)',
      },
      data_type: {
        type: 'string',
        description:
          'Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType',
      },
      length: {
        type: 'number',
        description:
          'Length - for predefinedAbapType or refToPredefinedAbapType',
      },
      decimals: {
        type: 'number',
        description:
          'Decimals - for predefinedAbapType or refToPredefinedAbapType',
      },
      field_label_short: {
        type: 'string',
        description: 'Short field label (max 10 chars)',
      },
      field_label_medium: {
        type: 'string',
        description: 'Medium field label (max 20 chars)',
      },
      field_label_long: {
        type: 'string',
        description: 'Long field label (max 40 chars)',
      },
      field_label_heading: {
        type: 'string',
        description: 'Heading field label (max 55 chars)',
      },
      search_help: {
        type: 'string',
        description: 'Search help name',
      },
      search_help_parameter: {
        type: 'string',
        description: 'Search help parameter',
      },
      set_get_parameter: {
        type: 'string',
        description: 'Set/Get parameter ID',
      },
      activate: {
        type: 'boolean',
        description: 'Activate data element after update (default: true)',
        default: true,
      },
    },
    required: ['data_element_name', 'package_name'],
  },
} as const;

interface DataElementArgs {
  data_element_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  type_kind?: string;
  type_name?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  field_label_short?: string;
  field_label_medium?: string;
  field_label_long?: string;
  field_label_heading?: string;
  search_help?: string;
  search_help_parameter?: string;
  set_get_parameter?: string;
  activate?: boolean;
}

/**
 * Main handler for UpdateDataElement tool
 *
 * Uses DataElementBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateDataElement(
  context: HandlerContext,
  args: DataElementArgs,
) {
  const { connection, logger } = context;
  try {
    if (!args?.data_element_name) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'Data element name is required',
      );
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(args.package_name, args.transport_request);

    const typedArgs = args as DataElementArgs;
    // Get connection from session context (set by ProtocolHandler)
    // Connection is managed and cached per session, with proper token refresh via AuthBroker
    const dataElementName = typedArgs.data_element_name.toUpperCase();

    logger?.info(`Starting data element update: ${dataElementName}`);

    try {
      type AdtClientsTypeKind =
        | 'domain'
        | 'predefinedAbapType'
        | 'refToPredefinedAbapType'
        | 'refToDictionaryType'
        | 'refToClifType';
      const rawTypeKind = (typedArgs.type_kind || 'domain')
        .toString()
        .toLowerCase();
      const typeKindMap: Record<string, AdtClientsTypeKind> = {
        domain: 'domain',
        builtin: 'predefinedAbapType',
        predefinedabaptype: 'predefinedAbapType',
        reftopredefinedabaptype: 'refToPredefinedAbapType',
        reftodictionarytype: 'refToDictionaryType',
        reftocliftype: 'refToClifType',
      };
      const typeKind = typeKindMap[rawTypeKind] || 'domain';

      // Create client
      const client = new AdtClient(connection);
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      // Validate (for update, "already exists" is expected - object must exist)
      let updateState: any | undefined;
      try {
        await client.getDataElement().validate({
          dataElementName,
          packageName: typedArgs.package_name,
          description: typedArgs.description || dataElementName,
        });
      } catch (validateError: any) {
        // For update operations, "already exists" is expected - object must exist
        if (!isAlreadyExistsError(validateError)) {
          // Real validation error - rethrow
          throw validateError;
        }
        // "Already exists" is OK for update - continue
        logger?.info(
          `Data element ${dataElementName} already exists - this is expected for update operation`,
        );
      }

      // Lock
      const lockHandle = await client
        .getDataElement()
        .lock({ dataElementName: dataElementName });

      try {
        // Update with properties
        const properties = {
          dataType: typedArgs.data_type,
          length: typedArgs.length,
          decimals: typedArgs.decimals,
          shortLabel: typedArgs.field_label_short,
          mediumLabel: typedArgs.field_label_medium,
          longLabel: typedArgs.field_label_long,
          headingLabel: typedArgs.field_label_heading,
          typeKind: typeKind,
          typeName: typedArgs.type_name?.toUpperCase(),
          searchHelp: typedArgs.search_help,
          searchHelpParameter: typedArgs.search_help_parameter,
          setGetParameter: typedArgs.set_get_parameter,
        };
        updateState = await client.getDataElement().update(
          {
            dataElementName,
            packageName: typedArgs.package_name,
            description: typedArgs.description || dataElementName,
            ...properties,
          },
          { lockHandle },
        );

        // Check
        try {
          await safeCheckOperation(
            () => client.getDataElement().check({ dataElementName }),
            dataElementName,
            {
              debug: (message: string) => logger?.debug(message),
            },
          );
        } catch (checkError: any) {
          // If error was marked as "already checked", continue silently
          if (!(checkError as any).isAlreadyChecked) {
            // Real check error - rethrow
            throw checkError;
          }
        }

        // Unlock
        await client.getDataElement().unlock({ dataElementName }, lockHandle);

        // Activate if requested
        if (shouldActivate) {
          await client.getDataElement().activate({ dataElementName });
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client
            .getDataElement()
            .unlock({ dataElementName: dataElementName }, lockHandle);
        } catch (unlockError) {
          logger?.error(
            `Failed to unlock data element after error: ${unlockError instanceof Error ? unlockError.message : String(unlockError)}`,
          );
        }
        throw error;
      }

      // Get data element details from update result
      const updateResult = updateState?.updateResult;
      let dataElementDetails = null;
      if (
        updateResult?.data &&
        typeof updateResult.data === 'object' &&
        'data_element_details' in updateResult.data
      ) {
        dataElementDetails = (updateResult.data as any).data_element_details;
      }

      return return_response({
        data: JSON.stringify({
          success: true,
          data_element_name: dataElementName,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          data_type: typedArgs.data_type || null,
          status: shouldActivate ? 'active' : 'inactive',
          message: `Data element ${dataElementName} updated${shouldActivate ? ' and activated' : ''} successfully`,
          data_element_details: dataElementDetails,
        }),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating data element ${dataElementName}: ${error?.message || error}`,
      );

      // Handle specific error cases
      if (
        error.message?.includes('not found') ||
        error.response?.status === 404
      ) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Data element ${dataElementName} not found.`,
        );
      }

      if (error.message?.includes('locked') || error.response?.status === 403) {
        throw new McpError(
          ErrorCode.InternalError,
          `Data element ${dataElementName} is locked by another user or session. Please try again later.`,
        );
      }

      const errorMessage = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : JSON.stringify(error.response.data)
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update data element ${dataElementName}: ${errorMessage}`,
      );
    }
  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
