/**
 * `--login-timeout=<seconds>`: `MCP_LOGIN_TIMEOUT`, YAML
 * `login-timeout`; a whole number from 1 to 86 400, read by plain code; no
 * default. The factory gets it in milliseconds.
 */

import { readCoreConfig } from '../../config/coreParameters';
import { factoryConfigFrom } from '../../launcher';
import { silentLogger } from '../helpers/factoryFixture';

const read = (
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  yaml: Record<string, unknown> | null = null,
) => readCoreConfig(argv, env, yaml);

describe('--login-timeout', () => {
  it('has no default', () => {
    expect(read([]).loginTimeout).toBeUndefined();
  });

  it.each([
    ['1', 1],
    ['86400', 86_400],
    ['30', 30],
  ])('accepts %s', (raw, seconds) => {
    expect(read([`--login-timeout=${raw}`]).loginTimeout).toBe(seconds);
    expect(read([], { MCP_LOGIN_TIMEOUT: raw }).loginTimeout).toBe(seconds);
    expect(read([], {}, { 'login-timeout': seconds }).loginTimeout).toBe(
      seconds,
    );
  });

  it.each(['0', '86401', '1.5', 'abc', '-5', '+5', '1e3', ' 1 2'])(
    'refuses %s in every form, naming the form',
    (raw) => {
      const words = (form: string) =>
        `Invalid ${form}: "${raw.trim()}". Must be a whole number of seconds from 1 to 86400`;
      expect(() => read([`--login-timeout=${raw}`])).toThrow(
        words('--login-timeout'),
      );
      expect(() => read([], { MCP_LOGIN_TIMEOUT: raw })).toThrow(
        words('MCP_LOGIN_TIMEOUT'),
      );
      expect(() => read([], {}, { 'login-timeout': raw })).toThrow(
        words('login-timeout (config file)'),
      );
    },
  );

  it.each([0, 86_401, 1.5, -1])('refuses the YAML number %s', (value) => {
    expect(() => read([], {}, { 'login-timeout': value })).toThrow(
      `Invalid login-timeout (config file): "${value}". Must be a whole number of seconds from 1 to 86400`,
    );
  });

  it('CLI beats env beats YAML', () => {
    expect(
      read(
        ['--login-timeout=5'],
        { MCP_LOGIN_TIMEOUT: '6' },
        {
          'login-timeout': 7,
        },
      ).loginTimeout,
    ).toBe(5);
    expect(
      read([], { MCP_LOGIN_TIMEOUT: '6' }, { 'login-timeout': 7 }).loginTimeout,
    ).toBe(6);
  });

  it('reaches the factory in milliseconds, and nothing when not given', () => {
    const collaborators = {
      browserStrategy: () => ({
        authorize: async () => ({ payload: '', redirectUri: '' }),
      }),
      promptLogger: silentLogger,
    };
    expect(
      factoryConfigFrom(read(['--login-timeout=2']), collaborators)
        .loginTimeoutMs,
    ).toBe(2_000);
    expect('loginTimeoutMs' in factoryConfigFrom(read([]), collaborators)).toBe(
      false,
    );
    // How the user set it, for the sentence: its form, with its value.
    expect(
      factoryConfigFrom(read(['--login-timeout=2']), collaborators)
        .loginTimeoutStated,
    ).toBe('`--login-timeout=2`');
    expect(
      factoryConfigFrom(read([], { MCP_LOGIN_TIMEOUT: '3' }), collaborators)
        .loginTimeoutStated,
    ).toBe('`MCP_LOGIN_TIMEOUT=3`');
    expect(
      factoryConfigFrom(read([], {}, { 'login-timeout': 4 }), collaborators)
        .loginTimeoutStated,
    ).toBe('`login-timeout: 4` in the configuration file');
  });
});
