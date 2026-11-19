/**
 * The broker options the server states:
 * `renewal`, `onWriteFailure` by the destination's store, `authDebug` off,
 * and `authorization` only for a jwt / authorization_code destination.
 */

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { format } from 'node:util';
import type { IRenewalStrategy } from '@mcp-abap-adt/interfaces-auth';
import { assertRejects } from '../../../../../src/__tests__/helpers/assertions';
import { authBroker as authBrokerModule } from '../../../../../src/__tests__/helpers/packageFiles';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import {
  authorizationCodeLines,
  type BrokerBase,
  basicLines,
  brokerBase,
  factoryConfig,
  recordingLogins,
} from '../helpers/factoryFixture';

/** A member the config type leaves optional, which the case requires: Jest read it untyped. */
function present<T>(value: T | undefined): T {
  assert.ok(value !== undefined);
  return value;
}

// Every broker the factory constructs, recorded: AuthBroker watched on the
// module that defines it (the package index re-exports it by getter, read at
// call time); the real broker is still constructed, as the Jest factory's
// passthrough did.
const constructed = mock.method(authBrokerModule, 'AuthBroker');

/** What the strategy decides with nothing to refresh: login, or stop. */
function decisionWithoutRefreshToken(strategy: IRenewalStrategy): unknown {
  const answer = strategy.next({
    cause: { trigger: 'no-token' },
    moment: 'authorize',
    canRefresh: false,
    steps: [],
  } as never);
  return (answer as { next: string }).next;
}

let base: BrokerBase;
let logins: ReturnType<typeof recordingLogins>;

beforeEach(() => {
  base = brokerBase('broker-options');
  logins = recordingLogins();
  constructed.mock.resetCalls();
});

afterEach(() => base.remove());

async function brokerConfigOf(
  destination: string,
  over: Parameters<typeof factoryConfig>[2] = {},
) {
  await new AuthBrokerFactory(factoryConfig(base, logins, over)).getBroker(
    destination,
  );
  assert.equal(constructed.mock.callCount(), 1);
  return constructed.mock.calls[0]?.arguments[0];
}

describe('renewal', () => {
  it('refreshThenLogin() by default', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const config = await brokerConfigOf('dest');
    const strategy = present(config.renewal)('dest', 'authorization_code');
    assert.equal(decisionWithoutRefreshToken(strategy), 'login');
  });

  it('refreshThenLogin() under --renewal=refresh-then-login', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const config = await brokerConfigOf('dest', {
      renewal: 'refresh-then-login',
    });
    const strategy = present(config.renewal)('dest', 'authorization_code');
    assert.equal(decisionWithoutRefreshToken(strategy), 'login');
  });

  it('refreshOnly() under --renewal=refresh-only', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const config = await brokerConfigOf('dest', { renewal: 'refresh-only' });
    const strategy = present(config.renewal)('dest', 'authorization_code');
    assert.equal(decisionWithoutRefreshToken(strategy), 'stop');
  });
});

describe('onWriteFailure, by the destination store', () => {
  it("a named destination: 'continue'", async () => {
    base.writeSession('dest', basicLines());
    assert.equal((await brokerConfigOf('dest')).onWriteFailure, 'continue');
  });

  it("a named destination with --unsafe: 'continue'", async () => {
    base.writeSession('dest', basicLines());
    assert.equal(
      (await brokerConfigOf('dest', { unsafe: true })).onWriteFailure,
      'continue',
    );
  });

  for (const source of ['--env', '--env-path']) {
    it(format("the %s file: 'fail'", source), async () => {
      const file = base.writeFile('conn.env', basicLines());
      const config = await brokerConfigOf('default', {
        envFile: { path: file, source },
      });
      assert.equal(config.onWriteFailure, 'fail');
    });
  }
});

describe('authDebug and authorization', () => {
  it('basic: authDebug false, no authorization', async () => {
    base.writeSession('dest', basicLines());
    const config = await brokerConfigOf('dest');
    assert.equal(config.authDebug, false);
    assert.deepStrictEqual(Object.keys(config).sort(), [
      'authDebug',
      'onWriteFailure',
      'renewal',
      'serviceKeyStore',
      'sessionStore',
    ]);
  });

  it('jwt / none: refused before any broker is built', async () => {
    const file = base.writeFile('conn.env', [
      'SAP_URL=https://system.example.test',
      'SAP_AUTH_TYPE=jwt',
      'SAP_GRANT_TYPE=none',
      'SAP_JWT_TOKEN=placeholder-token',
    ]);
    await assertRejects(
      brokerConfigOf('default', {
        envFile: { path: file, source: '--env' },
      }),
      'Destination "default" uses jwt / none, which this server does not support',
    );
    assert.equal(constructed.mock.callCount(), 0);
  });

  it('jwt / authorization_code: authorization, built from the browser and the port', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const browser = { open: async () => {} };
    const config = await brokerConfigOf('dest', {
      browser,
      browserAuthPort: 61005,
    });
    assert.equal(config.authDebug, false);
    assert.equal(typeof config.authorization, 'function');
    const strategy = present(config.authorization)(
      'dest',
      'authorization_code',
    );
    const outcome = await strategy.authorize({
      buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
    });
    assert.equal(outcome.payload, 'code-1');
    assert.deepStrictEqual(logins.built, [{ browser, port: 61005 }]);
  });

  it('jwt / authorization_code with --browser=none: no browser, the strategy keeps its port', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const config = await brokerConfigOf('dest');
    present(config.authorization)('dest', 'authorization_code');
    assert.deepStrictEqual(logins.built, [{}]);
  });
});
