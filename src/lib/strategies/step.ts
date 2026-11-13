import type { IAdtError } from '@mcp-abap-adt/interfaces-adt';
import { failureOf } from '../auth/failures';
import { SystemContextMissingError } from '../systemContextGuard';
import { child, isList } from '../xml/tree';
import { failed, type StepError, type StepResponse } from './stepResponse';

/**
 * Where a handler's failure arose: the step it was doing.
 *
 * A handler that makes several calls answers the failing call's error as the
 * method returned it — its text, origin, `adt_type`, T100 messages, raw body
 * and request, all decided by the strategy the handler passed. This adds one
 * field beside it, `step`, and changes nothing of the error itself.
 */
export interface StepCarrier {
  step?: string;
}

function stepOf(value: unknown): string | undefined {
  const step = child(value, 'step');
  return typeof step === 'string' ? step : undefined;
}

/**
 * A throw that arose at a step.
 *
 * Keeps the thrown value as `cause` and borrows its message, as
 * `LockNotReleased` does, and carries the held-lock note a throw may already
 * have — so nothing about the throw is reworded or lost.
 */
export class StepThrew extends Error {
  readonly step: string;
  readonly cleanup?: unknown;
  readonly operation?: unknown;
  constructor(step: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = 'StepThrew';
    this.step = step;
    const cleanup = child(cause, 'cleanup');
    const operation = child(cause, 'operation');
    if (cleanup !== undefined) this.cleanup = cleanup;
    if (operation !== undefined) this.operation = operation;
  }
}

/** The method's error, with the step added unless an inner step already named it. */
export function withStep(error: StepError, step: string): StepError {
  if (stepOf(error) !== undefined) return error;
  return { ...error, step };
}

/**
 * A call, named as the handler's step.
 *
 * A failed answer is returned with `step` added to its error; a success is
 * returned untouched. A throw is rethrown with the step beside it — except a
 * credential or system-context failure, which reaches its own reader as it
 * came.
 */
export function atStep<A extends unknown[], T>(
  step: string,
  call: (...args: A) => Promise<StepResponse<T>>,
): (...args: A) => Promise<StepResponse<T>> {
  return async (...args: A) => {
    let answered: StepResponse<T>;
    try {
      answered = await call(...args);
    } catch (thrown) {
      if (
        stepOf(thrown) !== undefined ||
        failureOf(thrown) !== undefined ||
        thrown instanceof SystemContextMissingError
      ) {
        throw thrown;
      }
      throw new StepThrew(step, thrown);
    }
    // Only a failure gains a step; anything else is returned as it came.
    if (answered?.ok !== false || typeof answered.getError !== 'function') {
      return answered;
    }
    const error = answered.getError();
    if (stepOf(error) !== undefined) return answered;
    return failed(withStep(error, step), 'atStep');
  };
}

/** The method's error each throw carries, by the thrown object. */
const METHOD_FAILURE = new WeakMap<object, StepError>();

/**
 * A handler that works by throws carries the method's error on the throw.
 *
 * The thrown value keeps its own message for whoever reads it in the process;
 * the consumer gets the method's error as it is, with the step
 * (`methodFailureOf`, read by `return_error`).
 */
export function carryingFailure<E extends Error>(
  thrown: E,
  error: IAdtError,
  step: string,
): E {
  METHOD_FAILURE.set(thrown, withStep(error, step));
  return thrown;
}

/**
 * What a handler left behind: a note in words, and — where the leftovers are
 * failures of their own — each as an entry in the shape of every other
 * failure (`failures`), with notes that are no debt (`notes`).
 */
export interface LeftBehind {
  message?: string;
  failures?: readonly unknown[];
  notes?: readonly unknown[];
}

/** What was left behind before, with what is added now. */
export function mergedLeftBehind(
  prior: unknown,
  added: LeftBehind,
): LeftBehind {
  const listed = (name: string): readonly unknown[] => {
    const value = child(prior, name);
    return isList(value) ? value : [];
  };
  const message = [child(prior, 'message'), added.message]
    .filter((m): m is string => typeof m === 'string' && m !== '')
    .join('; ');
  const failures = [...listed('failures'), ...(added.failures ?? [])];
  const notes = [...listed('notes'), ...(added.notes ?? [])];
  return {
    ...(message ? { message } : {}),
    ...(failures.length ? { failures } : {}),
    ...(notes.length ? { notes } : {}),
  };
}

/**
 * What a handler left behind after the method failed — cleanup it could not
 * do, state it keeps — added beside the method's error as `cleanup`, the
 * field the `answer()` path already renders for a lock left held. The
 * method's error itself is untouched. Nothing when the throw carries none.
 */
export function noteLeftBehind(thrown: Error, note: string | LeftBehind): void {
  const carried = METHOD_FAILURE.get(thrown);
  if (carried === undefined) return;
  METHOD_FAILURE.set(thrown, {
    ...carried,
    cleanup: mergedLeftBehind(
      carried.cleanup,
      typeof note === 'string' ? { message: note } : note,
    ),
  });
}

/** The whole answer each throw carries, by the thrown object. */
const CARRIED_PAYLOAD = new WeakMap<object, Record<string, unknown>>();

/**
 * A throw that carries its whole answer: a failure that is several failures
 * (a cleanup's), or an error of ours with what it left behind — each part in
 * the shape of every other failure. `return_error` answers the payload as it
 * is.
 */
export function carryingPayload<E extends object>(
  thrown: E,
  payload: Record<string, unknown>,
): E {
  CARRIED_PAYLOAD.set(thrown, payload);
  return thrown;
}

/** The payload a throw carries, or `undefined`. */
export function payloadCarriedBy(
  thrown: unknown,
): Record<string, unknown> | undefined {
  if (thrown === null || typeof thrown !== 'object') return undefined;
  return CARRIED_PAYLOAD.get(thrown);
}

/** A method failure carried on a throw, or `undefined`. */
export function methodFailureOf(thrown: unknown): StepError | undefined {
  if (thrown === null || typeof thrown !== 'object') return undefined;
  return METHOD_FAILURE.get(thrown);
}

export { stepOf };
