import * as z from 'zod';
import { createArguments } from '../../../lib/handlers/createArguments';
import { ASSEMBLED_DETAIL_SHAPE } from '../../../lib/strategies/detail';
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
  readTransportItem,
  transportCreated,
} from '@mcp-abap-adt/adt-strategies';
import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { withAdtHeaders } from '../../../lib/adtHeaders/withAdtHeaders';
import {
  answer,
  type FailureEntry,
  failureEntry,
  isCredentialFailure,
  isCredentialPayload,
  type McpResult,
} from '../../../lib/answer';
import { createAdtClient } from '../../../lib/clients';
import { purpose, toolDescription } from '../../../lib/description';
import { runParts } from '../../../lib/description/runs';
import { TRANSPORT_CREATED } from '../../../lib/description/sessions';
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
export const REQUEST_TASK_TYPES = ['S', 'R', 'X'] as const;
type TaskType = (typeof REQUEST_TASK_TYPES)[number];

/** The task SAP created with the request, and the type it carries now. */
interface TypedTask {
  number: string | null;
  /** `null`: no task was found, so no type was applied. */
  type: TaskType | null;
  error?: FailureEntry;
  /**
   * The created request could not be read back, and why: SAP refused the
   * credentials, refused otherwise, or answered what is not the request.
   */
  readBackFailed?: ReadBackFailure;
  /** The request read back, as SAP sent it, when it was read. */
  readBack?: string;
}

/** Why a created request's read-back failed. */
type ReadBackFailure = 'authentication' | 'server' | 'malformed';

/**
 * The note of a created request whose read-back failed, in fixed words with
 * the number SAP answered and the kind of failure: the request exists, and
 * this is how to read it.
 */
export function readBackFailedNote(
  number: string,
  failure: ReadBackFailure,
): string {
  return `the request ${number} was created, but reading it back failed (${failure}): read it with GetTransport, transport_number ${number}`;
}

export const TOOL_DEFINITION = {
  name: 'CreateTransport',
  available_in: ['onprem', 'cloud'] as const,
  description: toolDescription(
    runParts({
      purpose: purpose(
        'Creates a workbench or customizing transport with its description, and gives the task SAP creates with it the type asked.',
      ),
      result: TRANSPORT_CREATED,
    }),
  ),
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
    ...ASSEMBLED_DETAIL_SHAPE,
  }),
} as const;

type CreateTransportArgs = z.output<typeof TOOL_DEFINITION.inputSchema>;

/**
 * The tool's answer; at `raw` what ADT sent (`wireAnswer`): the documents
 * the call's requests answered — the create's, and the request read back,
 * so a failed read-back shows as the missing document.
 */
export async function handleCreateTransport(
  context: HandlerContext,
  args: CreateTransportArgs,
): Promise<McpResult> {
  if (levelOf(args) === 'raw') {
    return wireAnswer(
      {
        connection: context.connection,
        tool: 'CreateTransport',
        shape: 'assembled',
        // A failed read-back, the response SAP gave (if any) in the array
        // and the same note full explains beside it.
        explainedBy: 'read_back',
      },
      () => answeredCreateTransport(context, { ...args, detail: 'full' }),
    );
  }
  return answeredCreateTransport(context, args);
}

async function answeredCreateTransport(
  context: HandlerContext,
  args: CreateTransportArgs,
): Promise<McpResult> {
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
      ...(task.readBackFailed !== undefined
        ? {
            note: readBackFailedNote(
              created.transportNumber,
              task.readBackFailed,
            ),
          }
        : task.number === null
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
  const terseNumbers = (created: ICreatedTransport, settled: TypedTask) =>
    createdTransportNumbers(terseCreatedTransport(created, settled));
  const createdReadings: DetailTable<CreatedAnswer<Terse>> = {
    terse: createdAt((created) => (settled) => terseNumbers(created, settled)),
    medium: createdAt(
      (created) => (settled) => terseCreatedTransport(created, settled),
    ),
    // full the parse of the create's answer, a failed read-back's note
    // beside it.
    full: createdAt((created, raw) => (settled) => {
      const parsed = parseStructure(raw) ?? raw;
      return settled.readBackFailed === undefined
        ? parsed
        : {
            create: parsed,
            read_back: readBackFailedNote(
              created.transportNumber,
              settled.readBackFailed,
            ),
          };
    }),
    // Never reached: raw is what ADT sent, recorded by `wireAnswer` (the
    // handler, above).
    raw: createdAt((created) => (settled) => terseNumbers(created, settled)),
  };
  type Terse =
    | ReturnType<typeof terseCreatedTransport>
    | ReturnType<typeof terseNumbers>
    | XmlNode
    | string
    | { create: XmlNode | string; read_back: string };

  // The request read back as adt-strategies reads it by its number
  // (`readTransportItem`), the reading made for that number.
  const readBack = (number: string) =>
    atStep('read request task', () =>
      createAdtClient(connection, logger)
        .getRequest({
          ...resultsFor(transportDocuments),
          objects: firstTaskOf(number),
        })
        .readObjects(number, { analyse: analyseException }),
    )();

  return answer(
    { tool: 'CreateTransport', detail },
    async () => {
      const request = createAdtClient(connection, logger).getRequest({
        ...resultsFor(transportDocuments),
        created: readingAt(createdReadings, levelOf(args)),
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
      let read: Awaited<ReturnType<typeof readBack>>;
      try {
        read = await readBack(number);
      } catch (thrown) {
        // A read-back the connection refused, or that threw on the way: the
        // request exists all the same.
        task = {
          number: null,
          type: null,
          readBackFailed: isCredentialFailure(thrown)
            ? 'authentication'
            : 'server',
        };
        return created;
      }
      // Once SAP has created the request its number is never lost: a
      // read-back that fails — its credentials refused, refused otherwise,
      // or not the request — is the created request, with a note naming the
      // failure and how to read it again.
      if (!read.ok) {
        const refusal = failureEntry(read.getError(), 'read request task');
        task = {
          number: null,
          type: null,
          readBackFailed: isCredentialPayload(refusal)
            ? 'authentication'
            : 'server',
        };
        return created;
      }
      const taskRead = read.getResult().value;
      if (taskRead.kind === 'threw') {
        task = { number: null, type: null, readBackFailed: 'malformed' };
        return created;
      }
      const first = taskRead.first;
      const readBackDocument = taskRead.document;
      if (first === undefined) {
        task = { number: null, type: null, readBack: readBackDocument };
        return created;
      }
      task = { number: first, type: 'X', readBack: readBackDocument };
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
        task = {
          number: taskNumber,
          type: taskType,
          readBack: readBackDocument,
        };
        return created;
      }
      task = {
        number: taskNumber,
        type: 'X',
        readBack: readBackDocument,
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
 * The request read back, as adt-strategies reads it by its number
 * (`readTransportItem`, 0.28.0): its first task's number, `undefined` when it
 * holds none; or what the reading threw for an answer that is not the
 * request asked for, in fixed words with nothing of the document. The throw
 * is carried, not thrown, so it leaves the call after the read's own
 * verdict, where the read it replaced threw it.
 */
type TaskRead =
  | {
      readonly kind: 'read';
      readonly first: string | undefined;
      /** The read-back's document, as SAP sent it. */
      readonly document: string;
    }
  | { readonly kind: 'threw'; readonly thrown: unknown };

function firstTaskOf(number: string) {
  return (answer: IAdtWireResponse): TaskRead => {
    try {
      const document = rawOf(answer);
      const item = readTransportItem(document, number);
      const first =
        item.kind === 'request' ? item.tasks[0]?.header.number : undefined;
      return {
        kind: 'read',
        first: first !== undefined && first !== '' ? first : undefined,
        document,
      };
    } catch (thrown) {
      return { kind: 'threw', thrown };
    }
  };
}

/** What a created transport answers at terse: its number, its task's, and why the task is untyped when it is. */
export function createdTransportNumbers(answered: {
  readonly transport_number: string;
  readonly task_number: string | null;
  readonly task_type_error?: FailureEntry | undefined;
  readonly note?: string | undefined;
}) {
  return {
    transport_number: answered.transport_number,
    task_number: answered.task_number,
    ...(answered.task_type_error === undefined
      ? {}
      : { task_type_error: answered.task_type_error }),
    ...(answered.note === undefined ? {} : { note: answered.note }),
  };
}
