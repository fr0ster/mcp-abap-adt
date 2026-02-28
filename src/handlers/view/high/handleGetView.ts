/**
 * GetView Handler - Read ABAP View via AdtClient
 *
 * Uses AdtClient.getView().read() for high-level read operation.
 * Supports both active and inactive versions.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetView',
  description:
    'Retrieve ABAP view definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      view_name: {
        type: 'string',
        description: 'View name (e.g., Z_MY_VIEW).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['view_name'],
  },
} as const;

interface GetViewArgs {
  view_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetView MCP tool
 *
 * Uses AdtClient.getView().read() - high-level read operation
 */
export async function handleGetView(
  context: HandlerContext,
  args: GetViewArgs,
) {
  const { connection, logger } = context;
  try {
    const { view_name, version = 'active' } = args as GetViewArgs;

    // Validation
    if (!view_name) {
      return return_error(new Error('view_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const viewName = view_name.toUpperCase();

    logger?.info(`Reading view ${viewName}, version: ${version}`);

    try {
      // Read view using AdtClient
      const viewObject = client.getView();
      const readResult = await viewObject.read(
        { viewName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`View ${viewName} not found`);
      }

      // Extract data from read result
      const viewData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetView completed successfully: ${viewName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            view_name: viewName,
            version,
            view_data: viewData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading view ${viewName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read view: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `View ${viewName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `View ${viewName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
