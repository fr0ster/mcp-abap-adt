/**
 * UpdateDataElement Handler - Update Existing ABAP Data Element
 *
 * Uses DataElementBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: lock -> update -> check -> unlock -> (activate)
 */

import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { DataElementBuilder } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateDataElement",
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
    type: "object",
    properties: {
      data_element_name: {
        type: "string",
        description: "Data element name to update (e.g., ZZ_TEST_DTEL_01)"
      },
      description: {
        type: "string",
        description: "New data element description"
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LOCAL, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      type_kind: {
        type: "string",
        description: "Type kind: domain, predefinedAbapType, refToPredefinedAbapType, refToDictionaryType, refToClifType",
        enum: ["domain", "predefinedAbapType", "refToPredefinedAbapType", "refToDictionaryType", "refToClifType"],
        default: "domain"
      },
      type_name: {
        type: "string",
        description: "Type name: domain name, data element name, or class name (depending on type_kind)"
      },
      data_type: {
        type: "string",
        description: "Data type (CHAR, NUMC, etc.) - for predefinedAbapType or refToPredefinedAbapType"
      },
      length: {
        type: "number",
        description: "Length - for predefinedAbapType or refToPredefinedAbapType"
      },
      decimals: {
        type: "number",
        description: "Decimals - for predefinedAbapType or refToPredefinedAbapType"
      },
      domain_name: {
        type: "string",
        description: "Domain name (deprecated - use type_name with type_kind=domain)"
      },
      field_label_short: {
        type: "string",
        description: "Short field label (max 10 chars)"
      },
      field_label_medium: {
        type: "string",
        description: "Medium field label (max 20 chars)"
      },
      field_label_long: {
        type: "string",
        description: "Long field label (max 40 chars)"
      },
      field_label_heading: {
        type: "string",
        description: "Heading field label (max 55 chars)"
      },
      search_help: {
        type: "string",
        description: "Search help name"
      },
      search_help_parameter: {
        type: "string",
        description: "Search help parameter"
      },
      set_get_parameter: {
        type: "string",
        description: "Set/Get parameter ID"
      },
      default_component_name: {
        type: "string",
        description: "Default component name"
      },
      deactivate_input_history: {
        type: "boolean",
        description: "Deactivate input history",
        default: false
      },
      change_document: {
        type: "boolean",
        description: "Change document",
        default: false
      },
      left_to_right_direction: {
        type: "boolean",
        description: "Left to right direction",
        default: false
      },
      deactivate_bidi_filtering: {
        type: "boolean",
        description: "Deactivate BiDi filtering",
        default: false
      },
      activate: {
        type: "boolean",
        description: "Activate data element after update (default: true)",
        default: true
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
  type_kind?: string;
  type_name?: string;
  data_type?: string;
  length?: number;
  decimals?: number;
  domain_name?: string;
  field_label_short?: string;
  field_label_medium?: string;
  field_label_long?: string;
  field_label_heading?: string;
  search_help?: string;
  search_help_parameter?: string;
  set_get_parameter?: string;
  default_component_name?: string;
  deactivate_input_history?: boolean;
  change_document?: boolean;
  left_to_right_direction?: boolean;
  deactivate_bidi_filtering?: boolean;
  activate?: boolean;
}

/**
 * Main handler for UpdateDataElement tool
 *
 * Uses DataElementBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateDataElement(args: any) {
  try {
    if (!args?.data_element_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Data element name is required');
    }
    if (!args?.package_name) {
      throw new McpError(ErrorCode.InvalidParams, 'Package name is required');
    }

    // Validate transport_request: required for non-$TMP packages
    validateTransportRequest(args.package_name, args.transport_request);

    const typedArgs = args as DataElementArgs;
    const connection = getManagedConnection();
    const dataElementName = typedArgs.data_element_name.toUpperCase();

    logger.info(`Starting data element update: ${dataElementName}`);

    try {
      // Determine domain name for builder (support deprecated domain_name parameter)
      const domainName = typedArgs.type_name || typedArgs.domain_name;
      const typeKind = (typedArgs.type_kind || 'domain') as 'domain' | 'builtin';

      // Create builder with configuration
      const builder = new DataElementBuilder(connection, logger, {
        dataElementName: dataElementName,
        packageName: typedArgs.package_name,
        transportRequest: typedArgs.transport_request,
        description: typedArgs.description,
        domainName: domainName?.toUpperCase() || '',
        dataType: typedArgs.data_type,
        length: typedArgs.length,
        decimals: typedArgs.decimals,
        shortLabel: typedArgs.field_label_short,
        mediumLabel: typedArgs.field_label_medium,
        longLabel: typedArgs.field_label_long,
        headingLabel: typedArgs.field_label_heading,
        typeKind: typeKind,
        typeName: typedArgs.type_name?.toUpperCase()
      });

      // Build operation chain: validate -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = typedArgs.activate !== false; // Default to true if not specified

      await builder
        .validate()
        .then(b => b.lock())
        .then(b => b.update())
        .then(b => b.check())
        .then(b => b.unlock())
        .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
        .catch(error => {
          logger.error('Data element update chain failed:', error);
          throw error;
        });

      // Get data element details from update result
      const updateResult = builder.getUpdateResult();
      let dataElementDetails = null;
      if (updateResult?.data && typeof updateResult.data === 'object' && 'data_element_details' in updateResult.data) {
        dataElementDetails = (updateResult.data as any).data_element_details;
      }

      return return_response({
        data: JSON.stringify({
          success: true,
          data_element_name: dataElementName,
          package: typedArgs.package_name,
          transport_request: typedArgs.transport_request,
          domain_name: domainName?.toUpperCase(),
          status: shouldActivate ? 'active' : 'inactive',
          message: `Data element ${dataElementName} updated${shouldActivate ? ' and activated' : ''} successfully`,
          data_element_details: dataElementDetails
        })
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error updating data element ${dataElementName}:`, error);

      // Handle specific error cases
      if (error.message?.includes('not found') || error.response?.status === 404) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Data element ${dataElementName} not found.`
        );
      }

      if (error.message?.includes('locked') || error.response?.status === 403) {
        throw new McpError(
          ErrorCode.InternalError,
          `Data element ${dataElementName} is locked by another user or session. Please try again later.`
        );
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      throw new McpError(
        ErrorCode.InternalError,
        `Failed to update data element ${dataElementName}: ${errorMessage}`
      );
    }

  } catch (error: any) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
