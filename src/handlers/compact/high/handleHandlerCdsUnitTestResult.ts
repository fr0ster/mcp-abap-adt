import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleGetCdsUnitTestResult } from '../../unit_test/high/handleGetCdsUnitTestResult';
import { compactCdsUnitTestResultSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerCdsUnitTestResult',
  description: 'Compact CDS unit test result. Reads run result by run_id.',
  inputSchema: compactCdsUnitTestResultSchema,
} as const;

type HandlerCdsUnitTestResultArgs = {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
};

export async function handleHandlerCdsUnitTestResult(
  context: HandlerContext,
  args: HandlerCdsUnitTestResultArgs,
) {
  return handleGetCdsUnitTestResult(context, args);
}

