/**
 * The stdio transport, every message it writes held to what a stdio client
 * reads as one.
 *
 * The MCP SDK's stdio client buffers one message of at most
 * `STDIO_DEFAULT_MAX_BUFFER_SIZE` bytes (10 MiB, its `ReadBuffer`); a longer
 * line makes it close the transport — it ends the server's stdin, then
 * signals `SIGTERM` and `SIGKILL` — so the call answers "Connection closed",
 * every later one "Not connected", and the server shuts down. Measured on
 * premise (2026-11-22, BASIS 816) with the SDK's client: the where-used list
 * of a heavily used class, 107,174 references, answered 154 million
 * characters from SAP and a tool answer of 65.7 million; the client closed
 * the transport and the server ended.
 *
 * A response longer than the limit is not written: its request is answered
 * the JSON-RPC error `InternalError`, in fixed words naming both sizes, and
 * the server stays up. Every other message is written as it is.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  STDIO_DEFAULT_MAX_BUFFER_SIZE,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import {
  ErrorCode,
  isJSONRPCErrorResponse,
  isJSONRPCResultResponse,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';

/** The longest message, in bytes, the server writes on stdio: the SDK client's buffer. */
export const STDIO_MESSAGE_LIMIT = STDIO_DEFAULT_MAX_BUFFER_SIZE;

/** The words of an answer too long for a stdio client. */
export function oversizedAnswerWords(size: number, limit: number): string {
  return `The answer is ${size} bytes, above the ${limit} bytes a stdio client reads as one message; it was not sent. Ask for less: a call with a narrower scope or filter answers a shorter one.`;
}

/**
 * `message` as the server writes it on stdio: a response whose line is longer
 * than `limit` bytes answered `InternalError` naming both sizes; anything
 * else as it is.
 */
export function boundedMessage(
  message: JSONRPCMessage,
  limit: number,
): JSONRPCMessage {
  if (!isJSONRPCResultResponse(message) && !isJSONRPCErrorResponse(message)) {
    return message;
  }
  const size = Buffer.byteLength(serializeMessage(message), 'utf8');
  if (size <= limit) return message;
  return {
    jsonrpc: '2.0',
    id: message.id,
    error: {
      code: ErrorCode.InternalError,
      message: oversizedAnswerWords(size, limit),
    },
  };
}

/** The SDK's stdio server transport, every message bounded by `limit` (`boundedMessage`). */
export class BoundedStdioServerTransport extends StdioServerTransport {
  readonly #limit: number;

  constructor(
    limit: number = STDIO_MESSAGE_LIMIT,
    ...transport: ConstructorParameters<typeof StdioServerTransport>
  ) {
    super(...transport);
    this.#limit = limit;
  }

  override send(message: JSONRPCMessage): Promise<void> {
    return super.send(boundedMessage(message, this.#limit));
  }
}
