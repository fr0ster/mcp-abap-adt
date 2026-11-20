/**
 * `SdkTransport`: the server's adapter between an SDK server transport, whose
 * handler properties read `| undefined`, and the SDK's `Transport` contract,
 * whose optional handlers do not (`exactOptionalPropertyTypes`).
 *
 * - The protocol's `connect` saves what each handler getter answers, then sets
 *   a handler that calls it. A getter that answered a reader of the current
 *   field would call itself; the server's `connect` over the adapter must
 *   answer a request and close without recursion.
 * - The SDK transport's own events reach the handler the protocol stored.
 * - `sessionId` is the SDK transport's when it has one, and absent when not.
 *
 * Streamable HTTP and SSE serving `tools/list` through the adapter is
 * `src/__tests__/unit/launchers/dataToolsAtStart.test.ts`, over the real
 * launchers.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { assertMatchObject } from '../../../src/__tests__/helpers/assertions';
import { type SdkServerTransport, SdkTransport } from '../sdkTransport';

/** An SDK server transport that records what is sent, and fires events when told. */
class FakeSdkTransport implements SdkServerTransport {
  readonly sent: JSONRPCMessage[] = [];
  #firstSent: (() => void) | undefined;
  /** Settles once the first message is sent. */
  readonly firstSent = new Promise<void>((resolve) => {
    this.#firstSent = resolve;
  });
  started = 0;
  closed = 0;
  onclose?: (() => void) | undefined;
  onerror?: ((error: Error) => void) | undefined;
  onmessage?: ((message: JSONRPCMessage) => void) | undefined;
  sessionId?: string | undefined;

  async start(): Promise<void> {
    this.started += 1;
  }

  async send(message: JSONRPCMessage): Promise<void> {
    this.sent.push(message);
    this.#firstSent?.();
  }

  async close(): Promise<void> {
    this.closed += 1;
    this.onclose?.();
  }

  deliver(message: JSONRPCMessage): void {
    this.onmessage?.(message);
  }
}

const INITIALIZE: JSONRPCMessage = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '1.0.0' },
  },
};

describe('SdkTransport', () => {
  it("chains the server's handlers without recursion: a request is answered and a close reaches the server", async () => {
    const fake = new FakeSdkTransport();
    const server = new Server(
      { name: 'adapter', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );
    const closes: string[] = [];
    server.onclose = () => closes.push('server');

    await server.connect(new SdkTransport(fake));
    assert.equal(fake.started, 1);

    fake.deliver(INITIALIZE);
    await fake.firstSent;
    const [answer] = fake.sent;
    assertMatchObject(answer, { jsonrpc: '2.0', id: 1 });
    assert.equal(answer !== undefined && 'result' in answer, true);

    await server.close();
    assert.equal(fake.closed, 1);
    assert.deepStrictEqual(closes, ['server']);
  });

  it("hands the SDK transport's close, error and message to the handler stored", () => {
    const fake = new FakeSdkTransport();
    const adapter = new SdkTransport(fake);
    const seen: string[] = [];
    adapter.onclose = () => seen.push('close');
    adapter.onerror = (error) => seen.push(`error ${error.message}`);
    adapter.onmessage = (message) =>
      seen.push(`message ${'method' in message ? message.method : ''}`);

    fake.onclose?.();
    fake.onerror?.(new Error('broken'));
    fake.deliver({ jsonrpc: '2.0', method: 'notifications/initialized' });

    assert.deepStrictEqual(seen, [
      'close',
      'error broken',
      'message notifications/initialized',
    ]);
  });

  it('answers a stable no-op for a handler never stored, and the event is dropped', () => {
    const fake = new FakeSdkTransport();
    const adapter = new SdkTransport(fake);
    assert.equal(adapter.onclose, adapter.onclose);
    fake.onclose?.();
    fake.onerror?.(new Error('x'));
    fake.deliver({ jsonrpc: '2.0', method: 'notifications/initialized' });
  });

  it("copies the SDK transport's sessionId after start and before a message, and keeps it absent when there is none", async () => {
    const fake = new FakeSdkTransport();
    const adapter = new SdkTransport(fake);
    assert.equal('sessionId' in adapter, false);

    fake.sessionId = 'session-1';
    await adapter.start();
    assert.equal(adapter.sessionId, 'session-1');

    const atMessage: Array<string | undefined> = [];
    adapter.onmessage = () => atMessage.push(adapter.sessionId);
    fake.sessionId = 'session-2';
    fake.deliver({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.deepStrictEqual(atMessage, ['session-2']);

    fake.sessionId = undefined;
    fake.deliver({ jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal('sessionId' in adapter, false);
  });

  it('forwards send and close to the SDK transport', async () => {
    const fake = new FakeSdkTransport();
    const adapter = new SdkTransport(fake);
    const message: JSONRPCMessage = { jsonrpc: '2.0', id: 7, result: {} };
    await adapter.send(message);
    await adapter.close();
    assert.deepStrictEqual(fake.sent, [message]);
    assert.equal(fake.closed, 1);
  });
});
