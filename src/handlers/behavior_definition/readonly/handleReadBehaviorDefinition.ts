import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadBehaviorDefinition',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ABAP RAP behavior definition (BDEF) source code and metadata. Answers: "show behavior definition", "display BDEF source", "view RAP behavior X", "get behavior definition code". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_definition_name: {
        type: 'string',
        description: 'Behavior definition name (e.g., Z_MY_BDEF).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['behavior_definition_name'],
  },
} as const;

export async function handleReadBehaviorDefinition(
  context: HandlerContext,
  args: {
    behavior_definition_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  try {
    const { behavior_definition_name, version = 'active' } = args;
    if (!behavior_definition_name)
      return return_error(new Error('behavior_definition_name is required'));

    const client = createAdtClient(connection, logger);
    const behaviorDefinitionName = behavior_definition_name.toUpperCase();
    const obj = client.getBehaviorDefinition();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { name: behaviorDefinitionName },
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
        `Could not read source for ${behaviorDefinitionName}: ${e?.message}`,
      );
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({
        name: behaviorDefinitionName,
      });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(
        `Could not read metadata for ${behaviorDefinitionName}: ${e?.message}`,
      );
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          behavior_definition_name: behaviorDefinitionName,
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
