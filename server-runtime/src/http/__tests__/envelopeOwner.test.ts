/**
 * The read envelopes on HTTP (spec §3.2): every pooled instance gets an
 * owner of its own, with the server's settings — the consumer's bound
 * included; without batch settings, none.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { StreamableHttpServer } from '../StreamableHttpServer.js';

type Owner = { keepRawParts: boolean; openEnvelopes: number | undefined };

const instanceOf = (server: StreamableHttpServer) =>
  (
    server as unknown as {
      createPerRequestServer(): { envelopes: Owner | undefined };
    }
  ).createPerRequestServer();

describe('the envelope owner of the pool', () => {
  it('each pooled instance gets its own InstanceEnvelopes, with the settings given', () => {
    const server = new StreamableHttpServer(new CompositeHandlersRegistry([]), {
      batch: { keepRawParts: true, openEnvelopes: 3 },
    });
    const first = instanceOf(server).envelopes;
    const second = instanceOf(server).envelopes;
    assert.notEqual(first, undefined);
    assert.notEqual(second, undefined);
    assert.notEqual(first, second);
    assert.equal(first?.keepRawParts, true);
    assert.equal(first?.openEnvelopes, 3);
  });

  it('no bound given: none', () => {
    const server = new StreamableHttpServer(new CompositeHandlersRegistry([]), {
      batch: { keepRawParts: false },
    });
    assert.equal(instanceOf(server).envelopes?.openEnvelopes, undefined);
  });

  it('without batch settings no instance has one', () => {
    const server = new StreamableHttpServer(new CompositeHandlersRegistry([]));
    assert.equal(instanceOf(server).envelopes, undefined);
  });
});
