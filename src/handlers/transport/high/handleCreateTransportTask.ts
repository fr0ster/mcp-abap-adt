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
 *
 * **The task is typed before it is handed back, and that is measured too.**
 * `newtask` creates every task `Unclassified`. On premise, 2026-09-25, the
 * first `addobject` onto such a task was refused —
 * `400 SCTS_ADT_MSG 009` / TK127, *"Changes to objects are only allowed in
 * correction/repair"* — and the same call answered 200 once the task had been
 * given type `S` by `changetasktype`. CTS does not type it on the first
 * object there, whatever it does on BTP. So this tool types the task itself,
 * `S` unless asked otherwise; `X` leaves it as created.
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

/** S — Development/Correction, R — Repair, X — Unclassified, as created. */
const TASK_TYPES = ['S', 'R', 'X'] as const;
type TaskType = (typeof TASK_TYPES)[number];

export const TOOL_DEFINITION = {
  name: 'CreateTransportTask',
  available_in: ['onprem', 'cloud'] as const,
  description:
    "Create a task under an existing transport request, owned by a named user, and give it a type. The task is itself a request resource — it reads, writes and releases like one — and is what AddTransportObject and RemoveTransportObject address, since a request's objects live on its tasks. `target_user` is required: without it the server resolves an empty owner and refuses with SCTS_ADT_MSG 009. The task is typed Development/Correction (S) by default, because an Unclassified task refuses AddTransportObject on premise with SCTS_ADT_MSG 009 / TK127.",
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
      task_type: {
        type: 'string',
        enum: TASK_TYPES,
        default: 'S',
        description:
          'S — Development/Correction (default), R — Repair of an object this system does not own, X — leave it Unclassified, as the server creates it. An Unclassified task refuses AddTransportObject on premise (TK127).',
      },
      ...DETAIL_PROPERTY,
    },
    required: ['transport_number', 'target_user'],
  },
} as const;

interface CreateTransportTaskArgs {
  transport_number: string;
  target_user: string;
  task_type?: TaskType;
  detail?: 'terse' | 'full' | 'raw';
}

/**
 * The task number, read out of the parsed answer. It arrives the way a created
 * request's does — on the root rather than on a `tm:request` child, which is
 * the shape `parseCreatedTransport` learned in adt-clients 20.0.0.
 */
const taskNumberOf = (value: unknown): string => {
  const root =
    (value as Record<string, any>)?.['tm:root'] ??
    (value as Record<string, any>);
  const attributes = (root as Record<string, any>)?.['@'] ?? {};
  return String(attributes['tm:number'] ?? '');
};

export async function handleCreateTransportTask(
  context: HandlerContext,
  args: CreateTransportTaskArgs,
) {
  const { connection, logger } = context;

  for (const name of ['transport_number', 'target_user'] as const) {
    if (!args?.[name]) return return_error(new Error(`${name} is required`));
  }

  const taskType = args.task_type ?? 'S';
  if (!(TASK_TYPES as readonly string[]).includes(taskType)) {
    return return_error(
      new Error(
        `task_type must be one of ${TASK_TYPES.join(', ')} — got ${taskType}`,
      ),
    );
  }

  const detail = detailOf(args);

  // What typing the task came to: the type it carries now, and the refusal
  // when there was one. The task exists either way, so a refused typing does
  // not fail the creation — it is said in the answer instead.
  let typed: { type: TaskType; error?: string } = { type: 'X' };

  const terseTask: Terse<unknown> = (value) => {
    const number = taskNumberOf(value);
    return {
      success: true,
      request: args.transport_number,
      task_number: number || null,
      owner: args.target_user,
      task_type: typed.type,
      ...(typed.error ? { task_type_error: typed.error } : {}),
      ...(number
        ? typed.type === 'X' && taskType !== 'X'
          ? {
              note: `the task was created but is still Unclassified, and AddTransportObject onto it will be refused (TK127) until it is typed ${taskType}`,
            }
          : {}
        : {
            note: 'the answer carried no task number — read the request to see whether a task was created',
          }),
    };
  };

  return answer(
    { tool: 'CreateTransportTask', detail },
    async () => {
      const request = createAdtClient(connection, logger).getRequest(
        resultsFor(transportDocuments),
      );
      const created = await request.createTask(args.transport_number, {
        targetUser: args.target_user,
        analyse: analyseException,
      });
      // A reading, as `project` receives it: the parsed document is its value.
      const number = created.ok
        ? taskNumberOf(
            (created.getResult().value as { value?: unknown } | undefined)
              ?.value,
          )
        : '';
      if (number && taskType !== 'X') {
        const changed = await request.changeTaskType(number, taskType, {
          analyse: analyseException,
        });
        typed = changed.ok
          ? { type: taskType }
          : { type: 'X', error: changed.getError().message };
      }
      return created;
    },
    project(detail, terseTask),
  );
}
