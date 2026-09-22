/**
 * CreateTransportTask — a task of your own under a shared request.
 *
 * The task is itself a request resource at the same endpoint shape: it reads,
 * writes and releases like one, and `RemoveTransportObject` addresses it
 * directly — which matters, because a request's objects live on its tasks.
 *
 * **`target_user` is required, and that is measured.** The member shipped with
 * it optional, on the reasoning that the server would decide whose task it is.
 * It does not: sent without `tm:targetuser` against an on-premise system on
 * 2026-09-21, the owner resolved to an empty name and the call was refused —
 * `400 SCTS_ADT_MSG 009`, *"User  does not exist in the system (or locked)"*,
 * two spaces where the name should be. The same call carrying it answered a
 * task number.
 *
 * Nothing below the caller can fill it in: the connection does not say who is
 * authenticated, and finding out costs a second request, which a member of
 * that size does not spend. So the caller names the user — and naming one is
 * also how a task is made for somebody else.
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
  name: 'CreateTransportTask',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Create a task under an existing transport request, owned by a named user. The task is itself a request resource — it reads, writes and releases like one — and is what RemoveTransportObject addresses, since a request's objects live on its tasks. `target_user` is required: without it the server resolves an empty owner and refuses with SCTS_ADT_MSG 009.",
  inputSchema: {
    type: 'object',
    properties: {
      transport_number: {
        type: 'string',
        description:
          'The REQUEST to create the task under, e.g. E19K905941 — never another task. The number that comes back is the task, and that is what AddTransportObject, RemoveTransportObject and ReadTransportObjects address afterwards.',
      },
      target_user: {
        type: 'string',
        description:
          'SAP user the task belongs to, e.g. DEVELOPER. Required — the server will not choose one, and naming another user is how a task is made for somebody else.',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transport_number', 'target_user'],
  },
} as const;

interface CreateTransportTaskArgs {
  transport_number: string;
  target_user: string;
  detail?: 'terse' | 'full' | 'raw';
}

export async function handleCreateTransportTask(
  context: HandlerContext,
  args: CreateTransportTaskArgs,
) {
  const { connection, logger } = context;

  for (const name of ['transport_number', 'target_user'] as const) {
    if (!args?.[name]) return return_error(new Error(`${name} is required`));
  }

  const detail = detailOf(args);

  const terseTask: Terse<unknown> = (value) => {
    // The task number arrives the way a created request's does — on the root
    // rather than on a `tm:request` child, which is the shape
    // `parseCreatedTransport` learned in adt-clients 20.0.0. The shipped
    // reading is stamped here, so read it out of the parsed document.
    const root =
      (value as Record<string, any>)?.['tm:root'] ??
      (value as Record<string, any>);
    const attributes = (root as Record<string, any>)?.['@'] ?? {};
    const number = String(attributes['tm:number'] ?? '');
    return {
      success: true,
      request: args.transport_number,
      task_number: number || null,
      owner: args.target_user,
      ...(number
        ? {}
        : {
            note: 'the answer carried no task number — read the request to see whether a task was created',
          }),
    };
  };

  return answer(
    { tool: 'CreateTransportTask', detail },
    () =>
      createAdtClient(connection, logger)
        .getRequest(resultsFor(transportDocuments))
        .createTask(args.transport_number, {
          targetUser: args.target_user,
          analyse: analyseException,
        }),
    project(detail, terseTask),
  );
}
