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
  //
  // **Task 28: why this tool carries no `detail`.** `reading` genuinely is
  // an `AdtReading` with a `.raw` distinct from its parse, which would
  // normally make `detail` owed. It is not owed HERE because
  // `response_format` already spans the same axis: `'plain'` answers
  // `reading.raw` verbatim (`parseServiceBindingPayload`'s own first
  // branch, above) — exactly what `detail: 'raw'` would — while `'xml'`/
  // `'json'` each answer a parse, just a caller-chosen ENCODING of one
  // rather than a caller-chosen LEVEL of one. A second parameter
  // controlling the same raw-vs-parsed choice `response_format` already
  // makes would not add a capability, only a second, overlapping way to
  // ask for the one this tool already has.
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
