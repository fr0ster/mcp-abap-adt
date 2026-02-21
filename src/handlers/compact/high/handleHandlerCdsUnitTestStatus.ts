import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleGetCdsUnitTestStatus } from '../../unit_test/high/handleGetCdsUnitTestStatus';
import { compactCdsUnitTestStatusSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerCdsUnitTestStatus',
  description: 'Compact CDS unit test status. Reads run status by run_id.',
  inputSchema: compactCdsUnitTestStatusSchema,
} as const;

type HandlerCdsUnitTestStatusArgs = {
  run_id: string;
  with_long_polling?: boolean;
};

export async function handleHandlerCdsUnitTestStatus(
  context: HandlerContext,
  args: HandlerCdsUnitTestStatusArgs,
) {
  return handleGetCdsUnitTestStatus(context, args);
}

