/**
 * A soft-mode suite's steps on its run connection (#394, spec §2–§5), one
 * place for what every suite's `must`, lock, unlock, create and delete do:
 *
 * - each call's outcome is read from typed fields (`stepOutcome`); any
 *   outcome but `ok` ends the step with a `StepFailure` naming it;
 * - a lock a handler left behind (`left_locked`) is taken into the
 *   connection's registry (`unlock-sent`);
 * - a lock is `held` from its answer, its unlock marks it `unlock-sent`
 *   before it is sent and its outcome decides whether it is released;
 * - an object is owned before its create is sent, and a delete is sent once;
 * - `cleanUp` releases every `held` lock, then deletes what is owned in the
 *   order given, each once.
 *
 * Nothing is ever sent twice.
 */
import type { ToolResultLike } from '../../../lib/toolResult';
import { heldLocksOf } from './heldLiveLocks';
import { ownedObjectsOf } from './ownedObjects';
import { answerOutcome, StepFailure, thrownOutcome } from './stepOutcome';
import { thrownWords } from './thrownValue';

/** A tool's answer as the model reads it: the error flag and the first text. */
export interface Answer {
  readonly isError: boolean;
  readonly text: string;
}

/** A handler's result (the compact routes type it `unknown`) as an answer. */
export function answerOf(value: unknown): Answer {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`Not a tool answer: ${String(value)}`);
  }
  const isError = 'isError' in value && value.isError === true;
  const content = 'content' in value ? value.content : undefined;
  const first: unknown = Array.isArray(content) ? content[0] : undefined;
  if (typeof first !== 'object' || first === null) return { isError, text: '' };
  // A text item, or a json item read as its JSON text.
  if ('text' in first && typeof first.text === 'string') {
    return { isError, text: first.text };
  }
  if ('json' in first) return { isError, text: JSON.stringify(first.json) };
  return { isError, text: '' };
}

const asResult = (answer: Answer): ToolResultLike => ({
  isError: answer.isError,
  content: [{ type: 'text', text: answer.text }],
});

/** The lock handle a lock answer carries, or `undefined`. */
function lockHandleIn(answer: Answer): string | undefined {
  try {
    const payload: unknown = JSON.parse(answer.text);
    const handle =
      typeof payload === 'object' && payload !== null
        ? Reflect.get(payload, 'lock_handle')
        : undefined;
    return typeof handle === 'string' && handle !== '' ? handle : undefined;
  } catch {
    return undefined;
  }
}

/** A step's answer, or what it threw, as an answer and its outcome. */
async function sent(call: () => Promise<unknown>) {
  try {
    const answer = answerOf(await call());
    return { answer, outcome: answerOutcome(asResult(answer)) };
  } catch (thrown) {
    return {
      answer: { isError: true, text: thrownWords(thrown) },
      outcome: thrownOutcome(thrown),
    };
  }
}

export interface SoftSteps {
  /** A step that must succeed: its answer, or the test ends with its outcome. */
  must(label: string, call: () => Promise<unknown>): Promise<Answer>;
  /** A lock that must succeed; its handle is `held` and released by `release`. */
  lock(
    object: { type: string; name: string },
    label: string,
    call: () => Promise<unknown>,
    release: (handle: string) => Promise<unknown>,
  ): Promise<string>;
  /** The unlock of a `held` lock, sent once; it must succeed. */
  unlock(handle: string, label: string): Promise<Answer>;
  /** A create that must succeed; the object is owned before it is sent. */
  create(
    kind: string,
    name: string,
    label: string,
    call: () => Promise<unknown>,
  ): Promise<Answer>;
  /**
   * A create whose answer the suite judges itself (SAP may store the object
   * and refuse it): the object is owned `unconfirmed` before it is sent and
   * stays owned whatever the answer, so cleanup deletes it. Answers the
   * answer and its outcome; throws nothing.
   */
  attempt(
    kind: string,
    name: string,
    label: string,
    call: () => Promise<unknown>,
  ): Promise<{ answer: Answer; outcome: ReturnType<typeof answerOutcome> }>;
  /** A delete that must succeed, sent once. */
  remove(
    name: string,
    label: string,
    call: () => Promise<unknown>,
  ): Promise<Answer>;
  /**
   * Cleanup: every `held` lock released once, then every owned object of
   * each kind in `order` deleted once by `deleters[kind]`, newest first.
   */
  cleanUp(
    order: readonly string[],
    deleters: Readonly<Record<string, (name: string) => Promise<unknown>>>,
  ): Promise<void>;
}

/**
 * The steps of a suite on `connection`. `record` gets every answer, for the
 * log the run is read from.
 */
export function softSteps(
  connection: object,
  record: (label: string, answer: Answer) => void,
): SoftSteps {
  const locks = heldLocksOf(connection);
  const owned = ownedObjectsOf(connection);
  const releases = new Map<string, () => Promise<unknown>>();

  const settle = (
    label: string,
    step: { answer: Answer; outcome: ReturnType<typeof answerOutcome> },
  ): Answer => {
    locks.takeInLeftLocked(asResult(step.answer));
    // A lost session ended every lock of it (SAP released them).
    if (step.outcome === 'session-lost') locks.sessionLost();
    record(label, step.answer);
    if (step.outcome !== 'ok') {
      throw new StepFailure(label, step.outcome, step.answer.text);
    }
    return step.answer;
  };

  const sendUnlock = async (handle: string, label: string) => {
    const release = releases.get(handle);
    if (release === undefined) {
      throw new Error(`${label}: no lock of this run has that handle`);
    }
    locks.unlockSent(handle);
    const step = await sent(release);
    locks.unlockAnswered(handle, step.outcome);
    return step;
  };

  return {
    must: async (label, call) => settle(label, await sent(call)),

    lock: async (object, label, call, release) => {
      const step = await sent(call);
      // A lock's answer carries the handle: it is never recorded.
      const answer = settle(
        label,
        step.outcome === 'ok'
          ? { ...step, answer: { isError: false, text: 'locked' } }
          : step,
      );
      if (answer.isError) throw new Error(`${label} answered an error`);
      const handle = lockHandleIn(step.answer);
      if (handle === undefined) {
        throw new Error(`${label} answered no lock handle`);
      }
      releases.set(handle, () => release(handle));
      locks.hold(
        {
          object_type: object.type,
          object_name: object.name,
          lock_handle: handle,
        },
        async () => {
          const step = await sent(() => release(handle));
          record(`cleanup unlock ${object.name}`, step.answer);
          return step.answer;
        },
      );
      return handle;
    },

    unlock: async (handle, label) =>
      settle(label, await sendUnlock(handle, label)),

    create: async (kind, name, label, call) => {
      let step: { answer: Answer; outcome: ReturnType<typeof answerOutcome> } =
        { answer: { isError: true, text: '' }, outcome: 'unclassified' };
      await owned.create(kind, name, async () => {
        step = await sent(call);
        return asResult(step.answer);
      });
      return settle(label, step);
    },

    attempt: async (kind, name, label, call) => {
      owned.mayExist(kind, name);
      const step = await sent(call);
      locks.takeInLeftLocked(asResult(step.answer));
      if (step.outcome === 'session-lost') locks.sessionLost();
      record(label, step.answer);
      return step;
    },

    remove: async (name, label, call) => {
      let step:
        | { answer: Answer; outcome: ReturnType<typeof answerOutcome> }
        | undefined;
      await owned.delete(name, async () => {
        step = await sent(call);
        return asResult(step.answer);
      });
      if (step === undefined) {
        throw new StepFailure(
          label,
          'unclassified',
          'not sent: its delete was sent before and not answered ok',
        );
      }
      return settle(label, step);
    },

    cleanUp: async (order, deleters) => {
      await locks.releaseAll(undefined, (line) =>
        record('cleanup lock', { isError: true, text: line }),
      );
      for (const kind of order) {
        const deleter = deleters[kind];
        if (deleter === undefined) continue;
        for (const name of owned.newestFirst(kind)) {
          const state = owned.stillOwned.find((o) => o.name === name)?.state;
          if (state === 'delete-sent') {
            record(`cleanup ${kind} ${name}`, {
              isError: true,
              text: 'deletion unconfirmed: its delete was sent and not answered ok; not sent again',
            });
            continue;
          }
          let answer: Answer = { isError: true, text: '' };
          await owned.delete(name, async () => {
            const step = await sent(() => deleter(name));
            answer = step.answer;
            // A lock the delete's own handler left behind is still owned.
            locks.takeInLeftLocked(asResult(step.answer));
            if (step.outcome === 'session-lost') locks.sessionLost();
            return asResult(step.answer);
          });
          record(`cleanup delete ${kind} ${name}`, answer);
        }
      }
    },
  };
}
