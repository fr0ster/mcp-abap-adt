/**
 * CreateDataElement Handler - ABAP Data Element Creation via ADT API
 *
 * Uses DataElementBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: create -> activate -> verify
 */

import { McpError, ErrorCode, AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection, safeCheckOperation } from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation.js';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateDataElement",
  description: "Create a new ABAP data element in SAP system with all required steps: create, activate, and verify.",
  inputSchema: {
    type: "object",
    properties: {
      data_element_name: {
        type: "string",
        description: "Data element name (e.g., ZZ_E_TEST_001). Must follow SAP naming conventions."
      },
      description: {
        type: "string",
        description: "Data element description. If not provided, data_element_name will be used."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      data_type: {
        type: "string",
        description: "Data type (e.g., CHAR, NUMC) or domain name when type_kind is 'domain'.",
        default: "CHAR"
      },
      length: {
        type: "number",
        description: "Data type length. Usually inherited from domain.",
        default: 100
      },
      decimals: {
        type: "number",
        description: "Decimal places. Usually inherited from domain.",
        default: 0
      },
      short_label: {
        type: "string",
        description: "Short field label (max 10 chars). Applied during update step after creation."
      },
      medium_label: {
        type: "string",
        description: "Medium field label (max 20 chars). Applied during update step after creation."
      },
      long_label: {
        type: "string",
        description: "Long field label (max 40 chars). Applied during update step after creation."
      },
      heading_label: {
        type: "string",
        description: "Heading field label (max 55 chars). Applied during update step after creation."
      },
      type_kind: {
        type: "string",
        description: "Type kind: 'domain' (default), 'predefinedAbapType', 'refToPredefinedAbapType', 'refToDictionaryType', 'refToClifType'. If not specified, defaults to 'domain'.",
        enum: ["domain", "predefinedAbapType", "refToPredefinedAbapType", "refToDictionaryType", "refToClifType"],
        default: "domain"
      },
      type_name: {
        type: "string",
        description: "Type name: domain name (when type_kind is 'domain'), data element name (when type_kind is 'refToDictionaryType'), or class name (when type_kind is 'refToClifType')"
      },
      search_help: {
        type: "string",
        description: "Search help name. Applied during update step after creation."
      },
      search_help_parameter: {
        type: "string",
        description: "Search help parameter. Applied during update step after creation."
      },
      set_get_parameter: {
        type: "string",
        description: "Set/Get parameter ID. Applied during update step after creation."
      }
    },
    required: ["data_element_name", "package_name"]
  }
} as const;

interface DataElementArgs {
  data_element_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  short_label?: string;
  medium_label?: string;
  long_label?: string;
  heading_label?: string;
  type_kind?: 'domain' | 'predefinedAbapType' | 'refToPredefinedAbapType' | 'refToDictionaryType' | 'refToClifType';
  type_name?: string;
  search_help?: string;
  search_help_parameter?: string;
  set_get_parameter?: string;
  activate?: boolean;
}

/**
 * Main handler for CreateDataElement MCP tool
 *
 * Uses DataElementBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateDataElement(args: DataElementArgs) {
  try {
    // Validate required parameters
    if (!args?.data_element_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    // Determine typeKind - default to 'domain' if not specified
    const typeKind = args?.type_kind || 'domain';

    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(args.package_name, args.transport_request);

    const typedArgs = args as DataElementArgs;
    const connection = getManagedConnection();
    const dataElementName = typedArgs.data_element_name.toUpperCase();

    logger.info(`Starting data element creation: ${dataElementName}`);

    try {
      // Create client
      const client = new CrudClient(connection);
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      // Validate
      await client.validateDataElement({
        dataElementName,
        packageName: typedArgs.package_name,
        description: typedArgs.description || dataElementName
      });

      // Determine typeKind - default to 'domain' if not specified
      const typeKind = typedArgs.type_kind || 'domain';

      // Create
      await client.createDataElement({
        dataElementName,
        description: typedArgs.description || dataElementName,
        packageName: typedArgs.package_name,
        typeKind: typeKind,
        dataType: typedArgs.data_type,
        typeName: typedArgs.type_name,
        length: typedArgs.length,
        decimals: typedArgs.decimals,
        transportRequest: typedArgs.transport_request
      });

      // Lock
      await client.lockDataElement({ dataElementName });
      const lockHandle = client.getLockHandle();

      // Update with properties
      const updateConfig: any = {
        dataElementName,
        packageName: typedArgs.package_name,
        description: typedArgs.description || dataElementName,
        dataType: typedArgs.data_type || 'CHAR',
        length: typedArgs.length || 100,
        decimals: typedArgs.decimals || 0,
        shortLabel: typedArgs.short_label,
        mediumLabel: typedArgs.medium_label,
        longLabel: typedArgs.long_label,
        headingLabel: typedArgs.heading_label,
        typeKind: typeKind,
        typeName: typedArgs.type_name,
        searchHelp: typedArgs.search_help,
        searchHelpParameter: typedArgs.search_help_parameter,
        setGetParameter: typedArgs.set_get_parameter
      };

      await client.updateDataElement(updateConfig, lockHandle);

      // Check
      try {
        await safeCheckOperation(
          () => client.checkDataElement({ dataElementName }),
          dataElementName,
          {
            debug: (message: string) => logger.info(`[CreateDataElement] ${message}`)
          }
        );
      } catch (checkError: any) {
        // If error was marked as "already checked", continue silently
        if (!(checkError as any).isAlreadyChecked) {
          // Real check error - rethrow
          throw checkError;
        }
      }

      // Unlock
      await client.unlockDataElement({ dataElementName }, lockHandle);

      // Activate if requested
      if (shouldActivate) {
        await client.activateDataElement({ dataElementName });
      }

      // Get data element details from create result (createDataElement already does verification)
      const createResult = client.getCreateResult();
      let dataElementDetails = null;
      if (createResult?.data && typeof createResult.data === 'object' && 'data_element_details' in createResult.data) {
        dataElementDetails = (createResult.data as any).data_element_details;
      }

      // Extract version and other details from response
      const version = createResult?.data && typeof createResult.data === 'object' && 'version' in createResult.data
        ? (createResult.data as any).version
        : 'unknown';

      return return_response({
        data: JSON.stringify({
          success: true,
          data_element_name: dataElementName,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          data_type: typedArgs.data_type || null,
          status: 'active',
          version: version,
          message: `Data element ${dataElementName} created and activated successfully`,
          data_element_details: dataElementDetails
        }, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating data element ${dataElementName}:`, error);

      // Check if data element already exists
      if (error.message?.includes('already exists') || error.response?.data?.includes('ExceptionResourceAlreadyExists')) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Data element ${dataElementName} already exists. Please delete it first or use a different name.`
        );
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to create data element ${dataElementName}: ${errorMessage}`
      );
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
