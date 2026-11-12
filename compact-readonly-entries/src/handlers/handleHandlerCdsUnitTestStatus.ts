import { compactCdsUnitTestStatusSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetCdsUnitTestStatus } from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerCdsUnitTestStatus',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Reads the status of the CDS unit test run named by run_id. Required: run_id*. Optional: with_long_polling. Response: JSON.',
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
