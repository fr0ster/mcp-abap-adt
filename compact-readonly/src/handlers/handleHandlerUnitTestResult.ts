import { compactUnitTestResultSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetUnitTestResult } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'ABAP Unit test run result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.',
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
