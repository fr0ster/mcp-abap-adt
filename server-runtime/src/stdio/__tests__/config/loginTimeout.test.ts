/**
 * `--login-timeout=<seconds>`: `MCP_LOGIN_TIMEOUT`, YAML
 * `login-timeout`; a whole number from 1 to 86 400, read by plain code; no
 * default. The factory gets it in milliseconds.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { YamlConfig } from '@mcp-abap-adt/lib/config';
import { assertThrows } from '../../../../../src/__tests__/helpers/assertions';
import { readCoreConfig } from '../../config/coreParameters';
import { factoryConfigFrom } from '../../launcher';
import { silentLogger } from '../helpers/factoryFixture';

const read = (
  argv: string[],
  env: NodeJS.ProcessEnv = {},
  yaml: YamlConfig | null = null,
) => readCoreConfig(argv, env, yaml);

describe('--login-timeout', () => {
  it('has no default', () => {
    assert.equal(read([]).loginTimeout, undefined);
  });

  for (const [raw, seconds] of [
    ['1', 1],
    ['86400', 86_400],
    ['30', 30],
  ] satisfies [string, number][]) {
    it(format('accepts %s', raw), () => {
      assert.equal(read([`--login-timeout=${raw}`]).loginTimeout, seconds);
      assert.equal(read([], { MCP_LOGIN_TIMEOUT: raw }).loginTimeout, seconds);
      assert.equal(
        read([], {}, { 'login-timeout': seconds }).loginTimeout,
        seconds,
      );
    });
  }

  for (const raw of ['0', '86401', '1.5', 'abc', '-5', '+5', '1e3', ' 1 2']) {
    it(format('refuses %s in every form, naming the form', raw), () => {
      const words = (form: string) =>
        `Invalid ${form}: "${raw.trim()}". Must be a whole number of seconds from 1 to 86400`;
      assertThrows(
        () => read([`--login-timeout=${raw}`]),
        words('--login-timeout'),
      );
      assertThrows(
        () => read([], { MCP_LOGIN_TIMEOUT: raw }),
        words('MCP_LOGIN_TIMEOUT'),
      );
      assertThrows(
        () => read([], {}, { 'login-timeout': raw }),
        words('login-timeout (config file)'),
      );
    });
  }

  for (const value of [0, 86_401, 1.5, -1]) {
    it(format('refuses the YAML number %s', value), () => {
      assertThrows(
        () => read([], {}, { 'login-timeout': value }),
        `Invalid login-timeout (config file): "${value}". Must be a whole number of seconds from 1 to 86400`,
      );
    });
  }

  it('CLI beats env beats YAML', () => {
    assert.equal(
      read(
        ['--login-timeout=5'],
        { MCP_LOGIN_TIMEOUT: '6' },
        {
          'login-timeout': 7,
        },
      ).loginTimeout,
      5,
    );
    assert.equal(
      read([], { MCP_LOGIN_TIMEOUT: '6' }, { 'login-timeout': 7 }).loginTimeout,
      6,
    );
  });

  it('reaches the factory in milliseconds, and nothing when not given', () => {
    const collaborators = {
      browserStrategy: () => ({
        authorize: async () => ({ payload: '', redirectUri: '' }),
      }),
      promptLogger: silentLogger,
    };
    assert.equal(
      factoryConfigFrom(read(['--login-timeout=2']), collaborators)
        .loginTimeoutMs,
      2_000,
    );
    assert.equal(
      'loginTimeoutMs' in factoryConfigFrom(read([]), collaborators),
      false,
    );
    // How the user set it, for the sentence: its form, with its value.
    assert.equal(
      factoryConfigFrom(read(['--login-timeout=2']), collaborators)
        .loginTimeoutStated,
      '`--login-timeout=2`',
    );
    assert.equal(
      factoryConfigFrom(read([], { MCP_LOGIN_TIMEOUT: '3' }), collaborators)
        .loginTimeoutStated,
      '`MCP_LOGIN_TIMEOUT=3`',
    );
    assert.equal(
      factoryConfigFrom(read([], {}, { 'login-timeout': 4 }), collaborators)
        .loginTimeoutStated,
      '`login-timeout: 4` in the configuration file',
    );
  });
});
