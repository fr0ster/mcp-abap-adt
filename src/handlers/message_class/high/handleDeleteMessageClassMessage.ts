/**
 * DeleteMessageClassMessage Handler - Delete a single message from a Message
 * Class (MSAG) via AdtClient.
 *
 * Uses AdtClient.getMessageClassMessage().delete(). The parent class is kept;
 * only the one message (by number) is removed. Lock/unlock is handled
 * internally by the client.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

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
  try {
    const { message_class_name, msgno, transport_request } = args;
    if (!message_class_name) {
      return return_error(new Error('message_class_name is required'));
    }
    if (!msgno) {
      return return_error(new Error('msgno is required'));
    }

    const client = createAdtClient(connection, logger);
    const className = message_class_name.toUpperCase();

    logger?.info(`Deleting message ${msgno} from class ${className}`);

    const state = await client.getMessageClassMessage().delete({
      className,
      msgno,
      transportRequest: transport_request,
    });

    logger?.info(
      `✅ DeleteMessageClassMessage completed: ${className}/${msgno}`,
    );

    return return_response({
      data: JSON.stringify({
        success: true,
        message_class_name: className,
        msgno,
        transport_request,
        status: state.deleteResult?.status,
        message: `Message ${msgno} deleted from message class ${className}`,
      }),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
