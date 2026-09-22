/**
 * DeleteMessageClass Handler - Delete an ABAP Message Class (MSAG) via ADT
 * deletion API
 *
 * Uses AdtClient.getMessageClass().delete from @mcp-abap-adt/adt-clients 19.
 * Deletes the class and all of its messages. See `handleDeleteDomain.ts` for
 * the shape and the masking this follows: a refusal answers 200,
 * `analyseDeletion` reads it rather than the status, and no lock is taken
 * because a held lock is what makes ADT refuse.
 */

import { messageClassDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseDeletion } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseDeletion } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP message class (MSAG) and all of its messages from the SAP system via ADT deletion API. Transport request required for transportable objects, optional for local ($TMP).',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Message class name (e.g., ZMY_MSGS).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects, optional for local ($TMP). A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['message_class_name'],
  },
} as const;

interface DeleteMessageClassArgs {
  message_class_name: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleDeleteMessageClass(
  context: HandlerContext,
  args: DeleteMessageClassArgs,
) {
  const { connection, logger } = context;
  const { message_class_name, transport_request } = args;

  if (!message_class_name) {
    return return_error(new Error('message_class_name is required'));
  }

  const name = message_class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'DeleteMessageClass', detail },
    () =>
      createAdtClient(connection, logger)
        .getMessageClass(resultsFor(messageClassDocuments))
        .delete(
          { name, transportRequest: transport_request },
          { analyse: analyseDeletion },
        ),
    project(detail, terseDeletion),
  );
}
