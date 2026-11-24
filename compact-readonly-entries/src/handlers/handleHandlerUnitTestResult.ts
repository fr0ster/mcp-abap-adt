import {
  compactUnitTestResultSchema,
  toolDescription,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleGetUnitTestResultOnce,
  RESULT_ONCE_PARTS,
} from '@mcp-abap-adt/lib/handlers/read';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestResult',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(RESULT_ONCE_PARTS.abap),
  inputSchema: compactUnitTestResultSchema,
} as const;

type HandlerUnitTestResultArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerUnitTestResult(
  context: HandlerContext,
  args: HandlerUnitTestResultArgs,
) {
  return handleGetUnitTestResultOnce(context, args);
}
