import * as z from 'zod';
import { purpose, toolDescription } from '../../../lib/description';
import {
  type Head,
  type ListAnswerTable,
  listAnswerAt,
  wireAnswer,
  writeListing,
  writeWhole,
} from '../../../lib/detail';
import { requiredText } from '../../../lib/handlers/argumentRules';
import {
  ASSEMBLED_DETAIL_SHAPE,
  detailOf,
  levelOf,
} from '../../../lib/strategies/detail';
import { succeeded } from '../../../lib/strategies/stepResponse';
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
 * bytes on the trial system (probed 2026-09-16 by a one-off script,
 * `scripts/probe-migration-failures.ts`, since removed in #234). So a blank body is not a
 * not-found signal outside the package case: for a class it is simply what
 * this endpoint says when the node holds nothing, and throwing made the tool
 * answer `client_threw` for an ordinary, correct request. The ambiguity the
 * two package fixtures capture is real and is still handled above; it is not
 * a property of the blank body in general.
 *
 * **Compact reads it once.** Compact is one ADT request per tool call (the
 * owner's rule), so compact `HandlerGet` part `node_structure` calls
 * `handleGetNodeStructureOnce`: a package's blank body is the empty listing
 * with `blank` stating both readings, and the package's metadata is the
 * consumer's next call when it needs to know which one holds.
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
  utilNodeContents,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { notATableType, tableTypeOf } from '../../../lib/adtTypeCode';
import { answer } from '../../../lib/answer';
import { createAdtClient, variantOf } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { readPackageMetadata } from '../../../lib/strategies/metadataReads';
import {
  childNodesOf,
  isNotLoaded,
  type NodeItem,
  type NodeLevel,
  nodeItemsOf,
} from '../../../lib/strategies/packageWalk';
import { ourUtils } from '../../../lib/strategies/resultSets';
import { sequence } from '../../../lib/strategies/sequence';
import { atStep } from '../../../lib/strategies/step';
import { return_error } from '../../../lib/utils';
import { bodyTextOf } from '../../../lib/wireValue';
import { OBJECTS_BY_TYPE_LISTS } from '../../search/readonly/handleGetObjectsByType';

export const TOOL_DEFINITION = {
  name: 'GetNodeStructureLow',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription({
    tag: 'low-level',
    purpose: purpose(
      'Reads one level of the repository browser of a package, class, program or other repository object, at its root or the node asked.',
    ),
  }),
  inputSchema: z.object({
    parent_type: requiredText('parent_type is required').describe(
      'Parent object type (e.g., "CLAS/OC", "PROG/P", "DEVC/K")',
    ),
    parent_name: requiredText('parent_name is required').describe(
      'Parent object name',
    ),
    node_id: z
      .string()
      .default('000000')
      .optional()
      .describe(
        'Optional node ID (default: "000000", the root). Use to fetch child nodes. "0000" is not the root: the server answers it with an empty body.',
      ),
    with_short_descriptions: z
      .boolean()
      .default(true)
      .optional()
      .describe('Include short descriptions in response'),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type GetNodeStructureArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The node slot's reading here: the raw body — this handler needs to see
 * whether it was blank before a reading collapses either a blank body or a
 * genuinely empty one into the identical empty level — and the level as
 * adt-strategies reads it (`utilNodeContents`, 0.28.1).
 */
function nodeStructureRead(wire: IAdtWireResponse): {
  raw: string;
  level: NodeLevel;
} {
  return { raw: bodyTextOf(wire), level: utilNodeContents(wire) };
}

/** A level as this tool answers it: its objects, child nodes, and a node SAP could not load. */
interface LevelAnswer {
  objects: NodeItem[];
  childNodes: Array<{ type: string; nodeId: string }>;
  notLoaded?: true;
  blank?: string;
}

/** What a call read: the level, and for a package's blank body read once, `blank`. */
interface NodeRead {
  readonly level: NodeLevel;
  readonly blank?: string | undefined;
}

/** The level of a blank body: nothing listed. */
const EMPTY_LEVEL: NodeLevel = { objects: [], childNodes: [] };

/** The level answered as JSON: every object listed, complete or not. */
function levelAnswer({ level, blank }: NodeRead): LevelAnswer {
  if (blank !== undefined) {
    return {
      objects: nodeItemsOf(level),
      childNodes: childNodesOf(level),
      blank,
    };
  }
  return {
    ...(isNotLoaded(level) ? { notLoaded: true as const } : {}),
    objects: nodeItemsOf(level),
    childNodes: childNodesOf(level),
  };
}

/**
 * A success carrying what the call read — the shape `sequence()`'s steps
 * answer with.
 */
function succeededRead(read: NodeRead): IAdtResponse<NodeRead, IAdtError> {
  return succeeded(read);
}

/**
 * What the level answers at each `detail` (`src/lib/detail`): terse the
 * objects as rows, each child node and each node SAP could not load as a
 * mark line, written by the listing writer over the level's own lists (as
 * `GetObjectsByType` writes a level), the description column where asked;
 * medium and full the level as JSON. Raw never reaches this table: the
 * handler answers it as the documents read (`wireAnswer`).
 */
function nodeAnswers(
  descriptions: boolean,
): ListAnswerTable<NodeRead, string | LevelAnswer> {
  return {
    terse: (read) => {
      const count =
        nodeItemsOf(read.level).length + (read.level.notLoaded ?? []).length;
      const heads: Head[] = [
        { head: 'count', value: String(count) },
        ...(read.blank === undefined
          ? []
          : [{ head: 'blank', value: read.blank }]),
      ];
      return writeListing({
        heads,
        reading: read.level,
        lists: OBJECTS_BY_TYPE_LISTS[descriptions ? 'described' : 'bare'],
      });
    },
    medium: (read) => writeWhole(levelAnswer(read)),
    full: levelAnswer,
    raw: levelAnswer,
  };
}

/**
 * What a blank body for a package parent means: the package holds no objects,
 * or no package of that name exists — SAP answers both alike.
 */
export const BLANK_PACKAGE_LISTING =
  'SAP answered a blank body: the package holds no objects, or no package of this name exists.';

/**
 * How a blank body for a `DEVC/K` parent is answered: `read-package` pays one
 * more request (the package's metadata) to tell the two readings apart;
 * `state` answers the empty listing with both readings stated — one request
 * per call, the compact rule.
 */
type BlankPackage = 'read-package' | 'state';

export async function handleGetNodeStructure(
  context: HandlerContext,
  args: GetNodeStructureArgs,
) {
  return nodeStructureAt(context, args, 'read-package');
}

/**
 * The node structure in one request: a blank body for a package parent is an
 * empty listing carrying `blank`, both of its readings.
 */
export async function handleGetNodeStructureOnce(
  context: HandlerContext,
  args: GetNodeStructureArgs,
) {
  return nodeStructureAt(context, args, 'state');
}

/**
 * The node structure at the level asked: at `raw` what ADT sent — the
 * documents the call's reads answered (one, or two where a package's blank
 * body is checked against its metadata), read with the tool at full
 * (`wireAnswer`, `src/lib/detail/wire.ts`).
 */
async function nodeStructureAt(
  context: HandlerContext,
  args: GetNodeStructureArgs,
  blankPackage: BlankPackage,
) {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'GetNodeStructureLow',
        shape: 'assembled',
      },
      () => nodeStructure(context, { ...args, detail: 'full' }, blankPackage),
    );
  }
  return nodeStructure(context, args, blankPackage);
}

async function nodeStructure(
  context: HandlerContext,
  args: GetNodeStructureArgs,
  blankPackage: BlankPackage,
) {
  const { connection, logger } = context;
  const { parent_type, parent_name, node_id, with_short_descriptions } = args;

  const variant = variantOf(connection);
  const parentType = tableTypeOf(parent_type, variant);
  if (parentType === undefined) {
    return return_error(
      new Error(notATableType('parent_type', parent_type, variant)),
    );
  }

  const shown = listAnswerAt(
    nodeAnswers(with_short_descriptions !== false),
    levelOf(args),
  );
  return answer(
    { tool: 'GetNodeStructureLow', detail: detailOf(args) },
    () => {
      const client = createAdtClient(connection, logger);
      return sequence(
        atStep('read node structure', () =>
          withAdtHeaders(context, 'utils.fetchNodeStructure', (headers) =>
            client
              .getUtils({ ...ourUtils, node: nodeStructureRead })
              .fetchNodeStructure(parentType, parent_name, {
                headers,
                analyse: analyseException,
                nodeId: node_id || '000000',
                withShortDescriptions: with_short_descriptions !== false,
              }),
          ),
        ),
        async (read) => {
          if (!isIndeterminateWalkAnswer(read.raw)) {
            return succeededRead({ level: read.level });
          }

          if (parentType !== 'DEVC/K') {
            // Nothing below this node. See the header: measured on a class
            // that exists, so the blank body is the answer, not a refusal.
            return succeededRead({ level: EMPTY_LEVEL });
          }

          if (blankPackage === 'state') {
            return succeededRead({
              level: EMPTY_LEVEL,
              blank: BLANK_PACKAGE_LISTING,
            });
          }

          // The one existence check this tool can pay: the same one
          // GetPackageTree pays, over the same object, through the
          // already-migrated getPackage().readMetadata().
          const packageRead = await atStep('read package metadata', () =>
            readPackageMetadata(
              client,
              { packageName: parent_name.toUpperCase() },
              'active',
            ),
          )();

          if (!packageRead.ok) {
            // The package's own refusal, named — not a sentence this
            // handler composed about a call it did not make.
            return packageRead;
          }

          // The package exists; the blank body was the genuinely-empty
          // answer, not the not-found one.
          return succeededRead({ level: EMPTY_LEVEL });
        },
      );
    },
    shown,
  );
}
