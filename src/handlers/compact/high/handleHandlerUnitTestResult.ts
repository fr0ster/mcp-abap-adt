import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleGetUnitTestResult } from '../../unit_test/high/handleGetUnitTestResult';
import { compactUnitTestResultSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestResult',
  description: 'Compact ABAP Unit result. Reads run result by run_id.',
  inputSchema: compactUnitTestResultSchema,
} as const;

type HandlerUnitTestResultArgs = {
  run_id: string;
  with_navigation_uris?: boolean;
  format?: 'abapunit' | 'junit';
};

export async function handleHandlerUnitTestResult(
  context: HandlerContext,
  args: HandlerUnitTestResultArgs,
) {
  return handleGetUnitTestResult(context, args);
}

