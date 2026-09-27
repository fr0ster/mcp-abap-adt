/**
 * AddTransportObject — attach an existing object to a request or task.
 *
 * The other direction from `RemoveTransportObject`, and the way back from it:
 * an object whose entry was detached sits in no request at all, so nothing
 * transports it until one is attached again.
 *
 * **A refusal here is the server's verdict, not a state to check for first.**
 * Measured on an on-premise system, 2026-09-21: an object held by an unrelated
 * task is refused with `SCTS_ADT_MSG 009` and a longtext naming the holder —
 * *"There are no links to this request/task."* That is a third lock flavour,
 * distinct from the edit lock and from the request-versus-task one, and it is
 * read from the answer rather than guessed at beforehand.
 *
 * No `position`: an entry that does not exist yet has none. That asymmetry
 * with the removal is the wire's, not this tool's.
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
  name: 'AddTransportObject',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Attach an existing object to a transport task, so it travels with that request. The way back from RemoveTransportObject, which leaves the object in no request at all. Refused when another task holds the object, with SCTS_ADT_MSG 009 naming the holder — that refusal is the server's answer, read it rather than pre-checking. A 200 says the request was understood; confirm with ReadTransportObjects.",
  inputSchema: {
    type: 'object',
    properties: {
      transport_number: {
        type: 'string',
        description:
          'The TASK to attach the object to, e.g. E19K905943 — the one call where a task number is the point of the call rather than an afterthought. An object is created on a REQUEST and moved onto a task here; a request number attaches nothing, because a request holds objects only through its tasks.',
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
      pgmid: {
        type: 'string',
        description: "Program id. Defaults to R3TR, a workbench object's.",
        default: 'R3TR',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transport_number', 'object_name', 'object_type'],
  },
} as const;

interface AddTransportObjectArgs {
  transport_number: string;
  object_name: string;
  object_type: string;
  pgmid?: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleAddTransportObject(
  context: HandlerContext,
  args: AddTransportObjectArgs,
) {
  const { connection, logger } = context;

  for (const name of [
    'transport_number',
    'object_name',
    'object_type',
  ] as const) {
    if (!args?.[name]) return return_error(new Error(`${name} is required`));
  }

  const detail = detailOf(args);

  // No `success`, for the reason `RemoveTransportObject` gives at length: the
  // answer is an echo of the request, not a report of what happened, and a
  // reader who stops at `success` would skip the re-read that establishes it.
  const terseAddition: Terse<unknown> = () => ({
    accepted: true,
    added: 'unknown',
    transport_number: args.transport_number,
    object: `${args.pgmid ?? 'R3TR'} ${args.object_type} ${args.object_name}`,
    confirm_with:
      'ReadTransportObjects on the same task — this answer only says the request was understood, never that the object was attached.',
  });

  return answer(
    { tool: 'AddTransportObject', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .addObject(
          args.transport_number,
          {
            name: args.object_name,
            type: args.object_type,
            ...(args.pgmid ? { pgmid: args.pgmid } : {}),
          },
          { analyse: analyseException },
        ),
    project(detail, terseAddition),
  );
}
