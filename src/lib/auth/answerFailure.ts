/**
 * What the MCP client sees of a read failure, and what stderr
 * gets of it.
 *
 * The answer is an `isError` result whose text is JSON in the shape of the
 * server's local failures: `{ error, kind?, message, hint?, cause_kind?,
 * server? }`, each field copied by name from the read failure. Never in it:
 * the chain error's `diagnostics` or `facts`, a thrown value's message, a
 * token, a URL with a query, `state`. The stderr line is auth-errors'
 * `logFields` of the chain error — the one place its diagnostics go.
 */

import { type LogFields, logFields } from '@mcp-abap-adt/auth-errors';
import type { ReadFailure } from './failures';

export interface FailureAnswer {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
}

/** The failure payload, field by field. */
export function failurePayload(read: ReadFailure): Record<string, string> {
  const payload: Record<string, string> = {
    error: read.error,
  };
  if (read.kind !== undefined) payload.kind = read.kind;
  payload.message = read.message;
  if (read.hint !== undefined) payload.hint = read.hint;
  if (read.causeKind !== undefined) payload.cause_kind = read.causeKind;
  if (read.server !== undefined) payload.server = read.server;
  return payload;
}

/** The client's answer for `read`. */
export function answerFailure(read: ReadFailure): FailureAnswer {
  return {
    isError: true,
    content: [
      { type: 'text', text: JSON.stringify(failurePayload(read), null, 2) },
    ],
  };
}

/**
 * The answer for `read`, with its stderr line written: what every answer site
 * (the tool wrapper, `return_error`, `return_answer`, `answer()`) does with a
 * read failure.
 */
export function answerRead(read: ReadFailure, where = 'MCP'): FailureAnswer {
  process.stderr.write(`${failureLogLine(where, read)}\n`);
  return answerFailure(read);
}

/** What a log line may carry of `read`: `logFields` of its chain error, else nothing. */
export function failureLogFields(read: ReadFailure): LogFields | undefined {
  return read.authError === undefined ? undefined : logFields(read.authError);
}

/**
 * The stderr line for a failure the server answered: fixed words, the
 * answer's `error`, and `logFields` of the chain error when there is one.
 */
export function failureLogLine(where: string, read: ReadFailure): string {
  const fields = failureLogFields(read);
  return fields === undefined
    ? `[${where}] ${read.error}`
    : `[${where}] ${read.error}: ${JSON.stringify(fields)}`;
}
