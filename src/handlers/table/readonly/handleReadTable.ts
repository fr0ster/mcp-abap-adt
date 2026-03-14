import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadTable',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ABAP table definition and metadata (package, responsible, description, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      table_name: {
        type: 'string',
        description: 'Table name (e.g., Z_MY_TABLE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['table_name'],
  },
} as const;

export async function handleReadTable(
  context: HandlerContext,
  args: { table_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  try {
    const { table_name, version = 'active' } = args;
    if (!table_name) return return_error(new Error('table_name is required'));

    const client = createAdtClient(connection, logger);
    const tableName = table_name.toUpperCase();
    const obj = client.getTable();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { tableName },
        version as 'active' | 'inactive',
      );
      if (readResult?.readResult?.data) {
        source_code =
          typeof readResult.readResult.data === 'string'
            ? readResult.readResult.data
            : safeStringify(readResult.readResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read source for ${tableName}: ${e?.message}`);
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({ tableName });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read metadata for ${tableName}: ${e?.message}`);
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          table_name: tableName,
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
