import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckMetadataExtension as handleCheckMetadataExtensionLow } from '../low/handleCheckMetadataExtension';

export const TOOL_DEFINITION = {
  name: 'CheckMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Perform syntax check on an ABAP metadata extension (DDLX). Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata extension name (e.g., ZC_MY_DDLX).',
      },
    },
    required: ['name'],
  },
} as const;

export async function handleCheckMetadataExtension(
  context: HandlerContext,
  args: { name: string },
) {
  const result = await handleCheckMetadataExtensionLow(context, args);
  return normalizeCheckResponse(result, args.name?.toUpperCase());
}
