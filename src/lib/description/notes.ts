/**
 * The shared sentences a tool's description ends with, each a typed note —
 * the words of `withLongToolAdvice` and `withBatchSentence`, unchanged.
 */

import { batchSentence } from '../batch/sentence';
import { LONG_TOOL_ADVICE } from '../longTools';

/** Only this module mints a note. */
const minted: unique symbol = Symbol('note');

/** A shared sentence of a description; only this module's factories make one. */
export interface Note {
  readonly [minted]: true;
  readonly text: string;
}

/** A tool that runs on an ABAP session of its own, answered by a run handle. */
export const longRunning: Note = { [minted]: true, text: LONG_TOOL_ADVICE };

/** Whether and how `tool` runs in batch mode. */
export function batchable(tool: string): Note {
  return { [minted]: true, text: batchSentence(tool) };
}
