/**
 * GetObjectVersionSource Handler - read-only fetch of one version's source.
 *
 * Takes an opaque content_uri from a GetObjectVersions entry plus the
 * object_type (needed to obtain an IAdtObject instance) and calls
 * getVersionSource(content_uri). Closes #30.
 */

import { AdtObjectErrorCodes } from '@mcp-abap-adt/interfaces';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import {
  resolveVersionedObject,
  VERSIONED_OBJECT_TYPES,
} from './resolveVersionedObject';

export const TOOL_DEFINITION = {
  name: 'GetObjectVersionSource',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Fetch the source code of a specific object version. Pass the opaque content_uri from a GetObjectVersions entry.',
  inputSchema: {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        description: 'Object type (same value used in GetObjectVersions).',
        enum: [...VERSIONED_OBJECT_TYPES],
      },
      content_uri: {
        type: 'string',
        description:
          'Opaque content_uri taken from a GetObjectVersions version entry.',
      },
    },
    required: ['object_type', 'content_uri'],
  },
} as const;

interface GetObjectVersionSourceArgs {
  object_type: string;
  content_uri: string;
}

export async function handleGetObjectVersionSource(
  context: HandlerContext,
  args: GetObjectVersionSourceArgs,
) {
  const { connection, logger } = context;
  try {
    const { content_uri } = args;
    const object_type = (args.object_type || '').toLowerCase();

    if (!object_type || !content_uri) {
      return return_error(
        new Error('object_type and content_uri are required'),
      );
    }
    if (!VERSIONED_OBJECT_TYPES.includes(object_type as any)) {
      return return_error(
        new Error(
          `Invalid object_type. Must be one of: ${VERSIONED_OBJECT_TYPES.join(', ')}`,
        ),
      );
    }

    const client = createAdtClient(connection, logger);
    // content_uri carries the full object identity; a placeholder name is only
    // needed to obtain the right IAdtObject instance.
    const resolved = resolveVersionedObject(client, object_type, 'X', 'X');
    if (!resolved) {
      return return_error(
        new Error(`Unsupported object_type: ${args.object_type}`),
      );
    }

    try {
      const source = await resolved.obj.getVersionSource(content_uri);
      return return_response({
        data: JSON.stringify({ success: true, content_uri, source }, null, 2),
      } as AxiosResponse);
    } catch (error: any) {
      if (error?.code === AdtObjectErrorCodes.UNSUPPORTED_OPERATION) {
        return return_error(
          new Error(
            `Version source is not supported for object_type '${object_type}'.`,
          ),
        );
      }
      return return_error(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  } catch (error: any) {
    return return_error(error);
  }
}
