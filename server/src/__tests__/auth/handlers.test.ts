import type { SapConfig } from '@mcp-abap-adt/connection';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
  IBrowser,
} from '@mcp-abap-adt/interfaces-auth';
import { SettingsError } from '@mcp-abap-adt/lib/auth';
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

const request = {
  buildAuthorizationUrl: async () => 'https://idp.example.test/authorize',
} as AuthorizationRequest;

describe('handlerFor', () => {
  it.each([
    [{ authType: 'basic' as const }],
    [{ authType: 'snc' as const }],
    [{ authType: 'jwt' as const, grantType: 'authorization_code' as const }],
  ])('finds the handler for %j', (vetted) => {
    const h = handlerFor('dest', vetted);
    expect(h.authType).toBe(vetted.authType);
    expect(h.grantType).toBe((vetted as { grantType?: string }).grantType);
  });

  it.each([
    [{ authType: 'saml' as const, grantType: 'saml2_bearer' as const }],
    [{ authType: 'jwt' as const, grantType: 'passcode' as const }],
    [{ authType: 'jwt' as const, grantType: 'client_credentials' as const }],
    [{ authType: 'jwt' as const, grantType: 'none' as const }],
  ])('refuses %j, naming destination, type and grant', (vetted) => {
    let err: unknown;
    try {
      handlerFor('dest', vetted);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(UnsupportedAuthenticationError);
    const u = err as UnsupportedAuthenticationError;
    expect(u.destination).toBe('dest');
    expect(u.authType).toBe(vetted.authType);
    expect(u.grantType).toBe(vetted.grantType);
    expect(u.message).toContain('dest');
    expect(u.message).toContain(vetted.grantType);
  });
});

describe('jwt / none', () => {
  it('is refused like any authentication not in the table: three handlers', () => {
    expect(HANDLERS.map((h) => `${h.authType}/${h.grantType ?? ''}`)).toEqual([
      'basic/',
      'snc/',
      'jwt/authorization_code',
    ]);
  });
});

describe('certificate and kerberos', () => {
  it.each(['certificate', 'kerberos'] as const)(
    '%s is refused as unsupported, named, without a grant',
    (authType) => {
      let err: unknown;
      try {
        handlerFor('dest', { authType });
      } catch (e) {
        err = e;
      }
      expect(err).toBeInstanceOf(UnsupportedAuthenticationError);
      const u = err as UnsupportedAuthenticationError;
      expect(u.authType).toBe(authType);
      expect(u.message).toBe(
        `Destination "dest" uses ${authType}, which this server does not support`,
      );
    },
  );
});

describe('brokerOptions', () => {
  it.each([[{ authType: 'basic' as const }], [{ authType: 'snc' as const }]])(
    '%j adds nothing',
    (vetted) => {
      expect(handlerFor('d', vetted).brokerOptions(context().ctx)).toEqual({});
    },
  );

  it('jwt / authorization_code returns exactly `authorization`: serverLogin over the context browser and port', async () => {
    const { ctx, calls, recorded, requests } = context({
      browserAuthPort: 4242,
    });
    const options = handlerFor('d', {
      authType: 'jwt',
      grantType: 'authorization_code',
    }).brokerOptions(ctx);
    expect(Object.keys(options)).toEqual(['authorization']);
    const strategy = options.authorization?.('d', 'authorization_code');
    expect(calls).toEqual([{ browser: BROWSER, port: 4242 }]);
    // The serverLogin wrapper: recorded for disposal, the prompt logger in.
    expect(recorded).toEqual([strategy]);
    await (strategy as IAuthorizationStrategy<string>).authorize(request);
    expect(requests[0].logger).toBe(silent);
  });

  it('leaves the browser and the port out when the context has none', () => {
    const { ctx, calls } = context({ browser: undefined });
    handlerFor('d', {
      authType: 'jwt',
      grantType: 'authorization_code',
    })
      .brokerOptions(ctx)
      .authorization?.('d', 'authorization_code');
    expect(calls).toEqual([{}]);
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
        context({ browser: undefined, browserUnavailable: 'no browser here' })
          .ctx,
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SettingsError);
    expect((err as SettingsError).setting).toBe('browser');
  });
  it('a browser, or none chosen, is accepted', () => {
    expect(() =>
      login.checkSettings?.({} as SapConfig, context().ctx),
    ).not.toThrow();
    expect(() =>
      login.checkSettings?.(
        {} as SapConfig,
        context({ browser: undefined }).ctx,
      ),
    ).not.toThrow();
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
    expect(err).toBeInstanceOf(SettingsError);
    expect((err as SettingsError).message).toContain('connection-type');
    expect(() => snc.checkSettings?.({} as SapConfig, context().ctx)).toThrow(
      SettingsError,
    );
  });
  it('accepts rfc', () => {
    expect(() =>
      snc.checkSettings?.(
        { connectionType: 'rfc' } as unknown as SapConfig,
        context().ctx,
      ),
    ).not.toThrow();
  });
  it('basic has no checkSettings', () => {
    expect(
      handlerFor('d', { authType: 'basic' }).checkSettings,
    ).toBeUndefined();
  });
});
