import {
  compactCdsUnitTestResultSchema,
  toolDescription,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetCdsUnitTestResultOnce,
  RESULT_ONCE_PARTS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerCdsUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(RESULT_ONCE_PARTS.cds),
  inputSchema: compactCdsUnitTestResultSchema,
} as const;

type HandlerCdsUnitTestResultArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleHandlerCdsUnitTestResult(
  context: HandlerContext,
  args: HandlerCdsUnitTestResultArgs,
) {
  return handleGetCdsUnitTestResultOnce(context, args);
}
