/**
 * Two of the three provider sources: request headers and a caller's SapConfig.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { format } from 'node:util';
import {
  BasicAuthProvider,
  CertificateAuthProvider,
  SamlAuthProvider,
  TokenAuthProvider,
} from '@mcp-abap-adt/auth-providers';
import {
  CERTIFICATE_OVER_RFC_WORDS,
  credentialFromHeaders,
  credentialFromSapConfig,
} from '../../lib/credentialSources';
import { assertNoProperty, assertThrows } from '../helpers/assertions';

describe('credentialFromHeaders', () => {
  it('gives a token provider and jwt settings for a JWT header', () => {
    const { settings, credential } = credentialFromHeaders({
      'x-sap-url': 'https://sap.example.invalid',
      'x-sap-client': '000',
      'x-sap-jwt-token': 'a-token',
    });
    assert.ok(credential instanceof TokenAuthProvider);
    assert.deepStrictEqual(settings, {
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
    assert.ok(credential instanceof BasicAuthProvider);
    assert.equal(settings.authType, 'basic');
  });

  it('carries no password and no token in the settings', () => {
    for (const headers of [
      { 'x-sap-url': 'u', 'x-sap-jwt-token': 'a-token' },
      { 'x-sap-url': 'u', 'x-sap-login': 'user', 'x-sap-password': 'secret' },
    ]) {
      const { settings } = credentialFromHeaders(headers);
      const text = JSON.stringify(settings);
      assert.ok(!text.includes('a-token'));
      assert.ok(!text.includes('secret'));
      assertNoProperty(settings, 'password');
      assertNoProperty(settings, 'jwtToken');
    }
  });

  it('refuses a request with no url', () => {
    assertThrows(
      () => credentialFromHeaders({ 'x-sap-jwt-token': 't' }),
      'x-sap-url header is required for direct SAP connection',
    );
  });

  it('refuses a request with neither a token nor a login and password', () => {
    assertThrows(
      () => credentialFromHeaders({ 'x-sap-url': 'u' }),
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

  for (const [authType, extra, Provider] of [
    ['basic', { username: 'u', password: 'p' }, BasicAuthProvider],
    ['jwt', { jwtToken: 't' }, TokenAuthProvider],
    ['saml', { sessionCookies: 'a=b' }, SamlAuthProvider],
    ['certificate', {}, CertificateAuthProvider],
  ] as const) {
    it(format('gives the provider for %s', authType), () => {
      assert.ok(
        credentialFromSapConfig({
          ...base,
          authType,
          ...extra,
        } as any) instanceof Provider,
      );
    });
  }

  it('refuses a client certificate over RFC before any provider is built', () => {
    assertThrows(
      () =>
        credentialFromSapConfig({
          authType: 'certificate',
          certPath: '/placeholder/cert.pem',
          connectionType: 'rfc',
          client: '100',
          language: 'EN',
          ashost: 'host.example.invalid',
          sysnr: '00',
        }),
      CERTIFICATE_OVER_RFC_WORDS,
    );
    assert.ok(
      CERTIFICATE_OVER_RFC_WORDS.includes('SAP_AUTH_TYPE, SAP_CONNECTION_TYPE'),
    );
  });

  it('refuses kerberos', () => {
    assertThrows(
      () => credentialFromSapConfig({ ...base, authType: 'kerberos' } as any),
      'Kerberos authentication is not available',
    );
  });

  it('refuses snc: it is served through a destination of mcp-abap-adt (stdio)', () => {
    assertThrows(
      () => credentialFromSapConfig({ ...base, authType: 'snc' } as any),
      'The SapConfig `authType` snc is served through a destination of mcp-abap-adt (stdio)',
    );
  });

  for (const [_label, extra] of [
    ['an unknown authType', { authType: 'oauth-magic-secret' }],
    ['no authType', {}],
    ['an authType that is not a string', { authType: 42 }],
  ] satisfies Array<[string, Record<string, unknown>]>) {
    it(format('refuses %s naming authType, never its value', _label), () => {
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
      assert.equal(
        (thrown as Error).message,
        'The SapConfig `authType` must be basic, jwt, saml or certificate',
      );
      assert.ok(!(thrown as Error).message.includes('oauth-magic-secret'));
    });
  }

  for (const [authType, extra, field] of [
    ['basic', { password: 'the-password' }, 'username'],
    ['basic', { username: 'u', password: '' }, 'password'],
    ['basic', { username: '', password: 'the-password' }, 'username'],
    ['basic', { username: 'u' }, 'password'],
    ['jwt', {}, 'jwtToken'],
    ['jwt', { jwtToken: '' }, 'jwtToken'],
    ['saml', {}, 'sessionCookies'],
    ['saml', { sessionCookies: '' }, 'sessionCookies'],
  ] as const) {
    it(format('refuses %s with %j naming %s', authType, extra, field), () => {
      let thrown: unknown;
      try {
        credentialFromSapConfig({ ...base, authType, ...extra } as any);
      } catch (error) {
        thrown = error;
      }
      const message = (thrown as Error).message;
      assert.equal(
        message,
        `The SapConfig for ${authType} authentication has no \`${field}\``,
      );
      assert.ok(!message.includes('the-password'));
    });
  }
});
