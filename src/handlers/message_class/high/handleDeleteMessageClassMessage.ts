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
 * **One cast, for the same reason `cdsUnitTestWrites.ts` used to need one.**
 * `IMessageClassMessageContract` (what `getMessageClassMessage()` is declared
 * to return) is `IAdtCreatable & IAdtReadable & IAdtUpdatable` only — no
 * `delete` — but `AdtMessageClassMessage` implements it for real (confirmed
 * against the shipped `.js`: `delete(config, options) { return
 * this.writeClass(config, true, options); }`, genuinely different from
 * `update`'s call to the same private method with the deletion flag off).
 * `MessageClassMessageWrites` names exactly that one extra method, the same
 * way `CdsUnitTestWrites` did for `AdtCdsUnitTest` before this task removed
 * it (`getCdsUnitTest()`'s declared type turned out to omit `delete`
 * entirely, so calling `getClass()` directly replaced the cast instead of
 * needing one — see `handleDeleteCdsUnitTest.ts`). No such alternate route
 * exists here: deleting a message is `writeClass` with the flag on, and nothing
 * else reaches it.
 */

import { analyseException } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtOperationOptions,
  IAdtResponse,
  IMessageClassMessageConfig,
} from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error } from '../../../lib/utils';

/** The one method `IMessageClassMessageContract` omits. See the file doc
 * comment above. */
interface MessageClassMessageWrites {
  delete<E extends IAdtError = IAdtError>(
    config: Partial<IMessageClassMessageConfig>,
    options?: IAdtOperationOptions<E>,
  ): Promise<IAdtResponse<string, E>>;
}

export const TOOL_DEFINITION = {
  name: 'DeleteMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Delete. Subject: a single message inside a Message Class (MSAG). Remove one message (by number) from an ABAP message class (T100), keeping the class and its other messages. Transport request required for transportable objects.',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Parent message class name (e.g., ZMY_MSGS).',
      },
      msgno: {
        type: 'string',
        description: 'Message number to delete (e.g., "001").',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number. Required for transportable objects, optional for local ($TMP).',
      },
    },
    required: ['message_class_name', 'msgno'],
  },
} as const;

interface DeleteMessageClassMessageArgs {
  message_class_name: string;
  msgno: string;
  transport_request?: string;
}

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
      (
        createAdtClient(
          connection,
          logger,
        ).getMessageClassMessage() as unknown as MessageClassMessageWrites
      ).delete(
        {
          className,
          msgno: args.msgno,
          transportRequest: args.transport_request,
        },
        { analyse: analyseException },
      ),
    () => ({
      success: true,
      message_class_name: className,
      msgno: args.msgno,
      message: `Message ${args.msgno} deleted from message class ${className}`,
    }),
  );
}
