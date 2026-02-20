import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import {
  parseServiceBindingPayload,
  type ServiceBindingResponseFormat,
} from './serviceBindingPayloadUtils';

type DesiredPublicationStateInput = 'published' | 'unpublished' | 'unchanged';
type ServiceTypeInput = 'ODataV2' | 'ODataV4';

export const TOOL_DEFINITION = {
  name: 'UpdateServiceBinding',
  description:
    'Update publication state for ABAP service binding via AdtServiceBinding workflow.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name to update.',
      },
      desired_publication_state: {
        type: 'string',
        enum: ['published', 'unpublished', 'unchanged'],
        description: 'Target publication state.',
      },
      service_type: {
        type: 'string',
        enum: ['ODataV2', 'ODataV4'],
        description: 'OData service type for publish/unpublish action routing.',
        default: 'ODataV4',
      },
      service_name: {
        type: 'string',
        description: 'Published service name.',
      },
      service_version: {
        type: 'string',
        description: 'Published service version. Optional.',
      },
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        default: 'xml',
      },
    },
    required: [
      'service_binding_name',
      'desired_publication_state',
      'service_type',
      'service_name',
    ],
  },
} as const;

interface UpdateServiceBindingArgs {
  service_binding_name: string;
  desired_publication_state: DesiredPublicationStateInput;
  service_type: ServiceTypeInput;
  service_name: string;
  service_version?: string;
  response_format?: ServiceBindingResponseFormat;
}

export async function handleUpdateServiceBinding(
  context: HandlerContext,
  args: UpdateServiceBindingArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.service_binding_name) {
      throw new Error('service_binding_name is required');
    }
    if (!args?.desired_publication_state) {
      throw new Error('desired_publication_state is required');
    }
    if (!args?.service_name) {
      throw new Error('service_name is required');
    }

    const serviceBindingName = args.service_binding_name.trim().toUpperCase();
    const responseFormat = args.response_format ?? 'xml';
    const serviceType = args.service_type === 'ODataV2' ? 'odatav2' : 'odatav4';
    const serviceName = args.service_name.trim().toUpperCase();

    const client = new AdtClient(connection, logger);
    const response = await client.getServiceBinding().updateServiceBinding({
      bindingName: serviceBindingName,
      desiredPublicationState: args.desired_publication_state,
      serviceType,
      serviceName,
      serviceVersion: args.service_version?.trim() || undefined,
    });

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          service_binding_name: serviceBindingName,
          desired_publication_state: args.desired_publication_state,
          service_type: args.service_type,
          service_name: serviceName,
          service_version: args.service_version || null,
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
    logger?.error('Error updating service binding:', error);
    return return_error(error);
  }
}
