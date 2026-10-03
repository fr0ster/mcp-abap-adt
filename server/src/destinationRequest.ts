/**
 * What the HTTP and SSE transports share about a request's destination:
 * reading `x-mcp-destination`, and answering a destination that fails.
 */

import {
  assertDestinationName,
  describeAuthError,
} from '@mcp-abap-adt/lib/auth';

/** `x-mcp-destination` is not a destination name. Its message names the header, never the value. */
export class DestinationHeaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DestinationHeaderError';
  }
}

/**
 * The destination `x-mcp-destination` names — only when the server allows
 * the header, and only when the value is a name, not a path. Checked here,
 * before anything is looked up for it.
 */
export function destinationFromHeader(
  headers: Record<string, string | string[] | undefined>,
  allowDestinationHeader: boolean,
): string | undefined {
  if (!allowDestinationHeader) return undefined;
  const raw = headers['x-mcp-destination'];
  if (raw === undefined) return undefined;
  const value = Array.isArray(raw) ? (raw[0] ?? '') : raw;
  try {
    assertDestinationName(value, 'x-mcp-destination');
  } catch (error) {
    throw new DestinationHeaderError(
      error instanceof Error ? error.message : 'x-mcp-destination: refused.',
    );
  }
  return value;
}

/**
 * How a request whose destination failed is answered: a refused header is
 * the client's (400); an authentication error the server knows is answered
 * in its own words (`describeAuthError`: field names and vetted vocabulary
 * only); anything else as before, without its message.
 */
export function destinationFailureAnswer(error: unknown): {
  status: number;
  text: string;
  /** Whether the text is the error's own vetted words. */
  known: boolean;
} {
  if (error instanceof DestinationHeaderError) {
    return { status: 400, text: error.message, known: true };
  }
  const words = describeAuthError(error);
  if (words !== undefined) return { status: 500, text: words, known: true };
  return { status: 500, text: 'Internal Server Error', known: false };
}
