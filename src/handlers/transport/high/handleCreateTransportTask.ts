import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { ASSEMBLED_DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
 * A task CTS creates when an object is first recorded on a request gets its
 * type there. The task created with the request does not: SAP's
 * `CL_CTS_ADT_RES_OBJ_RECORD` inserts it with `wi_trfunction = 'X'`,
 * Unclassified (read on both systems, 2026-11-16), and `CreateTransport`
 * types it. A task created by hand, through `newtask`, stays `Unclassified`, and on premise, 2026-09-25, `addobject`
 * onto one was refused — `400 SCTS_ADT_MSG 009` / TK127, *"Changes to
 * objects are only allowed in correction/repair"* — and the same call
 * answered 200 once the task had been given type `S` by `changetasktype`.
 * Typing it is the consumer's job, not adt-clients': so this tool types the
 * task itself, `S` unless asked otherwise; `X` leaves it as created.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  transportCreated,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  answer,
  type FailureEntry,
  failureEntry,
  isCredentialPayload,
  type McpResult,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { TASK_CREATED } from '../../../lib/description/sessions';
import {
  type DetailTable,
  type LevelReading,
  readingAt,
  wireAnswer,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
import {
  parseStructure,
  rawOf,
  statusOnly,
} from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep, withStep } from '../../../lib/strategies/step';
import { failed, succeeded } from '../../../lib/strategies/stepResponse';
import { return_error } from '../../../lib/utils';
import type { XmlNode } from '../../../lib/xml/node';

/** S — Development/Correction, R — Repair, X — Unclassified, as created. */
const TASK_TYPES = ['S', 'R', 'X'] as const;
type TaskType = (typeof TASK_TYPES)[number];

/** What typing the task came to: the type it carries now, and the refusal when there was one. */
interface TypedTask {
  type: TaskType;
  error?: FailureEntry;
}

export const TOOL_DEFINITION = {
  name: 'CreateTransportTask',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      purpose: purpose(
        'Creates a task of the type asked under an existing transport, owned by the SAP user named.',
      ),
      result: TASK_CREATED,
    }),
  ),
  inputSchema: createArguments('CreateTransportTask', {
    transport_number: z
      .string()
      .describe(
        'The REQUEST to create the task under — never another task. The number that comes back is the task, and that is what AddTransportObject, RemoveTransportObject and ReadTransportObjects address afterwards.',
      ),
    target_user: z
      .string()
      .describe(
        'The user the task belongs to: an SAP user id (sent in upper case), e.g. DEVELOPER. Required — the server will not choose one, and naming another user is how a task is made for somebody else.',
      ),
    task_type: z
      .enum(TASK_TYPES)
      .default('S')
      .optional()
      .describe(
        'S — Development/Correction (default), R — Repair of an object this system does not own, X — leave it Unclassified, as the server creates it. An Unclassified task refuses AddTransportObject on premise (TK127).',
      ),
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type CreateTransportTaskArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The task number, as adt-strategies reads the create's answer
 * (`transportCreated`: the root's own number since 0.28.0, a `tm:request`
 * beside it the parent); `''` when the answer names none — the answer then
 * says no task number came back.
 */
function taskNumberOf(answer: IAdtWireResponse): string {
  try {
    return transportCreated(answer).transportNumber;
  } catch {
    return '';
  }
}

/**
 * What a task create's reading holds at every level: the task number (the
 * type change after the create is sent to it) and the level's answer, a pure
 * function of the type the change settles.
 */
interface CreatedTask<A> {
  number: string;
  answer: (typed: TypedTask) => A;
}

/** A level's reading of the create: the parse read once, the answer `shown` makes of it and the document. */
function createdTaskAt<A>(
  shown: (
    number: string,
    parsed: XmlNode | null,
    raw: string,
  ) => (typed: TypedTask) => A,
): LevelReading<CreatedTask<A>> {
  return (answer) => {
    const raw = rawOf(answer);
    const parsed = parseStructure(raw);
    const number = taskNumberOf(answer);
    return {
      value: { number, answer: shown(number, parsed, raw) },
      raw,
      status: answer.status,
    };
  };
}

/**
 * The tool's answer; at `raw` what ADT sent (`wireAnswer`): it creates the
 * task and then types it, so its raw is the array of both responses.
 */
export async function handleCreateTransportTask(
  context: HandlerContext,
  args: CreateTransportTaskArgs,
): Promise<McpResult> {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'CreateTransportTask',
        shape: 'assembled',
      },
      () => answeredCreateTransportTask(context, { ...args, detail: 'full' }),
    );
  }
  return answeredCreateTransportTask(context, args);
}

async function answeredCreateTransportTask(
  context: HandlerContext,
  args: CreateTransportTaskArgs,
): Promise<McpResult> {
  const { connection, logger } = context;

  for (const name of ['transport_number', 'target_user'] as const) {
    if (!args?.[name]) return return_error(new Error(`${name} is required`));
  }

  const taskType = args.task_type ?? 'S';
  const known: readonly string[] = TASK_TYPES;
  if (!known.includes(taskType)) {
    return return_error(
      new Error(
        `task_type must be one of ${TASK_TYPES.join(', ')} — got ${taskType}`,
      ),
    );
  }

  const detail = detailOf(args);
  // SAP stores user ids in upper case, and refuses a lower-case one as an
  // unknown user: the id is sent upper-cased.
  const targetUser = args.target_user.trim().toUpperCase();

  // What typing the task came to: the type it carries now, and the refusal
  // when there was one. The task exists either way, so a refused typing does
  // not fail the creation — it is said in the answer instead.
  let typed: TypedTask = { type: 'X' };

  const terseTask = (number: string, typed: TypedTask) => {
    return {
      success: true,
      request: args.transport_number,
      task_number: number || null,
      owner: targetUser,
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

  // What the create answers at each level, selected before the call: every
  // level reads the task number (the type change is sent to it); terse
  // answers it with the type the change settles, full the parse, raw the
  // document as it came.
  // Terse what the next call needs: the task's number and type, and why it
  // is untyped when it is; medium the task as created (the former terse).
  const terseNumbers = (number: string, settled: TypedTask) =>
    createdTaskNumbers(terseTask(number, settled));
  const taskReadings: DetailTable<CreatedTask<TaskAnswer>> = {
    terse: createdTaskAt(
      (number) => (settled) => terseNumbers(number, settled),
    ),
    medium: createdTaskAt((number) => (settled) => terseTask(number, settled)),
    full: createdTaskAt((_number, parsed, raw) => () => parsed ?? raw),
    // Never reached: raw is every response, recorded by `wireAnswer` (the
    // handler, above).
    raw: createdTaskAt((_number, _parsed, raw) => () => raw),
  };
  type TaskAnswer =
    | ReturnType<typeof terseTask>
    | ReturnType<typeof terseNumbers>
    | XmlNode
    | string;

  return answer(
    { tool: 'CreateTransportTask', detail },
    async () => {
      const request = createAdtClient(connection, logger).getRequest({
        ...resultsFor(transportDocuments),
        createdTask: readingAt(taskReadings, levelOf(args)),
        taskTypeChanged: statusOnly,
      });
      const created = await atStep('create task', () =>
        withAdtHeaders(context, 'request.createTask', (headers) =>
          request.createTask(args.transport_number, {
            headers,
            targetUser,
            analyse: analyseException,
          }),
        ),
      )();
      const number = created.ok ? created.getResult().value.value.number : '';
      if (number && taskType !== 'X') {
        const changed = await withAdtHeaders(
          context,
          'request.changeTaskType',
          (headers) =>
            request.changeTaskType(number, taskType, {
              headers,
              analyse: analyseException,
            }),
        );
        // A refusal is the method's error as it is, with its step.
        typed = changed.ok
          ? { type: taskType }
          : {
              type: 'X',
              error: failureEntry(changed.getError(), 'change task type'),
            };
        if (!changed.ok) {
          // **The refusal has to survive `detail`, and in the terse fields it
          // did not.** `project()` calls the terse projection for `terse` only:
          // at `full` it answers the parsed document and at `raw` the document
          // itself, so a task left Unclassified looked like a clean creation in
          // both — and the next `AddTransportObject` onto it is refused with
          // TK127. `answer()` attaches a `cleanup` carrier to whatever the
          // projection produced, in every mode, a raw string included (it
          // becomes `{ result, cleanup }`). That is the channel `withLock`
          // already uses for a release that failed after a write that landed:
          // the call succeeded, and something the caller must act on did not.
          const failure = changed.getError();
          // A credential failure (a `401`) is the call's failure, as it came
          // with its step — not a cleanup note beside a creation.
          if (isCredentialPayload(failureEntry(failure, 'change task type'))) {
            return failed(
              withStep(failure, 'change task type'),
              'CreateTransportTask',
            );
          }
          // A task number was read, so the creation answered a success.
          if (created.ok) {
            return succeeded(created.getResult().value, 'CreateTransportTask', {
              message: `the task was created but changetasktype to ${taskType} was refused, so it is still Unclassified and AddTransportObject onto it will be refused (TK127)`,
              failures: [failureEntry(failure, 'change task type')],
            });
          }
        }
      }
      return created;
    },
    // The answer composes the typed facts of several requests — the create,
    // and the reads and the type change after it — through the level's
    // reading of the create; it does not reshape one reading.
    (reading) => reading.value.answer(typed),
  );
}

/** What a created task answers at terse: its number and type, and why it is untyped when it is. */
export function createdTaskNumbers(answered: {
  readonly task_number: string | null;
  readonly task_type: TaskType;
  readonly task_type_error?: FailureEntry | undefined;
  readonly note?: string | undefined;
}) {
  return {
    task_number: answered.task_number,
    task_type: answered.task_type,
    ...(answered.task_type_error === undefined
      ? {}
      : { task_type_error: answered.task_type_error }),
    ...(answered.note === undefined ? {} : { note: answered.note }),
  };
}
