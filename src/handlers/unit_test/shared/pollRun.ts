import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { AdtReading } from '../../../lib/strategies/reading';
import { atStep } from '../../../lib/strategies/step';

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
 * result document). Only that attribute decides whether this polls again or
 * fetches the result.
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

/** A run SAP answered finished: its last status, and its result. */
export interface RunOutcome<TResult> {
  readonly status: AdtReading<unknown>;
  readonly result: TResult;
}

function okOutcome<T>(value: T): IAdtResponse<T, IAdtError> {
  return {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error('pollUntilFinished: asked for the error of a success');
    },
  } as unknown as IAdtResponse<T, IAdtError>;
}

/**
 * Read a run's status by long polling until SAP answers it `FINISHED`, then
 * fetch the result via `fetchResult`.
 *
 * Each status read asks for long polling (`withLongPolling`), and ADT holds
 * that request open until the run has finished (measured on premise,
 * 2026-10-31: one poll held 97 s for a 90 s test and 207 s for a 200 s one,
 * and returned on no progress step), so a run ends the loop on
 * the poll that saw it finish. The call lasts as long as the run; a caller
 * who must not wait starts the run and reads it later by its id.
 *
 * A failing `getStatus` call is returned exactly as it came (the caller's
 * `answer()` reports it as the refusal it is). A failing `getResult` call,
 * once the run IS confirmed finished, is likewise returned as-is: never
 * swallowed into a null field under a false `success: true`. The result is
 * fetched only once the status says `FINISHED`.
 */
export async function pollUntilFinished<TResult>(
  getStatus: (
    runId: string,
    withLongPolling?: boolean,
  ) => Promise<IAdtResponse<AdtReading<unknown>>>,
  runId: string,
  fetchResult: () => Promise<IAdtResponse<TResult>>,
): Promise<IAdtResponse<RunOutcome<TResult>, IAdtError>> {
  for (;;) {
    const statusResponse = await atStep('read status', getStatus)(runId, true);
    if (!statusResponse.ok) {
      return statusResponse as unknown as IAdtResponse<
        RunOutcome<TResult>,
        IAdtError
      >;
    }
    const status = statusResponse.getResult().value;
    if (runIsFinished(status.value)) {
      const resultResponse = await atStep('read result', fetchResult)();
      if (!resultResponse.ok) {
        return resultResponse as unknown as IAdtResponse<
          RunOutcome<TResult>,
          IAdtError
        >;
      }
      return okOutcome({
        status,
        result: resultResponse.getResult().value,
      });
    }
  }
}
