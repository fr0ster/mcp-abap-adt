import {
  compactOf,
  compactServiceBindingListTypesSchema,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleListServiceBindingTypes,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerServiceBindingListTypes',
  available_in: ['onprem', 'cloud'] as const,
  description: compactOf(READ_DEFINITIONS.ListServiceBindingTypes.description),
  inputSchema: compactServiceBindingListTypesSchema,
} as const;

type HandlerServiceBindingListTypesArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleHandlerServiceBindingListTypes(
  context: HandlerContext,
  args: HandlerServiceBindingListTypesArgs,
) {
  return handleListServiceBindingTypes(context, args);
}
