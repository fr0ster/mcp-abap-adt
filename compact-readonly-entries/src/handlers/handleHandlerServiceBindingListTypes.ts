import { compactServiceBindingListTypesSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleListServiceBindingTypes } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerServiceBindingListTypes',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Lists the available service binding types. Optional: response_format(xml|json|plain). Response: XML/JSON/plain by response_format.',
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
