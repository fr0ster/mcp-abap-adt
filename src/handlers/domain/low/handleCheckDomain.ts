import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CheckDomain Handler - Syntax check for ABAP Domain
 *
 * Uses AdtClient.getDomain().check from @mcp-abap-adt/adt-clients 19.
 */

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckDomainLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages.',
  inputSchema: z.object({
    domain_name: z.string().describe('Domain name.'),
    version: z
      .enum(['active', 'inactive'])
      .optional()
      .describe(
        'Which version to check. Without `version` the active version is checked; pass `inactive` for the unsaved one right after a write.',
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type CheckDomainArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCheckDomain(
  context: HandlerContext,
  args: CheckDomainArgs,
) {
  const { connection, logger } = context;
  const { domain_name } = args;

  if (!domain_name) {
    return return_error(new Error('domain_name is required'));
  }

  const domainName = domain_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CheckDomainLow', detail },
    () =>
      withAdtHeaders(context, 'domain.check', (headers) =>
        createAdtClient(connection, logger)
          .getDomain(resultsFor(domainDocuments))
          .check(
            { domainName },
            args.version === 'inactive' ? 'inactive' : 'active',
            {
              headers,
              analyse: analyseException,
            },
          ),
      ),
    project(detail, terseCheck),
  );
}
