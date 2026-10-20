/**
 * `BatchEnd`: the open communication batch executed, its answer split into
 * the map (spec §5.2–5.3).
 *
 * The late-bound target is pointed at the connection `BatchEnd` took in its
 * turn — the instance's connection now, with the credential in force now —
 * and the batch connection's `execute()` sends every recorded request in
 * one envelope — the batch holds one session kind (LOCK, UNLOCK or
 * stateless, its first recorded request's; the recorder refuses any other,
 * `batch_other_kind`), and adt-clients starts a new envelope only where the
 * kind changes — awaited to its end with no timeout. Then the settled parts
 * are split by number into the map; no handler is resumed: a number's
 * handler builds its answer when the number is read (`BatchAnswers`, §6).
 * `BatchEnd` knows the count recorded, the count of requests sent and the
 * count of parts that came, and checks them: it answers `{ recorded, sent,
 * received }`, or its own error — `execute()`'s as it came, the parts not as
 * many as the requests (`batch_parts_mismatch`), an answer that cannot be
 * split (`batch_unsplit`) — and then there is no map: every number of the
 * batch, read, answers that error. Whatever happens, batch mode ends: the
 * target is cleared and the owner ends the batch (the batch connection is
 * discarded with it, so nothing recorded can be sent again). Nothing is
 * retried or repeated.
 *
 * `DebugBatchEnd` executes the open debugger batch the same way, on the
 * stop's connection its batch connection wraps (spec §7).
 *
 * A failure before `execute()` (taking the connection, the system lookup the
 * dispatch runs before the tool) never reaches here: the dispatch ends the
 * batch with `endWithFailure`, every number answering that failure.
 */

import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import type { IAbapConnection } from '@mcp-abap-adt/interfaces-adt-connection';
import { answerFailure, type McpResult, requestFailureOf } from '../answer';
import { answerRead } from '../auth/answerFailure';
import { failureOf, readOwn } from '../auth/failures';
import { batchPartsMismatchWords, ServerRefusal } from '../auth/serverRefusal';
import { withStep } from '../strategies/step';
import type {
  BatchFailure,
  BatchKind,
  InstanceBatch,
  OpenBatch,
  PartSettlement,
} from './InstanceBatch';

/**
 * What `BatchEnd` answers when it worked: how many calls were recorded, how
 * many requests were sent and how many parts came — `sent` equal to
 * `received`.
 */
export type BatchSummary = {
  recorded: number;
  sent: number;
  received: number;
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

/** Whether `part` is a part SAP answered: its inner response, 2xx or another status. */
function cameBack(part: PartSettlement, envelopeError: unknown): boolean {
  if (part.state === 'resolved') return true;
  if (part.state === 'pending') return false;
  // The envelope's own failure (every part it carried rejects with it) and
  // the "not sent" wrapper carry no part of SAP's.
  if (part.error === envelopeError) return false;
  const status = readOwn(readOwn(part.error, 'response'), 'status');
  return typeof status === 'number' && Number.isInteger(status);
}

/**
 * What `execute()`'s settlement makes of the batch: the summary, or
 * `BatchEnd`'s error — the rejection as it came when the connection under
 * the batch threw it (or nothing is known of it), `batch_unsplit` when the
 * connection answered and the answer did not split (the parts of that
 * envelope rejected with the very error `execute()` did), and
 * `batch_parts_mismatch` when the parts that came are not as many as the
 * requests sent.
 */
function split(
  open: OpenBatch,
  rejected: { error: unknown } | undefined,
): { summary: BatchSummary } | { error: unknown } {
  const parts = open.recorded.flatMap((call) => call.parts());
  const sent = parts.length;
  const received = parts.filter((part) =>
    cameBack(part, rejected?.error),
  ).length;
  if (rejected !== undefined) {
    const { error } = rejected;
    const watch = open.envelopes;
    if (watch === undefined || watch.threw(error) || watch.answered() === 0) {
      return { error };
    }
    const unsplit = parts.some(
      (part) => part.state === 'rejected' && part.error === error,
    );
    return {
      error: unsplit
        ? new ServerRefusal('batch_unsplit')
        : new ServerRefusal(
            'batch_parts_mismatch',
            batchPartsMismatchWords(received, sent),
          ),
    };
  }
  if (received !== sent) {
    return {
      error: new ServerRefusal(
        'batch_parts_mismatch',
        batchPartsMismatchWords(received, sent),
      ),
    };
  }
  return { summary: { recorded: open.recorded.length, sent, received } };
}

/**
 * `BatchEnd`'s error answered: a failure the server's reader answers (a
 * credential refusal, its own refusal, a closed instance) as the reader
 * answers it; anything else the envelope's error as it came — SAP's outer
 * response, when SAP answered the envelope, as its status and body — with
 * the step.
 */
function failureAnswer(error: unknown): McpResult {
  const read = failureOf(error);
  if (read !== undefined) return answerRead(read);
  return answerFailure(
    withStep(requestFailureOf(error, undefined) as IAdtError, EXECUTE_STEP),
  );
}

/**
 * Executes `open`, the open batch of `owner` (spec §5.2): a communication
 * batch's late-bound target points at `connection` for the whole
 * `execute()`; a debugger batch's connection wraps the stop's connection
 * itself, and `connection` is absent. Then, whatever failed, batch mode is
 * off: the split parts are the map (`owner.end`), or, on `BatchEnd`'s
 * error, there is none (`owner.fail`). No handler is resumed.
 *
 * A failure the server's reader answers — a credential refusal, the
 * server's own refusal (`batch_parts_mismatch`, `batch_unsplit`), a closed
 * instance — ends the call: it is thrown as it came, after the batch ended,
 * and the caller answers it as it answers any call (spec §5.4); the
 * dispatch hands its answer to the owner (`fail`), so every number answers
 * the same. Any other error is answered here.
 *
 * The caller holds its use of `connection` for the whole call, so a
 * replacement of the instance's connection cannot log it off under the
 * envelopes.
 */
export async function executeBatch(
  owner: InstanceBatch,
  open: OpenBatch,
  connection?: IAbapConnection,
): Promise<McpResult> {
  let rejected: { error: unknown } | undefined;
  open.target?.point(connection);
  try {
    await open.connection.execute();
  } catch (error) {
    rejected = { error };
  } finally {
    open.target?.point(undefined);
  }
  const outcome = split(open, rejected);
  if ('summary' in outcome) {
    owner.end(open);
    return batchEndAnswer(outcome.summary);
  }
  const answer = failureAnswer(outcome.error);
  owner.fail(answer, open);
  if (failureOf(outcome.error) !== undefined) throw outcome.error;
  return answer;
}

/**
 * `BatchEnd` (or `DebugBatchEnd`) answered an error (spec §5.2 step 2,
 * §5.3): the dispatch hands it the call's own answer and `ending`, the batch
 * the call came to end. Still open — the call failed before `execute()` —
 * batch mode ends with no map, every number answering that failure, as it
 * came; nothing is sent (the batch connection is discarded unexecuted).
 * Already ended by its failure, its numbers answer the dispatch's answer.
 * Otherwise — the batch ended with its map, was dropped, or another batch
 * is open — nothing changes.
 */
export function endWithFailure(
  owner: InstanceBatch,
  failure: BatchFailure,
  ending: OpenBatch,
): void {
  if (owner.opened() === ending) ending.target?.point(undefined);
  owner.fail(failure, ending);
}

/** `BatchEnd`'s answer: the summary, as JSON. */
export function batchEndAnswer(summary: BatchSummary): McpResult {
  return {
    isError: false,
    content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }],
  };
}
