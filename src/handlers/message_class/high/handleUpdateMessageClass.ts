/**
 * UpdateMessageClass Handler - Write a Message Class's own metadata
 *
 * Uses AdtClient.getMessageClass().updateMetadata from
 * @mcp-abap-adt/adt-clients 19.
 *
 * **This handler holds no lock — it takes the caller's lock handle as an
 * argument.** `updateMetadata()` reads `options?.lockHandle` and issues one
 * PUT; there is no internal lock/unlock (the pre-migration handler's
 * `getMessageClass().update()` doesn't exist in v19 — `updateMetadata` is the
 * atomic member, and the caller supplies the lock it needs). This changes
 * the tool's surface beyond `detail` — see the task report for why.
 *
 * **The member is `updateMetadata`, not `update`.** `IMessageClassContract`
 * declares `IAdtMetadataUpdatable`, whose method is `updateMetadata`; there
 * is no plain `update` on this factory. Verified against `AdtMessageClass.js`
 * (`updateMetadata()` calls `updateMessageClass(connection, name,
 * options?.lockHandle, config.description, config.transportRequest)`) —
 * `description` goes in `config`, not `options`.
 */

import { messageClassDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update. Subject: Message Class (MSAG). Update a message class header (its description). To add or change individual messages use CreateMessageClassMessage / UpdateMessageClassMessage. Takes the lock handle from a prior lock call — this tool does not lock or unlock the message class itself.',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Message class name (e.g., ZMY_MSGS).',
      },
      description: {
        type: 'string',
        description: 'New short description for the message class.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from a prior lock call on this message class. Required — the shipped write endpoint answers a refusal without one.',
      },
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number. Required for transportable objects.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['message_class_name', 'lock_handle'],
  },
} as const;

interface UpdateMessageClassArgs {
  message_class_name: string;
  description?: string;
  lock_handle: string;
  transport_request?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleUpdateMessageClass(
  context: HandlerContext,
  args: UpdateMessageClassArgs,
) {
  const { connection, logger } = context;

  if (!args?.message_class_name) {
    return return_error(new Error('message_class_name is required'));
  }
  if (!args?.lock_handle) {
    return return_error(new Error('lock_handle is required'));
  }

  const name = args.message_class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateMessageClass', detail },
    () =>
      createAdtClient(connection, logger)
        .getMessageClass(resultsFor(messageClassDocuments))
        .updateMetadata(
          {
            name,
            description: args.description,
            transportRequest: args.transport_request,
          },
          { lockHandle: args.lock_handle, analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
