/**
 * DeleteDomain Handler - Delete ABAP Domain via ADT deletion API
 *
 * Uses AdtClient.getDomain().delete from @mcp-abap-adt/adt-clients 19.
 *
 * The deletion service answers a refusal inside a 200 (`del:isDeleted="false"`,
 * a `del:message` alongside it) — `analyseDeletion` reads that rather than the
 * HTTP status, which is why this handler never inspects `response.status`
 * itself. No lock is taken: a held lock is what makes ADT refuse a deletion,
 * so acquiring one here would be self-defeating. adt-clients 19 removed the
 * pre-check (`assertDeletable`) that `delete()` used to run internally, so
 * `deleteIfDeletable` runs `checkDeletion` first and sends the delete only
 * when the check allows it.
 */

import { domainDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteDomain',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP domain from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      domain_name: {
        type: 'string',
        description: 'Domain name (e.g., Z_MY_DOMAIN).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['domain_name'],
  },
} as const;

interface DeleteDomainArgs {
  domain_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteDomain(
  context: HandlerContext,
  args: DeleteDomainArgs,
) {
  const { connection, logger } = context;
  const { domain_name, transport_request } = args;

  if (!domain_name) {
    return return_error(new Error('domain_name is required'));
  }

  const domainName = domain_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteDomain', detail },
    () =>
      deleteIfDeletable(
        createAdtClient(connection, logger).getDomain(
          resultsFor(domainDocuments),
        ),
        { domainName, transportRequest: transport_request },
      ),
    project(detail, terseDeletion),
  );
}
