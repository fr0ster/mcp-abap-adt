/**
 * `host`, `port` and `tls` beside an embedder's `app` are refused at
 * construction of `StreamableHttpServer` and `SseServer`, naming them
 * (D26 E7): they configure the server's own listener and were read by
 * nothing there.
 */

import { describe, it } from 'node:test';
import { format } from 'node:util';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import express from 'express';
import { assertThrows } from '../../../src/__tests__/helpers/assertions';
import { StreamableHttpServer } from '../http/StreamableHttpServer';
import { SseServer } from '../sse/SseServer';

for (const [_name, construct] of [
  [
    'StreamableHttpServer',
    (opts: ConstructorParameters<typeof StreamableHttpServer>[1]) =>
      new StreamableHttpServer(new CompositeHandlersRegistry([]), opts),
  ],
  [
    'SseServer',
    (opts: ConstructorParameters<typeof SseServer>[1]) =>
      new SseServer(new CompositeHandlersRegistry([]), opts),
  ],
] as const) {
  describe(format('%s', _name), () => {
    it('host, port and tls beside app are refused, naming each given', () => {
      assertThrows(
        () =>
          construct({
            app: express(),
            host: '0.0.0.0',
            port: 4000,
            tls: { cert: '/c', key: '/k' },
          }),
        'host, port, tls beside app',
      );
      assertThrows(
        () => construct({ app: express(), port: 4000 }),
        'port beside app',
      );
    });

    it('app alone, and the listener options without app, construct', () => {
      construct({ app: express() });
      construct({ host: '127.0.0.1', port: 4000 });
    });
  });
}
