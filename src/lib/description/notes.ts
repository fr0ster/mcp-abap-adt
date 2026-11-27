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

/**
 * A data read: SAP's own row bound, which applies when the consumer gives
 * none. Measured on the BTP ABAP environment (2026-11-27,
 * `/sap/bc/adt/datapreview/freestyle`): without `rowNumber` SAP answered 100
 * records of selections of 163, 249, 1716 and 8466 (fr0ster/mcp-abap-adt#391).
 */
export const sapRowBound: Note = new Note(
  minted,
  'A missing bound leaves the bound to SAP: at most 100 records. When fewer records come back than the selection holds, the answer names how many came back, of how many, and what cut them.',
);

/** Whether and how `tool` runs in batch mode. */
export function batchable(tool: string): Note {
  return new Note(minted, batchSentence(tool));
}
