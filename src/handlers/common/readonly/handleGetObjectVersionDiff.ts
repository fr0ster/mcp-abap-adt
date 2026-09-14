/**
 * GetObjectVersionDiff Handler - read-only unified diff between two versions.
 *
 * Takes two opaque content_uris (from GetObjectVersions entries) plus the
 * object_type (needed to obtain the versions atom), fetches both sources via
 * getVersionSource and returns a unified diff computed with jsdiff's
 * createTwoFilesPatch. Closes #30.
 */

import type {
  IAdtError,
  IAdtResponse,
  IAdtVersionable,
} from '@mcp-abap-adt/interfaces';
import { createTwoFilesPatch } from 'diff';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { pair } from '../../../lib/strategies/sequence';
import { return_error } from '../../../lib/utils';
import {
  resolveVersionedObject,
  VERSIONED_OBJECT_TYPES,
} from './resolveVersionedObject';

export interface VersionDiffResult {
  diff: string;
  identical: boolean;
  /** Non-fatal notes (e.g. a source came back undefined → treated as empty). */
  notes?: string[];
}

/**
 * The pure half: two sources in, one patch out. Guards against undefined
 * sources by treating them as empty strings — kept separate from the two
 * callers below so neither has to repeat the jsdiff/notes logic.
 */
function diffSources(
  contentUriFrom: string,
  contentUriTo: string,
  rawFrom: string | undefined,
  rawTo: string | undefined,
): VersionDiffResult {
  const notes: string[] = [];
  if (rawFrom == null) {
    notes.push(`Source for content_uri_from was empty/undefined.`);
  }
  if (rawTo == null) {
    notes.push(`Source for content_uri_to was empty/undefined.`);
  }

  const srcFrom = rawFrom ?? '';
  const srcTo = rawTo ?? '';
  const diff = createTwoFilesPatch(
    contentUriFrom,
    contentUriTo,
    srcFrom,
    srcTo,
    '',
    '',
    { context: 3 },
  );

  return {
    diff,
    identical: srcFrom === srcTo,
    ...(notes.length ? { notes } : {}),
  };
}

/**
 * Unwrap one `getVersionSource` answer, or throw.
 *
 * adt-clients 19 turned this member's failures — including "this type has no
 * version resource", `AdtObjectErrorCodes.UNSUPPORTED_OPERATION` — into the
 * answer (`ok: false`) rather than a throw (see `IAdtVersionable` in
 * `@mcp-abap-adt/interfaces`). Used only by `buildVersionDiff` below, which
 * exists for `objectVersionTools.ts` (out of this task's fifteen), whose own
 * `catch` still reads `.code` off a thrown error — so the throwing contract
 * is kept there. `handleGetObjectVersionDiff` itself, below, does NOT use
 * this: it reads the two `IAdtResponse`s directly, so a refusal reaches
 * `answer()` as the answer it already is (code, origin, adtType, namespace,
 * messages, request, raw body — everything `failurePayload` carries), rather
 * than being collapsed into a throw and losing all of that but the message.
 */
function unwrapVersionSource(
  response: IAdtResponse<string, IAdtError>,
): string | undefined {
  if (response.ok) return response.getResult().value;
  const error = response.getError();
  const failure = new Error(error.message) as Error & {
    code?: string;
  };
  if (error.code !== undefined) failure.code = error.code;
  throw failure;
}

/**
 * Shared "fetch two sources + unified patch" logic reused by every per-object
 * Get<X>VersionDiff factory tool in `objectVersionTools.ts`. NOT used by
 * `handleGetObjectVersionDiff` below any more — see `unwrapVersionSource`'s
 * own comment for why.
 */
export async function buildVersionDiff(
  obj: IAdtVersionable<any, any, string>,
  contentUriFrom: string,
  contentUriTo: string,
): Promise<VersionDiffResult> {
  const [respFrom, respTo] = await Promise.all([
    obj.getVersionSource(contentUriFrom),
    obj.getVersionSource(contentUriTo),
  ]);

  const rawFrom = unwrapVersionSource(respFrom);
  const rawTo = unwrapVersionSource(respTo);

  return diffSources(contentUriFrom, contentUriTo, rawFrom, rawTo);
}

export const TOOL_DEFINITION = {
  name: 'GetObjectVersionDiff',
  available_in: ['onprem', 'cloud', 'legacy'] as const,
  description:
    '[read-only] Compute a unified diff between two object versions. Pass the two opaque content_uris from GetObjectVersions entries; returns the unified diff (jsdiff) of their sources.',
  inputSchema: {
    type: 'object',
    properties: {
      object_type: {
        type: 'string',
        description: 'Object type (same value used in GetObjectVersions).',
        enum: [...VERSIONED_OBJECT_TYPES],
      },
      content_uri_from: {
        type: 'string',
        description:
          'Opaque content_uri of the OLD/base version (from a GetObjectVersions entry).',
      },
      content_uri_to: {
        type: 'string',
        description:
          'Opaque content_uri of the NEW/compare version (from a GetObjectVersions entry).',
      },
    },
    required: ['object_type', 'content_uri_from', 'content_uri_to'],
  },
} as const;

interface GetObjectVersionDiffArgs {
  object_type: string;
  content_uri_from: string;
  content_uri_to: string;
}

export async function handleGetObjectVersionDiff(
  context: HandlerContext,
  args: GetObjectVersionDiffArgs,
) {
  const { connection, logger } = context;
  try {
    const { content_uri_from, content_uri_to } = args;
    const object_type = (args.object_type || '').toLowerCase();

    if (!object_type || !content_uri_from || !content_uri_to) {
      return return_error(
        new Error(
          'object_type, content_uri_from and content_uri_to are required',
        ),
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
    // object_type only selects the client; each content_uri carries the full
    // object identity (same placeholder pattern as GetObjectVersionSource).
    const resolved = resolveVersionedObject(client, object_type, 'X', 'X');
    if (!resolved) {
      return return_error(
        new Error(`Unsupported object_type: ${args.object_type}`),
      );
    }

    // Two calls of the same member (one per content_uri), not a read+metadata
    // pair — but `pair()` fits regardless: it answers `IAdtResponse<[A,B]>`,
    // short-circuiting on the FIRST refusal and handing it back untouched, and
    // `getVersionSource` answers `IAdtResponse<string>` already, with no
    // reading to inject (`VersionsCapability` hardcodes `TSource = string`
    // regardless of what a factory was given — see `resolveVersionedObject.ts`).
    // A refusal here therefore reaches `answer()` as the real answer, not a
    // thrown message — see `unwrapVersionSource`'s comment for what that
    // otherwise throws away.
    return answer(
      { tool: 'GetObjectVersionDiff', detail: 'terse' },
      () =>
        pair(
          () => resolved.obj.getVersionSource(content_uri_from),
          () => resolved.obj.getVersionSource(content_uri_to),
        ),
      ([srcFrom, srcTo]: [string, string]) => {
        const result = diffSources(
          content_uri_from,
          content_uri_to,
          srcFrom,
          srcTo,
        );
        return {
          success: true,
          object_type,
          content_uri_from,
          content_uri_to,
          identical: result.identical,
          diff: result.diff,
          ...(result.notes ? { notes: result.notes } : {}),
        };
      },
    );
  } catch (error: any) {
    return return_error(error);
  }
}
