import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { DETAIL_SHAPE } from '../../../lib/strategies/detail';
/**
 * CreateTransport Handler - Create ABAP Transport Request
 *
 * Uses AdtClient.getRequest().create from @mcp-abap-adt/adt-clients 19.
 *
 * **`created` is NOT kept as shipped — `resultsFor(transportDocuments)`
 * plain, then the number is parsed out here.** Same reasoning as
 * `CreateTransportLow`: `transportDocuments.created` (the shipped
 * `parseCreatedTransport`) reads the body, which `verbatim` (the table's
 * default for the slot name `created`) already carries whole, as a string,
 * in `AdtReading.value`. Parsing the number out of that value in the
 * projection is what keeps `resultsFor`'s two-exception keep-list at two.
 *
 * No corpus fixture for `/cts/transportrequests` POST exists — the document
 * below is hand-built from the shipped `parseCreatedTransport` and
 * `create.js`'s own XML, not proven against a captured response.
 */

import { transportDocuments } from '@mcp-abap-adt/adt-clients';
import {
  analyseException,
  type ICreatedTransport,
  transportCreated,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  answer,
  type FailureEntry,
  failureEntry,
  isCredentialPayload,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import {
  type DetailTable,
  type LevelReading,
  readingAt,
} from '../../../lib/detail';
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf, levelOf } from '../../../lib/strategies/detail';
import { rawOf, statusOnly } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep, withStep } from '../../../lib/strategies/step';
import { failed, succeeded } from '../../../lib/strategies/stepResponse';
import { return_error } from '../../../lib/utils';
import { parseTransportXml } from '../readonly/handleGetTransport';

/** S — Development/Correction, R — Repair, X — Unclassified, as created. */
export const REQUEST_TASK_TYPES = ['S', 'R', 'X'] as const;
type TaskType = (typeof REQUEST_TASK_TYPES)[number];

/** The task SAP created with the request, and the type it carries now. */
interface TypedTask {
  number: string | null;
  /** `null`: no task was found, so no type was applied. */
  type: TaskType | null;
  error?: FailureEntry;
}

export const TOOL_DEFINITION = {
  name: 'CreateTransport',
  available_in: ['onprem', 'cloud'] as const,
  description:
    'Creates a transport request and gives the task SAP creates with it the type task_type (default S, Development/Correction). Response: JSON with transport_number and task_number (and task_type_error or a note when the task is left untyped); with detail medium, the request as created too.',
  inputSchema: createArguments('CreateTransport', {
    transport_type: z
      .enum(['workbench', 'customizing'])
      .default('workbench')
      .optional()
      .describe(
        "Transport type: 'workbench' (cross-client) or 'customizing' (client-specific)",
      ),
    description: z
      .string()
      .describe('Transport request description (mandatory)'),
    target_system: z
      .string()
      .optional()
      .describe(
        "Target system for transport (optional, e.g., 'PRD', 'QAS'). If not provided or empty, uses 'LOCAL'",
      ),
    owner: z
      .string()
      .optional()
      .describe('Transport owner (optional, defaults to current user)'),
    task_type: z
      .enum(REQUEST_TASK_TYPES)
      .default('S')
      .optional()
      .describe(
        "The type given to the request's task: S — Development/Correction (default), R — Repair, X — Unclassified, as SAP creates it.",
      ),
    ...DETAIL_SHAPE,
  }),
} as const;

type CreateTransportArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

export async function handleCreateTransport(
  context: HandlerContext,
  args: CreateTransportArgs,
) {
  const { connection, logger } = context;

  if (!args?.description) {
    return return_error(new Error('description is required'));
  }

  const detail = detailOf(args);
  // SAP stores user ids in upper case: a lower-case owner is refused as an
  // unknown user (400, measured), so the id is sent upper-cased.
  const owner = args.owner?.trim().toUpperCase() || undefined;

  const taskType = args.task_type ?? 'S';
  // The request's task: SAP creates it Unclassified (`CL_CTS_ADT_RES_OBJ_RECORD`
  // inserts it with `wi_trfunction = 'X'`; measured on the cloud system,
  // 2026-11-16: sort and compress on it was refused, "Task … is unclassified
  // and cannot be edited"), so it is typed here unless X is asked. The
  // request exists either way: a refused read or typing does not fail the
  // creation, it is said in the answer.
  let task: TypedTask = { number: null, type: null };

  const terseCreatedTransport = (
    created: ICreatedTransport,
    task: TypedTask,
  ) => {
    return {
      success: true,
      transport_number: created.transportNumber,
      description: created.description ?? args.description,
      transport_type: args.transport_type || 'workbench',
      target_system: created.targetSystem ?? args.target_system ?? null,
      owner: created.owner ?? owner ?? null,
      task_number: task.number,
      task_type: task.type,
      ...(task.error ? { task_type_error: task.error } : {}),
      ...(task.number === null
        ? {
            note: 'the request exists, but its read showed no task, so no task type was applied',
          }
        : {}),
      message: `Transport request ${created.transportNumber} created successfully.`,
    };
  };

  // What the create answers at each level, selected before the call: every
  // level reads the created request (its number is the next request's
  // address); terse answers it with the task the following requests settle,
  // the others the document as it came.
  // Terse what the next call needs: the request's and its task's numbers,
  // and why the task is untyped when it is; medium the request as created
  // (the former terse).
  const terseNumbers = (created: ICreatedTransport, settled: TypedTask) => {
    const answered = terseCreatedTransport(created, settled);
    return {
      transport_number: answered.transport_number,
      task_number: answered.task_number,
      ...(answered.task_type_error === undefined
        ? {}
        : { task_type_error: answered.task_type_error }),
      ...(answered.note === undefined ? {} : { note: answered.note }),
    };
  };
  const createdReadings: DetailTable<CreatedAnswer<Terse>> = {
    terse: createdAt((created) => (settled) => terseNumbers(created, settled)),
    medium: createdAt(
      (created) => (settled) => terseCreatedTransport(created, settled),
    ),
    full: createdAt((_created, raw) => () => raw),
    raw: createdAt((_created, raw) => () => raw),
  };
  type Terse =
    | ReturnType<typeof terseCreatedTransport>
    | ReturnType<typeof terseNumbers>
    | string;

  return answer(
    { tool: 'CreateTransport', detail },
    async () => {
      const request = createAdtClient(connection, logger).getRequest({
        ...resultsFor(transportDocuments),
        created: readingAt(createdReadings, levelOf(args)),
        objects: firstTaskOf,
        taskTypeChanged: statusOnly,
      });
      const created = await withAdtHeaders(
        context,
        'request.create',
        (headers) =>
          request.create(
            {
              description: args.description,
              transportType: args.transport_type || 'workbench',
              targetSystem: args.target_system,
              owner,
            },
            { headers, analyse: analyseException },
          ),
      );
      if (!created.ok) return created;
      const number = created.getResult().value.value.created.transportNumber;
      const read = await atStep('read request task', () =>
        request.readObjects(number, { analyse: analyseException }),
      )();
      if (!read.ok) {
        return refusedAfterCreate(
          created.getResult().value,
          read.getError(),
          'read request task',
        );
      }
      const taskRead = read.getResult().value;
      if (taskRead.kind === 'threw') throw taskRead.thrown;
      const first = taskRead.first;
      if (first === undefined) {
        task = { number: null, type: null };
        return created;
      }
      task = { number: first, type: 'X' };
      if (taskType === 'X') return created;
      const taskNumber = first;
      const changed = await withAdtHeaders(
        context,
        'request.changeTaskType',
        (headers) =>
          request.changeTaskType(taskNumber, taskType, {
            headers,
            analyse: analyseException,
          }),
      );
      if (changed.ok) {
        task = { number: taskNumber, type: taskType };
        return created;
      }
      task = {
        number: taskNumber,
        type: 'X',
        error: failureEntry(changed.getError(), 'change task type'),
      };
      return refusedAfterCreate(
        created.getResult().value,
        changed.getError(),
        'change task type',
      );
    },
    // The answer composes the typed facts of several requests — the create,
    // and the reads and the type change after it — through the level's
    // reading of the create; it does not reshape one reading.
    (reading) => reading.value.answer(task),
  );
}

/**
 * A step after the create refused: SAP's answer as it came, beside the
 * created request — a credential refusal is the call's failure.
 */
function refusedAfterCreate<T>(
  value: T,
  error: Parameters<typeof failureEntry>[0],
  step: string,
) {
  const entry = failureEntry(error, step);
  if (isCredentialPayload(entry)) {
    return failed(withStep(error, step), 'CreateTransport');
  }
  return succeeded(value, 'CreateTransport', {
    message: `the request was created, but ${step} was refused; its task is still Unclassified`,
    failures: [entry],
  });
}

/**
 * What a create's reading holds at every level: the created request, as
 * adt-strategies reads the answer (`transportCreated`), and the level's
 * answer — a pure function of the task the requests after the create settle.
 */
interface CreatedAnswer<A> {
  created: ICreatedTransport;
  answer: (task: TypedTask) => A;
}

/** A level's reading of the create: the request read, and the answer `shown` makes of it and the document. */
function createdAt<A>(
  shown: (created: ICreatedTransport, raw: string) => (task: TypedTask) => A,
): LevelReading<CreatedAnswer<A>> {
  return (answer) => {
    const raw = rawOf(answer);
    const created = transportCreated(answer);
    return {
      value: { created, answer: shown(created, raw) },
      raw,
      status: answer.status,
    };
  };
}

/**
 * The request read back, as the server reads it (`parseTransportXml`, the
 * tasks of the root's `tm:request`): its first task's number, `undefined`
 * when it holds none; or what the read threw for a document with no
 * `tm:root` — a bare `<tm:root/>` included — in fixed words, with nothing of
 * the document in them. The throw is carried, not thrown, so it leaves the
 * call where the read it replaced threw it, after the read's own verdict.
 * adt-strategies' `transportObjectEntries` reads object entries, which a new
 * request's task does not hold, and `transportTree` answers a bare root as no
 * task and puts the document into its error.
 */
type TaskRead =
  | { readonly kind: 'read'; readonly first: string | undefined }
  | { readonly kind: 'threw'; readonly thrown: unknown };

function firstTaskOf(answer: IAdtWireResponse): TaskRead {
  try {
    const first = parseTransportXml(rawOf(answer), false, true).tasks?.[0]
      ?.number;
    return {
      kind: 'read',
      first: typeof first === 'string' && first !== '' ? first : undefined,
    };
  } catch (thrown) {
    return { kind: 'threw', thrown };
  }
}
