import {
  compactOf,
  compactTransportCreateSchema,
} from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import {
  handleCreateTransport,
  WRITE_DEFINITIONS,
} from '@mcp-abap-adt/lib/handlers/write';
import type * as z from 'zod';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportCreate',
  available_in: ['onprem', 'cloud'] as const,
  description: compactOf(WRITE_DEFINITIONS.CreateTransport.description),
  inputSchema: compactTransportCreateSchema,
} as const;

type HandlerTransportCreateArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleHandlerTransportCreate(
  context: HandlerContext,
  args: HandlerTransportCreateArgs,
) {
  return handleCreateTransport(context, args);
}
