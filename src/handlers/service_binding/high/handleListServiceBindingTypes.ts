import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import {
  parseServiceBindingPayload,
  type ServiceBindingResponseFormat,
} from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'ListServiceBindingTypes',
  available_in: ['onprem', 'cloud'] as const,
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
  const responseFormat = args.response_format ?? 'xml';
  const obj = createAdtClient(connection, logger).getServiceBinding(
    resultsFor(serviceDocuments),
  );

  // `getServiceBindingTypes()` takes no arguments at all — no `analyse` to
  // hand it, confirmed against the shipped `AdtServiceBinding.d.ts`
  // signature (`getServiceBindingTypes(): Promise<IAdtResponse<...>>`).
  // `bindingTypes` is `structured` in `READING_BY_SLOT`, which still
  // carries `.raw` beside its parse, so the payload keeps parsing the raw
  // body exactly as before.
  return answer(
    { tool: 'ListServiceBindingTypes', detail: 'terse' },
    () => obj.getServiceBindingTypes(),
    (reading: AdtReading<unknown>) => ({
      success: true,
      response_format: responseFormat,
      payload: parseServiceBindingPayload(reading.raw, responseFormat),
    }),
  );
}
