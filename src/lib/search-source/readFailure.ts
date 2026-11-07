/**
 * What a failed read of `SearchSource` leads to (DO22): a fixed
 * classification in our code, and — for a SAP answer only — the SAP-answer
 * strategy the orchestrator is given explicitly (the consumer's, or the
 * shipped `skipSapAnswers`).
 *
 * Each failed read is classified once, at the place it failed; a SAP answer
 * is decided there by the strategy, once. The outcome travels outward
 * unchanged: `'skip'` is applied at the place, `'end'` and `'throw'` leave it
 * as a decided failure no outer layer decides again. A failure already
 * decided (a cached or replayed read) is never classified or asked about
 * again. This is the one module that reads a read failure's kind.
 */
import { isCredentialFailure } from '../answer';
import { failureOf, readOwn } from '../auth/failures';
import type { WalkFailurePlace } from '../strategies/packageWalk';
import { methodFailureOf } from '../strategies/step';
import type { ScanObjectType } from './packageEnumerator';

/** Where a SAP answer was met: a closed union on `kind`. */
export type SapAnswerPlace =
  | { kind: 'mask'; mask: string }
  | WalkFailurePlace
  | { kind: 'structure'; group: string; uri: string }
  | {
      kind: 'source';
      devclass: string;
      object_type: ScanObjectType;
      object_name: string;
      source: { name: string; uri: string; key: string };
    };

/** What a failed read leads to: skipped, the call ended, or thrown as an error. */
export type SapAnswerDecision = 'skip' | 'end' | 'throw';

/** The SAP-answer strategy: what a SAP answer at its place leads to. */
export interface SapAnswerStrategy {
  decide(failure: unknown, place: SapAnswerPlace): SapAnswerDecision;
}

/** The shipped SAP-answer strategy: every SAP answer is skipped (DO17). */
export const skipSapAnswers: SapAnswerStrategy = {
  decide: () => 'skip',
};

/** An integer HTTP status of `response`, read safely. */
function statusOf(response: unknown): number | undefined {
  const status = readOwn(response, 'status');
  return typeof status === 'number' && Number.isInteger(status)
    ? status
    : undefined;
}

/**
 * Whether `failure` is SAP's answer: it carries a response with an integer
 * status, whatever its origin — answered and carried, or a raw transport
 * failure — or it is an ADT failure of origin `refusal`.
 */
function isSapAnswer(failure: unknown): boolean {
  const carried = methodFailureOf(failure);
  if (carried !== undefined) {
    return (
      statusOf(carried.response) !== undefined || carried.origin === 'refusal'
    );
  }
  return (
    statusOf(readOwn(failure, 'response')) !== undefined ||
    readOwn(failure, 'origin') === 'refusal'
  );
}

/**
 * The fixed classification (owner, DO22), by structure only: a credential
 * refusal or the server's own refusal ends the call; a SAP answer is the
 * strategy's; anything else is thrown. (A batch envelope's failure is
 * classified in its phase: `envelopeFailure`.)
 */
function classify(failure: unknown): 'end' | 'sap' | 'throw' {
  if (isCredentialFailure(failure) || failureOf(failure) !== undefined) {
    return 'end';
  }
  return isSapAnswer(failure) ? 'sap' : 'throw';
}

/** The decisions taken, by the failure they were taken for. */
const DECIDED = new WeakMap<object, SapAnswerDecision>();

/** A thrown primitive leaving its place decided: the value and the decision. */
class DecidedPrimitive {
  constructor(
    readonly value: unknown,
    readonly decision: SapAnswerDecision,
  ) {}
}

function isObject(value: unknown): value is object {
  return (
    value !== null && (typeof value === 'object' || typeof value === 'function')
  );
}

/** The decision taken already for `failure`; `undefined` when none was. */
function decisionOf(failure: unknown): SapAnswerDecision | undefined {
  if (failure instanceof DecidedPrimitive) return failure.decision;
  return isObject(failure) ? DECIDED.get(failure) : undefined;
}

/** `failure` as it leaves its place under `decision`: recorded as decided; a primitive inside a carrier. */
function decidedFailure(
  failure: unknown,
  decision: SapAnswerDecision,
): unknown {
  if (isObject(failure)) {
    DECIDED.set(failure, decision);
    return failure;
  }
  return new DecidedPrimitive(failure, decision);
}

/**
 * A failed read at `place`: classified, and a SAP answer decided by
 * `strategy` — once, recorded under `key`, the stable value a cached or
 * replayed read answers with (an answered failure's error object); a failure
 * decided before is acted on as decided.
 * Returns on `'skip'` (the place drops what it names); throws the decided
 * failure on `'end'` and `'throw'`.
 */
export function failedRead(
  strategy: SapAnswerStrategy,
  failure: unknown,
  place: SapAnswerPlace,
  key: unknown = failure,
): void {
  let decision = decisionOf(key) ?? decisionOf(failure);
  if (decision === undefined) {
    const kind = classify(failure);
    decision = kind === 'sap' ? strategy.decide(failure, place) : kind;
    if (isObject(key)) DECIDED.set(key, decision);
  }
  switch (decision) {
    case 'skip':
      return;
    case 'end':
    case 'throw':
      throw decidedFailure(failure, decision);
    default: {
      const unreachable: never = decision;
      throw unreachable;
    }
  }
}

/**
 * A batch envelope of a `SearchSource` phase that failed (not the outer
 * `404`, which falls back before): a credential or the server's own refusal
 * ends the call, any other failure is thrown — never a SAP answer of one
 * part, never handed to the strategy. Always throws.
 */
export function envelopeFailure(error: unknown): never {
  const end = isCredentialFailure(error) || failureOf(error) !== undefined;
  throw decidedFailure(error, end ? 'end' : 'throw');
}

/** The value a decided failure carries: a carried primitive unwrapped, anything else as it is. */
export function undecided(thrown: unknown): unknown {
  return thrown instanceof DecidedPrimitive ? thrown.value : thrown;
}
