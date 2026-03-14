import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadPackage',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Read ABAP package definition and metadata (super-package, responsible, description, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      package_name: {
        type: 'string',
        description: 'Package name (e.g., Z_MY_PACKAGE).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['package_name'],
  },
} as const;

export async function handleReadPackage(
  context: HandlerContext,
  args: { package_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  try {
    const { package_name, version = 'active' } = args;
    if (!package_name)
      return return_error(new Error('package_name is required'));

    const client = createAdtClient(connection, logger);
    const packageName = package_name.toUpperCase();
    const obj = client.getPackage();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { packageName },
        version as 'active' | 'inactive',
      );
      if (readResult?.readResult?.data) {
        source_code =
          typeof readResult.readResult.data === 'string'
            ? readResult.readResult.data
            : safeStringify(readResult.readResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read source for ${packageName}: ${e?.message}`);
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({ packageName });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read metadata for ${packageName}: ${e?.message}`);
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          package_name: packageName,
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
