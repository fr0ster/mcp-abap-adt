import { messageClassDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve an ABAP message class (MSAG/T100) with its messages: name, description, package, master language and the message list (msgno, msgtext, self-explanatory).',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Message class name (e.g., ZMY_MSGS).',
      },
    },
    required: ['message_class_name'],
  },
} as const;

interface GetMessageClassArgs {
  message_class_name: string;
}

export async function handleGetMessageClass(
  context: HandlerContext,
  args: GetMessageClassArgs,
) {
  const { connection, logger } = context;
  const { message_class_name } = args;
  if (!message_class_name) {
    return return_error(new Error('message_class_name is required'));
  }

  const name = message_class_name.toUpperCase();

  // `IMessageClassContract` composes `IAdtMetadataReadable` and nothing
  // else — there is no `.read()` in v19, same as `ReadMessageClass` found.
  // The pre-migration handler answered `state.messageClass`, a v18 parsed
  // convenience object adt-clients 19 no longer builds; the document itself
  // is what is available now, same as `ReadMessageClass`'s own `metadata`.
  return answer(
    { tool: 'GetMessageClass', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getMessageClass(resultsFor(messageClassDocuments))
        .readMetadata({ name }, { analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      message_class_name: name,
      message_class: metadata.raw,
    }),
  );
}
