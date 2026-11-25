import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import * as z from 'zod';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { readerParts, toolDescription } from '../../../lib/description';
import { requiredText } from '../../../lib/handlers/argumentRules';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  READ_PART_FIELD,
  type ReadPart,
  readPartOf,
} from '../../../lib/handlers/readPart';
import { readServiceBindingMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import {
  parseServiceBindingPayload,
  type ServiceBindingResponseFormat,
} from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'GetServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    readerParts({
      object: 'an OData service binding',
      at: 'at its active version',
      holding:
        'its binding definition, or its package, person responsible and description, in the format asked',
    }),
  ),
  inputSchema: z.object({
    service_binding_name: requiredText(
      'service_binding_name is required',
    ).describe('Service binding name. Case-insensitive.'),
    part: READ_PART_FIELD,
    response_format: z
      .enum(['xml', 'json', 'plain'])
      .default('xml')
      .optional()
      .describe(
        'Preferred response format. "json" requests JSON from endpoint, "xml" parses XML payload, "plain" returns raw text.',
      ),
  }),
} as const;

type GetServiceBindingArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetServiceBinding(
  context: HandlerContext,
  args: GetServiceBindingArgs,
) {
  const { connection, logger } = context;
  const part = readPartOf(args.part);

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
      () => readServiceBindingMetadata(client, { bindingName }, 'active'),
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
    () => obj.read({ bindingName }, 'active', { analyse: analyseException }),
    (source: AdtReading<string>) => ({
      success: true,
      service_binding_name: bindingName,
      response_format: responseFormat,
      part,
      source: parseServiceBindingPayload(source.raw, responseFormat),
    }),
  );
}
