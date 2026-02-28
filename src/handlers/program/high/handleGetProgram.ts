/**
 * GetProgram Handler - Read ABAP Program via AdtClient
 *
 * Uses AdtClient.getProgram().read() for high-level read operation.
 * Supports both active and inactive versions.
 */

import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetProgram',
  description:
    'Retrieve ABAP program definition. Supports reading active or inactive version.',
  inputSchema: {
    type: 'object',
    properties: {
      program_name: {
        type: 'string',
        description: 'Program name (e.g., Z_MY_PROGRAM).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description:
          'Version to read: "active" (default) for deployed version, "inactive" for modified but not activated version.',
        default: 'active',
      },
    },
    required: ['program_name'],
  },
} as const;

interface GetProgramArgs {
  program_name: string;
  version?: 'active' | 'inactive';
}

/**
 * Main handler for GetProgram MCP tool
 *
 * Uses AdtClient.getProgram().read() - high-level read operation
 */
export async function handleGetProgram(
  context: HandlerContext,
  args: GetProgramArgs,
) {
  const { connection, logger } = context;
  try {
    const { program_name, version = 'active' } = args as GetProgramArgs;

    // Validation
    if (!program_name) {
      return return_error(new Error('program_name is required'));
    }

    const client = createAdtClient(connection, logger);
    const programName = program_name.toUpperCase();

    logger?.info(`Reading program ${programName}, version: ${version}`);

    try {
      // Read program using AdtClient
      const programObject = client.getProgram();
      const readResult = await programObject.read(
        { programName },
        version as 'active' | 'inactive',
      );

      if (!readResult || !readResult.readResult) {
        throw new Error(`Program ${programName} not found`);
      }

      // Extract data from read result
      const programData =
        typeof readResult.readResult.data === 'string'
          ? readResult.readResult.data
          : JSON.stringify(readResult.readResult.data);

      logger?.info(`✅ GetProgram completed successfully: ${programName}`);

      return return_response({
        data: JSON.stringify(
          {
            success: true,
            program_name: programName,
            version,
            program_data: programData,
            status: readResult.readResult.status,
            status_text: readResult.readResult.statusText,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      logger?.error(
        `Error reading program ${programName}: ${error?.message || error}`,
      );

      // Parse error message
      let errorMessage = `Failed to read program: ${error.message || String(error)}`;

      if (error.response?.status === 404) {
        errorMessage = `Program ${programName} not found.`;
      } else if (error.response?.status === 423) {
        errorMessage = `Program ${programName} is locked by another user.`;
      }

      return return_error(new Error(errorMessage));
    }
  } catch (error: any) {
    return return_error(error);
  }
}
