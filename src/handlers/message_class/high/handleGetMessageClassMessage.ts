/**
 * GetMessageClassMessage Handler - Read a single message from a Message Class (MSAG).
 *
 * Uses AdtClient.getMessageClassMessage().read().
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Retrieve a single message (by number) from an ABAP message class (MSAG/T100). Returns msgno, msgtext, self-explanatory flag and description.',
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
    },
    required: ['message_class_name', 'msgno'],
  },
} as const;

interface GetMessageClassMessageArgs {
  message_class_name: string;
  msgno: string;
}

export async function handleGetMessageClassMessage(
  context: HandlerContext,
  args: GetMessageClassMessageArgs,
) {
  const { connection, logger } = context;
  try {
    const { message_class_name, msgno } = args;
    if (!message_class_name) {
      return return_error(new Error('message_class_name is required'));
    }
    if (!msgno) {
      return return_error(new Error('msgno is required'));
    }

    const client = createAdtClient(connection, logger);
    const className = message_class_name.toUpperCase();

    logger?.info(`Reading message ${msgno} of message class ${className}`);

    const state = await client
      .getMessageClassMessage()
      .read({ className, msgno });
    if (!state) {
      return return_error(new Error(`Message class ${className} not found.`));
    }

    logger?.info(`✅ GetMessageClassMessage completed: ${className}/${msgno}`);

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          message_class_name: className,
          msgno,
          message: state.message ?? null,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
