/**
 * The line range of a `Get<Type>` source read (`start_line`, `end_line`;
 * the owner's DO1).
 *
 * ADT serves no part of a source: measured on premise (2026-11-04),
 * `Range: bytes=…`, `Range: lines=…`, `?start/end`, `?startLine/endLine`
 * and a `#start=…;end=…` fragment each answer `200` with the whole text and
 * no `Accept-Ranges` / `Content-Range`, and no discovery template of a
 * `source` resource has a range parameter. So the read sends its one GET
 * as without a range, and the server answers only the lines asked.
 *
 * A line that is not a whole number from 1 is refused by the schema. What
 * the schema cannot see is refused here before the GET: `end_line` before
 * `start_line`, and a range given with `part` `metadata`. Whether a range
 * lies inside the source is known only from the answer, so a range outside
 * it is refused after the one GET, naming the source's line count.
 *
 * **The lines answered are exactly the lines asked.** A line ends at a line
 * feed, and a carriage return before it belongs to the line end (SAP sends
 * CRLF). The lines are joined as the source joined them — the line ends
 * between them kept as they came — and the last one answered carries no
 * line end: neither its line feed nor its carriage return.
 */

import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import { type AnswerContext, answer, type McpResult } from '../answer';
import type { AdtReading } from '../strategies/reading';
import { return_error } from '../utils';
import type { ReadPart } from './readPart';

/** The `start_line` field of a source read's zod input schema. */
export const START_LINE_FIELD = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe(
    'First line of the source to answer, from 1. Without it, from the first line.',
  );

/** The `end_line` field of a source read's zod input schema. */
export const END_LINE_FIELD = z
  .number()
  .int()
  .min(1)
  .optional()
  .describe(
    'Last line of the source to answer, included. Without it, to the last line.',
  );

/** A source read's range fields, spread into its input schema. */
export const SOURCE_RANGE_SHAPE = {
  start_line: START_LINE_FIELD,
  end_line: END_LINE_FIELD,
};

/** The range a call gave, as its fields. */
export interface SourceRangeArgs {
  start_line?: number;
  end_line?: number;
}

/** A range the call asked for: each end, where given. */
export interface SourceRange {
  readonly start: number | undefined;
  readonly end: number | undefined;
}

/** The lines answered: the cut text, its first and last line, the source's count. */
export interface SourceCut {
  readonly text: string;
  readonly start_line: number;
  readonly end_line: number;
  readonly line_count: number;
}

/**
 * The range `args` asks for: `undefined` when it gives neither end, the
 * refusal for what is refused before any request — `end_line` before
 * `start_line`, or a range with `part` `metadata` (it cuts a source only).
 * A line's own value is the schema's.
 */
export function sourceRangeOf(
  args: SourceRangeArgs,
  part: ReadPart = 'source',
): SourceRange | undefined | Error {
  const { start_line: start, end_line: end } = args;
  if (start === undefined && end === undefined) return undefined;
  if (part === 'metadata') {
    return new Error(
      'start_line and end_line cut the source: give them with part "source"',
    );
  }
  if (start !== undefined && end !== undefined && end < start) {
    return new Error('end_line must not be before start_line');
  }
  return { start, end };
}

/**
 * The lines of `source`, split at each line feed; a line feed at the end
 * closes the last line and opens none. A carriage return before a line feed
 * stays on its line here, so the lines join back with `\n` to the text they
 * came from.
 */
function linesOf(source: string): string[] {
  const lines = source.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** The lines of `source` that `range` names, or the refusal when it lies outside. */
export function cutSource(
  source: string,
  range: SourceRange,
): SourceCut | Error {
  const lines = linesOf(source);
  const count = source === '' ? 0 : lines.length;
  const start = range.start ?? 1;
  const end = range.end ?? count;
  if (start > count || end > count) {
    return new Error(
      `the range ${start}-${end} lies outside the source: the source has ${count} lines`,
    );
  }
  const text = lines.slice(start - 1, end).join('\n');
  return {
    // The last line's own line end is not answered: a CRLF's CR stays only
    // where a line follows.
    text: text.endsWith('\r') ? text.slice(0, -1) : text,
    start_line: start,
    end_line: end,
    line_count: count,
  };
}

/**
 * A source read's answer: `call` sent once; on success its text, or the
 * lines `range` names (`answerOf` given the cut), or the refusal when the
 * range lies outside the text. The answer is read inside `answer()`'s
 * boundary on both paths, so a throw there is answered as any other; SAP's
 * refusal and a throw of the call as `answer()` gives them.
 */
export async function answerSourceRead(
  ctx: AnswerContext,
  range: SourceRange | undefined,
  call: () => Promise<IAdtResponse<AdtReading<string>, IAdtError>>,
  answerOf: (source: string, cut: SourceCut | undefined) => unknown,
): Promise<McpResult> {
  let outside: Error | undefined;
  const answered = await answer(ctx, call, (reading) => {
    if (range === undefined) return answerOf(reading.raw, undefined);
    const cut = cutSource(reading.raw, range);
    if (cut instanceof Error) {
      outside = cut;
      return cut.message;
    }
    return answerOf(cut.text, cut);
  });
  return outside === undefined ? answered : return_error(outside);
}

/** The range answered beside the lines: nothing when the whole source was asked. */
export function rangeFields(cut: SourceCut | undefined): {
  start_line?: number;
  end_line?: number;
  line_count?: number;
} {
  return cut === undefined
    ? {}
    : {
        start_line: cut.start_line,
        end_line: cut.end_line,
        line_count: cut.line_count,
      };
}

/** The sentence a ranged read's description ends with: what a range answers. */
export const SOURCE_RANGE_WORDS =
  'With start_line and/or end_line, returns only those lines of the source, with start_line, end_line and line_count (the number of lines of the whole source).';
