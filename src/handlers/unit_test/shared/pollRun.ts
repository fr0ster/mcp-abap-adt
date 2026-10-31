import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { AdtReading } from '../../../lib/strategies/reading';
import { failedWith } from '../../../lib/strategies/sequence';
import { atStep, withStep } from '../../../lib/strategies/step';

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

/** The run's own verdict on itself, read off `<aunit:progress status="..."/>`. */
export function runProgressStatus(statusValue: unknown): string | undefined {
  const run = (statusValue as Record<string, unknown> | null | undefined)?.[
    'aunit:run'
  ] as Record<string, unknown> | undefined;
  const progress = run?.['aunit:progress'] as
    | { '@'?: { status?: unknown } }
    | undefined;
  const status = progress?.['@']?.status;
  return typeof status === 'string' ? status : undefined;
}

/** `true` only once ADT itself says the run is `FINISHED` — never guessed. */
export function runIsFinished(statusValue: unknown): boolean {
  return runProgressStatus(statusValue) === 'FINISHED';
}

/**
 * What one long-polled status read found: a run SAP answered `FINISHED`, with
 * its status and its result; or a run SAP answered with another status, with
 * that status as SAP named it and no result.
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
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('readRunOnce: asked for the error of a success');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

/** The step a status read is named by. */
export const READ_STATUS = 'read status';

/**
 * Read a run's status once, by long polling, and fetch the result via
 * `fetchResult` when SAP answers the run `FINISHED`.
 *
 * The status read asks for long polling (`withLongPolling`), and ADT holds
 * that request open until the run has finished (measured on premise,
 * 2026-10-31: one poll held 97 s for a 90 s test and 207 s for a 200 s one,
 * and returned on no progress step), so the call lasts as long as the run.
 * SAP's answer ends the call, whatever it is:
 *
 * - `FINISHED`: the result is fetched and answered with the status.
 * - another status: answered as SAP named it (`finished: false`), and the
 *   result is not fetched; the caller reads on by the run's id.
 * - no `aunit:progress` status at all: a failure at the status step, whose
 *   message carries the status document as SAP sent it.
 *
 * A failing `getStatus` call is returned exactly as it came (the caller's
 * `answer()` reports it as the refusal it is). A failing `getResult` call,
 * once the run IS confirmed finished, is likewise returned as-is: never
 * swallowed into a null field under a false `success: true`.
 */
export async function readRunOnce<TResult>(
  getStatus: (
    runId: string,
    withLongPolling?: boolean,
  ) => Promise<IAdtResponse<AdtReading<unknown>>>,
  runId: string,
  fetchResult: () => Promise<IAdtResponse<TResult>>,
): Promise<IAdtResponse<RunOutcome<TResult>, IAdtError>> {
  const statusResponse = await atStep(READ_STATUS, getStatus)(runId, true);
  if (!statusResponse.ok) {
    return statusResponse as unknown as IAdtResponse<
      RunOutcome<TResult>,
      IAdtError
    >;
  }
  const status = statusResponse.getResult().value;
  const runStatus = runProgressStatus(status.value);
  if (runStatus === undefined) {
    return failedWith<RunOutcome<TResult>>(
      withStep(
        {
          origin: 'refusal',
          message: `SAP answered the status of run ${runId} with no aunit:progress status; the status document as SAP sent it: ${status.raw}`,
        },
        READ_STATUS,
      ),
    );
  }
  if (runStatus !== 'FINISHED') {
    return okOutcome<RunOutcome<TResult>>({
      finished: false,
      status,
      runStatus,
    });
  }
  const resultResponse = await atStep('read result', fetchResult)();
  if (!resultResponse.ok) {
    return resultResponse as unknown as IAdtResponse<
      RunOutcome<TResult>,
      IAdtError
    >;
  }
  return okOutcome<RunOutcome<TResult>>({
    finished: true,
    status,
    result: resultResponse.getResult().value,
  });
}

/**
 * What a reader answers for a run SAP answered with a status other than
 * `FINISHED`: the run id and that status, to read on by the id.
 */
export function unfinishedRun(runId: string, runStatus: string) {
  return { success: true, run_id: runId, status: runStatus };
}
