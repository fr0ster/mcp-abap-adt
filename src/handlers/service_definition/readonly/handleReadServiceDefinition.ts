import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadServiceDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ABAP service definition (SRVD) source code and metadata. Answers: "show service definition", "display SRVD source", "view service definition X", "get service exposure". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      service_definition_name: {
        type: 'string',
        description: 'Service definition name (e.g., Z_MY_SRVD).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['service_definition_name'],
  },
} as const;

export async function handleReadServiceDefinition(
  context: HandlerContext,
  args: {
    service_definition_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  try {
    const { service_definition_name, version = 'active' } = args;
    if (!service_definition_name)
      return return_error(new Error('service_definition_name is required'));

    const client = createAdtClient(connection, logger);
    const serviceDefinitionName = service_definition_name.toUpperCase();
    const obj = client.getServiceDefinition();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { serviceDefinitionName },
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
        `Could not read source for ${serviceDefinitionName}: ${e?.message}`,
      );
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({ serviceDefinitionName });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(
        `Could not read metadata for ${serviceDefinitionName}: ${e?.message}`,
      );
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          service_definition_name: serviceDefinitionName,
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
