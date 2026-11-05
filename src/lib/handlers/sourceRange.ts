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
 * What is known before the GET is refused before it: a line that is not a
 * positive integer, and `end_line` before `start_line`. Whether a range
 * lies inside the source is known only from the answer, so a range outside
 * it is refused after the one GET, naming the source's line count.
 */

import type { IAdtError, IAdtResponse } from '@mcp-abap-adt/interfaces-adt';
import * as z from 'zod';
import {
  type AnswerContext,
  answer,
  answerThrown,
  type McpResult,
} from '../answer';
import type { AdtReading } from '../strategies/reading';
import { return_error } from '../utils';

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

/** Whether `line` is a line number: a positive integer. */
const isLine = (line: number): boolean => Number.isInteger(line) && line >= 1;

/**
 * The range `args` asks for: `undefined` when it gives neither end, an
 * error for what is refused before any request.
 */
export function sourceRangeOf(
  args: SourceRangeArgs,
): SourceRange | undefined | Error {
  const { start_line: start, end_line: end } = args;
  if (start === undefined && end === undefined) return undefined;
  if (start !== undefined && !isLine(start)) {
    return new Error('start_line must be a whole number from 1');
  }
  if (end !== undefined && !isLine(end)) {
    return new Error('end_line must be a whole number from 1');
  }
  if (start !== undefined && end !== undefined && end < start) {
    return new Error('end_line must not be before start_line');
  }
  return { start, end };
}

/**
 * The lines of `source`, split at each line feed; a line feed at the end
 * closes the last line and opens none. A carriage return stays with its
 * line, so the lines join back to the text they came from.
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
  return {
    text: lines.slice(start - 1, end).join('\n'),
    start_line: start,
    end_line: end,
    line_count: count,
  };
}

/**
 * A source read's answer: `call` sent once; on success its text, or the
 * lines `range` names (`answerOf` given the cut), or the refusal when the
 * range lies outside the text; SAP's refusal and a throw as `answer()`
 * gives them.
 */
export async function answerSourceRead(
  ctx: AnswerContext,
  range: SourceRange | undefined,
  call: () => Promise<IAdtResponse<AdtReading<string>, IAdtError>>,
  answerOf: (source: string, cut: SourceCut | undefined) => unknown,
): Promise<McpResult> {
  if (range === undefined) {
    return answer(ctx, call, (reading) => answerOf(reading.raw, undefined));
  }
  let response: IAdtResponse<AdtReading<string>, IAdtError>;
  try {
    response = await call();
  } catch (thrown) {
    return answerThrown(thrown, ctx);
  }
  if (!response.ok)
    return answer(
      ctx,
      async () => response,
      () => undefined,
    );
  const cut = cutSource(response.getResult().value.raw, range);
  if (cut instanceof Error) return return_error(cut);
  return answer(
    ctx,
    async () => response,
    () => answerOf(cut.text, cut),
  );
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
