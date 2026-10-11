/**
 * What the HTTP and SSE transports share about a request's destination:
 * reading `x-mcp-destination`, and answering a destination that fails.
 */

import { failureLogLine } from '../auth/answerFailure';
import { assertDestinationName } from '../auth/destinationName';
import { failureOf, type ReadFailure } from '../auth/failures';
import { serverRefusalOf } from '../auth/serverRefusal';

/** `x-mcp-destination` is not a destination name. Its words name the header, never the value. */
export class DestinationHeaderError extends Error {
  /** The refusal's vetted words (the header's label, never its value). */
  readonly words: string;

  constructor(words: string) {
    super(words);
    this.name = 'DestinationHeaderError';
    this.words = words;
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
      serverRefusalOf(error)?.words ?? 'x-mcp-destination: refused.',
    );
  }
  return value;
}

/** What reads a thrown value as an answer: lib's `failureOf`, or the host's (core's destination layer first). */
export type FailureReader = (thrown: unknown) => ReadFailure | undefined;

/**
 * How a request whose destination failed is answered: a refused header is
 * the client's (400); a failure the reader knows is answered in its words
 * (its §7.3 message and hint), with `logLine` for stderr (`logFields`);
 * anything else as before, without its message.
 */
export function destinationFailureAnswer(
  error: unknown,
  read: FailureReader = failureOf,
): {
  status: number;
  text: string;
  /** Whether the text is the failure's own vetted words. */
  known: boolean;
  /** What stderr gets of a read failure. */
  logLine?: string;
} {
  if (error instanceof DestinationHeaderError) {
    return { status: 400, text: error.words, known: true };
  }
  const answer = read(error);
  if (answer !== undefined) {
    const text = [answer.message, answer.hint, answer.server]
      .filter((line): line is string => line !== undefined)
      .join('\n');
    return {
      status: 500,
      text,
      known: true,
      logLine: failureLogLine('destination', answer),
    };
  }
  return { status: 500, text: 'Internal Server Error', known: false };
}

/**
 * Per destination, one request at a time sets its connection context, and
 * the first one also connects — presents the credential, which is the first
 * login — before the next starts. Two first logins never run at once.
 * A failed first connect leaves the next request to connect again.
 */
export class FirstConnectLock {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly connected = new Set<string>();

  run(
    destination: string,
    setContext: () => Promise<void>,
    connect: () => Promise<unknown>,
  ): Promise<void> {
    const previous = this.queues.get(destination) ?? Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(async () => {
        await setContext();
        if (!this.connected.has(destination)) {
          await connect();
          this.connected.add(destination);
        }
      });
    const settled = work.finally(() => {
      if (this.queues.get(destination) === settled) {
        this.queues.delete(destination);
      }
    });
    // Set before any await: the next request queues behind this one.
    this.queues.set(destination, settled);
    return settled;
  }
}
