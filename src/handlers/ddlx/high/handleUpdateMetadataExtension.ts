/**
 * UpdateMetadataExtension Handler - ABAP Metadata Extension Update via ADT API
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  extractAdtErrorMessage,
  return_error,
  return_response,
} from '../../../lib/utils';
export const TOOL_DEFINITION = {
  name: 'UpdateMetadataExtension',
  description: 'Update source code of an ABAP Metadata Extension.',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Metadata Extension name',
      },
      source_code: {
        type: 'string',
        description: 'New source code',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockObject. If not provided, will attempt to lock internally.',
      },
      activate: {
        type: 'boolean',
        description: 'Activate after update. Default: true',
      },
    },
    required: ['name', 'source_code'],
  },
} as const;

interface UpdateMetadataExtensionArgs {
  name: string;
  source_code: string;
  lock_handle?: string;
  activate?: boolean;
}

export async function handleUpdateMetadataExtension(
  context: HandlerContext,
  params: any,
) {
  const { connection, logger } = context;
  const args: UpdateMetadataExtensionArgs = params;
  if (!args.name || !args.source_code) {
    return return_error(new Error('Missing required parameters'));
  }

  const name = args.name.toUpperCase();

  try {
    const client = createAdtClient(connection);
    const shouldActivate = args.activate !== false;
    let lockHandle = args.lock_handle;

    // Lock if not provided
    if (!lockHandle) {
      lockHandle = await client.getMetadataExtension().lock({ name: name });
    }

    // Update
    await client.getMetadataExtension().update(
      {
        name,
        sourceCode: args.source_code,
      },
      { lockHandle },
    );

    // Unlock if we locked it internally
    if (!args.lock_handle) {
      await client.getMetadataExtension().unlock({ name: name }, lockHandle);
    }

    // Activate if requested
    if (shouldActivate) {
      await client.getMetadataExtension().activate({ name: name });
    }

    const result = {
      success: true,
      name: name,
      message: shouldActivate
        ? `Metadata Extension ${name} updated and activated successfully`
        : `Metadata Extension ${name} updated successfully`,
    };

    return return_response({
      data: JSON.stringify(result, null, 2),
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as any,
    });
  } catch (error: any) {
    const detailedError = extractAdtErrorMessage(
      error,
      `Failed to update metadata extension ${name}`,
    );
    logger?.error(`Error updating DDLX ${name}: ${detailedError}`);
    return return_error(new Error(detailedError));
  }
}
