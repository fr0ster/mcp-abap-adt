import { messageDocuments } from '@mcp-abap-adt/adt-clients';
import * as z from 'zod';
/**
 * DeleteMessageClassMessage Handler - Delete a single message from a Message
 * Class (MSAG) via AdtClient.
 *
 * Uses AdtClient.getMessageClassMessage().delete from
 * @mcp-abap-adt/adt-clients 19.
 *
 * **This is not a deletion-service delete, and does not take
 * `analyseDeletion`/`terseDeletion`.** Per `AdtMessageClassMessage.d.ts` and
 * `.js`: ADT has no resource to DELETE for a single message — a message is
 * removed by PUTting the *parent class's* whole document with the target
 * message moved into `<mc:deletedmessages>` (own lock handle) and every
 * other message left in `<mc:messages>`. `delete()` answers
 * `ReturnType<R['deleted']>`, the same slot family `written` (create/update)
 * answers — a PUT result, not a `del:deletionResult`/`del:checkResponse`
 * document — so `terseDeletion` would read `del:object` off a document that
 * never carries it and mask every success as `projection_failed`. This
 * mirrors `UpdateMessageClassMessage`, which found the identical shape one
 * write over: `analyseException` and a projection built from the call's own
 * arguments, not the read-only `terseWrite`/`terseDeletion` pair.
 *
 * **No lock handle, and no `resultsFor(messageDocuments)` — same reasons as
 * `UpdateMessageClassMessage`.** `AdtMessageClassMessage` is not
 * `IAdtLockable`: the two locks (message-level, class-level) this PUT takes
 * are internal, never `lock()`/`unlock()` on this accessor, so there is
 * nothing for this handler to acquire or release. And
 * `IMessageClassMessageResults<TRead, TWritten, TDeleted>` fixes its three
 * type parameters to literal `string` at the factory's own generic bound, so
 * `resultsFor(...)`'s `AdtReading`-producing functions do not type-check
 * against it — the default `messageDocuments` answers the raw PUT body as a
 * plain string, with no `status` alongside it.
 *
 * **No cast.** adt-clients declares `delete` on `AdtMessageClassMessage`
 * (`delete(config, options) { return this.writeClass(config, true, options);
 * }`, different from `update`'s call with the deletion flag off); the
 * server's own contract for `getMessageClassMessage()`'s answer
 * (`MessageClassMessageApi`) states it beside create, read and update.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Remove one message (by number) from an ABAP message class (T100), keeping the class and its other messages. Transport request required for transportable objects.',
  inputSchema: z.object({
    message_class_name: z.string().describe('Parent message class name.'),
    msgno: z.string().describe('Message number to delete (e.g., "001").'),
    transport_request: z
      .string()
      .optional()
      .describe(
        'Transport request number, not a task. Required for transportable objects, optional for local ones.',
      ),
  }),
} as const;

type DeleteMessageClassMessageArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleDeleteMessageClassMessage(
  context: HandlerContext,
  args: DeleteMessageClassMessageArgs,
) {
  const { connection, logger } = context;

  if (!args?.message_class_name) {
    return return_error(new Error('message_class_name is required'));
  }
  if (!args?.msgno) {
    return return_error(new Error('msgno is required'));
  }

  const className = args.message_class_name.toUpperCase();

  return answer(
    { tool: 'DeleteMessageClassMessage', detail: 'terse' },
    () =>
      withAdtHeaders(context, 'messageClassMessage.delete', (headers) =>
        createAdtClient(connection, logger)
          .getMessageClassMessage(messageDocuments)
          .delete(
            {
              className,
              msgno: args.msgno,
              transportRequest: args.transport_request,
            },
            { headers, analyse: analyseException },
          ),
      ),
    // A constant success, reading nothing from the answer — safe here, and
    // only here, because `answer()` never reaches this projection unless the
    // call already came back clean: a non-2xx status throws at the
    // connection layer before this runs, and `analyseException` (`enrich` /
    // `readExceptionRefusal`) still inspects a 2xx body for an
    // `exc:exception` refusal on the way past, the same HTTP-200-with-a-
    // refusal-inside shape this whole design exists to catch. Nothing about
    // this PUT's own success shape (a message-class document, not a verdict)
    // can be read for more than that, so there is nothing this projection
    // could add by looking — but a hard-coded success on a delete path is
    // the one shape this repository has been burned by twice already, so it
    // does not get to skip saying why it is not lying.
    () => ({
      success: true,
      message_class_name: className,
      msgno: args.msgno,
      message: `Message ${args.msgno} deleted from message class ${className}`,
    }),
  );
}
