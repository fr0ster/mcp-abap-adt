/**
 * Shutdown step 1: a Streamable HTTP server stops taking connections. Asserted
 * on the port — a new connection is refused — never on a log line.
 */

import assert from 'node:assert/strict';
import * as net from 'node:net';
import {
  afterEach,
  beforeEach,
  describe,
  it,
  type Mock,
  mock,
} from 'node:test';
import { format } from 'node:util';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

function connects(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

function portOf(server: object): number {
  const listener = (server as { standaloneServer?: net.Server })
    .standaloneServer;
  if (!listener) throw new Error('not listening');
  return (listener.address() as net.AddressInfo).port;
}

for (const [_name, make] of [
  [
    'StreamableHttpServer',
    () =>
      new StreamableHttpServer(new CompositeHandlersRegistry([]), {
        host: '127.0.0.1',
        port: 0,
      }),
  ],
] as const) {
  describe(format('%s.stop()', _name), () => {
    let errorSpy: Mock<typeof console.error>;
    beforeEach(() => {
      errorSpy = mock.method(console, 'error', () => {});
    });
    afterEach(() => errorSpy.mock.restore());

    it('the port refuses a new connection afterwards', async () => {
      const server = make();
      await server.start();
      const port = portOf(server);
      // Stopped whatever the first check says: a server left listening keeps
      // the file's process alive.
      try {
        assert.equal(await connects(port), true);
      } finally {
        await server.stop();
      }
      assert.equal(await connects(port), false);
    });

    it('twice, or never started: nothing to stop, no throw', async () => {
      const server = make();
      await server.stop();
      await server.start();
      await server.stop();
      await server.stop();
    });
  });
}
