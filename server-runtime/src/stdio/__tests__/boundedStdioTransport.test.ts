/**
 * The stdio transport writes no frame longer than a stdio client can buffer
 * (`BoundedStdioServerTransport`): the MCP SDK's client closes the
 * transport once its buffer — the unparsed rest of a frame plus the next
 * chunk — passes its limit, and the server's stdin ends. The cap is that
 * limit less one pipe read. A response over the cap is answered
 * `InternalError` naming both sizes, a notification over it is dropped with
 * a stderr line, a request over it fails on the server's side, and every
 * other message goes as it is. The client side is the SDK's own
 * `ReadBuffer` at its default limit, as `StdioClientTransport` builds it.
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
  droppedNotificationLine,
  droppedResponseLine,
  frameCapOf,
  ONE_MESSAGE_WORDS,
  oversizedAnswerWords,
  STDIO_FRAME_CAP,
  STDIO_MESSAGE_LIMIT,
  STDIO_MIN_FRAME_CAP,
  STDIO_MIN_MESSAGE_LIMIT,
  STDIO_READ_MARGIN,
} from '../boundedStdioTransport.js';
import { StdioServer } from '../StdioServer.js';

/** A tool call's answer whose text is `text`, as response `id`. */
function answerWith(id: number, text: string): JSONRPCMessage {
  return {
    jsonrpc: '2.0',
    id,
    result: { content: [{ type: 'text', text }] },
  };
}

/** The bytes of `message` on the wire. */
const sizeOf = (message: JSONRPCMessage) =>
  Buffer.byteLength(serializeMessage(message), 'utf8');

/** An answer of exactly `bytes` bytes on the wire, as response `id`. */
function answerOfSize(id: number, bytes: number): JSONRPCMessage {
  const empty = sizeOf(answerWith(id, ''));
  return answerWith(id, 'x'.repeat(bytes - empty));
}

/** A transport on fresh streams, its stdout's bytes and stderr lines recorded. */
function recorded(
  make: (stdin: PassThrough, stdout: PassThrough) => StdioServerTransport,
) {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const chunks: Buffer[] = [];
  stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
  return { transport: make(stdin, stdout), bytes: () => Buffer.concat(chunks) };
}

/** What `make`'s transport wrote for `messages`, sent together. */
async function written(
  make: (stdin: PassThrough, stdout: PassThrough) => StdioServerTransport,
  ...messages: JSONRPCMessage[]
): Promise<Buffer> {
  const { transport, bytes } = recorded(make);
  await transport.start();
  await Promise.all(messages.map((message) => transport.send(message)));
  await transport.close();
  return bytes();
}

/**
 * The messages the SDK client's buffer reads out of `bytes`, fed `chunk`
 * bytes at a time after a first chunk of `first` bytes (a pipe's reads do
 * not line up with the frames).
 */
function clientReads(
  bytes: Buffer,
  chunk = 65536,
  first = chunk,
): JSONRPCMessage[] {
  const buffer = new ReadBuffer();
  const read: JSONRPCMessage[] = [];
  for (let at = 0; at < bytes.length; ) {
    const size = at === 0 ? first : chunk;
    buffer.append(bytes.subarray(at, at + size));
    at += size;
    for (let m = buffer.readMessage(); m !== null; m = buffer.readMessage()) {
      read.push(m);
    }
  }
  return read;
}

/** A bounded transport at `cap`, its stderr lines into `lines`. */
const bounded =
  (cap = STDIO_FRAME_CAP, lines: string[] = []) =>
  (stdin: PassThrough, stdout: PassThrough) =>
    new BoundedStdioServerTransport(
      cap,
      (line) => lines.push(line),
      stdin,
      stdout,
    );

describe('the stdio frame cap', () => {
  it("is the MCP SDK client's default buffer less one pipe read", () => {
    assert.equal(STDIO_MESSAGE_LIMIT, STDIO_DEFAULT_MAX_BUFFER_SIZE);
    assert.equal(STDIO_FRAME_CAP, STDIO_MESSAGE_LIMIT - STDIO_READ_MARGIN);
    assert.equal(new BoundedStdioServerTransport().cap, STDIO_FRAME_CAP);
  });

  it("an answer over the limit closes the SDK client's buffer when sent as it is", async () => {
    const bytes = await written(
      (stdin, stdout) => new StdioServerTransport(stdin, stdout),
      answerOfSize(7, STDIO_MESSAGE_LIMIT + 1024),
    );
    assert.throws(() => clientReads(bytes), /ReadBuffer exceeded maximum size/);
  });

  // The largest chunks measured per client: 256 KiB (the TS SDK on Bun), and
  // the margin itself. Each is fed out of step with the frames by half a
  // chunk, so the rest of a frame is in the buffer when the next arrives.
  for (const chunk of [256 * 1024, STDIO_READ_MARGIN]) {
    it(`two frames at the cap, read in chunks of ${chunk} bytes, are both read`, async () => {
      const first = answerOfSize(1, STDIO_FRAME_CAP);
      const second = answerOfSize(2, STDIO_FRAME_CAP);
      assert.equal(sizeOf(first), STDIO_FRAME_CAP);
      const read = clientReads(
        await written(bounded(), first, second),
        chunk,
        chunk / 2,
      );
      assert.deepEqual(
        read.map((m) => ('id' in m ? m.id : undefined)),
        [1, 2],
      );
      assert.equal(
        read.some((m) => isJSONRPCErrorResponse(m)),
        false,
      );
    });
  }

  it('an answer over the cap is answered InternalError naming both sizes, which the client reads', async () => {
    const message = answerOfSize(7, STDIO_FRAME_CAP + 1);
    const read = clientReads(await written(bounded(), message));
    assert.equal(read.length, 1);
    const [answer] = read;
    assert.ok(isJSONRPCErrorResponse(answer), JSON.stringify(answer));
    assert.equal(answer.id, 7);
    assert.equal(answer.error.code, ErrorCode.InternalError);
    assert.equal(
      answer.error.message,
      oversizedAnswerWords(STDIO_FRAME_CAP + 1, STDIO_FRAME_CAP),
    );
  });

  it('the cap counts bytes, not characters', () => {
    // Three bytes a character: under the cap in characters, over it in bytes.
    const message = answerWith(3, '€'.repeat(400));
    assert.ok(serializeMessage(message).length < 1000);
    assert.ok(sizeOf(message) > 1000);
    const sent = boundedMessage(message, 1000);
    assert.ok(sent.kind === 'send' && isJSONRPCErrorResponse(sent.message));
  });

  it('an answer within the cap is written as it is', async () => {
    const message = answerOfSize(8, 4096);
    const bytes = await written(bounded(), message);
    assert.equal(bytes.toString('utf8'), serializeMessage(message));
    assert.deepEqual(clientReads(bytes), [message]);
  });

  it('the smallest limit leaves the smallest cap', () => {
    assert.equal(frameCapOf(STDIO_MIN_MESSAGE_LIMIT), STDIO_MIN_FRAME_CAP);
  });

  it('the initialize answer goes as it is at the smallest cap', async () => {
    const server = new StdioServer(
      new CompositeHandlersRegistry([]),
      {} as IDestinations,
      { stdioMessageLimit: STDIO_MIN_MESSAGE_LIMIT },
    );
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const chunks: Buffer[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    const transport = new BoundedStdioServerTransport(
      server.stdioTransport().cap,
      () => {},
      stdin,
      stdout,
    );
    const answered = new Promise<void>((resolve) => {
      stdout.on('data', () => resolve());
    });
    await server.start(undefined, transport);
    try {
      stdin.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test', version: '0' },
          },
        })}\n`,
      );
      await answered;
      const [answer] = clientReads(Buffer.concat(chunks));
      assert.ok(answer !== undefined && 'result' in answer, String(answer));
    } finally {
      await server.close();
    }
  });

  it('a replacement that fills the cap exactly is written', () => {
    // The replacement's size, for an answer of `size` bytes over `cap`.
    const replacementSize = (id: string, size: number, cap: number) =>
      sizeOf({
        jsonrpc: '2.0',
        id,
        error: {
          code: ErrorCode.InternalError,
          message: oversizedAnswerWords(size, cap),
        },
      });
    const id = 'r';
    let cap = 400;
    // The cap is the replacement's own size (its digits depend on the cap).
    for (let i = 0; i < 5; i += 1) cap = replacementSize(id, 100_000, cap);
    const answer: JSONRPCMessage = {
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: 'x'.repeat(100_000) }] },
    };
    const sent = boundedMessage(answer, cap);
    assert.ok(sent.kind === 'send' && isJSONRPCErrorResponse(sent.message));
    assert.equal(sizeOf(sent.message), cap);
  });

  it('a replacement over the cap is not written: one stderr line instead', async () => {
    const id = 'i'.repeat(500);
    const answer: JSONRPCMessage = {
      jsonrpc: '2.0',
      id,
      result: { content: [{ type: 'text', text: 'x'.repeat(1000) }] },
    };
    const lines: string[] = [];
    const bytes = await written(bounded(400, lines), answer);
    assert.equal(bytes.length, 0);
    assert.deepEqual(lines, [droppedResponseLine(sizeOf(answer), 400)]);
  });

  it('every refusal names its size in the shared words', () => {
    assert.ok(oversizedAnswerWords(1, 1).includes(ONE_MESSAGE_WORDS));
    assert.ok(droppedNotificationLine(1, 1).includes(ONE_MESSAGE_WORDS));
    assert.ok(droppedResponseLine(1, 1).includes(ONE_MESSAGE_WORDS));
  });

  it('a cap from a stated limit holds the frames to it', async () => {
    const cap = frameCapOf(2 * STDIO_READ_MARGIN);
    assert.equal(cap, STDIO_READ_MARGIN);
    const read = clientReads(
      await written(bounded(cap), answerOfSize(4, cap + 1)),
    );
    assert.ok(isJSONRPCErrorResponse(read[0]));
  });

  it('an error answer over the cap is answered InternalError too', () => {
    const sent = boundedMessage(
      {
        jsonrpc: '2.0',
        id: 9,
        error: { code: -32000, message: 'y'.repeat(500) },
      },
      400,
    );
    assert.ok(sent.kind === 'send' && isJSONRPCErrorResponse(sent.message));
    assert.equal(sent.message.id, 9);
    assert.equal(sent.message.error.code, ErrorCode.InternalError);
  });

  it('a notification over the cap is not written: one stderr line instead', async () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: { level: 'info', data: 'z'.repeat(200) },
    };
    const lines: string[] = [];
    const bytes = await written(bounded(100, lines), message);
    assert.equal(bytes.length, 0);
    assert.deepEqual(lines, [droppedNotificationLine(sizeOf(message), 100)]);
  });

  it('a request over the cap is not written: its send fails', async () => {
    const { transport, bytes } = recorded(bounded(100));
    await transport.start();
    await assert.rejects(
      transport.send({
        jsonrpc: '2.0',
        id: 11,
        method: 'sampling/createMessage',
        params: { text: 'w'.repeat(200) },
      }),
      /a stdio client is sent as one message, was not sent/,
    );
    await transport.close();
    assert.equal(bytes().length, 0);
  });

  it('a notification within the cap is written as it is', () => {
    const message: JSONRPCMessage = {
      jsonrpc: '2.0',
      method: 'notifications/message',
      params: { level: 'info', data: 'z' },
    };
    assert.deepEqual(boundedMessage(message, 1000), { kind: 'send', message });
  });
});

describe("the stdio server's own transport", () => {
  it('is the bounded one, at the default cap', async () => {
    const server = new StdioServer(
      new CompositeHandlersRegistry([]),
      {} as IDestinations,
    );
    await server.start(undefined);
    try {
      const transport = server.server.transport;
      assert.ok(transport instanceof BoundedStdioServerTransport);
      assert.equal(transport.cap, STDIO_FRAME_CAP);
    } finally {
      await server.close();
    }
  });

  it('takes its cap from stdioMessageLimit, less one pipe read', () => {
    const server = new StdioServer(
      new CompositeHandlersRegistry([]),
      {} as IDestinations,
      { stdioMessageLimit: STDIO_MIN_MESSAGE_LIMIT },
    );
    assert.equal(server.stdioTransport().cap, STDIO_MIN_FRAME_CAP);
  });
});
