/**
 * What a soft-mode step's answer says happened (#394, spec §1): one outcome
 * per call, read from typed fields only — the answer's `connection_cause`,
 * `session_error`, `session_lost`, `status`, `origin`, `left_locked`
 * (`src/lib/answer.ts`), a thrown value's listed `code`, `sessionLost` and
 * `response.status` — never from words.
 *
 * - `ok`: the call did what it was asked, and left nothing behind it could
 *   not release; a release SAP refused rides on it (its lock is taken in by
 *   the registry, `heldLocksOf`).
 * - `credential`: a credential refusal (`refusalGuard.ts`): the run stops.
 * - `session-lost`: the session is gone (`spentBy`'s verdicts): SAP released
 *   what it held.
 * - `network`: the request reached no answer; the session and its locks stay.
 * - `unclassified`: a failure whose fields cannot say whether SAP answered.
 * - `refused`: SAP answered and refused.
 *
 * Every outcome but `ok` ends the step, and so the test (spec §2). The
 * outcome is the call's: the registry of the connection it ran on is the one
 * it applies to (`HeldLiveLocks`, spec §3).
 */
import { ADT_CONNECTION_CAUSES } from '@mcp-abap-adt/interfaces-adt';
import { ADT_SESSION_ERROR } from '@mcp-abap-adt/interfaces-adt-connection';
import type { ToolResultLike } from '../../../lib/toolResult';
import { isCredentialRefusal, refusalAnswered } from './refusalGuard';

export type StepOutcome =
  | 'ok'
  | 'credential'
  | 'session-lost'
  | 'network'
  | 'unclassified'
  | 'refused';

/** The session errors that end a session (`spentBy`): `ADT_RELEASE_PENDING` is none. */
const ENDED: readonly string[] = [
  ADT_SESSION_ERROR.NOT_CONNECTED,
  ADT_SESSION_ERROR.SESSION_REPLACED,
];

const CAUSES: readonly string[] = ADT_CONNECTION_CAUSES;

/** A member of a value from outside the type system, read guarded. */
function member(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  try {
    return Reflect.get(value, name);
  } catch {
    return undefined;
  }
}

/** The text of an answer's first item (a terse answer's string, else its JSON). */
function textOf(answer: ToolResultLike): string {
  return answer.content?.[0]?.text ?? '';
}

/** The answer's JSON payload, or `undefined` for a text answer. */
function payloadOf(answer: ToolResultLike): unknown {
  try {
    return JSON.parse(textOf(answer));
  } catch {
    return undefined;
  }
}

/** Every object in `value`, itself included, depth first. */
function objectsIn(value: unknown): object[] {
  const found: object[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else if (typeof node === 'object' && node !== null) {
      found.push(node);
      for (const item of Object.values(node)) walk(item);
    }
  };
  walk(value);
  return found;
}

/** What the connection facts of `value` (an answer's payload, or part of it) say, if anything. */
function connectionVerdict(
  value: unknown,
): 'session-lost' | 'network' | undefined {
  const objects = objectsIn(value);
  const lost = objects.some(
    (node) =>
      typeof member(node, 'session_lost') === 'string' ||
      ENDED.includes(String(member(node, 'session_error'))),
  );
  if (lost) return 'session-lost';
  const cut = objects.some((node) =>
    CAUSES.includes(String(member(node, 'connection_cause'))),
  );
  return cut ? 'network' : undefined;
}

/** Whether a failure payload says SAP answered it: an integer status, or a refusal by origin. */
function sapAnswered(failure: unknown): boolean {
  return (
    Number.isInteger(member(failure, 'status')) ||
    member(failure, 'origin') === 'refusal'
  );
}

/** The outcome of a handler's answer. */
export function answerOutcome(answer: ToolResultLike): StepOutcome {
  const failed = answer.isError === true;
  const text = textOf(answer);
  if (refusalAnswered(failed, text)) return 'credential';
  const payload = payloadOf(answer);
  if (!failed) {
    // A success may carry a release that failed (`withLock`'s cleanup).
    const cleanup = member(payload, 'cleanup');
    if (member(cleanup, 'left_locked') !== true) return 'ok';
    const verdict = connectionVerdict(cleanup);
    if (verdict !== undefined) return verdict;
    const failures = member(cleanup, 'failures');
    const answered = Array.isArray(failures)
      ? failures.some(sapAnswered)
      : sapAnswered(cleanup);
    return answered ? 'ok' : 'unclassified';
  }
  const verdict = connectionVerdict(payload);
  if (verdict !== undefined) return verdict;
  return sapAnswered(payload) ? 'refused' : 'unclassified';
}

/** The outcome of a value a call threw. */
export function thrownOutcome(thrown: unknown): StepOutcome {
  if (isCredentialRefusal(thrown)) return 'credential';
  const code = String(member(thrown, 'code'));
  if (
    ENDED.includes(code) ||
    ENDED.includes(String(member(thrown, 'sessionLost')))
  ) {
    return 'session-lost';
  }
  if (CAUSES.includes(code)) return 'network';
  return Number.isInteger(member(member(thrown, 'response'), 'status'))
    ? 'refused'
    : 'unclassified';
}

/** The outcome of a call: its answer, or what it threw. */
export async function outcomeOf<T extends ToolResultLike>(
  call: () => Promise<T>,
): Promise<
  | { outcome: StepOutcome; answer: T }
  | { outcome: StepOutcome; thrown: unknown }
> {
  try {
    const answer = await call();
    return { outcome: answerOutcome(answer), answer };
  } catch (thrown) {
    return { outcome: thrownOutcome(thrown), thrown };
  }
}

/**
 * A failed step, as a test ends with it: its label and its outcome as facts,
 * and the answer's text (or the throw) for the log the run is read from.
 */
export class StepFailure extends Error {
  constructor(
    readonly label: string,
    readonly outcome: Exclude<StepOutcome, 'ok'>,
    detail: string,
  ) {
    super(`${label} failed (${outcome}): ${detail}`);
    this.name = 'StepFailure';
  }
}
