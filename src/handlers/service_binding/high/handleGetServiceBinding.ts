import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import {
  parseServiceBindingPayload,
  type ServiceBindingResponseFormat,
} from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'GetServiceBinding',
  description:
    'Retrieve ABAP service binding source/metadata by name via ADT Business Services endpoint.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description:
          'Service binding name (for example: ZUI_MY_BINDING). Case-insensitive.',
      },
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        description:
          'Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.',
        default: 'xml',
      },
    },
    required: ['service_binding_name'],
  },
} as const;

interface GetServiceBindingArgs {
  service_binding_name: string;
  response_format?: ServiceBindingResponseFormat;
}

export async function handleGetServiceBinding(
  context: HandlerContext,
  args: GetServiceBindingArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.service_binding_name) {
      throw new Error('service_binding_name is required');
    }

    const serviceBindingName = args.service_binding_name.trim().toUpperCase();
    const responseFormat = args.response_format ?? 'xml';
    const client = new AdtClient(connection, logger);
    const state = await client.getServiceBinding().read({
      bindingName: serviceBindingName,
    });
    const response = state?.readResult;
    if (!response) {
      throw new Error(
        `Read did not return a response for service binding ${serviceBindingName}`,
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
  } catch (error: unknown) {
    logger?.error('Error reading service binding:', error);
    return return_error(error);
  }
}
