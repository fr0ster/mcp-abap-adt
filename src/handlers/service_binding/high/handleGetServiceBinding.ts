import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_PROPERTY,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import { readServiceBindingMetadata } from '../../../lib/strategies/metadataReads';
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
    '[read-only] Reads the OData service binding named by service_binding_name in one request: its binding document (part "source", the default) or its ADT metadata document (part "metadata": package, responsible, description), each in the response_format given. Returns the part read.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name. Case-insensitive.',
      },
      part: READ_PART_PROPERTY,
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
  part?: ReadPart;
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
  const part = readPartOf(args.part);
  if (part instanceof Error) return return_error(part);

  // The config field is `bindingName`, not `serviceBindingName` — confirmed
  // against `IServiceBindingConfig`, and the pre-migration handler already
  // called it that way.
  const bindingName = args.service_binding_name.trim().toUpperCase();
  const responseFormat = args.response_format ?? 'xml';
  const client = createAdtClient(connection, logger);
  const obj = client.getServiceBinding(resultsFor(serviceDocuments));

  // One request per call: the part asked for, and only it.
  if (part === 'metadata') {
    return answer(
      { tool: 'GetServiceBinding', detail: 'terse' },
      () => readServiceBindingMetadata(client, { bindingName }),
      (metadata: AdtReading<string>) => ({
        success: true,
        service_binding_name: bindingName,
        part,
        response_format: responseFormat,
        metadata: parseServiceBindingPayload(metadata.raw, responseFormat),
      }),
    );
  }
  return answer(
    { tool: 'GetServiceBinding', detail: 'terse' },
    () => obj.read({ bindingName }, undefined, { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      service_binding_name: bindingName,
      response_format: responseFormat,
      part,
      source: parseServiceBindingPayload(source.raw, responseFormat),
    }),
  );
}
