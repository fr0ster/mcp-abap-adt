import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'ReadBehaviorImplementation',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[read-only] Read ABAP RAP behavior implementation source code and metadata. Answers: "show behavior implementation", "display behavior pool code", "view RAP implementation X". Returns source code, package, responsible, description.',
  inputSchema: {
    type: 'object',
    properties: {
      behavior_implementation_name: {
        type: 'string',
        description: 'Behavior implementation name (e.g., ZBP_MY_CLASS).',
      },
      version: {
        type: 'string',
        enum: ['active', 'inactive'],
        description: 'Version to read: "active" (default) or "inactive".',
        default: 'active',
      },
    },
    required: ['behavior_implementation_name'],
  },
} as const;

export async function handleReadBehaviorImplementation(
  context: HandlerContext,
  args: {
    behavior_implementation_name: string;
    version?: 'active' | 'inactive';
  },
) {
  const { connection, logger } = context;
  try {
    const { behavior_implementation_name, version = 'active' } = args;
    if (!behavior_implementation_name)
      return return_error(
        new Error('behavior_implementation_name is required'),
      );

    const client = createAdtClient(connection, logger);
    const behaviorImplementationName =
      behavior_implementation_name.toUpperCase();
    const obj = client.getBehaviorImplementation();

    let source_code: string | null = null;
    try {
      const readResult = await obj.read(
        { className: behaviorImplementationName },
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
        `Could not read source for ${behaviorImplementationName}: ${e?.message}`,
      );
    }

    let metadata: string | null = null;
    try {
      const metaResult = await obj.readMetadata({
        className: behaviorImplementationName,
      });
      if (metaResult?.metadataResult?.data) {
        metadata =
          typeof metaResult.metadataResult.data === 'string'
            ? metaResult.metadataResult.data
            : safeStringify(metaResult.metadataResult.data);
      }
    } catch (e: any) {
      logger?.warn(
        `Could not read metadata for ${behaviorImplementationName}: ${e?.message}`,
      );
    }

    return return_response({
      data: JSON.stringify(
        {
          success: true,
          behavior_implementation_name: behaviorImplementationName,
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
