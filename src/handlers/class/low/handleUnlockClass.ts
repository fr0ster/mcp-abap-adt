/**
 * UnlockClass Handler - Unlock ABAP Class
 *
 * Uses CrudClient.unlockClass from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { CrudClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UnlockClassLow',
  description:
    '[low-level] Unlock an ABAP class after modification. Uses session from HandlerContext. Must use the same lock_handle from LockClass operation.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description: 'Class name (e.g., ZCL_MY_CLASS).',
      },
      lock_handle: {
        type: 'string',
        description: 'Lock handle from LockClass operation.',
      },
    },
    required: ['class_name', 'lock_handle'],
  },
} as const;

interface UnlockClassArgs {
  class_name: string;
  lock_handle: string;
}

/**
 * Main handler for UnlockClass MCP tool
 *
 * Uses CrudClient.unlockClass - low-level single method call
 */
export async function handleUnlockClass(
  context: HandlerContext,
  args: UnlockClassArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, lock_handle } = args as UnlockClassArgs;

    // Validation
    if (!class_name || !lock_handle) {
      return return_error(new Error('class_name and lock_handle are required'));
    }

    const client = new CrudClient(connection);

    const className = class_name.toUpperCase();

    logger?.info(`Starting class unlock: ${className}`);

    try {
      // Unlock class
      await client.unlockClass({ className }, lock_handle);
      const unlockResult = client.getUnlockResult();

      if (!unlockResult) {
        throw new Error(
          `Unlock did not return a response for class ${className}`,
        );
      }

      logger?.info(`✅ UnlockClass completed: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            message: `Class ${className} unlocked successfully.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error unlocking class ${className}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to unlock class: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Class ${className} not found.`;
      } else if (error.response?.status === 400) {
        errorMessage = `Invalid lock handle. Make sure you're using the same lock_handle from LockClass.`;
      } else if (
        error.response?.data &&
        typeof error.response.data === 'string'
      ) {
        try {
          const { XMLParser } = require('fast-xml-parser');
          const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '@_',
          });
          const errorData = parser.parse(error.response.data);
          const errorMsg =
            errorData['exc:exception']?.message?.['#text'] ||
            errorData['exc:exception']?.message;
          if (errorMsg) {
            errorMessage = `SAP Error: ${errorMsg}`;
          }
        } catch (_parseError) {
          // Ignore parse errors
        }
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
