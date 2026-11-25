import {
  compactOf,
  compactUnitTestStatusSchema,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetUnitTestStatus,
  READ_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestStatus',
  available_in: ['onprem', 'cloud'] as const,
  description: compactOf(READ_DEFINITIONS.GetUnitTestStatus.description),
  inputSchema: compactUnitTestStatusSchema,
} as const;

type HandlerUnitTestStatusArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerUnitTestStatus(
  context: HandlerContext,
  args: HandlerUnitTestStatusArgs,
) {
  return handleGetUnitTestStatus(context, args);
}
