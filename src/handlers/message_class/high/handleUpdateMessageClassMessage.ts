/**
 * UpdateMessageClassMessage Handler - Update (upsert) a single message in a
 * Message Class (MSAG) via AdtClient.
 *
 * Uses AdtClient.getMessageClassMessage().update(). Lock/unlock is handled
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
  name: 'UpdateMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Update. Subject: a single message inside a Message Class (MSAG). Change the text / flags of an existing message in an ABAP message class (T100). Upserts the message if it does not exist yet.',
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
      msgtext: {
        type: 'string',
        description:
          'New message text. May contain placeholders &1 &2 &3 &4 (or &).',
      },
      self_explanatory: {
        type: 'boolean',
        description: '(optional) Mark the message as self-explanatory.',
      },
      description: {
        type: 'string',
        description: '(optional) Long description for the message.',
      },
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number. Required for transportable objects.',
      },
    },
    required: ['message_class_name', 'msgno', 'msgtext'],
  },
} as const;

interface UpdateMessageClassMessageArgs {
  message_class_name: string;
  msgno: string;
  msgtext: string;
  self_explanatory?: boolean;
  description?: string;
  transport_request?: string;
}

export async function handleUpdateMessageClassMessage(
  context: HandlerContext,
  args: UpdateMessageClassMessageArgs,
) {
  const { connection, logger } = context;
  try {
    const {
      message_class_name,
      msgno,
      msgtext,
      self_explanatory,
      description,
      transport_request,
    } = args;
    if (!message_class_name) {
      return return_error(new Error('message_class_name is required'));
    }
    if (!msgno) {
      return return_error(new Error('msgno is required'));
    }
    if (msgtext === undefined || msgtext === null) {
      return return_error(new Error('msgtext is required'));
    }

    const client = createAdtClient(connection, logger);
    const className = message_class_name.toUpperCase();

    logger?.info(`Updating message ${msgno} in class ${className}`);

    const state = await client.getMessageClassMessage().update({
      className,
      msgno,
      msgtext,
      selfExplanatory: self_explanatory,
      description,
      transportRequest: transport_request,
    });

    logger?.info(
      `✅ UpdateMessageClassMessage completed: ${className}/${msgno}`,
    );

    return return_response({
      data: JSON.stringify({
        success: true,
        message_class_name: className,
        msgno,
        transport_request,
        status: state.updateResult?.status,
        message: `Message ${msgno} updated in message class ${className}`,
      }),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}
