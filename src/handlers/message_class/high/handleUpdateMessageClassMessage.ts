import * as z from 'zod';
/**
 * UpdateMessageClassMessage Handler - Update (upsert) a single message in a
 * Message Class (MSAG). `create` and `update` are the same write — ADT
 * upserts.
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
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { updateTool } from '../../../lib/description';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { upsertMessageClassMessage } from '../../../lib/messageClassMessageWrite';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description: updateTool({
    object: 'the text and flags of a message in an ABAP message class',
    how: ', creating the message when the class lacks it',
    transported: true,
  }),
  inputSchema: z.object({
    message_class_name: z.string().describe('Parent message class name.'),
    msgno: z.string().describe('Message number (e.g., "001").'),
    msgtext: z
      .string()
      .describe(
        'New message text. May contain placeholders &1 &2 &3 &4 (or &).',
      ),
    self_explanatory: z
      .boolean()
      .optional()
      .describe('(optional) Mark the message as self-explanatory.'),
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

type UpdateMessageClassMessageArgs = z.output<
  typeof TOOL_DEFINITION.inputSchema
>;

export async function handleUpdateMessageClassMessage(
  context: HandlerContext,
  args: UpdateMessageClassMessageArgs,
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

  return answer(
    { tool: 'UpdateMessageClassMessage', detail: 'terse' },
    () =>
      withAdtHeaders(context, 'messageClassMessage.update', (headers) =>
        upsertMessageClassMessage(
          createAdtClient(connection, logger),
          {
            className,
            msgno: args.msgno,
            msgtext: args.msgtext,
            selfExplanatory: args.self_explanatory,
            description: args.description,
            transportRequest: args.transport_request,
          },
          { headers, analyse: analyseException },
        ),
      ),
    () => ({
      success: true,
      message_class_name: className,
      msgno: args.msgno,
      message: `Message ${args.msgno} updated in message class ${className}`,
    }),
  );
}
