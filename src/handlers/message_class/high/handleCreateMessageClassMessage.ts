/**
 * CreateMessageClassMessage Handler - Add (upsert) a single message to a
 * Message Class (MSAG)
 *
 * Uses AdtClient.getMessageClassMessage().create from
 * @mcp-abap-adt/adt-clients 19. The parent message class must already exist
 * (create it with CreateMessageClass).
 *
 * **No lock handle needed.** Unlike the class-level members, `AdtMessageClass
 * Message`'s write is not `IAdtLockable` at all — `create()`/`update()` (the
 * same upsert; ADT upserts) manage their own message-level and
 * class-for-message locks internally, end to end, via direct module calls
 * (`lockMessageIfGranted`/`lockClassForMessageOrPlain`/`unlockMessageClass`),
 * never through this object's own `lock()`/`unlock()` — because it has none.
 * Verified against `AdtMessageClassMessage.js`.
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
  name: 'CreateMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: a single message inside a Message Class (MSAG). Add a message (number + text) to an existing ABAP message class (T100). The parent class must exist first (CreateMessageClass).',
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
          'Message text. May contain placeholders &1 &2 &3 &4 (or &).',
      },
      self_explanatory: {
        type: 'boolean',
        description:
          '(optional) Mark the message as self-explanatory (no long text needed). Default: false.',
        default: false,
      },
      description: {
        type: 'string',
        description: '(optional) Long description for the message.',
      },
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request". Required for transportable objects.',
      },
    },
    required: ['message_class_name', 'msgno', 'msgtext'],
  },
} as const;

interface CreateMessageClassMessageArgs {
  message_class_name: string;
  msgno: string;
  msgtext: string;
  self_explanatory?: boolean;
  description?: string;
  transport_request?: string;
}

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

  return answer(
    { tool: 'CreateMessageClassMessage', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getMessageClassMessage()
        .create(
          {
            className,
            msgno: args.msgno,
            msgtext: args.msgtext,
            selfExplanatory: args.self_explanatory ?? false,
            description: args.description,
            transportRequest: args.transport_request,
          },
          { analyse: analyseException },
        ),
    () => ({
      success: true,
      message_class_name: className,
      msgno: args.msgno,
      message: `Message ${args.msgno} created in message class ${className}`,
    }),
  );
}
