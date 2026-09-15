/**
 * UpdateMessageClassMessage Handler - Update (upsert) a single message in a
 * Message Class (MSAG)
 *
 * Uses AdtClient.getMessageClassMessage().update from
 * @mcp-abap-adt/adt-clients 19. `create` and `update` are the same write —
 * ADT upserts.
 *
 * **No lock handle — this one genuinely has none to take.**
 * `AdtMessageClassMessage` is not `IAdtLockable` at all: `update()` manages
 * its own message-level and class-level locks internally, through direct
 * module calls (`lockMessageIfGranted`/`lockClassForMessageOrPlain`/
 * `unlockMessageClass`), never through a `lock()`/`unlock()` on this
 * accessor — which does not exist on `IMessageClassMessageContract`. Fix
 * round 1: an optional `lock_handle` param was tried here (forwarded into
 * `options.lockHandle`, which the shipped member never reads) and reverted
 * — unlike its eight siblings, there is no lock this handler could acquire
 * even if it wanted to, so nothing was moved and no parameter was added.
 *
 * **No `resultsFor(messageDocuments)`, and no `detail`.**
 * `IMessageClassMessageResults<TRead, TWritten, TDeleted>` fixes its three
 * type parameters to literal `string` at the factory's own generic bound
 * (`R extends IMessageClassMessageResults`, which — no explicit type
 * arguments at that bound — means `IMessageClassMessageResults<string,
 * string, string>`), so passing `resultsFor(...)`'s `AdtReading`-producing
 * functions does not type-check against it; `GetMessageClassMessage` found
 * the same disagreement on the read side. The default `messageDocuments`
 * answers the raw PUT response body as a plain string, with no `status`
 * alongside it to build `AdtReading`/`project(detail, terseWrite)` from —
 * matching why this tool carries no `detail` parameter.
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
        { analyse: analyseException },
      ),
    () => ({
      success: true,
      message_class_name: className,
      msgno: args.msgno,
      message: `Message ${args.msgno} updated in message class ${className}`,
    }),
  );
}
