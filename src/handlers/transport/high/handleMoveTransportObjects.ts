/**
 * MoveTransportObjects — the transport organizer's *Move Objects*: entries
 * from one task to another (adt-clients 30.0.0, `moveObjects`).
 *
 * Addressed at the **source** task, with the **target** named in the
 * document; each entry is identified by its `position` in the source, read
 * from `ReadTransportObjects`, as for `RemoveTransportObject`.
 *
 * **What the answer is worth.** Measured on premise (BASIS 816, 2026-10-12):
 * one and two entries per call answered `200` echoing them, and both tasks
 * read back with them moved. An echo is what `removeobject` answers too, for
 * an entry that went away and for one that never existed, so it is not
 * evidence: a re-read of both tasks is, and the answer below says so.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, type Terse } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

/**
 * One entry of `objects`, as a constant of its own: the tool docs are read
 * from this file as text, and a nested `default` inside the `objects`
 * property would be reported as the default of `objects` itself.
 */
const MOVED_ENTRY = {
  type: 'object',
  properties: {
    object_name: {
      type: 'string',
      description: 'Object name.',
    },
    object_type: {
      type: 'string',
      description:
        'Object-directory type — CLAS, FUGR, TABL, DOMA — not an ADT type code like CLAS/OC.',
    },
    position: {
      type: 'string',
      description:
        "Position of the object's entry in the source task's object list.",
    },
    pgmid: {
      type: 'string',
      description: "Program id. Defaults to R3TR, a workbench object's.",
      default: 'R3TR',
    },
  },
  required: ['object_name', 'object_type', 'position'],
} as const;

export const TOOL_DEFINITION = {
  name: 'MoveTransportObjects',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Move object entries from one transport task to another. Each entry is named by its position in the source task's object list.",
  inputSchema: {
    type: 'object',
    properties: {
      transport_number: {
        type: 'string',
        description: 'Number of the transport task that holds the entries.',
      },
      target_number: {
        type: 'string',
        description: 'Number of the transport task the entries move to.',
      },
      objects: {
        type: 'array',
        minItems: 1,
        description:
          'The entries to move, at least one — each with object_name, object_type, position (in the source task) and an optional pgmid.',
        items: MOVED_ENTRY,
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transport_number', 'target_number', 'objects'],
  },
} as const;

interface MoveTransportObjectEntry {
  object_name: string;
  object_type: string;
  position: string;
  pgmid?: string;
}

interface MoveTransportObjectsArgs {
  transport_number: string;
  target_number: string;
  objects: MoveTransportObjectEntry[];
  detail?: 'terse' | 'full' | 'raw';
}

const ENTRY_FIELDS = ['object_name', 'object_type', 'position'] as const;

/** The first missing argument, in fixed words naming it; `undefined` when all are there. */
function missingArgument(args: MoveTransportObjectsArgs): string | undefined {
  for (const name of ['transport_number', 'target_number'] as const) {
    if (!args?.[name]) return `${name} is required`;
  }
  if (!Array.isArray(args.objects)) return 'objects is required';
  if (args.objects.length === 0) return 'objects must hold at least one entry';
  for (const [index, entry] of args.objects.entries()) {
    for (const field of ENTRY_FIELDS) {
      const value = (entry as Partial<MoveTransportObjectEntry> | undefined)?.[
        field
      ];
      if (typeof value !== 'string' || value === '') {
        return `objects[${index}].${field} is required`;
      }
    }
  }
  return undefined;
}

export async function handleMoveTransportObjects(
  context: HandlerContext,
  args: MoveTransportObjectsArgs,
) {
  const { connection, logger } = context;

  const missing = missingArgument(args);
  if (missing) return return_error(missing);

  const detail = detailOf(args);

  // No `success`, for the reason `RemoveTransportObject` gives: the endpoint
  // echoes what it was sent, so the answer says the document was understood,
  // not that any entry changed task. `accepted`, and the re-read of both tasks
  // that settles it.
  const terseMove: Terse<unknown> = () => ({
    accepted: true,
    transport_number: args.transport_number,
    target_number: args.target_number,
    objects: args.objects.map((entry) => ({
      object: `${entry.pgmid || 'R3TR'} ${entry.object_type} ${entry.object_name}`,
      position: entry.position,
    })),
    confirm_with: `ReadTransportObjects on ${args.transport_number} and on ${args.target_number} — this answer only echoes the entries it was sent, never that they moved.`,
  });

  return answer(
    { tool: 'MoveTransportObjects', detail },
    () =>
      withAdtHeaders(context, 'request.moveObjects', (headers) =>
        createAdtClient(connection, logger)
          .getRequest(resultsFor(transportDocuments))
          .moveObjects(
            args.transport_number,
            args.target_number,
            args.objects.map((entry) => ({
              name: entry.object_name,
              type: entry.object_type,
              position: entry.position,
              ...(entry.pgmid ? { pgmid: entry.pgmid } : {}),
            })),
            { headers, analyse: analyseException },
          ),
      ),
    project(detail, terseMove),
  );
}
