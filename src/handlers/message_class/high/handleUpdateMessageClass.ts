/**
 * UpdateMessageClass Handler - Write a Message Class's own metadata
 *
 * Uses AdtClient.getMessageClass().{lock,updateMetadata,unlock} from
 * @mcp-abap-adt/adt-clients 19, through `withLock`.
 *
 * **This handler acquires its own lock.** `IMessageClassContract` composes
 * `IAdtLockable` — `lock({name})`/`unlock({name}, lockHandle)` are on the
 * same accessor `updateMetadata()` is called through, verified against
 * `AdtMessageClass.js` (`lock()`/`unlock()` call `lockMessageClass`/
 * `unlockMessageClass` directly). Fix round 1: a caller-supplied
 * `lock_handle` param was tried here first and reverted — adt-clients 19
 * moving a lock out of a member does not move it onto the caller, it moves
 * it onto this handler.
 *
 * **The member is `updateMetadata`, not `update`.** `IMessageClassContract`
 * declares `IAdtMetadataUpdatable`, whose method is `updateMetadata`; there
 * is no plain `update` on this factory.
 *
 * **`description` goes in `config`, not `options`.** Verified against
 * `AdtMessageClass.js`'s `updateMetadata()`: `updateMessageClass(connection,
 * name, options?.lockHandle, config.description, config.transportRequest)`.
 */

import { messageClassDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update. Subject: Message Class (MSAG). Update a message class header (e.g. its description). To add or change individual messages use CreateMessageClassMessage / UpdateMessageClassMessage.',
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
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number. Required for transportable objects.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['message_class_name', 'description'],
  },
} as const;

interface UpdateMessageClassArgs {
  message_class_name: string;
  description: string;
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
  if (!args?.description) {
    return return_error(new Error('description is required'));
  }

  const name = args.message_class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'UpdateMessageClass', detail },
    () => {
      const obj = createAdtClient(connection, logger).getMessageClass(
        resultsFor(messageClassDocuments),
      );

      return withLock(
        () => obj.lock({ name }),
        (lockHandle) =>
          obj.updateMetadata(
            {
              name,
              description: args.description,
              transportRequest: args.transport_request,
            },
            { lockHandle, analyse: analyseException },
          ),
        (lockHandle) => obj.unlock({ name }, lockHandle),
      );
    },
    project(detail, terseWrite),
  );
}
