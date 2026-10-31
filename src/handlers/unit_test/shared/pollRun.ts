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

/**
 * How many status long polls a tool waits through when the call names none
 * (`max_status_polls`). `getStatus`'s own `withLongPolling` makes ADT hold
 * each request open while the run is in progress, so this counts such long
 * polls before the tool answers the run id — not a guess at how long a run
 * "should" take. The caller chooses another count with `max_status_polls`.
 */
export const DEFAULT_MAX_STATUS_POLLS = 5;

/** The `max_status_polls` property of a tool that waits for a run. */
export const MAX_STATUS_POLLS_PROPERTY = {
  max_status_polls: {
    type: 'integer',
    minimum: 1,
    default: DEFAULT_MAX_STATUS_POLLS,
    description: `How many status long polls the call waits through before it answers: an integer of 1 or more (default ${DEFAULT_MAX_STATUS_POLLS}). ADT holds each long poll open while the run is in progress.`,
  },
} as const;

/**
 * The call's `max_status_polls`: the default when absent; an error, sent
 * before any request, for a value that is not an integer of 1 or more. The
 * arguments come from the caller, outside the type system, so the value is
 * checked here.
 */
export function maxStatusPollsOf(args: unknown): number | Error {
  const given = givenMaxStatusPolls(args);
  if (given === undefined) return DEFAULT_MAX_STATUS_POLLS;
  if (typeof given === 'number' && Number.isInteger(given) && given >= 1) {
    return given;
  }
  return new Error(
    `max_status_polls must be an integer of 1 or more; got ${JSON.stringify(given)}; nothing was sent`,
  );
}

/** The `max_status_polls` the call carries, as given; `undefined` when none. */
export function givenMaxStatusPolls(args: unknown): unknown {
  return args !== null &&
    typeof args === 'object' &&
    Object.hasOwn(args, 'max_status_polls')
    ? Object.getOwnPropertyDescriptor(args, 'max_status_polls')?.value
    : undefined;
}

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
 * Poll a run's status up to `maxStatusPolls` times, and only then — if it
 * finished by then — fetch the result via `fetchResult`.
 *
 * A failing `getStatus` call is returned exactly as it came (the caller's
 * `answer()` reports it as the refusal it is — the status this handler
 * already had is not thrown away in favour of a fabricated one). A failing
 * `getResult` call, once the run IS confirmed finished, is likewise returned
 * as-is: never swallowed into a null field under a false `success: true`.
 * A run that has not finished after those polls never reaches `fetchResult`
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
  maxStatusPolls: number,
): Promise<IAdtResponse<RunOutcome<TResult>, IAdtError>> {
  let lastStatus: AdtReading<unknown> | undefined;
  for (let attempt = 0; attempt < maxStatusPolls; attempt += 1) {
    const statusResponse = await atStep('read status', getStatus)(runId, true);
    if (!statusResponse.ok) {
      return statusResponse as unknown as IAdtResponse<
        RunOutcome<TResult>,
        IAdtError
      >;
    }
    const status = statusResponse.getResult().value;
    lastStatus = status;
    if (runIsFinished(status.value)) {
      const resultResponse = await atStep('read result', fetchResult)();
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
