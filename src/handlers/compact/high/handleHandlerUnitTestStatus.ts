import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleGetUnitTestStatus } from '../../unit_test/high/handleGetUnitTestStatus';
import { compactUnitTestStatusSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestStatus',
  description:
    'ABAP Unit status. object_type: not used. Required: run_id*. Optional: with_long_polling. Response: JSON.',
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
