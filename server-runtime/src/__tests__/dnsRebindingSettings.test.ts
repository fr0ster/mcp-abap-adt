/**
 * Incomplete DNS-rebinding settings are refused (D26 F1), by the launchers'
 * parameter readers and by the server classes' constructors alike: allowed
 * hosts or origins without the enable flag checked nothing, and the enable
 * flag without a list checked nothing either. Both together are accepted.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { checkDnsRebinding } from '@mcp-abap-adt/lib/http-transport';
import {
  assertMatchObject,
  assertThrows,
} from '../../../src/__tests__/helpers/assertions';
import { readHttpConfig } from '../http/config/httpParameters';
import { StreamableHttpServer } from '../http/StreamableHttpServer';
import { readSseConfig } from '../sse/config/sseParameters';
import { SseServer } from '../sse/SseServer';

const KIND = '--system-type=onprem';

for (const [prefix, read] of [
  ['http', readHttpConfig],
  ['sse', readSseConfig],
] as const) {
  describe(format('the %s launcher', prefix), () => {
    const enable = `--${prefix}-enable-dns-protection`;
    const hosts = `--${prefix}-allowed-hosts`;
    const origins = `--${prefix}-allowed-origins`;

    it('allowed hosts without the enable flag are refused, naming both', () => {
      assertThrows(
        () => read([KIND, `${hosts}=localhost:3000`], {}),
        `${hosts} without ${enable}: DNS-rebinding protection checks the hosts and origins only when it is enabled — add ${enable}, or drop them`,
      );
    });

    it('allowed origins with the enable flag stated false are refused', () => {
      assertThrows(
        () =>
          read([KIND, `${origins}=https://a.example`, `${enable}=false`], {}),
        `${origins} without ${enable}`,
      );
    });

    it('the enable flag without a list is refused, naming the lists', () => {
      assertThrows(
        () => read([KIND, enable], {}),
        `${enable} without ${hosts} or ${origins}: DNS-rebinding protection has nothing to check against — state the hosts or origins to accept`,
      );
    });

    it('the form used is named: an environment variable by its name', () => {
      const variable = `MCP_${prefix.toUpperCase()}_ENABLE_DNS_PROTECTION`;
      assertThrows(
        () => read([KIND], { [variable]: 'true' }),
        `${variable} without ${hosts} or ${origins}`,
      );
    });

    it('both together are read as stated', () => {
      const config = read([KIND, enable, `${hosts}=localhost:3000`], {});
      assert.equal(config.enableDnsRebindingProtection, true);
      assert.deepStrictEqual(config.allowedHosts, ['localhost:3000']);
    });
  });
}

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
    it('allowedHosts without enableDnsRebindingProtection throws, naming the fields', () => {
      assertThrows(
        () => construct({ allowedHosts: ['localhost:3000'] }),
        'allowedHosts without enableDnsRebindingProtection',
      );
    });

    it('allowedOrigins with enableDnsRebindingProtection false throws', () => {
      assertThrows(
        () =>
          construct({
            allowedOrigins: ['https://a.example'],
            enableDnsRebindingProtection: false,
          }),
        'allowedOrigins without enableDnsRebindingProtection',
      );
    });

    it('enableDnsRebindingProtection without a list throws, naming the lists', () => {
      assertThrows(
        () => construct({ enableDnsRebindingProtection: true }),
        'enableDnsRebindingProtection without allowedHosts or allowedOrigins',
      );
      assertThrows(
        () =>
          construct({ enableDnsRebindingProtection: true, allowedHosts: [] }),
        'enableDnsRebindingProtection without allowedHosts or allowedOrigins',
      );
    });

    it('both together, and neither, construct', () => {
      construct({
        enableDnsRebindingProtection: true,
        allowedHosts: ['localhost:3000'],
      });
      construct({});
    });
  });
}

it('checkDnsRebinding fails closed when enabled with no list', () => {
  assertMatchObject(
    checkDnsRebinding({ host: 'evil.example' }, { enable: true }),
    { status: 403 },
  );
});
