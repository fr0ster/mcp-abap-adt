import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import type { AdtReading } from '../../../lib/strategies/reading';

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

/**
 * Bounded, not unlimited. `getStatus`'s own `withLongPolling` already makes
 * ADT hold each individual request open while the run is in progress, so
 * this is a bound on how many such long-polls this handler will sit through
 * before giving up and telling the caller to ask again — not a guess at how
 * long a run "should" take.
 */
export const MAX_STATUS_POLLS = 5;

export interface RunOutcome<TResult> {
  readonly finished: boolean;
  readonly status: AdtReading<unknown>;
  /** Present only when `finished` — never fetched otherwise. */
  readonly result?: TResult;
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
 * Poll a run's status up to `MAX_STATUS_POLLS` times, and only then — if it
 * finished within that bound — fetch the result via `fetchResult`.
 *
 * A failing `getStatus` call is returned exactly as it came (the caller's
 * `answer()` reports it as the refusal it is — the status this handler
 * already had is not thrown away in favour of a fabricated one). A failing
 * `getResult` call, once the run IS confirmed finished, is likewise returned
 * as-is: never swallowed into a null field under a false `success: true`.
 * A run that has not finished within the bound never reaches `fetchResult`
 * at all — this handler does not present whatever an unfinished run's result
 * endpoint happens to answer, because no fixture in the corpus captures that
 * case and guessing would be exactly the kind of invented shape this
 * migration exists to remove.
 */
export async function pollUntilFinished<TResult>(
  getStatus: (
    runId: string,
    withLongPolling?: boolean,
  ) => Promise<IAdtResponse<AdtReading<unknown>>>,
  runId: string,
  fetchResult: () => Promise<IAdtResponse<TResult>>,
): Promise<IAdtResponse<RunOutcome<TResult>, IAdtError>> {
  let lastStatus: AdtReading<unknown> | undefined;
  for (let attempt = 0; attempt < MAX_STATUS_POLLS; attempt += 1) {
    const statusResponse = await getStatus(runId, true);
    if (!statusResponse.ok) {
      return statusResponse as unknown as IAdtResponse<
        RunOutcome<TResult>,
        IAdtError
      >;
    }
    const status = statusResponse.getResult().value;
    lastStatus = status;
    if (runIsFinished(status.value)) {
      const resultResponse = await fetchResult();
      if (!resultResponse.ok) {
        return resultResponse as unknown as IAdtResponse<
          RunOutcome<TResult>,
          IAdtError
        >;
      }
      return okOutcome({
        finished: true,
        status,
        result: resultResponse.getResult().value,
      });
    }
  }
  return okOutcome({
    finished: false,
    status: lastStatus as AdtReading<unknown>,
  });
}
