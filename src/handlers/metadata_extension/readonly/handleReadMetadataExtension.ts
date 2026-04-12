import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadMetadataExtension',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ABAP metadata extension (DDLX) source code and metadata. Answers: "show metadata extension", "display DDLX source", "view UI annotations", "get metadata extension X". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      metadata_extension_name: {
        type: 'string',
        description: 'Metadata extension name (e.g., Z_MY_DDLX).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['metadata_extension_name'],
  },
} as const;

export async function handleReadMetadataExtension(
  context: HandlerContext,
  args: {
    metadata_extension_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  try {
    const { metadata_extension_name, version = 'active' } = args;
    if (!metadata_extension_name)
      return return_error(new Error('metadata_extension_name is required'));

    const client = createAdtClient(connection, logger);
    const metadataExtensionName = metadata_extension_name.toUpperCase();
    const obj = client.getMetadataExtension();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { name: metadataExtensionName },
        version as 'active' | 'inactive',
      );
      if (readResult?.readResult?.data) {
        source_code =
          typeof readResult.readResult.data === 'string'
            ? readResult.readResult.data
            : safeStringify(readResult.readResult.data);
      }
    } catch (e: any) {
      logger?.warn(
        `Could not read source for ${metadataExtensionName}: ${e?.message}`,
      );
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({
        name: metadataExtensionName,
      });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(
        `Could not read metadata for ${metadataExtensionName}: ${e?.message}`,
      );
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          metadata_extension_name: metadataExtensionName,
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
