/**
 * `detail` selects a reading — before the call, never after it.
 *
 * What a tool answers is decided by the result strategy the handler passes
 * into the adt-clients member. A tool states one small table, a
 * {@link DetailTable}: for each level of `detail`, the reading of the slot.
 * The handler looks up the level the caller asked for (`readingAt`), passes
 * that reading in the member's result set, and answers the reading's value as
 * it is (`answered`) — nothing is trimmed or reshaped afterwards. A new level,
 * or a new shape of one, is a new entry of the table.
 *
 * The entries a table is built from:
 * - {@link rawLevel} — the document as ADT sent it, answered as text;
 * - {@link fullLevel} — the whole parse (`structured`), the document itself
 *   when it does not parse: what `full` has always answered;
 * - {@link formatted} — a typed reading (one adt-strategies ships, or
 *   {@link structuredValue} where the shipped one answers less than the tool),
 *   and a pure formatter of its value (a terse JSON answer, or a TSV list from
 *   `./tsv`).
 *
 * Every entry keeps the reading's `raw` and `status` beside its value, so a
 * failure path that reads them keeps working whatever the level.
 */

import type { IAdtWireResponse } from '@mcp-abap-adt/interfaces-adt-connection';
import { type AdtReading, parseStructure, rawOf } from '../strategies/reading';
import type { XmlNode } from '../xml/node';

/**
 * The levels of `detail`: `terse` (the default: what the next call needs),
 * `medium` (every field of the typed reading, without XML leftovers — for now
 * the same reading as `full` in every table), `full` (the whole parse), `raw`
 * (the document as ADT sent it).
 */
export type DetailLevel = 'terse' | 'medium' | 'full' | 'raw';

/** The levels, in order: what the `detail` schema accepts. */
export const DETAIL_LEVELS = ['terse', 'medium', 'full', 'raw'] as const;

/** A level's reading: the slot's result strategy, its value the answer. */
export type LevelReading<P> = (answer: IAdtWireResponse) => AdtReading<P>;

/** A tool's table: one reading per level, each answering a `P`. */
export type DetailTable<P> = { readonly [L in DetailLevel]: LevelReading<P> };

/** The document as ADT sent it: answered as text. */
export const rawLevel: LevelReading<string> = (answer) => {
  const raw = rawOf(answer);
  return { value: raw, raw, status: answer.status };
};

/** The whole parse; the document itself when it does not parse. */
export const fullLevel: LevelReading<XmlNode | string> = (answer) => {
  const raw = rawOf(answer);
  return { value: parseStructure(raw) ?? raw, raw, status: answer.status };
};

/** The structured parse of the answer: the value a server-side walk reads. */
export function structuredValue(answer: IAdtWireResponse): XmlNode | null {
  return parseStructure(rawOf(answer));
}

/**
 * A typed reading and a pure formatter of what it read: the value is the
 * formatter's answer, given the typed value and the answer's status.
 */
export function formatted<T, P>(
  typed: (answer: IAdtWireResponse) => T,
  format: (value: T, status: number) => P,
): LevelReading<P> {
  return (answer) => ({
    value: format(typed(answer), answer.status),
    raw: rawOf(answer),
    status: answer.status,
  });
}

/** The reading of the level asked for. */
export function readingAt<P>(
  table: DetailTable<P>,
  detail: DetailLevel,
): LevelReading<P> {
  return table[detail];
}

/** What the call answers: the reading's value, as it is. */
export function answered<P>(reading: AdtReading<P>): P {
  return reading.value;
}

/**
 * A tool's table of answers, where the answer is built from several requests
 * (a walk, a sequence): for each level, a pure formatter of the typed value
 * the requests read, selected before the first of them.
 */
export type AnswerTable<V, A> = {
  readonly [L in DetailLevel]: (value: V) => A;
};

/** The formatter of the level asked for. */
export function answerAt<V, A>(
  table: AnswerTable<V, A>,
  detail: DetailLevel,
): (value: V) => A {
  return table[detail];
}
