/**
 * GetObjectVersions Handler - read-only version history of an ABAP object.
 *
 * Dispatches on object_type to the matching adt-clients IAdtObject and calls
 * getVersions(config). Returns the IObjectVersion[] (each entry carries its
 * opaque contentUri, to be passed to GetObjectVersionSource). Closes #30.
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
  name: 'GetObjectVersions',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] List the version history of an ABAP object. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and an opaque content_uri to fetch that version source via GetObjectVersionSource.',
  inputSchema: {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        description: 'Object type.',
        enum: [...VERSIONED_OBJECT_TYPES],
      },
      object_name: {
        type: 'string',
        description:
          'Object name (e.g., ZCL_MY_CLASS, ZIF_MY_INTERFACE, Z_MY_TABLE).',
      },
      function_group_name: {
        type: 'string',
        description:
          'Owning function group name. Required when object_type is function_module.',
      },
    },
    required: ['object_type', 'object_name'],
  },
} as const;

interface GetObjectVersionsArgs {
  object_type: string;
  object_name: string;
  function_group_name?: string;
}

export async function handleGetObjectVersions(
  context: HandlerContext,
  args: GetObjectVersionsArgs,
) {
  const { connection, logger } = context;
  try {
    const { object_name, function_group_name } = args;
    const object_type = (args.object_type || '').toLowerCase();

    if (!object_type || !object_name) {
      return return_error(
        new Error('object_type and object_name are required'),
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
    let resolved: ReturnType<typeof resolveVersionedObject>;
    try {
      resolved = resolveVersionedObject(
        client,
        object_type,
        object_name,
        function_group_name,
      );
    } catch (e: any) {
      return return_error(e instanceof Error ? e : new Error(String(e)));
    }
    if (!resolved) {
      return return_error(
        new Error(`Unsupported object_type: ${args.object_type}`),
      );
    }

    try {
      const versions = await resolved.obj.getVersions(resolved.config);
      return return_response({
        data: JSON.stringify(
          {
            success: true,
            object_type,
            object_name: object_name.toUpperCase(),
            versions,
          },
          null,
          2,
        ),
      } as AxiosResponse);
    } catch (error: any) {
      if (error?.code === AdtObjectErrorCodes.UNSUPPORTED_OPERATION) {
        return return_error(
          new Error(
            `Version history is not supported for object_type '${object_type}' (${object_name}).`,
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
