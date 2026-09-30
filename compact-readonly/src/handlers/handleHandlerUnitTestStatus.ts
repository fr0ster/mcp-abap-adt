import { compactUnitTestStatusSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetUnitTestStatus } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestStatus',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'ABAP Unit test run status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.',
  inputSchema: compactUnitTestStatusSchema,
} as const;

type HandlerUnitTestStatusArgs = {
  run_id: string;
  with_long_polling?: boolean;
};

export async function handleHandlerUnitTestStatus(
  context: HandlerContext,
  args: HandlerUnitTestStatusArgs,
) {
  return handleGetUnitTestStatus(context, args);
}
