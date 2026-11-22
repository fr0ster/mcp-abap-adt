import * as z from 'zod';

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
import { type AnswerTable, answerAt, tsv } from '../../../lib/detail';
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

export const TOOL_DEFINITION = {
  name: 'GetObjectVersions',
  available_in: ['onprem', 'cloud'] as const,
  ...byVariant((variant) => ({
    description:
      "[read-only] Lists the version history of the class, program, interface, function module, table, structure, table type, CDS view, behavior definition or metadata extension named by object_name and object_type. Returns each version with its versionId, author, updatedAt, the transport request that produced it when available, and the opaque content_uri that names the version's source (by default as TSV rows; with detail medium or full, the title and the transport description too).",
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
const VERSION_ANSWERS: AnswerTable<VersionsRead, string> = {
  terse: (read) =>
    [
      `# object ${read.object_type} ${read.object_name}`,
      tsv(
        ['versionId', 'author', 'updatedAt', 'transport', 'content_uri'],
        read.versions.map((version) => [
          version.versionId,
          version.author ?? '',
          version.updatedAt ?? '',
          version.transportRequest ?? '',
          version.contentUri,
        ]),
      ),
    ].join('\n'),
  medium: ({ document: _document, ...read }) => JSON.stringify(read),
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
  const shown = answerAt(VERSION_ANSWERS, levelOf(args));
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
