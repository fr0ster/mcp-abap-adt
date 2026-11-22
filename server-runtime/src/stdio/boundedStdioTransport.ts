/**
 * The stdio transport, every message it writes held to what a stdio client
 * reads as one.
 *
 * The MCP SDK's stdio client buffers at most `STDIO_DEFAULT_MAX_BUFFER_SIZE`
 * bytes (10 MiB, its `ReadBuffer`); past that it closes the transport — it
 * ends the server's stdin, then signals `SIGTERM` and `SIGKILL` — so the call
 * answers "Connection closed", every later one "Not connected", and the
 * server shuts down. Measured on premise (2026-11-22, BASIS 816) with the
 * SDK's client: the where-used list of a heavily used class, 107,174
 * references, answered 154 million characters from SAP and a tool answer of
 * 65.7 million; the client closed the transport and the server ended.
 *
 * **The frame cap is the limit less one pipe read** (`STDIO_READ_MARGIN`).
 * `ReadBuffer.append` checks the bytes it holds — the unparsed rest of the
 * frame being read — plus the new chunk, before it splits lines. The rest is
 * less than one frame, and the chunk is at most one read of the pipe, so a
 * frame of at most `limit − margin` bytes never makes the sum pass `limit`,
 * whatever frames are written back to back.
 *
 * What the server writes:
 * - a response over the cap: not written; its request is answered the
 *   JSON-RPC error `InternalError`, in fixed words naming both sizes, and the
 *   server stays up;
 * - a notification over the cap: not written; one stderr line in fixed words;
 * - a request over the cap: not written; its send fails here, so the request
 *   fails on the server's side;
 * - anything within the cap: as it is.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  STDIO_DEFAULT_MAX_BUFFER_SIZE,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import {
  ErrorCode,
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';

/**
 * The bytes a stdio client buffers at most when `--stdio-message-limit` is
 * not given: the MCP SDK client's default read buffer
 * (`STDIO_DEFAULT_MAX_BUFFER_SIZE`, 10 MiB, `shared/stdio.js`) — the SDK's
 * value, not one of ours.
 */
export const STDIO_MESSAGE_LIMIT = STDIO_DEFAULT_MAX_BUFFER_SIZE;

/**
 * The most one read of the client's pipe can deliver, kept free below the
 * limit. 1 MiB: the most a Linux pipe holds (`/proc/sys/fs/pipe-max-size`,
 * default 1048576, the ceiling of `F_SETPIPE_SZ`; the default capacity is
 * 64 KiB), so no read returns more. A Node client reads less: libuv reads a
 * stream into a 64 KiB buffer on Unix and Windows alike — measured on Linux
 * (2026-11-22, Node 26): 8 MiB written to a child's stdout arrived in
 * chunks of at most 65,536 bytes. macOS caps a pipe's buffer at 64 KiB.
 */
export const STDIO_READ_MARGIN = 1024 * 1024;

/** The longest frame the server writes to a client that buffers `limit` bytes. */
export function frameCapOf(limit: number): number {
  return limit - STDIO_READ_MARGIN;
}

/** The longest frame the server writes on stdio by default. */
export const STDIO_FRAME_CAP = frameCapOf(STDIO_MESSAGE_LIMIT);

/** The words of an answer too long for a stdio client. */
export function oversizedAnswerWords(size: number, cap: number): string {
  return `The answer is ${size} bytes, above the ${cap} bytes a stdio client is sent as one message; it was not sent. Ask for less: a call with a narrower scope or filter answers a shorter one.`;
}

/** The stderr line of a notification too long for a stdio client. */
export function droppedNotificationLine(size: number, cap: number): string {
  return `[MCP] A notification of ${size} bytes, above the ${cap} bytes a stdio client is sent as one message, was not sent\n`;
}

/** The words of a request of the server too long for a stdio client. */
export function oversizedRequestWords(size: number, cap: number): string {
  return `A request of ${size} bytes, above the ${cap} bytes a stdio client is sent as one message, was not sent`;
}

/** What the transport does with one message: write it, drop it, or refuse it. */
export type BoundedSend =
  | { kind: 'send'; message: JSONRPCMessage }
  | { kind: 'drop'; line: string }
  | { kind: 'refuse'; words: string };

/**
 * `message` held to `cap` bytes as serialised on stdio: within it, sent as
 * it is; a response over it answered `InternalError` naming both sizes; a
 * notification over it dropped with a stderr line; a request over it
 * refused.
 */
export function boundedMessage(
  message: JSONRPCMessage,
  cap: number,
): BoundedSend {
  const size = Buffer.byteLength(serializeMessage(message), 'utf8');
  if (size <= cap) return { kind: 'send', message };
  if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) {
    return {
      kind: 'send',
      message: {
        jsonrpc: '2.0',
        id: message.id,
        error: {
          code: ErrorCode.InternalError,
          message: oversizedAnswerWords(size, cap),
        },
      },
    };
  }
  if (isJSONRPCNotification(message)) {
    return { kind: 'drop', line: droppedNotificationLine(size, cap) };
  }
  if (isJSONRPCRequest(message)) {
    return { kind: 'refuse', words: oversizedRequestWords(size, cap) };
  }
  return { kind: 'send', message };
}

/** The SDK's stdio server transport, every message held to `cap` (`boundedMessage`). */
export class BoundedStdioServerTransport extends StdioServerTransport {
  readonly #cap: number;
  readonly #stderr: (line: string) => void;

  constructor(
    cap: number = STDIO_FRAME_CAP,
    stderr: (line: string) => void = (line) => {
      process.stderr.write(line);
    },
    ...transport: ConstructorParameters<typeof StdioServerTransport>
  ) {
    super(...transport);
    this.#cap = cap;
    this.#stderr = stderr;
  }

  /** The longest frame this transport writes. */
  get cap(): number {
    return this.#cap;
  }

  override async send(message: JSONRPCMessage): Promise<void> {
    const bounded = boundedMessage(message, this.#cap);
    if (bounded.kind === 'drop') {
      this.#stderr(bounded.line);
      return;
    }
    if (bounded.kind === 'refuse') throw new Error(bounded.words);
    return super.send(bounded.message);
  }
}
