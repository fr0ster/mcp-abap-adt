/**
 * D25: the startup summary says of a secret that it is there — `set` — and
 * not one character of it: not the password, a token, a refresh token or the
 * client secret, long or short.
 */

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
      expect(row(summary, 'Password:')).toBe(
        `║  Password:      ${'set'.padEnd(45)}║`,
      );
      expect(summary).not.toContain(password);
      expect(summary).not.toContain(password.slice(0, 4));
      expect(summary).not.toContain(password.slice(-4));
      expect(summary).not.toContain('*');
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
    expect(row(summary, 'JWT Token:')).toContain('set');
    expect(row(summary, 'Refresh Token:')).toContain('set');
    expect(row(summary, 'UAA Secret:')).toContain('set');
    for (const secret of [
      SECRETS.jwtToken,
      SECRETS.refreshToken,
      SECRETS.uaaClientSecret,
    ]) {
      expect(summary).not.toContain(secret);
      expect(summary).not.toContain(secret.slice(0, 4));
      expect(summary).not.toContain(secret.slice(-4));
    }
  });

  it('a value that is absent is not shown', () => {
    const summary = formatAuthConfigForDisplay({
      authType: 'basic',
      username: 'u',
    });
    expect(summary).not.toContain('Password:');
  });
});
