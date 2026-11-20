import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { IHttpApplication } from '@mcp-abap-adt/lib/embeddable';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import express from 'express';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

// Empty registry — health endpoint doesn't need any handlers
const emptyRegistry = new CompositeHandlersRegistry([]);

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

  before(async () => {
    const mcpServer = new StreamableHttpServer(emptyRegistry, {
      version: '1.2.3',
    });
    const result = await startApp((app) => mcpServer.registerRoutes(app));
    httpServer = result.server;
    baseUrl = result.baseUrl;
  });

  after(
    () =>
      new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      }),
  );

  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/mcp/health`);
    assert.equal(res.status, 200);

    const body = (await res.json()) as any;
    assert.equal(body.status, 'ok');
    assert.equal(body.transport, 'http');
    assert.equal(body.version, '1.2.3');
    assert.equal(typeof body.uptime, 'number');
  });

  it('does not require special headers', async () => {
    const res = await fetch(`${baseUrl}/mcp/health`);
    assert.equal(res.status, 200);
  });
});
