/**
 * GetInactiveObjects Handler - Retrieve list of inactive ABAP objects
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { return_error, return_response } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetInactiveObjects',
  description:
    '[read-only] Get a list of inactive ABAP objects (objects that have been modified but not activated).',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
} as const;

export async function handleGetInactiveObjects(
  context: HandlerContext,
  _params: any,
) {
  const { connection, logger } = context;
  try {
    const client = createAdtClient(connection);
    const utils = client.getUtils();

    logger?.info('Retrieving inactive objects...');
    const result = await utils.getInactiveObjects();

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          count: result.objects.length,
          objects: result.objects,
        },
        null,
        2,
      ),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });
  } catch (error: any) {
    logger?.error('Error retrieving inactive objects:', error);
    return return_error(error);
  }
}
