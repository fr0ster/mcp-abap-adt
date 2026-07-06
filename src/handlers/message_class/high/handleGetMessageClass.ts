/**
 * GetMessageClass Handler - Read an ABAP Message Class (MSAG) via AdtClient.
 *
 * Uses AdtClient.getMessageClass().read(). Message classes are not versioned
 * or activatable, so there is no version parameter.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

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
  try {
    const { message_class_name } = args;
    if (!message_class_name) {
      return return_error(new Error('message_class_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const name = message_class_name.toUpperCase();

    logger?.info(`Reading message class ${name}`);

    const state = await client.getMessageClass().read({ name });
    if (!state) {
      return return_error(new Error(`Message class ${name} not found.`));
    }

    logger?.info(`✅ GetMessageClass completed: ${name}`);

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          message_class_name: name,
          message_class: state.messageClass ?? null,
          status: state.readResult?.status,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
