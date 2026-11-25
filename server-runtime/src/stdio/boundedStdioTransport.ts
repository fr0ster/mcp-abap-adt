/**
 * The stdio transport, every frame it writes held to what a stdio client
 * buffers.
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
 * **The frame cap is the limit less one read** (`STDIO_READ_MARGIN`).
 * `ReadBuffer.append` checks the bytes it holds — the unparsed rest of the
 * frame being read — plus the new chunk, before it splits lines. The rest is
 * less than one frame and the chunk is one read of the client's stdio
 * stream (at most the margin, for the clients `STDIO_READ_MARGIN` names), so a frame of at most `limit − margin` bytes never makes the sum
 * pass `limit`, whatever frames are written back to back.
 *
 * Every frame is measured as written, a replacement included:
 * - a response over the cap: answered the JSON-RPC error `InternalError`, in
 *   fixed words naming both sizes, and the server stays up; when even that
 *   answer is over the cap (an id longer than the cap's room), nothing is
 *   written and one stderr line says so;
 * - a notification over the cap: not written; one stderr line;
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
 * Room kept free below the limit for one read of the client's stdio stream:
 * 1 MiB. Verified per client, each reading less:
 * - Node (the SDK's `StdioClientTransport`): at most 65,536 bytes a chunk —
 *   libuv hands every read a 64 KiB buffer (`uv__read`, `src/unix/stream.c`;
 *   on Unix a child's stdio is a socket; Windows `src/win/pipe.c`, source
 *   only). Measured on Linux (2026-11-22, Node 26): 8 MiB from a child's
 *   stdout arrived in chunks of at most 65,536 bytes.
 * - Python MCP over AnyIO: `StreamReader.read(65536)`.
 * - The TS SDK hosted on Bun (Claude Code ships as a Bun binary): 262,144
 *   bytes a chunk, measured on Linux (2026-11-22, Bun 1.3.13), 8 MiB from a
 *   child's stdout read through `node:child_process`.
 * A client that reads larger chunks needs a correspondingly lower
 * `--stdio-message-limit`.
 */
export const STDIO_READ_MARGIN = 1024 * 1024;

/**
 * The smallest frame cap a stated limit may leave: 1 MiB. Every frame the
 * server must be able to send fits in it: the handshake's `initialize`
 * answer (217 bytes), an `InternalError` replacement (under 400 bytes for an
 * id of a few dozen characters) and the largest tool list (396,575 bytes,
 * the full set on premise with the data tools; 378,189 on the cloud) —
 * measured on this build's stdio binaries, 2026-11-22.
 */
export const STDIO_MIN_FRAME_CAP = 1024 * 1024;

/** The smallest `--stdio-message-limit`: the smallest cap plus the margin (2 MiB). */
export const STDIO_MIN_MESSAGE_LIMIT = STDIO_MIN_FRAME_CAP + STDIO_READ_MARGIN;

/** The longest frame the server writes to a client that buffers `limit` bytes. */
export function frameCapOf(limit: number): number {
  return limit - STDIO_READ_MARGIN;
}

/** The longest frame the server writes on stdio by default. */
export const STDIO_FRAME_CAP = frameCapOf(STDIO_MESSAGE_LIMIT);

/** The words every refusal of a frame ends its size with. */
export const ONE_MESSAGE_WORDS = 'bytes a stdio client is sent as one message';

/** The words of an answer too long for a stdio client. */
export function oversizedAnswerWords(size: number, cap: number): string {
  return `The answer is ${size} bytes, above the ${cap} ${ONE_MESSAGE_WORDS}; it was not sent. Ask for less: a call with a narrower scope or filter answers a shorter one.`;
}

/** The stderr line of a notification too long for a stdio client. */
export function droppedNotificationLine(size: number, cap: number): string {
  return `[MCP] A notification of ${size} bytes, above the ${cap} ${ONE_MESSAGE_WORDS}, was not sent\n`;
}

/** The stderr line of a response whose error answer is too long as well. */
export function droppedResponseLine(size: number, cap: number): string {
  return `[MCP] A response of ${size} bytes, above the ${cap} ${ONE_MESSAGE_WORDS}, was not sent, and its error answer is above it too\n`;
}

/** The words of a request of the server too long for a stdio client. */
export function oversizedRequestWords(size: number, cap: number): string {
  return `A request of ${size} bytes, above the ${cap} ${ONE_MESSAGE_WORDS}, was not sent`;
}

/** What the transport does with one message: write it, drop it, or refuse it. */
export type BoundedSend =
  | { kind: 'send'; message: JSONRPCMessage }
  | { kind: 'drop'; line: string }
  | { kind: 'refuse'; words: string };

/** The bytes of `message` as serialised on stdio. */
function frameSize(message: JSONRPCMessage): number {
  return Buffer.byteLength(serializeMessage(message), 'utf8');
}

/**
 * `message` held to `cap` bytes as serialised on stdio: within it, sent as
 * it is; a response over it answered `InternalError` naming both sizes when
 * that answer fits, else dropped with a stderr line; a notification over it
 * dropped with a stderr line; a request over it refused.
 */
export function boundedMessage(
  message: JSONRPCMessage,
  cap: number,
): BoundedSend {
  const size = frameSize(message);
  if (size <= cap) return { kind: 'send', message };
  if (isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message)) {
    const replacement: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: ErrorCode.InternalError,
        message: oversizedAnswerWords(size, cap),
      },
    };
    return frameSize(replacement) <= cap
      ? { kind: 'send', message: replacement }
      : { kind: 'drop', line: droppedResponseLine(size, cap) };
  }
  if (isJSONRPCNotification(message)) {
    return { kind: 'drop', line: droppedNotificationLine(size, cap) };
  }
  if (isJSONRPCRequest(message)) {
    return { kind: 'refuse', words: oversizedRequestWords(size, cap) };
  }
  return { kind: 'drop', line: droppedNotificationLine(size, cap) };
}

/** The SDK's stdio server transport, every frame held to `cap` (`boundedMessage`). */
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
