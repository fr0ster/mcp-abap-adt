import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import {
  parseServiceBindingPayload,
  type ServiceBindingResponseFormat,
} from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'GetServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
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
  if (!args?.service_binding_name) {
    return return_error(new Error('service_binding_name is required'));
  }

  // The config field is `bindingName`, not `serviceBindingName` — confirmed
  // against `IServiceBindingConfig` (same field `ReadServiceBinding` uses),
  // and the pre-migration handler already called it that way.
  const bindingName = args.service_binding_name.trim().toUpperCase();
  const responseFormat = args.response_format ?? 'xml';
  const obj = createAdtClient(connection, logger).getServiceBinding(
    resultsFor(serviceDocuments),
  );

  // GetServiceBinding has only ever answered the source (via `.read()`),
  // never the metadata — one call, unlike ReadServiceBinding's pair. No
  // `version` in this tool's surface, same as `ReadServiceBinding`.
  return answer(
    { tool: 'GetServiceBinding', detail: 'terse' },
    () => obj.read({ bindingName }, undefined, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      service_binding_name: bindingName,
      response_format: responseFormat,
      payload: parseServiceBindingPayload(source.raw, responseFormat),
    }),
  );
}
