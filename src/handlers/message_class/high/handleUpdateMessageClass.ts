import * as z from 'zod';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
 * reads the class, has adt-clients' `patchMessageClassDocument` set the
 * class's own `adtcore:description` (on `mc:messageClass`; every message
 * carries one too, and none is touched), and writes the whole document back.
 * A refused patch is the answer, before any lock is taken.
 */

import {
  messageClassDocuments,
  patchMessageClassDocument,
} from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { patchedDocument } from '../../../lib/strategies/documentPatch';
import { analyseLock } from '../../../lib/strategies/lockAnswer';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep } from '../../../lib/strategies/step';
import { withLock } from '../../../lib/strategies/withLock';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Updates the header of the ABAP message class named by message_class_name: its description.',
  inputSchema: z.object({
    message_class_name: z.string().describe('Message class name.'),
    description: z
      .string()
      .describe('New short description for the message class.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        '(optional) Transport request number, not a task. Required for transportable objects.',
      ),
    ...DETAIL_SHAPE,
  }),
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

      const current = await atStep('read metadata', () =>
        obj.readMetadata(
          { name },
          { version: 'workingArea', analyse: analyseException },
        ),
      )();
      if (!current.ok) return current;
      const edited = patchedDocument(
        patchMessageClassDocument(current.getResult().value.raw, {
          description: args.description,
        }),
        `message class ${name}`,
      );
      if (!edited.ok) return edited;
      const document = edited.getResult().value;

      return withLock(
        () => obj.lock({ name }, { analyse: analyseLock }),
        atStep('update metadata', (lockHandle) =>
          withAdtHeaders(context, 'messageClass.updateMetadata', (headers) =>
            obj.updateMetadata(
              { name, transportRequest: args.transport_request },
              {
                headers,
                source: document,
                lockHandle,
                analyse: analyseException,
              },
            ),
          ),
        ),
        (lockHandle) =>
          obj.unlock({ name }, lockHandle, { analyse: analyseException }),
        { type: 'MESSAGE_CLASS', name: name },
      );
    },
    project(detail, terseWrite),
  );
}
