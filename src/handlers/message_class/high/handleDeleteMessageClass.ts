/**
 * DeleteMessageClass Handler - Delete an ABAP Message Class (MSAG) via AdtClient.
 *
 * Uses AdtClient.getMessageClass().delete(), which runs the ADT deletion
 * check + delete service. Deletes the class and all of its messages.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'DeleteMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Delete an ABAP message class (MSAG) and all of its messages from the SAP system. Includes a deletion check before the actual deletion. Transport request required for transportable objects, optional for local ($TMP).',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description: 'Message class name (e.g., ZMY_MSGS).',
      },
      transport_request: {
        type: 'string',
        description:
          'Transport request number (e.g., E19K905635). Required for transportable objects, optional for local ($TMP).',
      },
    },
    required: ['message_class_name'],
  },
} as const;

interface DeleteMessageClassArgs {
  message_class_name: string;
  transport_request?: string;
}

export async function handleDeleteMessageClass(
  context: HandlerContext,
  args: DeleteMessageClassArgs,
) {
  const { connection, logger } = context;
  try {
    const { message_class_name, transport_request } = args;
    if (!message_class_name) {
      return return_error(new Error('message_class_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const name = message_class_name.toUpperCase();

    logger?.info(`Starting message class deletion: ${name}`);

    const state = await client.getMessageClass().delete({
      name,
      transportRequest: transport_request,
    });

    logger?.info(`✅ DeleteMessageClass completed: ${name}`);

    return return_response({
      data: JSON.stringify({
        success: true,
        message_class_name: name,
        transport_request,
        status: state.deleteResult?.status,
        message: `Message class ${name} deleted successfully`,
      }),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
