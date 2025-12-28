/**
 * UpdateClass Handler - Update ABAP Class Source Code
 *
 * Uses AdtClient.updateClass from @mcp-abap-adt/adt-clients.
 * Low-level handler: single method call.
 */

import { AdtClient } from '@mcp-abap-adt/adt-clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'UpdateClassLow',
  description:
    '[low-level] Update source code of an existing ABAP class. Uses session from HandlerContext. Requires lock handle from LockClass operation. - use UpdateClass (high-level) for full workflow with lock/unlock/activate.',
  inputSchema: {
    type: 'object',
    properties: {
      class_name: {
        type: 'string',
        description:
          'Class name (e.g., ZCL_TEST_CLASS_001). Class must already exist.',
      },
      source_code: {
        type: 'string',
        description:
          'Complete ABAP class source code including CLASS DEFINITION and IMPLEMENTATION sections.',
      },
      lock_handle: {
        type: 'string',
        description:
          'Lock handle from LockClass operation. Required for update operation.',
      },
    },
    required: ['class_name', 'source_code', 'lock_handle'],
  },
} as const;

interface UpdateClassArgs {
  class_name: string;
  source_code: string;
  lock_handle: string;
}

/**
 * Main handler for UpdateClass MCP tool
 *
 * Uses AdtClient.updateClass - low-level single method call
 */
export async function handleUpdateClass(
  context: HandlerContext,
  args: UpdateClassArgs,
) {
  const { connection, logger } = context;
  try {
    const { class_name, source_code, lock_handle } = args as UpdateClassArgs;

    // Validation
    if (!class_name || !source_code || !lock_handle) {
      return return_error(
        new Error('class_name, source_code, and lock_handle are required'),
      );
    }

    const client = new AdtClient(connection);

    const className = class_name.toUpperCase();

    logger?.info(`Starting class update: ${className}`);

    try {
      // Update class with source code
      const updateState = await client
        .getClass()
        .update(
          { className, sourceCode: source_code },
          { lockHandle: lock_handle },
        );
      const updateResult = updateState.updateResult;

      if (!updateResult) {
        throw new Error(
          `Update did not return a response for class ${className}`,
        );
      }

      logger?.info(`✅ UpdateClass completed: ${className}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            class_name: className,
            message: `Class ${className} updated successfully. Remember to unlock using UnlockClassLow.`,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error updating class ${className}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to update class: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Class ${className} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Class ${className} is locked by another user or lock handle is invalid.`;
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
