/**
 * UpdateMessageClassMessage Handler - Update (upsert) a single message in a
 * Message Class (MSAG)
 *
 * Uses AdtClient.getMessageClassMessage().update from
 * @mcp-abap-adt/adt-clients 19. `create` and `update` are the same write —
 * ADT upserts.
 *
 * **`lock_handle` is accepted but not required.** `AdtMessageClassMessage` is
 * not `IAdtLockable`: `update()` manages its own message-level and
 * class-for-message locks internally (see `CreateMessageClassMessage`'s doc
 * comment) and never reads `options.lockHandle`. It is still forwarded when
 * given, for the same `{lockHandle, analyse}` shape as this task's other nine
 * updates — harmless, since the real member simply does not look at it.
 * Verified against `AdtMessageClassMessage.js`.
 *
 * **No `resultsFor(messageDocuments)`, and no `detail`.** Same disagreement
 * `CreateMessageClassMessage` documents: `IMessageClassMessageResults`'s
 * generic bound fixes `read`/`written`/`deleted` to literal `string`, so
 * `resultsFor(...)`'s `AdtReading`-producing functions do not type-check
 * against it. The default `messageDocuments` answers the raw PUT response
 * body as a plain string, with no `status` to build
 * `project(detail, terseWrite)` from.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update. Subject: a single message inside a Message Class (MSAG). Change the text / flags of an existing message in an ABAP message class (T100). Upserts the message if it does not exist yet.',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Parent message class name (e.g., ZMY_MSGS).',
      },
      msgno: {
        type: 'string',
        description: 'Message number (e.g., "001").',
      },
      msgtext: {
        type: 'string',
        description:
          'New message text. May contain placeholders &1 &2 &3 &4 (or &).',
      },
      self_explanatory: {
        type: 'boolean',
        description: '(optional) Mark the message as self-explanatory.',
      },
      description: {
        type: 'string',
        description: '(optional) Long description for the message.',
      },
      lock_handle: {
        type: 'string',
        description:
          "(optional) Not read by the shipped write — a message write locks and unlocks itself internally. Accepted for interface consistency with this task's other update tools; passing it is harmless.",
      },
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number. Required for transportable objects.',
      },
    },
    required: ['message_class_name', 'msgno', 'msgtext'],
  },
} as const;

interface UpdateMessageClassMessageArgs {
  message_class_name: string;
  msgno: string;
  msgtext: string;
  self_explanatory?: boolean;
  description?: string;
  lock_handle?: string;
  transport_request?: string;
}

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
      createAdtClient(connection, logger).getMessageClassMessage().update(
        {
          className,
          msgno: args.msgno,
          msgtext: args.msgtext,
          selfExplanatory: args.self_explanatory,
          description: args.description,
          transportRequest: args.transport_request,
        },
        { lockHandle: args.lock_handle, analyse: analyseException },
      ),
    () => ({
      success: true,
      message_class_name: className,
      msgno: args.msgno,
      message: `Message ${args.msgno} updated in message class ${className}`,
    }),
  );
}
