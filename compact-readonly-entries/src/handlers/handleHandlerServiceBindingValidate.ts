import {
  compactOf,
  compactServiceBindingValidateSchema,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleValidateServiceBinding,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerServiceBindingValidate',
  available_in: ['onprem', 'cloud'] as const,
  description: compactOf(READ_DEFINITIONS.ValidateServiceBinding.description),
  inputSchema: compactServiceBindingValidateSchema,
} as const;

type HandlerServiceBindingValidateArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleHandlerServiceBindingValidate(
  context: HandlerContext,
  args: HandlerServiceBindingValidateArgs,
) {
  return handleValidateServiceBinding(context, args);
}
