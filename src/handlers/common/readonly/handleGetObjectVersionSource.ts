/**
 * GetObjectVersionSource Handler - read-only fetch of one version's source.
 *
 * Takes an opaque content_uri from a GetObjectVersions entry plus the
 * object_type (needed to obtain an IAdtObject instance) and calls
 * getVersionSource(content_uri). Closes #30.
 */

import {
  type ProjectionVariant,
  VERSIONED_KINDS,
} from '../../../lib/adtProjections';
import { createAdtClient, variantOf } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { byVariant } from '../../../lib/variantDefinition';
import {
  readVersionSource,
  resolveVersionedObject,
  VERSIONED_OBJECT_TYPES,
} from './resolveVersionedObject';

export const TOOL_DEFINITION = {
  name: 'GetObjectVersionSource',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description:
      "[read-only] Reads the source code of the object version named by content_uri, an entry of an object's version history, for the object type named by object_type.",
    inputSchema: objectVersionSourceSchema(variant),
  })),
} as const;

/** GetObjectVersionSource's input on `variant`. */
function objectVersionSourceSchema(variant: ProjectionVariant) {
  return {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        description:
          'Object type (the same value the version history was read with).',
        enum: VERSIONED_KINDS[variant],
      },
      content_uri: {
        type: 'string',
        description:
          "Opaque content_uri of a version, from the object's version history.",
      },
    },
    required: ['object_type', 'content_uri'],
  } as const;
}

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
          `Invalid object_type. Must be one of: ${VERSIONED_KINDS[variantOf(connection)].join(', ')}`,
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
      const source = await readVersionSource(resolved, content_uri);
      return return_response({
        data: JSON.stringify({ success: true, content_uri, source }, null, 2),
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
