import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
/**
 * CreateMessageClassMessage Handler - Add (upsert) a single message to a
 * Message Class (MSAG). The parent message class must already exist (create
 * it with CreateMessageClass).
 *
 * **The lock window is the server's** (adt-clients 48). A message has one
 * request per member — `lockMessage`, `lockClassForMessage`, `update` (the
 * PUT of the class document) and `unlockMessages` — and the chain the
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
import type { IMessageClassMessageUpsert } from '@mcp-abap-adt/interfaces-adt';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { createTool } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { inMessageClassMessageWindow } from '../../../lib/messageClassMessageWrite';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description: createTool({
    object: 'a message',
    how: 'in an existing ABAP message class, with its number, text and self-explanatory flag',
    transported: true,
  }),
  inputSchema: createArguments('CreateMessageClassMessage', {
    message_class_name: z.string().describe('Parent message class name.'),
    msgno: z.string().describe('Message number (e.g., "001").'),
    msgtext: z
      .string()
      .describe('Message text. May contain placeholders &1 &2 &3 &4 (or &).'),
    self_explanatory: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        '(optional) Mark the message as self-explanatory (no long text needed). Default: false.',
      ),
    description: z
      .string()
      .optional()
      .describe('(optional) Long description for the message.'),
    transport_request: z
      .string()
      .optional()
      .describe(
        '(optional) Transport request number, not a task. Required for transportable objects.',
      ),
  }),
} as const;

type CreateMessageClassMessageArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleCreateMessageClassMessage(
  context: HandlerContext,
  args: CreateMessageClassMessageArgs,
) {
  const { connection, logger } = context;

  if (!args?.message_class_name) {
    return return_error(new Error('message_class_name is required'));
  }
  if (!args?.msgno) {
    return return_error(new Error('msgno is required'));
  }
  if (args?.msgtext === undefined || args?.msgtext === null) {
    return return_error(new Error('msgtext is required'));
  }

  const className = args.message_class_name.toUpperCase();

  const message: IMessageClassMessageUpsert = {
    className,
    msgno: args.msgno,
    msgtext: args.msgtext,
    selfExplanatory: args.self_explanatory ?? false,
    description: args.description,
    transportRequest: args.transport_request,
  };

  return answer(
    { tool: 'CreateMessageClassMessage', detail: 'terse' },
    () =>
      // `update`, not this tool's verb: a pair is keyed by the member that
      // sends it (one member, one endpoint), and the PUT is adt-clients 48's
      // `update`, the one member for that endpoint.
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
    () => ({
      success: true,
      message_class_name: className,
      msgno: args.msgno,
      message: `Message ${args.msgno} created in message class ${className}`,
    }),
  );
}
