/**
 * Routing by system kind, with the credential a caller's `SapConfig`
 * describes: certificate and kerberos.
 *
 * The connector is chosen by the system kind; the credential comes from
 * `credentialFromSapConfig` (one of the three provider sources) and the
 * factory holds the one it is given. Certificate auth is `AdtOnPremConnector`
 * plus a `CertificateAuthProvider`. Kerberos has no credential provider and
 * is refused by the credential source, before any connector is built.
 */

import { CertificateAuthProvider } from '@mcp-abap-adt/auth-providers';
import type { SapConfig } from '@mcp-abap-adt/connection';
import { AdtOnPremConnector } from '@mcp-abap-adt/connection';
import { createAbapConnection } from '../../lib/connectionFactory';
import { credentialFromSapConfig } from '../../lib/credentialSources';

const BASE_URL = 'https://system.example.invalid:44300';

describe('connection factory routing', () => {
  test('certificate config → AdtOnPremConnector with a CertificateAuthProvider credential', () => {
    const config: SapConfig = {
      url: BASE_URL,
      authType: 'certificate',
      certPath: '/path/to/cert.crt',
      certKeyPath: '/path/to/cert.key',
    };
    const credential = credentialFromSapConfig(config);
    expect(credential).toBeInstanceOf(CertificateAuthProvider);

    const conn = createAbapConnection(config, credential);
    expect(conn).toBeInstanceOf(AdtOnPremConnector);
    // The credential is a constructor argument, not part of IAbapConnection.
    expect((conn as any).credential).toBe(credential);
  });

  test('kerberos config → refused by the credential source, not routed', () => {
    const config: SapConfig = {
      url: BASE_URL,
      authType: 'kerberos',
      kerberosSpn: 'HTTP@system.example.invalid',
    };
    expect(() => credentialFromSapConfig(config)).toThrow(
      /Kerberos authentication is not available/,
    );
  });
});
