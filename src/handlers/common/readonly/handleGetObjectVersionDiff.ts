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
 * Unwrap one `getVersionSource` answer, or throw.
 *
 * adt-clients 19 turned this member's failures — including "this type has no
 * version resource", `AdtObjectErrorCodes.UNSUPPORTED_OPERATION` — into the
 * answer (`ok: false`) rather than a throw (see `IAdtVersionable` in
 * `@mcp-abap-adt/interfaces`). `buildVersionDiff` is shared with
 * `objectVersionTools.ts`, which still catches a THROW and reads `.code` off
 * it, so the throwing contract is kept here and the unwrap is this function's
 * job — not a redesign of `buildVersionDiff`'s callers.
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
 * Shared "fetch two sources + unified patch" logic reused by the generic
 * GetObjectVersionDiff and every per-object Get<X>VersionDiff factory tool.
 * Guards against undefined sources by treating them as empty strings.
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
    // pair — `pair()`/`sequence()` answer one IAdtResponse each and don't fit
    // "diff two documents". `buildVersionDiff` already reduces both answers to
    // one `VersionDiffResult`, throwing (with `.code` preserved) on a refusal
    // so `objectVersionTools.ts` — which still catches that throw — keeps
    // working unchanged. `answer()`'s own try/catch turns that throw into the
    // same failure shape every other handler here surfaces.
    return answer(
      { tool: 'GetObjectVersionDiff', detail: 'terse' },
      () =>
        buildVersionDiff(resolved.obj, content_uri_from, content_uri_to).then(
          (value) => ({
            ok: true,
            getResult: () => ({ value }),
            getError: () => {
              throw new Error(
                'GetObjectVersionDiff: asked for the error of a success',
              );
            },
          }),
        ),
      (result: VersionDiffResult) => ({
        success: true,
        object_type,
        content_uri_from,
        content_uri_to,
        identical: result.identical,
        diff: result.diff,
        ...(result.notes ? { notes: result.notes } : {}),
      }),
    );
  } catch (error: any) {
    return return_error(error);
  }
}
