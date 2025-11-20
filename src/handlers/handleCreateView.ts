/**
 * CreateView Handler - CDS/Classic View Creation via ADT API
 *
 * Uses ViewBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> create -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection } from '../lib/utils';
import { validateTransportRequest } from '../utils/transportValidation.js';
import { XMLParser } from 'fast-xml-parser';
import { ViewBuilder } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateView",
  description: "Create CDS View or Classic View in SAP using DDL syntax. Both types use the same API workflow, differing only in DDL content (CDS has @AbapCatalog annotations).",
  inputSchema: {
    type: "object",
    properties: {
      view_name: {
        type: "string",
        description: "View name (e.g., ZOK_R_TEST_0002, Z_I_MY_VIEW). Must follow SAP naming conventions."
      },
      ddl_source: {
        type: "string",
        description: "Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 'define view' statement."
      },
      package_name: {
        type: "string",
        description: "Package name (e.g., ZOK_LAB, $TMP for local objects)"
      },
      transport_request: {
        type: "string",
        description: "Transport request number (e.g., E19K905635). Required for transportable packages."
      },
      description: {
        type: "string",
        description: "Optional description. If not provided, view_name will be used."
      }
    },
    required: ["view_name", "ddl_source", "package_name"]
  }
} as const;

interface CreateViewArgs {
  view_name: string;
  ddl_source: string;
  package_name: string;
  transport_request?: string;
  description?: string;
}


/**
 * Main handler for CreateView MCP tool
 *
 * Uses ViewBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleCreateView(params: any) {
  try {
    const args: CreateViewArgs = params;

    if (!args.view_name || !args.ddl_source || !args.package_name) {
      return return_error(new Error("Missing required parameters: view_name, ddl_source, and package_name"));
    }

    // Validate transport_request: required for non-$TMP packages
    try {
      validateTransportRequest(args.package_name, args.transport_request);
    } catch (error) {
      return return_error(error as Error);
    }

    const connection = getManagedConnection();
    const viewName = args.view_name.toUpperCase();

    logger.info(`Starting view creation: ${viewName}`);

    try {
      // Create builder with configuration
      const builder = new ViewBuilder(connection, logger, {
        viewName: viewName,
        packageName: args.package_name,
        transportRequest: args.transport_request,
        description: args.description || viewName,
        ddlSource: args.ddl_source
      });

      // Build operation chain: validate -> create -> lock -> update -> check -> unlock -> (activate)
      const shouldActivate = true; // Default to true for views

      await builder
        .validate()
        .then(b => b.create())
        .then(b => b.lock())
        .then(b => b.update())
        .then(b => b.check())
        .then(b => b.unlock())
        .then(b => shouldActivate ? b.activate() : Promise.resolve(b))
        .catch(error => {
          logger.error('View creation chain failed:', error);
          throw error;
        });

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (shouldActivate && builder.getActivateResult()) {
        const activateResponse = builder.getActivateResult()!;
        if (typeof activateResponse.data === 'string' && activateResponse.data.includes('<chkl:messages')) {
          const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
          const result = parser.parse(activateResponse.data);
          const messages = result?.['chkl:messages']?.['msg'];
          if (messages) {
            const msgArray = Array.isArray(messages) ? messages : [messages];
            activationWarnings = msgArray.map((msg: any) =>
              `${msg['@_type']}: ${msg['shortText']?.['txt'] || 'Unknown'}`
            );
          }
        }
      }

      logger.info(`✅ CreateView completed successfully: ${viewName}`);

      const result = {
        success: true,
        view_name: viewName,
        package_name: args.package_name,
        transport_request: args.transport_request || null,
        type: 'DDLS',
        message: `View ${viewName} created and activated successfully`,
        uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName).toLowerCase()}`,
        steps_completed: ['validate', 'create', 'lock', 'update', 'check', 'unlock', 'activate'],
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      logger.error(`Error creating view ${viewName}:`, error);

      // Check if view already exists
      if (error.message?.includes('already exists') || error.response?.status === 409) {
        return return_error(new Error(`View ${viewName} already exists. Please delete it first or use a different name.`));
      }

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to create view ${viewName}: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
