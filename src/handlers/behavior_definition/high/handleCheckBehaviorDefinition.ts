import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckBehaviorDefinition as handleCheckBdefLow } from '../low/handleCheckBehaviorDefinition';

export const TOOL_DEFINITION = {
  name: 'CheckBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Perform syntax check on an ABAP behavior definition (BDEF). Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'BehaviorDefinition name (e.g., ZI_MY_BDEF).',
      },
    },
    required: ['name'],
  },
} as const;

export async function handleCheckBehaviorDefinition(
  context: HandlerContext,
  args: { name: string },
) {
  const result = await handleCheckBdefLow(context, args);
  return normalizeCheckResponse(result, args.name?.toUpperCase());
}
