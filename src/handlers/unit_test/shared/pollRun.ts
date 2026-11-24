import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { AdtReading } from '../../../lib/strategies/reading';
import { failedWith } from '../../../lib/strategies/sequence';
import { atStep, withStep } from '../../../lib/strategies/step';
import { succeeded } from '../../../lib/strategies/stepResponse';
import {
  childAt,
  type XmlList,
  type XmlNode,
  type XmlRead,
} from '../../../lib/xml/tree';

/**
 * Reconstructing what the v18 convenience read did.
 *
 * `AdtUnitTest`/`AdtCdsUnitTest`'s old `.read({runId})` — the member every
 * Get* handler in this family called before the migration — is gone in v19.
 * It did not just disappear: per the clients repository's own history, it
 * long-polled the status endpoint and then fetched the result best-effort,
 * swallowing a failed result fetch so an unavailable result left that field
 * empty while the status still reached the caller. That behaviour has to be
 * rebuilt here, not replaced with "fetch both and hope": a naive
 * `pair(getStatus, getResult)` treats any 200 as success, turning an empty
 * result body into a null result under `success: true`, and on a non-2xx
 * throws away the status the first call already fetched.
 *
 * `<aunit:progress status="..."/>` is the run's own verdict on itself,
 * proved against two captured fixtures — `unittest-run-passing--02-runs-*`
 * and `refusal-unittest-run-failing--02-runs-*` — both answering
 * `status="FINISHED"` regardless of whether the tests inside passed (a test
 * FAILURE is not an ADT-level refusal; it is `FINISHED` with `alerts` in the
 * result document). Only that attribute decides whether this fetches the
 * result.
 */

/**
 * The statuses an ABAP Unit run's `aunit:progress` answers, and what each
 * means here. Code (cloud, 2026-11-20): `CL_AUL_RUN_RESULT->get_status`
 * answers `FINISHED` for a run with a start and an end time, `RUNNING` for
 * one with a start time alone, and `NOT_STARTED` otherwise. Measured (on
 * premise and on the cloud, 2026-11-05; the cloud again 2026-11-20):
 * - `RUNNING`: the run is in progress: read again by long polling;
 * - `FINISHED`: the run ended: its result is read;
 * - `NOT_STARTED`: no start time is recorded yet. SAP answers it for a run
 *   whose background task has not begun and for a run id it does not know
 *   (an all-zero id answers `200` `NOT_STARTED`, measured on the cloud,
 *   2026-11-20). What a reader does with it depends on whose run it is
 *   (`readStartedRun`, `readGivenRun`).
 */
const RUNNING = 'RUNNING';
const FINISHED = 'FINISHED';
const NOT_STARTED = 'NOT_STARTED';

/** The run's own verdict on itself, read off `<aunit:progress status="..."/>`. */
export function runProgressStatus(statusValue: XmlRead): string | undefined {
  const status = childAt(
    statusValue,
    'aunit:run',
    'aunit:progress',
    '@',
    'status',
  );
  return typeof status === 'string' ? status : undefined;
}

/** `true` only once ADT itself says the run is `FINISHED` — never guessed. */
export function runIsFinished(statusValue: XmlRead): boolean {
  return runProgressStatus(statusValue) === FINISHED;
}

/**
 * What reading a run found: a run SAP answered `FINISHED`, with its status
 * and its result; or a run SAP answered `NOT_STARTED`, with that status and
 * no result.
 */
export type RunOutcome<TResult> =
  | {
      readonly finished: true;
      readonly status: AdtReading<XmlRead>;
      readonly result: TResult;
    }
  | {
      readonly finished: false;
      readonly status: AdtReading<XmlRead>;
      readonly runStatus: string;
    };

function okOutcome<T>(value: T): IAdtResponse<T, IAdtError> {
  return succeeded(value, 'readRun');
}

/** The step a status read is named by. */
export const READ_STATUS = 'read status';

/** A status read: by the run's id, long-polled or answered at once. */
export type ReadRunStatus = (
  runId: string,
  withLongPolling: boolean,
) => Promise<IAdtResponse<AdtReading<XmlRead>>>;

/**
 * What a reader does with a `NOT_STARTED` answer to its first read:
 * - `read again by long polling`: the tool started the run itself, right
 *   before the read. Code (cloud, 2026-11-20): the start
 *   (`CL_AUL_TEST_RUN->start_in_background`) dispatches the run as a new
 *   task, waits 0.2 s and answers `201`, so the run's start time may still be
 *   unrecorded at the first read. A long-polled read
 *   (`CL_AUL_REST_RUN_STATUS`) re-reads on SAP's side until the run is
 *   `FINISHED`, for up to 5 minutes; SAP bounds the wait.
 * - `answered`: the caller passed the run id in; SAP's `NOT_STARTED` is
 *   answered as SAP named it.
 */
type NotStartedReading = 'read again by long polling' | 'answered';

/**
 * Read the status of a run the tool itself just started, and fetch the
 * result via `fetchResult` when SAP answers the run `FINISHED`.
 *
 * The first read is answered at once (no long polling). A `RUNNING` answer,
 * and a `NOT_STARTED` answer to that first read, are followed by a
 * long-polled read (`withLongPolling`): SAP holds it until the run has
 * finished, for up to 5 minutes (Code, cloud, 2026-11-20; measured on
 * premise, 2026-10-31: one poll held 97 s for a 90 s test and 207 s for a
 * 200 s one). Every further `RUNNING` answer is followed by another, with no
 * limit and no timer of this package's. The read ends on:
 *
 * - `FINISHED`: the result is fetched and answered with the status.
 * - `NOT_STARTED` from a long-polled read: answered as SAP named it
 *   (`finished: false`), and the result is not fetched.
 * - no `aunit:progress` status, or a status other than the three named:
 *   a failure at the status step, whose message states what SAP sent.
 *
 * A failing `getStatus` call is returned exactly as it came (the caller's
 * `answer()` reports it as the refusal it is). A failing `getResult` call,
 * once the run IS confirmed finished, is likewise returned as-is: never
 * swallowed into a null field under a false `success: true`.
 */
export function readStartedRun<TResult>(
  getStatus: ReadRunStatus,
  runId: string,
  fetchResult: () => Promise<IAdtResponse<TResult>>,
): Promise<IAdtResponse<RunOutcome<TResult>, IAdtError>> {
  return readRun(getStatus, runId, fetchResult, 'read again by long polling');
}

/**
 * Read the status of a run whose id the caller passed in, and fetch the
 * result via `fetchResult` when SAP answers the run `FINISHED`.
 *
 * The first read is answered at once (no long polling). Only a `RUNNING`
 * answer is followed by a long-polled read (`withLongPolling`), as
 * `readStartedRun` reads it, and every further `RUNNING` answer by another.
 * The read ends on:
 *
 * - `FINISHED`: the result is fetched and answered with the status.
 * - `NOT_STARTED`: answered as SAP named it (`finished: false`), at once,
 *   and the result is not fetched. An unknown run id answers it.
 * - no `aunit:progress` status, or a status other than the three named:
 *   a failure at the status step, whose message states what SAP sent.
 *
 * Failing `getStatus` and `getResult` calls are returned as they came, as in
 * `readStartedRun`.
 */
export function readGivenRun<TResult>(
  getStatus: ReadRunStatus,
  runId: string,
  fetchResult: () => Promise<IAdtResponse<TResult>>,
): Promise<IAdtResponse<RunOutcome<TResult>, IAdtError>> {
  return readRun(getStatus, runId, fetchResult, 'answered');
}

async function readRun<TResult>(
  getStatus: ReadRunStatus,
  runId: string,
  fetchResult: () => Promise<IAdtResponse<TResult>>,
  notStarted: NotStartedReading,
): Promise<IAdtResponse<RunOutcome<TResult>, IAdtError>> {
  const readStatus = atStep(READ_STATUS, getStatus);
  let longPolled = false;
  let statusResponse = await readStatus(runId, longPolled);
  for (;;) {
    if (!statusResponse.ok) {
      return statusResponse;
    }
    const status = statusResponse.getResult().value;
    const runStatus = runProgressStatus(status.value);
    if (runStatus === RUNNING) {
      longPolled = true;
      statusResponse = await readStatus(runId, longPolled);
      continue;
    }
    if (runStatus === NOT_STARTED) {
      if (notStarted === 'read again by long polling' && !longPolled) {
        longPolled = true;
        statusResponse = await readStatus(runId, longPolled);
        continue;
      }
      return okOutcome<RunOutcome<TResult>>({
        finished: false,
        status,
        runStatus,
      });
    }
    if (runStatus !== FINISHED) {
      const named =
        runStatus === undefined
          ? 'no aunit:progress status'
          : `the status ${JSON.stringify(runStatus)}`;
      return failedWith<RunOutcome<TResult>>(
        withStep(
          {
            origin: 'refusal',
            message: `SAP answered the status of run ${runId} with ${named}, which is neither ${RUNNING} (read again), ${FINISHED} (the result is read) nor ${NOT_STARTED}: the read stops here, and the run's result is not read; the status document as SAP sent it: ${status.raw}`,
          },
          READ_STATUS,
        ),
      );
    }
    const resultResponse = await atStep('read result', fetchResult)();
    if (!resultResponse.ok) {
      return resultResponse;
    }
    return okOutcome<RunOutcome<TResult>>({
      finished: true,
      status,
      result: resultResponse.getResult().value,
    });
  }
}

/**
 * What a reader answers for a run SAP answered `NOT_STARTED`: the run id and
 * that status.
 */
export function unfinishedRun(runId: string, runStatus: string) {
  return { success: true, run_id: runId, status: runStatus };
}

/**
 * What a reader answers for a run it read: the result of a run SAP answered
 * `FINISHED`, the run id and SAP's status of one it answered `NOT_STARTED`.
 */
export function runOutcomeAnswer<T>(
  runId: string,
  outcome: RunOutcome<{ readonly value: T }>,
) {
  return !outcome.finished
    ? unfinishedRun(runId, outcome.runStatus)
    : {
        success: true,
        run_id: runId,
        finished: true,
        run_result: outcome.result.value,
      };
}

/** {@link runOutcomeAnswer}, a finished run's status beside its result. */
export function runOutcomeWithStatus<T>(
  runId: string,
  outcome: RunOutcome<{ readonly value: T }>,
) {
  return !outcome.finished
    ? unfinishedRun(runId, outcome.runStatus)
    : {
        success: true,
        run_id: runId,
        finished: true,
        run_status: outcome.status.value,
        run_result: outcome.result.value,
      };
}

/** What a status read answers: the run id, whether it finished, SAP's progress status. */
export function runStatusAnswer(runId: string, statusValue: XmlRead) {
  return {
    run_id: runId,
    finished: runIsFinished(statusValue),
    run_status: runProgressStatus(statusValue),
  };
}
