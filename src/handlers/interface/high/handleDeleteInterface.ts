/**
 * DeleteInterface Handler - Delete ABAP Interface via ADT deletion API
 *
 * Uses AdtClient.getInterface().delete from @mcp-abap-adt/adt-clients 19.
 * See `handleDeleteDomain.ts` for the shape and the masking this follows: a
 * refusal answers 200, `analyseDeletion` reads it rather than the status,
 * and no lock is taken because a held lock is what makes ADT refuse.
 */

import { interfaceDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteInterface',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP interface from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      interface_name: {
        type: 'string',
        description: 'Interface name (e.g., Z_MY_INTERFACE).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['interface_name'],
  },
} as const;

interface DeleteInterfaceArgs {
  interface_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteInterface(
  context: HandlerContext,
  args: DeleteInterfaceArgs,
) {
  const { connection, logger } = context;
  const { interface_name, transport_request } = args;

  if (!interface_name) {
    return return_error(new Error('interface_name is required'));
  }

  const interfaceName = interface_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteInterface', detail },
    () =>
      createAdtClient(connection, logger)
        .getInterface(resultsFor(interfaceDocuments))
        .delete(
          { interfaceName, transportRequest: transport_request },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
