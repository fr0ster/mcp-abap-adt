import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadProgram',
  available_in: ['onprem', 'legacy'] as const,
  description:
    '[read-only] Read ABAP program source code and metadata (package, responsible, description, etc.).',
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
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['program_name'],
  },
} as const;

export async function handleReadProgram(
  context: HandlerContext,
  args: { program_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  try {
    const { program_name, version = 'active' } = args;
    if (!program_name)
      return return_error(new Error('program_name is required'));

    const client = createAdtClient(connection, logger);
    const programName = program_name.toUpperCase();
    const obj = client.getProgram();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { programName },
        version as 'active' | 'inactive',
      );
      if (readResult?.readResult?.data) {
        source_code =
          typeof readResult.readResult.data === 'string'
            ? readResult.readResult.data
            : safeStringify(readResult.readResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read source for ${programName}: ${e?.message}`);
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({ programName });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read metadata for ${programName}: ${e?.message}`);
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          program_name: programName,
          version,
          source_code,
          metadata,
        },
        null,
        2,
      ),
    } as AxiosResponse);
  } catch (error: any) {
    return return_error(error);
  }
}

function safeStringify(data: unknown): string {
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}
