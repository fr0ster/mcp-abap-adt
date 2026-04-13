import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckDataElement as handleCheckDataElementLow } from '../low/handleCheckDataElement';

export const TOOL_DEFINITION = {
  name: 'CheckDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Perform syntax check on an ABAP data element. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name (e.g., ZDE_MY_ELEMENT).',
      },
    },
    required: ['data_element_name'],
  },
} as const;

export async function handleCheckDataElement(
  context: HandlerContext,
  args: { data_element_name: string },
) {
  const result = await handleCheckDataElementLow(context, args);
  return normalizeCheckResponse(result, args.data_element_name?.toUpperCase());
}
