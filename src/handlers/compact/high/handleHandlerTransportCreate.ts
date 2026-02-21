import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { handleCreateTransport } from '../../transport/high/handleCreateTransport';
import { compactTransportCreateSchema } from './compactSchemas';

export const TOOL_DEFINITION = {
  name: 'HandlerTransportCreate',
  description: 'Compact transport create. Creates a new transport request.',
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

