import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import {
  parseServiceBindingPayload,
  type ServiceBindingResponseFormat,
} from './serviceBindingPayloadUtils';

type ServiceBindingTypeInput = 'ODataV2' | 'ODataV4';

export const TOOL_DEFINITION = {
  name: 'CreateServiceBinding',
  description:
    'Create ABAP service binding via ADT Business Services endpoint. XML is generated from high-level parameters.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name.',
      },
      service_definition_name: {
        type: 'string',
        description: 'Referenced service definition name.',
      },
      package_name: {
        type: 'string',
        description: 'ABAP package name.',
      },
      description: {
        type: 'string',
        description:
          'Optional description. Defaults to service_binding_name when omitted.',
      },
      binding_type: {
        type: 'string',
        enum: ['ODataV2', 'ODataV4'],
        description: 'OData binding type.',
        default: 'ODataV4',
      },
      service_binding_version: {
        type: 'string',
        description: 'Service binding ADT version. Default inferred from type.',
      },
      service_name: {
        type: 'string',
        description:
          'Published service name. Default: service_binding_name if omitted.',
      },
      service_version: {
        type: 'string',
        description: 'Published service version. Default: 0001.',
      },
      transport_request: {
        type: 'string',
        description: 'Optional transport request for transport checks.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate service binding after create. Default: true.',
        default: true,
      },
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        default: 'xml',
      },
    },
    required: [
      'service_binding_name',
      'service_definition_name',
      'package_name',
    ],
  },
} as const;

interface CreateServiceBindingArgs {
  service_binding_name: string;
  service_definition_name: string;
  package_name: string;
  description?: string;
  binding_type?: ServiceBindingTypeInput;
  service_binding_version?: string;
  service_name?: string;
  service_version?: string;
  transport_request?: string;
  activate?: boolean;
  response_format?: ServiceBindingResponseFormat;
}

export async function handleCreateServiceBinding(
  context: HandlerContext,
  args: CreateServiceBindingArgs,
) {
  const { connection, logger } = context;

  try {
    if (!args?.service_binding_name) {
      throw new Error('service_binding_name is required');
    }
    if (!args?.service_definition_name) {
      throw new Error('service_definition_name is required');
    }
    if (!args?.package_name) {
      throw new Error('package_name is required');
    }

    const serviceBindingName = args.service_binding_name.trim().toUpperCase();
    const serviceDefinitionName = args.service_definition_name
      .trim()
      .toUpperCase();
    const packageName = args.package_name.trim().toUpperCase();
    const responseFormat = args.response_format ?? 'xml';
    const bindingType = args.binding_type === 'ODataV2' ? 'ODATA' : 'ODATA';
    const bindingVersion =
      args.service_binding_version ??
      (args.binding_type === 'ODataV2' ? 'V2' : 'V4');
    const serviceType = args.binding_type === 'ODataV2' ? 'odatav2' : 'odatav4';
    const serviceName = (args.service_name || serviceBindingName)
      .trim()
      .toUpperCase();
    const serviceVersion = (args.service_version || '0001').trim();

    const client = createAdtClient(connection, logger);
    const state = await client.getServiceBinding().create(
      {
        bindingName: serviceBindingName,
        packageName: packageName,
        description: (args.description || serviceBindingName).trim(),
        serviceDefinitionName,
        serviceName,
        serviceVersion,
        bindingType,
        bindingVersion,
        transportRequest: args.transport_request,
        serviceType,
      },
      { activateOnCreate: args.activate !== false },
    );
    const response = state.createResult;
    if (!response) {
      throw new Error(
        `Create did not return a response for service binding ${serviceBindingName}`,
      );
    }
    const readPayload = state.readResult
      ? parseServiceBindingPayload(state.readResult.data, responseFormat)
      : undefined;
    const generatedPayload = state.generatedInfoResult
      ? parseServiceBindingPayload(
          state.generatedInfoResult.data,
          responseFormat,
        )
      : undefined;

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          service_binding_name: serviceBindingName,
          service_definition_name: serviceDefinitionName,
          package_name: packageName,
          binding_type: args.binding_type ?? 'ODataV4',
          service_binding_version: bindingVersion,
          service_name: serviceName,
          service_version: serviceVersion,
          activated: args.activate !== false,
          response_format: responseFormat,
          status: response.status,
          payload: parseServiceBindingPayload(response.data, responseFormat),
          read_payload: readPayload,
          generated_info: generatedPayload,
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
    logger?.error('Error creating service binding:', error);
    return return_error(error);
  }
}
