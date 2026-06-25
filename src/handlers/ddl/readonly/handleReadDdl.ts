import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadDdl',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    'Operation: Read, Create, Update. Subject: DDL source. Will be useful for reading, creating, or updating a DDL source. [read-only] Read ABAP CDS view source code and metadata. Answers: "show CDS view source", "display view definition", "view CDS X", "get CDS code". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      ddl_name: {
        type: 'string',
        description: 'DDL source name (e.g., Z_MY_VIEW).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['ddl_name'],
  },
} as const;

export async function handleReadDdl(
  context: HandlerContext,
  args: { ddl_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  try {
    const { ddl_name, version = 'active' } = args;
    if (!ddl_name) return return_error(new Error('ddl_name is required'));

    const client = createAdtClient(connection, logger);
    const ddlName = ddl_name.toUpperCase();
    const obj = client.getDdl();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { ddlName: ddlName },
        version as 'active' | 'inactive',
      );
      if (readResult?.readResult?.data) {
        source_code =
          typeof readResult.readResult.data === 'string'
            ? readResult.readResult.data
            : safeStringify(readResult.readResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read source for ${ddlName}: ${e?.message}`);
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({ ddlName: ddlName });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read metadata for ${ddlName}: ${e?.message}`);
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          ddl_name: ddlName,
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
