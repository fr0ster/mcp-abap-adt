import { compactCdsUnitTestResultSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleGetCdsUnitTestResult } from '@mcp-abap-adt/lib/handlers/read';

export const TOOL_DEFINITION = {
  name: 'HandlerCdsUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'CDS unit test run result. object_type: not used. Required: run_id*. Optional: with_navigation_uris, format(abapunit|junit). Response: JSON.',
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
