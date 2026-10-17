import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { readMessageClassMetadata } from '../../../lib/strategies/metadataReads';
import type { AdtReading } from '../../../lib/strategies/reading';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Read an ABAP message class (MSAG/T100) in one request: its ADT metadata document (XML: name, description, package, master language, messages). Returns it under `metadata`, with `part: "metadata"`.',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Message class name.',
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
  // else — there is no `.read()` in v19.
  // The pre-migration handler answered `state.messageClass`, a v18 parsed
  // convenience object adt-clients 19 no longer builds; the document itself
  // is what is available now.
  return answer(
    { tool: 'GetMessageClass', detail: 'terse' },
    () =>
      readMessageClassMetadata(createAdtClient(connection, logger), { name }),
    (metadata: AdtReading<string>) => ({
      success: true,
      message_class_name: name,
      part: 'metadata',
      metadata: metadata.raw,
    }),
  );
}
