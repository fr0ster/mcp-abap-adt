import { compactServiceBindingListTypesSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleListServiceBindingTypes } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerServiceBindingListTypes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Service binding types list. object_type: not used. Required: none. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.',
  inputSchema: compactServiceBindingListTypesSchema,
} as const;

type HandlerServiceBindingListTypesArgs = {
  response_format?: 'xml' | 'json' | 'plain';
};

export async function handleHandlerServiceBindingListTypes(
  context: HandlerContext,
  args: HandlerServiceBindingListTypesArgs,
) {
  return handleListServiceBindingTypes(context, args);
}
