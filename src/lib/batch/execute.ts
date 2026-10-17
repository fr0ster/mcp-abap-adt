/**
 * `BatchEnd`: the open communication batch executed (spec §5).
 *
 * The late-bound target is pointed at the connection `BatchEnd` took in its
 * turn — the instance's connection now, with the credential in force now —
 * and the batch connection's `execute()` sends every recorded request in
 * one envelope — the batch holds one session kind (LOCK, UNLOCK or
 * stateless, its first recorded request's; the recorder refuses any other,
 * `batch_other_kind`), and adt-clients starts a new envelope only where the
 * kind changes — awaited to its end with no timeout. Every recorded handler then
 * builds its answer from all its parts. Whatever happens, batch mode ends:
 * the target is cleared and the owner ends the batch with the answers (the
 * batch connection is discarded with it, so nothing recorded can be sent
 * again). Nothing is retried or repeated.
 *
 * `DebugBatchEnd` executes the open debugger batch the same way, on the
 * stop's connection its batch connection wraps (spec §7).
 *
 * A failure before `execute()` (taking the connection, the system lookup the
 * dispatch runs before the tool) never reaches here: the dispatch ends the
 * batch with `endBeforeExecute`, every recorded call answering that failure.
 */
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { type McpResult, requestThrownEntry } from '../answer';
import { failureOf } from '../auth/failures';
import { ServerRefusal } from '../auth/serverRefusal';
import type {
  BatchAnswer,
  BatchKind,
  InstanceBatch,
  OpenBatch,
} from './InstanceBatch';

/**
 * What `BatchEnd` answers: how many calls were recorded, the numbers whose
 * answer is an error, in number order, and — when `execute()` rejected with
 * a failure that is not a credential refusal — what came for it: the
 * method's error as it is plus its step (SAP's outer response, when SAP
 * answered the envelope, as its status and body).
 */
export type BatchSummary = {
  recorded: number;
  failed: number[];
  came?: unknown;
};

/** The step a failure of the envelopes is named at. */
export const EXECUTE_STEP = 'execute';

/** The open batch of `kind`, or why there is none to end. */
function openState(
  owner: InstanceBatch | undefined,
  kind: BatchKind,
): OpenBatch | ServerRefusal {
  if (owner === undefined) return new ServerRefusal('batch_mode_unavailable');
  const mode = owner.mode();
  if (mode !== 'off' && mode !== kind) {
    return new ServerRefusal('batch_mode_other');
  }
  const open = owner.opened();
  if (mode !== kind || open === undefined) {
    return new ServerRefusal('batch_mode_off');
  }
  return open;
}

/**
 * Why an end of the `kind` batch now has nothing to end: no owner
 * (`batch_mode_unavailable`), the other batch open (`batch_mode_other`), no
 * batch open (`batch_mode_off`); `undefined` while a batch of `kind` is open.
 * The dispatch asks it before taking a connection (spec §5.2 step 1).
 */
export function batchRefusal(
  owner: InstanceBatch | undefined,
  kind: BatchKind,
): ServerRefusal | undefined {
  const state = openState(owner, kind);
  return state instanceof ServerRefusal ? state : undefined;
}

/** `batchRefusal` of the communication batch. */
export function communicationBatchRefusal(
  owner: InstanceBatch | undefined,
): ServerRefusal | undefined {
  return batchRefusal(owner, 'communication');
}

/** The open batch of `kind`; throws `batchRefusal`'s refusal when there is none. */
export function openBatchOf(
  owner: InstanceBatch | undefined,
  kind: BatchKind,
): OpenBatch {
  const state = openState(owner, kind);
  if (state instanceof ServerRefusal) throw state;
  return state;
}

/** The open communication batch; throws `communicationBatchRefusal`'s refusal when there is none. */
export function openCommunication(owner: InstanceBatch | undefined): OpenBatch {
  return openBatchOf(owner, 'communication');
}

/**
 * Executes `open`, the open batch of `owner` (spec §5.2): a communication
 * batch's late-bound target points at `connection` for the whole
 * `execute()`; a debugger batch's connection wraps the stop's connection
 * itself, and `connection` is absent. Every recorded handler's answer is
 * awaited (none rejects); then, whatever failed, batch mode is off and the
 * answers by number replace the kept ones.
 *
 * A credential refusal (or another failure the server's reader answers —
 * its own refusal, a closed instance) that `execute()` rejected with ends
 * the call: it is thrown as it came, after the batch ended, and the caller
 * answers it as it answers any call (spec §5.4). Any other rejection is
 * `came` beside the summary.
 *
 * The caller holds its use of `connection` for the whole call, so a
 * replacement of the instance's connection cannot log it off under the
 * envelopes.
 */
export async function executeBatch(
  owner: InstanceBatch,
  open: OpenBatch,
  connection?: IAbapConnection,
): Promise<BatchSummary> {
  const answers = new Map<number, BatchAnswer>();
  let rejected = false;
  let error: unknown;
  open.target?.point(connection);
  try {
    try {
      await open.connection.execute();
    } catch (thrown) {
      rejected = true;
      error = thrown;
    }
    // Every part is settled; each handler only reads its settled parts now.
    for (const answer of await Promise.all(
      open.recorded.map((call) => call.answer),
    )) {
      answers.set(answer.number, answer);
    }
  } finally {
    open.target?.point(undefined);
    owner.end(answers, open);
  }
  if (rejected && failureOf(error) !== undefined) throw error;
  const numbers = [...answers.keys()].sort((a, b) => a - b);
  return {
    recorded: numbers.length,
    failed: numbers.filter((n) => answers.get(n)?.isError === true),
    ...(rejected
      ? { came: requestThrownEntry(error, undefined, EXECUTE_STEP) }
      : {}),
  };
}

/**
 * `BatchEnd` (or `DebugBatchEnd`, `kind` `debugger`) failed before
 * `execute()` (spec §5.2 step 2): the dispatch's catch hands it the call's
 * own answer. With a batch of `kind` open,
 * batch mode ends and every recorded call's answer is that failure, as it
 * came; nothing is sent (the batch connection is discarded unexecuted). With
 * none open — the call failed for another reason, or the batch already ended
 * — nothing changes.
 */
export function endBeforeExecute(
  owner: InstanceBatch,
  failure: McpResult,
  kind: BatchKind = 'communication',
): void {
  if (owner.mode() !== kind) return;
  const open = owner.opened();
  if (open === undefined) return;
  const answers = new Map<number, BatchAnswer>();
  for (const { number } of open.recorded) {
    answers.set(number, {
      number,
      content: failure.content,
      ...(failure.isError ? { isError: true as const } : {}),
      // Nothing was sent: no part came.
      ...(owner.keepRawParts ? { raw: [] } : {}),
    });
  }
  open.target?.point(undefined);
  owner.end(answers, open);
}

/** `BatchEnd`'s answer: the summary, as JSON. */
export function batchEndAnswer(summary: BatchSummary): McpResult {
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
  };
}
