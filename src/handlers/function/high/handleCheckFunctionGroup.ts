import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckFunctionGroup as handleCheckFunctionGroupLow } from '../low/handleCheckFunctionGroup';

export const TOOL_DEFINITION = {
  name: 'CheckFunctionGroup',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Perform syntax check on an ABAP function group. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      function_group_name: {
        type: 'string',
        description: 'Function group name (e.g., ZFGRP_MY_GROUP).',
      },
    },
    required: ['function_group_name'],
  },
} as const;

export async function handleCheckFunctionGroup(
  context: HandlerContext,
  args: { function_group_name: string },
) {
  const result = await handleCheckFunctionGroupLow(context, args);
  return normalizeCheckResponse(
    result,
    args.function_group_name?.toUpperCase(),
  );
}
