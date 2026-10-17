/**
 * `authDebug` comes from `--auth-debug` or the YAML key `auth-debug`
 * and from nothing else — no `DEBUG_*` variable, no `MCP_AUTH_DEBUG`. The
 * broker is built with it exactly as stated.
 */

jest.mock('@mcp-abap-adt/auth-broker', () => {
  const actual = jest.requireActual('@mcp-abap-adt/auth-broker');
  return {
    ...actual,
    AuthBroker: jest.fn(
      (config: unknown, logger: unknown) =>
        new actual.AuthBroker(config, logger),
    ),
  };
});

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthBroker as AuthBrokerCtor } from '@mcp-abap-adt/auth-broker';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import { AUTH_DEBUG_ROW, readCoreConfig } from '../../config/coreParameters';
import { factoryConfigFrom } from '../../launcher';
import {
  type BrokerBase,
  basicLines,
  brokerBase,
  recordingLogins,
  silentLogger,
} from '../helpers/factoryFixture';

const constructed = AuthBrokerCtor as unknown as jest.Mock;

const ENVIRONMENT = {
  MCP_AUTH_DEBUG: 'true',
  AUTH_DEBUG: 'true',
  DEBUG: 'true',
  DEBUG_AUTH_LOG: 'true',
  DEBUG_AUTH_BROKER: 'true',
  DEBUG_AUTH_PROVIDERS: 'true',
  DEBUG_PROVIDER: 'true',
  DEBUG_BROWSER_AUTH: 'true',
};

describe('--auth-debug is read from the command line and the YAML only', () => {
  it('has no environment form', () => {
    expect(AUTH_DEBUG_ROW.cli).toBe('--auth-debug');
    expect(AUTH_DEBUG_ROW.yaml).toBe('auth-debug');
    expect(AUTH_DEBUG_ROW.env).toBeUndefined();
  });

  it('is off with nothing stated', () => {
    expect(readCoreConfig([], {}, null).authDebug).toBe(false);
  });

  it('is off whatever DEBUG_* and MCP_AUTH_DEBUG say', () => {
    expect(readCoreConfig([], ENVIRONMENT, null).authDebug).toBe(false);
  });

  it('is on by --auth-debug', () => {
    expect(readCoreConfig(['--auth-debug'], {}, null).authDebug).toBe(true);
  });

  it('is on by the YAML key', () => {
    expect(readCoreConfig([], {}, { 'auth-debug': true }).authDebug).toBe(true);
  });
});

describe('the broker is built with it', () => {
  let base: BrokerBase;
  beforeEach(() => {
    base = brokerBase('auth-debug-source');
    constructed.mockClear();
  });
  afterEach(() => base.remove());

  const brokerAuthDebug = async (argv: string[], env: NodeJS.ProcessEnv) => {
    base.writeSession('dest', basicLines());
    const parsed = readCoreConfig(
      [...argv, `--auth-broker-path=${base.root}`],
      env,
      null,
    );
    const logins = recordingLogins();
    const config = factoryConfigFrom(parsed, {
      browserStrategy: logins.browserStrategy,
      promptLogger: silentLogger,
    });
    await new AuthBrokerFactory(config).getBroker('dest');
    return constructed.mock.calls[0][0].authDebug;
  };

  it('false without the flag, whatever the environment says', async () => {
    expect(await brokerAuthDebug([], ENVIRONMENT)).toBe(false);
  });

  it('true under --auth-debug', async () => {
    expect(await brokerAuthDebug(['--auth-debug'], {})).toBe(true);
  });
});

describe('no source reads an environment variable for it', () => {
  const sourcesOf = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return entry.name === '__tests__' ? [] : sourcesOf(full);
      }
      return full.endsWith('.ts') ? [full] : [];
    });

  it('server/src and the shared parameter table never name an AUTH_DEBUG variable', () => {
    const roots = [
      path.resolve(__dirname, '../..'),
      path.resolve(__dirname, '../../../../src/lib/config'),
    ];
    const naming = roots.flatMap(sourcesOf).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return ['MCP_AUTH_DEBUG', "'AUTH_DEBUG'", 'env.AUTH_DEBUG'].some((name) =>
        text.includes(name),
      );
    });
    expect(naming).toEqual([]);
  });
});
