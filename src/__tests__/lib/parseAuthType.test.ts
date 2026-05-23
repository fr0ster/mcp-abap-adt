import { parseAuthType } from '../../lib/config/parseAuthType';

test('maps env to auth types', () => {
  expect(parseAuthType({ SAP_JWT_TOKEN: 'x' })).toBe('jwt');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'xsuaa' })).toBe('jwt');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'certificate' })).toBe('certificate');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'kerberos' })).toBe('kerberos');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'saml' })).toBe('saml');
  expect(parseAuthType({ SAP_AUTH_TYPE: 'bogus' })).toBe('basic');
  expect(parseAuthType({})).toBe('basic');
  // SAP_JWT_TOKEN wins over an explicit SAP_AUTH_TYPE
  expect(
    parseAuthType({ SAP_JWT_TOKEN: 'x', SAP_AUTH_TYPE: 'certificate' }),
  ).toBe('jwt');
});
