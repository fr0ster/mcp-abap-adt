/**
 * UpdateMessageClass Handler - Update an ABAP Message Class (MSAG) via AdtClient.
 *
 * Uses AdtClient.getMessageClass().update() — currently updates the class
 * description. Individual messages are managed with the *MessageClassMessage tools.
 * Lock/unlock is handled internally by the client.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update. Subject: Message Class (MSAG). Update a message class header (e.g. its description). To add or change individual messages use CreateMessageClassMessage / UpdateMessageClassMessage.',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Message class name (e.g., ZMY_MSGS).',
      },
      description: {
        type: 'string',
        description: 'New short description for the message class.',
      },
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number. Required for transportable objects.',
      },
    },
    required: ['message_class_name', 'description'],
  },
} as const;

interface UpdateMessageClassArgs {
  message_class_name: string;
  description: string;
  transport_request?: string;
}

export async function handleUpdateMessageClass(
  context: HandlerContext,
  args: UpdateMessageClassArgs,
) {
  const { connection, logger } = context;
  try {
    const { message_class_name, description, transport_request } = args;
    if (!message_class_name) {
      return return_error(new Error('message_class_name is required'));
    }
    if (!description) {
      return return_error(new Error('description is required'));
    }

    const client = createAdtClient(connection, logger);
    const name = message_class_name.toUpperCase();

    logger?.info(`Updating message class ${name}`);

    const state = await client.getMessageClass().update({
      name,
      description,
      transportRequest: transport_request,
    });

    logger?.info(`✅ UpdateMessageClass completed: ${name}`);

    return return_response({
      data: JSON.stringify({
        success: true,
        message_class_name: name,
        description,
        transport_request,
        status: state.updateResult?.status,
        message: `Message class ${name} updated successfully`,
      }),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
