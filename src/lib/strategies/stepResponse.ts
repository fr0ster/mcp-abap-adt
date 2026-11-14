/**
 * The server's own `IAdtResponse`: the ADT answer with what a step of ours
 * adds to it, typed (spec §4).
 *
 * - A failure's error is a `StepError`: the ADT error with the step it arose
 *   at and, when a lock was left behind, the cleanup note.
 * - A success may carry the cleanup note of a lock its write left held.
 *
 * Every field added is optional, so an adt-clients answer is a
 * `StepResponse` as it is, and a `StepResponse` is an `IAdtResponse`.
 */

import type { IAdtStillInactive } from '@mcp-abap-adt/adt-strategies';
import type {
  IAdtError,
  IAdtFailure,
  IAdtResponse,
  IAdtSuccess,
} from '@mcp-abap-adt/interfaces-adt';
import type { Cleanup } from './safeFields';
import type { LeftBehind } from './step';

/** An ADT error, with the step it arose at and what that step left behind. */
export interface StepError extends IAdtError {
  readonly step?: string;
  /** A lock left held, or what a handler left behind after the failure. */
  readonly cleanup?: Cleanup | LeftBehind;
  readonly operation?: 'succeeded';
  /**
   * What an activation left inactive: SAP's own list
   * (`IAdtActivationFailure.stillInactive`), or the run's references the
   * inactive list still names after a silent results checklist.
   */
  readonly stillInactive?: ReadonlyArray<IAdtStillInactive>;
}

/** A success, with the note of a lock its write left held. */
export interface StepSuccess<T> extends IAdtSuccess<T> {
  readonly cleanup?: Cleanup;
}

export type StepResponse<T> = StepSuccess<T> | IAdtFailure<StepError>;

/**
 * A success built here. Its `getError` throws, naming `who`: a reader that
 * asks a success for its error is told so instead of reading `undefined`.
 */
export function succeeded<T>(
  value: T,
  who?: string,
  cleanup?: Cleanup,
): StepSuccess<T> {
  const success: StepSuccess<T> & { getError(): never } = {
    ok: true,
    getResult: () => ({ value }),
    getError: () => {
      throw new Error(asked(who, 'the error of a success'));
    },
    ...(cleanup === undefined ? {} : { cleanup }),
  };
  return success;
}

/** A failure built here. Its `getResult` throws, naming `who`. */
export function failed(error: StepError, who?: string): IAdtFailure<StepError> {
  const failure: IAdtFailure<StepError> & { getResult(): never } = {
    ok: false,
    getResult: () => {
      throw new Error(asked(who, 'the result of a failure'));
    },
    getError: () => error,
  };
  return failure;
}

/** The sentinel's words: what was asked for, after `who` when named. */
function asked(who: string | undefined, what: string): string {
  return who === undefined ? `asked for ${what}` : `${who}: asked for ${what}`;
}

/** The cleanup note a success carries, if any. */
export function cleanupOf<T>(
  answer: IAdtResponse<T, StepError>,
): Cleanup | undefined {
  if (!answer.ok) return undefined;
  const success: StepSuccess<T> = answer;
  return success.cleanup;
}
