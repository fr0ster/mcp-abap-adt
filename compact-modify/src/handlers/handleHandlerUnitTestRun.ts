import {
  compactUnitTestRunSchema,
  toolDescription,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleStartUnitTestRun,
  START_RUN_PARTS,
} from '@mcp-abap-adt/lib/handlers/write';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerUnitTestRun',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(START_RUN_PARTS),
  inputSchema: compactUnitTestRunSchema,
} as const;

type HandlerUnitTestRunArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerUnitTestRun(
  context: HandlerContext,
  args: HandlerUnitTestRunArgs,
) {
  return handleStartUnitTestRun(context, args);
}
