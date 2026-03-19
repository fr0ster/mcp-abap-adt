import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { CompositeHandlersRegistry } from '../../lib/handlers/registry/CompositeHandlersRegistry';
import type { IHttpApplication } from '../../server/IHttpApplication';
import { SseServer } from '../../server/SseServer';
import { StreamableHttpServer } from '../../server/StreamableHttpServer';

// Empty registry — health endpoint doesn't need any handlers
const emptyRegistry = new CompositeHandlersRegistry([]);

const stubAuthBrokerFactory = {
  getOrCreateAuthBroker: jest.fn(),
  initializeDefaultBroker: jest.fn(),
} as any;

async function startApp(
  register: (app: IHttpApplication) => void,
): Promise<{ server: Server; baseUrl: string }> {
  const app = express();
  register(app as unknown as IHttpApplication);

  return new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as AddressInfo;
      resolve({ server: srv, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

describe('Health endpoint — StreamableHttpServer', () => {
  let httpServer: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const mcpServer = new StreamableHttpServer(
      emptyRegistry,
      stubAuthBrokerFactory,
      { version: '1.2.3' },
    );
    const result = await startApp((app) => mcpServer.registerRoutes(app));
    httpServer = result.server;
    baseUrl = result.baseUrl;
  });

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      }),
  );

  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/mcp/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.transport).toBe('http');
    expect(body.version).toBe('1.2.3');
    expect(typeof body.uptime).toBe('number');
  });

  it('does not require special headers', async () => {
    const res = await fetch(`${baseUrl}/mcp/health`);
    expect(res.status).toBe(200);
  });
});

describe('Health endpoint — SseServer', () => {
  let httpServer: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const sseServer = new SseServer(emptyRegistry, stubAuthBrokerFactory, {
      version: '1.2.3',
    });
    const result = await startApp((app) => sseServer.registerRoutes(app));
    httpServer = result.server;
    baseUrl = result.baseUrl;
  });

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      }),
  );

  it('returns 200 with status ok and activeSessions', async () => {
    const res = await fetch(`${baseUrl}/mcp/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.transport).toBe('sse');
    expect(body.version).toBe('1.2.3');
    expect(typeof body.uptime).toBe('number');
    expect(body.activeSessions).toBe(0);
  });
});
