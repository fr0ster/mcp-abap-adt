import * as z from 'zod';
import { purpose, returnsOf, toolDescription } from '../../../lib/description';

/**
 * GetObjectVersions Handler - read-only version history of an ABAP object.
 *
 * Dispatches on object_type to the matching adt-clients IAdtObject and calls
 * getVersions(config). Returns the IObjectVersion[] (each entry carries its
 * opaque contentUri, to be passed to GetObjectVersionSource). Closes #30.
 */

import type { IObjectVersion } from '@mcp-abap-adt/adt-strategies';
import {
  type ProjectionVariant,
  VERSIONED_KINDS,
} from '../../../lib/adtProjections';
import { acceptedOf } from '../../../lib/adtTypeCode';
import { createAdtClient, variantOf } from '../../../lib/clients';
import {
  about,
  entries,
  headShape,
  jsonText,
  type ListAnswerTable,
  listAnswerAt,
  type RowSchemas,
  rows,
  shapesOf,
  writeJson,
  writeListing,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_SHAPE, levelOf } from '../../../lib/strategies/detail';
import { asError } from '../../../lib/thrownValue';
import {
  type AxiosResponse,
  return_error,
  return_response,
} from '../../../lib/utils';
import { byVariant } from '../../../lib/variantDefinition';
import { readVersions, resolveVersionedObject } from './resolveVersionedObject';

/** The lists the version listing writes: what its description states. */
export const VERSIONS_LISTS: RowSchemas<{ versions: IObjectVersion[] }> = {
  versions: about(
    'for each version',
    rows('versions', {
      columns: [
        {
          name: 'versionId',
          means: 'its ID',
          cell: (version: IObjectVersion) => version.versionId,
        },
        {
          name: 'author',
          means: 'its author',
          cell: (version: IObjectVersion) => version.author ?? '',
        },
        {
          name: 'updatedAt',
          means: 'when it was saved',
          cell: (version: IObjectVersion) => version.updatedAt ?? '',
        },
        {
          name: 'transport',
          means: 'the transport that produced it',
          cell: (version: IObjectVersion) => version.transportRequest ?? '',
        },
        {
          name: 'content_uri',
          means: 'the URI of its source',
          cell: (version: IObjectVersion) => version.contentUri,
        },
      ],
      header: 'always',
    }),
  ),
};

/** The head the version listing opens with. */
export const VERSIONS_HEADS = [
  headShape('object', "the object's type and name"),
];

export const TOOL_DEFINITION = {
  name: 'GetObjectVersions',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description: toolDescription({
      tag: 'read-only',
      purpose: purpose(
        'Lists the version history of an ABAP class, program, interface, function module, table, structure, CDS view or other versioned object.',
      ),
      returns: returnsOf({
        heads: VERSIONS_HEADS,
        shapes: [shapesOf(VERSIONS_LISTS)],
      }),
    }),
    inputSchema: objectVersionsSchema(variant),
  })),
} as const;

/** GetObjectVersions's input on `variant`. */
function objectVersionsSchema(variant: ProjectionVariant) {
  return z.object({
    object_type: z.enum(VERSIONED_KINDS[variant]).describe('Object type.'),
    object_name: z.string().describe('Object name.'),
    function_group_name: z
      .string()
      .optional()
      .describe(
        'Owning function group name. Required when object_type is function_module.',
      ),
    ...DETAIL_SHAPE,
  });
}

/** A version list as read, with the object it is of. */
interface VersionsRead {
  object_type: string;
  object_name: string;
  versions: IObjectVersion[];
  /** The feed as ADT sent it (`detail: 'raw'`). */
  document: string;
}

/**
 * What GetObjectVersions answers at each `detail`, selected before the read
 * (`src/lib/detail`), over adt-strategies' typed reading of the version feed
 * (`objectVersions`): terse a TSV row per version — versionId, author,
 * updatedAt, transport, content_uri (what GetObjectVersionSource reads) —
 * under the object; medium every field of each version; full the answer
 * before `detail`; raw the feed as ADT sent it.
 */
// Every version the feed held, written by the listing writer.
const VERSION_ANSWERS: ListAnswerTable<VersionsRead, string> = {
  terse: (read) =>
    writeListing({
      heads: [
        { head: 'object', value: `${read.object_type} ${read.object_name}` },
      ],
      reading: read,
      lists: VERSIONS_LISTS,
    }),
  medium: (read) =>
    jsonText(
      writeJson(
        { object_type: read.object_type, object_name: read.object_name },
        read,
        { versions: entries('versions', (version: IObjectVersion) => version) },
      ),
    ),
  full: ({ document: _document, ...read }) =>
    JSON.stringify({ success: true, ...read }),
  raw: (read) => read.document,
};

type GetObjectVersionsArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleGetObjectVersions(
  context: HandlerContext,
  args: GetObjectVersionsArgs,
) {
  const { connection, logger } = context;
  const shown = listAnswerAt(VERSION_ANSWERS, levelOf(args));
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
    } catch (e) {
      return return_error(asError(e));
    }

    try {
      const { versions, document } = await readVersions(resolved);
      return return_response({
        data: shown({
          object_type,
          object_name: object_name.toUpperCase(),
          versions,
          document,
        }),
      });
    } catch (error) {
      return return_error(asError(error));
    }
  } catch (error) {
    return return_error(error);
  }
}
