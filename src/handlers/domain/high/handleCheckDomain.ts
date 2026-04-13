import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { normalizeCheckResponse } from '../../../lib/normalizeCheckResponse';
import { handleCheckDomain as handleCheckDomainLow } from '../low/handleCheckDomain';

export const TOOL_DEFINITION = {
  name: 'CheckDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name (e.g., ZDM_MY_DOMAIN).',
      },
    },
    required: ['domain_name'],
  },
} as const;

export async function handleCheckDomain(
  context: HandlerContext,
  args: { domain_name: string },
) {
  const result = await handleCheckDomainLow(context, args);
  return normalizeCheckResponse(result, args.domain_name?.toUpperCase());
}
