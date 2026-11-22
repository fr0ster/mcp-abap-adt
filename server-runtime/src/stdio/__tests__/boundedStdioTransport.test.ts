/**
 * The stdio transport writes no message longer than a stdio client reads as
 * one (`BoundedStdioServerTransport`): the MCP SDK's client closes the
 * transport on a longer line — the server's stdin ends and the server shuts
 * down — so a response over the limit is answered `InternalError` naming
 * both sizes, and every other message goes as it is. The client side is the
 * SDK's own `ReadBuffer` at its default limit, as `StdioClientTransport`
 * builds it.
 */

import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { describe, it } from 'node:test';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ReadBuffer,
  STDIO_DEFAULT_MAX_BUFFER_SIZE,
  serializeMessage,
} from '@modelcontextprotocol/sdk/shared/stdio.js';
import {
  ErrorCode,
  isJSONRPCErrorResponse,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import type { IDestinations } from '../auth/IAuthBrokerFactory.js';
import {
  BoundedStdioServerTransport,
  boundedMessage,
  oversizedAnswerWords,
  STDIO_MESSAGE_LIMIT,
} from '../boundedStdioTransport.js';
import { StdioServer } from '../StdioServer.js';

/** A tool call's answer of `chars` characters, as response `id`. */
function answerOf(id: number, chars: number): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text: 'x'.repeat(chars) }] },
  };
}

/** What `transport` wrote for `message`, as the bytes on stdout. */
async function written(
  make: (stdin: PassThrough, stdout: PassThrough) => StdioServerTransport,
  message: JSONRPCMessage,
): Promise<Buffer> {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const chunks: Buffer[] = [];
  stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  const transport = make(stdin, stdout);
  await transport.start();
  await transport.send(message);
  await transport.close();
  return Buffer.concat(chunks);
}

/** The messages the SDK client's buffer reads out of `bytes`, at its default limit. */
function clientReads(bytes: Buffer): JSONRPCMessage[] {
  const buffer = new ReadBuffer();
  const read: JSONRPCMessage[] = [];
  // A client takes a pipe's chunks one at a time.
  for (let at = 0; at < bytes.length; at += 65536) {
    buffer.append(bytes.subarray(at, at + 65536));
    for (let m = buffer.readMessage(); m !== null; m = buffer.readMessage()) {
      read.push(m);
    }
  }
  return read;
}

const bounded = (stdin: PassThrough, stdout: PassThrough) =>
  new BoundedStdioServerTransport(STDIO_MESSAGE_LIMIT, stdin, stdout);

describe('the stdio message limit', () => {
  it("is the SDK client's buffer", () => {
    assert.equal(STDIO_MESSAGE_LIMIT, STDIO_DEFAULT_MAX_BUFFER_SIZE);
  });

  it("an answer over it closes the SDK client's buffer when sent as it is", async () => {
    const bytes = await written(
      (stdin, stdout) => new StdioServerTransport(stdin, stdout),
      answerOf(7, STDIO_MESSAGE_LIMIT + 1024),
    );
    assert.throws(() => clientReads(bytes), /ReadBuffer exceeded maximum size/);
  });

  it('an answer over it is answered InternalError naming both sizes, which the client reads', async () => {
    const message = answerOf(7, STDIO_MESSAGE_LIMIT + 1024);
    const size = Buffer.byteLength(serializeMessage(message), 'utf8');
    const read = clientReads(await written(bounded, message));
    assert.equal(read.length, 1);
    const [answer] = read;
    assert.ok(isJSONRPCErrorResponse(answer), JSON.stringify(answer));
    assert.equal(answer.id, 7);
    assert.equal(answer.error.code, ErrorCode.InternalError);
    assert.equal(
      answer.error.message,
      oversizedAnswerWords(size, STDIO_MESSAGE_LIMIT),
    );
    assert.ok(answer.error.message.includes(String(size)));
  });

  it('an answer within it is written as it is', async () => {
    const message = answerOf(8, 4096);
    const bytes = await written(bounded, message);
    assert.equal(bytes.toString('utf8'), serializeMessage(message));
    assert.deepEqual(clientReads(bytes), [message]);
  });

  it('an error answer over it is answered InternalError too', () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      id: 9,
      error: { code: -32000, message: 'y'.repeat(200) },
    };
    const answer = boundedMessage(message, 100);
    assert.ok(isJSONRPCErrorResponse(answer));
    assert.equal(answer.id, 9);
    assert.equal(answer.error.code, ErrorCode.InternalError);
  });

  it('a notification is written as it is, whatever its size', () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: { level: 'info', data: 'z'.repeat(200) },
    };
    assert.equal(boundedMessage(message, 100), message);
  });
});

describe("the stdio server's own transport", () => {
  it('is the bounded one', async () => {
    const server = new StdioServer(
      new CompositeHandlersRegistry([]),
      {} as IDestinations,
    );
    await server.start(undefined);
    try {
      assert.ok(server.server.transport instanceof BoundedStdioServerTransport);
    } finally {
      await server.close();
    }
  });
});
