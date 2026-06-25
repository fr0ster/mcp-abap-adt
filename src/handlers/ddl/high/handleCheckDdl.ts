import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckDdl as handleCheckDdlLow } from '../low/handleCheckDdl';

export const TOOL_DEFINITION = {
  name: 'CheckDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Perform syntax check on an ABAP CDS view. Can check existing view (active/inactive) or validate hypothetical DDL source. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description:
          'CDS view name to check, passed as ddl_name (e.g., ZI_MY_VIEW).',
      },
      version: {
        type: 'string',
        description:
          "Version to check: 'active' or 'inactive'. Default: inactive.",
        enum: ['active', 'inactive'],
      },
      ddl_source: {
        type: 'string',
        description:
          'Optional: DDL source code to validate instead of the saved version.',
      },
    },
    required: ['ddl_name'],
  },
} as const;

export async function handleCheckDdl(
  context: HandlerContext,
  args: { ddl_name: string; version?: string; ddl_source?: string },
) {
  const result = await handleCheckDdlLow(context, args);
  return normalizeCheckResponse(result, args.ddl_name?.toUpperCase());
}
