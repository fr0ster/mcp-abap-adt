/**
 * Batch mode on HTTP: every pooled instance gets an owner of its own, with
 * the server's settings; without them, none.
 */
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

type Owner = { keepRawParts: boolean } | undefined;

const instanceOf = (server: StreamableHttpServer) =>
  (
    server as unknown as {
      createPerRequestServer(): { batch: Owner };
    }
  ).createPerRequestServer();

describe('the batch owner of the pool', () => {
  it('each pooled instance gets its own InstanceBatch, with the settings given', () => {
    const server = new StreamableHttpServer(new CompositeHandlersRegistry([]), {
      batch: { keepRawParts: true },
    });
    const first = instanceOf(server).batch;
    const second = instanceOf(server).batch;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    expect(first).not.toBe(second);
    expect(first?.keepRawParts).toBe(true);
  });

  it('without batch settings no instance has one', () => {
    const server = new StreamableHttpServer(new CompositeHandlersRegistry([]));
    expect(instanceOf(server).batch).toBeUndefined();
  });
});
