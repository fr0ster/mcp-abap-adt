/**
 * Batch mode on HTTP: every pooled instance gets an owner of its own, with
 * the server's settings; without them, none.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
    assert.notEqual(first, undefined);
    assert.notEqual(second, undefined);
    assert.notEqual(first, second);
    assert.equal(first?.keepRawParts, true);
  });

  it('without batch settings no instance has one', () => {
    const server = new StreamableHttpServer(new CompositeHandlersRegistry([]));
    assert.equal(instanceOf(server).batch, undefined);
  });
});
