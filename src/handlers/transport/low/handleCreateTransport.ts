/**
 * CreateTransport Handler - Create ABAP Transport Request
 *
 * Uses CrudClient.createTransport from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AxiosResponse } from '../../../lib/utils';
import { return_error, return_response, logger, getManagedConnection } from '../../../lib/utils';
import { CrudClient } from '@mcp-abap-adt/adt-clients';

export const TOOL_DEFINITION = {
  name: "CreateTransport",
  description: "[low-level] Create a new ABAP transport request.",
  inputSchema: {
    type: "object",
    properties: {
      description: {
        type: "string",
        description: "Transport request description."
      },
      transport_type: {
        type: "string",
        description: "Transport type: 'workbench' or 'customizing' (optional, default: 'workbench').",
        enum: ["workbench", "customizing"]
      }
    },
    required: ["description"]
  }
} as const;

interface CreateTransportArgs {
  description: string;
  transport_type?: 'workbench' | 'customizing';
}

/**
 * Main handler for CreateTransport MCP tool
 *
 * Uses CrudClient.createTransport - low-level single method call
 */
export async function handleCreateTransport(args: any) {
  try {
    const {
      description,
      transport_type
    } = args as CreateTransportArgs;

    // Validation
    if (!description) {
      return return_error(new Error('description is required'));
    }

    const connection = getManagedConnection();
    const client = new CrudClient(connection);

    // Ensure connection is established
    await connection.connect();

    logger.info(`Starting transport creation: ${description}`);

    try {
      // Create transport
      await client.createTransport(description, transport_type);
      const createResult = client.getCreateResult();

      if (!createResult) {
        throw new Error(`Create did not return a response for transport`);
      }

      logger.info(`✅ CreateTransport completed`);

      return return_response({
        data: JSON.stringify({
          success: true,
          description,
          transport_type: transport_type || 'workbench',
          message: `Transport request created successfully.`
        }, null, 2)
      } as AxiosResponse);

    } catch (error: any) {
      logger.error(`Error creating transport:`, error);

      // Parse error message
      let errorMessage = `Failed to create transport: ${error.message || String(error)}`;

      if (error.response?.data && typeof error.response.data === 'string') {
        try {
          const { XMLParser } = require('fast-xml-parser');
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
