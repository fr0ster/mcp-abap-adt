import * as z from 'zod';
/**
 * DeleteMessageClassMessage Handler - Delete a single message from a Message
 * Class (MSAG).
 *
 * **This is not a deletion-service delete, and does not take
 * `analyseDeletion`/`terseDeletion`.** ADT has no resource to DELETE for a
 * single message: it is removed by PUTting the parent class's whole document
 * with the target message moved into `<mc:deletedmessages>` (own lock
 * handle) and every other message left in `<mc:messages>` — adt-clients 48's
 * `update` with `removeMessage: true`, read by the `deleted` slot. The answer
 * is a PUT result, not a deletion document, so the projection is built from
 * the call's own arguments.
 *
 * **The lock window is the server's** (adt-clients 48). A message has one
 * request per member — `lockMessage`, `lockClassForMessage`, `update` (the
 * PUT of the class document; a removal with `removeMessage: true`) and `unlockMessages` — and the chain the
 * library ran before is composed in `lib/messageClassMessageWrite.ts`, as
 * the library's MIGRATION-48 gives it: the same requests in the same order,
 * the locks stateful and the PUT stateless, the first error kept and every
 * lock given up. `analyseException` judges the PUT, the one answer the old
 * chain judged.
 *
 * **No `resultsFor(messageDocuments)`, and no `detail`.** The default
 * `messageDocuments` answers the raw PUT response body as a plain string,
 * with no `status` alongside it to build a projection from — matching why
 * this tool carries no `detail` parameter.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type { IMessageClassMessageRemoval } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { deleteTool, purpose } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { inMessageClassMessageWindow } from '../../../lib/messageClassMessageWrite';
import { return_error } from '../../../lib/utils';

/** What the delete answers: SAP took it, for the class and the number asked. */
function messageDeleted(className: string, msgno: string) {
  return {
    success: true,
    message_class_name: className,
    msgno,
    message: `Message ${msgno} deleted from message class ${className}`,
  } as const;
}

export const TOOL_DEFINITION = {
  name: 'DeleteMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description: deleteTool({
    purpose: purpose(
      'Deletes one message, by its number, from an ABAP message class, keeping the class and its other messages.',
    ),
  }),
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

  const message: IMessageClassMessageRemoval = {
    className,
    msgno: args.msgno,
    transportRequest: args.transport_request,
    removeMessage: true,
  };

  return answer(
    { tool: 'DeleteMessageClassMessage', detail: 'terse' },
    () =>
      withAdtHeaders(context, 'messageClassMessage.update', (headers) =>
        inMessageClassMessageWindow(
          createAdtClient(connection, logger),
          message,
          (members, window) =>
            members.update(message, {
              ...window,
              headers,
              analyse: analyseException,
            }),
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
    () => messageDeleted(className, args.msgno),
  );
}
