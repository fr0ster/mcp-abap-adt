/**
 * The debugger's failures, each in the shape of every other failure: the
 * method's error as it is, with the step where it arose (`failureEntry`), or a
 * throw — never dressed as SAP's answer (`thrownEntry`). A cleanup that could
 * not undo several things answers each as such an entry, not one text.
 */
import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import { type FailureEntry, failureEntry, thrownEntry } from '../answer';
import { failureOf } from '../auth/failures';
import {
  carryingPayload,
  type LeftBehind,
  mergedLeftBehind,
  methodFailureOf,
  noteLeftBehind,
  payloadCarriedBy,
} from '../strategies/step';
import { failureText } from './readings';

export type DebugFailure = FailureEntry;

/** A throw read as a failed answer: what was thrown, kept beside it. */
const thrownBehind = new WeakMap<object, unknown>();

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * A throw read as a failed answer, so the loops can handle both alike. No
 * SAP answer is behind it: it is never carried as the method's error to the
 * consumer as if SAP had answered (`isFromThrow`), and its entry is the throw's.
 */
export function asFailure(e: unknown): IAdtResponse<never> {
  const error = { origin: 'connection', message: messageOf(e) };
  thrownBehind.set(error, e);
  return {
    ok: false as const,
    getError: () => error,
  } as unknown as IAdtResponse<never>;
}

/** Whether a failed answer's error is a throw `asFailure` read. */
export function isFromThrow(error: object): boolean {
  return thrownBehind.has(error);
}

/** A failed answer as an entry: the method's error as it is, or the throw behind it, with the step. */
export function failedEntry(
  answer: IAdtResponse<unknown>,
  step: string,
): DebugFailure {
  const error = (answer as { getError: () => IAdtError }).getError();
  if (thrownBehind.has(error))
    return thrownEntry(thrownBehind.get(error), step);
  return failureEntry(error, step);
}

/** A throw as an entry, with the step. */
export function thrownFailure(thrown: unknown, step: string): DebugFailure {
  return thrownEntry(thrown, step);
}

/**
 * What a list of entries says, for an in-process reader (a log line, a
 * thrown message): each step with SAP's words as `failureText` reads them.
 */
export function describeFailures(list: readonly DebugFailure[]): string {
  return list
    .map((entry) => {
      const step = typeof entry.step === 'string' ? `${entry.step}: ` : '';
      const message =
        typeof entry.message === 'string'
          ? failureText({
              message: entry.message,
              response: { data: entry.raw_body },
            })
          : JSON.stringify(entry);
      const left = (entry.cleanup as { message?: unknown } | undefined)
        ?.message;
      return `${step}${message}${typeof left === 'string' ? `; ${left}` : ''}`;
    })
    .join('; ');
}

/**
 * What a failed debugger call left behind, beside its error: the entries of
 * what could not be undone, notes that are no debt, and words. A carried
 * method error gains them as `cleanup`; an error of ours carries its words
 * with them as its answer; a chain failure is answered as it came.
 */
export function leaveBehind(error: unknown, left: LeftBehind): void {
  if (methodFailureOf(error) !== undefined) {
    noteLeftBehind(error, left);
    return;
  }
  if (failureOf(error) !== undefined) return;
  if (error === null || typeof error !== 'object') return;
  carryingPayload(error, {
    message: messageOf(error),
    cleanup: mergedLeftBehind(payloadCarriedBy(error)?.cleanup, left),
  });
}
