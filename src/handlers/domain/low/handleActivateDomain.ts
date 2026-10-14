/**
 * ActivateDomain Handler - Activate ABAP Domain
 *
 * Uses AdtClient.getDomain().activate from @mcp-abap-adt/adt-clients 19.
 */

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseActivation } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseActivation } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ActivateDomainLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Activate an ABAP domain. Returns activation status and any warnings/errors.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['domain_name'],
  },
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
      createAdtClient(connection, logger)
        .getDomain(resultsFor(domainDocuments))
        .activate({ domainName }, { analyse: analyseActivation }),
    project(detail, terseActivation),
  );
}
