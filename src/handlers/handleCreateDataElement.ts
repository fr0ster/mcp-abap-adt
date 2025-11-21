/**
 * CreateDataElement Handler - ABAP Data Element Creation via ADT API
 *
 * Uses DataElementBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: create -> activate -> verify
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
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
      domain_name: {
        type: "string",
        description: "Domain name to use as type reference (e.g., ZZ_TEST_0001)"
      },
      data_type: {
        type: "string",
        description: "Data type (e.g., CHAR, NUMC). Usually inherited from domain.",
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
        description: "Short field label (max 10 chars)"
      },
      medium_label: {
        type: "string",
        description: "Medium field label (max 20 chars)"
      },
      long_label: {
        type: "string",
        description: "Long field label (max 40 chars)"
      },
      heading_label: {
        type: "string",
        description: "Heading field label (max 55 chars)"
      }
    },
    required: ["data_element_name", "package_name", "domain_name"]
  }
} as const;

interface DataElementArgs {
  data_element_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  domain_name: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  short_label?: string;
  medium_label?: string;
  long_label?: string;
  heading_label?: string;
  activate?: boolean;
}

/**
 * Main handler for CreateDataElement MCP tool
 *
 * Uses DataElementBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateDataElement(args: any) {
  try {
    // Validate required parameters
    if (!args?.data_element_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }
    if (!args?.domain_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Domain name is required');
    }

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
      await client.validateDataElement(dataElementName);

      // Create
      await client.createDataElement(
        dataElementName,
        typedArgs.description || dataElementName,
        typedArgs.package_name,
        typedArgs.transport_request
      );

      // Lock
      await client.lockDataElement(dataElementName);
      const lockHandle = client.getLockHandle();

      // Update with properties
      const properties = {
        domainName: typedArgs.domain_name.toUpperCase(),
        dataType: typedArgs.data_type || 'CHAR',
        length: typedArgs.length || 100,
        decimals: typedArgs.decimals || 0,
        shortLabel: typedArgs.short_label,
        mediumLabel: typedArgs.medium_label,
        longLabel: typedArgs.long_label,
        headingLabel: typedArgs.heading_label,
        typeKind: 'domain'
      };
      await client.updateDataElement(dataElementName, properties, lockHandle);

      // Check
      await client.checkDataElement(dataElementName);

      // Unlock
      await client.unlockDataElement(dataElementName, lockHandle);

      // Activate if requested
      if (shouldActivate) {
        await client.activateDataElement(dataElementName);
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
          domain_name: typedArgs.domain_name.toUpperCase(),
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
