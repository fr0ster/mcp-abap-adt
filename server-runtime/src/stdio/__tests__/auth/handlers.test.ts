import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import type { SapConfig } from '@mcp-abap-adt/connection';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import { SettingsError } from '@mcp-abap-adt/lib/auth';
import { assertThrows } from '../../../../../src/__tests__/helpers/assertions';
import { UnsupportedAuthenticationError } from '../../auth/destinationFailure';
import {
  type AuthHandlerContext,
  HANDLERS,
  handlerFor,
} from '../../auth/handlers';
import type { LoginStrategyOptions } from '../../auth/IAuthBrokerFactoryConfig';

const BROWSER: IBrowser = { open: async () => {} };
const silent = { info() {}, warn() {}, error() {}, debug() {} };

function context(over: Partial<AuthHandlerContext> = {}) {
  const calls: LoginStrategyOptions[] = [];
  const recorded: IAuthorizationStrategy<string>[] = [];
  const requests: AuthorizationRequest[] = [];
  const ctx: AuthHandlerContext = {
    browser: BROWSER,
    browserStrategy: (options) => {
      calls.push(options);
      return {
        authorize: async (request) => {
          requests.push(request);
          return { payload: 'code', redirectUri: 'r' };
        },
      };
    },
    login: { logger: silent, record: (s) => recorded.push(s) },
    ...over,
  };
  return { ctx, calls, recorded, requests };
}

/** `context` with no browser chosen: the key absent, as a context without one has it. */
function noBrowser(over: Partial<AuthHandlerContext> = {}) {
  const made = context(over);
  const { browser: _browser, ...ctx } = made.ctx;
  return { ...made, ctx };
}

const request = {
  buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
} as AuthorizationRequest;

describe('handlerFor', () => {
  for (const [vetted] of [
    [{ authType: 'basic' as const }],
    [{ authType: 'snc' as const }],
    [{ authType: 'jwt' as const, grantType: 'authorization_code' as const }],
  ]) {
    it(format('finds the handler for %j', vetted), () => {
      const h = handlerFor('dest', vetted);
      assert.equal(h.authType, vetted.authType);
      assert.equal(h.grantType, (vetted as { grantType?: string }).grantType);
    });
  }

  for (const [vetted] of [
    [{ authType: 'saml' as const, grantType: 'saml2_bearer' as const }],
    [{ authType: 'jwt' as const, grantType: 'passcode' as const }],
    [{ authType: 'jwt' as const, grantType: 'client_credentials' as const }],
    [{ authType: 'jwt' as const, grantType: 'none' as const }],
  ]) {
    it(format('refuses %j, naming destination, type and grant', vetted), () => {
      let err: unknown;
      try {
        handlerFor('dest', vetted);
      } catch (e) {
        err = e;
      }
      assert.ok(err instanceof UnsupportedAuthenticationError);
      const u = err as UnsupportedAuthenticationError;
      assert.equal(u.destination, 'dest');
      assert.equal(u.authType, vetted.authType);
      assert.equal(u.grantType, vetted.grantType);
      assert.ok(u.message.includes('dest'));
      assert.ok(u.message.includes(vetted.grantType));
    });
  }
});

describe('jwt / none', () => {
  it('is refused like any authentication not in the table: three handlers', () => {
    assert.deepStrictEqual(
      HANDLERS.map((h) => `${h.authType}/${h.grantType ?? ''}`),
      ['basic/', 'snc/', 'jwt/authorization_code'],
    );
  });
});

describe('certificate and kerberos', () => {
  for (const authType of ['certificate', 'kerberos'] as const) {
    it(
      format('%s is refused as unsupported, named, without a grant', authType),
      () => {
        let err: unknown;
        try {
          handlerFor('dest', { authType });
        } catch (e) {
          err = e;
        }
        assert.ok(err instanceof UnsupportedAuthenticationError);
        const u = err as UnsupportedAuthenticationError;
        assert.equal(u.authType, authType);
        assert.equal(
          u.message,
          `Destination "dest" uses ${authType}, which this server does not support`,
        );
      },
    );
  }
});

describe('brokerOptions', () => {
  for (const [vetted] of [
    [{ authType: 'basic' as const }],
    [{ authType: 'snc' as const }],
  ]) {
    it(format('%j adds nothing', vetted), () => {
      assert.deepStrictEqual(
        handlerFor('d', vetted).brokerOptions(context().ctx),
        {},
      );
    });
  }

  it('jwt / authorization_code returns exactly `authorization`: serverLogin over the context browser and port', async () => {
    const { ctx, calls, recorded, requests } = context({
      browserAuthPort: 4242,
    });
    const options = handlerFor('d', {
      authType: 'jwt',
      grantType: 'authorization_code',
    }).brokerOptions(ctx);
    assert.deepStrictEqual(Object.keys(options), ['authorization']);
    const strategy = options.authorization?.('d', 'authorization_code');
    assert.deepStrictEqual(calls, [{ browser: BROWSER, port: 4242 }]);
    // The serverLogin wrapper: recorded for disposal, the prompt logger in.
    assert.deepStrictEqual(recorded, [strategy]);
    await (strategy as IAuthorizationStrategy<string>).authorize(request);
    assert.equal(requests[0].logger, silent);
  });

  it('leaves the browser and the port out when the context has none', () => {
    const { ctx, calls } = noBrowser();
    handlerFor('d', {
      authType: 'jwt',
      grantType: 'authorization_code',
    })
      .brokerOptions(ctx)
      .authorization?.('d', 'authorization_code');
    assert.deepStrictEqual(calls, [{}]);
  });
});

describe('jwt / authorization_code checkSettings: the browser', () => {
  const login = handlerFor('d', {
    authType: 'jwt',
    grantType: 'authorization_code',
  });
  it('an unavailable browser refuses, naming browser', () => {
    let err: unknown;
    try {
      login.checkSettings?.(
        {} as SapConfig,
        noBrowser({ browserUnavailable: 'no browser here' }).ctx,
      );
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof SettingsError);
    assert.equal((err as SettingsError).setting, 'browser');
  });
  it('a browser, or none chosen, is accepted', () => {
    login.checkSettings?.({} as SapConfig, context().ctx);
    login.checkSettings?.({} as SapConfig, noBrowser().ctx);
  });
});

describe('snc.checkSettings', () => {
  const snc = handlerFor('d', { authType: 'snc' });
  it('refuses a connection type other than rfc, naming connection-type', () => {
    let err: unknown;
    try {
      snc.checkSettings?.(
        { connectionType: 'http' } as unknown as SapConfig,
        context().ctx,
      );
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof SettingsError);
    assert.ok((err as SettingsError).message.includes('connection-type'));
    assertThrows(
      () => snc.checkSettings?.({} as SapConfig, context().ctx),
      SettingsError,
    );
  });
  it('accepts rfc', () => {
    snc.checkSettings?.(
      { connectionType: 'rfc' } as unknown as SapConfig,
      context().ctx,
    );
  });
  it('basic has no checkSettings', () => {
    assert.equal(
      handlerFor('d', { authType: 'basic' }).checkSettings,
      undefined,
    );
  });
});
