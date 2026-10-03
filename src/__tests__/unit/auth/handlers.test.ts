import type { SapConfig } from '@mcp-abap-adt/connection';
import type {
  AuthorizationRequest,
  IAuthorizationStrategy,
} from '@mcp-abap-adt/interfaces-auth';
import {
  SettingsError,
  UnsupportedAuthenticationError,
} from '../../../lib/auth/errors';
import {
  type AuthHandlerContext,
  handlerFor,
} from '../../../lib/auth/handlers';
import { LoginLock } from '../../../lib/auth/loginLock';

function context(over: Partial<AuthHandlerContext> = {}) {
  const calls: { browser: string; port?: number }[] = [];
  const ctx: AuthHandlerContext = {
    browser: 'headless',
    loginLock: new LoginLock(),
    browserStrategy: (options) => {
      calls.push(options);
      return {
        authorize: async () => ({ payload: 'code', redirectUri: 'r' }),
      };
    },
    ...over,
  };
  return { ctx, calls };
}

const request = {} as AuthorizationRequest;

describe('handlerFor', () => {
  it.each([
    [{ authType: 'basic' as const }],
    [{ authType: 'snc' as const }],
    [{ authType: 'jwt' as const, grantType: 'authorization_code' as const }],
    [{ authType: 'jwt' as const, grantType: 'none' as const }],
  ])('finds the handler for %j', (vetted) => {
    const h = handlerFor('dest', vetted);
    expect(h.authType).toBe(vetted.authType);
    expect(h.grantType).toBe((vetted as { grantType?: string }).grantType);
  });

  it.each([
    [{ authType: 'saml' as const, grantType: 'saml2_bearer' as const }],
    [{ authType: 'jwt' as const, grantType: 'passcode' as const }],
    [{ authType: 'jwt' as const, grantType: 'client_credentials' as const }],
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

describe('brokerOptions', () => {
  it.each([
    [{ authType: 'basic' as const }],
    [{ authType: 'snc' as const }],
    [{ authType: 'jwt' as const, grantType: 'none' as const }],
  ])('%j adds nothing', (vetted) => {
    expect(handlerFor('d', vetted).brokerOptions(context().ctx)).toEqual({});
  });

  it('jwt / authorization_code returns exactly `authorization`, locked, with the context browser and port', async () => {
    const { ctx, calls } = context({ browserAuthPort: 4242 });
    const options = handlerFor('d', {
      authType: 'jwt',
      grantType: 'authorization_code',
    }).brokerOptions(ctx);
    expect(Object.keys(options)).toEqual(['authorization']);
    const strategy = options.authorization?.('d', 'authorization_code');
    expect(calls).toEqual([{ browser: 'headless', port: 4242 }]);

    // Observed through the lock: while the lock is held, authorize waits.
    let release!: () => void;
    const held = ctx.loginLock.run(
      () => new Promise<void>((r) => (release = r)),
    );
    let done = false;
    const login = (strategy as IAuthorizationStrategy<string>)
      .authorize(request)
      .then(() => {
        done = true;
      });
    await new Promise((r) => setTimeout(r, 20));
    expect(done).toBe(false);
    release();
    await held;
    await login;
    expect(done).toBe(true);
  });

  it('leaves the port out when the context has none', () => {
    const { ctx, calls } = context();
    handlerFor('d', {
      authType: 'jwt',
      grantType: 'authorization_code',
    })
      .brokerOptions(ctx)
      .authorization?.('d', 'authorization_code');
    expect(calls).toEqual([{ browser: 'headless' }]);
  });
});

describe('snc.checkSettings', () => {
  const snc = handlerFor('d', { authType: 'snc' });
  it('refuses a connection type other than rfc, naming connection-type', () => {
    let err: unknown;
    try {
      snc.checkSettings?.({ connectionType: 'http' } as unknown as SapConfig);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SettingsError);
    expect((err as SettingsError).message).toContain('connection-type');
    expect(() => snc.checkSettings?.({} as SapConfig)).toThrow(SettingsError);
  });
  it('accepts rfc', () => {
    expect(() =>
      snc.checkSettings?.({ connectionType: 'rfc' } as unknown as SapConfig),
    ).not.toThrow();
  });
  it('the other handlers have no checkSettings', () => {
    expect(
      handlerFor('d', { authType: 'basic' }).checkSettings,
    ).toBeUndefined();
  });
});
