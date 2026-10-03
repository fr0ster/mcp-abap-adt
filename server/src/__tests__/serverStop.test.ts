/**
 * Shutdown step 1: an HTTP or SSE server stops taking connections. Asserted
 * on the port — a new connection is refused — never on a log line.
 */

import * as net from 'node:net';
import type { IDestinations } from '@mcp-abap-adt/lib/auth';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { SseServer } from '../SseServer.js';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

const stubDestinations: IDestinations = {
  settingsFor: jest.fn(),
  getProvider: jest.fn(),
};

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

describe.each([
  [
    'StreamableHttpServer',
    () =>
      new StreamableHttpServer(
        new CompositeHandlersRegistry([]),
        stubDestinations,
        { host: '127.0.0.1', port: 0 },
      ),
  ],
  [
    'SseServer',
    () =>
      new SseServer(new CompositeHandlersRegistry([]), stubDestinations, {
        host: '127.0.0.1',
        port: 0,
      }),
  ],
] as const)('%s.stop()', (_name, make) => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('the port refuses a new connection afterwards', async () => {
    const server = make();
    await server.start();
    const port = portOf(server);
    expect(await connects(port)).toBe(true);
    await server.stop();
    expect(await connects(port)).toBe(false);
  });

  it('twice, or never started: nothing to stop, no throw', async () => {
    const server = make();
    await server.stop();
    await server.start();
    await server.stop();
    await server.stop();
  });
});
