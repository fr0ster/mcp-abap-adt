/**
 * CheckDomain Handler - Syntax check for ABAP Domain
 *
 * Uses AdtClient.getDomain().check from @mcp-abap-adt/adt-clients 19.
 */

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseCheck } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CheckDomainLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Perform syntax check on an ABAP domain. Returns syntax errors, warnings, and messages.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name.',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Which version to check. Defaults to the inactive one, what a caller wants right after a write; an object that is only active has no inactive version, and SAP answers such a check with "Error while importing object … from the database" — ask for active.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['domain_name'],
  },
} as const;

interface CheckDomainArgs {
  domain_name: string;
  version?: 'active' | 'inactive';
  detail?: 'terse' | 'full' | 'raw';
}

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
      createAdtClient(connection, logger)
        .getDomain(resultsFor(domainDocuments))
        // `status` left undefined: the shipped default checks the inactive
        // version, which is what a caller wants right after a write.
        .check({ domainName }, args.version, { analyse: analyseException }),
    project(detail, terseCheck),
  );
}
