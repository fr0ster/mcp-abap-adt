import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import { parseServiceBindingPayload } from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'ValidateServiceBinding',
  description:
    'Validate service binding parameters (name, service definition, package, version) via ADT validation endpoint.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name to validate.',
      },
      description: {
        type: 'string',
        description: 'Optional description used during validation.',
      },
      service_definition_name: {
        type: 'string',
        description: 'Service definition linked to binding.',
      },
      package_name: {
        type: 'string',
        description: 'ABAP package for the binding.',
      },
      service_binding_version: {
        type: 'string',
        description: 'Service binding version (for example: 1.0).',
      },
    },
    required: ['service_binding_name', 'service_definition_name'],
  },
} as const;

interface ValidateServiceBindingArgs {
  service_binding_name: string;
  description?: string;
  service_definition_name?: string;
  package_name?: string;
  service_binding_version?: string;
}

export async function handleValidateServiceBinding(
  context: HandlerContext,
  args: ValidateServiceBindingArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.service_binding_name) {
      throw new Error('service_binding_name is required');
    }
    if (!args?.service_definition_name) {
      throw new Error('service_definition_name is required');
    }

    const serviceBindingName = args.service_binding_name.trim().toUpperCase();
    const client = new AdtClient(connection, logger);
    const response = await client.getServiceBinding().validateServiceBinding({
      objname: serviceBindingName,
      serviceDefinition: args.service_definition_name.trim().toUpperCase(),
      serviceBindingVersion: args.service_binding_version?.trim() || undefined,
      description: args.description?.trim() || undefined,
      package: args.package_name?.trim().toUpperCase() || undefined,
    });

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          service_binding_name: serviceBindingName,
          status: response.status,
          payload: parseServiceBindingPayload(response.data, 'xml'),
        },
        null,
        2,
      ),
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      config: response.config,
    });
  } catch (error: any) {
    logger?.error('Error validating service binding:', error);
    return return_error(error);
  }
}
