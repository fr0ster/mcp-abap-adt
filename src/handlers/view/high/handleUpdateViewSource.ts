/**
 * UpdateViewSource Handler - Update Existing CDS/Classic View DDL Source
 *
 * Uses ViewBuilder from @mcp-abap-adt/adt-clients for all operations.
 * Session and lock management handled internally by builder.
 *
 * Workflow: validate -> lock -> update -> check -> unlock -> (activate)
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, encodeSapObjectName, logger, getManagedConnection } from '../../../lib/utils';
import { XMLParser } from 'fast-xml-parser';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "UpdateViewSource",
  description: "Update DDL source code of an existing CDS View or Classic View. Locks the view, uploads new DDL source, and unlocks. Optionally activates after update. Use this to modify existing views without re-creating metadata.",
  inputSchema: {
    type: "object",
    properties: {
      view_name: {
        type: "string",
        description: "View name (e.g., ZOK_R_TEST_0002). View must already exist."
      },
      ddl_source: {
        type: "string",
        description: "Complete DDL source code. CDS: include @AbapCatalog.sqlViewName and other annotations. Classic: plain 'define view' statement."
      },
      activate: {
        type: "boolean",
        description: "Activate view after source update. Default: false. Set to true to activate immediately, or use ActivateObject for batch activation."
      }
    },
    required: ["view_name", "ddl_source"]
  }
} as const;

interface UpdateViewSourceArgs {
  view_name: string;
  ddl_source: string;
  activate?: boolean;
}


/**
 * Main handler for UpdateViewSource MCP tool
 *
 * Uses ViewBuilder from @mcp-abap-adt/adt-clients for all operations
 * Session and lock management handled internally by builder
 */
export async function handleUpdateViewSource(params: any) {
  try {
    const args: UpdateViewSourceArgs = params;

    // Validate required parameters
    if (!args.view_name || !args.ddl_source) {
      return return_error(new Error("Missing required parameters: view_name and ddl_source"));
    }

    const connection = getManagedConnection();
    const viewName = args.view_name.toUpperCase();

    logger.info(`Starting view source update: ${viewName}`);

    try {
      // Create client
      const client = new CrudClient(connection);
      const shouldActivate = args.activate === true; // Default to false if not specified

      // Validate
      await client.validateView(viewName);

      // Lock
      await client.lockView(viewName);
      const lockHandle = client.getLockHandle();

      try {
        // Update with DDL source
        await client.updateView(viewName, args.ddl_source, lockHandle);

        // Check
        await client.checkView(viewName);

        // Unlock
        await client.unlockView(viewName, lockHandle);

        // Activate if requested
        if (shouldActivate) {
          await client.activateView(viewName);
        }
      } catch (error) {
        // Try to unlock on error
        try {
          await client.unlockView(viewName, lockHandle);
        } catch (unlockError) {
          logger.error('Failed to unlock view after error:', unlockError);
        }
        throw error;
      }

      // Parse activation warnings if activation was performed
      let activationWarnings: string[] = [];
      if (shouldActivate && client.getActivateResult()) {
        const activateResponse = client.getActivateResult()!;
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

      logger.info(`✅ UpdateViewSource completed successfully: ${viewName}`);

      // Return success result
      const stepsCompleted = ['validate', 'lock', 'update', 'check', 'unlock'];
      if (shouldActivate) {
        stepsCompleted.push('activate');
      }

      const result = {
        success: true,
        view_name: viewName,
        type: 'DDLS/DF',
        message: shouldActivate
          ? `View ${viewName} source updated and activated successfully`
          : `View ${viewName} source updated successfully (not activated)`,
        uri: `/sap/bc/adt/ddic/ddl/sources/${encodeSapObjectName(viewName)}`,
        steps_completed: stepsCompleted,
        activation_warnings: activationWarnings.length > 0 ? activationWarnings : undefined,
        source_size_bytes: args.ddl_source.length
      };

      return return_response({
        data: JSON.stringify(result, null, 2),
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {} as any
      });

    } catch (error: any) {
      logger.error(`Error updating view source ${viewName}:`, error);

      const errorMessage = error.response?.data
        ? (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data))
        : error.message || String(error);

      return return_error(new Error(`Failed to update view ${viewName}: ${errorMessage}`));
    }

  } catch (error: any) {
    return return_error(error);
  }
}
