import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleCreateTransport } from '../../transport/high/handleCreateTransport';
import { compactTransportCreateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportCreate',
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
