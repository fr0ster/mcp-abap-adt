/**
 * GetObjectVersions Handler - read-only version history of an ABAP object.
 *
 * Dispatches on object_type to the matching adt-clients IAdtObject and calls
 * getVersions(config). Returns the IObjectVersion[] (each entry carries its
 * opaque contentUri, to be passed to GetObjectVersionSource). Closes #30.
 */

import {
  type ProjectionVariant,
  VERSIONED_KINDS,
} from '../../../lib/adtProjections';
import { acceptedOf } from '../../../lib/adtTypeCode';
import { createAdtClient, variantOf } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { byVariant } from '../../../lib/variantDefinition';
import { readVersions, resolveVersionedObject } from './resolveVersionedObject';

export const TOOL_DEFINITION = {
  name: 'GetObjectVersions',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description:
      "[read-only] Lists the version history of the class, program, interface, function module, table, structure, CDS view, behavior definition or metadata extension named by object_name and object_type. Returns each version with its versionId, author, updatedAt, title, the transportRequest (and transportDescription) that produced it when available, and the opaque content_uri that names the version's source.",
    inputSchema: objectVersionsSchema(variant),
  })),
} as const;

/** GetObjectVersions's input on `variant`. */
function objectVersionsSchema(variant: ProjectionVariant) {
  return {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        description: 'Object type.',
        enum: VERSIONED_KINDS[variant],
      },
      object_name: {
        type: 'string',
        description: 'Object name.',
      },
      function_group_name: {
        type: 'string',
        description:
          'Owning function group name. Required when object_type is function_module.',
      },
    },
    required: ['object_type', 'object_name'],
  } as const;
}

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
    if (!args.object_type || !object_name) {
      return return_error(
        new Error('object_type and object_name are required'),
      );
    }
    const variant = variantOf(connection);
    const object_type = acceptedOf(args.object_type, VERSIONED_KINDS[variant]);
    if (object_type === undefined) {
      return return_error(
        new Error(
          `Invalid object_type. Must be one of: ${VERSIONED_KINDS[variant].join(', ')}`,
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

    try {
      const versions = await readVersions(resolved);
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
      return return_error(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  } catch (error: any) {
    return return_error(error);
  }
}
