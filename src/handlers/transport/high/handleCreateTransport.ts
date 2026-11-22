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
  transportTree,
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
import type { HandlerContext } from '../../../lib/handlers/interfaces';
import { detailOf } from '../../../lib/strategies/detail';
import { project } from '../../../lib/strategies/projections';
import { verbatim } from '../../../lib/strategies/reading';
import { resultsFor } from '../../../lib/strategies/resultSets';
import { atStep, withStep } from '../../../lib/strategies/step';
import { failed, succeeded } from '../../../lib/strategies/stepResponse';
import { return_error } from '../../../lib/utils';

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
    'Creates a transport request and gives the task SAP creates with it the type task_type (default S, Development/Correction). Response: JSON with transport_number, task_number and task_type.',
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

  const terseCreatedTransport = (created: ICreatedTransport) => {
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

  return answer(
    { tool: 'CreateTransport', detail },
    async () => {
      const request = createAdtClient(connection, logger).getRequest({
        ...resultsFor(transportDocuments),
        created: createdReading,
        objects: firstTaskOf,
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
      const number = created.getResult().value.created().transportNumber;
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
      const first = read.getResult().value;
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
    (reading) =>
      project(detail, (_value: typeof reading.value) =>
        terseCreatedTransport(reading.created()),
      )(reading),
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
 * `created` read as the table reads it (`verbatim`: the body is the value),
 * with the created request beside it: adt-strategies' `transportCreated` over
 * the same answer, asked only by the terse projection — the body is parsed
 * once it is needed, as it was, and `full` and `raw` read the body alone.
 */
function createdReading(answer: IAdtWireResponse) {
  return {
    ...verbatim(answer),
    created: (): ICreatedTransport => transportCreated(answer),
  };
}

/**
 * The task SAP created with the request, read back: the first task of the
 * request document as adt-strategies reads it (`transportTree`, which finds
 * each `tm:request` and its `tm:task`s, whatever their depth); `undefined`
 * when the request holds none. `transportObjectEntries` cannot answer it: it
 * reads object entries, and a new request's task holds none. A document with
 * no `tm:root` throws, as the read it replaced did.
 */
function firstTaskOf(answer: IAdtWireResponse): string | undefined {
  const number =
    transportTree(answer).requests[0]?.tasks[0]?.attributes['tm:number'];
  return number === undefined || number === '' ? undefined : number;
}
