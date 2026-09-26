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
 * **Read, edit, write.** Since adt-clients 23 `updateMetadata` is one PUT of
 * the document in `options.source` (MIGRATION-23 §7). In 22 it read the
 * class itself and patched `config.description` into it; passed that way now,
 * the description is dropped and the PUT carries no document. So this handler
 * reads the class, sets the first `adtcore:description` — the class's own;
 * every message carries one too — and writes the whole document back.
 */

import { messageClassDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { withLock } from '../../../lib/strategies/withLock';
import { patchXmlAttribute } from '../../../lib/strategies/xmlPatch';
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
          '(optional) Transport request number. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request". Required for transportable objects.',
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
    async () => {
      const obj = createAdtClient(connection, logger).getMessageClass(
        resultsFor(messageClassDocuments),
      );

      const current = await obj.readMetadata(
        { name },
        { analyse: analyseException },
      );
      if (!current.ok) return current as never;
      const edited = patchXmlAttribute(
        String(current.getResult().value.raw),
        'adtcore:description',
        args.description,
      );

      return withLock(
        () => obj.lock({ name }, { analyse: analyseLock }),
        (lockHandle) =>
          obj.updateMetadata(
            { name, transportRequest: args.transport_request },
            { source: edited, lockHandle, analyse: analyseException },
          ),
        (lockHandle) =>
          obj.unlock({ name }, lockHandle, { analyse: analyseException }),
      );
    },
    project(detail, terseWrite),
  );
}
