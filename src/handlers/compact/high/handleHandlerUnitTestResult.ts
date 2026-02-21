import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleGetUnitTestResult } from '../../unit_test/high/handleGetUnitTestResult';
import { compactUnitTestResultSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestResult',
  description:
    'ABAP Unit result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.',
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
