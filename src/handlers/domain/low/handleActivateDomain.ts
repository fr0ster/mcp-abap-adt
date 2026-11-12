import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * ActivateDomain Handler - Activate ABAP Domain
 *
 * Uses AdtClient.getDomain().activate from @mcp-abap-adt/adt-clients 19.
 */

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { projectActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateDomainLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP domain. Returns activation status and any warnings/errors.',
  inputSchema: z.object({
    domain_name: z.string().describe('Domain name.'),
    ...DETAIL_SHAPE,
  }),
} as const;

interface ActivateDomainArgs {
  domain_name: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleActivateDomain(
  context: HandlerContext,
  args: ActivateDomainArgs,
) {
  const { connection, logger } = context;
  const { domain_name } = args;

  if (!domain_name) {
    return return_error(new Error('domain_name is required'));
  }

  const domainName = domain_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'ActivateDomainLow', detail },
    () =>
      withAdtHeaders(context, 'domain.activate', (headers) =>
        createAdtClient(connection, logger)
          .getDomain(resultsFor(domainDocuments))
          .activate({ domainName }, { headers, analyse: analyseActivation }),
      ),
    projectActivation(detail),
  );
}
