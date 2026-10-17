/**
 * Two of the three provider sources: request headers and a caller's SapConfig.
 */
import {
  BasicAuthProvider,
  CertificateAuthProvider,
  SamlAuthProvider,
  TokenAuthProvider,
} from '@mcp-abap-adt/auth-providers';
import {
  credentialFromHeaders,
  credentialFromSapConfig,
} from '../../lib/credentialSources';

describe('credentialFromHeaders', () => {
  it('gives a token provider and jwt settings for a JWT header', () => {
    const { settings, credential } = credentialFromHeaders({
      'x-sap-url': 'https://sap.example.invalid',
      'x-sap-client': '000',
      'x-sap-jwt-token': 'a-token',
    });
    expect(credential).toBeInstanceOf(TokenAuthProvider);
    expect(settings).toEqual({
      url: 'https://sap.example.invalid',
      client: '000',
      authType: 'jwt',
    });
  });

  it('gives a basic provider and basic settings for login and password', () => {
    const { settings, credential } = credentialFromHeaders({
      'x-sap-url': 'https://sap.example.invalid',
      'x-sap-login': 'user',
      'x-sap-password': 'secret',
    });
    expect(credential).toBeInstanceOf(BasicAuthProvider);
    expect(settings.authType).toBe('basic');
  });

  it('carries no password and no token in the settings', () => {
    for (const headers of [
      { 'x-sap-url': 'u', 'x-sap-jwt-token': 'a-token' },
      { 'x-sap-url': 'u', 'x-sap-login': 'user', 'x-sap-password': 'secret' },
    ]) {
      const { settings } = credentialFromHeaders(headers);
      const text = JSON.stringify(settings);
      expect(text).not.toContain('a-token');
      expect(text).not.toContain('secret');
      expect(settings).not.toHaveProperty('password');
      expect(settings).not.toHaveProperty('jwtToken');
    }
  });

  it('refuses a request with no url', () => {
    expect(() => credentialFromHeaders({ 'x-sap-jwt-token': 't' })).toThrow(
      'x-sap-url header is required for direct SAP connection',
    );
  });

  it('refuses a request with neither a token nor a login and password', () => {
    expect(() => credentialFromHeaders({ 'x-sap-url': 'u' })).toThrow(
      'Either x-sap-jwt-token or x-sap-login+x-sap-password headers are required',
    );
  });
});

/**
 * A caller's SapConfig names its credential, or is refused: nothing is
 * guessed, and a refusal names the field — never a value.
 */
describe('credentialFromSapConfig', () => {
  const base = { url: 'https://sap.example.invalid', client: '000' };

  it.each([
    ['basic', { username: 'u', password: 'p' }, BasicAuthProvider],
    ['jwt', { jwtToken: 't' }, TokenAuthProvider],
    ['saml', { sessionCookies: 'a=b' }, SamlAuthProvider],
    ['certificate', {}, CertificateAuthProvider],
  ] as const)('gives the provider for %s', (authType, extra, Provider) => {
    expect(
      credentialFromSapConfig({ ...base, authType, ...extra } as any),
    ).toBeInstanceOf(Provider);
  });

  it('refuses kerberos', () => {
    expect(() =>
      credentialFromSapConfig({ ...base, authType: 'kerberos' } as any),
    ).toThrow('Kerberos authentication is not available');
  });

  it('refuses snc: it is served through a destination of mcp-abap-adt (stdio)', () => {
    expect(() =>
      credentialFromSapConfig({ ...base, authType: 'snc' } as any),
    ).toThrow(
      'The SapConfig `authType` snc is served through a destination of mcp-abap-adt (stdio)',
    );
  });

  it.each([
    ['an unknown authType', { authType: 'oauth-magic-secret' }],
    ['no authType', {}],
    ['an authType that is not a string', { authType: 42 }],
  ])('refuses %s naming authType, never its value', (_label, extra) => {
    let thrown: unknown;
    try {
      credentialFromSapConfig({
        ...base,
        username: 'u',
        password: 'p',
        ...extra,
      } as any);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Error).message).toBe(
      'The SapConfig `authType` must be basic, jwt, saml or certificate',
    );
    expect((thrown as Error).message).not.toContain('oauth-magic-secret');
  });

  it.each([
    ['basic', { password: 'the-password' }, 'username'],
    ['basic', { username: 'u', password: '' }, 'password'],
    ['basic', { username: '', password: 'the-password' }, 'username'],
    ['basic', { username: 'u' }, 'password'],
    ['jwt', {}, 'jwtToken'],
    ['jwt', { jwtToken: '' }, 'jwtToken'],
    ['saml', {}, 'sessionCookies'],
    ['saml', { sessionCookies: '' }, 'sessionCookies'],
  ] as const)('refuses %s with %j naming %s', (authType, extra, field) => {
    let thrown: unknown;
    try {
      credentialFromSapConfig({ ...base, authType, ...extra } as any);
    } catch (error) {
      thrown = error;
    }
    const message = (thrown as Error).message;
    expect(message).toBe(
      `The SapConfig for ${authType} authentication has no \`${field}\``,
    );
    expect(message).not.toContain('the-password');
  });
});
