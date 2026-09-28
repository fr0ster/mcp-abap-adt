import { compactTransportCreateSchema } from '@mcp-abap-adt/lib/compact-shared';
import type { HandlerContext } from '@mcp-abap-adt/lib/handlers';
import { handleCreateTransport } from '@mcp-abap-adt/lib/handlers/write';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportCreate',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Transport create. object_type: not used. Required: description*. Optional: transport_type(workbench|customizing), target_system, owner. Response: JSON.',
  inputSchema: compactTransportCreateSchema,
} as const;

type HandlerTransportCreateArgs = {
  transport_type?: 'workbench' | 'customizing';
  description: string;
  target_system?: string;
  owner?: string;
};

export async function handleHandlerTransportCreate(
  context: HandlerContext,
  args: HandlerTransportCreateArgs,
) {
  return handleCreateTransport(context, args);
}
