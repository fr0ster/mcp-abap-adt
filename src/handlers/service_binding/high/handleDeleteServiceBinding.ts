import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import {
  parseServiceBindingPayload,
  type ServiceBindingResponseFormat,
} from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'DeleteServiceBinding',
  description:
    'Delete ABAP service binding via ADT Business Services endpoint.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name to delete.',
      },
      transport_request: {
        type: 'string',
        description: 'Optional transport request for deletion transport flow.',
      },
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        default: 'xml',
      },
    },
    required: ['service_binding_name'],
  },
} as const;

interface DeleteServiceBindingArgs {
  service_binding_name: string;
  transport_request?: string;
  response_format?: ServiceBindingResponseFormat;
}

export async function handleDeleteServiceBinding(
  context: HandlerContext,
  args: DeleteServiceBindingArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.service_binding_name) {
      throw new Error('service_binding_name is required');
    }

    const serviceBindingName = args.service_binding_name.trim().toUpperCase();
    const responseFormat = args.response_format ?? 'xml';
    const client = createAdtClient(connection, logger);
    const state = await client.getServiceBinding().delete({
      bindingName: serviceBindingName,
      transportRequest: args.transport_request,
    });
    const response = state?.deleteResult;
    if (!response) {
      throw new Error(
        `Delete did not return a response for service binding ${serviceBindingName}`,
      );
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          service_binding_name: serviceBindingName,
          response_format: responseFormat,
          status: response.status,
          payload: parseServiceBindingPayload(response.data, responseFormat),
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
    logger?.error('Error deleting service binding:', error);
    return return_error(error);
  }
}
