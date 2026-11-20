/**
 * The startup summary says of a secret that it is there — `set` — and
 * not one character of it: not the password, a token, a refresh token or the
 * client secret, long or short.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAuthConfigForDisplay } from '@mcp-abap-adt/lib/utils';

const SECRETS = {
  password: 'pw-marker-0123456789-abcdefghij-zyxw',
  jwtToken: 'jwt-marker-0123456789-abcdefghij-zyxw',
  refreshToken: 'refresh-marker-0123456789-abcdefghij-zyxw',
  uaaClientSecret: 'uaa-secret-marker-0123456789-abcdefghij-zyxw',
  shortPassword: 'p4ss',
};

const row = (summary: string, label: string): string =>
  summary.split('\n').find((line) => line.includes(label)) ?? '';

describe('the startup summary shows presence only', () => {
  it('basic: `Password: set`, and no character of a long or a short password', () => {
    for (const password of [SECRETS.password, SECRETS.shortPassword]) {
      const summary = formatAuthConfigForDisplay(
        {
          serviceUrl: 'https://system.example.test',
          authType: 'basic',
          username: 'placeholder-user',
          password,
        },
        'service-key: dest',
      );
      assert.equal(
        row(summary, 'Password:'),
        `║  Password:      ${'set'.padEnd(45)}║`,
      );
      assert.ok(!summary.includes(password));
      assert.ok(!summary.includes(password.slice(0, 4)));
      assert.ok(!summary.includes(password.slice(-4)));
      assert.ok(!summary.includes('*'));
    }
  });

  it('jwt: the token, the refresh token and the client secret by presence', () => {
    const summary = formatAuthConfigForDisplay({
      authType: 'jwt',
      jwtToken: SECRETS.jwtToken,
      refreshToken: SECRETS.refreshToken,
      uaaUrl: 'https://uaa.example.test',
      uaaClientId: 'client-id-0123456789-abcdefghij',
      uaaClientSecret: SECRETS.uaaClientSecret,
    });
    assert.ok(row(summary, 'JWT Token:').includes('set'));
    assert.ok(row(summary, 'Refresh Token:').includes('set'));
    assert.ok(row(summary, 'UAA Secret:').includes('set'));
    for (const secret of [
      SECRETS.jwtToken,
      SECRETS.refreshToken,
      SECRETS.uaaClientSecret,
    ]) {
      assert.ok(!summary.includes(secret));
      assert.ok(!summary.includes(secret.slice(0, 4)));
      assert.ok(!summary.includes(secret.slice(-4)));
    }
  });

  it('a value that is absent is not shown', () => {
    const summary = formatAuthConfigForDisplay({
      authType: 'basic',
      username: 'u',
    });
    assert.ok(!summary.includes('Password:'));
  });
});
