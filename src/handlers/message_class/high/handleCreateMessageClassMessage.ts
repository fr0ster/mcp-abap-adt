/**
 * CreateMessageClassMessage Handler - Add (upsert) a single message to a
 * Message Class (MSAG) via AdtClient.
 *
 * Uses AdtClient.getMessageClassMessage().create(). The parent message class
 * must already exist (create it with CreateMessageClass). Lock/unlock of the
 * class and the message is handled internally by the client.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  ErrorCode,
  McpError,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'CreateMessageClassMessage',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: a single message inside a Message Class (MSAG). Add a message (number + text) to an existing ABAP message class (T100). The parent class must exist first (CreateMessageClass).',
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
          'Message text. May contain placeholders &1 &2 &3 &4 (or &).',
      },
      self_explanatory: {
        type: 'boolean',
        description:
          '(optional) Mark the message as self-explanatory (no long text needed). Default: false.',
        default: false,
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

interface CreateMessageClassMessageArgs {
  message_class_name: string;
  msgno: string;
  msgtext: string;
  self_explanatory?: boolean;
  description?: string;
  transport_request?: string;
}

export async function handleCreateMessageClassMessage(
  context: HandlerContext,
  args: CreateMessageClassMessageArgs,
) {
  const { connection, logger } = context;
  try {
    if (!args?.message_class_name) {
      throw new McpError(
        ErrorCode.InvalidParams,
        'message_class_name is required',
      );
    }
    if (!args?.msgno) {
      throw new McpError(ErrorCode.InvalidParams, 'msgno is required');
    }
    if (args?.msgtext === undefined || args?.msgtext === null) {
      throw new McpError(ErrorCode.InvalidParams, 'msgtext is required');
    }

    const client = createAdtClient(connection, logger);
    const className = args.message_class_name.toUpperCase();

    logger?.info(`Creating message ${args.msgno} in class ${className}`);

    const state = await client.getMessageClassMessage().create({
      className,
      msgno: args.msgno,
      msgtext: args.msgtext,
      selfExplanatory: args.self_explanatory ?? false,
      description: args.description,
      transportRequest: args.transport_request,
    });

    logger?.info(
      `✅ CreateMessageClassMessage completed: ${className}/${args.msgno}`,
    );

    return return_response({
      data: JSON.stringify({
        success: true,
        message_class_name: className,
        msgno: args.msgno,
        transport_request: args.transport_request,
        status: state.createResult?.status ?? state.updateResult?.status,
        message: `Message ${args.msgno} created in message class ${className}`,
      }),
    } as AxiosResponse);
  } catch (error) {
    if (error instanceof McpError) {
      throw error;
    }
    return return_error(error);
  }
}
