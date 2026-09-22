/**
 * CreateMessageClass Handler - Create an ABAP Message Class (MSAG) shell
 *
 * Uses AdtClient.getMessageClass().create from @mcp-abap-adt/adt-clients 19.
 * Message classes are not activated — create() registers the object in its
 * final (usable) state. Individual messages are added afterwards with
 * CreateMessageClassMessage.
 */

import { messageClassDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, terseWrite } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';
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
          '(optional) Transport request number (e.g., E19K905635). Required for transportable packages. A REQUEST number, not a task: an object is created on a request and moved onto a task afterwards with AddTransportObject. A task number here answers SUCCESS on a create and is then refused on the next write with CTS_WBO_API 020, "already locked in request".',
      },
      master_language: {
        type: 'string',
        description:
          '(optional) Master/original language (e.g. "EN", "DE"). Defaults to the session language (SAP_LANGUAGE) or EN.',
      },
      ...DETAIL_PROPERTY,
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
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateMessageClass(
  context: HandlerContext,
  args: CreateMessageClassArgs,
) {
  const { connection, logger } = context;

  if (!args?.message_class_name) {
    return return_error(new Error('message_class_name is required'));
  }
  if (!args?.package_name) {
    return return_error(new Error('package_name is required'));
  }

  validateTransportRequest(args.package_name, args.transport_request);

  const name = args.message_class_name.toUpperCase();
  const detail = detailOf(args);

  return answer(
    { tool: 'CreateMessageClass', detail },
    () =>
      createAdtClient(connection, logger)
        .getMessageClass(resultsFor(messageClassDocuments))
        .create(
          {
            name,
            description: args.description || name,
            packageName: args.package_name,
            transportRequest: args.transport_request,
            masterLanguage: args.master_language,
          },
          { analyse: analyseException },
        ),
    project(detail, terseWrite),
  );
}
