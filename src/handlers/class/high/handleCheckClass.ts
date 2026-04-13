import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckClass as handleCheckClassLow } from '../low/handleCheckClass';

export const TOOL_DEFINITION = {
  name: 'CheckClass',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Perform syntax check on an ABAP class. Can check existing class (active/inactive) or validate hypothetical source code. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' (last activated) or 'inactive' (current unsaved). Default: active.",
        enum: ['active', 'inactive'],
      },
      source_code: {
        type: 'string',
        description:
          'Optional: source code to validate. If provided, validates hypothetical code without creating object. Must include complete CLASS DEFINITION and IMPLEMENTATION sections.',
      },
    },
    required: ['class_name'],
  },
} as const;

export async function handleCheckClass(
  context: HandlerContext,
  args: { class_name: string; version?: string; source_code?: string },
) {
  const result = await handleCheckClassLow(context, args);
  return normalizeCheckResponse(result, args.class_name?.toUpperCase());
}
