import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';
import {
  parseServiceBindingPayload,
  type ServiceBindingResponseFormat,
} from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'ListServiceBindingTypes',
  description:
    'List available service binding types (for example ODataV2/ODataV4) from ADT Business Services endpoint.',
  inputSchema: {
    type: 'object',
    properties: {
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        default: 'xml',
      },
    },
  },
} as const;

interface ListServiceBindingTypesArgs {
  response_format?: ServiceBindingResponseFormat;
}

export async function handleListServiceBindingTypes(
  context: HandlerContext,
  args: ListServiceBindingTypesArgs = {},
) {
  const { connection, logger } = context;

  try {
    const responseFormat = args.response_format ?? 'xml';
    const client = new AdtClient(connection, logger);
    const response = await client.getServiceBinding().getServiceBindingTypes();

    return return_response({
      data: JSON.stringify(
        {
          success: true,
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
    logger?.error('Error listing service binding types:', error);
    return return_error(error);
  }
}
