/**
 * GetServiceDefinition Handler - Read ABAP ServiceDefinition via AdtClient
 *
 * Uses AdtClient.getServiceDefinition().read() for high-level read operation.
 * Supports both active and inactive versions.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetServiceDefinition',
  description:
    'Retrieve ABAP service definition definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      service_definition_name: {
        type: 'string',
        description: 'ServiceDefinition name (e.g., Z_MY_SERVICEDEFINITION).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['service_definition_name'],
  },
} as const;

interface GetServiceDefinitionArgs {
  service_definition_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetServiceDefinition MCP tool
 *
 * Uses AdtClient.getServiceDefinition().read() - high-level read operation
 */
export async function handleGetServiceDefinition(
  context: HandlerContext,
  args: GetServiceDefinitionArgs,
) {
  const { connection, logger } = context;
  try {
    const { service_definition_name, version = 'active' } =
      args as GetServiceDefinitionArgs;

    // Validation
    if (!service_definition_name) {
      return return_error(new Error('service_definition_name is required'));
    }

    const client = new AdtClient(connection, logger);
    const serviceDefinitionName = service_definition_name.toUpperCase();

    logger?.info(
      `Reading service definition ${serviceDefinitionName}, version: ${version}`,
    );

    try {
      // Read service definition using AdtClient
      const serviceDefinitionObject = client.getServiceDefinition();
      const readResult = await serviceDefinitionObject.read(
        { serviceDefinitionName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`ServiceDefinition ${serviceDefinitionName} not found`);
      }

      // Extract data from read result
      const serviceDefinitionData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(
        `✅ GetServiceDefinition completed successfully: ${serviceDefinitionName}`,
      );

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            service_definition_name: serviceDefinitionName,
            version,
            service_definition_data: serviceDefinitionData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading service definition ${serviceDefinitionName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read service definition: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `ServiceDefinition ${serviceDefinitionName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `ServiceDefinition ${serviceDefinitionName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
