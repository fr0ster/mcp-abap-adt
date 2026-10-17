/**
 * The broker options the server states:
 * `renewal`, `onWriteFailure` by the destination's store, `authDebug` off,
 * and `authorization` only for a jwt / authorization_code destination.
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

import { AuthBroker as AuthBrokerCtor } from '@mcp-abap-adt/auth-broker';
import type { IRenewalStrategy } from '@mcp-abap-adt/interfaces-auth';
import { AuthBrokerFactory } from '../../auth/brokerFactory';
import {
  authorizationCodeLines,
  type BrokerBase,
  basicLines,
  brokerBase,
  factoryConfig,
  recordingLogins,
} from '../helpers/factoryFixture';

const constructed = AuthBrokerCtor as unknown as jest.Mock;

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
  constructed.mockClear();
});

afterEach(() => base.remove());

async function brokerConfigOf(
  destination: string,
  over: Parameters<typeof factoryConfig>[2] = {},
) {
  await new AuthBrokerFactory(factoryConfig(base, logins, over)).getBroker(
    destination,
  );
  expect(constructed).toHaveBeenCalledTimes(1);
  return constructed.mock.calls[0][0];
}

describe('renewal', () => {
  it('refreshThenLogin() by default', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const config = await brokerConfigOf('dest');
    const strategy = config.renewal('dest', 'authorization_code');
    expect(decisionWithoutRefreshToken(strategy)).toBe('login');
  });

  it('refreshThenLogin() under --renewal=refresh-then-login', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const config = await brokerConfigOf('dest', {
      renewal: 'refresh-then-login',
    });
    const strategy = config.renewal('dest', 'authorization_code');
    expect(decisionWithoutRefreshToken(strategy)).toBe('login');
  });

  it('refreshOnly() under --renewal=refresh-only', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const config = await brokerConfigOf('dest', { renewal: 'refresh-only' });
    const strategy = config.renewal('dest', 'authorization_code');
    expect(decisionWithoutRefreshToken(strategy)).toBe('stop');
  });
});

describe('onWriteFailure, by the destination store', () => {
  it("a named destination: 'continue'", async () => {
    base.writeSession('dest', basicLines());
    expect((await brokerConfigOf('dest')).onWriteFailure).toBe('continue');
  });

  it("a named destination with --unsafe: 'continue'", async () => {
    base.writeSession('dest', basicLines());
    expect(
      (await brokerConfigOf('dest', { unsafe: true })).onWriteFailure,
    ).toBe('continue');
  });

  it.each(['--env', '--env-path'])("the %s file: 'fail'", async (source) => {
    const file = base.writeFile('conn.env', basicLines());
    const config = await brokerConfigOf('default', {
      envFile: { path: file, source },
    });
    expect(config.onWriteFailure).toBe('fail');
  });
});

describe('authDebug and authorization', () => {
  it('basic: authDebug false, no authorization', async () => {
    base.writeSession('dest', basicLines());
    const config = await brokerConfigOf('dest');
    expect(config.authDebug).toBe(false);
    expect(Object.keys(config).sort()).toEqual([
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
    await expect(
      brokerConfigOf('default', {
        envFile: { path: file, source: '--env' },
      }),
    ).rejects.toThrow(
      'Destination "default" uses jwt / none, which this server does not support',
    );
    expect(constructed).not.toHaveBeenCalled();
  });

  it('jwt / authorization_code: authorization, built from the browser and the port', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const browser = { open: async () => {} };
    const config = await brokerConfigOf('dest', {
      browser,
      browserAuthPort: 61005,
    });
    expect(config.authDebug).toBe(false);
    expect(typeof config.authorization).toBe('function');
    const strategy = config.authorization('dest', 'authorization_code');
    const outcome = await strategy.authorize({
      buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
    });
    expect(outcome.payload).toBe('code-1');
    expect(logins.built).toEqual([{ browser, port: 61005 }]);
  });

  it('jwt / authorization_code with --browser=none: no browser, the strategy keeps its port', async () => {
    base.writeSession('dest', authorizationCodeLines());
    const config = await brokerConfigOf('dest');
    config.authorization('dest', 'authorization_code');
    expect(logins.built).toEqual([{}]);
  });
});
