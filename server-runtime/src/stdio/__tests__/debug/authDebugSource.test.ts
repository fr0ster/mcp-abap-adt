/**
 * `authDebug` comes from `--auth-debug` or the YAML key `auth-debug`
 * and from nothing else — no `DEBUG_*` variable, no `MCP_AUTH_DEBUG`. The
 * broker is built with it exactly as stated.
 */

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { authBroker as authBrokerModule } from '../../../../../src/__tests__/helpers/packageFiles';
import { repositoryRoot } from '../../../../../src/__tests__/helpers/repoRoot';
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

// Every broker the factory constructs, recorded: AuthBroker watched on the
// module that defines it (the package index re-exports it by getter, read at
// call time); the real broker is still constructed.
const constructed = mock.method(authBrokerModule, 'AuthBroker');

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
    assert.equal(AUTH_DEBUG_ROW.cli, '--auth-debug');
    assert.equal(AUTH_DEBUG_ROW.yaml, 'auth-debug');
    assert.equal(AUTH_DEBUG_ROW.env, undefined);
  });

  it('is off with nothing stated', () => {
    assert.equal(readCoreConfig([], {}, null).authDebug, false);
  });

  it('is off whatever DEBUG_* and MCP_AUTH_DEBUG say', () => {
    assert.equal(readCoreConfig([], ENVIRONMENT, null).authDebug, false);
  });

  it('is on by --auth-debug', () => {
    assert.equal(readCoreConfig(['--auth-debug'], {}, null).authDebug, true);
  });

  it('is on by the YAML key', () => {
    assert.equal(
      readCoreConfig([], {}, { 'auth-debug': true }).authDebug,
      true,
    );
  });
});

describe('the broker is built with it', () => {
  let base: BrokerBase;
  beforeEach(() => {
    base = brokerBase('auth-debug-source');
    constructed.mock.resetCalls();
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
    return constructed.mock.calls[0]?.arguments[0].authDebug;
  };

  it('false without the flag, whatever the environment says', async () => {
    assert.equal(await brokerAuthDebug([], ENVIRONMENT), false);
  });

  it('true under --auth-debug', async () => {
    assert.equal(await brokerAuthDebug(['--auth-debug'], {}), true);
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
      path.resolve(repositoryRoot(__dirname), 'server-runtime', 'src', 'stdio'),
      path.resolve(repositoryRoot(__dirname), 'src', 'lib', 'config'),
    ];
    const naming = roots.flatMap(sourcesOf).filter((file) => {
      const text = fs.readFileSync(file, 'utf8');
      return ['MCP_AUTH_DEBUG', "'AUTH_DEBUG'", 'env.AUTH_DEBUG'].some((name) =>
        text.includes(name),
      );
    });
    assert.deepStrictEqual(naming, []);
  });
});
