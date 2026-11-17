/**
 * Incomplete DNS-rebinding settings are refused (D26 F1), by the launchers'
 * parameter readers and by the server classes' constructors alike: allowed
 * hosts or origins without the enable flag checked nothing, and the enable
 * flag without a list checked nothing either. Both together are accepted.
 */

import { CompositeHandlersRegistry } from '@mcp-abap-adt/lib/handlers';
import { checkDnsRebinding } from '@mcp-abap-adt/lib/http-transport';
import { readHttpConfig } from '../http/config/httpParameters';
import { StreamableHttpServer } from '../http/StreamableHttpServer';
import { readSseConfig } from '../sse/config/sseParameters';
import { SseServer } from '../sse/SseServer';

const KIND = '--system-type=onprem';

describe.each([
  ['http', readHttpConfig],
  ['sse', readSseConfig],
] as const)('the %s launcher', (prefix, read) => {
  const enable = `--${prefix}-enable-dns-protection`;
  const hosts = `--${prefix}-allowed-hosts`;
  const origins = `--${prefix}-allowed-origins`;

  it('allowed hosts without the enable flag are refused, naming both', () => {
    expect(() => read([KIND, `${hosts}=localhost:3000`], {})).toThrow(
      `${hosts} without ${enable}: DNS-rebinding protection checks the hosts and origins only when it is enabled — add ${enable}, or drop them`,
    );
  });

  it('allowed origins with the enable flag stated false are refused', () => {
    expect(() =>
      read([KIND, `${origins}=https://a.example`, `${enable}=false`], {}),
    ).toThrow(`${origins} without ${enable}`);
  });

  it('the enable flag without a list is refused, naming the lists', () => {
    expect(() => read([KIND, enable], {})).toThrow(
      `${enable} without ${hosts} or ${origins}: DNS-rebinding protection has nothing to check against — state the hosts or origins to accept`,
    );
  });

  it('the form used is named: an environment variable by its name', () => {
    const variable = `MCP_${prefix.toUpperCase()}_ENABLE_DNS_PROTECTION`;
    expect(() => read([KIND], { [variable]: 'true' })).toThrow(
      `${variable} without ${hosts} or ${origins}`,
    );
  });

  it('both together are read as stated', () => {
    const config = read([KIND, enable, `${hosts}=localhost:3000`], {});
    expect(config.enableDnsRebindingProtection).toBe(true);
    expect(config.allowedHosts).toEqual(['localhost:3000']);
  });
});

describe.each([
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
] as const)('%s', (_name, construct) => {
  it('allowedHosts without enableDnsRebindingProtection throws, naming the fields', () => {
    expect(() => construct({ allowedHosts: ['localhost:3000'] })).toThrow(
      'allowedHosts without enableDnsRebindingProtection',
    );
  });

  it('allowedOrigins with enableDnsRebindingProtection false throws', () => {
    expect(() =>
      construct({
        allowedOrigins: ['https://a.example'],
        enableDnsRebindingProtection: false,
      }),
    ).toThrow('allowedOrigins without enableDnsRebindingProtection');
  });

  it('enableDnsRebindingProtection without a list throws, naming the lists', () => {
    expect(() => construct({ enableDnsRebindingProtection: true })).toThrow(
      'enableDnsRebindingProtection without allowedHosts or allowedOrigins',
    );
    expect(() =>
      construct({ enableDnsRebindingProtection: true, allowedHosts: [] }),
    ).toThrow(
      'enableDnsRebindingProtection without allowedHosts or allowedOrigins',
    );
  });

  it('both together, and neither, construct', () => {
    expect(() =>
      construct({
        enableDnsRebindingProtection: true,
        allowedHosts: ['localhost:3000'],
      }),
    ).not.toThrow();
    expect(() => construct({})).not.toThrow();
  });
});

it('checkDnsRebinding fails closed when enabled with no list', () => {
  expect(
    checkDnsRebinding({ host: 'evil.example' }, { enable: true }),
  ).toMatchObject({ status: 403 });
});
