/**
 * GetNodeStructure Handler - Low-level handler for node structure
 *
 * Uses AdtClient.getUtils().fetchNodeStructure from @mcp-abap-adt/adt-clients
 * 19. `fetchNodeStructure(parentType, parentName, options)` takes no
 * `options.analyse` at all — nothing to inject beyond the result set.
 *
 * **The guard this file exists for, and why one guess was not enough.**
 * `refusal-package-not-found-objectslist-empty--01-nodestructure.body.txt`
 * and `read-empty-package-contents--01-nodestructure.body.txt` are
 * byte-for-byte identical: zero bytes, HTTP 200, one for a package that does
 * not exist, the other for one that exists and holds nothing. A first pass
 * treated every blank body as a refusal — that traded a false success on
 * "not found" for a false error on "genuinely empty", which is the same
 * defect with the sign flipped, not a fix. `fetchNodeStructure` takes no
 * `options.analyse`, so no strategy downstream of the reading can ever
 * settle this either — the only way to know which one a blank body means is
 * to ask, which is what this file now does, on the blank-body path only.
 *
 * **Disambiguating the way this repository already does.**
 * `GetPackageTree` (`src/handlers/system/high/handleGetPackageTree.ts`) pays
 * a `getPackage().read()` round trip before walking, and reports "not found"
 * when that fails. This tool answers node structure for any object type, not
 * only packages, and has no generic per-type existence check to pay — but
 * every corpus fixture proving the ambiguity is for `DEVC/K` (a package), and
 * that is the one type this tool can check the same way `GetPackageTree`
 * does: `getPackage().readMetadata()`. So: a blank body for a `DEVC/K` parent
 * triggers that one extra request — success (empty listing) if the package
 * reads back, the package's own refusal if it does not.
 *
 * **A blank body for any other parent type is an empty listing, measured.**
 * An earlier pass threw there instead, on the grounds that no fixture settled
 * it. One does now: `CL_ABAP_CHAR_UTILITIES` — a standard SAP class, which
 * plainly exists — answers `CLAS/OC` node `0000` with HTTP 200 and zero
 * bytes on the trial system (probed 2026-09-16 via
 * `scripts/probe-migration-failures.ts`). So a blank body is not a
 * not-found signal outside the package case: for a class it is simply what
 * this endpoint says when the node holds nothing, and throwing made the tool
 * answer `client_threw` for an ordinary, correct request. The ambiguity the
 * two package fixtures capture is real and is still handled above; it is not
 * a property of the blank body in general.
 *
 * **Where the throw lives, and why it agrees with `GetObjectStructureLow`'s.**
 * Both guards now run inside the `call()` passed to `answer()`, not inside a
 * projection — a document this handler cannot honestly read is a client-side
 * fact, the same class of thing a real `analyse` would have decided if one
 * existed, and `answer()`'s `client_threw` is the kind that names it for
 * both tools alike.
 */

import {
  analyseException,
  isIndeterminateWalkAnswer,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { type NodeLevel, nodeLevel } from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { restoreSessionInConnection, return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'GetNodeStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description:
    '[low-level] Fetch node structure from ADT repository. Used for object tree navigation and structure discovery. Can use session_id and session_state from GetSession to maintain the same session.',
  inputSchema: {
    type: 'object',
    properties: {
      parent_type: {
        type: 'string',
        description: 'Parent object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K")',
      },
      parent_name: {
        type: 'string',
        description: 'Parent object name',
      },
      node_id: {
        type: 'string',
        description:
          'Optional node ID (default: "0000" for root). Use to fetch child nodes.',
        default: '0000',
      },
      with_short_descriptions: {
        type: 'boolean',
        description: 'Include short descriptions in response',
        default: true,
      },
      session_id: {
        type: 'string',
        description:
          'Session ID from GetSession. If not provided, a new session will be created.',
      },
      session_state: {
        type: 'object',
        description:
          'Session state from GetSession (cookies, csrf_token, cookie_store). Required if session_id is provided.',
        properties: {
          cookies: { type: 'string' },
          csrf_token: { type: 'string' },
          cookie_store: { type: 'object' },
        },
      },
    },
    required: ['parent_type', 'parent_name'],
  },
} as const;

interface GetNodeStructureArgs {
  parent_type: string;
  parent_name: string;
  node_id?: string;
  with_short_descriptions?: boolean;
  session_id?: string;
  session_state?: {
    cookies?: string;
    csrf_token?: string;
    cookie_store?: Record<string, string>;
  };
}

/**
 * The raw body, nothing parsed — this handler needs to see whether it was
 * blank before `nodeLevel` collapses either a blank body or a genuinely
 * empty one into the identical `{objects: [], childNodes: []}`.
 */
function rawNodeStructureXml(wire: unknown): string {
  return String((wire as { data?: unknown } | undefined)?.data ?? '');
}

/** A success carrying a `NodeLevel` — the shape `sequence()`'s steps answer with. */
function succeededLevel(level: NodeLevel): IAdtResponse<NodeLevel, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value: level }),
    getError: () => {
      throw new Error('asked for the error of a success');
    },
  } as unknown as IAdtResponse<NodeLevel, IAdtError>;
}

export async function handleGetNodeStructure(
  context: HandlerContext,
  args: GetNodeStructureArgs,
) {
  const { connection, logger } = context;
  const {
    parent_type,
    parent_name,
    node_id,
    with_short_descriptions,
    session_id,
    session_state,
  } = args;

  if (!parent_type) {
    return return_error(new Error('parent_type is required'));
  }
  if (!parent_name) {
    return return_error(new Error('parent_name is required'));
  }

  if (session_id && session_state) {
    await restoreSessionInConnection(connection, session_id, session_state);
  }

  // Task 28: why this tool carries no `detail`. The node-level family's
  // shape: `nodeLevel` (`lib/strategies/packageWalk.ts`) parses
  // `answer.data` and returns only the reduced `NodeLevel` it builds,
  // never keeping the wire text beside it — there is no `.raw` for
  // `detail: 'raw'` to answer without changing that shared strategy. The
  // final projection below is the identity function for exactly that
  // reason: there is nothing beyond the `NodeLevel` `nodeLevel` already
  // produced to project three ways.
  return answer(
    { tool: 'GetNodeStructureLow', detail: 'terse' },
    () => {
      const client = createAdtClient(connection, logger);
      return sequence(
        () =>
          client
            .getUtils({ ...ourUtils, node: rawNodeStructureXml })
            .fetchNodeStructure(parent_type, parent_name, {
              nodeId: node_id || '0000',
              withShortDescriptions: with_short_descriptions !== false,
            }),
        async (rawXml) => {
          if (!isIndeterminateWalkAnswer(rawXml)) {
            return succeededLevel(nodeLevel({ data: rawXml }));
          }

          if (parent_type.toUpperCase() !== 'DEVC/K') {
            // Nothing below this node. See the header: measured on a class
            // that exists, so the blank body is the answer, not a refusal.
            return succeededLevel({ objects: [], childNodes: [] });
          }

          // The one existence check this tool can pay: the same one
          // GetPackageTree pays, over the same object, through the
          // already-migrated getPackage().readMetadata().
          const packageRead = await client
            .getPackage()
            .readMetadata(
              { packageName: parent_name.toUpperCase() },
              { analyse: analyseException },
            );

          if (!packageRead.ok) {
            // The package's own refusal, named — not a sentence this
            // handler composed about a call it did not make.
            return packageRead as unknown as IAdtResponse<NodeLevel, IAdtError>;
          }

          // The package exists; the blank body was the genuinely-empty
          // answer, not the not-found one.
          return succeededLevel({ objects: [], childNodes: [] });
        },
      );
    },
    (value) => value,
  );
}
