import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadDataElement',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ABAP data element definition and metadata. Answers: "show data element X", "display data element properties", "view DTEL definition", "get data element type". Returns definition, domain, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      data_element_name: {
        type: 'string',
        description: 'Data element name (e.g., Z_MY_DATA_ELEMENT).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['data_element_name'],
  },
} as const;

export async function handleReadDataElement(
  context: HandlerContext,
  args: { data_element_name: string; version?: 'active' | 'inactive' },
) {
  const { connection, logger } = context;
  try {
    const { data_element_name, version = 'active' } = args;
    if (!data_element_name)
      return return_error(new Error('data_element_name is required'));

    const client = createAdtClient(connection, logger);
    const dataElementName = data_element_name.toUpperCase();
    const obj = client.getDataElement();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { dataElementName },
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
        `Could not read source for ${dataElementName}: ${e?.message}`,
      );
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({ dataElementName });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(
        `Could not read metadata for ${dataElementName}: ${e?.message}`,
      );
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          data_element_name: dataElementName,
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
