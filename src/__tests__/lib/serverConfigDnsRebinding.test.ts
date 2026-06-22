import { ServerConfigManager } from '../../lib/config/ServerConfigManager';
import { applyYamlConfigToArgs } from '../../lib/config/yamlConfig';

function configFor(args: string[]) {
  process.argv = ['node', 'x', ...args];
  return new ServerConfigManager().getConfigSync();
}

describe('ServerConfigManager DNS-rebinding mapping', () => {
  const ORIG_ARGV = process.argv;
  const ORIG_ENV = { ...process.env };
  afterEach(() => {
    process.argv = ORIG_ARGV;
    process.env = { ...ORIG_ENV };
  });

  it('maps http flags transport-aware', () => {
    const c = configFor([
      '--transport=http',
      '--http-allowed-origins=https://a.com,https://b.com',
      '--http-allowed-hosts=localhost:3000',
      '--http-enable-dns-protection',
    ]);
    expect(c.allowedOrigins).toEqual(['https://a.com', 'https://b.com']);
    expect(c.allowedHosts).toEqual(['localhost:3000']);
    expect(c.enableDnsRebindingProtection).toBe(true);
  });

  it('maps sse flags and does not bleed http values', () => {
    const c = configFor([
      '--transport=sse',
      '--sse-allowed-hosts=localhost:3001',
    ]);
    expect(c.allowedHosts).toEqual(['localhost:3001']);
    expect(c.allowedOrigins).toBeUndefined();
    expect(c.enableDnsRebindingProtection).toBe(false);
  });

  it('maps MCP_HTTP_* env vars', () => {
    // afterEach restores process.env, so no manual cleanup needed.
    process.env.MCP_HTTP_ALLOWED_ORIGINS = 'https://a.com';
    process.env.MCP_HTTP_ENABLE_DNS_PROTECTION = 'true';
    const c = configFor(['--transport=http']);
    expect(c.allowedOrigins).toEqual(['https://a.com']);
    expect(c.enableDnsRebindingProtection).toBe(true);
  });

  it('maps YAML keys via applyYamlConfigToArgs', () => {
    // YAML path: applyYamlConfigToArgs pushes flags onto argv, then ArgumentsParser reads them.
    process.argv = ['node', 'x', '--transport=http'];
    applyYamlConfigToArgs({
      http: {
        'allowed-hosts': ['localhost:3000'],
        'enable-dns-protection': true,
      },
    } as any);
    const c = new ServerConfigManager().getConfigSync();
    expect(c.allowedHosts).toEqual(['localhost:3000']);
    expect(c.enableDnsRebindingProtection).toBe(true);
  });
});
