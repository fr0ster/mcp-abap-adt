import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { AdtReading } from '../../../lib/strategies/reading';
import { failedWith } from '../../../lib/strategies/sequence';
import { atStep, withStep } from '../../../lib/strategies/step';
import { succeeded } from '../../../lib/strategies/stepResponse';
import { childAt } from '../../../lib/xml/tree';

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
 * The statuses an ABAP Unit run's `aunit:progress` was measured to answer
 * (on premise and on the cloud, 2026-11-05), and what each means here:
 * - `RUNNING`: the run is in progress, from right after its start: read
 *   again by long polling;
 * - `FINISHED`: the run ended: its result is read;
 * - `NOT_STARTED`: what SAP answers for a run id it does not know, at once
 *   without long polling (and only after about 300 s with it): answered as
 *   it is.
 */
const RUNNING = 'RUNNING';
const FINISHED = 'FINISHED';
const NOT_STARTED = 'NOT_STARTED';

/** The run's own verdict on itself, read off `<aunit:progress status="..."/>`. */
export function runProgressStatus(statusValue: unknown): string | undefined {
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
export function runIsFinished(statusValue: unknown): boolean {
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
      readonly status: AdtReading<unknown>;
      readonly result: TResult;
    }
  | {
      readonly finished: false;
      readonly status: AdtReading<unknown>;
      readonly runStatus: string;
    };

function okOutcome<T>(value: T): IAdtResponse<T, IAdtError> {
  return succeeded(value, 'readRunOnce');
}

/** The step a status read is named by. */
export const READ_STATUS = 'read status';

/**
 * Read a run's status, waiting only for a run SAP says is running, and fetch
 * the result via `fetchResult` when SAP answers the run `FINISHED`.
 *
 * The first read asks for no long polling, so SAP answers at once. Only a
 * `RUNNING` answer is followed by a long-polled read (`withLongPolling`),
 * which ADT holds until the run has finished or about 300 s passed
 * (measured on premise, 2026-10-31: one poll held 97 s for a 90 s test and
 * 207 s for a 200 s one), and every further `RUNNING` answer by another,
 * with no limit and no timer of this package's. The read ends on:
 *
 * - `FINISHED`: the result is fetched and answered with the status.
 * - `NOT_STARTED`: answered as SAP named it (`finished: false`), and the
 *   result is not fetched. An unknown run id answers it, at once.
 * - no `aunit:progress` status, or a status other than the three measured:
 *   a failure at the status step, whose message states what SAP sent.
 *
 * A failing `getStatus` call is returned exactly as it came (the caller's
 * `answer()` reports it as the refusal it is). A failing `getResult` call,
 * once the run IS confirmed finished, is likewise returned as-is: never
 * swallowed into a null field under a false `success: true`.
 */
export async function readRunOnce<TResult>(
  getStatus: (
    runId: string,
    withLongPolling: boolean,
  ) => Promise<IAdtResponse<AdtReading<unknown>>>,
  runId: string,
  fetchResult: () => Promise<IAdtResponse<TResult>>,
): Promise<IAdtResponse<RunOutcome<TResult>, IAdtError>> {
  const readStatus = atStep(READ_STATUS, getStatus);
  let statusResponse = await readStatus(runId, false);
  for (;;) {
    if (!statusResponse.ok) {
      return statusResponse;
    }
    const status = statusResponse.getResult().value;
    const runStatus = runProgressStatus(status.value);
    if (runStatus === RUNNING) {
      statusResponse = await readStatus(runId, true);
      continue;
    }
    if (runStatus === NOT_STARTED) {
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
            message: `SAP answered the status of run ${runId} with ${named}, which is neither ${RUNNING} (read again), ${FINISHED} (the result is read) nor ${NOT_STARTED} (answered as it is): the read stops here, and the run's result is not read; the status document as SAP sent it: ${status.raw}`,
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
