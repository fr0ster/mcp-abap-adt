/**
 * RemoveTransportObject — detach one object's entry from a request or task.
 *
 * **Why this exists.** Deleting an ABAP object does not free its name: the CTS
 * object-directory entry stays on the request that carried it, deliberately,
 * so that transporting the request deletes the object in the target system
 * too. Until the entry is detached, creating the same name again is refused
 * with `CTS_WBO_API 019` — **even passing that same request as the transport**
 * — and the ways out were releasing the whole request, shipping everything
 * else in it, or SE09 by hand. That is fr0ster/mcp-abap-adt#221.
 *
 * **Two things this tool cannot soften, both measured on an on-premise system
 * on 2026-09-21.**
 *
 * `position` is required and is what makes the call do anything: twenty-two
 * objects asked for by `pgmid`/`type`/`name` alone each answered `200` with
 * the usual echo document, and a re-read found all twenty-two still on the
 * task. `ReadTransportObjects` is where the number comes from.
 *
 * And a `200` here is not evidence. The endpoint echoes whatever it was asked
 * about — for an entry that exists and for one that never did — so the answer
 * says the document was understood, not that anything went away.
 * `ReadTransportActionLog`, or a re-read of the objects, is what settles it,
 * and the answer below says so rather than reporting a success nobody
 * measured.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import { analyseException } from '@mcp-abap-adt/adt-strategies';
import { answer } from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { DETAIL_PROPERTY, detailOf } from '../../../lib/strategies/detail';
import { project, type Terse } from '../../../lib/strategies/projections';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { return_error } from '../../../lib/utils';

export const TOOL_DEFINITION = {
  name: 'RemoveTransportObject',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Detach one object's entry from a transport TASK, so its name can be used again after the object was deleted. Address the task that holds the entry, not the request above it — a request displays its tasks' entries and refuses to detach one. `position` comes from ReadTransportObjects and is required: without it the server answers 200 and removes nothing. A 200 here is not proof either; confirm with ReadTransportActionLog or by re-reading the objects.",
  inputSchema: {
    type: 'object',
    properties: {
      transport_number: {
        type: 'string',
        description:
          'The TASK number holding the entry, e.g. E19K905943. Read it from ReadTransportObjects.',
      },
      object_name: {
        type: 'string',
        description: 'Object name, e.g. ZCL_MY_CLASS.',
      },
      object_type: {
        type: 'string',
        description:
          'Object-directory type — CLAS, FUGR, TABL, DOMA — not an ADT type code like CLAS/OC.',
      },
      position: {
        type: 'string',
        description:
          "The entry's `position` as ReadTransportObjects answers it, e.g. 000025. Required: the server removes nothing without it and still answers 200.",
      },
      pgmid: {
        type: 'string',
        description: "Program id. Defaults to R3TR, a workbench object's.",
        default: 'R3TR',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transport_number', 'object_name', 'object_type', 'position'],
  },
} as const;

interface RemoveTransportObjectArgs {
  transport_number: string;
  object_name: string;
  object_type: string;
  position: string;
  pgmid?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleRemoveTransportObject(
  context: HandlerContext,
  args: RemoveTransportObjectArgs,
) {
  const { connection, logger } = context;

  for (const name of [
    'transport_number',
    'object_name',
    'object_type',
    'position',
  ] as const) {
    if (!args?.[name]) return return_error(new Error(`${name} is required`));
  }

  const detail = detailOf(args);

  // **No `success` here, and that is the point of the tool.**
  //
  // Every other write in this repository says `success: true` because its
  // answer means the write happened. This one's does not: the endpoint echoes
  // the object it was asked about whether or not an entry went away — for an
  // entry that exists and for one that never did — so `success` beside
  // `accepted` would contradict itself, and a reader who stops at the first
  // field would skip the re-read that is the only thing establishing the
  // outcome. The field a caller finds instead is `accepted`, and next to it
  // the reading that settles the question.
  const terseRemoval: Terse<unknown> = () => ({
    accepted: true,
    removed: 'unknown',
    transport_number: args.transport_number,
    object: `${args.pgmid ?? 'R3TR'} ${args.object_type} ${args.object_name}`,
    position: args.position,
    confirm_with:
      'ReadTransportActionLog, or ReadTransportObjects on the same task — this answer only says the request was understood, never that an entry went away.',
  });

  return answer(
    { tool: 'RemoveTransportObject', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .removeObject(
          args.transport_number,
          {
            name: args.object_name,
            type: args.object_type,
            position: args.position,
            ...(args.pgmid ? { pgmid: args.pgmid } : {}),
          },
          { analyse: analyseException },
        ),
    project(detail, terseRemoval),
  );
}
