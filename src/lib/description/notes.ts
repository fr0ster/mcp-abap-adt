/**
 * The shared sentences a tool's description ends with, each a typed note —
 * the words of `withLongToolAdvice` and `withBatchSentence`, unchanged.
 */

import { batchSentence } from '../batch/sentence';
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

/** Whether and how `tool` runs in batch mode. */
export function batchable(tool: string): Note {
  return new Note(minted, batchSentence(tool));
}
