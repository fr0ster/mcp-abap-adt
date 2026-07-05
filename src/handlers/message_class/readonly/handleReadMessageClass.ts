import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

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
  try {
    const { message_class_name } = args;
    if (!message_class_name) {
      return return_error(new Error('message_class_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const name = message_class_name.toUpperCase();

    const state = await client.getMessageClass().read({ name });
    if (!state) {
      return return_error(new Error(`Message class ${name} not found.`));
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          message_class_name: name,
          message_class: state.messageClass ?? null,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
