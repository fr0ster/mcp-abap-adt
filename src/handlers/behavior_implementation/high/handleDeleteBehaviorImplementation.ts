/**
 * DeleteBehaviorImplementation Handler - Delete ABAP BehaviorImplementation
 * via ADT deletion API
 *
 * Uses AdtClient.getBehaviorImplementation().delete from
 * @mcp-abap-adt/adt-clients 19. A behavior implementation is a class
 * (`getBehaviorImplementation<R extends IClassResults>`), so its result set
 * is `classDocuments`, not a set of its own. See `handleDeleteDomain.ts` for
 * the shape and the masking this follows: a refusal answers 200,
 * `analyseDeletion` reads it rather than the status, and no lock is taken
 * because a held lock is what makes ADT refuse.
 */

import { classDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP behavior implementation from the SAP system via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_implementation_name: {
        type: 'string',
        description:
          'BehaviorImplementation name (e.g., Z_MY_BEHAVIORIMPLEMENTATION).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects. Optional for local objects ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['behavior_implementation_name'],
  },
} as const;

interface DeleteBehaviorImplementationArgs {
  behavior_implementation_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteBehaviorImplementation(
  context: HandlerContext,
  args: DeleteBehaviorImplementationArgs,
) {
  const { connection, logger } = context;
  const { behavior_implementation_name, transport_request } = args;

  if (!behavior_implementation_name) {
    return return_error(new Error('behavior_implementation_name is required'));
  }

  const className = behavior_implementation_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteBehaviorImplementation', detail },
    () =>
      deleteIfDeletable(
        createAdtClient(connection, logger).getBehaviorImplementation(
          resultsFor(classDocuments),
        ),
        { className, transportRequest: transport_request },
      ),
    project(detail, terseDeletion),
  );
}
