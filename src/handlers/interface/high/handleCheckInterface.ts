import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckInterface as handleCheckInterfaceLow } from '../low/handleCheckInterface';

export const TOOL_DEFINITION = {
  name: 'CheckInterface',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Perform syntax check on an ABAP interface. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., ZIF_MY_INTERFACE).',
      },
    },
    required: ['interface_name'],
  },
} as const;

export async function handleCheckInterface(
  context: HandlerContext,
  args: { interface_name: string },
) {
  const result = await handleCheckInterfaceLow(context, args);
  return normalizeCheckResponse(result, args.interface_name?.toUpperCase());
}
