import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadServiceBinding',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ABAP service binding source/payload and metadata (package, responsible, description, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      service_binding_name: {
        type: 'string',
        description: 'Service binding name (e.g., ZUI_MY_BINDING).',
      },
    },
    required: ['service_binding_name'],
  },
} as const;

export async function handleReadServiceBinding(
  context: HandlerContext,
  args: { service_binding_name: string },
) {
  const { connection, logger } = context;
  try {
    const { service_binding_name } = args;
    if (!service_binding_name)
      return return_error(new Error('service_binding_name is required'));

    const client = createAdtClient(connection, logger);
    const bindingName = service_binding_name.trim().toUpperCase();
    const obj = client.getServiceBinding();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read({ bindingName });
      if (readResult?.readResult?.data) {
        source_code =
          typeof readResult.readResult.data === 'string'
            ? readResult.readResult.data
            : safeStringify(readResult.readResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read source for ${bindingName}: ${e?.message}`);
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({ bindingName });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(`Could not read metadata for ${bindingName}: ${e?.message}`);
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          service_binding_name: bindingName,
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
