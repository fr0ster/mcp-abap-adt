import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckPackage as handleCheckPackageLow } from '../low/handleCheckPackage';

export const TOOL_DEFINITION = {
  name: 'CheckPackage',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Perform syntax check on an ABAP package. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZMY_PACKAGE).',
      },
      super_package: {
        type: 'string',
        description: 'Super package name (parent package).',
      },
    },
    required: ['package_name', 'super_package'],
  },
} as const;

export async function handleCheckPackage(
  context: HandlerContext,
  args: { package_name: string; super_package: string },
) {
  const result = await handleCheckPackageLow(context, args);
  return normalizeCheckResponse(result, args.package_name?.toUpperCase());
}
