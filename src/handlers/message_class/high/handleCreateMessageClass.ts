/**
 * CreateMessageClass Handler - Create an ABAP Message Class (MSAG) via AdtClient.
 *
 * Uses AdtClient.getMessageClass().create(). Message classes are not activated —
 * create() registers the object in its final (usable) state.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { validateTransportRequest } from '../../../utils/transportValidation';

export const TOOL_DEFINITION = {
  name: 'CreateMessageClass',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Operation: Create. Subject: Message Class (MSAG). Create a new ABAP message class (T100) shell. Individual messages are added afterwards with CreateMessageClassMessage. Message classes are not activated.',
  inputSchema: {
    type: 'object',
    properties: {
      message_class_name: {
        type: 'string',
        description:
          'Message class name (e.g., ZMY_MSGS). Must follow SAP naming conventions.',
      },
      description: {
        type: 'string',
        description:
          '(optional) Short description. If not provided, message_class_name is used.',
      },
      package_name: {
        type: 'string',
        description: 'Package name (e.g., ZMY_PKG, $TMP for local objects).',
      },
      transport_request: {
        type: 'string',
        description:
          '(optional) Transport request number (e.g., E19K905635). Required for transportable packages.',
      },
      master_language: {
        type: 'string',
        description:
          '(optional) Master/original language (e.g. "EN", "DE"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
    },
    required: ['message_class_name', 'package_name'],
  },
} as const;

interface CreateMessageClassArgs {
  message_class_name: string;
  description?: string;
  package_name: string;
  transport_request?: string;
  master_language?: string;
}

export async function handleCreateMessageClass(
  context: HandlerContext,
  args: CreateMessageClassArgs,
) {
  const { connection, logger } = context;
  try {
    if (!args?.message_class_name) {
      return return_error('message_class_name is required');
    }
    if (!args?.package_name) {
      return return_error('package_name is required');
    }

    // Transport required for transportable (non-$TMP/non-local) packages
    validateTransportRequest(args.package_name, args.transport_request);

    const name = args.message_class_name.toUpperCase();
    const description = args.description || name;

    logger?.info(`Starting message class creation: ${name}`);

    const client = createAdtClient(connection, logger);

    try {
      await client.getMessageClass().create({
        name,
        description,
        packageName: args.package_name,
        transportRequest: args.transport_request,
        masterLanguage: args.master_language,
      });

      logger?.info(`✅ CreateMessageClass completed: ${name}`);

      return return_response({
        data: JSON.stringify({
          success: true,
          message_class_name: name,
          package: args.package_name,
          transport_request: args.transport_request,
          message: `Message class ${name} created successfully`,
        }),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error creating message class ${name}: ${error?.message || error}`,
      );

      if (
        error.message?.includes('already exists') ||
        error.response?.data?.includes?.('ExceptionResourceAlreadyExists')
      ) {
        return return_error(
          `Message class ${name} already exists. Delete it first or use a different name.`,
        );
      }

      const errorMessage = error.response?.data
        ? typeof error.response.data === 'string'
          ? error.response.data
          : String(error.response.data).substring(0, 500)
        : error.message || String(error);

      return return_error(
        `Failed to create message class ${name}: ${errorMessage}`,
      );
    }
  } catch (error) {
    return return_error(error);
  }
}
