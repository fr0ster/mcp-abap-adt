import { messageClassDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import type { AdtReading } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Read. Subject: Message Class (MSAG). Will be useful for reading a message class and its messages. [read-only] Read an ABAP message class (T100) with all of its messages. Answers: "show message class X", "list messages of message class", "display message text 001 of class". Returns name, description, package, master language and the array of messages (msgno, msgtext, self-explanatory, description).',
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

export async function handleReadMessageClass(
  context: HandlerContext,
  args: { message_class_name: string },
) {
  const { connection, logger } = context;
  const { message_class_name } = args;
  if (!message_class_name) {
    return return_error(new Error('message_class_name is required'));
  }

  const name = message_class_name.toUpperCase();

  // A message class has no source resource of its own — `readMetadata` fetches
  // the same document `read` used to. One call.
  return answer(
    { tool: 'ReadMessageClass', detail: 'terse' },
    () =>
      createAdtClient(connection, logger)
        .getMessageClass(resultsFor(messageClassDocuments))
        .readMetadata({ name }, { analyse: analyseException }),
    (metadata: AdtReading<string>) => ({
      success: true,
      message_class_name: name,
      metadata: metadata.raw,
    }),
  );
}
