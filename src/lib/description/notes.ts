/**
 * The shared sentences a tool's description ends with, each a typed note —
 * the words of `withLongToolAdvice` and `withBatchSentence`, unchanged.
 */

import { batchSentence, envelopeSentence } from '../batch/sentence';
import { LONG_TOOL_ADVICE } from '../longTools';

/** Only this module mints a note. */
const minted: unique symbol = Symbol('note');

/** A shared sentence of a description; only this module's factories make one — nominal. */
export class Note {
  readonly #note = true;

  constructor(
    token: typeof minted,
    readonly text: string,
  ) {
    void token;
    void this.#note;
  }
}

/** A tool that runs on an ABAP session of its own, answered by a run handle. */
export const longRunning: Note = new Note(minted, LONG_TOOL_ADVICE);

/** A tool that works under a lock a server instance holds: its state handle goes with every call. */
export const underLock: Note = new Note(
  minted,
  "Over Streamable HTTP it runs under the lock's state_handle: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).",
);

/** HandlerLock's lock: the state handle a lock with a lock handle answers. */
export const lockAnswersStateHandle: Note = new Note(
  minted,
  'Over Streamable HTTP a lock that gives a non-empty lock_handle gives a state_handle too: send it as the state_handle argument of every call under the lock (or in the x-mcp-state-handle header).',
);

/** HandlerLock's unlock: it runs under the state handle the lock gave. */
export const unlockUnderLock: Note = new Note(
  minted,
  'Over Streamable HTTP an unlock runs under the state_handle the lock gave: send it as the state_handle argument (or in the x-mcp-state-handle header).',
);

/** A tool that answers a state handle every later call of its state carries. */
export const stateHandleAnswered: Note = new Note(
  minted,
  'Over Streamable HTTP the state_handle it gives goes with every later call: send it as the state_handle argument of every call (or in the x-mcp-state-handle header).',
);

/** GetClass: the local includes of a class have reads of their own. */
export const classLocalIncludes: Note = new Note(
  minted,
  'The local definitions, local types and implementations, local macros and local test classes of the class have read tools of their own.',
);

/** Whether and how `tool` runs in batch mode. */
export function batchable(tool: string): Note {
  return new Note(minted, batchSentence(tool));
}

/** Whether and how `tool` is recorded into a read envelope: its note, or none for a tool no core entry admits. */
export function envelopable(tool: string): Note | undefined {
  const sentence = envelopeSentence(tool);
  return sentence === undefined ? undefined : new Note(minted, sentence);
}
