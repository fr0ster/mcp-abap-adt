import {
  compactCdsUnitTestStatusSchema,
  compactOf,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetCdsUnitTestStatus,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerCdsUnitTestStatus',
  available_in: ['onprem', 'cloud'] as const,
  description: compactOf(READ_DEFINITIONS.GetCdsUnitTestStatus.description),
  inputSchema: compactCdsUnitTestStatusSchema,
} as const;

type HandlerCdsUnitTestStatusArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleHandlerCdsUnitTestStatus(
  context: HandlerContext,
  args: HandlerCdsUnitTestStatusArgs,
) {
  return handleGetCdsUnitTestStatus(context, args);
}
