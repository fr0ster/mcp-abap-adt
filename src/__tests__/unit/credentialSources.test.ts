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
});
