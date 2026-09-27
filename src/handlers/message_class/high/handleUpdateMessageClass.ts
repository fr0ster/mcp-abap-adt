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
import { sequence } from '../../../lib/strategies/sequence';
import { withLock } from '../../../lib/strategies/withLock';
import {
  extractXmlString,
  patchXmlAttribute,
} from '../../../lib/strategies/xmlPatch';
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

      // **Read, patch, write — because the member stopped doing the first two.**
      // Until adt-clients 23 `updateMetadata` read the class itself and patched
      // `config.description` into the document: a second request this library
      // made in the caller's place. It is one PUT of the document it is given
      // now, so the read and the edit are here, the way every other metadata
      // write in this repository already does them.
      //
      // The first `adtcore:description` in that document is the class's own;
      // each message inside carries one too, which is why this patches the
      // first occurrence only.
      return sequence(
        () => obj.readMetadata({ name }, { analyse: analyseException }),
        (current) =>
          withLock(
            () => obj.lock({ name }, { analyse: analyseException }),
            (lockHandle) =>
              obj.updateMetadata(
                {
                  name,
                  ...(args.transport_request && {
                    transportRequest: args.transport_request,
                  }),
                },
                {
                  source: patchXmlAttribute(
                    // `.raw`, not the value: `obj` carries
                    // `resultsFor(messageClassDocuments)`, so the read answers an
                    // `AdtReading` whose `value` is the parse and whose `raw` is
                    // the document — and a document is what is patched and sent
                    // back.
                    extractXmlString(current.raw, `message class ${name}`),
                    'adtcore:description',
                    args.description,
                  ),
                  lockHandle,
                  analyse: analyseException,
                },
              ),
            (lockHandle) =>
              obj.unlock({ name }, lockHandle, { analyse: analyseException }),
          ),
      );
    },
    project(detail, terseWrite),
  );
}
