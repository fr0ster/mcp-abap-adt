/**
 * DeleteServiceBinding Handler - Delete ABAP service binding via ADT
 * deletion API
 *
 * Uses AdtClient.getServiceBinding().delete from @mcp-abap-adt/adt-clients 19.
 * See `handleDeleteDomain.ts` for the shape and the masking this follows: a
 * refusal answers 200, `analyseDeletion` reads it rather than the status,
 * and no lock is taken because a held lock is what makes ADT refuse.
 *
 * **`response_format` stays on the surface but no longer does anything.**
 * The pre-migration handler used it to pick how `state.deleteResult.data`
 * (the deletion service's raw XML) was rendered — xml/json/plain, through
 * `parseServiceBindingPayload`. `delete()` now answers a structured deletion
 * document (`del:deletionResult`/`del:checkResponse`) through the same
 * `analyseDeletion`/`terseDeletion` pair every other deletion in this task
 * uses, and every caller gets that one shape regardless of what it asks
 * for — removing the parameter would be a surface change this task is not
 * allowed to make, so it is accepted and ignored rather than dropped.
 */

import { serviceDocuments } from '@mcp-abap-adt/adt-clients';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { deleteIfDeletable } from '../../../lib/strategies/checkedDeletion';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
import type { ServiceBindingResponseFormat } from './serviceBindingPayloadUtils';

export const TOOL_DEFINITION = {
  name: 'DeleteServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete ABAP service binding via ADT deletion API. Transport request optional for $TMP objects.',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name to delete.',
      },
      transport_request: {
        type: 'string',
        description:
          'Optional transport request for deletion transport flow. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      response_format: {
        type: 'string',
        enum: ['xml', 'json', 'plain'],
        default: 'xml',
        description:
          'Accepted for backward compatibility; no longer affects the answer, which is always the structured deletion result.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['service_binding_name'],
  },
} as const;

interface DeleteServiceBindingArgs {
  service_binding_name: string;
  transport_request?: string;
  response_format?: ServiceBindingResponseFormat;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteServiceBinding(
  context: HandlerContext,
  args: DeleteServiceBindingArgs,
) {
  const { connection, logger } = context;
  const { service_binding_name, transport_request } = args;

  if (!service_binding_name) {
    return return_error(new Error('service_binding_name is required'));
  }

  const bindingName = service_binding_name.trim().toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteServiceBinding', detail },
    () =>
      deleteIfDeletable(
        createAdtClient(connection, logger).getServiceBinding(
          resultsFor(serviceDocuments),
        ),
        { bindingName, transportRequest: transport_request },
      ),
    project(detail, terseDeletion),
  );
}
